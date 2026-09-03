import type { ProductionTask, TaskPriority, TenantConfig } from "./types";

const PRIORITY_BASE_SCORES: Record<TaskPriority, number> = {
  p0_critical: 100,
  p1_high: 50,
  p2_normal: 20,
  p3_batch: 5,
};

export class MultiTenantPriorityQueue {
  private queue: ProductionTask[] = [];
  private runningTasks: Map<string, ProductionTask> = new Map();
  private completedTasks: ProductionTask[] = [];
  private totalWorkerSlots: number;
  private workerIds: string[];

  constructor(totalWorkerSlots = 5) {
    this.totalWorkerSlots = totalWorkerSlots;
    this.workerIds = Array.from({ length: totalWorkerSlots }, (_, i) => `worker-slot-${i + 1}`);
  }

  /**
   * Enqueue a new production task
   */
  public enqueue(task: ProductionTask): ProductionTask {
    task.basePriorityScore = PRIORITY_BASE_SCORES[task.priority] || 20;
    task.effectivePriorityScore = task.basePriorityScore;
    task.status = "queued";
    task.queuedAt = Date.now();
    this.queue.push(task);
    return task;
  }

  /**
   * Refresh effective priorities with Anti-Starvation aging:
   * EffectivePriority = BasePriority + (WaitSeconds * 0.5)
   */
  public refreshEffectivePriorities() {
    const now = Date.now();
    for (const task of this.queue) {
      const waitSeconds = Math.max(0, (now - task.queuedAt) / 1000);
      task.waitingTimeMs = Math.round(waitSeconds * 1000);
      task.effectivePriorityScore = Number((task.basePriorityScore + waitSeconds * 0.5).toFixed(1));
    }

    // Sort descending by effective priority score, then by queued timestamp
    this.queue.sort((a, b) => {
      if (b.effectivePriorityScore !== a.effectivePriorityScore) {
        return b.effectivePriorityScore - a.effectivePriorityScore;
      }
      return a.queuedAt - b.queuedAt;
    });
  }

  /**
   * Get active concurrent task count for a given tenant
   */
  public getTenantActiveConcurrency(tenantId: string): number {
    let count = 0;
    for (const task of this.runningTasks.values()) {
      if (task.tenantId === tenantId) {
        count++;
      }
    }
    return count;
  }

  /**
   * Find available worker slot ID
   */
  private getAvailableWorkerId(): string | null {
    const busyWorkerIds = new Set(
      Array.from(this.runningTasks.values()).map((t) => t.activeWorkerId)
    );
    for (const id of this.workerIds) {
      if (!busyWorkerIds.has(id)) {
        return id;
      }
    }
    return null;
  }

  /**
   * Dispatch next eligible task respecting tenant max concurrency and global worker slots
   */
  public dispatch(tenantMap: Map<string, TenantConfig>): {
    task: ProductionTask;
    workerId: string;
  } | null {
    if (this.runningTasks.size >= this.totalWorkerSlots) {
      return null; // Global worker pool saturated
    }

    this.refreshEffectivePriorities();

    const workerId = this.getAvailableWorkerId();
    if (!workerId) return null;

    // Scan through priority sorted queue for the first task whose tenant hasn't hit its concurrency cap
    let selectedIndex = -1;
    for (let i = 0; i < this.queue.length; i++) {
      const candidate = this.queue[i];
      const tenant = tenantMap.get(candidate.tenantId);
      const maxConcurrency = tenant ? tenant.maxConcurrency : 1;
      const currentActive = this.getTenantActiveConcurrency(candidate.tenantId);

      if (currentActive < maxConcurrency) {
        selectedIndex = i;
        break;
      }
    }

    if (selectedIndex === -1) {
      return null; // All queued tasks blocked by tenant concurrency limits
    }

    const [dispatchedTask] = this.queue.splice(selectedIndex, 1);
    dispatchedTask.status = "running";
    dispatchedTask.startedAt = Date.now();
    dispatchedTask.activeWorkerId = workerId;
    dispatchedTask.waitingTimeMs = dispatchedTask.startedAt - dispatchedTask.queuedAt;

    this.runningTasks.set(dispatchedTask.id, dispatchedTask);

    return { task: dispatchedTask, workerId };
  }

  /**
   * Mark a task as completed
   */
  public completeTask(
    taskId: string,
    output: string,
    tokensUsed: number,
    costUsd: number
  ): ProductionTask | null {
    const task = this.runningTasks.get(taskId);
    if (!task) return null;

    task.status = "completed";
    task.completedAt = Date.now();
    task.executionTimeMs = task.startedAt ? task.completedAt - task.startedAt : 0;
    task.output = output;
    task.tokensUsed = tokensUsed;
    task.estimatedCostUsd = costUsd;

    this.runningTasks.delete(taskId);
    this.completedTasks.unshift(task);
    if (this.completedTasks.length > 50) this.completedTasks.pop();

    return task;
  }

  /**
   * Mark a task as failed or budget exceeded
   */
  public failTask(
    taskId: string,
    error: string,
    tokensUsed = 0,
    costUsd = 0,
    isBudgetExceeded = false
  ): ProductionTask | null {
    const task = this.runningTasks.get(taskId) || this.queue.find((t) => t.id === taskId);
    if (!task) return null;

    task.status = isBudgetExceeded ? "budget_exceeded" : "failed";
    task.completedAt = Date.now();
    task.executionTimeMs = task.startedAt ? task.completedAt - task.startedAt : 0;
    task.error = error;
    task.tokensUsed = tokensUsed;
    task.estimatedCostUsd = costUsd;

    this.runningTasks.delete(taskId);
    this.queue = this.queue.filter((t) => t.id !== taskId);
    this.completedTasks.unshift(task);
    if (this.completedTasks.length > 50) this.completedTasks.pop();

    return task;
  }

  /**
   * Reject a task before entering queue (e.g. Rate limit 429)
   */
  public rejectTask(task: ProductionTask, reason: string): ProductionTask {
    task.status = "rejected";
    task.error = reason;
    task.completedAt = Date.now();
    this.completedTasks.unshift(task);
    if (this.completedTasks.length > 50) this.completedTasks.pop();
    return task;
  }

  public removeQueuedTask(taskId: string): ProductionTask | null {
    const idx = this.queue.findIndex((t) => t.id === taskId);
    if (idx !== -1) {
      return this.queue.splice(idx, 1)[0];
    }
    return null;
  }

  public getQueuedTasks(): ProductionTask[] {
    this.refreshEffectivePriorities();
    return [...this.queue];
  }

  public getRunningTasks(): ProductionTask[] {
    return Array.from(this.runningTasks.values());
  }

  public getCompletedTasks(): ProductionTask[] {
    return [...this.completedTasks];
  }

  public getTotalWorkerSlots(): number {
    return this.totalWorkerSlots;
  }

  public getActiveWorkerCount(): number {
    return this.runningTasks.size;
  }

  public reset() {
    this.queue = [];
    this.runningTasks.clear();
    this.completedTasks = [];
  }
}


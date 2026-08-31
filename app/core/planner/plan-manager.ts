import type { Plan, TaskItem, TaskStatus } from "./types";

export class PlanManager {
  private plan: Plan | null = null;
  private onStateChange?: (plan: Plan) => void;

  constructor(
    initialPlan?: Plan,
    onStateChange?: (plan: Plan) => void
  ) {
    if (initialPlan) {
      this.plan = JSON.parse(JSON.stringify(initialPlan));
    }
    this.onStateChange = onStateChange;
  }

  /**
   * Set callback for state changes
   */
  public subscribe(cb: (plan: Plan) => void): void {
    this.onStateChange = cb;
  }

  /**
   * Get current plan snapshot (immutable copy)
   */
  public getPlan(): Plan | null {
    if (!this.plan) return null;
    return JSON.parse(JSON.stringify(this.plan));
  }

  /**
   * Whether a plan has been initialized
   */
  public hasPlan(): boolean {
    return this.plan !== null;
  }

  /**
   * Create a new execution plan
   */
  public createPlan(
    goal: string,
    rawTasks: Array<{ title: string; description?: string }>
  ): Plan {
    const now = Date.now();
    const tasks: TaskItem[] = rawTasks.map((t, idx) => ({
      id: `task_${idx + 1}`,
      title: t.title.trim(),
      description: t.description?.trim(),
      status: "pending" as TaskStatus,
      createdAt: now,
    }));

    this.plan = {
      id: `plan_${now}_${Math.random().toString(36).substring(2, 7)}`,
      goal: goal.trim(),
      status: "planning",
      tasks,
      currentTaskId: null,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.notify();
    return this.getPlan()!;
  }

  /**
   * Start executing a specific task (Enforces Single-Focus Invariant)
   */
  public startTask(taskId: string): TaskItem {
    this.ensurePlanExists();
    const plan = this.plan!;

    const targetIndex = plan.tasks.findIndex((t) => t.id === taskId);
    if (targetIndex === -1) {
      throw new Error(
        `Task "${taskId}" not found in current plan. Available tasks: ${plan.tasks.map((t) => t.id).join(", ")}`
      );
    }

    const targetTask = plan.tasks[targetIndex];
    if (targetTask.status === "completed") {
      throw new Error(
        `Task "${taskId}" is already completed. To modify it, please trigger a dynamic replan.`
      );
    }

    // Invariant: Enforce at most 1 in_progress task at a time
    for (const t of plan.tasks) {
      if (t.id !== taskId && t.status === "in_progress") {
        // Automatically mark other in_progress as pending to prevent concurrent clutter
        t.status = "pending";
      }
    }

    targetTask.status = "in_progress";
    plan.currentTaskId = taskId;
    plan.status = "executing";
    plan.updatedAt = Date.now();

    this.notify();
    return JSON.parse(JSON.stringify(targetTask));
  }

  /**
   * Mark a task as completed with mandatory result summary
   */
  public completeTask(taskId: string, resultSummary: string): TaskItem {
    this.ensurePlanExists();
    const plan = this.plan!;

    const targetTask = plan.tasks.find((t) => t.id === taskId);
    if (!targetTask) {
      throw new Error(`Task "${taskId}" not found in current plan.`);
    }

    if (!resultSummary || resultSummary.trim().length === 0) {
      throw new Error(
        `Cannot complete task "${taskId}" without a resultSummary. Please provide what was accomplished or verified.`
      );
    }

    targetTask.status = "completed";
    targetTask.resultSummary = resultSummary.trim();
    targetTask.completedAt = Date.now();

    if (plan.currentTaskId === taskId) {
      plan.currentTaskId = null;
    }

    // Check if all tasks are completed or skipped
    const allFinished = plan.tasks.every(
      (t) => t.status === "completed" || t.status === "skipped"
    );

    if (allFinished) {
      plan.status = "completed";
    } else {
      plan.status = "executing";
    }

    plan.updatedAt = Date.now();
    this.notify();
    return JSON.parse(JSON.stringify(targetTask));
  }

  /**
   * Mark a task as blocked
   */
  public blockTask(taskId: string, reason?: string): TaskItem {
    this.ensurePlanExists();
    const plan = this.plan!;

    const targetTask = plan.tasks.find((t) => t.id === taskId);
    if (!targetTask) {
      throw new Error(`Task "${taskId}" not found in current plan.`);
    }

    targetTask.status = "blocked";
    if (reason) {
      targetTask.resultSummary = `[Blocked] ${reason}`;
    }

    if (plan.currentTaskId === taskId) {
      plan.currentTaskId = null;
    }

    plan.updatedAt = Date.now();
    this.notify();
    return JSON.parse(JSON.stringify(targetTask));
  }

  /**
   * Mark a task as skipped
   */
  public skipTask(taskId: string, reason?: string): TaskItem {
    this.ensurePlanExists();
    const plan = this.plan!;

    const targetTask = plan.tasks.find((t) => t.id === taskId);
    if (!targetTask) {
      throw new Error(`Task "${taskId}" not found in current plan.`);
    }

    targetTask.status = "skipped";
    if (reason) {
      targetTask.resultSummary = `[Skipped] ${reason}`;
    }

    if (plan.currentTaskId === taskId) {
      plan.currentTaskId = null;
    }

    const allFinished = plan.tasks.every(
      (t) => t.status === "completed" || t.status === "skipped"
    );
    if (allFinished) {
      plan.status = "completed";
    }

    plan.updatedAt = Date.now();
    this.notify();
    return JSON.parse(JSON.stringify(targetTask));
  }

  /**
   * Dynamic Re-planning: Update task list while preserving history
   */
  public replan(
    reason: string,
    rawTasks: Array<{
      id?: string;
      title: string;
      description?: string;
      status?: TaskStatus;
      resultSummary?: string;
    }>
  ): Plan {
    this.ensurePlanExists();
    const plan = this.plan!;
    const now = Date.now();

    const existingMap = new Map(plan.tasks.map((t) => [t.id, t]));
    const updatedTasks: TaskItem[] = [];

    rawTasks.forEach((raw, idx) => {
      const generatedId = raw.id || `task_${idx + 1}`;
      const existing = existingMap.get(generatedId);

      if (existing && existing.status === "completed") {
        // Preserve already completed tasks
        updatedTasks.push({
          ...existing,
          title: raw.title || existing.title,
          description: raw.description ?? existing.description,
          resultSummary: raw.resultSummary ?? existing.resultSummary,
        });
      } else {
        updatedTasks.push({
          id: generatedId,
          title: raw.title.trim(),
          description: raw.description?.trim(),
          status: raw.status || "pending",
          resultSummary: raw.resultSummary,
          createdAt: existing?.createdAt || now,
        });
      }
    });

    plan.tasks = updatedTasks;
    plan.revision += 1;
    plan.replanReason = reason.trim();
    plan.status = "re_planning";
    plan.updatedAt = now;

    // Reset currentTaskId if not in new list or not in_progress
    const currentStillValid = updatedTasks.find(
      (t) => t.id === plan.currentTaskId && t.status === "in_progress"
    );
    if (!currentStillValid) {
      plan.currentTaskId = null;
    }

    this.notify();
    return this.getPlan()!;
  }

  /**
   * Calculate plan progress metrics
   */
  public getProgress(): {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    skipped: number;
    blocked: number;
    percentage: number;
  } {
    if (!this.plan || this.plan.tasks.length === 0) {
      return {
        total: 0,
        completed: 0,
        inProgress: 0,
        pending: 0,
        skipped: 0,
        blocked: 0,
        percentage: 0,
      };
    }

    const total = this.plan.tasks.length;
    let completed = 0;
    let inProgress = 0;
    let pending = 0;
    let skipped = 0;
    let blocked = 0;

    for (const t of this.plan.tasks) {
      if (t.status === "completed") completed++;
      else if (t.status === "in_progress") inProgress++;
      else if (t.status === "skipped") skipped++;
      else if (t.status === "blocked") blocked++;
      else pending++;
    }

    const effectiveDone = completed + skipped;
    const percentage = Math.round((effectiveDone / total) * 100);

    return {
      total,
      completed,
      inProgress,
      pending,
      skipped,
      blocked,
      percentage,
    };
  }

  /**
   * Render the Attention Anchor text to inject into System Context
   */
  public renderAttentionAnchor(): string {
    if (!this.plan) {
      return "";
    }

    const progress = this.getProgress();
    const barLength = 15;
    const filledLength = Math.round((progress.percentage / 100) * barLength);
    const progressBar =
      "█".repeat(filledLength) + "░".repeat(barLength - filledLength);

    const lines: string[] = [];
    lines.push(`======================= 🎯 CURRENT EXECUTION PLAN =======================`);
    lines.push(`Goal: ${this.plan.goal}`);
    lines.push(
      `Progress: [${progressBar}] ${progress.percentage}% (${progress.completed}/${progress.total} Completed) | Revision: ${this.plan.revision}`
    );

    if (this.plan.replanReason) {
      lines.push(`Latest Re-plan Reason: "${this.plan.replanReason}"`);
    }
    lines.push("");

    let currentFocusTitle = "";

    for (const task of this.plan.tasks) {
      let icon = "[ ]";
      let tag = "Pending";

      if (task.status === "completed") {
        icon = "[✔]";
        tag = "COMPLETED";
      } else if (task.status === "in_progress") {
        icon = "[▶]";
        tag = "IN PROGRESS <-- CURRENT FOCUS";
        currentFocusTitle = task.title;
      } else if (task.status === "blocked") {
        icon = "[✖]";
        tag = "BLOCKED";
      } else if (task.status === "skipped") {
        icon = "[-]";
        tag = "SKIPPED";
      }

      lines.push(`${icon} ${task.id}: ${task.title} (${tag})`);
      if (task.description && task.status === "in_progress") {
        lines.push(`    Details: ${task.description}`);
      }
      if (task.resultSummary && task.status === "completed") {
        lines.push(`    └─ Verified: ${task.resultSummary}`);
      }
    }

    lines.push("");
    lines.push(`⚠️ ATTENTION & PLANNING CONSTRAINTS:`);
    if (this.plan.currentTaskId && currentFocusTitle) {
      lines.push(
        `1. You are strictly working on "${this.plan.currentTaskId}: ${currentFocusTitle}".`
      );
      lines.push(
        `2. Focus ONLY on this step. Verify your changes (e.g. run tests or read back).`
      );
      lines.push(
        `3. When verified, call 'manage_plan' with action='complete_task' and summarize your outcome.`
      );
      lines.push(
        `4. Then immediately call 'manage_plan' with action='start_task' to begin the next pending step.`
      );
    } else if (progress.percentage < 100) {
      const nextPending = this.plan.tasks.find((t) => t.status === "pending");
      if (nextPending) {
        lines.push(
          `1. No task is currently in progress. Next recommended task is "${nextPending.id}: ${nextPending.title}".`
        );
        lines.push(
          `2. Call 'manage_plan' with action='start_task' and taskId='${nextPending.id}' to begin.`
        );
      }
    } else {
      lines.push(`1. All tasks in the plan are completed!`);
      lines.push(
        `2. Provide a clean, comprehensive final response to the user summarizing everything done.`
      );
    }
    lines.push(`========================================================================`);

    return lines.join("\n");
  }

  private ensurePlanExists(): void {
    if (!this.plan) {
      throw new Error(
        "No execution plan has been created yet. Call createPlan first."
      );
    }
  }

  private notify(): void {
    if (this.onStateChange && this.plan) {
      this.onStateChange(this.getPlan()!);
    }
  }
}


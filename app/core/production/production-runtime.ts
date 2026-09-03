import { AuditLedger } from "./audit-ledger";
import { BudgetGuardrail } from "./budget-guardrail";
import { CircuitBreaker } from "./circuit-breaker";
import { DualTrackRateLimiter } from "./rate-limiter";
import { MultiTenantPriorityQueue } from "./task-queue";
import type {
  ProductionSystemMetrics,
  ProductionTask,
  TaskPriority,
  TenantConfig,
} from "./types";

export const DEFAULT_TENANTS: TenantConfig[] = [
  {
    id: "tenant-enterprise-vip",
    name: "Acme Enterprise (VIP)",
    tier: "enterprise",
    maxConcurrency: 4,
    rpmLimit: 60,
    tpmLimit: 120000,
    dailyBudgetUsd: 50.0,
    currentDailySpendUsd: 0.0,
    tokenRateUsdPer1k: 0.002,
  },
  {
    id: "tenant-pro-team",
    name: "DevStudio Pro",
    tier: "pro",
    maxConcurrency: 2,
    rpmLimit: 20,
    tpmLimit: 30000,
    dailyBudgetUsd: 10.0,
    currentDailySpendUsd: 0.0,
    tokenRateUsdPer1k: 0.002,
  },
  {
    id: "tenant-free-tier",
    name: "Free Trial Community",
    tier: "free",
    maxConcurrency: 1,
    rpmLimit: 5,
    tpmLimit: 4000,
    dailyBudgetUsd: 1.0,
    currentDailySpendUsd: 0.0,
    tokenRateUsdPer1k: 0.002,
  },
];

export class ProductionRuntime {
  public queue: MultiTenantPriorityQueue;
  public rateLimiter: DualTrackRateLimiter;
  public budgetGuardrail: BudgetGuardrail;
  public circuitBreaker: CircuitBreaker;
  public auditLedger: AuditLedger;

  private tenantMap: Map<string, TenantConfig> = new Map();
  private totalTokensProcessed = 0;
  private totalCostUsd = 0;
  private rejectedCount = 0;
  private budgetExceededCount = 0;

  constructor(totalWorkerSlots = 5) {
    this.queue = new MultiTenantPriorityQueue(totalWorkerSlots);
    this.rateLimiter = new DualTrackRateLimiter();
    this.budgetGuardrail = new BudgetGuardrail();
    this.circuitBreaker = new CircuitBreaker();
    this.auditLedger = new AuditLedger();

    // Register default tenants
    for (const t of DEFAULT_TENANTS) {
      this.tenantMap.set(t.id, { ...t });
    }
  }

  public getTenants(): TenantConfig[] {
    return Array.from(this.tenantMap.values()).map((t) => ({
      ...t,
      currentDailySpendUsd: this.budgetGuardrail.getDailySpend(t.id),
    }));
  }

  public getTenant(tenantId: string): TenantConfig {
    const tenant = this.tenantMap.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }
    return {
      ...tenant,
      currentDailySpendUsd: this.budgetGuardrail.getDailySpend(tenant.id),
    };
  }

  public getTenantMap(): Map<string, TenantConfig> {
    return this.tenantMap;
  }

  /**
   * Submit a new task through the production gateway
   */
  public submitTask(params: {
    tenantId: string;
    prompt: string;
    priority?: TaskPriority;
    tokenBudget?: number;
    actor?: string;
  }): { success: boolean; task?: ProductionTask; error?: string; rateLimited?: boolean } {
    const tenant = this.getTenant(params.tenantId);
    const actor = params.actor || `user@${tenant.id}`;
    const tokenBudget = params.tokenBudget || (tenant.tier === "enterprise" ? 8000 : tenant.tier === "pro" ? 4000 : 1500);
    const priority = params.priority || (tenant.tier === "enterprise" ? "p0_critical" : tenant.tier === "pro" ? "p1_high" : "p2_normal");

    // 1. Audit task submission request
    this.auditLedger.append({
      tenantId: tenant.id,
      actor,
      action: "TASK_SUBMISSION_REQUESTED",
      resource: "gateway",
      riskLevel: "INFO",
      payload: { priority, tokenBudget, promptLength: params.prompt.length },
    });

    // 2. Dual-Track Rate Limiter Check (RPM & TPM pre-check)
    const rateCheck = this.rateLimiter.checkLimit(tenant, 200);
    if (!rateCheck.allowed) {
      this.rejectedCount++;
      const rejectedTask: ProductionTask = {
        id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        tenantId: tenant.id,
        tenantName: tenant.name,
        tier: tenant.tier,
        priority,
        basePriorityScore: 10,
        effectivePriorityScore: 10,
        prompt: params.prompt,
        status: "rejected",
        createdAt: Date.now(),
        queuedAt: Date.now(),
        waitingTimeMs: 0,
        tokenBudget,
        tokensUsed: 0,
        estimatedCostUsd: 0,
        retryCount: 0,
        logs: [`[RateLimiter] 请求被拦截: ${rateCheck.reason}`],
      };
      this.queue.rejectTask(rejectedTask, rateCheck.reason || "Rate limit exceeded");

      this.auditLedger.append({
        tenantId: tenant.id,
        actor,
        action: "RATE_LIMIT_EXCEEDED",
        resource: "gateway_rate_limiter",
        riskLevel: "LOW",
        payload: { reason: rateCheck.reason, waitTimeMs: rateCheck.waitTimeMs },
      });

      return {
        success: false,
        error: rateCheck.reason,
        rateLimited: true,
        task: rejectedTask,
      };
    }

    // 3. Daily Budget Pre-check
    const budgetCheck = this.budgetGuardrail.checkTaskBudget(
      { tokensUsed: 0, tokenBudget } as ProductionTask,
      tokenBudget,
      tenant
    );
    if (!budgetCheck.allowed && budgetCheck.isHardLimit) {
      this.rejectedCount++;
      this.auditLedger.append({
        tenantId: tenant.id,
        actor,
        action: "DAILY_BUDGET_EXCEEDED",
        resource: "budget_guardrail",
        riskLevel: "HIGH",
        payload: { reason: budgetCheck.reason },
      });

      return {
        success: false,
        error: budgetCheck.reason,
        rateLimited: false,
      };
    }

    // 4. Consume rate limit token
    this.rateLimiter.consume(tenant, 200);

    // 5. Create and enqueue task
    const task: ProductionTask = {
      id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      tenantId: tenant.id,
      tenantName: tenant.name,
      tier: tenant.tier,
      priority,
      basePriorityScore: 0,
      effectivePriorityScore: 0,
      prompt: params.prompt,
      status: "queued",
      createdAt: Date.now(),
      queuedAt: Date.now(),
      waitingTimeMs: 0,
      tokenBudget,
      tokensUsed: 0,
      estimatedCostUsd: 0,
      retryCount: 0,
      logs: [`[Gateway] 任务通过合规准入检查，进入多租户排队管理器。`],
    };

    this.queue.enqueue(task);

    this.auditLedger.append({
      tenantId: tenant.id,
      actor,
      action: "TASK_ENQUEUED",
      resource: "priority_queue",
      riskLevel: "INFO",
      payload: { taskId: task.id, priority: task.priority },
    });

    return { success: true, task };
  }

  /**
   * Run one scheduling and execution cycle across worker slots:
   * Phase 1: Complete tasks that are already running in worker slots
   * Phase 2: Dispatch eligible tasks from queue into available worker slots
   */
  public async stepWorkerPool(options?: {
    apiKey?: string;
    baseURL?: string;
    model?: string;
    simulateFailure?: boolean;
    simulateBudgetExceeded?: boolean;
  }): Promise<{
    completedCount: number;
    dispatchedCount: number;
    completedTasks: ProductionTask[];
    runningTasks: ProductionTask[];
  }> {
    const currentlyRunning = this.queue.getRunningTasks();
    const completedTasks: ProductionTask[] = [];

    // Phase 1: Complete currently running tasks
    for (const task of currentlyRunning) {
      const tenant = this.getTenant(task.tenantId);
      await this.executeTask(task, tenant, task.activeWorkerId || "worker-slot-1", options);
      completedTasks.push(task);
    }

    // Phase 2: Dispatch eligible tasks from queue into newly available worker slots
    const newlyDispatched: ProductionTask[] = [];
    while (true) {
      const dispatchResult = this.queue.dispatch(this.tenantMap);
      if (!dispatchResult) break;

      const { task, workerId } = dispatchResult;
      newlyDispatched.push(task);

      this.auditLedger.append({
        tenantId: task.tenantId,
        actor: "scheduler",
        action: "WORKER_DISPATCHED",
        resource: workerId,
        riskLevel: "INFO",
        payload: { taskId: task.id, workerId, effectivePriority: task.effectivePriorityScore },
      });
    }

    return {
      completedCount: completedTasks.length,
      dispatchedCount: newlyDispatched.length,
      completedTasks,
      runningTasks: this.queue.getRunningTasks(),
    };
  }

  /**
   * Directly execute a task in an active slot for targeted simulation drills (e.g. Failure, Budget Attack)
   */
  public async executeSingleDrill(
    task: ProductionTask,
    options?: {
      apiKey?: string;
      baseURL?: string;
      model?: string;
      simulateFailure?: boolean;
      simulateBudgetExceeded?: boolean;
    }
  ): Promise<ProductionTask> {
    this.queue.removeQueuedTask(task.id);
    const tenant = this.getTenant(task.tenantId);
    task.status = "running";
    task.activeWorkerId = "worker-slot-1";
    task.startedAt = Date.now();

    this.auditLedger.append({
      tenantId: tenant.id,
      actor: "fault_injector",
      action: "DRILL_DISPATCHED",
      resource: "worker-slot-1",
      riskLevel: "INFO",
      payload: { taskId: task.id, drillType: options?.simulateFailure ? "failure" : "budget_attack" },
    });

    await this.executeTask(task, tenant, "worker-slot-1", options);
    return task;
  }

  /**
   * Execute task with Circuit Breaker, Fallback, and Budget Guardrails
   */
  private async executeTask(
    task: ProductionTask,
    tenant: TenantConfig,
    workerId: string,
    options?: {
      apiKey?: string;
      baseURL?: string;
      model?: string;
      simulateFailure?: boolean;
      simulateBudgetExceeded?: boolean;
    }
  ) {
    task.logs.push(`[${workerId}] 任务开始执行。`);

    // 1. Circuit Breaker Inspection
    const circuitStatus = this.circuitBreaker.canExecute();

    let activeModel = options?.model || "glm-4-plus";
    let fallbackUsed = false;

    if (!circuitStatus.allowed) {
      if (circuitStatus.fallbackRecommended) {
        // Trigger Model Fallback Cascade
        fallbackUsed = true;
        activeModel = "glm-4-flash (降级备用)";
        this.circuitBreaker.recordFallback();
        task.fallbackOccurred = true;
        task.modelUsed = activeModel;
        task.logs.push(`[Resilience] ${circuitStatus.reason}`);
        task.logs.push(`[Resilience] 级联降级生效: 切换至备用高可用模型 (${activeModel}) 执行。`);

        this.auditLedger.append({
          tenantId: tenant.id,
          actor: "circuit_breaker",
          action: "MODEL_FALLBACK_TRIGGERED",
          resource: activeModel,
          riskLevel: "MEDIUM",
          payload: { taskId: task.id, originalModel: "glm-4-plus", fallbackModel: activeModel },
        });
      } else {
        // Fast fail rejection
        this.queue.failTask(task.id, circuitStatus.reason || "上游大模型熔断");
        return;
      }
    } else {
      task.modelUsed = activeModel;
    }

    // 2. Simulated or Real execution
    if (options?.simulateFailure) {
      this.circuitBreaker.recordFailure("503 Service Unavailable / Gateway Timeout");
      task.logs.push(`[UpstreamError] 大模型服务返回 503 Gateway Timeout。已计入断路器失败统计。`);
      this.queue.failTask(task.id, "上游大模型 503 异常");

      this.auditLedger.append({
        tenantId: tenant.id,
        actor: "worker",
        action: "UPSTREAM_FAILURE",
        resource: "llm_api",
        riskLevel: "HIGH",
        payload: { taskId: task.id, error: "503 Gateway Timeout" },
      });
      return;
    }

    if (options?.simulateBudgetExceeded) {
      // Simulate runaway loop consuming tokens past hard limit
      const tokensBurned = task.tokenBudget + 500;
      const cost = this.budgetGuardrail.calculateCost(tokensBurned, tenant.tokenRateUsdPer1k);
      this.budgetGuardrail.recordTokenSpend(tenant, tokensBurned);
      this.budgetExceededCount++;
      this.totalTokensProcessed += tokensBurned;
      this.totalCostUsd = Number((this.totalCostUsd + cost).toFixed(4));

      task.logs.push(`[BudgetGuardrail] 任务出现深层循环！消耗 ${tokensBurned} Tokens。`);
      task.logs.push(`[BudgetGuardrail] 触发 100% 预算硬顶防御，系统强制熔断终止任务。`);

      this.queue.failTask(
        task.id,
        `Token 预算耗尽硬熔断 (${tokensBurned}/${task.tokenBudget} Tokens)`,
        tokensBurned,
        cost,
        true
      );

      this.auditLedger.append({
        tenantId: tenant.id,
        actor: "budget_guardrail",
        action: "TASK_BUDGET_HARD_STOP",
        resource: task.id,
        riskLevel: "CRITICAL",
        payload: { taskId: task.id, tokensBurned, tokenBudget: task.tokenBudget, costUsd: cost },
      });
      return;
    }

    // Normal successful execution simulation / real response
    const estimatedTokens = Math.floor(Math.random() * 400) + 300;
    const cost = this.budgetGuardrail.calculateCost(estimatedTokens, tenant.tokenRateUsdPer1k);
    this.budgetGuardrail.recordTokenSpend(tenant, estimatedTokens);
    this.totalTokensProcessed += estimatedTokens;
    this.totalCostUsd = Number((this.totalCostUsd + cost).toFixed(4));

    if (!fallbackUsed) {
      this.circuitBreaker.recordSuccess();
    }

    const output = `[${task.tier.toUpperCase()}] 任务已成功由 ${workerId} 处理完毕。模型: ${activeModel}。耗费: ${estimatedTokens} Tokens ($${cost.toFixed(4)})。`;
    task.logs.push(`[Completed] 任务圆满完成。产出结果并释放 Worker 槽位。`);

    this.queue.completeTask(task.id, output, estimatedTokens, cost);

    this.auditLedger.append({
      tenantId: tenant.id,
      actor: workerId,
      action: "TASK_COMPLETED",
      resource: task.id,
      riskLevel: "INFO",
      payload: { taskId: task.id, tokensUsed: estimatedTokens, costUsd: cost, model: activeModel },
    });
  }

  /**
   * Run multi-tenant concurrency stress drill
   */
  public async simulateStressTest(): Promise<{
    submitted: number;
    rejected: number;
    queued: number;
  }> {
    let submitted = 0;
    let rejected = 0;

    // Inject batch tasks across all 3 tiers
    // Enterprise: 3 critical tasks
    for (let i = 1; i <= 3; i++) {
      const res = this.submitTask({
        tenantId: "tenant-enterprise-vip",
        prompt: `[Enterprise] 紧急线上代码修复任务 #${i} (生产高优 P0)`,
        priority: "p0_critical",
      });
      if (res.success) submitted++;
      else rejected++;
    }

    // Pro: 4 tasks
    for (let i = 1; i <= 4; i++) {
      const res = this.submitTask({
        tenantId: "tenant-pro-team",
        prompt: `[Pro] 特性分支单元测试排查任务 #${i} (团队普通 P1)`,
        priority: "p1_high",
      });
      if (res.success) submitted++;
      else rejected++;
    }

    // Free: 8 burst tasks (will exceed RPM/TPM and concurrency)
    for (let i = 1; i <= 8; i++) {
      const res = this.submitTask({
        tenantId: "tenant-free-tier",
        prompt: `[Free] 试用用户自动化脚本查询任务 #${i} (批处理 P2/P3)`,
        priority: i % 2 === 0 ? "p2_normal" : "p3_batch",
      });
      if (res.success) submitted++;
      else rejected++;
    }

    return {
      submitted,
      rejected,
      queued: this.queue.getQueuedTasks().length,
    };
  }

  /**
   * Get full system health metrics
   */
  public getMetrics(): ProductionSystemMetrics {
    const queuedTasks = this.queue.getQueuedTasks();
    const _runningTasks = this.queue.getRunningTasks();
    const completedTasks = this.queue.getCompletedTasks();

    const allFinished = completedTasks.filter((t) => t.status === "completed");
    const avgWaitTimeMs =
      allFinished.length > 0
        ? Math.round(
            allFinished.reduce((acc, curr) => acc + curr.waitingTimeMs, 0) / allFinished.length
          )
        : 0;
    const avgExecTimeMs =
      allFinished.length > 0
        ? Math.round(
            allFinished.reduce((acc, curr) => acc + (curr.executionTimeMs || 0), 0) /
              allFinished.length
          )
        : 0;

    return {
      totalWorkers: this.queue.getTotalWorkerSlots(),
      activeWorkers: this.queue.getActiveWorkerCount(),
      queuedTasks: queuedTasks.length,
      completedTasks: completedTasks.filter((t) => t.status === "completed").length,
      failedTasks: completedTasks.filter((t) => t.status === "failed").length,
      rejectedTasks: this.rejectedCount,
      budgetExceededTasks: this.budgetExceededCount,
      totalTokensProcessed: this.totalTokensProcessed,
      totalCostUsd: Number(this.totalCostUsd.toFixed(4)),
      circuitBreakerState: this.circuitBreaker.getMetrics().state,
      circuitBreakerMetrics: this.circuitBreaker.getMetrics(),
      avgWaitTimeMs,
      avgExecTimeMs,
      tenants: this.getTenants(),
    };
  }

  /**
   * Reset system state
   */
  public reset() {
    this.queue.reset();
    this.rateLimiter.reset();
    this.budgetGuardrail.reset();
    this.circuitBreaker.reset();
    this.auditLedger.reset();
    this.totalTokensProcessed = 0;
    this.totalCostUsd = 0;
    this.rejectedCount = 0;
    this.budgetExceededCount = 0;
  }
}

// Global Singleton for Production Runtime
export const globalProductionRuntime = new ProductionRuntime(5);

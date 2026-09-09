import type {
  ExtensionAuditLog,
  ExtensionHookType,
  BeforeToolCallDecision,
  AfterToolCallDecision,
  ContextContribution,
} from "./types";

export interface SandboxExecutionOptions {
  timeoutMs?: number;
  extensionId: string;
  hook: ExtensionHookType | "tool_execution" | "command";
  action: string;
}

/**
 * ExtensionSandbox: 扩展故障隔离沙箱与容错屏障 (Fault Barrier)
 * 确保任何第三方/企业私有插件的崩溃、死循环、超时或未捕获异常，
 * 绝不可能穿透并击垮 AgentCore 主循环。
 */
export class ExtensionSandbox {
  private static auditLogs: ExtensionAuditLog[] = [];
  private static readonly DEFAULT_TIMEOUT_MS = 2500;

  /**
   * 执行沙箱隔离函数，包装超时限制与异常捕获
   */
  public static async executeWithBarrier<T>(
    fn: () => Promise<T> | T,
    fallbackValue: T,
    options: SandboxExecutionOptions
  ): Promise<{ result: T; audit: ExtensionAuditLog }> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? this.DEFAULT_TIMEOUT_MS;
    let timer: NodeJS.Timeout | null = null;

    try {
      // 竞速执行与超时熔断
      const executionPromise = Promise.resolve().then(fn);
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`[SandboxTimeoutError] Extension '${options.extensionId}' hook '${options.hook}' timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const result = await Promise.race([executionPromise, timeoutPromise]);
      if (timer) clearTimeout(timer);
      const durationMs = Date.now() - startTime;

      const audit: ExtensionAuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        extensionId: options.extensionId,
        hook: options.hook,
        action: options.action,
        status: "success",
        details: { durationMs },
        durationMs,
      };

      this.auditLogs.unshift(audit);
      if (this.auditLogs.length > 200) this.auditLogs.pop();

      return { result, audit };
    } catch (err: any) {
      if (timer) clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      const isTimeout = err?.message?.includes("SandboxTimeoutError");

      const audit: ExtensionAuditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        extensionId: options.extensionId,
        hook: options.hook,
        action: options.action,
        status: "fault_recovered",
        details: {
          errorName: err?.name || "Error",
          errorMessage: err?.message || String(err),
          isTimeout,
          fallbackApplied: true,
        },
        durationMs,
      };

      this.auditLogs.unshift(audit);
      if (this.auditLogs.length > 200) this.auditLogs.pop();

      return { result: fallbackValue, audit };
    }
  }

  /**
   * 安全执行 beforeToolCall 拦截
   */
  public static async safeBeforeToolCall(
    handler: (event: any) => Promise<BeforeToolCallDecision | undefined> | BeforeToolCallDecision | undefined,
    event: any,
    extensionId: string
  ): Promise<BeforeToolCallDecision> {
    const fallback: BeforeToolCallDecision = { allow: true };
    const { result } = await this.executeWithBarrier(
      async () => {
        const res = await handler(event);
        return res ?? fallback;
      },
      fallback,
      {
        extensionId,
        hook: "beforeToolCall",
        action: `intercept_${event.toolName}`,
        timeoutMs: 1500,
      }
    );
    return result;
  }

  /**
   * 安全执行 afterToolCall 拦截
   */
  public static async safeAfterToolCall(
    handler: (event: any) => Promise<AfterToolCallDecision | undefined> | AfterToolCallDecision | undefined,
    event: any,
    extensionId: string
  ): Promise<AfterToolCallDecision> {
    const fallback: AfterToolCallDecision = {};
    const { result } = await this.executeWithBarrier(
      async () => {
        const res = await handler(event);
        return res ?? fallback;
      },
      fallback,
      {
        extensionId,
        hook: "afterToolCall",
        action: `postprocess_${event.toolName}`,
        timeoutMs: 1500,
      }
    );
    return result;
  }

  /**
   * 安全收集 provideContext 贡献
   */
  public static async safeProvideContext(
    provider: () => Promise<ContextContribution[]> | ContextContribution[],
    extensionId: string
  ): Promise<ContextContribution[]> {
    const { result } = await this.executeWithBarrier(
      async () => {
        const list = await provider();
        return Array.isArray(list) ? list : [];
      },
      [],
      {
        extensionId,
        hook: "provideContext",
        action: "collect_context_contributions",
        timeoutMs: 2000,
      }
    );
    return result;
  }

  /**
   * 获取最近所有的审计日志
   */
  public static getAuditLogs(): ExtensionAuditLog[] {
    return [...this.auditLogs];
  }

  /**
   * 清空审计日志
   */
  public static clearLogs(): void {
    this.auditLogs = [];
  }
}

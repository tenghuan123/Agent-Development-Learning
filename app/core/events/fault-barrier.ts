import type { AgentEvent, AgentObserver, ObserverErrorRecord } from "./types";

export class FaultBarrier {
  private errorRecords: ObserverErrorRecord[] = [];
  private consecutiveFailures: Map<string, number> = new Map();
  private maxConsecutiveFailures: number;

  constructor(maxConsecutiveFailures = 5) {
    this.maxConsecutiveFailures = maxConsecutiveFailures;
  }

  /**
   * 安全执行观察者回调，确保外部观察者的任何异常绝不反噬 Agent 核心与总线
   */
  async executeSafe(
    observer: AgentObserver,
    event: AgentEvent,
    onErrorFallback?: (record: ObserverErrorRecord) => void
  ): Promise<boolean> {
    if (!observer.enabled) {
      return false;
    }

    try {
      const result = observer.onEvent(event);
      if (result instanceof Promise) {
        await result;
      }
      // 重置连续失败计数
      this.consecutiveFailures.set(observer.id, 0);
      return true;
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      const record: ObserverErrorRecord = {
        observerId: observer.id,
        observerName: observer.name,
        error: errorMessage,
        occurredAt: Date.now(),
        triggerEventId: event.id,
      };

      this.errorRecords.push(record);
      const currentFailures = (this.consecutiveFailures.get(observer.id) || 0) + 1;
      this.consecutiveFailures.set(observer.id, currentFailures);

      // 观察者自身错误处理
      try {
        observer.onError?.(err, event);
      } catch (innerErr) {
        console.error(`[FaultBarrier] Observer ${observer.name} onError handler also failed:`, innerErr);
      }

      // 如果超过最大连续失败次数，自动隔离该观察者 (熔断保护)
      if (currentFailures >= this.maxConsecutiveFailures) {
        console.warn(
          `[FaultBarrier] Observer ${observer.name} has failed ${currentFailures} consecutive times. Auto-isolating.`
        );
        observer.enabled = false;
      }

      if (onErrorFallback) {
        onErrorFallback(record);
      }

      return false;
    }
  }

  getErrorRecords(): ObserverErrorRecord[] {
    return [...this.errorRecords];
  }

  clearErrors(): void {
    this.errorRecords = [];
    this.consecutiveFailures.clear();
  }
}


import { FaultBarrier } from "./fault-barrier";
import {
  generateId,
  type AgentEvent,
  type AgentObserver,
  type ObserverErrorRecord,
} from "./types";

export interface EventBusOptions {
  maxHistorySize?: number;
  maxConsecutiveFailures?: number;
}

export class TypedEventBus {
  private observers: Map<string, AgentObserver> = new Map();
  private history: AgentEvent[] = [];
  private maxHistorySize: number;
  private currentSeqId = 0;
  private faultBarrier: FaultBarrier;
  private isEmittingError = false;

  constructor(options: EventBusOptions = {}) {
    this.maxHistorySize = options.maxHistorySize || 1000;
    this.faultBarrier = new FaultBarrier(options.maxConsecutiveFailures || 5);
  }

  /**
   * 注册观察者 (零入侵热插拔)
   */
  registerObserver(observer: AgentObserver): () => void {
    this.observers.set(observer.id, observer);
    return () => {
      this.observers.delete(observer.id);
    };
  }

  unregisterObserver(observerId: string): boolean {
    return this.observers.delete(observerId);
  }

  getObservers(): AgentObserver[] {
    return Array.from(this.observers.values());
  }

  getObserver(id: string): AgentObserver | undefined {
    return this.observers.get(id);
  }

  toggleObserver(id: string, enabled?: boolean): boolean {
    const obs = this.observers.get(id);
    if (!obs) return false;
    obs.enabled = enabled !== undefined ? enabled : !obs.enabled;
    return obs.enabled;
  }

  /**
   * 发射强类型事件
   * 严格保障：
   * 1. 唯一 UUID 与时序 seqId 严格自增
   * 2. 毫秒级时间戳
   * 3. 故障沙箱隔离
   */
  async emit<T extends Omit<AgentEvent, "id" | "seqId" | "timestamp">>(
    eventData: T
  ): Promise<AgentEvent> {
    this.currentSeqId += 1;
    const fullEvent = {
      ...eventData,
      id: generateId("evt"),
      seqId: this.currentSeqId,
      timestamp: Date.now(),
    } as unknown as AgentEvent;

    // 1. 写入内存环形缓冲区
    this.history.push(fullEvent);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    // 2. 遍历分发给各个观察者
    const observersSnapshot = Array.from(this.observers.values());
    const dispatchPromises: Promise<any>[] = [];

    for (const observer of observersSnapshot) {
      if (!observer.enabled) continue;

      // 检查过滤器
      if (observer.filter && !observer.filter(fullEvent)) {
        continue;
      }

      // 通过沙箱安全调用
      const p = this.faultBarrier.executeSafe(
        observer,
        fullEvent,
        (record) => this.handleObserverError(record, fullEvent)
      );
      dispatchPromises.push(p);
    }

    // 等待全部异步观察者处理完毕 (各观察者内部已隔离错误，不会抛出到此处)
    await Promise.allSettled(dispatchPromises);

    return fullEvent;
  }

  /**
   * 同步发射事件 (用于高频 chunk 或轻量通知，不阻塞等待 Promise)
   */
  emitSync<T extends Omit<AgentEvent, "id" | "seqId" | "timestamp">>(
    eventData: T
  ): AgentEvent {
    this.currentSeqId += 1;
    const fullEvent = {
      ...eventData,
      id: generateId("evt"),
      seqId: this.currentSeqId,
      timestamp: Date.now(),
    } as unknown as AgentEvent;

    this.history.push(fullEvent);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    const observersSnapshot = Array.from(this.observers.values());
    for (const observer of observersSnapshot) {
      if (!observer.enabled) continue;
      if (observer.filter && !observer.filter(fullEvent)) continue;

      // fire and forget，沙箱保护
      this.faultBarrier.executeSafe(observer, fullEvent, (record) =>
        this.handleObserverError(record, fullEvent)
      );
    }

    return fullEvent;
  }

  private handleObserverError(record: ObserverErrorRecord, triggerEvent: AgentEvent): void {
    if (this.isEmittingError) return; // 防止递归死循环
    this.isEmittingError = true;
    try {
      this.emitSync({
        type: "observer:error",
        runId: triggerEvent.runId,
        observerId: record.observerId,
        observerName: record.observerName,
        triggerEventType: triggerEvent.type,
        errorMessage: record.error,
      });
    } finally {
      this.isEmittingError = false;
    }
  }

  getHistory(runId?: string): AgentEvent[] {
    if (!runId) return [...this.history];
    return this.history.filter((e) => e.runId === runId);
  }

  getErrors(): ObserverErrorRecord[] {
    return this.faultBarrier.getErrorRecords();
  }

  getStats() {
    return {
      totalEventsEmitted: this.history.length,
      currentSeqId: this.currentSeqId,
      registeredObservers: this.observers.size,
      activeObservers: Array.from(this.observers.values()).filter((o) => o.enabled).length,
      totalObserverErrors: this.faultBarrier.getErrorRecords().length,
    };
  }

  clear(): void {
    this.history = [];
    this.faultBarrier.clearErrors();
  }
}

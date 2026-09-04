import type { AgentEvent, AgentEventListener } from "./types";

export class EventStream {
  private listeners: Set<AgentEventListener> = new Set();
  private eventLog: AgentEvent[] = [];
  private maxLogSize: number;

  constructor(maxLogSize = 500) {
    this.maxLogSize = maxLogSize;
  }

  /**
   * Subscribe to agent runtime events.
   * Returns an unsubscribe function.
   */
  subscribe(listener: AgentEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Broadcast an event to all subscribers (UI, Logger, Tracer, Persistence).
   */
  emit(event: AgentEvent): void {
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift();
    }

    // Call each listener safely
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[EventStream] Subscriber error:", err);
      }
    }
  }

  /**
   * Query event history, optionally filtered by runId.
   */
  getHistory(runId?: string): AgentEvent[] {
    if (!runId) return [...this.eventLog];
    return this.eventLog.filter((e) => e.runId === runId);
  }

  /**
   * Clear in-memory event buffer.
   */
  clear(): void {
    this.eventLog = [];
  }
}


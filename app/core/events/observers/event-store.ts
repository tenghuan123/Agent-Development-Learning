import type {
  AgentEvent,
  AgentObserver,
  ReplayStateSnapshot,
} from "../types";

export class EventStoreObserver implements AgentObserver {
  id = "event-store";
  name = "Event Sourcing Store";
  description = "事件溯源仓库：只追加日志写入，支持根据事件流确定性还原与时间旅行回放";
  enabled = true;

  private store: Map<string, AgentEvent[]> = new Map();
  private allEvents: AgentEvent[] = [];

  onEvent(event: AgentEvent): void {
    this.allEvents.push(event);
    const runEvents = this.store.get(event.runId) || [];
    runEvents.push(event);
    this.store.set(event.runId, runEvents);
  }

  getEventsByRun(runId: string): AgentEvent[] {
    return [...(this.store.get(runId) || [])];
  }

  getAllEvents(): AgentEvent[] {
    return [...this.allEvents];
  }

  getRunIds(): string[] {
    return Array.from(this.store.keys());
  }

  /**
   * 核心投影函数 (Event Sourcing Projection)
   * 状态是事件流的累积投射：State = Fold(Events, InitialState)
   * 可以在不重新调用大模型的情况下，100% 确定性还原任意时间点的 Agent 状态！
   */
  projectState(runId: string, upToSeqId?: number): ReplayStateSnapshot {
    const events = this.store.get(runId) || [];
    const filteredEvents = upToSeqId !== undefined
      ? events.filter((e) => e.seqId <= upToSeqId)
      : events;

    const state: ReplayStateSnapshot = {
      currentStep: 0,
      thoughts: [],
      toolCalls: [],
      currentState: "idle",
      isFinished: false,
    };

    for (const event of filteredEvents) {
      switch (event.type) {
        case "run:start": {
          state.currentState = "running";
          break;
        }

        case "step:start": {
          state.currentStep = event.stepNumber;
          break;
        }

        case "llm:thought": {
          state.thoughts.push(event.thought);
          break;
        }

        case "tool:start": {
          state.toolCalls.push({
            id: event.toolCallId,
            name: event.toolName,
            args: event.inputArgs,
            status: "running",
            chunks: [],
          });
          break;
        }

        case "tool:chunk": {
          const tool = state.toolCalls.find((t) => t.id === event.toolCallId);
          if (tool) {
            tool.chunks.push(event.chunk);
          }
          break;
        }

        case "tool:end": {
          const tool = state.toolCalls.find((t) => t.id === event.toolCallId);
          if (tool) {
            tool.status = event.isError ? "error" : "completed";
            tool.output = event.output;
            tool.durationMs = event.durationMs;
          }
          break;
        }

        case "runtime:state_change": {
          state.currentState = event.toState;
          break;
        }

        case "run:finish": {
          state.isFinished = true;
          state.currentState = event.success ? "completed" : "failed";
          state.finalAnswer = event.finalAnswer;
          break;
        }
      }
    }

    return state;
  }

  /**
   * 导出为标准 JSON Lines 格式 (对标 Claude Code 历史日志)
   */
  exportToJsonLines(runId: string): string {
    const events = this.store.get(runId) || [];
    return events.map((e) => JSON.stringify(e)).join("\n");
  }

  clear(): void {
    this.store.clear();
    this.allEvents = [];
  }
}


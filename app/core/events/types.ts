import type { TokenUsage } from "../llm/types";

// ==========================================
// 1. 工业级强类型 AgentEvent (带序时与因果追踪)
// ==========================================

export type AgentEventType =
  | "run:start"
  | "step:start"
  | "llm:thought"
  | "tool:start"
  | "tool:chunk"
  | "tool:end"
  | "user:interrupt"
  | "runtime:state_change"
  | "runtime:abort"
  | "run:finish"
  | "observer:error";

export interface BaseAgentEvent {
  id: string;                 // 唯一事件 UUID
  seqId: number;              // 单调递增事件序列号 (严格保序)
  type: AgentEventType;
  runId: string;
  timestamp: number;          // 精确到毫秒的时间戳
  causalityParentId?: string; // 因果父事件 ID (如 tool:chunk 的父是 tool:start)
}

export interface RunStartEvent extends BaseAgentEvent {
  type: "run:start";
  inputPrompt: string;
  sessionTitle?: string;
  metadata?: Record<string, any>;
}

export interface StepStartEvent extends BaseAgentEvent {
  type: "step:start";
  stepNumber: number;
}

export interface LLMThoughtEvent extends BaseAgentEvent {
  type: "llm:thought";
  stepNumber: number;
  thought: string;
  delta?: string;             // 流式增量分块
  tokenUsage?: TokenUsage;
}

export interface ToolStartEvent extends BaseAgentEvent {
  type: "tool:start";
  stepNumber: number;
  toolCallId: string;
  toolName: string;
  inputArgs: Record<string, any>;
}

export interface ToolChunkEvent extends BaseAgentEvent {
  type: "tool:chunk";
  toolCallId: string;
  toolName: string;
  streamType: "stdout" | "stderr";
  chunk: string;
}

export interface ToolEndEvent extends BaseAgentEvent {
  type: "tool:end";
  toolCallId: string;
  toolName: string;
  output: string;
  isError: boolean;
  durationMs: number;
}

export interface UserInterruptEvent extends BaseAgentEvent {
  type: "user:interrupt";
  message: string;
  injectedAtStep: number;
}

export interface StateChangeEvent extends BaseAgentEvent {
  type: "runtime:state_change";
  fromState: string;
  toState: string;
  reason?: string;
}

export interface RuntimeAbortEvent extends BaseAgentEvent {
  type: "runtime:abort";
  reason: string;
  cascadeKilledTools: number;
}

export interface RunFinishEvent extends BaseAgentEvent {
  type: "run:finish";
  success: boolean;
  finalAnswer: string;
  totalSteps: number;
  totalTokens?: number;
  durationMs: number;
}

export interface ObserverErrorEvent extends BaseAgentEvent {
  type: "observer:error";
  observerId: string;
  observerName: string;
  triggerEventType: AgentEventType;
  errorMessage: string;
  timestamp: number;
}

export type AgentEvent =
  | RunStartEvent
  | StepStartEvent
  | LLMThoughtEvent
  | ToolStartEvent
  | ToolChunkEvent
  | ToolEndEvent
  | UserInterruptEvent
  | StateChangeEvent
  | RuntimeAbortEvent
  | RunFinishEvent
  | ObserverErrorEvent;

// ==========================================
// 2. 观察者规范 (AgentObserver Protocol)
// ==========================================

export interface AgentObserver {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  // 可选过滤器：只订阅关心的事件类型
  filter?: (event: AgentEvent) => boolean;
  // 处理事件 (支持同步或异步，被 FaultBarrier 沙箱守护)
  onEvent(event: AgentEvent): Promise<void> | void;
  // 观察者自身异常回调
  onError?(error: Error, event: AgentEvent): void;
}

export interface ObserverErrorRecord {
  observerId: string;
  observerName: string;
  error: string;
  occurredAt: number;
  triggerEventId: string;
}

// ==========================================
// 3. 事件溯源与回放模型 (Event Sourcing)
// ==========================================

export interface ReplayStateSnapshot {
  currentStep: number;
  thoughts: string[];
  toolCalls: {
    id: string;
    name: string;
    args: Record<string, any>;
    status: "running" | "completed" | "error";
    output?: string;
    chunks: string[];
    durationMs?: number;
  }[];
  currentState: string;
  finalAnswer?: string;
  isFinished: boolean;
}

export function generateId(prefix = ""): string {
  const rand = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}-${rand}` : rand;
}


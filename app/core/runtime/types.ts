import type { ChatMessage, TokenUsage } from "../llm/types";
import type { ToolCallItem, ToolExecutionResult } from "../tools/types";

// ==========================================
// 1. Agent Event Stream (Pub/Sub Event Bus)
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
  | "runtime:suspend"
  | "run:finish"
  | "error";

export interface BaseAgentEvent {
  type: AgentEventType;
  runId: string;
  timestamp: number;
}

export interface RunStartEvent extends BaseAgentEvent {
  type: "run:start";
  inputPrompt: string;
  branchId: string;
}

export interface StepStartEvent extends BaseAgentEvent {
  type: "step:start";
  stepNumber: number;
}

export interface LLMThoughtEvent extends BaseAgentEvent {
  type: "llm:thought";
  stepNumber: number;
  thought: string;
  usage?: TokenUsage;
}

export interface ToolStartEvent extends BaseAgentEvent {
  type: "tool:start";
  stepNumber: number;
  toolCallId: string;
  toolName: string;
  inputArgs: any;
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

export interface RuntimeStateChangeEvent extends BaseAgentEvent {
  type: "runtime:state_change";
  fromState: RuntimeState;
  toState: RuntimeState;
  reason?: string;
}

export interface RuntimeAbortEvent extends BaseAgentEvent {
  type: "runtime:abort";
  reason: string;
  cascadeKilledTools: number;
}

export interface RuntimeSuspendEvent extends BaseAgentEvent {
  type: "runtime:suspend";
  snapshotId: string;
  savedStep: number;
}

export interface RunFinishEvent extends BaseAgentEvent {
  type: "run:finish";
  success: boolean;
  finalAnswer: string;
  totalSteps: number;
  totalDurationMs: number;
  finishReason: "completed" | "aborted" | "suspended" | "max_steps" | "error";
}

export interface RuntimeErrorEvent extends BaseAgentEvent {
  type: "error";
  error: string;
  fatal: boolean;
}

export type AgentEvent =
  | RunStartEvent
  | StepStartEvent
  | LLMThoughtEvent
  | ToolStartEvent
  | ToolChunkEvent
  | ToolEndEvent
  | UserInterruptEvent
  | RuntimeStateChangeEvent
  | RuntimeAbortEvent
  | RuntimeSuspendEvent
  | RunFinishEvent
  | RuntimeErrorEvent;

export type AgentEventListener = (event: AgentEvent) => void;

// ==========================================
// 2. Runtime Lifecycle States
// ==========================================

export type RuntimeState =
  | "idle"
  | "running"
  | "waiting_tool"
  | "draining"
  | "suspended"
  | "aborted"
  | "completed"
  | "error";

// ==========================================
// 3. AgentCore (Pure Decision Gear)
// ==========================================

export type StepDecision =
  | {
      type: "call_tools";
      thought: string;
      toolCalls: ToolCallItem[];
    }
  | {
      type: "finish";
      thought: string;
      finalAnswer: string;
    }
  | {
      type: "ask_user";
      thought: string;
      question: string;
    };

export interface AgentCore {
  /**
   * Pure step computation: takes current Session snapshot and abort signal,
   * returns next StepDecision without performing any system side-effects.
   */
  step(snapshot: SessionSnapshot, signal: AbortSignal): Promise<StepDecision>;
}

// ==========================================
// 4. Session & Snapshot (Session Tree)
// ==========================================

export interface SessionSnapshot {
  snapshotId: string;
  runId: string;
  branchId: string;
  stepNumber: number;
  messages: ChatMessage[];
  workspaceState: Record<string, string>;
  toolHistory: ToolExecutionResult[];
  timestamp: number;
  metadata: Record<string, any>;
}

export interface SessionRun {
  id: string;
  parentRunId?: string;
  branchId: string;
  status: RuntimeState;
  currentStep: number;
  messages: ChatMessage[];
  toolHistory: ToolExecutionResult[];
  workspaceState: Record<string, string>;
  metadata: Record<string, any>;
  checkpoints: SessionSnapshot[];
  createdAt: number;
  updatedAt: number;
}

// ==========================================
// 5. Inbound Interrupt Queue
// ==========================================

export interface InboundMessage {
  id: string;
  content: string;
  priority: "immediate" | "next_step";
  timestamp: number;
}

// ==========================================
// 6. Tool Execution Options with Abort
// ==========================================

export interface ToolExecutionOptions {
  signal?: AbortSignal;
  onStreamChunk?: (chunk: { streamType: "stdout" | "stderr"; text: string }) => void;
  timeoutMs?: number;
  workspaceDir?: string;
}

// ==========================================
// 7. Chaos Experiment Types
// ==========================================

export type ChaosScenarioType =
  | "mid_flight_input" // User sends input while tool is running
  | "hard_abort"       // Ctrl+C cancellation while tools are running
  | "zombie_tool"      // Tool hangs/takes long time without signal guard
  | "event_race";      // Concurrent streams, UI updates and prompt updates

export interface ChaosRunOutput {
  scenario: ChaosScenarioType;
  title: string;
  description: string;
  naiveLoop: {
    crashed: boolean;
    errorSummary: string;
    orphanProcesses: number;
    statePreserved: boolean;
    inputLost: boolean;
    telemetryLogs: Array<{ time: number; log: string; level: "info" | "warn" | "error" }>;
  };
  decoupledRuntime: {
    handledGracefully: boolean;
    signalCascadeTimeMs: number;
    orphanProcesses: number;
    statePreserved: boolean;
    inputBuffered: boolean;
    telemetryLogs: Array<{ time: number; log: string; level: "info" | "warn" | "success" }>;
  };
}


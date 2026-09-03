import type { ChatMessage } from "../llm/types";

export type DurableRunStatus =
  | "idle"
  | "running"
  | "crashed"
  | "completed"
  | "failed";

export interface DurableState {
  runId: string;
  goal: string;
  currentNodeId: string | null;
  completedNodeIds: string[];
  variables: Record<string, any>;
  messages: ChatMessage[];
  logs: Array<{
    timestamp: number;
    level: "info" | "warn" | "error" | "wal" | "checkpoint" | "idempotent";
    message: string;
    details?: any;
  }>;
  status: DurableRunStatus;
  crashInfo?: {
    step: number;
    nodeId: string;
    reason: string;
    timestamp: number;
  };
  metrics: {
    totalSteps: number;
    checkpointsSaved: number;
    idempotentReplays: number;
    sideEffectsExecuted: number;
  };
}

export interface CheckpointSnapshot {
  checkpointId: string;
  runId: string;
  stepIndex: number;
  nodeId: string | null;
  parentCheckpointId: string | null;
  timestamp: number;
  state: DurableState;
  idempotencyHash: string;
  label: string;
  diffSummary: string;
}

export type ActionStatus = "executed" | "cached" | "failed";

export interface IdempotencyRecord {
  key: string;
  runId: string;
  nodeId: string;
  actionName: string;
  args: Record<string, any>;
  status: ActionStatus;
  result: any;
  executedAt: number;
  executionCount: number;
  isSideEffect: boolean;
}

export interface WorkflowNode {
  id: string;
  name: string;
  description: string;
  isSideEffect: boolean;
  actionName: string;
  estimatedDurationMs?: number;
  execute: (
    state: DurableState,
    recordSideEffect: (
      actionName: string,
      args: Record<string, any>,
      executor: () => Promise<any>
    ) => Promise<{ result: any; fromCache: boolean; key: string }>
  ) => Promise<{
    statePatch: Partial<DurableState>;
    logs?: string[];
    outputSummary?: string;
  }>;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  condition?: (state: DurableState) => boolean;
  label?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  startNodeId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface CrashInjectionConfig {
  enabled: boolean;
  crashAtStep: number;
  crashAtNodeId?: string;
  timing: "before_action" | "after_action";
  reason: string;
}

export interface DurableEngineEvent {
  type:
    | "run_start"
    | "node_start"
    | "action_executing"
    | "action_cached"
    | "checkpoint_saved"
    | "crashed"
    | "resumed"
    | "node_completed"
    | "run_completed"
    | "error";
  runId: string;
  stepIndex: number;
  nodeId?: string;
  checkpointId?: string;
  message: string;
  timestamp: number;
  stateSnapshot?: Partial<DurableState>;
  details?: any;
}


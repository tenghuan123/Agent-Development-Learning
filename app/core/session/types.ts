import type { ChatMessage } from "../llm/types";

/**
 * Concrete side-effect record of a tool execution.
 */
export interface ToolExecutionRecord {
  toolName: string;
  input?: any;
  output?: string;
  durationMs?: number;
  timestamp: number;
}

/**
 * Single file snapshot inside a workspace at a specific point in time.
 */
export interface FileSnapshot {
  path: string;
  hash: string;
  size: number;
  lastModified: number;
  contentSnippet?: string;
}

/**
 * Complete snapshot of the workspace files and their cryptographic fingerprints.
 */
export interface WorkspaceSnapshot {
  id: string;
  timestamp: number;
  files: Record<string, FileSnapshot>;
  rootHash: string;
}

/**
 * File-level difference between two snapshots or between snapshot and current disk.
 */
export interface FileDiffItem {
  path: string;
  status: "added" | "modified" | "deleted" | "unmodified";
  oldHash?: string;
  newHash?: string;
  oldSnippet?: string;
  newSnippet?: string;
}

export interface WorkspaceDiff {
  changed: FileDiffItem[];
  summary: {
    addedCount: number;
    modifiedCount: number;
    deletedCount: number;
    unmodifiedCount: number;
  };
}

/**
 * External drift conflict detected when comparing snapshot against actual disk files.
 */
export interface DriftConflict {
  path: string;
  type: "missing" | "modified" | "untracked";
  expectedHash?: string;
  actualHash?: string;
  message: string;
}

export interface WorkspaceDrift {
  hasDrift: boolean;
  conflicts: DriftConflict[];
  checkedAt: number;
}

/**
 * Integrity report before resuming an agent session.
 */
export interface SessionIntegrityCheckResult {
  valid: boolean;
  sessionId: string;
  checkpointId: string;
  drift: WorkspaceDrift;
  ghostRisks: string[];
  suggestedAction: "proceed" | "resync_workspace" | "rollback" | "abort";
  timestamp: number;
}

/**
 * Atomic point-in-time checkpoint representing a single step boundary.
 */
export interface StepCheckpoint {
  id: string;
  runId: string;
  stepNumber: number;
  timestamp: number;
  messages: ChatMessage[];
  workspaceSnapshot: WorkspaceSnapshot;
  toolHistory: ToolExecutionRecord[];
  description?: string;
}

/**
 * Execution pipeline run within a session branch.
 */
export interface SessionRun {
  id: string;
  sessionId: string;
  branchId: string;
  parentRunId?: string;
  status: "idle" | "running" | "suspended" | "completed" | "failed";
  currentStep: number;
  messages: ChatMessage[];          // The LLM attention context projection
  toolHistory: ToolExecutionRecord[]; // Concrete side-effect records ledger
  workspaceSnapshot: WorkspaceSnapshot; // Truth of physical workspace
  checkpoints: StepCheckpoint[];
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/**
 * Named branch representing an alternative line of execution exploration.
 */
export interface SessionBranch {
  id: string;
  name: string;
  baseSnapshotId?: string;
  runIds: string[];
  createdAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Session Root Aggregate Entity (会话聚合根)
 */
export interface Session {
  id: string;
  title: string;
  workspaceRoot: string;
  activeBranchId: string;
  branches: Record<string, SessionBranch>;
  runs: Record<string, SessionRun>;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/**
 * Real step execution record during live LLM experimentation.
 */
export interface RealStepExecution {
  step: number;
  phase: string;
  role: "user" | "assistant" | "tool" | "system";
  content?: string;
  toolCall?: {
    name: string;
    args: Record<string, any>;
    id: string;
  };
  observation?: string;
  isError?: boolean;
  durationMs?: number;
}

/**
 * Chaos Scenario Types for Lesson 15
 */
export type SessionChaosScenarioType =
  | "ghost_state_disaster"      // Messages-only vs Session Workspace Validation
  | "compaction_truth_loss"     // Context Compaction vs Full-fidelity Side-effect Ledger
  | "branch_timeline_fork";     // Linear Splicing vs True Non-linear Branching

export interface SessionChaosResult {
  scenario: SessionChaosScenarioType;
  title: string;
  timestamp: number;
  isRealLLM: boolean;
  modelUsed: string;
  executionTimeMs: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  messagesOnlyMode: {
    title: string;
    status: "failed" | "corrupted" | "degraded";
    error?: string;
    details: string[];
    dataLoss: string[];
    steps?: RealStepExecution[];
    finalLLMResponse?: string;
  };
  sessionStateMode: {
    title: string;
    status: "safe_intercept" | "intact" | "forked_clean";
    protectionAction: string;
    details: string[];
    preservationMetrics: Record<string, unknown>;
    steps?: RealStepExecution[];
    finalLLMResponse?: string;
  };
  keyTakeaway: string;
}

/**
 * Automated Verification Contract Test
 */
export interface SessionVerificationTestResult {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  expectedBehavior: string;
  actualBehavior: string;
  durationMs: number;
  error?: string;
}

import type { ChatMessage, TokenUsage } from "../llm/types";
import type { ToolCallItem, ToolExecutionResult } from "../tools/types";
import type { AgentGuardAlert, AgentStepRecord } from "../agent/types";

/**
 * Token metrics and budget tracking
 */
export interface ContextTelemetry {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  maxContextLimit: number;
  utilizationRate: number; // 0.0 ~ 1.0 (e.g. 0.65 = 65% of context window used)
  tokensSavedByPruning: number;
  tokensSavedByTruncation: number;
  tokensSavedByCompaction: number;
  netTokensSaved: number;
  currentMessageCount: number;
  rawUncompactedTokens: number; // What the token count would be without any Context Engine
}

/**
 * Smart truncation configuration
 */
export interface TruncationOptions {
  maxLines?: number;
  headLines?: number;
  tailLines?: number;
  maxCharacters?: number;
  preserveErrors?: boolean;
}

/**
 * Result of truncating a long text / log
 */
export interface TruncationResult {
  content: string;
  isTruncated: boolean;
  originalLines: number;
  retainedLines: number;
  originalChars: number;
  retainedChars: number;
  estimatedOriginalTokens: number;
  estimatedRetainedTokens: number;
  tokensSaved: number;
  errorLinesFound: number;
}

/**
 * Node in the repository outline map
 */
export interface RepoMapNode {
  name: string;
  relativePath: string;
  type: "file" | "directory";
  sizeBytes?: number;
  lineCount?: number;
  signatures?: string[]; // e.g. ["export function login()", "interface User"]
  children?: RepoMapNode[];
}

/**
 * Summary and serialized text of the repository map
 */
export interface RepoMapSummary {
  formattedMap: string;
  totalFiles: number;
  totalDirectories: number;
  totalEstimatedTokens: number;
  signaturesExtracted: number;
}

/**
 * Pruning policy configuration
 */
export interface PruningConfig {
  enabled: boolean;
  keepRecentSteps: number; // Keep full observations for the latest N steps (default: 3)
  pruneIntermediateOutputs: boolean; // Compress older tool outputs into concise summaries
  maxObservationChars: number; // Default length limit for older observations
}

/**
 * Compaction record capturing state snapshots
 */
export interface CompactionRecord {
  step: number;
  timestamp: number;
  compactedTurnCount: number;
  summary: string;
  previousTokenCount: number;
  newTokenCount: number;
  tokensSaved: number;
}

/**
 * State snapshot of the Context Engine
 */
export interface ContextStateSnapshot {
  telemetry: ContextTelemetry;
  compactions: CompactionRecord[];
  pruningEventCount: number;
  truncationEventCount: number;
  isCompactionTriggered: boolean;
}

/**
 * Engine configuration
 */
export interface ContextEngineConfig {
  maxContextLimit?: number; // e.g. 128000 for standard LLMs
  compactionThreshold?: number; // High-watermark ratio to trigger compaction, e.g. 0.75 (75%)
  compactionTriggerTokens?: number; // Optional direct token threshold for agile demo compaction, e.g. 3500
  pruningConfig?: Partial<PruningConfig>;
  truncationConfig?: Partial<TruncationOptions>;
  enableRepoMapInjection?: boolean;
  repoMapTokenBudget?: number;
  workspaceDir?: string;
}

/**
 * SSE Real-time streaming events for Context Agent
 */
export type ContextStreamEvent =
  | {
      type: "engine_initialized";
      config: ContextEngineConfig;
      telemetry: ContextTelemetry;
      repoMapSummary?: RepoMapSummary;
    }
  | {
      type: "step_start";
      step: number;
      maxSteps: number;
      telemetry: ContextTelemetry;
    }
  | {
      type: "thought";
      step: number;
      content: string;
    }
  | {
      type: "tool_start";
      step: number;
      toolCalls: ToolCallItem[];
    }
  | {
      type: "tool_truncated";
      step: number;
      toolName: string;
      truncation: TruncationResult;
    }
  | {
      type: "tool_end";
      step: number;
      toolResults: ToolExecutionResult[];
    }
  | {
      type: "context_pruned";
      step: number;
      tokensSaved: number;
      prunedTurnsCount: number;
      telemetry: ContextTelemetry;
    }
  | {
      type: "context_compacted";
      step: number;
      compaction: CompactionRecord;
      telemetry: ContextTelemetry;
    }
  | {
      type: "guard_alert";
      step: number;
      alert: AgentGuardAlert;
    }
  | {
      type: "step_end";
      step: number;
      stepRecord: AgentStepRecord;
      telemetry: ContextTelemetry;
    }
  | {
      type: "agent_done";
      result: ContextAgentResult;
    }
  | {
      type: "error";
      message: string;
    };

/**
 * Final execution result of Context Agent
 */
export interface ContextAgentResult {
  success: boolean;
  engineEnabled: boolean;
  finalAnswer: string;
  totalSteps: number;
  totalDurationMs: number;
  finishReason: "completed" | "circuit_break" | "max_steps_exceeded" | "context_exceeded" | "error";
  steps: AgentStepRecord[];
  allMessages: ChatMessage[];
  totalTokenUsage: TokenUsage;
  telemetry: ContextTelemetry;
  compactions: CompactionRecord[];
  guardAlerts: AgentGuardAlert[];
}


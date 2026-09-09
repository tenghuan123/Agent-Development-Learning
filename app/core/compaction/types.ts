import type { ChatMessage } from "../llm/types";

/**
 * 6 Core Context Partitions in modern Coding Agent Runtime (aligned with Pi / Claude Code)
 */
export type ContextPartitionType =
  | "PINNED"                // Immutable base: System prompt, ultimate mission invariant, core instructions
  | "WORKING_SET"           // Active files: Diffs, modified paths, active symbol tables, AST interfaces
  | "NEGATIVE_CONSTRAINTS"  // Trap memory: Disproven hypotheses, fatal bugs to avoid ("DO NOT TRY X")
  | "STRUCTURED_LEDGER"     // Compacted history: Completed milestones, architectural decisions, pending todos
  | "HOT_WINDOW"            // High-fidelity turns: Latest N tool invocations & raw execution outputs
  | "COLD_ARCHIVE";         // Cold history: Immutable append-only events.jsonl, queried on-demand

/**
 * Single token allotment slice
 */
export interface PartitionSlice {
  type: ContextPartitionType;
  name: string;
  description: string;
  allocatedTokens: number;
  maxTokens: number;
  percentage: number;
  contentSnippet: string;
  itemCount: number;
  priority: number; // 1 (highest, never drop) to 5 (drop/compress first)
}

/**
 * Budget Configuration
 */
export interface ContextBudgetConfig {
  maxContextLimit: number;      // e.g. 32000 or 64000
  highWatermarkRatio: number;   // e.g. 0.75 (triggers compaction at 75%)
  hotWindowTurnCount: number;   // number of recent message turns to preserve at 100% bit fidelity (e.g. 4)
  targetCompactedTokens: number;// target token size after compaction (e.g. 12000)
}

/**
 * Negative Constraint item (Trap Memory)
 */
export interface NegativeConstraint {
  id: string;
  stepDiscovered: number;
  category: "DEADLOCK" | "TYPE_ERROR" | "SECURITY_VIOLATION" | "PERFORMANCE_TRAP" | "INVALID_ASSUMPTION";
  statement: string;           // E.g. "Do not use in-memory locks across workers without TTL"
  reason: string;              // Root cause analysis
  suggestedAlternative: string;// What to use instead
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  timesAvoided?: number;
}

/**
 * Working Set File Tracking
 */
export interface WorkingSetFile {
  path: string;
  status: "MODIFIED" | "CREATED" | "READ_ONLY" | "PENDING_VERIFICATION";
  exportedSymbols: string[];
  approxTokens: number;
  lastModifiedStep: number;
  diffSnippet?: string;
}

/**
 * Structured Compaction Ledger (The distilled ground truth)
 */
export interface StructuredLedger {
  compactionStep: number;
  timestamp: number;
  primaryObjective: string;
  completedMilestones: { step: number; title: string; outcome: string }[];
  architecturalDecisions: { decision: string; rationale: string }[];
  activeWorkingSet: WorkingSetFile[];
  negativeConstraints: NegativeConstraint[];
  pendingTodoItems: string[];
  rawTurnsArchived: number;
}

/**
 * Cold Storage Historical Event (Append-Only)
 */
export interface ColdArchivedEvent {
  id: string;
  step: number;
  timestamp: number;
  type: "USER_PROMPT" | "AGENT_THOUGHT" | "TOOL_CALL" | "TOOL_RESULT" | "COMPACTION";
  summary: string;
  fullPayload: string;
  tags: string[];
  tokens: number;
}

/**
 * Context Compaction Result
 */
export interface CompactionExecutionResult {
  step: number;
  timestamp: number;
  originalTokens: number;
  compactedTokens: number;
  tokensSaved: number;
  reductionPercentage: number;
  ledger: StructuredLedger;
  compactedMessages: ChatMessage[];
  partitions: PartitionSlice[];
  archivedEventsCount: number;
}

/**
 * 3-Way Dilemma Benchmark Metrics for a single approach
 */
export interface BenchmarkApproachMetrics {
  approachId: "no_compaction" | "naive_summary" | "structured_compaction";
  approachName: string;
  totalTokensUsed: number;
  peakTokensInPrompt: number;
  averageStepLatencyMs: number;
  finalSuccess: boolean;
  trapTriggeredCount: number;          // Number of times agent repeated an old mistake
  symbolFidelityScore: number;         // 0 to 100% (Did it retain exact interfaces?)
  goalDriftDetected: boolean;
  costInDollarsEst: number;
  explanation: string;
  stepLogs: {
    step: number;
    promptTokens: number;
    latencyMs: number;
    status: "ok" | "warn" | "failed" | "deadlock";
    eventDesc: string;
  }[];
}

/**
 * Benchmark Report comparing all 3 approaches
 */
export interface CompactionChaosBenchmarkReport {
  taskName: string;
  totalSteps: number;
  timestamp: number;
  approaches: {
    noCompaction: BenchmarkApproachMetrics;
    naiveSummary: BenchmarkApproachMetrics;
    structuredCompaction: BenchmarkApproachMetrics;
  };
  keyFindings: string[];
}

/**
 * Mathematical Formal Invariant verification
 */
export interface CompactionInvariantAssertion {
  id: string;
  name: string;
  lawTitle: string;
  passed: boolean;
  expected: string;
  actual: string;
  details: string;
}

export interface CompactionVerificationReport {
  timestamp: number;
  allPassed: boolean;
  assertions: CompactionInvariantAssertion[];
  summary: string;
}

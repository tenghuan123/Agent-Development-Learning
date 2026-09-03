/**
 * Core Telemetry & Evaluation Types
 * Aligned with OpenTelemetry GenAI standards and SWE-bench/GAIA paradigms.
 */

export type SpanType =
  | "agent_run"       // Root trace of the agent execution
  | "planner"         // Task decomposition / workflow routing
  | "agent_loop"      // Single step in the ReAct / Thought-Action-Observation loop
  | "llm_call"        // Large language model inference request
  | "tool_exec"       // Tool call execution (local or remote MCP)
  | "eval_check"      // Deterministic environment assertion check
  | "judge_review";   // LLM-as-a-Judge evaluation step

export type SpanStatus = "running" | "ok" | "error" | "cancelled";

export interface SpanMetrics {
  startTime: number;          // Unix timestamp in ms
  endTime?: number;           // Unix timestamp in ms
  durationMs: number;         // Total elapsed time in ms
  ttftMs?: number;            // Time to First Token (streaming latency)
  promptTokens: number;       // Prompt tokens billed
  completionTokens: number;   // Completion tokens billed
  totalTokens: number;        // Sum of prompt and completion
  estimatedCostUsd: number;   // Calculated USD cost based on model pricing
}

export interface Span {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  type: SpanType;
  status: SpanStatus;
  metrics: SpanMetrics;
  input?: unknown;
  output?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
  children?: Span[];
}

export interface Trace {
  traceId: string;
  name: string;
  startTime: number;
  endTime?: number;
  durationMs: number;
  status: SpanStatus;
  rootSpanId: string;
  spans: Span[];
  totalTokens: number;
  totalCostUsd: number;
  stepCount: number;
  modelName: string;
}

export type BenchmarkCategory =
  | "algorithm"
  | "tool_orchestration"
  | "self_healing"
  | "security_injection"
  | "refactoring";

export type BenchmarkDifficulty = "easy" | "medium" | "hard";

export interface BenchmarkRubricItem {
  criterion: string;
  weight: number; // 0.0 - 1.0, sum of weights = 1.0
  description: string;
}

export interface BenchmarkCase {
  id: string;
  name: string;
  category: BenchmarkCategory;
  difficulty: BenchmarkDifficulty;
  description: string;
  prompt: string;
  systemPrompt?: string;
  groundTruth: string;
  expectedTools: string[];
  maxBudgetSteps: number;
  costBudgetUsd: number;
  rubric: BenchmarkRubricItem[];
  assertionFn: (
    finalOutput: string,
    trace: Trace
  ) => { pass: boolean; reason: string; score: number };
}

export interface EvalDimensionScores {
  taskSuccess: number;          // 0 - 100: L1 Deterministic assertion
  toolPrecision: number;        // 0 - 100: Tool choice & parameter accuracy
  trajectoryEfficiency: number; // 0 - 100: Step economy & avoidance of loops
  costEfficiency: number;       // 0 - 100: Token & dollar efficiency vs budget
  judgeQuality: number;         // 0 - 100: L3 LLM-as-a-Judge semantic score
  compositeScore: number;       // 0 - 100: Weighted aggregate score
}

export interface JudgeCritique {
  score: number;                // 0 - 100
  reasoning: string;            // Chain of thought explanation
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

export interface EvalReport {
  caseId: string;
  caseName: string;
  traceId: string;
  status: "passed" | "failed" | "partial";
  dimensions: EvalDimensionScores;
  assertionResults: {
    name: string;
    passed: boolean;
    message: string;
  }[];
  judgeCritique?: JudgeCritique;
  trace: Trace;
  timestamp: number;
}

export interface SuiteSummary {
  timestamp: number;
  totalCases: number;
  passedCases: number;
  passRate: number;             // 0 - 100%
  avgDurationMs: number;
  totalCostUsd: number;
  avgCompositeScore: number;
  radarAverages: {
    taskSuccess: number;
    toolPrecision: number;
    trajectoryEfficiency: number;
    costEfficiency: number;
    judgeQuality: number;
  };
  reports: EvalReport[];
}

export interface ABComparisonRound {
  title: string;
  category: "planning" | "tool_execution" | "self_healing" | "code_quality" | "economics";
  winner: "A" | "B" | "TIE";
  scoreA: number;
  scoreB: number;
  commentary: string;
}

export interface ABComparisonResult {
  timestamp: number;
  caseId: string;
  strategyA: {
    name: string;
    report: EvalReport;
    output?: string;
  };
  strategyB: {
    name: string;
    report: EvalReport;
    output?: string;
  };
  winner: "A" | "B" | "TIE";
  analysis: {
    latencyDiffMs: number;       // B - A
    costDiffUsd: number;         // B - A
    scoreDiff: number;           // B - A
    summary: string;
  };
  rounds: ABComparisonRound[];
}


import type {
  FileDiffItem,
  WorkspaceDiff,
} from "../session/types";

/**
 * Node in the Branch Directed Acyclic Graph (DAG).
 * Each node represents an atomic step execution within a branch timeline.
 */
export interface BranchDAGNode {
  nodeId: string;
  parentNodeId: string | null;
  branchId: string;
  runId: string;
  stepNumber: number;
  checkpointId: string;
  timestamp: number;
  summary: string;
  role: "user" | "assistant" | "system" | "tool";
  promptProjectionSnippet?: string;
  toolCallName?: string;
  workspaceSnapshotId: string;
  rootHash: string;
  filesModified: string[];
  metrics: {
    durationMs?: number;
    tokensUsed?: number;
    isError?: boolean;
    testsPassed?: boolean;
  };
}

/**
 * Branch Entity representing an independent line of exploration.
 */
export interface BranchEntity {
  branchId: string;
  name: string;
  description: string;
  forkPointNodeId: string | null; // null for main root
  headNodeId: string;
  createdAt: number;
  status: "active" | "abandoned" | "merged";
  colorTag?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result of a time-travel checkout operation.
 */
export interface TimeTravelCheckoutResult {
  success: boolean;
  targetNodeId: string;
  targetBranchId: string;
  previousHeadNodeId: string;
  rootHash: string;
  filesRestoredCount: number;
  driftDetected: boolean;
  message: string;
  timestamp: number;
}

/**
 * Cross-branch cherry-pick request.
 */
export interface CherryPickRequest {
  sourceBranchId: string;
  sourceNodeId: string;
  targetBranchId: string;
  filePath: string;
  customCommitMessage?: string;
}

/**
 * Result of a cherry-pick action.
 */
export interface CherryPickResult {
  success: boolean;
  sourceFilePath: string;
  sourceNodeId: string;
  targetBranchId: string;
  createdNodeId: string;
  newCheckpointId: string;
  message: string;
  diffSummary?: string;
}

/**
 * Multi-branch comparison metrics.
 */
export interface BranchComparisonMatrix {
  branchA: {
    branchId: string;
    name: string;
    totalSteps: number;
    tokensSpent: number;
    testsPassing: boolean;
    status: string;
    filesCount: number;
  };
  branchB: {
    branchId: string;
    name: string;
    totalSteps: number;
    tokensSpent: number;
    testsPassing: boolean;
    status: string;
    filesCount: number;
  };
  fileDiffs: FileDiffItem[];
  diffSummary: WorkspaceDiff["summary"];
  lcaNodeId: string | null; // Lowest Common Ancestor
  divergenceStep: number;
}

export interface StrategyExecutionStep {
  timestamp: number;
  stage: string;
  message: string;
  filesChanged?: string[];
  nodesImpacted?: number;
  tokensConsumed?: number;
  status: "info" | "warning" | "error" | "success";
}

/**
 * Qualitative & quantitative comparison between:
 * 1. Start Over (Restart)
 * 2. Linear Undo (Restore & Truncate)
 * 3. Session Branching (DAG Fork)
 */
export interface BranchChaosDilemmaReport {
  scenarioTitle: string;
  timestamp: number;
  isRealLLM: boolean;
  taskDescription: string;

  startOver: {
    title: string;
    approach: "Start Over from scratch";
    totalTokensWasted: number;
    timeSpentMs: number;
    dataLossPercentage: number;
    assetsLost: string[];
    risk: string;
    summary: string;
  };

  linearUndo: {
    title: string;
    approach: "Destructive Snapshot Restore (Truncating)";
    totalTokensWasted: number;
    timeSpentMs: number;
    dataLossPercentage: number;
    assetsLost: string[];
    risk: string;
    summary: string;
  };

  sessionBranching: {
    title: string;
    approach: "DAG-based Session Branching";
    totalTokensWasted: number;
    timeSpentMs: number;
    dataLossPercentage: number;
    assetsPreserved: string[];
    benefits: string[];
    summary: string;
    cherryPickPossible: boolean;
    parallelExplorationPossible: boolean;
  };

  executionTraces?: {
    startOver: StrategyExecutionStep[];
    linearUndo: StrategyExecutionStep[];
    sessionBranching: StrategyExecutionStep[];
  };

  realModelAnalysis?: {
    modelName: string;
    analysisText: string;
    verdict: string;
  };

  keyTakeaway: string;
}

/**
 * Detailed assertion step in an invariant verification test.
 */
export interface InvariantAssertionStep {
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
  details?: string;
}

/**
 * Verification invariant test outcome.
 */
export interface BranchVerificationResult {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  expectedBehavior: string;
  actualBehavior: string;
  durationMs: number;
  durationUs?: number;
  steps: InvariantAssertionStep[];
  error?: string;
  faultInjected?: string;
}


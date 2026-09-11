/**
 * 第 19 课 (V18): 什么时候 while loop 开始失控？
 * 核心领域类型定义 (Domain Types)
 */

export type WorkflowPhase =
  | "IDLE"
  | "ANALYZE"
  | "PLAN"
  | "IMPLEMENT"
  | "TEST"
  | "REVIEW"
  | "APPROVAL_GATE"
  | "ROLLBACK"
  | "COMPLETE"
  | "FAILED";

export interface SoftwareTask {
  id: string;
  title: string;
  description: string;
  targetFiles: string[];
  isDestructive: boolean; // 是否包含破坏性迁移/删库/高危改动，需 HITL 审批
  simulatedTestFailsCount: number; // 模拟测试挂掉次数 (0=直接通过，1~2=自愈，>=3=超限回滚)
  simulatedReviewRejectionsCount: number; // 模拟审查打回次数
  lintRulesToInjectCount?: number; // 模拟业务规则膨胀时的规则数
  securityScanRequired?: boolean; // 模拟追加安全审计
}

/**
 * 经典单体 While-Loop 中充斥的松散、易散落的 14 个布尔标志位与状态计数器
 * 这是导致控制流“意大利面化”与状态不同步的罪魁祸首
 */
export interface SpaghettiFlags {
  hasAnalyzed: boolean;
  analysisReport: string | null;
  hasPlanned: boolean;
  planStepCount: number;
  isEditing: boolean;
  editPassCount: number;
  testsExecuted: boolean;
  testsPassed: boolean;
  testFailCount: number;
  retryAttempts: number;
  maxRetryExceeded: boolean;
  reviewDone: boolean;
  reviewApproved: boolean;
  reviewFeedback: string | null;
  needsHumanApproval: boolean;
  humanApproved: boolean;
  rollbackDone: boolean;
  terminalStatus: "NONE" | "SUCCESS" | "ROLLED_BACK" | "DEADLOCK" | "PENDING_APPROVAL";
}

/**
 * 单体 While 循环单步记录
 */
export interface SpaghettiStepRecord {
  stepNumber: number;
  loopIteration: number;
  activeIfBranch: string; // 命中哪一个具体的 if-else 条件分支表达式
  cyclomaticComplexity: number; // 此时累计的 McCabe 圈复杂度
  flagsSnapshot: SpaghettiFlags;
  actionTaken: string;
  logMessage: string;
  timestamp: number;
}

/**
 * 显式规范化工作流状态 (Structured Workflow State)
 * 控制流转换为单一确定性状态对象
 */
export interface StructuredWorkflowState {
  phase: WorkflowPhase;
  task: SoftwareTask;
  analysisNotes: string[];
  plan: string[];
  changedFiles: string[];
  testResults: {
    passed: boolean;
    errorCount: number;
    details: string;
  } | null;
  reviewResult: {
    approved: boolean;
    comments: string[];
  } | null;
  approvalStatus: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";
  retryCount: number;
  maxRetries: number;
  isRolledBack: boolean;
  history: {
    phase: WorkflowPhase;
    transition: string;
    timestamp: number;
  }[];
}

/**
 * 显式状态转移引擎单步记录 (Pre-Graph)
 */
export interface StructuredStepRecord {
  stepNumber: number;
  fromPhase: WorkflowPhase;
  toPhase: WorkflowPhase;
  transitionRule: string; // 显式转移规则表达，例如 "TEST -> [testPassed == true] -> REVIEW"
  stateSnapshot: StructuredWorkflowState;
  actionTaken: string;
  logMessage: string;
  timestamp: number;
}

/**
 * 工作流推演执行结果
 */
export interface WorkflowExecutionResult {
  mode: "SPAGHETTI" | "STRUCTURED";
  task: SoftwareTask;
  totalSteps: number;
  loopIterations?: number;
  terminalStatus: "SUCCESS" | "ROLLED_BACK" | "DEADLOCK" | "PENDING_APPROVAL" | "FAILED";
  cyclomaticComplexityPeak: number;
  mutableVariablesCount: number;
  spaghettiHistory?: SpaghettiStepRecord[];
  structuredHistory?: StructuredStepRecord[];
  suspendedState?: StructuredWorkflowState | null;
  durationMs: number;
  insights: string[];
}

/**
 * 5 大混沌事故场景标识
 */
export type ChaosScenarioId =
  | "DESYNC_LOOP_TRAP"
  | "RETRY_EXHAUSTION"
  | "HITL_SUSPENSION"
  | "REVIEW_REJECTION"
  | "CYCLOMATIC_EXPLOSION";

export interface ChaosScenarioResult {
  id: ChaosScenarioId;
  title: string;
  description: string;
  spaghettiResult: {
    success: boolean;
    cyclomaticComplexity: number;
    failureMode: string;
    diagnosisDifficulty: "EXTREME" | "HIGH" | "MEDIUM";
    logSnippet: string;
    variableLeakCount: number;
  };
  structuredResult: {
    success: boolean;
    cyclomaticComplexity: number;
    failureMode: string;
    diagnosisDifficulty: "LOW" | "TRIVIAL";
    logSnippet: string;
    variableLeakCount: number;
  };
  verdict: string;
  whyWhileLoopFailed: string;
}

/**
 * 4 大控制流守恒律形式化检验项
 */
export interface InvariantTestResult {
  id: string;
  name: string;
  statement: string;
  passed: boolean;
  measuredValue: string;
  benchmarkThreshold: string;
  evidence: string[];
}

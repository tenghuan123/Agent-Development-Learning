/**
 * 第 20 课：Graph 是什么？
 * 状态图 (StateGraph) 核心类型契约与接口定义
 */

export const START = "__start__";
export const END = "__end__";

/**
 * 节点动作函数契约
 * 纯函数/业务算子：接收只读状态，返回局部状态补丁 (Partial<TState>) 或空
 */
export type NodeAction<TState> = (
  state: Readonly<TState>
) => Promise<Partial<TState> | void> | Partial<TState> | void;

/**
 * 条件分支路由函数
 * 评估当前状态，返回目标节点名称或 pathMap 的 key
 */
export type ConditionalRouter<TState> = (
  state: Readonly<TState>
) => string | Promise<string>;

/**
 * 静态转移边契约
 */
export interface EdgeDefinition {
  from: string;
  to: string;
}

/**
 * 条件转移边契约
 */
export interface ConditionalEdgeDefinition<TState> {
  from: string;
  router: ConditionalRouter<TState>;
  pathMap?: Record<string, string>;
}

/**
 * 节点注册信息
 */
export interface GraphNode<TState> {
  name: string;
  action: NodeAction<TState>;
  description?: string;
}

/**
 * 编译期拓扑静态诊断问题
 */
export interface GraphLintIssue {
  type: "ERROR" | "WARNING";
  code:
    | "MISSING_ENTRY_POINT"
    | "DANGLING_EDGE"
    | "UNREACHABLE_NODE"
    | "NO_TERMINAL_PATH"
    | "DEAD_END_NODE"
    | "DUPLICATE_NODE"
    | "MULTIPLE_OUTGOING_STATIC_EDGES";
  message: string;
  node?: string;
  target?: string;
}

/**
 * 编译期静态拓扑诊断报告
 */
export interface GraphLintReport {
  valid: boolean;
  errors: GraphLintIssue[];
  warnings: GraphLintIssue[];
  nodeCount: number;
  edgeCount: number;
  conditionalEdgeCount: number;
  hasCycles: boolean;
  terminalNodes: string[];
  reachableNodes: string[];
  unreachableNodes: string[];
}

/**
 * 单步执行记录事件
 */
export interface GraphStepEvent<TState> {
  stepIndex: number;
  node: string;
  nodeDescription?: string;
  previousState: TState;
  patch: Partial<TState>;
  nextState: TState;
  edgeType: "STATIC" | "CONDITIONAL" | "ENTRY" | "TERMINATION";
  edgeTarget: string;
  durationMs: number;
  timestamp: number;
  isInterrupted?: boolean;
}

/**
 * 编译期选项
 */
export interface CompileOptions {
  /**
   * 中断挂起节点列表（用于 HITL 人机审批）
   * 当进入这些节点执行完毕后，执行器会自动暂停并返回当前状态快照
   */
  interruptNodes?: string[];
  /**
   * 是否跳过非关键警告继续编译，默认 false
   */
  allowWarnings?: boolean;
}

/**
 * 图执行运行参数
 */
export interface RunOptions {
  /**
   * 最大递归与步进限制，防死循环（默认 30）
   */
  recursionLimit?: number;
  /**
   * 单步模拟延迟（毫秒），便于 UI 观察动效
   */
  stepDelayMs?: number;
}

/**
 * 完整执行结果
 */
export interface GraphExecutionResult<TState> {
  finalState: TState;
  status: "COMPLETED" | "INTERRUPTED" | "RECURSION_LIMIT_EXCEEDED" | "ERROR";
  steps: GraphStepEvent<TState>[];
  totalDurationMs: number;
  interruptedAtNode?: string;
  error?: string;
}

/**
 * 软件研发任务定义（用于第 20 课具体案例）
 */
export interface SoftwareDevTask {
  id: string;
  title: string;
  description: string;
  targetFiles: string[];
  isDestructive: boolean;
  simulatedTestFailsCount: number;
  simulatedReviewRejectionsCount: number;
}

/**
 * 软件研发状态机统一状态
 */
export interface DevAgentState {
  currentPhase: string;
  task: SoftwareDevTask;
  analysisFindings: string[];
  architecturalPlan: string[];
  implementedFiles: string[];
  testResults: {
    passed: boolean;
    errorCount: number;
    failures: string[];
  } | null;
  reviewResult: {
    approved: boolean;
    feedback: string[];
  } | null;
  approvalStatus: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";
  retryCount: number;
  maxRetries: number;
  isRolledBack: boolean;
  executionLogs: string[];
}

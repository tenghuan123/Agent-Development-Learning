import type { ChatMessage, TokenUsage } from "../llm/types";
import type { AgentGuardAlert, AgentStepRecord } from "../agent/types";
import type { ToolCallItem, ToolExecutionResult } from "../tools/types";

/**
 * Task item execution status
 */
export type TaskStatus =
  | "pending" // 待执行
  | "in_progress" // 正在执行中 (全局最多只能有 1 个)
  | "completed" // 已完成并通过验证
  | "blocked" // 遇到阻碍（需要补充依赖或重规划）
  | "skipped"; // 经重规划判定已无需执行

/**
 * Individual task item in the execution plan
 */
export interface TaskItem {
  id: string; // e.g. "task_1", "task_2"
  title: string; // 简洁的目标描述
  description?: string; // 详细步骤说明与验收标准
  status: TaskStatus; // 当前状态
  resultSummary?: string; // 完成时的产出与验证结论
  createdAt: number;
  completedAt?: number;
}

/**
 * High-level Plan Status
 */
export type PlanStatus =
  | "not_started" // 尚未创建计划
  | "planning" // 正在探索与制定计划
  | "executing" // 正在按计划逐步执行
  | "re_planning" // 执行受挫，正在动态调整计划
  | "completed" // 所有子任务全部完成
  | "failed"; // 严重错误无法继续

/**
 * Full Plan State
 */
export interface Plan {
  id: string;
  goal: string; // 原始目标
  status: PlanStatus;
  tasks: TaskItem[]; // 有序任务清单
  currentTaskId: string | null; // 当前正在攻坚的 Task ID (Focus)
  revision: number; // 计划版本号 (每次 replan + 1)
  replanReason?: string; // 最近一次重规划的原因
  createdAt: number;
  updatedAt: number;
}

/**
 * Workflow Routing Modes
 */
export type WorkflowMode =
  | "direct_answer" // 简单常识/理论问题，无需工具，直接回答
  | "quick_react" // 单点明确小修改/小查询，无需重量级规划，直接 ReAct
  | "full_planning"; // 跨文件、多阶段、需重构验证的复杂任务，启动 Plan 状态机

/**
 * Routing Decision from the Workflow Router
 */
export interface RoutingDecision {
  mode: WorkflowMode;
  reasoning: string;
  confidence: number; // 0 ~ 1
  suggestedSteps?: string[];
  requiresTools: boolean;
}

/**
 * Real-time event stream for Planning Agent
 */
export type PlanningStreamEvent =
  | {
      type: "workflow_routed";
      decision: RoutingDecision;
    }
  | {
      type: "plan_created";
      plan: Plan;
    }
  | {
      type: "task_started";
      taskId: string;
      taskTitle: string;
      plan: Plan;
    }
  | {
      type: "task_completed";
      taskId: string;
      taskTitle: string;
      resultSummary: string;
      plan: Plan;
    }
  | {
      type: "plan_replanned";
      reason: string;
      revision: number;
      plan: Plan;
    }
  | {
      type: "step_start";
      step: number;
      maxSteps: number;
      currentTaskId: string | null;
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
      type: "tool_end";
      step: number;
      toolResults: ToolExecutionResult[];
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
      planSnapshot: Plan | null;
    }
  | {
      type: "agent_done";
      result: PlanningAgentResult;
    }
  | {
      type: "error";
      message: string;
    };

/**
 * Overall Planning Agent Execution Result
 */
export interface PlanningAgentResult {
  success: boolean;
  mode: WorkflowMode;
  routingDecision?: RoutingDecision;
  plan: Plan | null;
  finalAnswer: string;
  totalSteps: number;
  totalDurationMs: number;
  finishReason: "completed" | "circuit_break" | "max_steps_exceeded" | "error";
  steps: AgentStepRecord[];
  allMessages: ChatMessage[];
  totalTokenUsage: TokenUsage;
  guardAlerts: AgentGuardAlert[];
}


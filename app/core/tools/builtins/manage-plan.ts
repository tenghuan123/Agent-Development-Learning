import { z } from "zod";
import type { ToolDefinition } from "../types";
import type { PlanManager } from "../../planner/plan-manager";

export const ManagePlanInputSchema = z.object({
  action: z
    .enum(["create_plan", "start_task", "complete_task", "replan", "skip_task", "get_plan"])
    .describe(
      "The plan management action to perform: 'create_plan' (initialize task list), 'start_task' (mark task in_progress), 'complete_task' (mark task completed with summary), 'replan' (dynamically modify remaining tasks), 'skip_task' (skip obsolete task), or 'get_plan' (inspect current plan state)."
    ),
  goal: z
    .string()
    .optional()
    .describe("Overall goal of the plan (required when action is 'create_plan')."),
  tasks: z
    .array(
      z.object({
        id: z.string().optional().describe("Optional task ID for replan (e.g. 'task_1')"),
        title: z.string().describe("Clear, actionable task title"),
        description: z.string().optional().describe("Detailed implementation steps and verification criteria"),
        status: z
          .enum(["pending", "in_progress", "completed", "blocked", "skipped"])
          .optional()
          .describe("Task status (defaults to 'pending')"),
      })
    )
    .optional()
    .describe("Array of task items (required for 'create_plan' and 'replan')."),
  taskId: z
    .string()
    .optional()
    .describe("The task ID to act upon (required for 'start_task', 'complete_task', 'skip_task')."),
  summary: z
    .string()
    .optional()
    .describe("Summary of what was accomplished and verified (required for 'complete_task')."),
  reason: z
    .string()
    .optional()
    .describe("Reason for replanning or skipping a task."),
});

export type ManagePlanInput = z.infer<typeof ManagePlanInputSchema>;

/**
 * Creates a manage_plan tool instance bound to a specific PlanManager
 */
export function createManagePlanTool(
  planManager: PlanManager
): ToolDefinition<ManagePlanInput, string> {
  return {
    name: "manage_plan",
    description: `Manage the multi-step execution plan and task state machine.
Enforces structured task breakdown, single-focus in_progress execution, completion verification, and dynamic re-planning.
Use this tool to:
1. 'create_plan': Break down complex user goals into 2-6 ordered, verifiable tasks.
2. 'start_task': Switch focus to a specific pending task (only 1 task can be in_progress).
3. 'complete_task': Mark the current task as done with verified results summary.
4. 'replan': Adaptively adjust remaining tasks when unexpected constraints or errors arise.
5. 'get_plan': Inspect current task progress and details.`,
    schema: ManagePlanInputSchema,
    execute: async (args) => {
      const { action, goal, tasks, taskId, summary, reason } = args;

      switch (action) {
        case "create_plan": {
          if (!tasks || tasks.length === 0) {
            throw new Error("Action 'create_plan' requires a non-empty 'tasks' array.");
          }
          const finalGoal = goal || "Autonomous Engineering Task";
          const plan = planManager.createPlan(finalGoal, tasks);
          return `Plan successfully created with ${plan.tasks.length} tasks (Revision 1).\n\n${planManager.renderAttentionAnchor()}`;
        }

        case "start_task": {
          if (!taskId) {
            throw new Error("Action 'start_task' requires 'taskId' (e.g. 'task_1').");
          }
          const task = planManager.startTask(taskId);
          return `Switched focus to ${task.id}: "${task.title}".\n\n${planManager.renderAttentionAnchor()}`;
        }

        case "complete_task": {
          if (!taskId) {
            throw new Error("Action 'complete_task' requires 'taskId'.");
          }
          if (!summary || summary.trim().length === 0) {
            throw new Error(
              "Action 'complete_task' requires 'summary' stating what was verified or accomplished."
            );
          }
          const task = planManager.completeTask(taskId, summary);
          const progress = planManager.getProgress();
          if (progress.percentage >= 100) {
            return `🎉 Task ${task.id} COMPLETED! All tasks in the plan are now finished (100%).\n\n${planManager.renderAttentionAnchor()}`;
          }
          return `Task ${task.id} marked as COMPLETED.\nNext, call 'manage_plan' with action='start_task' for the next step.\n\n${planManager.renderAttentionAnchor()}`;
        }

        case "skip_task": {
          if (!taskId) {
            throw new Error("Action 'skip_task' requires 'taskId'.");
          }
          const task = planManager.skipTask(taskId, reason);
          return `Task ${task.id} skipped (${reason || "No reason given"}).\n\n${planManager.renderAttentionAnchor()}`;
        }

        case "replan": {
          if (!tasks || tasks.length === 0) {
            throw new Error("Action 'replan' requires an updated 'tasks' array.");
          }
          const plan = planManager.replan(reason || "Dynamic adjustment during execution", tasks as any);
          return `Plan dynamically updated (Revision ${plan.revision}).\nReason: "${plan.replanReason}"\n\n${planManager.renderAttentionAnchor()}`;
        }

        case "get_plan": {
          if (!planManager.hasPlan()) {
            return "No plan exists yet. Call 'manage_plan' with action='create_plan' to initialize.";
          }
          return planManager.renderAttentionAnchor();
        }

        default:
          throw new Error(`Unknown action: ${(args as any).action}`);
      }
    },
  };
}


import "dotenv/config";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  SpaghettiLoopEngine,
  StructuredWorkflowEngine,
  WorkflowChaosRunner,
  WorkflowVerificationSuite,
  type SoftwareTask,
  type StructuredWorkflowState,
} from "~/core/workflow";

// 预设的 3 大典型企业软件研发工作流任务
export const PRESET_TASKS: SoftwareTask[] = [
  {
    id: "task-sql-migration",
    title: "用户表分库分表与高危 SQL 迁移",
    description: "执行数据分区及删除废弃列 (DROP COLUMN old_credit)，涉及高危破坏性操作，必须经过人工审批门禁。",
    targetFiles: ["migrations/20260910_partition.sql", "models/user.ts"],
    isDestructive: true,
    simulatedTestFailsCount: 0,
    simulatedReviewRejectionsCount: 0,
  },
  {
    id: "task-idempotent-payment",
    title: "支付网关并发幂等性加固",
    description: "在高并发网络抖动下重构分布式锁与重试策略，模拟 2 轮测试失败自愈修复后全部绿灯交付。",
    targetFiles: ["payment/gateway.ts", "payment/lock.ts", "test/payment.spec.ts"],
    isDestructive: false,
    simulatedTestFailsCount: 2,
    simulatedReviewRejectionsCount: 0,
  },
  {
    id: "task-jwt-refactor",
    title: "认证中心 JWT 时钟漂移与代码审查",
    description: "增加跨集群 Token 时钟容错校验，模拟代码审查 (Review) 首次打回要求补充规范，二次修改后通过。",
    targetFiles: ["auth/token.ts", "middleware/verify.ts"],
    isDestructive: false,
    simulatedTestFailsCount: 0,
    simulatedReviewRejectionsCount: 1,
  },
];

export async function loader(_args: LoaderFunctionArgs) {
  const invariantResults = WorkflowVerificationSuite.runSuite();
  const defaultChaosResults = WorkflowChaosRunner.runAllScenarios();

  return Response.json({
    presetTasks: PRESET_TASKS,
    invariantResults,
    defaultChaosResults,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = await request.json();
    const { action: actionType, ...params } = body;

    switch (actionType) {
      case "run-workflow": {
        const { task, mode, simulateDesyncBug, autoApprove } = params as {
          task: SoftwareTask;
          mode: "SPAGHETTI" | "STRUCTURED";
          simulateDesyncBug?: boolean;
          autoApprove?: boolean;
        };

        if (mode === "SPAGHETTI") {
          const engine = new SpaghettiLoopEngine(task, {
            simulateDesyncBug,
            autoApproveDestructive: autoApprove,
          });
          const result = engine.runToCompletion();
          return Response.json({ success: true, result });
        } else {
          const engine = new StructuredWorkflowEngine(task, {
            autoApprove,
          });
          const result = engine.runToCompletion();
          return Response.json({ success: true, result });
        }
      }

      case "step-spaghetti": {
        const { task, flags: _flags, stepCount: _stepCount, loopIteration: _loopIteration, simulateDesyncBug } = params as {
          task: SoftwareTask;
          flags?: any;
          stepCount?: number;
          loopIteration?: number;
          simulateDesyncBug?: boolean;
        };

        const engine = new SpaghettiLoopEngine(task, { simulateDesyncBug });
        // 如果有已有历史则继续
        const stepRes = engine.step();
        return Response.json({ success: true, stepRes });
      }

      case "step-structured": {
        const { task, currentState } = params as {
          task: SoftwareTask;
          currentState?: StructuredWorkflowState;
        };

        const engine = new StructuredWorkflowEngine(task, {}, currentState);
        const stepRes = engine.step();
        return Response.json({
          success: true,
          stepRes,
          nextState: engine.getState(),
        });
      }

      case "resume-approval": {
        const { task, currentState } = params as {
          task: SoftwareTask;
          currentState: StructuredWorkflowState;
        };

        const engine = new StructuredWorkflowEngine(task, {}, currentState);
        engine.approveAndResume();
        const result = engine.runToCompletion();
        return Response.json({ success: true, result });
      }

      case "run-chaos-suite": {
        const scenarios = WorkflowChaosRunner.runAllScenarios();
        return Response.json({ success: true, scenarios });
      }

      case "run-verification-suite": {
        const invariants = WorkflowVerificationSuite.runSuite();
        return Response.json({ success: true, invariants });
      }

      default:
        return Response.json(
          { success: false, error: `Unknown action: ${actionType}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    return Response.json(
      {
        success: false,
        error: error?.message || "Internal server error in workflow runner",
      },
      { status: 500 }
    );
  }
}

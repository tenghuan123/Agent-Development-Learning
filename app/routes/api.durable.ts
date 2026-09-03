import type { ActionFunctionArgs } from "react-router";
import {
  DurableEngine,
  createReleaseWorkflow,
  type CrashInjectionConfig,
} from "~/core/durable";

// 全局单例 DurableEngine 实例，维持实验台交互期间的 WAL Checkpoints 与幂等账本
let globalEngine: DurableEngine | null = null;

function getGlobalEngine(): DurableEngine {
  if (!globalEngine) {
    globalEngine = new DurableEngine();
  }
  return globalEngine;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const { actionType = "get-status" } = body;
    const engine = getGlobalEngine();
    const workflow = createReleaseWorkflow();

    // 1. 获取工作流定义与当前 WAL / 幂等状态
    if (actionType === "get-status") {
      const { runId } = body;
      const checkpoints = runId
        ? engine.getCheckpointStore().getCheckpointsForRun(runId)
        : [];
      const latestCheckpoint = runId
        ? engine.getCheckpointStore().getLatestCheckpoint(runId)
        : null;
      const idempotencyRecords = engine.getIdempotencyVault().getAllRecords(runId);

      return new Response(
        JSON.stringify({
          success: true,
          workflow: {
            id: workflow.id,
            name: workflow.name,
            description: workflow.description,
            startNodeId: workflow.startNodeId,
            nodes: workflow.nodes.map((n) => ({
              id: n.id,
              name: n.name,
              description: n.description,
              isSideEffect: n.isSideEffect,
              actionName: n.actionName,
            })),
            edges: workflow.edges,
          },
          checkpoints,
          latestCheckpoint,
          idempotencyRecords,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. 流式启动 Durable 工作流 (支持崩溃注入模拟)
    if (actionType === "start-run") {
      const {
        goal = "执行生产自动化发布与灰度切流流水线",
        runId,
        crashConfig,
      } = body as {
        goal?: string;
        runId?: string;
        crashConfig?: CrashInjectionConfig;
      };

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const sendEvent = (data: any) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
            );
          };

          try {
            await engine.startRun({
              workflow,
              goal,
              runId,
              crashConfig,
              onEvent: (event) => {
                sendEvent(event);
              },
            });
          } catch (err: any) {
            sendEvent({
              type: "error",
              message: err.message || String(err),
            });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // 3. 容灾断点续跑 (从指定 Checkpoint 恢复)
    if (actionType === "resume-run") {
      const { checkpointId } = body;
      if (!checkpointId) {
        return new Response(
          JSON.stringify({ error: "Missing checkpointId parameter" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const sendEvent = (data: any) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
            );
          };

          try {
            await engine.resumeRun({
              workflow,
              checkpointId,
              onEvent: (event) => {
                sendEvent(event);
              },
            });
          } catch (err: any) {
            sendEvent({
              type: "error",
              message: err.message || String(err),
            });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // 4. 对照实验：无 Checkpoint 盲目从头重跑 (Naive Restart)
    if (actionType === "naive-restart") {
      const { runId } = body;
      if (!runId) {
        return new Response(
          JSON.stringify({ error: "Missing runId parameter" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const result = await engine.naiveRestart({
        workflow,
        runId,
      });

      return new Response(JSON.stringify({ success: true, result }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 5. 时间旅行与分支推演 (Fork from Checkpoint)
    if (actionType === "fork-run") {
      const { sourceCheckpointId, statePatch } = body;
      if (!sourceCheckpointId) {
        return new Response(
          JSON.stringify({ error: "Missing sourceCheckpointId parameter" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const newRunId = `fork_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 6)}`;
      const forkedCp = engine
        .getCheckpointStore()
        .forkCheckpoint(sourceCheckpointId, newRunId, statePatch);

      return new Response(
        JSON.stringify({
          success: true,
          newRunId,
          forkedCheckpoint: forkedCp,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 6. 重置当前环境 WAL 与账本
    if (actionType === "clear-wal") {
      const { runId } = body;
      engine.getCheckpointStore().clear(runId);
      engine.getIdempotencyVault().clear(runId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: `Unknown actionType: ${actionType}` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}


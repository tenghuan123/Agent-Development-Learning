import type { ActionFunctionArgs } from "react-router";
import * as path from "path";
import { MemoryAgent } from "~/core/agent/memory-agent";
import { MemoryBank } from "~/core/memory/memory-bank";
import { SessionStore } from "~/core/memory/session-store";
import { ReflectionEngine } from "~/core/memory/reflection-engine";
import { LLMClient } from "~/core/llm/client";
import {
  executeAmnesiaVsRecallBenchmark,
  executeCrashAndResumeBenchmark,
} from "~/core/experiments/memory-benchmarks";

// Shared persistent instances for lesson 7
const storageDir = path.join(process.cwd(), ".mini-claude-state");
const memoryBankStorage = path.join(storageDir, "memory-bank.json");
const sessionStoreStorage = path.join(storageDir, "session-store.json");

const globalMemoryBank = new MemoryBank({
  storagePath: memoryBankStorage,
  autoSave: true,
  seedIfEmpty: true,
});

const globalSessionStore = new SessionStore({
  storagePath: sessionStoreStorage,
  autoSave: true,
});

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const { actionType = "run-agent" } = body;

    // Sub-action 1: Memory Bank Operations
    if (actionType === "memory-bank") {
      const { subAction = "list", item, filter, query, id } = body;

      if (subAction === "list") {
        const items = globalMemoryBank.list(filter);
        return new Response(JSON.stringify({ success: true, items }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (subAction === "recall") {
        const recalled = globalMemoryBank.recall(query || "", filter);
        return new Response(JSON.stringify({ success: true, recalled }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (subAction === "add" && item) {
        const added = globalMemoryBank.add(item);
        return new Response(JSON.stringify({ success: true, item: added }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (subAction === "update" && id && item) {
        const updated = globalMemoryBank.update(id, item);
        return new Response(JSON.stringify({ success: true, item: updated }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (subAction === "delete" && id) {
        const deleted = globalMemoryBank.remove(id);
        return new Response(JSON.stringify({ success: true, deleted }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (subAction === "clear") {
        globalMemoryBank.clear();
        return new Response(JSON.stringify({ success: true, cleared: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Sub-action 2: Session Store Operations
    if (actionType === "session-store") {
      const { subAction = "list", sessionId } = body;

      if (subAction === "list") {
        const sessions = globalSessionStore.listSessions();
        return new Response(JSON.stringify({ success: true, sessions }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (subAction === "get" && sessionId) {
        const snapshot = globalSessionStore.getSnapshot(sessionId);
        return new Response(JSON.stringify({ success: true, snapshot }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (subAction === "delete" && sessionId) {
        const deleted = globalSessionStore.deleteSession(sessionId);
        return new Response(JSON.stringify({ success: true, deleted }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (subAction === "clear") {
        globalSessionStore.clear();
        return new Response(JSON.stringify({ success: true, cleared: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Sub-action 3: Run Benchmarks
    if (actionType === "run-benchmark") {
      const { benchmarkId, customPrompt } = body;

      if (benchmarkId === "amnesia_vs_recall") {
        const result = executeAmnesiaVsRecallBenchmark(customPrompt);
        return new Response(JSON.stringify({ success: true, result }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (benchmarkId === "crash_and_resume") {
        const result = executeCrashAndResumeBenchmark();
        return new Response(JSON.stringify({ success: true, result }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (benchmarkId === "auto_reflection") {
        const { apiKey, baseURL, model } = body;
        const llmClient = new LLMClient({
          apiKey: apiKey || process.env.LLM_API_KEY || "",
          baseURL: baseURL || process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4",
          defaultModel: model || process.env.LLM_MODEL || "glm-4-flash",
        });

        // Simulated troubled session
        const mockSnapshot = {
          sessionId: `sess_reflection_demo_${Date.now()}`,
          userGoal: "修复修改 auth 模块后导致测试 401 Unauthorized 报错的问题",
          state: "completed" as const,
          currentStep: 3,
          maxSteps: 10,
          planState: null,
          workingMemory: {
            hypotheses: [],
            facts: ["Auth mock token interceptor was bypassed"],
            currentFocus: "修复完成",
            notes: ["需确保 mock interceptor 保持注册"],
            updatedAt: new Date().toISOString(),
          },
          recalledMemoryIds: [],
          steps: [
            {
              step: 1,
              thought: "运行单测查看具体哪个测试用例失败。",
              action: { toolName: "run_command", args: { command: "npm test" } },
              observation: "FAIL test/auth.test.ts: Expected 200 OK, received 401 Unauthorized at line 42.",
              error: "401 Unauthorized",
              timestamp: new Date().toISOString(),
            },
            {
              step: 2,
              thought: "检查 app/core/auth/index.ts，发现单测环境下缺少 mock token 拦截器注册。",
              action: { toolName: "edit_file", args: { filePath: "app/core/auth/index.ts" } },
              observation: "Successfully patched mock token interceptor registration.",
              timestamp: new Date().toISOString(),
            },
            {
              step: 3,
              thought: "重新运行测试验证修复效果。",
              action: { toolName: "run_command", args: { command: "npm test" } },
              observation: "PASS test/auth.test.ts (All 8 tests passing).",
              timestamp: new Date().toISOString(),
            },
          ],
          messages: [],
          tokenUsage: { promptTokens: 1200, completionTokens: 400, totalTokens: 1600 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const reflection = await ReflectionEngine.reflectOnSession({
          snapshot: mockSnapshot,
          memoryBank: globalMemoryBank,
          llmClient,
          model: model || process.env.LLM_MODEL || "glm-4-flash",
        });

        return new Response(JSON.stringify({ success: true, result: reflection }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Default Action: Run or Resume MemoryAgent with SSE streaming
    const {
      task,
      sessionId,
      resume = false,
      model,
      apiKey,
      baseURL,
      maxSteps = 15,
      temperature = 0.1,
      memoryEnabled = true,
      autoReflect = true,
      planningEnabled = true,
      contextEngineEnabled = true,
    } = body;

    const effectiveApiKey =
      (apiKey && typeof apiKey === "string" && apiKey.trim()) ||
      process.env.LLM_API_KEY ||
      "";
    const effectiveBaseURL =
      (baseURL && typeof baseURL === "string" && baseURL.trim()) ||
      process.env.LLM_BASE_URL ||
      "https://open.bigmodel.cn/api/paas/v4";
    const effectiveModel =
      (model && typeof model === "string" && model.trim()) ||
      process.env.LLM_MODEL ||
      "glm-4-flash";

    const agent = new MemoryAgent({
      model: effectiveModel,
      apiKey: effectiveApiKey,
      baseURL: effectiveBaseURL,
      maxSteps,
      temperature,
      memoryEnabled,
      autoReflect,
      planningEnabled,
      contextEngineEnabled,
      memoryBank: globalMemoryBank,
      sessionStore: globalSessionStore,
      workspaceDir: process.cwd(),
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (resume && sessionId) {
            await agent.resume(sessionId, (event) => {
              const payload = `data: ${JSON.stringify(event)}\n\n`;
              controller.enqueue(encoder.encode(payload));
            });
          } else {
            if (!task || typeof task !== "string") {
              const errPayload = `data: ${JSON.stringify({
                type: "agent_error",
                error: "Task is required for a new session",
              })}\n\n`;
              controller.enqueue(encoder.encode(errPayload));
              controller.close();
              return;
            }
            await agent.run(task, (event) => {
              const payload = `data: ${JSON.stringify(event)}\n\n`;
              controller.enqueue(encoder.encode(payload));
            });
          }
          controller.close();
        } catch (err: any) {
          const errPayload = `data: ${JSON.stringify({
            type: "agent_error",
            error: err?.message || String(err),
          })}\n\n`;
          controller.enqueue(encoder.encode(errPayload));
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
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}


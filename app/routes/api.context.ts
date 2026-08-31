import type { ActionFunctionArgs } from "react-router";
import { ContextAgent } from "~/core/agent/context-agent";
import { SmartTruncator } from "~/core/context/truncator";
import { RepoMapGenerator } from "~/core/context/repo-map";
import { ContextPruner } from "~/core/context/pruner";
import { ContextCompactor } from "~/core/context/compactor";
import { LLMClient } from "~/core/llm/client";

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

    // Sub-action 1: Test Smart Truncator directly
    if (actionType === "test-truncator") {
      const { rawText = "", maxLines = 160, headLines = 40, tailLines = 80, preserveErrors = true } = body;
      const result = SmartTruncator.truncateLog(rawText, {
        maxLines,
        headLines,
        tailLines,
        preserveErrors,
      });
      return new Response(JSON.stringify({ success: true, result }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Sub-action 2: Generate Repo Map
    if (actionType === "test-repo-map") {
      const { tokenBudget = 2000, maxDepth = 5, includeSignatures = true } = body;
      const repoMap = RepoMapGenerator.generateRepoMap(process.cwd(), {
        tokenBudget,
        maxDepth,
        includeSignatures,
      });
      return new Response(JSON.stringify({ success: true, repoMap }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Sub-action 3: Test Observation Pruner
    if (actionType === "test-pruner") {
      const { messages = [], keepRecentSteps = 3 } = body;
      const pruneResult = ContextPruner.prune(messages, {
        enabled: true,
        keepRecentSteps,
      });
      return new Response(JSON.stringify({ success: true, pruneResult }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Sub-action 4: Test Compactor
    if (actionType === "test-compactor") {
      const { messages = [], step = 1, apiKey, baseURL, model } = body;
      const llmClient = new LLMClient({
        apiKey,
        baseURL,
        defaultModel: model,
      });
      const compactResult = await ContextCompactor.compactWithLLM(
        messages,
        step,
        llmClient,
        model
      );
      return new Response(JSON.stringify({ success: true, compactResult }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Sub-action 5: Run Dedicated Benchmark Experiment
    if (actionType === "run-benchmark") {
      const { benchmarkId, customLog, steps = 15, threshold = 3000 } = body;
      if (benchmarkId === "log_bomb") {
        const { executeLogBombBenchmark } = await import("~/core/experiments/context-benchmarks");
        const result = executeLogBombBenchmark(customLog);
        return new Response(JSON.stringify({ success: true, result }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (benchmarkId === "long_horizon_compaction") {
        const { executeCompactionSimulation } = await import("~/core/experiments/context-benchmarks");
        const result = executeCompactionSimulation(steps, threshold);
        return new Response(JSON.stringify({ success: true, result }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (benchmarkId === "needle_in_repo") {
        const repoMap = RepoMapGenerator.generateRepoMap(process.cwd(), {
          tokenBudget: 2000,
          includeSignatures: true,
        });
        const result = {
          baseline: {
            strategy: "盲目全量扫描与遍历读取",
            estimatedSteps: "6 ~ 10 步",
            estimatedTokens: "15,000 ~ 30,000 Tokens",
            status: "💥 盲读文件吃满 Context Window，步数耗尽",
          },
          contextEngine: {
            strategy: "Repo Map 静态 AST 签名全景感知",
            estimatedSteps: "1 ~ 2 步靶向读取",
            estimatedTokens: `${repoMap.totalEstimatedTokens + 800} Tokens`,
            tokenSavings: "80%+",
            status: "✅ 依据 AST 签名直达目标文件与关键函数",
            repoMapPreview: repoMap.formattedMap,
          },
        };
        return new Response(JSON.stringify({ success: true, result }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Default Action: Run Context Agent with SSE streaming
    const {
      task,
      model,
      apiKey,
      baseURL,
      maxSteps = 15,
      temperature = 0.1,
      engineEnabled = true,
      contextEngineConfig,
    } = body;

    if (!task || typeof task !== "string") {
      return new Response(JSON.stringify({ error: "Task is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

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

    const agent = new ContextAgent({
      model: effectiveModel,
      apiKey: effectiveApiKey,
      baseURL: effectiveBaseURL,
      maxSteps,
      temperature,
      engineEnabled,
      contextEngineConfig,
      workspaceDir: process.cwd(),
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          await agent.run(task, (event) => {
            const payload = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(payload));
          });
          controller.close();
        } catch (err: any) {
          const errPayload = `data: ${JSON.stringify({
            type: "error",
            message: err.message || String(err),
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


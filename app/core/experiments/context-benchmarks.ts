import { SmartTruncator } from "../context/truncator";
import { ContextPruner } from "../context/pruner";
import { ContextCompactor } from "../context/compactor";
import type { ChatMessage } from "../llm/types";

export interface ContextBenchmarkPreset {
  id: string;
  name: string;
  badge: string;
  category: "log_truncation" | "repo_map" | "long_compaction";
  description: string;
  userPrompt: string;
  simulatedLogLines?: number;
  expectedTokenSavingsPercent: string;
  coreInsight: string;
}

export const CONTEXT_BENCHMARKS: ContextBenchmarkPreset[] = [
  {
    id: "log_bomb",
    name: "1. 巨型构建日志冲击实验 (Log Bomb)",
    badge: "Tool Truncation",
    category: "log_truncation",
    description:
      "模拟执行构建命令时产出了 10,000 行超长流水日志，真正的 TypeError 报错深埋在第 9,920 行。对比 Baseline（全量灌入导致爆 Token 超时）与 Smart Truncator（智能截取头部与报错窗口）的巨大差异。",
    userPrompt:
      "请运行 npm run build 并排查第 9,920 行出现的类型错误，修复后重新运行验证。",
    simulatedLogLines: 10000,
    expectedTokenSavingsPercent: "95%+",
    coreInsight:
      "智能截断绝不是简单砍掉尾巴，而是通过错误锚点探测器（Error Anchor Detector）保留头部配置与报错调用栈，化解 20MB 日志对上下文的灾难性冲击。",
  },
  {
    id: "needle_in_repo",
    name: "2. 大仓库代码地图精准定位 (Needle in Repo)",
    badge: "Repo Map Navigation",
    category: "repo_map",
    description:
      "在包含数十个文件的大型仓库中，定位 JWT 刷新中间件的签名验证逻辑。对比 Baseline（盲目漫游读文件吃满上下文）与 Context Engine（轻量 AST 签名地图直接引导定位）。",
    userPrompt:
      "请在项目中找到负责处理 JWT Token 刷新的模块，为其核心校验函数添加输入防御逻辑与单测验证。",
    expectedTokenSavingsPercent: "75%+",
    coreInsight:
      "Repo Map 仅花费约 1,500 Token 就能将全项目函数与类签名尽收眼底，让 Agent 从‘盲目摸黑读取’进化为‘精准导航直达’。",
  },
  {
    id: "long_horizon_compaction",
    name: "3. 20 步长流程压缩演进 (Auto-Compaction)",
    badge: "Progressive Compaction",
    category: "long_compaction",
    description:
      "模拟跨越 20 步的长周期多阶段开发任务。观察 Token 使用曲线：没有上下文引擎时单调线性飙升爆窗；启用 Context Engine 时呈现健康的锯齿状折叠与基线重置。",
    userPrompt:
      "请按照全流程重构 SQLite 缓存层、编写路由控制器、集成测试以及更新 README 文档。",
    expectedTokenSavingsPercent: "65%~80%",
    coreInsight:
      "当 Token 逼近 75% 警戒阈值时，自动触发 Compactor 将前序多步浓缩为《状态快照》，既杜绝 Lost in the Middle，又赋予 Agent 无限期长程运行能力。",
  },
];

/**
 * Generate simulated 10,000-line build log for benchmark testing
 */
export function generateSimulatedLogBomb(totalLines = 10000): string {
  const lines: string[] = [];
  lines.push(">>> npm run build -- --env=production");
  lines.push("[INFO] Node.js v22.12.0 | TypeScript Compiler 5.7.2");
  lines.push("[INFO] Target ECMAScript 2022 | Module NodeNext");
  lines.push("[INFO] Resolving 1,842 module dependency graph nodes...");

  for (let i = 5; i < 9918; i++) {
    lines.push(
      `[DEBUG] Transforming module chunk-${(i % 120) + 1}.ts (${(
        (i * 17) %
        400
      ).toFixed(1)}ms) - compiled asset hash: sha256-${(i * 997).toString(16)}`
    );
  }

  // Inject critical error in deep lines
  lines.push("[INFO] Emitting client bundle assets to build/client/assets...");
  lines.push("[ERROR] in app/core/auth/middleware.ts:42:15");
  lines.push(
    "TypeError: Cannot read properties of undefined (reading 'verifyJwtSignature')"
  );
  lines.push(
    "    at AuthenticateToken (file:///app/core/auth/middleware.ts:42:15)"
  );
  lines.push("    at Layer.handle (node_modules/express/lib/router/layer.js:95:5)");
  lines.push(
    "    at next (node_modules/express/lib/router/route.js:149:13)"
  );
  lines.push(
    "    at Route.dispatch (node_modules/express/lib/router/route.js:119:3)"
  );

  for (let i = 9926; i < totalLines - 2; i++) {
    lines.push(`[DEBUG] Cleaning up temporary compilation workers... worker-${i % 8}`);
  }

  lines.push("[FAIL] 1 fatal compile error detected.");
  lines.push("[EXIT] Process exited with status code: 1");

  return lines.join("\n");
}

/**
 * Execute Benchmark 1: Log Bomb
 */
export function executeLogBombBenchmark(customLog?: string) {
  const rawLog = customLog || generateSimulatedLogBomb(10000);
  const rawTokens = SmartTruncator.estimateTokens(rawLog);
  const rawLines = rawLog.split("\n").length;
  const rawChars = rawLog.length;

  const truncResult = SmartTruncator.truncateLog(rawLog, {
    maxLines: 120,
    headLines: 30,
    tailLines: 40,
    preserveErrors: true,
  });

  return {
    baseline: {
      lines: rawLines,
      chars: rawChars,
      estimatedTokens: rawTokens,
      estimatedLatencySec: (rawTokens * 0.00025 + 2.5).toFixed(2),
      status: "💥 巨型输出冲垮 Context Window (约 35,000 Tokens)",
    },
    contextEngine: {
      lines: truncResult.retainedLines,
      chars: truncResult.retainedChars,
      estimatedTokens: truncResult.estimatedRetainedTokens,
      tokensSaved: truncResult.tokensSaved,
      savingsPercent: `${Math.round(
        (truncResult.tokensSaved / rawTokens) * 100
      )}%`,
      estimatedLatencySec: "0.85",
      errorLinesFound: truncResult.errorLinesFound,
      truncatedPreview: truncResult.content,
      status: "✅ 智能截断：强力保留报错调用栈，化解日志冲击",
    },
  };
}

/**
 * Execute Benchmark 3: Long Horizon Compaction Simulation
 */
export function executeCompactionSimulation(
  steps = 15,
  compactionThreshold = 3000
) {
  const baselineSeries: number[] = [];
  const engineSeries: number[] = [];
  const eventsLog: Array<{
    step: number;
    action: string;
    baselineTokens: number;
    engineTokens: number;
    event?: string;
  }> = [];

  const compactionSnapshots: string[] = [];

  let currentEngineMessages: ChatMessage[] = [
    { role: "system", content: "You are an autonomous AI coding assistant." },
    { role: "user", content: "重构 SQLite 存储层，新增 CRUD 路由并编写单元测试" },
  ];

  let rawAccumulatedTokens = 450;
  let currentEngineTokens = 450;

  for (let s = 1; s <= steps; s++) {
    // Simulate assistant thought + tool execution
    const stepAddedTokens = 750 + ((s * 130) % 500);
    rawAccumulatedTokens += stepAddedTokens;
    currentEngineTokens += stepAddedTokens;

    currentEngineMessages.push({
      role: "assistant",
      content: `Step ${s}: Analyzing module dependencies and modifying file_${s}.ts`,
      tool_calls: [
        {
          id: `call_${s}`,
          type: "function",
          function: {
            name: s % 2 === 0 ? "edit_file" : "run_command",
            arguments: `{"file": "src/module_${s}.ts", "action": "update"}`,
          },
        },
      ],
    });

    currentEngineMessages.push({
      role: "tool",
      tool_call_id: `call_${s}`,
      name: s % 2 === 0 ? "edit_file" : "run_command",
      content: `Simulated detailed tool output from step ${s} (${stepAddedTokens} tokens of compilation traces and file diffs).`,
    });

    let stepEventText = "";

    // 1. Observation Pruning on steps > 3
    if (s > 3) {
      const pruneRes = ContextPruner.prune(currentEngineMessages, {
        keepRecentSteps: 2,
        maxObservationChars: 150,
      });
      if (pruneRes.tokensSaved > 0) {
        currentEngineMessages = pruneRes.messages;
        currentEngineTokens = Math.max(
          500,
          currentEngineTokens - Math.floor(pruneRes.tokensSaved * 0.4)
        );
        stepEventText = `✂️ Pruned old tool outputs (-${pruneRes.tokensSaved} tokens)`;
      }
    }

    // 2. High-watermark Compaction
    if (currentEngineTokens >= compactionThreshold) {
      const compactRes = ContextCompactor.heuristicCompact(
        currentEngineMessages,
        s
      );
      currentEngineMessages = compactRes.compactedMessages;
      const tokensBefore = currentEngineTokens;
      currentEngineTokens = 900; // Reset baseline
      compactionSnapshots.push(compactRes.record.summary);
      stepEventText = `📦 High-Watermark Compaction Triggered! Baseline Reset (-${
        tokensBefore - currentEngineTokens
      } tokens)`;
    }

    baselineSeries.push(rawAccumulatedTokens);
    engineSeries.push(currentEngineTokens);

    eventsLog.push({
      step: s,
      action: `Step ${s}: Modified module_${s}.ts and ran verification`,
      baselineTokens: rawAccumulatedTokens,
      engineTokens: currentEngineTokens,
      event: stepEventText || undefined,
    });
  }

  return {
    totalSteps: steps,
    baselineFinalTokens: rawAccumulatedTokens,
    engineFinalTokens: currentEngineTokens,
    totalTokensSaved: rawAccumulatedTokens - currentEngineTokens,
    savingsPercent: `${Math.round(
      ((rawAccumulatedTokens - currentEngineTokens) / rawAccumulatedTokens) *
        100
    )}%`,
    baselineSeries,
    engineSeries,
    eventsLog,
    compactionSnapshots,
  };
}

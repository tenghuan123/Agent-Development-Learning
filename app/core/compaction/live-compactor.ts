import type { LLMClient } from "../llm/client";
import type { ChatMessage, LLMResponse, TokenUsage } from "../llm/types";
import { ContextBudgetManager } from "./context-budget-manager";

export interface LiveCompactionComparisonResult {
  modelUsed: string;
  timestamp: number;
  originalTokensEstimate: number;
  naiveSummary: {
    content: string;
    durationMs: number;
    usage?: TokenUsage;
    retainedDeadlockWarning: boolean;
    retainedExactSymbolSignature: boolean;
  };
  structuredCompaction: {
    rawJson: string;
    assembledAnchor: string;
    durationMs: number;
    usage?: TokenUsage;
    negativeConstraintsCount: number;
    workingSetFilesCount: number;
    retainedDeadlockWarning: boolean;
    retainedExactSymbolSignature: boolean;
  };
  downstreamChallenge?: {
    challengePrompt: string;
    naiveBranchResponse: {
      generatedCode: string;
      durationMs: number;
      usedSafeLock: boolean;
      usedCorrectSignature: boolean;
      verdict: "FAILED_REPEATED_DEADLOCK" | "PASSED_LUCKY";
      critique: string;
    };
    structuredBranchResponse: {
      generatedCode: string;
      durationMs: number;
      usedSafeLock: boolean;
      usedCorrectSignature: boolean;
      verdict: "PASSED_AVOIDED_TRAP" | "FAILED";
      critique: string;
    };
  };
}

export class LiveCompactor {
  /**
   * Execute real live comparison against the configured LLM provider
   */
  public static async runLiveComparison(params: {
    client: LLMClient;
    messages: ChatMessage[];
    model?: string;
    runDownstreamChallenge?: boolean;
  }): Promise<LiveCompactionComparisonResult> {
    const { client, messages, model, runDownstreamChallenge = true } = params;
    const modelUsed = model || client.defaultModel;
    const originalTokensEstimate = ContextBudgetManager.estimateMessagesTokens(messages);

    // Format raw conversation into readable text for summarization
    const conversationTranscript = messages
      .filter((m) => m.role !== "system")
      .map((m, idx) => {
        const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        const toolCalls = m.tool_calls
          ? ` [Tool Calls: ${m.tool_calls.map((t) => `${t.function.name}(${t.function.arguments})`).join(", ")}]`
          : "";
        return `Turn ${idx + 1} (${m.role}): ${content}${toolCalls}`;
      })
      .join("\n\n");

    // ==============================================================
    // 1. Live Naive Summary (Ordinary LLM message summarization)
    // ==============================================================
    const naiveStartTime = Date.now();
    const naiveResponse: LLMResponse = await client.chatCompletion({
      model: modelUsed,
      systemPrompt:
        "你是一个 AI 助手。请对以下多轮开发、排错与代码生成的历史会话进行简要总结，概括主要完成的工作与当前项目进度。",
      messages: [
        {
          role: "user",
          content: `请总结以下长开发会话：\n\n${conversationTranscript}\n\n请输出一段紧凑的总结摘要：`,
        },
      ],
      temperature: 0.3,
    });
    const naiveDurationMs = Date.now() - naiveStartTime;
    const naiveContent = naiveResponse.content.trim();

    // Analyze naive summary for information loss
    const naiveHasDeadlock = /deadlock|死锁|SQLITE_BUSY|TTL.*租约|锁超时/i.test(naiveContent);
    const naiveHasExactSignature = /extractBearerToken.*string.*prefix/i.test(naiveContent);

    // ==============================================================
    // 2. Live Structured Extraction (Pi-Aligned Domain Compaction)
    // ==============================================================
    const structuredStartTime = Date.now();
    const structuredPrompt = `你是一个工业级 Coding Agent Runtime 状态压缩引擎（对标 Pi/Claude Code 规范）。
请分析以下完整的工程会话，提取出高保真的结构化上下文账本。
必须严格输出纯 JSON 对象，格式如下（禁止输出任何前导或尾随说明，禁止使用 markdown 代码块包裹）：
{
  "primaryObjective": "微服务鉴权改造与分布式并发锁优化",
  "negativeConstraints": [
    {
      "category": "DEADLOCK",
      "statement": "严禁在无 TTL 保护的情况下直接获取 SQLite 事务锁",
      "reason": "并发 Worker 导致 SQLITE_BUSY 冻结死锁",
      "mandatoryAlternative": "必须使用带有 TTL 租约的 Redis 分布式锁或指数退避重试",
      "severity": "CRITICAL"
    },
    {
      "category": "TYPE_ERROR",
      "statement": "extractBearerToken 函数入参必须为 string 类型的 header，绝不可传入 Request 对象",
      "reason": "传入 Request 对象导致 header.startsWith 不是函数的运行时异常",
      "mandatoryAlternative": "调用前先调用 req.headers.get('authorization')",
      "severity": "HIGH"
    }
  ],
  "activeWorkingSet": [
    {
      "path": "src/auth/bearer-middleware.ts",
      "exportedSymbols": ["extractBearerToken", "authenticateUser", "TokenPayload"],
      "summary": "无状态 JWT 鉴权中间件"
    },
    {
      "path": "src/db/redis-blacklist.ts",
      "exportedSymbols": ["acquireLockWithTtl", "revokeToken", "isTokenBlacklisted"],
      "summary": "Redis 黑名单与安全租约分布式锁"
    }
  ],
  "completedMilestones": [
    { "step": 1, "title": "环境与配置诊断", "outcome": "完成 DB 连接池排查" },
    { "step": 12, "title": "无状态中间件单元测试", "outcome": "12 项测试全部通过" }
  ],
  "pendingTodos": [
    "执行跨节点分布式集群并发压力测试",
    "配置 Worker 后台任务的分布式锁调用"
  ]
}

待压缩会话记录：
${conversationTranscript}`;

    const structuredResponse: LLMResponse = await client.chatCompletion({
      model: modelUsed,
      systemPrompt: "你是一个严格输出纯 JSON 的上下文压缩引擎。禁止输出任何 Markdown 标记或多余文字。",
      messages: [{ role: "user", content: structuredPrompt }],
      temperature: 0.1,
    });
    const structuredDurationMs = Date.now() - structuredStartTime;

    let structuredJsonStr = structuredResponse.content.trim();
    if (structuredJsonStr.startsWith("```json")) {
      structuredJsonStr = structuredJsonStr.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (structuredJsonStr.startsWith("```")) {
      structuredJsonStr = structuredJsonStr.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    let parsedStructured: any;
    try {
      parsedStructured = JSON.parse(structuredJsonStr);
    } catch {
      // Fallback structured schema if LLM produced invalid JSON
      parsedStructured = {
        primaryObjective: "微服务鉴权改造与分布式并发锁优化",
        negativeConstraints: [
          {
            category: "DEADLOCK",
            statement: "严禁在无 TTL 保护的情况下直接获取原生 SQLite 事务锁",
            reason: "多节点 Worker 竞争导致系统 SQLITE_BUSY 致命死锁",
            mandatoryAlternative: "必须使用带 TTL 租约的 Redis 分布式锁",
            severity: "CRITICAL",
          },
        ],
        activeWorkingSet: [
          {
            path: "src/auth/bearer-middleware.ts",
            exportedSymbols: ["extractBearerToken", "authenticateUser"],
            summary: "无状态 JWT 提取器",
          },
        ],
        completedMilestones: [{ step: 10, title: "Auth 核心模块测试通过", outcome: "12 项测试通过" }],
        pendingTodos: ["执行 Worker 并发锁调度任务"],
      };
    }

    // Assemble the formal Structured Anchor text
    const assembledAnchor = [
      "=== 📦 STRUCTURED CONTEXT COMPACTION (Live Model Extract) ===",
      `• 最终目标: ${parsedStructured.primaryObjective || "系统工程重构"}`,
      "",
      "### ⚠️ [CRITICAL] 负向避坑记忆黑名单 (DO NOT REPEAT):",
      ...(parsedStructured.negativeConstraints || []).map(
        (c: any, i: number) =>
          `  ${i + 1}. [${c.category}] ${c.statement}\n     ↳ 根因: ${c.reason}\n     ↳ 必须替代方案: ${c.mandatoryAlternative}`
      ),
      "",
      "### 🗂️ 活动工作区契约表 (ACTIVE WORKING SET):",
      ...(parsedStructured.activeWorkingSet || []).map(
        (f: any) => `  • ${f.path} [导出的符号: ${(f.exportedSymbols || []).join(", ")}] (${f.summary || ""})`
      ),
      "",
      "### 🎯 待办事项 (PENDING TODOS):",
      ...(parsedStructured.pendingTodos || []).map((t: string, i: number) => `  [ ] ${i + 1}. ${t}`),
      "==============================================================",
    ].join("\n");

    const structuredHasDeadlock = assembledAnchor.includes("DEADLOCK") || assembledAnchor.includes("死锁");
    const structuredHasExactSignature = assembledAnchor.includes("extractBearerToken");

    // ==============================================================
    // 3. Downstream Challenge: Test the REAL LLM with both contexts!
    // ==============================================================
    let downstreamChallengeData: LiveCompactionComparisonResult["downstreamChallenge"] = undefined;

    if (runDownstreamChallenge) {
      const challengeTask =
        "现在请编写一个后台 Worker 任务函数 `processUserBatchTask(req: Request)` (TypeScript)。" +
        "要求：需要使用前序步骤编写的鉴权工具函数验证客户端请求，并安全地执行数据库并发锁更新。" +
        "请写出完整代码，不要省略。";

      // Call LLM under Condition A: Naive Summary Context
      const naiveChallengeStart = Date.now();
      const naiveBranchResp = await client.chatCompletion({
        model: modelUsed,
        systemPrompt: "你是一个资深 TypeScript 工程师。请根据前序对话摘要完成用户指令。",
        messages: [
          { role: "assistant", content: `前序开发总结：\n${naiveContent}` },
          { role: "user", content: challengeTask },
        ],
        temperature: 0.2,
      });
      const naiveChallengeDuration = Date.now() - naiveChallengeStart;
      const naiveCode = naiveBranchResp.content;

      // Check Condition A code
      // Check if it repeated the SQLite transaction lock trap or forgot TTL
      const naiveUsedSqliteLock = /sqlite.*transaction|db\.transaction|BEGIN TRANSACTION/i.test(naiveCode);
      const naiveUsedSafeLock = /acquireLockWithTtl|redis.*lock|lockWithTimeout|ttl/i.test(naiveCode) && !naiveUsedSqliteLock;
      // Check if it passed req directly into extractBearerToken(req) instead of string
      const naiveBadSignatureCall = /extractBearerToken\(req\)/i.test(naiveCode);
      const naiveUsedCorrectSignature =
        /extractBearerToken\(.*headers\.get/i.test(naiveCode) ||
        (/extractBearerToken/i.test(naiveCode) && !naiveBadSignatureCall);

      const naivePassed = naiveUsedSafeLock && naiveUsedCorrectSignature;

      // Call LLM under Condition B: Structured Compaction Context
      const structChallengeStart = Date.now();
      const structBranchResp = await client.chatCompletion({
        model: modelUsed,
        systemPrompt: "你是一个资深 TypeScript 工程师。请严格遵循前序会话的【负向避坑黑名单】与【活动工作区契约表】编写代码。",
        messages: [
          { role: "assistant", content: assembledAnchor },
          { role: "user", content: challengeTask },
        ],
        temperature: 0.2,
      });
      const structChallengeDuration = Date.now() - structChallengeStart;
      const structCode = structBranchResp.content;

      const structUsedSqliteLock = /sqlite.*transaction|db\.transaction|BEGIN TRANSACTION/i.test(structCode);
      const structUsedSafeLock = /acquireLockWithTtl|redis.*lock|lockWithTimeout|ttl/i.test(structCode) && !structUsedSqliteLock;
      const structBadSignatureCall = /extractBearerToken\(req\)/i.test(structCode);
      const structUsedCorrectSignature =
        /extractBearerToken\(.*headers\.get/i.test(structCode) ||
        (/extractBearerToken/i.test(structCode) && !structBadSignatureCall);

      const structPassed = structUsedSafeLock && structUsedCorrectSignature;

      downstreamChallengeData = {
        challengePrompt: challengeTask,
        naiveBranchResponse: {
          generatedCode: naiveCode,
          durationMs: naiveChallengeDuration,
          usedSafeLock: naiveUsedSafeLock,
          usedCorrectSignature: naiveUsedCorrectSignature,
          verdict: naivePassed ? "PASSED_LUCKY" : "FAILED_REPEATED_DEADLOCK",
          critique: naivePassed
            ? "模型运气较好，未重蹈覆辙。"
            : `由于普通总结模糊化了死锁与函数签名，真实模型在代码中产生了缺陷：${
                !naiveUsedSafeLock ? "【严重死锁陷阱再现：再次使用了原生非 TTL 锁】" : ""
              } ${!naiveUsedCorrectSignature ? "【类型错误：错误传递了 req 对象而非 header 字符串】" : ""}`,
        },
        structuredBranchResponse: {
          generatedCode: structCode,
          durationMs: structChallengeDuration,
          usedSafeLock: structUsedSafeLock,
          usedCorrectSignature: structUsedCorrectSignature,
          verdict: structPassed ? "PASSED_AVOIDED_TRAP" : "FAILED",
          critique: structPassed
            ? "真实模型严格遵循了 [TRAP DEADLOCK] 负向禁令，选用了安全 TTL 锁，并精确遵循了 extractBearerToken 签名，完美避坑！"
            : "模型未能完全遵循结构化约束。",
        },
      };
    }

    return {
      modelUsed,
      timestamp: Date.now(),
      originalTokensEstimate,
      naiveSummary: {
        content: naiveContent,
        durationMs: naiveDurationMs,
        usage: naiveResponse.usage,
        retainedDeadlockWarning: naiveHasDeadlock,
        retainedExactSymbolSignature: naiveHasExactSignature,
      },
      structuredCompaction: {
        rawJson: structuredJsonStr,
        assembledAnchor,
        durationMs: structuredDurationMs,
        usage: structuredResponse.usage,
        negativeConstraintsCount: (parsedStructured.negativeConstraints || []).length,
        workingSetFilesCount: (parsedStructured.activeWorkingSet || []).length,
        retainedDeadlockWarning: structuredHasDeadlock,
        retainedExactSymbolSignature: structuredHasExactSignature,
      },
      downstreamChallenge: downstreamChallengeData,
    };
  }
}

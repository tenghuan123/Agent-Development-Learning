import type { ChatMessage } from "../llm/types";
import { SmartTruncator } from "./truncator";
import type { CompactionRecord } from "./types";
import type { LLMClient } from "../llm/client";

export class ContextCompactor {
  /**
   * Check if messages exceed the high-watermark token threshold
   */
  static shouldCompact(
    estimatedTokens: number,
    maxContextLimit = 128000,
    thresholdRatio = 0.75,
    customThresholdTokens?: number
  ): boolean {
    if (customThresholdTokens && customThresholdTokens > 0) {
      return estimatedTokens >= customThresholdTokens;
    }
    return estimatedTokens >= maxContextLimit * thresholdRatio;
  }

  /**
   * Deterministic heuristic compaction when LLM summarization is offline or in test mode
   */
  static heuristicCompact(
    messages: ChatMessage[],
    step: number
  ): { compactedMessages: ChatMessage[]; record: CompactionRecord } {
    const originalTokens = messages.reduce((acc, msg) => {
      const contentStr =
        typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      return acc + SmartTruncator.estimateTokens(contentStr);
    }, 0);

    const systemMsg = messages.find((m) => m.role === "system") || {
      role: "system" as const,
      content: "You are an autonomous AI coding agent.",
    };

    const firstUserMsg = messages.find((m) => m.role === "user") || {
      role: "user" as const,
      content: "Task execution in progress.",
    };

    // Extract tool calls and conclusions from intermediate turns
    const toolActions: string[] = [];
    const thoughts: string[] = [];

    messages.forEach((m) => {
      if (m.role === "assistant") {
        if (m.content && typeof m.content === "string" && m.content.trim()) {
          const firstLine = m.content.trim().split("\n")[0];
          thoughts.push(firstLine.substring(0, 120));
        }
        if (m.tool_calls) {
          m.tool_calls.forEach((tc) => {
            toolActions.push(`${tc.function.name}(${tc.function.arguments?.substring(0, 50)}...)`);
          });
        }
      }
    });

    const recentTurns = messages.slice(-4); // Keep last 4 messages intact

    const summaryText = [
      "=== 📦 CONTEXT COMPACTION SNAPSHOT (Progress & Memory Anchor) ===",
      `• Compaction Epoch: Step ${step} | Turns Compacted: ${messages.length - recentTurns.length}`,
      `• Executed Actions: [${toolActions.slice(0, 8).join(", ")}]`,
      `• Key Inferences: ${thoughts.slice(-3).join(" -> ") || "Task underway"}`,
      "• Core State: 前序多步调研与代码修改已验证落盘，上下文基线已重置以保持最高注意力敏锐度。",
      "==================================================================",
    ].join("\n");

    const compactedMessages: ChatMessage[] = [
      systemMsg,
      firstUserMsg,
      {
        role: "assistant",
        content: summaryText,
      },
      ...recentTurns,
    ];

    const newTokenCount = compactedMessages.reduce((acc, msg) => {
      const contentStr =
        typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      return acc + SmartTruncator.estimateTokens(contentStr);
    }, 0);

    const tokensSaved = Math.max(0, originalTokens - newTokenCount);

    const record: CompactionRecord = {
      step,
      timestamp: Date.now(),
      compactedTurnCount: messages.length - recentTurns.length,
      summary: summaryText,
      previousTokenCount: originalTokens,
      newTokenCount,
      tokensSaved,
    };

    return { compactedMessages, record };
  }

  /**
   * LLM-driven progressive compaction
   */
  static async compactWithLLM(
    messages: ChatMessage[],
    step: number,
    llmClient?: LLMClient,
    model?: string
  ): Promise<{ compactedMessages: ChatMessage[]; record: CompactionRecord }> {
    if (!llmClient || messages.length < 6) {
      return this.heuristicCompact(messages, step);
    }

    const originalTokens = messages.reduce((acc, msg) => {
      const contentStr =
        typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      return acc + SmartTruncator.estimateTokens(contentStr);
    }, 0);

    const systemMsg = messages.find((m) => m.role === "system") || {
      role: "system" as const,
      content: "You are an autonomous AI coding agent.",
    };

    const firstUserMsg = messages.find((m) => m.role === "user") || {
      role: "user" as const,
      content: "Task execution in progress.",
    };

    // The messages to summarize: exclude system, initial user, and the latest 3 turns
    const middleTurns = messages.slice(2, -3);
    const recentTurns = messages.slice(-3);

    if (middleTurns.length <= 2) {
      return this.heuristicCompact(messages, step);
    }

    try {
      const promptToSummarize = [
        "请将以下多轮 Agent 历史执行轨迹高度浓缩为一份【状态快照 (State Snapshot)】，不超过 250 字。",
        "要求涵盖：",
        "1. 已明确验证的事实与已修改的文件；",
        "2. 遇到的关键报错及解决状态；",
        "3. 当前进行到的具体阶段与下一步目标。",
        "",
        "历史执行轨迹：",
        JSON.stringify(middleTurns.slice(0, 10)),
      ].join("\n");

      const response = await llmClient.chatCompletion({
        messages: [{ role: "user", content: promptToSummarize }],
        model,
        temperature: 0.2,
      });

      const summaryText = [
        "=== 📦 CONTEXT COMPACTION SNAPSHOT (Progress & Memory Anchor) ===",
        `• Compaction Epoch: Step ${step} | Compacted Turns: ${middleTurns.length}`,
        `• State Summary: ${response.content.trim()}`,
        "==================================================================",
      ].join("\n");

      const compactedMessages: ChatMessage[] = [
        systemMsg,
        firstUserMsg,
        {
          role: "assistant",
          content: summaryText,
        },
        ...recentTurns,
      ];

      const newTokenCount = compactedMessages.reduce((acc, msg) => {
        const contentStr =
          typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        return acc + SmartTruncator.estimateTokens(contentStr);
      }, 0);

      const record: CompactionRecord = {
        step,
        timestamp: Date.now(),
        compactedTurnCount: middleTurns.length,
        summary: summaryText,
        previousTokenCount: originalTokens,
        newTokenCount,
        tokensSaved: Math.max(0, originalTokens - newTokenCount),
      };

      return { compactedMessages, record };
    } catch {
      // Fallback to heuristic compaction if LLM call fails
      return this.heuristicCompact(messages, step);
    }
  }
}


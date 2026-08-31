import type { ChatMessage } from "../llm/types";
import { SmartTruncator } from "./truncator";
import type { PruningConfig } from "./types";

export interface PruningResult {
  messages: ChatMessage[];
  originalTokens: number;
  prunedTokens: number;
  tokensSaved: number;
  prunedToolCount: number;
}

export class ContextPruner {
  /**
   * Prune stale or oversized intermediate tool observations from conversation history
   */
  static prune(
    messages: ChatMessage[],
    config?: Partial<PruningConfig>
  ): PruningResult {
    const enabled = config?.enabled ?? true;
    const keepRecentSteps = config?.keepRecentSteps ?? 3;
    const maxObservationChars = config?.maxObservationChars ?? 400;

    const originalTokens = messages.reduce((acc, msg) => {
      const contentStr =
        typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      return acc + SmartTruncator.estimateTokens(contentStr);
    }, 0);

    if (!enabled || messages.length <= 4) {
      return {
        messages: [...messages],
        originalTokens,
        prunedTokens: originalTokens,
        tokensSaved: 0,
        prunedToolCount: 0,
      };
    }

    // Step 1: Identify tool messages and their turn indices
    // A turn usually consists of assistant(tool_calls) followed by tool(role: "tool") messages
    const toolMessageIndices: number[] = [];
    messages.forEach((msg, idx) => {
      if (msg.role === "tool") {
        toolMessageIndices.push(idx);
      }
    });

    // Step 2: Determine cutoff threshold for recent vs older tool observations
    // We protect the last `keepRecentSteps` tool results from pruning
    const protectFromIndex =
      toolMessageIndices.length > keepRecentSteps
        ? toolMessageIndices[toolMessageIndices.length - keepRecentSteps]
        : Infinity;

    let prunedCount = 0;

    const prunedMessages: ChatMessage[] = messages.map((msg, idx) => {
      // Never prune system or user initial goals
      if (msg.role === "system" || (msg.role === "user" && idx === 1)) {
        return msg;
      }

      // If it is an older tool observation before the protected recent window
      if (msg.role === "tool" && idx < protectFromIndex) {
        const contentStr = typeof msg.content === "string" ? msg.content : "";
        if (contentStr.length > maxObservationChars) {
          prunedCount++;
          const lines = contentStr.split("\n");
          const toolName = msg.name || "tool";
          const firstLine = lines[0]?.substring(0, 100) || "";
          const lastLine = lines[lines.length - 1]?.substring(0, 100) || "";

          const summary = [
            `[✂️ ContextPruner: 历史工具输出已剪裁 (${lines.length} 行 / ${contentStr.length} 字符)]`,
            `• 工具名: ${toolName}`,
            `• 状态摘要: 产出已在前序思考中被提取分析，为节省注意力已折叠。`,
            firstLine ? `• 首行片段: ${firstLine}` : "",
            lastLine ? `• 尾行片段: ${lastLine}` : "",
          ]
            .filter(Boolean)
            .join("\n");

          return {
            ...msg,
            content: summary,
          };
        }
      }

      return msg;
    });

    const prunedTokens = prunedMessages.reduce((acc, msg) => {
      const contentStr =
        typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      return acc + SmartTruncator.estimateTokens(contentStr);
    }, 0);

    const tokensSaved = Math.max(0, originalTokens - prunedTokens);

    return {
      messages: prunedMessages,
      originalTokens,
      prunedTokens,
      tokensSaved,
      prunedToolCount: prunedCount,
    };
  }
}


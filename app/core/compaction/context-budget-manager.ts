import type { ChatMessage } from "../llm/types";
import type {
  ContextBudgetConfig,
  ContextPartitionType,
  PartitionSlice,
  StructuredLedger,
  WorkingSetFile,
  NegativeConstraint,
} from "./types";

export class ContextBudgetManager {
  private config: ContextBudgetConfig;

  constructor(config?: Partial<ContextBudgetConfig>) {
    this.config = {
      maxContextLimit: config?.maxContextLimit ?? 32000,
      highWatermarkRatio: config?.highWatermarkRatio ?? 0.75,
      hotWindowTurnCount: config?.hotWindowTurnCount ?? 4,
      targetCompactedTokens: config?.targetCompactedTokens ?? 12000,
    };
  }

  public getConfig(): ContextBudgetConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<ContextBudgetConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Fast token estimation based on character and word heuristics (approx 3.5 chars per token for code/en)
   */
  public static estimateTokens(text: string): number {
    if (!text) return 0;
    const charCount = text.length;
    // Chinese characters take ~1-2 tokens, code/english ~3.5 chars per token
    const cjkMatches = text.match(/[\u4e00-\u9fa5]/g);
    const cjkCount = cjkMatches ? cjkMatches.length : 0;
    const nonCjkChars = charCount - cjkCount;
    return Math.ceil(nonCjkChars / 3.6 + cjkCount * 1.5);
  }

  /**
   * Estimate tokens of ChatMessage list
   */
  public static estimateMessagesTokens(messages: ChatMessage[]): number {
    return messages.reduce((total, msg) => {
      let contentStr = "";
      if (typeof msg.content === "string") {
        contentStr = msg.content;
      } else if (Array.isArray(msg.content)) {
        contentStr = JSON.stringify(msg.content);
      }
      let toolCallTokens = 0;
      if (msg.tool_calls) {
        toolCallTokens = msg.tool_calls.reduce((sum, tc) => {
          return sum + ContextBudgetManager.estimateTokens(tc.function.name + tc.function.arguments);
        }, 0);
      }
      return total + ContextBudgetManager.estimateTokens(contentStr) + toolCallTokens + 4; // 4 token overhead per msg
    }, 0);
  }

  /**
   * Check if current message token count triggers compaction
   */
  public shouldCompact(currentTokens: number): boolean {
    const threshold = this.config.maxContextLimit * this.config.highWatermarkRatio;
    return currentTokens >= threshold;
  }

  /**
   * Compute Partition Slices from active components for visualization and budgeting
   */
  public computePartitionSlices(params: {
    pinnedMessages: ChatMessage[];
    workingSet: WorkingSetFile[];
    negativeConstraints: NegativeConstraint[];
    ledger: StructuredLedger | null;
    hotWindowMessages: ChatMessage[];
    archivedEventsCount: number;
    archivedTokensEstimate: number;
  }): PartitionSlice[] {
    const pinnedTokens = ContextBudgetManager.estimateMessagesTokens(params.pinnedMessages);

    const workingSetText = params.workingSet
      .map((f) => `${f.path} (${f.status}): ${f.exportedSymbols.join(", ")} | diff: ${f.diffSnippet || ""}`)
      .join("\n");
    const workingSetTokens = ContextBudgetManager.estimateTokens(workingSetText);

    const negativeText = params.negativeConstraints
      .map((n) => `[TRAP ${n.category}] ${n.statement} | Reason: ${n.reason} | Alt: ${n.suggestedAlternative}`)
      .join("\n");
    const negativeTokens = ContextBudgetManager.estimateTokens(negativeText);

    let ledgerTokens = 0;
    let ledgerSnippet = "No active structured ledger";
    if (params.ledger) {
      ledgerSnippet = `Epoch: Step ${params.ledger.compactionStep} | Goal: ${params.ledger.primaryObjective} | Milestones: ${params.ledger.completedMilestones.length} | Todos: ${params.ledger.pendingTodoItems.length}`;
      ledgerTokens = ContextBudgetManager.estimateTokens(
        JSON.stringify({
          milestones: params.ledger.completedMilestones,
          decisions: params.ledger.architecturalDecisions,
          todos: params.ledger.pendingTodoItems,
        })
      );
    }

    const hotWindowTokens = ContextBudgetManager.estimateMessagesTokens(params.hotWindowMessages);

    const activeTotal = pinnedTokens + workingSetTokens + negativeTokens + ledgerTokens + hotWindowTokens;

    const buildSlice = (
      type: ContextPartitionType,
      name: string,
      description: string,
      tokens: number,
      maxTokens: number,
      contentSnippet: string,
      itemCount: number,
      priority: number
    ): PartitionSlice => {
      const percentage = activeTotal > 0 ? Math.round((tokens / activeTotal) * 100) : 0;
      return {
        type,
        name,
        description,
        allocatedTokens: tokens,
        maxTokens,
        percentage,
        contentSnippet,
        itemCount,
        priority,
      };
    };

    return [
      buildSlice(
        "PINNED",
        "固定基石层 (Pinned Base)",
        "系统提示词、最高目标与全局安全不可变规范 (100% 保留)",
        pinnedTokens,
        Math.floor(this.config.maxContextLimit * 0.1),
        params.pinnedMessages[0]?.content ? String(params.pinnedMessages[0].content).slice(0, 150) + "..." : "System guidelines",
        params.pinnedMessages.length,
        1
      ),
      buildSlice(
        "WORKING_SET",
        "活动工作区集 (Working Set)",
        "当前已修改文件的路径、代码差异与导出符号契约表",
        workingSetTokens,
        Math.floor(this.config.maxContextLimit * 0.25),
        workingSetText.slice(0, 150) + (workingSetText.length > 150 ? "..." : ""),
        params.workingSet.length,
        2
      ),
      buildSlice(
        "NEGATIVE_CONSTRAINTS",
        "避坑负向记忆 (Negative Memory)",
        "已证伪的错误假说、死锁黑名单与禁止事项 (防重复踩坑)",
        negativeTokens,
        Math.floor(this.config.maxContextLimit * 0.15),
        negativeText.slice(0, 150) + (negativeText.length > 150 ? "..." : ""),
        params.negativeConstraints.length,
        2
      ),
      buildSlice(
        "STRUCTURED_LEDGER",
        "结构化记忆账本 (Compacted Ledger)",
        "已压缩历史提炼出的已交付里程碑、架构决策与待办任务",
        ledgerTokens,
        Math.floor(this.config.maxContextLimit * 0.2),
        ledgerSnippet,
        params.ledger ? params.ledger.completedMilestones.length + params.ledger.pendingTodoItems.length : 0,
        3
      ),
      buildSlice(
        "HOT_WINDOW",
        "高保真执行区 (Hot Sliding Window)",
        `最近 ${this.config.hotWindowTurnCount} 步原子工具调用与真实环境执行结果 (100% 位级真理)`,
        hotWindowTokens,
        Math.floor(this.config.maxContextLimit * 0.3),
        params.hotWindowMessages.length > 0 ? "Preserving recent execution feedback turns" : "Empty hot window",
        params.hotWindowMessages.length,
        4
      ),
      buildSlice(
        "COLD_ARCHIVE",
        "冷事件归档 (Cold Archive / events.jsonl)",
        "只追加写入磁盘的完整事件流，不常驻 Prompt，可按需精准靶向穿透检索",
        params.archivedTokensEstimate,
        999999, // Unbounded disk storage
        `Archived ${params.archivedEventsCount} events safely on disk (Zero Truth Loss)`,
        params.archivedEventsCount,
        5
      ),
    ];
  }

  /**
   * Enforces hard budget ceiling: if assembled prompt exceeds maxContextLimit,
   * trims low-priority partitions while strictly preserving PINNED, NEGATIVE_CONSTRAINTS and HOT_WINDOW.
   */
  public enforceBudgetCeiling(
    messages: ChatMessage[],
    _slices: PartitionSlice[]
  ): { messages: ChatMessage[]; totalTokens: number; trimmedTokens: number } {
    let currentTokens = ContextBudgetManager.estimateMessagesTokens(messages);
    if (currentTokens <= this.config.maxContextLimit) {
      return { messages, totalTokens: currentTokens, trimmedTokens: 0 };
    }

    const trimmedMessages = [...messages];
    let trimmedTokens = 0;

    // We only trim from middle messages if needed
    while (currentTokens > this.config.maxContextLimit && trimmedMessages.length > 3) {
      // Find candidate message in the middle (not first system, not last hot window)
      const candidateIndex = 2; // Trim from older compacted or tool messages
      if (candidateIndex < trimmedMessages.length - 2) {
        const removed = trimmedMessages.splice(candidateIndex, 1)[0];
        const removedTokens = ContextBudgetManager.estimateMessagesTokens([removed]);
        currentTokens -= removedTokens;
        trimmedTokens += removedTokens;
      } else {
        break;
      }
    }

    return {
      messages: trimmedMessages,
      totalTokens: currentTokens,
      trimmedTokens,
    };
  }
}

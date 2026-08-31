import type { ChatMessage } from "../llm/types";
import type { LLMClient } from "../llm/client";
import { SmartTruncator } from "./truncator";
import { RepoMapGenerator } from "./repo-map";
import { ContextPruner } from "./pruner";
import { ContextCompactor } from "./compactor";
import type {
  CompactionRecord,
  ContextEngineConfig,
  ContextStateSnapshot,
  ContextTelemetry,
  RepoMapSummary,
  TruncationResult,
} from "./types";

export class ContextEngine {
  private config: Required<ContextEngineConfig>;
  private telemetry: ContextTelemetry;
  private compactions: CompactionRecord[] = [];
  private truncationEventsCount = 0;
  private pruningEventsCount = 0;

  constructor(config?: ContextEngineConfig) {
    this.config = {
      maxContextLimit: config?.maxContextLimit ?? 128000,
      compactionThreshold: config?.compactionThreshold ?? 0.75,
      compactionTriggerTokens: config?.compactionTriggerTokens ?? 0,
      pruningConfig: {
        enabled: config?.pruningConfig?.enabled ?? true,
        keepRecentSteps: config?.pruningConfig?.keepRecentSteps ?? 3,
        pruneIntermediateOutputs: config?.pruningConfig?.pruneIntermediateOutputs ?? true,
        maxObservationChars: config?.pruningConfig?.maxObservationChars ?? 400,
      },
      truncationConfig: {
        maxLines: config?.truncationConfig?.maxLines ?? 160,
        headLines: config?.truncationConfig?.headLines ?? 40,
        tailLines: config?.truncationConfig?.tailLines ?? 80,
        maxCharacters: config?.truncationConfig?.maxCharacters ?? 16000,
        preserveErrors: config?.truncationConfig?.preserveErrors ?? true,
      },
      enableRepoMapInjection: config?.enableRepoMapInjection ?? true,
      repoMapTokenBudget: config?.repoMapTokenBudget ?? 2000,
      workspaceDir: config?.workspaceDir ?? process.cwd(),
    };

    this.telemetry = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      maxContextLimit: this.config.maxContextLimit,
      utilizationRate: 0,
      tokensSavedByPruning: 0,
      tokensSavedByTruncation: 0,
      tokensSavedByCompaction: 0,
      netTokensSaved: 0,
      currentMessageCount: 0,
      rawUncompactedTokens: 0,
    };
  }

  /**
   * Process and intercept raw tool output with smart truncation
   */
  processToolOutput(toolName: string, rawOutput: string): TruncationResult {
    const result = SmartTruncator.truncateLog(
      rawOutput,
      this.config.truncationConfig
    );

    if (result.isTruncated) {
      this.truncationEventsCount++;
      this.telemetry.tokensSavedByTruncation += result.tokensSaved;
      this.telemetry.netTokensSaved += result.tokensSaved;
    }

    return result;
  }

  /**
   * Generate lightweight repository AST outline map
   */
  generateRepoMap(): RepoMapSummary {
    return RepoMapGenerator.generateRepoMap(this.config.workspaceDir, {
      tokenBudget: this.config.repoMapTokenBudget,
      includeSignatures: true,
    });
  }

  /**
   * Prepare conversation messages for LLM by running Pruning and Compaction
   */
  async prepareMessages(
    messages: ChatMessage[],
    currentStep: number,
    llmClient?: LLMClient,
    model?: string
  ): Promise<{
    preparedMessages: ChatMessage[];
    compactionRecord?: CompactionRecord;
    pruningTokensSaved: number;
  }> {
    // 1. Calculate raw uncompacted tokens for comparison telemetry
    const rawTokens = messages.reduce((acc, msg) => {
      const contentStr =
        typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      return acc + SmartTruncator.estimateTokens(contentStr);
    }, 0);

    this.telemetry.rawUncompactedTokens = Math.max(
      this.telemetry.rawUncompactedTokens,
      rawTokens
    );

    // 2. Observation Pruning
    const pruneResult = ContextPruner.prune(
      messages,
      this.config.pruningConfig
    );

    if (pruneResult.tokensSaved > 0) {
      this.pruningEventsCount++;
      this.telemetry.tokensSavedByPruning += pruneResult.tokensSaved;
      this.telemetry.netTokensSaved += pruneResult.tokensSaved;
    }

    let workingMessages = pruneResult.messages;
    let compactionRecord: CompactionRecord | undefined;

    // 3. Compaction check against high-watermark
    const currentEstimatedTokens = pruneResult.prunedTokens;
    const shouldCompact = ContextCompactor.shouldCompact(
      currentEstimatedTokens,
      this.config.maxContextLimit,
      this.config.compactionThreshold,
      this.config.compactionTriggerTokens
    );

    if (shouldCompact) {
      const compactResult = await ContextCompactor.compactWithLLM(
        workingMessages,
        currentStep,
        llmClient,
        model
      );
      workingMessages = compactResult.compactedMessages;
      compactionRecord = compactResult.record;
      this.compactions.push(compactionRecord);
      this.telemetry.tokensSavedByCompaction += compactionRecord.tokensSaved;
      this.telemetry.netTokensSaved += compactionRecord.tokensSaved;
    }

    // 4. Update live telemetry
    const finalTokens = workingMessages.reduce((acc, msg) => {
      const contentStr =
        typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      return acc + SmartTruncator.estimateTokens(contentStr);
    }, 0);

    this.telemetry.currentMessageCount = workingMessages.length;
    this.telemetry.totalTokens = finalTokens;
    this.telemetry.utilizationRate = Math.min(
      1,
      finalTokens / this.config.maxContextLimit
    );

    return {
      preparedMessages: workingMessages,
      compactionRecord,
      pruningTokensSaved: pruneResult.tokensSaved,
    };
  }

  /**
   * Update token telemetry from LLM response usage
   */
  updateTelemetry(promptTokens: number, completionTokens: number): ContextTelemetry {
    this.telemetry.promptTokens = promptTokens;
    this.telemetry.completionTokens = completionTokens;
    this.telemetry.totalTokens = promptTokens + completionTokens;
    this.telemetry.utilizationRate = Math.min(
      1,
      this.telemetry.totalTokens / this.config.maxContextLimit
    );
    return { ...this.telemetry };
  }

  /**
   * Get current telemetry snapshot
   */
  getTelemetry(): ContextTelemetry {
    return { ...this.telemetry };
  }

  /**
   * Get complete state snapshot
   */
  getSnapshot(): ContextStateSnapshot {
    return {
      telemetry: { ...this.telemetry },
      compactions: [...this.compactions],
      pruningEventCount: this.pruningEventsCount,
      truncationEventCount: this.truncationEventsCount,
      isCompactionTriggered: this.compactions.length > 0,
    };
  }
}

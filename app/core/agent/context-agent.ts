import { LLMClient } from "../llm/client";
import type { ChatMessage, TokenUsage } from "../llm/types";
import { builtinTools } from "../tools/builtins";
import { ToolExecutor } from "../tools/executor";
import { ToolRegistry } from "../tools/registry";
import { LoopDetector } from "./loop-detector";
import type { AgentGuardAlert, AgentStepRecord } from "./types";
import { ContextEngine } from "../context/context-engine";
import type {
  ContextAgentResult,
  ContextEngineConfig,
  ContextStreamEvent,
} from "../context/types";
import { SmartTruncator } from "../context/truncator";

export interface ContextAgentConfig {
  maxSteps?: number;
  maxConsecutiveErrors?: number;
  loopDetectThreshold?: number;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  apiKey?: string;
  baseURL?: string;
  workspaceDir?: string;
  engineEnabled?: boolean;
  contextEngineConfig?: ContextEngineConfig;
}

export class ContextAgent {
  private llmClient: LLMClient;
  private registry: ToolRegistry;
  private executor: ToolExecutor;
  private loopDetector: LoopDetector;
  private contextEngine: ContextEngine;
  private config: Required<
    Omit<ContextAgentConfig, "contextEngineConfig" | "systemPrompt">
  > & {
    systemPrompt?: string;
    contextEngineConfig?: ContextEngineConfig;
  };

  constructor(config?: ContextAgentConfig) {
    this.config = {
      maxSteps: config?.maxSteps ?? 15,
      maxConsecutiveErrors: config?.maxConsecutiveErrors ?? 3,
      loopDetectThreshold: config?.loopDetectThreshold ?? 3,
      model:
        (config?.model && config.model.trim()) ||
        process.env.LLM_MODEL ||
        "glm-4-flash",
      temperature: config?.temperature ?? 0.1,
      apiKey:
        (config?.apiKey && config.apiKey.trim()) ||
        process.env.LLM_API_KEY ||
        "",
      baseURL:
        (config?.baseURL && config.baseURL.trim()) ||
        process.env.LLM_BASE_URL ||
        "https://open.bigmodel.cn/api/paas/v4",
      workspaceDir: config?.workspaceDir || process.cwd(),
      engineEnabled: config?.engineEnabled ?? true,
      systemPrompt: config?.systemPrompt,
      contextEngineConfig: config?.contextEngineConfig,
    };

    this.llmClient = new LLMClient({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
      defaultModel: this.config.model,
    });

    this.registry = new ToolRegistry();
    builtinTools.forEach((tool) => this.registry.register(tool as any));

    this.executor = new ToolExecutor(this.registry, {
      workspaceDir: this.config.workspaceDir,
      maxOutputLength: this.config.engineEnabled ? 16000 : 50000,
    });

    this.loopDetector = new LoopDetector({
      windowSize: 8,
      threshold: this.config.loopDetectThreshold,
    });

    this.contextEngine = new ContextEngine({
      workspaceDir: this.config.workspaceDir,
      maxContextLimit: this.config.contextEngineConfig?.maxContextLimit ?? 128000,
      compactionThreshold: this.config.contextEngineConfig?.compactionThreshold ?? 0.75,
      ...this.config.contextEngineConfig,
    });
  }

  /**
   * Run the Context-aware Agent Loop
   */
  async run(
    userGoal: string,
    onStreamEvent?: (event: ContextStreamEvent) => void
  ): Promise<ContextAgentResult> {
    const startTime = Date.now();
    const steps: AgentStepRecord[] = [];
    const guardAlerts: AgentGuardAlert[] = [];
    const totalTokenUsage: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    // Step 0: Generate Repo Map and Base System Prompt
    let repoMapBlock = "";
    let repoMapSummary = undefined;

    if (this.config.engineEnabled) {
      repoMapSummary = this.contextEngine.generateRepoMap();
      repoMapBlock = `\n\n${repoMapSummary.formattedMap}`;
    }

    const defaultSystemPrompt = [
      "You are Mini Claude Code, an expert autonomous AI software engineer.",
      "Your objective is to inspect, debug, refactor, and verify code systematically.",
      "CRITICAL RULES:",
      "1. Use tools (read_file, edit_file, run_command, list_dir) to take concrete actions.",
      "2. When reading large files, use 'read_file' with startLine and endLine to inspect specific slices.",
      "3. When you have completed the objective or verified your solution, output a clear, concise final summary.",
      repoMapBlock,
    ].join("\n");

    const systemPrompt = this.config.systemPrompt || defaultSystemPrompt;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userGoal },
    ];

    onStreamEvent?.({
      type: "engine_initialized",
      config: {
        workspaceDir: this.config.workspaceDir,
        ...this.config.contextEngineConfig,
      },
      telemetry: this.contextEngine.getTelemetry(),
      repoMapSummary,
    });

    let step = 0;
    let finishReason: ContextAgentResult["finishReason"] = "max_steps_exceeded";
    let finalAnswer = "";

    while (step < this.config.maxSteps) {
      step++;
      const stepStartTime = Date.now();

      onStreamEvent?.({
        type: "step_start",
        step,
        maxSteps: this.config.maxSteps,
        telemetry: this.contextEngine.getTelemetry(),
      });

      // Prepare messages with Pruning and Compaction (if engine enabled)
      let preparedMessages = messages;
      if (this.config.engineEnabled) {
        const prepResult = await this.contextEngine.prepareMessages(
          messages,
          step,
          this.llmClient,
          this.config.model
        );
        preparedMessages = prepResult.preparedMessages;

        if (prepResult.pruningTokensSaved > 0) {
          onStreamEvent?.({
            type: "context_pruned",
            step,
            tokensSaved: prepResult.pruningTokensSaved,
            prunedTurnsCount: prepResult.preparedMessages.length,
            telemetry: this.contextEngine.getTelemetry(),
          });
        }

        if (prepResult.compactionRecord) {
          onStreamEvent?.({
            type: "context_compacted",
            step,
            compaction: prepResult.compactionRecord,
            telemetry: this.contextEngine.getTelemetry(),
          });
        }
      }

      // Check context limit overflow
      const estimatedInputTokens = preparedMessages.reduce((acc, m) => {
        const str = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        return acc + SmartTruncator.estimateTokens(str);
      }, 0);

      const maxWindow = this.config.contextEngineConfig?.maxContextLimit ?? 128000;
      if (!this.config.engineEnabled && estimatedInputTokens > maxWindow) {
        finishReason = "context_exceeded";
        finalAnswer = `[Context Exceeded]: 上下文已达 ${estimatedInputTokens} Token，超出窗口上限 (${maxWindow})。Baseline 模式未启用 Context Engine 导致上下文溢出。`;
        onStreamEvent?.({
          type: "error",
          message: finalAnswer,
        });
        break;
      }

      // Call LLM
      let response;
      try {
        response = await this.llmClient.chatCompletion({
          messages: preparedMessages,
          model: this.config.model,
          temperature: this.config.temperature,
          tools: this.registry.toOpenAITools(),
          toolChoice: "auto",
        });
      } catch (err: any) {
        finishReason = "error";
        finalAnswer = `LLM 调用失败: ${err.message || String(err)}`;
        onStreamEvent?.({ type: "error", message: finalAnswer });
        break;
      }

      // Update token telemetry
      if (response.usage) {
        totalTokenUsage.promptTokens += response.usage.promptTokens;
        totalTokenUsage.completionTokens += response.usage.completionTokens;
        totalTokenUsage.totalTokens += response.usage.totalTokens;

        this.contextEngine.updateTelemetry(
          response.usage.promptTokens,
          response.usage.completionTokens
        );
      }

      const thoughtContent = response.content || "";
      if (thoughtContent) {
        onStreamEvent?.({
          type: "thought",
          step,
          content: thoughtContent,
        });
      }

      const hasToolCalls = response.toolCalls && response.toolCalls.length > 0;

      // Finish condition: No tool calls made
      if (!hasToolCalls) {
        finalAnswer = thoughtContent;
        finishReason = "completed";

        const stepRecord: AgentStepRecord = {
          stepNumber: step,
          thought: thoughtContent,
          toolCalls: [],
          toolResults: [],
          guardAlerts: [],
          tokenUsage: response.usage,
          durationMs: Date.now() - stepStartTime,
          messagesSnapshot: [...messages],
          isFinishStep: true,
        };
        steps.push(stepRecord);

        onStreamEvent?.({
          type: "step_end",
          step,
          stepRecord,
          telemetry: this.contextEngine.getTelemetry(),
        });
        break;
      }

      // Process tool calls
      const toolCalls = response.toolCalls!;
      onStreamEvent?.({
        type: "tool_start",
        step,
        toolCalls,
      });

      // Execute tool calls
      const { results } = await this.executor.executeAll(toolCalls);

      // Intercept and smartly truncate tool results if Engine is enabled
      const processedResults = results.map((res) => {
        if (this.config.engineEnabled) {
          const truncResult = this.contextEngine.processToolOutput(
            res.toolName,
            res.output
          );

          if (truncResult.isTruncated) {
            onStreamEvent?.({
              type: "tool_truncated",
              step,
              toolName: res.toolName,
              truncation: truncResult,
            });
          }

          return {
            ...res,
            output: truncResult.content,
          };
        }
        return res;
      });

      onStreamEvent?.({
        type: "tool_end",
        step,
        toolResults: processedResults,
      });

      // Append assistant message with tool calls to history
      messages.push({
        role: "assistant",
        content: thoughtContent,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      });

      // Append tool observation messages to history
      for (const res of processedResults) {
        messages.push({
          role: "tool",
          tool_call_id: res.toolCallId,
          name: res.toolName,
          content: res.output,
        });
      }

      // Check loop detector
      const loopCheck = this.loopDetector.detectLoop(
        toolCalls,
        this.config.loopDetectThreshold
      );
      this.loopDetector.recordStep(step, toolCalls);

      if (loopCheck.isLoop) {
        const isStrictBreak =
          loopCheck.repeatCount > this.config.loopDetectThreshold;
        const loopAlert: AgentGuardAlert = {
          type: "repeated_loop",
          level: isStrictBreak ? "circuit_break" : "warning",
          message: loopCheck.reason || "检测到重复工具调用死循环",
          details: {
            signature: loopCheck.signature,
            repeatCount: loopCheck.repeatCount,
            threshold: this.config.loopDetectThreshold,
            step,
          },
        };

        guardAlerts.push(loopAlert);
        onStreamEvent?.({
          type: "guard_alert",
          step,
          alert: loopAlert,
        });

        if (isStrictBreak) {
          finishReason = "circuit_break";
          finalAnswer = `[熔断拦截]: 检测到循环死锁调用，系统主动熔断退出。原因: ${loopAlert.message}`;
          break;
        }
      }

      const stepRecord: AgentStepRecord = {
        stepNumber: step,
        thought: thoughtContent,
        toolCalls,
        toolResults: processedResults,
        guardAlerts: [...guardAlerts],
        tokenUsage: response.usage,
        durationMs: Date.now() - stepStartTime,
        messagesSnapshot: [...messages],
        isFinishStep: false,
      };
      steps.push(stepRecord);

      onStreamEvent?.({
        type: "step_end",
        step,
        stepRecord,
        telemetry: this.contextEngine.getTelemetry(),
      });
    }

    const result: ContextAgentResult = {
      success: finishReason === "completed",
      engineEnabled: this.config.engineEnabled,
      finalAnswer,
      totalSteps: step,
      totalDurationMs: Date.now() - startTime,
      finishReason,
      steps,
      allMessages: messages,
      totalTokenUsage,
      telemetry: this.contextEngine.getTelemetry(),
      compactions: this.contextEngine.getSnapshot().compactions,
      guardAlerts,
    };

    onStreamEvent?.({
      type: "agent_done",
      result,
    });

    return result;
  }
}

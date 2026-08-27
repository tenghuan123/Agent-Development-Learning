import { LLMClient } from "../llm/client";
import type { ChatMessage, TokenUsage } from "../llm/types";
import { defaultToolRegistry } from "../tools/builtins";
import { ToolExecutor } from "../tools/executor";
import type { ToolRegistry } from "../tools/registry";
import { LoopDetector } from "./loop-detector";
import type {
  AgentGuardAlert,
  AgentLoopConfig,
  AgentLoopResult,
  AgentStepRecord,
  AgentStreamEvent,
} from "./types";

const DEFAULT_AGENT_SYSTEM_PROMPT = `You are Mini Claude Code, an autonomous AI Coding Agent.
You solve coding, architecture, and exploration tasks through multi-step reasoning and tool execution.

Guidelines:
1. ReAct Cycle:
   - For every step, think clearly about what information you have, what you still need, and what tool to call next.
   - Analyze the Observation returned from previous tool calls before choosing the next action.
2. Self-Correction:
   - If a tool returns an error (e.g. file not found or invalid argument), do NOT give up. Reflect on the error and try an alternative path or directory.
3. Completion:
   - Once you have gathered sufficient information to answer the user's task comprehensively, provide your final response directly without calling any more tools.
4. Output Style:
   - Keep answers clear, well-structured, and insightful.`;

export class AgentLoopRunner {
  private config: Required<AgentLoopConfig>;
  private registry: ToolRegistry;
  private executor: ToolExecutor;
  private llmClient: LLMClient;
  private loopDetector: LoopDetector;

  constructor(
    config: AgentLoopConfig = {},
    registry: ToolRegistry = defaultToolRegistry
  ) {
    this.config = {
      maxSteps: config.maxSteps ?? 8,
      maxConsecutiveErrors: config.maxConsecutiveErrors ?? 3,
      loopDetectThreshold: config.loopDetectThreshold ?? 3,
      model: config.model || process.env.DEFAULT_MODEL || "anthropic/claude-3.5-sonnet",
      systemPrompt: config.systemPrompt || DEFAULT_AGENT_SYSTEM_PROMPT,
      temperature: config.temperature ?? 0.1,
      apiKey: config.apiKey || "",
      enableLoopProtection: config.enableLoopProtection ?? true,
      enableSelfCorrection: config.enableSelfCorrection ?? true,
      workspaceDir: config.workspaceDir || process.cwd(),
    };

    this.registry = registry;
    this.executor = new ToolExecutor(this.registry, {
      workspaceDir: this.config.workspaceDir,
    });
    this.llmClient = new LLMClient({
      apiKey: this.config.apiKey,
      defaultModel: this.config.model,
    });
    this.loopDetector = new LoopDetector();
  }

  /**
   * Run the full autonomous Agent Loop with real-time event streaming
   */
  async run(
    task: string,
    onEvent?: (event: AgentStreamEvent) => void
  ): Promise<AgentLoopResult> {
    const startTime = Date.now();
    const emit = (event: AgentStreamEvent) => {
      if (onEvent) {
        try {
          onEvent(event);
        } catch (err) {
          console.error("[AgentLoop] Event emission error:", err);
        }
      }
    };

    emit({
      type: "agent_start",
      task,
      maxSteps: this.config.maxSteps,
      model: this.config.model,
    });

    const messages: ChatMessage[] = [
      { role: "system", content: this.config.systemPrompt },
      { role: "user", content: task },
    ];

    const stepRecords: AgentStepRecord[] = [];
    const allGuardAlerts: AgentGuardAlert[] = [];
    let consecutiveErrors = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    let currentStep = 0;
    let finishReason: AgentLoopResult["finishReason"] = "completed";
    let finalAnswer = "";

    const openAITools = this.registry.toOpenAITools();

    try {
      while (currentStep < this.config.maxSteps) {
        currentStep++;
        const stepStartTime = Date.now();

        emit({
          type: "step_start",
          step: currentStep,
          maxSteps: this.config.maxSteps,
        });

        // 1. Call LLM for Thought and Tool Decision
        const llmResponse = await this.llmClient.chatCompletion({
          messages,
          model: this.config.model,
          temperature: this.config.temperature,
          tools: openAITools.length > 0 ? openAITools : undefined,
        });

        if (llmResponse.usage) {
          totalPromptTokens += llmResponse.usage.promptTokens || 0;
          totalCompletionTokens += llmResponse.usage.completionTokens || 0;
        }

        const thoughtText = llmResponse.content || "";
        if (thoughtText) {
          emit({
            type: "thought",
            step: currentStep,
            content: thoughtText,
          });
        }

        const currentStepAlerts: AgentGuardAlert[] = [];

        // 2. Check if Model provided Final Answer (No Tool Calls)
        const toolCalls = llmResponse.toolCalls || [];
        if (toolCalls.length === 0) {
          finalAnswer = thoughtText;
          finishReason = "completed";

          const stepRecord: AgentStepRecord = {
            stepNumber: currentStep,
            thought: thoughtText,
            toolCalls: [],
            toolResults: [],
            guardAlerts: currentStepAlerts,
            tokenUsage: llmResponse.usage,
            durationMs: Date.now() - stepStartTime,
            messagesSnapshot: [...messages],
          };

          stepRecords.push(stepRecord);
          emit({
            type: "step_end",
            step: currentStep,
            stepRecord,
          });
          break;
        }

        // 3. Model Requested Tool Calls -> Acting & Observation
        emit({
          type: "tool_start",
          step: currentStep,
          toolCalls,
        });

        // 4. Guard Check: Loop & Duplicate Detection
        let shouldCircuitBreak = false;
        if (this.config.enableLoopProtection) {
          const loopCheck = this.loopDetector.detectLoop(
            toolCalls,
            this.config.loopDetectThreshold
          );

          if (loopCheck.isLoop) {
            const isStrictBreak = loopCheck.repeatCount > this.config.loopDetectThreshold;
            const alert: AgentGuardAlert = {
              type: "repeated_loop",
              level: isStrictBreak ? "circuit_break" : "warning",
              message: loopCheck.reason || "检测到重复工具调用死循环",
              details: {
                signature: loopCheck.signature,
                repeatCount: loopCheck.repeatCount,
                threshold: this.config.loopDetectThreshold,
                step: currentStep,
              },
            };

            currentStepAlerts.push(alert);
            allGuardAlerts.push(alert);
            emit({
              type: "guard_alert",
              step: currentStep,
              alert,
            });

            if (isStrictBreak) {
              shouldCircuitBreak = true;
              finishReason = "circuit_break";
              finalAnswer = `[Agent 熔断保护] 系统检测到模型连续多次重复调用相同工具及参数（${loopCheck.signature}），为防止死循环消耗已强制熔断。`;
            }
          }
        }

        // Add Assistant's action to messages
        messages.push({
          role: "assistant",
          content: thoughtText,
          tool_calls: toolCalls,
        });

        // 5. Execute Tools locally
        const { results: toolResults, toolMessages } =
          await this.executor.executeAll(toolCalls);

        emit({
          type: "tool_end",
          step: currentStep,
          toolResults,
        });

        // Record step in LoopDetector
        this.loopDetector.recordStep(currentStep, toolCalls);

        // 6. Check for consecutive errors & self-correction
        const stepHasError = toolResults.some((r) => r.isError);
        if (stepHasError) {
          consecutiveErrors++;
          if (consecutiveErrors >= this.config.maxConsecutiveErrors) {
            const alert: AgentGuardAlert = {
              type: "consecutive_errors",
              level: "circuit_break",
              message: `连续 ${consecutiveErrors} 次工具执行发生错误，超出系统容错上限 (${this.config.maxConsecutiveErrors})。`,
              details: {
                consecutiveErrors,
                step: currentStep,
              },
            };
            currentStepAlerts.push(alert);
            allGuardAlerts.push(alert);
            emit({
              type: "guard_alert",
              step: currentStep,
              alert,
            });

            shouldCircuitBreak = true;
            finishReason = "circuit_break";
            finalAnswer = `[Agent 熔断保护] 工具执行连续失败 ${consecutiveErrors} 次，触发熔断保护。最新错误：${toolResults
              .filter((t) => t.isError)
              .map((t) => t.output)
              .join("; ")}`;
          }
        } else {
          consecutiveErrors = 0;
        }

        // Add Tool results (Observations) to messages
        messages.push(...toolMessages);

        // If loop warning was triggered but not yet broken, inject guidance for model reflection
        if (
          !shouldCircuitBreak &&
          currentStepAlerts.some((a) => a.type === "repeated_loop")
        ) {
          messages.push({
            role: "user",
            content: `[System Notice]: You have repeatedly called the same tool with identical arguments. Please change your strategy, explore different files, or formulate your final answer based on what you have already discovered.`,
          });
        }

        const stepRecord: AgentStepRecord = {
          stepNumber: currentStep,
          thought: thoughtText,
          toolCalls,
          toolResults,
          guardAlerts: currentStepAlerts,
          tokenUsage: llmResponse.usage,
          durationMs: Date.now() - stepStartTime,
          messagesSnapshot: [...messages],
        };

        stepRecords.push(stepRecord);
        emit({
          type: "step_end",
          step: currentStep,
          stepRecord,
        });

        if (shouldCircuitBreak) {
          break;
        }
      }

      // Check if max steps exceeded
      if (currentStep >= this.config.maxSteps && finishReason !== "circuit_break" && !finalAnswer) {
        finishReason = "max_steps_exceeded";
        finalAnswer = `[达到最大步数限制] Agent 已执行完预设的 ${this.config.maxSteps} 步配额，已终止执行以保护资源。`;
        const alert: AgentGuardAlert = {
          type: "max_steps",
          level: "circuit_break",
          message: `已达到最大步数配额 (${this.config.maxSteps} 步)，自动终止。`,
          details: {
            step: currentStep,
            maxSteps: this.config.maxSteps,
          },
        };
        allGuardAlerts.push(alert);
        emit({
          type: "guard_alert",
          step: currentStep,
          alert,
        });
      }
    } catch (err: any) {
      finishReason = "error";
      finalAnswer = `[Agent 运行异常]: ${err.message || String(err)}`;
      emit({
        type: "error",
        message: err.message || String(err),
      });
    }

    const totalDurationMs = Date.now() - startTime;
    const finalResult: AgentLoopResult = {
      success: finishReason === "completed",
      finalAnswer,
      totalSteps: stepRecords.length,
      totalDurationMs,
      finishReason,
      steps: stepRecords,
      allMessages: messages,
      totalTokenUsage: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
      },
      guardAlerts: allGuardAlerts,
    };

    emit({
      type: "agent_done",
      result: finalResult,
    });

    return finalResult;
  }
}


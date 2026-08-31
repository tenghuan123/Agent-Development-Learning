import { LLMClient } from "../llm/client";
import type { ChatMessage } from "../llm/types";
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
You solve coding, refactoring, testing, and exploration tasks through multi-step reasoning, precise file editing, command execution, and test-driven self-correction.

Guidelines:
1. ReAct Cycle:
   - Think step-by-step: analyze current observations before selecting the next action.
2. Code Reading & Editing Best Practices:
   - ALWAYS call 'read_file' to inspect the actual file contents BEFORE calling 'edit_file'. Never guess file content from memory.
   - When modifying existing code, ALWAYS use 'edit_file' with exact 'targetContent' and 'replacementContent'.
   - Do NOT include line number prefixes (e.g. '12 | ') from 'read_file' in 'targetContent'.
   - Use 'write_file' only when creating new files or completely rewriting small configurations.
3. Command Execution & Self-Healing:
   - After writing or editing code, use 'run_command' to run tests, typecheck, or verify execution.
   - If a command fails (exitCode !== 0), carefully read the error output/traceback in Observation, identify which source file contains the root bug (e.g. implementation file vs test runner), and apply a fix using 'edit_file'.
4. Completion:
   - Once the code is verified and all goals/tests pass, provide a concise summary of changes and results directly without further tool calls.`;

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
      model: config.model || process.env.LLM_MODEL || "glm-4-flash",
      systemPrompt: config.systemPrompt || DEFAULT_AGENT_SYSTEM_PROMPT,
      temperature: config.temperature ?? 0.1,
      apiKey: config.apiKey || process.env.LLM_API_KEY || "",
      baseURL:
        config.baseURL ||
        process.env.LLM_BASE_URL ||
        "https://open.bigmodel.cn/api/paas/v4",
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
      baseURL: this.config.baseURL,
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

        let thoughtText = llmResponse.content || "";
        let toolCalls = llmResponse.toolCalls || [];

        // Fallback: If model outputted tool call JSON in plain text instead of native tool_calls
        if (toolCalls.length === 0 && thoughtText.trim().length > 0) {
          const extracted = this.extractToolCallsFromContent(
            thoughtText,
            this.registry.list()
          );
          if (extracted.extractedToolCalls.length > 0) {
            toolCalls = extracted.extractedToolCalls;
            thoughtText = extracted.cleanThought || thoughtText;
          }
        }

        if (thoughtText) {
          emit({
            type: "thought",
            step: currentStep,
            content: thoughtText,
          });
        }

        const currentStepAlerts: AgentGuardAlert[] = [];

        // 2. Check if Model provided Final Answer (No Tool Calls)
        if (toolCalls.length === 0) {
          // If on Step 1 the model only gave a planning statement for an action-oriented coding task, nudge it to proceed
          const isActionTask = /创建|实现|编写|修改|修复|运行|测试|write_file|edit_file|run_command|build|test/i.test(task);
          const looksLikePlanOnly = /need to|let's|will |i will|步骤|计划|我来|准备/i.test(thoughtText);

          if (currentStep === 1 && isActionTask && looksLikePlanOnly && currentStep < this.config.maxSteps) {
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

            messages.push({
              role: "assistant",
              content: thoughtText,
            });
            messages.push({
              role: "user",
              content: "已收到你的分析计划。请立即调用相应的工具（例如 write_file、edit_file 或 run_command）开始落实代码与执行验证。",
            });
            continue;
          }

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

        // 6. Guard Check: Consecutive Error Tracking
        const hasError = toolResults.some((t) => t.isError);
        if (hasError) {
          consecutiveErrors++;
          if (consecutiveErrors >= this.config.maxConsecutiveErrors) {
            const alert: AgentGuardAlert = {
              type: "consecutive_errors",
              level: "circuit_break",
              message: `连续 ${consecutiveErrors} 次工具执行异常，已达安全阈值`,
              details: {
                consecutiveErrors,
                threshold: this.config.maxConsecutiveErrors,
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

  /**
   * Intelligently extract tool calls embedded in model's text (supports raw JSON, function call syntax, XML tags)
   */
  private extractToolCallsFromContent(
    content: string,
    availableTools: any[]
  ): {
    cleanThought: string;
    extractedToolCalls: any[];
  } {
    if (!content || !content.trim()) {
      return { cleanThought: content, extractedToolCalls: [] };
    }

    const extractedToolCalls: any[] = [];
    let remainingText = content;

    // 1. XML style tags: <tool_call>...</tool_call> or <action>...</action>
    const xmlPattern = /<(?:tool_call|action)(?:\s+name=["']?(\w+)["']?)?>([\s\S]*?)<\/(?:tool_call|action)>/g;
    let xmlMatch;
    while ((xmlMatch = xmlPattern.exec(content)) !== null) {
      const rawTag = xmlMatch[0];
      const explicitName = xmlMatch[1];
      const bodyStr = xmlMatch[2].trim();

      try {
        const parsed = JSON.parse(bodyStr);
        const toolName = explicitName || parsed.name;
        const toolArgs = parsed.arguments || parsed.parameters || parsed;
        if (toolName && availableTools.some((t) => t.name === toolName)) {
          extractedToolCalls.push({
            id: `fallback_${Date.now()}_${extractedToolCalls.length}`,
            type: "function",
            function: {
              name: toolName,
              arguments: typeof toolArgs === "string" ? toolArgs : JSON.stringify(toolArgs),
            },
          });
          remainingText = remainingText.replace(rawTag, "");
        }
      } catch {
        // ignore malformed tool call blocks
      }
    }

    if (extractedToolCalls.length > 0) {
      return { cleanThought: remainingText.trim(), extractedToolCalls };
    }

    // 2. Explicit function syntax: tool_name({...})
    const funcPattern = /\b([a-zA-Z0-9_]+)\s*\(\s*(\{[\s\S]*?\})\s*\)/g;
    let funcMatch;
    while ((funcMatch = funcPattern.exec(content)) !== null) {
      const rawCall = funcMatch[0];
      const toolName = funcMatch[1];
      const rawArgs = funcMatch[2];

      const matchedTool = availableTools.find((t) => t.name === toolName);
      if (matchedTool) {
        try {
          const parsed = JSON.parse(rawArgs);
          extractedToolCalls.push({
            id: `fallback_${Date.now()}_${extractedToolCalls.length}`,
            type: "function",
            function: {
              name: toolName,
              arguments: JSON.stringify(parsed),
            },
          });
          remainingText = remainingText.replace(rawCall, "");
        } catch {
          // ignore malformed function call arguments
        }
      }
    }

    if (extractedToolCalls.length > 0) {
      return { cleanThought: remainingText.trim(), extractedToolCalls };
    }

    // 3. Raw JSON object matching tool schemas (e.g. `{"dirPath":"scratch/sandbox","recursive":true}`)
    const jsonObjectRegex = /\{[\s\S]*?\}/g;
    let jsonMatch;
    while ((jsonMatch = jsonObjectRegex.exec(content)) !== null) {
      const rawJson = jsonMatch[0];
      try {
        const parsed = JSON.parse(rawJson);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          if (parsed.name && availableTools.some((t) => t.name === parsed.name)) {
            const args = parsed.arguments || parsed.parameters || {};
            extractedToolCalls.push({
              id: `fallback_${Date.now()}_${extractedToolCalls.length}`,
              type: "function",
              function: {
                name: parsed.name,
                arguments: typeof args === "string" ? args : JSON.stringify(args),
              },
            });
            remainingText = remainingText.replace(rawJson, "");
            continue;
          }

          // Match against tool parameter schemas
          for (const tool of availableTools) {
            const validation = tool.schema.safeParse(parsed);
            if (validation.success) {
              extractedToolCalls.push({
                id: `fallback_${Date.now()}_${extractedToolCalls.length}`,
                type: "function",
                function: {
                  name: tool.name,
                  arguments: JSON.stringify(validation.data),
                },
              });
              remainingText = remainingText.replace(rawJson, "");
              break;
            }
          }
        }
      } catch {
        // ignore malformed JSON objects
      }
    }

    return {
      cleanThought: remainingText.trim(),
      extractedToolCalls,
    };
  }
}

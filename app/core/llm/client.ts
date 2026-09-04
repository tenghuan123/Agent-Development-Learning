import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import type {
  ChatMessage,
  ChatCompletionOptions,
  LLMClientConfig,
  LLMResponse,
  LLMStreamChunk,
} from "./types";
import type { ToolRegistry } from "../tools/registry";
import { ToolExecutor } from "../tools/executor";
import type { ToolCallingRunResult, ToolStepTrace, ToolExecutionResult } from "../tools/types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.statusCode;
      const message = String(err?.message || "");
      const isRateLimit =
        status === 429 ||
        message.includes("429") ||
        message.includes("Rate limit") ||
        message.includes("Provider returned error");
      const isServerError = status >= 500 && status < 600;
      const isRetryable =
        isRateLimit ||
        isServerError ||
        message.includes("fetch failed") ||
        message.includes("ECONNRESET");

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }

      // Exponential backoff with random jitter
      const jitter = Math.random() * 300;
      const delayMs = initialDelay * Math.pow(2, attempt) + jitter;
      console.warn(
        `[LLMClient] Request failed (${message}). Retrying attempt ${
          attempt + 1
        }/${maxRetries} after ${Math.round(delayMs)}ms...`
      );
      await sleep(delayMs);
    }
  }
  throw lastError;
}

export class LLMClient {
  private openai: OpenAI;
  public defaultModel: string;

  constructor(config?: LLMClientConfig) {
    const apiKey = config?.apiKey || process.env.LLM_API_KEY || "";
    const baseURL =
      config?.baseURL ||
      process.env.LLM_BASE_URL ||
      "https://open.bigmodel.cn/api/paas/v4";

    this.defaultModel =
      config?.defaultModel || process.env.LLM_MODEL || "glm-4-flash";

    this.openai = new OpenAI({
      apiKey,
      baseURL,
      maxRetries: 3,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/mini-claude-code",
        "X-Title": "Mini Claude Code",
      },
    });
  }

  public get apiKeyConfigured(): boolean {
    return Boolean(this.openai.apiKey && this.openai.apiKey.trim().length > 0);
  }

  private ensureApiKeyConfigured(): void {
    if (!this.apiKeyConfigured) {
      throw new Error(
        "未配置 LLM API Key，请在页面右上角设置，或在根目录 .env 文件中配置 LLM_API_KEY"
      );
    }
  }

  private prepareMessages(
    messages: ChatMessage[],
    systemPrompt?: string
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const list: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (systemPrompt && systemPrompt.trim().length > 0) {
      list.push({
        role: "system",
        content: systemPrompt.trim(),
      });
    }

    for (const msg of messages) {
      if (msg.role === "system") {
        list.push({ role: "system", content: msg.content });
      } else if (msg.role === "user") {
        list.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        const assistantMsg: any = {
          role: "assistant",
          content: msg.content || null,
        };
        if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
          assistantMsg.tool_calls = msg.tool_calls;
        }
        list.push(assistantMsg);
      } else if (msg.role === "tool") {
        list.push({
          role: "tool",
          tool_call_id: msg.tool_call_id || "",
          content: msg.content,
        });
      }
    }

    return list;
  }

  /**
   * Execute standard single completion request (supports tools & reasoning extraction)
   */
  async chatCompletion(options: ChatCompletionOptions): Promise<LLMResponse> {
    this.ensureApiKeyConfigured();
    const startTime = Date.now();
    const model = options.model || this.defaultModel;
    const formattedMessages = this.prepareMessages(
      options.messages,
      options.systemPrompt
    );

    const hasTools = Boolean(options.tools && options.tools.length > 0);

    const completion = await withRetry(() =>
      this.openai.chat.completions.create(
        {
          model,
          messages: formattedMessages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens,
          tools: hasTools ? options.tools : undefined,
          tool_choice: hasTools ? options.toolChoice : undefined,
          response_format: options.responseFormat,
        },
        options.signal ? { signal: options.signal } : undefined
      )
    );

    const latencyMs = Date.now() - startTime;
    const choice = completion.choices[0];
    const msg = choice?.message as any;
    
    // Robust content extraction (handles reasoning models and regular content)
    let content = msg?.content || "";
    if (!content && msg?.reasoning_content) {
      content = msg.reasoning_content;
    }
    if (!content && msg?.reasoning) {
      content = msg.reasoning;
    }

    const rawToolCalls = choice?.message?.tool_calls;
    const toolCalls = rawToolCalls
      ? rawToolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        }))
      : undefined;

    return {
      id: completion.id,
      model: completion.model || model,
      content,
      finishReason: choice?.finish_reason || undefined,
      toolCalls,
      usage: completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
            totalTokens: completion.usage.total_tokens,
          }
        : undefined,
      latencyMs,
    };
  }

  /**
   * Alias for chatCompletion
   */
  async chat(options: ChatCompletionOptions): Promise<LLMResponse> {
    return this.chatCompletion(options);
  }

  /**
   * Stream completion token by token
   */
  async *chatStream(
    options: ChatCompletionOptions
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    this.ensureApiKeyConfigured();
    const model = options.model || this.defaultModel;
    const formattedMessages = this.prepareMessages(
      options.messages,
      options.systemPrompt
    );

    const hasTools = Boolean(options.tools && options.tools.length > 0);

    const stream = await withRetry(() =>
      this.openai.chat.completions.create({
        model,
        messages: formattedMessages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
        tools: hasTools ? options.tools : undefined,
        tool_choice: hasTools ? options.toolChoice : undefined,
        stream: true,
        stream_options: { include_usage: true },
      })
    );

    let lastUsage: OpenAI.CompletionUsage | undefined;

    for await (const chunk of stream) {
      if (chunk.usage) {
        lastUsage = chunk.usage;
      }

      const delta = chunk.choices?.[0]?.delta?.content || "";
      if (delta) {
        yield {
          content: delta,
          isDone: false,
          model: chunk.model || model,
        };
      }
    }

    yield {
      content: "",
      isDone: true,
      model,
      usage: lastUsage
        ? {
            promptTokens: lastUsage.prompt_tokens,
            completionTokens: lastUsage.completion_tokens,
            totalTokens: lastUsage.total_tokens,
          }
        : undefined,
    };
  }

  /**
   * Request Structured Output with Zod Schema Validation
   */
  async structuredOutput<T>(
    options: Omit<ChatCompletionOptions, "responseFormat"> & {
      schema: z.ZodType<T>;
      schemaName?: string;
    }
  ): Promise<{ data: T; raw: string; latencyMs: number; usage?: any }> {
    const startTime = Date.now();
    const model = options.model || this.defaultModel;
    const schemaName = options.schemaName || "structured_output";
    const format = zodResponseFormat(options.schema, schemaName);
    const jsonSchemaStr = JSON.stringify(format.json_schema.schema, null, 2);

    const enhancedSystemPrompt = [
      options.systemPrompt || "You are a precise data extraction assistant.",
      `CRITICAL: You MUST respond ONLY with a single valid JSON object that strictly conforms to this JSON Schema:
${jsonSchemaStr}

Rules:
1. Do NOT include markdown code fences (no \`\`\` or \`\`\`json).
2. Do NOT include any introductory or conversational explanations before or after the JSON.
3. Every required field must be populated correctly according to the schema.`,
    ].join("\n\n");

    let response: LLMResponse;
    try {
      response = await this.chatCompletion({
        ...options,
        model,
        systemPrompt: enhancedSystemPrompt,
        responseFormat: format as any,
      });
    } catch {
      response = await this.chatCompletion({
        ...options,
        model,
        systemPrompt: enhancedSystemPrompt,
        responseFormat: { type: "json_object" },
      });
    }

    const latencyMs = Date.now() - startTime;
    let parsedJson: any;

    try {
      let cleaned = response.content.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }
      parsedJson = JSON.parse(cleaned);
    } catch (err: any) {
      throw new Error(
        `Failed to parse model response as JSON: ${err.message}. Raw output: ${response.content}`,
        { cause: err }
      );
    }

    const validated = options.schema.safeParse(parsedJson);
    if (!validated.success) {
      throw new Error(
        `Schema validation error: ${validated.error.message}. Parsed data: ${JSON.stringify(
          parsedJson
        )}`
      );
    }

    return {
      data: validated.data,
      raw: response.content,
      latencyMs,
      usage: response.usage,
    };
  }

  /**
   * Run full Tool Calling lifecycle with support for multi-step / sequential calls & comprehensive traces
   */
  async runSingleTurnToolCalling(options: {
    messages: ChatMessage[];
    systemPrompt?: string;
    registry: ToolRegistry;
    model?: string;
    temperature?: number;
    workspaceDir?: string;
    maxTurns?: number;
  }): Promise<ToolCallingRunResult> {
    const overallStartTime = Date.now();
    const steps: ToolStepTrace[] = [];
    const model = options.model || this.defaultModel;
    const tools = options.registry.toOpenAITools();
    const executor = new ToolExecutor(options.registry, {
      workspaceDir: options.workspaceDir,
    });

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let currentMessages: ChatMessage[] = [...options.messages];
    const allCollectedResults: ToolExecutionResult[] = [];
    const allCollectedToolCalls: any[] = [];

    // Step 1: User Request & Tool Contract Preparation
    const lastUserMsg = [...options.messages]
      .reverse()
      .find((m) => m.role === "user");

    let stepCounter = 1;
    steps.push({
      step: stepCounter++,
      title: "Step 1: 注册可用工具契约并注入用户指令",
      type: "user_input",
      description: `准备好 ${tools.length} 个工具的 JSON Schema 定义，并将用户指令放入 Context Window 发送给模型。`,
      data: {
        userInput: lastUserMsg?.content || "",
        availableTools: options.registry.getManifest(),
        model,
      },
      timestamp: new Date().toLocaleTimeString(),
    });

    const maxTurns = options.maxTurns || 3;
    let finalAnswer = "";

    for (let turn = 1; turn <= maxTurns; turn++) {
      const turnStart = Date.now();
      const isFirstTurn = turn === 1;

      // Call LLM
      const response = await this.chatCompletion({
        messages: currentMessages,
        systemPrompt:
          options.systemPrompt ||
          "你是一个具备本地工具调用能力的 AI Assistant。当你需要查看代码、检索目录、精确计算或获取系统状态时，请果断调用合适的工具。",
        model,
        tools,
        temperature: options.temperature ?? 0.2,
      });

      const turnDuration = Date.now() - turnStart;

      if (response.usage) {
        totalPromptTokens += response.usage.promptTokens;
        totalCompletionTokens += response.usage.completionTokens;
      }

      const toolCalls = response.toolCalls;

      // If model produced final text and no more tool calls
      if (!toolCalls || toolCalls.length === 0) {
        finalAnswer = response.content || "";

        if (isFirstTurn) {
          // Direct response without any tool calls
          steps.push({
            step: stepCounter++,
            title: `Step ${stepCounter - 1}: 模型决定直接回答（无需调用工具）`,
            type: "direct_response",
            description:
              "模型判定当前问题无需外部工具即可回答，直接生成了自然语言文本。",
            data: {
              finishReason: response.finishReason,
              response: finalAnswer,
              usage: response.usage,
              latencyMs: turnDuration,
            },
            durationMs: turnDuration,
            timestamp: new Date().toLocaleTimeString(),
          });

          return {
            hasToolCalls: false,
            finalAnswer,
            steps,
            totalLatencyMs: Date.now() - overallStartTime,
            totalTokens: {
              promptTokens: totalPromptTokens,
              completionTokens: totalCompletionTokens,
              totalTokens: totalPromptTokens + totalCompletionTokens,
            },
          };
        } else {
          // Final synthesis after previous tool calls
          steps.push({
            step: stepCounter++,
            title: `Step ${stepCounter - 1}: 工具观测结果全部回传，模型合成最终解答`,
            type: "llm_synthesis",
            description:
              "Runtime 将所有工具输出以 role: 'tool' 包装回消息上下文，模型结合真实数据生成准确严谨的最终答复。",
            data: {
              extendedMessagesCount: currentMessages.length,
              finalAnswer,
              usage: response.usage,
              latencyMs: turnDuration,
            },
            durationMs: turnDuration,
            timestamp: new Date().toLocaleTimeString(),
          });

          return {
            hasToolCalls: true,
            toolCalls: allCollectedToolCalls,
            toolResults: allCollectedResults,
            finalAnswer,
            steps,
            totalLatencyMs: Date.now() - overallStartTime,
            totalTokens: {
              promptTokens: totalPromptTokens,
              completionTokens: totalCompletionTokens,
              totalTokens: totalPromptTokens + totalCompletionTokens,
            },
          };
        }
      }

      // Model requested tool calls
      allCollectedToolCalls.push(...toolCalls);

      steps.push({
        step: stepCounter++,
        title: `Step ${stepCounter - 1}: 模型做出决策，生成 ${toolCalls.length} 个 Tool Call 请求${
          turn > 1 ? ` (第 ${turn} 轮迭代)` : ""
        }`,
        type: "llm_tool_call",
        description:
          "模型并未真正执行任何代码，而是输出了标准 Tool Call JSON，向 Runtime 申请执行对应工具。",
        data: {
          turn,
          finishReason: response.finishReason,
          toolCalls: toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            rawArguments: tc.function.arguments,
          })),
          usage: response.usage,
          latencyMs: turnDuration,
        },
        durationMs: turnDuration,
        timestamp: new Date().toLocaleTimeString(),
      });

      // Execute tools locally in Runtime
      const execStart = Date.now();
      const { results, toolMessages } = await executor.executeAll(toolCalls);
      const execDuration = Date.now() - execStart;

      allCollectedResults.push(...results);

      steps.push({
        step: stepCounter++,
        title: `Step ${stepCounter - 1}: Runtime 拦截并在本地安全执行${
          turn > 1 ? ` (第 ${turn} 轮)` : ""
        }`,
        type: "runtime_execution",
        description:
          "宿主环境（Node.js / TypeScript）解析参数、进行 Zod 模式校验，并调用本地函数完成物理执行。",
        data: {
          turn,
          results: results.map((r) => ({
            toolName: r.toolName,
            toolCallId: r.toolCallId,
            inputArgs: r.inputArgs,
            isError: r.isError,
            outputPreview:
              r.output.length > 500
                ? r.output.substring(0, 500) + "... [已折叠展示]"
                : r.output,
            fullOutput: r.output,
            executionTimeMs: r.executionTimeMs,
          })),
        },
        durationMs: execDuration,
        timestamp: new Date().toLocaleTimeString(),
      });

      // Update current messages for next turn
      currentMessages = [
        ...currentMessages,
        {
          role: "assistant",
          content: response.content || "",
          tool_calls: toolCalls,
        },
        ...toolMessages,
      ];
    }

    // If max turns reached, do one final synthesis request without tools to force text response
    if (!finalAnswer) {
      const finalSynthStart = Date.now();
      const finalSynthResponse = await this.chatCompletion({
        messages: currentMessages,
        systemPrompt:
          options.systemPrompt ||
          "请根据上述所有已执行工具的返回结果（Observation），综合全面地回答用户的最初提问。",
        model,
        temperature: options.temperature ?? 0.5,
      });
      const finalSynthDuration = Date.now() - finalSynthStart;

      finalAnswer =
        finalSynthResponse.content ||
        "工具调用执行完成，已获取全部必要数据。";

      if (finalSynthResponse.usage) {
        totalPromptTokens += finalSynthResponse.usage.promptTokens;
        totalCompletionTokens += finalSynthResponse.usage.completionTokens;
      }

      steps.push({
        step: stepCounter++,
        title: `Step ${stepCounter - 1}: 观测结果汇总，模型合成最终解答`,
        type: "llm_synthesis",
        description:
          "Runtime 将所有工具输出以 role: 'tool' 包装回消息上下文，模型结合真实数据生成准确严谨的最终答复。",
        data: {
          extendedMessagesCount: currentMessages.length,
          finalAnswer,
          usage: finalSynthResponse.usage,
          latencyMs: finalSynthDuration,
        },
        durationMs: finalSynthDuration,
        timestamp: new Date().toLocaleTimeString(),
      });
    }

    return {
      hasToolCalls: true,
      toolCalls: allCollectedToolCalls,
      toolResults: allCollectedResults,
      finalAnswer,
      steps,
      totalLatencyMs: Date.now() - overallStartTime,
      totalTokens: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
      },
    };
  }
}

// Global default singleton instance
export const defaultLLMClient = new LLMClient();

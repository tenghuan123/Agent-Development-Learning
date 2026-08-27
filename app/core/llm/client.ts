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
      const isRateLimit = status === 429 || message.includes("429") || message.includes("Rate limit") || message.includes("Provider returned error");
      const isServerError = status >= 500 && status < 600;
      const isRetryable = isRateLimit || isServerError || message.includes("fetch failed") || message.includes("ECONNRESET");

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }

      // Exponential backoff with random jitter (e.g. 1000ms, 2000ms, 4000ms + jitter)
      const jitter = Math.random() * 300;
      const delayMs = initialDelay * Math.pow(2, attempt) + jitter;
      console.warn(`[LLMClient] Request failed (${message}). Retrying attempt ${attempt + 1}/${maxRetries} after ${Math.round(delayMs)}ms...`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

export class LLMClient {
  private openai: OpenAI;
  public defaultModel: string;

  constructor(config?: LLMClientConfig) {
    const apiKey =
      config?.apiKey ||
      process.env.OPENROUTER_API_KEY ||
      process.env.OPENAI_API_KEY ||
      "";
    const baseURL =
      config?.baseURL ||
      process.env.OPENROUTER_BASE_URL ||
      "https://openrouter.ai/api/v1";

    this.defaultModel =
      config?.defaultModel ||
      process.env.DEFAULT_MODEL ||
      "anthropic/claude-3.5-sonnet";

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
        list.push({
          role: "assistant",
          content: msg.content,
          tool_calls: msg.tool_calls as any,
        });
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
   * Execute standard single completion request
   */
  async chatCompletion(options: ChatCompletionOptions): Promise<LLMResponse> {
    const startTime = Date.now();
    const model = options.model || this.defaultModel;
    const formattedMessages = this.prepareMessages(
      options.messages,
      options.systemPrompt
    );

    const completion = await withRetry(() =>
      this.openai.chat.completions.create({
        model,
        messages: formattedMessages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
        response_format: options.responseFormat,
      })
    );

    const latencyMs = Date.now() - startTime;
    const choice = completion.choices[0];
    const content = choice?.message?.content || "";

    return {
      id: completion.id,
      model: completion.model || model,
      content,
      finishReason: choice?.finish_reason || undefined,
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
   * Stream completion token by token
   */
  async *chatStream(
    options: ChatCompletionOptions
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const model = options.model || this.defaultModel;
    const formattedMessages = this.prepareMessages(
      options.messages,
      options.systemPrompt
    );

    const stream = await withRetry(() =>
      this.openai.chat.completions.create({
        model,
        messages: formattedMessages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
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

    // Enhance prompt to instruct strict JSON formatting with the exact schema
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
      // Try with native json_schema response format first
      response = await this.chatCompletion({
        ...options,
        model,
        systemPrompt: enhancedSystemPrompt,
        responseFormat: format as any,
      });
    } catch (err: any) {
      // Fallback to json_object format if provider doesn't support json_schema
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
      // Clean possible fences if model returned them
      let cleaned = response.content.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }
      parsedJson = JSON.parse(cleaned);
    } catch (err: any) {
      throw new Error(
        `Failed to parse model response as JSON: ${err.message}. Raw output: ${response.content}`
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
}

// Global default singleton instance
export const defaultLLMClient = new LLMClient();

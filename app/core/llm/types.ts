import type OpenAI from "openai";
import type { ToolCallItem } from "../tools/types";

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  id: string;
  model: string;
  content: string;
  finishReason?: string;
  toolCalls?: ToolCallItem[];
  usage?: TokenUsage;
  latencyMs: number;
}

export interface LLMStreamChunk {
  content: string;
  isDone: boolean;
  model?: string;
  toolCalls?: ToolCallItem[];
  usage?: TokenUsage;
}

export interface LLMClientConfig {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: OpenAI.Chat.ChatCompletionTool[];
  toolChoice?: OpenAI.Chat.ChatCompletionToolChoiceOption;
  responseFormat?: { type: "json_object" | "text" };
  signal?: AbortSignal;
}

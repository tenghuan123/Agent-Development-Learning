import { z } from "zod";

export interface ToolContext {
  workspaceDir: string;
  maxOutputLength?: number;
}

export interface ToolDefinition<TParams = any, TResult = any> {
  name: string;
  description: string;
  schema: z.ZodType<TParams>;
  execute: (args: TParams, context: ToolContext) => Promise<TResult> | TResult;
}

export interface ToolCallItem {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  inputArgs: any;
  rawArguments: string;
  output: string;
  isError: boolean;
  executionTimeMs: number;
}

export interface ToolStepTrace {
  step: number;
  title: string;
  type: "user_input" | "llm_tool_call" | "runtime_execution" | "llm_synthesis" | "direct_response";
  description: string;
  data: any;
  durationMs?: number;
  timestamp: string;
}

export interface ToolCallingRunResult {
  hasToolCalls: boolean;
  toolCalls?: ToolCallItem[];
  toolResults?: ToolExecutionResult[];
  finalAnswer: string;
  steps: ToolStepTrace[];
  totalLatencyMs: number;
  totalTokens?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}


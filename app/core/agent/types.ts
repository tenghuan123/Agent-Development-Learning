import type { ChatMessage, TokenUsage } from "../llm/types";
import type { ToolCallItem, ToolExecutionResult } from "../tools/types";

export type AgentState =
  | "idle"
  | "thinking"
  | "acting"
  | "observing"
  | "guard_checking"
  | "completed"
  | "circuit_break"
  | "max_steps_exceeded"
  | "error";

export interface AgentGuardAlert {
  type: "max_steps" | "repeated_loop" | "consecutive_errors";
  level: "warning" | "circuit_break";
  message: string;
  details?: {
    signature?: string;
    repeatCount?: number;
    threshold?: number;
    consecutiveErrors?: number;
    step?: number;
    maxSteps?: number;
  };
}

export interface AgentStepRecord {
  stepNumber: number;
  thought: string;
  toolCalls: ToolCallItem[];
  toolResults: ToolExecutionResult[];
  guardAlerts: AgentGuardAlert[];
  tokenUsage?: TokenUsage;
  durationMs: number;
  messagesSnapshot: ChatMessage[];
  isFinishStep?: boolean;
}

export interface AgentLoopConfig {
  maxSteps?: number;
  maxConsecutiveErrors?: number;
  loopDetectThreshold?: number;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  apiKey?: string;
  baseURL?: string;
  enableLoopProtection?: boolean;
  enableSelfCorrection?: boolean;
  workspaceDir?: string;
}

export interface AgentLoopResult {
  success: boolean;
  finalAnswer: string;
  totalSteps: number;
  totalDurationMs: number;
  finishReason: "completed" | "circuit_break" | "max_steps_exceeded" | "error";
  steps: AgentStepRecord[];
  allMessages: ChatMessage[];
  totalTokenUsage: TokenUsage;
  guardAlerts: AgentGuardAlert[];
}

export type AgentStreamEvent =
  | {
      type: "agent_start";
      task: string;
      maxSteps: number;
      model: string;
    }
  | {
      type: "step_start";
      step: number;
      maxSteps: number;
    }
  | {
      type: "thought";
      step: number;
      content: string;
    }
  | {
      type: "tool_start";
      step: number;
      toolCalls: ToolCallItem[];
    }
  | {
      type: "tool_end";
      step: number;
      toolResults: ToolExecutionResult[];
    }
  | {
      type: "guard_alert";
      step: number;
      alert: AgentGuardAlert;
    }
  | {
      type: "step_end";
      step: number;
      stepRecord: AgentStepRecord;
    }
  | {
      type: "agent_done";
      result: AgentLoopResult;
    }
  | {
      type: "error";
      message: string;
    };


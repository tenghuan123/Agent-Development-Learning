import type { ChatMessage, TokenUsage } from "../llm/types";
import type { AgentStepRecord } from "../agent/types";
import type { Plan } from "../planner/types";

/**
 * L3 Semantic Memory Item Categories
 */
export type MemoryCategory =
  | "preference"    // User preferences (e.g. coding style, language, indentation)
  | "convention"    // Project conventions & architectural rules (e.g. framework choice, port 9090, API format)
  | "learning"      // Discoveries, self-healed bug takeaways, caveats
  | "architecture"; // Tech stack details, component structure

/**
 * A single persistent memory item in the Memory Bank (L3)
 */
export interface MemoryItem {
  id: string;
  category: MemoryCategory;
  key: string;            // Compact lookup key (e.g. "port_config", "test_runner", "ts_strict")
  content: string;        // Detailed memory statement or rule
  tags: string[];         // Search tags
  source?: "user_taught" | "auto_reflected" | "manual_entry" | "agent_saved";
  confidence?: number;    // 0.0 - 1.0 confidence score
  accessCount: number;    // Number of times recalled
  lastAccessedAt?: string;// ISO timestamp
  createdAt: string;      // ISO timestamp
  updatedAt: string;      // ISO timestamp
}

/**
 * Memory Bank Query & Filter Options
 */
export interface MemoryQueryFilter {
  category?: MemoryCategory | "all";
  query?: string;
  tags?: string[];
  limit?: number;
  minConfidence?: number;
}

/**
 * Memory Bank State representation
 */
export interface MemoryBankState {
  version: string;
  items: MemoryItem[];
  lastModified: string;
}

/**
 * L1 Working Memory (Scratchpad for active session)
 */
export interface WorkingMemory {
  hypotheses: string[];     // Current working hypotheses being tested
  facts: string[];          // Verified facts discovered during current run
  currentFocus: string;     // Immediate mini-focus
  notes: string[];          // Freeform scratchpad thoughts
  updatedAt: string;
}

/**
 * L2 Episodic Memory: Session Execution States
 */
export type SessionState = "idle" | "running" | "paused" | "completed" | "crashed";

/**
 * L2 Episodic Memory: Session Step Snapshot
 */
export interface SessionStep {
  step: number;
  thought: string;
  action?: {
    toolName: string;
    args: Record<string, any>;
  };
  observation?: string;
  error?: string;
  durationMs?: number;
  timestamp: string;
}

/**
 * Complete Checkpoint Snapshot of a Session
 */
export interface SessionSnapshot {
  sessionId: string;
  userGoal: string;
  state: SessionState;
  currentStep: number;
  maxSteps: number;
  planState?: Plan | null;
  workingMemory: WorkingMemory;
  recalledMemoryIds: string[];
  steps: SessionStep[];
  messages: ChatMessage[];
  tokenUsage: TokenUsage;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

/**
 * Session metadata summary for listing
 */
export interface SessionSummary {
  sessionId: string;
  userGoal: string;
  state: SessionState;
  stepCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Auto-Reflection Result
 */
export interface LearnedInsight {
  category: MemoryCategory;
  key: string;
  content: string;
  tags: string[];
  confidence: number;
  reasoning: string;
}

export interface ReflectionResult {
  sessionId: string;
  success: boolean;
  insights: LearnedInsight[];
  summary: string;
  rawReflectionOutput?: string;
  savedMemoryCount: number;
}

/**
 * Stream events emitted during MemoryAgent execution
 */
export type MemoryStreamEvent =
  | {
      type: "session_created" | "session_resumed" | "session_paused" | "session_completed" | "session_crashed";
      sessionId: string;
      state: SessionState;
      data?: any;
    }
  | {
      type: "memory_recalled";
      sessionId: string;
      memories: MemoryItem[];
      query: string;
    }
  | {
      type: "memory_saved";
      sessionId: string;
      memory: MemoryItem;
    }
  | {
      type: "memory_deleted";
      sessionId: string;
      memoryId: string;
    }
  | {
      type: "scratchpad_updated";
      sessionId: string;
      workingMemory: WorkingMemory;
    }
  | {
      type: "checkpoint_saved";
      sessionId: string;
      step: number;
      snapshot: Partial<SessionSnapshot>;
    }
  | {
      type: "step_start";
      step: number;
      totalSteps: number;
    }
  | {
      type: "thought";
      step: number;
      thought: string;
    }
  | {
      type: "tool_call";
      step: number;
      toolName: string;
      args: Record<string, any>;
    }
  | {
      type: "tool_result";
      step: number;
      toolName: string;
      result: string;
    }
  | {
      type: "reflection_start";
      sessionId: string;
    }
  | {
      type: "reflection_completed";
      sessionId: string;
      result: ReflectionResult;
    }
  | {
      type: "agent_finish";
      sessionId: string;
      finalAnswer: string;
      totalSteps: number;
      tokenUsage: TokenUsage;
    }
  | {
      type: "agent_error";
      sessionId: string;
      error: string;
    };


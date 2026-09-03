import { LLMClient } from "../llm/client";
import type { ChatMessage, TokenUsage } from "../llm/types";
import { builtinTools } from "../tools/builtins";
import { ToolExecutor } from "../tools/executor";
import { ToolRegistry } from "../tools/registry";
import { LoopDetector } from "./loop-detector";
import { PlanManager } from "../planner/plan-manager";
import { createManagePlanTool } from "../tools/builtins/manage-plan";
import { ContextEngine } from "../context/context-engine";
import type { ContextEngineConfig } from "../context/types";
import { SmartTruncator } from "../context/truncator";
import {
  MemoryBank,
  WorkingMemoryManager,
  SessionStore,
  ReflectionEngine,
  createManageMemoryTool,
  createScratchpadTool,
} from "../memory";
import type {
  MemoryItem,
  MemoryStreamEvent,
  ReflectionResult,
  SessionSnapshot,
  SessionStep,
} from "../memory/types";

export interface MemoryAgentConfig {
  maxSteps?: number;
  maxConsecutiveErrors?: number;
  loopDetectThreshold?: number;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  apiKey?: string;
  baseURL?: string;
  workspaceDir?: string;
  memoryEnabled?: boolean;
  autoReflect?: boolean;
  planningEnabled?: boolean;
  contextEngineEnabled?: boolean;
  contextEngineConfig?: ContextEngineConfig;
  memoryBank?: MemoryBank;
  sessionStore?: SessionStore;
}

export interface MemoryAgentResult {
  sessionId: string;
  status: "completed" | "max_steps_reached" | "stuck_in_loop" | "error" | "paused";
  finalAnswer: string;
  steps: SessionStep[];
  tokenUsage: TokenUsage;
  workingMemory: ReturnType<WorkingMemoryManager["getState"]>;
  recalledMemories: MemoryItem[];
  reflection?: ReflectionResult;
  snapshot: SessionSnapshot;
}

export class MemoryAgent {
  private llmClient: LLMClient;
  private registry: ToolRegistry;
  private executor: ToolExecutor;
  private loopDetector: LoopDetector;
  private planManager: PlanManager;
  private contextEngine: ContextEngine;
  private memoryBank: MemoryBank;
  private workingMemory: WorkingMemoryManager;
  private sessionStore: SessionStore;

  private config: Required<
    Omit<
      MemoryAgentConfig,
      | "contextEngineConfig"
      | "systemPrompt"
      | "memoryBank"
      | "sessionStore"
    >
  > & {
    systemPrompt?: string;
    contextEngineConfig?: ContextEngineConfig;
    memoryBank?: MemoryBank;
    sessionStore?: SessionStore;
  };

  constructor(config?: MemoryAgentConfig) {
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
      memoryEnabled: config?.memoryEnabled ?? true,
      autoReflect: config?.autoReflect ?? true,
      planningEnabled: config?.planningEnabled ?? true,
      contextEngineEnabled: config?.contextEngineEnabled ?? true,
      systemPrompt: config?.systemPrompt,
      contextEngineConfig: config?.contextEngineConfig,
      memoryBank: config?.memoryBank,
      sessionStore: config?.sessionStore,
    };

    this.llmClient = new LLMClient({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
      defaultModel: this.config.model,
    });

    this.memoryBank = config?.memoryBank || new MemoryBank();
    this.sessionStore = config?.sessionStore || new SessionStore();
    this.workingMemory = new WorkingMemoryManager();
    this.planManager = new PlanManager();

    this.registry = new ToolRegistry();
    builtinTools.forEach((tool) => this.registry.register(tool as any));

    // Register Planning Tool
    if (this.config.planningEnabled) {
      this.registry.register(createManagePlanTool(this.planManager) as any);
    }

    // Register Memory & Scratchpad Tools
    if (this.config.memoryEnabled) {
      this.registry.register(createManageMemoryTool(this.memoryBank) as any);
      this.registry.register(createScratchpadTool(this.workingMemory) as any);
    }

    this.executor = new ToolExecutor(this.registry, {
      workspaceDir: this.config.workspaceDir,
      maxOutputLength: 16000,
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
   * Run a new session from a user goal
   */
  public async run(
    userGoal: string,
    onStreamEvent?: (event: MemoryStreamEvent) => void
  ): Promise<MemoryAgentResult> {
    const session = this.sessionStore.createSession({
      userGoal,
      maxSteps: this.config.maxSteps,
    });

    onStreamEvent?.({
      type: "session_created",
      sessionId: session.sessionId,
      state: "running",
      data: { userGoal },
    });

    return this.executeSessionLoop(session, onStreamEvent);
  }

  /**
   * Resume an existing paused or interrupted session
   */
  public async resume(
    sessionId: string,
    onStreamEvent?: (event: MemoryStreamEvent) => void
  ): Promise<MemoryAgentResult> {
    const snapshot = this.sessionStore.getSnapshot(sessionId);
    if (!snapshot) {
      throw new Error(`Session '${sessionId}' not found in SessionStore.`);
    }

    // Restore state machines
    if (snapshot.planState) {
      this.planManager.loadPlan(snapshot.planState);
    }
    this.workingMemory.setState(snapshot.workingMemory);
    this.sessionStore.updateState(sessionId, "running");

    onStreamEvent?.({
      type: "session_resumed",
      sessionId,
      state: "running",
      data: { currentStep: snapshot.currentStep },
    });

    return this.executeSessionLoop(snapshot, onStreamEvent);
  }

  /**
   * The unified execution engine for fresh and resumed sessions
   */
  private async executeSessionLoop(
    session: SessionSnapshot,
    onStreamEvent?: (event: MemoryStreamEvent) => void
  ): Promise<MemoryAgentResult> {
    const sessionId = session.sessionId;
    let currentStep = session.currentStep;
    let consecutiveErrors = 0;
    const totalUsage: TokenUsage = { ...session.tokenUsage };
    let finalAnswer = "";
    let status: MemoryAgentResult["status"] = "completed";

    // 1. Pre-Task Memory Recall (L3)
    let recalledMemories: MemoryItem[] = [];
    if (this.config.memoryEnabled) {
      recalledMemories = this.memoryBank.recall(session.userGoal, { limit: 4 });
      if (recalledMemories.length > 0) {
        onStreamEvent?.({
          type: "memory_recalled",
          sessionId,
          memories: recalledMemories,
          query: session.userGoal,
        });
      }
    }

    // 2. Initialize Messages if fresh session
    const messages: ChatMessage[] = session.messages.length > 0 ? [...session.messages] : [];
    if (messages.length === 0) {
      const systemPromptText = this.buildSystemPrompt(recalledMemories);
      messages.push({ role: "system", content: systemPromptText });
      messages.push({
        role: "user",
        content: `Goal: ${session.userGoal}\n\nPlease analyze the goal, leverage recalled memories and conventions, formulate a plan if complex, and execute autonomously.`,
      });
    }

    // Main Agent Step Loop
    while (currentStep < this.config.maxSteps) {
      currentStep++;
      onStreamEvent?.({
        type: "step_start",
        step: currentStep,
        totalSteps: this.config.maxSteps,
      });

      // Prepare context with dynamic pruning or anchor injection
      const dynamicMessages = this.prepareStepMessages(messages);

      // Call LLM
      const tools = this.registry.toOpenAITools();
      let response;
      try {
        response = await this.llmClient.chat({
          messages: dynamicMessages,
          tools,
          model: this.config.model,
          temperature: this.config.temperature,
        });
      } catch (err: any) {
        consecutiveErrors++;
        const errMsg = err?.message || String(err);
        onStreamEvent?.({ type: "agent_error", sessionId, error: errMsg });

        if (consecutiveErrors >= this.config.maxConsecutiveErrors) {
          status = "error";
          finalAnswer = `Agent terminated due to ${consecutiveErrors} consecutive LLM errors: ${errMsg}`;
          break;
        }
        continue;
      }

      consecutiveErrors = 0;
      if (response.usage) {
        totalUsage.promptTokens += response.usage.promptTokens;
        totalUsage.completionTokens += response.usage.completionTokens;
        totalUsage.totalTokens += response.usage.totalTokens;
      }

      const thought = response.content || "";
      onStreamEvent?.({
        type: "thought",
        step: currentStep,
        thought,
      });

      // Case A: Model responded with plain text without tool calls -> Finished
      if (!response.toolCalls || response.toolCalls.length === 0) {
        finalAnswer = thought;
        status = "completed";

        const stepRecord: SessionStep = {
          step: currentStep,
          thought,
          timestamp: new Date().toISOString(),
        };

        messages.push({ role: "assistant", content: thought });

        this.sessionStore.saveCheckpoint(sessionId, {
          currentStep,
          state: "completed",
          stepRecord,
          messages,
          tokenUsage: totalUsage,
          planState: this.planManager.hasPlan() ? this.planManager.getPlan() : null,
          workingMemory: this.workingMemory.getState(),
        });

        break;
      }

      // Case B: Model called tools
      const toolCall = response.toolCalls[0];
      const toolName = toolCall.function.name;
      let toolArgs: Record<string, any>;
      try {
        toolArgs =
          typeof toolCall.function.arguments === "string"
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments || {};
      } catch {
        toolArgs = {};
      }

      onStreamEvent?.({
        type: "tool_call",
        step: currentStep,
        toolName,
        args: toolArgs,
      });

      // Execute tool
      const execStartTime = Date.now();
      let toolResult: string;
      let toolError: string | undefined;

      try {
        const res = await this.executor.executeSingle(toolCall);
        toolResult = res.output;
        if (res.isError) {
          toolError = res.output;
        }
      } catch (err: any) {
        toolResult = `Tool execution failed: ${err?.message || String(err)}`;
        toolError = toolResult;
      }

      const durationMs = Date.now() - execStartTime;

      // Smart Truncation for safety
      const safeOutput = SmartTruncator.truncateLog(toolResult, {
        maxLines: 120,
        headLines: 30,
        tailLines: 60,
        preserveErrors: true,
      }).content;

      onStreamEvent?.({
        type: "tool_result",
        step: currentStep,
        toolName,
        result: safeOutput,
      });

      // Record step snapshot
      const stepRecord: SessionStep = {
        step: currentStep,
        thought,
        action: { toolName, args: toolArgs },
        observation: safeOutput,
        error: toolError,
        durationMs,
        timestamp: new Date().toISOString(),
      };

      // Append assistant message and tool observation message
      messages.push({
        role: "assistant",
        content: thought,
        tool_calls: response.toolCalls as any,
      });
      messages.push({
        role: "tool",
        name: toolName,
        tool_call_id: toolCall.id,
        content: safeOutput,
      });

      // Checkpoint immediately into SessionStore (L2)
      this.sessionStore.saveCheckpoint(sessionId, {
        currentStep,
        state: "running",
        stepRecord,
        messages,
        tokenUsage: totalUsage,
        planState: this.planManager.hasPlan() ? this.planManager.getPlan() : null,
        workingMemory: this.workingMemory.getState(),
      });

      onStreamEvent?.({
        type: "checkpoint_saved",
        sessionId,
        step: currentStep,
        snapshot: { currentStep, state: "running" },
      });

      // Loop detection
      const loopAlert = this.loopDetector.record(thought, response.toolCalls || []);
      if (loopAlert && loopAlert.action === "circuit_break") {
        status = "stuck_in_loop";
        finalAnswer = `Terminated: ${loopAlert.reason}`;
        this.sessionStore.updateState(sessionId, "crashed");
        break;
      }
    }

    if (currentStep >= this.config.maxSteps && status !== "completed") {
      status = "max_steps_reached";
      finalAnswer = `Reached maximum step budget (${this.config.maxSteps}).`;
      this.sessionStore.updateState(sessionId, "paused");
    }

    // 3. Post-Task Auto-Reflection (L3 Auto-Learning)
    let reflectionResult: ReflectionResult | undefined;
    const finalSnapshot = this.sessionStore.getSnapshot(sessionId)!;

    if (this.config.autoReflect && this.config.memoryEnabled && finalSnapshot.steps.length > 1) {
      onStreamEvent?.({ type: "reflection_start", sessionId });

      reflectionResult = await ReflectionEngine.reflectOnSession({
        snapshot: finalSnapshot,
        memoryBank: this.memoryBank,
        llmClient: this.llmClient,
        model: this.config.model,
      });

      onStreamEvent?.({
        type: "reflection_completed",
        sessionId,
        result: reflectionResult,
      });
    }

    this.sessionStore.updateState(
      sessionId,
      status === "completed" ? "completed" : status === "max_steps_reached" ? "paused" : "crashed"
    );

    onStreamEvent?.({
      type: "agent_finish",
      sessionId,
      finalAnswer,
      totalSteps: currentStep,
      tokenUsage: totalUsage,
    });

    return {
      sessionId,
      status,
      finalAnswer,
      steps: finalSnapshot.steps,
      tokenUsage: totalUsage,
      workingMemory: this.workingMemory.getState(),
      recalledMemories,
      reflection: reflectionResult,
      snapshot: this.sessionStore.getSnapshot(sessionId)!,
    };
  }

  /**
   * Build comprehensive System Prompt with Memory Bank knowledge
   */
  private buildSystemPrompt(recalledMemories: MemoryItem[]): string {
    let prompt =
      this.config.systemPrompt ||
      `You are Mini Claude Code (V6: Memory & State-Engine Edition), an autonomous coding agent with long-term memory, working scratchpad, and state persistence capabilities.

Your core traits:
1. ReAct Loop: For each step, think clearly (Thought), choose an action (Action), and inspect results (Observation).
2. Follow Memory: Obey all recalled long-term conventions, style preferences, and project rules.
3. Manage Scratchpad: Use 'scratchpad' tool when formulating hypotheses or logging critical facts during complex tasks.
4. Continuous Planning: Use 'manage_plan' tool for multi-step workflows.
5. Code Safety: Always read files before editing; verify changes by running tests or build commands.`;

    if (this.config.memoryEnabled && recalledMemories.length > 0) {
      const memoryBlock = this.memoryBank.formatForPrompt(recalledMemories);
      prompt += `\n\n${memoryBlock}`;
    }

    return prompt;
  }

  /**
   * Dynamically prepare messages for the next LLM step (injecting anchors & working memory)
   */
  private prepareStepMessages(messages: ChatMessage[]): ChatMessage[] {
    const workingMemoryBlock = this.workingMemory.formatForPrompt();
    const planAnchor = this.planManager.hasPlan() ? this.planManager.renderAttentionAnchor() : "";

    if (!workingMemoryBlock && !planAnchor) {
      return messages;
    }

    // Insert or update transient anchor in the last user message or system
    const result = [...messages];
    const anchorText = [workingMemoryBlock, planAnchor].filter(Boolean).join("\n\n");

    // Inject as a lightweight context reminder before the model acts
    if (result.length > 0 && result[result.length - 1].role === "tool") {
      result[result.length - 1] = {
        ...result[result.length - 1],
        content: result[result.length - 1].content + `\n\n[Context Anchor Reminder]:\n${anchorText}`,
      };
    }

    return result;
  }

  public getMemoryBank(): MemoryBank {
    return this.memoryBank;
  }

  public getSessionStore(): SessionStore {
    return this.sessionStore;
  }

  public getWorkingMemory(): WorkingMemoryManager {
    return this.workingMemory;
  }
}


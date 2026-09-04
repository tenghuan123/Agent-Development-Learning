import type { ChatMessage } from "../llm/types";
import type { ToolExecutionResult } from "../tools/types";
import { PureAgentCore, type AgentCoreConfig } from "./agent-core";
import { EventStream } from "./event-stream";
import { SessionManager } from "./session";
import { SafeToolExecutor } from "./tool-executor";
import type {
  AgentCore,
  InboundMessage,
  RuntimeState,
  SessionRun,
  SessionSnapshot,
} from "./types";

export interface AgentRuntimeOptions {
  core?: AgentCore;
  coreConfig?: AgentCoreConfig;
  sessionManager?: SessionManager;
  toolExecutor?: SafeToolExecutor;
  eventStream?: EventStream;
  workspaceDir?: string;
}

export class AgentRuntime {
  public readonly sessionManager: SessionManager;
  public readonly toolExecutor: SafeToolExecutor;
  public readonly eventStream: EventStream;
  private core: AgentCore;

  private currentRunId: string | null = null;
  private currentAbortController: AbortController | null = null;
  private inboundQueue: InboundMessage[] = [];
  private state: RuntimeState = "idle";
  private suspendRequested = false;

  constructor(options: AgentRuntimeOptions = {}) {
    this.sessionManager = options.sessionManager || new SessionManager();
    this.toolExecutor =
      options.toolExecutor || new SafeToolExecutor(undefined, options.workspaceDir);
    this.eventStream = options.eventStream || new EventStream();
    this.core =
      options.core ||
      new PureAgentCore(options.coreConfig || {});
  }

  public getState(): RuntimeState {
    return this.state;
  }

  public isSuspended(): boolean {
    return this.suspendRequested || (this.state as string) === "suspended";
  }

  public getCurrentRunId(): string | null {
    return this.currentRunId;
  }

  private transitionState(nextState: RuntimeState, reason?: string): void {
    const fromState = this.state;
    // If currently suspended and not explicitly resuming or resetting, prevent transition back to running/waiting
    if (this.suspendRequested && nextState !== "suspended" && nextState !== "idle" && nextState !== "aborted") {
      return;
    }
    this.state = nextState;
    if (this.currentRunId) {
      this.sessionManager.updateRunStatus(this.currentRunId, nextState);
      this.eventStream.emit({
        type: "runtime:state_change",
        runId: this.currentRunId,
        fromState,
        toState: nextState,
        reason,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Start a new agent execution run.
   */
  async start(
    prompt: string,
    options: { maxSteps?: number; branchId?: string } = {}
  ): Promise<SessionRun> {
    const run = this.sessionManager.createRun(prompt, {
      branchId: options.branchId || "main",
    });

    this.currentRunId = run.id;
    this.currentAbortController = new AbortController();
    this.inboundQueue = [];
    this.suspendRequested = false;
    const maxSteps = options.maxSteps ?? 8;

    this.transitionState("running", "Run initialized");

    this.eventStream.emit({
      type: "run:start",
      runId: run.id,
      branchId: run.branchId,
      inputPrompt: prompt,
      timestamp: Date.now(),
    });

    // Execute run loop
    await this.runLoop(run.id, maxSteps);

    return this.sessionManager.getRun(run.id)!;
  }

  /**
   * Mid-flight interruption: Injects user input while the agent is active,
   * without killing the session or losing history.
   */
  interrupt(message: string, priority: "immediate" | "next_step" = "next_step"): void {
    if (!this.currentRunId) {
      throw new Error("No active run to interrupt");
    }

    const inboundMsg: InboundMessage = {
      id: `inbound_${Date.now()}`,
      content: message,
      priority,
      timestamp: Date.now(),
    };

    this.inboundQueue.push(inboundMsg);

    const run = this.sessionManager.getRun(this.currentRunId);
    this.eventStream.emit({
      type: "user:interrupt",
      runId: this.currentRunId,
      message,
      injectedAtStep: run?.currentStep || 0,
      timestamp: Date.now(),
    });
  }

  /**
   * Hard Abort: Cascades cancellation to LLM and active tool processes.
   */
  abort(reason = "Aborted by user"): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }

    const killedTools = this.toolExecutor.killAllActive();
    this.transitionState("aborted", reason);

    if (this.currentRunId) {
      this.eventStream.emit({
        type: "runtime:abort",
        runId: this.currentRunId,
        reason,
        cascadeKilledTools: killedTools,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Suspend execution and return a durable snapshot point.
   */
  suspend(): SessionSnapshot | null {
    if (!this.currentRunId) return null;

    const run = this.sessionManager.getRun(this.currentRunId);
    if (!run) return null;

    this.suspendRequested = true;
    this.transitionState("suspended", "Manual suspension requested");

    const snapshot = this.sessionManager.saveSnapshot(run.id, run.currentStep);

    // Gently interrupt active tool execution and LLM call
    this.toolExecutor.killAllActive();
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }

    if (snapshot) {
      this.eventStream.emit({
        type: "runtime:suspend",
        runId: this.currentRunId,
        snapshotId: snapshot.snapshotId,
        savedStep: run.currentStep,
        timestamp: Date.now(),
      });
    }

    return snapshot;
  }

  /**
   * Resume execution from a checkpoint snapshot.
   */
  async resume(snapshotId: string, maxSteps = 8): Promise<SessionRun> {
    const resumedRun = this.sessionManager.restoreSnapshot(snapshotId);
    if (!resumedRun) {
      throw new Error(`Snapshot '${snapshotId}' not found for resume`);
    }

    this.currentRunId = resumedRun.id;
    this.currentAbortController = new AbortController();
    this.inboundQueue = [];
    this.suspendRequested = false;

    this.transitionState("running", `Resumed from snapshot ${snapshotId}`);

    this.eventStream.emit({
      type: "run:start",
      runId: resumedRun.id,
      branchId: resumedRun.branchId,
      inputPrompt: `[从快照 ${snapshotId} 恢复执行]`,
      timestamp: Date.now(),
    });

    await this.runLoop(resumedRun.id, maxSteps);
    return this.sessionManager.getRun(resumedRun.id)!;
  }

  /**
   * The Supervisor Loop: Coordinates Core, Session, ToolExecutor, and EventStream.
   */
  private async runLoop(runId: string, maxSteps: number): Promise<void> {
    const startTime = Date.now();

    try {
      while (true) {
        const run = this.sessionManager.getRun(runId);
        if (!run) break;

        // Check if suspended
        if (this.isSuspended()) {
          this.transitionState("suspended", "Suspended by user");
          break;
        }

        // Check if aborted
        if (this.currentAbortController?.signal.aborted) {
          if (this.isSuspended()) {
            this.transitionState("suspended", "Suspended by user");
            break;
          }
          this.transitionState("aborted", "Abort signal received");
          this.eventStream.emit({
            type: "run:finish",
            runId,
            success: false,
            finalAnswer: "[任务已被中断终止]",
            totalSteps: run.currentStep,
            totalDurationMs: Date.now() - startTime,
            finishReason: "aborted",
            timestamp: Date.now(),
          });
          break;
        }

        // Check max steps
        if (run.currentStep >= maxSteps) {
          this.transitionState("completed", "Max steps reached");
          this.eventStream.emit({
            type: "run:finish",
            runId,
            success: false,
            finalAnswer: `[达到最大步数限制: ${maxSteps} 步，停止运行]`,
            totalSteps: run.currentStep,
            totalDurationMs: Date.now() - startTime,
            finishReason: "max_steps",
            timestamp: Date.now(),
          });
          break;
        }

        // Drain inbound queue (mid-flight interrupts safely injected at step boundary)
        while (this.inboundQueue.length > 0) {
          const inbound = this.inboundQueue.shift()!;
          const interruptMessage: ChatMessage = {
            role: "user",
            content: `[用户中途插话指示]: ${inbound.content}`,
          };
          run.messages.push(interruptMessage);
        }

        // Emit step start
        const stepNumber = run.currentStep + 1;
        this.eventStream.emit({
          type: "step:start",
          runId,
          stepNumber,
          timestamp: Date.now(),
        });

        // 1. Take Snapshot before step decision
        this.sessionManager.saveSnapshot(runId, run.currentStep);
        const snapshot = this.sessionManager.getLatestSnapshot(runId);
        if (!snapshot) break;

        // 2. Pure AgentCore Decision (No I/O)
        this.transitionState("running");
        let decision;
        try {
          decision = await this.core.step(snapshot, this.currentAbortController!.signal);
        } catch (err: any) {
          if (this.isSuspended()) {
            this.transitionState("suspended", "Suspended during decision");
            break;
          }
          if (this.currentAbortController?.signal.aborted) {
            break;
          }
          throw err;
        }

        // Check suspend immediately after core.step
        if (this.isSuspended()) {
          this.transitionState("suspended", "Suspended after decision");
          break;
        }

        // Emit LLM Thought
        this.eventStream.emit({
          type: "llm:thought",
          runId,
          stepNumber,
          thought: decision.thought,
          timestamp: Date.now(),
        });

        // 3. Handle Decision
        if (decision.type === "finish") {
          const assistantMsg: ChatMessage = {
            role: "assistant",
            content: decision.finalAnswer,
          };
          run.messages.push(assistantMsg);
          run.currentStep = stepNumber;

          this.transitionState("completed", "Core returned finish decision");
          this.eventStream.emit({
            type: "run:finish",
            runId,
            success: true,
            finalAnswer: decision.finalAnswer,
            totalSteps: stepNumber,
            totalDurationMs: Date.now() - startTime,
            finishReason: "completed",
            timestamp: Date.now(),
          });
          break;
        }

        if (decision.type === "ask_user") {
          const assistantMsg: ChatMessage = {
            role: "assistant",
            content: `[需用户确认]: ${decision.question}`,
          };
          run.messages.push(assistantMsg);
          run.currentStep = stepNumber;

          this.transitionState("suspended", "Waiting for user input");
          break;
        }

        if (decision.type === "call_tools") {
          // Record assistant tool calls
          const assistantMsg: ChatMessage = {
            role: "assistant",
            content: decision.thought,
            tool_calls: decision.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            })),
          };
          run.messages.push(assistantMsg);

          // 4. Safe Tool Execution via ToolExecutor
          this.transitionState("waiting_tool", "Executing tools");
          const toolResults: ToolExecutionResult[] = [];

          for (const toolCall of decision.toolCalls) {
            // Check abort or suspend before each tool
            if (this.isSuspended()) {
              break;
            }
            if (this.currentAbortController?.signal.aborted) {
              break;
            }

            this.eventStream.emit({
              type: "tool:start",
              runId,
              stepNumber,
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              inputArgs: toolCall.function.arguments,
              timestamp: Date.now(),
            });

            // Execute with streaming chunk forwarder
            const result = await this.toolExecutor.execute(toolCall, {
              signal: this.currentAbortController?.signal,
              onStreamChunk: (chunk) => {
                this.eventStream.emit({
                  type: "tool:chunk",
                  runId,
                  toolCallId: toolCall.id,
                  toolName: toolCall.function.name,
                  streamType: chunk.streamType,
                  chunk: chunk.text,
                  timestamp: Date.now(),
                });
              },
            });

            toolResults.push(result);

            this.eventStream.emit({
              type: "tool:end",
              runId,
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              output: result.output,
              isError: result.isError,
              durationMs: result.executionTimeMs,
              timestamp: Date.now(),
            });

            // Append tool message
            const toolMsg: ChatMessage = {
              role: "tool",
              tool_call_id: toolCall.id,
              content: result.output,
            };
            run.messages.push(toolMsg);

            // Check suspend immediately after tool call
            if (this.isSuspended()) {
              break;
            }
          }

          run.toolHistory.push(...toolResults);
          run.currentStep = stepNumber;

          // If suspended during tool calls, break the outer while loop!
          if (this.isSuspended()) {
            this.transitionState("suspended", "Suspended after tool calls");
            break;
          }
        }
      }
    } catch (err: any) {
      if (this.isSuspended()) {
        this.transitionState("suspended", "Suspended by user");
        return;
      }
      this.transitionState("error", err.message);
      this.eventStream.emit({
        type: "error",
        runId,
        error: err.message || String(err),
        fatal: true,
        timestamp: Date.now(),
      });
    } finally {
      this.currentAbortController = null;
    }
  }
}

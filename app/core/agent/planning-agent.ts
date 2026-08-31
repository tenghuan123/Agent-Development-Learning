import * as fs from "node:fs";
import * as path from "node:path";
import { LLMClient } from "../llm/client";
import type { ChatMessage } from "../llm/types";
import { builtinTools } from "../tools/builtins";
import { createManagePlanTool } from "../tools/builtins/manage-plan";
import { ToolExecutor } from "../tools/executor";
import { ToolRegistry } from "../tools/registry";
import { LoopDetector } from "./loop-detector";
import type {
  AgentGuardAlert,
  AgentStepRecord,
} from "./types";
import { PlanManager } from "../planner/plan-manager";
import { WorkflowRouter } from "../planner/workflow-router";
import type {
  PlanningAgentResult,
  PlanningStreamEvent,
  RoutingDecision,
  WorkflowMode,
} from "../planner/types";

export interface PlanningAgentConfig {
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
  forcedMode?: WorkflowMode | "auto";
}

function buildProjectGroundingContext(workspaceDir: string = process.cwd()): string {
  try {
    let pkgSummary = "";
    const pkgPath = path.resolve(workspaceDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const scripts = Object.keys(pkg.scripts || {}).join(", ") || "none";
      const deps = Object.keys(pkg.dependencies || {}).join(", ") || "none";
      const devDeps = Object.keys(pkg.devDependencies || {}).join(", ") || "none";
      pkgSummary = `type: "${pkg.type || "commonjs"}" | scripts: [${scripts}] | dependencies: [${deps}] | devDependencies: [${devDeps}]`;
    }

    return [
      "",
      "### AUTOMATIC PROJECT GROUNDING (Zero-turn Context Injection):",
      `- Workspace Directory: ${workspaceDir}`,
      `- Runtime Environment: Node.js ${process.version} (Native ESM & TypeScript stripping enabled)`,
      `- Package Manifest: ${pkgSummary || "No package.json found"}`,
      "- CRITICAL EXECUTION RULES:",
      "  1. In this Native ESM project, when importing relative local files, ALWAYS include explicit file extensions (e.g. import { Foo } from './foo.ts';).",
      "  2. For tests/scripts, execute directly with 'node <path.ts>'. Do NOT use 'npx jest' or 'npx vitest' unless they are explicitly installed in package.json.",
      "  3. When writing code, ALWAYS implement full, complete functionality and export statements. Do not leave placeholder comments.",
    ].join("\n");
  } catch {
    return "";
  }
}

const DEFAULT_PLANNING_SYSTEM_PROMPT = `You are Mini Claude Code (Planning Engine), an advanced autonomous AI Engineering Agent capable of solving complex multi-step software tasks through structured task decomposition, dynamic state tracking, precise coding, and verification.

You have access to coding tools (read_file, edit_file, write_file, run_command, list_dir, calculate) AND the special 'manage_plan' tool.

### MANDATORY PLANNING WORKFLOW:
1. PHASE 1: Plan Creation
   - When given a complex or multi-step engineering goal, FIRST inspect existing code structure if necessary (using list_dir / read_file).
   - Then IMMEDIATELY call 'manage_plan' with action='create_plan' to break down the goal into 2-5 clear, ordered, verifiable tasks.
   - Immediately call 'manage_plan' with action='start_task' for the first task (e.g. 'task_1').

2. PHASE 2: Step-by-Step Focused Execution (Single Focus Invariant)
   - Work STRICTLY on the single task that is currently marked [IN PROGRESS].
   - Do NOT try to solve multiple subsequent tasks in one single step.
   - Use 'read_file' before 'edit_file' to ensure exact search-and-replace matches.
   - Use 'run_command' to run tests, linters, or typecheckers to verify your changes.

3. PHASE 3: Verification & Task Transition
   - Once the current task is verified, call 'manage_plan' with action='complete_task' and include a precise 'summary' of what was verified.
   - Then call 'manage_plan' with action='start_task' to start the next pending task.

4. PHASE 4: Dynamic Re-planning (Adaptive Fallback)
   - If you encounter unexpected constraints, missing dependencies, or architecture changes, DO NOT brute force.
   - Call 'manage_plan' with action='replan', explaining the reason and providing updated tasks.

5. PHASE 5: Final Comprehensive Summary
   - Once ALL tasks in the plan are marked COMPLETED, provide a thorough, well-structured final summary of everything delivered to the user without calling more tools.

### ENVIRONMENT & RUNTIME GUIDELINES:
- This workspace runs Node.js (v24+ ESM). It supports executing TypeScript files directly using 'node <path.ts>' or 'node --test <path.ts>'.
- Do NOT assume external test runners like 'jest' or 'vitest' are installed unless you inspect package.json first. For standalone verification, write self-contained test scripts that assert conditions and run with 'node <file.ts>'.
- When 'run_command' returns an error or non-zero exit code, read the error output carefully and fix the underlying code or command in your next step.`;

export class PlanningAgentRunner {
  private config: Required<PlanningAgentConfig>;
  private llmClient: LLMClient;
  private loopDetector: LoopDetector;
  private workflowRouter: WorkflowRouter;

  constructor(config: PlanningAgentConfig = {}) {
    this.config = {
      maxSteps: config.maxSteps ?? 35,
      maxConsecutiveErrors: config.maxConsecutiveErrors ?? 3,
      loopDetectThreshold: config.loopDetectThreshold ?? 3,
      model: config.model || process.env.LLM_MODEL || "glm-4-flash",
      systemPrompt: config.systemPrompt || DEFAULT_PLANNING_SYSTEM_PROMPT,
      temperature: config.temperature ?? 0.1,
      apiKey: config.apiKey || process.env.LLM_API_KEY || "",
      baseURL:
        config.baseURL ||
        process.env.LLM_BASE_URL ||
        "https://open.bigmodel.cn/api/paas/v4",
      enableLoopProtection: config.enableLoopProtection ?? true,
      enableSelfCorrection: config.enableSelfCorrection ?? true,
      workspaceDir: config.workspaceDir || process.cwd(),
      forcedMode: config.forcedMode || "auto",
    };

    this.llmClient = new LLMClient({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
      defaultModel: this.config.model,
    });
    this.loopDetector = new LoopDetector();
    this.workflowRouter = new WorkflowRouter(this.llmClient);
  }

  /**
   * Run the Planning Agent with workflow routing and live SSE event streaming
   */
  async run(
    task: string,
    onEvent?: (event: PlanningStreamEvent) => void
  ): Promise<PlanningAgentResult> {
    const startTime = Date.now();
    const emit = (event: PlanningStreamEvent) => {
      if (onEvent) {
        try {
          onEvent(event);
        } catch (err) {
          console.error("[PlanningAgent] Event emission error:", err);
        }
      }
    };

    // 1. Determine Workflow Mode via Router
    let routingDecision: RoutingDecision;
    if (this.config.forcedMode && this.config.forcedMode !== "auto") {
      routingDecision = {
        mode: this.config.forcedMode,
        reasoning: `User explicitly forced mode to '${this.config.forcedMode}'.`,
        confidence: 1.0,
        requiresTools: this.config.forcedMode !== "direct_answer",
      };
    } else {
      routingDecision = await this.workflowRouter.route(task, {
        model: this.config.model,
        apiKey: this.config.apiKey,
      });
    }

    emit({
      type: "workflow_routed",
      decision: routingDecision,
    });

    // Handle Direct Answer mode (no tools needed)
    if (routingDecision.mode === "direct_answer") {
      return this.handleDirectAnswer(task, routingDecision, emit, startTime);
    }

    // Initialize PlanManager & Tool Registry
    const planManager = new PlanManager(undefined, () => {
      // Plan state changed
    });

    const managePlanTool = createManagePlanTool(planManager);
    const toolRegistry = new ToolRegistry([...builtinTools, managePlanTool]);
    const executor = new ToolExecutor(toolRegistry, {
      workspaceDir: this.config.workspaceDir,
    });
    const openAITools = toolRegistry.toOpenAITools();

    const groundingContext = buildProjectGroundingContext(
      this.config.workspaceDir
    );
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `${this.config.systemPrompt}\n${groundingContext}`,
      },
      { role: "user", content: task },
    ];

    const stepRecords: AgentStepRecord[] = [];
    const allGuardAlerts: AgentGuardAlert[] = [];
    let consecutiveErrors = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    let finishReason:
      | "completed"
      | "circuit_break"
      | "max_steps_exceeded"
      | "error" = "max_steps_exceeded";
    let finalAnswer = "";

    // Main Execution Loop
    for (let step = 1; step <= this.config.maxSteps; step++) {
      const stepStartTime = Date.now();
      const currentPlan = planManager.getPlan();

      emit({
        type: "step_start",
        step,
        maxSteps: this.config.maxSteps,
        currentTaskId: currentPlan?.currentTaskId || null,
      });

      // Attention Anchor Injection: inject latest Plan state into messages before LLM call
      const dynamicMessages = [...messages];
      if (planManager.hasPlan()) {
        const anchor = planManager.renderAttentionAnchor();
        dynamicMessages.push({
          role: "system",
          content: `[REAL-TIME PLAN ANCHOR]\n${anchor}`,
        });
      }

      // Call LLM with full tools
      let response;
      try {
        response = await this.llmClient.chatCompletion({
          messages: dynamicMessages,
          tools: openAITools.length > 0 ? openAITools : undefined,
          model: this.config.model,
          temperature: this.config.temperature,
        });
      } catch (err: any) {
        emit({
          type: "error",
          message: `LLM generation failed at step ${step}: ${err.message}`,
        });
        finishReason = "error";
        finalAnswer = `Execution failed due to LLM error: ${err.message}`;
        break;
      }

      if (response.usage) {
        totalPromptTokens += response.usage.promptTokens || 0;
        totalCompletionTokens += response.usage.completionTokens || 0;
      }

      let thoughtContent = response.content || "";
      let toolCalls = response.toolCalls || [];

      // Fallback: If model outputted tool call JSON in plain text instead of native tool_calls
      if (toolCalls.length === 0 && thoughtContent.trim().length > 0) {
        const extracted = this.extractToolCallsFromContent(
          thoughtContent,
          toolRegistry.list()
        );
        if (extracted.extractedToolCalls.length > 0) {
          toolCalls = extracted.extractedToolCalls;
          thoughtContent = extracted.cleanThought || thoughtContent;
        }
      }

      if (thoughtContent) {
        emit({
          type: "thought",
          step,
          content: thoughtContent,
        });
      }

      // Check if model concluded without tool calls
      if (toolCalls.length === 0) {
        const plan = planManager.getPlan();
        const progress = planManager.getProgress();

        // Case A: Full Planning mode but plan has not been created yet
        if (
          !plan &&
          routingDecision.mode === "full_planning" &&
          step < this.config.maxSteps
        ) {
          messages.push({
            role: "assistant",
            content: thoughtContent,
          });
          messages.push({
            role: "user",
            content: `[SYSTEM ACTION REQUIRED]: You are in Full Planning mode, but you only outputted text without calling tools! Please immediately call 'manage_plan' with action='create_plan' to break down the task into ordered steps. Do not only describe your intention in text.`,
          });
          continue;
        }

        // Case B: Plan exists but is not completed yet (Anti-Verbalization Action Guard)
        if (plan && progress.percentage < 100 && step < this.config.maxSteps) {
          const currentTask =
            plan.tasks.find((t) => t.status === "in_progress") ||
            plan.tasks.find((t) => t.status === "pending");
          const taskInfo = currentTask
            ? `Active Task [${currentTask.id}]: "${currentTask.title}"`
            : "Tasks pending";

          messages.push({
            role: "assistant",
            content: thoughtContent,
          });
          messages.push({
            role: "user",
            content: `[SYSTEM ACTION REQUIRED]: You only outputted text and DID NOT call any tool! Current plan is only ${progress.percentage}% complete (${taskInfo}).
CRITICAL RULES:
1. Do NOT just verbally state "I will check/fix the code" in text. You MUST execute it by invoking tools (e.g. read_file, edit_file, run_command, manage_plan).
2. If code or tests failed, invoke 'edit_file' immediately to fix the code, then 'run_command' to verify.
3. If you finished this task, call 'manage_plan' with action='complete_task'.`,
          });
          continue;
        }

        if (plan && progress.percentage < 100) {
          finishReason = "max_steps_exceeded";
          finalAnswer = `Execution stopped: Reached step limit (${this.config.maxSteps} steps) while plan was ${progress.percentage}% complete.`;
        } else {
          finalAnswer = thoughtContent;
          finishReason = "completed";
        }

        const stepRecord: AgentStepRecord = {
          stepNumber: step,
          thought: thoughtContent,
          toolCalls: [],
          toolResults: [],
          guardAlerts: [],
          tokenUsage: response.usage,
          durationMs: Date.now() - stepStartTime,
          messagesSnapshot: JSON.parse(JSON.stringify(messages)),
        };
        stepRecords.push(stepRecord);

        emit({
          type: "step_end",
          step,
          stepRecord,
          planSnapshot: planManager.getPlan(),
        });
        break;
      }

      // Execute Tool Calls
      emit({
        type: "tool_start",
        step,
        toolCalls,
      });

      const currentStepGuardAlerts: AgentGuardAlert[] = [];

      // Add assistant tool calls to message history
      messages.push({
        role: "assistant",
        content: thoughtContent,
        tool_calls: toolCalls,
      });

      // Loop protection check
      let shouldCircuitBreak = false;
      if (this.config.enableLoopProtection) {
        const loopCheck = this.loopDetector.detectLoop(
          toolCalls,
          this.config.loopDetectThreshold
        );

        if (loopCheck.isLoop) {
          const alert: AgentGuardAlert = {
            type: "repeated_loop",
            level: "circuit_break",
            message: `Circuit breaker triggered: Tool '${loopCheck.toolName}' repeated identical call ${loopCheck.repeatCount} times.`,
            details: {
              signature: loopCheck.signature,
              repeatCount: loopCheck.repeatCount,
              threshold: this.config.loopDetectThreshold,
              step,
            },
          };
          currentStepGuardAlerts.push(alert);
          allGuardAlerts.push(alert);
          emit({ type: "guard_alert", step, alert });

          shouldCircuitBreak = true;
          finishReason = "circuit_break";
          finalAnswer = `Execution stopped by Circuit Breaker: Detected repetitive loop in '${loopCheck.toolName}'.`;
        }

        this.loopDetector.recordStep(step, toolCalls);
      }

      // Execute tools
      const { results: toolResults, toolMessages } =
        await executor.executeAll(toolCalls);

      // Emit specific plan events if manage_plan was called
      for (const call of toolCalls) {
        if (call.function.name === "manage_plan") {
          try {
            const planArgs = JSON.parse(call.function.arguments);
            const updatedPlan = planManager.getPlan()!;
            if (planArgs.action === "create_plan") {
              emit({ type: "plan_created", plan: updatedPlan });
            } else if (planArgs.action === "start_task") {
              emit({
                type: "task_started",
                taskId: planArgs.taskId,
                taskTitle:
                  updatedPlan.tasks.find((t) => t.id === planArgs.taskId)
                    ?.title || planArgs.taskId,
                plan: updatedPlan,
              });
            } else if (planArgs.action === "complete_task") {
              emit({
                type: "task_completed",
                taskId: planArgs.taskId,
                taskTitle:
                  updatedPlan.tasks.find((t) => t.id === planArgs.taskId)
                    ?.title || planArgs.taskId,
                resultSummary: planArgs.summary,
                plan: updatedPlan,
              });
            } else if (planArgs.action === "replan") {
              emit({
                type: "plan_replanned",
                reason: planArgs.reason,
                revision: updatedPlan.revision,
                plan: updatedPlan,
              });
            }
          } catch {
            // ignore
          }
        }
      }

      // Add tool messages (observations)
      messages.push(...toolMessages);

      // Track consecutive errors
      const hasError = toolResults.some((t) => t.isError);
      if (hasError) {
        consecutiveErrors++;
      } else {
        consecutiveErrors = 0;
      }

      emit({
        type: "tool_end",
        step,
        toolResults,
      });

      const stepRecord: AgentStepRecord = {
        stepNumber: step,
        thought: thoughtContent,
        toolCalls,
        toolResults,
        guardAlerts: currentStepGuardAlerts,
        tokenUsage: response.usage,
        durationMs: Date.now() - stepStartTime,
        messagesSnapshot: JSON.parse(JSON.stringify(messages)),
      };
      stepRecords.push(stepRecord);

      emit({
        type: "step_end",
        step,
        stepRecord,
        planSnapshot: planManager.getPlan(),
      });

      if (shouldCircuitBreak) {
        break;
      }

      // Check consecutive error breaker
      if (
        this.config.enableSelfCorrection &&
        consecutiveErrors >= this.config.maxConsecutiveErrors
      ) {
        const alert: AgentGuardAlert = {
          type: "consecutive_errors",
          level: "circuit_break",
          message: `Circuit breaker: Encountered ${consecutiveErrors} consecutive tool failures.`,
          details: {
            consecutiveErrors,
            step,
          },
        };
        allGuardAlerts.push(alert);
        emit({ type: "guard_alert", step, alert });
        finishReason = "circuit_break";
        finalAnswer = `Execution stopped: Exceeded max consecutive errors (${this.config.maxConsecutiveErrors}).`;
        break;
      }
    }

    const totalDurationMs = Date.now() - startTime;
    const finalResult: PlanningAgentResult = {
      success: finishReason === "completed",
      mode: routingDecision.mode,
      routingDecision,
      plan: planManager.getPlan(),
      finalAnswer: finalAnswer || "Task execution finished.",
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
   * Handle pure direct answers (conceptual questions)
   */
  private async handleDirectAnswer(
    task: string,
    decision: RoutingDecision,
    emit: (event: PlanningStreamEvent) => void,
    startTime: number
  ): Promise<PlanningAgentResult> {
    emit({
      type: "step_start",
      step: 1,
      maxSteps: 1,
      currentTaskId: null,
    });

    const response = await this.llmClient.chatCompletion({
      messages: [
        {
          role: "system",
          content:
            "You are Mini Claude Code. Provide a concise, clear, and technically accurate answer to the user's conceptual question.",
        },
        { role: "user", content: task },
      ],
      model: this.config.model,
      temperature: 0.3,
    });

    const answer = response.content || "";
    emit({
      type: "thought",
      step: 1,
      content: answer,
    });

    const stepRecord: AgentStepRecord = {
      stepNumber: 1,
      thought: answer,
      toolCalls: [],
      toolResults: [],
      guardAlerts: [],
      tokenUsage: response.usage,
      durationMs: Date.now() - startTime,
      messagesSnapshot: [
        { role: "user", content: task },
        { role: "assistant", content: answer },
      ],
    };

    const finalResult: PlanningAgentResult = {
      success: true,
      mode: "direct_answer",
      routingDecision: decision,
      plan: null,
      finalAnswer: answer,
      totalSteps: 1,
      totalDurationMs: Date.now() - startTime,
      finishReason: "completed",
      steps: [stepRecord],
      allMessages: [
        { role: "user", content: task },
        { role: "assistant", content: answer },
      ],
      totalTokenUsage: response.usage || {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      guardAlerts: [],
    };

    emit({
      type: "step_end",
      step: 1,
      stepRecord,
      planSnapshot: null,
    });

    emit({
      type: "agent_done",
      result: finalResult,
    });

    return finalResult;
  }

  /**
   * Robust fallback extractor for tool calls outputted in text format
   */
  private extractToolCallsFromContent(
    content: string,
    availableTools: any[]
  ): {
    cleanThought: string;
    extractedToolCalls: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  } {
    const extractedToolCalls: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }> = [];
    let remainingText = content;

    // 1. ```tool_call / ```json blocks
    const codeBlockRegex = /```(?:tool_call|json)?\s*(\{[\s\S]*?\})\s*```/g;
    let blockMatch;
    while ((blockMatch = codeBlockRegex.exec(content)) !== null) {
      const rawJson = blockMatch[1];
      try {
        const parsed = JSON.parse(rawJson);
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
          remainingText = remainingText.replace(blockMatch[0], "");
        }
      } catch {
        // ignore malformed tool block
      }
    }

    if (extractedToolCalls.length > 0) {
      return { cleanThought: remainingText.trim(), extractedToolCalls };
    }

    // 2. Raw JSON objects matching tool parameter schemas
    const jsonObjectRegex = /\{[\s\S]*?\}/g;
    let jsonMatch;
    while ((jsonMatch = jsonObjectRegex.exec(content)) !== null) {
      const rawJson = jsonMatch[0];
      try {
        const parsed = JSON.parse(rawJson);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          !Array.isArray(parsed)
        ) {
          if (parsed.name && availableTools.some((t) => t.name === parsed.name)) {
            const args = parsed.arguments || parsed.parameters || {};
            extractedToolCalls.push({
              id: `fallback_${Date.now()}_${extractedToolCalls.length}`,
              type: "function",
              function: {
                name: parsed.name,
                arguments:
                  typeof args === "string" ? args : JSON.stringify(args),
              },
            });
            remainingText = remainingText.replace(rawJson, "");
            continue;
          }

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


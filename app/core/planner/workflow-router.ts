import { LLMClient } from "../llm/client";
import type { RoutingDecision, WorkflowMode } from "./types";
import { z } from "zod";

export const RoutingDecisionSchema = z.object({
  mode: z
    .enum(["direct_answer", "quick_react", "full_planning"])
    .describe(
      "The chosen workflow mode based on complexity, scope, and tool needs."
    ),
  reasoning: z
    .string()
    .describe(
      "A brief 1-2 sentence explanation of why this workflow was selected."
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence score between 0 and 1."),
  suggestedSteps: z
    .array(z.string())
    .optional()
    .describe("If full_planning, initial 2-5 high-level steps recommended."),
  requiresTools: z
    .boolean()
    .describe("True if file access or shell execution is needed."),
});

const ROUTER_SYSTEM_PROMPT = `You are the Workflow Routing Engine for an autonomous AI Coding Assistant.
Your job is to analyze the user's prompt and categorize it into the optimal execution workflow mode:

Workflow Modes:
1. "direct_answer":
   - Use for pure conceptual explanations, theoretical questions, algorithm analysis, or syntax questions.
   - Requires NO file reading, NO workspace mutation, NO shell commands.
   - Example: "什么是 React 的 Fiber 架构？", "用 Python 写一个快速排序"

2. "quick_react":
   - Use for single-step, simple or targeted tasks: reading a single file, listing directory, running a single test command, or fixing a simple typo in a known file.
   - Simple ReAct loop (1-3 steps) is sufficient without heavy multi-step planning.
   - Example: "帮我读取 package.json 的 scripts", "运行 npm test 看一下报错"

3. "full_planning":
   - Use for complex, multi-step, multi-file, or ambiguous engineering tasks: feature development, architectural refactoring, migration, bug fixing across multiple files + test verification + documentation.
   - Requires full Plan FSM task decomposition, progress tracking, and attention anchors to prevent goal drift.
   - Example: "把项目里的内存存储重构为 SQLite，新增 CRUD 路由并写测试", "排查所有测试并修复类型错误和 lint"`;

export class WorkflowRouter {
  private llmClient?: LLMClient;

  constructor(llmClient?: LLMClient) {
    this.llmClient = llmClient;
  }

  /**
   * Route task to optimal workflow mode
   */
  public async route(
    task: string,
    options?: { model?: string; apiKey?: string }
  ): Promise<RoutingDecision> {
    // 1. Try fast heuristic detection for trivial patterns
    const heuristic = this.heuristicRoute(task);
    if (heuristic && heuristic.confidence >= 0.95) {
      return heuristic;
    }

    // 2. If LLM client is available, use structured classification
    if (this.llmClient || options?.apiKey) {
      try {
        const client =
          this.llmClient ||
          new LLMClient({
            apiKey: options?.apiKey,
            defaultModel: options?.model || "anthropic/claude-3.5-sonnet",
          });

        const result = await client.structuredOutput({
          messages: [
            {
              role: "user",
              content: `Analyze this user task and determine the best workflow mode:\nTask: "${task}"`,
            },
          ],
          schema: RoutingDecisionSchema,
          systemPrompt: ROUTER_SYSTEM_PROMPT,
          model: options?.model,
          temperature: 0.1,
        });

        if (result && result.data) {
          return result.data;
        }
      } catch (err) {
        console.warn(
          "[WorkflowRouter] LLM routing failed, falling back to heuristic:",
          err
        );
      }
    }

    // 3. Fallback to heuristic
    return (
      heuristic || {
        mode: "full_planning",
        reasoning:
          "Defaulting to full planning workflow for comprehensive execution safety.",
        confidence: 0.7,
        requiresTools: true,
      }
    );
  }

  /**
   * Fast rule-based heuristic routing
   */
  public heuristicRoute(task: string): RoutingDecision | null {
    const trimmed = task.trim();

    // Pure theory / chat keywords
    const isDirectAnswer =
      /^(什么是|为什么|解释下|解释一下|如何理解|tell me about|explain|what is|why is)/i.test(
        trimmed
      ) &&
      !/(项目|代码|文件|重构|测试|test|build|bug|fix|refactor|file)/i.test(
        trimmed
      );

    if (isDirectAnswer) {
      return {
        mode: "direct_answer",
        reasoning:
          "Task is a pure conceptual or explanatory question requiring no workspace interaction.",
        confidence: 0.95,
        requiresTools: false,
      };
    }

    // Simple single-action patterns
    const isSingleRead =
      /(读取|看下|查看|read|cat)\s*([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/i.test(
        trimmed
      ) && !/(重构|修改|修改并|然后|接着|开发|refactor|and)/i.test(trimmed);

    const isSingleCommand =
      /^(运行|执行|run)\s*(npm|pnpm|yarn|cargo|git|pytest|vitest|jest)/i.test(
        trimmed
      ) && !/(并且|然后|重构|修复|开发|and)/i.test(trimmed);

    if (isSingleRead || isSingleCommand) {
      return {
        mode: "quick_react",
        reasoning:
          "Task involves a single straightforward read or command check.",
        confidence: 0.9,
        requiresTools: true,
      };
    }

    // Complex multi-step keywords
    const isComplex =
      /(重构|开发|实现|迁移|并且|然后|接着|全流程|多文件|测试并|测试驱动|refactor|implement|migrate|and then|full-stack|end-to-end)/i.test(
        trimmed
      ) || trimmed.length > 50;

    if (isComplex) {
      return {
        mode: "full_planning",
        reasoning:
          "Task involves multi-step development, cross-file modifications, or verification pipeline.",
        confidence: 0.9,
        requiresTools: true,
        suggestedSteps: [
          "探索现有代码结构与依赖",
          "实施核心功能或重构代码",
          "执行测试与语法类型校验",
          "总结交付并验证结果",
        ],
      };
    }

    return null;
  }
}


import { LLMClient } from "../llm/client";
import { defaultToolRegistry } from "../tools/builtins";
import type { ToolRegistry } from "../tools/registry";
import type { AgentCore, SessionSnapshot, StepDecision } from "./types";

export interface AgentCoreConfig {
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  apiKey?: string;
  baseURL?: string;
}

const DEFAULT_RUNTIME_SYSTEM_PROMPT = `You are an autonomous AI Coding Agent decoupled runtime worker.
Analyze the user request, plan actions, and execute tools to inspect or edit the project.
When your task is complete or you need no further tools, reply directly with your final answer.`;

export class PureAgentCore implements AgentCore {
  private llmClient: LLMClient;
  private registry: ToolRegistry;
  private model: string;
  private systemPrompt: string;
  private temperature: number;

  constructor(
    config: AgentCoreConfig = {},
    registry: ToolRegistry = defaultToolRegistry
  ) {
    this.model = config.model || process.env.LLM_MODEL || "glm-4-flash";
    this.systemPrompt = config.systemPrompt || DEFAULT_RUNTIME_SYSTEM_PROMPT;
    this.temperature = config.temperature ?? 0.1;
    this.registry = registry;

    this.llmClient = new LLMClient({
      apiKey: config.apiKey || process.env.LLM_API_KEY || "",
      baseURL: config.baseURL || process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4",
      defaultModel: this.model,
    });
  }

  /**
   * Pure Step Evaluation:
   * Input: snapshot (immutable view of messages + state) + abort signal.
   * Output: StepDecision (call_tools | finish | ask_user).
   * ZERO side effects, ZERO direct I/O, ZERO mutations.
   */
  async step(snapshot: SessionSnapshot, signal: AbortSignal): Promise<StepDecision> {
    if (signal.aborted) {
      throw new Error("AgentCoreStepAborted");
    }

    const openAiTools = this.registry.toOpenAITools();

    const response = await this.llmClient.chatCompletion({
      messages: snapshot.messages,
      systemPrompt: this.systemPrompt,
      model: this.model,
      temperature: this.temperature,
      tools: openAiTools.length > 0 ? openAiTools : undefined,
      signal,
    });

    const thought = response.content || "";
    const toolCalls = response.toolCalls || [];

    if (toolCalls.length > 0) {
      return {
        type: "call_tools",
        thought,
        toolCalls,
      };
    }

    return {
      type: "finish",
      thought,
      finalAnswer: thought || "[任务执行完毕，无进一步工具调用]",
    };
  }
}

import { LLMClient } from "../llm/client";
import type { ChatMessage, TokenUsage } from "../llm/types";
import { ToolExecutor } from "../tools/executor";
import { ToolRegistry } from "../tools/registry";
import type { ToolCallItem, ToolExecutionResult } from "../tools/types";
import { LoopDetector } from "./loop-detector";
import type { McpManager } from "../mcp/mcp-manager";
import type { JsonRpcFrame, McpServerMetadata } from "../mcp/types";

export type McpAgentStreamEvent =
  | {
      type: "agent_start";
      task: string;
      maxSteps: number;
      model: string;
      activeServers: McpServerMetadata[];
    }
  | {
      type: "mcp_synced";
      connectedServers: string[];
      toolCount: number;
      toolNames: string[];
      injectedResources: Array<{ uri: string; name: string }>;
    }
  | {
      type: "json_rpc_frame";
      frame: JsonRpcFrame;
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
      type: "step_end";
      step: number;
      durationMs: number;
    }
  | {
      type: "agent_done";
      finalAnswer: string;
      totalSteps: number;
      totalDurationMs: number;
      tokenUsage: TokenUsage;
      finishReason: "completed" | "circuit_break" | "max_steps_exceeded" | "error";
    }
  | {
      type: "error";
      message: string;
    };

export interface McpAgentConfig {
  maxSteps?: number;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  apiKey?: string;
  baseURL?: string;
  workspaceDir?: string;
  includeResourcesAsContext?: boolean;
}

export interface McpAgentRunResult {
  success: boolean;
  finalAnswer: string;
  totalSteps: number;
  totalDurationMs: number;
  finishReason: "completed" | "circuit_break" | "max_steps_exceeded" | "error";
  tokenUsage: TokenUsage;
  allMessages: ChatMessage[];
  frames: JsonRpcFrame[];
}

export class McpAgent {
  private llmClient: LLMClient;
  private mcpManager: McpManager;
  private config: Required<McpAgentConfig>;
  private loopDetector: LoopDetector;

  constructor(mcpManager: McpManager, config: McpAgentConfig = {}) {
    this.mcpManager = mcpManager;
    this.config = {
      maxSteps: config.maxSteps ?? 8,
      model: config.model || process.env.LLM_MODEL || "glm-4-flash",
      systemPrompt:
        config.systemPrompt ||
        `You are Mini Claude Code (Lesson 09: Model Context Protocol Edition).
You operate in a modular, decoupled architecture where your capabilities are dynamically provided by external Model Context Protocol (MCP) servers.

Guidelines:
1. Dynamic Capability Awareness:
   - Your tools are dynamically discovered via standard MCP JSON-RPC 2.0 connections.
   - If a required tool or capability is missing (e.g. database query, web browsing, code inspection), check if the corresponding MCP server is connected. If not connected, inform the user clearly that they need to mount the corresponding MCP server.
2. ReAct Loop Execution:
   - Think before calling tools. Inspect arguments carefully.
   - Execute actions and inspect observations before proceeding.
3. Clarity & Conciseness:
   - Once the user's inquiry or task is resolved, provide a concise and structured answer.`,
      temperature: config.temperature ?? 0.1,
      apiKey: config.apiKey || process.env.LLM_API_KEY || "",
      baseURL:
        config.baseURL ||
        process.env.LLM_BASE_URL ||
        "https://open.bigmodel.cn/api/paas/v4",
      workspaceDir: config.workspaceDir || process.cwd(),
      includeResourcesAsContext: config.includeResourcesAsContext ?? true,
    };

    this.llmClient = new LLMClient({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
      defaultModel: this.config.model,
    });

    this.loopDetector = new LoopDetector();
  }

  /**
   * 执行带有 MCP 插件解耦与报文透视的 Agent 循环
   */
  async runStream(
    task: string,
    onEvent: (event: McpAgentStreamEvent) => void
  ): Promise<McpAgentRunResult> {
    const startTime = Date.now();
    const tokenUsage: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    // 1. 创建干净的工具注册表，并从 MCP Manager 动态导出工具
    const registry = new ToolRegistry([]);
    const { registeredCount, toolNames } =
      this.mcpManager.exportToToolRegistry(registry);
    const executor = new ToolExecutor(registry, {
      workspaceDir: this.config.workspaceDir,
      maxOutputLength: 8000,
    });

    const activeServers = this.mcpManager
      .getAllMetadata()
      .filter((s) => s.status === "connected");

    // 2. 监听帧级抓包并流式外发
    const unbindFrame = this.mcpManager.onFrame((frame) => {
      onEvent({
        type: "json_rpc_frame",
        frame,
      });
    });

    onEvent({
      type: "agent_start",
      task,
      maxSteps: this.config.maxSteps,
      model: this.config.model,
      activeServers,
    });

    // 3. 可选：通过 MCP 读取上下文 Resource 并增强 Context
    const injectedResources: Array<{ uri: string; name: string }> = [];
    let resourceContextText = "";

    if (this.config.includeResourcesAsContext) {
      const allResources = this.mcpManager.getAllDiscoveredResources();
      for (const item of allResources) {
        try {
          const res = await this.mcpManager.readResource(
            item.serverId,
            item.resource.uri
          );
          if (res.contents && res.contents.length > 0) {
            injectedResources.push({
              uri: item.resource.uri,
              name: item.resource.name,
            });
            for (const c of res.contents) {
              if (c.text) {
                resourceContextText += `\n[MCP Resource: ${item.resource.uri} (${item.resource.name})]\n${c.text}\n`;
              }
            }
          }
        } catch {
          // Ignore resource load failures
        }
      }
    }

    onEvent({
      type: "mcp_synced",
      connectedServers: activeServers.map((s) => s.name),
      toolCount: registeredCount,
      toolNames,
      injectedResources,
    });

    // 4. 构建初始对话消息历史
    let systemPromptContent = this.config.systemPrompt;
    if (resourceContextText) {
      systemPromptContent += `\n\n=== Attached MCP Resources Context ===\n${resourceContextText.trim()}\n=== End Resources ===`;
    }

    const messages: ChatMessage[] = [
      { role: "system", content: systemPromptContent },
      { role: "user", content: task },
    ];

    let currentStep = 0;
    let finalAnswer = "";
    let finishReason: McpAgentRunResult["finishReason"] = "completed";

    try {
      while (currentStep < this.config.maxSteps) {
        currentStep++;
        const stepStartMs = Date.now();

        onEvent({
          type: "step_start",
          step: currentStep,
          maxSteps: this.config.maxSteps,
        });

        // 格式化 MCP 动态工具为 OpenAI 格式
        const openAiTools = registry.toOpenAITools();

        // 向上游大模型发起推演
        const response = await this.llmClient.chatCompletion({
          messages,
          model: this.config.model,
          temperature: this.config.temperature,
          tools: openAiTools.length > 0 ? openAiTools : undefined,
        });

        if (response.usage) {
          tokenUsage.promptTokens += response.usage.promptTokens || 0;
          tokenUsage.completionTokens += response.usage.completionTokens || 0;
          tokenUsage.totalTokens += response.usage.totalTokens || 0;
        }

        const thought = response.content || "";
        const toolCalls = response.toolCalls || [];

        if (thought) {
          onEvent({
            type: "thought",
            step: currentStep,
            content: thought,
          });
        }

        // Case A: 模型未调用任何工具，给出了最终文本回答
        if (toolCalls.length === 0) {
          finalAnswer = thought;
          messages.push({
            role: "assistant",
            content: thought,
          });

          onEvent({
            type: "step_end",
            step: currentStep,
            durationMs: Date.now() - stepStartMs,
          });
          break;
        }

        // Case B: 模型发起工具调用 (将经由 MCP Tool Adapter 转换为 JSON-RPC 调用)
        messages.push({
          role: "assistant",
          content: thought || "",
          tool_calls: toolCalls,
        });

        onEvent({
          type: "tool_start",
          step: currentStep,
          toolCalls,
        });

        // 死循环检测
        const loopCheck = this.loopDetector.detectLoop(toolCalls, 3);
        if (loopCheck.isLoop && loopCheck.repeatCount > 3) {
          finishReason = "circuit_break";
          finalAnswer = `[Loop Circuit Breaker] ${loopCheck.reason || "Repeated tool calls detected"}`;
          break;
        }

        // 并行执行工具
        const { results: toolResults, toolMessages } =
          await executor.executeAll(toolCalls);

        for (const tm of toolMessages) {
          messages.push(tm);
        }

        onEvent({
          type: "tool_end",
          step: currentStep,
          toolResults,
        });

        onEvent({
          type: "step_end",
          step: currentStep,
          durationMs: Date.now() - stepStartMs,
        });
      }

      if (currentStep >= this.config.maxSteps && !finalAnswer) {
        finishReason = "max_steps_exceeded";
        finalAnswer = `Agent reached maximum allowable steps (${this.config.maxSteps}) without finalizing an answer.`;
      }
    } catch (err: any) {
      finishReason = "error";
      finalAnswer = `Agent encountered an unhandled error: ${err.message || String(err)}`;
      onEvent({
        type: "error",
        message: finalAnswer,
      });
    } finally {
      unbindFrame();
    }

    const totalDurationMs = Date.now() - startTime;

    onEvent({
      type: "agent_done",
      finalAnswer,
      totalSteps: currentStep,
      totalDurationMs,
      tokenUsage,
      finishReason,
    });

    return {
      success: finishReason === "completed",
      finalAnswer,
      totalSteps: currentStep,
      totalDurationMs,
      finishReason,
      tokenUsage,
      allMessages: messages,
      frames: this.mcpManager.getAllFrames(),
    };
  }
}

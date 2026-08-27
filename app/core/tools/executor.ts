import type { ChatMessage } from "../llm/types";
import type { ToolRegistry } from "./registry";
import type {
  ToolCallItem,
  ToolContext,
  ToolExecutionResult,
} from "./types";

export class ToolExecutor {
  private registry: ToolRegistry;
  private context: ToolContext;

  constructor(registry: ToolRegistry, context?: Partial<ToolContext>) {
    this.registry = registry;
    this.context = {
      workspaceDir: context?.workspaceDir || process.cwd(),
      maxOutputLength: context?.maxOutputLength || 8000,
    };
  }

  /**
   * Execute a single tool call safely
   */
  async executeSingle(call: ToolCallItem): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const toolName = call.function.name;
    const rawArgs = call.function.arguments || "{}";

    const tool = this.registry.get(toolName);
    if (!tool) {
      const available = this.registry
        .list()
        .map((t) => t.name)
        .join(", ");
      return {
        toolCallId: call.id,
        toolName,
        inputArgs: {},
        rawArguments: rawArgs,
        output: `[执行失败] 未找到名为 '${toolName}' 的工具。当前可用工具清单: [${available}]`,
        isError: true,
        executionTimeMs: Date.now() - startTime,
      };
    }

    let parsedArgs: any = {};
    try {
      parsedArgs = JSON.parse(rawArgs);
    } catch (err: any) {
      return {
        toolCallId: call.id,
        toolName,
        inputArgs: {},
        rawArguments: rawArgs,
        output: `[参数解析错误] 传入的参数不是合法的 JSON 格式: ${rawArgs}。错误原因: ${err.message}`,
        isError: true,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Validate parameters with Zod schema
    const validation = tool.schema.safeParse(parsedArgs);
    if (!validation.success) {
      const issues = validation.error.issues
        .map((i) => `字段 '${i.path.join(".")}': ${i.message}`)
        .join("; ");
      return {
        toolCallId: call.id,
        toolName,
        inputArgs: parsedArgs,
        rawArguments: rawArgs,
        output: `[参数契约校验失败] 参数不满足 Schema 约束: ${issues}`,
        isError: true,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Execute tool function with sandbox context
    try {
      const result = await tool.execute(validation.data, this.context);
      const outputStr =
        typeof result === "string" ? result : JSON.stringify(result, null, 2);

      return {
        toolCallId: call.id,
        toolName,
        inputArgs: validation.data,
        rawArguments: rawArgs,
        output: outputStr,
        isError: false,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        toolCallId: call.id,
        toolName,
        inputArgs: validation.data,
        rawArguments: rawArgs,
        output: `[工具运行时异常]: ${err.message || String(err)}`,
        isError: true,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute multiple tool calls in parallel or sequence
   */
  async executeAll(calls: ToolCallItem[]): Promise<{
    results: ToolExecutionResult[];
    toolMessages: ChatMessage[];
  }> {
    const results = await Promise.all(
      calls.map((call) => this.executeSingle(call))
    );

    const toolMessages: ChatMessage[] = results.map((res) => ({
      role: "tool",
      tool_call_id: res.toolCallId,
      name: res.toolName,
      content: res.output,
    }));

    return {
      results,
      toolMessages,
    };
  }
}


import type { LLMClient } from "../llm/client";
import { defaultToolRegistry } from "../tools/builtins";
import type { ToolRegistry } from "../tools/registry";
import type { ToolCallingRunResult } from "../tools/types";
export { TOOL_CALLING_PRESETS } from "../tools/presets";

export interface ToolCallingExperimentOptions {
  userPrompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  workspaceDir?: string;
  registry?: ToolRegistry;
}

/**
 * Run standard Tool Calling experiment
 */
export async function runToolCallingExperiment(
  client: LLMClient,
  options: {
    userPrompt: string;
    systemPrompt?: string;
    model?: string;
    temperature?: number;
    workspaceDir?: string;
  }
): Promise<ToolCallingRunResult> {
  const registry = defaultToolRegistry;

  const result = await client.runSingleTurnToolCalling({
    messages: [
      {
        role: "user",
        content: options.userPrompt,
      },
    ],
    systemPrompt: options.systemPrompt,
    registry,
    model: options.model,
    temperature: options.temperature ?? 0.1,
    workspaceDir: options.workspaceDir,
  });

  return result;
}

/**
 * Direct tool execution tester for UI Toolbox
 */
export async function testExecuteTool(
  toolName: string,
  args: any,
  workspaceDir?: string
) {
  const tool = defaultToolRegistry.get(toolName);
  if (!tool) {
    throw new Error(`Tool '${toolName}' not found`);
  }

  const startTime = Date.now();
  const validation = tool.schema.safeParse(args);
  if (!validation.success) {
    throw new Error(
      `参数校验失败: ${validation.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`
    );
  }

  const output = await tool.execute(validation.data, {
    workspaceDir: workspaceDir || process.cwd(),
    maxOutputLength: 8000,
  });

  return {
    toolName,
    input: validation.data,
    output: typeof output === "string" ? output : JSON.stringify(output, null, 2),
    latencyMs: Date.now() - startTime,
  };
}


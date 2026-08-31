import type OpenAI from "openai";
import { zodFunction } from "openai/helpers/zod";
import type { ToolDefinition } from "./types";

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor(initialTools: ToolDefinition[] = []) {
    for (const tool of initialTools) {
      this.register(tool);
    }
  }

  /**
   * Register a new tool into the registry
   */
  register<TParams, TResult>(tool: ToolDefinition<TParams, TResult>): this {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Overwriting existing tool: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    return this;
  }

  /**
   * Get a tool by its exact name
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * List all registered tools
   */
  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Convert registered tools to OpenAI standard tool parameters
   */
  toOpenAITools(): OpenAI.Chat.ChatCompletionTool[] {
    const list = this.list();
    return list.map((tool) => {
      try {
        const formatted = zodFunction({
          name: tool.name,
          description: tool.description,
          parameters: tool.schema as any,
        });
        return formatted as OpenAI.Chat.ChatCompletionTool;
      } catch {
        // Fallback standard definition
        return {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
          },
        };
      }
    });
  }

  /**
   * Alias for toOpenAITools()
   */
  getDefinitions(): OpenAI.Chat.ChatCompletionTool[] {
    return this.toOpenAITools();
  }

  /**
   * Get tool manifest metadata for UI visualization
   */
  getManifest() {
    return this.list().map((tool) => {
      let schemaJson: any;
      try {
        const formatted = zodFunction({
          name: tool.name,
          description: tool.description,
          parameters: tool.schema as any,
        });
        schemaJson = formatted.function.parameters;
      } catch {
        schemaJson = { name: tool.name };
      }

      return {
        name: tool.name,
        description: tool.description,
        parameters: schemaJson,
      };
    });
  }
}


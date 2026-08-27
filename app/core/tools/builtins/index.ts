import { ToolRegistry } from "../registry";
import { readFileTool } from "./read-file";
import { listDirTool } from "./list-dir";
import { calculateTool } from "./calculate";
import { systemInfoTool } from "./system-info";

export { readFileTool, listDirTool, calculateTool, systemInfoTool };

export const builtinTools = [
  readFileTool,
  listDirTool,
  calculateTool,
  systemInfoTool,
];

export function createDefaultToolRegistry(): ToolRegistry {
  return new ToolRegistry(builtinTools);
}

export const defaultToolRegistry = createDefaultToolRegistry();


import { ToolRegistry } from "../registry";
import { readFileTool } from "./read-file";
import { listDirTool } from "./list-dir";
import { calculateTool } from "./calculate";
import { systemInfoTool } from "./system-info";
import { writeFileTool } from "./write-file";
import { editFileTool } from "./edit-file";
import { runCommandTool } from "./run-command";
import { createManagePlanTool } from "./manage-plan";

export {
  readFileTool,
  listDirTool,
  calculateTool,
  systemInfoTool,
  writeFileTool,
  editFileTool,
  runCommandTool,
  createManagePlanTool,
};

export const builtinTools = [
  readFileTool,
  listDirTool,
  calculateTool,
  systemInfoTool,
  writeFileTool,
  editFileTool,
  runCommandTool,
];

export function createDefaultToolRegistry(): ToolRegistry {
  return new ToolRegistry(builtinTools);
}

export const defaultToolRegistry = createDefaultToolRegistry();



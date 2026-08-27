import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolDefinition } from "../types";

export const ReadFileInputSchema = z.object({
  filePath: z
    .string()
    .describe(
      "相对于项目根目录的文件路径，例如 'package.json' 或 'app/routes/_index.tsx'。禁止使用外部绝对路径。"
    ),
  startLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("起始行号（从 1 开始，可选）。如果不传则从第 1 行开始读取。"),
  endLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("结束行号（可选）。如果不传则读取到文件末尾。"),
});

export type ReadFileInput = z.infer<typeof ReadFileInputSchema>;

export const readFileTool: ToolDefinition<ReadFileInput, string> = {
  name: "read_file",
  description:
    "安全读取工作区中的文件文本内容。支持指定行号范围切片读取。遇到大文件时优先切片读取以节省上下文 Token。",
  schema: ReadFileInputSchema,
  execute: async (args, context) => {
    const { filePath, startLine, endLine } = args;
    const workspaceRoot = path.resolve(context.workspaceDir || process.cwd());
    const targetPath = path.resolve(workspaceRoot, filePath);

    // Sandbox path traversal security check
    if (!targetPath.startsWith(workspaceRoot)) {
      throw new Error(
        `安全拦截：不允许读取工作区之外的文件路径 '${filePath}'。工作区根目录为: '${workspaceRoot}'`
      );
    }

    try {
      const stats = await fs.stat(targetPath);
      if (!stats.isFile()) {
        throw new Error(`路径 '${filePath}' 不是一个普通文件。`);
      }

      const content = await fs.readFile(targetPath, "utf-8");
      const lines = content.split("\n");
      const totalLines = lines.length;

      const s = startLine ? Math.max(1, startLine) : 1;
      const e = endLine ? Math.min(totalLines, endLine) : totalLines;

      if (s > totalLines) {
        return `[文件读取警告]: 文件 '${filePath}' 共有 ${totalLines} 行，请求的起始行 ${s} 超出文件范围。`;
      }

      const selectedLines = lines.slice(s - 1, e);
      const formatted = selectedLines
        .map((line, idx) => `${s + idx} | ${line}`)
        .join("\n");

      const header = `=== 文件: ${filePath} (共 ${totalLines} 行，当前展示: 第 ${s} 行到第 ${e} 行) ===\n`;
      const result = header + formatted;

      // Truncation protection
      const maxLen = context.maxOutputLength || 8000;
      if (result.length > maxLen) {
        return (
          result.substring(0, maxLen) +
          `\n\n... [输出已截断：已达 ${maxLen} 字符上限，请使用 startLine 与 endLine 分段查看]`
        );
      }

      return result;
    } catch (err: any) {
      if (err.code === "ENOENT") {
        throw new Error(
          `文件不存在: '${filePath}'。请使用 list_dir 工具确认目录中存在的文件路径。`
        );
      }
      throw new Error(`读取文件 '${filePath}' 失败: ${err.message}`);
    }
  },
};


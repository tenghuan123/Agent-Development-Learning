import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolDefinition } from "../types";

export const WriteFileInputSchema = z.object({
  filePath: z
    .string()
    .describe(
      "相对于工作区根目录的文件路径，例如 'src/utils.ts' 或 'scratch/demo.js'。严禁使用越界绝对路径。"
    ),
  content: z
    .string()
    .describe("要写入文件的完整文本内容。创建新文件或小型配置文件时使用。"),
  overwrite: z
    .boolean()
    .optional()
    .describe("如果文件已存在，是否允许覆盖写入。默认为 true。"),
});

export type WriteFileInput = z.infer<typeof WriteFileInputSchema>;

export const writeFileTool: ToolDefinition<WriteFileInput, string> = {
  name: "write_file",
  description:
    "安全创建新文件或覆写已有文件。若目标目录不存在会自动递归创建。请注意：对于修改已有大型代码文件，优先使用 edit_file 以节省 Token 并避免遗漏代码。",
  schema: WriteFileInputSchema,
  execute: async (args, context) => {
    const { filePath, content, overwrite } = args;
    const workspaceRoot = path.resolve(context.workspaceDir || process.cwd());
    const targetPath = path.resolve(workspaceRoot, filePath);

    // Sandbox path traversal check
    if (!targetPath.startsWith(workspaceRoot)) {
      throw new Error(
        `安全拦截：不允许向工作区之外的路径写入文件 '${filePath}'。工作区根目录为: '${workspaceRoot}'`
      );
    }

    try {
      // Check if file exists
      let fileExists = false;
      try {
        await fs.access(targetPath);
        fileExists = true;
      } catch {
        fileExists = false;
      }

      if (fileExists && overwrite === false) {
        throw new Error(
          `文件 '${filePath}' 已存在，且 overwrite 参数被设置为 false，取消写入。`
        );
      }

      // Ensure directory exists
      const dirPath = path.dirname(targetPath);
      await fs.mkdir(dirPath, { recursive: true });

      // Write content
      await fs.writeFile(targetPath, content, "utf-8");

      const lineCount = content.split("\n").length;
      const byteSize = Buffer.byteLength(content, "utf-8");

      return `[文件写入成功] 文件 '${filePath}' 已成功写入 (${lineCount} 行, ${byteSize} 字节)。`;
    } catch (err: any) {
      throw new Error(`写入文件 '${filePath}' 失败: ${err.message}`, {
        cause: err,
      });
    }
  },
};

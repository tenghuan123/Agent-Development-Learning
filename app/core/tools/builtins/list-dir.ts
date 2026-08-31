import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolDefinition } from "../types";

export const ListDirInputSchema = z.object({
  dirPath: z
    .string()
    .optional()
    .describe(
      "要列出内容的目录相对路径，默认为当前根目录 '.'。例如 'app'、'app/core' 等。"
    ),
  recursive: z
    .boolean()
    .optional()
    .describe("是否递归列出子目录中的文件（默认 false，最大深度限制为 3）。"),
});

export type ListDirInput = z.infer<typeof ListDirInputSchema>;

const IGNORED_NAMES = new Set([
  "node_modules",
  ".git",
  ".react-router",
  "build",
  ".DS_Store",
  ".turbo",
  "dist",
  ".next",
]);

interface FileEntry {
  path: string;
  type: "file" | "directory";
  size?: number;
}

async function scanDir(
  currentDir: string,
  baseRoot: string,
  recursive: boolean,
  depth = 0,
  maxDepth = 3
): Promise<FileEntry[]> {
  if (depth > maxDepth) return [];

  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const results: FileEntry[] = [];

  for (const entry of entries) {
    if (IGNORED_NAMES.has(entry.name)) continue;

    const fullPath = path.join(currentDir, entry.name);
    const relPath = path.relative(baseRoot, fullPath);

    if (entry.isDirectory()) {
      results.push({ path: relPath + "/", type: "directory" });
      if (recursive && depth < maxDepth) {
        const sub = await scanDir(
          fullPath,
          baseRoot,
          recursive,
          depth + 1,
          maxDepth
        );
        results.push(...sub);
      }
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(fullPath);
        results.push({ path: relPath, type: "file", size: stat.size });
      } catch {
        results.push({ path: relPath, type: "file" });
      }
    }
  }

  return results;
}

export const listDirTool: ToolDefinition<ListDirInput, string> = {
  name: "list_dir",
  description:
    "列出项目目录下的文件和子目录结构。可用于快速探索项目结构或定位目标文件路径。会自动过滤 node_modules、.git 等无关目录。",
  schema: ListDirInputSchema,
  execute: async (args, context) => {
    const dirPath = args.dirPath || ".";
    const recursive = Boolean(args.recursive);
    const workspaceRoot = path.resolve(context.workspaceDir || process.cwd());
    const targetDir = path.resolve(workspaceRoot, dirPath);

    // Sandbox check
    if (!targetDir.startsWith(workspaceRoot)) {
      throw new Error(
        `安全拦截：不允许访问工作区之外的目录 '${dirPath}'。`
      );
    }

    try {
      const stats = await fs.stat(targetDir);
      if (!stats.isDirectory()) {
        throw new Error(`路径 '${dirPath}' 不是一个有效目录。`);
      }

      const entries = await scanDir(
        targetDir,
        workspaceRoot,
        recursive,
        0,
        3
      );

      if (entries.length === 0) {
        return `目录 '${dirPath}' 为空。`;
      }

      const lines = entries.map((e) => {
        if (e.type === "directory") {
          return `📁 ${e.path}`;
        }
        const sizeStr =
          e.size !== undefined
            ? e.size < 1024
              ? `${e.size}B`
              : `${(e.size / 1024).toFixed(1)}KB`
            : "";
        return `📄 ${e.path.padEnd(40, " ")} (${sizeStr})`;
      });

      return `=== 目录结构: '${dirPath}' (共 ${entries.length} 个条目) ===\n` + lines.join("\n");
    } catch (err: any) {
      if (err.code === "ENOENT") {
        throw new Error(`目录不存在: '${dirPath}'。`, { cause: err });
      }
      throw new Error(`列出目录 '${dirPath}' 失败: ${err.message}`, {
        cause: err,
      });
    }
  },
};


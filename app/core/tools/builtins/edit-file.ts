import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolDefinition } from "../types";

export const EditFileInputSchema = z.object({
  filePath: z
    .string()
    .describe(
      "相对于工作区根目录的文件路径，例如 'scratch/sandbox/string-utils.js' 或 'app/routes/_index.tsx'。"
    ),
  targetContent: z
    .string()
    .describe(
      "文件中需要被替换的精确代码片段。注意：请直接复制实际代码，严禁包含 read_file 中的行号前缀（如 '12 | '）。"
    ),
  replacementContent: z
    .string()
    .describe("用于替换 targetContent 的新代码片段。"),
});

export type EditFileInput = z.infer<typeof EditFileInputSchema>;

/**
 * Automatically clean line number prefixes like "12 | " or "  3 | " if LLM copied from read_file
 */
function cleanLineNumberPrefixes(text: string): string {
  const lines = text.split("\n");
  const prefixRegex = /^\s*\d+\s*\|\s?/;
  const nonBlankLines = lines.filter((l) => l.trim().length > 0);

  if (nonBlankLines.length > 0 && nonBlankLines.every((l) => prefixRegex.test(l))) {
    return lines.map((l) => l.replace(prefixRegex, "")).join("\n");
  }
  return text;
}

/**
 * Multi-tier intelligent code matcher
 */
interface MatchResult {
  startIndex: number;
  endIndex: number;
  matchedText: string;
  startLine: number;
  replacementAdjusted: string;
}

function findMatch(
  original: string,
  target: string,
  replacement: string
): { success: true; match: MatchResult } | { success: false; reason: string; closestSnippet?: string } {
  // Strategy 1: Exact Match
  const exactIndex = original.indexOf(target);
  if (exactIndex !== -1) {
    const secondIndex = original.indexOf(target, exactIndex + 1);
    if (secondIndex !== -1) {
      return {
        success: false,
        reason: `目标代码块在文件中存在多处完全相同的匹配，产生歧义。请在 targetContent 中包含更多上下文代码行以确保唯一匹配。`,
      };
    }

    const startLine = original.substring(0, exactIndex).split("\n").length;
    return {
      success: true,
      match: {
        startIndex: exactIndex,
        endIndex: exactIndex + target.length,
        matchedText: target,
        startLine,
        replacementAdjusted: replacement,
      },
    };
  }

  // Strategy 2: Line-by-Line Trimmed Match (Ignoring Trailing Whitespace)
  const origLines = original.split("\n");
  const targetLines = target.split("\n");

  const matchesFound: Array<{ startLine: number; lineCount: number }> = [];

  for (let i = 0; i <= origLines.length - targetLines.length; i++) {
    let allMatched = true;
    for (let j = 0; j < targetLines.length; j++) {
      if (origLines[i + j].trimEnd() !== targetLines[j].trimEnd()) {
        allMatched = false;
        break;
      }
    }
    if (allMatched) {
      matchesFound.push({ startLine: i, lineCount: targetLines.length });
    }
  }

  if (matchesFound.length === 1) {
    const { startLine, lineCount } = matchesFound[0];
    const beforeLines = origLines.slice(0, startLine);
    const matchedLines = origLines.slice(startLine, startLine + lineCount);

    const startIndex = beforeLines.length > 0 ? beforeLines.join("\n").length + 1 : 0;
    const matchedText = matchedLines.join("\n");

    return {
      success: true,
      match: {
        startIndex,
        endIndex: startIndex + matchedText.length,
        matchedText,
        startLine: startLine + 1,
        replacementAdjusted: replacement,
      },
    };
  }

  if (matchesFound.length > 1) {
    return {
      success: false,
      reason: `目标代码块匹配到了 ${matchesFound.length} 处相似代码行。请包含更多周围上下文行以消除歧义。`,
    };
  }

  // Strategy 3: Indentation-Insensitive Match (Trimmed both ends)
  const fuzzyMatches: Array<{ startLine: number; lineCount: number; baseIndent: string }> = [];

  for (let i = 0; i <= origLines.length - targetLines.length; i++) {
    let allMatched = true;
    for (let j = 0; j < targetLines.length; j++) {
      if (origLines[i + j].trim() !== targetLines[j].trim()) {
        allMatched = false;
        break;
      }
    }
    if (allMatched) {
      const matchLeading = origLines[i].match(/^\s*/)?.[0] || "";
      fuzzyMatches.push({ startLine: i, lineCount: targetLines.length, baseIndent: matchLeading });
    }
  }

  if (fuzzyMatches.length === 1) {
    const { startLine, lineCount } = fuzzyMatches[0];
    const beforeLines = origLines.slice(0, startLine);
    const matchedLines = origLines.slice(startLine, startLine + lineCount);

    const startIndex = beforeLines.length > 0 ? beforeLines.join("\n").length + 1 : 0;
    const matchedText = matchedLines.join("\n");

    return {
      success: true,
      match: {
        startIndex,
        endIndex: startIndex + matchedText.length,
        matchedText,
        startLine: startLine + 1,
        replacementAdjusted: replacement,
      },
    };
  }

  if (fuzzyMatches.length > 1) {
    return {
      success: false,
      reason: `模糊匹配在不同缩进下找到了 ${fuzzyMatches.length} 处匹配代码。请提供更具体的上下文代码。`,
    };
  }

  // Generate diagnostic hints for self-healing
  const targetFirstLine = targetLines.find((l) => l.trim().length > 0)?.trim() || "";
  let closestSnippet: string | undefined;

  if (targetFirstLine) {
    const candidateIdx = origLines.findIndex((l) => l.includes(targetFirstLine.substring(0, 20)));
    if (candidateIdx !== -1) {
      const s = Math.max(0, candidateIdx - 2);
      const e = Math.min(origLines.length, candidateIdx + 6);
      closestSnippet = origLines
        .slice(s, e)
        .map((l, idx) => `${s + idx + 1} | ${l}`)
        .join("\n");
    }
  }

  return {
    success: false,
    reason: `在文件中未找到与 targetContent 完全一致的代码块。`,
    closestSnippet,
  };
}

/**
 * Generate Unified Diff Snippet for clear Observation
 */
function generateDiffSnippet(
  oldText: string,
  newText: string,
  startLine: number
): string {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  const diffLines: string[] = [];
  diffLines.push(`@@ -${startLine},${oldLines.length} +${startLine},${newLines.length} @@`);

  for (const line of oldLines) {
    diffLines.push(`- ${line}`);
  }
  for (const line of newLines) {
    diffLines.push(`+ ${line}`);
  }

  return diffLines.join("\n");
}

export const editFileTool: ToolDefinition<EditFileInput, string> = {
  name: "edit_file",
  description:
    "精准局部代码补丁工具（Search & Replace）。通过提供目标代码片段（targetContent）与替换代码（replacementContent）来修改文件。修改前请先调用 read_file 确保代码内容一致，且不要带行号前缀。",
  schema: EditFileInputSchema,
  execute: async (args, context) => {
    const { filePath } = args;
    const workspaceRoot = path.resolve(context.workspaceDir || process.cwd());
    const targetPath = path.resolve(workspaceRoot, filePath);

    // Sandbox path traversal check
    if (!targetPath.startsWith(workspaceRoot)) {
      throw new Error(
        `安全拦截：不允许编辑工作区之外的文件 '${filePath}'。工作区根目录为: '${workspaceRoot}'`
      );
    }

    try {
      const stats = await fs.stat(targetPath);
      if (!stats.isFile()) {
        throw new Error(`路径 '${filePath}' 不是一个普通文件。`);
      }

      const originalRaw = await fs.readFile(targetPath, "utf-8");

      // Normalize line endings
      const original = originalRaw.replace(/\r\n/g, "\n");
      const target = cleanLineNumberPrefixes(args.targetContent.replace(/\r\n/g, "\n"));
      const replacement = cleanLineNumberPrefixes(args.replacementContent.replace(/\r\n/g, "\n"));

      const matchRes = findMatch(original, target, replacement);

      if (!matchRes.success) {
        let errorMsg = `[代码匹配失败] 在文件 '${filePath}' 中未找到目标代码块 targetContent。原因: ${matchRes.reason}`;
        if (matchRes.closestSnippet) {
          errorMsg += `\n\n💡 发现相似代码片段 (请参考并使用准确代码行进行替换):\n${matchRes.closestSnippet}`;
        } else {
          errorMsg += `\n\n💡 建议：请先使用 read_file("${filePath}") 查看文件最新的准确代码行及空格格式后再试。`;
        }
        throw new Error(errorMsg);
      }

      const { startIndex, endIndex, matchedText, startLine, replacementAdjusted } = matchRes.match;

      const updatedContent =
        original.substring(0, startIndex) +
        replacementAdjusted +
        original.substring(endIndex);

      // Write back
      await fs.writeFile(targetPath, updatedContent, "utf-8");

      const diff = generateDiffSnippet(matchedText, replacementAdjusted, startLine);
      const totalLines = updatedContent.split("\n").length;

      return (
        `[代码补丁应用成功] 已成功修改 '${filePath}' (第 ${startLine} 行, 当前总行数: ${totalLines} 行)。\n\n` +
        `--- 代码差异对比 (Diff) ---\n` +
        diff
      );
    } catch (err: any) {
      if (err.code === "ENOENT") {
        throw new Error(
          `文件不存在: '${filePath}'。如果要创建新文件，请使用 write_file 工具。`
        );
      }
      throw new Error(`编辑文件 '${filePath}' 失败: ${err.message}`);
    }
  },
};

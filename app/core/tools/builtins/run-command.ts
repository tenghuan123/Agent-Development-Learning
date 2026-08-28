import { z } from "zod";
import { exec } from "node:child_process";
import * as path from "node:path";
import type { ToolDefinition } from "../types";

export const RunCommandInputSchema = z.object({
  command: z
    .string()
    .describe(
      "要在终端执行的非交互式 Shell 命令，例如 'node scratch/test.js'、'npx tsc'、'git status' 等。请勿执行交互式命令（如 vim、cat、npm init 无参数等）。"
    ),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(60000)
    .optional()
    .describe("命令执行超时毫秒数，默认 20000ms (20秒)，最大 60000ms。"),
});

export type RunCommandInput = z.infer<typeof RunCommandInputSchema>;

// Dangerous commands blacklist
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+(\/|~|\.\.|\*|\.\s*$)/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, // Fork bomb
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\binit\s+0\b/i,
  /\bchmod\s+-R\s+777\s+\//i,
  /\b(sudo|su)\b/i,
];

/**
 * Smartly truncate output by preserving head (command start) and tail (stack traces and final exit summary)
 */
function smartTruncateOutput(output: string, maxLen: number = 4000): string {
  if (output.length <= maxLen) {
    return output;
  }

  const headLen = Math.floor(maxLen * 0.35);
  const tailLen = Math.floor(maxLen * 0.55);

  const head = output.substring(0, headLen);
  const tail = output.substring(output.length - tailLen);
  const omittedCount = output.length - headLen - tailLen;

  return (
    head +
    `\n\n... [中间 ${omittedCount} 字符输出已自动折叠截断，保留前序信息与尾部关键报错/退出摘要] ...\n\n` +
    tail
  );
}

export const runCommandTool: ToolDefinition<RunCommandInput, string> = {
  name: "run_command",
  description:
    "在工作区终端中安全执行非交互式 Shell 命令行，捕获 Exit Code、Stdout、Stderr 与执行耗时。支持运行测试用例、类型检查、语法验证等构建与验证动作。",
  schema: RunCommandInputSchema,
  execute: async (args, context) => {
    const { command, timeoutMs = 20000 } = args;
    const workspaceRoot = path.resolve(context.workspaceDir || process.cwd());

    // Security check: Guard against dangerous commands
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        throw new Error(
          `[安全沙箱拦截] 该命令匹配到高危操作规则 ('${pattern}')，系统已拒绝执行: '${command}'`
        );
      }
    }

    const startTime = Date.now();

    return new Promise((resolve) => {
      exec(
        command,
        {
          cwd: workspaceRoot,
          timeout: timeoutMs,
          maxBuffer: 1024 * 1024 * 4, // 4MB
          env: {
            ...process.env,
            CI: "true", // Non-interactive mode
            FORCE_COLOR: "0", // Strip terminal ANSI color codes for clean LLM observation
          },
        },
        (error, stdout, stderr) => {
          const duration = Date.now() - startTime;
          const exitCode = error && typeof error.code === "number" ? error.code : error ? 1 : 0;
          const isTimeout = error && (error as any).killed && (error as any).signal === "SIGTERM";

          const cleanStdout = (stdout || "").trim();
          const cleanStderr = (stderr || "").trim();

          const statusBadge =
            exitCode === 0
              ? `✓ 命令成功执行 (Exit Code: 0, 耗时: ${duration}ms)`
              : `✗ 命令执行失败 (Exit Code: ${exitCode}${isTimeout ? " [已超时被强制终止]" : ""}, 耗时: ${duration}ms)`;

          let resultText = `=== [Shell 执行结果]: $ ${command} ===\n${statusBadge}\n`;

          if (cleanStdout) {
            resultText += `\n--- [STDOUT] ---\n${cleanStdout}\n`;
          }

          if (cleanStderr) {
            resultText += `\n--- [STDERR / 错误输出] ---\n${cleanStderr}\n`;
          }

          if (!cleanStdout && !cleanStderr) {
            resultText += `\n(命令无标准输出或错误输出)\n`;
          }

          const maxLen = context.maxOutputLength || 5000;
          resolve(smartTruncateOutput(resultText, maxLen));
        }
      );
    });
  },
};

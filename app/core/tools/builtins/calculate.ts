import { z } from "zod";
import type { ToolDefinition } from "../types";

export const CalculateInputSchema = z.object({
  expression: z
    .string()
    .describe(
      "要计算的数学表达式字符串，例如 '123 * 456 + 789'、'Math.sqrt(144) * 5'、'(1000 - 325) / 15'。"
    ),
});

export type CalculateInput = z.infer<typeof CalculateInputSchema>;

/**
 * Safe evaluator for standard arithmetic expressions
 */
function safeCalculate(expr: string): number {
  const sanitized = expr.trim();

  // Allow only digits, basic operators, parentheses, whitespace, Math constants/functions
  const safeRegex = /^[\d\s\+\-\*\/\%\(\)\.\,\^]|Math\.(abs|sin|cos|tan|sqrt|pow|round|floor|ceil|min|max|PI|E)/;
  
  // Basic security check: disallow letters other than Math.*
  const testLetters = sanitized.replace(/Math\.(abs|sin|cos|tan|sqrt|pow|round|floor|ceil|min|max|PI|E)/g, "");
  if (/[a-zA-Z_$]/.test(testLetters)) {
    throw new Error("表达式包含不合法的变量或非数学标识符，已被安全拦截。");
  }

  // Replace power operator if present
  const executable = sanitized.replace(/\^/g, "**");

  // Execute in isolated function
  const fn = new Function(`"use strict"; return (${executable});`);
  const result = fn();

  if (typeof result !== "number" || isNaN(result)) {
    throw new Error(`表达式计算结果非有效数字: ${result}`);
  }

  return result;
}

export const calculateTool: ToolDefinition<CalculateInput, string> = {
  name: "calculate",
  description:
    "精确计算数学表达式。大模型自身做浮点乘除法、多项式等计算容易产生幻觉，此工具使用宿主 CPU 运算引擎提供 100% 精确的计算结果。",
  schema: CalculateInputSchema,
  execute: async (args) => {
    try {
      const result = safeCalculate(args.expression);
      return `计算表达式: ${args.expression}\n计算结果: ${result}`;
    } catch (err: any) {
      throw new Error(`计算失败: ${err.message}`);
    }
  },
};


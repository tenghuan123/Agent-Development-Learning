import { z } from "zod";
import { LLMClient } from "../llm/client";

export const PackageAnalysisSchema = z.object({
  projectName: z.string().describe("项目名称"),
  version: z.string().describe("版本号"),
  isTypeScript: z.boolean().describe("是否使用 TypeScript"),
  keyDependencies: z.array(z.string()).describe("核心依赖列表（最多5个）"),
  summary: z.string().describe("该项目技术栈一句话总结"),
});

export type PackageAnalysis = z.infer<typeof PackageAnalysisSchema>;

export interface StructuredExperimentResult {
  samplePackageJson: string;
  runPromptOnly: {
    rawOutput: string;
    parsedDirectly: boolean;
    parseError?: string;
    latencyMs: number;
  };
  runStructuredZod: {
    data?: PackageAnalysis;
    rawOutput: string;
    isValidated: boolean;
    latencyMs: number;
  };
  keyTakeaway: string;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runStructuredExperiment(
  client: LLMClient,
  customJson?: string
): Promise<StructuredExperimentResult> {
  const samplePackageJson =
    customJson ||
    JSON.stringify(
      {
        name: "mini-claude-code",
        version: "0.1.0",
        type: "module",
        scripts: {
          dev: "react-router dev",
          build: "react-router build",
        },
        dependencies: {
          react: "^19.0.0",
          "react-router": "^7.2.0",
          openai: "^4.85.4",
          zod: "^3.24.2",
        },
        devDependencies: {
          typescript: "^5.7.3",
          vite: "^6.1.0",
          tailwindcss: "^3.4.17",
        },
      },
      null,
      2
    );

  // Run A: Pure Natural Language Prompting
  const promptOnlyMessage = [
    "请分析以下 package.json 内容，提取项目信息并返回 JSON 格式。",
    "字段要求：projectName, version, isTypeScript (boolean), keyDependencies (string[]), summary (string)。",
    "请直接输出 JSON。",
    "package.json 内容如下：",
    samplePackageJson,
  ].join("\n\n");

  const responseA = await client.chatCompletion({
    messages: [{ role: "user", content: promptOnlyMessage }],
  });

  let parsedDirectly = false;
  let parseError: string | undefined;

  try {
    JSON.parse(responseA.content);
    parsedDirectly = true;
  } catch (err: any) {
    parsedDirectly = false;
    parseError = `原生 JSON.parse 失败: ${err.message}（通常包含 markdown 代码块包裹或前言客套话）`;
  }

  // Short delay between calls
  await delay(500);

  // Run B: Structured Output with Zod Schema Validation
  const responseB = await client.structuredOutput({
    messages: [
      {
        role: "user",
        content: `请严格按照 schema 结构提取以下 package.json 的技术栈信息:\n\n${samplePackageJson}`,
      },
    ],
    schema: PackageAnalysisSchema,
  });

  return {
    samplePackageJson,
    runPromptOnly: {
      rawOutput: responseA.content,
      parsedDirectly,
      parseError,
      latencyMs: responseA.latencyMs,
    },
    runStructuredZod: {
      data: responseB.data,
      rawOutput: responseB.raw,
      isValidated: true,
      latencyMs: responseB.latencyMs,
    },
    keyTakeaway:
      "【核心认知】Prompt 自然语言指令是‘尽力而为’的软约束，经常夹带 markdown 语法、代码块或前言，无法直接用作可靠的系统接口；而基于 JSON Schema / Zod 的 Structured Output 提供类型契约保证，是 Agent 走向工程化稳定运行的基石。",
  };
}

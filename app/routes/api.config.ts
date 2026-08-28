import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const hasServerKey = Boolean(
    process.env.LLM_API_KEY && process.env.LLM_API_KEY.trim().length > 0
  );

  const defaultModel = process.env.LLM_MODEL || "glm-4-flash";
  const baseURL =
    process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";

  return Response.json({
    hasServerKey,
    defaultModel,
    baseURL,
    supportedModels: [
      {
        id: "glm-4-flash",
        name: "GLM-4-Flash",
        provider: "智谱清言 (Zhipu)",
        tag: "推荐 (极速/免费)",
      },
      {
        id: "glm-4-plus",
        name: "GLM-4-Plus",
        provider: "智谱清言 (Zhipu)",
        tag: "旗舰 (Coding 最强)",
      },
      {
        id: "glm-4-air",
        name: "GLM-4-Air",
        provider: "智谱清言 (Zhipu)",
        tag: "高性价比",
      },
      {
        id: "glm-4-long",
        name: "GLM-4-Long",
        provider: "智谱清言 (Zhipu)",
        tag: "1M 超长上下文",
      },
      {
        id: "deepseek-chat",
        name: "DeepSeek V3",
        provider: "DeepSeek",
        tag: "代码与推理",
      },
      {
        id: "deepseek-reasoner",
        name: "DeepSeek R1",
        provider: "DeepSeek",
        tag: "深度思考",
      },
      {
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "OpenAI",
        tag: "通用旗舰",
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        provider: "OpenAI",
        tag: "轻量快速",
      },
      {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        provider: "Anthropic",
        tag: "Agent 顶尖",
      },
    ],
  });
}

import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const hasServerKey = Boolean(
    process.env.OPENROUTER_API_KEY &&
      process.env.OPENROUTER_API_KEY.trim().length > 0
  );

  const defaultModel =
    process.env.DEFAULT_MODEL || "anthropic/claude-3.5-sonnet";
  const baseURL =
    process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";

  return Response.json({
    hasServerKey,
    defaultModel,
    baseURL,
    supportedModels: [
      {
        id: "anthropic/claude-3.5-sonnet",
        name: "Claude 3.5 Sonnet",
        provider: "Anthropic",
        tag: "推荐 (Coding / Reasoning)",
      },
      {
        id: "deepseek/deepseek-chat",
        name: "DeepSeek V3",
        provider: "DeepSeek",
        tag: "高性价比",
      },
      {
        id: "deepseek/deepseek-r1",
        name: "DeepSeek R1",
        provider: "DeepSeek",
        tag: "深度思考 / 推理",
      },
      {
        id: "openai/gpt-4o",
        name: "GPT-4o",
        provider: "OpenAI",
        tag: "多功能",
      },
      {
        id: "openai/gpt-4o-mini",
        name: "GPT-4o Mini",
        provider: "OpenAI",
        tag: "轻量快速",
      },
      {
        id: "meta-llama/llama-3.3-70b-instruct",
        name: "Llama 3.3 70B",
        provider: "Meta",
        tag: "开源顶尖",
      },
    ],
  });
}

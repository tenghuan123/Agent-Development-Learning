export async function loader() {
  const hasServerKey = Boolean(
    process.env.LLM_API_KEY && process.env.LLM_API_KEY.trim().length > 0
  );

  const model = process.env.LLM_MODEL || "glm-4-flash";
  const baseURL =
    process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";

  return Response.json({
    hasServerKey,
    model,
    baseURL,
  });
}

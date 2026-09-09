import type {
  PiExtension,
  ExtensionApi,
  AfterToolCallDecision,
  ContextContribution,
} from "../types";

/**
 * 上下文守卫扩展 (Context Guard Extension)
 * 防止工具无节制吐出几十万字符的巨型输出，导致 Context Window 瞬间被打满或溢出
 * 在 afterToolCall 自动对超限工具输出进行结构化压缩与截断保护
 */
export const ContextGuardExtension: PiExtension = {
  id: "context-guard-extension",
  name: "上下文容量守卫扩展 (Context Guard)",
  version: "1.0.4",
  description: "监控工具返回值体量，对巨量日志、长代码与大 JSON 进行智能窗口截断与首尾采样保留",
  category: "context_guard",
  enabled: true,
  author: "Runtime Reliability Team",
  setup: (api: ExtensionApi) => {
    const MAX_CHAR_THRESHOLD = 2400; // 约 600 Token

    // 注册 afterToolCall 拦截
    api.on("afterToolCall", (event: { toolName: string; result: any }): AfterToolCallDecision => {
      const { toolName, result } = event;
      if (!result) return {};

      const rawContent = typeof result === "string" ? result : JSON.stringify(result, null, 2);

      if (rawContent.length > MAX_CHAR_THRESHOLD) {
        api.log(
          "warn",
          `[ContextGuardTruncate] Tool '${toolName}' produced ${rawContent.length} chars (threshold=${MAX_CHAR_THRESHOLD}). Compacting output.`
        );

        const headChars = Math.floor(MAX_CHAR_THRESHOLD * 0.4);
        const tailChars = Math.floor(MAX_CHAR_THRESHOLD * 0.4);
        const omittedChars = rawContent.length - headChars - tailChars;

        const head = rawContent.slice(0, headChars);
        const tail = rawContent.slice(rawContent.length - tailChars);

        const compacted = `${head}\n\n... [ContextGuard: 已自动折叠中间 ${omittedChars} 字符 (${Math.round(
          omittedChars / 4
        )} Tokens)，如需查看完整细节请分段检索] ...\n\n${tail}`;

        return {
          modifiedResult: typeof result === "string" ? compacted : { _truncated: true, preview: compacted },
          truncated: true,
          warning: `输出超限已自动折叠 ${omittedChars} 字符`,
          tags: ["context_guard_truncated"],
        };
      }

      return {};
    });

    // 注入上下文工作提示
    api.on("provideContext", (): ContextContribution[] => {
      return [
        {
          extensionId: "context-guard-extension",
          category: "working_hint",
          title: "输出预算约束",
          content: "上下文守卫已激活：执行大规模检索或文件读取时，优先使用分页、关键字精准过滤，避免全量 dump。",
          priority: 8,
        },
      ];
    });

    api.log("info", "ContextGuardExtension initialized successfully.");
  },
};

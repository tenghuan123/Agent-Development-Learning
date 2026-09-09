import type {
  PiExtension,
  ExtensionApi,
  BeforeToolCallDecision,
  AfterToolCallDecision,
} from "../types";

/**
 * 权限与安全守卫扩展 (Permission Guard Extension)
 * 在生命周期拦截点注入安全策略：
 * 1. 拦截危险命令 (rm -rf / 等高危破坏性指令)
 * 2. 拦截敏感凭证与配置文件写入 (.env, id_rsa)
 * 3. 扫描并脱敏工具输出中的真实 API 密钥与 Token
 */
export const PermissionGuardExtension: PiExtension = {
  id: "permission-guard-extension",
  name: "安全与权限守卫扩展 (Permission Guard)",
  version: "2.1.0",
  description: "提供命令风险分析、敏感文件保护 (HITL 审批门禁) 与 API Key 泄漏自动脱敏",
  category: "security_guard",
  enabled: true,
  author: "Security & Compliance Team",
  setup: (api: ExtensionApi) => {
    // 1. 注册拦截点：beforeToolCall 拦截危险命令与敏感文件
    api.on("beforeToolCall", (event: { toolName: string; args: Record<string, any> }): BeforeToolCallDecision => {
      const { toolName, args } = event;

      // 1.1 拦截高危 Shell 指令
      if (toolName === "bash" || toolName === "execute_command") {
        const cmd = String(args?.command || args?.CommandLine || "");

        const dangerousPatterns = [
          /\brm\s+-(?:r|f|rf|fr)\s+(?:\/|~|\.\.|\/\*)/i,
          /\bmkfs\b/i,
          /\bdd\s+if=/i,
          /\bDROP\s+DATABASE\b/i,
          /:(){ :|:& };:/,
        ];

        for (const pattern of dangerousPatterns) {
          if (pattern.test(cmd)) {
            api.log("warn", `[SecurityBlocked] Dangerous bash command pattern '${pattern}' detected in: ${cmd}`);
            return {
              allow: false,
              reason: `[PermissionGuard 风险阻断] 检测到高危破坏性系统指令 '${cmd}'，违反企业生产安全红线，已直接物理阻断！`,
            };
          }
        }
      }

      // 1.2 拦截敏感配置修改 (HITL 人工审批门禁)
      if (toolName === "write_to_file" || toolName === "replace_file_content" || toolName === "write" || toolName === "edit") {
        const targetPath = String(args?.TargetFile || args?.path || "");
        const sensitiveFiles = [".env", ".npmrc", "id_rsa", "production.key", "credentials.json"];

        const isSensitive = sensitiveFiles.some((f) => targetPath.endsWith(f));
        if (isSensitive) {
          api.log("warn", `[ApprovalRequired] File mutation requested for sensitive asset: ${targetPath}`);
          return {
            allow: false,
            requiresApproval: true,
            approvalPrompt: `[安全审批门禁] Agent 正在请求写入高危敏感配置文件 '${targetPath}'，此操作可能覆盖生产凭证，需要人工授权！`,
            reason: `修改受保护的密钥文件 '${targetPath}' 需要人工二级授权`,
          };
        }
      }

      return { allow: true };
    });

    // 2. 注册拦截点：afterToolCall 对输出凭证与密钥进行实时脱敏
    api.on("afterToolCall", (event: { toolName: string; result: any }): AfterToolCallDecision => {
      const { result } = event;
      if (!result) return {};

      const stringified = typeof result === "string" ? result : JSON.stringify(result);

      // 探测是否包含常见 API Key 格式 (sk-*, ghp_*, AIzaSy*)
      const secretPatterns = [
        /(sk-[a-zA-Z0-9]{20,})/g,
        /(ghp_[a-zA-Z0-9]{36,})/g,
        /(AIzaSy[a-zA-Z0-9_-]{33})/g,
      ];

      let sanitized = stringified;
      let leakedCount = 0;

      for (const pattern of secretPatterns) {
        sanitized = sanitized.replace(pattern, (match) => {
          leakedCount++;
          return `${match.slice(0, 4)}••••••••••••[MASKED_BY_GUARD]`;
        });
      }

      if (leakedCount > 0) {
        api.log("warn", `[SecretMasked] Desensitized ${leakedCount} leaked credential(s) from tool result`);
        return {
          modifiedResult: typeof result === "string" ? sanitized : JSON.parse(sanitized),
          warning: `已自动脱敏 ${leakedCount} 处敏感凭证`,
          tags: ["security_sanitized"],
        };
      }

      return {};
    });

    api.log("info", "PermissionGuardExtension initialized successfully.");
  },
};

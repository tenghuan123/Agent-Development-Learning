import type { RiskClassification, RiskLevel } from "./types";
import type { ToolCallItem } from "../tools/types";

/**
 * High-risk & Hard-blocked command patterns
 */
export const CRITICAL_FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string; rule: string }> = [
  {
    pattern: /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*)\s+(\/|~|\.\.|\*|\.\s*$)/i,
    reason: "高危递归删除命令：试图递归删除根目录、用户主目录或父目录，可能导致系统瘫痪",
    rule: "RULE_NO_RECURSIVE_ROOT_DELETE",
  },
  {
    pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    reason: "恶意 Fork 炸弹：试图通过耗尽系统进程表导致操作系统崩溃死锁",
    rule: "RULE_NO_FORK_BOMB",
  },
  {
    pattern: /\b(mkfs|dd\s+if=|fdisk|parted)\b/i,
    reason: "底层磁盘覆写/格式化命令：严禁对块设备进行格式化或扇区级写入",
    rule: "RULE_NO_DISK_FORMAT",
  },
  {
    pattern: /\b(sudo|su)\b/i,
    reason: "特权提升命令：Agent 严禁以 root 或超级管理员特权身份执行指令",
    rule: "RULE_NO_SUDO_PRIVILEGE",
  },
  {
    pattern: /\b(shutdown|reboot|init\s+0|halt|poweroff)\b/i,
    reason: "系统关机/重启命令：禁止篡改宿主机运行状态",
    rule: "RULE_NO_SYSTEM_HALT",
  },
  {
    pattern: /\bchmod\s+(-R\s+)?(777|000)\s+(\/|~|\.\.)/i,
    reason: "特权破坏：试图全量修改全局权限掩码",
    rule: "RULE_NO_GLOBAL_CHMOD",
  },
  {
    pattern: /\bcurl\b.*(@\.env|\$\(cat\s+\.env\)|~?\/\.ssh\/id_rsa)/i,
    reason: "数据外泄攻击：试图通过网络请求外发本地敏感环境变量或 SSH 密钥",
    rule: "RULE_NO_DATA_EXFILTRATION",
  },
  {
    pattern: /\b(DROP\s+DATABASE|DROP\s+TABLE|TRUNCATE\s+TABLE)\b/i,
    reason: "高危数据库破坏指令：检测到不可逆的删库/清表 SQL 语句",
    rule: "RULE_NO_DB_DROP",
  },
  {
    pattern: /\/etc\/(shadow|sudoers|master\.passwd)/i,
    reason: "系统核心密码文件访问：禁止读写系统凭据文件",
    rule: "RULE_NO_SYSTEM_AUTH_FILES",
  },
];

/**
 * Standard Whitelisted Safe Command Prefixes (Can be auto-approved in auto_safe mode)
 */
export const TRUSTED_COMMAND_PREFIXES = [
  "git status",
  "git diff",
  "git log",
  "git branch",
  "npm test",
  "npm run test",
  "npm run lint",
  "npm run typecheck",
  "pnpm test",
  "pnpm run test",
  "pnpm run lint",
  "pnpm run typecheck",
  "bun test",
  "node --version",
  "npx tsc --noEmit",
  "echo ",
  "ls ",
  "pwd",
];

export class RiskClassifier {
  /**
   * Classifies a tool call into risk levels (L0 ~ L3)
   */
  static classify(toolCall: ToolCallItem): RiskClassification {
    const name = toolCall.function.name;
    const rawArgs = toolCall.function.arguments || "{}";
    let args: Record<string, any> = {};
    try {
      args = JSON.parse(rawArgs);
    } catch {
      // If args cannot be parsed as JSON, treat with caution
    }

    // 1. Safe Read-only tools -> L0
    if (
      ["read_file", "list_dir", "calculate", "system_info", "scratchpad"].includes(
        name
      )
    ) {
      // Even read_file has path boundaries, checked separately in path-jailer
      return {
        riskLevel: "safe_l0",
        category: "read_only",
        reason: `只读无副作用操作 ('${name}')，安全策略默认自动免批放行。`,
        suggestedAction: "auto_approve",
        affectedTarget: args.path || args.directoryPath || undefined,
      };
    }

    if (name === "manage_memory") {
      if (args.action === "recall" || args.action === "list") {
        return {
          riskLevel: "safe_l0",
          category: "read_only",
          reason: `记忆库检索/列出操作，无副作用。`,
          suggestedAction: "auto_approve",
        };
      }
      return {
        riskLevel: "moderate_l1",
        category: "file_write",
        reason: `记忆库更新操作 ('${args.action}')，将持久化修改本地 Memory Bank。`,
        suggestedAction: "auto_approve",
        affectedTarget: args.key,
      };
    }

    // 2. Planning tools -> L0/L1
    if (name === "manage_plan") {
      return {
        riskLevel: "moderate_l1",
        category: "file_write",
        reason: `任务状态机更新操作 ('${args.action}')。`,
        suggestedAction: "auto_approve",
        affectedTarget: args.title || undefined,
      };
    }

    // 3. Local Workspace Write tools -> L1
    if (["write_file", "edit_file"].includes(name)) {
      const targetPath = args.path || args.filePath || "";

      // Check if target points to dangerous system files
      for (const rule of CRITICAL_FORBIDDEN_PATTERNS) {
        if (rule.pattern.test(targetPath)) {
          return {
            riskLevel: "critical_l3",
            category: "forbidden_op",
            reason: `[底层硬拦截] 试图修改系统高危路径: ${rule.reason}`,
            suggestedAction: "hard_block",
            matchedRule: rule.rule,
            affectedTarget: targetPath,
          };
        }
      }

      return {
        riskLevel: "moderate_l1",
        category: "file_write",
        reason: `工作区文件修改操作 ('${name}')，目标文件: '${targetPath}'。`,
        suggestedAction: "auto_approve",
        affectedTarget: targetPath,
      };
    }

    // 4. Shell Execution / Command Execution -> L2 or L3
    if (name === "run_command") {
      const command = (args.command || "").trim();

      // Check against Critical Forbidden patterns first
      for (const item of CRITICAL_FORBIDDEN_PATTERNS) {
        if (item.pattern.test(command)) {
          return {
            riskLevel: "critical_l3",
            category: "forbidden_op",
            reason: `[底层硬拦截] 该命令触碰系统安全红线: ${item.reason}`,
            suggestedAction: "hard_block",
            matchedRule: item.rule,
            affectedTarget: command,
          };
        }
      }

      // Check if command is a trusted safe command prefix
      const isTrusted = TRUSTED_COMMAND_PREFIXES.some((prefix) =>
        command.startsWith(prefix)
      );

      if (isTrusted) {
        return {
          riskLevel: "moderate_l1",
          category: "shell_exec",
          reason: `受信任的非破坏性命令 ('${command}')，符合本地安全白名单。`,
          suggestedAction: "auto_approve",
          affectedTarget: command,
        };
      }

      // General Shell commands trigger HITL approval
      return {
        riskLevel: "high_l2",
        category: "shell_exec",
        reason: `终端命令可能改变系统环境、删除文件或启动外部网络连接: '$ ${command}'。需人机协同确认 (HITL)。`,
        suggestedAction: "require_approval",
        affectedTarget: command,
      };
    }

    // Default fallback for unrecognized tools
    return {
      riskLevel: "high_l2",
      category: "shell_exec",
      reason: `未识别的自定义工具 ('${name}')，默认采用保守安全策略。`,
      suggestedAction: "require_approval",
    };
  }

  /**
   * Helper to format a badge description for UI display
   */
  static getBadgeInfo(riskLevel: RiskLevel): {
    label: string;
    color: string;
    bg: string;
    border: string;
  } {
    switch (riskLevel) {
      case "safe_l0":
        return {
          label: "L0 只读安全 (Safe)",
          color: "text-emerald-400",
          bg: "bg-emerald-500/10",
          border: "border-emerald-500/30",
        };
      case "moderate_l1":
        return {
          label: "L1 局部修改 (Moderate)",
          color: "text-blue-400",
          bg: "bg-blue-500/10",
          border: "border-blue-500/30",
        };
      case "high_l2":
        return {
          label: "L2 系统执行 (High Risk)",
          color: "text-amber-400",
          bg: "bg-amber-500/10",
          border: "border-amber-500/30",
        };
      case "critical_l3":
        return {
          label: "L3 毁灭高危 (Critical Block)",
          color: "text-rose-400",
          bg: "bg-rose-500/10",
          border: "border-rose-500/30",
        };
    }
  }
}


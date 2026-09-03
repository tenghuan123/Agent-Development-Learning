import type { ToolCallItem } from "../tools/types";
import { RiskClassifier } from "./risk-classifier";
import type {
  ApprovalDecision,
  ApprovalRequest,
  RiskClassification,
  SecurityAuditLog,
  SecurityMode,
} from "./types";
import * as fs from "node:fs";
import * as path from "node:path";

export interface PermissionEvaluationResult {
  allowed: boolean;
  requiresApproval: boolean;
  classification: RiskClassification;
  request?: ApprovalRequest;
  auditLog: SecurityAuditLog;
}

export class PermissionGuard {
  private securityMode: SecurityMode;
  private sessionTrustedCommands: Set<string> = new Set();
  private sessionTrustedFiles: Set<string> = new Set();
  private auditLogs: SecurityAuditLog[] = [];
  private pendingRequests: Map<string, ApprovalRequest> = new Map();
  private workspaceRoot: string;

  constructor(options?: {
    securityMode?: SecurityMode;
    workspaceRoot?: string;
  }) {
    this.securityMode = options?.securityMode || "strict_hitl";
    this.workspaceRoot = path.resolve(options?.workspaceRoot || process.cwd());
  }

  setSecurityMode(mode: SecurityMode) {
    this.securityMode = mode;
  }

  getSecurityMode(): SecurityMode {
    return this.securityMode;
  }

  getAuditLogs(): SecurityAuditLog[] {
    return [...this.auditLogs];
  }

  getPendingRequests(): ApprovalRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  clearAuditLogs() {
    this.auditLogs = [];
  }

  /**
   * Evaluates whether a tool call can proceed immediately or needs HITL approval
   */
  evaluateToolCall(toolCall: ToolCallItem): PermissionEvaluationResult {
    const classification = RiskClassifier.classify(toolCall);
    const toolName = toolCall.function.name;
    const rawArgs = toolCall.function.arguments || "{}";
    let parsedArgs: Record<string, any> = {};
    try {
      parsedArgs = JSON.parse(rawArgs);
    } catch {
      // Ignored
    }

    const command = (parsedArgs.command || "").trim();
    const targetPath = parsedArgs.path || parsedArgs.filePath || "";

    // 1. Critical L3 is ALWAYS hard-blocked regardless of security mode
    if (classification.riskLevel === "critical_l3") {
      const log: SecurityAuditLog = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        toolName,
        riskLevel: "critical_l3",
        decision: "hard_blocked",
        target: classification.affectedTarget,
        details: classification.reason,
      };
      this.auditLogs.unshift(log);

      return {
        allowed: false,
        requiresApproval: false,
        classification,
        auditLog: log,
      };
    }

    // 2. Check Session Whitelist (Already approved by human for this session)
    if (command && this.isCommandSessionTrusted(command)) {
      const log: SecurityAuditLog = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        toolName,
        riskLevel: classification.riskLevel,
        decision: "auto_approved",
        target: command,
        details: `命令已存在于本次会话白名单中 ('${command}')，自动放行。`,
      };
      this.auditLogs.unshift(log);

      return {
        allowed: true,
        requiresApproval: false,
        classification,
        auditLog: log,
      };
    }

    // 3. Bypass Sandbox Mode (Development / Testing mode)
    if (this.securityMode === "bypass_sandbox") {
      const log: SecurityAuditLog = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        toolName,
        riskLevel: classification.riskLevel,
        decision: "auto_approved",
        target: classification.affectedTarget,
        details: `[Bypass Sandbox Mode 处于开启状态] 自动放行 L0~L2 操作。`,
      };
      this.auditLogs.unshift(log);

      return {
        allowed: true,
        requiresApproval: false,
        classification,
        auditLog: log,
      };
    }

    // 4. Auto Safe Mode & Strict HITL Mode
    if (classification.riskLevel === "safe_l0") {
      const log: SecurityAuditLog = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        toolName,
        riskLevel: "safe_l0",
        decision: "auto_approved",
        target: classification.affectedTarget,
        details: classification.reason,
      };
      this.auditLogs.unshift(log);

      return {
        allowed: true,
        requiresApproval: false,
        classification,
        auditLog: log,
      };
    }

    if (classification.riskLevel === "moderate_l1") {
      const log: SecurityAuditLog = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        toolName,
        riskLevel: "moderate_l1",
        decision: "auto_approved",
        target: classification.affectedTarget,
        details: classification.reason,
      };
      this.auditLogs.unshift(log);

      return {
        allowed: true,
        requiresApproval: false,
        classification,
        auditLog: log,
      };
    }

    // 5. High Risk (L2) -> Requires HITL Approval
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const request: ApprovalRequest = {
      id: requestId,
      timestamp: Date.now(),
      toolCallId: toolCall.id,
      toolName,
      rawArguments: rawArgs,
      parsedArguments: parsedArgs,
      classification,
      status: "pending",
    };

    // Prepare diff preview for file edits if applicable
    if (["write_file", "edit_file"].includes(toolName) && targetPath) {
      const fullPath = path.isAbsolute(targetPath)
        ? targetPath
        : path.resolve(this.workspaceRoot, targetPath);
      let existingContent = "";
      try {
        if (fs.existsSync(fullPath)) {
          existingContent = fs.readFileSync(fullPath, "utf-8");
        }
      } catch {
        // Ignore read errors
      }

      request.diffPreview = {
        filePath: targetPath,
        oldContent: existingContent,
        newContent: parsedArgs.content || parsedArgs.newContent || "",
      };
    }

    // Prepare command preview
    if (toolName === "run_command") {
      request.commandPreview = {
        command: command,
        cwd: this.workspaceRoot,
        isDangerous: classification.riskLevel === "high_l2",
      };
    }

    this.pendingRequests.set(requestId, request);

    const log: SecurityAuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      toolName,
      riskLevel: "high_l2",
      decision: "human_approved", // Will be resolved when human decides
      target: classification.affectedTarget,
      details: `[HITL 审批已挂起] 等待用户确认高危操作: ${classification.reason}`,
    };

    return {
      allowed: false,
      requiresApproval: true,
      classification,
      request,
      auditLog: log,
    };
  }

  /**
   * Resolves a pending approval decision
   */
  resolveDecision(decision: ApprovalDecision): {
    success: boolean;
    request?: ApprovalRequest;
    auditLog?: SecurityAuditLog;
  } {
    const request = this.pendingRequests.get(decision.requestId);
    if (!request) {
      return { success: false };
    }

    this.pendingRequests.delete(decision.requestId);

    if (decision.action === "approve_once" || decision.action === "approve_session") {
      request.status = "approved";

      if (decision.action === "approve_session") {
        if (request.toolName === "run_command" && request.parsedArguments.command) {
          this.sessionTrustedCommands.add(request.parsedArguments.command.trim());
        }
      }

      const log: SecurityAuditLog = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        toolName: request.toolName,
        riskLevel: request.classification.riskLevel,
        decision: "human_approved",
        target: request.classification.affectedTarget,
        details: `用户已${decision.action === "approve_session" ? "会话级授权" : "单次授权"}批准执行。`,
      };
      this.auditLogs.unshift(log);

      return { success: true, request, auditLog: log };
    } else {
      request.status = "rejected";

      const log: SecurityAuditLog = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        toolName: request.toolName,
        riskLevel: request.classification.riskLevel,
        decision: "human_rejected",
        target: request.classification.affectedTarget,
        details: `用户已明确驳回此操作。驳回原因: ${decision.feedback || "未提供具体原因"}`,
        feedback: decision.feedback,
      };
      this.auditLogs.unshift(log);

      return { success: true, request, auditLog: log };
    }
  }

  private isCommandSessionTrusted(command: string): boolean {
    const trimmed = command.trim();
    if (this.sessionTrustedCommands.has(trimmed)) {
      return true;
    }
    for (const trusted of this.sessionTrustedCommands) {
      if (trimmed.startsWith(trusted)) {
        return true;
      }
    }
    return false;
  }
}


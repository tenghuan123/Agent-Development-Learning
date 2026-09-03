import type { TokenUsage } from "../llm/types";
import type { ToolCallItem } from "../tools/types";

/**
 * Multi-tier Risk Levels for Tool Execution
 */
export type RiskLevel =
  | "safe_l0"       // Read-only tools (read_file, list_dir, calculate, system_info) -> Auto Approve
  | "moderate_l1"   // Local modifications in workspace (edit_file, write_file) -> Auto or Audit Log
  | "high_l2"       // System execution / shell commands (run_command, git) -> Triggers HITL Approval
  | "critical_l3";  // Destructive / System-level threats (rm -rf /, drop table, mkfs, sudo) -> Hard Block

/**
 * Security Mode for the Execution Harness
 */
export type SecurityMode =
  | "strict_hitl"      // Standard industrial mode: L2 requires Human Approval, L3 Hard Blocked
  | "auto_safe"        // Auto-approve L0 & L1 & trusted commands, prompt on unexpected L2, block L3
  | "bypass_sandbox";  // Testing mode: Auto-approve all except L3 hard-blocked commands

/**
 * Classification result for a tool call
 */
export interface RiskClassification {
  riskLevel: RiskLevel;
  category: "read_only" | "file_write" | "shell_exec" | "forbidden_op" | "network_egress";
  reason: string;
  suggestedAction: "auto_approve" | "require_approval" | "hard_block";
  matchedRule?: string;
  affectedTarget?: string; // Path or command
}

/**
 * Human-in-the-Loop (HITL) Approval Request
 */
export interface ApprovalRequest {
  id: string;
  timestamp: number;
  toolCallId: string;
  toolName: string;
  rawArguments: string;
  parsedArguments: Record<string, any>;
  classification: RiskClassification;
  diffPreview?: {
    filePath: string;
    oldContent?: string;
    newContent?: string;
    unifiedDiff?: string;
  };
  commandPreview?: {
    command: string;
    cwd: string;
    isDangerous: boolean;
  };
  status: "pending" | "approved" | "rejected" | "auto_approved" | "blocked";
}

/**
 * Decision submitted by the human user or policy engine
 */
export interface ApprovalDecision {
  requestId: string;
  action: "approve_once" | "approve_session" | "reject";
  feedback?: string; // Human rejection reason or guidance for self-healing
}

/**
 * Security Audit Log Entry
 */
export interface SecurityAuditLog {
  id: string;
  timestamp: number;
  toolName: string;
  riskLevel: RiskLevel;
  decision: "auto_approved" | "human_approved" | "human_rejected" | "hard_blocked";
  target?: string;
  details: string;
  feedback?: string;
}

/**
 * Sandbox Configuration
 */
export interface SandboxConfig {
  workspaceDir: string;
  securityMode: SecurityMode;
  maxCommandTimeoutMs?: number;
  maxOutputLength?: number;
  blockedEnvVars?: string[];
  whitelistedCommands?: string[];
  blockedCommandPatterns?: RegExp[];
  allowSymlinksOutsideWorkspace?: boolean;
}

/**
 * Stream Event Types emitted by Harness Agent
 */
export type HarnessStreamEvent =
  | { type: "step_start"; stepIndex: number; maxSteps: number }
  | { type: "thought"; content: string }
  | { type: "risk_evaluated"; call: ToolCallItem; classification: RiskClassification }
  | { type: "awaiting_approval"; request: ApprovalRequest }
  | { type: "approval_resolved"; decision: ApprovalDecision; request: ApprovalRequest }
  | { type: "tool_blocked"; toolName: string; reason: string; rule: string }
  | { type: "tool_executing"; toolName: string; args: any }
  | { type: "tool_result"; toolName: string; output: string; isError: boolean; executionTimeMs: number }
  | { type: "secret_redacted"; toolName: string; redactedCount: number }
  | { type: "audit_logged"; log: SecurityAuditLog }
  | { type: "step_completed"; stepIndex: number; tokenUsage?: TokenUsage }
  | { type: "finished"; status: "completed" | "interrupted" | "error" | "blocked" | "max_steps_reached" | "stuck_in_loop"; finalAnswer: string }
  | { type: "error"; error: string };

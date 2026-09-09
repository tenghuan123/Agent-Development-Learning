/**
 * Types & Interfaces for Pi Extensions, Skills, and Microkernel Architecture
 * 对标 @mariozechner/pi-coding-agent 插件与技能扩展规范
 */

export type ExtensionHookType =
  | "onSessionStart"
  | "onSessionEnd"
  | "beforeTurn"
  | "afterTurn"
  | "beforeToolCall"
  | "afterToolCall"
  | "provideContext"
  | "registerCommands";

export interface ExtensionToolParamSchema {
  type: string;
  description: string;
  required?: boolean;
}

export interface ExtensionToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ExtensionToolParamSchema>;
  execute: (args: Record<string, any>, ctx: ExtensionHookContext) => Promise<any> | any;
}

export interface SerializedToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ExtensionToolParamSchema>;
}

export interface SlashCommandDefinition {
  command: string; // e.g. "/spec" or "/review"
  description: string;
  usage?: string;
  handler: (args: string, ctx: ExtensionHookContext) => Promise<string> | string;
}

export interface ExtensionHookContext {
  sessionId: string;
  turnIndex: number;
  workspaceRoot: string;
  model: string;
  metadata?: Record<string, any>;
  abortSignal?: AbortSignal;
}

export interface BeforeToolCallEvent {
  toolName: string;
  args: Record<string, any>;
  callId: string;
}

export interface BeforeToolCallDecision {
  allow: boolean;
  reason?: string;
  modifiedArgs?: Record<string, any>;
  requiresApproval?: boolean;
  approvalPrompt?: string;
}

export interface AfterToolCallEvent {
  toolName: string;
  args: Record<string, any>;
  result: any;
  callId: string;
  executionTimeMs: number;
}

export interface AfterToolCallDecision {
  modifiedResult?: any;
  truncated?: boolean;
  tags?: string[];
  warning?: string;
}

export interface ContextContribution {
  extensionId: string;
  category: "pinned_spec" | "advisory" | "rule" | "working_hint";
  title: string;
  content: string;
  priority: number; // 1 (highest) to 10 (lowest)
}

export interface ExtensionApi {
  addTool: (tool: ExtensionToolDefinition) => void;
  registerCommand: (command: SlashCommandDefinition) => void;
  on: (hook: ExtensionHookType, handler: (...args: any[]) => any) => void;
  log: (level: "info" | "warn" | "error", message: string, data?: any) => void;
  emitEvent: (name: string, payload?: any) => void;
}

export type ExtensionCategory = "enterprise_context" | "security_guard" | "context_guard" | "workflow_tool" | "telemetry";

export interface PiExtension {
  id: string;
  name: string;
  version: string;
  description: string;
  category: ExtensionCategory;
  enabled: boolean;
  author: string;
  setup: (api: ExtensionApi) => void | Promise<void>;
  dependencies?: string[];
}

export interface SerializedExtension {
  id: string;
  name: string;
  version: string;
  description: string;
  category: ExtensionCategory;
  enabled: boolean;
  author: string;
  dependencies?: string[];
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  category: "architecture" | "refactor" | "security" | "review";
  enabled: boolean;
  tags: string[];
  promptTemplate: string;
  requiredTools: string[];
  triggerKeywords?: string[];
}

export interface ExtensionAuditLog {
  id: string;
  timestamp: string;
  extensionId: string;
  hook: ExtensionHookType | "tool_execution" | "command";
  action: string;
  status: "success" | "blocked" | "fault_recovered" | "warning";
  details?: Record<string, any>;
  durationMs: number;
}

export interface MonolithicExecutionRecord {
  scenarioId: string;
  scenarioName: string;
  crashed: boolean;
  unhandledException?: string;
  durationMs: number;
  corruptedState: boolean;
  contextBloatTokens: number;
  outputSummary: string;
  rawPayloadSnippet?: string;
  nativeErrorStack?: string;
  isRealExecution?: boolean;
}

export interface SandboxedExecutionRecord {
  scenarioId: string;
  scenarioName: string;
  crashed: boolean;
  faultIsolated: boolean;
  recoveredFallbackUsed: boolean;
  blockedHarmfulAction: boolean;
  durationMs: number;
  corruptedState: boolean;
  contextBloatTokens: number;
  warningLogs: string[];
  outputSummary: string;
  rawPayloadSnippet?: string;
  auditRecord?: Record<string, any>;
  recoveredFallbackValue?: string;
  isRealExecution?: boolean;
}

export interface ChaosScenarioComparison {
  scenarioId: string;
  scenarioName: string;
  description: string;
  injectionType: "timeout_deadlock" | "uncaught_syntax_error" | "dangerous_rm_command" | "token_flood_overflow" | "unmet_dependency";
  monolithicResult: MonolithicExecutionRecord;
  sandboxedResult: SandboxedExecutionRecord;
  architecturalLesson: string;
  isRealExecution?: boolean;
  executedAt?: string;
}

export interface ExtensionVerificationItem {
  id: string;
  name: string;
  invariant: "Microkernel Purity" | "Fault Barrier Isolation" | "Zero Context Bloat" | "Lifecycle Observability";
  passed: boolean;
  metric: string;
  detail: string;
}

export interface ExtensionVerificationReport {
  timestamp: string;
  allPassed: boolean;
  totalTests: number;
  passedTests: number;
  invariantsScore: number;
  items: ExtensionVerificationItem[];
}

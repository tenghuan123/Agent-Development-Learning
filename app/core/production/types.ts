export type TenantTier = "free" | "pro" | "enterprise";

export type TaskPriority = "p0_critical" | "p1_high" | "p2_normal" | "p3_batch";

export type TaskStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "rejected"
  | "budget_exceeded";

export interface TenantConfig {
  id: string;
  name: string;
  tier: TenantTier;
  maxConcurrency: number;
  rpmLimit: number; // Requests Per Minute
  tpmLimit: number; // Tokens Per Minute
  dailyBudgetUsd: number;
  currentDailySpendUsd: number;
  tokenRateUsdPer1k: number;
}

export interface ProductionTask {
  id: string;
  tenantId: string;
  tenantName: string;
  tier: TenantTier;
  priority: TaskPriority;
  basePriorityScore: number;
  effectivePriorityScore: number;
  prompt: string;
  status: TaskStatus;
  createdAt: number;
  queuedAt: number;
  startedAt?: number;
  completedAt?: number;
  waitingTimeMs: number;
  executionTimeMs?: number;
  tokenBudget: number;
  tokensUsed: number;
  estimatedCostUsd: number;
  activeWorkerId?: string;
  modelUsed?: string;
  fallbackOccurred?: boolean;
  error?: string;
  output?: string;
  retryCount: number;
  logs: string[];
}

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failureThreshold: number; // Consecutive failures before tripping to OPEN
  successThreshold: number; // Consecutive successes in HALF_OPEN before recovery
  timeoutMs: number; // Cooldown duration in OPEN state before trying HALF_OPEN
  baseRetryDelayMs: number; // Base wait for jitter backoff
  maxRetryDelayMs: number; // Max wait ceiling
  maxRetries: number;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  consecutiveFailures: number;
  lastFailureTime: number | null;
  nextAllowedRetryTime: number | null;
  tripCount: number;
  fallbackCount: number;
}

export interface RateLimiterStatus {
  allowed: boolean;
  reason?: string;
  waitTimeMs?: number;
  currentRPM: number;
  maxRPM: number;
  currentTPM: number;
  maxTPM: number;
}

export interface BudgetStatus {
  allowed: boolean;
  isWarning: boolean;
  isHardLimit: boolean;
  currentTokens: number;
  maxBudget: number;
  tenantRemainingDailyBudgetUsd: number;
  reason?: string;
}

export type AuditRiskLevel = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface AuditEntry {
  id: string;
  sequence: number;
  timestamp: number;
  tenantId: string;
  actor: string;
  action: string;
  resource: string;
  riskLevel: AuditRiskLevel;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
  isTampered?: boolean;
}

export interface AuditIntegrityReport {
  isValid: boolean;
  totalEntries: number;
  brokenSequenceIndex?: number;
  errorDetail?: string;
}

export interface ProductionSystemMetrics {
  totalWorkers: number;
  activeWorkers: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
  rejectedTasks: number;
  budgetExceededTasks: number;
  totalTokensProcessed: number;
  totalCostUsd: number;
  circuitBreakerState: CircuitState;
  circuitBreakerMetrics: CircuitBreakerMetrics;
  avgWaitTimeMs: number;
  avgExecTimeMs: number;
  tenants: TenantConfig[];
}


import type { BudgetStatus, ProductionTask, TenantConfig } from "./types";

export class BudgetGuardrail {
  private dailySpendMap: Map<string, number> = new Map();

  /**
   * Calculate cost in USD given tokens and rate
   */
  public calculateCost(tokens: number, tokenRateUsdPer1k: number): number {
    return Number(((tokens / 1000) * tokenRateUsdPer1k).toFixed(6));
  }

  /**
   * Check if a task or additional token consumption exceeds budget
   */
  public checkTaskBudget(
    task: ProductionTask,
    additionalTokens: number,
    tenant: TenantConfig
  ): BudgetStatus {
    const projectedTokens = task.tokensUsed + additionalTokens;
    const currentDailySpend = this.getDailySpend(tenant.id);
    const remainingDailyBudget = Math.max(0, tenant.dailyBudgetUsd - currentDailySpend);

    // 1. Tenant daily hard budget check
    const additionalCost = this.calculateCost(additionalTokens, tenant.tokenRateUsdPer1k);
    if (currentDailySpend + additionalCost > tenant.dailyBudgetUsd) {
      return {
        allowed: false,
        isWarning: true,
        isHardLimit: true,
        currentTokens: projectedTokens,
        maxBudget: task.tokenBudget,
        tenantRemainingDailyBudgetUsd: remainingDailyBudget,
        reason: `租户每日预算超限: 已消耗 $${currentDailySpend.toFixed(4)} / 上限 $${tenant.dailyBudgetUsd.toFixed(4)}`,
      };
    }

    // 2. Single task hard limit (100%)
    if (projectedTokens > task.tokenBudget) {
      return {
        allowed: false,
        isWarning: true,
        isHardLimit: true,
        currentTokens: projectedTokens,
        maxBudget: task.tokenBudget,
        tenantRemainingDailyBudgetUsd: remainingDailyBudget,
        reason: `单任务 Token 预算耗尽: 当前消耗 ${projectedTokens} / 硬顶上限 ${task.tokenBudget} Tokens`,
      };
    }

    // 3. Single task soft warning (>= 80%)
    const isWarning = projectedTokens >= task.tokenBudget * 0.8;

    return {
      allowed: true,
      isWarning,
      isHardLimit: false,
      currentTokens: projectedTokens,
      maxBudget: task.tokenBudget,
      tenantRemainingDailyBudgetUsd: remainingDailyBudget,
      reason: isWarning ? `警告: 任务已消耗 80% 预算 (${projectedTokens}/${task.tokenBudget} Tokens)` : undefined,
    };
  }

  /**
   * Record actual token consumption and update daily spend
   */
  public recordTokenSpend(tenant: TenantConfig, tokens: number): number {
    const cost = this.calculateCost(tokens, tenant.tokenRateUsdPer1k);
    const current = this.getDailySpend(tenant.id);
    const updated = Number((current + cost).toFixed(6));
    this.dailySpendMap.set(tenant.id, updated);
    return cost;
  }

  /**
   * Get current daily spend for a tenant
   */
  public getDailySpend(tenantId: string): number {
    return this.dailySpendMap.get(tenantId) || 0;
  }

  /**
   * Reset daily spend
   */
  public reset(tenantId?: string) {
    if (tenantId) {
      this.dailySpendMap.delete(tenantId);
    } else {
      this.dailySpendMap.clear();
    }
  }
}


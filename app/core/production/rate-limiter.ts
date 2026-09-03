import type { RateLimiterStatus, TenantConfig } from "./types";

interface BucketState {
  rpmTokens: number;
  tpmTokens: number;
  lastRefillTime: number;
  recentRequests: { timestamp: number; tokens: number }[];
}

export class DualTrackRateLimiter {
  private buckets: Map<string, BucketState> = new Map();

  /**
   * Get or initialize the bucket state for a tenant
   */
  private getOrCreateBucket(tenant: TenantConfig): BucketState {
    let state = this.buckets.get(tenant.id);
    if (!state) {
      state = {
        rpmTokens: tenant.rpmLimit,
        tpmTokens: tenant.tpmLimit,
        lastRefillTime: Date.now(),
        recentRequests: [],
      };
      this.buckets.set(tenant.id, state);
    }
    return state;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(tenant: TenantConfig, state: BucketState) {
    const now = Date.now();
    const elapsedSeconds = (now - state.lastRefillTime) / 1000;

    if (elapsedSeconds > 0) {
      // RPM refill rate per second
      const rpmRefill = (tenant.rpmLimit / 60) * elapsedSeconds;
      state.rpmTokens = Math.min(tenant.rpmLimit, state.rpmTokens + rpmRefill);

      // TPM refill rate per second
      const tpmRefill = (tenant.tpmLimit / 60) * elapsedSeconds;
      state.tpmTokens = Math.min(tenant.tpmLimit, state.tpmTokens + tpmRefill);

      state.lastRefillTime = now;
    }

    // Clean up rolling window timestamps older than 60s
    const windowCutoff = now - 60000;
    state.recentRequests = state.recentRequests.filter((r) => r.timestamp > windowCutoff);
  }

  /**
   * Inspect current limit status without consuming tokens
   */
  public checkLimit(tenant: TenantConfig, requestedTokens = 100): RateLimiterStatus {
    const state = this.getOrCreateBucket(tenant);
    this.refill(tenant, state);

    const now = Date.now();
    const windowCutoff = now - 60000;
    const windowRequests = state.recentRequests.filter((r) => r.timestamp > windowCutoff);
    const rollingRPM = windowRequests.length;
    const rollingTPM = windowRequests.reduce((acc, curr) => acc + curr.tokens, 0);

    if (state.rpmTokens < 1 || rollingRPM >= tenant.rpmLimit) {
      const waitTimeMs = Math.ceil((1 / (tenant.rpmLimit / 60)) * 1000);
      return {
        allowed: false,
        reason: `RPM 频控超限 (当前: ${rollingRPM}/${tenant.rpmLimit} 次/分)。请稍后重试。`,
        waitTimeMs,
        currentRPM: rollingRPM,
        maxRPM: tenant.rpmLimit,
        currentTPM: rollingTPM,
        maxTPM: tenant.tpmLimit,
      };
    }

    if (state.tpmTokens < requestedTokens || rollingTPM + requestedTokens > tenant.tpmLimit) {
      const waitTimeMs = Math.ceil((requestedTokens / (tenant.tpmLimit / 60)) * 1000);
      return {
        allowed: false,
        reason: `TPM 吞吐额度超限 (预估需要 ${requestedTokens} Tokens，当前已消耗 ${rollingTPM}/${tenant.tpmLimit} Tokens/分)。`,
        waitTimeMs,
        currentRPM: rollingRPM,
        maxRPM: tenant.rpmLimit,
        currentTPM: rollingTPM,
        maxTPM: tenant.tpmLimit,
      };
    }

    return {
      allowed: true,
      currentRPM: rollingRPM,
      maxRPM: tenant.rpmLimit,
      currentTPM: rollingTPM,
      maxTPM: tenant.tpmLimit,
    };
  }

  /**
   * Consume tokens if allowed
   */
  public consume(tenant: TenantConfig, requestedTokens = 100): boolean {
    const status = this.checkLimit(tenant, requestedTokens);
    if (!status.allowed) {
      return false;
    }

    const state = this.getOrCreateBucket(tenant);
    state.rpmTokens = Math.max(0, state.rpmTokens - 1);
    state.tpmTokens = Math.max(0, state.tpmTokens - requestedTokens);
    state.recentRequests.push({
      timestamp: Date.now(),
      tokens: requestedTokens,
    });

    return true;
  }

  /**
   * Get current usage statistics for a tenant
   */
  public getTenantUsage(tenant: TenantConfig): { currentRPM: number; currentTPM: number } {
    const state = this.getOrCreateBucket(tenant);
    this.refill(tenant, state);
    const now = Date.now();
    const windowRequests = state.recentRequests.filter((r) => r.timestamp > now - 60000);
    return {
      currentRPM: windowRequests.length,
      currentTPM: windowRequests.reduce((acc, curr) => acc + curr.tokens, 0),
    };
  }

  /**
   * Reset bucket for a specific tenant or all tenants
   */
  public reset(tenantId?: string) {
    if (tenantId) {
      this.buckets.delete(tenantId);
    } else {
      this.buckets.clear();
    }
  }
}


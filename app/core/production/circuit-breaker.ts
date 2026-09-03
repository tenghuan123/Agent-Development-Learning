import type { CircuitBreakerConfig, CircuitBreakerMetrics, CircuitState } from "./types";

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private successCount = 0;
  private consecutiveFailures = 0;
  private lastFailureTime: number | null = null;
  private tripCount = 0;
  private fallbackCount = 0;

  constructor(customConfig?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: 5,
      successThreshold: 2,
      timeoutMs: 10000, // 10 seconds cooldown
      baseRetryDelayMs: 300,
      maxRetryDelayMs: 5000,
      maxRetries: 3,
      ...customConfig,
    };
  }

  /**
   * Calculate sleep delay using Full Jitter Exponential Backoff algorithm:
   * Ceiling = min(maxDelay, baseDelay * 2^attempt)
   * Sleep = Uniform(0, Ceiling)
   */
  public calculateBackoffDelay(attempt: number): number {
    const ceiling = Math.min(
      this.config.maxRetryDelayMs,
      this.config.baseRetryDelayMs * Math.pow(2, attempt)
    );
    return Math.floor(Math.random() * ceiling);
  }

  /**
   * Evaluate if a request is allowed through the circuit breaker
   */
  public canExecute(): {
    allowed: boolean;
    fallbackRecommended: boolean;
    state: CircuitState;
    reason?: string;
  } {
    const now = Date.now();

    // Check if OPEN cooldown has elapsed
    if (this.state === "OPEN") {
      if (this.lastFailureTime && now - this.lastFailureTime >= this.config.timeoutMs) {
        // Transition to HALF_OPEN to probe upstream health
        this.state = "HALF_OPEN";
        this.successCount = 0;
        return {
          allowed: true,
          fallbackRecommended: false,
          state: "HALF_OPEN",
          reason: "断路器冷却期已满，进入 HALF_OPEN 试探放行状态。",
        };
      }

      // Still OPEN: reject traffic and recommend fallback
      return {
        allowed: false,
        fallbackRecommended: true,
        state: "OPEN",
        reason: `断路器处于 OPEN 熔断状态。冷却倒计时还需 ${Math.ceil(
          (this.config.timeoutMs - (now - (this.lastFailureTime || now))) / 1000
        )} 秒。已激活级联降级策略。`,
      };
    }

    if (this.state === "HALF_OPEN") {
      return {
        allowed: true,
        fallbackRecommended: false,
        state: "HALF_OPEN",
        reason: "HALF_OPEN 状态：限量试探中...",
      };
    }

    return {
      allowed: true,
      fallbackRecommended: false,
      state: "CLOSED",
    };
  }

  /**
   * Record a successful invocation
   */
  public recordSuccess() {
    this.consecutiveFailures = 0;

    if (this.state === "HALF_OPEN") {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        // Recover to CLOSED
        this.state = "CLOSED";
        this.failureCount = 0;
        this.successCount = 0;
      }
    }
  }

  /**
   * Record a failed invocation
   */
  public recordFailure(_error?: string) {
    this.failureCount++;
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === "HALF_OPEN") {
      // In HALF_OPEN, a single failure immediately trips back to OPEN
      this.state = "OPEN";
      this.tripCount++;
      return;
    }

    if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.state = "OPEN";
      this.tripCount++;
    }
  }

  /**
   * Increment fallback count
   */
  public recordFallback() {
    this.fallbackCount++;
  }

  /**
   * Manually force trip to OPEN for disaster simulation drill
   */
  public trip() {
    this.state = "OPEN";
    this.consecutiveFailures = this.config.failureThreshold;
    this.lastFailureTime = Date.now();
    this.tripCount++;
  }

  /**
   * Reset breaker to initial healthy state
   */
  public reset() {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.successCount = 0;
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
    this.tripCount = 0;
    this.fallbackCount = 0;
  }

  /**
   * Get current metrics
   */
  public getMetrics(): CircuitBreakerMetrics {
    const now = Date.now();
    let nextAllowedRetryTime: number | null = null;
    if (this.state === "OPEN" && this.lastFailureTime) {
      nextAllowedRetryTime = this.lastFailureTime + this.config.timeoutMs;
    }

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime,
      nextAllowedRetryTime: nextAllowedRetryTime && nextAllowedRetryTime > now ? nextAllowedRetryTime : null,
      tripCount: this.tripCount,
      fallbackCount: this.fallbackCount,
    };
  }
}


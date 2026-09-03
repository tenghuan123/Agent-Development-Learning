import type { IdempotencyRecord } from "./types";

export class IdempotencyVault {
  private records: Map<string, IdempotencyRecord> = new Map();

  /**
   * Compute a deterministic idempotency key for an action
   */
  public computeKey(
    runId: string,
    nodeId: string,
    actionName: string,
    args: Record<string, any>
  ): string {
    const argsSorted = Object.keys(args)
      .sort()
      .reduce((acc, k) => {
        acc[k] = args[k];
        return acc;
      }, {} as Record<string, any>);

    const argsStr = JSON.stringify(argsSorted);
    let hash = 0;
    for (let i = 0; i < argsStr.length; i++) {
      hash = (hash << 5) - hash + argsStr.charCodeAt(i);
      hash |= 0;
    }
    const hashHex = Math.abs(hash).toString(16).padStart(8, "0");
    return `idem_${nodeId}_${actionName}_${hashHex}`;
  }

  /**
   * Execute an action with idempotency protection.
   * If the record already exists and succeeded, return the cached result without invoking executor.
   */
  public async executeWithIdempotency<T>(params: {
    runId: string;
    nodeId: string;
    actionName: string;
    args: Record<string, any>;
    isSideEffect?: boolean;
    executor: () => Promise<T>;
  }): Promise<{
    result: T;
    fromCache: boolean;
    key: string;
    record: IdempotencyRecord;
  }> {
    const key = this.computeKey(
      params.runId,
      params.nodeId,
      params.actionName,
      params.args
    );

    const existing = this.records.get(key);
    if (existing && existing.status === "executed") {
      // CACHE HIT: Replay side effect from vault, do not re-execute!
      existing.executionCount += 1;
      return {
        result: existing.result as T,
        fromCache: true,
        key,
        record: existing,
      };
    }

    // Execute fresh action
    try {
      const result = await params.executor();
      const record: IdempotencyRecord = {
        key,
        runId: params.runId,
        nodeId: params.nodeId,
        actionName: params.actionName,
        args: params.args,
        status: "executed",
        result,
        executedAt: Date.now(),
        executionCount: 1,
        isSideEffect: params.isSideEffect ?? true,
      };
      this.records.set(key, record);

      return {
        result,
        fromCache: false,
        key,
        record,
      };
    } catch (err: any) {
      const failedRecord: IdempotencyRecord = {
        key,
        runId: params.runId,
        nodeId: params.nodeId,
        actionName: params.actionName,
        args: params.args,
        status: "failed",
        result: { error: err.message || String(err) },
        executedAt: Date.now(),
        executionCount: 1,
        isSideEffect: params.isSideEffect ?? true,
      };
      this.records.set(key, failedRecord);
      throw err;
    }
  }

  /**
   * Query an existing idempotency record
   */
  public getRecord(key: string): IdempotencyRecord | null {
    return this.records.get(key) || null;
  }

  /**
   * Get all recorded side-effects (optionally filtered by runId)
   */
  public getAllRecords(runId?: string): IdempotencyRecord[] {
    const list = Array.from(this.records.values());
    if (runId) {
      return list.filter((r) => r.runId === runId);
    }
    return list;
  }

  /**
   * Simulate a catastrophic conflict when a non-idempotent action is blindly re-run without protection
   */
  public simulateCollisionError(
    actionName: string,
    args: Record<string, any>
  ): string {
    switch (actionName) {
      case "db_migration":
        return `[SQL-42P07] Migration Failed: table '${
          args.tableName || "v2_users"
        }' already exists in schema 'public'. Cannot re-apply migration without idempotency!`;
      case "slack_alert":
        return `[SLACK-COLLISION] Duplicate alert rejected: Webhook rate limit exceeded! Duplicate message UUID with timestamp was detected in #devops.`;
      case "cloud_deploy":
        return `[AWS-CONFLICT] ResourceAlreadyExistsException: TargetGroup/arn:aws:elasticloadbalancing:app/v2-prod already exists and is bound to active traffic!`;
      default:
        return `[COLLISION] Non-idempotent action '${actionName}' collided with existing external state!`;
    }
  }

  /**
   * Clear records
   */
  public clear(runId?: string) {
    if (runId) {
      for (const [k, v] of this.records.entries()) {
        if (v.runId === runId) {
          this.records.delete(k);
        }
      }
    } else {
      this.records.clear();
    }
  }
}


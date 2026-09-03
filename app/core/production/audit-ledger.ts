import crypto from "crypto";
import type { AuditEntry, AuditIntegrityReport, AuditRiskLevel } from "./types";

const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

export class AuditLedger {
  private entries: AuditEntry[] = [];
  private sequenceCounter = 0;
  private backupOriginalEntries: AuditEntry[] | null = null;

  constructor() {
    // Record genesis entry
    this.appendRaw({
      tenantId: "system",
      actor: "system_kernel",
      action: "LEDGER_INITIALIZED",
      resource: "audit_vault",
      riskLevel: "INFO",
      payload: { system: "Mini Claude Code Production Kernel", version: "V11" },
    });
  }

  /**
   * Mask sensitive tokens, API keys, passwords from payload
   */
  public scrubSensitiveData(payload: Record<string, unknown>): Record<string, unknown> {
    const scrubbed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (typeof v === "string") {
        if (/api[_-]?key|token|secret|password|bearer/i.test(k)) {
          scrubbed[k] = v.length > 8 ? `${v.slice(0, 3)}***${v.slice(-4)}` : "******";
        } else {
          scrubbed[k] = v;
        }
      } else if (typeof v === "object" && v !== null) {
        scrubbed[k] = this.scrubSensitiveData(v as Record<string, unknown>);
      } else {
        scrubbed[k] = v;
      }
    }
    return scrubbed;
  }

  /**
   * Compute cryptographic SHA-256 hash for an entry anchored to prevHash
   */
  public computeHash(
    prevHash: string,
    sequence: number,
    timestamp: number,
    tenantId: string,
    action: string,
    riskLevel: AuditRiskLevel,
    payload: Record<string, unknown>
  ): string {
    const serializedPayload = JSON.stringify(payload, Object.keys(payload).sort());
    const rawContent = `${prevHash}|${sequence}|${timestamp}|${tenantId}|${action}|${riskLevel}|${serializedPayload}`;
    return crypto.createHash("sha256").update(rawContent).digest("hex");
  }

  /**
   * Append a new entry to the immutable ledger
   */
  public append(entry: {
    tenantId: string;
    actor: string;
    action: string;
    resource: string;
    riskLevel: AuditRiskLevel;
    payload?: Record<string, unknown>;
  }): AuditEntry {
    return this.appendRaw(entry);
  }

  private appendRaw(entry: {
    tenantId: string;
    actor: string;
    action: string;
    resource: string;
    riskLevel: AuditRiskLevel;
    payload?: Record<string, unknown>;
  }): AuditEntry {
    const sequence = this.sequenceCounter++;
    const timestamp = Date.now();
    const scrubbedPayload = this.scrubSensitiveData(entry.payload || {});

    const prevHash =
      this.entries.length > 0 ? this.entries[this.entries.length - 1].hash : GENESIS_HASH;

    const hash = this.computeHash(
      prevHash,
      sequence,
      timestamp,
      entry.tenantId,
      entry.action,
      entry.riskLevel,
      scrubbedPayload
    );

    const fullEntry: AuditEntry = {
      id: `audit-${sequence}-${Date.now().toString(36)}`,
      sequence,
      timestamp,
      tenantId: entry.tenantId,
      actor: entry.actor,
      action: entry.action,
      resource: entry.resource,
      riskLevel: entry.riskLevel,
      payload: scrubbedPayload,
      prevHash,
      hash,
    };

    this.entries.push(fullEntry);
    return fullEntry;
  }

  /**
   * Verify cryptographic integrity of the entire ledger chain
   */
  public verifyIntegrity(): AuditIntegrityReport {
    if (this.entries.length === 0) {
      return { isValid: true, totalEntries: 0 };
    }

    let expectedPrevHash = GENESIS_HASH;

    for (let i = 0; i < this.entries.length; i++) {
      const item = this.entries[i];

      // 1. Verify prevHash link
      if (item.prevHash !== expectedPrevHash) {
        return {
          isValid: false,
          totalEntries: this.entries.length,
          brokenSequenceIndex: item.sequence,
          errorDetail: `哈希链断裂: 条目 #${item.sequence} 的 prevHash 与前一条目的 hash 不匹配！(前序: ${expectedPrevHash.slice(0, 10)}... 记录: ${item.prevHash.slice(0, 10)}...)`,
        };
      }

      // 2. Recompute current hash to detect internal payload tampering
      const recomputedHash = this.computeHash(
        item.prevHash,
        item.sequence,
        item.timestamp,
        item.tenantId,
        item.action,
        item.riskLevel,
        item.payload
      );

      if (recomputedHash !== item.hash) {
        return {
          isValid: false,
          totalEntries: this.entries.length,
          brokenSequenceIndex: item.sequence,
          errorDetail: `内容防伪指纹失效: 条目 #${item.sequence} (操作: ${item.action}) 内容被篡改！(重算 Hash: ${recomputedHash.slice(0, 10)}... 账本记录: ${item.hash.slice(0, 10)}...)`,
        };
      }

      expectedPrevHash = item.hash;
    }

    return {
      isValid: true,
      totalEntries: this.entries.length,
    };
  }

  /**
   * Maliciously tamper with an audit entry to simulate an attacker altering logs
   */
  public tamper(sequenceIndex?: number, fakePayload?: Record<string, unknown>): { success: boolean; tamperedSequence: number } {
    if (this.entries.length === 0) return { success: false, tamperedSequence: -1 };

    let entry: AuditEntry | undefined;
    if (sequenceIndex !== undefined) {
      entry = this.entries.find((e) => e.sequence === sequenceIndex);
    }
    if (!entry) {
      // Pick entry at index 1 if available, otherwise entry 0
      entry = this.entries.length > 1 ? this.entries[1] : this.entries[0];
    }

    // Backup before first tamper
    if (!this.backupOriginalEntries) {
      this.backupOriginalEntries = JSON.parse(JSON.stringify(this.entries));
    }

    // Tamper payload without updating cryptographic hash
    entry.payload = {
      ...entry.payload,
      ...(fakePayload || {
        actor: "intruder_root",
        unauthorizedCommand: "rm -rf /database_production",
      }),
      _hacked: true,
    };
    entry.isTampered = true;
    return { success: true, tamperedSequence: entry.sequence };
  }

  /**
   * Restore ledger from original untampered backup
   */
  public restore(): boolean {
    if (this.backupOriginalEntries) {
      this.entries = JSON.parse(JSON.stringify(this.backupOriginalEntries));
      this.backupOriginalEntries = null;
      return true;
    }
    return false;
  }

  /**
   * Get all entries
   */
  public getEntries(): AuditEntry[] {
    return [...this.entries];
  }

  /**
   * Reset ledger
   */
  public reset() {
    this.entries = [];
    this.sequenceCounter = 0;
    this.backupOriginalEntries = null;
    this.appendRaw({
      tenantId: "system",
      actor: "system_kernel",
      action: "LEDGER_INITIALIZED",
      resource: "audit_vault",
      riskLevel: "INFO",
      payload: { system: "Mini Claude Code Production Kernel", version: "V11" },
    });
  }
}


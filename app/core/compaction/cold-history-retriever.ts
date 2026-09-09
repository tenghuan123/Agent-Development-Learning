import type { ColdArchivedEvent } from "./types";

export class ColdHistoryRetriever {
  private events: ColdArchivedEvent[] = [];

  constructor(initialEvents: ColdArchivedEvent[] = []) {
    this.events = [...initialEvents];
  }

  /**
   * Append raw events into immutable cold storage (simulating events.jsonl)
   */
  public appendEvent(event: Omit<ColdArchivedEvent, "id">): ColdArchivedEvent {
    const newEvent: ColdArchivedEvent = {
      ...event,
      id: `cold-evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
    this.events.push(newEvent);
    return newEvent;
  }

  public getAllEvents(): ColdArchivedEvent[] {
    return [...this.events];
  }

  public getEventCount(): number {
    return this.events.length;
  }

  /**
   * Search cold history with keyword matching, tag filtering, and step range
   */
  public search(params: {
    query: string;
    tag?: string;
    fromStep?: number;
    toStep?: number;
    limit?: number;
  }): {
    results: ColdArchivedEvent[];
    matchedCount: number;
    searchLatencyMs: number;
  } {
    const startTime = performance.now();
    const { query, tag, fromStep = 0, toStep = 999999, limit = 10 } = params;

    const lowerQuery = query.toLowerCase().trim();

    const filtered = this.events.filter((evt) => {
      if (evt.step < fromStep || evt.step > toStep) return false;
      if (tag && !evt.tags.includes(tag)) return false;

      if (!lowerQuery) return true;

      const summaryMatch = evt.summary.toLowerCase().includes(lowerQuery);
      const payloadMatch = evt.fullPayload.toLowerCase().includes(lowerQuery);
      const tagMatch = evt.tags.some((t) => t.toLowerCase().includes(lowerQuery));

      return summaryMatch || payloadMatch || tagMatch;
    });

    const results = filtered.slice(0, limit);
    const searchLatencyMs = Math.round((performance.now() - startTime) * 100) / 100;

    return {
      results,
      matchedCount: filtered.length,
      searchLatencyMs: Math.max(1, searchLatencyMs),
    };
  }

  /**
   * Seed cold storage with realistic historical events for long-running sessions
   */
  public static createDefaultSeedEvents(): ColdArchivedEvent[] {
    return [
      {
        id: "cold-seed-1",
        step: 2,
        timestamp: Date.now() - 3600000,
        type: "TOOL_CALL",
        summary: "read_file('src/config/database.ts')",
        fullPayload: `export const dbConfig = { host: "127.0.0.1", port: 5432, pool: { min: 2, max: 20 }, walMode: true };`,
        tags: ["database", "config", "io"],
        tokens: 120,
      },
      {
        id: "cold-seed-2",
        step: 4,
        timestamp: Date.now() - 3300000,
        type: "TOOL_RESULT",
        summary: "Error: SQLITE_BUSY: database is locked during concurrent write in worker 3",
        fullPayload: `[ERROR] SQLITE_BUSY: database is locked\n  at SQLiteStatement.run (/app/node_modules/better-sqlite3/index.js:68)\n  at acquireTransactionLock (/app/src/db/lock.ts:42)\n  Fatal: Deadlock detected between Worker 1 and Worker 3 waiting on WAL checkpoint.`,
        tags: ["error", "deadlock", "sqlite", "fatal"],
        tokens: 350,
      },
      {
        id: "cold-seed-3",
        step: 7,
        timestamp: Date.now() - 2900000,
        type: "TOOL_CALL",
        summary: "write_to_file('src/auth/jwt-utils.ts')",
        fullPayload: `export function extractBearerToken(authorizationHeader: string, prefix = "Bearer "): string | null {\n  if (!authorizationHeader || !authorizationHeader.startsWith(prefix)) return null;\n  return authorizationHeader.slice(prefix.length).trim();\n}`,
        tags: ["auth", "jwt", "symbols", "code"],
        tokens: 280,
      },
      {
        id: "cold-seed-4",
        step: 11,
        timestamp: Date.now() - 2400000,
        type: "COMPACTION",
        summary: "Session Compacted at Step 11: 45,000 raw tokens distilled into Structured Anchor",
        fullPayload: `CompactionEvent { epoch: 1, boundary: step_11, preservedPartitions: ["PINNED", "WORKING_SET", "NEGATIVE_CONSTRAINTS", "HOT_WINDOW"] }`,
        tags: ["pi-compaction", "milestone"],
        tokens: 180,
      },
      {
        id: "cold-seed-5",
        step: 15,
        timestamp: Date.now() - 1800000,
        type: "TOOL_RESULT",
        summary: "vitest run --filter auth.test.ts => 12 passed, 0 failed",
        fullPayload: `✓ src/auth/jwt.test.ts (6 tests) 14ms\n✓ src/auth/redis-blacklist.test.ts (6 tests) 28ms\nTest Files: 2 passed\nTests: 12 passed\nTime: 420ms`,
        tags: ["test", "verification", "auth"],
        tokens: 210,
      },
    ];
  }
}

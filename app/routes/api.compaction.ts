import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  CompactionChaosRunner,
  CompactionVerificationSuite,
  ContextBudgetManager,
  StructuredCompactor,
  ColdHistoryRetriever,
  LiveCompactor,
  type WorkingSetFile,
  type NegativeConstraint,
} from "~/core/compaction";
import type { ChatMessage } from "~/core/llm/types";
import { LLMClient } from "~/core/llm/client";

// Keep an in-memory instance of Cold History for the interactive session
const globalColdRetriever = new ColdHistoryRetriever(ColdHistoryRetriever.createDefaultSeedEvents());

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const budgetManager = new ContextBudgetManager();
  const seedMessages = generateSampleLongSession();
  const originalTokens = ContextBudgetManager.estimateMessagesTokens(seedMessages);

  const sampleWorkingSet: WorkingSetFile[] = [
    {
      path: "src/auth/bearer-middleware.ts",
      status: "MODIFIED",
      exportedSymbols: ["extractBearerToken", "authenticateUser", "TokenPayload"],
      approxTokens: 520,
      lastModifiedStep: 8,
      diffSnippet: "export function extractBearerToken(header: string, prefix = 'Bearer '): string | null",
    },
    {
      path: "src/db/redis-blacklist.ts",
      status: "CREATED",
      exportedSymbols: ["revokeToken", "isTokenBlacklisted", "acquireLockWithTtl"],
      approxTokens: 680,
      lastModifiedStep: 9,
      diffSnippet: "export async function acquireLockWithTtl(key: string, ttlMs = 5000): Promise<boolean>",
    },
  ];

  const sampleTraps: NegativeConstraint[] = [
    {
      id: "trap-deadlock-1",
      stepDiscovered: 4,
      category: "DEADLOCK",
      statement: "Do not acquire database transaction locks without explicit TTL lease and retry backoff",
      reason: "Concurrent worker queue waiting on raw SQLite lock led to system-wide freeze",
      suggestedAlternative: "Use acquireLockWithTtl from redis-blacklist with exponential backoff",
      severity: "CRITICAL",
      timesAvoided: 3,
    },
    {
      id: "trap-type-1",
      stepDiscovered: 7,
      category: "TYPE_ERROR",
      statement: "extractBearerToken requires raw string header; never pass incoming Request object",
      reason: "Passing Request object caused runtime TypeError: header.startsWith is not a function",
      suggestedAlternative: "Always extract req.headers.get('authorization') before calling",
      severity: "HIGH",
      timesAvoided: 5,
    },
  ];

  const initialPartitions = budgetManager.computePartitionSlices({
    pinnedMessages: [seedMessages[0]],
    workingSet: sampleWorkingSet,
    negativeConstraints: sampleTraps,
    ledger: null,
    hotWindowMessages: seedMessages.slice(-4),
    archivedEventsCount: globalColdRetriever.getEventCount(),
    archivedTokensEstimate: originalTokens,
  });

  return Response.json({
    config: budgetManager.getConfig(),
    initialPartitions,
    originalTokens,
    seedMessageCount: seedMessages.length,
    workingSet: sampleWorkingSet,
    negativeConstraints: sampleTraps,
    coldEventCount: globalColdRetriever.getEventCount(),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = await request.json();
    const actionType = body.action;

    switch (actionType) {
      case "run-chaos-benchmark": {
        const report = CompactionChaosRunner.runBenchmark();
        return Response.json({ success: true, report });
      }

      case "verify-invariants": {
        const report = CompactionVerificationSuite.runAll();
        return Response.json({ success: true, report });
      }

      case "run-live-comparison": {
        const apiKey = body.apiKey || process.env.LLM_API_KEY || "";
        const baseURL = body.baseURL || process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
        const model = body.model || process.env.LLM_MODEL || "glm-4-flash";
        const runDownstreamChallenge = body.runDownstreamChallenge !== false;

        if (!apiKey || apiKey.trim().length === 0) {
          return Response.json(
            {
              success: false,
              error: "未配置 LLM API Key，请在页面右上角设置，或在根目录 .env 文件中配置 LLM_API_KEY",
            },
            { status: 400 }
          );
        }

        const client = new LLMClient({ apiKey, baseURL, defaultModel: model });
        const messages: ChatMessage[] = body.messages || generateSampleLongSession();

        const liveResult = await LiveCompactor.runLiveComparison({
          client,
          messages,
          model,
          runDownstreamChallenge,
        });

        return Response.json({ success: true, liveResult });
      }

      case "perform-structured-compaction": {
        const budgetLimit = body.budgetLimit ? Number(body.budgetLimit) : 32000;
        const budgetManager = new ContextBudgetManager({ maxContextLimit: budgetLimit });
        const compactor = new StructuredCompactor(budgetManager);

        const messages: ChatMessage[] = body.messages || generateSampleLongSession();
        const step = body.step ? Number(body.step) : 12;
        const workingSet: WorkingSetFile[] = body.workingSet || [];
        const negativeConstraints: NegativeConstraint[] = body.negativeConstraints || [];

        const result = compactor.compact({
          messages,
          step,
          primaryObjective: body.primaryObjective || "Production Distributed Auth & Lock Refactoring",
          existingWorkingSet: workingSet,
          existingNegativeConstraints: negativeConstraints,
          coldArchive: globalColdRetriever.getAllEvents(),
        });

        // Also record this compaction event into cold storage
        globalColdRetriever.appendEvent({
          step,
          timestamp: Date.now(),
          type: "COMPACTION",
          summary: `Session Compacted at Step ${step}: Saved ${result.tokensSaved} tokens (${result.reductionPercentage}%)`,
          fullPayload: JSON.stringify(result.ledger, null, 2),
          tags: ["compaction", "milestone", `step-${step}`],
          tokens: result.compactedTokens,
        });

        return Response.json({ success: true, result });
      }

      case "search-cold-history": {
        const query = String(body.query || "");
        const tag = body.tag ? String(body.tag) : undefined;
        const searchRes = globalColdRetriever.search({ query, tag });
        return Response.json({ success: true, searchRes });
      }

      case "append-cold-event": {
        const event = body.event;
        const appended = globalColdRetriever.appendEvent(event);
        return Response.json({ success: true, event: appended });
      }

      default:
        return Response.json({ success: false, error: `Unknown action: ${actionType}` }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * Generate a realistic 20-step conversation for interactive testing
 */
function generateSampleLongSession(): ChatMessage[] {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are an autonomous AI coding agent executing a multi-step engineering mission. Maintain high architectural rigor, follow existing interfaces strictly, and never repeat disproven hypotheses.",
    },
    {
      role: "user",
      content: "Please refactor our monolithic auth middleware to support distributed microservices and stateless JWT.",
    },
    {
      role: "assistant",
      content: "I will first inspect the database connection pool and existing lock mechanisms.",
      tool_calls: [
        {
          id: "tc_read_db",
          type: "function",
          function: { name: "read_file", arguments: JSON.stringify({ filePath: "src/config/database.ts" }) },
        },
      ],
    },
    {
      role: "tool",
      tool_call_id: "tc_read_db",
      content: `export const dbConfig = { host: "127.0.0.1", port: 5432, pool: { min: 2, max: 20 }, walMode: true };`,
    },
    {
      role: "assistant",
      content: "Now I will attempt to acquire an in-memory lock for user session validation.",
      tool_calls: [
        {
          id: "tc_exec_lock",
          type: "function",
          function: { name: "exec", arguments: JSON.stringify({ cmd: "npm run test:concurrency" }) },
        },
      ],
    },
    {
      role: "tool",
      tool_call_id: "tc_exec_lock",
      content:
        "CRITICAL ERROR: SQLITE_BUSY: database is locked.\nFatal deadlock between Worker 1 and Worker 3 waiting on WAL checkpoint.\nTransaction aborted after 10000ms timeout.",
    },
    {
      role: "assistant",
      content:
        "The in-memory transaction lock deadlocked because workers did not have TTL expiration. I have learned to NEVER acquire database locks without explicit TTL and retry backoff. I will switch to Redis with TTL lease.",
    },
    {
      role: "assistant",
      content: "Let me create the helper file for token extraction.",
      tool_calls: [
        {
          id: "tc_write_helper",
          type: "function",
          function: {
            name: "write_to_file",
            arguments: JSON.stringify({
              filePath: "src/auth/bearer-middleware.ts",
              content:
                "export function extractBearerToken(header: string, prefix = 'Bearer '): string | null {\n  if (!header || !header.startsWith(prefix)) return null;\n  return header.slice(prefix.length).trim();\n}\nexport function authenticateUser() {}\nexport interface TokenPayload { userId: string; role: string; }",
            }),
          },
        },
      ],
    },
    {
      role: "tool",
      tool_call_id: "tc_write_helper",
      content: "Successfully wrote 320 bytes to src/auth/bearer-middleware.ts",
    },
    {
      role: "assistant",
      content: "Now writing the Redis blacklist helper.",
      tool_calls: [
        {
          id: "tc_write_redis",
          type: "function",
          function: {
            name: "write_to_file",
            arguments: JSON.stringify({
              filePath: "src/db/redis-blacklist.ts",
              content:
                "export async function acquireLockWithTtl(key: string, ttlMs = 5000): Promise<boolean> { return true; }\nexport async function revokeToken(jti: string) {}\nexport async function isTokenBlacklisted(jti: string) { return false; }",
            }),
          },
        },
      ],
    },
    {
      role: "tool",
      tool_call_id: "tc_write_redis",
      content: "Successfully wrote 280 bytes to src/db/redis-blacklist.ts",
    },
    {
      role: "assistant",
      content: "Testing the new token verification with unit tests.",
      tool_calls: [
        {
          id: "tc_run_tests",
          type: "function",
          function: { name: "exec", arguments: JSON.stringify({ cmd: "npm test" }) },
        },
      ],
    },
    {
      role: "tool",
      tool_call_id: "tc_run_tests",
      content: "✓ 12 unit tests passed cleanly (42ms). Zero deadlock occurrences.",
    },
    {
      role: "assistant",
      content: "All unit tests succeeded! The stateless JWT middleware is functional. Proceeding to router mounting.",
    },
  ];

  return messages;
}

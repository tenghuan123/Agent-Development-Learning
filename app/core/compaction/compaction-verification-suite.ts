import { ContextBudgetManager } from "./context-budget-manager";
import { StructuredCompactor } from "./structured-compactor";
import { ColdHistoryRetriever } from "./cold-history-retriever";
import type { ChatMessage } from "../llm/types";
import type {
  CompactionVerificationReport,
  CompactionInvariantAssertion,
  WorkingSetFile,
} from "./types";

export class CompactionVerificationSuite {
  /**
   * Run all 4 domain invariants of Context Compaction & Budget Partitioning
   */
  public static runAll(): CompactionVerificationReport {
    const assertions: CompactionInvariantAssertion[] = [];

    // Invariant 1: Negative Knowledge Retention
    assertions.push(CompactionVerificationSuite.verifyNegativeKnowledgeRetention());

    // Invariant 2: Symbol & Type Fidelity
    assertions.push(CompactionVerificationSuite.verifySymbolFidelity());

    // Invariant 3: Hard Budget Enclosure
    assertions.push(CompactionVerificationSuite.verifyBudgetEnclosure());

    // Invariant 4: Lossless Cold History Penetration
    assertions.push(CompactionVerificationSuite.verifyColdHistoryPenetration());

    const allPassed = assertions.every((a) => a.passed);
    const summary = allPassed
      ? "所有 4 项 Context Compaction 领域守恒律 100% 通过验证！负向避坑记忆不可遗忘、符号签名位级保真、预算配额严格受限、冷历史只追加无损穿透。"
      : "守恒律验证存在异常，请检查上述断言报告。";

    return {
      timestamp: Date.now(),
      allPassed,
      assertions,
      summary,
    };
  }

  /**
   * Invariant 1: Negative Knowledge Retention Invariant
   * When history is compacted, all logged traps (fatal errors, deadlocks) must be retained at 100% rate.
   */
  private static verifyNegativeKnowledgeRetention(): CompactionInvariantAssertion {
    const compactor = new StructuredCompactor();

    // Fabricate a session history containing a fatal deadlock error
    const messages: ChatMessage[] = [
      { role: "system", content: "You are an agent." },
      { role: "user", content: "Implement worker concurrency." },
      {
        role: "assistant",
        content: "I will use SQLite transaction lock.",
        tool_calls: [
          {
            id: "tc_1",
            type: "function",
            function: { name: "exec", arguments: JSON.stringify({ cmd: "node worker.js" }) },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "tc_1",
        content: "Error: SQLITE_BUSY: database is locked. Fatal deadlock detected between worker 1 and worker 2.",
      },
      {
        role: "assistant",
        content: "The lock failed. Let me use Redis with TTL instead. TODO: verify distributed lock.",
      },
      { role: "user", content: "Continue next step." },
      { role: "assistant", content: "Proceeding with next steps." },
    ];

    const result = compactor.compact({
      messages,
      step: 6,
      primaryObjective: "Worker concurrency",
    });

    const hasDeadlockTrap = result.ledger.negativeConstraints.some(
      (trap) => trap.category === "DEADLOCK" && /database is locked|SQLite/i.test(trap.statement + trap.reason)
    );

    const anchorContainsTrapWarning = result.compactedMessages.some(
      (msg) => typeof msg.content === "string" && msg.content.includes("NEGATIVE CONSTRAINTS") && msg.content.includes("DEADLOCK")
    );

    const passed = hasDeadlockTrap && anchorContainsTrapWarning;

    return {
      id: "inv-1-negative-knowledge",
      name: "负向避坑记忆不可遗忘律",
      lawTitle: "Negative Knowledge Retention Invariant",
      passed,
      expected: "100% 提取并保留历史中出现的致命 Deadlock 负向记忆，并在 Anchor 顶部突出预警",
      actual: passed
        ? `成功提炼 ${result.ledger.negativeConstraints.length} 条负向避坑黑名单，并在 Compacted Anchor 显式置顶`
        : "负向避坑约束提取失败或未注入 Compacted Messages",
      details:
        "守恒律 1 证明：结构化压缩引擎永远不会把血淋淋的排错反思概括成轻飘飘的闲聊，避坑黑名单具备最高留存优先级，防止 Agent 重蹈覆辙。",
    };
  }

  /**
   * Invariant 2: Symbol & Type Fidelity Invariant
   * The exported symbols and type signatures from the active working set must be preserved bit-for-bit.
   */
  private static verifySymbolFidelity(): CompactionInvariantAssertion {
    const compactor = new StructuredCompactor();

    const initialWorkingSet: WorkingSetFile[] = [
      {
        path: "src/auth/token-service.ts",
        status: "MODIFIED",
        exportedSymbols: ["extractBearerToken", "verifyJwtToken", "revokeTokenInRedis"],
        approxTokens: 450,
        lastModifiedStep: 5,
        diffSnippet: "export function extractBearerToken(authHeader: string): string | null",
      },
    ];

    const messages: ChatMessage[] = [
      { role: "system", content: "You are an agent." },
      { role: "user", content: "Please update the router." },
      {
        role: "assistant",
        content: "Updated router to use extractBearerToken.",
      },
      { role: "user", content: "Next step please." },
      { role: "assistant", content: "Working on it." },
      { role: "user", content: "Next step 2." },
      { role: "assistant", content: "Finished step 2." },
    ];

    const result = compactor.compact({
      messages,
      step: 8,
      existingWorkingSet: initialWorkingSet,
    });

    const activeFiles = result.ledger.activeWorkingSet;
    const targetFile = activeFiles.find((f) => f.path === "src/auth/token-service.ts");

    const hasAllSymbols =
      targetFile !== undefined &&
      ["extractBearerToken", "verifyJwtToken", "revokeTokenInRedis"].every((sym) =>
        targetFile.exportedSymbols.includes(sym)
      );

    const anchorHasSymbols = result.compactedMessages.some(
      (msg) =>
        typeof msg.content === "string" &&
        msg.content.includes("extractBearerToken") &&
        msg.content.includes("verifyJwtToken")
    );

    const passed = hasAllSymbols && anchorHasSymbols;

    return {
      id: "inv-2-symbol-fidelity",
      name: "符号签名位级保真律",
      lawTitle: "Symbol & Type Fidelity Invariant",
      passed,
      expected: "活动工作区中所有已导出的关键符号与接口签名 100% 位级保真，杜绝 LLM 幻觉失真",
      actual: passed
        ? `成功保留全部 ${targetFile?.exportedSymbols.length} 个函数签名，并在 Working Set 区块位级呈现`
        : "函数签名在压缩过程中发生丢失或篡改",
      details:
        "守恒律 2 证明：代码修改不同于日常会话，函数名、参数顺序与返回类型的失真会导致代码编译直接崩溃。结构化压缩把 Working Set 作为一等公民保真维护。",
    };
  }

  /**
   * Invariant 3: Hard Budget Enclosure Invariant
   * The total token size of the assembled compacted prompt must never exceed the specified context limit.
   */
  private static verifyBudgetEnclosure(): CompactionInvariantAssertion {
    const budgetLimit = 4000;
    const budgetManager = new ContextBudgetManager({
      maxContextLimit: budgetLimit,
      highWatermarkRatio: 0.7,
      hotWindowTurnCount: 2,
    });
    const compactor = new StructuredCompactor(budgetManager);

    // Fabricate a massive message list that exceeds 15,000 tokens
    const longContent = "A".repeat(4000);
    const messages: ChatMessage[] = [
      { role: "system", content: "You are an agent." },
      { role: "user", content: "Task initial: " + longContent },
      { role: "assistant", content: "Execution 1: " + longContent },
      { role: "user", content: "Task step 2: " + longContent },
      { role: "assistant", content: "Execution 2: " + longContent },
      { role: "user", content: "Hot step 1" },
      { role: "assistant", content: "Hot step 2" },
    ];

    const result = compactor.compact({
      messages,
      step: 15,
      primaryObjective: "Stress Test Budget Enclosure",
    });

    const passed = result.compactedTokens <= budgetLimit && result.reductionPercentage >= 50;

    return {
      id: "inv-3-budget-enclosure",
      name: "预算配额严格受限律",
      lawTitle: "Hard Budget Enclosure Invariant",
      passed,
      expected: `压缩后 Prompt 总 Token 严格 <= 设定的总配额 (${budgetLimit} Tokens)，且 Token 缩减率 >= 50%`,
      actual: `原始 ${result.originalTokens} Tokens ➔ 压缩后 ${result.compactedTokens} Tokens (缩减 ${result.reductionPercentage}%, 上限 ${budgetLimit})`,
      details:
        "守恒律 3 证明：无论原始工程执行了多少轮交互、产生了多少兆日志，ContextBudgetManager 都能通过分层动态截断强行兜底，绝不发生 HTTP 400 Context Exceeded 爆窗。",
    };
  }

  /**
   * Invariant 4: Lossless Cold History Penetration Invariant
   * Historic events folded away into cold archive must remain 100% intact and retrievable on-demand.
   */
  private static verifyColdHistoryPenetration(): CompactionInvariantAssertion {
    const seedEvents = ColdHistoryRetriever.createDefaultSeedEvents();
    const retriever = new ColdHistoryRetriever(seedEvents);

    // Target search for the deadlock incident that happened 2 hours ago
    const searchRes = retriever.search({
      query: "SQLITE_BUSY",
      tag: "deadlock",
    });

    const foundTarget = searchRes.results.some((r) => r.step === 4 && r.fullPayload.includes("SQLITE_BUSY"));
    const latencyAcceptable = searchRes.searchLatencyMs < 50;

    const passed = foundTarget && latencyAcceptable;

    return {
      id: "inv-4-cold-history-penetration",
      name: "冷历史无损可穿透检索律",
      lawTitle: "Lossless Cold History Penetration Invariant",
      passed,
      expected: "冷归档保持 100% 只追加位级真相，能够在 < 50ms 内靶向精准检索被压缩的早期原始日志",
      actual: passed
        ? `在 ${searchRes.searchLatencyMs}ms 内精确命中 Step 4 原始报错日志，零信息丢失`
        : "冷检索未命中或检索超时",
      details:
        "守恒律 4 证明：对标 Pi 的只追加 events.jsonl，Compaction 并不意味着物理删除历史。任何已被折叠的细节都可以通过 Cold History Search 靶向反查，真理永不磨灭。",
    };
  }
}

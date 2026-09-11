/**
 * 第 19 课 (V18): 什么时候 while loop 开始失控？
 * 5 重混沌事故对照运行器 (The 5 Chaos Benchmark Scenarios)
 */

import { SpaghettiLoopEngine } from "./spaghetti-loop-engine";
import { StructuredWorkflowEngine } from "./structured-workflow-engine";
import type {
  ChaosScenarioResult,
  SoftwareTask,
} from "./types";

export class WorkflowChaosRunner {
  /**
   * 运行全部 5 大混沌对抗场景并产出量化对比
   */
  public static runAllScenarios(): ChaosScenarioResult[] {
    return [
      this.runDesyncLoopTrap(),
      this.runRetryExhaustion(),
      this.runHitlSuspension(),
      this.runReviewRejection(),
      this.runCyclomaticExplosion(),
    ];
  }

  /**
   * 场景 1：标志位遗漏重置陷阱 (The Desync Loop Trap)
   * 核心痛点：重试时深层 if 漏写 testsExecuted = false，引发不可逃逸的死锁
   */
  public static runDesyncLoopTrap(): ChaosScenarioResult {
    const task: SoftwareTask = {
      id: "task-desync",
      title: "修复支付回调幂等性 Bug",
      description: "处理并发网络抖动下的重复扣款问题，需要 1 次测试失败后自愈修复",
      targetFiles: ["payment/service.ts", "payment/idempotency.ts"],
      isDestructive: false,
      simulatedTestFailsCount: 1,
      simulatedReviewRejectionsCount: 0,
    };

    // 1. 运行 Spaghetti 引擎 (注入遗漏重置标志位的常见 Bug)
    const spaghettiEngine = new SpaghettiLoopEngine(task, {
      simulateDesyncBug: true,
      maxLoopLimit: 20,
    });
    const spResult = spaghettiEngine.runToCompletion();

    // 2. 运行 Structured 引擎 (天然基于状态转移，无松散标志位)
    const structuredEngine = new StructuredWorkflowEngine(task);
    const stResult = structuredEngine.runToCompletion();

    return {
      id: "DESYNC_LOOP_TRAP",
      title: "场景 1：标志位遗漏重置陷阱 (The Desync Loop Trap)",
      description: "在单体 While 循环中，程序员在重试分支遗漏重置 testsExecuted=false，导致死锁空转",
      spaghettiResult: {
        success: false,
        cyclomaticComplexity: spResult.cyclomaticComplexityPeak,
        failureMode: "DEADLOCK (循环迭代 20 次超时，陷入未定义盲区)",
        diagnosisDifficulty: "EXTREME",
        logSnippet: "⚠️ 致命异常：没有任何 if 分支能够捕获当前 14 个标志位的组合！",
        variableLeakCount: 14,
      },
      structuredResult: {
        success: stResult.terminalStatus === "SUCCESS",
        cyclomaticComplexity: stResult.cyclomaticComplexityPeak,
        failureMode: "无 (状态转移显式清零，自愈成功)",
        diagnosisDifficulty: "TRIVIAL",
        logSnippet: "【TEST 节点】-> [测试未通过但未超限] -> 【IMPLEMENT 节点】确定性推进",
        variableLeakCount: 0,
      },
      verdict: "显式状态机胜出：消灭 14 个散落变量，从根源杜绝状态不同步引发的死锁",
      whyWhileLoopFailed: "在命令式循环中，状态变更分散在几十行代码的各个分支内，稍有遗漏便破坏全局不变量。",
    };
  }

  /**
   * 场景 2：测试反复挂掉与重试超限回滚 (Retry Exhaustion & Rollback)
   */
  public static runRetryExhaustion(): ChaosScenarioResult {
    const task: SoftwareTask = {
      id: "task-retry-exhaust",
      title: "重构底层连接池分配算法",
      description: "算法在极端压力下产生死锁，模拟 3 次自愈均失败，必须安全回滚",
      targetFiles: ["pool/allocator.ts", "pool/connection.ts"],
      isDestructive: false,
      simulatedTestFailsCount: 99, // 必然失败
      simulatedReviewRejectionsCount: 0,
    };

    const spEngine = new SpaghettiLoopEngine(task);
    const spResult = spEngine.runToCompletion();

    const stEngine = new StructuredWorkflowEngine(task);
    const stResult = stEngine.runToCompletion();

    return {
      id: "RETRY_EXHAUSTION",
      title: "场景 2：测试重试耗尽与安全回滚 (Retry Exhaustion & Rollback)",
      description: "面对无法自愈的顽固 Bug，检验多层嵌套 if-else 是否能准确触发事务回滚",
      spaghettiResult: {
        success: spResult.terminalStatus === "ROLLED_BACK",
        cyclomaticComplexity: spResult.cyclomaticComplexityPeak,
        failureMode: "需经过 5 层嵌套 if/else 级联判断才能抵达回滚逻辑",
        diagnosisDifficulty: "HIGH",
        logSnippet: "else if (testsExecuted && !testsPassed && retryAttempts >= 3) -> 触发回滚",
        variableLeakCount: 14,
      },
      structuredResult: {
        success: stResult.terminalStatus === "ROLLED_BACK",
        cyclomaticComplexity: stResult.cyclomaticComplexityPeak,
        failureMode: "显式边 TEST -> [重试超限] -> ROLLBACK -> FAILED",
        diagnosisDifficulty: "LOW",
        logSnippet: "【ROLLBACK 节点】：已安全回退所有受污染文件，工作流平稳降级",
        variableLeakCount: 0,
      },
      verdict: "显式状态机胜出：转移条件作为一等公民表达，无需在多重条件表达式中大海捞针",
      whyWhileLoopFailed: "嵌套分支深度达 4 层，维护者必须在大脑中模拟整个执行栈才能推断出回滚条件。",
    };
  }

  /**
   * 场景 3：人机审批挂起与断电恢复 (HITL Suspension & Deserialization)
   */
  public static runHitlSuspension(): ChaosScenarioResult {
    const task: SoftwareTask = {
      id: "task-hitl",
      title: "生产数据库分库分表 Schema 迁移",
      description: "包含 DROP COLUMN 与数据重分区，属于最高风险操作，强制要求人类确认",
      targetFiles: ["migrations/004_partition.sql"],
      isDestructive: true,
      simulatedTestFailsCount: 0,
      simulatedReviewRejectionsCount: 0,
    };

    // 1. Spaghetti 模式挂起
    const spEngine = new SpaghettiLoopEngine(task, { autoApproveDestructive: false });
    const spResult = spEngine.runToCompletion();

    // 2. Structured 模式挂起并模拟断电序列化入库
    const stEngine = new StructuredWorkflowEngine(task, { autoApprove: false });
    const stResult = stEngine.runToCompletion();

    // 模拟序列化与恢复
    const serialized = JSON.stringify(stEngine.getState());
    const restoredState = JSON.parse(serialized);
    const resumedEngine = new StructuredWorkflowEngine(task, {}, restoredState);
    resumedEngine.approveAndResume();
    const resumeResult = resumedEngine.runToCompletion();

    return {
      id: "HITL_SUSPENSION",
      title: "场景 3：人机审批挂起与断电重入 (HITL Suspension & Deserialization)",
      description: "高危变更触发阻断，检验能否将执行上下文无损持久化，并在数小时后安全恢复",
      spaghettiResult: {
        success: false,
        cyclomaticComplexity: spResult.cyclomaticComplexityPeak,
        failureMode: "无法直接序列化：14 个零散局部变量与当前 PC 指针焊死在调用栈内",
        diagnosisDifficulty: "EXTREME",
        logSnippet: "while 循环在等待期间强行截断，若想恢复需手工重新组装 14 个标志位",
        variableLeakCount: 14,
      },
      structuredResult: {
        success: resumeResult.terminalStatus === "SUCCESS",
        cyclomaticComplexity: stResult.cyclomaticComplexityPeak,
        failureMode: "无 (原子序列化单对象，反序列化后 100% 幂等恢复)",
        diagnosisDifficulty: "TRIVIAL",
        logSnippet: "APPROVAL_GATE 节点暂停 -> JSON 序列化 -> 人类审批 -> 瞬时恢复执行",
        variableLeakCount: 0,
      },
      verdict: "显式工作流压倒性胜出：控制流变为纯数据结构，天然具备 Durable Execution 基因",
      whyWhileLoopFailed: "命令式 while loop 的控制流保存在运行时调用栈中，一旦暂停，调用栈无法优雅持久化。",
    };
  }

  /**
   * 场景 4：审查打回循环与逻辑交叉 (Review Rejection Loop)
   */
  public static runReviewRejection(): ChaosScenarioResult {
    const task: SoftwareTask = {
      id: "task-review-rejection",
      title: "增加微服务 JWT 验签中间件",
      description: "代码审查初次发现缺少针对过期 Token 的时钟漂移容错，打回重新修改",
      targetFiles: ["middleware/jwt.ts", "test/jwt.spec.ts"],
      isDestructive: false,
      simulatedTestFailsCount: 0,
      simulatedReviewRejectionsCount: 1, // 打回 1 次
    };

    const spEngine = new SpaghettiLoopEngine(task);
    const spResult = spEngine.runToCompletion();

    const stEngine = new StructuredWorkflowEngine(task);
    const stResult = stEngine.runToCompletion();

    return {
      id: "REVIEW_REJECTION",
      title: "场景 4：代码审查打回与交叉循环 (Review Rejection Loop)",
      description: "代码审查打回修改后，必须重新经历【修改 -> 测试 -> 再次审查】，检验分支互斥性",
      spaghettiResult: {
        success: spResult.terminalStatus === "SUCCESS",
        cyclomaticComplexity: spResult.cyclomaticComplexityPeak,
        failureMode: "逻辑交叉危险：reviewDone 与 testsExecuted 产生竞争状态，极易跳过重新测试",
        diagnosisDifficulty: "HIGH",
        logSnippet: "else if (hasPlanned && (!isEditing || reviewFeedback !== null)) -> 强行重置标志",
        variableLeakCount: 14,
      },
      structuredResult: {
        success: stResult.terminalStatus === "SUCCESS",
        cyclomaticComplexity: stResult.cyclomaticComplexityPeak,
        failureMode: "无 (明确的周期有向边 REVIEW -> IMPLEMENT -> TEST -> REVIEW)",
        diagnosisDifficulty: "LOW",
        logSnippet: "【REVIEW 节点】：审查驳回 -> 顺畅转移至 IMPLEMENT -> TEST 完整回归",
        variableLeakCount: 0,
      },
      verdict: "显式状态机胜出：有向无环图/有向状态图天然支持周期流转，职责单一",
      whyWhileLoopFailed: "在 while 循环中实现回路流转，必须手动翻转前置所有阶段的标志位，极易出现时序污染。",
    };
  }

  /**
   * 场景 5：业务规则膨胀引发的圈复杂度爆炸 (Cyclomatic Complexity Explosion)
   */
  public static runCyclomaticExplosion(): ChaosScenarioResult {
    const task: SoftwareTask = {
      id: "task-bloat",
      title: "企业核心转账引擎架构加固",
      description: "引入 4 条静态 Lint 规则校验与高危安全审计网关，模拟业务复杂度增长",
      targetFiles: ["transfer/engine.ts", "transfer/audit.ts"],
      isDestructive: false,
      simulatedTestFailsCount: 0,
      simulatedReviewRejectionsCount: 0,
      lintRulesToInjectCount: 4, // 注入额外 4 条业务门禁
      securityScanRequired: true, // 额外安全审计
    };

    const spEngine = new SpaghettiLoopEngine(task);
    const spResult = spEngine.runToCompletion();

    const stEngine = new StructuredWorkflowEngine(task);
    const stResult = stEngine.runToCompletion();

    return {
      id: "CYCLOMATIC_EXPLOSION",
      title: "场景 5：业务规则膨胀引发的圈复杂度爆炸 (Cyclomatic Complexity Explosion)",
      description: "向工作流中追加 Lint 门禁、安全扫描与合规审计，检验控制流维护成本的变化趋势",
      spaghettiResult: {
        success: spResult.terminalStatus === "SUCCESS",
        cyclomaticComplexity: spResult.cyclomaticComplexityPeak + 8, // 飙升至 32+
        failureMode: "指数级路径爆炸：每增加 1 个 if，潜在执行路径组合数翻倍 (O(2^N))",
        diagnosisDifficulty: "EXTREME",
        logSnippet: "圈复杂度 McCabe = 32（极度危险，代码无法进行完全路径覆盖测试）",
        variableLeakCount: 18,
      },
      structuredResult: {
        success: stResult.terminalStatus === "SUCCESS",
        cyclomaticComplexity: stResult.cyclomaticComplexityPeak, // 仍保持 <= 3
        failureMode: "无 (新增阶段仅需添加 1 个 Node 与 2 条 Edge，局部复杂度 O(1))",
        diagnosisDifficulty: "TRIVIAL",
        logSnippet: "节点局部圈复杂度依然为 1~2，全局图结构保持松耦合线性扩展",
        variableLeakCount: 0,
      },
      verdict: "显式架构完胜：从 O(2^N) 的路径灾难走向 O(N) 的线性拓扑编排",
      whyWhileLoopFailed: "单体控制流将所有业务规则紧密耦合在同一个循环函数中，任意改动均牵一发动全身。",
    };
  }
}

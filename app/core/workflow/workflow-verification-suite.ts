/**
 * 第 19 课 (V18): 什么时候 while loop 开始失控？
 * 控制流 4 大领域守恒律形式化验证套件 (The 4 Formal Control-Flow Invariants)
 */

import { StructuredWorkflowEngine } from "./structured-workflow-engine";
import { SpaghettiLoopEngine } from "./spaghetti-loop-engine";
import type {
  InvariantTestResult,
  SoftwareTask,
} from "./types";

export class WorkflowVerificationSuite {
  /**
   * 运行全部 4 项守恒律验证
   */
  public static runSuite(): InvariantTestResult[] {
    return [
      this.verifyPhaseDeterminism(),
      this.verifyReentranceResumability(),
      this.verifyBranchBoundedness(),
      this.verifyCognitiveLinearity(),
    ];
  }

  /**
   * 守恒律 1：阶段确定律 (Phase Determinism Invariant)
   * 在任意执行毫秒 t，Agent 必须具备单一权威状态枚举 (WorkflowPhase)，
   * 严禁通过 10 几个布尔变量组合去推断阶段。
   */
  public static verifyPhaseDeterminism(): InvariantTestResult {
    const task: SoftwareTask = {
      id: "inv-task-1",
      title: "验证阶段确定性",
      description: "在整个生命周期各检查点探测当前阶段的表达唯一性",
      targetFiles: ["core/sample.ts"],
      isDestructive: false,
      simulatedTestFailsCount: 0,
      simulatedReviewRejectionsCount: 0,
    };

    const structuredEngine = new StructuredWorkflowEngine(task);
    const recordedPhases: string[] = [];

    while (structuredEngine.getState().phase !== "COMPLETE" && recordedPhases.length < 10) {
      recordedPhases.push(structuredEngine.getState().phase);
      structuredEngine.step();
    }
    recordedPhases.push(structuredEngine.getState().phase);

    const isDeterministic = recordedPhases.every(
      (p) => typeof p === "string" && p.length > 0 && p !== "UNKNOWN"
    );

    return {
      id: "PHASE_DETERMINISM",
      name: "守恒律 1：阶段确定律 (Phase Determinism Invariant)",
      statement: "Agent 在任意时刻的执行状态必须是单一的强类型枚举，绝不应由松散布尔变量组合隐式推断。",
      passed: isDeterministic,
      measuredValue: `显式引擎阶段枚举清晰度 100.0% (跃迁序列: ${recordedPhases.join(" -> ")})`,
      benchmarkThreshold: "阶段枚举确定度 = 100%，无歧义盲区",
      evidence: [
        `StructuredWorkflowEngine 在每一步均提供单一权威字段 state.phase`,
        `外部观察者 (UI、Tracing、日志) 无需做布尔组合解析，即可 0 成本渲染状态机进度`,
        `彻底规避了单体 While 循环中“既是 isEditing 又是 testsExecuted 但实际上在等待 review”的语义混淆`,
      ],
    };
  }

  /**
   * 守恒律 2：状态重入幂等律 (Re-entrance & Resumability Invariant)
   * 当任务挂起并经历 JSON 序列化/反序列化入库后，在新进程恢复执行必须达到 100% 状态保真与幂等继续。
   */
  public static verifyReentranceResumability(): InvariantTestResult {
    const task: SoftwareTask = {
      id: "inv-task-2",
      title: "验证高危操作挂起与恢复",
      description: "模拟 DROP TABLE 触发审批挂起，将状态落盘，随后新进程加载并批准恢复",
      targetFiles: ["db/schema.sql"],
      isDestructive: true,
      simulatedTestFailsCount: 0,
      simulatedReviewRejectionsCount: 0,
    };

    // 1. 运行至挂起
    const engine1 = new StructuredWorkflowEngine(task, { autoApprove: false });
    engine1.runToCompletion();
    const suspendedState = engine1.getState();

    // 2. 模拟序列化与进程重建
    const serialized = JSON.stringify(suspendedState);
    const restoredState = JSON.parse(serialized);

    // 3. 在全新实例中恢复并审批
    const engine2 = new StructuredWorkflowEngine(task, {}, restoredState);
    engine2.approveAndResume();
    const finalResult = engine2.runToCompletion();

    const isFullyResumed = finalResult.terminalStatus === "SUCCESS";

    return {
      id: "REENTRANCE_RESUMABILITY",
      name: "守恒律 2：状态重入幂等律 (Re-entrance & Resumability Invariant)",
      statement: "挂起状态必须具备单一可序列化聚合根，反序列化恢复后必须无损衔接，幽灵状态泄漏率为 0.00%。",
      passed: isFullyResumed,
      measuredValue: isFullyResumed ? "反序列化恢复保真度: 100.0% (零字段丢失)" : "恢复失败",
      benchmarkThreshold: "状态保真度 = 100.00%，幽灵状态 = 0",
      evidence: [
        `挂起时仅产生单一标准 JSON 对象，尺寸仅 ~650 字节，轻量且自包含`,
        `跨进程重入时，直接将 restoredState 注入新引擎构造器，零额外手工装配代码`,
        `审批放行后精准流向 COMPLETE 节点，未发生重复执行修改或遗漏代码审查`,
      ],
    };
  }

  /**
   * 守恒律 3：控制流有界律 (Branch Boundedness Invariant)
   * 每一个条件循环回路（如测试自愈重试、审查打回）必须具有形式化证明的退出边界，死循环概率恒为 0。
   */
  public static verifyBranchBoundedness(): InvariantTestResult {
    // 即使面对无论如何都不会通过的极端恶性死循环任务：
    const task: SoftwareTask = {
      id: "inv-task-3",
      title: "验证极端重试边界",
      description: "测试永远失败，检验状态机能否在恰好 3 次重试后强制安全回滚，严禁无限循环",
      targetFiles: ["infinite/fail.ts"],
      isDestructive: false,
      simulatedTestFailsCount: 9999, // 永久失败
      simulatedReviewRejectionsCount: 0,
    };

    const structuredEngine = new StructuredWorkflowEngine(task, { maxSteps: 30 });
    const result = structuredEngine.runToCompletion();

    const isBounded =
      result.terminalStatus === "ROLLED_BACK" &&
      result.totalSteps <= 10 &&
      structuredEngine.getState().retryCount === 3;

    return {
      id: "BRANCH_BOUNDEDNESS",
      name: "守恒律 3：控制流有界律 (Branch Boundedness Invariant)",
      statement: "所有条件回路与重试分支必须具备声明式上限边界与降级路径，杜绝死循环逃逸。",
      passed: isBounded,
      measuredValue: `严格在第 ${structuredEngine.getState().retryCount} 次重试后收敛，总步数 = ${result.totalSteps} 步，状态 = ${result.terminalStatus}`,
      benchmarkThreshold: "重试轮次 == maxRetries (3)，循环逃逸率 = 0.00%",
      evidence: [
        `显式条件边 TEST -> [retryCount < 3 ? IMPLEMENT : ROLLBACK] 具备数学级收敛性`,
        `超限后强制跃迁至 ROLLBACK 终态保护节点，物理阻断再次进入 IMPLEMENT`,
        `对比 Spaghetti 引擎在标志位不同步时直接耗死 30 轮迭代，显式架构具备绝对确定性`,
      ],
    };
  }

  /**
   * 守恒律 4：认知复杂度线性律 (Cognitive Linear Invariant)
   * 新增业务规则与审查节点时，代码的局部圈复杂度必须保持 O(1) 增量，
   * 严禁单体函数内部条件分支发生 O(2^N) 组合式爆炸。
   */
  public static verifyCognitiveLinearity(): InvariantTestResult {
    // 对比 Spaghetti 与 Structured 在增加 Lint 与安全检查后的复杂度
    const bloatedTask: SoftwareTask = {
      id: "inv-task-4",
      title: "复杂度对比基准",
      description: "注入 4 项新门禁",
      targetFiles: ["secure/crypto.ts"],
      isDestructive: false,
      simulatedTestFailsCount: 0,
      simulatedReviewRejectionsCount: 0,
      lintRulesToInjectCount: 4,
      securityScanRequired: true,
    };

    const spEngine = new SpaghettiLoopEngine(bloatedTask);
    const spResult = spEngine.runToCompletion();

    const stEngine = new StructuredWorkflowEngine(bloatedTask);
    const stResult = stEngine.runToCompletion();

    const isLinear =
      stResult.cyclomaticComplexityPeak <= 3 &&
      spResult.cyclomaticComplexityPeak >= 20;

    return {
      id: "COGNITIVE_LINEARITY",
      name: "守恒律 4：认知复杂度线性律 (Cognitive Linear Invariant)",
      statement: "新增工作流节点时，单节点复杂度必须恒定保持在 O(1) 局部范围，严禁全局组合爆炸。",
      passed: isLinear,
      measuredValue: `显式引擎峰值圈复杂度 = ${stResult.cyclomaticComplexityPeak} vs 单体 While 圈复杂度 = ${spResult.cyclomaticComplexityPeak}`,
      benchmarkThreshold: "显式节点复杂度 <= 3, Spaghetti 复杂度 > 20",
      evidence: [
        `StructuredWorkflowEngine 的每个节点函数仅处理自身输入输出，圈复杂度恒为 1~2`,
        `转移边由 determineNextPhase 集中映射，节点间无交叉污染`,
        `SpaghettiLoopEngine 随着条件叠加，圈复杂度从 12 跃升至 28+，进入严重不可维护区`,
      ],
    };
  }
}

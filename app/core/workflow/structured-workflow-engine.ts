/**
 * 第 19 课 (V18): 什么时候 while loop 开始失控？
 * 显式结构化工作流引擎 (The Structured Workflow Engine / Pre-Graph)
 *
 * 将隐式控制流重构为显式数据结构：
 * 1. 单一高保真不可变状态对象 (StructuredWorkflowState)
 * 2. 独立、隔离的阶段节点 (Phase Nodes)
 * 3. 显式条件转移边 (Explicit Transition Edges)
 * 4. 原生支持无损持久化挂起与重入恢复 (Durable Suspension & Resume)
 */

import type {
  SoftwareTask,
  StructuredStepRecord,
  StructuredWorkflowState,
  WorkflowExecutionResult,
  WorkflowPhase,
} from "./types";

export interface StructuredEngineOptions {
  maxSteps?: number;
  autoApprove?: boolean;
}

export class StructuredWorkflowEngine {
  private state: StructuredWorkflowState;
  private stepCount: number = 0;
  private history: StructuredStepRecord[] = [];
  private options: Required<StructuredEngineOptions>;

  constructor(
    task: SoftwareTask,
    options: StructuredEngineOptions = {},
    initialState?: StructuredWorkflowState
  ) {
    this.options = {
      maxSteps: options.maxSteps ?? 30,
      autoApprove: options.autoApprove ?? false,
    };

    if (initialState) {
      this.state = JSON.parse(JSON.stringify(initialState));
    } else {
      this.state = {
        phase: "ANALYZE",
        task,
        analysisNotes: [],
        plan: [],
        changedFiles: [],
        testResults: null,
        reviewResult: null,
        approvalStatus: task.isDestructive
          ? this.options.autoApprove
            ? "APPROVED"
            : "PENDING"
          : "NOT_REQUIRED",
        retryCount: 0,
        maxRetries: 3,
        isRolledBack: false,
        history: [],
      };
    }
  }

  public getState(): StructuredWorkflowState {
    return JSON.parse(JSON.stringify(this.state));
  }

  public getHistory(): StructuredStepRecord[] {
    return [...this.history];
  }

  /**
   * 人机审批放行并恢复执行
   */
  public approveAndResume(): void {
    if (this.state.phase === "APPROVAL_GATE" || this.state.approvalStatus === "PENDING") {
      this.state.approvalStatus = "APPROVED";
      // 记录历史
      this.state.history.push({
        phase: "APPROVAL_GATE",
        transition: "APPROVAL_GATE -> [Human Approved] -> COMPLETE",
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 显式条件转移函数 (Transition Router)
   * 对应未来 LangGraph 中的 ConditionalEdge
   */
  private determineNextPhase(currentPhase: WorkflowPhase): {
    nextPhase: WorkflowPhase;
    ruleName: string;
  } {
    switch (currentPhase) {
      case "ANALYZE":
        return {
          nextPhase: "PLAN",
          ruleName: "ANALYZE -> [分析文档已就绪] -> PLAN",
        };

      case "PLAN":
        return {
          nextPhase: "IMPLEMENT",
          ruleName: "PLAN -> [规划清单已确认] -> IMPLEMENT",
        };

      case "IMPLEMENT":
        return {
          nextPhase: "TEST",
          ruleName: "IMPLEMENT -> [变更应用完成] -> TEST",
        };

      case "TEST":
        if (this.state.testResults?.passed) {
          return {
            nextPhase: "REVIEW",
            ruleName: "TEST -> [测试全部绿灯] -> REVIEW",
          };
        }
        if (this.state.retryCount < this.state.maxRetries) {
          return {
            nextPhase: "IMPLEMENT",
            ruleName: `TEST -> [测试未通过但未超限 (重试 ${this.state.retryCount}/${this.state.maxRetries})] -> IMPLEMENT`,
          };
        }
        return {
          nextPhase: "ROLLBACK",
          ruleName: "TEST -> [重试超限 3 次] -> ROLLBACK",
        };

      case "REVIEW":
        if (!this.state.reviewResult?.approved) {
          return {
            nextPhase: "IMPLEMENT",
            ruleName: "REVIEW -> [审查打回，返工补正] -> IMPLEMENT",
          };
        }
        if (
          this.state.task.isDestructive &&
          this.state.approvalStatus !== "APPROVED"
        ) {
          return {
            nextPhase: "APPROVAL_GATE",
            ruleName: "REVIEW -> [检测到高危迁移，进入审批门禁] -> APPROVAL_GATE",
          };
        }
        return {
          nextPhase: "COMPLETE",
          ruleName: "REVIEW -> [审查通过且安全合规] -> COMPLETE",
        };

      case "APPROVAL_GATE":
        if (this.state.approvalStatus === "APPROVED") {
          return {
            nextPhase: "COMPLETE",
            ruleName: "APPROVAL_GATE -> [人类审批通过放行] -> COMPLETE",
          };
        }
        return {
          nextPhase: "APPROVAL_GATE",
          ruleName: "APPROVAL_GATE -> [等待外部审批输入] -> 挂起",
        };

      case "ROLLBACK":
        return {
          nextPhase: "FAILED",
          ruleName: "ROLLBACK -> [回滚完成] -> FAILED",
        };

      case "COMPLETE":
      case "FAILED":
      default:
        return {
          nextPhase: currentPhase,
          ruleName: `${currentPhase} -> [终态维持] -> ${currentPhase}`,
        };
    }
  }

  /**
   * 执行单个阶段节点 (Execute Single Node)
   */
  public step(): { finished: boolean; stepRecord: StructuredStepRecord } {
    this.stepCount++;
    const fromPhase = this.state.phase;
    let actionTaken = "";
    let logMessage = "";

    // 1. 如果已处于终态
    if (fromPhase === "COMPLETE" || fromPhase === "FAILED") {
      const record: StructuredStepRecord = {
        stepNumber: this.stepCount,
        fromPhase,
        toPhase: fromPhase,
        transitionRule: "终态停机 (Terminal Quiescence)",
        stateSnapshot: this.getState(),
        actionTaken: "工作流已终结",
        logMessage: `工作流处于 ${fromPhase} 状态，无需进一步执行。`,
        timestamp: Date.now(),
      };
      this.history.push(record);
      return { finished: true, stepRecord: record };
    }

    // 2. 如果停留在审批门禁且尚未批准，则原子挂起 (Durable Suspension)
    if (fromPhase === "APPROVAL_GATE" && this.state.approvalStatus !== "APPROVED") {
      const record: StructuredStepRecord = {
        stepNumber: this.stepCount,
        fromPhase,
        toPhase: "APPROVAL_GATE",
        transitionRule: "APPROVAL_GATE -> [等待外部中断恢复] -> 挂起",
        stateSnapshot: this.getState(),
        actionTaken: "工作流原子挂起 (Durable Suspension)",
        logMessage: "⏸️ 检测到高危变更操作，工作流状态已完整持久化保存，等待人类审核确认。",
        timestamp: Date.now(),
      };
      this.history.push(record);
      return { finished: true, stepRecord: record };
    }

    // 3. 执行当前节点内部逻辑
    switch (fromPhase) {
      case "ANALYZE": {
        this.state.analysisNotes = [
          `识别 ${this.state.task.targetFiles.length} 个核心变更目标文件`,
          "解析现有模块接口契约与依赖拓扑图",
          this.state.task.isDestructive ? "⚠️ 发现破坏性 SQL Schema 修改" : "常规业务增强逻辑",
        ];
        actionTaken = "执行静态依赖分析与上下文提取";
        logMessage = `[Step ${this.stepCount}] 【ANALYZE 节点】：完成目标模块剖析。`;
        break;
      }

      case "PLAN": {
        this.state.plan = [
          "1. 隔离修改目标文件，建立本地快照备份",
          "2. 编写针对异常分支的防御性逻辑",
          "3. 运行自动化单元测试与端到端回归套件",
        ];
        actionTaken = "生成结构化演进方案清单";
        logMessage = `[Step ${this.stepCount}] 【PLAN 节点】：确定 3 步实施规范。`;
        break;
      }

      case "IMPLEMENT": {
        this.state.changedFiles = [...this.state.task.targetFiles];
        const isFixRound = this.state.retryCount > 0 || (this.state.reviewResult && !this.state.reviewResult.approved);
        actionTaken = isFixRound ? "应用精准修复差异补丁 (Patch)" : "首次写入功能变更";
        logMessage = `[Step ${this.stepCount}] 【IMPLEMENT 节点】：变更已安全落盘。`;
        break;
      }

      case "TEST": {
        // 判定测试是否通过
        if (this.state.retryCount < this.state.task.simulatedTestFailsCount) {
          this.state.retryCount++;
          this.state.testResults = {
            passed: false,
            errorCount: 2,
            details: `边界断言异常: Expected HTTP 200, Got 500 (失败第 ${this.state.retryCount} 次)`,
          };
          actionTaken = "运行自动化测试套件 -> 捕获失败断言";
          logMessage = `[Step ${this.stepCount}] 【TEST 节点】：测试未通过，准备回流至 IMPLEMENT 重新修复。`;
        } else {
          this.state.testResults = {
            passed: true,
            errorCount: 0,
            details: "12 个自动化测试用例全部通过，覆盖率 98.4%",
          };
          actionTaken = "运行自动化测试套件 -> 100% 绿灯";
          logMessage = `[Step ${this.stepCount}] 【TEST 节点】：自动化套件全部通过！`;
        }
        break;
      }

      case "REVIEW": {
        const hasRejections = this.state.history.filter((h) => h.phase === "REVIEW").length < this.state.task.simulatedReviewRejectionsCount;
        if (hasRejections) {
          this.state.reviewResult = {
            approved: false,
            comments: ["代码缺少 TypeScript 强类型标注", "建议将内联配置提取至环境变量"],
          };
          actionTaken = "代码审查门禁 -> 发现规范缺陷，打回重构";
          logMessage = `[Step ${this.stepCount}] 【REVIEW 节点】：审查驳回，指示返工修复。`;
        } else {
          this.state.reviewResult = {
            approved: true,
            comments: ["架构符合微内核扩展标准", "无多余副作用与死循环隐患"],
          };
          actionTaken = "代码审查门禁 -> 审查合格";
          logMessage = `[Step ${this.stepCount}] 【REVIEW 节点】：代码审查通过！`;
        }
        break;
      }

      case "ROLLBACK": {
        this.state.isRolledBack = true;
        actionTaken = "执行原子工作区撤销与回滚";
        logMessage = `[Step ${this.stepCount}] 【ROLLBACK 节点】：已安全回退所有受污染文件。`;
        break;
      }
    }

    // 4. 执行显式状态转移
    const { nextPhase, ruleName } = this.determineNextPhase(fromPhase);
    this.state.phase = nextPhase;
    this.state.history.push({
      phase: fromPhase,
      transition: ruleName,
      timestamp: Date.now(),
    });

    const isFinished =
      nextPhase === "COMPLETE" ||
      nextPhase === "FAILED" ||
      (nextPhase === "APPROVAL_GATE" && this.state.approvalStatus !== "APPROVED");

    const record: StructuredStepRecord = {
      stepNumber: this.stepCount,
      fromPhase,
      toPhase: nextPhase,
      transitionRule: ruleName,
      stateSnapshot: this.getState(),
      actionTaken,
      logMessage,
      timestamp: Date.now(),
    };

    this.history.push(record);
    return { finished: isFinished, stepRecord: record };
  }

  /**
   * 连续推进直到完成或遇到断点挂起
   */
  public runToCompletion(): WorkflowExecutionResult {
    const startTime = Date.now();
    let finished = false;

    while (!finished && this.stepCount < this.options.maxSteps) {
      const res = this.step();
      finished = res.finished;
    }

    let terminalStatus: WorkflowExecutionResult["terminalStatus"] = "FAILED";
    if (this.state.phase === "COMPLETE") {
      terminalStatus = "SUCCESS";
    } else if (this.state.isRolledBack || this.state.phase === "ROLLBACK") {
      terminalStatus = "ROLLED_BACK";
    } else if (this.state.phase === "APPROVAL_GATE" && this.state.approvalStatus !== "APPROVED") {
      terminalStatus = "PENDING_APPROVAL";
    }

    const insights: string[] = [
      `显式状态引擎在 ${this.stepCount} 步内确定性推进，阶段跃迁路径 100% 透明可追踪。`,
      "单节点圈复杂度恒定为 1~2，转移决策通过纯函数集中管理，杜绝隐式状态副作用。",
      "当挂起等待人机审批时，仅需持久化单一 State 记录，恢复时反序列化即用，零幽灵状态风险。",
    ];

    return {
      mode: "STRUCTURED",
      task: this.state.task,
      totalSteps: this.stepCount,
      terminalStatus,
      cyclomaticComplexityPeak: 3, // 单节点与转移函数的最高圈复杂度恒定 <= 3
      mutableVariablesCount: 1, // 状态收敛为单一强类型聚合根
      structuredHistory: this.history,
      suspendedState: terminalStatus === "PENDING_APPROVAL" ? this.getState() : null,
      durationMs: Date.now() - startTime,
      insights,
    };
  }
}

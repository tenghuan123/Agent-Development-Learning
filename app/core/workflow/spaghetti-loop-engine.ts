/**
 * 第 19 课 (V18): 什么时候 while loop 开始失控？
 * 单体 Spaghetti While 循环执行引擎 (The Monolithic Imperative Loop Engine)
 *
 * 忠实复现初学者及多数 Agent 团队在面对多步工作流时，本能写出的
 * while(running) { if(...) else if(...) } 大泥球状态机。
 */

import type {
  SoftwareTask,
  SpaghettiFlags,
  SpaghettiStepRecord,
  WorkflowExecutionResult,
} from "./types";

export interface SpaghettiEngineOptions {
  maxLoopLimit?: number;
  simulateDesyncBug?: boolean; // 模拟程序员遗漏重置标志位的常见 Bug (例如重试时忘记重置 testsExecuted=false)
  autoApproveDestructive?: boolean;
}

export class SpaghettiLoopEngine {
  private flags: SpaghettiFlags;
  private task: SoftwareTask;
  private stepCount: number = 0;
  private loopIteration: number = 0;
  private history: SpaghettiStepRecord[] = [];
  private options: Required<SpaghettiEngineOptions>;
  private cyclomaticComplexityBase: number = 1;

  constructor(task: SoftwareTask, options: SpaghettiEngineOptions = {}) {
    this.task = task;
    this.options = {
      maxLoopLimit: options.maxLoopLimit ?? 30,
      simulateDesyncBug: options.simulateDesyncBug ?? false,
      autoApproveDestructive: options.autoApproveDestructive ?? false,
    };

    this.flags = {
      hasAnalyzed: false,
      analysisReport: null,
      hasPlanned: false,
      planStepCount: 0,
      isEditing: false,
      editPassCount: 0,
      testsExecuted: false,
      testsPassed: false,
      testFailCount: 0,
      retryAttempts: 0,
      maxRetryExceeded: false,
      reviewDone: false,
      reviewApproved: false,
      reviewFeedback: null,
      needsHumanApproval: task.isDestructive,
      humanApproved: this.options.autoApproveDestructive,
      rollbackDone: false,
      terminalStatus: "NONE",
    };

    // 计算初始静态圈复杂度 (McCabe Metric)
    // 基础路径 1 + 每个 if / else if / 逻辑与或条件
    this.cyclomaticComplexityBase = 12 + (task.lintRulesToInjectCount ?? 0) * 2 + (task.securityScanRequired ? 4 : 0);
  }

  public getFlags(): SpaghettiFlags {
    return { ...this.flags };
  }

  public getHistory(): SpaghettiStepRecord[] {
    return [...this.history];
  }

  public approveDestructiveAction(): void {
    this.flags.humanApproved = true;
    if (this.flags.terminalStatus === "PENDING_APPROVAL") {
      this.flags.terminalStatus = "NONE";
    }
  }

  /**
   * 执行单步迭代 (Step-by-step Execution)
   * 真实模拟 while 循环体内部层层嵌套的 if-else 判定
   */
  public step(): { finished: boolean; stepRecord: SpaghettiStepRecord } {
    this.loopIteration++;
    this.stepCount++;

    let activeBranch: string;
    let actionTaken: string;
    let logMessage: string;

    // 熔断保护：防止循环失控彻底耗死 CPU
    if (this.loopIteration > this.options.maxLoopLimit) {
      this.flags.terminalStatus = "DEADLOCK";
      activeBranch = "if (loopIteration > maxLoopLimit)";
      actionTaken = "触发循环安全熔断 (Infinite Loop Deadlock Detected)";
      logMessage = `由于标志位未正确同步或分支死循环，循环迭代达到上限 ${this.options.maxLoopLimit} 次，判定为失控死锁！`;

      const record: SpaghettiStepRecord = {
        stepNumber: this.stepCount,
        loopIteration: this.loopIteration,
        activeIfBranch: activeBranch,
        cyclomaticComplexity: this.cyclomaticComplexityBase + 4,
        flagsSnapshot: { ...this.flags },
        actionTaken,
        logMessage,
        timestamp: Date.now(),
      };
      this.history.push(record);
      return { finished: true, stepRecord: record };
    }

    // -------------------------------------------------------------
    // 经典单体 While-Loop 大泥球分支矩阵 (Spaghetti Branch Matrix)
    // -------------------------------------------------------------
    if (!this.flags.hasAnalyzed) {
      // 分支 1：需求分析
      activeBranch = "if (!hasAnalyzed)";
      actionTaken = "执行代码上下文与任务需求分析";
      this.flags.hasAnalyzed = true;
      this.flags.analysisReport = `分析目标文件: ${this.task.targetFiles.join(", ")}，识别核心逻辑边界。`;
      logMessage = `[Step ${this.stepCount}] 分析完成: ${this.flags.analysisReport}`;
    } else if (this.flags.hasAnalyzed && !this.flags.hasPlanned) {
      // 分支 2：制定步骤方案
      activeBranch = "else if (hasAnalyzed && !hasPlanned)";
      actionTaken = "生成多阶段执行规划";
      this.flags.hasPlanned = true;
      this.flags.planStepCount = 3;
      logMessage = `[Step ${this.stepCount}] 规划完成: 生成了 ${this.flags.planStepCount} 个执行子步骤。`;
    } else if (
      this.flags.hasPlanned &&
      (!this.flags.isEditing || this.flags.editPassCount === 0 || this.flags.reviewFeedback !== null)
    ) {
      // 分支 3：实施修改 (可能是首轮修改，也可能是 review 驳回后的二次修改)
      activeBranch = "else if (hasPlanned && (!isEditing || reviewFeedback !== null))";
      this.flags.isEditing = true;
      this.flags.editPassCount++;
      const isFix = this.flags.reviewFeedback !== null || this.flags.testFailCount > 0;
      actionTaken = isFix ? "根据审查意见/测试报错应用修复补丁" : "初次应用代码变更";
      this.flags.reviewFeedback = null;
      this.flags.reviewDone = false; // 容易产生隐式副作用

      // 关键 Bug 陷阱模拟：在命令式分支中，程序员在重试修改时极易忘记将 testsExecuted 拨回 false！
      if (!this.options.simulateDesyncBug) {
        this.flags.testsExecuted = false; // 正确做法：重置测试执行标记
      } else if (this.flags.testFailCount > 0) {
        // 模拟 Bug：第二次编辑时忘记重置 testsExecuted = false
        // 这会导致下一次直接命中测试失败判定，陷入不可逃逸的死锁！
      }

      logMessage = `[Step ${this.stepCount}] ${actionTaken}，当前代码编辑轮次: ${this.flags.editPassCount}`;
    } else if (this.flags.isEditing && !this.flags.testsExecuted) {
      // 分支 4：运行测试套件
      activeBranch = "else if (isEditing && !testsExecuted)";
      actionTaken = "执行测试套件 (npm test)";
      this.flags.testsExecuted = true;

      // 判定模拟的测试失败逻辑
      if (this.flags.testFailCount < this.task.simulatedTestFailsCount) {
        this.flags.testFailCount++;
        this.flags.testsPassed = false;
        logMessage = `[Step ${this.stepCount}] 测试未通过 (Failure #${this.flags.testFailCount}): 断言失败，存在未处理边界。`;
      } else {
        this.flags.testsPassed = true;
        logMessage = `[Step ${this.stepCount}] 测试全部通过 (Pass): 单元测试与端到端校验 100% 绿灯。`;
      }
    } else if (this.flags.testsExecuted && !this.flags.testsPassed) {
      // 分支 5：测试失败重试或超限回滚
      activeBranch = "else if (testsExecuted && !testsPassed)";
      if (this.flags.retryAttempts < 3) {
        this.flags.retryAttempts++;
        actionTaken = `测试失败，准备第 ${this.flags.retryAttempts} 次自愈重试`;
        logMessage = `[Step ${this.stepCount}] 触发重试逻辑: 尝试重新规划并修复缺陷 (重试 ${this.flags.retryAttempts}/3)...`;
        // 在 Spaghetti 逻辑中，试图强行将状态往回倒：
        this.flags.isEditing = false; // 准备重新进入编辑分支
        if (!this.options.simulateDesyncBug) {
          this.flags.testsExecuted = false;
        }
      } else {
        // 超过重试上限
        activeBranch = "else if (testsExecuted && !testsPassed && retryAttempts >= 3)";
        this.flags.maxRetryExceeded = true;
        this.flags.rollbackDone = true;
        this.flags.terminalStatus = "ROLLED_BACK";
        actionTaken = "重试次数耗尽，执行安全回滚 (Rollback)";
        logMessage = `[Step ${this.stepCount}] 重试 3 次均未通过，触发工作区撤销与事务回滚！`;
      }
    } else if (this.flags.testsPassed && !this.flags.reviewDone) {
      // 分支 6：代码审查 (Review)
      activeBranch = "else if (testsPassed && !reviewDone)";
      actionTaken = "执行自动化代码审查 (Code Review Gate)";
      this.flags.reviewDone = true;

      if (this.flags.editPassCount <= this.task.simulatedReviewRejectionsCount) {
        this.flags.reviewApproved = false;
        this.flags.reviewFeedback = "审查驳回: 函数圈复杂度超标，缺少异常边界防护。";
        logMessage = `[Step ${this.stepCount}] 审查打回: ${this.flags.reviewFeedback}`;
      } else {
        this.flags.reviewApproved = true;
        logMessage = `[Step ${this.stepCount}] 代码审查通过: 代码规范与风格符合主干标准。`;
      }
    } else if (this.flags.reviewApproved && this.flags.needsHumanApproval && !this.flags.humanApproved) {
      // 分支 7：高危人机审批阻断 (HITL Suspension Gate)
      activeBranch = "else if (reviewApproved && needsHumanApproval && !humanApproved)";
      actionTaken = "检测到破坏性改动，挂起执行并等待人类审批";
      this.flags.terminalStatus = "PENDING_APPROVAL";
      logMessage = `[Step ${this.stepCount}] ⏸️ 挂起等待人类审批: 任务标记为破坏性迁移 (isDestructive=true)，必须人工放行！`;
    } else if (
      this.flags.reviewApproved &&
      (!this.flags.needsHumanApproval || this.flags.humanApproved) &&
      this.flags.terminalStatus !== "SUCCESS"
    ) {
      // 分支 8：全部阶段完成
      activeBranch = "else if (reviewApproved && (approved || !needsApproval))";
      this.flags.terminalStatus = "SUCCESS";
      actionTaken = "任务顺利交付，生成提交日志";
      logMessage = `[Step ${this.stepCount}] 🎉 任务成功闭环交付！所有阶段均满足退出准则。`;
    } else {
      // 兜底分支：既没有终结，也没有任何 if 命中 —— 典型的状态落空死锁！
      activeBranch = "else /* 未匹配任何业务分支的死锁空转 */";
      actionTaken = "标志位状态组合处于未定义盲区 (State Desync Deadlock)";
      logMessage = `[Step ${this.stepCount}] ⚠️ 致命异常：没有任何 if 分支能够捕获当前 14 个标志位的组合！`;
      if (this.loopIteration > 5 && this.flags.terminalStatus === "NONE") {
        this.flags.terminalStatus = "DEADLOCK";
      }
    }

    const isFinished =
      this.flags.terminalStatus === "SUCCESS" ||
      this.flags.terminalStatus === "ROLLED_BACK" ||
      this.flags.terminalStatus === "DEADLOCK" ||
      this.flags.terminalStatus === "PENDING_APPROVAL";

    const record: SpaghettiStepRecord = {
      stepNumber: this.stepCount,
      loopIteration: this.loopIteration,
      activeIfBranch: activeBranch,
      cyclomaticComplexity: this.cyclomaticComplexityBase + Math.min(this.loopIteration * 2, 16),
      flagsSnapshot: { ...this.flags },
      actionTaken,
      logMessage,
      timestamp: Date.now(),
    };

    this.history.push(record);
    return { finished: isFinished, stepRecord: record };
  }

  /**
   * 连续运行直到遇到终态或审批挂起
   */
  public runToCompletion(): WorkflowExecutionResult {
    const startTime = Date.now();
    let finished = false;

    while (!finished) {
      const stepRes = this.step();
      finished = stepRes.finished;
    }

    const insights: string[] = [
      `单体 While 循环执行了 ${this.loopIteration} 轮迭代，跨越了 ${this.stepCount} 个分支跳跃。`,
      `圈复杂度峰值达到 ${this.cyclomaticComplexityBase + 16}（高危红线区，标准单元测试难以穷举所有路径组合）。`,
      `管理了 14 个松散布尔/计数状态位，状态空间大小达到 2^14 = 16,384 种理论组合。`,
    ];

    if (this.flags.terminalStatus === "DEADLOCK") {
      insights.push("发生状态脱节死锁：深层嵌套 if 中遗漏了状态位重置，导致循环在盲区中反复空转。");
    } else if (this.flags.terminalStatus === "PENDING_APPROVAL") {
      insights.push("遇到人机审批挂起：在单体 while 结构中，当前执行栈被强行切断，恢复时需手动恢复 14 个变量。");
    }

    return {
      mode: "SPAGHETTI",
      task: this.task,
      totalSteps: this.stepCount,
      loopIterations: this.loopIteration,
      terminalStatus:
        this.flags.terminalStatus === "NONE" ? "FAILED" : this.flags.terminalStatus,
      cyclomaticComplexityPeak: this.cyclomaticComplexityBase + 16,
      mutableVariablesCount: 14,
      spaghettiHistory: this.history,
      durationMs: Date.now() - startTime,
      insights,
    };
  }
}

import type { ChaosRunOutput, ChaosScenarioType } from "./types";

export class ChaosRunner {
  /**
   * Run a side-by-side chaos experiment comparing a Naive Loop with the Decoupled Runtime.
   */
  static async runScenario(scenario: ChaosScenarioType): Promise<ChaosRunOutput> {
    switch (scenario) {
      case "mid_flight_input":
        return this.runMidFlightInputScenario();
      case "hard_abort":
        return this.runHardAbortScenario();
      case "zombie_tool":
        return this.runZombieToolScenario();
      case "event_race":
        return this.runEventRaceScenario();
      default:
        return this.runMidFlightInputScenario();
    }
  }

  private static runMidFlightInputScenario(): ChaosRunOutput {
    return {
      scenario: "mid_flight_input",
      title: "场景一：中途突发用户插话 (Mid-Flight User Interruption)",
      description: "当 Agent 正在执行多步代码重构任务（第2步）时，用户突然敲入新指令要求纠偏：'别改 auth.ts，改 session.ts'。",
      naiveLoop: {
        crashed: true,
        errorSummary: "Uncaught Message Ordering Conflict / Dropped Input",
        orphanProcesses: 0,
        statePreserved: false,
        inputLost: true,
        telemetryLogs: [
          { time: 0, log: "[NaiveLoop] while(step <= maxSteps) 循环启动，执行重构任务...", level: "info" },
          { time: 420, log: "[Step 1] LLM 推理生成：调用 read_file('src/auth.ts')", level: "info" },
          { time: 610, log: "[Step 1 Observation] 成功读取 140 行代码", level: "info" },
          { time: 820, log: "[Step 2] LLM 正在规划 edit_file('src/auth.ts')...", level: "info" },
          { time: 950, log: "[💥 用户突发输入] '停下！不要动 auth.ts，重构 session.ts！'", level: "warn" },
          { time: 955, log: "[NaiveLoop 警报] 裸循环处于 await llm.chatCompletion() 阻塞中，没有消息调度队列！", level: "error" },
          { time: 960, log: "[NaiveLoop 异常] 外部直接调用 messages.push({ role: 'user' })，破坏了 LLM 协议中 Assistant ToolCall 必须紧跟 Tool Observation 的强契约！", level: "error" },
          { time: 1200, log: "[FATAL 崩溃] API Provider Error 400: An assistant message with 'tool_calls' must be followed by tool messages, not user messages.", level: "error" },
          { time: 1210, log: "[Result] 任务直接崩溃退出，用户输入丢失，代码上下文损坏。", level: "error" },
        ],
      },
      decoupledRuntime: {
        handledGracefully: true,
        signalCascadeTimeMs: 12,
        orphanProcesses: 0,
        statePreserved: true,
        inputBuffered: true,
        telemetryLogs: [
          { time: 0, log: "[Runtime] AgentRuntime 启动 Session run_88192 (branch: main)", level: "info" },
          { time: 380, log: "[EventStream] step:start (step: 1) -> llm:thought -> tool:start ('read_file')", level: "info" },
          { time: 600, log: "[SessionManager] Checkpoint snap_s1 保存，工作空间状态哈希完整", level: "info" },
          { time: 810, log: "[Runtime] 进入 Step 2 决策流...", level: "info" },
          { time: 950, log: "[📥 用户突发输入] '停下！不要动 auth.ts，重构 session.ts！'", level: "warn" },
          { time: 952, log: "[Runtime InboundQueue] 捕获用户插话，原子化放入等待调度队列 (priority: next_step)", level: "info" },
          { time: 955, log: "[EventStream] 派发 user:interrupt 事件，UI 响应插话状态，当前原子步保持安全隔离", level: "info" },
          { time: 1100, log: "[Runtime Supervisor] Step 2 工具执行结束，安全边界达成。Drain InboundQueue...", level: "success" },
          { time: 1110, log: "[Runtime] 成功将用户指示安全拼接至 Step 3 提示词，纠偏生效：转向分析 session.ts", level: "success" },
          { time: 1300, log: "[Result] 状态完整，无缝纠偏，任务继续在轨道上平稳运行。", level: "success" },
        ],
      },
    };
  }

  private static runHardAbortScenario(): ChaosRunOutput {
    return {
      scenario: "hard_abort",
      title: "场景二：Ctrl+C 强行中断与级联取消 (Hard Abort & Orphan Cleanup)",
      description: "当 Agent 正在执行耗时测试工具（如 run_command('pnpm test')），用户按下 Ctrl+C 紧急取消。",
      naiveLoop: {
        crashed: true,
        errorSummary: "Unhandled Abort / Orphan Zombie Processes Leaked",
        orphanProcesses: 3,
        statePreserved: false,
        inputLost: true,
        telemetryLogs: [
          { time: 0, log: "[NaiveLoop] Step 3: 发起并行运行测试命令 'pnpm test' & 'lint'...", level: "info" },
          { time: 250, log: "[ChildProcess] Node spawn (PID: 94102, 94103, 94104) 占用 3 个终端进程", level: "info" },
          { time: 700, log: "[🛑 用户按下 Ctrl+C / Abort] 要求立即停止！", level: "warn" },
          { time: 710, log: "[NaiveLoop] 裸循环通过 process.exit() 或抛出 Error 取消...", level: "error" },
          { time: 720, log: "[💥 严重泄露] 裸循环没有维护 Process PID 树与 AbortSignal 绑定！", level: "error" },
          { time: 730, log: "[僵尸孤儿] PID 94102, 94103, 94104 逃逸脱离管控，在后台继续死循环消耗 CPU！", level: "error" },
          { time: 740, log: "[文件锁死] .cache/test.lock 句柄未被释放，下一次 build 将报错 EBUSY！", level: "error" },
        ],
      },
      decoupledRuntime: {
        handledGracefully: true,
        signalCascadeTimeMs: 18,
        orphanProcesses: 0,
        statePreserved: true,
        inputBuffered: false,
        telemetryLogs: [
          { time: 0, log: "[Runtime] ToolExecutor 启动受控子进程通道，分配 Local AbortController", level: "info" },
          { time: 230, log: "[ToolExecutor] 注册活动进程跟踪: Map<toolCallId, ActiveOperation>", level: "info" },
          { time: 700, log: "[🛑 用户按下 Ctrl+C / Abort]", level: "warn" },
          { time: 705, log: "[Runtime Supervisor] runtime.abort() 触发，全局 AbortController 广播", level: "info" },
          { time: 712, log: "[SafeToolExecutor] 收到 AbortSignal，级联调用 killAllActive()", level: "warn" },
          { time: 718, log: "[Process Guard] 发送 SIGTERM -> SIGKILL，成功终止 3 个活动工具进程 (耗时 18ms)", level: "success" },
          { time: 725, log: "[EventStream] 派发 runtime:abort 事件，清理文件句柄", level: "info" },
          { time: 730, log: "[SessionManager] 归档当前挂起快照 snap_aborted_88192，无状态损坏", level: "success" },
          { time: 740, log: "[Result] 0 个孤儿进程残留，系统无损就绪。", level: "success" },
        ],
      },
    };
  }

  private static runZombieToolScenario(): ChaosRunOutput {
    return {
      scenario: "zombie_tool",
      title: "场景三：耗时工具假死与流式失联 (Long-Running Tool & Blind Wait)",
      description: "执行大项目搜索或编译任务，工具运行超过 15 秒且没有任何进度输出，系统仿佛彻底卡死。",
      naiveLoop: {
        crashed: false,
        errorSummary: "Silent Deadlock / No Streaming Heartbeat / Unresponsive UI",
        orphanProcesses: 1,
        statePreserved: false,
        inputLost: true,
        telemetryLogs: [
          { time: 0, log: "[NaiveLoop] 调用工具 'search_codebase' (全量扫描 12000 个文件)...", level: "info" },
          { time: 1000, log: "[NaiveLoop] await tool.execute() 阻塞主执行线程...", level: "info" },
          { time: 4000, log: "[UI 假死] 没有任何日志，没有 chunk 流，控制台光标静止", level: "warn" },
          { time: 8000, log: "[用户感知] '是不是死机了？' 用户忍不住刷新页面...", level: "error" },
          { time: 12000, log: "[连接断开] 客户端超时抛出 net::ERR_CONNECTION_TIMED_OUT", level: "error" },
          { time: 15000, log: "[后台孤岛] 工具最终跑完了，但前端早跑路了，结果无处投递被丢弃。", level: "error" },
        ],
      },
      decoupledRuntime: {
        handledGracefully: true,
        signalCascadeTimeMs: 0,
        orphanProcesses: 0,
        statePreserved: true,
        inputBuffered: false,
        telemetryLogs: [
          { time: 0, log: "[Runtime] SafeToolExecutor 挂载 stream chunk 监听通道", level: "info" },
          { time: 300, log: "[ToolExecutor] 启动 stdout/stderr 流式管道与心跳看门狗 (Heartbeat Guard)", level: "info" },
          { time: 1200, log: "[EventStream] tool:chunk ('stdout'): [1/4] Indexing src/components (320 files)", level: "info" },
          { time: 3500, log: "[EventStream] tool:chunk ('stdout'): [2/4] Indexing src/core (180 files)", level: "info" },
          { time: 7200, log: "[EventStream] tool:chunk ('stdout'): [3/4] Parsing AST trees (5000 nodes)", level: "info" },
          { time: 11000, log: "[EventStream] tool:chunk ('stdout'): [4/4] Matches found: 42 files", level: "info" },
          { time: 12200, log: "[Runtime] 工具平稳返回，UI 实时呈现打字机进度瀑布流，零假死感知", level: "success" },
        ],
      },
    };
  }

  private static runEventRaceScenario(): ChaosRunOutput {
    return {
      scenario: "event_race",
      title: "场景四：并发事件竞态与状态冲刷 (Concurrent Event Race Condition)",
      description: "在极短 100ms 内，同时到达：UI 日志订阅、远程 Telemetry 上报、数据库快照落盘和新 Prompt 请求。",
      naiveLoop: {
        crashed: true,
        errorSummary: "State Corruption via Unsynchronized Mutation",
        orphanProcesses: 0,
        statePreserved: false,
        inputLost: true,
        telemetryLogs: [
          { time: 0, log: "[NaiveLoop] 维护唯一的 messages: ChatMessage[] 全局变量", level: "info" },
          { time: 10, log: "[并发请求 A] UI 轮询读取 messages[messages.length - 1]", level: "info" },
          { time: 15, log: "[并发请求 B] Telemetry 尝试 serialize(messages)", level: "info" },
          { time: 18, log: "[并发写入 C] 工具结果正在 messages.push(...)", level: "info" },
          { time: 25, log: "[💥 竞态爆炸] 在 messages 遍历中途发生 push，抛出 'Cannot read property content of undefined'", level: "error" },
          { time: 30, log: "[脏读] Telemetry 抓取到了没有 tool_call_id 的半成品消息对象", level: "error" },
          { time: 50, log: "[UI 闪烁] 前端由于收到不完整数组导致 React Key 重复崩溃白屏！", level: "error" },
        ],
      },
      decoupledRuntime: {
        handledGracefully: true,
        signalCascadeTimeMs: 0,
        orphanProcesses: 0,
        statePreserved: true,
        inputBuffered: true,
        telemetryLogs: [
          { time: 0, log: "[Runtime] EventStream 作为单向广播总线 (Unidirectional Event Bus)", level: "info" },
          { time: 10, log: "[Pub/Sub] UI、Telemetry、Persistence 各自作为独立的事件订阅者", level: "info" },
          { time: 15, log: "[SessionManager] 任何外部读取只能获得 SessionSnapshot (深拷贝冻结快照)", level: "info" },
          { time: 20, log: "[隔离] 内部 AgentCore 状态修改不对外部直接暴露引用，不可变性保证无竞态", level: "success" },
          { time: 35, log: "[EventStream] 批量向 4 个订阅者分发 step:start 与 tool:end 事件", level: "success" },
          { time: 50, log: "[Result] UI 平滑更新，Telemetry 准确无脏读，数据库无损落盘", level: "success" },
        ],
      },
    };
  }
}


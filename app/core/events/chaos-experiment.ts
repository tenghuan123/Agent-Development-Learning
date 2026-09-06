import { TypedEventBus } from "./event-bus";
import { ConsoleTracerObserver } from "./observers/console-tracer";
import { TelemetryObserver } from "./observers/telemetry-observer";
import { EventStoreObserver } from "./observers/event-store";
import { generateId, type AgentEvent } from "./types";

export type ChaosScenarioType =
  | "fault_contagion"
  | "slow_io_drag"
  | "dynamic_hotswap";

export interface ChaosRunResult {
  scenario: ChaosScenarioType;
  title: string;
  description: string;
  callbackHell: {
    success: boolean;
    durationMs: number;
    stepsCompleted: number;
    totalSteps: number;
    error?: string;
    log: string[];
    codeCouplingScore: string;
  };
  eventDriven: {
    success: boolean;
    durationMs: number;
    stepsCompleted: number;
    totalSteps: number;
    error?: string;
    faultIsolated: boolean;
    observerErrors: string[];
    log: string[];
    codeCouplingScore: string;
  };
  keyTakeaway: string;
}

export class ChaosExperimentRunner {
  static async runScenario(scenario: ChaosScenarioType): Promise<ChaosRunResult> {
    switch (scenario) {
      case "fault_contagion":
        return this.runFaultContagionScenario();
      case "slow_io_drag":
        return this.runSlowIoDragScenario();
      case "dynamic_hotswap":
        return this.runDynamicHotswapScenario();
      default:
        throw new Error(`Unknown chaos scenario: ${scenario}`);
    }
  }

  /**
   * 场景 1: 观察者抛错与异常穿透测试 (Fault Contagion)
   */
  private static async runFaultContagionScenario(): Promise<ChaosRunResult> {
    const totalSteps = 4;

    // --- 1. Callback 模式模拟 ---
    const cbLogs: string[] = [];
    let cbSuccess = false;
    let cbSteps = 0;
    let cbError: string | undefined;
    const cbStart = Date.now();

    // 模拟外围传入的脆弱回调 (例如 UI 渲染抛错)
    const callbacks = {
      onStep: (step: number) => {
        cbLogs.push(`[Callback] onStep(${step}) called`);
        if (step === 2) {
          throw new TypeError("React UI Render Error: Cannot read properties of undefined (reading 'renderTree')");
        }
      },
      onTool: (tool: string) => {
        cbLogs.push(`[Callback] onTool(${tool}) called`);
      },
    };

    try {
      cbLogs.push("🚀 [Callback Loop] 启动代码重构任务...");
      for (let s = 1; s <= totalSteps; s++) {
        cbSteps = s;
        // 核心循环直接调用回调函数 (无沙箱保护)
        callbacks.onStep(s);
        callbacks.onTool("read_file");
        await new Promise((r) => setTimeout(r, 20)); // 模拟思考
      }
      cbSuccess = true;
    } catch (err: any) {
      cbError = err.message;
      cbLogs.push(`💥 [Callback Loop 灾难崩溃] 外部回调抛出未捕获异常: ${err.message}`);
      cbLogs.push(`❌ Agent 主循环被外部 UI 错误直接砸死，任务在第 ${cbSteps} 步中断！`);
    }
    const cbDuration = Date.now() - cbStart;

    // --- 2. Event-Driven 模式模拟 ---
    const edLogs: string[] = [];
    let edSuccess = false;
    let edSteps = 0;
    const edStart = Date.now();
    const eventBus = new TypedEventBus();
    const runId = "run-fault-" + generateId();

    // 挂载恶意/脆弱的观察者
    eventBus.registerObserver({
      id: "fragile-ui-observer",
      name: "Fragile React UI",
      enabled: true,
      onEvent: (event) => {
        if (event.type === "step:start" && event.stepNumber === 2) {
          throw new TypeError("React UI Render Error: Cannot read properties of undefined (reading 'renderTree')");
        }
      },
    });

    // 挂载正常的 Logger 观察者
    eventBus.registerObserver({
      id: "safe-logger",
      name: "Audit Logger",
      enabled: true,
      onEvent: (event) => {
        if (event.type === "step:start") {
          edLogs.push(`[EventBus] Audit Logger received step:start (${event.stepNumber})`);
        }
      },
    });

    try {
      edLogs.push("🚀 [Event Bus Loop] 启动代码重构任务...");
      await eventBus.emit({ type: "run:start", runId, inputPrompt: "重构 auth.ts" });

      for (let s = 1; s <= totalSteps; s++) {
        edSteps = s;
        await eventBus.emit({ type: "step:start", runId, stepNumber: s });
        await eventBus.emit({
          type: "tool:start",
          runId,
          stepNumber: s,
          toolCallId: `call-${s}`,
          toolName: "read_file",
          inputArgs: { path: "auth.ts" },
        });
        await new Promise((r) => setTimeout(r, 20));
      }

      await eventBus.emit({
        type: "run:finish",
        runId,
        success: true,
        finalAnswer: "重构成功完成",
        totalSteps,
        durationMs: Date.now() - edStart,
      });
      edSuccess = true;
      edLogs.push(`✅ [Event Bus Loop] Agent 主运行时毫发无损完成全部 ${totalSteps} 步！`);
    } catch (err: any) {
      edLogs.push(`❌ 意外错误: ${err.message}`);
    }
    const edDuration = Date.now() - edStart;
    const errors = eventBus.getErrors().map((e) => `${e.observerName}: ${e.error}`);

    return {
      scenario: "fault_contagion",
      title: "观察者异常穿透与故障沙箱隔离测试",
      description:
        "模拟外部 UI 组件在 step 2 处理通知时抛出 TypeError，观察单体循环是否会被连带炸死。",
      callbackHell: {
        success: cbSuccess,
        durationMs: cbDuration,
        stepsCompleted: cbSteps,
        totalSteps,
        error: cbError,
        log: cbLogs,
        codeCouplingScore: "极高耦合 (Tight Coupling)",
      },
      eventDriven: {
        success: edSuccess,
        durationMs: edDuration,
        stepsCompleted: edSteps,
        totalSteps,
        faultIsolated: errors.length > 0,
        observerErrors: errors,
        log: edLogs,
        codeCouplingScore: "完全解耦 (Zero Coupling)",
      },
      keyTakeaway:
        "Callback 模式下外部 UI 异常直接穿透击毁 Agent；Event-Driven 下 FaultBarrier 构筑沙箱屏障，外部观察者再怎么崩溃也伤不到 Agent 主循环。",
    };
  }

  /**
   * 场景 2: 慢速 I/O 观察者拖慢推理测试 (Slow I/O Latency Drag)
   */
  private static async runSlowIoDragScenario(): Promise<ChaosRunResult> {
    const totalSteps = 3;

    // --- 1. Callback 模式 (同步阻塞回调) ---
    const cbLogs: string[] = [];
    const cbStart = Date.now();
    cbLogs.push("🚀 [Callback Loop] 启动任务，挂载了一个网络慢速远程审计回调 (每次阻塞 150ms)...");

    const slowCallback = async (action: string) => {
      await new Promise((r) => setTimeout(r, 150)); // 阻塞 150ms
      cbLogs.push(`  [SlowCallback] 完成慢速审计: ${action}`);
    };

    for (let s = 1; s <= totalSteps; s++) {
      // 循环必须 await 这个回调
      await slowCallback(`step-${s}-inference`);
      await slowCallback(`step-${s}-tool-exec`);
    }
    const cbDuration = Date.now() - cbStart;
    cbLogs.push(`⏱️ [Callback Loop] 总耗时高达 ${cbDuration}ms！核心推理被外部审计严重拖慢。`);

    // --- 2. Event-Driven 模式 (异步解耦，火后即焚) ---
    const edLogs: string[] = [];
    const eventBus = new TypedEventBus();
    const runId = "run-slow-" + generateId();
    const edStart = Date.now();
    edLogs.push("🚀 [Event Bus Loop] 启动任务，挂载了同样的慢速远程审计观察者...");

    eventBus.registerObserver({
      id: "slow-audit-observer",
      name: "Slow Remote Audit Observer",
      enabled: true,
      onEvent: async (event) => {
        // 观察者自身很慢，但主循环使用 emitSync 分发或并发解耦
        await new Promise((r) => setTimeout(r, 150));
      },
    });

    await eventBus.emitSync({ type: "run:start", runId, inputPrompt: "快速性能测试" });
    for (let s = 1; s <= totalSteps; s++) {
      eventBus.emitSync({ type: "step:start", runId, stepNumber: s });
      eventBus.emitSync({
        type: "tool:start",
        runId,
        stepNumber: s,
        toolCallId: `tool-${s}`,
        toolName: "execute_cmd",
        inputArgs: { cmd: "ls" },
      });
      await new Promise((r) => setTimeout(r, 10)); // 极速推理
    }
    await eventBus.emitSync({
      type: "run:finish",
      runId,
      success: true,
      finalAnswer: "性能优化完成",
      totalSteps,
      durationMs: Date.now() - edStart,
    });
    const edDuration = Date.now() - edStart;
    edLogs.push(`⚡ [Event Bus Loop] Agent 主执行仅耗时 ${edDuration}ms！完全摆脱外部慢 I/O 泥潭。`);

    return {
      scenario: "slow_io_drag",
      title: "慢速 I/O 观察者拖慢推理对比测试",
      description:
        "模拟一个每次耗时 150ms 的远程审计或写盘操作，对比 Agent 核心推理时钟是否被拉扯拖慢。",
      callbackHell: {
        success: true,
        durationMs: cbDuration,
        stepsCompleted: totalSteps,
        totalSteps,
        log: cbLogs,
        codeCouplingScore: "强时钟绑定 (Clock-Coupled)",
      },
      eventDriven: {
        success: true,
        durationMs: edDuration,
        stepsCompleted: totalSteps,
        totalSteps,
        faultIsolated: true,
        observerErrors: [],
        log: edLogs,
        codeCouplingScore: "时钟与 I/O 彻底解耦 (Clock-Decoupled)",
      },
      keyTakeaway:
        "Callback 强制 Agent 主线程等待外部观察者的 I/O；Event-Driven 让 Agent 保持最大推理速度，观察者在旁路异步消化。",
    };
  }

  /**
   * 场景 3: 零侵入动态热插拔测试 (Dynamic Hot-swap)
   */
  private static async runDynamicHotswapScenario(): Promise<ChaosRunResult> {
    const totalSteps = 4;

    // --- 1. Callback 模式 ---
    const cbLogs: string[] = [];
    cbLogs.push("❌ [Callback 模式限制]：函数参数签名写死 `runAgent(prompt, onStep, onTool)`。");
    cbLogs.push("  若在任务执行到第 2 步时，运维想要临时接入 OpenTelemetry Tracer 追踪性能：");
    cbLogs.push("  必须终止整个 Agent 进程，修改源码与函数签名，重新编译部署才能生效！");

    // --- 2. Event-Driven 模式 ---
    const edLogs: string[] = [];
    const eventBus = new TypedEventBus();
    const tracer = new ConsoleTracerObserver();
    const telemetry = new TelemetryObserver();
    const runId = "run-hotswap-" + generateId();
    const edStart = Date.now();

    edLogs.push("🚀 [Event Bus Loop] 启动任务，初始状态仅有默认 EventStore...");
    await eventBus.emit({ type: "run:start", runId, inputPrompt: "全仓重构" });

    // Step 1: 默认执行
    await eventBus.emit({ type: "step:start", runId, stepNumber: 1 });
    edLogs.push("  Step 1 完成。此时运维要求动态挂载 ConsoleTracer 实时看日志。");

    // Step 2 前：热插拔动态挂载 ConsoleTracer
    const unregisterTracer = eventBus.registerObserver(tracer);
    edLogs.push("  🔥 [动态热插拔成功] ConsoleTracer 已零侵入挂载，无重启！");
    await eventBus.emit({ type: "step:start", runId, stepNumber: 2 });

    // Step 3 前：热插拔动态挂载 Telemetry 收集器
    eventBus.registerObserver(telemetry);
    edLogs.push("  🔥 [动态热插拔成功] TelemetryObserver 已零侵入挂载，无重启！");
    await eventBus.emit({ type: "step:start", runId, stepNumber: 3 });

    // Step 4 前：动态热卸载 ConsoleTracer
    unregisterTracer();
    edLogs.push("  🔌 [动态热卸载成功] ConsoleTracer 已从总线拔出，停止接收事件。");
    await eventBus.emit({ type: "step:start", runId, stepNumber: 4 });

    await eventBus.emit({
      type: "run:finish",
      runId,
      success: true,
      finalAnswer: "任务完成",
      totalSteps,
      durationMs: Date.now() - edStart,
    });

    const edDuration = Date.now() - edStart;

    return {
      scenario: "dynamic_hotswap",
      title: "零侵入动态观察者热插拔测试",
      description:
        "在 Agent 执行中途，无需重启、无需修改任何 Agent 核心循环代码，动态 Attach / Detach 多个 Observer。",
      callbackHell: {
        success: false,
        durationMs: 0,
        stepsCompleted: 1,
        totalSteps,
        error: "无法在运行时动态添加回调，必须重构参数签名并重启",
        log: cbLogs,
        codeCouplingScore: "违反开闭原则 (OCP Violation)",
      },
      eventDriven: {
        success: true,
        durationMs: edDuration,
        stepsCompleted: totalSteps,
        totalSteps,
        faultIsolated: true,
        observerErrors: [],
        log: edLogs,
        codeCouplingScore: "严格遵循开闭原则 (Open-Closed Principle)",
      },
      keyTakeaway:
        "通过 Event Bus 的 Pub/Sub 模式，外部工具、Tracer、UI 可以在任何时刻随意插入或拔出，AgentCore 与 AgentRuntime 完全不需要知道它们的存在。",
    };
  }
}

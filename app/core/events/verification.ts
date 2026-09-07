import { TypedEventBus } from "./event-bus";
import { ConsoleTracerObserver } from "./observers/console-tracer";
import { TelemetryObserver } from "./observers/telemetry-observer";
import { EventStoreObserver } from "./observers/event-store";
import { generateId } from "./types";

export interface VerificationTestResult {
  id: string;
  name: string;
  category: string;
  passed: boolean;
  durationMs: number;
  description: string;
  details: string;
}

export class EventDrivenVerificationSuite {
  static async runAll(): Promise<VerificationTestResult[]> {
    const results: VerificationTestResult[] = [];

    results.push(await this.testZeroIntrusionObservability());
    results.push(await this.testFaultIsolationBoundary());
    results.push(await this.testDeterministicEventSourcing());
    results.push(await this.testFifoOrderingAndSequenceMonotonicity());

    return results;
  }

  /**
   * 1. 零入侵可观测性检验
   */
  private static async testZeroIntrusionObservability(): Promise<VerificationTestResult> {
    const start = Date.now();
    const bus = new TypedEventBus();
    const tracer = new ConsoleTracerObserver();
    const telemetry = new TelemetryObserver();

    // 零修改核心代码，热插拔挂载两个观察者
    const unreg1 = bus.registerObserver(tracer);
    const unreg2 = bus.registerObserver(telemetry);

    const runId = "verify-zero-" + generateId();
    await bus.emit({ type: "run:start", runId, inputPrompt: "测试零入侵可观测性" });
    await bus.emit({ type: "step:start", runId, stepNumber: 1 });
    await bus.emit({
      type: "llm:thought",
      runId,
      stepNumber: 1,
      thought: "思考中...",
      tokenUsage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
    });
    await bus.emit({
      type: "tool:start",
      runId,
      stepNumber: 1,
      toolCallId: "call-1",
      toolName: "read_file",
      inputArgs: { path: "package.json" },
    });
    await bus.emit({
      type: "tool:end",
      runId,
      toolCallId: "call-1",
      toolName: "read_file",
      output: '{"name": "test"}',
      isError: false,
      durationMs: 45,
    });
    await bus.emit({
      type: "run:finish",
      runId,
      success: true,
      finalAnswer: "读取完成",
      totalSteps: 1,
      durationMs: 120,
    });

    const lines = tracer.getLines();
    const telemSnap = telemetry.getSnapshot();

    const passed =
      lines.length >= 5 &&
      telemSnap.totalTokens === 70 &&
      telemSnap.totalSteps === 1 &&
      telemSnap.toolMetrics["read_file"]?.callCount === 1;

    unreg1();
    unreg2();

    return {
      id: "zero_intrusion_observability",
      name: "零入侵可观测性检验 (Zero-intrusion Observer)",
      category: "架构解耦",
      passed,
      durationMs: Date.now() - start,
      description: "验证无需修改 Agent 核心循环与签名，热插拔挂载的观察者能 100% 完整捕获全链路事件",
      details: passed
        ? `Tracer 成功捕获 ${lines.length} 行控制台输出，Telemetry 成功聚合 70 Token 消耗与工具指标，零代码侵入。`
        : "观察者未完整接收到事件流",
    };
  }

  /**
   * 2. 故障沙箱隔离性检验
   */
  private static async testFaultIsolationBoundary(): Promise<VerificationTestResult> {
    const start = Date.now();
    const bus = new TypedEventBus();
    const runId = "verify-fault-" + generateId();

    let normalObserverReceivedCount = 0;

    // 恶意/崩溃的观察者
    bus.registerObserver({
      id: "crasher-observer",
      name: "Fatal Crashing Observer",
      enabled: true,
      onEvent: () => {
        throw new Error("Simulated Crash in External Observer!");
      },
    });

    // 正常观察者
    bus.registerObserver({
      id: "normal-observer",
      name: "Normal Observer",
      enabled: true,
      onEvent: () => {
        normalObserverReceivedCount++;
      },
    });

    // 发射事件
    let runtimeSurvived: boolean;
    try {
      await bus.emit({ type: "run:start", runId, inputPrompt: "故障隔离测试" });
      await bus.emit({ type: "step:start", runId, stepNumber: 1 });
      runtimeSurvived = true;
    } catch {
      runtimeSurvived = false;
    }

    const errors = bus.getErrors();
    const passed = runtimeSurvived && errors.length > 0 && normalObserverReceivedCount === 2;

    return {
      id: "fault_isolation_boundary",
      name: "故障沙箱隔离性检验 (Fault Isolation Boundary)",
      category: "系统韧性",
      passed,
      durationMs: Date.now() - start,
      description: "验证第三方观察者内部 throw Error 时，FaultBarrier 安全阻断，Agent 循环与正常观察者不受任何影响",
      details: passed
        ? `恶意观察者抛出的异常被沙箱捕获并记录 (${errors.length} 条错误记录)，正常观察者正常接收 2 次事件，主线程零崩溃。`
        : "异常穿透导致主线程中断或正常观察者被阻断",
    };
  }

  /**
   * 3. 事件溯源确定性回放检验
   */
  private static async testDeterministicEventSourcing(): Promise<VerificationTestResult> {
    const start = Date.now();
    const store = new EventStoreObserver();
    const bus = new TypedEventBus();
    bus.registerObserver(store);

    const runId = "verify-replay-" + generateId();

    // 模拟一次包含 2 个 Step 的任务
    await bus.emit({ type: "run:start", runId, inputPrompt: "重构并测试" });
    await bus.emit({ type: "step:start", runId, stepNumber: 1 });
    await bus.emit({ type: "llm:thought", runId, stepNumber: 1, thought: "先查看文件目录" });
    await bus.emit({
      type: "tool:start",
      runId,
      stepNumber: 1,
      toolCallId: "call-dir",
      toolName: "list_dir",
      inputArgs: { dir: "src" },
    });
    await bus.emit({
      type: "tool:end",
      runId,
      toolCallId: "call-dir",
      toolName: "list_dir",
      output: "index.ts, app.ts",
      isError: false,
      durationMs: 15,
    });

    await bus.emit({ type: "step:start", runId, stepNumber: 2 });
    await bus.emit({ type: "llm:thought", runId, stepNumber: 2, thought: "重构完成，输出答案" });
    await bus.emit({
      type: "run:finish",
      runId,
      success: true,
      finalAnswer: "代码已重构完毕",
      totalSteps: 2,
      durationMs: 200,
    });

    // 投影状态验证
    const fullState = store.projectState(runId);
    const partialState = store.projectState(runId, 5); // 只投影到第 5 个事件

    const passed =
      fullState.isFinished === true &&
      fullState.currentStep === 2 &&
      fullState.toolCalls.length === 1 &&
      fullState.finalAnswer === "代码已重构完毕" &&
      partialState.isFinished === false &&
      partialState.currentStep === 1;

    return {
      id: "deterministic_event_sourcing",
      name: "事件溯源确定性回放检验 (Deterministic Event Sourcing Replay)",
      category: "状态持久化",
      passed,
      durationMs: Date.now() - start,
      description: "验证完全基于事件日志的历史回放与状态投影，能在不重新调用模型的情况下 100% 确定性复原任意历史时刻状态",
      details: passed
        ? `全量投影成功还原最终状态 (Step 2, 答案: "代码已重构完毕")，时间切片投影精确停留在 Step 1 (isFinished: false)。`
        : "事件溯源状态投影结果与实际历史不符",
    };
  }

  /**
   * 4. 高频 FIFO 时序与单调序号检验
   */
  private static async testFifoOrderingAndSequenceMonotonicity(): Promise<VerificationTestResult> {
    const start = Date.now();
    const bus = new TypedEventBus();
    const runId = "verify-fifo-" + generateId();

    const receivedSeqIds: number[] = [];
    bus.registerObserver({
      id: "fifo-checker",
      name: "FIFO Checker",
      enabled: true,
      onEvent: (event) => {
        receivedSeqIds.push(event.seqId);
      },
    });

    // 连续高频派发 50 个事件
    const eventCount = 50;
    for (let i = 1; i <= eventCount; i++) {
      bus.emitSync({
        type: "tool:chunk",
        runId,
        toolCallId: "call-stream",
        toolName: "bash",
        streamType: "stdout",
        chunk: `chunk_${i}\n`,
      });
    }

    // 验证严格单调递增连续 (seqId === prev + 1)
    let strictlyMonotonic = true;
    for (let i = 0; i < receivedSeqIds.length; i++) {
      if (i > 0 && receivedSeqIds[i] !== receivedSeqIds[i - 1] + 1) {
        strictlyMonotonic = false;
        break;
      }
    }

    const passed = receivedSeqIds.length === eventCount && strictlyMonotonic;

    return {
      id: "fifo_ordering_monotonicity",
      name: "高频 FIFO 时序与单调序号检验 (FIFO & Monotonic Sequence)",
      category: "时序一致性",
      passed,
      durationMs: Date.now() - start,
      description: "在高频流式 chunk 密集派发场景下，验证全局事件总线严格保障序号连续递增且无乱序或丢包",
      details: passed
        ? `成功连续派发并校验 ${eventCount} 个事件，序列号严格从 ${receivedSeqIds[0]} 连续递增至 ${receivedSeqIds[receivedSeqIds.length - 1]}，0 丢包。`
        : "事件序列号存在乱序、跳号或丢失",
    };
  }
}

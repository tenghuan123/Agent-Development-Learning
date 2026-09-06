import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  TypedEventBus,
  ConsoleTracerObserver,
  TelemetryObserver,
  EventStoreObserver,
  ChaosExperimentRunner,
  EventDrivenVerificationSuite,
  generateId,
  type ChaosScenarioType,
  type AgentEvent,
} from "~/core/events";
import {
  AgentRuntime,
  PureAgentCore,
  SafeToolExecutor,
  SessionManager,
  EventStream,
} from "~/core/runtime";

// In-memory global event bus and standard observers for Lesson 14
let globalEventBus: TypedEventBus | null = null;
let globalConsoleTracer: ConsoleTracerObserver | null = null;
let globalTelemetry: TelemetryObserver | null = null;
let globalEventStore: EventStoreObserver | null = null;

function getOrCreateEventBus() {
  if (!globalEventBus) {
    globalEventBus = new TypedEventBus();
    globalConsoleTracer = new ConsoleTracerObserver();
    globalTelemetry = new TelemetryObserver();
    globalEventStore = new EventStoreObserver();

    globalEventBus.registerObserver(globalConsoleTracer);
    globalEventBus.registerObserver(globalTelemetry);
    globalEventBus.registerObserver(globalEventStore);
  }
  return {
    bus: globalEventBus,
    tracer: globalConsoleTracer!,
    telemetry: globalTelemetry!,
    store: globalEventStore!,
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { bus, tracer, telemetry, store } = getOrCreateEventBus();
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");

  const events = bus.getHistory(runId || undefined);
  const observers = bus.getObservers().map((o) => ({
    id: o.id,
    name: o.name,
    description: o.description,
    enabled: o.enabled,
  }));
  const stats = bus.getStats();
  const tracerLines = tracer.getLines();
  const telemetrySnap = telemetry.getSnapshot();
  const errors = bus.getErrors();
  const runIds = store.getRunIds();

  return Response.json({
    success: true,
    stats,
    observers,
    events,
    tracerLines,
    telemetry: telemetrySnap,
    errors,
    runIds,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { bus, tracer, telemetry, store } = getOrCreateEventBus();
    const body = (await request.json()) as {
      action?:
        | "run_chaos"
        | "run_verification"
        | "toggle_observer"
        | "run_task"
        | "project_state"
        | "clear";
      scenario?: ChaosScenarioType;
      observerId?: string;
      enabled?: boolean;
      prompt?: string;
      apiKey?: string;
      baseURL?: string;
      model?: string;
      maxSteps?: number;
      runId?: string;
      upToSeqId?: number;
    };

    const actionType = body.action || "run_task";

    // 1. 混沌对比实验
    if (actionType === "run_chaos") {
      const scenario = body.scenario || "fault_contagion";
      const result = await ChaosExperimentRunner.runScenario(scenario);
      return Response.json({
        success: true,
        result,
      });
    }

    // 2. 自动化验收测试套件
    if (actionType === "run_verification") {
      const results = await EventDrivenVerificationSuite.runAll();
      return Response.json({
        success: true,
        tests: results,
      });
    }

    // 3. 动态热插拔切换观察者
    if (actionType === "toggle_observer") {
      if (!body.observerId) {
        return Response.json({ success: false, error: "Missing observerId" }, { status: 400 });
      }
      const newStatus = bus.toggleObserver(body.observerId, body.enabled);
      return Response.json({
        success: true,
        observerId: body.observerId,
        enabled: newStatus,
        observers: bus.getObservers().map((o) => ({
          id: o.id,
          name: o.name,
          enabled: o.enabled,
        })),
      });
    }

    // 4. 事件溯源投影状态拉取
    if (actionType === "project_state") {
      if (!body.runId) {
        return Response.json({ success: false, error: "Missing runId" }, { status: 400 });
      }
      const state = store.projectState(body.runId, body.upToSeqId);
      const events = store.getEventsByRun(body.runId);
      return Response.json({
        success: true,
        runId: body.runId,
        state,
        events,
      });
    }

    // 5. 真实运行生产级 Agent 任务 (基于 AgentRuntime 驱动真实 LLM 与真实文件/命令行工具)
    if (actionType === "run_task") {
      const prompt =
        body.prompt ||
        "请使用 list_dir 查看项目根目录，并用 read_file 查看 package.json，总结项目依赖。";

      const effectiveApiKey = body.apiKey || process.env.LLM_API_KEY || "";
      const effectiveBaseURL = body.baseURL || process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
      const effectiveModel = body.model || process.env.LLM_MODEL || "glm-4-flash";

      if (!effectiveApiKey.trim()) {
        return Response.json(
          {
            success: false,
            error: "未检测到 LLM API Key，请在页面右上角设置 API Key，或在 .env 中配置 LLM_API_KEY。",
          },
          { status: 400 }
        );
      }

      // 组装工业级 Runtime 五大齿轮
      const runtimeEventStream = new EventStream();
      const sessionManager = new SessionManager();
      const toolExecutor = new SafeToolExecutor();
      const core = new PureAgentCore({
        apiKey: effectiveApiKey,
        baseURL: effectiveBaseURL,
        model: effectiveModel,
      });

      const runtime = new AgentRuntime({
        core,
        sessionManager,
        toolExecutor,
        eventStream: runtimeEventStream,
      });

      // 核心连通：将 AgentRuntime 的底层事件实时单向桥接至 TypedEventBus (解耦观察平面)
      runtimeEventStream.subscribe(async (event: any) => {
        try {
          if (event.type === "run:start") {
            await bus.emit({
              type: "run:start",
              runId: event.runId,
              inputPrompt: event.inputPrompt,
              metadata: { branchId: event.branchId },
            });
          } else if (event.type === "step:start") {
            await bus.emit({
              type: "step:start",
              runId: event.runId,
              stepNumber: event.stepNumber,
            });
          } else if (event.type === "llm:thought") {
            await bus.emit({
              type: "llm:thought",
              runId: event.runId,
              stepNumber: event.stepNumber,
              thought: event.thought,
              tokenUsage: event.usage,
            });
          } else if (event.type === "tool:start") {
            let parsedArgs: any = event.inputArgs;
            if (typeof parsedArgs === "string") {
              try {
                parsedArgs = JSON.parse(parsedArgs);
              } catch {
                parsedArgs = { raw: parsedArgs };
              }
            }
            await bus.emit({
              type: "tool:start",
              runId: event.runId,
              stepNumber: event.stepNumber,
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              inputArgs: parsedArgs || {},
            });
          } else if (event.type === "tool:chunk") {
            bus.emitSync({
              type: "tool:chunk",
              runId: event.runId,
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              streamType: event.streamType || "stdout",
              chunk: event.chunk,
            });
          } else if (event.type === "tool:end") {
            await bus.emit({
              type: "tool:end",
              runId: event.runId,
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              output: String(event.output || ""),
              isError: Boolean(event.isError),
              durationMs: event.durationMs || 0,
            });
          } else if (event.type === "runtime:state_change") {
            await bus.emit({
              type: "runtime:state_change",
              runId: event.runId,
              fromState: event.fromState,
              toState: event.toState,
              reason: event.reason,
            });
          } else if (event.type === "user:interrupt") {
            await bus.emit({
              type: "user:interrupt",
              runId: event.runId,
              message: event.message,
              injectedAtStep: event.injectedAtStep || 0,
            });
          } else if (event.type === "run:finish") {
            await bus.emit({
              type: "run:finish",
              runId: event.runId,
              success: event.success,
              finalAnswer: event.finalAnswer || "",
              totalSteps: event.totalSteps || 0,
              durationMs: event.totalDurationMs || 0,
            });
          }
        } catch (busErr) {
          console.error("[api.events] Error forwarding event to bus:", busErr);
        }
      });

      const maxSteps = body.maxSteps ?? 4;
      const run = await runtime.start(prompt, { maxSteps });

      return Response.json({
        success: true,
        runId: run.id,
        run,
        events: bus.getHistory(run.id),
        telemetry: telemetry.getSnapshot(),
        tracerLines: tracer.getLines(),
      });
    }

    // 6. 清理
    if (actionType === "clear") {
      bus.clear();
      tracer.clear();
      telemetry.clear();
      store.clear();
      return Response.json({ success: true, message: "Cleared all event data." });
    }

    return Response.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return Response.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

import { useState, useEffect, useRef } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import type {
  AgentEvent,
  AgentObserver,
  ChaosRunResult,
  ChaosScenarioType,
  ReplayStateSnapshot,
  TelemetrySnapshot,
  VerificationTestResult,
  FormattedTraceLine,
} from "~/core/events";
import {
  Activity,
  AlertOctagon,
  ArrowRight,
  BookOpen,
  Bug,
  CheckCircle2,
  Clock,
  Cpu,
  FastForward,
  Flame,
  Layers,
  ListTree,
  Monitor,
  Network,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  SkipForward,
  Sparkles,
  Terminal,
  Volume2,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";

export async function loader() {
  const hasServerKey = Boolean(
    process.env.LLM_API_KEY && process.env.LLM_API_KEY.trim().length > 0
  );
  const model = process.env.LLM_MODEL || "glm-4-flash";
  const defaultBaseURL =
    process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";

  return {
    hasServerKey,
    model,
    defaultBaseURL,
  };
}

export default function LessonV13Page() {
  const { hasServerKey, model, defaultBaseURL } = useLoaderData<typeof loader>();

  // LLM Config state
  const [customApiKey, setCustomApiKey] = useState("");
  const [customBaseURL, setCustomBaseURL] = useState(defaultBaseURL);

  useEffect(() => {
    const storedKey = localStorage.getItem("MINI_CLAUDE_API_KEY");
    if (storedKey) setCustomApiKey(storedKey);
    const storedBase = localStorage.getItem("MINI_CLAUDE_BASE_URL");
    if (storedBase) setCustomBaseURL(storedBase);
  }, []);

  const handleSaveSettings = ({ apiKey, baseURL }: { apiKey: string; baseURL: string }) => {
    setCustomApiKey(apiKey);
    setCustomBaseURL(baseURL);
    localStorage.setItem("MINI_CLAUDE_API_KEY", apiKey);
    localStorage.setItem("MINI_CLAUDE_BASE_URL", baseURL);
  };

  // Active Tab
  const [activeTab, setActiveTab] = useState<
    "chaos" | "multiplexer" | "replay" | "theory" | "verify"
  >("chaos");

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "success" | "warning" | "error" | "info";
  } | null>(null);

  // ==========================================
  // Tab 1: Chaos Lab State
  // ==========================================
  const [selectedScenario, setSelectedScenario] =
    useState<ChaosScenarioType>("fault_contagion");
  const [chaosResult, setChaosResult] = useState<ChaosRunResult | null>(null);

  const runChaosScenario = async (scenario: ChaosScenarioType) => {
    setIsLoading(true);
    setStatusMessage({ text: "正在运行混沌对照实验...", type: "info" });
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_chaos", scenario }),
      });
      const data = await res.json();
      if (data.success) {
        setChaosResult(data.result);
        setStatusMessage({
          text: `对照实验 [${data.result.title}] 执行完毕！`,
          type: "success",
        });
      } else {
        setStatusMessage({ text: data.error || "执行失败", type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: "网络请求异常: " + err.message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // Tab 2: Observer Multiplexer State
  // ==========================================
  const [taskPrompt, setTaskPrompt] = useState(
    "请使用 list_dir 查看当前项目目录，并用 read_file 读取 package.json，总结项目的主要依赖和技术栈。"
  );
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [observers, setObservers] = useState<
    { id: string; name: string; enabled: boolean }[]
  >([
    { id: "console-tracer", name: "Console Tracer (CLI)", enabled: true },
    { id: "telemetry-observer", name: "Telemetry Metrics", enabled: true },
    { id: "event-store", name: "Event Store (Sourcing)", enabled: true },
  ]);
  const [busStats, setBusStats] = useState({
    totalEventsEmitted: 0,
    currentSeqId: 0,
    registeredObservers: 3,
    activeObservers: 3,
    totalObserverErrors: 0,
  });
  const [tracerLines, setTracerLines] = useState<FormattedTraceLine[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [recentEvents, setRecentEvents] = useState<AgentEvent[]>([]);

  // 刷新全局总线状态与观察者数据
  const refreshBusData = async () => {
    try {
      const res = await fetch("/api/events");
      const data = await res.json();
      if (data.success) {
        setObservers(data.observers);
        setBusStats(data.stats);
        setTracerLines(data.tracerLines);
        setTelemetry(data.telemetry);
        setRecentEvents(data.events);
      }
    } catch (err) {
      console.error("Refresh bus error:", err);
    }
  };

  useEffect(() => {
    refreshBusData();
    const timer = setInterval(refreshBusData, 3000);
    return () => clearInterval(timer);
  }, []);

  const runAgentTask = async () => {
    setIsLoading(true);
    setStatusMessage({
      text: "⚡ 真实 Agent 正在运行 (调用真实模型推理与本地文件/系统工具)，并通过事件总线实时广播...",
      type: "info",
    });
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_task",
          prompt: taskPrompt,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
          maxSteps: 4,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveRunId(data.runId);
        setRecentEvents(data.events);
        setTelemetry(data.telemetry);
        setTracerLines(data.tracerLines);
        setStatusMessage({
          text: `任务完成！总线成功广播 ${data.events.length} 个强类型事件。`,
          type: "success",
        });
        refreshBusData();
      } else {
        setStatusMessage({ text: data.error || "执行失败", type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: "请求失败: " + err.message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleObserver = async (observerId: string) => {
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_observer", observerId }),
      });
      const data = await res.json();
      if (data.success) {
        setObservers(data.observers);
        setStatusMessage({
          text: `观察者 [${observerId}] 状态已动态切换为: ${data.enabled ? "已启用" : "已挂起"}`,
          type: "info",
        });
        refreshBusData();
      }
    } catch (err: any) {
      setStatusMessage({ text: "切换观察者失败: " + err.message, type: "error" });
    }
  };

  // ==========================================
  // Tab 3: Time-travel Replay Studio State
  // ==========================================
  const [replayEvents, setReplayEvents] = useState<AgentEvent[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState<0.5 | 1 | 2>(1);
  const [projectedState, setProjectedState] = useState<ReplayStateSnapshot | null>(null);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 加载当前事件流用于回放
  const loadReplayData = async () => {
    if (!activeRunId && recentEvents.length > 0) {
      setActiveRunId(recentEvents[0].runId);
    }
    const targetRunId = activeRunId || (recentEvents[0] && recentEvents[0].runId);
    if (!targetRunId) return;

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "project_state", runId: targetRunId }),
      });
      const data = await res.json();
      if (data.success) {
        setReplayEvents(data.events);
        setReplayIndex(data.events.length);
        setProjectedState(data.state);
      }
    } catch (err) {
      console.error("Load replay error:", err);
    }
  };

  useEffect(() => {
    if (activeTab === "replay") {
      loadReplayData();
    }
  }, [activeTab, activeRunId]);

  // 根据当前滑动条位置计算投影状态
  const updateProjectedStateAtIndex = async (idx: number) => {
    if (!replayEvents || replayEvents.length === 0) return;
    const clampedIdx = Math.max(0, Math.min(idx, replayEvents.length));
    setReplayIndex(clampedIdx);

    const targetEvent = replayEvents[clampedIdx - 1];
    const upToSeqId = targetEvent ? targetEvent.seqId : 0;

    const targetRunId = activeRunId || (replayEvents[0] && replayEvents[0].runId);
    if (!targetRunId) return;

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "project_state",
          runId: targetRunId,
          upToSeqId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setProjectedState(data.state);
      }
    } catch (err) {
      console.error("Replay project error:", err);
    }
  };

  // 播放器计时器
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = Math.round(500 / playSpeed);
      playTimerRef.current = setInterval(() => {
        setReplayIndex((prev) => {
          if (prev >= replayEvents.length) {
            setIsPlaying(false);
            return prev;
          }
          const next = prev + 1;
          updateProjectedStateAtIndex(next);
          return next;
        });
      }, intervalMs);
    } else {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, playSpeed, replayEvents.length]);

  // ==========================================
  // Tab 5: Automated Verification Suite State
  // ==========================================
  const [testResults, setTestResults] = useState<VerificationTestResult[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);

  const runVerificationSuite = async () => {
    setIsVerifying(true);
    setStatusMessage({ text: "正在执行第 14 课四大自动化验收测试...", type: "info" });
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_verification" }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResults(data.tests);
        const allPassed = data.tests.every((t: any) => t.passed);
        setStatusMessage({
          text: allPassed
            ? "🎉 恭喜！第 14 课四大工业级验收标准全部通过！"
            : "⚠️ 部分验收用例未通过，请检查详细报错信息。",
          type: allPassed ? "success" : "warning",
        });
      } else {
        setStatusMessage({ text: data.error || "验收执行失败", type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: "网络异常: " + err.message, type: "error" });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500/30">
      {/* 顶部全局导航 */}
      <Header
        hasServerKey={hasServerKey}
        model={model}
        defaultBaseURL={defaultBaseURL}
        customApiKey={customApiKey}
        customBaseURL={customBaseURL}
        onSaveSettings={handleSaveSettings}
        currentLesson={{
          id: "v13",
          title: "第 14 课: Agent 为什么必须是 Event-Driven？",
          badge: "Pi 观察平面",
        }}
      />

      {/* 主体工作区 */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col gap-6">
        {/* 课程标题与核心认知 Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/20 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  第 14 课 · 第二学期
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  V13 · 事件驱动架构
                </span>
                <span className="text-xs text-slate-400">对标 Pi / Claude Code 观察平面</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                <Network className="w-7 h-7 text-indigo-400" />
                Agent 为什么必须是 Event-Driven？
              </h1>
              <p className="text-sm text-slate-300 mt-2 max-w-3xl leading-relaxed">
                告别向 Agent 传入 Callback 回调函数的业余做法！彻底解耦控制平面与观察平面，通过强类型单向事件总线、故障沙箱屏障与事件溯源（Event Sourcing），实现终端无感多端观察与确定性回放。
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                to="/docs/14-event-driven-architecture"
                className="px-4 py-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-sm font-medium transition flex items-center gap-2"
              >
                <BookOpen className="w-4 h-4" />
                教学手册
              </Link>
            </div>
          </div>

          {/* 状态通知条 */}
          {statusMessage && (
            <div
              className={`mt-4 p-3 rounded-lg text-xs font-medium border flex items-center justify-between ${
                statusMessage.type === "success"
                  ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/30"
                  : statusMessage.type === "warning"
                  ? "bg-amber-950/40 text-amber-300 border-amber-500/30"
                  : statusMessage.type === "error"
                  ? "bg-rose-950/40 text-rose-300 border-rose-500/30"
                  : "bg-indigo-950/40 text-indigo-300 border-indigo-500/30"
              }`}
            >
              <span>{statusMessage.text}</span>
              <button
                onClick={() => setStatusMessage(null)}
                className="text-slate-400 hover:text-white ml-2"
              >
                ×
              </button>
            </div>
          )}
        </div>

        {/* 顶部五大导航选项卡 */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
          {[
            { id: "chaos", label: "💥 混沌对比实验机", icon: Flame },
            { id: "multiplexer", label: "📡 多观察者联动视界", icon: Activity },
            { id: "replay", label: "⏪ 时间旅行回放器", icon: FastForward },
            { id: "theory", label: "🧠 核心理论与架构", icon: BookOpen },
            { id: "verify", label: "🛡️ 自动化验收打卡", icon: ShieldCheck },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ========================================== */}
        {/* TAB 1: 混沌对比实验机 (Chaos Arena) */}
        {/* ========================================== */}
        {activeTab === "chaos" && (
          <div className="flex flex-col gap-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
              <h2 className="text-base font-semibold text-white flex items-center gap-2 mb-3">
                <Flame className="w-5 h-5 text-rose-400" />
                选择混沌破坏场景进行双轨对照
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {
                    id: "fault_contagion",
                    title: "1. 观察者异常穿透 (Fault Contagion)",
                    desc: "前端 UI 组件在收到通知时抛错，验证单体循环是否直接暴毙中断。",
                  },
                  {
                    id: "slow_io_drag",
                    title: "2. 慢速 I/O 阻塞 (Latency Drag)",
                    desc: "观察者执行耗时 150ms 的慢速远程审计，验证核心推理时钟是否被拉扯拖慢。",
                  },
                  {
                    id: "dynamic_hotswap",
                    title: "3. 动态热插拔 (Dynamic Hot-swap)",
                    desc: "在执行中途动态挂载/卸载 Tracer，验证是否需要停止 Agent 或修改函数签名。",
                  },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedScenario(s.id as ChaosScenarioType)}
                    className={`text-left p-4 rounded-xl border transition ${
                      selectedScenario === s.id
                        ? "bg-indigo-950/40 border-indigo-500/50 ring-1 ring-indigo-500/30"
                        : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="font-medium text-sm text-white">{s.title}</div>
                    <div className="text-xs text-slate-400 mt-1">{s.desc}</div>
                  </button>
                ))}
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  disabled={isLoading}
                  onClick={() => runChaosScenario(selectedScenario)}
                  className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm transition flex items-center gap-2 shadow-lg shadow-indigo-600/30"
                >
                  <Play className="w-4 h-4" />
                  {isLoading ? "实验运行中..." : "一键执行双轨破坏实验"}
                </button>
              </div>
            </div>

            {chaosResult && (
              <div className="flex flex-col gap-4">
                {/* 核心结论横幅 */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-900 border border-indigo-500/30 flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                      核心架构启示 (Architecture Takeaway)
                    </div>
                    <div className="text-sm text-slate-200 mt-1 leading-relaxed">
                      {chaosResult.keyTakeaway}
                    </div>
                  </div>
                </div>

                {/* 左右对照卡片 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* 左：Callback Hell 紧耦合模式 */}
                  <div className="bg-slate-900/80 border border-rose-500/30 rounded-xl p-5 flex flex-col">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                      <div>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                          传统做法
                        </span>
                        <h3 className="text-base font-bold text-white mt-1">
                          Callback Hell (紧耦合回调模式)
                        </h3>
                      </div>
                      <div className="text-right">
                        <span
                          className={`text-xs px-2 py-1 rounded font-bold ${
                            chaosResult.callbackHell.success
                              ? "bg-emerald-950 text-emerald-300"
                              : "bg-rose-950 text-rose-300"
                          }`}
                        >
                          {chaosResult.callbackHell.success ? "完成" : "💥 崩溃失败"}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                      <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                        <span className="text-slate-400">完成步数:</span>{" "}
                        <span className="font-bold text-white">
                          {chaosResult.callbackHell.stepsCompleted} /{" "}
                          {chaosResult.callbackHell.totalSteps}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                        <span className="text-slate-400">主线程耗时:</span>{" "}
                        <span className="font-bold text-rose-300">
                          {chaosResult.callbackHell.durationMs}ms
                        </span>
                      </div>
                    </div>

                    <div className="text-xs font-semibold text-slate-400 mb-2">执行执行日志:</div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs space-y-1.5 overflow-y-auto max-h-64 flex-1">
                      {chaosResult.callbackHell.log.map((line, idx) => (
                        <div
                          key={idx}
                          className={
                            line.includes("灾难崩溃") || line.includes("错误")
                              ? "text-rose-400 font-semibold"
                              : "text-slate-300"
                          }
                        >
                          {line}
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-400">代码耦合度:</span>
                      <span className="text-rose-400 font-bold">
                        {chaosResult.callbackHell.codeCouplingScore}
                      </span>
                    </div>
                  </div>

                  {/* 右：Event-Driven 解耦模式 */}
                  <div className="bg-slate-900/80 border border-emerald-500/30 rounded-xl p-5 flex flex-col">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                      <div>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                          工业级标准
                        </span>
                        <h3 className="text-base font-bold text-white mt-1">
                          Typed Event Bus (事件驱动解耦模式)
                        </h3>
                      </div>
                      <div className="text-right">
                        <span className="text-xs px-2 py-1 rounded font-bold bg-emerald-950 text-emerald-300">
                          ✅ 稳定运行 (100%)
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                      <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                        <span className="text-slate-400">完成步数:</span>{" "}
                        <span className="font-bold text-emerald-400">
                          {chaosResult.eventDriven.stepsCompleted} /{" "}
                          {chaosResult.eventDriven.totalSteps}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                        <span className="text-slate-400">主线程耗时:</span>{" "}
                        <span className="font-bold text-emerald-400">
                          {chaosResult.eventDriven.durationMs}ms (极速)
                        </span>
                      </div>
                    </div>

                    <div className="text-xs font-semibold text-slate-400 mb-2">执行执行日志:</div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs space-y-1.5 overflow-y-auto max-h-64 flex-1">
                      {chaosResult.eventDriven.log.map((line, idx) => (
                        <div
                          key={idx}
                          className={
                            line.includes("✅") || line.includes("🔥")
                              ? "text-emerald-400 font-semibold"
                              : "text-slate-300"
                          }
                        >
                          {line}
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-400">代码耦合度:</span>
                      <span className="text-emerald-400 font-bold">
                        {chaosResult.eventDriven.codeCouplingScore}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 2: 多观察者联动视界 (Observer Multiplexer) */}
        {/* ========================================== */}
        {activeTab === "multiplexer" && (
          <div className="flex flex-col gap-6">
            {/* 控制面板与观察者开关 */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-400">
                      输入真实 Agent 指令 (由 AgentRuntime 驱动真实 LLM 与工具):
                    </label>
                    <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                      <Zap className="w-3 h-3" /> 真实 LLM + 本地文件/系统工具执行
                    </span>
                  </div>
                  <input
                    type="text"
                    value={taskPrompt}
                    onChange={(e) => setTaskPrompt(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                  {/* 预设指令快捷点选 */}
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px]">
                    <span className="text-slate-500">快捷真实任务:</span>
                    {[
                      {
                        label: "📂 检查项目依赖 (list_dir + package.json)",
                        prompt: "请使用 list_dir 查看当前项目目录，并用 read_file 读取 package.json，总结项目的主要依赖和技术栈。",
                      },
                      {
                        label: "📖 总结第14课架构 (read_file 14-event-driven...)",
                        prompt: "请使用 read_file 查看 docs/lessons/14-event-driven-architecture.md，提炼出核心红黑榜总结。",
                      },
                      {
                        label: "💻 诊断系统与计算 (system_info + calculate)",
                        prompt: "请调用 system_info 检查当前系统环境与内存，再使用 calculate 计算 1024 * 768。",
                      },
                    ].map((p, idx) => (
                      <button
                        key={idx}
                        onClick={() => setTaskPrompt(p.prompt)}
                        className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition hover:text-white"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-start md:items-end gap-2 pt-2 md:pt-0">
                  <button
                    disabled={isLoading}
                    onClick={runAgentTask}
                    className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm transition flex items-center gap-2 shadow-lg shadow-indigo-600/30 whitespace-nowrap"
                  >
                    <Play className="w-4 h-4" />
                    {isLoading ? "真实 Agent 执行中..." : "启动真实 Agent 并广播"}
                  </button>
                </div>
              </div>

              {/* 观察者热插拔开关栏 */}
              <div className="border-t border-slate-800 pt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium">
                    动态观察者挂载 (零侵入热插拔):
                  </span>
                  {observers.map((obs) => (
                    <button
                      key={obs.id}
                      onClick={() => toggleObserver(obs.id)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition border flex items-center gap-1.5 ${
                        obs.enabled
                          ? "bg-indigo-950 text-indigo-300 border-indigo-500/40"
                          : "bg-slate-900 text-slate-500 border-slate-800 line-through"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          obs.enabled ? "bg-indigo-400 animate-pulse" : "bg-slate-600"
                        }`}
                      />
                      {obs.name}
                    </button>
                  ))}
                </div>

                {/* 总线统计指标 */}
                <div className="flex items-center gap-4 text-xs text-slate-400 font-mono">
                  <span>
                    总事件数: <b className="text-indigo-400">{busStats.totalEventsEmitted}</b>
                  </span>
                  <span>
                    当前 SeqId: <b className="text-cyan-400">{busStats.currentSeqId}</b>
                  </span>
                  <span>
                    沙箱隔离错误:{" "}
                    <b className={busStats.totalObserverErrors > 0 ? "text-rose-400" : "text-emerald-400"}>
                      {busStats.totalObserverErrors}
                    </b>
                  </span>
                </div>
              </div>
            </div>

            {/* 四象限观察者多视界 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 视界 1: Console Tracer (CLI 仿真器) */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col h-[480px]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    <span className="text-sm font-bold text-white">
                      Console Tracer (CLI 仿真输出)
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">对标 Claude Code / Pi</span>
                </div>

                <div className="flex-1 bg-slate-950 rounded-lg p-3 font-mono text-xs overflow-y-auto space-y-1">
                  {tracerLines.length === 0 ? (
                    <div className="text-slate-500 text-center py-20">
                      等待 Agent 任务启动以接收终端事件流...
                    </div>
                  ) : (
                    tracerLines.map((line) => (
                      <div
                        key={line.id}
                        className={`leading-relaxed ${
                          line.level === "thought"
                            ? "text-amber-300"
                            : line.level === "tool"
                            ? "text-cyan-300"
                            : line.level === "chunk"
                            ? "text-slate-400"
                            : line.level === "error"
                            ? "text-rose-400"
                            : line.level === "success"
                            ? "text-emerald-400"
                            : "text-slate-200"
                        }`}
                      >
                        <span className="text-slate-600 mr-1 select-none">
                          [{new Date(line.timestamp).toLocaleTimeString()}]
                        </span>
                        <span className="select-none text-slate-500 mr-1">{line.prefix}</span>
                        <span>{line.content}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 视界 2: Telemetry 性能与度量画像 */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col h-[480px]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-bold text-white">
                      Telemetry & 度量分析画像
                    </span>
                  </div>
                  <span className="text-xs text-emerald-400 font-mono">
                    Token / 耗时实时分析
                  </span>
                </div>

                {telemetry ? (
                  <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
                    {/* Token 指标卡片 */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                        <div className="text-xs text-slate-400">Prompt Tokens</div>
                        <div className="text-lg font-bold text-indigo-400">
                          {telemetry.totalPromptTokens}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                        <div className="text-xs text-slate-400">Completion Tokens</div>
                        <div className="text-lg font-bold text-purple-400">
                          {telemetry.totalCompletionTokens}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                        <div className="text-xs text-slate-400">Total Tokens</div>
                        <div className="text-lg font-bold text-emerald-400">
                          {telemetry.totalTokens}
                        </div>
                      </div>
                    </div>

                    {/* 步骤耗时柱状展示 */}
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex-1 flex flex-col min-h-[170px]">
                      <div className="text-xs font-semibold text-slate-400 mb-2 flex items-center justify-between">
                        <span>步骤推理延时 (Step Latency):</span>
                        <span className="text-cyan-400">均步: {telemetry.avgStepDurationMs}ms</span>
                      </div>
                      <div className="flex-1 flex items-end gap-3 pt-4 px-2 h-28">
                        {(() => {
                          const maxDur = Math.max(...telemetry.stepDurations.map((s) => s.durationMs), 1);
                          return telemetry.stepDurations.map((step) => {
                            const pct = Math.max(12, Math.round((step.durationMs / maxDur) * 100));
                            return (
                              <div
                                key={step.step}
                                className="flex-1 flex flex-col items-center gap-1 h-full justify-end"
                              >
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {step.durationMs}ms
                                </span>
                                <div
                                  style={{
                                    height: `${pct}%`,
                                  }}
                                  className="w-full bg-gradient-to-t from-indigo-600 to-cyan-500 rounded-t transition-all duration-300"
                                />
                                <span className="text-xs text-slate-300 font-bold">
                                  S{step.step}
                                </span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {/* 工具调用频次 */}
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                      <div className="text-xs font-semibold text-slate-400 mb-2">工具执行统计:</div>
                      <div className="space-y-1 text-xs">
                        {Object.entries(telemetry.toolMetrics).map(([tool, m]) => (
                          <div key={tool} className="flex justify-between items-center text-slate-300">
                            <span className="font-mono text-cyan-300">{tool}</span>
                            <span>
                              调用 {m.callCount} 次 · 均耗时 {m.avgDurationMs}ms ·{" "}
                              {m.errorCount > 0 ? (
                                <span className="text-rose-400">失败 {m.errorCount}</span>
                              ) : (
                                <span className="text-emerald-400">100% 成功</span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
                    暂无遥测数据
                  </div>
                )}
              </div>

              {/* 视界 3: Audit Log 审计原始事件流 (JSONL) */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col h-[420px] lg:col-span-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <ListTree className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-bold text-white">
                      Event Log 原始事件流 (只追加不可变日志)
                    </span>
                  </div>
                  <span className="text-xs text-purple-400 font-mono">
                    Event Sourcing 真相之源
                  </span>
                </div>

                <div className="flex-1 bg-slate-950 rounded-lg p-3 font-mono text-xs overflow-y-auto space-y-1.5">
                  {recentEvents.length === 0 ? (
                    <div className="text-slate-500 text-center py-20">暂无事件记录</div>
                  ) : (
                    recentEvents.map((e) => (
                      <div
                        key={e.id}
                        className="p-2 rounded bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-bold text-[10px]">
                            #{e.seqId}
                          </span>
                          <span className="text-indigo-400 font-semibold">{e.type}</span>
                          <span className="text-slate-400 truncate max-w-md">
                            {e.type === "run:start" && `Prompt: ${e.inputPrompt}`}
                            {e.type === "step:start" && `Step ${e.stepNumber}`}
                            {e.type === "llm:thought" && `Thought: ${e.thought.slice(0, 60)}...`}
                            {e.type === "tool:start" && `Tool: ${e.toolName}`}
                            {e.type === "tool:chunk" && `Chunk: ${e.chunk.trim()}`}
                            {e.type === "tool:end" && `Output: ${e.output.slice(0, 50)}...`}
                            {e.type === "run:finish" && `Answer: ${e.finalAnswer.slice(0, 50)}...`}
                            {e.type === "observer:error" && `Error: ${e.errorMessage}`}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 shrink-0">
                          {new Date(e.timestamp).toISOString().slice(11, 23)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 3: 时间旅行回放器 (Time-travel Replay Studio) */}
        {/* ========================================== */}
        {activeTab === "replay" && (
          <div className="flex flex-col gap-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <FastForward className="w-5 h-5 text-indigo-400" />
                    基于事件溯源的时间旅行回放 (Event Sourcing Replay)
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    零消耗任何 Token，100% 依据不可变事件日志，像视频播放器一样精确投影还原任意时刻的 Agent 状态。
                  </p>
                </div>

                {/* 播放控制按钮 */}
                <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-xl border border-slate-800">
                  <button
                    onClick={() => updateProjectedStateAtIndex(0)}
                    className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
                    title="跳到开头"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1 text-xs font-bold px-3"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    {isPlaying ? "暂停" : "播放"}
                  </button>
                  <button
                    onClick={() => updateProjectedStateAtIndex(replayIndex + 1)}
                    disabled={replayIndex >= replayEvents.length}
                    className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 transition"
                    title="单步步进"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>

                  {/* 倍速切换 */}
                  <div className="border-l border-slate-800 pl-2 flex gap-1">
                    {([0.5, 1, 2] as const).map((spd) => (
                      <button
                        key={spd}
                        onClick={() => setPlaySpeed(spd)}
                        className={`px-2 py-1 rounded text-xs font-bold ${
                          playSpeed === spd
                            ? "bg-indigo-600 text-white"
                            : "text-slate-400 hover:bg-slate-800"
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 时间轴拖动滑动条 */}
              <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-mono">
                    当前事件索引: <b className="text-cyan-400">{replayIndex}</b> / {replayEvents.length}
                  </span>
                  <span className="text-indigo-400 font-mono">
                    {replayEvents[replayIndex - 1]
                      ? `当前事件: ${replayEvents[replayIndex - 1].type} (Seq: ${replayEvents[replayIndex - 1].seqId})`
                      : "初始空闲状态"}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={replayEvents.length}
                  value={replayIndex}
                  onChange={(e) => updateProjectedStateAtIndex(Number(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
            </div>

            {/* 投射出的状态快照展板 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 左：当前时刻投影出的状态概览 */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
                <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2 flex items-center justify-between">
                  <span>投射状态 (Projected State)</span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                      projectedState?.currentState === "completed"
                        ? "bg-emerald-950 text-emerald-300"
                        : projectedState?.currentState === "running"
                        ? "bg-indigo-950 text-indigo-300"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {projectedState?.currentState || "idle"}
                  </span>
                </h3>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-800">
                    <span className="text-slate-400">当前步骤 (Step):</span>
                    <span className="font-bold text-white">第 {projectedState?.currentStep || 0} 步</span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-800">
                    <span className="text-slate-400">工具调用数:</span>
                    <span className="font-bold text-cyan-400">
                      {projectedState?.toolCalls.length || 0} 个
                    </span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-800">
                    <span className="text-slate-400">任务是否收敛:</span>
                    <span
                      className={`font-bold ${
                        projectedState?.isFinished ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {projectedState?.isFinished ? "已结束 (Finished)" : "运行中 (Active)"}
                    </span>
                  </div>
                </div>

                {projectedState?.finalAnswer && (
                  <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-xs">
                    <div className="font-semibold text-emerald-300 mb-1">最终输出答案:</div>
                    <div className="text-slate-200">{projectedState.finalAnswer}</div>
                  </div>
                )}
              </div>

              {/* 中/右：当时还原的思考与工具执行 */}
              <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
                <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">
                  历史思考与工具调用实时复现
                </h3>

                <div className="space-y-3 overflow-y-auto max-h-96 pr-2">
                  {/* 思考流 */}
                  {projectedState?.thoughts.map((th, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-indigo-950/20 border border-indigo-500/20 text-xs"
                    >
                      <div className="text-indigo-300 font-bold mb-1">💭 Step {idx + 1} 思考推导:</div>
                      <div className="text-slate-300 leading-relaxed">{th}</div>
                    </div>
                  ))}

                  {/* 工具执行流 */}
                  {projectedState?.toolCalls.map((tool) => (
                    <div
                      key={tool.id}
                      className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between font-mono">
                        <span className="text-cyan-300 font-bold">🔧 工具: {tool.name}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            tool.status === "completed"
                              ? "bg-emerald-950 text-emerald-300"
                              : "bg-amber-950 text-amber-300"
                          }`}
                        >
                          {tool.status}
                        </span>
                      </div>
                      <div className="text-slate-400 text-[11px]">
                        参数: {JSON.stringify(tool.args)}
                      </div>
                      {tool.chunks.length > 0 && (
                        <div className="p-2 rounded bg-black/50 font-mono text-[10px] text-slate-300">
                          {tool.chunks.join("")}
                        </div>
                      )}
                      {tool.output && (
                        <div className="text-emerald-300 text-[11px] pt-1">
                          输出: {tool.output}
                        </div>
                      )}
                    </div>
                  ))}

                  {!projectedState?.thoughts.length && !projectedState?.toolCalls.length && (
                    <div className="text-slate-500 text-center py-16 text-xs">
                      拖动时间轴或点击播放，观察状态如何从事件历史中实时投射生长
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 4: 核心理论与架构 (Theory & Architecture) */}
        {/* ========================================== */}
        {activeTab === "theory" && (
          <div className="flex flex-col gap-6">
            {/* 核心设计图卡片 */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                控制平面 vs 观察平面：职责边界的严格正交性
              </h2>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs leading-relaxed text-slate-300 overflow-x-auto">
                <pre>{`                                 【控制平面 Control Plane】
                  ┌────────────────────────────────────────┐
                  │             Agent Runtime              │
                  │   • 纯状态机推理 (AgentCore)            │
                  │   • 受控工具执行 (SafeToolExecutor)    │
                  └───────────────────┬────────────────────┘
                                      │  emit(event)
                                      ▼  (只管发射，不关心谁在看)
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           TypedEventBus (强类型事件中枢)                                │
│                                                                                         │
│   ┌─────────────────────┐   ┌───────────────────────────┐   ┌───────────────────────┐   │
│   │ 严格单调递增序列号   │   │  FaultBarrier 故障沙箱隔离 │   │  FIFO 时序与因果追踪  │   │
│   │ seqId: 1, 2, 3...   │   │  (安全包裹各 Observer 回调)│   │  causalityParentId    │   │
│   └─────────────────────┘   └───────────────────────────┘   └───────────────────────┘   │
└────────────────────────────────────────┬────────────────────────────────────────────────┘
                                         │
               ┌─────────────────────────┼─────────────────────────┐
               ▼                         ▼                         ▼
   ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
   │  ConsoleTracerObserver│ │   TelemetryObserver   │ │   EventStoreObserver  │
   │                       │ │                       │ │                       │
   │ • 终端彩色阶梯缩进    │ │ • Token 消耗统计      │ │ • Event Sourcing 只追加│
   │ • Claude Code 风格 UI │ │ • 步骤延时与 TPS 画像 │ │ • 时间旅行确定性回放  │
   │ • 毫秒级耗时标记      │ │ • 工具热力与错误率    │ │ • 离线日志审计 (JSONL)│
   └───────────────────────┘ └───────────────────────┘ └───────────────────────┘
                                 【观察平面 Observation Plane】`}</pre>
              </div>
            </div>

            {/* 红黑榜对照表 */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-4">
                🔥 架构红黑榜：Callback 模式 vs Event-Driven 模式
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950 text-slate-400 uppercase border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">能力维度</th>
                      <th className="px-4 py-3 text-rose-400">传统 Callback 模式 (黑榜)</th>
                      <th className="px-4 py-3 text-emerald-400">工业级 Event-Driven 模式 (红榜)</th>
                      <th className="px-4 py-3">架构权衡与收益</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    <tr>
                      <td className="px-4 py-3 font-semibold text-white">故障隔离性</td>
                      <td className="px-4 py-3 text-rose-300">❌ 回调异常直接穿透击毁 Agent 主线程</td>
                      <td className="px-4 py-3 text-emerald-300">✅ FaultBarrier 沙箱阻断，隔离旁路故障</td>
                      <td className="px-4 py-3 text-slate-400">外部观察者再怎么崩溃也伤不到 Agent。</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-semibold text-white">I/O 时钟解耦</td>
                      <td className="px-4 py-3 text-rose-300">❌ 强同步 await，慢日志拖慢模型推理</td>
                      <td className="px-4 py-3 text-emerald-300">✅ 异步非阻塞派发，核心维持最高吞吐</td>
                      <td className="px-4 py-3 text-slate-400">网络审计延时 10 秒也不会拖慢 Agent 1 毫秒。</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-semibold text-white">扩展性 (OCP)</td>
                      <td className="px-4 py-3 text-rose-300">❌ 每加一个观察者就要改 Agent 函数签名</td>
                      <td className="px-4 py-3 text-emerald-300">✅ 零入侵动态热插拔 (registerObserver)</td>
                      <td className="px-4 py-3 text-slate-400">严格遵守开闭原则，核心代码永久稳定。</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-semibold text-white">历史可复现性</td>
                      <td className="px-4 py-3 text-rose-300">❌ 不可复现，调试只能盲猜</td>
                      <td className="px-4 py-3 text-emerald-300">✅ 事件溯源 (Event Sourcing) 像素级回放</td>
                      <td className="px-4 py-3 text-slate-400">无需花 Token 即可 100% 确定性还原任意历史节点。</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 5: 自动化验收打卡 (Verification Suite) */}
        {/* ========================================== */}
        {activeTab === "verify" && (
          <div className="flex flex-col gap-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  第 14 课：工业级自动化验收套件
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  包含零入侵可观测性、故障沙箱隔离、确定性事件溯源与高频保序四大权威验收。
                </p>
              </div>

              <button
                disabled={isVerifying}
                onClick={runVerificationSuite}
                className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-sm transition flex items-center gap-2 shadow-lg shadow-emerald-600/30 shrink-0"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isVerifying ? "正在验收打卡..." : "一键执行自动化验收"}
              </button>
            </div>

            {testResults.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {testResults.map((t) => (
                  <div
                    key={t.id}
                    className={`p-5 rounded-xl border flex flex-col justify-between transition ${
                      t.passed
                        ? "bg-slate-900/80 border-emerald-500/30"
                        : "bg-slate-900/80 border-rose-500/30"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {t.category}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-bold flex items-center gap-1 ${
                            t.passed
                              ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                              : "bg-rose-950 text-rose-300 border border-rose-800"
                          }`}
                        >
                          {t.passed ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" /> 通过
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5" /> 失败
                            </>
                          )}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white mb-1">{t.name}</h4>
                      <p className="text-xs text-slate-400 mb-3">{t.description}</p>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                      <span className="text-slate-300 font-mono truncate max-w-xs">
                        {t.details}
                      </span>
                      <span className="text-slate-500 font-mono shrink-0 ml-2">
                        {t.durationMs}ms
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}


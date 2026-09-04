import { useState, useEffect, useRef } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import type {
  ChaosRunOutput,
  ChaosScenarioType,
  RuntimeState,
  SessionRun,
  SessionSnapshot,
} from "~/core/runtime";
import {
  Activity,
  AlertOctagon,
  BookOpen,
  Bug,
  CheckCircle2,
  Clock,
  Cpu,
  Inbox,
  Layers,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Split,
  Square,
  Terminal,
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

export default function LessonV12Page() {
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

  const saveLocalKey = (key: string) => {
    setCustomApiKey(key);
    localStorage.setItem("MINI_CLAUDE_API_KEY", key);
  };

  const saveLocalBaseURL = (url: string) => {
    setCustomBaseURL(url);
    localStorage.setItem("MINI_CLAUDE_BASE_URL", url);
  };

  const handleSaveSettings = ({ apiKey, baseURL }: { apiKey: string; baseURL: string }) => {
    setCustomApiKey(apiKey);
    setCustomBaseURL(baseURL);
    localStorage.setItem("MINI_CLAUDE_API_KEY", apiKey);
    localStorage.setItem("MINI_CLAUDE_BASE_URL", baseURL);
  };

  // Active Tab: chaos | studio | terminal | theory | verify
  const [activeTab, setActiveTab] = useState<
    "chaos" | "studio" | "terminal" | "theory" | "verify"
  >("chaos");

  // Status message alert
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "success" | "warning" | "error" | "info";
  } | null>(null);

  const [isLoading, setIsLoading] = useState(false);

  // ==========================================
  // Tab 1: Chaos Lab State
  // ==========================================
  const [selectedScenario, setSelectedScenario] =
    useState<ChaosScenarioType>("mid_flight_input");
  const [chaosResult, setChaosResult] = useState<ChaosRunOutput | null>(null);

  const handleRunChaos = async (scenario: ChaosScenarioType) => {
    setSelectedScenario(scenario);
    setIsLoading(true);
    setStatusMessage({ text: "正在注入极端故障条件并采集双轨对比日志...", type: "info" });
    try {
      const res = await fetch("/api/runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_chaos",
          scenario,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setChaosResult(data.result);
        setStatusMessage({
          text: `✅ 故障实验 [${data.result.title}] 演习完毕，请观察双轨终端差异！`,
          type: "success",
        });
      } else {
        setStatusMessage({ text: `演习失败: ${data.error}`, type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: `请求异常: ${err.message}`, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  // Auto trigger default chaos scenario on first mount
  useEffect(() => {
    handleRunChaos("mid_flight_input");
  }, []);

  // ==========================================
  // Tab 2: Studio Gear Selector
  // ==========================================
  const [selectedGear, setSelectedGear] = useState<
    "core" | "runtime" | "session" | "executor" | "events"
  >("runtime");

  // ==========================================
  // Tab 3: Interactive Terminal Console State
  // ==========================================
  const [taskPrompt, setTaskPrompt] = useState(
    "请列出当前项目目录，并读取 package.json 文件的核心依赖与版本。"
  );
  const [runtimeState, setRuntimeState] = useState<RuntimeState>("idle");
  const [currentRun, setCurrentRun] = useState<SessionRun | null>(null);
  const [terminalEvents, setTerminalEvents] = useState<any[]>([]);
  const [interruptModalOpen, setInterruptModalOpen] = useState(false);
  const [interruptText, setInterruptText] = useState("停一下！请改读取 tsconfig.json");
  const [suspendedSnapshot, setSuspendedSnapshot] = useState<SessionSnapshot | null>(null);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalEvents]);

  const handleStartInteractive = async () => {
    setIsLoading(true);
    setRuntimeState("running");
    setTerminalEvents([]);
    setSuspendedSnapshot(null);
    setStatusMessage({ text: "AgentRuntime 正在启动会话与调度执行...", type: "info" });

    try {
      const res = await fetch("/api/runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start_interactive",
          prompt: taskPrompt,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
          maxSteps: 4,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentRun(data.run);
        setTerminalEvents(data.events || []);
        const nextState = data.run?.status || "completed";
        setRuntimeState(nextState);

        if (nextState === "suspended") {
          const latestSnap =
            data.run.checkpoints?.[data.run.checkpoints.length - 1] ||
            (data.run.id
              ? {
                  snapshotId: `snap_${data.run.id}_s${data.run.currentStep}`,
                  runId: data.run.id,
                  branchId: data.run.branchId,
                  stepNumber: data.run.currentStep,
                  messages: data.run.messages,
                  workspaceState: data.run.workspaceState,
                  toolHistory: data.run.toolHistory,
                  timestamp: Date.now(),
                  metadata: data.run.metadata,
                }
              : null);
          if (latestSnap) {
            setSuspendedSnapshot(latestSnap);
          }
          setStatusMessage({
            text: `⏸️ 任务已在第 ${data.run.currentStep} 步成功暂停并保存快照！请点击下方“恢复执行”继续。`,
            type: "info",
          });
        } else {
          setStatusMessage({ text: "✅ 交互任务执行结束！", type: "success" });
        }
      } else {
        setTerminalEvents(data.events || []);
        setRuntimeState("error");
        setStatusMessage({ text: `执行遇阻: ${data.error}`, type: "error" });
      }
    } catch (err: any) {
      setRuntimeState("error");
      setStatusMessage({ text: `请求失败: ${err.message}`, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendInterrupt = async () => {
    if (!interruptText.trim()) return;
    try {
      const res = await fetch("/api/runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "interrupt",
          message: interruptText.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({ text: "📥 用户插话已安全暂存进 InboundQueue 调度队列！", type: "success" });
        setInterruptModalOpen(false);
      } else {
        setStatusMessage({ text: data.error || "插话失败", type: "warning" });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message, type: "error" });
    }
  };

  const handleAbort = async () => {
    try {
      const res = await fetch("/api/runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "abort",
          reason: "用户在前端点击了紧急终止按钮",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRuntimeState("aborted");
        setStatusMessage({
          text: "🛑 AbortController 广播完毕，在途工具子进程与 LLM 请求已全部安全回收！",
          type: "warning",
        });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message, type: "error" });
    }
  };

  const handleSuspend = async () => {
    try {
      const res = await fetch("/api/runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suspend" }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.snapshot) {
          setSuspendedSnapshot(data.snapshot);
        }
        setRuntimeState("suspended");
        setStatusMessage({
          text: `⏸️ 任务已暂停，快照 ${data.snapshot?.snapshotId || ""} 保存成功！`,
          type: "info",
        });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message, type: "error" });
    }
  };

  const handleResume = async () => {
    if (!suspendedSnapshot) return;
    setIsLoading(true);
    setRuntimeState("running");
    setStatusMessage({ text: "AgentRuntime 正在从历史快照恢复并继续调度...", type: "info" });
    try {
      const res = await fetch("/api/runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resume",
          snapshotId: suspendedSnapshot.snapshotId,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
          maxSteps: 4,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentRun(data.run);
        if (data.events && data.events.length > 0) {
          setTerminalEvents((prev) => [...prev, ...data.events]);
        }
        const nextState = data.run?.status || "completed";
        setRuntimeState(nextState);

        if (nextState === "suspended") {
          const latestSnap = data.run.checkpoints?.[data.run.checkpoints.length - 1];
          if (latestSnap) {
            setSuspendedSnapshot(latestSnap);
          }
          setStatusMessage({ text: "⏸️ 任务再次暂停，可继续点击恢复。", type: "info" });
        } else {
          setSuspendedSnapshot(null);
          setStatusMessage({ text: "▶️ 从历史快照断点无缝恢复并成功完成！", type: "success" });
        }
      } else {
        setStatusMessage({ text: `恢复失败: ${data.error}`, type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // Tab 5: Verification Suite State
  // ==========================================
  const [verificationTests, setVerificationTests] = useState<any[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleRunVerification = async () => {
    setIsVerifying(true);
    try {
      const res = await fetch("/api/runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_verification" }),
      });
      const data = await res.json();
      if (data.success) {
        setVerificationTests(data.tests);
        setStatusMessage({ text: "✅ 4 项 Runtime 核心解耦验收测试已全部完成！", type: "success" });
      }
    } catch (err: any) {
      setStatusMessage({ text: `验收失败: ${err.message}`, type: "error" });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070a13] text-slate-100 font-sans selection:bg-cyan-500/30 flex flex-col">
      <Header
        hasServerKey={hasServerKey}
        model={model}
        defaultBaseURL={defaultBaseURL}
        customApiKey={customApiKey}
        onSaveApiKey={saveLocalKey}
        customBaseURL={customBaseURL}
        onSaveBaseURL={saveLocalBaseURL}
        onSaveSettings={handleSaveSettings}
        currentLesson={{
          id: "v12-agent-runtime",
          title: "第 13 课: Agent Loop vs Coding Agent Runtime",
          badge: "V12 · Pi 架构",
        }}
      />

      {/* Main Container */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Hero Section Banner */}
        <div className="relative glass-panel p-6 md:p-8 rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/30 via-[#0d1424] to-indigo-950/30 overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2.5 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 font-mono text-xs font-bold border border-cyan-500/40">
                  第二学期 · 第一单元
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-mono text-xs font-semibold border border-indigo-500/30">
                  V12 · 第 13 课
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-mono text-xs font-semibold">
                  Pi Minimal Coding Harness
                </span>
              </div>

              <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
                <Zap className="w-7 h-7 text-cyan-400" />
                <span>为什么 Agent Loop 之外还需要一大坨 Runtime？</span>
              </h1>

              <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                彻底告别“单体 while 循环”的玩具模型。面对
                <strong className="text-cyan-300"> 用户中途插话、Ctrl+C 级联取消、工具耗时假死与并发竞态</strong>
                ，将系统重构拆解为
                <strong className="text-white"> AgentCore / Runtime / Session / ToolExecutor / EventStream </strong>
                五大独立齿轮。
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <Link
                to="/docs/lessons/13-agent-loop-vs-runtime.md"
                className="px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center justify-center gap-2 transition"
              >
                <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                <span>打开原理解析讲义</span>
              </Link>

              <button
                onClick={() => handleRunChaos("hard_abort")}
                className="px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-medium flex items-center justify-center gap-2 transition"
              >
                <Bug className="w-3.5 h-3.5" />
                <span>一键注入 Abort 故障</span>
              </button>
            </div>
          </div>

          {/* Quick Stats Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 mt-5 border-t border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-mono text-slate-400 uppercase">核心认知</div>
                <div className="text-xs font-bold text-slate-200">Loop 只是颗齿轮</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <Split className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-mono text-slate-400 uppercase">Session 结构</div>
                <div className="text-xs font-bold text-slate-200">树状快照 ≠ 数组</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-mono text-slate-400 uppercase">Abort 级联回收</div>
                <div className="text-xs font-bold text-amber-300">&lt; 50ms 零僵尸</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-mono text-slate-400 uppercase">Core 纯度契约</div>
                <div className="text-xs font-bold text-emerald-300">零直接系统 I/O</div>
              </div>
            </div>
          </div>
        </div>

        {/* Global Status Message */}
        {statusMessage && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center justify-between border transition ${
              statusMessage.type === "success"
                ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                : statusMessage.type === "warning"
                ? "bg-amber-950/40 border-amber-500/40 text-amber-300"
                : statusMessage.type === "error"
                ? "bg-rose-950/40 border-rose-500/40 text-rose-300"
                : "bg-cyan-950/40 border-cyan-500/40 text-cyan-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-white text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Navigation Tabs Bar */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("chaos")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
              activeTab === "chaos"
                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Bug className="w-4 h-4 text-rose-400" />
            <span>💥 破坏实验室 (亲眼看 Loop 崩)</span>
          </button>

          <button
            onClick={() => setActiveTab("studio")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
              activeTab === "studio"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>⚙️ 5 大核心齿轮透视台</span>
          </button>

          <button
            onClick={() => setActiveTab("terminal")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
              activeTab === "terminal"
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Terminal className="w-4 h-4 text-indigo-400" />
            <span>💻 交互式 Runtime 终端</span>
          </button>

          <button
            onClick={() => setActiveTab("theory")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
              activeTab === "theory"
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <BookOpen className="w-4 h-4 text-purple-400" />
            <span>📖 原理演进与 Pi 对照</span>
          </button>

          <button
            onClick={() => setActiveTab("verify")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
              activeTab === "verify"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>✅ 自动化验收打卡</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: 故障破坏实验室 (Chaos Lab)                                           */}
        {/* ========================================================================= */}
        {activeTab === "chaos" && (
          <div className="space-y-6">
            {/* Scenario Selector Strip */}
            <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-3 bg-[#0a0e1a]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <Bug className="w-4 h-4 text-rose-400" />
                  <span>选择故障注入场景进行破坏演习：</span>
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  点击按钮实时推演双轨崩溃与容错日志
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  {
                    id: "mid_flight_input" as ChaosScenarioType,
                    title: "1. 中途突发插话",
                    desc: "用户在第2步突然敲入'别改A改B'，裸循环抛400报错崩溃",
                    icon: Inbox,
                    color: "border-amber-500/40 hover:bg-amber-950/20",
                  },
                  {
                    id: "hard_abort" as ChaosScenarioType,
                    title: "2. Ctrl+C 级联取消",
                    desc: "测试中途按中止，裸循环泄漏3个僵尸进程锁死文件",
                    icon: AlertOctagon,
                    color: "border-rose-500/40 hover:bg-rose-950/20",
                  },
                  {
                    id: "zombie_tool" as ChaosScenarioType,
                    title: "3. 耗时工具假死",
                    desc: "搜索跑15秒无任何输出流，前端超时连接断开",
                    icon: Clock,
                    color: "border-purple-500/40 hover:bg-purple-950/20",
                  },
                  {
                    id: "event_race" as ChaosScenarioType,
                    title: "4. 并发事件冲刷",
                    desc: "100ms内UI/日志/遥测/输入齐发，数组发生脏读破坏",
                    icon: Activity,
                    color: "border-cyan-500/40 hover:bg-cyan-950/20",
                  },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleRunChaos(s.id)}
                    disabled={isLoading}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                      s.color
                    } ${
                      selectedScenario === s.id
                        ? "bg-slate-800/80 ring-2 ring-cyan-400"
                        : "bg-[#0f1424]/60"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <s.icon className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-bold text-white">{s.title}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-tight">{s.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Dual Terminal Mirror Comparison */}
            {chaosResult && (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                      <span>{chaosResult.title}</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {chaosResult.description}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Rail: Naive Loop (Crash Rail) */}
                  <div className="glass-panel rounded-2xl border border-rose-500/50 bg-[#12080c] overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="p-3 bg-rose-950/60 border-b border-rose-500/40 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-rose-400" />
                        <span className="text-xs font-bold text-rose-200">
                          左轨：裸 Agent Loop（崩溃轨）
                        </span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/30 text-rose-300 font-bold">
                        {chaosResult.naiveLoop.errorSummary}
                      </span>
                    </div>

                    {/* Metric Badges */}
                    <div className="p-3 bg-black/40 border-b border-rose-900/40 flex items-center justify-around text-center text-xs font-mono">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">崩溃状态</div>
                        <div className="font-bold text-rose-400">
                          {chaosResult.naiveLoop.crashed ? "💥 CRASHED" : "⚠️ UNRESPONSIVE"}
                        </div>
                      </div>
                      <div className="border-l border-slate-800 h-6" />
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">残留孤儿僵尸</div>
                        <div className="font-bold text-rose-300">
                          {chaosResult.naiveLoop.orphanProcesses} 个脱逸进程
                        </div>
                      </div>
                      <div className="border-l border-slate-800 h-6" />
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">状态完整度</div>
                        <div className="font-bold text-rose-400">
                          {chaosResult.naiveLoop.statePreserved ? "完整" : "❌ 丢失破坏"}
                        </div>
                      </div>
                    </div>

                    {/* Console Output */}
                    <div className="p-4 font-mono text-[11px] space-y-2 flex-1 min-h-[280px] max-h-[360px] overflow-y-auto bg-black/70">
                      {chaosResult.naiveLoop.telemetryLogs.map(
                        (item: { time: number; log: string; level: "info" | "warn" | "error" }, idx: number) => (
                          <div
                          key={idx}
                          className={`flex items-start gap-2 leading-relaxed ${
                            item.level === "error"
                              ? "text-rose-400 font-bold bg-rose-950/30 p-1 rounded"
                              : item.level === "warn"
                              ? "text-amber-300"
                              : "text-slate-400"
                          }`}
                        >
                          <span className="text-slate-600 select-none text-[10px] w-12 shrink-0">
                            +{item.time}ms
                          </span>
                          <span>{item.log}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right Rail: Decoupled Runtime (Resilient Rail) */}
                  <div className="glass-panel rounded-2xl border border-cyan-500/50 bg-[#07131a] overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="p-3 bg-cyan-950/60 border-b border-cyan-500/40 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-bold text-cyan-200">
                          右轨：分层 Agent Runtime（韧性轨）
                        </span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/30 text-cyan-300 font-bold">
                        GRACEFUL DRAIN & RECOVER
                      </span>
                    </div>

                    {/* Metric Badges */}
                    <div className="p-3 bg-black/40 border-b border-cyan-900/40 flex items-center justify-around text-center text-xs font-mono">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">回收耗时</div>
                        <div className="font-bold text-cyan-300">
                          {chaosResult.decoupledRuntime.signalCascadeTimeMs}ms 级联
                        </div>
                      </div>
                      <div className="border-l border-slate-800 h-6" />
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">僵尸进程</div>
                        <div className="font-bold text-emerald-400">0 逃逸 (安全)</div>
                      </div>
                      <div className="border-l border-slate-800 h-6" />
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">状态保存</div>
                        <div className="font-bold text-emerald-400">✅ Checkpoint 无损</div>
                      </div>
                    </div>

                    {/* Console Output */}
                    <div className="p-4 font-mono text-[11px] space-y-2 flex-1 min-h-[280px] max-h-[360px] overflow-y-auto bg-black/70">
                      {chaosResult.decoupledRuntime.telemetryLogs.map(
                        (item: { time: number; log: string; level: "info" | "warn" | "success" }, idx: number) => (
                          <div
                          key={idx}
                          className={`flex items-start gap-2 leading-relaxed ${
                            item.level === "success"
                              ? "text-emerald-300 font-bold bg-emerald-950/30 p-1 rounded"
                              : item.level === "warn"
                              ? "text-amber-300"
                              : "text-cyan-200"
                          }`}
                        >
                          <span className="text-slate-600 select-none text-[10px] w-12 shrink-0">
                            +{item.time}ms
                          </span>
                          <span>{item.log}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: 5 大核心齿轮解耦透视台 (Runtime Studio)                               */}
        {/* ========================================================================= */}
        {activeTab === "studio" && (
          <div className="space-y-6">
            {/* Interactive Gear Map */}
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 bg-[#090e1c] space-y-6">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-cyan-400" />
                  <span>Agent Runtime 5 大核心齿轮解耦架构图</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  点击下方任意齿轮组件，查看它的职责边界、核心接口契约与隔离实现：
                </p>
              </div>

              {/* 5 Gears Grid */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {[
                  {
                    id: "runtime" as const,
                    tag: "01. 控制器",
                    title: "AgentRuntime",
                    sub: "生命周期与调度中心",
                    icon: Cpu,
                    badge: "Supervisor",
                    color: "border-cyan-500/50 bg-cyan-950/30 text-cyan-300",
                  },
                  {
                    id: "core" as const,
                    tag: "02. 决策核",
                    title: "AgentCore",
                    sub: "纯状态机与单步推导",
                    icon: Zap,
                    badge: "Pure / No I/O",
                    color: "border-indigo-500/50 bg-indigo-950/30 text-indigo-300",
                  },
                  {
                    id: "session" as const,
                    tag: "03. 会话树",
                    title: "SessionManager",
                    sub: "Checkpoints 与分叉",
                    icon: Split,
                    badge: "Tree Snapshot",
                    color: "border-purple-500/50 bg-purple-950/30 text-purple-300",
                  },
                  {
                    id: "executor" as const,
                    tag: "04. 外设箱",
                    title: "ToolExecutor",
                    sub: "子进程与流式 chunks",
                    icon: Wrench,
                    badge: "Process Guard",
                    color: "border-amber-500/50 bg-amber-950/30 text-amber-300",
                  },
                  {
                    id: "events" as const,
                    tag: "05. 事件线",
                    title: "EventStream",
                    sub: "Pub/Sub 广播总线",
                    icon: Activity,
                    badge: "Decoupled Bus",
                    color: "border-emerald-500/50 bg-emerald-950/30 text-emerald-300",
                  },
                ].map((gear) => (
                  <button
                    key={gear.id}
                    onClick={() => setSelectedGear(gear.id)}
                    className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between ${
                      gear.color
                    } ${
                      selectedGear === gear.id
                        ? "ring-2 ring-white scale-[1.02] shadow-xl"
                        : "opacity-75 hover:opacity-100"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono font-bold text-slate-400">
                          {gear.tag}
                        </span>
                        <gear.icon className="w-4 h-4" />
                      </div>
                      <div className="font-bold text-sm text-white">{gear.title}</div>
                      <div className="text-[11px] text-slate-400 mt-1">{gear.sub}</div>
                    </div>
                    <span className="mt-3 inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 text-slate-300 border border-slate-700/50 w-fit">
                      {gear.badge}
                    </span>
                  </button>
                ))}
              </div>

              {/* Selected Gear Deep Dive Detail */}
              <div className="p-6 rounded-2xl bg-[#060a14] border border-slate-800 space-y-4">
                {selectedGear === "runtime" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <h4 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
                          <Cpu className="w-4 h-4" />
                          <span>AgentRuntime: 全局生命周期与调度监督器 (Supervisor)</span>
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          负责外部世界的缓冲协调：持有全局 AbortController，维护 InboundQueue 消息队列，调度 Core 与 ToolExecutor 推进状态机。
                        </p>
                      </div>
                      <span className="text-xs font-mono px-2.5 py-1 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        核心调度职责
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                      <div className="p-3 bg-black/50 rounded-xl border border-slate-800/80 space-y-1">
                        <div className="text-cyan-400 font-bold mb-1">关键状态机转换</div>
                        <div>IDLE → RUNNING (初始化 Session 与 Run)</div>
                        <div>RUNNING → WAITING_TOOL (Core 返回 call_tools)</div>
                        <div>WAITING_TOOL → RUNNING (工具执行完毕回填快照)</div>
                        <div>RUNNING → DRAINING (原子步安全消费 Inbound 插话)</div>
                        <div>ANY → ABORTED (收到取消信号级联回收)</div>
                      </div>
                      <div className="p-3 bg-black/50 rounded-xl border border-slate-800/80 space-y-1">
                        <div className="text-cyan-400 font-bold mb-1">接口职责清单</div>
                        <div>start(prompt, options): 开启 SessionRun</div>
                        <div>interrupt(message, priority): 中途插话入队</div>
                        <div>abort(reason): 广播 AbortSignal</div>
                        <div>suspend(): 创建可恢复冻结快照</div>
                        <div>resume(snapshotId): 从历史断点续跑</div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedGear === "core" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <h4 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                          <Zap className="w-4 h-4" />
                          <span>PureAgentCore: 纯决策状态机 (Pure Decision Gear)</span>
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          纯度高达 100% 的决策齿轮。只接受 (SessionSnapshot, AbortSignal)，只返回 StepDecision，绝不直接执行文件修改或进程启动！
                        </p>
                      </div>
                      <span className="text-xs font-mono px-2.5 py-1 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        零直接 I/O 依赖
                      </span>
                    </div>

                    <div className="p-3 bg-black/50 rounded-xl border border-slate-800/80 text-xs font-mono space-y-1">
                      <div className="text-indigo-400 font-bold">TypeScript 接口契约：</div>
                      <pre className="text-slate-300 overflow-x-auto">
{`export interface AgentCore {
  step(snapshot: SessionSnapshot, signal: AbortSignal): Promise<StepDecision>;
}

export type StepDecision =
  | { type: "call_tools"; thought: string; toolCalls: ToolCallItem[] }
  | { type: "finish"; thought: string; finalAnswer: string }
  | { type: "ask_user"; thought: string; question: string };`}
                      </pre>
                    </div>
                  </div>
                )}

                {selectedGear === "session" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <h4 className="text-sm font-bold text-purple-300 flex items-center gap-2">
                          <Split className="w-4 h-4" />
                          <span>SessionManager: 树状会话与持久化快照 (Session Tree)</span>
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          彻底击碎“Session = Message[]”的错误认知。真实 Coding Agent 的 Session 包含历史分支、工作空间文件哈希、工具执行记录与可恢复 Checkpoint。
                        </p>
                      </div>
                      <span className="text-xs font-mono px-2.5 py-1 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        树状状态树
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                      <div className="p-3 bg-black/50 rounded-xl border border-slate-800/80 space-y-1">
                        <div className="text-purple-400 font-bold mb-1">SessionRun 包含要素</div>
                        <div>• runId / parentRunId / branchId</div>
                        <div>• status: idle | running | suspended...</div>
                        <div>• messages: ChatMessage[]</div>
                        <div>• workspaceState: Record&lt;string, string&gt;</div>
                        <div>• checkpoints: SessionSnapshot[]</div>
                      </div>
                      <div className="p-3 bg-black/50 rounded-xl border border-slate-800/80 space-y-1">
                        <div className="text-purple-400 font-bold mb-1">Pi 风格分支能力</div>
                        <div>• saveSnapshot(runId, step): 冻结原子步</div>
                        <div>• restoreSnapshot(snapshotId): 断点恢复</div>
                        <div>• createBranch(fromSnapshot, newBranch): 任意历史分叉</div>
                        <div>• 保证父分支历史不可被子分支修改污染</div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedGear === "executor" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <h4 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                          <Wrench className="w-4 h-4" />
                          <span>SafeToolExecutor: 受控外设与进程沙箱 (Subprocess Guard)</span>
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          将工具调用从普通函数封装为安全进程管道：绑定 Local AbortController，实时吐出 stdout/stderr 流式 Chunk，在中断时主动下发 SIGKILL 杜绝孤儿僵尸。
                        </p>
                      </div>
                      <span className="text-xs font-mono px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        进程与流式守卫
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                      <div className="p-3 bg-black/50 rounded-xl border border-slate-800/80 space-y-1">
                        <div className="text-amber-400 font-bold mb-1">进程防逃逸机制</div>
                        <div>• Map&lt;toolCallId, ActiveOperation&gt; 注册表</div>
                        <div>• signal.addEventListener('abort', killAllActive)</div>
                        <div>• 毫秒级级联 kill，返回 [Aborted] 规范结果</div>
                        <div>• 杜绝后台 runaway 编译消耗 CPU</div>
                      </div>
                      <div className="p-3 bg-black/50 rounded-xl border border-slate-800/80 space-y-1">
                        <div className="text-amber-400 font-bold mb-1">流式输出上报</div>
                        <div>• onStreamChunk: ({'{'}streamType, text{'}'}) =&gt; void</div>
                        <div>• 实时向 EventStream 注入 tool:chunk</div>
                        <div>• 前端控制台无缝呈现打字机与构建日志</div>
                        <div>• 彻底消除长任务假死盲等感知</div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedGear === "events" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <h4 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                          <Activity className="w-4 h-4" />
                          <span>EventStream: 单向类型化事件总线 (Pub/Sub Event Bus)</span>
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          解耦 UI、Tracer、Logger、Telemetry 与 Persistence 的核心秘密。所有外部观察者仅订阅标准 AgentEvent 流，绝不允许向内部执行数组直接写入。
                        </p>
                      </div>
                      <span className="text-xs font-mono px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        单向数据流
                      </span>
                    </div>

                    <div className="p-3 bg-black/50 rounded-xl border border-slate-800/80 text-xs font-mono space-y-1">
                      <div className="text-emerald-400 font-bold">标准 AgentEventType 清单：</div>
                      <div className="text-slate-300">
                        run:start | step:start | llm:thought | tool:start | tool:chunk | tool:end | user:interrupt | runtime:state_change | runtime:abort | runtime:suspend | run:finish | error
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: 交互式 Runtime 终端 (Interactive Console)                           */}
        {/* ========================================================================= */}
        {activeTab === "terminal" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Command & Interruption Control */}
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4 bg-[#0a0e1a]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    <span>Runtime 调度控制器</span>
                  </span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-bold border ${
                      runtimeState === "running"
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30 animate-pulse"
                        : runtimeState === "aborted"
                        ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                        : runtimeState === "suspended"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                        : runtimeState === "completed"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                        : "bg-slate-800 text-slate-400 border-slate-700"
                    }`}
                  >
                    STATE: {runtimeState}
                  </span>
                </div>

                {/* Prompt input */}
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-medium">任务 Prompt 目标：</label>
                  <textarea
                    value={taskPrompt}
                    onChange={(e) => setTaskPrompt(e.target.value)}
                    disabled={runtimeState === "running"}
                    rows={3}
                    className="w-full bg-[#060a14] border border-slate-700 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono resize-none"
                  />
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-2">
                  {runtimeState === "running" ? (
                    <div className="space-y-2">
                      <button
                        onClick={() => setInterruptModalOpen(true)}
                        className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-600/20 transition animate-bounce"
                      >
                        <Inbox className="w-3.5 h-3.5" />
                        <span>中途插入新需求 (Interrupt)</span>
                      </button>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={handleSuspend}
                          className="py-2 px-3 rounded-xl bg-amber-950/40 hover:bg-amber-900/60 text-amber-200 border border-amber-600/40 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                        >
                          <Pause className="w-3.5 h-3.5 text-amber-400" />
                          <span>暂停快照</span>
                        </button>
                        <button
                          onClick={handleAbort}
                          className="py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>强行终止</span>
                        </button>
                      </div>
                    </div>
                  ) : runtimeState === "suspended" ? (
                    <div className="space-y-2">
                      <button
                        onClick={handleResume}
                        disabled={isLoading}
                        className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 border border-emerald-400/30 transition animate-pulse"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>
                          ▶️ 点击恢复执行 (从快照 {suspendedSnapshot?.snapshotId ? suspendedSnapshot.snapshotId.slice(0, 12) + "..." : ""} 续跑)
                        </span>
                      </button>
                      <button
                        onClick={handleStartInteractive}
                        disabled={isLoading}
                        className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center justify-center gap-1.5 border border-slate-700 transition"
                      >
                        <Play className="w-3 h-3 text-slate-400" />
                        <span>放弃快照并重新开始</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleStartInteractive}
                      disabled={isLoading}
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>启动 AgentRuntime 执行</span>
                    </button>
                  )}
                </div>

                {/* Session metadata info */}
                {currentRun && (
                  <div className="pt-3 border-t border-slate-800/80 space-y-1 text-[11px] font-mono text-slate-400">
                    <div className="flex justify-between">
                      <span>RUN ID:</span>
                      <span className="text-slate-200 font-bold">{currentRun.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>BRANCH:</span>
                      <span className="text-cyan-400">{currentRun.branchId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>STEPS COMPLETED:</span>
                      <span className="text-indigo-400">{currentRun.currentStep}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Terminal Stream Log */}
              <div className="lg:col-span-2 glass-panel rounded-2xl border border-slate-800 bg-[#060913] flex flex-col overflow-hidden shadow-2xl">
                <div className="p-3 bg-[#0c1222] border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                    </div>
                    <span className="text-xs font-mono text-slate-300 ml-2">
                      pi-terminal-session ~ runtime-stream
                    </span>
                  </div>

                  <span className="text-[10px] font-mono text-slate-500">
                    {terminalEvents.length} Events captured
                  </span>
                </div>

                <div className="p-4 font-mono text-[11px] space-y-2 flex-1 min-h-[380px] max-h-[500px] overflow-y-auto bg-black/80">
                  {terminalEvents.length === 0 ? (
                    <div className="text-slate-500 flex flex-col items-center justify-center h-full py-16 space-y-2">
                      <Terminal className="w-8 h-8 text-slate-700" />
                      <span>就绪。点击左侧“启动 AgentRuntime 执行”下发指令。</span>
                    </div>
                  ) : (
                    terminalEvents.map((evt, idx) => {
                      let badge = "EVENT";
                      let color = "text-slate-400";
                      let content = JSON.stringify(evt);

                      if (evt.type === "run:start") {
                        badge = "START";
                        color = "text-cyan-300 font-bold";
                        content = `会话启动: ${evt.inputPrompt} (branch: ${evt.branchId})`;
                      } else if (evt.type === "step:start") {
                        badge = `STEP ${evt.stepNumber}`;
                        color = "text-indigo-400 font-bold";
                        content = `---------- 第 ${evt.stepNumber} 步决策开始 ----------`;
                      } else if (evt.type === "llm:thought") {
                        badge = "THOUGHT";
                        color = "text-slate-200";
                        content = evt.thought || "[Thinking...]";
                      } else if (evt.type === "tool:start") {
                        badge = "TOOL_START";
                        color = "text-amber-300 font-bold";
                        content = `执行工具: ${evt.toolName}(${evt.inputArgs})`;
                      } else if (evt.type === "tool:chunk") {
                        badge = "STREAM";
                        color = "text-emerald-400";
                        content = evt.chunk;
                      } else if (evt.type === "tool:end") {
                        badge = "TOOL_END";
                        color = evt.isError ? "text-rose-400" : "text-emerald-300";
                        content = `工具 ${evt.toolName} 完成 (${evt.durationMs}ms): ${evt.output?.slice(0, 120)}...`;
                      } else if (evt.type === "user:interrupt") {
                        badge = "INTERRUPT";
                        color = "text-amber-400 font-bold bg-amber-950/40 p-1 rounded";
                        content = `用户插话注入: "${evt.message}"`;
                      } else if (evt.type === "runtime:abort") {
                        badge = "ABORT";
                        color = "text-rose-400 font-bold bg-rose-950/40 p-1 rounded";
                        content = `运行时中止: ${evt.reason} (级联杀死 ${evt.cascadeKilledTools} 个子进程)`;
                      } else if (evt.type === "runtime:state_change") {
                        badge = "STATE";
                        color = "text-cyan-400";
                        content = `状态迁移: ${evt.fromState} -> ${evt.toState} (${evt.reason || "auto"})`;
                      } else if (evt.type === "run:finish") {
                        badge = "FINISH";
                        color = "text-emerald-400 font-bold bg-emerald-950/30 p-1.5 rounded";
                        content = `任务收敛完成! 最终回复:\n${evt.finalAnswer}`;
                      }

                      return (
                        <div key={idx} className={`leading-relaxed ${color}`}>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 mr-2 border border-slate-700">
                            {badge}
                          </span>
                          <span className="whitespace-pre-wrap">{content}</span>
                        </div>
                      );
                    })
                  )}
                  <div ref={terminalEndRef} />
                </div>
              </div>
            </div>

            {/* Mid-flight Interruption Modal */}
            {interruptModalOpen && (
              <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="glass-panel w-full max-w-md p-6 rounded-2xl border border-amber-500/50 shadow-2xl bg-[#0f1424] space-y-4">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                    <Inbox className="w-4 h-4" />
                    <span>中途插入新需求 (Inbound Queue Injection)</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    在 Agent 执行中途注入提示词。Runtime 将在当前原子步执行结束后安全消费此消息，不会破坏上下文契约：
                  </p>
                  <textarea
                    value={interruptText}
                    onChange={(e) => setInterruptText(e.target.value)}
                    rows={3}
                    className="w-full bg-black/50 border border-amber-500/40 rounded-xl p-3 text-xs text-slate-200 focus:outline-none font-mono"
                    placeholder="例如：请停止修改 auth.ts，改为检查 session.ts..."
                  />
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      onClick={() => setInterruptModalOpen(false)}
                      className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSendInterrupt}
                      className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition shadow-lg shadow-amber-600/30"
                    >
                      安全入队发送
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: 原理演进与 Pi 对照 (Theory & Pi Mapping)                             */}
        {/* ========================================================================= */}
        {activeTab === "theory" && (
          <div className="space-y-6">
            {/* Core vs Runtime Boundary Matrix */}
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 bg-[#090d18] space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-purple-400" />
                  <span>Agent Loop 与 Agent Runtime 的绝对职责红黑榜</span>
                </h3>
                <span className="text-xs font-mono text-purple-300">架构分水岭</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-[11px] font-mono text-slate-400 border-b border-slate-800 uppercase bg-slate-900/50">
                    <tr>
                      <th className="py-2.5 px-4">系统能力</th>
                      <th className="py-2.5 px-4 text-indigo-400">应当属于 Agent Core？</th>
                      <th className="py-2.5 px-4 text-cyan-400">应当属于 Agent Runtime？</th>
                      <th className="py-2.5 px-4">工程设计原因与架构权衡</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                    <tr>
                      <td className="py-2.5 px-4 font-bold text-white">单步 Thought 与 Tool 决策</td>
                      <td className="py-2.5 px-4 text-emerald-400">✅ 核心职责</td>
                      <td className="py-2.5 px-4 text-slate-500">❌ 不负责</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">
                        这是纯状态推导，只需根据当前快照计算下一行动，与运行环境无关。
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-bold text-white">AbortSignal 级联与进程回收</td>
                      <td className="py-2.5 px-4 text-rose-400">❌ 严禁放入 Core</td>
                      <td className="py-2.5 px-4 text-emerald-400">✅ 必须由 Runtime 负责</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">
                        涉及 OS 级子进程 SIGTERM/SIGKILL 与文件锁，Core 应保持无系统副作用。
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-bold text-white">用户中途插话 (Mid-flight Input)</td>
                      <td className="py-2.5 px-4 text-rose-400">❌ 无法感知</td>
                      <td className="py-2.5 px-4 text-emerald-400">✅ InboundQueue 调度</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">
                        LLM 请求是阻塞式的，必须由 Runtime 暂存并在安全原子步边界注入。
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-bold text-white">Session 树与分支回退 (Branch)</td>
                      <td className="py-2.5 px-4 text-rose-400">❌ 只见当前上下文</td>
                      <td className="py-2.5 px-4 text-emerald-400">✅ SessionManager 维护</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">
                        Core 只消费 Snapshot；多分支树状管理属于 Runtime 持久化层。
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-bold text-white">UI 状态刷新与流式 Chunk 派发</td>
                      <td className="py-2.5 px-4 text-rose-400">❌ 耦合将导致腐化</td>
                      <td className="py-2.5 px-4 text-emerald-400">✅ EventStream 单向广播</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">
                        保证 UI 挂掉或 Telemetry 抖动不会把 Agent 执行核心打崩。
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pi mono mapping */}
            <div className="glass-panel p-6 rounded-3xl border border-cyan-500/30 bg-[#06101c] space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">
                    对标 Pi (wayfind/pi-mono) 极简 Coding Agent 架构
                  </h4>
                  <p className="text-xs text-slate-400">
                    Pi 在 packages/coding-agent 中的设计完全印证了本课的 5 齿轮解耦哲学：
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                <div className="p-4 rounded-xl bg-black/40 border border-slate-800 space-y-1.5">
                  <div className="text-cyan-400 font-bold">1. Session Tree & Branching</div>
                  <p className="text-slate-300 font-sans text-[11px] leading-relaxed">
                    Pi 将会话保存为包含分叉父指针的 SessionSnapshot 链。当任务在第 4 步走错时，开发者可以随时分支试错，旧记录完整保留。
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-black/40 border border-slate-800 space-y-1.5">
                  <div className="text-cyan-400 font-bold">2. Event-Driven RPC</div>
                  <p className="text-slate-300 font-sans text-[11px] leading-relaxed">
                    Pi 将核心循环置于后台，通过严格的 typed event stream 向终端 UI 或嵌入式 SDK 吐出实时 chunk 与状态流，实现前后端绝对解耦。
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-black/40 border border-slate-800 space-y-1.5">
                  <div className="text-cyan-400 font-bold">3. Zero-Fork Extensions</div>
                  <p className="text-slate-300 font-sans text-[11px] leading-relaxed">
                    企业级定制能力绝不通过修改 AgentCore 源码实现，而是挂载在 Runtime 的 ToolExecutor 与 Hook 机制上，保持内核永远轻量。
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: 自动化验收打卡 (Verification & Checklist)                           */}
        {/* ========================================================================= */}
        {activeTab === "verify" && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 bg-[#090d18] space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span>第 13 课: 核心解耦能力自动化验收套件</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    点击下方按钮，由测试套件对 Runtime 进程级回收、Inbound 调度队列、Core 纯度与 Session 树进行真实验收：
                  </p>
                </div>

                <button
                  onClick={handleRunVerification}
                  disabled={isVerifying}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? "animate-spin" : ""}`} />
                  <span>一键运行自动化验收测试</span>
                </button>
              </div>

              {verificationTests.length === 0 ? (
                <div className="p-12 text-center text-slate-500 space-y-2">
                  <ShieldCheck className="w-10 h-10 mx-auto text-slate-700" />
                  <div className="text-xs font-mono">尚未执行测试，点击右上角开始全自动打卡验收。</div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {verificationTests.map((t) => (
                    <div
                      key={t.id}
                      className={`p-4 rounded-2xl border transition ${
                        t.passed
                          ? "bg-emerald-950/20 border-emerald-500/40"
                          : "bg-rose-950/20 border-rose-500/40"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {t.passed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-400" />
                          )}
                          <span className="text-xs font-bold text-white">{t.name}</span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 text-slate-300">
                          {t.durationMs}ms
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed font-sans">{t.details}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

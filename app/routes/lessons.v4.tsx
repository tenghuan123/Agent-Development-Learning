import { useState, useEffect, useRef } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import type {
  Plan,
  PlanningAgentResult,
  PlanningStreamEvent,
  RoutingDecision,
  WorkflowMode,
} from "~/core/planner/types";
import {
  PLANNING_BENCHMARKS,
  type PlanningBenchmarkPreset,
} from "~/core/experiments/planning-benchmarks";
import {
  Compass,
  CheckCircle2,
  ListTodo,
  Play,
  RotateCcw,
  ArrowLeft,
  ChevronRight,
  Terminal,
  Flame,
  Sliders,
  GitBranch,
  XCircle,
  Clock,
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

export default function Lesson05PlanningWorkbench() {
  const { hasServerKey, model, defaultBaseURL } =
    useLoaderData<typeof loader>();

  const [customApiKey, setCustomApiKey] = useState("");
  const [customBaseURL, setCustomBaseURL] = useState(defaultBaseURL);

  useEffect(() => {
    const savedKey = localStorage.getItem("MINI_CLAUDE_API_KEY");
    if (savedKey) {
      setCustomApiKey(savedKey);
    }
    const savedURL = localStorage.getItem("MINI_CLAUDE_BASE_URL");
    if (savedURL) {
      setCustomBaseURL(savedURL);
    }
  }, []);

  const saveLocalKey = (key: string) => {
    setCustomApiKey(key);
    localStorage.setItem("MINI_CLAUDE_API_KEY", key);
  };

  const saveLocalBaseURL = (url: string) => {
    setCustomBaseURL(url);
    localStorage.setItem("MINI_CLAUDE_BASE_URL", url);
  };

  const handleSaveSettings = ({
    apiKey,
    baseURL,
  }: {
    apiKey: string;
    baseURL: string;
  }) => {
    setCustomApiKey(apiKey);
    setCustomBaseURL(baseURL);
    localStorage.setItem("MINI_CLAUDE_API_KEY", apiKey);
    localStorage.setItem("MINI_CLAUDE_BASE_URL", baseURL);
  };

  // Benchmark preset selection
  const [selectedPreset, setSelectedPreset] = useState<PlanningBenchmarkPreset>(
    PLANNING_BENCHMARKS[0]
  );
  const [customPrompt, setCustomPrompt] = useState(selectedPreset.prompt);
  const [forcedMode, setForcedMode] = useState<WorkflowMode | "auto">("auto");
  const [maxSteps, setMaxSteps] = useState(35);

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [routingDecision, setRoutingDecision] =
    useState<RoutingDecision | null>(null);
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [events, setEvents] = useState<PlanningStreamEvent[]>([]);
  const [, setCurrentStep] = useState<number>(0);
  const [agentResult, setAgentResult] = useState<PlanningAgentResult | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<"kanban" | "stream" | "anchor">(
    "kanban"
  );

  const streamEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCustomPrompt(selectedPreset.prompt);
    setForcedMode(selectedPreset.recommendedMode);
  }, [selectedPreset]);

  useEffect(() => {
    if (streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [events]);

  const handleRun = async () => {
    if (isRunning) return;

    setIsRunning(true);
    setRoutingDecision(null);
    setCurrentPlan(null);
    setEvents([]);
    setCurrentStep(0);
    setAgentResult(null);

    try {
      const response = await fetch("/api/planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: customPrompt,
          model,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          maxSteps,
          forcedMode,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("ReadableStream not supported in response");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const jsonStr = trimmed.slice(6);
            try {
              const event: PlanningStreamEvent = JSON.parse(jsonStr);
              setEvents((prev) => [...prev, event]);

              if (event.type === "workflow_routed") {
                setRoutingDecision(event.decision);
              } else if (
                event.type === "plan_created" ||
                event.type === "task_started" ||
                event.type === "task_completed" ||
                event.type === "plan_replanned"
              ) {
                setCurrentPlan(event.plan);
              } else if (event.type === "step_start") {
                setCurrentStep(event.step);
              } else if (event.type === "step_end" && event.planSnapshot) {
                setCurrentPlan(event.planSnapshot);
              } else if (event.type === "agent_done") {
                setAgentResult(event.result);
                if (event.result.plan) {
                  setCurrentPlan(event.result.plan);
                }
              }
            } catch (err) {
              console.error("SSE parse error:", err, jsonStr);
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Planning execution error:", err);
      setEvents((prev) => [
        ...prev,
        {
          type: "error",
          message: err.message || "Network or execution error occurred",
        },
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  const calculateProgress = (plan: Plan | null) => {
    if (!plan || plan.tasks.length === 0) return 0;
    const completed = plan.tasks.filter(
      (t) => t.status === "completed" || t.status === "skipped"
    ).length;
    return Math.round((completed / plan.tasks.length) * 100);
  };

  const progressPercentage = calculateProgress(currentPlan);

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 font-sans selection:bg-purple-500/30 flex flex-col">
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
          id: "v4",
          title: "第 05 课: Planning 与复杂任务规划",
          badge: "V4",
        }}
      />

      {/* Breadcrumbs / Sub Header */}
      <div className="border-b border-slate-800/80 bg-[#0c101d]/70 backdrop-blur px-6 py-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-slate-400 font-mono">
          <Link
            to="/"
            className="hover:text-purple-400 transition flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>首页</span>
          </Link>
          <span>/</span>
          <span className="text-purple-300 font-semibold">
            第 05 课：Planning 与复杂任务工作流路由 (V4)
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/lessons/v3-coding-agent"
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1"
          >
            <ChevronRight className="w-3 h-3 rotate-180" />
            <span>上一课 (V3 Coding Agent)</span>
          </Link>
          <div className="h-3 w-px bg-slate-800" />
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="text-slate-400 hover:text-slate-200 transition"
          >
            讲义文档 ↗
          </a>
        </div>
      </div>

      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full space-y-8">
        {/* Hero Banner */}
        <div className="glass-panel p-6 md:p-8 rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-950/30 via-[#0d1222] to-indigo-950/20 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative space-y-3 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-mono">
              <Compass className="w-3.5 h-3.5" />
              <span>V4 Milestone: Task Decomposition & Attention Anchors</span>
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              第 05 课：Planning 与复杂任务规划
            </h1>

            <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
              破除纯 ReAct 面对多步骤长流程任务时的
              <strong className="text-amber-300">“短视贪心与目标漂移”</strong>
              。通过
              <strong className="text-purple-300"> 确定性有限状态机（FSM）</strong>、
              <strong className="text-purple-300"> Attention Anchor 上下文进度锚点</strong> 与
              <strong className="text-cyan-300"> 动态重规划（Dynamic Re-planning）</strong>
              ，让 Agent 有条不紊攻克复杂开发工程。
            </p>
          </div>
        </div>

        {/* Main Grid: Workbench */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Preset & Control (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Presets Card */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <ListTodo className="w-4 h-4 text-purple-400" />
                  <span>复杂工程任务预设 (Benchmarks)</span>
                </h3>
                <span className="text-[11px] font-mono text-slate-400">
                  4 组经典评测场景
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {PLANNING_BENCHMARKS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setSelectedPreset(preset)}
                    className={`p-3.5 rounded-xl text-left border transition relative flex flex-col gap-1.5 ${
                      selectedPreset.id === preset.id
                        ? "bg-purple-950/30 border-purple-500/60 shadow-lg shadow-purple-500/5"
                        : "bg-[#0c101d] border-slate-800/80 hover:border-slate-700 hover:bg-[#111728]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white">
                        {preset.title}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                            preset.difficulty === "Easy"
                              ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                              : preset.difficulty === "Medium"
                              ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                              : "bg-rose-500/10 text-rose-300 border-rose-500/30"
                          }`}
                        >
                          {preset.difficulty}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          {preset.category}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                      {preset.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Config & Prompt Editor */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <span>执行配置与 Prompt 输入</span>
                </h3>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">
                    Workflow 路由模式 (Routing Mode):
                  </label>
                  <div className="grid grid-cols-4 gap-1.5 text-xs font-mono">
                    {[
                      { id: "auto", label: "Auto 智能路由" },
                      { id: "full_planning", label: "Full Planning" },
                      { id: "quick_react", label: "Quick ReAct" },
                      { id: "direct_answer", label: "Direct 直出" },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() =>
                          setForcedMode(mode.id as WorkflowMode | "auto")
                        }
                        className={`py-1.5 px-2 rounded-lg border text-center transition text-[11px] ${
                          forcedMode === mode.id
                            ? "bg-purple-600/30 border-purple-500 text-purple-200 font-bold"
                            : "bg-[#0d1222] border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-mono text-slate-400">
                      最大执行步数 (Max Steps):
                    </label>
                    <span className="text-xs font-mono text-purple-300">
                      {maxSteps} 步
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={50}
                    step={1}
                    value={maxSteps}
                    onChange={(e) => setMaxSteps(Number(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">
                    任务提示词 (Task Prompt):
                  </label>
                  <textarea
                    rows={6}
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    className="w-full p-3 bg-[#090d18] border border-slate-800 rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-500 transition leading-relaxed resize-none"
                    placeholder="输入需要 Planning Agent 规划执行的目标..."
                  />
                </div>

                <button
                  onClick={handleRun}
                  disabled={isRunning}
                  className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition shadow-xl ${
                    isRunning
                      ? "bg-purple-950/60 border border-purple-800/50 text-purple-400 cursor-not-allowed"
                      : "bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white shadow-purple-600/20"
                  }`}
                >
                  {isRunning ? (
                    <>
                      <RotateCcw className="w-4 h-4 animate-spin" />
                      <span>Planning Agent 正在规划与执行中...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-white" />
                      <span>启动 Planning Agent 任务执行</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Plan Kanban & Execution Stream (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Top Routing Decision Badge */}
            {routingDecision && (
              <div className="glass-panel p-4 rounded-2xl border border-indigo-500/30 bg-[#0d1326] flex items-start justify-between gap-4 animate-in fade-in duration-300">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold">
                      ROUTER DECISION: {routingDecision.mode.toUpperCase()}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      置信度: {(routingDecision.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {routingDecision.reasoning}
                  </p>
                </div>
                <div className="shrink-0 p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                  <GitBranch className="w-4 h-4 text-indigo-400" />
                </div>
              </div>
            )}

            {/* Plan State & Progress Card */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300">
                    <Compass className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <span>实时 Plan 状态机看板</span>
                      {currentPlan && (
                        <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                          Rev {currentPlan.revision}
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-slate-400">
                      确定性外部任务流转与单一 Focus 约束
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-base font-bold font-mono text-purple-300">
                    {progressPercentage}%
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    {currentPlan
                      ? `${
                          currentPlan.tasks.filter(
                            (t) =>
                              t.status === "completed" || t.status === "skipped"
                          ).length
                        } / ${currentPlan.tasks.length} 完成`
                      : "等待规划..."}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-purple-500 via-indigo-500 to-cyan-400 h-2 transition-all duration-500"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>

              {/* Tabs: Kanban vs Stream vs Anchor */}
              <div className="flex items-center gap-2 pt-1 border-b border-slate-800 text-xs font-mono">
                <button
                  onClick={() => setActiveTab("kanban")}
                  className={`pb-2 px-3 border-b-2 font-semibold transition ${
                    activeTab === "kanban"
                      ? "border-purple-500 text-purple-300"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  任务状态看板 (Kanban)
                </button>
                <button
                  onClick={() => setActiveTab("stream")}
                  className={`pb-2 px-3 border-b-2 font-semibold transition ${
                    activeTab === "stream"
                      ? "border-purple-500 text-purple-300"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  实时执行事件流 ({events.length})
                </button>
                <button
                  onClick={() => setActiveTab("anchor")}
                  className={`pb-2 px-3 border-b-2 font-semibold transition ${
                    activeTab === "anchor"
                      ? "border-purple-500 text-purple-300"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Attention Anchor 上下文透视
                </button>
              </div>

              {/* Tab 1: Kanban Cards */}
              {activeTab === "kanban" && (
                <div className="space-y-3 min-h-[300px]">
                  {currentPlan?.replanReason && (
                    <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2 animate-pulse">
                      <Flame className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        <strong>Dynamic Re-plan 触发:</strong>{" "}
                        {currentPlan.replanReason}
                      </span>
                    </div>
                  )}

                  {!currentPlan || currentPlan.tasks.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-slate-500 text-xs font-mono space-y-2">
                      <ListTodo className="w-8 h-8 opacity-40" />
                      <span>点击“启动任务”后，模型将自主拆解并初始化 Plan</span>
                    </div>
                  ) : (
                    currentPlan.tasks.map((task) => {
                      return (
                        <div
                          key={task.id}
                          className={`p-4 rounded-xl border transition ${
                            task.status === "in_progress"
                              ? "bg-purple-950/25 border-purple-500/80 shadow-lg shadow-purple-500/5 ring-1 ring-purple-500/40"
                              : task.status === "completed"
                              ? "bg-emerald-950/15 border-emerald-500/30 text-slate-300"
                              : task.status === "blocked"
                              ? "bg-rose-950/20 border-rose-500/40"
                              : task.status === "skipped"
                              ? "bg-slate-900/40 border-slate-800 text-slate-500"
                              : "bg-[#0b0f1a] border-slate-800/80 text-slate-300"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 shrink-0">
                                {task.status === "completed" && (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                )}
                                {task.status === "in_progress" && (
                                  <div className="relative">
                                    <div className="w-4 h-4 rounded-full border-2 border-purple-400 animate-spin border-t-transparent" />
                                  </div>
                                )}
                                {task.status === "pending" && (
                                  <Clock className="w-4 h-4 text-slate-500" />
                                )}
                                {task.status === "blocked" && (
                                  <XCircle className="w-4 h-4 text-rose-400" />
                                )}
                                {task.status === "skipped" && (
                                  <span className="text-xs text-slate-500">
                                    [-]
                                  </span>
                                )}
                              </div>

                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-bold text-slate-400">
                                    {task.id}
                                  </span>
                                  <span
                                    className={`text-xs font-semibold ${
                                      task.status === "in_progress"
                                        ? "text-white"
                                        : task.status === "completed"
                                        ? "text-slate-200"
                                        : "text-slate-400"
                                    }`}
                                  >
                                    {task.title}
                                  </span>
                                </div>

                                {task.description && (
                                  <p className="text-[11px] text-slate-400 leading-relaxed">
                                    {task.description}
                                  </p>
                                )}

                                {task.resultSummary && (
                                  <div className="mt-2 p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-[11px] text-emerald-200 font-mono leading-relaxed">
                                    <strong className="text-emerald-400">
                                      验收结论:
                                    </strong>{" "}
                                    {task.resultSummary}
                                  </div>
                                )}
                              </div>
                            </div>

                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase border shrink-0 ${
                                task.status === "in_progress"
                                  ? "bg-purple-500/20 text-purple-300 border-purple-500/40 font-bold"
                                  : task.status === "completed"
                                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                                  : task.status === "blocked"
                                  ? "bg-rose-500/10 text-rose-300 border-rose-500/30"
                                  : "bg-slate-800 text-slate-400 border-slate-700"
                              }`}
                            >
                              {task.status === "in_progress"
                                ? "Current Focus"
                                : task.status}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Tab 2: Execution Event Stream */}
              {activeTab === "stream" && (
                <div className="space-y-3 min-h-[300px] max-h-[480px] overflow-y-auto pr-1 font-mono text-xs">
                  {events.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-slate-500 space-y-2">
                      <Terminal className="w-8 h-8 opacity-40" />
                      <span>暂无执行事件</span>
                    </div>
                  ) : (
                    events.map((ev, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl bg-[#090d18] border border-slate-800/80 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-purple-400 font-bold">
                            [{ev.type.toUpperCase()}]
                          </span>
                          {"step" in ev && (
                            <span className="text-slate-500">
                              Step {ev.step}
                            </span>
                          )}
                        </div>

                        {ev.type === "thought" && (
                          <p className="text-slate-300 whitespace-pre-wrap font-sans text-xs">
                            {ev.content}
                          </p>
                        )}

                        {ev.type === "tool_start" && (
                          <div className="space-y-1">
                            {ev.toolCalls.map((tc, idx) => (
                              <div
                                key={idx}
                                className="text-cyan-300 bg-cyan-950/20 p-2 rounded border border-cyan-500/30"
                              >
                                <strong>Tool:</strong> {tc.function.name}
                                <pre className="text-[10px] text-slate-400 overflow-x-auto mt-1">
                                  {tc.function.arguments}
                                </pre>
                              </div>
                            ))}
                          </div>
                        )}

                        {ev.type === "tool_end" && (
                          <div className="space-y-1">
                            {ev.toolResults.map((tr, idx) => (
                              <div
                                key={idx}
                                className={`p-2 rounded border text-[11px] ${
                                  tr.isError
                                    ? "bg-rose-950/30 border-rose-500/40 text-rose-200"
                                    : "bg-slate-900 border-slate-800 text-slate-300"
                                }`}
                              >
                                <strong>Result ({tr.toolName}):</strong>
                                <pre className="text-[10px] text-slate-400 overflow-x-auto mt-1 max-h-24">
                                  {tr.output}
                                </pre>
                              </div>
                            ))}
                          </div>
                        )}

                        {ev.type === "task_completed" && (
                          <div className="p-2 rounded bg-emerald-950/30 border border-emerald-500/40 text-emerald-300">
                            🎉 <strong>Task Completed:</strong> {ev.taskId} (
                            {ev.taskTitle})
                            <div className="text-[10px] mt-1 text-emerald-200">
                              Summary: {ev.resultSummary}
                            </div>
                          </div>
                        )}

                        {ev.type === "plan_replanned" && (
                          <div className="p-2 rounded bg-amber-950/30 border border-amber-500/40 text-amber-300">
                            ⚠️ <strong>Plan Replanned (Rev {ev.revision}):</strong>{" "}
                            {ev.reason}
                          </div>
                        )}

                        {ev.type === "error" && (
                          <div className="p-2 rounded bg-rose-950/40 border border-rose-500/50 text-rose-200">
                            ❌ {ev.message}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  <div ref={streamEndRef} />
                </div>
              )}

              {/* Tab 3: Attention Anchor Inspector */}
              {activeTab === "anchor" && (
                <div className="space-y-3 min-h-[300px]">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                    <span>
                      当前注入每一轮 LLM 提示词顶部的 Attention 锚点文本:
                    </span>
                  </div>
                  <pre className="p-4 rounded-xl bg-[#090d18] border border-purple-500/30 text-purple-200 font-mono text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-[400px]">
                    {currentPlan
                      ? `======================= 🎯 CURRENT EXECUTION PLAN =======================
Goal: ${currentPlan.goal}
Progress: [${"█".repeat(
                          Math.round((progressPercentage / 100) * 15)
                        )}${"░".repeat(
                          15 - Math.round((progressPercentage / 100) * 15)
                        )}] ${progressPercentage}% | Revision: ${
                          currentPlan.revision
                        }

${currentPlan.tasks
  .map(
    (t) =>
      `${
        t.status === "completed"
          ? "[✔]"
          : t.status === "in_progress"
          ? "[▶]"
          : "[ ]"
      } ${t.id}: ${t.title} (${t.status.toUpperCase()})${
        t.resultSummary ? `\n    └─ Verified: ${t.resultSummary}` : ""
      }`
  )
  .join("\n")}

⚠️ ATTENTION CONSTRAINT:
Focus ONLY on the current [IN PROGRESS] task.
========================================================================`
                      : "尚无正在运行的 Plan。"}
                  </pre>
                </div>
              )}
            </div>

            {/* Final Answer Summary Card */}
            {agentResult && (
              <div className="glass-panel p-5 rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-[#0d1624] to-[#0a101d] space-y-3 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">
                      最终执行总结与交付
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400">
                    耗时: {(agentResult.totalDurationMs / 1000).toFixed(1)}s | 步数:{" "}
                    {agentResult.totalSteps}
                  </span>
                </div>
                <div className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
                  {agentResult.finalAnswer}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}


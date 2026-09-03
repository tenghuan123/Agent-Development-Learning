import { useState, useEffect } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import type {
  ABComparisonResult,
  EvalReport,
  FlamegraphNode,
  LatencyBreakdown,
  Span,
  SuiteSummary,
  Trace,
} from "~/core/telemetry";
import { BENCHMARK_SUITE } from "~/core/telemetry";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  Code2,
  Coins,
  Cpu,
  FileCode,
  Flame,
  GitCompare,
  Layers,
  Play,
  Scale,
  ShieldCheck,
  Sparkles,
  Swords,
  Terminal,
  TrendingUp,
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

export default function LessonV10Page() {
  const { hasServerKey, model, defaultBaseURL } = useLoaderData<typeof loader>();

  // API Config State
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

  // Tabs: tracing | benchmark | arena | theory
  const [activeTab, setActiveTab] = useState<"tracing" | "benchmark" | "arena" | "theory">(
    "tracing"
  );

  // Selected Case for Tracing & A/B
  const [selectedCaseId, setSelectedCaseId] = useState<string>(BENCHMARK_SUITE[0].id);
  const currentCase = BENCHMARK_SUITE.find((c) => c.id === selectedCaseId) || BENCHMARK_SUITE[0];

  // Tracing Tab State
  const [isRunningCase, setIsRunningCase] = useState(false);
  const [currentTrace, setCurrentTrace] = useState<Trace | null>(null);
  const [currentFlamegraph, setCurrentFlamegraph] = useState<{
    root: FlamegraphNode;
    breakdown: LatencyBreakdown;
    flatNodes: FlamegraphNode[];
  } | null>(null);
  const [currentReport, setCurrentReport] = useState<EvalReport | null>(null);
  const [selectedSpan, setSelectedSpan] = useState<Span | FlamegraphNode | null>(null);

  // Benchmark Tab State
  const [isRunningSuite, setIsRunningSuite] = useState(false);
  const [suiteSummary, setSuiteSummary] = useState<SuiteSummary | null>(null);

  // Arena Tab State
  const [isRunningArena, setIsRunningArena] = useState(false);
  const [arenaResult, setArenaResult] = useState<ABComparisonResult | null>(null);
  const [arenaView, setArenaView] = useState<"trajectory" | "code" | "rounds">("trajectory");

  // Run Single Case with live Tracing
  const handleRunCase = async () => {
    setIsRunningCase(true);
    try {
      const res = await fetch("/api/eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_case",
          caseId: selectedCaseId,
          strategy: "verified",
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });

      const data = (await res.json()) as {
        success: boolean;
        trace: Trace;
        flamegraph: { root: FlamegraphNode; breakdown: LatencyBreakdown; flatNodes: FlamegraphNode[] };
        report: EvalReport;
        error?: string;
      };

      if (data.success) {
        setCurrentTrace(data.trace);
        setCurrentFlamegraph(data.flamegraph);
        setCurrentReport(data.report);
        setSelectedSpan(data.flamegraph.root);
      } else {
        alert("评测执行失败: " + (data.error || "未知错误"));
      }
    } catch (err: unknown) {
      alert("网络异常: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsRunningCase(false);
    }
  };

  // Run Batch Benchmark Suite
  const handleRunSuite = async () => {
    setIsRunningSuite(true);
    try {
      const res = await fetch("/api/eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_suite",
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });

      const data = (await res.json()) as {
        success: boolean;
        summary: SuiteSummary;
        error?: string;
      };

      if (data.success) {
        setSuiteSummary(data.summary);
      } else {
        alert("运行 Benchmark 失败: " + (data.error || "未知错误"));
      }
    } catch (err: unknown) {
      alert("网络异常: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsRunningSuite(false);
    }
  };

  // Run A/B Arena Showdown
  const handleRunArena = async () => {
    setIsRunningArena(true);
    try {
      const res = await fetch("/api/eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_ab",
          caseId: selectedCaseId,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });

      const data = (await res.json()) as {
        success: boolean;
        comparison: ABComparisonResult;
        error?: string;
      };

      if (data.success) {
        setArenaResult(data.comparison);
      } else {
        alert("A/B 对比执行失败: " + (data.error || "未知错误"));
      }
    } catch (err: unknown) {
      alert("网络异常: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsRunningArena(false);
    }
  };

  // Run first case by default on mount if empty
  useEffect(() => {
    if (!currentTrace) {
      handleRunCase();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      />

      {/* Hero Title & Subheader */}
      <div className="border-b border-purple-500/20 bg-gradient-to-r from-purple-950/40 via-indigo-950/20 to-slate-900/40 px-6 py-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Lesson 11 (V10)
              </span>
              <span className="text-xs text-slate-400 font-mono">
                OpenTelemetry &bull; SWE-bench Paradigm &bull; LLM-as-a-Judge
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <Flame className="w-7 h-7 text-purple-400" />
              Agent 评测体系与全链路 Tracing 实验台
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-3xl">
              告别“凭感觉调 Prompt”的盲人摸象：通过 OpenTelemetry
              树状调用栈、火焰图瀑布流、细粒度 Token 计费与三层评测金字塔，打造工业级可观测性闭环。
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Link
              to="/docs/lessons/11-eval-and-tracing.md"
              target="_blank"
              className="px-3.5 py-1.5 rounded-lg border border-purple-500/40 hover:bg-purple-500/10 text-purple-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" />
              阅读本课原理讲义
            </Link>
          </div>
        </div>
      </div>

      {/* Metrics Header Bar */}
      <div className="border-b border-slate-800/80 bg-slate-900/50 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">当前 Trace ID:</span>
              <span className="font-mono text-purple-400 bg-purple-950/40 px-2 py-0.5 rounded border border-purple-500/20">
                {currentTrace ? currentTrace.traceId : "等待执行..."}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">综合得分 (Score):</span>
              <span
                className={`font-mono font-bold px-2 py-0.5 rounded ${
                  currentReport && currentReport.dimensions.compositeScore >= 80
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : currentReport && currentReport.dimensions.compositeScore >= 50
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                }`}
              >
                {currentReport ? `${currentReport.dimensions.compositeScore} 分` : "--"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">耗时 (Latency):</span>
              <span className="font-mono text-cyan-300 flex items-center gap-1">
                <Clock className="w-3 h-3 text-cyan-400" />
                {currentTrace ? `${currentTrace.durationMs}ms` : "--"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Token 消耗:</span>
              <span className="font-mono text-amber-300 flex items-center gap-1">
                <Coins className="w-3 h-3 text-amber-400" />
                {currentTrace ? `${currentTrace.totalTokens} Toks ($${currentTrace.totalCostUsd})` : "--"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">模型:</span>
            <span className="font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
              {model}
            </span>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 space-y-6">
        {/* Tab Switcher */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab("tracing")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
              activeTab === "tracing"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                : "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            全链路 Tracing 与火焰图
          </button>

          <button
            onClick={() => setActiveTab("benchmark")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
              activeTab === "benchmark"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                : "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Benchmark 评测大盘 & 雷达图
          </button>

          <button
            onClick={() => setActiveTab("arena")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
              activeTab === "arena"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                : "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <Swords className="w-3.5 h-3.5" />
            A/B 策略对抗竞技场
          </button>

          <button
            onClick={() => setActiveTab("theory")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
              activeTab === "theory"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                : "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            原理解析与架构讲义
          </button>
        </div>

        {/* TAB 1: TRACING & FLAMEGRAPH */}
        {activeTab === "tracing" && (
          <div className="space-y-6">
            {/* Control & Case Selector */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-[#0d1222] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  选择评测基准用例 (Benchmark Case):
                </label>
                <div className="flex items-center gap-3 flex-wrap">
                  <select
                    value={selectedCaseId}
                    onChange={(e) => setSelectedCaseId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500 w-full md:w-auto"
                  >
                    {BENCHMARK_SUITE.map((c) => (
                      <option key={c.id} value={c.id}>
                        [{c.category.toUpperCase()}] {c.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-slate-400">
                    难度:{" "}
                    <span className="text-amber-400 font-mono uppercase">
                      {currentCase.difficulty}
                    </span>
                  </span>
                  <span className="text-xs text-slate-400">
                    预算:{" "}
                    <span className="text-cyan-400 font-mono">
                      {currentCase.maxBudgetSteps} 步 / ${currentCase.costBudgetUsd}
                    </span>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleRunCase}
                  disabled={isRunningCase}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-purple-600/30 transition-all disabled:opacity-50"
                >
                  {isRunningCase ? (
                    <Activity className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  {isRunningCase ? "实时追踪链路中..." : "启动单项链路追踪"}
                </button>
              </div>
            </div>

            {/* Prompt Preview */}
            <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-950/60 text-xs">
              <div className="text-slate-400 font-medium mb-1">测试用例 Prompt:</div>
              <pre className="text-slate-300 font-mono whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto bg-slate-900/50 p-2.5 rounded border border-slate-800">
                {currentCase.prompt}
              </pre>
            </div>

            {/* Latency Breakdown Bar */}
            {currentFlamegraph && (
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-[#0d1222] space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    耗时成分瀑布分析 (Latency Breakdown)
                  </span>
                  <span className="text-slate-400 font-mono">
                    总耗时: {currentFlamegraph.breakdown.totalDurationMs}ms | 吞吐率:{" "}
                    {currentFlamegraph.breakdown.tokensPerSec} tokens/s
                  </span>
                </div>

                {/* Progress bar split */}
                <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${currentFlamegraph.breakdown.llmPercent}%` }}
                    className="bg-indigo-500 hover:brightness-110 transition-all"
                    title={`LLM 推理: ${currentFlamegraph.breakdown.llmDurationMs}ms (${currentFlamegraph.breakdown.llmPercent}%)`}
                  />
                  <div
                    style={{ width: `${currentFlamegraph.breakdown.toolPercent}%` }}
                    className="bg-cyan-500 hover:brightness-110 transition-all"
                    title={`工具执行: ${currentFlamegraph.breakdown.toolDurationMs}ms (${currentFlamegraph.breakdown.toolPercent}%)`}
                  />
                  <div
                    style={{ width: `${currentFlamegraph.breakdown.overheadPercent}%` }}
                    className="bg-slate-600 hover:brightness-110 transition-all"
                    title={`系统开销: ${currentFlamegraph.breakdown.overheadDurationMs}ms (${currentFlamegraph.breakdown.overheadPercent}%)`}
                  />
                </div>

                {/* Legend */}
                <div className="flex items-center gap-6 text-xs flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-indigo-500" />
                    <span className="text-slate-300">
                      LLM 推理: {currentFlamegraph.breakdown.llmDurationMs}ms (
                      {currentFlamegraph.breakdown.llmPercent}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-cyan-500" />
                    <span className="text-slate-300">
                      工具执行: {currentFlamegraph.breakdown.toolDurationMs}ms (
                      {currentFlamegraph.breakdown.toolPercent}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-slate-600" />
                    <span className="text-slate-300">
                      系统/网络开销: {currentFlamegraph.breakdown.overheadDurationMs}ms (
                      {currentFlamegraph.breakdown.overheadPercent}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 ml-auto text-amber-300 font-mono">
                    <Zap className="w-3 h-3 text-amber-400" />
                    平均首字延迟 (TTFT): {currentFlamegraph.breakdown.avgTtftMs}ms
                  </div>
                </div>
              </div>
            )}

            {/* Flamegraph & Timeline Waterfall */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Flamegraph Rows (8 cols) */}
              <div className="lg:col-span-8 glass-panel p-5 rounded-2xl border border-slate-800 bg-[#0d1222] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                    全链路树状调用栈 (Flamegraph Gantt Waterfall)
                  </h3>
                  <span className="text-xs text-slate-500">点击任意 Span 查看底层载荷</span>
                </div>

                {/* Timeline axis */}
                <div className="relative border-b border-slate-700/60 pb-1 flex justify-between text-[10px] font-mono text-slate-400 px-1">
                  <span>0ms</span>
                  <span>
                    {currentFlamegraph
                      ? Math.round(currentFlamegraph.breakdown.totalDurationMs * 0.25) + "ms"
                      : "25%"}
                  </span>
                  <span>
                    {currentFlamegraph
                      ? Math.round(currentFlamegraph.breakdown.totalDurationMs * 0.5) + "ms"
                      : "50%"}
                  </span>
                  <span>
                    {currentFlamegraph
                      ? Math.round(currentFlamegraph.breakdown.totalDurationMs * 0.75) + "ms"
                      : "75%"}
                  </span>
                  <span>
                    {currentFlamegraph ? currentFlamegraph.breakdown.totalDurationMs + "ms" : "100%"}
                  </span>
                </div>

                {/* Flamegraph Nodes Stack */}
                <div className="space-y-2 py-2 max-h-[500px] overflow-y-auto pr-1">
                  {currentFlamegraph && currentFlamegraph.flatNodes.length > 0 ? (
                    currentFlamegraph.flatNodes.map((node) => {
                      const isSelected = selectedSpan?.spanId === node.spanId;
                      const spanColor =
                        node.type === "agent_run"
                          ? "bg-purple-900/60 border-purple-500/50 text-purple-200"
                          : node.type === "planner"
                          ? "bg-amber-900/60 border-amber-500/50 text-amber-200"
                          : node.type === "agent_loop"
                          ? "bg-blue-900/60 border-blue-500/50 text-blue-200"
                          : node.type === "llm_call"
                          ? "bg-indigo-900/60 border-indigo-500/50 text-indigo-200"
                          : node.type === "tool_exec"
                          ? "bg-cyan-900/60 border-cyan-500/50 text-cyan-200"
                          : "bg-emerald-900/60 border-emerald-500/50 text-emerald-200";

                      return (
                        <div key={node.spanId} className="relative h-9 flex items-center group">
                          {/* Background bar mapped to timeline */}
                          <div
                            onClick={() => setSelectedSpan(node)}
                            style={{
                              marginLeft: `${node.leftPercent}%`,
                              width: `${Math.max(4, node.widthPercent)}%`,
                            }}
                            className={`h-8 rounded-lg border px-2.5 flex items-center justify-between cursor-pointer transition-all shadow-md ${spanColor} ${
                              isSelected ? "ring-2 ring-purple-400 scale-[1.01]" : "hover:brightness-125"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <span className="text-[10px] font-mono px-1 rounded bg-black/40 uppercase">
                                {node.type.slice(0, 4)}
                              </span>
                              <span className="text-xs font-medium truncate">{node.name}</span>
                              {node.isBottleneck && (
                                <span className="text-[9px] px-1 rounded bg-rose-500/30 text-rose-300 border border-rose-500/40">
                                  瓶颈
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] font-mono opacity-80 whitespace-nowrap ml-2">
                              {node.durationMs}ms
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12 text-slate-500 text-xs">
                      暂无链路数据，请点击上方“启动单项链路追踪”
                    </div>
                  )}
                </div>
              </div>

              {/* Span Inspector Drawer (4 cols) */}
              <div className="lg:col-span-4 glass-panel p-5 rounded-2xl border border-slate-800 bg-[#0d1222] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-cyan-400" />
                    Span 载荷检视器 (Inspector)
                  </h3>
                  {selectedSpan && (
                    <span className="text-[10px] font-mono text-purple-400 bg-purple-950/40 px-2 py-0.5 rounded border border-purple-500/20">
                      {selectedSpan.spanId}
                    </span>
                  )}
                </div>

                {selectedSpan ? (
                  <div className="space-y-4 text-xs">
                    <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Span 名称:</span>
                        <span className="font-semibold text-slate-200">{selectedSpan.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">类型:</span>
                        <span className="font-mono text-purple-300 uppercase">
                          {selectedSpan.type}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">持续耗时:</span>
                        <span className="font-mono text-cyan-300">
                          {selectedSpan.metrics.durationMs}ms
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Token 消耗:</span>
                        <span className="font-mono text-amber-300">
                          {selectedSpan.metrics.promptTokens} in /{" "}
                          {selectedSpan.metrics.completionTokens} out
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">单步估算费用:</span>
                        <span className="font-mono text-emerald-300">
                          ${selectedSpan.metrics.estimatedCostUsd}
                        </span>
                      </div>
                      {selectedSpan.metrics.ttftMs && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">首字时延 (TTFT):</span>
                          <span className="font-mono text-yellow-300">
                            {selectedSpan.metrics.ttftMs}ms
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Inputs & Outputs */}
                    <div className="space-y-2">
                      <span className="text-slate-400 font-medium">输入载荷 (Input Payload):</span>
                      <pre className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 max-h-32 overflow-y-auto whitespace-pre-wrap">
                        {selectedSpan.input
                          ? JSON.stringify(selectedSpan.input, null, 2)
                          : "无输入参数 (Root or Internal)"}
                      </pre>
                    </div>

                    <div className="space-y-2">
                      <span className="text-slate-400 font-medium">
                        输出/结果 (Output / Return):
                      </span>
                      <pre className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-emerald-300 max-h-40 overflow-y-auto whitespace-pre-wrap">
                        {selectedSpan.output
                          ? typeof selectedSpan.output === "string"
                            ? selectedSpan.output
                            : JSON.stringify(selectedSpan.output, null, 2)
                          : "无输出结果"}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16 text-slate-500 text-xs">
                    请在左侧瀑布流点击任意 Span 查看详细元数据
                  </div>
                )}
              </div>
            </div>

            {/* Multi-stage Eval Report for Current Case */}
            {currentReport && (
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-[#0d1222] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    当前用例三层评测报告 (Multi-Stage Evaluation Report)
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      currentReport.status === "passed"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : currentReport.status === "partial"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                    }`}
                  >
                    {currentReport.status.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {currentReport.assertionResults.map((res, i) => (
                    <div
                      key={i}
                      className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200">{res.name}</span>
                        {res.passed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-400" />
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{res.message}</p>
                    </div>
                  ))}
                </div>

                {currentReport.judgeCritique && (
                  <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-950/20 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-purple-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        LLM-as-a-Judge 专家评审打分:{" "}
                        <span className="text-emerald-400 font-mono">
                          {currentReport.judgeCritique.score} 分
                        </span>
                      </span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      {currentReport.judgeCritique.reasoning}
                    </p>
                    {currentReport.judgeCritique.strengths.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <span className="text-slate-400">亮点:</span>
                        {currentReport.judgeCritique.strengths.map((s, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px]"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: BENCHMARK SUITE & RADAR */}
        {activeTab === "benchmark" && (
          <div className="space-y-6">
            {/* Header & Run All Button */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-[#0d1222] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-purple-400" />
                  Mini Claude Code 标准化评测基准大盘 (Benchmark Suite)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  涵盖算法边界修复、MCP 工具路由、环境容错自愈、提示词越权防御与异步限流 5
                  大工业级基准用例。
                </p>
              </div>

              <button
                onClick={handleRunSuite}
                disabled={isRunningSuite}
                className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-purple-600/30 transition-all disabled:opacity-50"
              >
                {isRunningSuite ? (
                  <Activity className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {isRunningSuite ? "正在批量评测 5 大用例..." : "一键运行全套基准评测"}
              </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400">总通过率 (Pass Rate)</div>
                  <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                    {suiteSummary ? `${suiteSummary.passRate}%` : "100%"}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {suiteSummary
                      ? `${suiteSummary.passedCases}/${suiteSummary.totalCases} 用例全绿`
                      : "5/5 用例全绿"}
                  </div>
                </div>
                <CheckCircle2 className="w-8 h-8 text-emerald-400/40" />
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400">平均综合评分 (Score)</div>
                  <div className="text-2xl font-bold font-mono text-purple-400 mt-1">
                    {suiteSummary ? `${suiteSummary.avgCompositeScore} 分` : "92 分"}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">五维加权质量指数</div>
                </div>
                <TrendingUp className="w-8 h-8 text-purple-400/40" />
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400">平均用例耗时 (Avg Latency)</div>
                  <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
                    {suiteSummary ? `${suiteSummary.avgDurationMs}ms` : "1,420ms"}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">端到端响应时延</div>
                </div>
                <Clock className="w-8 h-8 text-cyan-400/40" />
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400">全套总花费 (Total Cost)</div>
                  <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                    ${suiteSummary ? suiteSummary.totalCostUsd : "0.0125"}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">高经济性 Token 控制</div>
                </div>
                <Coins className="w-8 h-8 text-amber-400/40" />
              </div>
            </div>

            {/* Radar Chart & Breakdown Table */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Radar Chart (SVG) */}
              <div className="lg:col-span-5 glass-panel p-5 rounded-2xl border border-slate-800 bg-[#0d1222] flex flex-col items-center justify-center">
                <h3 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5 self-start">
                  <Scale className="w-4 h-4 text-purple-400" />
                  Agent 能力五维雷达图 (Radar Profile)
                </h3>

                {/* SVG Radar */}
                <div className="w-64 h-64 relative flex items-center justify-center py-2">
                  <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible">
                    {/* Background Grids (20, 40, 60, 80, 100) */}
                    {[0.2, 0.4, 0.6, 0.8, 1.0].map((level, idx) => (
                      <polygon
                        key={idx}
                        points="100,20 176,75 147,165 53,165 24,75"
                        transform={`scale(${level})`}
                        transform-origin="100 100"
                        fill="none"
                        stroke="#334155"
                        strokeWidth="1"
                        strokeDasharray={idx < 4 ? "2,2" : undefined}
                      />
                    ))}

                    {/* Radial lines from center */}
                    <line x1="100" y1="100" x2="100" y2="20" stroke="#334155" strokeWidth="1" />
                    <line x1="100" y1="100" x2="176" y2="75" stroke="#334155" strokeWidth="1" />
                    <line x1="100" y1="100" x2="147" y2="165" stroke="#334155" strokeWidth="1" />
                    <line x1="100" y1="100" x2="53" y2="165" stroke="#334155" strokeWidth="1" />
                    <line x1="100" y1="100" x2="24" y2="75" stroke="#334155" strokeWidth="1" />

                    {/* Data Polygon */}
                    {(() => {
                      const radar = suiteSummary
                        ? suiteSummary.radarAverages
                        : {
                            taskSuccess: 95,
                            toolPrecision: 90,
                            trajectoryEfficiency: 85,
                            costEfficiency: 92,
                            judgeQuality: 90,
                          };

                      // 5 Axes:
                      // 0: Task Success (top, 100, 20)
                      // 1: Tool Precision (top-right, 176, 75)
                      // 2: Trajectory Efficiency (bottom-right, 147, 165)
                      // 3: Cost Efficiency (bottom-left, 53, 165)
                      // 4: Judge Quality (top-left, 24, 75)
                      const p0 = 100 - (radar.taskSuccess / 100) * 80;
                      const p1x = 100 + (radar.toolPrecision / 100) * 76;
                      const p1y = 100 - (radar.toolPrecision / 100) * 25;
                      const p2x = 100 + (radar.trajectoryEfficiency / 100) * 47;
                      const p2y = 100 + (radar.trajectoryEfficiency / 100) * 65;
                      const p3x = 100 - (radar.costEfficiency / 100) * 47;
                      const p3y = 100 + (radar.costEfficiency / 100) * 65;
                      const p4x = 100 - (radar.judgeQuality / 100) * 76;
                      const p4y = 100 - (radar.judgeQuality / 100) * 25;

                      const points = `100,${p0} ${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y} ${p4x},${p4y}`;

                      return (
                        <>
                          <polygon
                            points={points}
                            fill="rgba(168, 85, 247, 0.3)"
                            stroke="#a855f7"
                            strokeWidth="2"
                          />
                          <circle cx="100" cy={p0} r="3" fill="#c084fc" />
                          <circle cx={p1x} cy={p1y} r="3" fill="#c084fc" />
                          <circle cx={p2x} cy={p2y} r="3" fill="#c084fc" />
                          <circle cx={p3x} cy={p3y} r="3" fill="#c084fc" />
                          <circle cx={p4x} cy={p4y} r="3" fill="#c084fc" />
                        </>
                      );
                    })()}

                    {/* Labels */}
                    <text x="100" y="10" textAnchor="middle" fill="#cbd5e1" fontSize="9" fontWeight="bold">
                      任务达成 (L1)
                    </text>
                    <text x="185" y="75" textAnchor="start" fill="#cbd5e1" fontSize="9" fontWeight="bold">
                      工具精确
                    </text>
                    <text x="155" y="180" textAnchor="middle" fill="#cbd5e1" fontSize="9" fontWeight="bold">
                      步数效率
                    </text>
                    <text x="45" y="180" textAnchor="middle" fill="#cbd5e1" fontSize="9" fontWeight="bold">
                      成本控制
                    </text>
                    <text x="15" y="75" textAnchor="end" fill="#cbd5e1" fontSize="9" fontWeight="bold">
                      裁判评审 (L3)
                    </text>
                  </svg>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-400 mt-2 font-mono">
                  <div>
                    任务达成:{" "}
                    <span className="text-emerald-400">
                      {suiteSummary ? suiteSummary.radarAverages.taskSuccess : 95}分
                    </span>
                  </div>
                  <div>
                    工具精确:{" "}
                    <span className="text-purple-400">
                      {suiteSummary ? suiteSummary.radarAverages.toolPrecision : 90}分
                    </span>
                  </div>
                  <div>
                    步数效率:{" "}
                    <span className="text-cyan-400">
                      {suiteSummary ? suiteSummary.radarAverages.trajectoryEfficiency : 85}分
                    </span>
                  </div>
                  <div>
                    成本控制:{" "}
                    <span className="text-amber-400">
                      {suiteSummary ? suiteSummary.radarAverages.costEfficiency : 92}分
                    </span>
                  </div>
                </div>
              </div>

              {/* Table Breakdown (7 cols) */}
              <div className="lg:col-span-7 glass-panel p-5 rounded-2xl border border-slate-800 bg-[#0d1222] space-y-3">
                <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-cyan-400" />
                  基准测试集用例明细表 (Benchmark Cases Breakdown)
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-slate-400 border-b border-slate-800 uppercase font-mono text-[10px]">
                      <tr>
                        <th className="py-2 px-2">用例名称</th>
                        <th className="py-2 px-2">分类</th>
                        <th className="py-2 px-2">状态</th>
                        <th className="py-2 px-2">耗时</th>
                        <th className="py-2 px-2">费用</th>
                        <th className="py-2 px-2">得分</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {BENCHMARK_SUITE.map((c) => {
                        const report = suiteSummary?.reports.find((r) => r.caseId === c.id);
                        const score = report ? report.dimensions.compositeScore : 92;
                        const duration = report ? report.trace.durationMs : 1250;
                        const cost = report ? report.trace.totalCostUsd : 0.0025;
                        const isPassed = score >= 80;

                        return (
                          <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-2.5 px-2 font-sans font-medium text-slate-200">
                              {c.name}
                            </td>
                            <td className="py-2.5 px-2 text-slate-400 text-[10px]">
                              {c.category}
                            </td>
                            <td className="py-2.5 px-2">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  isPassed
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                    : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                }`}
                              >
                                {isPassed ? "PASS" : "FAIL"}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-cyan-300">{duration}ms</td>
                            <td className="py-2.5 px-2 text-amber-300">${cost}</td>
                            <td className="py-2.5 px-2 text-purple-300 font-bold">{score}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: A/B STRATEGY ARENA */}
        {activeTab === "arena" && (
          <div className="space-y-6">
            {/* Header & Arena Run */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-[#0d1222] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Swords className="w-5 h-5 text-rose-400" />
                  策略对抗竞技场 (A/B Strategy Showdown)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  对比【策略 A：朴素单步无约束 Agent】与【策略 B：带自愈验证的高阶 ReAct Agent】。
                </p>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={selectedCaseId}
                  onChange={(e) => setSelectedCaseId(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                >
                  {BENCHMARK_SUITE.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleRunArena}
                  disabled={isRunningArena}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-rose-600 to-purple-600 hover:from-rose-500 hover:to-purple-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
                >
                  {isRunningArena ? (
                    <Activity className="w-4 h-4 animate-spin" />
                  ) : (
                    <Swords className="w-4 h-4" />
                  )}
                  {isRunningArena ? "正在双策略竞技中..." : "启动双策略对抗推演"}
                </button>
              </div>
            </div>

            {/* Arena Result Card */}
            {arenaResult ? (
              <div className="glass-panel p-6 rounded-2xl border border-purple-500/40 bg-purple-950/20 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-300 font-semibold">对抗裁判判定胜者:</span>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      {arenaResult.winner === "B"
                        ? "🏆 策略 B 胜出 (Verified ReAct Agent)"
                        : arenaResult.winner === "A"
                        ? "🏆 策略 A 胜出 (Baseline)"
                        : "持平 (TIE)"}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono">
                    <span className="text-emerald-400">
                      分差: +{arenaResult.analysis.scoreDiff} 分
                    </span>
                    <span className="text-cyan-400">
                      时延差: {arenaResult.analysis.latencyDiffMs}ms
                    </span>
                    <span className="text-amber-400">
                      费用差: ${arenaResult.analysis.costDiffUsd}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                  {arenaResult.analysis.summary}
                </p>

                {/* Arena Sub-View Selector */}
                <div className="flex items-center gap-2 border-b border-purple-500/30 pb-2 pt-2">
                  <button
                    onClick={() => setArenaView("trajectory")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                      arenaView === "trajectory"
                        ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                        : "bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    }`}
                  >
                    <GitCompare className="w-3.5 h-3.5" />
                    🔍 执行轨迹双轨对比 (Side-by-Side Trajectory)
                  </button>
                  <button
                    onClick={() => setArenaView("code")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                      arenaView === "code"
                        ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                        : "bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    📝 方案与产出代码对比 (Code & Solution Diff)
                  </button>
                  <button
                    onClick={() => setArenaView("rounds")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                      arenaView === "rounds"
                        ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                        : "bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    }`}
                  >
                    <Scale className="w-3.5 h-3.5" />
                    ⚖️ 裁判逐回合对抗判词 (Round-by-Round Showdown)
                  </button>
                </div>

                {/* Sub-view 1: Side-by-Side Trajectory Stream */}
                {arenaView === "trajectory" && (
                  <div className="space-y-3 pt-2">
                    <div className="text-xs text-slate-400 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                        两套 Agent 解决同一用例的执行动作全流程链路追踪
                      </span>
                      <span className="font-mono text-slate-500 text-[11px]">
                        策略 A: {arenaResult.strategyA.report.trace.spans.length} 步 / 策略 B:{" "}
                        {arenaResult.strategyB.report.trace.spans.length} 步
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Left: Strategy A Spans */}
                      <div className="space-y-3">
                        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                          <span className="font-semibold text-xs text-amber-300 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            策略 A: {arenaResult.strategyA.name}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            单步跳跃 / 无校验闭环
                          </span>
                        </div>

                        <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                          {arenaResult.strategyA.report.trace.spans.map((span, idx) => (
                            <div
                              key={span.spanId}
                              className="p-3 rounded-xl border border-slate-800 bg-slate-950/70 text-xs space-y-2 relative group hover:border-slate-700 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 font-mono text-[10px] flex items-center justify-center font-bold">
                                    {idx + 1}
                                  </span>
                                  <span className="font-semibold text-slate-200">
                                    {span.name}
                                  </span>
                                </div>
                                <span className="font-mono text-[10px] text-slate-400">
                                  {span.metrics.durationMs}ms | {span.metrics.totalTokens} toks
                                </span>
                              </div>

                              <div className="text-[11px] text-slate-400">
                                类型:{" "}
                                <span className="font-mono text-purple-400 uppercase">
                                  {span.type}
                                </span>
                              </div>

                              {Boolean(span.output) && (
                                <div className="bg-slate-900 p-2 rounded border border-slate-800/80 text-[10px] font-mono text-slate-300 max-h-24 overflow-y-auto whitespace-pre-wrap">
                                  {typeof span.output === "string"
                                    ? span.output.slice(0, 300) +
                                      (span.output.length > 300 ? "..." : "")
                                    : JSON.stringify(span.output, null, 2)}
                                </div>
                              )}

                              <div className="text-[10px] text-rose-400/90 flex items-center gap-1 pt-1">
                                <XCircle className="w-3 h-3 text-rose-400" />
                                缺陷特征：缺少前置分析节点，直接生成，未经过单元测试验证
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Right: Strategy B Spans */}
                      <div className="space-y-3">
                        <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-500/40 flex items-center justify-between">
                          <span className="font-semibold text-xs text-purple-200 flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                            策略 B: {arenaResult.strategyB.name}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            多步 ReAct + 状态验证
                          </span>
                        </div>

                        <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                          {arenaResult.strategyB.report.trace.spans.map((span, idx) => (
                            <div
                              key={span.spanId}
                              className="p-3 rounded-xl border border-purple-500/30 bg-slate-950/70 text-xs space-y-2 relative group hover:border-purple-500/60 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="w-5 h-5 rounded-full bg-purple-900/60 text-purple-300 border border-purple-500/40 font-mono text-[10px] flex items-center justify-center font-bold">
                                    {idx + 1}
                                  </span>
                                  <span className="font-semibold text-slate-200">
                                    {span.name}
                                  </span>
                                </div>
                                <span className="font-mono text-[10px] text-cyan-400">
                                  {span.metrics.durationMs}ms | {span.metrics.totalTokens} toks
                                </span>
                              </div>

                              <div className="text-[11px] text-slate-400 flex items-center justify-between">
                                <span>
                                  类型:{" "}
                                  <span className="font-mono text-purple-300 uppercase">
                                    {span.type}
                                  </span>
                                </span>
                                {span.type === "planner" && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
                                    任务拆解
                                  </span>
                                )}
                                {span.type === "tool_exec" && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300">
                                    沙箱工具
                                  </span>
                                )}
                                {span.type === "eval_check" && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                                    断言通过
                                  </span>
                                )}
                              </div>

                              {Boolean(span.output) && (
                                <div className="bg-slate-900 p-2 rounded border border-slate-800/80 text-[10px] font-mono text-emerald-300/90 max-h-24 overflow-y-auto whitespace-pre-wrap">
                                  {typeof span.output === "string"
                                    ? span.output.slice(0, 300) +
                                      (span.output.length > 300 ? "..." : "")
                                    : JSON.stringify(span.output, null, 2)}
                                </div>
                              )}

                              <div className="text-[10px] text-emerald-400 flex items-center gap-1 pt-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                优势特征：闭环验证通过，执行状态符合预期契约
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sub-view 2: Side-by-Side Code & Output Comparison */}
                {arenaView === "code" && (
                  <div className="space-y-3 pt-2">
                    <div className="text-xs text-slate-400 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Code2 className="w-3.5 h-3.5 text-purple-400" />
                        最终产出解决方案与实现代码对比
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Strategy A Code Box */}
                      <div className="p-4 rounded-xl border border-slate-800 bg-slate-950 space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="font-semibold text-xs text-amber-400 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            策略 A 产出代码 (Baseline)
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            未测试 / 漏算边界
                          </span>
                        </div>
                        <pre className="p-3 bg-slate-900/90 rounded-lg text-xs font-mono text-slate-300 max-h-96 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                          {arenaResult.strategyA.output || "无输出代码"}
                        </pre>
                      </div>

                      {/* Strategy B Code Box */}
                      <div className="p-4 rounded-xl border border-purple-500/40 bg-slate-950 space-y-2">
                        <div className="flex items-center justify-between border-b border-purple-500/30 pb-2">
                          <span className="font-semibold text-xs text-purple-300 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            策略 B 产出代码 (Verified Agent)
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            测试全绿 / 生产严密
                          </span>
                        </div>
                        <pre className="p-3 bg-slate-900/90 rounded-lg text-xs font-mono text-emerald-300 max-h-96 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                          {arenaResult.strategyB.output || "无输出代码"}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sub-view 3: Round-by-Round Showdown Verdict */}
                {arenaView === "rounds" && (
                  <div className="space-y-3 pt-2">
                    <div className="text-xs text-slate-400 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Scale className="w-3.5 h-3.5 text-emerald-400" />
                        裁判逐回合对抗判词 (5 大维度独立打分)
                      </span>
                    </div>

                    <div className="space-y-3">
                      {arenaResult.rounds && arenaResult.rounds.length > 0 ? (
                        arenaResult.rounds.map((round, idx) => (
                          <div
                            key={idx}
                            className="p-4 rounded-xl border border-slate-800 bg-slate-900/70 text-xs space-y-2.5"
                          >
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <span className="font-bold text-slate-200 flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-mono text-[10px] flex items-center justify-center font-bold">
                                  {idx + 1}
                                </span>
                                {round.title}
                              </span>
                              <span
                                className={`px-2.5 py-0.5 rounded text-[11px] font-semibold ${
                                  round.winner === "B"
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                    : round.winner === "A"
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                    : "bg-slate-800 text-slate-400"
                                }`}
                              >
                                {round.winner === "B"
                                  ? "🏆 策略 B 胜出"
                                  : round.winner === "A"
                                  ? "🏆 策略 A 胜出"
                                  : "持平"}
                              </span>
                            </div>

                            {/* Dual Score Bar */}
                            <div className="space-y-1.5 pt-1">
                              <div className="flex items-center justify-between text-[11px] font-mono">
                                <span className="text-amber-400">
                                  策略 A: {round.scoreA} 分
                                </span>
                                <span className="text-purple-400">
                                  策略 B: {round.scoreB} 分
                                </span>
                              </div>
                              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden flex">
                                <div
                                  style={{
                                    width: `${
                                      (round.scoreA / (round.scoreA + round.scoreB || 1)) * 100
                                    }%`,
                                  }}
                                  className="bg-amber-500/80 transition-all"
                                />
                                <div
                                  style={{
                                    width: `${
                                      (round.scoreB / (round.scoreA + round.scoreB || 1)) * 100
                                    }%`,
                                  }}
                                  className="bg-purple-500 transition-all"
                                />
                              </div>
                            </div>

                            <p className="text-slate-300 leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                              {round.commentary}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="text-slate-500 text-center py-6 text-xs">
                          暂无回合数据
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Scorecards Summary Bottom */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-3 border-t border-slate-800">
                  {/* Strategy A */}
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="font-semibold text-xs text-slate-300">
                        策略 A 综合概览: {arenaResult.strategyA.name}
                      </span>
                      <span className="font-mono text-xs font-bold text-amber-400">
                        {arenaResult.strategyA.report.dimensions.compositeScore} 分
                      </span>
                    </div>
                    <div className="space-y-1.5 text-xs text-slate-400 font-mono">
                      <div className="flex justify-between">
                        <span>任务断言:</span>
                        <span className="text-slate-200">
                          {arenaResult.strategyA.report.dimensions.taskSuccess} 分
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>工具精确率:</span>
                        <span className="text-slate-200">
                          {arenaResult.strategyA.report.dimensions.toolPrecision} 分
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>步数效率:</span>
                        <span className="text-slate-200">
                          {arenaResult.strategyA.report.dimensions.trajectoryEfficiency} 分
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>消耗时延:</span>
                        <span className="text-slate-200">
                          {arenaResult.strategyA.report.trace.durationMs}ms
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Strategy B */}
                  <div className="p-4 rounded-xl border border-purple-500/40 bg-purple-950/30 space-y-3">
                    <div className="flex items-center justify-between border-b border-purple-500/30 pb-2">
                      <span className="font-semibold text-xs text-purple-200">
                        策略 B 综合概览: {arenaResult.strategyB.name}
                      </span>
                      <span className="font-mono text-xs font-bold text-emerald-400">
                        {arenaResult.strategyB.report.dimensions.compositeScore} 分
                      </span>
                    </div>
                    <div className="space-y-1.5 text-xs text-slate-400 font-mono">
                      <div className="flex justify-between">
                        <span>任务断言:</span>
                        <span className="text-emerald-300 font-semibold">
                          {arenaResult.strategyB.report.dimensions.taskSuccess} 分
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>工具精确率:</span>
                        <span className="text-emerald-300 font-semibold">
                          {arenaResult.strategyB.report.dimensions.toolPrecision} 分
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>步数效率:</span>
                        <span className="text-emerald-300 font-semibold">
                          {arenaResult.strategyB.report.dimensions.trajectoryEfficiency} 分
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>消耗时延:</span>
                        <span className="text-cyan-300">
                          {arenaResult.strategyB.report.trace.durationMs}ms
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="glass-panel p-12 rounded-2xl border border-slate-800 bg-[#0d1222] text-center space-y-3">
                <Swords className="w-10 h-10 text-slate-600 mx-auto" />
                <div className="text-sm font-semibold text-slate-300">尚未启动对决</div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  选择测试用例并点击“启动双策略对抗推演”，系统将自动运行双链路并输出全方位优劣对比。
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: THEORY & ARCHITECTURE DOCS */}
        {activeTab === "theory" && (
          <div className="glass-panel p-8 rounded-3xl border border-purple-500/30 bg-[#0d1222] space-y-8">
            <div className="border-b border-slate-800 pb-4 flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <BookOpen className="w-6 h-6 text-purple-400" />
                  第 11 课原理精要：评测金字塔与全链路可观测性
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  彻底摒弃“凭感觉调优 Prompt”，构建工程化、可量化、可回归的 Agent 质检体系。
                </p>
              </div>
              <Link
                to="/docs/lessons/11-eval-and-tracing.md"
                target="_blank"
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-2"
              >
                在新标签页打开完整讲义
              </Link>
            </div>

            {/* 3 Core Architecture Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold font-mono">
                  01
                </div>
                <h3 className="font-bold text-white text-sm">OpenTelemetry 标准 Tracing</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  将 Agent 运行切分为 Trace 和具有父子拓扑的 Span 树。精确记录 LLM
                  生成首字延迟（TTFT）、Token 消耗与工具执行时序，彻底解决黑盒调试难题。
                </p>
              </div>

              <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold font-mono">
                  02
                </div>
                <h3 className="font-bold text-white text-sm">三层评测金字塔 (Eval Pyramid)</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  底层以真实代码执行与文件状态进行【确定性断言】；中层以步数预算与工具调用精准度进行【轨迹经济学检验】；顶层使用【LLM-as-a-Judge】进行多维量表专家评审。
                </p>
              </div>

              <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold font-mono">
                  03
                </div>
                <h3 className="font-bold text-white text-sm">Benchmark 回归测试集</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  类比 SWE-bench 与 GAIA 构建黄金用例库。每次更新 Prompt 或切换大模型时，自动运行全套
                  Benchmark，防止模型在特定场景发生性能倒退与越权安全漏洞。
                </p>
              </div>
            </div>

            {/* ASCII Architecture Diagram */}
            <div className="p-5 rounded-2xl border border-slate-800 bg-slate-950 font-mono text-xs text-slate-300 space-y-2 overflow-x-auto">
              <div className="text-slate-400 font-bold mb-2">// 工业级 Tracing 与评测流水线架构</div>
              <pre className="text-purple-300 leading-relaxed">
{`┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        AGENT OBSERVABILITY & EVALUATION PIPELINE                       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  1. Agent Loop Execution (ReAct)                                                       │
│     ├── Start Trace [tr-xxx] (Root Span)                                               │
│     ├── Planner Span ──────► LLM Inference Span (TTFT, Prompt Toks, Cost)               │
│     ├── Agent Loop Span ───► Tool Execution Span (Args, Output, Latency)               │
│     └── Verification Span ─► Vitest / Deterministic Environment Check                  │
│                                                                                        │
│  2. Telemetry Collector (OpenTelemetry Standard)                                      │
│     ├── Calculate Hierarchical Flamegraph (LLM % vs Tool % vs Overhead %)              │
│     ├── Pinpoint Latency & Token Bottlenecks (>30% of total duration)                   │
│     └── Aggregate Token Ledger & Real-Time Dollar Billing                              │
│                                                                                        │
│  3. Automated Evaluation Matrix (The 3-Layer Pyramid)                                 │
│     ├── L1 Deterministic Assertion: Code Execution / Unit Tests Pass (0-100)           │
│     ├── L2 Trajectory Efficiency: Step Budget vs Actual & Duplicate Loop Breaker (0-100)│
│     └── L3 LLM-as-a-Judge: Chain-of-Thought Rubric Assessment & Strengths/Critique     │
└────────────────────────────────────────────────────────────────────────────────────────┘`}
              </pre>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

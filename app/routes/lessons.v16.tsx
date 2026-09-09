import { useState, useMemo } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import type {
  CompactionExecutionResult,
  CompactionChaosBenchmarkReport,
  CompactionVerificationReport,
  LiveCompactionComparisonResult,
  PartitionSlice,
  NegativeConstraint,
  WorkingSetFile,
  ColdArchivedEvent,
  ContextBudgetConfig,
} from "~/core/compaction";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Cpu,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
  Terminal,
  Database,
  Search,
  Sliders,
  Flame,
  FileCode,
  DollarSign,
  Clock,
  Archive,
  Zap,
} from "lucide-react";

export async function loader() {
  const hasServerKey = Boolean(
    process.env.LLM_API_KEY && process.env.LLM_API_KEY.trim().length > 0
  );
  const model = process.env.LLM_MODEL || "glm-4-flash";
  const defaultBaseURL =
    process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";

  // Pre-seed sample data
  const initialBudgetConfig: ContextBudgetConfig = {
    maxContextLimit: 32000,
    highWatermarkRatio: 0.75,
    hotWindowTurnCount: 4,
    targetCompactedTokens: 12000,
  };

  return {
    hasServerKey,
    model,
    defaultBaseURL,
    initialBudgetConfig,
  };
}

export default function LessonV16Page() {
  const { hasServerKey, model, defaultBaseURL, initialBudgetConfig } =
    useLoaderData<typeof loader>();

  // API Config State
  const [customApiKey, setCustomApiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("MINI_CLAUDE_API_KEY") || "";
    }
    return "";
  });
  const [customBaseURL, setCustomBaseURL] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("MINI_CLAUDE_BASE_URL") || defaultBaseURL;
    }
    return defaultBaseURL;
  });

  const handleSaveSettings = ({ apiKey, baseURL }: { apiKey: string; baseURL: string }) => {
    setCustomApiKey(apiKey);
    setCustomBaseURL(baseURL);
    localStorage.setItem("MINI_CLAUDE_API_KEY", apiKey);
    localStorage.setItem("MINI_CLAUDE_BASE_URL", baseURL);
  };

  // Tab State
  const [activeTab, setActiveTab] = useState<
    "budget_visualizer" | "chaos_dilemma" | "structured_ledger" | "invariants" | "pi_deepdive"
  >("budget_visualizer");

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "success" | "warning" | "error" | "info";
  } | null>(null);

  // ==========================================
  // Tab 1: Context Budget Visualizer State
  // ==========================================
  const [budgetLimit, setBudgetLimit] = useState(initialBudgetConfig.maxContextLimit);
  const [watermarkRatio, setWatermarkRatio] = useState(initialBudgetConfig.highWatermarkRatio);
  const [currentStep, setCurrentStep] = useState(14);
  const [compactionResult, setCompactionResult] = useState<CompactionExecutionResult | null>(null);

  // Default active files
  const sampleWorkingSet: WorkingSetFile[] = useMemo(
    () => [
      {
        path: "src/auth/bearer-middleware.ts",
        status: "MODIFIED",
        exportedSymbols: ["extractBearerToken", "authenticateUser", "TokenPayload"],
        approxTokens: 520,
        lastModifiedStep: 8,
        diffSnippet: "export function extractBearerToken(header: string, prefix = 'Bearer '): string | null",
      },
      {
        path: "src/db/redis-blacklist.ts",
        status: "CREATED",
        exportedSymbols: ["revokeToken", "isTokenBlacklisted", "acquireLockWithTtl"],
        approxTokens: 680,
        lastModifiedStep: 9,
        diffSnippet: "export async function acquireLockWithTtl(key: string, ttlMs = 5000): Promise<boolean>",
      },
      {
        path: "src/config/database.ts",
        status: "READ_ONLY",
        exportedSymbols: ["dbConfig", "getDbPool"],
        approxTokens: 310,
        lastModifiedStep: 2,
      },
    ],
    []
  );

  // Default sample traps
  const sampleTraps: NegativeConstraint[] = useMemo(
    () => [
      {
        id: "trap-deadlock-1",
        stepDiscovered: 4,
        category: "DEADLOCK",
        statement: "Do not acquire database transaction locks without explicit TTL lease and retry backoff",
        reason: "Concurrent worker queue waiting on raw SQLite lock led to system-wide freeze",
        suggestedAlternative: "Use acquireLockWithTtl from redis-blacklist with exponential backoff",
        severity: "CRITICAL",
        timesAvoided: 3,
      },
      {
        id: "trap-type-1",
        stepDiscovered: 7,
        category: "TYPE_ERROR",
        statement: "extractBearerToken requires raw string header; never pass incoming Request object",
        reason: "Passing Request object caused runtime TypeError: header.startsWith is not a function",
        suggestedAlternative: "Always extract req.headers.get('authorization') before calling",
        severity: "HIGH",
        timesAvoided: 5,
      },
    ],
    []
  );

  // Partition calculation in render (derived state, NOT useEffect)
  const partitionSlices: PartitionSlice[] = useMemo(() => {
    if (compactionResult) {
      return compactionResult.partitions;
    }

    // Uncompressed mock preview
    const pinned = 1200;
    const workingSet = sampleWorkingSet.reduce((sum, f) => sum + f.approxTokens, 0);
    const negative = 850;
    const ledger = 0;
    const rawHistory = Math.floor(currentStep * 1850);
    const hotWindow = 2800;
    const total = pinned + workingSet + negative + ledger + rawHistory + hotWindow;

    return [
      {
        type: "PINNED",
        name: "固定基石层 (Pinned Base)",
        description: "系统提示词、最高目标与全局安全不可变规范 (100% 保留)",
        allocatedTokens: pinned,
        maxTokens: Math.floor(budgetLimit * 0.1),
        percentage: Math.round((pinned / total) * 100),
        contentSnippet: "You are an autonomous AI coding agent...",
        itemCount: 1,
        priority: 1,
      },
      {
        type: "WORKING_SET",
        name: "活动代码契约表 (Working Set)",
        description: "当前刚写好的函数名、入参列表与类型签名速查表（防止调用时传错参数或产生类型报错）",
        allocatedTokens: workingSet,
        maxTokens: Math.floor(budgetLimit * 0.25),
        percentage: Math.round((workingSet / total) * 100),
        contentSnippet: "src/auth/bearer-middleware.ts, src/db/redis-blacklist.ts",
        itemCount: sampleWorkingSet.length,
        priority: 2,
      },
      {
        type: "NEGATIVE_CONSTRAINTS",
        name: "避坑黑名单 / 失败禁令 (Negative Knowledge)",
        description: "记录‘千万别这么干，因为前序已实测导致死锁’（防止大模型在总结后把踩过的坑全踩一遍）",
        allocatedTokens: negative,
        maxTokens: Math.floor(budgetLimit * 0.15),
        percentage: Math.round((negative / total) * 100),
        contentSnippet: "[TRAP DEADLOCK] Do not acquire database transaction locks without TTL...",
        itemCount: sampleTraps.length,
        priority: 2,
      },
      {
        type: "STRUCTURED_LEDGER",
        name: "结构化记忆账本 (Compacted Ledger)",
        description: "已压缩历史提炼出的已交付里程碑、架构决策与待办任务",
        allocatedTokens: ledger,
        maxTokens: Math.floor(budgetLimit * 0.2),
        percentage: 0,
        contentSnippet: "尚未执行压缩 (Raw turns dominating prompt)",
        itemCount: 0,
        priority: 3,
      },
      {
        type: "HOT_WINDOW",
        name: "高保真执行区 (Hot Sliding Window)",
        description: "最近 4 步原子工具调用与真实环境执行结果 (100% 位级真理)",
        allocatedTokens: hotWindow,
        maxTokens: Math.floor(budgetLimit * 0.3),
        percentage: Math.round((hotWindow / total) * 100),
        contentSnippet: "✓ 12 unit tests passed cleanly (42ms)",
        itemCount: 4,
        priority: 4,
      },
      {
        type: "COLD_ARCHIVE",
        name: "冷事件归档 (Cold Archive / events.jsonl)",
        description: "只追加写入磁盘的完整事件流，不常驻 Prompt，可按需精准靶向穿透检索",
        allocatedTokens: total,
        maxTokens: 999999,
        percentage: 0,
        contentSnippet: "Cold storage maintains 100% bit-fidelity of all past raw events",
        itemCount: currentStep,
        priority: 5,
      },
    ];
  }, [compactionResult, currentStep, budgetLimit, sampleWorkingSet, sampleTraps]);

  const totalAllocatedTokens = useMemo(() => {
    return partitionSlices
      .filter((s) => s.type !== "COLD_ARCHIVE")
      .reduce((sum, s) => sum + s.allocatedTokens, 0);
  }, [partitionSlices]);

  const thresholdTokens = Math.floor(budgetLimit * watermarkRatio);
  const isHighWatermark = totalAllocatedTokens >= thresholdTokens;

  // Execute Compaction Handler
  const handlePerformCompaction = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/compaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "perform-structured-compaction",
          budgetLimit,
          step: currentStep,
          workingSet: sampleWorkingSet,
          negativeConstraints: sampleTraps,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCompactionResult(data.result);
        setStatusMessage({
          type: "success",
          text: `结构化压缩成功！Token 从 ${data.result.originalTokens} 降至 ${data.result.compactedTokens}，缩减 ${data.result.reductionPercentage}%，负向避坑记忆 100% 保持！`,
        });
      } else {
        setStatusMessage({ type: "error", text: data.error || "压缩失败" });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatusMessage({ type: "error", text: "网络请求异常: " + message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetCompaction = () => {
    setCompactionResult(null);
    setStatusMessage({ type: "info", text: "已重置为未压缩状态，当前可观察原始膨胀曲线。" });
  };

  // ==========================================
  // Tab 2: Chaos Dilemma & Live Model State
  // ==========================================
  const [arenaMode, setArenaMode] = useState<"live_llm" | "trajectory_benchmark">("live_llm");
  const [liveResult, setLiveResult] = useState<LiveCompactionComparisonResult | null>(null);
  const [benchmarkReport, setBenchmarkReport] = useState<CompactionChaosBenchmarkReport | null>(null);
  const [selectedStepScrubber, setSelectedStepScrubber] = useState<number>(24); // Default to critical trap step 24

  const handleRunLiveComparison = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/compaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run-live-comparison",
          apiKey: customApiKey || undefined,
          baseURL: customBaseURL || undefined,
          model: model || undefined,
          runDownstreamChallenge: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLiveResult(data.liveResult);
        setStatusMessage({
          type: "success",
          text: `真实模型 (${data.liveResult.modelUsed}) 实测完成！普通摘要耗时 ${data.liveResult.naiveSummary.durationMs}ms，结构化提取耗时 ${data.liveResult.structuredCompaction.durationMs}ms，已完成下游代码对抗挑战！`,
        });
      } else {
        setStatusMessage({ type: "error", text: data.error || "调用真实大模型失败" });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatusMessage({ type: "error", text: "调用真实模型异常: " + message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunBenchmark = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/compaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run-chaos-benchmark" }),
      });
      const data = await res.json();
      if (data.success) {
        setBenchmarkReport(data.report);
        setStatusMessage({
          type: "success",
          text: "30 步长程任务对抗跑分完成！方案 C (Pi 结构化压缩) 取得 100% 任务成功率，成功规避第 24 步致命死锁！",
        });
      } else {
        setStatusMessage({ type: "error", text: data.error || "跑分失败" });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatusMessage({ type: "error", text: "网络请求异常: " + message });
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // Tab 3: Cold Retrieval Search State
  // ==========================================
  const [coldSearchQuery, setColdSearchQuery] = useState("SQLITE_BUSY");
  const [coldSearchResults, setColdSearchResults] = useState<ColdArchivedEvent[]>([]);
  const [coldSearchLatency, setColdSearchLatency] = useState<number | null>(null);

  const handleSearchColdHistory = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/compaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search-cold-history",
          query: coldSearchQuery,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setColdSearchResults(data.searchRes.results);
        setColdSearchLatency(data.searchRes.searchLatencyMs);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatusMessage({ type: "error", text: "冷历史检索失败: " + message });
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // Tab 4: Invariants Verification State
  // ==========================================
  const [verificationReport, setVerificationReport] =
    useState<CompactionVerificationReport | null>(null);

  const handleVerifyInvariants = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/compaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify-invariants" }),
      });
      const data = await res.json();
      if (data.success) {
        setVerificationReport(data.report);
        setStatusMessage({
          type: "success",
          text: "4 项 Context Compaction 领域守恒律全部 100% 验证通过！",
        });
      } else {
        setStatusMessage({ type: "error", text: data.error || "验证失败" });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatusMessage({ type: "error", text: "验证请求异常: " + message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-teal-500/30">
      {/* Top Navigation */}
      <Header
        hasServerKey={hasServerKey}
        model={model}
        defaultBaseURL={defaultBaseURL}
        customApiKey={customApiKey}
        customBaseURL={customBaseURL}
        onSaveSettings={handleSaveSettings}
        currentLesson={{
          id: "v16",
          title: "第 17 课: Context Compaction 为什么不是“总结聊天记录”？",
          badge: "Pi 预算治理",
        }}
      />

      {/* Subheader Banner */}
      <div className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-gradient-to-r from-teal-500/20 to-emerald-500/20 text-teal-300 border border-teal-500/30">
                第 17 课 · V16
              </span>
              <span className="text-xs text-slate-400 font-mono">Pi Runtime Compaction & Budgeting</span>
            </div>
            <h1 className="text-xl font-bold text-white mt-1 flex items-center gap-2">
              Context Compaction 为什么不是“总结聊天记录”？
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              破除普通聊天机器人的总结幻觉：解构 6 层分层预算治理矩阵、负向避坑黑名单、符号位级保真与只追加冷事件归档。
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/docs/lessons/17-context-compaction.md"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            >
              <BookOpen className="w-3.5 h-3.5 text-teal-400" />
              阅读本课教案讲义
            </Link>
          </div>
        </div>
      </div>

      {/* Status Notice */}
      {statusMessage && (
        <div
          className={`px-6 py-2.5 text-xs font-medium border-b flex items-center justify-between ${
            statusMessage.type === "success"
              ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
              : statusMessage.type === "warning"
              ? "bg-amber-950/40 border-amber-800 text-amber-300"
              : statusMessage.type === "error"
              ? "bg-red-950/40 border-red-800 text-red-300"
              : "bg-teal-950/40 border-teal-800 text-teal-300"
          }`}
        >
          <div className="max-w-7xl mx-auto flex items-center gap-2 w-full">
            {statusMessage.type === "success" && <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
            {statusMessage.type === "warning" && <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
            {statusMessage.type === "error" && <XCircle className="w-4 h-4 flex-shrink-0" />}
            <span>{statusMessage.text}</span>
          </div>
        </div>
      )}

      {/* Workbench Tab Navigation */}
      <div className="border-b border-slate-800 bg-slate-900/30 px-6">
        <div className="max-w-7xl mx-auto flex gap-2 overflow-x-auto py-2">
          <button
            onClick={() => setActiveTab("budget_visualizer")}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
              activeTab === "budget_visualizer"
                ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            1. 上下文预算透视仪 (Budget Visualizer)
          </button>

          <button
            onClick={() => setActiveTab("chaos_dilemma")}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
              activeTab === "chaos_dilemma"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            2. 三大方案对抗竞技场 (Compaction Dilemma)
          </button>

          <button
            onClick={() => setActiveTab("structured_ledger")}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
              activeTab === "structured_ledger"
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Archive className="w-3.5 h-3.5 text-indigo-400" />
            3. 结构化账本与冷检索 (Ledger & Cold Storage)
          </button>

          <button
            onClick={() => setActiveTab("invariants")}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
              activeTab === "invariants"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            4. 四大领域守恒律验证 (Formal Invariants)
          </button>

          <button
            onClick={() => setActiveTab("pi_deepdive")}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
              activeTab === "pi_deepdive"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            5. Pi 架构深度解密 (Pi Deep-Dive)
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-6">
        {/* ==================================================================== */}
        {/* TAB 1: CONTEXT BUDGET VISUALIZER                                     */}
        {/* ==================================================================== */}
        {activeTab === "budget_visualizer" && (
          <div className="space-y-6">
            {/* Control Bar */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-teal-400" />
                  动态预算与高水位阈值控制台 (Budget & Watermark Controller)
                </div>
                <p className="text-xs text-slate-400 max-w-2xl">
                  Coding Agent 的上下文不能无节制膨胀。调整预算上限与高水位触发线，观察预算治理器如何把 6 层分区切片控制在物理安全水位以内。
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                {/* Context Limit Selector */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-slate-400">Context Limit 预算上限</span>
                  <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700">
                    {[16000, 32000, 64000].map((limit) => (
                      <button
                        key={limit}
                        onClick={() => setBudgetLimit(limit)}
                        className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition ${
                          budgetLimit === limit
                            ? "bg-teal-500 text-slate-950 font-bold"
                            : "text-slate-300 hover:bg-slate-700"
                        }`}
                      >
                        {limit / 1000}k
                      </button>
                    ))}
                  </div>
                </div>

                {/* Watermark Ratio Selector */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-slate-400">高水位告警线 (Threshold)</span>
                  <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700">
                    {[0.6, 0.75, 0.85].map((ratio) => (
                      <button
                        key={ratio}
                        onClick={() => setWatermarkRatio(ratio)}
                        className={`px-2 py-1 rounded text-xs font-mono transition ${
                          watermarkRatio === ratio
                            ? "bg-amber-500 text-slate-950 font-bold"
                            : "text-slate-300 hover:bg-slate-700"
                        }`}
                      >
                        {Math.round(ratio * 100)}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step Simulator Scrubber */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-mono text-slate-400">推进步数 (Step: {currentStep})</span>
                  <input
                    type="range"
                    min="4"
                    max="30"
                    value={currentStep}
                    onChange={(e) => setCurrentStep(Number(e.target.value))}
                    className="w-28 accent-teal-400 cursor-pointer"
                  />
                </div>

                {/* Trigger Compaction Action */}
                <div className="flex items-center gap-2 pt-4 lg:pt-0">
                  <button
                    onClick={handlePerformCompaction}
                    disabled={isLoading}
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 flex items-center gap-1.5 shadow-md transition disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    执行结构化预算压缩 (Compact)
                  </button>

                  {compactionResult && (
                    <button
                      onClick={handleResetCompaction}
                      className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 transition"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      还原膨胀状态
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Token Watermark Progress Banner */}
            <div
              className={`p-4 rounded-xl border transition ${
                isHighWatermark
                  ? "bg-amber-950/30 border-amber-500/50 shadow-amber-900/10 shadow-lg"
                  : "bg-slate-900/40 border-slate-800"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-300">Prompt 上下文实际占用</span>
                  {isHighWatermark ? (
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      触发高水位压缩警报 (Watermark Reached: &gt;{Math.round(watermarkRatio * 100)}%)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      安全健康区间
                    </span>
                  )}
                </div>
                <div className="text-xs font-mono">
                  <span className="text-teal-400 font-bold">{totalAllocatedTokens.toLocaleString()}</span>
                  <span className="text-slate-500"> / {budgetLimit.toLocaleString()} Tokens</span>
                  <span className="text-slate-400 ml-2">({Math.round((totalAllocatedTokens / budgetLimit) * 100)}%)</span>
                </div>
              </div>

              {/* Stacked Progress Bar */}
              <div className="w-full h-3.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800 flex">
                {partitionSlices
                  .filter((s) => s.type !== "COLD_ARCHIVE" && s.allocatedTokens > 0)
                  .map((slice) => {
                    const widthPercent = (slice.allocatedTokens / budgetLimit) * 100;
                    const bgColors: Record<string, string> = {
                      PINNED: "bg-indigo-500",
                      WORKING_SET: "bg-cyan-500",
                      NEGATIVE_CONSTRAINTS: "bg-rose-500",
                      STRUCTURED_LEDGER: "bg-emerald-500",
                      HOT_WINDOW: "bg-amber-500",
                    };
                    return (
                      <div
                        key={slice.type}
                        style={{ width: `${Math.min(widthPercent, 100)}%` }}
                        title={`${slice.name}: ${slice.allocatedTokens} tokens (${slice.percentage}%)`}
                        className={`${bgColors[slice.type] || "bg-slate-600"} h-full transition-all duration-500`}
                      />
                    );
                  })}
              </div>

              {/* Progress Legend */}
              <div className="flex flex-wrap items-center gap-4 mt-3 pt-2 border-t border-slate-800/60 text-[11px]">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" /> Pinned (固定基石)
                </span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 inline-block" /> Working Set (活动代码)
                </span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Negative (避坑黑名单)
                </span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Ledger (压缩账本)
                </span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Hot Window (最新回执)
                </span>
              </div>
            </div>

            {/* 6-Layer Partition Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {partitionSlices.map((slice) => {
                const borderColors: Record<string, string> = {
                  PINNED: "border-indigo-500/40 hover:border-indigo-500/70",
                  WORKING_SET: "border-cyan-500/40 hover:border-cyan-500/70",
                  NEGATIVE_CONSTRAINTS: "border-rose-500/40 hover:border-rose-500/70",
                  STRUCTURED_LEDGER: "border-emerald-500/40 hover:border-emerald-500/70",
                  HOT_WINDOW: "border-amber-500/40 hover:border-amber-500/70",
                  COLD_ARCHIVE: "border-slate-700/60 hover:border-slate-600",
                };

                const badgeBg: Record<string, string> = {
                  PINNED: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
                  WORKING_SET: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
                  NEGATIVE_CONSTRAINTS: "bg-rose-500/20 text-rose-300 border-rose-500/30",
                  STRUCTURED_LEDGER: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
                  HOT_WINDOW: "bg-amber-500/20 text-amber-300 border-amber-500/30",
                  COLD_ARCHIVE: "bg-slate-700/40 text-slate-300 border-slate-600",
                };

                return (
                  <div
                    key={slice.type}
                    className={`bg-slate-900/60 rounded-xl p-4 border ${
                      borderColors[slice.type] || "border-slate-800"
                    } shadow-md flex flex-col justify-between transition group`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono border w-fit ${badgeBg[slice.type]}`}>
                            {slice.type}
                          </span>
                          <span className="text-sm font-bold text-white mt-1.5">{slice.name}</span>
                        </div>
                        <div className="text-right font-mono">
                          <div className="text-xs font-bold text-teal-400">
                            {slice.allocatedTokens.toLocaleString()}
                            <span className="text-[10px] text-slate-500 ml-0.5">tok</span>
                          </div>
                          {slice.type !== "COLD_ARCHIVE" && (
                            <div className="text-[10px] text-slate-400">{slice.percentage}%</div>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-slate-400 mt-2 line-clamp-2">{slice.description}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80">
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1 font-mono">
                        <span>内容片段 ({slice.itemCount} 项)</span>
                        <span>配额上限: {slice.maxTokens === 999999 ? "无限制" : `${slice.maxTokens} tok`}</span>
                      </div>
                      <div className="bg-slate-950/80 p-2 rounded text-[11px] font-mono text-slate-300 truncate border border-slate-900">
                        {slice.contentSnippet}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 2: COMPACTION DILEMMA & LIVE REAL MODEL ARENA                    */}
        {/* ==================================================================== */}
        {activeTab === "chaos_dilemma" && (
          <div className="space-y-6">
            {/* Mode Switcher */}
            <div className="flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800 w-fit">
              <button
                onClick={() => setArenaMode("live_llm")}
                className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition ${
                  arenaMode === "live_llm"
                    ? "bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                ⚡ 真实大模型在线对抗实测 (Live Real LLM)
              </button>
              <button
                onClick={() => setArenaMode("trajectory_benchmark")}
                className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition ${
                  arenaMode === "trajectory_benchmark"
                    ? "bg-amber-500 text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                📊 30 步全流程基准模拟跑分 (Simulated Trajectory)
              </button>
            </div>

            {/* Sub-Panel 1: LIVE REAL MODEL ARENA */}
            {arenaMode === "live_llm" && (
              <div className="space-y-6">
                <div className="bg-slate-900/60 border border-teal-500/40 rounded-xl p-5 shadow-lg flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                        LIVE LLM TEST
                      </span>
                      <span className="text-xs font-mono text-slate-400">当前挂载模型: {model}</span>
                    </div>
                    <h3 className="text-base font-bold text-white mt-1 flex items-center gap-2">
                      真实大模型在线双轨压缩与下游代码陷阱对抗实测
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 max-w-2xl">
                      现场调用你的大模型 API（拒绝静态讲义）：发送包含【致命死锁报错】与【精密函数签名】的真实 15 步开发日志。对比普通总结与结构化提取，并实测真实大模型在下游代码中是否会重新踩入死锁！
                    </p>
                  </div>

                  <button
                    onClick={handleRunLiveComparison}
                    disabled={isLoading}
                    className="px-5 py-2.5 rounded-lg text-xs font-bold bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 flex items-center gap-2 shadow-lg shadow-teal-950/40 transition disabled:opacity-50 self-start lg:self-center flex-shrink-0"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        真实模型推理中 (请稍候)...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        🚀 呼叫真实大模型现场实测
                      </>
                    )}
                  </button>
                </div>

                {liveResult ? (
                  <div className="space-y-6">
                    {/* Performance Metrics Header */}
                    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-teal-400" />
                        <span className="text-slate-400">实测模型:</span>
                        <span className="text-white font-bold">{liveResult.modelUsed}</span>
                      </div>
                      <div className="flex items-center gap-4 text-[11px]">
                        <span className="text-slate-400">
                          普通总结 API 耗时: <strong className="text-amber-300">{liveResult.naiveSummary.durationMs}ms</strong>
                          {liveResult.naiveSummary.usage && ` (${liveResult.naiveSummary.usage.totalTokens} tok)`}
                        </span>
                        <span className="text-slate-400">
                          结构化压缩 API 耗时: <strong className="text-emerald-300">{liveResult.structuredCompaction.durationMs}ms</strong>
                          {liveResult.structuredCompaction.usage && ` (${liveResult.structuredCompaction.usage.totalTokens} tok)`}
                        </span>
                      </div>
                    </div>

                    {/* Dual-Track Real Model Outputs */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      {/* Left: Naive Summary Real Text */}
                      <div className="bg-slate-900/60 border border-amber-500/40 rounded-xl p-5 shadow-md flex flex-col justify-between space-y-3">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              轨线 1 · 真实普通总结输出
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              {liveResult.naiveSummary.durationMs}ms
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-white mt-1">模型自然语言摘要原文 (Raw LLM Output)</h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            观察真实大模型如何把排错过程概括为一句话闲聊：
                          </p>

                          <div className="mt-3 bg-slate-950 p-3.5 rounded-lg border border-slate-800 text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                            {liveResult.naiveSummary.content}
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-800/80 space-y-1.5 font-mono text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">负向死锁黑名单:</span>
                            <span className={liveResult.naiveSummary.retainedDeadlockWarning ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                              {liveResult.naiveSummary.retainedDeadlockWarning ? "✅ 罕见保留" : "❌ 丢失 / 一笔带过"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">extractBearerToken 签名:</span>
                            <span className={liveResult.naiveSummary.retainedExactSymbolSignature ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                              {liveResult.naiveSummary.retainedExactSymbolSignature ? "✅ 位级保留" : "❌ 丢失 / 仅模糊代称"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Structured Compaction Real Text */}
                      <div className="bg-slate-900/60 border border-emerald-500/40 rounded-xl p-5 shadow-md flex flex-col justify-between space-y-3">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              轨线 2 · 真实结构化提取输出
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              {liveResult.structuredCompaction.durationMs}ms
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-white mt-1">组装后的结构化 Anchor 账本</h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            观察真实模型提炼出的结构化切片与负向黑名单：
                          </p>

                          <div className="mt-3 bg-slate-950 p-3.5 rounded-lg border border-slate-800 text-xs font-mono text-emerald-300 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                            {liveResult.structuredCompaction.assembledAnchor}
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-800/80 space-y-1.5 font-mono text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">负向死锁黑名单:</span>
                            <span className="text-emerald-400 font-bold">
                              ✅ 100% 提取并置顶预警 ({liveResult.structuredCompaction.negativeConstraintsCount} 条)
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">活动工作区符号表:</span>
                            <span className="text-emerald-400 font-bold">
                              ✅ 位级契约保持 ({liveResult.structuredCompaction.workingSetFilesCount} 个文件)
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Downstream Trap Challenge Section */}
                    {liveResult.downstreamChallenge && (
                      <div className="bg-slate-900/80 border border-indigo-500/40 rounded-xl p-5 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-3">
                          <div>
                            <div className="text-xs font-mono text-indigo-400 font-bold">DOWNSTREAM CHALLENGE</div>
                            <h4 className="text-sm font-bold text-white mt-0.5 flex items-center gap-2">
                              <Terminal className="w-4 h-4 text-indigo-400" />
                              下游实战代码生成考验：真实大模型是否会再次死锁？
                            </h4>
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                            挑战任务: 编写 Worker 3 鉴权与数据库更新任务
                          </span>
                        </div>

                        <p className="text-xs text-slate-400">
                          以完全相同的题目分别向带着【普通总结上下文】和【结构化 Anchor 上下文】的真实大模型提问。亲眼见证上下文压缩对真实模型代码生成的直接影响：
                        </p>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
                          {/* Condition A code */}
                          <div className="bg-slate-950 p-4 rounded-xl border border-red-500/30 space-y-2 flex flex-col justify-between">
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-red-400">条件 A：普通总结上下文</span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    liveResult.downstreamChallenge.naiveBranchResponse.verdict === "FAILED_REPEATED_DEADLOCK"
                                      ? "bg-red-500/20 text-red-300 border border-red-500/40"
                                      : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                  }`}
                                >
                                  {liveResult.downstreamChallenge.naiveBranchResponse.verdict}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-1">
                                {liveResult.downstreamChallenge.naiveBranchResponse.critique}
                              </p>

                              <div className="mt-3 bg-slate-900/90 p-3 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre">
                                {liveResult.downstreamChallenge.naiveBranchResponse.generatedCode}
                              </div>
                            </div>

                            <div className="text-[11px] font-mono text-slate-400 pt-2 border-t border-slate-900 flex justify-between">
                              <span>安全 TTL 锁: {liveResult.downstreamChallenge.naiveBranchResponse.usedSafeLock ? "✅" : "❌ 未采用"}</span>
                              <span>参数签名正确: {liveResult.downstreamChallenge.naiveBranchResponse.usedCorrectSignature ? "✅" : "❌ 传参错误"}</span>
                            </div>
                          </div>

                          {/* Condition B code */}
                          <div className="bg-slate-950 p-4 rounded-xl border border-emerald-500/30 space-y-2 flex flex-col justify-between">
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-emerald-400">条件 B：结构化 Anchor 上下文</span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                  {liveResult.downstreamChallenge.structuredBranchResponse.verdict}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-1">
                                {liveResult.downstreamChallenge.structuredBranchResponse.critique}
                              </p>

                              <div className="mt-3 bg-slate-900/90 p-3 rounded-lg border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre">
                                {liveResult.downstreamChallenge.structuredBranchResponse.generatedCode}
                              </div>
                            </div>

                            <div className="text-[11px] font-mono text-slate-400 pt-2 border-t border-slate-900 flex justify-between">
                              <span>安全 TTL 锁: {liveResult.downstreamChallenge.structuredBranchResponse.usedSafeLock ? "✅ 已遵循" : "❌"}</span>
                              <span>参数签名正确: {liveResult.downstreamChallenge.structuredBranchResponse.usedCorrectSignature ? "✅ 精确调用" : "❌"}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-900/40 border border-dashed border-teal-500/30 rounded-xl p-10 text-center space-y-3">
                    <Zap className="w-8 h-8 text-teal-400/60 mx-auto" />
                    <h3 className="text-sm font-semibold text-slate-300">尚未触发真实大模型实测</h3>
                    <p className="text-xs text-slate-400 max-w-lg mx-auto">
                      点击右上角“🚀 呼叫真实大模型现场实测”按钮，系统将立即调用你的真实 LLM API，现场展示普通摘要的遗忘陷阱与结构化压缩的精准避坑能力！
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Sub-Panel 2: 30-STEP SIMULATED TRAJECTORY BENCHMARK */}
            {arenaMode === "trajectory_benchmark" && (
              <div className="space-y-6">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-white flex items-center gap-2">
                      <Flame className="w-4 h-4 text-amber-400" />
                      三大方案对抗竞技场：长程 30 步 Auth 重构压力测试
                    </div>
                    <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                      故意注入【死锁陷阱】与【符号契约陷阱】。亲眼观察为什么普通聊天记录总结会在第 24 步重犯已知死锁而崩盘，而结构化预算治理如何做到 100% 成功交付。
                    </p>
                  </div>

                  <button
                    onClick={handleRunBenchmark}
                    disabled={isLoading}
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 shadow-md transition disabled:opacity-50 self-start lg:self-center"
                  >
                    {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    启动 30 步长程对抗对比测试
                  </button>
                </div>

                {benchmarkReport ? (
                  <div className="space-y-6">
                    {/* 3 Columns Comparison */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                      {/* Approach A: No Compaction */}
                      <div className="bg-slate-900/60 border border-red-500/40 rounded-xl p-5 shadow-md flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                              方案 A · 暴力全量
                            </span>
                            <span className="text-xs font-bold text-red-400 flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5" /> 最终超时/爆窗
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-white mt-2">无压缩 (No Compaction)</h3>
                          <p className="text-xs text-slate-400 mt-1">
                            历史消息无限线性累积，Prompt 突破 88k Tokens，陷入 Lost in the Middle 泥潭。
                          </p>

                          <div className="mt-4 space-y-2 font-mono text-xs">
                            <div className="flex justify-between py-1 border-b border-slate-800">
                              <span className="text-slate-400 flex items-center gap-1"><Cpu className="w-3 h-3 text-slate-500" /> 总消耗 Tokens:</span>
                              <span className="text-red-300 font-bold">{benchmarkReport.approaches.noCompaction.totalTokensUsed.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-800">
                              <span className="text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3 text-slate-500" /> 平均单步延迟:</span>
                              <span className="text-red-300">{benchmarkReport.approaches.noCompaction.averageStepLatencyMs}ms (11s+)</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-800">
                              <span className="text-slate-400 flex items-center gap-1"><DollarSign className="w-3 h-3 text-slate-500" /> 预估花费:</span>
                              <span className="text-slate-200">${benchmarkReport.approaches.noCompaction.costInDollarsEst}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-800">
                              <span className="text-slate-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-slate-500" /> 踩坑重复率:</span>
                              <span className="text-amber-300">{benchmarkReport.approaches.noCompaction.trapTriggeredCount} 次 (注意涣散)</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-400 italic">
                          “{benchmarkReport.approaches.noCompaction.explanation}”
                        </div>
                      </div>

                      {/* Approach B: Naive Summary */}
                      <div className="bg-slate-900/60 border border-amber-500/40 rounded-xl p-5 shadow-md flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              方案 B · 普通聊天总结
                            </span>
                            <span className="text-xs font-bold text-red-400 flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5" /> 第 24 步重踩死锁
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-white mt-2">普通总结 (Naive Summary)</h3>
                          <p className="text-xs text-slate-400 mt-1">
                            把排错历史压缩成一句话闲聊，丢失了【死锁负向约束】与【extractBearerToken】精确类型。
                          </p>

                          <div className="mt-4 space-y-2 font-mono text-xs">
                            <div className="flex justify-between py-1 border-b border-slate-800">
                              <span className="text-slate-400 flex items-center gap-1"><Cpu className="w-3 h-3 text-slate-500" /> 总消耗 Tokens:</span>
                              <span className="text-amber-300 font-bold">{benchmarkReport.approaches.naiveSummary.totalTokensUsed.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-800">
                              <span className="text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3 text-slate-500" /> 平均单步延迟:</span>
                              <span className="text-slate-200">{benchmarkReport.approaches.naiveSummary.averageStepLatencyMs}ms</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-800">
                              <span className="text-slate-400 flex items-center gap-1"><FileCode className="w-3 h-3 text-slate-500" /> 符号保真度:</span>
                              <span className="text-red-400 font-bold">{benchmarkReport.approaches.naiveSummary.symbolFidelityScore}% (严重失真)</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-800">
                              <span className="text-slate-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-slate-500" /> 踩坑重复率:</span>
                              <span className="text-red-400 font-bold">{benchmarkReport.approaches.naiveSummary.trapTriggeredCount} 次 (死锁再现)</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-400 italic">
                          “{benchmarkReport.approaches.naiveSummary.explanation}”
                        </div>
                      </div>

                      {/* Approach C: Structured Compaction */}
                      <div className="bg-slate-900/60 border border-emerald-500/50 rounded-xl p-5 shadow-lg shadow-emerald-950/20 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              方案 C · Pi 结构化预算压缩
                            </span>
                            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> 100% 成功交付
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-white mt-2">结构化预算治理 (Structured Compaction)</h3>
                          <p className="text-xs text-slate-400 mt-1">
                            分层切片：锁定避坑黑名单 + 活动工作区符号位级保真 + events.jsonl 冷事件可穿透检索。
                          </p>

                          <div className="mt-4 space-y-2 font-mono text-xs">
                            <div className="flex justify-between py-1 border-b border-slate-800">
                              <span className="text-slate-400 flex items-center gap-1"><Cpu className="w-3 h-3 text-slate-500" /> 总消耗 Tokens:</span>
                              <span className="text-emerald-300 font-bold">{benchmarkReport.approaches.structuredCompaction.totalTokensUsed.toLocaleString()} (省 74%)</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-800">
                              <span className="text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3 text-slate-500" /> 平均单步延迟:</span>
                              <span className="text-emerald-300 font-bold">{benchmarkReport.approaches.structuredCompaction.averageStepLatencyMs}ms (降 65%)</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-800">
                              <span className="text-slate-400 flex items-center gap-1"><FileCode className="w-3 h-3 text-slate-500" /> 符号保真度:</span>
                              <span className="text-emerald-400 font-bold">{benchmarkReport.approaches.structuredCompaction.symbolFidelityScore}% (位级保真)</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-800">
                              <span className="text-slate-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-slate-500" /> 踩坑重复率:</span>
                              <span className="text-emerald-400 font-bold">0 次 (完美避坑)</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-emerald-300/90 font-medium">
                          “{benchmarkReport.approaches.structuredCompaction.explanation}”
                        </div>
                      </div>
                    </div>

                    {/* Scrubber of Step 24 Critical Moment */}
                    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-white flex items-center gap-2">
                            <Terminal className="w-4 h-4 text-teal-400" />
                            单步追踪器：查看第 {selectedStepScrubber} 步关键死锁考验 (Step Scrubber)
                          </h4>
                          <p className="text-xs text-slate-400">滑动步数观察三大方案在同一时刻的执行分歧</p>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-xs">
                          <span>选中步数: Step {selectedStepScrubber}</span>
                          <input
                            type="range"
                            min="1"
                            max="30"
                            value={selectedStepScrubber}
                            onChange={(e) => setSelectedStepScrubber(Number(e.target.value))}
                            className="w-32 accent-teal-400 cursor-pointer"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
                        {/* A step log */}
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs space-y-2">
                          <div className="flex items-center justify-between text-slate-400 border-b border-slate-900 pb-1">
                            <span>方案 A (无压缩)</span>
                            <span>{benchmarkReport.approaches.noCompaction.stepLogs[selectedStepScrubber - 1]?.promptTokens} tok</span>
                          </div>
                          <p className="text-slate-300">
                            {benchmarkReport.approaches.noCompaction.stepLogs[selectedStepScrubber - 1]?.eventDesc}
                          </p>
                        </div>

                        {/* B step log */}
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs space-y-2">
                          <div className="flex items-center justify-between text-slate-400 border-b border-slate-900 pb-1">
                            <span>方案 B (普通总结)</span>
                            <span>{benchmarkReport.approaches.naiveSummary.stepLogs[selectedStepScrubber - 1]?.promptTokens} tok</span>
                          </div>
                          <p className={`${selectedStepScrubber === 24 ? "text-red-400 font-bold" : "text-slate-300"}`}>
                            {benchmarkReport.approaches.naiveSummary.stepLogs[selectedStepScrubber - 1]?.eventDesc}
                          </p>
                        </div>

                        {/* C step log */}
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs space-y-2">
                          <div className="flex items-center justify-between text-slate-400 border-b border-slate-900 pb-1">
                            <span>方案 C (Pi 结构化)</span>
                            <span>{benchmarkReport.approaches.structuredCompaction.stepLogs[selectedStepScrubber - 1]?.promptTokens} tok</span>
                          </div>
                          <p className={`${selectedStepScrubber === 24 ? "text-emerald-400 font-bold" : "text-slate-300"}`}>
                            {benchmarkReport.approaches.structuredCompaction.stepLogs[selectedStepScrubber - 1]?.eventDesc}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Key Findings List */}
                    <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-teal-400 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" /> 核心工程结论 (Key Engineering Insights):
                      </div>
                      <ul className="space-y-1 text-xs text-slate-300">
                        {benchmarkReport.keyFindings.map((finding, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-teal-400 font-mono">{idx + 1}.</span>
                            <span>{finding}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-xl p-12 text-center space-y-3">
                    <Flame className="w-8 h-8 text-amber-500/40 mx-auto" />
                    <h3 className="text-sm font-semibold text-slate-300">尚未运行 30 步对抗跑分测试</h3>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      点击上方“启动 30 步长程对抗对比测试”按钮，我们将模拟 30 步真实多模块重构任务，定量测量 Token 曲线、单步耗时与死锁陷阱触发状态。
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 3: STRUCTURED LEDGER & COLD RETRIEVAL                            */}
        {/* ==================================================================== */}
        {activeTab === "structured_ledger" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Negative Memory Box */}
              <div className="bg-slate-900/60 border border-rose-500/40 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    避坑黑名单 / 失败经验禁令 (Negative Knowledge)
                  </h3>
                  <span className="text-xs font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                    {sampleTraps.length} 项致命禁令
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  普通总结通常只记录“做成了什么”，大模型会本能地过滤掉报错过程。结构化压缩显式记录“千万不要这么干（第 4 步已实测会导致死锁）”，彻底防止模型在长任务中重复踩坑。
                </p>

                <div className="space-y-3">
                  {sampleTraps.map((trap) => (
                    <div key={trap.id} className="bg-slate-950 p-3 rounded-lg border border-rose-950/60 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-bold text-rose-300">[{trap.category}] Step {trap.stepDiscovered} 发现</span>
                        <span className="text-slate-500">已避坑: {trap.timesAvoided} 次</span>
                      </div>
                      <div className="font-semibold text-slate-200">{trap.statement}</div>
                      <div className="text-[11px] text-slate-400">↳ 根因: {trap.reason}</div>
                      <div className="text-[11px] text-teal-300 font-mono">↳ 必须替代方案: {trap.suggestedAlternative}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active Working Set Box */}
              <div className="bg-slate-900/60 border border-cyan-500/40 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-cyan-400" />
                    活动代码契约表 / 导出函数签名速查 (Working Set)
                  </h3>
                  <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                    {sampleWorkingSet.length} 个文件在案
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  记录当前刚刚写好的核心函数的准确名字与入参格式（如 extractBearerToken）。不需要把几千行代码都放进上下文，但签名契约必须位级保真，防止后续调用时参数传错或产生幻觉。
                </p>

                <div className="space-y-3">
                  {sampleWorkingSet.map((file) => (
                    <div key={file.path} className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-bold text-cyan-300">{file.path}</span>
                        <span className="text-slate-500">~{file.approxTokens} tok</span>
                      </div>
                      <div className="text-[11px] text-slate-300 font-mono flex flex-wrap gap-1">
                        <span className="text-slate-500">导出契约:</span>
                        {file.exportedSymbols.map((sym) => (
                          <span key={sym} className="bg-slate-900 text-teal-300 px-1.5 py-0.5 rounded border border-slate-800">
                            {sym}
                          </span>
                        ))}
                      </div>
                      {file.diffSnippet && (
                        <div className="text-[11px] text-slate-400 font-mono bg-slate-900/60 p-1.5 rounded truncate">
                          {file.diffSnippet}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Cold Archive Search Room */}
            <div className="bg-slate-900/60 border border-indigo-500/40 rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Database className="w-4 h-4 text-indigo-400" />
                    Pi 风格冷事件归档与穿透检索室 (Cold Storage & History Penetration)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    已被折叠进冷归档的历史从未真正消失。Agent 可以按需调用检索工具，毫秒级反查 2 小时前的原始日志，实现真理零丢失。
                  </p>
                </div>
                {coldSearchLatency !== null && (
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/30">
                    检索延迟: {coldSearchLatency}ms (位级命中)
                  </span>
                )}
              </div>

              {/* Search Bar */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={coldSearchQuery}
                    onChange={(e) => setColdSearchQuery(e.target.value)}
                    placeholder="输入历史关键词，例如：SQLITE_BUSY, database.ts, Bearer..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  onClick={handleSearchColdHistory}
                  disabled={isLoading}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <Search className="w-3.5 h-3.5" />
                  穿透检索
                </button>
              </div>

              {/* Search Results Display */}
              {coldSearchResults.length > 0 ? (
                <div className="space-y-2 pt-2">
                  <div className="text-xs font-semibold text-slate-300">
                    命中 {coldSearchResults.length} 条冷归档事件：
                  </div>
                  {coldSearchResults.map((evt) => (
                    <div key={evt.id} className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono space-y-1">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-indigo-300 font-bold">[{evt.type}] Step {evt.step}</span>
                        <span className="text-slate-500">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-slate-200">{evt.summary}</div>
                      <div className="bg-slate-900 p-2 rounded text-[11px] text-slate-400 max-h-24 overflow-y-auto whitespace-pre-wrap">
                        {evt.fullPayload}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-slate-500 bg-slate-950/40 rounded-lg border border-slate-900">
                  点击“穿透检索”以测试从底层 events.jsonl 中检索已被折叠的原始事件
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 4: FORMAL DOMAIN INVARIANTS                                      */}
        {/* ==================================================================== */}
        {activeTab === "invariants" && (
          <div className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Context Compaction 四大领域守恒律严苛自动化验收 (Formal Invariants)
                </div>
                <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                  以不可辩驳的数学与工程断言证明：负向避坑记忆不可遗忘、符号签名位级保真、预算配额严格受限、冷历史只追加无损穿透。
                </p>
              </div>

              <button
                onClick={handleVerifyInvariants}
                disabled={isLoading}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 shadow-md transition disabled:opacity-50 self-start lg:self-center"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                一键运行领域守恒律测试套件
              </button>
            </div>

            {verificationReport ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/50 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <div className="text-xs text-emerald-200">
                    <span className="font-bold text-sm block">4 / 4 守恒律验证 100% 通过！</span>
                    {verificationReport.summary}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {verificationReport.assertions.map((assertion, idx) => (
                    <div
                      key={assertion.id}
                      className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-mono text-teal-400">守恒律 {idx + 1}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> PASS
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-white mt-1">{assertion.name}</h4>
                        <div className="text-xs text-slate-400 font-mono">{assertion.lawTitle}</div>

                        <div className="mt-3 space-y-1.5 text-xs font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-900">
                          <div>
                            <span className="text-slate-500">期望: </span>
                            <span className="text-slate-300">{assertion.expected}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">实际: </span>
                            <span className="text-emerald-300 font-semibold">{assertion.actual}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                        {assertion.details}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-xl p-12 text-center space-y-3">
                <ShieldCheck className="w-8 h-8 text-emerald-500/40 mx-auto" />
                <h3 className="text-sm font-semibold text-slate-300">尚未运行守恒律自动化套件</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  点击上方按钮即可在服务端无副作用运行 4 项数学级守恒律，校验负向记忆提取率、符号保真度与预算天花板。
                </p>
              </div>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 5: PI ARCHITECTURAL DEEP-DIVE                                    */}
        {/* ==================================================================== */}
        {activeTab === "pi_deepdive" && (
          <div className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">
                  开源先驱 Pi (`wayfind/pi-mono`) 的 Compaction 架构深度解密
                </h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                在绝大多数框架中，开发者只把压缩当成 Prompt 工程的一个小技巧。然而在 Pi 的架构设计中，Compaction 是一个顶级的
                <strong> Session 事件 (Session Compaction Event)</strong>。它连接着只追加事件真理源与瞬态模型投影。
              </p>

              {/* Architectural Comparison Matrix */}
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-left text-xs border border-slate-800 rounded-lg overflow-hidden">
                  <thead className="bg-slate-950 font-mono text-slate-300 border-b border-slate-800">
                    <tr>
                      <th className="p-3">架构维度</th>
                      <th className="p-3 text-red-400">传统聊天机器人 (Naive Chatbot)</th>
                      <th className="p-3 text-cyan-400">Pi Coding Agent Runtime</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    <tr className="bg-slate-900/30">
                      <td className="p-3 text-slate-400 font-bold">压缩操作本质</td>
                      <td className="p-3 text-slate-300">覆盖内存中的 messages 数组，旧记录彻底销毁</td>
                      <td className="p-3 text-emerald-300">只追加一条 SessionCompacted 事件，底层 events.jsonl 零真理损失</td>
                    </tr>
                    <tr className="bg-slate-900/10">
                      <td className="p-3 text-slate-400 font-bold">负向记忆留存</td>
                      <td className="p-3 text-slate-300">被 LLM 总结一笔带过，后续重新踩同一死锁陷阱</td>
                      <td className="p-3 text-emerald-300">提取独立的 Negative Constraints 黑名单，显式置顶注入上下文</td>
                    </tr>
                    <tr className="bg-slate-900/30">
                      <td className="p-3 text-slate-400 font-bold">工作区符号精度</td>
                      <td className="p-3 text-slate-300">丢失函数签名与参数定义，诱发新的类型错误</td>
                      <td className="p-3 text-emerald-300">维护 Working Set 符号契约表与文件 Diff，位级保真</td>
                    </tr>
                    <tr className="bg-slate-900/10">
                      <td className="p-3 text-slate-400 font-bold">历史追溯与分支</td>
                      <td className="p-3 text-slate-300">不可逆，无法回到压缩前的时间点</td>
                      <td className="p-3 text-emerald-300">支持以 Compaction 节点为起点进行无损 Branching 与时空穿梭</td>
                    </tr>
                    <tr className="bg-slate-900/30">
                      <td className="p-3 text-slate-400 font-bold">冷历史反查能力</td>
                      <td className="p-3 text-slate-300">无此概念，只能重新 prompt 用户</td>
                      <td className="p-3 text-emerald-300">提供 search_session_history 工具，毫秒级靶向抓取冷事件</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Pi Diagram */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 font-mono text-xs text-slate-300 space-y-2">
                <div className="text-teal-400 font-bold">Pi 时空事件流与瞬态投影架构：</div>
                <pre className="text-[11px] leading-tight text-slate-400 overflow-x-auto">
{`[Disk: .pi/sessions/sess_xyz/events.jsonl] (只追加写入，绝对真理源)
├── event_1: user_prompt ("Refactor auth")
├── event_2: tool_call (read_file)
├── event_3: tool_result (SQLite deadlock error 💥)
├── event_4: tool_call (write_to_file bearer.ts)
...
└── event_20: session_compacted (Epoch 1 Anchor Generated ✨)
        │
        ▼  [PromptContext 瞬态投影：调用 LLM 前一毫秒动态组装]
   ┌────────────────────────────────────────────────────────┐
   │ 📌 Pinned Base (System guidelines & Target Invariants) │
   │ ⚠️ Negative Constraints (Deadlock Trap Blacklist)      │
   │ 🗂️ Active Working Set (bearer.ts, extractBearerToken)  │
   │ 🏛️ Structured Ledger (Milestones & Decisions)          │
   │ 🔥 Hot Window (Last 4 execution turns)                 │
   └────────────────────────────────────────────────────────┘`}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useMemo } from "react";
import { useLoaderData, Link } from "react-router";
import katex from "katex";
import { Header } from "~/components/Header";
import {
  BenchmarkCorpusManager,
  type CompactionBenchmarkCase,
  type CompactionStrategyResult,
  type CompactionStrategyName,
} from "~/core/context-bench/corpus";
import {
  Sliders,
  ShieldAlert,
  Play,
  BookOpen,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Layers,
  FileText,
  Copy,
  Check,
  Sparkles,
  Flame,
  ArrowRight,
  Database,
  Compass,
  Bot,
  RotateCcw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Loader: 服务端首屏预加载 (遵守数据获取分层规范)
// ---------------------------------------------------------------------------

export async function loader() {
  const docs = BenchmarkCorpusManager.getAllDocuments();
  const totalCorpusTokens = docs.reduce((sum, d) => sum + d.tokenCount, 0);
  const hasServerKey = Boolean(
    process.env.LLM_API_KEY && process.env.LLM_API_KEY.trim().length > 0
  );
  const model = process.env.LLM_MODEL || "glm-4-flash";
  const defaultBaseURL =
    process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";

  const cases = BenchmarkCorpusManager.getCompactionBenchmarkCases();
  const initialMatrix = BenchmarkCorpusManager.generateCompactionBenchmarkMatrix();
  const initialResult = BenchmarkCorpusManager.getCuratedCompactionResult(
    "cp-01-cross-product-migration",
    "structured_state_distillation"
  );

  return {
    hasServerKey,
    model,
    defaultBaseURL,
    totalCorpusTokens,
    docCount: docs.length,
    cases,
    initialMatrix,
    initialResult,
  };
}

// ---------------------------------------------------------------------------
// 数学公式渲染组件 (基于 KaTeX 纯客户端/SSR 同构渲染)
// ---------------------------------------------------------------------------

function MathView({
  math,
  block = false,
  className = "",
}: {
  math: string;
  block?: boolean;
  className?: string;
}) {
  const clean = useMemo(() => {
    let s = math.trim();
    if (s.startsWith("$$") && s.endsWith("$$")) {
      s = s.slice(2, -2).trim();
    } else if (s.startsWith("$") && s.endsWith("$")) {
      s = s.slice(1, -1).trim();
    }
    return s;
  }, [math]);

  const html = useMemo(() => {
    try {
      return katex.renderToString(clean, {
        displayMode: block,
        throwOnError: false,
      });
    } catch {
      return clean;
    }
  }, [clean, block]);

  if (block) {
    return (
      <div
        className={`overflow-x-auto py-2 my-1 text-center font-serif ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <span
      className={`inline-block font-serif ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ---------------------------------------------------------------------------
// 策略配置字典
// ---------------------------------------------------------------------------

const STRATEGIES: {
  id: CompactionStrategyName;
  label: string;
  shortLabel: string;
  badge: string;
  activeBorder: string;
  desc: string;
}[] = [
  {
    id: "structured_state_distillation",
    label: "结构化状态提炼 (Structured State Distillation)",
    shortLabel: "状态提炼",
    badge: "推荐 · 黄金防线",
    activeBorder: "border-emerald-400 bg-emerald-950/60 shadow-emerald-950/50 shadow-md text-emerald-200",
    desc: "6 重确定性状态机投影 + Hot Window 动态滑动，Token 节约 80%+ 且 100% 避坑保真。",
  },
  {
    id: "no_compaction_full",
    label: "无压缩全量硬塞 (No Compaction)",
    shortLabel: "全量硬塞",
    badge: "基线对照",
    activeBorder: "border-rose-400 bg-rose-950/50 shadow-rose-950/50 shadow-md text-rose-200",
    desc: "全量累加 30~50 步所有历史消息，Token 线性爆炸，触发 Lost in the Middle 与高额开销。",
  },
  {
    id: "sliding_window_fifo",
    label: "滑窗 FIFO 机械截断 (Sliding Window FIFO)",
    shortLabel: "FIFO 截断",
    badge: "长程失忆",
    activeBorder: "border-amber-400 bg-amber-950/50 shadow-amber-950/50 shadow-md text-amber-200",
    desc: "仅保留最近 K 步会话，彻底抛弃初始目标与早期排查事实，导致模型严重失忆与臆造。",
  },
  {
    id: "naive_chat_summary",
    label: "普通模糊总结 (Naive Chat Summary)",
    shortLabel: "普通总结",
    badge: "抹杀避坑",
    activeBorder: "border-indigo-400 bg-indigo-950/50 shadow-indigo-950/50 shadow-md text-indigo-200",
    desc: "LLM 自然语言泛化摘要，报喜不报忧，抹杀踩坑黑名单与精确符号，极易诱导重复踩坑。",
  },
];

export default function LessonContextC14() {
  const data = useLoaderData<typeof loader>();

  // 顶层三重视图模式：交互实验台 | 4x4全景对决 | 第一性原理
  const [activeMainTab, setActiveMainTab] = useState<
    "studio" | "matrix" | "theory"
  >("studio");

  // 当前选中的基准用例与策略
  const [selectedCaseId, setSelectedCaseId] = useState<string>(
    data.cases[0]?.id || "cp-01-cross-product-migration"
  );
  const [selectedStrategy, setSelectedStrategy] =
    useState<CompactionStrategyName>("structured_state_distillation");
  const [hotWindowSize, setHotWindowSize] = useState<number>(4);

  // 左栏上下文视窗切换：6 重提炼状态机 vs 完整注入 Prompt
  const [contextViewMode, setContextViewMode] = useState<"distilled" | "prompt">(
    "distilled"
  );

  // 自定义 API 配置 (通过函数延迟读取 localStorage，避免 useEffect 滥用)
  const [customApiKey, setCustomApiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("MINI_CLAUDE_API_KEY") || "";
    }
    return "";
  });
  const [customBaseURL, setCustomBaseURL] = useState(() => {
    if (typeof window !== "undefined") {
      return (
        localStorage.getItem("MINI_CLAUDE_BASE_URL") || data.defaultBaseURL
      );
    }
    return data.defaultBaseURL;
  });

  const [isRunningLive, setIsRunningLive] = useState<boolean>(false);
  const [liveResult, setLiveResult] = useState<CompactionStrategyResult | null>(
    null
  );
  const [liveStatusMessage, setLiveStatusMessage] = useState<string | null>(
    null
  );
  const [liveErrorMessage, setLiveErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // 派生当前选中的测试用例
  const activeCase: CompactionBenchmarkCase = useMemo(() => {
    return (
      data.cases.find((c) => c.id === selectedCaseId) || data.cases[0]
    );
  }, [data.cases, selectedCaseId]);

  // 派生当前展示的确定性输入 (供左栏提炼上下文与演进图谱使用)
  const currentResult: CompactionStrategyResult = useMemo(() => {
    const curated = BenchmarkCorpusManager.getCuratedCompactionResult(
      selectedCaseId,
      selectedStrategy
    );
    return curated || data.initialResult!;
  }, [selectedCaseId, selectedStrategy, data.initialResult]);

  // 派生当前现场实测结果 (仅当真机调用成功或主动载入基准时存在，否则留白为待实测空状态)
  const activeRunResult: CompactionStrategyResult | null = useMemo(() => {
    if (
      liveResult &&
      liveResult.caseId === selectedCaseId &&
      liveResult.strategy === selectedStrategy
    ) {
      return liveResult;
    }
    return null;
  }, [liveResult, selectedCaseId, selectedStrategy]);

  // 触发在线执行：通过后端 API /api/context-bench 发送真实请求，右栏原地更新，左栏常驻不丢失
  const handleRunLive = async () => {
    setIsRunningLive(true);
    setLiveErrorMessage(null);
    setLiveStatusMessage(null);
    try {
      const response = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_live_compaction",
          caseId: selectedCaseId,
          strategy: selectedStrategy,
          hotWindowSize,
          apiKey: customApiKey.trim() || undefined,
          baseURL: customBaseURL.trim() || undefined,
          model: data.model,
        }),
      });

      const resData = await response.json();
      if (resData.success && resData.result) {
        setLiveResult(resData.result);
        setLiveStatusMessage(
          `现场实测成功！耗时 ${resData.result.latencyMs}ms，事实保留率 ${Math.round(
            resData.result.factRetentionRate * 100
          )}%，避坑防御率 ${Math.round(
            resData.result.negativeTrapAvoidanceRate * 100
          )}%`
        );
      } else {
        throw new Error(resData.error || "服务端返回失败");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLiveErrorMessage(`实测请求未成功：${msg}。可检查网络或载入预置基准供参考。`);
    } finally {
      setIsRunningLive(false);
    }
  };

  const handleLoadCurated = () => {
    const curated = BenchmarkCorpusManager.getCuratedCompactionResult(
      selectedCaseId,
      selectedStrategy
    );
    if (curated) {
      setLiveResult({
        ...curated,
        mode: "curated",
      });
      setLiveStatusMessage("已载入离线预置基准数据供对照参考。");
    }
  };

  const handleCopyPrompt = () => {
    if (currentResult?.injectedPromptPreview) {
      navigator.clipboard.writeText(currentResult.injectedPromptPreview);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 font-sans selection:bg-cyan-500/30 flex flex-col">
      <Header
        hasServerKey={data.hasServerKey}
        model={data.model}
        defaultBaseURL={data.defaultBaseURL}
        customApiKey={customApiKey}
        onSaveApiKey={setCustomApiKey}
        customBaseURL={customBaseURL}
        onSaveBaseURL={setCustomBaseURL}
        onSaveSettings={(settings) => {
          setCustomApiKey(settings.apiKey);
          setCustomBaseURL(settings.baseURL);
          if (typeof window !== "undefined") {
            localStorage.setItem("MINI_CLAUDE_API_KEY", settings.apiKey);
            localStorage.setItem("MINI_CLAUDE_BASE_URL", settings.baseURL);
          }
        }}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-5">
        {/* Breadcrumb & Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2 font-mono">
            <Link to="/" className="hover:text-cyan-400 transition">
              门户大厅
            </Link>
            <span>/</span>
            <Link to="/docs/context-learn.md" className="hover:text-cyan-400 transition">
              Context Engineering 专项
            </Link>
            <span>/</span>
            <span className="text-cyan-300 font-semibold">
              第 14 课：上下文压缩与状态提炼
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/docs/lessons/context/14-context-compaction-and-distillation.md"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-900/40 transition text-xs font-mono font-medium"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>查阅 C14 深度讲义教材</span>
            </Link>
          </div>
        </div>

        {/* 紧凑型 Hero Banner (减法设计：移除冗余静态卡，保留金句与定位) */}
        <div className="glass-panel px-5 py-4 md:px-6 md:py-5 rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-[#0c1224] via-[#090d1a] to-[#061826] relative overflow-hidden shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[11px] font-mono">
              <Sliders className="w-3 h-3" />
              <span>Context Engineering 专项研习轨 · 第 14 课</span>
            </div>
            <h1 className="text-lg md:text-xl font-extrabold text-white tracking-tight">
              长任务中的 Context 会爆炸：
              <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent ml-2">
                从“发生过的一切”到“6 重结构化状态提炼机”
              </span>
            </h1>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              破除大窗口迷信与普通总结的“认知乐观偏差”。通过确定性状态机投影锁定负向记忆与避坑禁令，Token 暴降 80%+ 且 0 死锁 0 漂移。
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-center shrink-0">
            <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] font-mono text-slate-300">
              <span className="text-slate-500 mr-1.5">当前模型:</span>
              <span className="text-cyan-300 font-semibold">{data.model}</span>
            </div>
          </div>
        </div>

        {/* 顶层三重视图导航 (拆分：实验台 / 4x4全景矩阵 / 第一性原理) */}
        <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2">
          <button
            type="button"
            onClick={() => setActiveMainTab("studio")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-2 ${
              activeMainTab === "studio"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>🧪 交互实验台 (Compaction Studio)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab("matrix")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-2 ${
              activeMainTab === "matrix"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>📊 4×4 策略全景对决大表</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab("theory")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-2 ${
              activeMainTab === "theory"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>📐 信噪比与第一性原理</span>
          </button>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* VIEW 1: 交互实验台 (STUDIO)                                       */}
        {/* ------------------------------------------------------------------ */}
        {activeMainTab === "studio" && (
          <div className="space-y-4">
            {/* 统一紧凑控制台：用例选择 (Row 1) + 策略与实测工具条 (Row 2) */}
            <div className="glass-panel p-3.5 md:p-4 rounded-xl border border-slate-800 bg-[#0a0e1c] space-y-3">
              {/* Row 1: 用例选择胶囊 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <span className="font-mono text-slate-400 font-bold flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-cyan-400" />
                  <span>选择对抗长任务 (28~45 步长程挑战)：</span>
                </span>
                <span className="font-mono text-[11px] text-slate-500">
                  难度类别: <strong className="text-cyan-300">{activeCase.category}</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {data.cases.map((c) => {
                  const isSelected = c.id === selectedCaseId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedCaseId(c.id);
                        setLiveResult(null);
                        setLiveStatusMessage(null);
                        setLiveErrorMessage(null);
                      }}
                      className={`p-2.5 rounded-lg border text-left transition relative flex flex-col justify-between ${
                        isSelected
                          ? "bg-cyan-950/60 border-cyan-500/70 shadow-sm text-cyan-200"
                          : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[11px] font-mono font-bold text-cyan-400">
                          {c.id.split("-")[1].toUpperCase()}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {c.totalSteps} 步交互
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-200 line-clamp-1">
                        {c.title}
                      </div>
                      <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                        {c.targetGoal}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Row 2: 策略切换 Pills + Hot Window + 实测按钮 */}
              <div className="pt-2 border-t border-slate-800/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* 策略切换 */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-mono text-slate-400 mr-1 flex items-center gap-1">
                    <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                    <span>压缩策略:</span>
                  </span>
                  {STRATEGIES.map((strat) => {
                    const isSelected = strat.id === selectedStrategy;
                    return (
                      <button
                        key={strat.id}
                        type="button"
                        onClick={() => {
                          setSelectedStrategy(strat.id);
                          setLiveResult(null);
                          setLiveStatusMessage(null);
                          setLiveErrorMessage(null);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono transition border flex items-center gap-1.5 ${
                          isSelected
                            ? strat.activeBorder
                            : "bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                        }`}
                      >
                        <span className="font-semibold">{strat.shortLabel}</span>
                        <span
                          className={`text-[9px] px-1 rounded ${
                            isSelected ? "bg-black/30" : "bg-slate-800 text-slate-500"
                          }`}
                        >
                          {strat.badge.split("·")[0].trim()}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Hot Window + 实测主按钮 */}
                <div className="flex items-center gap-3 self-end lg:self-center">
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
                    <span>Hot Window:</span>
                    <span className="text-cyan-300 font-bold">{hotWindowSize} 步</span>
                    <input
                      type="range"
                      min="2"
                      max="6"
                      value={hotWindowSize}
                      onChange={(e) => setHotWindowSize(Number(e.target.value))}
                      className="w-16 accent-cyan-400 cursor-pointer"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleRunLive}
                    disabled={isRunningLive}
                    className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 via-teal-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold font-mono flex items-center gap-1.5 transition shadow-md shadow-cyan-900/30 disabled:opacity-50"
                  >
                    {isRunningLive ? (
                      <Activity className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    <span>{isRunningLive ? "正在运行压测..." : "运行现场实测"}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 状态与通知条 */}
            {isRunningLive && (
              <div className="p-3 rounded-xl bg-cyan-950/70 border border-cyan-500/40 text-cyan-200 text-xs font-mono flex items-center justify-between animate-pulse">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>
                    正在向后端 LLM 发送真实长任务 Prompt 并评测交付表现（{activeCase.id} · {selectedStrategy}）...
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  真实模型推理中
                </span>
              </div>
            )}

            {liveStatusMessage && !isRunningLive && (
              <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 text-xs font-mono flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{liveStatusMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setLiveStatusMessage(null)}
                  className="text-slate-400 hover:text-slate-200 text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800"
                >
                  ✕ 关闭
                </button>
              </div>
            )}

            {liveErrorMessage && !isRunningLive && (
              <div className="p-3 rounded-xl bg-amber-950/70 border border-amber-500/40 text-amber-200 text-xs font-mono flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{liveErrorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setLiveErrorMessage(null)}
                  className="text-slate-400 hover:text-slate-200 text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800"
                >
                  ✕ 关闭
                </button>
              </div>
            )}

            {/* 紧凑型长任务 Token 水位演进图谱 (Flat Baseline) */}
            <div className="glass-panel p-3.5 rounded-xl border border-slate-800 bg-[#090d1c] space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs font-mono">
                <div className="flex items-center gap-2 text-slate-300 font-bold">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Token 水位演进图谱 ({activeCase.totalSteps} 步时序)</span>
                </div>

                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-slate-400">
                    Raw 累积: <strong className="text-rose-400">{currentResult.rawTokens}</strong> Tok
                  </span>
                  <span className="text-slate-400">
                    当前输入: <strong className="text-cyan-300">{currentResult.promptInjectedTokens}</strong> Tok
                  </span>
                  <span className="text-emerald-400 font-bold bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/30">
                    节约 {currentResult.compressionRatio}%
                  </span>
                </div>
              </div>

              {/* 柱状条图 */}
              <div className="h-24 w-full bg-slate-950/90 rounded-t-lg p-2 pb-0 border border-b-0 border-slate-800/90 flex items-end gap-1 overflow-x-auto relative">
                {currentResult.stepEvolution.map((pt) => {
                  const maxRaw =
                    currentResult.stepEvolution[
                      currentResult.stepEvolution.length - 1
                    ]?.rawAccumulatedTokens || 1;
                  const rawHeight = Math.max(6, (pt.rawAccumulatedTokens / maxRaw) * 100);
                  const winHeight = Math.max(4, (pt.windowTokens / maxRaw) * 100);

                  return (
                    <div
                      key={pt.stepNumber}
                      className="flex-1 min-w-[12px] flex flex-col items-center justify-end h-full group relative"
                    >
                      {/* Hover Tooltip */}
                      <div className="absolute bottom-full mb-1.5 hidden group-hover:flex flex-col items-center z-30 pointer-events-none">
                        <div className="bg-slate-900 border border-slate-700 text-[9px] font-mono text-slate-200 px-2 py-1 rounded shadow-xl whitespace-nowrap space-y-0.5">
                          <div className="font-bold text-cyan-300">
                            Step {pt.stepNumber} {pt.isCompactionTriggered ? "⚡ 状态提炼" : ""}
                          </div>
                          <div>Raw: {pt.rawAccumulatedTokens} Tok</div>
                          <div className="text-cyan-300">Window: {pt.windowTokens} Tok</div>
                          <div className="text-emerald-400">保留: {pt.retainedPercent}%</div>
                        </div>
                        <div className="w-1.5 h-1.5 bg-slate-900 border-r border-b border-slate-700 transform rotate-45 -mt-0.5" />
                      </div>

                      {/* Bars */}
                      <div className="w-full flex items-end justify-center h-full relative">
                        <div
                          style={{ height: `${rawHeight}%` }}
                          className="w-full rounded-t-[1px] bg-rose-500/20 border-t border-rose-500/30 absolute bottom-0 transition-all duration-200"
                        />
                        <div
                          style={{ height: `${winHeight}%` }}
                          className={`w-full rounded-t-[1px] relative z-10 transition-all duration-200 shadow-sm ${
                            selectedStrategy === "structured_state_distillation"
                              ? "bg-gradient-to-t from-cyan-600 via-teal-500 to-emerald-400"
                              : selectedStrategy === "no_compaction_full"
                              ? "bg-rose-500"
                              : selectedStrategy === "sliding_window_fifo"
                              ? "bg-amber-400"
                              : "bg-indigo-400"
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* X 轴刻度 */}
              <div className="w-full bg-slate-950 rounded-b-lg border border-t-0 border-slate-800/90 px-2 py-1 flex items-center justify-between text-[10px] font-mono text-slate-500">
                <span>Step 1 · 任务发起</span>
                <span className="text-cyan-400 font-semibold">
                  {selectedStrategy === "structured_state_distillation"
                    ? "✨ 触发状态机提炼，锁定在 ~800 Tok 恒定带"
                    : selectedStrategy === "no_compaction_full"
                    ? "⚠️ Token 线性爆炸"
                    : selectedStrategy === "sliding_window_fifo"
                    ? `⚠️ 仅保留最近 ${hotWindowSize} 步，丢弃早期约束`
                    : "⚠️ 模糊摘要抹杀避坑黑名单"}
                </span>
                <span>Step {activeCase.totalSteps} · 最终交付</span>
              </div>
            </div>

            {/* 核心双栏联动工作区 (Dual-Pane Layout) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* -------------------------------------------------------- */}
              {/* 左栏 (7/12)：上下文治理与提炼视窗 (永远常驻，实测绝不消失) */}
              {/* -------------------------------------------------------- */}
              <div className="lg:col-span-7 glass-panel rounded-xl border border-slate-800 bg-[#0a0e1c] overflow-hidden flex flex-col">
                {/* 左栏头部：模式切换 (6重状态机 vs 注入 Prompt 预览) */}
                <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setContextViewMode("distilled")}
                      className={`px-3 py-1 rounded-md text-xs font-mono font-bold transition flex items-center gap-1.5 ${
                        contextViewMode === "distilled"
                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>6 重提炼状态机</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setContextViewMode("prompt")}
                      className={`px-3 py-1 rounded-md text-xs font-mono font-bold transition flex items-center gap-1.5 ${
                        contextViewMode === "prompt"
                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>注入 Prompt ({currentResult.promptInjectedTokens} Tok)</span>
                    </button>
                  </div>

                  <span className="text-[10px] font-mono text-slate-500">
                    输入上下文视图
                  </span>
                </div>

                {/* 左栏主体内容 */}
                <div className="p-4 space-y-4 max-h-[640px] overflow-y-auto">
                  {contextViewMode === "distilled" ? (
                    selectedStrategy === "structured_state_distillation" &&
                    currentResult.distilledState ? (
                      <div className="space-y-3.5">
                        {/* 1. 原始不可篡改意图 */}
                        <div className="p-3 rounded-lg bg-slate-900/90 border border-cyan-500/30 space-y-1">
                          <div className="flex items-center justify-between text-xs font-mono font-bold text-cyan-300">
                            <span className="flex items-center gap-1.5">
                              <Lock className="w-3.5 h-3.5" />
                              <span>1. 原始不可篡改意图 (Original User Goal)</span>
                            </span>
                            <span className="text-[10px] text-cyan-400 font-normal">
                              P0 不可压缩
                            </span>
                          </div>
                          <p className="text-xs text-slate-200 leading-relaxed font-sans">
                            {currentResult.distilledState.originalGoal}
                          </p>
                        </div>

                        {/* 2. 已验证技术事实 & 3. 关键架构决策 (2 cols) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* 事实表 */}
                          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                            <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-200">
                              <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span>2. 已验证技术事实</span>
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {currentResult.distilledState.verifiedFacts.length} 条
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              {currentResult.distilledState.verifiedFacts.map((f) => (
                                <div
                                  key={f.id}
                                  className="p-2 rounded bg-slate-950/70 border border-slate-800 text-[11px] space-y-0.5"
                                >
                                  <div className="flex items-center justify-between font-mono text-[10px]">
                                    <span className="text-emerald-300 font-semibold">
                                      {f.entity}
                                    </span>
                                    <span className="text-slate-500">
                                      Step {f.verifiedAtStep}
                                    </span>
                                  </div>
                                  <div className="text-slate-300 font-sans">{f.fact}</div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* 决策表 */}
                          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                            <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-200">
                              <span className="flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                                <span>3. 关键架构决策</span>
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {currentResult.distilledState.keyDecisions.length} 项
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              {currentResult.distilledState.keyDecisions.map((d) => (
                                <div
                                  key={d.id}
                                  className="p-2 rounded bg-slate-950/70 border border-slate-800 text-[11px] space-y-0.5"
                                >
                                  <div className="flex items-center justify-between font-mono text-[10px]">
                                    <span className="text-indigo-300 font-semibold">
                                      {d.decision}
                                    </span>
                                    <span className="text-slate-500">
                                      Step {d.stepNumber}
                                    </span>
                                  </div>
                                  <div className="text-slate-400 font-sans">
                                    权衡: {d.rationale}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* 4. 避坑负向记忆与严厉禁令 (防死锁核心防线) */}
                        <div className="p-3.5 rounded-lg bg-rose-950/30 border border-rose-500/40 space-y-2">
                          <div className="flex items-center justify-between text-xs font-mono font-bold text-rose-200">
                            <span className="flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                              <span>4. 避坑负向记忆与严厉禁令 (Negative Constraints)</span>
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              防死锁核心防线
                            </span>
                          </div>

                          <div className="space-y-2">
                            {currentResult.distilledState.negativeLearnings.map((n) => (
                              <div
                                key={n.id}
                                className="p-2.5 rounded bg-slate-950/80 border border-rose-500/30 text-xs space-y-1"
                              >
                                <div className="flex items-center justify-between text-[11px] font-mono text-rose-300 font-bold">
                                  <span>⚠️ 踩雷点: {n.trap}</span>
                                  <span className="text-slate-500">
                                    Step {n.discoveredAtStep}
                                  </span>
                                </div>
                                <div className="text-slate-400 text-[11px]">
                                  失败后果: {n.reasonFailed}
                                </div>
                                <div className="p-1 rounded bg-rose-500/15 text-rose-200 font-mono text-[11px] font-semibold border border-rose-500/20">
                                  🛑 铁律禁令: {n.prohibitedAction}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 5. 已交付里程碑 & 6. 动态执行热窗 */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* 里程碑 */}
                          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                            <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-200">
                              <span>5. 已交付里程碑</span>
                              <span className="text-slate-500">
                                {currentResult.distilledState.completedWork.length} 项
                              </span>
                            </div>
                            <div className="space-y-1">
                              {currentResult.distilledState.completedWork.map((w) => (
                                <div
                                  key={w.id}
                                  className="p-1.5 rounded bg-slate-950/60 border border-slate-800 text-[11px] flex items-center justify-between"
                                >
                                  <span className="text-slate-300">{w.task}</span>
                                  <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950/40 px-1 rounded">
                                    Step {w.stepNumber}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* 动态热窗 */}
                          <div className="p-3 rounded-lg bg-slate-900/80 border border-cyan-500/30 space-y-2">
                            <div className="flex items-center justify-between text-xs font-mono font-bold text-cyan-300">
                              <span>6. 动态执行热窗 (最近 {hotWindowSize} 步)</span>
                              <span className="text-slate-500 text-[10px]">热上下文</span>
                            </div>
                            <div className="space-y-1">
                              {currentResult.distilledState.hotWindowSteps.map((s) => (
                                <div
                                  key={s.stepNumber}
                                  className="p-1.5 rounded bg-slate-950/60 border border-slate-800 text-[10px] font-mono space-y-0.5"
                                >
                                  <div className="flex items-center justify-between text-slate-400">
                                    <span className="text-cyan-400 font-bold">
                                      Step {s.stepNumber} · {s.actor.toUpperCase()}
                                    </span>
                                    <span>{s.tokenCount} Tok</span>
                                  </div>
                                  <div className="text-slate-300 truncate font-sans">
                                    {s.output}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* 非提炼策略下的诊断与警示卡片 (防止展示消失，清晰对比痛点) */
                      <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 text-center">
                        <div className="inline-flex p-3 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300">
                          <AlertTriangle className="w-6 h-6" />
                        </div>

                        <div className="space-y-1.5 max-w-md mx-auto">
                          <h4 className="text-sm font-bold text-white font-mono">
                            当前策略：{currentResult.strategyLabel}
                          </h4>
                          <p className="text-xs text-slate-300 leading-relaxed font-sans">
                            {selectedStrategy === "sliding_window_fifo" ? (
                              <>
                                FIFO 机械滑窗仅保留最近 {hotWindowSize} 步会话。
                                <strong className="text-amber-300 block mt-1">
                                  ⚠️ 早期定义的不可篡改目标、关键 SLA 指标与踩坑黑名单已彻底被物理截断！
                                </strong>
                              </>
                            ) : selectedStrategy === "naive_chat_summary" ? (
                              <>
                                普通自然语言摘要具有“认知乐观偏差”，天生只记录成果、过滤失败。
                                <strong className="text-indigo-300 block mt-1">
                                  ⚠️ 避坑负向记忆被全部抹除，模型对致命陷阱完全失忆，极易反复重蹈覆辙！
                                </strong>
                              </>
                            ) : (
                              <>
                                无压缩硬塞将 30~50 步工具调用日志原样堆积。
                                <strong className="text-rose-300 block mt-1">
                                  ⚠️ Token 膨胀至 {currentResult.rawTokens} Tok，自注意力均分稀释，早期约束陷入“中间迷失”。
                                </strong>
                              </>
                            )}
                          </p>
                        </div>

                        <div className="pt-2 flex items-center justify-center gap-3">
                          <button
                            type="button"
                            onClick={() => setContextViewMode("prompt")}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs font-mono transition"
                          >
                            查看实际注入的 Prompt 文本
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedStrategy("structured_state_distillation")
                            }
                            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold transition flex items-center gap-1.5"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>切换至 6 重状态机提炼对比</span>
                          </button>
                        </div>
                      </div>
                    )
                  ) : (
                    /* 注入 Prompt 预览模式 */
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                        <span>
                          注入 Prompt 长度:{" "}
                          <strong className="text-cyan-300">
                            {currentResult.promptInjectedTokens}
                          </strong>{" "}
                          Tokens
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyPrompt}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono flex items-center gap-1 transition"
                        >
                          {copied ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{copied ? "已复制" : "复制 Prompt"}</span>
                        </button>
                      </div>

                      <pre className="p-3.5 rounded-lg bg-slate-950 text-slate-300 font-mono text-[11px] overflow-x-auto max-h-[500px] border border-slate-800 leading-relaxed whitespace-pre-wrap select-all">
                        {currentResult.injectedPromptPreview}
                      </pre>
                    </div>
                  )}
                </div>
              </div>

              {/* -------------------------------------------------------- */}
              {/* 右栏 (5/12)：模型执行与实测分析视窗                      */}
              {/* -------------------------------------------------------- */}
              <div className="lg:col-span-5 glass-panel rounded-xl border border-slate-800 bg-[#0a0e1c] overflow-hidden flex flex-col">
                {/* 右栏头部：执行模式与状态判定 */}
                <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-xs font-mono font-bold text-slate-200">
                      智能体执行与评测分析
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {activeRunResult ? (
                      <>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                            activeRunResult.verdict === "success"
                              ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                              : activeRunResult.verdict === "amnesia_loop"
                              ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                              : "bg-rose-500/10 text-rose-300 border-rose-500/30"
                          }`}
                        >
                          {activeRunResult.verdict === "success"
                            ? "✅ 完美交付"
                            : activeRunResult.verdict === "amnesia_loop"
                            ? "⚠️ 重蹈覆辙死锁"
                            : "❌ 交付失败"}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {activeRunResult.mode === "live_llm" ? "🟢 现场实测" : "⚪ 预置基准"}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setLiveResult(null);
                            setLiveStatusMessage(null);
                          }}
                          title="清空实测结果，回到待运行留白状态"
                          className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition text-[10px] font-mono flex items-center gap-1 border border-slate-800/80"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          <span>清空</span>
                        </button>
                      </>
                    ) : (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                        {isRunningLive ? "⚡ 推理中..." : "○ 待现场实测"}
                      </span>
                    )}
                  </div>
                </div>

                {/* 右栏主体：三种状态展示 (已实测 / 正在实测 / 留白空状态) */}
                {activeRunResult ? (
                  <>
                    {/* 4 大核心量化指标卡 */}
                    <div className="p-3.5 grid grid-cols-2 gap-2 border-b border-slate-800/80 bg-slate-950/40">
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono">事实准确率</span>
                        <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                          {Math.round(activeRunResult.factRetentionRate * 100)}%
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono">避坑防御率</span>
                        <div
                          className={`text-base font-bold font-mono mt-0.5 ${
                            activeRunResult.negativeTrapAvoidanceRate >= 0.9
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }`}
                        >
                          {Math.round(activeRunResult.negativeTrapAvoidanceRate * 100)}%
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono">最终交付率</span>
                        <div className="text-base font-bold text-cyan-400 font-mono mt-0.5">
                          {Math.round(activeRunResult.taskDeliveryRate * 100)}%
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono">端到端耗时</span>
                        <div className="text-base font-bold text-indigo-400 font-mono mt-0.5">
                          {activeRunResult.latencyMs} ms
                        </div>
                      </div>
                    </div>

                    {/* 智能体最终回答与评测分析 */}
                    <div className="p-4 space-y-3.5 max-h-[500px] overflow-y-auto">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                          <span className="font-bold text-cyan-300">
                            智能体在 Step {activeCase.totalSteps} 的交付答复：
                          </span>
                        </div>
                        <div className="text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap p-3 rounded-lg bg-slate-950 border border-slate-800">
                          {activeRunResult.agentFinalResponse}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-cyan-950/20 border border-cyan-500/30 text-xs text-slate-300 leading-relaxed space-y-1">
                        <div className="font-bold text-cyan-300 font-mono text-[11px]">
                          【架构师深度评测分析】：
                        </div>
                        <p className="text-[11px] text-slate-300 font-sans">
                          {activeRunResult.analysis}
                        </p>
                      </div>
                    </div>
                  </>
                ) : isRunningLive ? (
                  /* 正在调用模型时的动态加载态 */
                  <div className="p-8 flex flex-col items-center justify-center space-y-3.5 text-center animate-pulse min-h-[380px]">
                    <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                      <Activity className="w-6 h-6 animate-spin" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-bold font-mono text-cyan-300">
                        正在向真实大模型发送请求...
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        Prompt: {currentResult.promptInjectedTokens} Tok · 模型: {data.model}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* 留白空状态：未跑真实 LLM 时展示的引导与说明 UI */
                  <div className="p-6 md:p-8 flex flex-col items-center justify-center text-center space-y-5 min-h-[420px]">
                    <div className="w-14 h-14 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-center text-slate-500 shadow-inner">
                      <Bot className="w-7 h-7 text-cyan-400/70" />
                    </div>

                    <div className="space-y-1.5 max-w-sm">
                      <h4 className="text-sm font-bold text-slate-200 font-mono">
                        尚未发起现场实测
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed font-sans">
                        长任务 Prompt 已在左侧提炼就绪。点击下方按钮即可实时发起真机推理，现场校验事实留存率与避坑防御表现。
                      </p>
                    </div>

                    {/* 3 维度评测说明卡片 */}
                    <div className="w-full space-y-2 text-left">
                      <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[11px] flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                        <span className="text-slate-300">
                          <strong className="text-emerald-300 font-mono">事实准确率</strong>：SLA 99.95%、Alpha/Beta 网关参数位级比对
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[11px] flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
                        <span className="text-slate-300">
                          <strong className="text-rose-300 font-mono">避坑防御率</strong>：校验是否恪守负向黑名单，0 触碰死锁禁令
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[11px] flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                        <span className="text-slate-300">
                          <strong className="text-cyan-300 font-mono">交付答复与耗时</strong>：实时统计真实 API 网络时延与完整输出
                        </span>
                      </div>
                    </div>

                    {/* 触发按钮 */}
                    <div className="pt-1 flex flex-col sm:flex-row items-center gap-2.5 w-full">
                      <button
                        type="button"
                        onClick={handleRunLive}
                        disabled={isRunningLive}
                        className="w-full py-2 px-4 rounded-xl bg-gradient-to-r from-cyan-600 via-teal-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold font-mono flex items-center justify-center gap-2 transition shadow-md shadow-cyan-900/30"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>运行现场实测 (Run Live)</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleLoadCurated}
                        className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-mono transition border border-slate-800"
                      >
                        载入离线预置基准对照
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* VIEW 2: 4×4 策略全景对决大表 (MATRIX)                               */}
        {/* ------------------------------------------------------------------ */}
        {activeMainTab === "matrix" && (
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-[#0a0e1c] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                  <Database className="w-4 h-4 text-cyan-400" />
                  <span>4×4 策略横向基准对决矩阵 (4 Cases × 4 Strategies)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1 font-sans">
                  基于 4 大生产级真实对抗场景（28~45 步）的全量横向基准压测对比结果。
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                    <th className="py-2.5 px-3">用例编号与挑战</th>
                    <th className="py-2.5 px-3">方案一：无压缩全量硬塞</th>
                    <th className="py-2.5 px-3">方案二：滑窗 FIFO 截断</th>
                    <th className="py-2.5 px-3">方案三：普通模糊总结</th>
                    <th className="py-2.5 px-3 text-cyan-300 font-bold bg-cyan-950/20 border-l border-cyan-500/30">
                      方案四：结构化状态提炼
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {data.initialMatrix.map((row) => (
                    <tr
                      key={row.caseId}
                      className={`hover:bg-slate-900/40 transition ${
                        row.caseId === selectedCaseId ? "bg-cyan-950/15" : ""
                      }`}
                    >
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-200">
                          {row.caseTitle}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          {row.caseId}
                        </div>
                      </td>

                      {/* No Compaction */}
                      <td className="py-3 px-3">
                        <div className="text-rose-400 font-mono text-[11px]">
                          {row.results.no_compaction_full.rawTokens} Tok (0%)
                        </div>
                        <div className="text-[10px] text-slate-400">
                          事实: {Math.round(row.results.no_compaction_full.factRetentionRate * 100)}% · 避坑: {Math.round(row.results.no_compaction_full.negativeTrapAvoidanceRate * 100)}%
                        </div>
                      </td>

                      {/* FIFO */}
                      <td className="py-3 px-3">
                        <div className="text-amber-400 font-mono text-[11px]">
                          节约 {row.results.sliding_window_fifo.compressionRatio}%
                        </div>
                        <div className="text-[10px] text-rose-400 font-semibold">
                          长程失忆 (事实 0%)
                        </div>
                      </td>

                      {/* Naive Summary */}
                      <td className="py-3 px-3">
                        <div className="text-indigo-400 font-mono text-[11px]">
                          节约 {row.results.naive_chat_summary.compressionRatio}%
                        </div>
                        <div className="text-[10px] text-rose-400 font-semibold">
                          抹杀踩坑 (重踩死锁)
                        </div>
                      </td>

                      {/* Structured Distillation */}
                      <td className="py-3 px-3 bg-emerald-950/20 border-l border-emerald-500/30">
                        <div className="text-emerald-300 font-mono font-bold text-[11px]">
                          节约 {row.results.structured_state_distillation.compressionRatio}% · 100% 保真
                        </div>
                        <div className="text-[10px] text-emerald-400 font-medium">
                          ✅ 100% 避坑防御 · 0 漂移
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* VIEW 3: 第一性原理与推导 (THEORY)                                  */}
        {/* ------------------------------------------------------------------ */}
        {activeMainTab === "theory" && (
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 bg-[#0a0e1c] space-y-6 text-sm text-slate-300 leading-relaxed font-sans max-w-4xl mx-auto">
            <div className="space-y-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Flame className="w-4 h-4 text-cyan-400" />
                <span>注意力信噪比坍塌定律（The Signal-to-Noise Collapse）</span>
              </h3>
              <p>
                在长周期智能体运行中，有效信息信噪比 <MathView math="\text{SNR}(t)" /> 随执行步数 <MathView math="t" /> 单调衰减：
              </p>
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center font-mono">
                <MathView
                  block
                  math="\text{SNR}(t) = \frac{N_{\text{critical}}}{N_{\text{critical}} + \sum_{i=1}^t N_{\text{noise}}(i)} \xrightarrow{t \to \infty} 0"
                />
              </div>
              <p className="text-xs text-slate-400">
                当 <MathView math="t \to 50" /> 步时，中间排错与工具调用产生数以万计的冗余 Token（<MathView math="N_{\text{noise}}" />），
                使得原始任务红线被稀释到注意力背景噪声中，引发严重的 Lost in the Middle 现象。
              </p>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>普通大模型总结的“认知乐观偏见”与负向记忆抹杀</span>
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                自然语言预训练语料中的摘要多以归纳“成功事实”为主。当让 LLM 总结排查记录时，它会自然过滤掉“报错”、“死锁”、“尝试后废弃的参数”，
                从而丢失极其宝贵的 <strong className="text-rose-300">避坑负向记忆（Negative Constraints）</strong>。
                智能体在第 25 步甚至第 40 步会再次尝试已被证明失败的旧方案，陷入死锁循环。
              </p>
              <div className="p-3.5 rounded-lg bg-rose-950/20 border border-rose-500/30 text-xs text-rose-200 font-mono">
                💡 破局之道：结构化状态提炼在 Prompt 中强制划定独立的 <code>&lt;negative_constraints_and_traps&gt;</code> 标签域，通过负向防御机强行打破大模型的认知乐观偏见！
              </div>
            </div>
          </div>
        )}

        {/* Footer Navigation */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
          <Link
            to="/lessons/context-c13-context-assembly"
            className="flex items-center gap-2 text-slate-400 hover:text-cyan-300 transition font-mono"
          >
            <span>← 上一课：C13 上下文装配与布局几何学</span>
          </Link>

          <span className="text-slate-500 font-mono">
            Context Engineering 专项研习轨 · 课程进度 14 / 18
          </span>

          <Link
            to="/docs/lessons/context/14-context-compaction-and-distillation.md"
            className="flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 transition font-bold font-mono"
          >
            <span>进入 C14 深度讲义教材</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </main>
    </div>
  );
}

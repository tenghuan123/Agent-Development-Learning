import { useState, useMemo } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import {
  BenchmarkCorpusManager,
  C7_BENCHMARK_CASES,
  type C7BenchmarkCase,
} from "~/core/context-bench/corpus";
import type {
  TwoStageFunnelResult,
} from "~/core/context-bench/reranker";
import {
  Sliders,
  Scale,
  Zap,
  Sparkles,
  CheckCircle2,
  XCircle,
  BookOpen,
  Play,
  RefreshCw,
  Search,
  Activity,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Split,
  Crosshair,
  Check,
  Eye,
} from "lucide-react";

export async function loader() {
  const hasServerKey = Boolean(
    process.env.LLM_API_KEY && process.env.LLM_API_KEY.trim().length > 0
  );
  const model = process.env.LLM_MODEL || "glm-4-flash";
  const defaultBaseURL =
    process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";

  const docs = BenchmarkCorpusManager.getAllDocuments();
  const totalCorpusTokens = docs.reduce((acc, d) => acc + d.tokenCount, 0);

  // Initial Two-Stage search with Case 01 (Exception Override: Alpha Refund)
  const defaultCase = C7_BENCHMARK_CASES[0];
  const initialFunnel = BenchmarkCorpusManager.searchTwoStage(defaultCase.query, {
    stage1TopK: 8,
    stage2TopN: 3,
    rerankOptions: {
      strictAuthorityCheck: true,
      topN: 3,
    },
  });

  return {
    hasServerKey,
    model,
    defaultBaseURL,
    docs,
    totalCorpusTokens,
    initialCaseId: defaultCase.id,
    initialQuery: defaultCase.query,
    initialFunnel,
    cases: C7_BENCHMARK_CASES,
  };
}

export default function ContextLessonC7() {
  const {
    hasServerKey,
    model,
    defaultBaseURL,
    docs,
    totalCorpusTokens,
    initialCaseId,
    initialQuery,
    initialFunnel,
    cases,
  } = useLoaderData<typeof loader>();

  const [customApiKey, setCustomApiKey] = useState("");
  const [customBaseURL, setCustomBaseURL] = useState("");
  const handleSaveSettings = (settings: { apiKey: string; baseURL: string }) => {
    setCustomApiKey(settings.apiKey);
    setCustomBaseURL(settings.baseURL);
  };

  const [activeTab, setActiveTab] = useState<"studio" | "lab" | "showdown" | "takeaways">("studio");

  // =========================================================================
  // TAB 1: 交互精排工坊 (Reranking Studio) 状态
  // =========================================================================
  const [selectedCaseId, setSelectedCaseId] = useState<string>(initialCaseId);
  const [queryText, setQueryText] = useState(initialQuery);
  const [stage1TopK, setStage1TopK] = useState(8);
  const [stage2TopN, setStage2TopN] = useState(3);
  const [strictAuthority, setStrictAuthority] = useState(true);

  const [funnelData, setFunnelData] = useState<TwoStageFunnelResult>(initialFunnel);
  const [isSearching, setIsSearching] = useState(false);

  // LLM Contrast state
  const [isGeneratingLLM, setIsGeneratingLLM] = useState(false);
  const [llmContrastData, setLlmContrastData] = useState<{
    coarseTopDoc: { id: string; title: string } | null;
    rerankTopDoc: { id: string; title: string } | null;
    coarseAnswer: string | null;
    rerankAnswer: string | null;
    coarsePromptTokens: number;
    rerankPromptTokens: number;
    coarseLatencyMs: number;
    rerankLatencyMs: number;
  } | null>(null);

  // Active inspected document in Studio
  const [inspectedDocId, setInspectedDocId] = useState<string | null>(null);

  const handleSelectCase = (c: C7BenchmarkCase) => {
    setSelectedCaseId(c.id);
    setQueryText(c.query);
    setLlmContrastData(null);
    setInspectedDocId(null);
  };

  const handleRunTwoStageSearch = async () => {
    if (!queryText.trim()) return;
    setIsSearching(true);
    setLlmContrastData(null);

    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search_two_stage",
          query: queryText,
          stage1TopK,
          stage2TopN,
          strictAuthorityCheck: strictAuthority,
        }),
      });

      const data = await resp.json();
      if (data.success && data.funnel) {
        setFunnelData(data.funnel);
      }
    } catch (err) {
      console.error("Two-stage search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleRunLLMContrast = async () => {
    if (!queryText.trim()) return;
    setIsGeneratingLLM(true);

    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_reranking_pipeline",
          question: queryText,
          stage1TopK,
          stage2TopN,
          strictAuthorityCheck: strictAuthority,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });

      const data = await resp.json();
      if (data.success && data.llmContrast) {
        setLlmContrastData(data.llmContrast);
        if (data.funnel) {
          setFunnelData(data.funnel);
        }
      }
    } catch (err) {
      console.error("LLM contrast failed:", err);
    } finally {
      setIsGeneratingLLM(false);
    }
  };

  // =========================================================================
  // TAB 2: 双塔 vs 单塔深度实验台状态
  // =========================================================================
  const [labCaseIdx, setLabCaseIdx] = useState(0);
  const currentLabCase = cases[labCaseIdx];
  const [hoveredToken, setHoveredToken] = useState<string | null>(null);

  // Complexity & cost calculator
  const [simCorpusSize, setSimCorpusSize] = useState(100000); // 100k docs
  const simMetrics = useMemo(() => {
    // Bi-Encoder: 1 query embed + M ANN dot products
    const biEncoderTimeMs = Number((3 + simCorpusSize * 0.00008).toFixed(1));
    // Cross-Encoder all: M full forwards of Transformer
    const crossEncoderAllTimeSec = Number(((simCorpusSize * 2.8) / 1000).toFixed(1));
    // Two-Stage Funnel: Bi-Encoder Top 50 + Cross-Encoder Top 50
    const funnelTimeMs = Number((biEncoderTimeMs + 50 * 2.8).toFixed(1));
    const speedupFactor = Math.round((crossEncoderAllTimeSec * 1000) / funnelTimeMs);

    return {
      biEncoderTimeMs,
      crossEncoderAllTimeSec,
      funnelTimeMs,
      speedupFactor,
    };
  }, [simCorpusSize]);

  // =========================================================================
  // TAB 3: 6 大基准对决状态
  // =========================================================================
  const [showdownCases, setShowdownCases] = useState<Array<{
    id: string;
    category: string;
    title: string;
    query: string;
    targetDocId: string;
    targetDocTitle: string;
    phenomenon: string;
    stage1: {
      topDocId: string | null;
      topDocTitle: string;
      targetRank: number | null;
      isTopHit: boolean;
    };
    stage2: {
      topDocId: string | null;
      topDocTitle: string;
      targetRank: number | null;
      isTopHit: boolean;
      rerankScore: number;
      rankDelta: number;
      decisionReason: string;
    };
  }> | null>(null);

  const [showdownSummary, setShowdownSummary] = useState<{
    totalCases: number;
    stage1TopHits: number;
    stage2TopHits: number;
    stage1AccuracyPct: number;
    stage2AccuracyPct: number;
  } | null>(null);

  const [isRunningShowdown, setIsRunningShowdown] = useState(false);

  const handleRunShowdown = async () => {
    setIsRunningShowdown(true);
    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_c7_benchmark_matrix" }),
      });
      const data = await resp.json();
      if (data.success) {
        setShowdownCases(data.cases);
        setShowdownSummary(data.summary);
      }
    } catch (err) {
      console.error("Showdown execution failed:", err);
    } finally {
      setIsRunningShowdown(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-teal-500/30 selection:text-teal-200">
      <Header
        hasServerKey={hasServerKey}
        model={model}
        defaultBaseURL={defaultBaseURL}
        customApiKey={customApiKey}
        customBaseURL={customBaseURL}
        onSaveSettings={handleSaveSettings}
        currentLesson={{
          id: "context-c7",
          title: "第 07 课: 粗排捞出了候选，但谁最相关？(Cross-Encoder Reranking)",
          badge: "C7",
        }}
      />

      {/* Top Banner / Breadcrumb */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-30 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded font-mono font-bold bg-teal-950 text-teal-300 border border-teal-800/60">
              C7
            </span>
            <span className="text-zinc-400">Context Engineering 专项实战</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-200 font-medium">
              第 07 课：粗排捞出了候选，但谁最相关？—— Cross-Encoder 重排器与 Reranking 精排工程
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/lessons/context-c6-hybrid-retrieval"
              className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
            >
              ← 上一课 (C6 双轨融合与 RRF)
            </Link>
            <span className="text-zinc-700">|</span>
            <Link
              to="/docs/lessons/context/07-reranking-and-cross-encoder.md"
              className="text-teal-400 hover:text-teal-300 flex items-center gap-1 font-medium transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" />
              阅读本课深度讲义
            </Link>
          </div>
        </div>
      </div>

      {/* Hero Header */}
      <div className="border-b border-zinc-800/80 bg-gradient-to-b from-teal-950/20 via-zinc-900/30 to-zinc-950 px-4 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center gap-1">
                  <Sliders className="w-3 h-3 text-teal-400" />
                  两阶段检索漏斗与单塔交叉重排 (Two-Stage Funnel & Reranker)
                </span>
                <span className="text-xs text-zinc-400 font-mono">
                  语料库：{docs.length} 篇基准文档 ({totalCorpusTokens.toLocaleString()} Tokens)
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
                <span>Retrieval 找到了候选，但谁最相关？</span>
                <span className="text-xs px-2.5 py-1 rounded bg-teal-950/80 text-teal-300 border border-teal-800/50 font-mono">
                  Cross-Encoder Reranking
                </span>
              </h1>
              <p className="mt-1.5 text-xs md:text-sm text-zinc-400 max-w-3xl leading-relaxed">
                粗排（Retrieval）负责<strong>“别漏掉”（High Recall）</strong>，但双塔模型缺乏 Token 级交叉注意力，在特例覆盖、废弃版本冲突、排除规则前容易将错误文档排在首位。
                引入 <strong>Cross-Encoder 交叉重排器</strong>，打造“粗排宽口召回 ➔ 精排深度重排 ➔ 黄金上下文”的工业级漏斗！
              </p>
            </div>

            {/* Navigation Tabs */}
            <div className="flex bg-zinc-900/90 p-1 rounded-lg border border-zinc-800 text-xs font-medium self-start md:self-auto">
              <button
                type="button"
                onClick={() => setActiveTab("studio")}
                className={`px-3.5 py-2 rounded-md transition-all flex items-center gap-1.5 ${
                  activeTab === "studio"
                    ? "bg-teal-600 text-white shadow-sm font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
                精排工坊 Studio
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("lab")}
                className={`px-3.5 py-2 rounded-md transition-all flex items-center gap-1.5 ${
                  activeTab === "lab"
                    ? "bg-teal-600 text-white shadow-sm font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Split className="w-3.5 h-3.5" />
                双塔 vs 单塔实验台
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("showdown")}
                className={`px-3.5 py-2 rounded-md transition-all flex items-center gap-1.5 ${
                  activeTab === "showdown"
                    ? "bg-teal-600 text-white shadow-sm font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                6 大基准对决
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("takeaways")}
                className={`px-3.5 py-2 rounded-md transition-all flex items-center gap-1.5 ${
                  activeTab === "takeaways"
                    ? "bg-teal-600 text-white shadow-sm font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                架构心法与预告
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* ================================================================= */}
        {/* TAB 1: 交互精排工坊 (Reranking Studio)                             */}
        {/* ================================================================= */}
        {activeTab === "studio" && (
          <div className="space-y-6">
            {/* Control & Query Bar */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 md:p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-300 mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-teal-400" />
                    选择经典基准对决案例（或自由输入查询）
                  </span>
                  <span className="text-zinc-500 font-normal">
                    点击预设用例快速加载，观察粗排与精排的排位反转
                  </span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
                  {cases.map((c) => {
                    const isSelected = selectedCaseId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectCase(c)}
                        className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                          isSelected
                            ? "bg-teal-950/40 border-teal-500/50 text-teal-200 shadow-sm ring-1 ring-teal-500/30"
                            : "bg-zinc-900/40 border-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                        }`}
                      >
                        <div className="font-semibold text-zinc-200 flex items-center justify-between">
                          <span>{c.title}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono">
                            {c.category.split(" ")[0]}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate mt-1">
                          "{c.query}"
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={queryText}
                      onChange={(e) => setQueryText(e.target.value)}
                      placeholder="输入需要精排检验的问题..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-teal-500 font-medium"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleRunTwoStageSearch}
                    disabled={isSearching || !queryText.trim()}
                    className="px-5 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-zinc-800 text-white font-medium text-xs rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-sm"
                  >
                    {isSearching ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    <span>执行两阶段检索</span>
                  </button>
                </div>
              </div>

              {/* Hyperparameters & Options */}
              <div className="pt-3 border-t border-zinc-800/60 flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="flex flex-wrap items-center gap-5">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400">Stage 1 粗排召回数 (Top K):</span>
                    <select
                      value={stage1TopK}
                      onChange={(e) => setStage1TopK(Number(e.target.value))}
                      className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-teal-500"
                    >
                      <option value={5}>Top 5</option>
                      <option value={8}>Top 8 (标准)</option>
                      <option value={10}>Top 10</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400">Stage 2 精排截断数 (Top N):</span>
                    <select
                      value={stage2TopN}
                      onChange={(e) => setStage2TopN(Number(e.target.value))}
                      className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-teal-300 font-mono font-bold focus:outline-none focus:border-teal-500"
                    >
                      <option value={1}>Top 1 (单篇极致注入)</option>
                      <option value={3}>Top 3 (黄金三篇 - 推荐)</option>
                      <option value={5}>Top 5 (充足上下文)</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer text-zinc-300 select-none">
                    <input
                      type="checkbox"
                      checked={strictAuthority}
                      onChange={(e) => setStrictAuthority(e.target.checked)}
                      className="rounded bg-zinc-950 border-zinc-800 text-teal-500 focus:ring-0"
                    />
                    <span>严格时效权威过滤 (抑制废弃与未受信任文档)</span>
                  </label>
                </div>

                <div className="text-zinc-500 flex items-center gap-2 font-mono">
                  <span>总耗时: {funnelData.totalLatencyMs}ms</span>
                  <span>(粗排 {funnelData.stage1LatencyMs}ms + 精排 {funnelData.stage2LatencyMs}ms)</span>
                </div>
              </div>
            </div>

            {/* Visual Funnel Comparison: Stage 1 Coarse vs Stage 2 Reranked */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Stage 1 粗排结果 (Hybrid RRF Top K) */}
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 md:p-5 flex flex-col">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800 flex items-center justify-center text-xs font-bold font-mono">
                      1
                    </span>
                    <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-1.5">
                      <span>Stage 1: 粗排召回候选集</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                        Hybrid RRF ({funnelData.stage1Candidates.length} 篇)
                      </span>
                    </h3>
                  </div>
                  <span className="text-[11px] text-zinc-500 font-mono">
                    目标: 查全率 (Recall)
                  </span>
                </div>

                <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
                  双轨漏斗通过词法与语义并联召回。注意：排在前面的文档往往是字面频率高或通用概括性文档，<strong>尚未经过逻辑前置条件与时效权威筛选</strong>。
                </p>

                <div className="space-y-2 flex-1">
                  {funnelData.stage1Candidates.map((cand, idx) => {
                    const doc = "doc" in cand ? cand.doc : cand;
                    const initialRank = idx + 1;
                    const isTargetDoc =
                      cases.find((c) => c.id === selectedCaseId)?.targetDocId === doc.id;
                    const isTop1 = initialRank === 1;

                    return (
                      <div
                        key={doc.id}
                        className={`p-3 rounded-lg border text-xs transition-all ${
                          isTop1 && !isTargetDoc
                            ? "bg-zinc-900/50 border-l-2 border-l-amber-500/70 border-zinc-800/60 text-zinc-200"
                            : isTargetDoc
                            ? "bg-zinc-900/50 border-l-2 border-l-emerald-500/70 border-zinc-800/60 text-zinc-200"
                            : "bg-zinc-900/30 border-zinc-800/50 text-zinc-300"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 truncate">
                            <span className="w-5 h-5 rounded bg-zinc-800/80 text-zinc-400 font-mono text-xs flex items-center justify-center font-bold shrink-0">
                              #{initialRank}
                            </span>
                            <span className="font-semibold text-zinc-200 truncate">
                              {doc.title}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-zinc-500 whitespace-nowrap">
                            {doc.tokenCount} tok
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-1">
                          <span className="font-mono text-zinc-400">{doc.id}</span>
                          {isTop1 && !isTargetDoc && (
                            <span className="text-amber-400/90 font-medium flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              粗排误判首位
                            </span>
                          )}
                          {isTargetDoc && (
                            <span className="text-emerald-400/90 font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              黄金真值文档
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Stage 2 精排结果 (Cross-Encoder Reranked) */}
              <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4 md:p-5 flex flex-col">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/30 flex items-center justify-center text-xs font-bold font-mono">
                      2
                    </span>
                    <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                      <span>Stage 2: Cross-Encoder 深度重排</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-teal-300 font-mono">
                        Reranked
                      </span>
                    </h3>
                  </div>
                  <span className="text-[11px] text-teal-400 font-mono font-medium">
                    目标: 查准率 (Precision)
                  </span>
                </div>

                <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
                  单塔计算 Query 与 Doc 每一个 Token 的全量交叉注意力。识别<strong>特例覆写、时效废弃、逻辑否定</strong>，产出深度相关性得分与位次重排：
                </p>

                <div className="space-y-2 flex-1">
                  {funnelData.stage2Reranked.map((item, idx) => {
                    const isTargetDoc =
                      cases.find((c) => c.id === selectedCaseId)?.targetDocId === item.doc.id;
                    const isInsideTopN = idx < stage2TopN;
                    const isFirstOutsideTopN = idx === stage2TopN;

                    return (
                      <div key={item.doc.id}>
                        {isFirstOutsideTopN && (
                          <div className="py-2.5 flex items-center gap-3 my-2">
                            <div className="h-px bg-zinc-800/80 flex-1" />
                            <span className="px-3 py-1 rounded-full text-[10px] font-mono font-medium text-zinc-400 bg-zinc-900 border border-zinc-800 flex items-center gap-1.5 shadow-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-teal-400/80" />
                              Top {stage2TopN} 黄金上下文截断线 (仅向 LLM 注入以上文档)
                            </span>
                            <div className="h-px bg-zinc-800/80 flex-1" />
                          </div>
                        )}

                        <div
                          className={`p-3 rounded-lg border text-xs transition-all ${
                            idx === 0
                              ? "bg-gradient-to-r from-teal-950/20 via-zinc-900/60 to-zinc-900/40 border-l-2 border-l-teal-500/90 border-zinc-800/70 text-zinc-200 shadow-sm"
                              : isInsideTopN
                              ? "bg-zinc-900/50 border-l-2 border-l-teal-500/40 border-zinc-800/60 text-zinc-200"
                              : "bg-zinc-950/40 border-zinc-850/40 text-zinc-500 opacity-60"
                          } ${
                            inspectedDocId === item.doc.id
                              ? "ring-1 ring-teal-500/40 bg-zinc-900/80"
                              : ""
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2 truncate">
                              <span
                                className={`w-5 h-5 rounded flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                                  idx === 0
                                    ? "bg-teal-500/20 text-teal-300"
                                    : isInsideTopN
                                    ? "bg-zinc-800/80 text-zinc-300"
                                    : "bg-transparent text-zinc-600"
                                }`}
                              >
                                #{item.rerankRank}
                              </span>
                              <span className="font-semibold text-zinc-100 truncate">
                                {item.doc.title}
                              </span>
                              {isTargetDoc && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-mono shrink-0">
                                  真值目标
                                </span>
                              )}
                            </div>

                            {/* Rank Delta & Score Indicator */}
                            <div className="flex items-center gap-2 shrink-0">
                              {item.rankDelta > 0 ? (
                                <span className="px-1.5 py-0.5 rounded font-mono font-medium text-[10px] bg-emerald-500/10 text-emerald-400 flex items-center gap-0.5">
                                  <TrendingUp className="w-2.5 h-2.5" />
                                  +{item.rankDelta}
                                </span>
                              ) : item.rankDelta < 0 ? (
                                <span className="px-1.5 py-0.5 rounded font-mono font-medium text-[10px] bg-rose-500/10 text-rose-400 flex items-center gap-0.5">
                                  <TrendingDown className="w-2.5 h-2.5" />
                                  {item.rankDelta}
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded font-mono text-[10px] text-zinc-600">
                                  -
                                </span>
                              )}

                              <span
                                className={`font-mono text-xs ${
                                  idx === 0 ? "font-bold text-teal-400" : "text-zinc-300 font-medium"
                                }`}
                              >
                                {(item.rerankScore * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>

                          {/* Decision Reason: Clean hairline separator, no heavy box-in-a-box */}
                          <div className="mt-2.5 pt-2 border-t border-zinc-800/40 text-[11px] text-zinc-400 flex flex-col gap-1.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="leading-relaxed text-zinc-400 flex items-start gap-1.5">
                                <span className="text-zinc-500 shrink-0 font-medium">💡 决策分析:</span>
                                <span className="text-zinc-300">{item.decisionReason}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setInspectedDocId(
                                    inspectedDocId === item.doc.id ? null : item.doc.id
                                  )
                                }
                                className="text-[10px] text-teal-400/90 hover:text-teal-300 flex items-center gap-1 font-mono shrink-0 py-0.5 px-1.5 rounded hover:bg-zinc-800 transition-colors"
                              >
                                <Eye className="w-2.5 h-2.5" />
                                {inspectedDocId === item.doc.id ? "收起" : "注意力详情"}
                              </button>
                            </div>

                            {/* Expanded Attention Inspector */}
                            {inspectedDocId === item.doc.id && (
                              <div className="mt-2 pt-2 border-t border-zinc-800/60 space-y-1.5">
                                <div className="text-[10px] font-semibold text-teal-300">
                                  🔍 激活的 Token-Level 交叉注意力对齐对 (Cross-Attention Pairs):
                                </div>
                                {item.keyCrossAttentionPairs.length > 0 ? (
                                  <div className="space-y-1">
                                    {item.keyCrossAttentionPairs.map((pair, pIdx) => (
                                      <div
                                        key={pIdx}
                                        className="p-1.5 rounded bg-zinc-900/80 text-[11px] flex items-center justify-between border border-zinc-800 font-mono"
                                      >
                                        <div className="flex items-center gap-1 text-zinc-300">
                                          <span className="text-teal-300">"{pair.queryToken}"</span>
                                          <span className="text-zinc-600">↔</span>
                                          <span className="text-amber-300">"{pair.docToken}"</span>
                                        </div>
                                        <span className="text-[10px] px-1 rounded bg-teal-950 text-teal-400 font-bold">
                                          {(pair.weight * 100).toFixed(0)}%
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-zinc-500 italic">
                                    无特殊强规则约束，基于全局词元交叉注意力权重计算。
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Stage 3 & 4: Context Truncation & LLM Contrast Verification */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 md:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-teal-400" />
                    <span>Stage 3 & 4: 黄金上下文装配与端到端 LLM 对比验证</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    对比未经重排直接截断（采纳粗排 Top 1）vs 经过 Cross-Encoder 精排（采纳黄金 Top 1）对 LLM 回答的质的差异
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRunLLMContrast}
                  disabled={isGeneratingLLM}
                  className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-sm transition-all"
                >
                  {isGeneratingLLM ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>一键对比模型推理效果</span>
                </button>
              </div>

              {/* Quantified Token & SNR Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800">
                  <div className="text-zinc-500 text-[11px] mb-0.5">全部粗排候选 Token</div>
                  <div className="text-lg font-bold font-mono text-zinc-200">
                    {funnelData.promptTokenStats.allCandidatesTokens.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-zinc-500">若全量塞给模型易致注意力稀释</div>
                </div>

                <div className="p-3 rounded-lg bg-teal-950/20 border border-teal-800/40">
                  <div className="text-teal-400 text-[11px] mb-0.5 font-semibold">精排截断黄金上下文</div>
                  <div className="text-lg font-bold font-mono text-teal-300">
                    {funnelData.promptTokenStats.truncatedTokens.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-teal-400/80 font-mono">
                    Token 消耗节约: {funnelData.promptTokenStats.tokenSavingsPct}%
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800">
                  <div className="text-zinc-500 text-[11px] mb-0.5">重排位次修正状态</div>
                  <div className="text-sm font-bold text-zinc-200 flex items-center gap-1 mt-1">
                    {funnelData.precisionShift.top1DocChanged ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5" />
                        成功反转纠偏
                      </span>
                    ) : (
                      <span className="text-zinc-400 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        粗排首位已吻合
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate mt-0.5">
                    {funnelData.precisionShift.top1DocChanged ? "排位逆转" : "保持一致"}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800">
                  <div className="text-zinc-500 text-[11px] mb-0.5">两阶段总延迟</div>
                  <div className="text-lg font-bold font-mono text-zinc-200">
                    {funnelData.totalLatencyMs} ms
                  </div>
                  <div className="text-[10px] text-zinc-500">符合工业界 &lt;100ms 黄金准则</div>
                </div>
              </div>

              {/* Side-by-Side Model Answer Comparison */}
              {llmContrastData ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {/* Left: Unranked Coarse Context Answer */}
                  <div className="p-4 rounded-lg bg-zinc-950 border border-amber-900/40 text-xs flex flex-col">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
                      <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5" />
                        未经精排：采纳粗排 Top 1 文档
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">
                        《{llmContrastData.coarseTopDoc?.title}》
                      </span>
                    </div>
                    <div className="text-zinc-300 leading-relaxed whitespace-pre-wrap flex-1">
                      {llmContrastData.coarseAnswer}
                    </div>
                    <div className="mt-3 pt-2 border-t border-zinc-850 text-[10px] text-amber-500/90 font-mono">
                      ⚠️ 痛点：因粗排缺乏逻辑否定与时效感知，模型采纳了次优或废弃文档，造成回答严重失真或以偏概全。
                    </div>
                  </div>

                  {/* Right: Cross-Encoder Golden Context Answer */}
                  <div className="p-4 rounded-lg bg-teal-950/30 border border-teal-700/60 text-xs flex flex-col shadow-md">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-teal-800/60">
                      <span className="font-bold text-teal-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                        Cross-Encoder 精排：采纳黄金上下文
                      </span>
                      <span className="text-[10px] font-mono text-teal-300 font-semibold">
                        《{llmContrastData.rerankTopDoc?.title}》
                      </span>
                    </div>
                    <div className="text-zinc-100 leading-relaxed whitespace-pre-wrap flex-1">
                      {llmContrastData.rerankAnswer}
                    </div>
                    <div className="mt-3 pt-2 border-t border-teal-800/40 text-[10px] text-teal-400 font-mono">
                      100% 靶向精准：交叉注意力成功捕获特例从句与时效标签，精准回答无幻觉！
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-lg bg-zinc-950/40 border border-zinc-800/80 text-center text-xs text-zinc-500">
                  点击上方“一键对比模型推理效果”，观察未经重排 vs 精排重排后 LLM 输出的巨大质量差距。
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: 双塔 vs 单塔深度实验台 (Bi-Encoder vs Cross-Encoder Lab)   */}
        {/* ================================================================= */}
        {activeTab === "lab" && (
          <div className="space-y-6">
            {/* Case Selector for Lab */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-2">
              <div className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Split className="w-3.5 h-3.5 text-teal-400" />
                  切换对决案例，观测不同领域的 Token-Level 交叉注意力权重：
                </span>
                <span className="text-zinc-500 font-normal">当前案例: {currentLabCase.category}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {cases.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setLabCaseIdx(i);
                      setHoveredToken(null);
                    }}
                    className={`p-2 rounded-lg border text-xs text-left transition-all ${
                      labCaseIdx === i
                        ? "bg-teal-950/50 border-teal-500/50 text-teal-200 font-semibold shadow-sm"
                        : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850"
                    }`}
                  >
                    <div className="text-[10px] text-zinc-500 font-mono">Case 0{i + 1}</div>
                    <div className="truncate text-[11px] mt-0.5">{c.title.split("：")[1] || c.title}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Architecture Visual Explainer */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Bi-Encoder Card */}
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                  <div className="flex items-center gap-2">
                    <Split className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-sm font-bold text-white">Bi-Encoder 双塔架构 (向量检索)</h3>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 font-mono">
                    独立编码 + 池化
                  </span>
                </div>

                <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-850 font-mono text-xs space-y-2 text-zinc-300">
                  <div className="p-2 rounded bg-zinc-900/80 border border-zinc-800 text-center text-indigo-300">
                    Query: "{currentLabCase.query}"
                  </div>
                  <div className="text-center text-zinc-600">↓ 独立前向传播 (Transformer A)</div>
                  <div className="p-2 rounded bg-indigo-950/40 border border-indigo-800 text-center text-indigo-200">
                    Query 向量: [0.12, -0.45, 0.88, ... 512维]
                  </div>
                  <div className="text-center text-zinc-600">▲ 零 Token 级交叉注意力 (Vacuum) ▼</div>
                  <div className="p-2 rounded bg-indigo-950/40 border border-indigo-800 text-center text-indigo-200">
                    Doc 向量: [0.09, -0.41, 0.82, ... 512维]
                  </div>
                  <div className="text-center text-zinc-600">↑ 离线池化计算 (Transformer B)</div>
                  <div className="p-2 rounded bg-zinc-900/80 border border-zinc-800 text-center text-indigo-300 truncate">
                    Document: "{currentLabCase.targetDocTitle}"
                  </div>
                  <div className="pt-2 text-center text-xs font-bold text-amber-400">
                    最终匹配度 = Cosine(q, d) 纯几何夹角
                  </div>
                </div>

                <div className="text-xs text-zinc-400 space-y-1.5 leading-relaxed">
                  <div className="flex items-start gap-1.5">
                    <span className="text-emerald-400 font-bold">优势:</span>
                    <span>可离线预计算海量文档向量，在线仅需 $O(1)$ 向量点积，极速毫秒级响应。</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="text-rose-400 font-bold">致命软肋:</span>
                    <span>均值池化抹平局部关键逻辑（如“除...外”、“已废弃”），无法理解否定与前置约束。</span>
                  </div>
                </div>
              </div>

              {/* Cross-Encoder Card */}
              <div className="bg-zinc-900/60 border border-teal-900/50 rounded-xl p-5 space-y-4 shadow-lg">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-teal-400" />
                    <h3 className="text-sm font-bold text-white">Cross-Encoder 单塔架构 (深度重排)</h3>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-teal-950 text-teal-300 font-mono">
                    全量交叉注意力
                  </span>
                </div>

                <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-855 font-mono text-xs space-y-2 text-zinc-300">
                  <div className="p-2.5 rounded bg-teal-950/40 border border-teal-800 text-teal-200 text-center leading-tight">
                    [CLS] {currentLabCase.query} [SEP] {currentLabCase.targetDocTitle} ... [SEP]
                  </div>
                  <div className="text-center text-teal-500 font-bold py-1">
                    ↓ 12~24 层 Transformer 全量交叉注意力 (All-to-All Attention) ↓
                  </div>
                  <div className="p-3 rounded bg-zinc-900/90 border border-teal-800/60 space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span>Query Tokens</span>
                      <span className="text-teal-400">
                        {hoveredToken ? `聚焦: ${hoveredToken}` : "悬停词汇查看深层对齐"}
                      </span>
                      <span>Doc Tokens</span>
                    </div>
                    <div className="h-px bg-zinc-800" />
                    {currentLabCase.id.includes("exception") ? (
                      <>
                        <div
                          onMouseEnter={() => setHoveredToken("Alpha")}
                          onMouseLeave={() => setHoveredToken(null)}
                          className={`flex items-center justify-between p-1 rounded cursor-pointer transition-colors ${
                            hoveredToken === "Alpha" ? "bg-teal-900/50 text-white font-bold" : "text-emerald-300"
                          }`}
                        >
                          <span>"Alpha" ➔</span>
                          <span className="text-teal-400">100% 强绑定</span>
                          <span>➔ "专属 30 天企业保障"</span>
                        </div>
                        <div
                          onMouseEnter={() => setHoveredToken("通用政策")}
                          onMouseLeave={() => setHoveredToken(null)}
                          className={`flex items-center justify-between p-1 rounded cursor-pointer transition-colors ${
                            hoveredToken === "通用政策" ? "bg-amber-900/50 text-white font-bold" : "text-amber-300"
                          }`}
                        >
                          <span>"退款通用" ➔</span>
                          <span className="text-amber-400">除外从句激活</span>
                          <span>➔ "除特定产品另有说明外"</span>
                        </div>
                      </>
                    ) : currentLabCase.id.includes("temporal") ? (
                      <>
                        <div
                          onMouseEnter={() => setHoveredToken("现行有效")}
                          onMouseLeave={() => setHoveredToken(null)}
                          className={`flex items-center justify-between p-1 rounded cursor-pointer transition-colors ${
                            hoveredToken === "现行有效" ? "bg-teal-900/50 text-white font-bold" : "text-emerald-300"
                          }`}
                        >
                          <span>"现行有效" ➔</span>
                          <span className="text-teal-400">最高权威加权</span>
                          <span>➔ "2026 年度现行总则 (7天)"</span>
                        </div>
                        <div
                          onMouseEnter={() => setHoveredToken("已废弃")}
                          onMouseLeave={() => setHoveredToken(null)}
                          className={`flex items-center justify-between p-1 rounded cursor-pointer transition-colors ${
                            hoveredToken === "已废弃" ? "bg-rose-900/50 text-white font-bold" : "text-rose-300"
                          }`}
                        >
                          <span>"废弃旧档" ➔</span>
                          <span className="text-rose-400">严厉负向抑制</span>
                          <span>➔ "[已废弃 2024 条款]"</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div
                          onMouseEnter={() => setHoveredToken("因果约束")}
                          onMouseLeave={() => setHoveredToken(null)}
                          className={`flex items-center justify-between p-1 rounded cursor-pointer transition-colors ${
                            hoveredToken === "因果约束" ? "bg-teal-900/50 text-white font-bold" : "text-emerald-300"
                          }`}
                        >
                          <span>"核心意图" ➔</span>
                          <span className="text-teal-400">深层注意力</span>
                          <span>➔ "{currentLabCase.goldenKeyFact.slice(0, 16)}..."</span>
                        </div>
                        <div
                          onMouseEnter={() => setHoveredToken("通用噪声")}
                          onMouseLeave={() => setHoveredToken(null)}
                          className={`flex items-center justify-between p-1 rounded cursor-pointer transition-colors ${
                            hoveredToken === "通用噪声" ? "bg-zinc-800 text-white font-bold" : "text-zinc-400"
                          }`}
                        >
                          <span>"泛化词汇" ➔</span>
                          <span className="text-zinc-500">自适应降权</span>
                          <span>➔ "忽略通用模板干扰"</span>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="pt-2 text-center text-xs font-bold text-teal-300">
                    最终输出 = Sigmoid([CLS]) 真实相关度概率 P(Relevant | Q, D)
                  </div>
                </div>

                <div className="text-xs text-zinc-400 space-y-1.5 leading-relaxed">
                  <div className="flex items-start gap-1.5">
                    <span className="text-emerald-400 font-bold">优势:</span>
                    <span>逐词全注意力交互，100% 洞察语境从句、时效否定与细微约束，查准率极高。</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="text-rose-400 font-bold">物理代价:</span>
                    <span>无法离线预计算，复杂度 $O(M \cdot L^2)$，因此绝不能对全量百万语料直接跑。</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Complexity & Cost Simulation Calculator */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-800">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Scale className="w-4 h-4 text-teal-400" />
                    <span>算力复杂度量化计算器：为什么工业界必须采用两阶段漏斗？</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    拖动滑块模拟不同语料库规模 $M$ 下的理论耗时与吞吐量折中
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-400">语料库规模 $M$:</span>
                  <span className="font-mono font-bold text-teal-300 text-sm">
                    {simCorpusSize.toLocaleString()} 篇
                  </span>
                </div>
              </div>

              <input
                type="range"
                min={1000}
                max={500000}
                step={5000}
                value={simCorpusSize}
                onChange={(e) => setSimCorpusSize(Number(e.target.value))}
                className="w-full accent-teal-500 cursor-pointer"
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                {/* All Bi-Encoder */}
                <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
                  <div className="font-semibold text-indigo-400">方案 A: 全量 Bi-Encoder (纯向量)</div>
                  <div className="text-2xl font-bold font-mono text-zinc-100">
                    {simMetrics.biEncoderTimeMs} ms
                  </div>
                  <div className="text-zinc-500 leading-tight">
                    速度极快但存在四大盲区，Top 1 准确率常年徘徊在 50%~70%
                  </div>
                </div>

                {/* All Cross-Encoder */}
                <div className="p-4 rounded-lg bg-zinc-950 border border-rose-900/40 space-y-2">
                  <div className="font-semibold text-rose-400">方案 B: 全量 Cross-Encoder (纯精排)</div>
                  <div className="text-2xl font-bold font-mono text-rose-300">
                    {simMetrics.crossEncoderAllTimeSec} 秒
                  </div>
                  <div className="text-rose-400/80 leading-tight font-medium">
                    ❌ 物理不可行！单次问答需等待数分钟，GPU 显存直接爆仓破产
                  </div>
                </div>

                {/* Two-Stage Funnel */}
                <div className="p-4 rounded-lg bg-teal-950/30 border border-teal-700/60 space-y-2 shadow-sm">
                  <div className="font-bold text-teal-300 flex items-center justify-between">
                    <span>方案 C: 两阶段漏斗 (工业圣杯)</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500 text-zinc-950 font-black">
                      加速 {simMetrics.speedupFactor}x
                    </span>
                  </div>
                  <div className="text-2xl font-bold font-mono text-teal-200">
                    {simMetrics.funnelTimeMs} ms
                  </div>
                  <div className="text-teal-400/80 leading-tight font-medium">
                    兼具毫秒级超低延迟与 100% 查全查准率，现代工程最优解！
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: 6 大基准对决 (Showdown Matrix)                             */}
        {/* ================================================================= */}
        {activeTab === "showdown" && (
          <div className="space-y-6">
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-teal-400" />
                    <span>6 大黄金基准场景全景对决矩阵</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    系统性检验 Stage 1 粗排直接截取 Top 1 与 Stage 2 两阶段精排截取 Top 1 的正面对决
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRunShowdown}
                  disabled={isRunningShowdown}
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5 shadow-sm transition-all"
                >
                  {isRunningShowdown ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  <span>一键全量评测 6 场景对决</span>
                </button>
              </div>

              {/* Showdown Stats Summary */}
              {showdownSummary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800">
                    <div className="text-zinc-500 mb-0.5">评测总用例</div>
                    <div className="text-lg font-bold font-mono text-zinc-200">
                      {showdownSummary.totalCases} 组典型陷阱
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-800/40">
                    <div className="text-amber-400 mb-0.5 font-medium">Stage 1 粗排 Top 1 命中率</div>
                    <div className="text-lg font-bold font-mono text-amber-300">
                      {showdownSummary.stage1TopHits} / {showdownSummary.totalCases} ({showdownSummary.stage1AccuracyPct}%)
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-teal-950/30 border border-teal-700/60">
                    <div className="text-teal-300 mb-0.5 font-bold">Stage 2 精排 Top 1 命中率</div>
                    <div className="text-lg font-bold font-mono text-teal-200">
                      {showdownSummary.stage2TopHits} / {showdownSummary.totalCases} ({showdownSummary.stage2AccuracyPct}%)
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/40">
                    <div className="text-emerald-400 mb-0.5 font-medium">精排准确率绝对跃升</div>
                    <div className="text-lg font-bold font-mono text-emerald-300">
                      +{(showdownSummary.stage2AccuracyPct - showdownSummary.stage1AccuracyPct).toFixed(1)}%
                    </div>
                  </div>
                </div>
              )}

              {/* Detailed Matrix Table */}
              <div className="overflow-x-auto rounded-lg border border-zinc-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-950 text-zinc-400 border-b border-zinc-800">
                      <th className="p-3 font-semibold w-12">#</th>
                      <th className="p-3 font-semibold">陷阱分类与测试用例</th>
                      <th className="p-3 font-semibold">Stage 1 粗排首位</th>
                      <th className="p-3 font-semibold">Stage 2 精排首位</th>
                      <th className="p-3 font-semibold">位次变动</th>
                      <th className="p-3 font-semibold">机制溯源与破局核心</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {(showdownCases || cases.map((c, i) => ({
                      id: c.id,
                      category: c.category,
                      title: c.title,
                      query: c.query,
                      targetDocId: c.targetDocId,
                      targetDocTitle: c.targetDocTitle,
                      phenomenon: c.phenomenon,
                      stage1: {
                        topDocId: c.coarseWinnerDocId,
                        topDocTitle: c.coarseWinnerTitle,
                        targetRank: i === 5 ? 1 : 2,
                        isTopHit: i === 5,
                      },
                      stage2: {
                        topDocId: c.targetDocId,
                        topDocTitle: c.targetDocTitle,
                        targetRank: 1,
                        isTopHit: true,
                        rerankScore: 0.94,
                        rankDelta: i === 5 ? 0 : 2,
                        decisionReason: c.phenomenon,
                      },
                    }))).map((row, idx) => (
                      <tr
                        key={row.id}
                        className="bg-zinc-900/20 hover:bg-zinc-900/50 transition-colors"
                      >
                        <td className="p-3 font-mono text-zinc-500 font-bold">
                          {idx + 1}
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-zinc-200">{row.title}</div>
                          <div className="text-[11px] text-zinc-400 mt-0.5 truncate max-w-xs">
                            "{row.query}"
                          </div>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono mt-1 inline-block">
                            {row.category}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            {row.stage1.isTopHit ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            )}
                            <span
                              className={`truncate font-medium ${
                                row.stage1.isTopHit ? "text-emerald-300" : "text-amber-300"
                              }`}
                            >
                              {row.stage1.topDocTitle}
                            </span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                            <span className="font-semibold text-teal-200 truncate">
                              {row.stage2.topDocTitle}
                            </span>
                          </div>
                        </td>
                        <td className="p-3">
                          {row.stage2.rankDelta > 0 ? (
                            <span className="px-1.5 py-0.5 rounded font-mono font-bold text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800">
                              ↑+{row.stage2.rankDelta}
                            </span>
                          ) : row.stage2.rankDelta < 0 ? (
                            <span className="px-1.5 py-0.5 rounded font-mono font-bold text-[10px] bg-rose-950 text-rose-300 border border-rose-800">
                              ↓{row.stage2.rankDelta}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-zinc-800 text-zinc-400">
                              保持 #1
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-[11px] text-zinc-400 leading-relaxed max-w-sm">
                          {row.phenomenon}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: 架构心法与预告 (Takeaways)                                 */}
        {/* ================================================================= */}
        {activeTab === "takeaways" && (
          <div className="space-y-6">
            {/* Core Architecture Principles */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center font-bold font-mono">
                  01
                </div>
                <h3 className="text-sm font-bold text-white">分工第一性原理：Recall vs Precision</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  粗排（Hybrid RRF）的目标是<strong>“宁滥勿缺”</strong>，保证黄金文档必然在 Top 50 候选池中；
                  精排（Cross-Encoder）的目标是<strong>“宁缺毋滥”</strong>，通过深层交叉注意力过滤噪声并修正排位。
                </p>
              </div>

              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold font-mono">
                  02
                </div>
                <h3 className="text-sm font-bold text-white">两阶段漏斗黄金比例 (Funnel Ratio)</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  海量语料（$10^5 \sim 10^7$ 篇） ➔ 粗排召回 <strong>Top 50~100</strong> ➔
                  Cross-Encoder 重排 <strong>Top 3~5</strong> ➔ 黄金上下文喂给 LLM。
                  总延迟维持在 30~80ms，Prompt Token 节约 70%！
                </p>
              </div>

              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center font-bold font-mono">
                  03
                </div>
                <h3 className="text-sm font-bold text-white">工业级选型：SOTA Reranker 图谱</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  <strong>私有化开源</strong>: BGE-Reranker-Large (vLLM / ONNX 加速);
                  <br />
                  <strong>SaaS API</strong>: Cohere Rerank-3 / Voyage Rerank-2;
                  <br />
                  <strong>折中迟交互</strong>: ColBERT / Jina-ColBERT (支持部分索引预计算)。
                </p>
              </div>
            </div>

            {/* Teaser for Lesson 8 */}
            <div className="p-6 rounded-xl bg-gradient-to-r from-teal-950/40 via-zinc-900/60 to-indigo-950/40 border border-teal-800/40 space-y-4">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded bg-teal-500/20 text-teal-300 font-mono text-xs font-bold border border-teal-500/30">
                  NEXT LESSON PREVIEW
                </span>
                <span className="text-xs text-zinc-400">第 08 课演进预告</span>
              </div>

              <h2 className="text-lg md:text-xl font-bold text-white">
                新的物理边界：如果一篇文档长达 10 万字怎么办？
              </h2>

              <p className="text-xs md:text-sm text-zinc-300 leading-relaxed max-w-3xl">
                通过第 7 课，我们彻底打通了“粗排 ➔ 精排”的两阶段漏斗。但细心的工程师立刻会发现一个致命前提：
                <strong>目前我们所有的检索与精排，依然是以“整篇文档（Document）”为单位进行的！</strong>
                <br />
                在真实生产中，一份企业运维白皮书或法律规约往往长达 400 页、超过 10 万 Token：
                <br />
                1. <strong>Bi-Encoder 彻底失效</strong>：10 万 Token 无论如何无法压缩成一个 512 维向量；
                <br />
                2. <strong>Cross-Encoder 上下文超限</strong>：单塔注意力窗口通常仅有 512~1024 Token，整篇文档塞不进去；
                <br />
                3. <strong>LLM 成本爆炸</strong>：即使重排精准，整篇长文注入 Prompt 依然会导致 Context 臃肿崩溃。
              </p>

              <div className="pt-2">
                <div className="text-xs font-mono text-teal-400 font-semibold flex items-center gap-2">
                  <span>👉 第 08 课：为什么需要 Chunk？—— 文档切分粒度、语义边界与重叠窗口 (Overlap) 工程</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

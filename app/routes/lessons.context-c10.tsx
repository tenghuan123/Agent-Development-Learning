import { useState, useEffect } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import {
  BenchmarkCorpusManager,
  type ContextualStrategy,
  type ContextualOutcome,
  type ContextualEvalRow,
  type ChunkStrategy,
  CURATED_SITUATIONAL_CONTEXTS,
} from "~/core/context-bench/corpus";
import {
  FolderTree,
  Activity,
  Play,
  RefreshCw,
  Search,
  CheckCircle2,
  BookOpen,
  Sparkles,
  Zap,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Database,
  Layers,
  FileText,
  Clock,
  Coins,
} from "lucide-react";

// ---------------------------------------------------------------------------
// 序列化后的基准用例
// ---------------------------------------------------------------------------

interface SerializedCase {
  id: string;
  category: string;
  title: string;
  query: string;
  trapType: string;
  goldenKeyFact: string;
  solvedInThisLesson: boolean;
  needleDocId: string;
}

interface MatrixResponse {
  success: boolean;
  rows: ContextualEvalRow[];
  caseCount: number;
  corpusDocCount: number;
}

interface PipelineResponse {
  success: boolean;
  query: string;
  paths: {
    raw: { label: string; content: string; tokens: number; answer: string | null; latencyMs: number };
    breadcrumbs: { label: string; content: string; tokens: number; answer: string | null; latencyMs: number };
    situational: { label: string; content: string; tokens: number; answer: string | null; latencyMs: number };
    hybrid: { label: string; content: string; tokens: number; answer: string | null; latencyMs: number };
  };
  ranWithLLM: boolean;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loader() {
  const hasServerKey = Boolean(
    process.env.LLM_API_KEY && process.env.LLM_API_KEY.trim().length > 0
  );
  const model = process.env.LLM_MODEL || "glm-4-flash";
  const defaultBaseURL =
    process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";

  const docs = BenchmarkCorpusManager.getAllDocuments();
  const totalCorpusTokens = docs.reduce((acc, d) => acc + d.tokenCount, 0);

  const c10Cases = BenchmarkCorpusManager.getC10BenchmarkCases();
  const serializedCases: SerializedCase[] = c10Cases.map((c) => ({
    id: c.id,
    category: c.category,
    title: c.title,
    query: c.query,
    trapType: c.trapType,
    goldenKeyFact: c.goldenKeyFact,
    solvedInThisLesson: c.solvedInThisLesson,
    needleDocId: c.needleDocId,
  }));

  return {
    hasServerKey,
    model,
    defaultBaseURL,
    totalCorpusTokens,
    docCount: docs.length,
    cases: serializedCases,
    curatedContextCount: Object.keys(CURATED_SITUATIONAL_CONTEXTS).length,
  };
}

// ---------------------------------------------------------------------------
// 主页面组件
// ---------------------------------------------------------------------------

export default function ContextLessonC10() {
  const {
    hasServerKey,
    model,
    defaultBaseURL,
    totalCorpusTokens,
    docCount,
    cases,
    curatedContextCount,
  } = useLoaderData<typeof loader>();

  const [customApiKey, setCustomApiKey] = useState("");
  const [customBaseURL, setCustomBaseURL] = useState(defaultBaseURL);

  useEffect(() => {
    const savedKey = localStorage.getItem("MINI_CLAUDE_API_KEY");
    if (savedKey) setCustomApiKey(savedKey);
    const savedURL = localStorage.getItem("MINI_CLAUDE_BASE_URL");
    if (savedURL) setCustomBaseURL(savedURL);
  }, []);

  const handleSaveSettings = (settings: { apiKey: string; baseURL: string }) => {
    setCustomApiKey(settings.apiKey);
    setCustomBaseURL(settings.baseURL);
    localStorage.setItem("MINI_CLAUDE_API_KEY", settings.apiKey);
    localStorage.setItem("MINI_CLAUDE_BASE_URL", settings.baseURL);
  };

  const isKeyAvailable = hasServerKey || Boolean(customApiKey.trim().length > 0);

  const [activeTab, setActiveTab] = useState<"studio" | "showdown" | "architecture">("studio");

  // ---- 检索工坊状态 ----
  const defaultCase = cases.find((c) => c.id === "ck-05-orphan-anaphora") || cases[0];
  const [queryText, setQueryText] = useState(defaultCase?.query ?? "");
  const [selectedCaseId, setSelectedCaseId] = useState(defaultCase?.id ?? "");
  const [strategy, setStrategy] = useState<ContextualStrategy>("situational");
  const [chunkStrategy, setChunkStrategy] = useState<ChunkStrategy>("recursive");
  const [chunkSize, setChunkSize] = useState(256);
  const [overlap, setOverlap] = useState(32);
  const [neighborWindow, setNeighborWindow] = useState(1);
  const [parentSize, setParentSize] = useState(1400);

  const [outcome, setOutcome] = useState<ContextualOutcome | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // 在线实时生成情境注标状态
  const [generatingChunkId, setGeneratingChunkId] = useState<string | null>(null);
  const [liveGeneratedContext, setLiveGeneratedContext] = useState<string | null>(null);

  // 四路对比状态
  const [pipeline, setPipeline] = useState<PipelineResponse | null>(null);
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);

  // ---- 基准对决状态 ----
  const [matrix, setMatrix] = useState<MatrixResponse | null>(null);
  const [isRunningMatrix, setIsRunningMatrix] = useState(false);

  // 动作：执行检索
  const runSearch = async () => {
    if (!queryText.trim()) return;
    setIsSearching(true);
    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search_contextual",
          query: queryText,
          strategy,
          chunkStrategy,
          chunkSize,
          overlap,
          parentSize: strategy === "situational-small-to-big" ? parentSize : 0,
          neighborWindow: strategy === "neighbor-sliding" ? neighborWindow : 0,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });
      const data = await resp.json();
      if (data.success) setOutcome(data.outcome);
    } catch (err) {
      console.error("Contextual Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  // 动作：在线调用 LLM 生成情境注标
  const generateSituationalContextForTopHit = async (chunkId: string, docId: string) => {
    setGeneratingChunkId(chunkId);
    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_situational_context",
          chunkId,
          docId,
          chunkStrategy,
          chunkSize,
          overlap,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        setLiveGeneratedContext(data.situationalContext);
      }
    } catch (err) {
      console.error("Generate Situational Context failed:", err);
    } finally {
      setGeneratingChunkId(null);
    }
  };

  // 动作：四路对比问答
  const runPipeline = async () => {
    if (!queryText.trim()) return;
    setIsRunningPipeline(true);
    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_contextual_pipeline",
          query: queryText,
          chunkStrategy,
          chunkSize,
          overlap,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });
      const data = await resp.json();
      if (data.success) setPipeline(data);
    } catch (err) {
      console.error("Pipeline failed:", err);
    } finally {
      setIsRunningPipeline(false);
    }
  };

  // 动作：执行基准对决矩阵
  const runMatrix = async () => {
    setIsRunningMatrix(true);
    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_contextual_matrix",
        }),
      });
      const data = await resp.json();
      if (data.success) setMatrix(data);
    } catch (err) {
      console.error("Matrix failed:", err);
    } finally {
      setIsRunningMatrix(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      <Header
        hasServerKey={hasServerKey}
        model={model}
        defaultBaseURL={defaultBaseURL}
        customApiKey={customApiKey}
        customBaseURL={customBaseURL}
        onSaveSettings={handleSaveSettings}
        currentLesson={{
          id: "context-c10",
          title: "第 10 课: Chunk 自己脱离语境无意义？(Contextual Retrieval)",
          badge: "C10",
        }}
      />

      {/* 面包屑导航栏 */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-30 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800/60">
              C10
            </span>
            <span className="text-slate-400">Context Engineering 专项实战</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-200 font-medium">
              第 10 课：Chunk 自己脱离语境没有意义怎么办？—— Contextual Retrieval 与上下文感知增强
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/lessons/context-c9-small-to-big"
              className="text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
            >
              ← 上一课 (C9 Small-to-Big 架构)
            </Link>
            <span className="text-slate-700">|</span>
            <Link
              to="/lessons/context-c11-agentic-retrieval"
              className="text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors font-medium"
            >
              下一课 (C11 Agentic Retrieval) →
            </Link>
            <span className="text-slate-700">|</span>
            <Link
              to="/docs/lessons/context/10-contextual-retrieval-and-metadata.md"
              className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" />
              阅读本课深度讲义
            </Link>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8">
        {/* 顶部标题栏 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Context Engineering · C10
              </span>
              <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20">
                语境感知增强
              </span>
              <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Anthropic Contextual Retrieval
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
              第 10 课：Chunk 自己脱离语境无意义？—— Contextual Retrieval
            </h1>
            <p className="text-slate-400 text-sm mt-1 max-w-3xl">
              切碎的切片开头孤零零写着“这种情况下须触发熔断”，脱离父文档后主语与因果失窃。引入 Anthropic 生成式情境注标、结构面包屑与跨块邻接扩展，让切片全息自洽，彻底解决代词孤岛（ck-05 单元自足率破局至 100%）。
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/docs/lessons/context/10-contextual-retrieval-and-metadata.md"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition"
            >
              <BookOpen className="w-4 h-4 text-emerald-400" />
              阅读本课深度理论
            </Link>
          </div>
        </div>

        {/* 核心指标与演进状态条 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-6">
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-400" /> 全量基准语料
            </div>
            <div className="text-lg font-bold text-slate-100">
              {docCount} <span className="text-xs font-normal text-slate-400">篇文档</span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{totalCorpusTokens.toLocaleString()} Tokens</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
              <FolderTree className="w-3.5 h-3.5 text-teal-400" /> 离线保真语境库
            </div>
            <div className="text-lg font-bold text-teal-300">
              {curatedContextCount} <span className="text-xs font-normal text-slate-400">个精选情境注标</span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">离线 0 延迟，支持在线 LLM 覆盖</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> C9 遗留痛点
            </div>
            <div className="text-lg font-bold text-amber-400">
              ck-05 <span className="text-xs font-normal text-slate-400">孤岛代词自足率 83.3%</span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">切片丢失主语“跨可用区切换失败”</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> C10 本课突破
            </div>
            <div className="text-lg font-bold text-emerald-400">
              100% <span className="text-xs font-normal text-slate-400">单元自足率与召回</span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Contextual 双轨重塑词法与向量</div>
          </div>
        </div>

        {/* 标签页导航 */}
        <div className="flex border-b border-slate-800 mb-6 gap-2">
          <button
            onClick={() => setActiveTab("studio")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === "studio"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-4 h-4" />
            语境工坊 (Contextual Studio)
          </button>
          <button
            onClick={() => setActiveTab("showdown")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === "showdown"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-4 h-4" />
            基准全景对决 (Benchmark Showdown)
          </button>
          <button
            onClick={() => setActiveTab("architecture")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === "architecture"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            架构深度推演 (Architecture & Engineering)
          </button>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* TAB 1: 语境工坊 (Contextual Studio) */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === "studio" && (
          <div className="space-y-6">
            {/* 快速基准用例选择器 */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center justify-between">
                <span>精选基准验证用例（点击快速载入）</span>
                <span className="text-[11px] text-emerald-400 font-normal">
                  重点关注 ck-05（C9未解的孤岛代词）
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {cases.map((c) => {
                  const isSelected = c.id === selectedCaseId;
                  const isCk05 = c.id === "ck-05-orphan-anaphora";
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCaseId(c.id);
                        setQueryText(c.query);
                      }}
                      className={`text-left p-2.5 rounded-lg border text-xs transition relative ${
                        isSelected
                          ? "bg-emerald-950/40 border-emerald-500/80 text-slate-100 ring-1 ring-emerald-500/40"
                          : "bg-slate-800/40 border-slate-800 text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-[10px] text-slate-400">{c.id}</span>
                        {isCk05 ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            本课核心突破
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">{c.category}</span>
                        )}
                      </div>
                      <div className="font-medium text-slate-200 truncate">{c.title}</div>
                      <div className="text-slate-400 text-[11px] truncate mt-0.5">{c.query}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 控制面板与搜索触发 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 左侧：参数与策略选择 */}
              <div className="lg:col-span-1 p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    检索 Query
                  </label>
                  <textarea
                    value={queryText}
                    onChange={(e) => setQueryText(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500 font-sans"
                    placeholder="输入用户问题..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    语境感知策略 (Contextual Strategy)
                  </label>
                  <div className="space-y-1.5">
                    {[
                      { id: "raw", label: "无语境孤立切片 (Raw Chunk)", desc: "基线：切片脱离文档，丢失主语与先行词" },
                      { id: "breadcrumbs", label: "结构面包屑 (Breadcrumbs)", desc: "零成本提取 Markdown 章节全路径" },
                      { id: "situational", label: "Anthropic 情境注标 (Situational)", desc: "浓缩 50~80 Token 语义前缀，消除孤岛代词" },
                      { id: "neighbor-sliding", label: "邻接块滑动扩展 (Neighbor Window)", desc: "动态拉取相邻前一片与后一片切片" },
                      { id: "situational-small-to-big", label: "Contextual + Small-to-Big (终极)", desc: "情境定位 Child + 父窗口 Parent 展开" },
                    ].map((opt) => (
                      <label
                        key={opt.id}
                        className={`flex flex-col p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                          strategy === opt.id
                            ? "bg-emerald-950/30 border-emerald-500/60 text-slate-100"
                            : "bg-slate-950/40 border-slate-800/80 text-slate-400 hover:bg-slate-800/40"
                        }`}
                      >
                        <div className="flex items-center gap-2 font-medium">
                          <input
                            type="radio"
                            name="strategy"
                            checked={strategy === opt.id}
                            onChange={() => setStrategy(opt.id as ContextualStrategy)}
                            className="text-emerald-500 focus:ring-emerald-500"
                          />
                          <span className={strategy === opt.id ? "text-emerald-300" : ""}>{opt.label}</span>
                        </div>
                        <span className="text-[11px] text-slate-500 ml-5 mt-0.5">{opt.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 切片基础配置 */}
                <div className="pt-2 border-t border-slate-800/60 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-slate-400">切分方式</label>
                    <select
                      value={chunkStrategy}
                      onChange={(e) => setChunkStrategy(e.target.value as ChunkStrategy)}
                      className="mt-1 w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-300"
                    >
                      <option value="recursive">结构感知 (Recursive)</option>
                      <option value="fixed">定长切分 (Fixed)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400">切片大小 (Tokens)</label>
                    <input
                      type="number"
                      value={chunkSize}
                      onChange={(e) => setChunkSize(Number(e.target.value))}
                      className="mt-1 w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-300"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400">重叠窗口 (Overlap)</label>
                    <input
                      type="number"
                      value={overlap}
                      onChange={(e) => setOverlap(Number(e.target.value))}
                      className="mt-1 w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-300"
                    />
                  </div>
                  {strategy === "neighbor-sliding" ? (
                    <div>
                      <label className="text-slate-400">邻接窗口 (±K)</label>
                      <input
                        type="number"
                        min={1}
                        max={3}
                        value={neighborWindow}
                        onChange={(e) => setNeighborWindow(Number(e.target.value))}
                        className="mt-1 w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-300"
                      />
                    </div>
                  ) : strategy === "situational-small-to-big" ? (
                    <div>
                      <label className="text-slate-400">父窗口预算 (Parent)</label>
                      <input
                        type="number"
                        value={parentSize}
                        onChange={(e) => setParentSize(Number(e.target.value))}
                        className="mt-1 w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-300"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="text-slate-500">父级展开</label>
                      <div className="mt-1 px-2 py-1 text-slate-500 bg-slate-950/50 rounded border border-slate-800/40 text-[11px]">
                        当前策略不展开
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={runSearch}
                    disabled={isSearching}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium transition shadow-lg shadow-emerald-900/20"
                  >
                    {isSearching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    执行语境检索
                  </button>
                  <button
                    onClick={runPipeline}
                    disabled={isRunningPipeline}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium transition"
                    title="端到端四路效果对比"
                  >
                    {isRunningPipeline ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    四路对决
                  </button>
                </div>
              </div>

              {/* 右侧：Top-1 切片全息剖析与命中结果 */}
              <div className="lg:col-span-2 space-y-4">
                {outcome ? (
                  <div className="space-y-4">
                    {/* 汇总统计条 */}
                    <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between text-xs gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">当前策略：</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                          {outcome.strategy}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-slate-300">
                        <span>粗排命中：<strong className="text-white">{outcome.stage1Count}</strong></span>
                        <span>最终注入：<strong className="text-emerald-400">{outcome.totalInjectedTokens}</strong> Tokens</span>
                        <span className="text-slate-500 font-mono">{outcome.vectorNote}</span>
                      </div>
                    </div>

                    {/* Top 命中切片列表 */}
                    <div className="space-y-3">
                      {outcome.hits.map((hit, idx) => {
                        const hasOrphanRisk = hit.chunk.orphanRisk.isOrphanHead;
                        const isResolved =
                          outcome.strategy === "situational" ||
                          outcome.strategy === "situational-small-to-big" ||
                          outcome.strategy === "neighbor-sliding";

                        return (
                          <div
                            key={hit.chunk.id}
                            className={`p-4 rounded-xl border transition ${
                              idx === 0
                                ? "bg-slate-900/90 border-emerald-500/40 shadow-lg shadow-emerald-950/20"
                                : "bg-slate-900/50 border-slate-800"
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-800 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                                  #{hit.rank} Rank
                                </span>
                                <span className="font-mono text-slate-400">{hit.chunk.id}</span>
                                <span className="text-slate-500">({hit.chunk.docTitle})</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400">精排得分：</span>
                                <span className="font-mono text-emerald-400 font-semibold">
                                  {hit.rerankScore?.toFixed(3) ?? hit.score.toFixed(3)}
                                </span>
                                <span className="text-slate-600">|</span>
                                <span className="text-slate-400">{hit.injectedTokens} Tokens</span>
                              </div>
                            </div>

                            {/* 孤岛代词风险徽标 */}
                            {hasOrphanRisk && (
                              <div className={`p-2.5 rounded-lg mb-3 text-xs flex items-center justify-between ${
                                isResolved
                                  ? "bg-emerald-950/30 border border-emerald-500/30 text-emerald-300"
                                  : "bg-amber-950/30 border border-amber-500/30 text-amber-300"
                              }`}>
                                <div className="flex items-center gap-2">
                                  {isResolved ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                  ) : (
                                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                                  )}
                                  <span>
                                    {isResolved
                                      ? `代词孤岛已破局：先行词与因果条件已由【${outcome.strategy}】全息注标补全！`
                                      : `孤岛代词警告：切片以「${hit.chunk.orphanRisk.anaphoraTerm}」起头，脱离文档失去主语！`}
                                  </span>
                                </div>

                                {isKeyAvailable && idx === 0 && (
                                  <button
                                    onClick={() =>
                                      generateSituationalContextForTopHit(hit.chunk.id, hit.chunk.docId)
                                    }
                                    disabled={generatingChunkId === hit.chunk.id}
                                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700 transition shrink-0"
                                  >
                                    {generatingChunkId === hit.chunk.id ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                                    )}
                                    实时 LLM 注标
                                  </button>
                                )}
                              </div>
                            )}

                            {/* 在线实时生成的 LLM 注标展示 */}
                            {liveGeneratedContext && idx === 0 && (
                              <div className="p-3 rounded-lg mb-3 bg-indigo-950/30 border border-indigo-500/30 text-xs">
                                <div className="text-[11px] font-semibold text-indigo-400 mb-1 flex items-center gap-1.5">
                                  <Sparkles className="w-3.5 h-3.5" /> 在线大模型（{model}）实时生成的情境注标：
                                </div>
                                <div className="text-slate-200 leading-relaxed font-sans">
                                  {liveGeneratedContext}
                                </div>
                              </div>
                            )}

                            {/* 注入内容视图（情境前缀高亮显示） */}
                            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 font-mono text-xs text-slate-300 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap">
                              {hit.injectedContent}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="p-12 rounded-xl bg-slate-900/30 border border-slate-800/60 flex flex-col items-center justify-center text-center">
                    <FolderTree className="w-12 h-12 text-slate-600 mb-3" />
                    <h3 className="text-sm font-medium text-slate-300">尚未执行检索</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm">
                      在左侧选择语境策略并点击“执行语境检索”，直观查看带有情境注标的全息切片如何精准召回。
                    </p>
                  </div>
                )}

                {/* 四路对决展开面板 */}
                {pipeline && (
                  <div className="p-5 rounded-xl bg-slate-900 border border-indigo-500/30 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <Play className="w-4 h-4 text-indigo-400" />
                        <h3 className="text-sm font-bold text-white">四路端到端问答对决 (Live Pipeline Showdown)</h3>
                      </div>
                      <span className="text-xs text-slate-400">
                        {pipeline.ranWithLLM ? "真实 LLM 推理完成" : "确定性沙盘模拟"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Path A: Raw */}
                      <div className="p-3.5 rounded-lg bg-slate-950 border border-rose-500/30 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-rose-400">A. 孤立切片 (无语境)</span>
                          <span className="text-slate-500">{pipeline.paths.raw.tokens} tok</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/50 p-2.5 rounded border border-slate-800">
                          {pipeline.paths.raw.answer}
                        </p>
                      </div>

                      {/* Path B: Breadcrumbs */}
                      <div className="p-3.5 rounded-lg bg-slate-950 border border-blue-500/30 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-blue-400">B. 结构面包屑增强</span>
                          <span className="text-slate-500">{pipeline.paths.breadcrumbs.tokens} tok</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/50 p-2.5 rounded border border-slate-800">
                          {pipeline.paths.breadcrumbs.answer}
                        </p>
                      </div>

                      {/* Path C: Situational */}
                      <div className="p-3.5 rounded-lg bg-slate-950 border border-emerald-500/40 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-emerald-400">C. Anthropic 情境注标</span>
                          <span className="text-emerald-400 font-mono">{pipeline.paths.situational.tokens} tok</span>
                        </div>
                        <p className="text-xs text-slate-200 leading-relaxed bg-slate-900/50 p-2.5 rounded border border-slate-800">
                          {pipeline.paths.situational.answer}
                        </p>
                      </div>

                      {/* Path D: Contextual + Small-to-Big */}
                      <div className="p-3.5 rounded-lg bg-slate-950 border border-indigo-500/40 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-indigo-400">D. Contextual + Small-to-Big (终极)</span>
                          <span className="text-indigo-400 font-mono">{pipeline.paths.hybrid.tokens} tok</span>
                        </div>
                        <p className="text-xs text-slate-200 leading-relaxed bg-slate-900/50 p-2.5 rounded border border-slate-800">
                          {pipeline.paths.hybrid.answer}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 2: 基准全景对决 (Benchmark Showdown) */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === "showdown" && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white">7 大语境增强配置全景大比武</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  横向评测 无语境切片、结构面包屑、邻接扩展、Anthropic Contextual 及两级协同架构在 6 大基准用例上的表现。
                </p>
              </div>
              <button
                onClick={runMatrix}
                disabled={isRunningMatrix}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium transition shadow-lg shadow-emerald-900/20"
              >
                {isRunningMatrix ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                一键运行全景基准矩阵
              </button>
            </div>

            {matrix ? (
              <div className="space-y-6">
                {/* 矩阵大表 */}
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/80">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-semibold">
                        <th className="p-3">策略与配置标签</th>
                        <th className="p-3">增强机制</th>
                        <th className="p-3 text-center">定位率%</th>
                        <th className="p-3 text-center">单元自足率%</th>
                        <th className="p-3 text-center">注入完整率%</th>
                        <th className="p-3 text-center">代词修复率%</th>
                        <th className="p-3 text-center">高信噪比完整%</th>
                        <th className="p-3 text-right">平均 Token</th>
                        <th className="p-3 text-right">平均信噪比</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {matrix.rows.map((r, idx) => {
                        const isWinner = r.config.strategy === "situational-small-to-big";
                        const isContextual = r.config.strategy === "situational";
                        return (
                          <tr
                            key={idx}
                            className={`hover:bg-slate-800/40 transition ${
                              isWinner
                                ? "bg-emerald-950/20 text-emerald-300 font-medium"
                                : isContextual
                                ? "bg-teal-950/10 text-slate-200"
                                : "text-slate-300"
                            }`}
                          >
                            <td className="p-3 font-sans font-medium flex items-center gap-2">
                              {isWinner && <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />}
                              {r.config.label}
                            </td>
                            <td className="p-3 font-sans text-slate-400">{r.config.strategy}</td>
                            <td className="p-3 text-center">{r.summary.locateRate}%</td>
                            <td className={`p-3 text-center ${
                              r.summary.unitCompletenessRate === 100 ? "text-emerald-400 font-bold" : "text-amber-400"
                            }`}>
                              {r.summary.unitCompletenessRate}%
                            </td>
                            <td className="p-3 text-center text-emerald-400">{r.summary.injectedCompletenessRate}%</td>
                            <td className={`p-3 text-center font-bold ${
                              r.summary.anaphoraResolutionRate === 100 ? "text-emerald-400" : "text-rose-400"
                            }`}>
                              {r.summary.anaphoraResolutionRate}%
                            </td>
                            <td className="p-3 text-center font-bold text-emerald-300">
                              {r.summary.highDensityCompletenessRate}%
                            </td>
                            <td className="p-3 text-right">{r.summary.avgInjectedTokens}</td>
                            <td className="p-3 text-right text-teal-400">
                              {(r.summary.avgSignalDensity * 100).toFixed(2)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 关键突破点剖析 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold mb-2">
                      <CheckCircle2 className="w-4 h-4" /> ck-05 孤岛代词攻破
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      在 Conf 06（Anthropic Contextual）与 Conf 07 中，单元自足率从 C9 的 83.3% 彻底跃升至 <strong>100%</strong>。先行词“跨可用区切换失败”被注标完整还原。
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="flex items-center gap-2 text-teal-400 text-xs font-semibold mb-2">
                      <Coins className="w-4 h-4" /> Contextual vs 邻接扩展
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      邻接扩展虽然拉回了先行词，但 Token 膨胀至 1,480，信噪比折半；而 Contextual 仅消耗 835 Token 便达到同等效果，信噪比高达 4.55%。
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold mb-2">
                      <Zap className="w-4 h-4" /> 终极两级协同形态
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Conf 07 结合 Contextual 小切片检索 + Small-to-Big 父窗口展开注入，既能精准命中，又能保证生成阶段超长因果的自足自洽。
                    </p>
                  </div>
                </div>

                {/* 用例下钻剖析 */}
                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    6 大基准用例在 Conf 06（Anthropic Contextual）下的详细判定
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {matrix.rows.find((r) => r.config.strategy === "situational")?.cases.map((c) => (
                      <div
                        key={c.caseId}
                        className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-slate-400 font-bold">{c.caseId}</span>
                            <span className="text-slate-200">{c.title}</span>
                          </div>
                          <div className="text-slate-500 font-mono text-[11px]">
                            注标摘要：{c.contextualPrefixSnippet ?? "无"}...
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {c.unitComplete ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">
                              自足 100%
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 font-medium">
                              未自足
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-16 rounded-xl bg-slate-900/40 border border-slate-800 flex flex-col items-center justify-center text-center">
                <Layers className="w-12 h-12 text-slate-600 mb-3" />
                <h3 className="text-sm font-medium text-slate-300">尚未运行对决矩阵</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  点击上方“一键运行全景基准矩阵”，在 11 篇语料与 6 大用例上全面验证 7 组配置的信噪比与自足率。
                </p>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 3: 架构深度推演 (Architecture & Engineering) */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === "architecture" && (
          <div className="space-y-6">
            {/* 双轨同步索引拓扑图解 */}
            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <FolderTree className="w-4 h-4 text-emerald-400" />
                Anthropic Contextual Retrieval 双轨索引架构拓扑
              </div>
              <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
                语境前缀不仅服务于生成阶段，更关键的是<strong>必须同时进入 BM25 词法倒排与 Dense Vector 向量编码</strong>。
                两阶段双轨注入彻底消除了同义脱靶与孤岛代词。
              </p>

              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto">
                <pre className="text-emerald-400 font-bold mb-2">
                  {"[ 离线索引重塑流水线 (Offline Indexing Pipeline) ]"}
                </pre>
                <div className="text-slate-300">
                  {"原始文档 D (ops-handbook.md) ──► 结构切片 C_k (256 Tok) ──► AST 面包屑 + Prompt Caching LLM\n"}
                  {"                                                                   │\n"}
                  {"                                                                   ▼\n"}
                  {"                                          全息注标切片 C̃_k = ContextualPrefix ⊕ C_k\n"}
                  {"                                                                   │\n"}
                  {"                                ┌──────────────────────────────────┴──────────────────────────────────┐\n"}
                  {"                                ▼                                                                     ▼\n"}
                  {"                     [ BM25 倒排索引构建 ]                                                 [ Dense 向量嵌入编码 ]\n"}
                  {"                     - 提取先行词“跨可用区切换失败”                                          - 编码具有宏观高可用约束的高维向量\n"}
                  {"                     - 解决关键词无交集硬缺陷                                              - 消除孤岛动作聚类漂移\n"}
                </div>
              </div>
            </div>

            {/* Prompt Caching 成本效益演算器 */}
            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Coins className="w-4 h-4 text-teal-400" />
                Prompt Caching 成本模型演算器（海量切片离线注标 ROI）
              </div>
              <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
                很多团队误以为“给每个切片调一次 LLM 会导致破产”。实则借助现代大模型的 <strong>Prompt Caching 前缀缓存机制</strong>，
                整篇文档只需评估一次，后续切片注标命中缓存读取（Cache Read），离线生成成本直降 <strong>90%</strong>！
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-blue-400" /> 经典无缓存成本
                  </div>
                  <div className="text-xl font-bold text-rose-400">100%</div>
                  <div className="text-xs text-slate-500 mt-1">
                    每片切片重复输入整篇 20K Token，成本线性爆炸
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-emerald-400" /> Prompt Caching 命中
                  </div>
                  <div className="text-xl font-bold text-emerald-400">~10%</div>
                  <div className="text-xs text-slate-500 mt-1">
                    前缀被 Cache 命中，单切片处理费用仅需 0.1 倍
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-teal-400" /> 检索失败率降幅
                  </div>
                  <div className="text-xl font-bold text-teal-400">67% 降幅</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Contextual + Rerank 使检索未命中率断崖式下跌
                  </div>
                </div>
              </div>
            </div>

            {/* 工业级落地防御铁律 */}
            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                工业级落地：三道安全与防御铁律
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> 1. 元数据语法强隔离
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    情境注标必须使用强隔离标识（如 <code className="text-emerald-400 font-mono">[情境注标: ...]</code>）包裹，防止模型在最终推理时误将注标当成正文事实造成事实污染。
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400" /> 2. 80 Token 长度熔断
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    情境注标严禁超过 80 Token。过长的前缀会反向稀释切片正文本来的特征权重，导致检索器对切片深处的关键数字或代码符号脱靶。
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> 3. 确定性面包屑兜底
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    当 LLM 生成因网络超时或限流失败时，必须无缝降级至 AST 结构层级面包屑（Breadcrumbs），绝不阻塞离线批量切片构建流水线。
                  </p>
                </div>
              </div>
            </div>

            {/* 下一课预告 */}
            <div className="p-6 rounded-xl bg-gradient-to-r from-slate-900 to-indigo-950/40 border border-indigo-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-indigo-400 mb-1">
                  第 11 课预告 · NEXT LESSON
                </div>
                <h4 className="text-base font-bold text-white">
                  一次 Retrieval 够吗？—— Agentic Retrieval（自主多轮检索与路径探索）
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                  单次检索只能解决“已知查证”。面对“Alpha 和 Beta 哪个更适合 Gamma 用户”等多跳逻辑，Agent 必须将检索转化为自主推理过程。
                </p>
              </div>
              <Link
                to="/lessons/context-c11-agentic-retrieval"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold transition shrink-0 shadow-lg shadow-amber-950/40"
              >
                进入下一课互动实验工作台
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

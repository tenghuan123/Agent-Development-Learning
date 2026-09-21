import { useState } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import {
  BenchmarkCorpusManager,
  CHUNKING_BENCHMARK_CASES,
  type ChunkStrategy,
  type ChunkSearchOutcome,
  type ChunkingEvalSummary,
  type ChunkingEvalStrategy,
  type EmbeddingSet,
} from "~/core/context-bench/corpus";
import {
  Layers,
  Activity,
  Play,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  BookOpen,
  Boxes,
  Info,
  Sparkles,
  Zap,
  ArrowRight,
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
  needlePatterns: Array<{ source: string; flags: string }>;
}

interface MatrixRowResponse {
  config: {
    label: string;
    strategy: ChunkingEvalStrategy;
    chunkSize: number;
    overlap: number;
    parentSize?: number;
  };
  summary: ChunkingEvalSummary;
  cases: Array<{
    caseId: string;
    title: string;
    trapType: string;
    solvedInThisLesson: boolean;
    located: boolean;
    targetRank: number | null;
    unitComplete: boolean;
    injectedComplete: boolean;
    retrievedTokens: number;
    signalTokens: number;
    signalDensity: number;
    effective: boolean;
  }>;
}

interface MatrixResponse {
  success: boolean;
  rows: MatrixRowResponse[];
  baseline: ChunkingEvalSummary | null;
  best: { label: string; tokenSavingsVsDocumentPct: number; densityGainVsDocument: number } | null;
  corpus: { docCount: number; totalTokens: number; longDocs: Array<{ id: string; title: string; tokens: number }> };
  caseCount: number;
  queryVectorCount: number;
}

interface PipelineResponse {
  success: boolean;
  query: string;
  config: { strategy: string; chunkSize: number; overlap: number; parentSize: number };
  paths: {
    document: { label: string; content: string; tokens: number; answer: string | null; latencyMs: number } | null;
    chunk: { label: string; content: string; tokens: number; answer: string | null; latencyMs: number };
    smallToBig: { label: string; content: string; tokens: number; answer: string | null; latencyMs: number };
  };
  ranWithLLM: boolean;
}

const SERIALIZED_CASES: SerializedCase[] = CHUNKING_BENCHMARK_CASES.map((c) => ({
  id: c.id,
  category: c.category,
  title: c.title,
  query: c.query,
  trapType: c.trapType,
  goldenKeyFact: c.goldenKeyFact,
  solvedInThisLesson: c.solvedInThisLesson,
  needlePatterns: c.needlePatterns.map((p) => ({ source: p.source, flags: p.flags.replace("g", "") })),
}));

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
  const longDocs = docs
    .filter((d) => d.tokenCount > 1500)
    .map((d) => ({ id: d.id, title: d.title, tokens: d.tokenCount }));

  const vectorSets = BenchmarkCorpusManager.listChunkEmbeddingSets().map((s: EmbeddingSet) => ({
    id: s.id,
    path: s.relativePath,
    model: s.model,
    dimensions: s.dimensions,
    vectorCount: s.vectors.size,
    config: s.chunkConfig ?? null,
  }));
  const c8DocSet = BenchmarkCorpusManager.getC8DocumentEmbeddings();
  const c4c7DocSet = BenchmarkCorpusManager.getStageEmbeddings("c4-c7", "document");

  return {
    hasServerKey,
    model,
    defaultBaseURL,
    totalCorpusTokens,
    longDocs,
    docCount: docs.length,
    cases: SERIALIZED_CASES,
    vectorSets,
    docVectorSets: [
      {
        id: c4c7DocSet.id,
        path: c4c7DocSet.relativePath,
        dimensions: c4c7DocSet.dimensions,
        vectorCount: c4c7DocSet.vectors.size,
        model: c4c7DocSet.model,
        frozen: true,
      },
      {
        id: c8DocSet.id,
        path: c8DocSet.relativePath,
        dimensions: c8DocSet.dimensions,
        vectorCount: c8DocSet.vectors.size,
        model: c8DocSet.model,
        frozen: false,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 页面组件
// ---------------------------------------------------------------------------

export default function ContextLessonC9() {
  const {
    hasServerKey,
    model,
    defaultBaseURL,
    totalCorpusTokens,
    longDocs,
    docCount,
    cases,
    vectorSets,
    docVectorSets,
  } = useLoaderData<typeof loader>();

  const [customApiKey, setCustomApiKey] = useState("");
  const [customBaseURL, setCustomBaseURL] = useState("");
  const handleSaveSettings = (settings: { apiKey: string; baseURL: string }) => {
    setCustomApiKey(settings.apiKey);
    setCustomBaseURL(settings.baseURL);
  };

  const [activeTab, setActiveTab] = useState<"studio" | "showdown" | "architecture">("studio");

  // ---- 检索工坊状态 ----
  const [queryText, setQueryText] = useState(cases[0]?.query ?? "");
  const [strategy, setStrategy] = useState<ChunkStrategy>("recursive");
  const [chunkSize, setChunkSize] = useState(256);
  const [overlap, setOverlap] = useState(32);
  const [useParentExpansion, setUseParentExpansion] = useState(true);
  const [parentSize, setParentSize] = useState(1400);

  const [outcome, setOutcome] = useState<ChunkSearchOutcome | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const [pipeline, setPipeline] = useState<PipelineResponse | null>(null);
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);

  // ---- 基准对决状态 ----
  const [matrix, setMatrix] = useState<MatrixResponse | null>(null);
  const [isRunningMatrix, setIsRunningMatrix] = useState(false);

  // 动作：执行切片检索
  const runSearch = async () => {
    if (!queryText.trim()) return;
    setIsSearching(true);
    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search_chunks",
          query: queryText,
          strategy,
          chunkSize,
          overlap,
          parentExpansion: useParentExpansion,
          parentSize,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });
      const data = await resp.json();
      if (data.success) setOutcome(data.outcome);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  // 动作：执行端到端三路对比
  const runPipeline = async () => {
    if (!queryText.trim()) return;
    setIsRunningPipeline(true);
    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_chunking_pipeline",
          query: queryText,
          strategy,
          chunkSize,
          overlap,
          parentSize,
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

  // 动作：运行 9x6 全量对决矩阵
  const runMatrix = async () => {
    setIsRunningMatrix(true);
    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_chunking_matrix",
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-blue-500/30 selection:text-blue-200">
      <Header
        hasServerKey={hasServerKey}
        model={model}
        defaultBaseURL={defaultBaseURL}
        customApiKey={customApiKey}
        customBaseURL={customBaseURL}
        onSaveSettings={handleSaveSettings}
        currentLesson={{
          id: "context-c9",
          title: "第 09 课: 检索粒度与注入粒度解耦 (Small-to-Big 架构)",
          badge: "C9",
        }}
      />

      {/* 面包屑 */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-30 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded font-mono font-bold bg-blue-950 text-blue-300 border border-blue-800/60">
              C9
            </span>
            <span className="text-zinc-400">Context Engineering 专项实战</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-200 font-medium">
              第 09 课：检索与注入为何不必相同？—— Small-to-Big 两级展开与切片检索架构
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/lessons/context-c8-chunking"
              className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
            >
              ← 上一课 (C8 切分粒度与语义边界)
            </Link>
            <span className="text-zinc-700">|</span>
            <Link
              to="/docs/lessons/context/09-chunk-retrieval-and-small-to-big.md"
              className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" />
              阅读本课深度讲义
            </Link>
          </div>
        </div>
      </div>

      {/* Hero 区域 */}
      <div className="border-b border-zinc-800/80 bg-gradient-to-b from-blue-950/20 via-zinc-900/30 to-zinc-950 px-4 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-blue-400" />
                  两级展开架构 · 检索与注入解耦
                </span>
                <span className="text-xs text-zinc-400 font-mono">
                  评测语料：{docCount} 篇 ({totalCorpusTokens.toLocaleString()} Tokens) · 长文档{" "}
                  {longDocs.length} 篇
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
                <span>检索原子与注入原子，绝不必相同</span>
                <span className="text-xs px-2.5 py-1 rounded bg-blue-950/80 text-blue-300 border border-blue-800/50 font-mono">
                  Small-to-Big
                </span>
              </h1>
              <p className="mt-1.5 text-xs md:text-sm text-zinc-400 max-w-3xl leading-relaxed">
                第 8 课我们攻克了文本切分刀法，但切碎后迎面撞上
                <strong className="text-amber-300">「单元自足率崩塌」</strong>与
                <strong className="text-rose-300">「断章取义导致伪证幻觉」</strong>。
                本课手写两级展开架构：
                <strong className="text-blue-300">
                  小切片（Child Chunk）建索引求精度，大窗口（Parent Chunk）进 Prompt 保完整
                </strong>
                。
              </p>
            </div>

            {/* Tab 切换 */}
            <div className="flex bg-zinc-900/90 p-1 rounded-lg border border-zinc-800 text-xs font-medium self-start lg:self-auto">
              {(
                [
                  { id: "studio", label: "检索工坊", icon: Search },
                  { id: "showdown", label: "基准对决", icon: Activity },
                  { id: "architecture", label: "架构与心法", icon: Boxes },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`px-3.5 py-2 rounded-md transition-all flex items-center gap-1.5 ${
                    activeTab === t.id
                      ? "bg-blue-600 text-white shadow-sm font-semibold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 向量集状态条 */}
          <div className="mt-4 p-3 rounded-lg bg-zinc-950/60 border border-zinc-800 text-[11px] flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="text-zinc-500 font-semibold flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              向量集底座
            </span>
            {docVectorSets.map((s) => (
              <span key={s.id} className="font-mono text-zinc-400 flex items-center gap-1.5">
                <span className="text-zinc-300">{s.path}</span>
                <span className="text-zinc-500">
                  {s.vectorCount} 条 / {s.dimensions} 维
                </span>
                {s.frozen && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/50">
                    只读冻结
                  </span>
                )}
              </span>
            ))}
            <span className="font-mono text-zinc-400">
              Chunk 向量集 {vectorSets.length} 套
            </span>
          </div>
        </div>
      </div>

      {/* 主体区域 */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* =================================================================== */}
        {/* TAB 1 · 检索工坊                                                    */}
        {/* =================================================================== */}
        {activeTab === "studio" && (
          <div className="space-y-6">
            {/* 检索配置与测试 */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 md:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Search className="w-4 h-4 text-blue-400" />
                    切片检索测试与 Small-to-Big 展开观测
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    观察 Child Chunk 命中后，如何向两侧吞吐上下文展开成完整的 Parent 窗口
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runSearch}
                  disabled={isSearching}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all"
                >
                  {isSearching ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  执行切片检索
                </button>
              </div>

              {/* 查询输入与基准题预填 */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300">测试查询 (Query)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={queryText}
                    onChange={(e) => setQueryText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void runSearch()}
                    placeholder="输入测试意图，或从下方点击基准测试题..."
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[11px] text-zinc-500 self-center mr-1">快速预设:</span>
                  {cases.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setQueryText(c.query)}
                      className={`text-[11px] px-2 py-1 rounded border transition-all ${
                        queryText === c.query
                          ? "bg-blue-950/60 border-blue-700/60 text-blue-300"
                          : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {c.category}: {c.title}
                    </button>
                  ))}
                </div>
              </div>

              {/* 参数控制 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-zinc-800/60 text-xs">
                <div>
                  <span className="text-zinc-400 block mb-1">切片策略</span>
                  <select
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value as ChunkStrategy)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-blue-500"
                  >
                    <option value="recursive">recursive (结构感知)</option>
                    <option value="fixed">fixed (定长滑窗)</option>
                    <option value="semantic">semantic (语义波谷)</option>
                  </select>
                </div>
                <div>
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>Child 粒度 (建索引)</span>
                    <span className="font-mono text-blue-300 font-bold">{chunkSize} tok</span>
                  </div>
                  <input
                    type="range"
                    min={128}
                    max={1024}
                    step={64}
                    value={chunkSize}
                    onChange={(e) => setChunkSize(Number(e.target.value))}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>重叠 Overlap</span>
                    <span className="font-mono text-blue-300 font-bold">{overlap} tok</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={128}
                    step={16}
                    value={overlap}
                    onChange={(e) => setOverlap(Number(e.target.value))}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>
                <div className="bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/80 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-200">Small-to-Big 展开</span>
                    <input
                      type="checkbox"
                      checked={useParentExpansion}
                      onChange={(e) => setUseParentExpansion(e.target.checked)}
                      className="accent-blue-500 cursor-pointer"
                    />
                  </div>
                  {useParentExpansion && (
                    <div className="mt-1.5 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-zinc-500">Parent 窗口</span>
                        <span className="font-mono text-blue-300 font-bold">{parentSize} tok</span>
                      </div>
                      <input
                        type="range"
                        min={600}
                        max={2400}
                        step={100}
                        value={parentSize}
                        onChange={(e) => setParentSize(Number(e.target.value))}
                        className="w-full accent-blue-500 cursor-pointer h-1"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 命中结果列表 */}
              {outcome && (
                <div className="pt-3 border-t border-zinc-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-zinc-400">
                      候选切片数: <strong className="font-mono text-zinc-200">{outcome.stage1Count}</strong> · 
                      总注入 Token: <strong className="font-mono text-blue-300">{outcome.totalInjectedTokens}</strong>
                    </span>
                    <span className="text-[11px] text-zinc-500 font-mono">{outcome.vectorNote}</span>
                  </div>

                  <div className="space-y-2.5">
                    {outcome.hits.map((h) => {
                      const isOrphan = h.chunk.orphanRisk.isOrphanHead;
                      return (
                        <div
                          key={h.chunk.id}
                          className="p-3.5 rounded-lg border border-zinc-800 bg-zinc-950/60 text-xs space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-5 h-5 rounded bg-blue-500/20 text-blue-300 font-mono text-xs flex items-center justify-center font-bold shrink-0">
                                {h.rank}
                              </span>
                              <span className="font-semibold text-zinc-100 truncate">
                                {h.chunk.docTitle} &gt; {h.chunk.sectionPath.join(" > ") || "（无章节路径）"}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                                #{h.chunk.index}
                              </span>
                              {isOrphan && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/50 shrink-0">
                                  孤岛代词
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                              <span className="text-zinc-500">Child 切片: {h.chunk.tokenCount} tok</span>
                              {h.injectedTokens !== h.chunk.tokenCount && (
                                <span className="text-blue-300 font-semibold">
                                  → Parent 展开: {h.injectedTokens} tok
                                </span>
                              )}
                              <span className="text-blue-400 font-bold ml-1">
                                得分 {((h.rerankScore ?? 0) * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>

                          {h.expandedChunkIds.length > 1 && (
                            <div className="text-[10px] text-blue-400/90 font-mono bg-blue-950/30 px-2 py-1 rounded border border-blue-900/40">
                              ⇡ Small-to-Big 展开了 {h.expandedChunkIds.length} 个切片窗口：
                              {h.expandedChunkIds.map((id) => `#${id.split("#c")[1]}`).join(", ")}
                            </div>
                          )}

                          <pre className="p-2.5 rounded bg-zinc-950 border border-zinc-800/80 text-[11px] text-zinc-300 whitespace-pre-wrap max-h-44 overflow-y-auto font-mono leading-relaxed">
                            {h.injectedContent}
                          </pre>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 三路端到端实测对比 */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 md:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    端到端三路对比：整篇文档 vs 纯切片精排 vs Small-to-Big
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    针对同一问题、同一份语料，唯一受控变量是「注入什么粒度到 LLM」
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runPipeline}
                  disabled={isRunningPipeline}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all shadow-sm"
                >
                  {isRunningPipeline ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  一键对比三路生成
                </button>
              </div>

              {pipeline ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    {[
                      { key: "document", path: pipeline.paths.document, tone: "amber", desc: "整篇塞入，信噪比极低 (<0.5%)" },
                      { key: "chunk", path: pipeline.paths.chunk, tone: "zinc", desc: "切碎注入，信噪比高但容易脱靶" },
                      { key: "smallToBig", path: pipeline.paths.smallToBig, tone: "blue", desc: "小切片命中，展开父窗口注入" },
                    ].map(({ key, path, tone, desc }) =>
                      path ? (
                        <div
                          key={key}
                          className={`p-3.5 rounded-lg border ${
                            tone === "blue"
                              ? "bg-blue-950/30 border-blue-700/60"
                              : tone === "amber"
                              ? "bg-amber-950/20 border-amber-800/50"
                              : "bg-zinc-950/60 border-zinc-800"
                          }`}
                        >
                          <div className="font-semibold text-zinc-200 mb-1">{path.label}</div>
                          <div className="text-2xl font-bold font-mono text-zinc-100">
                            {path.tokens.toLocaleString()}
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5">{desc}</div>
                        </div>
                      ) : null
                    )}
                  </div>

                  {!pipeline.ranWithLLM && (
                    <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-800/50 text-[11px] text-amber-300 flex items-start gap-2">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      未配置 API Key，未调用模型 —— 下方展示的是将要注入的真实上下文与消耗对比。
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { key: "document", path: pipeline.paths.document, mark: "A", tone: "amber" as const },
                      { key: "chunk", path: pipeline.paths.chunk, mark: "B", tone: "zinc" as const },
                      { key: "smallToBig", path: pipeline.paths.smallToBig, mark: "C", tone: "blue" as const },
                    ].map(({ key, path, mark, tone }) =>
                      path ? (
                        <div
                          key={key}
                          className={`p-4 rounded-lg border text-xs flex flex-col ${
                            tone === "blue"
                              ? "bg-blue-950/20 border-blue-700/50"
                              : tone === "amber"
                              ? "bg-zinc-950 border-amber-900/40"
                              : "bg-zinc-950 border-zinc-800"
                          }`}
                        >
                          <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
                            <span className="font-semibold text-zinc-200">
                              {mark} · {path.label}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-500">
                              {path.tokens} tok
                            </span>
                          </div>
                          <div className="text-zinc-300 leading-relaxed whitespace-pre-wrap flex-1 max-h-80 overflow-y-auto font-mono text-[11px]">
                            {path.answer || "(未执行模型生成)"}
                          </div>
                        </div>
                      ) : null
                    )}
                  </div>
                </>
              ) : (
                <div className="p-6 rounded-lg bg-zinc-950/40 border border-zinc-800/80 text-center text-xs text-zinc-500">
                  点击「一键对比三路生成」，直观比对同一问题在不同注入粒度下的上下文体积与生成差异。
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2 · 基准对决                                                    */}
        {/* =================================================================== */}
        {activeTab === "showdown" && (
          <div className="space-y-6">
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 md:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-400" />
                    9 种切分与检索配置 × 6 条基准用例全景对决
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    涵盖退化文档基线、定长过碎/过大、结构感知与 Small-to-Big 两级展开
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runMatrix}
                  disabled={isRunningMatrix}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-all shadow-sm"
                >
                  {isRunningMatrix ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  一键全量评测
                </button>
              </div>

              {matrix ? (
                <>
                  {matrix.best && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800">
                        <div className="text-zinc-500 mb-0.5">测试语料规模</div>
                        <div className="text-lg font-bold font-mono text-zinc-200">
                          {matrix.corpus.docCount} 篇
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {matrix.corpus.totalTokens.toLocaleString()} tok
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/40">
                        <div className="text-emerald-400 mb-0.5 font-medium">注入 Token 节省</div>
                        <div className="text-lg font-bold font-mono text-emerald-300">
                          {matrix.best.tokenSavingsVsDocumentPct}%
                        </div>
                        <div className="text-[10px] text-emerald-400/80">相比文档级盲目灌入</div>
                      </div>
                      <div className="p-3 rounded-lg bg-blue-950/30 border border-blue-700/60">
                        <div className="text-blue-300 mb-0.5 font-bold">信噪比增益</div>
                        <div className="text-lg font-bold font-mono text-blue-200">
                          {matrix.best.densityGainVsDocument}x
                        </div>
                        <div className="text-[10px] text-blue-400/80">最佳配置 / 文档级基线</div>
                      </div>
                      <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800">
                        <div className="text-zinc-500 mb-0.5">黄金配置</div>
                        <div className="text-sm font-bold text-zinc-100">{matrix.best.label}</div>
                        <div className="text-[10px] text-emerald-400 font-mono">
                          高信噪比完整率 100%
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 汇总大表 */}
                  <div className="overflow-x-auto rounded-lg border border-zinc-800">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-zinc-950 text-zinc-400 border-b border-zinc-800">
                          <th className="p-2.5 font-semibold">策略与配置</th>
                          <th className="p-2.5 font-semibold text-right">切片数</th>
                          <th className="p-2.5 font-semibold text-right">冗余%</th>
                          <th className="p-2.5 font-semibold text-right">净破坏</th>
                          <th className="p-2.5 font-semibold text-right">定位%</th>
                          <th className="p-2.5 font-semibold text-right">单元自足%</th>
                          <th className="p-2.5 font-semibold text-right">注入完整%</th>
                          <th className="p-2.5 font-semibold text-right">高信噪比完整%</th>
                          <th className="p-2.5 font-semibold text-right">注入 tok</th>
                          <th className="p-2.5 font-semibold text-right">信噪比%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {matrix.rows.map((r) => {
                          const s = r.summary;
                          const isBest = s.effectiveRate === 100;
                          return (
                            <tr
                              key={r.config.label}
                              className={isBest ? "bg-blue-950/20" : "bg-zinc-900/20 hover:bg-zinc-900/50"}
                            >
                              <td className="p-2.5">
                                <span className={isBest ? "text-blue-200 font-bold" : "text-zinc-200 font-medium"}>
                                  {r.config.label}
                                </span>
                                {isBest && (
                                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                    最优
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 text-right font-mono text-zinc-400">{s.chunkCount}</td>
                              <td
                                className={`p-2.5 text-right font-mono ${
                                  s.indexRedundancyPct > 20 ? "text-amber-400" : "text-zinc-400"
                                }`}
                              >
                                {s.indexRedundancyPct}
                              </td>
                              <td
                                className={`p-2.5 text-right font-mono ${
                                  s.structuralViolations > 0 ? "text-rose-400 font-bold" : "text-emerald-400"
                                }`}
                              >
                                {s.structuralViolations}
                              </td>
                              <td className="p-2.5 text-right font-mono text-zinc-300">{s.locateRate}</td>
                              <td className="p-2.5 text-right font-mono text-zinc-300">
                                {s.unitCompleteRate}
                              </td>
                              <td className="p-2.5 text-right font-mono text-zinc-300">
                                {s.injectedCompleteRate}
                              </td>
                              <td
                                className={`p-2.5 text-right font-mono font-bold ${
                                  s.effectiveRate === 100
                                    ? "text-blue-300"
                                    : s.effectiveRate > 0
                                    ? "text-zinc-300"
                                    : "text-rose-400"
                                }`}
                              >
                                {s.effectiveRate}
                              </td>
                              <td className="p-2.5 text-right font-mono text-zinc-400">
                                {s.avgRetrievedTokens.toLocaleString()}
                              </td>
                              <td className="p-2.5 text-right font-mono text-emerald-300 font-bold">
                                {(s.avgSignalDensity * 100).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* 逐用例表现明细 */}
                  <div className="overflow-x-auto rounded-lg border border-zinc-800">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-zinc-950 text-zinc-400 border-b border-zinc-800">
                          <th className="p-2.5 font-semibold">基准用例</th>
                          <th className="p-2.5 font-semibold">策略</th>
                          <th className="p-2.5 font-semibold text-center">定位</th>
                          <th className="p-2.5 font-semibold text-center">单元自足</th>
                          <th className="p-2.5 font-semibold text-center">注入完整</th>
                          <th className="p-2.5 font-semibold text-right">注入 tok</th>
                          <th className="p-2.5 font-semibold text-right">信噪比%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {cases.map((c) =>
                          matrix.rows.map((r, ri) => {
                            const cr = r.cases.find((x) => x.caseId === c.id);
                            if (!cr) return null;
                            return (
                              <tr
                                key={`${c.id}-${r.config.label}`}
                                className={
                                  ri === 0 ? "border-t-2 border-t-zinc-700 bg-zinc-900/20" : "bg-zinc-900/10"
                                }
                              >
                                {ri === 0 && (
                                  <td className="p-2.5 align-top" rowSpan={matrix.rows.length}>
                                    <div className="font-semibold text-zinc-200">{c.category}</div>
                                    <div className="text-[10px] text-zinc-500 mt-0.5 max-w-[14rem]">
                                      {c.query}
                                    </div>
                                    {!c.solvedInThisLesson && (
                                      <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/50">
                                        挂账给第 10 课
                                      </span>
                                    )}
                                  </td>
                                )}
                                <td className="p-2.5 text-zinc-400">{r.config.label}</td>
                                <td className="p-2.5 text-center font-mono">
                                  {cr.located ? (
                                    <span className="text-emerald-400">#{cr.targetRank}</span>
                                  ) : (
                                    <span className="text-rose-400">✗</span>
                                  )}
                                </td>
                                <td className="p-2.5 text-center">
                                  {cr.unitComplete ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" />
                                  ) : (
                                    <XCircle className="w-3.5 h-3.5 text-rose-400 inline" />
                                  )}
                                </td>
                                <td className="p-2.5 text-center">
                                  {cr.injectedComplete ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" />
                                  ) : (
                                    <XCircle className="w-3.5 h-3.5 text-rose-400 inline" />
                                  )}
                                </td>
                                <td className="p-2.5 text-right font-mono text-zinc-400">
                                  {cr.retrievedTokens.toLocaleString()}
                                </td>
                                <td className="p-2.5 text-right font-mono text-emerald-300">
                                  {(cr.signalDensity * 100).toFixed(2)}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-3 rounded-lg bg-amber-950/15 border border-amber-800/40 text-[11px] text-amber-300 leading-relaxed">
                    <strong>已知未解问题（ck-05 孤岛代词）：</strong>
                    含「这种情况下须在 15 分钟内触发全局熔断」的切片无从知道「这种情况」指代什么 ——
                    主语在上一片里。多数切分策略在该用例上定位失败，这是切片化制造出的新问题，
                    本课不解决，明确挂账给第 10 课。
                  </div>
                </>
              ) : (
                <div className="p-6 rounded-lg bg-zinc-950/40 border border-zinc-800/80 text-center text-xs text-zinc-500">
                  点击「一键全量评测」，在 11 篇语料 × 6 条基准用例上跑完 9 种切分配置。
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3 · 架构与心法                                                  */}
        {/* =================================================================== */}
        {activeTab === "architecture" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center font-bold font-mono">
                  01
                </div>
                <h3 className="text-sm font-bold text-white">原子单位不必相同</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  用小切片<strong className="text-zinc-300">建索引</strong>求精度，命中后向上展开父窗口
                  <strong className="text-zinc-300">注入</strong>求完整。
                  实测 <span className="font-mono text-blue-300">small-to-big(256→1400)</span>：
                  单元自足率仅 83.3%，而注入完整率 100%，注入量仅 751 token。
                </p>
              </div>

              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold font-mono">
                  02
                </div>
                <h3 className="text-sm font-bold text-white">切片脱靶的反噬</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  切片化把检索质量从“影响答案好坏”升级为“影响答案有无与真伪”。
                  整篇文档注入的最坏情况是啰嗦，切片脱靶的最坏情况是
                  <strong className="text-rose-300">言之凿凿地编造伪证</strong>。
                </p>
              </div>

              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold font-mono">
                  03
                </div>
                <h3 className="text-sm font-bold text-white">物理存储解耦</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  VectorStore 存 Child Chunks（轻量索引、快速相似度计算）；
                  DocStore 存 Parent Chunks（低成本磁盘/KV、快速展开）。绝不将大段正文冗余堆在向量数据库里。
                </p>
              </div>
            </div>

            {/* 架构图 */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Boxes className="w-4 h-4 text-blue-400" />
                语料变换层在检索栈中的位置
              </h3>
              <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-zinc-300 leading-relaxed overflow-x-auto">
                <pre>{`CorpusDocument[] (原始大文档)
    │  chunkDocument()            ← C8 切分引擎
    ▼
Chunk[] (切片数据结构)
    │  toChunkDocument()          ← 零侵入投影层：title = sectionPath.join(" > ")
    ▼
CorpusDocument[] (投影文档) ──► searchInDocs / searchSemanticInDocs /
                                reciprocalRankFusion / rerankDocuments   ← C3~C7 管线零改动复用
    │
    ▼
命中 Top-1 Child Chunk ──► expandToParent()    ← Small-to-Big：向上展开父窗口
    │
    ▼
Golden Context 注入 Prompt`}</pre>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Chunking 改变的不是检索算法，而是<strong className="text-zinc-300">检索的原子单位</strong>。
                这个架构解耦决定了落地成本 —— 我们完全无需推倒重写任何已有的融合与精排逻辑。
              </p>
            </div>

            {/* 下一步预告 */}
            <div className="bg-gradient-to-r from-blue-950/40 via-zinc-900 to-indigo-950/40 border border-blue-800/40 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  下一课演进预告
                </div>
                <h4 className="text-base font-bold text-white">
                  第 10 课：Chunk 自己没有意义怎么办？—— Contextual Retrieval 与元数据注入
                </h4>
                <p className="text-xs text-zinc-400 max-w-2xl">
                  当切片以“这种情况下……”开头而主语在上一章节时，切片成了孤岛。下一课我们将学习如何利用 LLM 给每个 Chunk 反哺全局文档概括与主语补全。
                </p>
              </div>
              <Link
                to="/lessons/context-c10-contextual-retrieval"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shrink-0 transition-all border border-emerald-500 shadow-md shadow-emerald-950/40"
              >
                进入第 10 课实验台
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

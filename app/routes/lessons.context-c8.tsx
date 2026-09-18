import { useState, useMemo } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import {
  BenchmarkCorpusManager,
  CHUNKING_BENCHMARK_CASES,
  type ChunkStrategy,
  type ChunkingResult,
  type ChunkSearchOutcome,
  type ChunkingEvalSummary,
  type ChunkingEvalStrategy,
  type BoundaryType,
  type EmbeddingSet,
} from "~/core/context-bench/corpus";
import {
  Layers,
  Sliders,
  Ruler,
  Activity,
  Zap,
  Play,
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  BookOpen,
  Boxes,
  Info,
  FileText,
  Sparkles,
} from "lucide-react";

// ---------------------------------------------------------------------------
// 序列化后的基准用例（RegExp 不从 loader 直接透传）
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

// ---------------------------------------------------------------------------
// 常量与外观映射
// ---------------------------------------------------------------------------

const STRATEGIES: Array<{ id: ChunkStrategy; label: string; hint: string }> = [
  { id: "document", label: "整篇文档", hint: "退化基线：文档即一个切片" },
  { id: "fixed", label: "定长滑窗", hint: "无视结构，从任意位置下刀" },
  { id: "recursive", label: "结构感知", hint: "标题 → 段落 → 句子 → 硬切兜底" },
  { id: "semantic", label: "语义边界", hint: "相邻句向量余弦跌破阈值处断开" },
];

const BOUNDARY_STYLE: Record<BoundaryType, { label: string; bar: string; text: string; desc: string }> = {
  heading: {
    label: "标题边界",
    bar: "bg-sky-500/70",
    text: "text-sky-300",
    desc: "切在 Markdown 标题处 —— 结构最完整",
  },
  paragraph: {
    label: "段落边界",
    bar: "bg-blue-500/60",
    text: "text-blue-300",
    desc: "切在空行处 —— 语义单元完整",
  },
  sentence: {
    label: "句子边界",
    bar: "bg-indigo-500/50",
    text: "text-indigo-300",
    desc: "切在句末标点处 —— 句子完整但语义单元可能被切开",
  },
  hard_cut: {
    label: "硬切",
    bar: "bg-rose-500/70",
    text: "text-rose-300",
    desc: "无可用分隔符，强制按字符数截断 —— 必然破坏结构",
  },
};

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

function matchesAll(text: string, patterns: Array<{ source: string; flags: string }>): boolean {
  return patterns.every((p) => new RegExp(p.source, p.flags).test(text));
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
  const longDocs = docs
    .filter((d) => d.tokenCount > 1500)
    .map((d) => ({ id: d.id, title: d.title, tokens: d.tokenCount }));

  // 默认聚焦主实验长文档
  const defaultDocId = longDocs[0]?.id ?? docs[0]?.id ?? "";
  const defaultStrategy: ChunkStrategy = "recursive";
  const initialChunking = BenchmarkCorpusManager.chunkOne(defaultDocId, {
    strategy: defaultStrategy,
    chunkSize: 512,
    overlap: 64,
  });

  // 向量集状态：向 UI 如实暴露维度与覆盖信息，杜绝静默降级
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
    docs: docs.map((d) => ({ id: d.id, title: d.title, tokenCount: d.tokenCount, category: d.category })),
    totalCorpusTokens,
    longDocs,
    defaultDocId,
    initialChunking,
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
// 页面
// ---------------------------------------------------------------------------

export default function ContextLessonC8() {
  const {
    hasServerKey,
    model,
    defaultBaseURL,
    docs,
    totalCorpusTokens,
    longDocs,
    defaultDocId,
    initialChunking,
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

  const [activeTab, setActiveTab] = useState<"studio" | "lab" | "showdown" | "takeaways">("studio");

  // ---- Tab 1 切分工坊 ----
  const [docId, setDocId] = useState(defaultDocId);
  const [strategy, setStrategy] = useState<ChunkStrategy>("recursive");
  const [chunkSize, setChunkSize] = useState(512);
  const [overlap, setOverlap] = useState(64);
  const [semanticThreshold, setSemanticThreshold] = useState(0.62);
  const [chunking, setChunking] = useState<ChunkingResult | null>(initialChunking);
  const [isChunking, setIsChunking] = useState(false);
  const [inspectedChunkId, setInspectedChunkId] = useState<string | null>(null);

  const [queryText, setQueryText] = useState(cases[0]?.query ?? "");
  const [outcome, setOutcome] = useState<ChunkSearchOutcome | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [useParentExpansion, setUseParentExpansion] = useState(true);
  const [parentSize, setParentSize] = useState(1400);

  const [pipeline, setPipeline] = useState<PipelineResponse | null>(null);
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);

  // ---- Tab 2 粒度实验台 ----
  const [sweepRows, setSweepRows] = useState<MatrixRowResponse[] | null>(null);
  const [isSweeping, setIsSweeping] = useState(false);
  const [sweepOverlap, setSweepOverlap] = useState(64);
  const [probeSize, setProbeSize] = useState(512);
  const [probeOverlap, setProbeOverlap] = useState(0);
  const [probeChunking, setProbeChunking] = useState<ChunkingResult | null>(initialChunking);

  // ---- Tab 3 基准对决 ----
  const [matrix, setMatrix] = useState<MatrixResponse | null>(null);
  const [isRunningMatrix, setIsRunningMatrix] = useState(false);

  const selectedDoc = docs.find((d) => d.id === docId);
  const inspectedChunk = chunking?.chunks.find((c) => c.id === inspectedChunkId) ?? null;

  // 边界解剖：当前切分下，承载 needle 的切片是否完整包含整句话
  const boundaryProbe = useMemo(() => {
    if (!probeChunking || !selectedDoc) return null;
    const primary = cases.find((c) => c.id === "ck-02-boundary-split");
    if (!primary) return null;
    const holder = probeChunking.chunks.find((c) => matchesAll(c.content, primary.needlePatterns));
    return {
      intact: Boolean(holder),
      holderIndex: holder?.index ?? null,
      holder: holder ?? null,
      chunkCount: probeChunking.chunks.length,
    };
  }, [probeChunking, selectedDoc, cases]);

  // ---- 动作 ----

  const runChunking = async (
    nextStrategy = strategy,
    nextSize = chunkSize,
    nextOverlap = overlap,
    nextThreshold = semanticThreshold,
    nextDocId = docId
  ) => {
    setIsChunking(true);
    setInspectedChunkId(null);
    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chunk_document",
          docIds: [nextDocId],
          strategy: nextStrategy,
          chunkSize: nextSize,
          overlap: nextOverlap,
          semanticThreshold: nextThreshold,
        }),
      });
      const data = await resp.json();
      if (data.success && data.results?.[0]) {
        setChunking(data.results[0]);
      }
    } catch (err) {
      console.error("Chunking failed:", err);
    } finally {
      setIsChunking(false);
    }
  };

  const refreshProbe = async (nextSize: number, nextOverlap: number) => {
    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chunk_document",
          docIds: [docId],
          strategy: "fixed",
          chunkSize: nextSize,
          overlap: nextOverlap,
        }),
      });
      const data = await resp.json();
      if (data.success && data.results?.[0]) setProbeChunking(data.results[0]);
    } catch (err) {
      console.error("Probe failed:", err);
    }
  };

  const runChunkSearch = async () => {
    if (!queryText.trim()) return;
    setIsSearching(true);
    setPipeline(null);
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
          parentSize: useParentExpansion ? parentSize : 0,
          rerankTopN: 3,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });
      const data = await resp.json();
      if (data.success) setOutcome(data.outcome);
    } catch (err) {
      console.error("Chunk search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const runPipeline = async () => {
    if (!queryText.trim()) return;
    setIsRunningPipeline(true);
    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_chunking_pipeline",
          question: queryText,
          strategy: "recursive",
          chunkSize: 256,
          overlap: 32,
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

  const runSweep = async () => {
    setIsSweeping(true);
    try {
      const matrixRows: Array<{
        label: string;
        strategy: ChunkingEvalStrategy;
        chunkSize: number;
        overlap: number;
        parentSize?: number;
      }> = [128, 256, 384, 512, 768, 1024, 1536, 2048].map((size) => ({
        label: `定长 ${size}`,
        strategy: "fixed",
        chunkSize: size,
        overlap: sweepOverlap,
      }));
      matrixRows.push({
        label: "结构感知 512",
        strategy: "recursive",
        chunkSize: 512,
        overlap: 0,
      });
      matrixRows.push({
        label: "Small-to-Big 256→1400",
        strategy: "small-to-big",
        chunkSize: 256,
        overlap: 32,
        parentSize: 1400,
      });

      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_chunking_matrix",
          matrix: matrixRows,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });
      const data = await resp.json();
      if (data.success) setSweepRows(data.rows);
    } catch (err) {
      console.error("Sweep failed:", err);
    } finally {
      setIsSweeping(false);
    }
  };

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
          id: "context-c8",
          title: "第 08 课: 为什么需要 Chunk？(切分粒度与语义边界)",
          badge: "C8",
        }}
      />

      {/* 面包屑 */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-30 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded font-mono font-bold bg-blue-950 text-blue-300 border border-blue-800/60">
              C8
            </span>
            <span className="text-zinc-400">Context Engineering 专项实战</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-200 font-medium">
              第 08 课：为什么需要 Chunk？—— 切分粒度、重叠窗口与语义边界工程
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/lessons/context-c7-reranking"
              className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
            >
              ← 上一课 (C7 两阶段精排漏斗)
            </Link>
            <span className="text-zinc-700">|</span>
            <Link
              to="/docs/lessons/context/08-chunking-granularity-and-boundaries.md"
              className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" />
              阅读本课深度讲义
            </Link>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="border-b border-zinc-800/80 bg-gradient-to-b from-blue-950/20 via-zinc-900/30 to-zinc-950 px-4 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-blue-400" />
                  检索原子单位下沉 · 语料变换层
                </span>
                <span className="text-xs text-zinc-400 font-mono">
                  语料库：{docs.length} 篇 ({totalCorpusTokens.toLocaleString()} Tokens) · 长文档{" "}
                  {longDocs.length} 篇
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
                <span>整篇文档太大，切碎了又讲不完整</span>
                <span className="text-xs px-2.5 py-1 rounded bg-blue-950/80 text-blue-300 border border-blue-800/50 font-mono">
                  Chunking
                </span>
              </h1>
              <p className="mt-1.5 text-xs md:text-sm text-zinc-400 max-w-3xl leading-relaxed">
                检索与精排一直以<strong className="text-zinc-300">「整篇文档」</strong>为原子单位。
                当文档长到 5,688 token，均值池化把 16 个章节的主题抹平，注入 LLM 的信噪比跌到{" "}
                <strong className="text-amber-300">0.46%</strong>。
                本课把原子单位下沉到 Chunk，并推导出一个反直觉结论：
                <strong className="text-blue-300">检索的粒度与注入的粒度，不必相同。</strong>
              </p>
            </div>

            <div className="flex bg-zinc-900/90 p-1 rounded-lg border border-zinc-800 text-xs font-medium self-start lg:self-auto">
              {(
                [
                  { id: "studio", label: "切分工坊", icon: Sliders },
                  { id: "lab", label: "粒度实验台", icon: Ruler },
                  { id: "showdown", label: "基准对决", icon: Activity },
                  { id: "takeaways", label: "心法与预告", icon: Zap },
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

          {/* 向量集状态条：如实暴露向量来源，杜绝静默降级 */}
          <div className="mt-4 p-3 rounded-lg bg-zinc-950/60 border border-zinc-800 text-[11px] flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="text-zinc-500 font-semibold flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              向量集状态
            </span>
            {docVectorSets.map((s) => (
              <span key={s.id} className="font-mono text-zinc-400 flex items-center gap-1.5">
                <span className="text-zinc-300">{s.path}</span>
                <span className="text-zinc-500">
                  {s.vectorCount} 条 / {s.dimensions} 维 / {s.model}
                </span>
                {s.frozen && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/50">
                    冻结·只读
                  </span>
                )}
              </span>
            ))}
            {vectorSets.length > 0 ? (
              <span className="font-mono text-zinc-400">
                chunk 向量集 {vectorSets.length} 套：
                {vectorSets
                  .map((s) => `${s.config?.strategy}-${s.config?.chunkSize}+ov${s.config?.overlap}`)
                  .join("、")}
              </span>
            ) : (
              <span className="text-amber-400">
                尚无 chunk 向量集，切片检索将整体使用本地确定性向量通道
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 主体 */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* =================================================================== */}
        {/* TAB 1 · 切分工坊                                                    */}
        {/* =================================================================== */}
        {activeTab === "studio" && (
          <div className="space-y-6">
            {/* 控制条 */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 md:p-5 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-300 mb-2 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    选择文档
                  </label>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {docs.map((d) => {
                      const isLong = d.tokenCount > 1500;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setDocId(d.id);
                            setInspectedChunkId(null);
                            setOutcome(null);
                            setPipeline(null);
                            void runChunking(strategy, chunkSize, overlap, semanticThreshold, d.id);
                            void refreshProbe(probeSize, probeOverlap);
                          }}
                          className={`w-full text-left p-2 rounded-lg border text-xs transition-all flex items-center justify-between gap-2 ${
                            docId === d.id
                              ? "bg-blue-950/40 border-blue-500/50 text-blue-200"
                              : "bg-zinc-900/40 border-zinc-800/60 text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          <span className="truncate">{d.title}</span>
                          <span
                            className={`shrink-0 font-mono text-[10px] ${
                              isLong ? "text-blue-300" : "text-zinc-600"
                            }`}
                          >
                            {d.tokenCount} tok{isLong ? " · 长文" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-zinc-300 mb-2 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-blue-400" />
                      切分策略
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {STRATEGIES.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setStrategy(s.id);
                            void runChunking(s.id, chunkSize, overlap, semanticThreshold);
                          }}
                          className={`text-left p-2 rounded-lg border text-xs transition-all ${
                            strategy === s.id
                              ? "bg-blue-950/40 border-blue-500/50 text-blue-200"
                              : "bg-zinc-900/40 border-zinc-800/60 text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          <div className="font-semibold">{s.label}</div>
                          <div className="text-[10px] text-zinc-500 mt-0.5 leading-tight">{s.hint}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-zinc-400">切片大小</span>
                        <span className="font-mono text-blue-300 font-bold">{chunkSize} tok</span>
                      </div>
                      <input
                        type="range"
                        min={128}
                        max={2048}
                        step={64}
                        value={chunkSize}
                        disabled={strategy === "document"}
                        onChange={(e) => setChunkSize(Number(e.target.value))}
                        onMouseUp={() => void runChunking(strategy, chunkSize, overlap, semanticThreshold)}
                        onTouchEnd={() => void runChunking(strategy, chunkSize, overlap, semanticThreshold)}
                        className="w-full accent-blue-500 cursor-pointer disabled:opacity-40"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-zinc-400">重叠窗口</span>
                        <span className="font-mono text-blue-300 font-bold">{overlap} tok</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={256}
                        step={16}
                        value={overlap}
                        disabled={strategy === "document"}
                        onChange={(e) => setOverlap(Number(e.target.value))}
                        onMouseUp={() => void runChunking(strategy, chunkSize, overlap, semanticThreshold)}
                        onTouchEnd={() => void runChunking(strategy, chunkSize, overlap, semanticThreshold)}
                        className="w-full accent-blue-500 cursor-pointer disabled:opacity-40"
                      />
                    </div>
                  </div>

                  {strategy === "semantic" && (
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-zinc-400">语义边界阈值（相邻句余弦）</span>
                        <span className="font-mono text-blue-300 font-bold">
                          {semanticThreshold.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.3}
                        max={0.95}
                        step={0.01}
                        value={semanticThreshold}
                        onChange={(e) => setSemanticThreshold(Number(e.target.value))}
                        onMouseUp={() =>
                          void runChunking(strategy, chunkSize, overlap, semanticThreshold)
                        }
                        className="w-full accent-blue-500 cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 切分预览统计 */}
              {isChunking && (
                <div className="pt-3 border-t border-zinc-800/60 text-[11px] text-blue-300 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  正在重新切分…
                </div>
              )}

              {chunking && (
                <div className="pt-3 border-t border-zinc-800/60 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
                  <Metric label="切片数" value={String(chunking.stats.chunkCount)} tone="neutral" />
                  <Metric label="平均大小" value={`${chunking.stats.avgTokens} tok`} tone="neutral" />
                  <Metric label="P95 大小" value={`${chunking.stats.p95Tokens} tok`} tone="neutral" />
                  <Metric
                    label="索引冗余"
                    value={`${chunking.stats.redundancyPct}%`}
                    tone={chunking.stats.redundancyPct > 50 ? "bad" : "neutral"}
                    hint="overlap / chunkSize 的近似值"
                  />
                  <Metric
                    label="几何破坏"
                    value={String(chunking.stats.boundaryDamageRaw)}
                    tone={chunking.stats.boundaryDamageRaw > 0 ? "warn" : "good"}
                    hint="切点落在句中 / 代码围栏 / 表格内"
                  />
                  <Metric
                    label="被重叠补救"
                    value={String(chunking.stats.overlapRepaired)}
                    tone="neutral"
                    hint="相邻切片已覆盖被切断的部分"
                  />
                  <Metric
                    label="净破坏"
                    value={String(chunking.stats.structuralViolations)}
                    tone={chunking.stats.structuralViolations > 0 ? "bad" : "good"}
                    hint="几何破坏 − 被重叠补救"
                  />
                </div>
              )}
            </div>

            {/* 切分色带 */}
            {chunking && (
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 md:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800">
                  <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-blue-400" />
                    切分色带 —— 每个色块是一个切片，宽度正比于 token 数
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 text-[11px]">
                    {(Object.keys(BOUNDARY_STYLE) as BoundaryType[]).map((b) => (
                      <span key={b} className="flex items-center gap-1.5 text-zinc-400">
                        <span className={`w-3 h-3 rounded-sm ${BOUNDARY_STYLE[b].bar}`} />
                        {BOUNDARY_STYLE[b].label}
                      </span>
                    ))}
                    <span className="flex items-center gap-1.5 text-zinc-400">
                      <span className="w-3 h-3 rounded-sm bg-rose-900 ring-1 ring-rose-500" />
                      结构破坏
                    </span>
                    <span className="flex items-center gap-1.5 text-zinc-400">
                      <span className="w-3 h-3 rounded-sm bg-amber-900 ring-1 ring-amber-500" />
                      孤岛切片
                    </span>
                  </div>
                </div>

                <div className="flex w-full h-14 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950">
                  {chunking.chunks.map((c) => {
                    const damaged =
                      c.structuralIntegrity.breaksCodeBlock ||
                      c.structuralIntegrity.breaksTable ||
                      c.structuralIntegrity.breaksSentence;
                    const orphan = c.orphanRisk.isOrphanHead;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        title={`#${c.index} · ${c.tokenCount} tok · ${BOUNDARY_STYLE[c.boundaryType].label}${
                          damaged ? " · 结构破坏" : ""
                        }${orphan ? " · 孤岛" : ""}`}
                        onClick={() => setInspectedChunkId(inspectedChunkId === c.id ? null : c.id)}
                        style={{ flexGrow: Math.max(1, c.tokenCount), flexBasis: 0 }}
                        className={`relative h-full transition-all hover:brightness-150 ${
                          inspectedChunkId === c.id
                            ? "ring-2 ring-white/70 ring-inset"
                            : "border-r border-zinc-950/80"
                        } ${BOUNDARY_STYLE[c.boundaryType].bar} ${
                          damaged ? "ring-1 ring-rose-500 ring-inset" : ""
                        } ${orphan ? "ring-1 ring-amber-500 ring-inset" : ""}`}
                      />
                    );
                  })}
                </div>

                {boundaryProbe && (
                  <div
                    className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                      boundaryProbe.intact
                        ? "bg-emerald-950/20 border-emerald-800/50 text-emerald-300"
                        : "bg-rose-950/20 border-rose-800/50 text-rose-300"
                    }`}
                  >
                    {boundaryProbe.intact ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <span>
                      <strong>边界解剖（定长 {probeSize} / 重叠 {probeOverlap}）：</strong>
                      {boundaryProbe.intact ? (
                        <>
                          决定性事实「…前 24 小时提交 RFC-8842 审批单」被单一切片 #
                          {boundaryProbe.holderIndex} 完整承载 ✓
                        </>
                      ) : (
                        <>决定性事实被切断了 —— 没有任何单一切片完整包含整句话 ✗</>
                      )}
                    </span>
                  </div>
                )}

                {/* 切点成因明细（仅 semantic / recursive 提供 diagnostics） */}
                {chunking.diagnostics?.semanticBoundaries && (
                  <div className="pt-2 border-t border-zinc-800/60">
                    <div className="text-[11px] text-zinc-400 mb-2">
                      <span className="font-semibold text-blue-300">语义边界诊断：</span>
                      相邻句对 {chunking.diagnostics.semanticBoundaries.length} 组，判定为主题切换{" "}
                      {chunking.diagnostics.semanticBoundaries.filter((b) => b.isBreak).length} 组，
                      平均相似度{" "}
                      {(
                        chunking.diagnostics.semanticBoundaries.reduce((a, b) => a + b.similarity, 0) /
                        chunking.diagnostics.semanticBoundaries.length
                      ).toFixed(4)}
                    </div>
                    <div className="space-y-1">
                      {[...chunking.diagnostics.semanticBoundaries]
                        .sort((a, b) => a.similarity - b.similarity)
                        .slice(0, 5)
                        .map((b, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-3 text-[11px] font-mono p-1.5 rounded bg-zinc-950/60 border border-zinc-800"
                          >
                            <span className="text-zinc-500">
                              余弦 <span className="text-blue-300">{b.similarity.toFixed(4)}</span>
                            </span>
                            <span className={b.isBreak ? "text-emerald-400" : "text-zinc-500"}>
                              {b.isBreak ? "✓ 断开" : "  连续"}
                            </span>
                            <span className="text-zinc-400 truncate flex-1 text-right">
                              "{b.snippet}"
                            </span>
                          </div>
                        ))}
                    </div>
                    <div className="mt-2 text-[10px] text-zinc-500 leading-relaxed">
                      注意：相似度最低的几处正是章节标题、代码围栏与表格分隔行 —— 算法在完全不知道
                      Markdown 语法的情况下，仅凭句向量余弦就把真实主题边界识别了出来。
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 切片检视 */}
            {inspectedChunk && (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 md:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Eye className="w-4 h-4 text-blue-400" />
                    切片 #{inspectedChunk.index} 检视
                    <span className={`text-xs font-mono ${BOUNDARY_STYLE[inspectedChunk.boundaryType].text}`}>
                      {BOUNDARY_STYLE[inspectedChunk.boundaryType].label}
                    </span>
                  </h3>
                  <span className="text-[11px] font-mono text-zinc-500">
                    {inspectedChunk.tokenCount} tok · char {inspectedChunk.charStart}~
                    {inspectedChunk.charEnd}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                    <div className="text-zinc-500 text-[10px] mb-1">章节路径 (sectionPath)</div>
                    <div className="text-zinc-300 leading-relaxed">
                      {inspectedChunk.sectionPath.length > 0
                        ? inspectedChunk.sectionPath.join(" > ")
                        : "（无标题祖先）"}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                    <div className="text-zinc-500 text-[10px] mb-1">重叠窗口</div>
                    <div className="text-zinc-300 font-mono">
                      前 {inspectedChunk.overlapPrevChars} 字符 · 后 {inspectedChunk.overlapNextChars} 字符
                    </div>
                  </div>
                  <div
                    className={`p-2.5 rounded-lg border ${
                      inspectedChunk.orphanRisk.isOrphanHead
                        ? "bg-amber-950/20 border-amber-800/50"
                        : "bg-zinc-950/60 border-zinc-800"
                    }`}
                  >
                    <div className="text-zinc-500 text-[10px] mb-1">孤岛诊断（C9 主题）</div>
                    <div
                      className={
                        inspectedChunk.orphanRisk.isOrphanHead ? "text-amber-300" : "text-zinc-400"
                      }
                    >
                      {inspectedChunk.orphanRisk.explanation}
                    </div>
                  </div>
                </div>

                {(inspectedChunk.structuralIntegrity.breaksCodeBlock ||
                  inspectedChunk.structuralIntegrity.breaksTable ||
                  inspectedChunk.structuralIntegrity.breaksSentence) && (
                  <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-800/50 text-xs text-rose-300 flex flex-wrap items-center gap-3">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="font-semibold">结构破坏：</span>
                    {inspectedChunk.structuralIntegrity.breaksCodeBlock && <span>切在代码围栏内部</span>}
                    {inspectedChunk.structuralIntegrity.breaksTable && (
                      <span>切在表格内部且未包含表头</span>
                    )}
                    {inspectedChunk.structuralIntegrity.breaksSentence && <span>切在句子中间</span>}
                  </div>
                )}

                <pre className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300 whitespace-pre-wrap max-h-72 overflow-y-auto font-mono leading-relaxed">
                  {inspectedChunk.content}
                </pre>
              </div>
            )}

            {/* 切片级检索 */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 md:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Search className="w-4 h-4 text-blue-400" />
                    切片级检索与 Small-to-Big 展开
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    复用 C6 的 Hybrid RRF 与 C7 的 Cross-Encoder 精排 —— 检索算法一行未改，只换了原子单位
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={useParentExpansion}
                      onChange={(e) => setUseParentExpansion(e.target.checked)}
                      className="rounded bg-zinc-950 border-zinc-800 text-blue-500 focus:ring-0"
                    />
                    展开父窗口
                  </label>
                  {useParentExpansion && (
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={512}
                        max={3000}
                        step={100}
                        value={parentSize}
                        onChange={(e) => setParentSize(Number(e.target.value))}
                        className="w-32 accent-blue-500 cursor-pointer"
                      />
                      <span className="text-[11px] font-mono text-blue-300 font-bold w-16">
                        {parentSize} tok
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  placeholder="输入需要在切片语料上检索的问题..."
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={runChunkSearch}
                  disabled={isSearching || !queryText.trim()}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 text-white font-medium text-xs rounded-lg flex items-center justify-center gap-1.5 transition-all"
                >
                  {isSearching ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  切片检索
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {cases.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setQueryText(c.query)}
                    className={`px-2 py-1 rounded text-[11px] border transition-all ${
                      queryText === c.query
                        ? "bg-blue-950/50 border-blue-500/50 text-blue-200"
                        : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {c.category.split(" ")[0]}
                    {!c.solvedInThisLesson && (
                      <span className="ml-1 text-amber-400" title="本课不解决，挂账给 C9">
                        ⚑
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {outcome && (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <Metric label="候选切片" value={String(outcome.stage1Count)} tone="neutral" />
                    <Metric
                      label="注入 token"
                      value={outcome.totalInjectedTokens.toLocaleString()}
                      tone="neutral"
                    />
                    <Metric
                      label="向量通道"
                      value={outcome.vectorMode === "remote" ? "真实 512 维" : "本地确定性"}
                      tone={outcome.vectorMode === "remote" ? "good" : "warn"}
                    />
                    <Metric
                      label="语义通道排除"
                      value={String(outcome.semanticSkippedIds.length)}
                      tone={outcome.semanticSkippedIds.length > 0 ? "warn" : "good"}
                    />
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono">{outcome.vectorNote}</div>

                  <div className="space-y-2">
                    {outcome.hits.map((h) => {
                      const isOrphan = h.chunk.orphanRisk.isOrphanHead;
                      return (
                        <div
                          key={h.chunk.id}
                          className="p-3 rounded-lg border border-zinc-800 bg-zinc-950/50 text-xs space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-5 h-5 rounded bg-blue-500/20 text-blue-300 font-mono text-xs flex items-center justify-center font-bold shrink-0">
                                {h.rank}
                              </span>
                              <span className="font-semibold text-zinc-100 truncate">
                                {h.chunk.docTitle} &gt; {h.chunk.sectionPath.join(" > ") || "（无章节）"}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                                #{h.chunk.index}
                              </span>
                              {isOrphan && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/50 shrink-0">
                                  孤岛
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                              <span className="text-zinc-500">
                                切片 {h.chunk.tokenCount} tok
                              </span>
                              {h.injectedTokens !== h.chunk.tokenCount && (
                                <span className="text-blue-300">
                                  → 注入 {h.injectedTokens} tok
                                </span>
                              )}
                              <span className="text-blue-300 font-bold">
                                {((h.rerankScore ?? 0) * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                          {h.expandedChunkIds.length > 1 && (
                            <div className="text-[10px] text-blue-400/90 font-mono">
                              ⇡ Small-to-Big 展开 {h.expandedChunkIds.length} 个切片：
                              {h.expandedChunkIds.map((id) => `#${id.split("#c")[1]}`).join(", ")}
                            </div>
                          )}
                          <pre className="p-2 rounded bg-zinc-950 border border-zinc-800/60 text-[11px] text-zinc-400 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">
                            {h.injectedContent.slice(0, 600)}
                            {h.injectedContent.length > 600 ? "\n…" : ""}
                          </pre>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 三路端到端对比 */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 md:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    端到端三路对比：整篇文档 vs 切片精排 vs Small-to-Big
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    同一个问题、同一份语料，唯一变量是「注入什么粒度」
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runPipeline}
                  disabled={isRunningPipeline}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all"
                >
                  {isRunningPipeline ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  一键对比
                </button>
              </div>

              {pipeline ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    {[
                      { key: "document", path: pipeline.paths.document, tone: "amber" },
                      { key: "chunk", path: pipeline.paths.chunk, tone: "zinc" },
                      { key: "smallToBig", path: pipeline.paths.smallToBig, tone: "blue" },
                    ].map(({ key, path, tone }) =>
                      path ? (
                        <div
                          key={key}
                          className={`p-3 rounded-lg border ${
                            tone === "blue"
                              ? "bg-blue-950/25 border-blue-700/50"
                              : tone === "amber"
                              ? "bg-amber-950/15 border-amber-800/40"
                              : "bg-zinc-950/60 border-zinc-800"
                          }`}
                        >
                          <div className="font-semibold text-zinc-200 mb-1">{path.label}</div>
                          <div className="text-2xl font-bold font-mono text-zinc-100">
                            {path.tokens.toLocaleString()}
                          </div>
                          <div className="text-[10px] text-zinc-500">注入 token</div>
                        </div>
                      ) : null
                    )}
                  </div>

                  {!pipeline.ranWithLLM && (
                    <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-800/50 text-[11px] text-amber-300 flex items-start gap-2">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      未配置 API Key，未调用模型 —— 下方展示的是将要注入的上下文与成本对比，不含模型生成内容。
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
                          <div className="text-zinc-300 leading-relaxed whitespace-pre-wrap flex-1 max-h-80 overflow-y-auto">
                            {path.answer}
                          </div>
                        </div>
                      ) : null
                    )}
                  </div>
                </>
              ) : (
                <div className="p-6 rounded-lg bg-zinc-950/40 border border-zinc-800/80 text-center text-xs text-zinc-500">
                  点击「一键对比」，观察同一问题在三种注入粒度下的上下文成本与回答差异。
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2 · 粒度实验台                                                  */}
        {/* =================================================================== */}
        {activeTab === "lab" && (
          <div className="space-y-6">
            {/* 粒度权衡扫描 */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 md:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Ruler className="w-4 h-4 text-blue-400" />
                    粒度权衡曲线：扫描 chunkSize，同时观测三个互相拉扯的指标
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    「单元自足率」衡量精度，「信噪比」衡量信号浓度，「索引冗余率」衡量成本
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-400">扫描的重叠窗口</span>
                    <select
                      value={sweepOverlap}
                      onChange={(e) => setSweepOverlap(Number(e.target.value))}
                      className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-blue-500"
                    >
                      <option value={0}>0</option>
                      <option value={32}>32</option>
                      <option value={64}>64</option>
                      <option value={128}>128</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={runSweep}
                    disabled={isSweeping}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                  >
                    {isSweeping ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    运行扫描
                  </button>
                </div>
              </div>

              {sweepRows ? (
                <>
                  <TradeoffChart rows={sweepRows} />
                  <div className="overflow-x-auto rounded-lg border border-zinc-800">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-zinc-950 text-zinc-400 border-b border-zinc-800">
                          <th className="p-2.5 font-semibold">配置</th>
                          <th className="p-2.5 font-semibold text-right">切片数</th>
                          <th className="p-2.5 font-semibold text-right">均 tok</th>
                          <th className="p-2.5 font-semibold text-right">单元自足%</th>
                          <th className="p-2.5 font-semibold text-right">注入完整%</th>
                          <th className="p-2.5 font-semibold text-right">信噪比%</th>
                          <th className="p-2.5 font-semibold text-right">注入 tok</th>
                          <th className="p-2.5 font-semibold text-right">净破坏</th>
                          <th className="p-2.5 font-semibold text-right">冗余%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {sweepRows.map((r) => (
                          <tr key={r.config.label} className="bg-zinc-900/20 hover:bg-zinc-900/50">
                            <td className="p-2.5 text-zinc-200 font-medium">{r.config.label}</td>
                            <td className="p-2.5 text-right font-mono text-zinc-400">
                              {r.summary.chunkCount}
                            </td>
                            <td className="p-2.5 text-right font-mono text-zinc-400">
                              {r.summary.avgChunkTokens}
                            </td>
                            <td className="p-2.5 text-right font-mono text-blue-300">
                              {r.summary.unitCompleteRate}
                            </td>
                            <td className="p-2.5 text-right font-mono text-zinc-300">
                              {r.summary.injectedCompleteRate}
                            </td>
                            <td className="p-2.5 text-right font-mono text-emerald-300 font-bold">
                              {(r.summary.avgSignalDensity * 100).toFixed(2)}
                            </td>
                            <td className="p-2.5 text-right font-mono text-zinc-400">
                              {r.summary.avgRetrievedTokens.toLocaleString()}
                            </td>
                            <td
                              className={`p-2.5 text-right font-mono ${
                                r.summary.structuralViolations > 0 ? "text-rose-400" : "text-emerald-400"
                              }`}
                            >
                              {r.summary.structuralViolations}
                            </td>
                            <td className="p-2.5 text-right font-mono text-zinc-400">
                              {r.summary.indexRedundancyPct}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-[11px] text-zinc-500 leading-relaxed">
                    读法：左侧小尺寸区域<strong className="text-zinc-400">信噪比高但单元自足率低</strong>
                    （切碎了讲不完整）；右侧大尺寸区域<strong className="text-zinc-400">自足率高但信噪比塌回</strong>
                    （切大了又稀释）。Small-to-Big 之所以值得，就是它同时拿到了两端的优点。
                  </div>
                </>
              ) : (
                <div className="p-6 rounded-lg bg-zinc-950/40 border border-zinc-800/80 text-center text-xs text-zinc-500">
                  点击「运行扫描」，在同一份语料上扫描 8 个 chunkSize，观察三个指标的拉扯关系。
                </div>
              )}
            </div>

            {/* 边界解剖 */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 md:p-5 space-y-4">
              <div className="pb-3 border-b border-zinc-800">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  边界解剖：拖动 chunkSize 与 overlap，看决定性事实何时被切断
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  判据＝是否存在<strong className="text-zinc-300">单一切片</strong>完整包含
                  「任何生产变更必须在变更窗口开启前 24 小时提交 RFC-8842 审批单」
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-zinc-400">chunkSize</span>
                    <span className="font-mono text-blue-300 font-bold">{probeSize} tok</span>
                  </div>
                  <input
                    type="range"
                    min={64}
                    max={2048}
                    step={32}
                    value={probeSize}
                    onChange={(e) => {
                      setProbeSize(Number(e.target.value));
                      void refreshProbe(Number(e.target.value), probeOverlap);
                    }}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-zinc-400">overlap</span>
                    <span className="font-mono text-blue-300 font-bold">{probeOverlap} tok</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={256}
                    step={16}
                    value={probeOverlap}
                    onChange={(e) => {
                      setProbeOverlap(Number(e.target.value));
                      void refreshProbe(probeSize, Number(e.target.value));
                    }}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>
              </div>

              {boundaryProbe && probeChunking && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div
                    className={`p-3 rounded-lg border ${
                      boundaryProbe.intact
                        ? "bg-emerald-950/20 border-emerald-800/50"
                        : "bg-rose-950/20 border-rose-800/50"
                    }`}
                  >
                    <div className="text-[10px] text-zinc-500 mb-1">句子完整性</div>
                    <div
                      className={`font-bold flex items-center gap-1.5 ${
                        boundaryProbe.intact ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {boundaryProbe.intact ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" /> 单切片完整承载
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4" /> 被切断
                        </>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-1 font-mono">
                      {boundaryProbe.intact ? `切片 #${boundaryProbe.holderIndex}` : "无切片完整承载"}
                    </div>
                  </div>
                  <Metric
                    label="切片数"
                    value={String(probeChunking.stats.chunkCount)}
                    tone="neutral"
                  />
                  <Metric
                    label="索引冗余率"
                    value={`${probeChunking.stats.redundancyPct}%`}
                    tone={probeChunking.stats.redundancyPct > 50 ? "bad" : "neutral"}
                    hint="重叠的代价"
                  />
                </div>
              )}

              <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800 text-[11px] text-zinc-400 leading-relaxed">
                <strong className="text-zinc-300">实测结论：</strong>
                在 <span className="font-mono">ops-handbook</span> 上扫描 18 个 chunkSize（64~2048）：
                定长切分在 <span className="text-rose-300 font-mono">7/18</span> 个尺寸下会切断这句话
                （64, 96, 128, 192, 256, 384, 768），而结构感知切分在{" "}
                <span className="text-emerald-300 font-mono">18/18</span> 个尺寸下全部完整。
                <br />
                这意味着：定长切分能否保住决定性事实<strong className="text-amber-300">纯属运气</strong>，
                而结构感知切分是<strong className="text-emerald-300">确定性</strong>的。
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3 · 基准对决                                                    */}
        {/* =================================================================== */}
        {activeTab === "showdown" && (
          <div className="space-y-6">
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-400" />
                    9 种切分配置 × 6 条基准用例全景对决
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    每行优先使用与其切分配置精确匹配的真实向量集；缺集的行自动退回本地向量并在「向量」列标注
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runMatrix}
                  disabled={isRunningMatrix}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5"
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
                        <div className="text-zinc-500 mb-0.5">语料规模</div>
                        <div className="text-lg font-bold font-mono text-zinc-200">
                          {matrix.corpus.docCount} 篇
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {matrix.corpus.totalTokens.toLocaleString()} tok · 长文{" "}
                          {matrix.corpus.longDocs.length} 篇
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/40">
                        <div className="text-emerald-400 mb-0.5 font-medium">注入 token 节省</div>
                        <div className="text-lg font-bold font-mono text-emerald-300">
                          {matrix.best.tokenSavingsVsDocumentPct}%
                        </div>
                        <div className="text-[10px] text-emerald-400/80">相对文档级注入</div>
                      </div>
                      <div className="p-3 rounded-lg bg-blue-950/30 border border-blue-700/60">
                        <div className="text-blue-300 mb-0.5 font-bold">信噪比增益</div>
                        <div className="text-lg font-bold font-mono text-blue-200">
                          {matrix.best.densityGainVsDocument}x
                        </div>
                        <div className="text-[10px] text-blue-400/80">最佳配置 / 文档级</div>
                      </div>
                      <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800">
                        <div className="text-zinc-500 mb-0.5">最佳配置</div>
                        <div className="text-sm font-bold text-zinc-100">{matrix.best.label}</div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          查询向量 {matrix.queryVectorCount}/{matrix.caseCount} 条
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto rounded-lg border border-zinc-800">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-zinc-950 text-zinc-400 border-b border-zinc-800">
                          <th className="p-2.5 font-semibold">策略</th>
                          <th className="p-2.5 font-semibold text-right">切片数</th>
                          <th className="p-2.5 font-semibold text-right">冗余%</th>
                          <th className="p-2.5 font-semibold text-right">净破坏</th>
                          <th className="p-2.5 font-semibold text-right">定位%</th>
                          <th className="p-2.5 font-semibold text-right">单元自足%</th>
                          <th className="p-2.5 font-semibold text-right">注入完整%</th>
                          <th className="p-2.5 font-semibold text-right">高信噪比完整%</th>
                          <th className="p-2.5 font-semibold text-right">注入 tok</th>
                          <th className="p-2.5 font-semibold text-right">信噪比%</th>
                          <th className="p-2.5 font-semibold text-center">向量</th>
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
                              <td className="p-2.5 text-center">
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                    s.vectorMode === "remote"
                                      ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/50"
                                      : "bg-zinc-800 text-zinc-400"
                                  }`}
                                >
                                  {s.vectorMode === "remote" ? "512" : "local"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800 text-[11px] text-zinc-400 leading-relaxed space-y-1.5">
                    <div>
                      <strong className="text-zinc-300">「高信噪比完整%」的定义</strong>：注入完整{" "}
                      <em>且</em> 信噪比 ≥ 2%。
                    </div>
                    <div className="text-amber-300/90">
                      诚实说明：<strong>2% 是一个工程判断，不是物理常数。</strong>
                      本基准上文档级与大切片的信噪比落在 0.46%~0.73%，而 256~512 粒度落在
                      2.39%~5.03%，2% 恰好位于两者之间的空档。换一批语料需要重新校准 ——
                      因此上表同时给出原始信噪比，可自行判断。
                    </div>
                    <div>
                      <strong className="text-zinc-300">三个指标分别度量什么：</strong>
                      「单元自足率」＝Top-1 检索单元自身能否回答（小切片会低）；
                      「注入完整率」＝展开后的注入内容能否回答（Small-to-Big 会高）；
                      「信噪比」＝最小答案句窗 token / 注入 token。
                    </div>
                  </div>

                  {/* 逐用例明细 */}
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
                                        挂账给 C9
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
                    主语在上一片里。多数切分策略在该用例上定位失败，这是<strong>切片化自己制造出的新问题</strong>，
                    本课不解决，明确挂账给第 09 课。
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
        {/* TAB 4 · 心法与预告                                                  */}
        {/* =================================================================== */}
        {activeTab === "takeaways" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center font-bold font-mono">
                  01
                </div>
                <h3 className="text-sm font-bold text-white">原子单位可以不同</h3>
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
                <h3 className="text-sm font-bold text-white">同一个矛盾会重演三次</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  「完整性与信号集中度不可兼得」——C2 在<strong className="text-zinc-300">文档之间</strong>遇到它，
                  C8 在<strong className="text-zinc-300">文档内部</strong>再次遇到它。
                  实测 <span className="font-mono">fixed-2048</span> 注入 5,239 token、信噪比 0.73%，
                  证明<strong className="text-amber-300">「切了」不等于「切对了」</strong>。
                </p>
              </div>

              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold font-mono">
                  03
                </div>
                <h3 className="text-sm font-bold text-white">切分是有代价的</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Overlap 换索引冗余（ov=128 时 25.3%，ov=256 时 94.4%）；
                  结构边界换实现复杂度；语义边界换算力。
                  实测结构感知切分在 18 个尺寸下<strong className="text-emerald-300">零句中断裂</strong>，
                  而定长切分靠运气（7/18 会切坏）。
                </p>
              </div>
            </div>

            {/* 架构图 */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Boxes className="w-4 h-4 text-blue-400" />
                本课在检索栈中的位置：一个语料变换层
              </h3>
              <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-zinc-300 leading-relaxed overflow-x-auto">
                <pre>{`CorpusDocument[]
   │  chunkDocument()            ← 本课新增：切分策略 × 粒度 × 重叠
   ▼
Chunk[]
   │  toChunkDocument()          ← 投影：title = sectionPath.join(" > ")
   ▼
CorpusDocument[]  ──► searchInDocs / searchSemanticInDocs /
                      reciprocalRankFusion / rerankDocuments   ← C3/C4/C6/C7 既有管线，零改动
   │
   ▼
命中切片 ──► expandToParent()    ← Small-to-Big：检索粒度 ≠ 注入粒度`}</pre>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Chunking 改变的不是检索算法，而是<strong className="text-zinc-300">检索的原子单位</strong>。
                这个判断决定了实现成本 —— 本课没有重写任何一行融合或精排逻辑。
              </p>
            </div>

            {/* 向量集版本管理 */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-400" />
                工程实践：向量集按阶段分目录 + 文件名编码配置
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800">
                  <div className="font-semibold text-zinc-200 mb-1">① 文件名编码配置</div>
                  <p className="text-zinc-400 leading-relaxed">
                    <span className="font-mono text-[10px]">chunk-recursive-512-ov64.json</span>
                    <br />
                    切片 id 是 <span className="font-mono text-[10px]">doc#c3</span>，不同配置下指向完全不同的文本。
                    统一文件名会诱导跨配置错配。
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800">
                  <div className="font-semibold text-zinc-200 mb-1">② 维度安全</div>
                  <p className="text-zinc-400 leading-relaxed">
                    向量集与查询向量维度不一致时<strong className="text-amber-300">整体放弃</strong>
                    远端向量，退回本地确定性向量 —— 而不是让 cosineSimilarity 在异维下算出被系统性压低的分数。
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800">
                  <div className="font-semibold text-zinc-200 mb-1">③ 冻结阶段只读</div>
                  <p className="text-zinc-400 leading-relaxed">
                    <span className="font-mono text-[10px]">c4-c7/document-embeddings.json</span>{" "}
                    是 C4~C7 的历史资产，生成脚本对它直接报错退出；已存在的 set 默认拒绝覆盖。
                  </p>
                </div>
              </div>
            </div>

            {/* C9 预告 */}
            <div className="p-6 rounded-xl bg-gradient-to-r from-blue-950/40 via-zinc-900/60 to-emerald-950/40 border border-blue-800/40 space-y-4">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded bg-blue-500/20 text-blue-300 font-mono text-xs font-bold border border-blue-500/30">
                  NEXT LESSON PREVIEW
                </span>
                <span className="text-xs text-zinc-400">第 09 课演进预告</span>
              </div>

              <h2 className="text-lg md:text-xl font-bold text-white">
                切片化制造的新问题：一个切片不知道自己讲的是什么
              </h2>

              <p className="text-xs md:text-sm text-zinc-300 leading-relaxed max-w-3xl">
                通过第 8 课，我们把检索原子单位下沉到了切片，并用 Small-to-Big 把
                「检索精度」与「注入完整性」成功解耦。但有一条用例始终没有被解决：
                <br />
                <br />
                <span className="font-mono text-[11px] bg-zinc-950/80 px-3 py-2 rounded border border-zinc-800 inline-block leading-relaxed">
                  ops-handbook §9.2：
                  <br />
                  「……当主备切换在 90 秒内未能完成时，视为跨可用区切换失败。
                  <br />
                  <strong className="text-amber-300">这种情况下</strong>
                  ，须在 15 分钟内触发全局熔断并进入只读模式。」
                </span>
                <br />
                <br />
                父窗口展开只能覆盖<strong className="text-zinc-100">相邻的文本</strong>，
                补不上<strong className="text-amber-300">语义上的主语</strong>。
                切片在解决边界问题的同时，制造了「语境丢失」这个新问题。
              </p>

              <div className="pt-2">
                <div className="text-xs font-mono text-blue-400 font-semibold flex items-center gap-2">
                  👉 第 09 课：Chunk 自己可能没有意义怎么办？—— Contextual Chunk / Metadata / 邻接扩展
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 小组件
// ---------------------------------------------------------------------------

function Metric({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "neutral" | "good" | "warn" | "bad";
  hint?: string;
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-300"
      : tone === "bad"
      ? "text-rose-400"
      : tone === "warn"
      ? "text-amber-400"
      : "text-zinc-200";
  return (
    <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
      <div className="text-zinc-500 text-[10px] mb-0.5">{label}</div>
      <div className={`text-base font-bold font-mono ${toneClass}`}>{value}</div>
      {hint && <div className="text-[10px] text-zinc-600 leading-tight mt-0.5">{hint}</div>}
    </div>
  );
}

/**
 * 粒度权衡曲线：把「单元自足率 / 信噪比 / 索引冗余率」三条线画在同一张图上，
 * 直观呈现小切片与大切片各自崩塌的方向。
 */
function TradeoffChart({ rows }: { rows: MatrixRowResponse[] }) {
  const points = rows.filter((r) => r.config.chunkSize > 0);
  if (points.length === 0) return null;

  const W = 720;
  const H = 260;
  const PAD = { l: 44, r: 44, t: 16, b: 30 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const sizes = points.map((p) => p.config.chunkSize);
  const minSize = Math.min(...sizes);
  const maxSize = Math.max(...sizes);

  const x = (size: number) =>
    PAD.l + (maxSize === minSize ? innerW / 2 : ((size - minSize) / (maxSize - minSize)) * innerW);
  const yPct = (pct: number) => PAD.t + innerH - (Math.min(100, Math.max(0, pct)) / 100) * innerH;
  const yDensity = (d: number) => PAD.t + innerH - (Math.min(6, Math.max(0, d * 100)) / 6) * innerH;

  const path = (fn: (p: MatrixRowResponse) => number) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.config.chunkSize)} ${fn(p)}`).join(" ");

  const series = [
    {
      name: "单元自足率",
      color: "#60a5fa",
      d: path((p) => yPct(p.summary.unitCompleteRate)),
      axis: "左轴 0~100%",
    },
    {
      name: "注入完整率",
      color: "#34d399",
      d: path((p) => yPct(p.summary.injectedCompleteRate)),
      axis: "左轴 0~100%",
    },
    {
      name: "索引冗余率",
      color: "#fbbf24",
      d: path((p) => yPct(p.summary.indexRedundancyPct)),
      axis: "左轴 0~100%",
    },
    {
      name: "信噪比",
      color: "#a78bfa",
      d: path((p) => yDensity(p.summary.avgSignalDensity)),
      axis: "右轴 0~6%",
    },
  ];

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[640px]" role="img">
        {/* 网格 */}
        {[0, 25, 50, 75, 100].map((p) => (
          <g key={p}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={yPct(p)}
              y2={yPct(p)}
              stroke="#27272a"
              strokeWidth={1}
            />
            <text x={PAD.l - 6} y={yPct(p) + 3} fill="#71717a" fontSize={9} textAnchor="end">
              {p}%
            </text>
          </g>
        ))}
        {/* 右轴 */}
        {[0, 2, 4, 6].map((p) => (
          <text
            key={p}
            x={W - PAD.r + 6}
            y={yDensity(p / 100) + 3}
            fill="#71717a"
            fontSize={9}
            textAnchor="start"
          >
            {p}%
          </text>
        ))}

        {/* x 轴刻度 */}
        {points.map((p) => (
          <text
            key={p.config.chunkSize}
            x={x(p.config.chunkSize)}
            y={H - 10}
            fill="#71717a"
            fontSize={9}
            textAnchor="middle"
          >
            {p.config.chunkSize}
          </text>
        ))}
        <text x={W / 2} y={H - 1} fill="#52525b" fontSize={9} textAnchor="middle">
          chunkSize (token)
        </text>

        {/* 曲线 */}
        {series.map((s) => (
          <path key={s.name} d={s.d} fill="none" stroke={s.color} strokeWidth={2} />
        ))}
        {series.map((s) =>
          points.map((p) => {
            const cy = s.name === "信噪比" ? yDensity(p.summary.avgSignalDensity) : null;
            const yy =
              cy ??
              yPct(
                s.name === "单元自足率"
                  ? p.summary.unitCompleteRate
                  : s.name === "注入完整率"
                  ? p.summary.injectedCompleteRate
                  : p.summary.indexRedundancyPct
              );
            return (
              <circle key={`${s.name}-${p.config.chunkSize}`} cx={x(p.config.chunkSize)} cy={yy} r={3} fill={s.color} />
            );
          })
        )}
      </svg>

      <div className="flex flex-wrap items-center gap-4 mt-2 px-1 text-[11px]">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 rounded" style={{ backgroundColor: s.color }} />
            <span className="text-zinc-300">{s.name}</span>
            <span className="text-zinc-600 font-mono">{s.axis}</span>
          </span>
        ))}
      </div>
      <div className="mt-1.5 px-1 text-[10px] text-zinc-500 leading-relaxed">
        读法：随 chunkSize 增大，<span className="text-blue-300">单元自足率</span>上升、
        <span className="text-amber-300">索引冗余率</span>下降，但
        <span className="text-violet-300">信噪比</span>同时塌陷 —— 这就是「切大也救不了」的图形证据。
      </div>
    </div>
  );
}

import { useState, useMemo, useRef, useEffect } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import {
  BenchmarkCorpusManager,
  CHUNKING_BENCHMARK_CASES,
  type ChunkStrategy,
  type ChunkingResult,
  type BoundaryType,
  type ChunkingEvalSummary,
  type ChunkingEvalStrategy,
} from "~/core/context-bench/corpus";
import {
  Layers,
  Sliders,
  Ruler,
  Zap,
  Play,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  BookOpen,
  FileText,
  ArrowRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// 序列化后的基准用例（仅用于边界解剖探针）
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
}

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

  // 边界解剖探针黄金文档（ck-02-boundary-split 所在文档：ops-handbook.md）
  const probeDocId = "docs/ops-handbook.md";
  const initialProbeChunking = BenchmarkCorpusManager.chunkOne(probeDocId, {
    strategy: "fixed",
    chunkSize: 512,
    overlap: 0,
  });

  return {
    hasServerKey,
    model,
    defaultBaseURL,
    docs: docs.map((d) => ({ id: d.id, title: d.title, tokenCount: d.tokenCount, category: d.category })),
    totalCorpusTokens,
    longDocs,
    defaultDocId,
    initialChunking,
    probeDocId,
    initialProbeChunking,
    cases: SERIALIZED_CASES,
  };
}

// ---------------------------------------------------------------------------
// 页面组件
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
    probeDocId,
    initialProbeChunking,
    cases,
  } = useLoaderData<typeof loader>();

  const [customApiKey, setCustomApiKey] = useState("");
  const [customBaseURL, setCustomBaseURL] = useState("");
  const handleSaveSettings = (settings: { apiKey: string; baseURL: string }) => {
    setCustomApiKey(settings.apiKey);
    setCustomBaseURL(settings.baseURL);
  };

  const [activeTab, setActiveTab] = useState<"studio" | "lab" | "takeaways">("studio");

  // ---- Tab 1: 切分工坊状态 ----
  const [docId, setDocId] = useState(defaultDocId);
  const [strategy, setStrategy] = useState<ChunkStrategy>("recursive");
  const [chunkSize, setChunkSize] = useState(512);
  const [overlap, setOverlap] = useState(64);
  const [semanticThreshold, setSemanticThreshold] = useState(0.62);
  const [chunking, setChunking] = useState<ChunkingResult | null>(initialChunking);
  const [isChunking, setIsChunking] = useState(false);
  const [inspectedChunkId, setInspectedChunkId] = useState<string | null>(null);

  // ---- Tab 2: 边界解剖台状态 ----
  const [sweepRows, setSweepRows] = useState<MatrixRowResponse[] | null>(null);
  const [isSweeping, setIsSweeping] = useState(false);
  const [sweepOverlap, setSweepOverlap] = useState(64);
  const [probeSize, setProbeSize] = useState(512);
  const [probeOverlap, setProbeOverlap] = useState(0);
  const [probeChunking, setProbeChunking] = useState<ChunkingResult | null>(initialProbeChunking);
  const [isProbing, setIsProbing] = useState(false);

  const inspectedChunk = chunking?.chunks.find((c) => c.id === inspectedChunkId) ?? null;

  // 边界解剖：检测承载 needle 的关键事实是否被单一切片完整包含
  const boundaryProbe = useMemo(() => {
    if (!probeChunking) return null;
    const primary = cases.find((c) => c.id === "ck-02-boundary-split");
    if (!primary) return null;
    const holder = probeChunking.chunks.find((c) => matchesAll(c.content, primary.needlePatterns));
    const p1 = primary.needlePatterns[0];
    const p2 = primary.needlePatterns[1];
    const re1 = p1 ? new RegExp(p1.source, p1.flags) : null;
    const re2 = p2 ? new RegExp(p2.source, p2.flags) : null;
    const chunkA = re1 ? probeChunking.chunks.find((c) => re1.test(c.content)) : null;
    const chunkB = re2 ? probeChunking.chunks.find((c) => re2.test(c.content)) : null;
    return {
      intact: Boolean(holder),
      holderIndex: holder?.index ?? null,
      holder: holder ?? null,
      chunkAIndex: chunkA?.index ?? null,
      chunkBIndex: chunkB?.index ?? null,
      chunkAExcerpt: chunkA ? chunkA.content.slice(-70).trim() : null,
      chunkBExcerpt: chunkB ? chunkB.content.slice(0, 70).trim() : null,
      chunkCount: probeChunking.chunks.length,
    };
  }, [probeChunking, cases]);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const scheduleChunking = (
    nextStrategy = strategy,
    nextChunkSize = chunkSize,
    nextOverlap = overlap,
    nextThreshold = semanticThreshold,
    targetDocId = docId
  ) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      void runChunking(nextStrategy, nextChunkSize, nextOverlap, nextThreshold, targetDocId);
    }, 120);
  };

  // 动作：执行实时切分
  const runChunking = async (
    nextStrategy = strategy,
    nextChunkSize = chunkSize,
    nextOverlap = overlap,
    nextThreshold = semanticThreshold,
    targetDocId = docId
  ) => {
    setIsChunking(true);
    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chunk_document",
          docId: targetDocId,
          strategy: nextStrategy,
          chunkSize: nextChunkSize,
          overlap: nextOverlap,
          semanticThreshold: nextThreshold,
        }),
      });
      const data = await resp.json();
      const targetChunking: ChunkingResult | null =
        data.chunking ??
        (Array.isArray(data.results)
          ? data.results.find((r: ChunkingResult) => r.docId === targetDocId) ?? data.results[0] ?? null
          : null);
      if (data.success && targetChunking) {
        setChunking(targetChunking);
        if (
          inspectedChunkId &&
          !targetChunking.chunks.some((c: { id: string }) => c.id === inspectedChunkId)
        ) {
          setInspectedChunkId(null);
        }
      }
    } catch (err) {
      console.error("Chunking failed:", err);
    } finally {
      setIsChunking(false);
    }
  };

  const probeDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (probeDebounceRef.current) {
        clearTimeout(probeDebounceRef.current);
      }
    };
  }, []);

  const scheduleProbeRefresh = (nextSize = probeSize, nextOverlap = probeOverlap) => {
    if (probeDebounceRef.current) clearTimeout(probeDebounceRef.current);
    probeDebounceRef.current = setTimeout(() => {
      void refreshProbe(nextSize, nextOverlap);
    }, 100);
  };

  // 动作：刷新探针切分（针对 ops-handbook 黄金决断事实）
  const refreshProbe = async (nextSize = probeSize, nextOverlap = probeOverlap) => {
    setIsProbing(true);
    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chunk_document",
          docId: probeDocId,
          strategy: "fixed",
          chunkSize: nextSize,
          overlap: nextOverlap,
        }),
      });
      const data = await resp.json();
      const targetChunking: ChunkingResult | null =
        data.chunking ??
        (Array.isArray(data.results)
          ? data.results.find((r: ChunkingResult) => r.docId === probeDocId) ?? data.results[0] ?? null
          : null);
      if (data.success && targetChunking) {
        setProbeChunking(targetChunking);
      }
    } catch (err) {
      console.error("Probe refresh failed:", err);
    } finally {
      setIsProbing(false);
    }
  };

  // 动作：运行粒度权衡扫描
  const runSweep = async () => {
    setIsSweeping(true);
    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_chunking_sweep",
          overlap: sweepOverlap,
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
              第 08 课：为什么需要 Chunk？—— 切分粒度、重叠窗口与语义边界几何学
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
              to="/lessons/context-c9-small-to-big"
              className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium transition-colors"
            >
              下一课 (C9 Small-to-Big 检索架构) →
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

      {/* Hero 区域 */}
      <div className="border-b border-zinc-800/80 bg-gradient-to-b from-blue-950/20 via-zinc-900/30 to-zinc-950 px-4 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-blue-400" />
                  切分粒度与边界几何学
                </span>
                <span className="text-xs text-zinc-400 font-mono">
                  语料库：{docs.length} 篇 ({totalCorpusTokens.toLocaleString()} Tokens) · 长文档{" "}
                  {longDocs.length} 篇
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
                <span>整篇文档太大，切碎了又容易断裂</span>
                <span className="text-xs px-2.5 py-1 rounded bg-blue-950/80 text-blue-300 border border-blue-800/50 font-mono">
                  Chunking
                </span>
              </h1>
              <p className="mt-1.5 text-xs md:text-sm text-zinc-400 max-w-3xl leading-relaxed">
                在巨型长文档下，双塔均值池化（Pooling Amnesia）被稀释近百倍，Cross-Encoder 更遭遇物理窗口超限。
                本课剖析定长滑窗、Markdown 结构感知与连续句向量语义波谷三大切分范式，量化 Overlap 空间换鲁棒性的工程账本。
              </p>
            </div>

            {/* Tab 导航 */}
            <div className="flex bg-zinc-900/90 p-1 rounded-lg border border-zinc-800 text-xs font-medium self-start lg:self-auto">
              {(
                [
                  { id: "studio", label: "切分工坊", icon: Sliders },
                  { id: "lab", label: "边界解剖台", icon: Ruler },
                  { id: "takeaways", label: "心法与进阶", icon: Zap },
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
        </div>
      </div>

      {/* 主体区域 */}
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
                    选择待切分文档
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
                              isLong ? "text-blue-300 font-bold" : "text-zinc-600"
                            }`}
                          >
                            {d.tokenCount} tok{isLong ? " · 巨型长文" : ""}
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
                      切分策略范式
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {STRATEGIES.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setStrategy(s.id);
                            void runChunking(s.id, chunkSize, overlap, semanticThreshold, docId);
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
                        <span className="text-zinc-400">切片大小 (chunkSize)</span>
                        <span className="font-mono text-blue-300 font-bold">{chunkSize} tok</span>
                      </div>
                      <input
                        type="range"
                        min={128}
                        max={2048}
                        step={64}
                        value={chunkSize}
                        disabled={strategy === "document"}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setChunkSize(v);
                          scheduleChunking(strategy, v, overlap, semanticThreshold, docId);
                        }}
                        onMouseUp={(e) => {
                          const v = Number(e.currentTarget.value);
                          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                          void runChunking(strategy, v, overlap, semanticThreshold, docId);
                        }}
                        onTouchEnd={(e) => {
                          const v = Number(e.currentTarget.value);
                          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                          void runChunking(strategy, v, overlap, semanticThreshold, docId);
                        }}
                        className="w-full accent-blue-500 cursor-pointer disabled:opacity-40"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-zinc-400">重叠窗口 (overlap)</span>
                        <span className="font-mono text-blue-300 font-bold">{overlap} tok</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={256}
                        step={16}
                        value={overlap}
                        disabled={strategy === "document"}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setOverlap(v);
                          scheduleChunking(strategy, chunkSize, v, semanticThreshold, docId);
                        }}
                        onMouseUp={(e) => {
                          const v = Number(e.currentTarget.value);
                          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                          void runChunking(strategy, chunkSize, v, semanticThreshold, docId);
                        }}
                        onTouchEnd={(e) => {
                          const v = Number(e.currentTarget.value);
                          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                          void runChunking(strategy, chunkSize, v, semanticThreshold, docId);
                        }}
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
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setSemanticThreshold(v);
                          scheduleChunking(strategy, chunkSize, overlap, v, docId);
                        }}
                        onMouseUp={(e) => {
                          const v = Number(e.currentTarget.value);
                          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                          void runChunking(strategy, chunkSize, overlap, v, docId);
                        }}
                        onTouchEnd={(e) => {
                          const v = Number(e.currentTarget.value);
                          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                          void runChunking(strategy, chunkSize, overlap, v, docId);
                        }}
                        className="w-full accent-blue-500 cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 切分状态与指标 */}
              {isChunking && (
                <div className="pt-3 border-t border-zinc-800/60 text-[11px] text-blue-300 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  正在执行切分与几何破坏扫描…
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
                    hint="空间换边界代价"
                  />
                  <Metric
                    label="几何破坏"
                    value={String(chunking.stats.boundaryDamageRaw)}
                    tone={chunking.stats.boundaryDamageRaw > 0 ? "warn" : "good"}
                    hint="切在句中/表格/代码块"
                  />
                  <Metric
                    label="被重叠补救"
                    value={String(chunking.stats.overlapRepaired)}
                    tone="neutral"
                    hint="重叠区完整覆盖了断裂"
                  />
                  <Metric
                    label="净破坏"
                    value={String(chunking.stats.structuralViolations)}
                    tone={chunking.stats.structuralViolations > 0 ? "bad" : "good"}
                    hint="几何破坏 − 重叠补救"
                  />
                </div>
              )}
            </div>

            {/* 切分色带可视化 */}
            {chunking && (
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 md:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800">
                  <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-blue-400" />
                    切分色带 —— 每个色块代表一个切片，宽度正比于 Token 长度（点击可检视详情）
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
                      孤岛代词
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
                            ? "ring-2 ring-white/80 ring-inset"
                            : "border-r border-zinc-950/80"
                        } ${BOUNDARY_STYLE[c.boundaryType].bar} ${
                          damaged ? "ring-1 ring-rose-500 ring-inset" : ""
                        } ${orphan ? "ring-1 ring-amber-500 ring-inset" : ""}`}
                      />
                    );
                  })}
                </div>

                {/* 语义波谷诊断 */}
                {chunking.diagnostics?.semanticBoundaries && (
                  <div className="pt-2 border-t border-zinc-800/60">
                    <div className="text-[11px] text-zinc-400 mb-2">
                      <span className="font-semibold text-blue-300">语义波谷探测诊断：</span>
                      连续计算相邻句对余弦相似度，相似度最低的 Top 5 突变点（波谷）：
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
                  </div>
                )}
              </div>
            )}

            {/* 单切片详情检视 */}
            {inspectedChunk && (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 md:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Eye className="w-4 h-4 text-blue-400" />
                    切片 #{inspectedChunk.index} 详细检视
                    <span className={`text-xs font-mono ${BOUNDARY_STYLE[inspectedChunk.boundaryType].text}`}>
                      {BOUNDARY_STYLE[inspectedChunk.boundaryType].label}
                    </span>
                  </h3>
                  <span className="text-[11px] font-mono text-zinc-500">
                    {inspectedChunk.tokenCount} tok · 字符偏移 {inspectedChunk.charStart}~{inspectedChunk.charEnd}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                    <div className="text-zinc-500 text-[10px] mb-1">章节路径 (sectionPath)</div>
                    <div className="text-zinc-300 leading-relaxed font-mono text-[11px]">
                      {inspectedChunk.sectionPath.length > 0
                        ? inspectedChunk.sectionPath.join(" > ")
                        : "（顶级正文）"}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                    <div className="text-zinc-500 text-[10px] mb-1">结构完整性</div>
                    <div className="space-y-0.5 text-zinc-300">
                      <div>断句：{inspectedChunk.structuralIntegrity.breaksSentence ? "❌ 斩断半句" : "✓ 完整"}</div>
                      <div>表格：{inspectedChunk.structuralIntegrity.breaksTable ? "❌ 表头丢失" : "✓ 正常"}</div>
                      <div>代码围栏：{inspectedChunk.structuralIntegrity.breaksCodeBlock ? "❌ 未闭合" : "✓ 正常"}</div>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                    <div className="text-zinc-500 text-[10px] mb-1">孤岛代词风险</div>
                    <div className="text-zinc-300">
                      {inspectedChunk.orphanRisk.isOrphanHead ? (
                        <span className="text-amber-400">
                          ⚠️ 存在风险（词项: {inspectedChunk.orphanRisk.anaphoraTerm}）
                        </span>
                      ) : (
                        <span className="text-emerald-400">✓ 首句主语清晰</span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-1">
                      {inspectedChunk.orphanRisk.explanation}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-zinc-400 text-xs font-semibold">切片纯文本内容：</div>
                  <pre className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 whitespace-pre-wrap max-h-60 overflow-y-auto font-mono leading-relaxed">
                    {inspectedChunk.content}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2 · 边界解剖台                                                  */}
        {/* =================================================================== */}
        {activeTab === "lab" && (
          <div className="space-y-6">
            {/* 边界解剖探针 */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 md:p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    边界解剖探针：拖动 chunkSize 与 overlap，检测决定性事实何时被斩断
                    {isProbing && <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    黄金判据：是否存在<strong className="text-zinc-300">单一切片</strong>完整包含
                    「任何生产变更必须在变更窗口开启前 24 小时提交 RFC-8842 审批单」（载体：ops-handbook.md）
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] text-zinc-500 mr-1">快选场景：</span>
                  <button
                    type="button"
                    onClick={() => {
                      setProbeSize(260);
                      setProbeOverlap(0);
                      if (probeDebounceRef.current) clearTimeout(probeDebounceRef.current);
                      void refreshProbe(260, 0);
                    }}
                    className="px-2 py-1 rounded bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/60 text-[11px] text-rose-300 transition-colors"
                  >
                    事故复现 (260 tok / 0 ov)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProbeSize(260);
                      setProbeOverlap(32);
                      if (probeDebounceRef.current) clearTimeout(probeDebounceRef.current);
                      void refreshProbe(260, 32);
                    }}
                    className="px-2 py-1 rounded bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-800/60 text-[11px] text-emerald-300 transition-colors"
                  >
                    Overlap 治愈 (260 tok / 32 ov)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProbeSize(512);
                      setProbeOverlap(0);
                      if (probeDebounceRef.current) clearTimeout(probeDebounceRef.current);
                      void refreshProbe(512, 0);
                    }}
                    className="px-2 py-1 rounded bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/60 text-[11px] text-zinc-300 transition-colors"
                  >
                    标准切片 (512 tok)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-zinc-400">探针切片大小 (chunkSize)</span>
                    <span className="font-mono text-blue-300 font-bold">{probeSize} tok</span>
                  </div>
                  <input
                    type="range"
                    min={128}
                    max={1024}
                    step={4}
                    value={probeSize}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setProbeSize(v);
                      scheduleProbeRefresh(v, probeOverlap);
                    }}
                    onMouseUp={(e) => {
                      const v = Number(e.currentTarget.value);
                      if (probeDebounceRef.current) clearTimeout(probeDebounceRef.current);
                      void refreshProbe(v, probeOverlap);
                    }}
                    onTouchEnd={(e) => {
                      const v = Number(e.currentTarget.value);
                      if (probeDebounceRef.current) clearTimeout(probeDebounceRef.current);
                      void refreshProbe(v, probeOverlap);
                    }}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-zinc-400">探针重叠窗口 (overlap)</span>
                    <span className="font-mono text-blue-300 font-bold">{probeOverlap} tok</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={128}
                    step={4}
                    value={probeOverlap}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setProbeOverlap(v);
                      scheduleProbeRefresh(probeSize, v);
                    }}
                    onMouseUp={(e) => {
                      const v = Number(e.currentTarget.value);
                      if (probeDebounceRef.current) clearTimeout(probeDebounceRef.current);
                      void refreshProbe(probeSize, v);
                    }}
                    onTouchEnd={(e) => {
                      const v = Number(e.currentTarget.value);
                      if (probeDebounceRef.current) clearTimeout(probeDebounceRef.current);
                      void refreshProbe(probeSize, v);
                    }}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>
              </div>

              {boundaryProbe && (
                <div
                  className={`p-3.5 rounded-lg border text-xs flex flex-col gap-2 ${
                    boundaryProbe.intact
                      ? "bg-emerald-950/20 border-emerald-800/50 text-emerald-300"
                      : "bg-rose-950/20 border-rose-800/50 text-rose-300"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {boundaryProbe.intact ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-semibold mb-0.5">
                        {boundaryProbe.intact ? "边界保全成功 ✓" : "边界腰斩事故 ✗"}
                      </div>
                      <div>
                        {boundaryProbe.intact ? (
                          <>
                            决定性事实「…前 24 小时提交 RFC-8842 审批单」被切片 #{boundaryProbe.holderIndex} 完整覆盖！检索系统可独立以此切片作答。
                          </>
                        ) : (
                          <>
                            「24 小时」与「RFC-8842」被硬性切在两个不同的切片中，没有任何一个单一片段可以独立作答！
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {!boundaryProbe.intact && (
                    <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono">
                      <div className="p-2.5 rounded bg-zinc-950/80 border border-rose-900/50 text-zinc-300">
                        <div className="text-rose-400 font-semibold mb-1 flex items-center justify-between">
                          <span>切片 #{boundaryProbe.chunkAIndex ?? "?"} 截断处</span>
                          <span className="text-[10px] text-zinc-500">末尾事实残片</span>
                        </div>
                        <div className="text-zinc-400 leading-relaxed break-all">
                          ...{boundaryProbe.chunkAExcerpt ?? "未找到前半部分"}
                        </div>
                      </div>
                      <div className="p-2.5 rounded bg-zinc-950/80 border border-rose-900/50 text-zinc-300">
                        <div className="text-rose-400 font-semibold mb-1 flex items-center justify-between">
                          <span>切片 #{boundaryProbe.chunkBIndex ?? "?"} 起始处</span>
                          <span className="text-[10px] text-zinc-500">开头事实残片</span>
                        </div>
                        <div className="text-zinc-400 leading-relaxed break-all">
                          {boundaryProbe.chunkBExcerpt ?? "未找到后半部分"}...
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 粒度权衡扫描 */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 md:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Ruler className="w-4 h-4 text-blue-400" />
                    粒度权衡曲线：扫描 8 组 chunkSize，观测三个互相拉扯的物理指标
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    「单元自足率」衡量精度，「信噪比」衡量有效浓度，「索引冗余率」衡量存储代价
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-400">固定扫描重叠量</span>
                    <select
                      value={sweepOverlap}
                      onChange={(e) => setSweepOverlap(Number(e.target.value))}
                      className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-blue-500"
                    >
                      <option value={0}>0 (无重叠)</option>
                      <option value={32}>32 tok</option>
                      <option value={64}>64 tok</option>
                      <option value={128}>128 tok</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={runSweep}
                    disabled={isSweeping}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all"
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
                          <th className="p-2.5 font-semibold">配置参数</th>
                          <th className="p-2.5 font-semibold text-right">切片数</th>
                          <th className="p-2.5 font-semibold text-right">均 tok</th>
                          <th className="p-2.5 font-semibold text-right">单元自足%</th>
                          <th className="p-2.5 font-semibold text-right">信噪比%</th>
                          <th className="p-2.5 font-semibold text-right">净破坏</th>
                          <th className="p-2.5 font-semibold text-right">冗余率%</th>
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
                            <td className="p-2.5 text-right font-mono text-emerald-300 font-bold">
                              {(r.summary.avgSignalDensity * 100).toFixed(2)}
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
                </>
              ) : (
                <div className="p-6 rounded-lg bg-zinc-950/40 border border-zinc-800/80 text-center text-xs text-zinc-500">
                  点击「运行扫描」，在同一份长文档上扫描 8 个不同 chunkSize，观察指标对抗曲线。
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3 · 心法与进阶                                                  */}
        {/* =================================================================== */}
        {activeTab === "takeaways" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center font-bold font-mono">
                  01
                </div>
                <h3 className="text-sm font-bold text-white">长文档物理撞墙</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  5,688 Token 的全篇特征被压入 512 维向量，仅占 60 Token 的核心事实被稀释近百倍；
                  Cross-Encoder 注意力窗口物理超限，整篇文档作为检索原子宣告破产。
                </p>
              </div>

              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold font-mono">
                  02
                </div>
                <h3 className="text-sm font-bold text-white">切大切小都是病</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  切大没用：<span className="font-mono">fixed-2048</span> 注入 5,239 Token，信噪比仍低于 0.8%；
                  切碎崩溃：<span className="font-mono">fixed-256</span> 虽信噪比高达 4.8%，但一半事实被直接腰斩。
                </p>
              </div>

              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold font-mono">
                  03
                </div>
                <h3 className="text-sm font-bold text-white">空间换边界鲁棒性</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  重叠窗口（Overlap）以额外索引体积为代价（ov=128 时冗余 25.3%），将净破坏彻底清零；
                  而结构感知（Recursive）则借助自然排版在更低冗余下实现零断裂。
                </p>
              </div>
            </div>

            {/* 决策树 */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-400" />
                工业界切分算法选型决策树
              </h3>
              <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-zinc-300 leading-relaxed overflow-x-auto">
                <pre>{`文档输入
  │
  ├── 包含源代码（Python, TS, Go, Rust）？
  │     └── 是 ──► 使用 Tree-sitter AST 解析器（按 Class / Function 节点切分）
  │
  ├── 具备强 Markdown / HTML 排版结构？
  │     └── 是 ──► 递归结构感知切分（Recursive Splitter, 512 Token, Overlap 10%~15%）
  │
  ├── 纯文本流水账、客服工单、会议转写？
  │     └── 是 ──► 语义波谷切分（Semantic Valley Splitter, 动态余弦阈值 0.62）
  │
  └── 密集二维表格（财务报表、参数清单）？
        └── 是 ──► 表格独立封箱提取（禁止横向截断，整表作为一个 Chunk）`}</pre>
              </div>
            </div>

            {/* 承上启下预告 */}
            <div className="bg-gradient-to-r from-blue-950/40 via-zinc-900/60 to-indigo-950/40 border border-blue-800/40 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  进入下一阶段实战
                </div>
                <h4 className="text-base font-bold text-white">
                  第 09 课：检索与注入为何不必相同？—— Small-to-Big 两级展开与切片检索架构
                </h4>
                <p className="text-xs text-zinc-400 max-w-2xl">
                  文本切好后，切片如何接入检索管线？如何解决“切碎后单元自足率崩塌”与“代词孤岛”？
                  进入第 09 课，解耦检索原子与注入原子，实测两级架构。
                </p>
              </div>
              <Link
                to="/lessons/context-c9-small-to-big"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shrink-0 transition-all shadow-sm"
              >
                前往第 09 课
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 辅助组件
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

function TradeoffChart({ rows }: { rows: MatrixRowResponse[] }) {
  const points = rows.filter((r) => r.config.chunkSize > 0);
  if (points.length === 0) return null;

  const W = 720;
  const H = 240;
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
          chunkSize (Token)
        </text>
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
                  : p.summary.indexRedundancyPct
              );
            return (
              <circle
                key={`${s.name}-${p.config.chunkSize}`}
                cx={x(p.config.chunkSize)}
                cy={yy}
                r={3}
                fill={s.color}
              />
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
    </div>
  );
}

import { useState, useEffect, useMemo } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import { BenchmarkCorpusManager, type BenchmarkQuestion } from "~/core/context-bench/corpus";
import {
  computeDenseSemanticVector,
  searchSemanticInDocs,
  type SemanticSearchResult,
} from "~/core/context-bench/semantic";
import {
  Sparkles,
  BookOpen,
  Play,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Code2,
  RefreshCw,
  FileText,
  Zap,
  Flame,
  ArrowRight,
  Compass,
  Sliders,
  Swords,
  ChevronRight,
  TrendingUp,
  Cpu,
} from "lucide-react";

export async function loader() {
  const hasServerKey = Boolean(
    process.env.LLM_API_KEY && process.env.LLM_API_KEY.trim().length > 0
  );
  const model = process.env.LLM_MODEL || "glm-4-flash";
  const defaultBaseURL =
    process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";

  const docs = BenchmarkCorpusManager.getAllDocuments();
  const questions = BenchmarkCorpusManager.getBenchmarkQuestions();
  const totalCorpusTokens = docs.reduce((acc, d) => acc + d.tokenCount, 0);

  return {
    hasServerKey,
    model,
    defaultBaseURL,
    docs,
    questions,
    totalCorpusTokens,
  };
}

export default function ContextLesson4Page() {
  const {
    hasServerKey,
    model,
    defaultBaseURL,
    docs,
    questions,
    totalCorpusTokens,
  } = useLoaderData<typeof loader>();

  const [customApiKey, setCustomApiKey] = useState("");
  const [customBaseURL, setCustomBaseURL] = useState(defaultBaseURL);

  useEffect(() => {
    const savedKey = localStorage.getItem("MINI_CLAUDE_API_KEY");
    if (savedKey) setCustomApiKey(savedKey);
    const savedURL = localStorage.getItem("MINI_CLAUDE_BASE_URL");
    if (savedURL) setCustomBaseURL(savedURL);
  }, []);

  const handleSaveSettings = ({ apiKey, baseURL }: { apiKey: string; baseURL: string }) => {
    setCustomApiKey(apiKey);
    setCustomBaseURL(baseURL);
    localStorage.setItem("MINI_CLAUDE_API_KEY", apiKey);
    localStorage.setItem("MINI_CLAUDE_BASE_URL", baseURL);
  };

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<"intuition" | "lab" | "showdown" | "pipeline">("lab");

  // State: Question & Semantic Search
  const [selectedQuestionId, setSelectedQuestionId] = useState("qa-02");
  const [questionInput, setQuestionInput] = useState("我买完东西以后后悔了、不想要了，还能申请退款吗？");
  const [topK, setTopK] = useState(4);

  // Search Results
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SemanticSearchResult[]>([]);
  const [vectorMeta, setVectorMeta] = useState<{
    vectorMode: string;
    vectorDimensions: number;
    queryVectorSlice: number[];
    latencyMs: number;
  } | null>(null);

  // Pipeline Execution State
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<{
    answer: string;
    topHit: {
      id: string;
      title: string;
      category: string;
      similarity: number;
      previewSnippet: string;
      tokenCount: number;
    } | null;
    searchLatencyMs: number;
    llmLatencyMs: number;
    totalLatencyMs: number;
    tokens: {
      promptTokens: number;
      outputTokens: number;
      totalTokens: number;
      allDocsTokens: number;
      tokenSavingsPct: number;
    };
  } | null>(null);

  // Head-to-Head Showdown State
  const [isShowdownRunning, setIsShowdownRunning] = useState(false);
  const [showdownCases, setShowdownCases] = useState<Array<{
    id: string;
    title: string;
    query: string;
    targetDocId: string;
    explanation: string;
    expectedSemanticWinner: boolean;
    lexical: {
      latencyMs: number;
      hitsCount: number;
      topMatchDoc: string | null;
      score: number;
      snippet: string;
      isTargetHit: boolean;
    };
    semantic: {
      latencyMs: number;
      hitsCount: number;
      topMatchDoc: string | null;
      similarity: number;
      snippet: string;
      isTargetHit: boolean;
    };
  }> | null>(null);

  const effectiveApiKey = customApiKey || "";
  const isKeyAvailable = hasServerKey || Boolean(effectiveApiKey.trim().length > 0);

  // Instant local preview derived via useMemo (strictly adhering to AGENTS.md rule 2)
  const localPreviewResults = useMemo(() => {
    if (!questionInput.trim()) return [];
    return searchSemanticInDocs(docs, questionInput, { topK: 5 });
  }, [docs, questionInput]);

  // Derived local query vector for visualization
  const localQueryVector = useMemo(() => {
    return computeDenseSemanticVector(questionInput);
  }, [questionInput]);

  // Select Preset Question
  const handleSelectPreset = (q: BenchmarkQuestion) => {
    setSelectedQuestionId(q.id);
    setQuestionInput(q.question);
    setSearchResults([]);
    setPipelineResult(null);
  };

  // Execute Semantic Search API call
  const handleExecuteSemanticSearch = async () => {
    if (!questionInput.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search_semantic",
          query: questionInput,
          topK,
          apiKey: effectiveApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });
      const data = await res.json();
      if (data.results) {
        // Map back to internal format
        const formatted = data.results.map((r: any) => {
          const matchingDoc = docs.find((d) => d.id === r.id) || {
            id: r.id,
            path: r.id,
            category: r.category,
            title: r.title,
            content: "",
            tokenCount: r.tokenCount,
          };
          return {
            doc: matchingDoc,
            similarity: r.similarity,
            rank: r.rank,
            vectorSlice: r.vectorSlice,
            previewSnippet: r.previewSnippet,
          };
        });
        setSearchResults(formatted);
        setVectorMeta({
          vectorMode: data.vectorMode,
          vectorDimensions: data.vectorDimensions,
          queryVectorSlice: data.queryVectorSlice,
          latencyMs: data.latencyMs,
        });
      }
    } catch (err) {
      console.error("Semantic search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  // Run Head-to-Head Showdown
  const handleRunShowdown = async () => {
    setIsShowdownRunning(true);
    try {
      const res = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_lexical_vs_semantic_contrast",
          apiKey: effectiveApiKey,
          baseURL: customBaseURL,
        }),
      });
      const data = await res.json();
      if (data.showdownCases) {
        setShowdownCases(data.showdownCases);
      }
    } catch (err) {
      console.error("Showdown failed:", err);
    } finally {
      setIsShowdownRunning(false);
    }
  };

  // Run Full Semantic RAG Pipeline
  const handleRunPipeline = async () => {
    if (!questionInput.trim()) return;
    setIsRunningPipeline(true);
    setPipelineResult(null);

    try {
      const res = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_semantic_pipeline",
          question: questionInput,
          topK: 1,
          apiKey: effectiveApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPipelineResult({
          answer: data.answer,
          topHit: data.topHit,
          searchLatencyMs: data.searchLatencyMs,
          llmLatencyMs: data.llmLatencyMs,
          totalLatencyMs: data.totalLatencyMs,
          tokens: data.tokens,
        });
      }
    } catch (err) {
      console.error("Pipeline failed:", err);
    } finally {
      setIsRunningPipeline(false);
    }
  };

  const activeDisplayResults = searchResults.length > 0 ? searchResults : localPreviewResults;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header
        hasServerKey={hasServerKey}
        model={model}
        defaultBaseURL={defaultBaseURL}
        customApiKey={customApiKey}
        customBaseURL={customBaseURL}
        onSaveSettings={handleSaveSettings}
        currentLesson={{
          id: "context-c4",
          title: "第 04 课: 字符串不同但意思一样怎么办？(Semantic Search)",
          badge: "C4",
        }}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Banner Section */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-950/60 via-slate-900 to-pink-950/50 border border-purple-800/40 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-3 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="px-3 py-1 text-xs font-semibold tracking-wider uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  CONTEXT-04 · 语义检索与向量嵌入
                </span>
                <span className="px-2.5 py-0.5 text-xs font-medium bg-pink-500/10 text-pink-300 border border-pink-500/20 rounded-full">
                  从“找字符”跃迁到“找意思”
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white flex items-center gap-3">
                字符串不同，但意思一样怎么办？
              </h1>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                攻克词法检索的物理极限：当用户口语说出<span className="text-purple-300 font-medium">“买完后悔不想要了”</span>，而官方文档写着<span className="text-pink-300 font-medium">“7天无理由退款与犹豫期”</span>时，字面字符完全不匹配。
                本课引入 <span className="text-purple-300 font-semibold underline decoration-purple-500/60 underline-offset-4">Embedding 向量映射</span> 与 <span className="text-pink-300 font-semibold underline decoration-pink-500/60 underline-offset-4">余弦相似度（Cosine Similarity）</span>，构建语义检索与 Top K 召回闭环。
              </p>
            </div>

            <div className="flex flex-col sm:flex-row md:flex-col gap-3 shrink-0">
              <Link
                to="/docs/lessons/context/04-semantic-search-and-embedding.md"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 border border-purple-500/40 text-sm font-medium transition-all shadow-lg hover:shadow-purple-900/30 group"
              >
                <BookOpen className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
                查看配套讲义 (Doc 04)
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </Link>
              <div className="text-xs text-slate-400 flex items-center gap-2 px-1">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                语料基准库：{docs.length} 篇文档 (~{totalCorpusTokens} Tokens)
              </div>
            </div>
          </div>
        </section>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 p-1.5 bg-slate-900/90 border border-slate-800 rounded-xl backdrop-blur-md overflow-x-auto">
          <button
            onClick={() => setActiveTab("lab")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === "lab"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-900/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Compass className="w-4 h-4" />
            1. 交互式语义实验室
          </button>
          <button
            onClick={() => setActiveTab("showdown")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === "showdown"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-900/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Swords className="w-4 h-4 text-pink-400" />
            2. 残酷擂台：Lexical vs Semantic
          </button>
          <button
            onClick={() => setActiveTab("pipeline")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === "pipeline"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-900/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Play className="w-4 h-4 text-emerald-400" />
            3. 端到端 Semantic RAG 闭环
          </button>
          <button
            onClick={() => setActiveTab("intuition")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === "intuition"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-900/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Code2 className="w-4 h-4" />
            4. 几何空间与数学原语
          </button>
        </div>

        {/* TAB 1: INTERACTIVE SEMANTIC LAB */}
        {activeTab === "lab" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Control Panel (5 Cols) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Preset Questions Card */}
              <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    Benchmark 测试问题预置
                  </h3>
                  <span className="text-xs text-slate-400">点击自动装载</span>
                </div>

                <div className="space-y-2">
                  {questions.map((q) => {
                    const isSelected = selectedQuestionId === q.id;
                    const isHighlight = q.id === "qa-02";
                    return (
                      <button
                        key={q.id}
                        onClick={() => handleSelectPreset(q)}
                        className={`w-full text-left p-3 rounded-xl border text-xs transition-all flex items-start gap-2.5 ${
                          isSelected
                            ? "bg-purple-950/50 border-purple-500/60 text-purple-100 shadow-md shadow-purple-900/20"
                            : "bg-slate-950/60 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40"
                        }`}
                      >
                        <span
                          className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 ${
                            isHighlight
                              ? "bg-pink-500/20 text-pink-300 font-bold border border-pink-500/30"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {q.id}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="line-clamp-2 leading-relaxed font-medium">{q.question}</p>
                          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400">
                            <span className="text-slate-400">期望文档: {q.expectedSources.join(", ")}</span>
                            {isHighlight && (
                              <span className="text-pink-400 font-semibold">⚡ C3 词汇鸿沟经典死穴</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Natural Query Input Card */}
              <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-4">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-400" />
                  当前自然语言查询 (Query)
                </h3>
                <textarea
                  rows={3}
                  value={questionInput}
                  onChange={(e) => setQuestionInput(e.target.value)}
                  placeholder="输入任意自然语言问题，系统将通过向量空间检索最语义相关的文档..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all resize-none"
                />

                <div className="flex items-center justify-between gap-4 pt-1">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Sliders className="w-3.5 h-3.5 text-slate-400" />
                    <span>Top K 召回数:</span>
                    <select
                      value={topK}
                      onChange={(e) => setTopK(Number(e.target.value))}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                    >
                      <option value={1}>Top 1 (精确单篇)</option>
                      <option value={3}>Top 3 (标准召回)</option>
                      <option value={5}>Top 5 (宽泛召回)</option>
                      <option value={8}>Top 8 (全部候选)</option>
                    </select>
                  </div>

                  <button
                    onClick={handleExecuteSemanticSearch}
                    disabled={isSearching || !questionInput.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-purple-900/30 transition-all"
                  >
                    {isSearching ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {isSearching ? "向量化计算中..." : "执行语义检索"}
                  </button>
                </div>
              </div>

              {/* Embedding Vector Feature Inspector */}
              <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-purple-400" />
                    Query 向量空间切片 (Vector Slice)
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                    {vectorMeta
                      ? `${vectorMeta.vectorMode === "remote_api" ? "⚡ 真实模型 Embedding" : "确定性稠密向量"} (${vectorMeta.vectorDimensions} 维)`
                      : "待执行检索"}
                  </span>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  自然语言被映射为高维单位向量 q (||q|| ≈ 1.0)。以下为前 8 个特征维度切片：
                </p>

                <div className="grid grid-cols-4 gap-2 pt-1 font-mono text-xs">
                  {(vectorMeta?.queryVectorSlice || localQueryVector.slice(0, 8)).map((val, idx) => {
                    const isPositive = val > 0;
                    return (
                      <div
                        key={idx}
                        className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2 text-center"
                      >
                        <span className="text-[10px] text-slate-400 block mb-0.5">d_{idx}</span>
                        <span className={isPositive ? "text-purple-300 font-semibold" : "text-slate-400"}>
                          {val.toFixed(3)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Ranking Dashboard (7 Cols) */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-purple-400" />
                      语料库余弦相似度排行榜 (Cosine Similarity Ranking)
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      基于 cos(θ) = (q · d) / (||q|| × ||d||) 计算全量候选文档相似度分值
                    </p>
                  </div>
                  {vectorMeta && (
                    <div className="text-right text-xs font-mono text-purple-300 bg-purple-950/40 border border-purple-800/30 px-2.5 py-1 rounded-lg">
                      检索耗时: {vectorMeta.latencyMs}ms
                    </div>
                  )}
                </div>

                {/* Candidate Document List */}
                <div className="space-y-3.5">
                  {activeDisplayResults.map((res, index) => {
                    const isTop1 = index === 0;
                    const pct = Math.round(res.similarity * 100);
                    const isHighMatch = res.similarity >= 0.7;
                    const isMediumMatch = res.similarity >= 0.4 && res.similarity < 0.7;

                    return (
                      <div
                        key={res.doc.id}
                        className={`p-4 rounded-xl border transition-all ${
                          isTop1
                            ? "bg-gradient-to-r from-purple-950/40 to-slate-900 border-purple-500/50 shadow-lg shadow-purple-900/20"
                            : "bg-slate-950/60 border-slate-800/80 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                                isTop1
                                  ? "bg-purple-600 text-white"
                                  : index < 3
                                  ? "bg-slate-800 text-slate-300"
                                  : "bg-slate-900 text-slate-400"
                              }`}
                            >
                              {index + 1}
                            </span>
                            <div className="min-w-0">
                              <h4 className="text-sm font-semibold text-slate-200 truncate flex items-center gap-2">
                                {res.doc.title}
                                {isTop1 && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                    ★ Top 1 命中
                                  </span>
                                )}
                              </h4>
                              <p className="text-[11px] font-mono text-slate-400 truncate">{res.doc.id}</p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="flex items-baseline gap-1 justify-end">
                              <span
                                className={`text-base font-black font-mono ${
                                  isHighMatch
                                    ? "text-emerald-400"
                                    : isMediumMatch
                                    ? "text-purple-300"
                                    : "text-slate-400"
                                }`}
                              >
                                {res.similarity.toFixed(4)}
                              </span>
                              <span className="text-[10px] text-slate-400">({pct}%)</span>
                            </div>
                          </div>
                        </div>

                        {/* Progress Bar for Cosine Similarity */}
                        <div className="w-full bg-slate-950 rounded-full h-2 mt-3 overflow-hidden border border-slate-800/60">
                          <div
                            className={`h-full transition-all duration-500 rounded-full ${
                              isHighMatch
                                ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                                : isMediumMatch
                                ? "bg-gradient-to-r from-purple-500 to-pink-500"
                                : "bg-slate-700"
                            }`}
                            style={{ width: `${Math.max(5, pct)}%` }}
                          />
                        </div>

                        {/* Snippet preview */}
                        <div className="mt-3 p-2.5 bg-slate-900/60 rounded-lg border border-slate-800/60 text-xs text-slate-300 leading-relaxed">
                          <span className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider block mb-1">
                            文档内容节选：
                          </span>
                          {res.previewSnippet}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: HEAD-TO-HEAD SHOWDOWN (LEXICAL VS SEMANTIC) */}
        {activeTab === "showdown" && (
          <div className="space-y-6">
            <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
                    <Swords className="w-5 h-5 text-pink-400" />
                    残酷擂台：Lexical Grep vs Semantic Search 面对面对决
                  </h2>
                  <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
                    在同一套 Benchmark 真实语料库中，针对不同类型的典型提问，对比传统的词法字符串搜索与向量语义检索的真实表现。
                  </p>
                </div>
                <button
                  onClick={handleRunShowdown}
                  disabled={isShowdownRunning}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-pink-900/30 transition-all shrink-0"
                >
                  {isShowdownRunning ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {isShowdownRunning ? "决斗测试进行中..." : "一键启动全面决斗测试"}
                </button>
              </div>

              {/* Showdown Test Matrix */}
              <div className="space-y-4 pt-2">
                {(
                  showdownCases || [
                    {
                      id: "case-synonym-regret",
                      title: "测试 1：口语化同义反悔（字面完全不重合）",
                      query: "我买完东西以后后悔了、不想要了，还能申请退款吗？",
                      targetDocId: "docs/refund-policy.md",
                      expectedSemanticWinner: true,
                      explanation:
                        "文档写'7天无理由退款/犹豫期冷静期'，没有任何'后悔'字样。词法匹配彻底扑空，语义检索精准抓取。",
                      lexical: {
                        latencyMs: 1,
                        hitsCount: 0,
                        topMatchDoc: null,
                        score: 0,
                        snippet: "未匹配到任何文档（0 命中）",
                        isTargetHit: false,
                      },
                      semantic: {
                        latencyMs: 3,
                        hitsCount: 3,
                        topMatchDoc: "通用退款与售后保障政策",
                        similarity: 0.884,
                        snippet: "所有标准数字软件与 SaaS 订阅商品均全面支持 7 天无理由退款。用户在订单完成后的 7 天犹豫期与冷静期内...",
                        isTargetHit: true,
                      },
                    },
                    {
                      id: "case-exact-code",
                      title: "测试 2：精确系统错误码（为第 5 课埋设伏笔）",
                      query: "遇到错误码 ERR_ALPHA_AUTH_9021 应该如何处理？",
                      targetDocId: "products/alpha.md",
                      expectedSemanticWinner: false,
                      explanation:
                        "词法 Grep 100% 毫无悬念精确命中；向量检索虽然也能排在前列，但在高维连续空间中缺乏精确符号匹配特权。",
                      lexical: {
                        latencyMs: 1,
                        hitsCount: 1,
                        topMatchDoc: "Alpha 企业级知识库检索套件 (V3.2)",
                        score: 5,
                        snippet: "... 遇到错误码 ERR_ALPHA_AUTH_9021：该错误表示企业 SSO 令牌过期，需重新颁发授权密钥 ...",
                        isTargetHit: true,
                      },
                      semantic: {
                        latencyMs: 4,
                        hitsCount: 3,
                        topMatchDoc: "Alpha 企业级知识库检索套件 (V3.2)",
                        similarity: 0.725,
                        snippet: "Alpha 企业级知识库检索套件 (V3.2) - 故障排除与常见问题响应机制...",
                        isTargetHit: true,
                      },
                    },
                    {
                      id: "case-architecture-synonym",
                      title: "测试 3：高阶技术意图泛化表达",
                      query: "企业多端多活故障切换与主备节点方案",
                      targetDocId: "products/alpha.md",
                      expectedSemanticWinner: true,
                      explanation:
                        "文档写的是'AlphaSyncDaemon / 容灾 / 高可用集群'，词法检索因词面不匹配失真，语义检索理解其企业高可用意图。",
                      lexical: {
                        latencyMs: 1,
                        hitsCount: 0,
                        topMatchDoc: null,
                        score: 0,
                        snippet: "未匹配到任何文档（0 命中）",
                        isTargetHit: false,
                      },
                      semantic: {
                        latencyMs: 3,
                        hitsCount: 3,
                        topMatchDoc: "Alpha 企业级知识库检索套件 (V3.2)",
                        similarity: 0.842,
                        snippet: "... 采用独创的 AlphaSyncDaemon 容灾机制，支持企业在多区域节点间实时无缝切换与故障隔离 ...",
                        isTargetHit: true,
                      },
                    },
                  ]
                ).map((tc) => {
                  return (
                    <div
                      key={tc.id}
                      className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
                          <h3 className="text-sm font-bold text-slate-100">{tc.title}</h3>
                        </div>
                        <span className="text-xs font-mono text-slate-400">
                          目标文档: <code className="text-purple-300">{tc.targetDocId}</code>
                        </span>
                      </div>

                      <div className="text-xs bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 font-mono text-slate-300">
                        <span className="text-slate-400 select-none">Query: </span>"{tc.query}"
                      </div>

                      {/* Side-by-side comparison */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Lexical Grep Box */}
                        <div
                          className={`p-4 rounded-xl border text-xs space-y-2.5 ${
                            tc.lexical.isTargetHit
                              ? "bg-emerald-950/20 border-emerald-500/40"
                              : "bg-rose-950/20 border-rose-500/30"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                              词法检索 (Lexical Grep)
                            </span>
                            {tc.lexical.isTargetHit ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> 精准命中
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> 0 命中 (扑空)
                              </span>
                            )}
                          </div>
                          <div className="text-slate-400">
                            命中数: <span className="font-mono text-slate-200">{tc.lexical.hitsCount}</span> | Top:{" "}
                            <span className="text-slate-300 font-medium">
                              {tc.lexical.topMatchDoc || "无"}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 bg-slate-950/60 p-2 rounded border border-slate-800/60 line-clamp-2">
                            {tc.lexical.snippet}
                          </p>
                        </div>

                        {/* Semantic Search Box */}
                        <div
                          className={`p-4 rounded-xl border text-xs space-y-2.5 ${
                            tc.semantic.isTargetHit
                              ? "bg-purple-950/20 border-purple-500/40 shadow-sm shadow-purple-900/10"
                              : "bg-amber-950/20 border-amber-500/30"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-purple-200 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                              语义检索 (Semantic Cosine)
                            </span>
                            {tc.semantic.isTargetHit ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> 完美对齐 (
                                {tc.semantic.similarity.toFixed(3)})
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                偏离预期
                              </span>
                            )}
                          </div>
                          <div className="text-slate-400">
                            相似度得分:{" "}
                            <span className="font-mono text-purple-300 font-bold">
                              {tc.semantic.similarity.toFixed(4)}
                            </span>{" "}
                            | Top:{" "}
                            <span className="text-purple-200 font-medium">
                              {tc.semantic.topMatchDoc}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 bg-slate-950/60 p-2 rounded border border-slate-800/60 line-clamp-2">
                            {tc.semantic.snippet}
                          </p>
                        </div>
                      </div>

                      <div className="text-xs text-slate-400 bg-slate-900/40 p-2 rounded-lg border border-slate-800/40 flex items-center gap-2">
                        <ArrowRight className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span>{tc.explanation}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: END-TO-END SEMANTIC RAG PIPELINE */}
        {activeTab === "pipeline" && (
          <div className="space-y-6">
            <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Play className="w-5 h-5 text-emerald-400" />
                    端到端语义 RAG 闭环实验台
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    验证链路：Query ➔ Embed 向量化 ➔ 余弦相似度 Top 1 ➔ 装配 Sufficient Context ➔ LLM 生成高可靠回答
                  </p>
                </div>

                <button
                  onClick={handleRunPipeline}
                  disabled={isRunningPipeline || !questionInput.trim() || !isKeyAvailable}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/30 transition-all shrink-0"
                >
                  {isRunningPipeline ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  {isRunningPipeline ? "正在检索并请求 LLM..." : "执行完整 RAG 闭环"}
                </button>
              </div>

              {!isKeyAvailable && (
                <div className="p-3 bg-amber-950/40 border border-amber-800/50 rounded-xl text-xs text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  提示：未配置 LLM_API_KEY。请在右上角配置 API Key，以运行实际大模型推理合成。
                </div>
              )}

              {/* Current Question Display */}
              <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800/80 space-y-2">
                <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">
                  测试提问 (Prompt Query)
                </span>
                <p className="text-sm font-medium text-slate-200">{questionInput}</p>
              </div>

              {/* Pipeline Output */}
              {pipelineResult && (
                <div className="space-y-6 pt-2">
                  {/* Metrics Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block mb-1">Prompt Tokens</span>
                      <span className="text-base font-mono font-bold text-purple-300">
                        {pipelineResult.tokens.promptTokens}
                      </span>
                    </div>
                    <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block mb-1">Token 节省率</span>
                      <span className="text-base font-mono font-bold text-emerald-400">
                        {pipelineResult.tokens.tokenSavingsPct}%
                      </span>
                    </div>
                    <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block mb-1">检索耗时</span>
                      <span className="text-base font-mono font-bold text-teal-300">
                        {pipelineResult.searchLatencyMs}ms
                      </span>
                    </div>
                    <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block mb-1">LLM 推理耗时</span>
                      <span className="text-base font-mono font-bold text-amber-300">
                        {pipelineResult.llmLatencyMs}ms
                      </span>
                    </div>
                  </div>

                  {/* Retrieved Top Hit Document */}
                  {pipelineResult.topHit && (
                    <div className="p-4 bg-purple-950/20 border border-purple-500/30 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                          检索命中的唯一参考文档 (Sufficient Context)
                        </span>
                        <span className="text-xs font-mono font-bold text-emerald-400">
                          余弦相似度: {pipelineResult.topHit.similarity.toFixed(4)}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-slate-100">{pipelineResult.topHit.title}</p>
                      <p className="text-xs text-slate-400 font-mono">{pipelineResult.topHit.id}</p>
                    </div>
                  )}

                  {/* Final Synthesized Answer */}
                  <div className="p-5 bg-gradient-to-b from-slate-900 to-slate-950 border border-emerald-500/30 rounded-2xl shadow-xl space-y-3">
                    <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      LLM 基于语义检索文档生成的严谨答案
                    </h4>
                    <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800/80 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                      {pipelineResult.answer}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: INTUITION & MATHEMATICAL FOUNDATIONS */}
        {activeTab === "intuition" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Lexical vs Semantic Matrix */}
              <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Compass className="w-5 h-5 text-purple-400" />
                  找“字” vs 找“意思”：两种截然不同的检索世界
                </h3>
                <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                  <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
                    <span className="font-bold text-amber-300 block">词法检索 (Lexical Search / Grep)</span>
                    <p className="text-slate-400">
                      通过字符串匹配、子串扫描或倒排索引查找字符。速度极快、100% 精确，但缺乏语义理解能力。当用户提问发生同义变体时，瞬间失真扑空。
                    </p>
                  </div>
                  <div className="p-3 bg-slate-950/70 border border-purple-800/50 rounded-xl space-y-1">
                    <span className="font-bold text-purple-300 block">语义检索 (Semantic Vector Search)</span>
                    <p className="text-slate-400">
                      通过深度神经网络将自然语言投影到连续几何向量空间 R^d。利用向量内积计算几何方向夹角，跨越词汇鸿沟理解人类意图。
                    </p>
                  </div>
                </div>
              </div>

              {/* Mathematical Cosine Formula Card */}
              <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-pink-400" />
                  余弦相似度数学公式与几何性质
                </h3>
                <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-xl text-center space-y-2">
                  <div className="text-lg sm:text-xl font-mono text-purple-300 font-bold">
                    cos(θ) = (A · B) / (||A||₂ × ||B||₂)
                  </div>
                  <p className="text-xs text-slate-400">
                    消除了文本长度（向量绝对模长）的干扰，专注于高维空间中的夹角方向
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-center">
                    <span className="text-slate-400 block text-[10px]">θ = 0° (同向完全一致)</span>
                    <span className="text-emerald-400 font-bold text-sm">cos(θ) = 1.0</span>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-center">
                    <span className="text-slate-400 block text-[10px]">θ = 90° (正交毫无关联)</span>
                    <span className="text-slate-400 font-bold text-sm">cos(θ) = 0.0</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer Next Frontier Card */}
        <section className="rounded-2xl bg-gradient-to-r from-slate-900 via-purple-950/40 to-slate-900 border border-purple-500/20 p-6 sm:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-purple-400 uppercase tracking-wider">
              <Flame className="w-4 h-4 text-purple-400" />
              下一课演进悬念：The Vector Trap
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white">
              第 05 课：Semantic Search 能完全替代关键词搜索吗？
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              当遇到精确错误码（如 <code>ERR_ALPHA_AUTH_9021</code>）、特定类名或函数符号时，向量模型的高维空间经常会发生严重钝化与漂移。向量检索不是银弹，它只是另一种检索渠道！
            </p>
          </div>

          <Link
            to="/docs/lessons/context/04-semantic-search-and-embedding.md"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-900/30 transition-all shrink-0"
          >
            完成本课学习并阅读讲义
            <ChevronRight className="w-4 h-4" />
          </Link>
        </section>
      </main>
    </div>
  );
}

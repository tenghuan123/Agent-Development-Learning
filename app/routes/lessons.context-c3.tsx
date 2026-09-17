import { useState, useEffect, useMemo } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import { BenchmarkCorpusManager, type BenchmarkQuestion } from "~/core/context-bench/corpus";
import { extractKeywords, searchInDocs, type LexicalSearchResult } from "~/core/context-bench/metrics";
import {
  Search,
  BookOpen,
  Play,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  Code2,
  RefreshCw,
  HelpCircle,
  FileText,
  Tag,
  Plus,
  X,
  Zap,
  Flame,
  ArrowRight,
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

export default function ContextLesson3Page() {
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

  // State: Question & Keyword Extraction
  const [selectedQuestionId, setSelectedQuestionId] = useState("qa-01");
  const [customQuestionText, setCustomQuestionText] = useState("Alpha 产品的退款期限是多少天？");
  const [keywords, setKeywords] = useState<string[]>(["Alpha", "退款"]);
  const [newKeywordInput, setNewKeywordInput] = useState("");

  // Search Results
  const [searchResults, setSearchResults] = useState<LexicalSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchExecutionTimeMs, setSearchExecutionTimeMs] = useState<number | null>(null);

  // Pipeline Execution State
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<{
    answer: string;
    topHit: {
      id: string;
      title: string;
      matchCount: number;
      matchedKeywords: string[];
      matchSnippet: string;
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

  // Contrast Probe State
  const [isProbing, setIsProbing] = useState(false);
  const [probeResults, setProbeResults] = useState<Array<{
    id: string;
    label: string;
    query: string;
    keywords: string[];
    expectedType: string;
    latencyMs: number;
    hitsCount: number;
    topMatchDoc: string | null;
    topSnippet: string | null;
    isSuccess: boolean;
  }> | null>(null);

  const effectiveApiKey = customApiKey || "";
  const isKeyAvailable = hasServerKey || Boolean(effectiveApiKey.trim().length > 0);

  // Instant local lexical preview derived via useMemo (strictly complying with AGENTS.md rule 2)
  const localPreviewMatches = useMemo(() => {
    if (keywords.length === 0) return [];
    return searchInDocs(docs, keywords);
  }, [docs, keywords]);

  // Handle choosing a preset question
  const handleSelectQuestion = (q: BenchmarkQuestion) => {
    setSelectedQuestionId(q.id);
    setCustomQuestionText(q.question);
    const extracted = extractKeywords(q.question);
    setKeywords(extracted);
    setSearchResults([]);
    setPipelineResult(null);
  };

  // Add keyword chip
  const handleAddKeyword = () => {
    const trimmed = newKeywordInput.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      setKeywords([...keywords, trimmed]);
      setNewKeywordInput("");
    }
  };

  // Remove keyword chip
  const handleRemoveKeyword = (target: string) => {
    setKeywords(keywords.filter((k) => k !== target));
  };

  // Reset keywords via extraction
  const handleAutoExtract = () => {
    const extracted = extractKeywords(customQuestionText);
    setKeywords(extracted);
  };

  // Execute Lexical Search
  const handleExecuteSearch = async () => {
    if (keywords.length === 0) return;
    setIsSearching(true);
    const t0 = performance.now();
    try {
      const res = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search_lexical",
          query: keywords,
        }),
      });
      const data = await res.json();
      const elapsed = Math.round(performance.now() - t0);
      setSearchExecutionTimeMs(elapsed);
      setSearchResults(data.results || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  // Run full End-to-End Pipeline
  const handleRunPipeline = async () => {
    if (!customQuestionText.trim() || isRunningPipeline) return;
    if (!isKeyAvailable) {
      alert("请先点击右上角配置 API Key");
      return;
    }

    setIsRunningPipeline(true);
    setPipelineResult(null);

    try {
      const res = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_lexical_pipeline",
          question: customQuestionText,
          keywords,
          apiKey: effectiveApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setPipelineResult({
        answer: data.answer,
        topHit: data.topHit,
        searchLatencyMs: data.searchLatencyMs,
        llmLatencyMs: data.llmLatencyMs,
        totalLatencyMs: data.totalLatencyMs,
        tokens: data.tokens,
      });

      // Also sync search results table if empty
      if (data.searchResults) {
        setSearchResults(data.searchResults);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`运行失败: ${msg}`);
    } finally {
      setIsRunningPipeline(false);
    }
  };

  // Run Lexical Contrast Probe (The Lexical Trap)
  const handleRunContrastProbe = async () => {
    setIsProbing(true);
    try {
      const res = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_lexical_contrast",
        }),
      });
      const data = await res.json();
      if (data.probeCases) {
        setProbeResults(data.probeCases);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProbing(false);
    }
  };

  const activeMatches = searchResults.length > 0 ? searchResults : localPreviewMatches;
  const topDocMatch = activeMatches[0] || null;

  return (
    <div className="flex flex-col min-h-screen bg-[#080b14] text-slate-100 antialiased font-sans selection:bg-amber-500/30">
      <Header
        hasServerKey={hasServerKey}
        model={model}
        customApiKey={customApiKey}
        onSaveApiKey={saveLocalKey}
        customBaseURL={customBaseURL}
        onSaveBaseURL={saveLocalBaseURL}
        onSaveSettings={handleSaveSettings}
        currentLesson={{
          id: "c3",
          title: "第 3 课: 数据很多怎么找到相关信息？(Lexical Search)",
          badge: "C3 词法检索",
        }}
      />

      <main className="flex-1 overflow-y-auto p-6 md:p-10 max-w-7xl mx-auto w-full space-y-8">
        {/* Banner */}
        <div className="glass-panel p-6 md:p-8 rounded-3xl border border-amber-500/30 bg-gradient-to-r from-amber-950/30 via-[#0d1222] to-orange-950/20 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-amber-400" />
                Context Engineering · 阶段 3
              </span>
              <span className="text-xs text-slate-400">/ 第 03 课</span>
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              数据很多怎么找到相关信息？—— 词法检索与关键词匹配
            </h1>

            <p className="text-sm text-slate-300 leading-relaxed">
              既然不能全塞（Sufficient Context），当知识库有 10,000 篇文档时，如何精准定位？
              <strong className="text-amber-300">严禁在第一天引入 Vector DB</strong>，从最质朴、零算力浪费的
              <strong className="text-white">“关键词提取 + 纯文本 Grep + 按需读取”</strong> 闭环出发，
              实测 Token 消耗骤降 95.7% 的工程奇迹，并亲历口语同义词导致的
              <strong className="text-rose-400">“检索 0 命中塌方”</strong>。
            </p>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-3 shrink-0">
            <Link
              to="/docs/lessons/context/03-lexical-search-and-grep.md"
              target="_blank"
              className="px-4 py-2.5 rounded-xl bg-[#12192c] hover:bg-[#1a2542] border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>查阅本课理论讲义</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </Link>

            <Link
              to="/lessons/context-c2-sufficient-context"
              className="px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-xs font-semibold text-slate-300 flex items-center justify-center gap-2 transition"
            >
              <span>← 返回第 2 课</span>
            </Link>
          </div>
        </div>

        {/* Pipeline Architecture Visualizer */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800/80 bg-[#0d1322]/80 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Code2 className="w-4 h-4 text-amber-400" />
              <span>词法检索闭环管线架构 (Lexical Search Pipeline)</span>
            </h2>
            <span className="text-xs font-mono text-slate-400">
              全库规模：{docs.length} 篇文档 · {totalCorpusTokens.toLocaleString()} Tokens
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-1">
              <span className="text-slate-400 font-mono">Stage 1</span>
              <div className="font-bold text-slate-200">用户提问输入</div>
              <div className="text-[11px] text-slate-400 truncate">包含口语词与技术符号</div>
            </div>

            <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 flex flex-col justify-between space-y-1">
              <span className="text-amber-400 font-mono">Stage 2</span>
              <div className="font-bold text-amber-300">extractKeywords()</div>
              <div className="text-[11px] text-slate-400">停用词过滤与标识符提取</div>
            </div>

            <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 flex flex-col justify-between space-y-1">
              <span className="text-amber-400 font-mono">Stage 3</span>
              <div className="font-bold text-amber-300">searchText() (Grep)</div>
              <div className="text-[11px] text-slate-400">全库字面匹配与片段窗口</div>
            </div>

            <div className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-500/30 flex flex-col justify-between space-y-1">
              <span className="text-indigo-400 font-mono">Stage 4</span>
              <div className="font-bold text-indigo-300">readDocument(topId)</div>
              <div className="text-[11px] text-slate-400">装配 Sufficient Context</div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex flex-col justify-between space-y-1">
              <span className="text-emerald-400 font-mono">Stage 5</span>
              <div className="font-bold text-emerald-300">LLM Generation</div>
              <div className="text-[11px] text-slate-400">高信噪比严谨推理答复</div>
            </div>
          </div>
        </div>

        {/* Main 2-Column Experiment Area */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Input, Keywords & Lexical Match (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Step 1: Question Selection & Keywords */}
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 bg-[#0d1222]/90 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 text-xs font-mono flex items-center justify-center border border-amber-500/30">
                    1
                  </span>
                  <span>选择测试问题与关键词提取 (extractKeywords)</span>
                </h3>

                <button
                  type="button"
                  onClick={handleAutoExtract}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 flex items-center gap-1 transition"
                  title="重新执行自动提取"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>自动提取关键词</span>
                </button>
              </div>

              {/* Preset Questions Chips */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                  <span>基准评测题库预设：</span>
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {questions.slice(0, 3).map((q) => {
                    const isSelected = selectedQuestionId === q.id;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => handleSelectQuestion(q)}
                        className={`text-left p-2.5 rounded-xl border text-xs transition flex items-center justify-between ${
                          isSelected
                            ? "bg-amber-950/20 border-amber-500/50 text-white"
                            : "bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/60"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                              q.category === "identifier_code"
                                ? "bg-purple-500/20 text-purple-300"
                                : q.category === "semantic_synonym"
                                ? "bg-rose-500/20 text-rose-300"
                                : "bg-cyan-500/20 text-cyan-300"
                            }`}
                          >
                            {q.category}
                          </span>
                          <span className="truncate">{q.question}</span>
                        </div>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">自定义测试提问：</label>
                <textarea
                  value={customQuestionText}
                  onChange={(e) => {
                    setCustomQuestionText(e.target.value);
                  }}
                  rows={2}
                  className="w-full bg-[#080b14] border border-slate-700/80 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500 transition resize-none leading-relaxed"
                  placeholder="输入任何想查询的技术或售后问题..."
                />
              </div>

              {/* Keyword Chips Editor */}
              <div className="space-y-2 pt-1 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-amber-400" />
                    <span>提取的词法检索词 (Keywords Tokens)：</span>
                  </span>
                  <span className="text-[11px] text-slate-400">支持自由增删关键词</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {keywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/30 text-xs font-mono font-medium"
                    >
                      <span>{kw}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveKeyword(kw)}
                        className="text-amber-400 hover:text-white transition"
                        title="删除该关键词"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}

                  {keywords.length === 0 && (
                    <span className="text-xs text-rose-400 italic">
                      未提取到关键词，请手动输入添加或点击自动提取
                    </span>
                  )}

                  {/* Add keyword input */}
                  <div className="inline-flex items-center gap-1">
                    <input
                      type="text"
                      value={newKeywordInput}
                      onChange={(e) => setNewKeywordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddKeyword();
                        }
                      }}
                      placeholder="添加关键词..."
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 w-28"
                    />
                    <button
                      type="button"
                      onClick={handleAddKeyword}
                      className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                      title="添加关键词"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: Lexical Search Inspector */}
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 bg-[#0d1222]/90 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 text-xs font-mono flex items-center justify-center border border-amber-500/30">
                    2
                  </span>
                  <span>纯文本检索显微镜 (searchText / Grep)</span>
                </h3>

                <button
                  type="button"
                  onClick={handleExecuteSearch}
                  disabled={isSearching || keywords.length === 0}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-xs font-bold text-white flex items-center gap-1.5 transition shadow-lg shadow-amber-900/20"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>{isSearching ? "全库检索中..." : "重新执行搜索"}</span>
                </button>
              </div>

              {/* Status & Timing */}
              <div className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400">
                  检索关键词：<strong className="text-amber-300 font-mono">{keywords.join(", ") || "无"}</strong>
                </span>
                <span className="font-mono text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>
                    检索耗时:{" "}
                    <strong className="text-white">
                      {searchExecutionTimeMs !== null ? `${searchExecutionTimeMs}ms` : "< 2ms (纯本地计算)"}
                    </strong>
                  </span>
                </span>
              </div>

              {/* Search Results List */}
              <div className="space-y-3">
                {activeMatches.length > 0 ? (
                  activeMatches.map((match, idx) => (
                    <div
                      key={match.doc.id}
                      className={`p-4 rounded-2xl border transition ${
                        idx === 0
                          ? "border-amber-500/50 bg-amber-950/15"
                          : "border-slate-800 bg-slate-900/40 hover:bg-slate-900/70"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            {idx === 0 && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                TOP 1 最佳命中
                              </span>
                            )}
                            <span className="text-xs font-bold text-white">{match.doc.title}</span>
                            <span className="text-[10px] font-mono text-slate-400">({match.doc.path})</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400">
                            <span>
                              命中频次: <strong className="text-amber-300">{match.matchCount} 次</strong>
                            </span>
                            <span>
                              得分: <strong className="text-white">{match.score}</strong>
                            </span>
                            <span>
                              匹配词:{" "}
                              <strong className="text-slate-300 font-mono">
                                {match.matchedKeywords.join(", ")}
                              </strong>
                            </span>
                            <span>
                              文档大小:{" "}
                              <strong className="text-slate-300 font-mono">{match.doc.tokenCount} T</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Snippet preview */}
                      <div className="mt-3 p-2.5 rounded-xl bg-[#080b14] border border-slate-800/80 font-mono text-[11px] text-slate-300 leading-relaxed overflow-x-auto">
                        <span className="text-slate-500 text-[10px] block mb-1">匹配上下文片段 (Snippet Window)：</span>
                        <div className="text-slate-200">
                          {match.matchSnippet || (match.allSnippets && match.allSnippets[0])}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 rounded-2xl border border-rose-500/40 bg-rose-950/20 text-center space-y-2">
                    <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto" />
                    <div className="text-sm font-bold text-rose-300">未检索到任何匹配文档 (0 Matches)</div>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      全库所有文档均未包含关键词{" "}
                      <span className="text-white font-mono font-bold">[{keywords.join(", ")}]</span>。
                      这就是词法检索面对口语同义词时爆发的经典
                      <strong className="text-rose-300">“词汇鸿沟 (Vocabulary Mismatch)”</strong>。
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Sufficient Assembly & Pipeline Result (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Step 3: Sufficient Context Assembly & Token Savings */}
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 bg-[#0d1222]/90 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs font-mono flex items-center justify-center border border-indigo-500/30">
                    3
                  </span>
                  <span>装配 Sufficient Context (readDocument)</span>
                </h3>
              </div>

              {topDocMatch ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-2xl bg-indigo-950/20 border border-indigo-500/30 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        <span>已按需读取目标文档</span>
                      </span>
                      <span className="text-xs font-mono text-slate-300">{topDocMatch.doc.tokenCount} Tokens</span>
                    </div>
                    <div className="text-xs text-white font-bold">{topDocMatch.doc.title}</div>
                  </div>

                  {/* Token & Cost Comparison vs Brute Force */}
                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                      <span>Token 消耗量对比：</span>
                      <span className="text-emerald-400 font-bold">
                        节省{" "}
                        {Math.round(
                          ((totalCorpusTokens - topDocMatch.doc.tokenCount) / totalCorpusTokens) * 100
                        )}
                        %
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>第 2 课全塞模式 (Tier C)：</span>
                        <span className="font-mono text-rose-400 font-bold">~{totalCorpusTokens} T</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div className="bg-rose-500 h-2 rounded-full w-full" />
                      </div>

                      <div className="flex items-center justify-between text-slate-400 pt-1">
                        <span>本课检索模式 (Sufficient Doc)：</span>
                        <span className="font-mono text-emerald-300 font-bold">
                          ~{topDocMatch.doc.tokenCount} T
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-emerald-400 h-2 rounded-full"
                          style={{
                            width: `${Math.max(
                              4,
                              (topDocMatch.doc.tokenCount / totalCorpusTokens) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
                  当前无命中文档，无法装配目标上下文。
                </div>
              )}

              {/* Run End-to-End Button */}
              <button
                type="button"
                onClick={handleRunPipeline}
                disabled={isRunningPipeline}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-50 text-sm font-extrabold text-white flex items-center justify-center gap-2 transition shadow-xl shadow-amber-950/40"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>{isRunningPipeline ? "全流程流水线执行中..." : "运行端到端检索生成问答 (Run Pipeline)"}</span>
              </button>
            </div>

            {/* Step 4: End-to-End LLM Generation Result */}
            {pipelineResult && (
              <div className="glass-panel p-6 rounded-3xl border border-emerald-500/40 bg-emerald-950/10 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <span>模型生成严谨回答</span>
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Sufficient Context
                  </span>
                </div>

                {/* Answer Output */}
                <div className="p-4 rounded-2xl bg-[#080b14] border border-slate-800 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                  {pipelineResult.answer}
                </div>

                {/* Metrics Breakdown */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">检索耗时</span>
                    <span className="font-mono font-bold text-amber-300">
                      {pipelineResult.searchLatencyMs} ms
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">生成耗时</span>
                    <span className="font-mono font-bold text-cyan-300">
                      {pipelineResult.llmLatencyMs} ms
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Token 节省</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {pipelineResult.tokens.tokenSavingsPct}%
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* The Lexical Trap: Contrast Probe (词法检索物理死穴探针) */}
        <div className="glass-panel p-6 md:p-8 rounded-3xl border border-rose-500/30 bg-gradient-to-br from-[#0d1222] via-rose-950/10 to-[#080b14] space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-rose-400" />
                <h3 className="text-lg font-extrabold text-white">
                  词法检索极限探针：高光与崩塌 (The Lexical Trap)
                </h3>
              </div>
              <p className="text-xs text-slate-300">
                一键运行两组极限对比测试，亲身见证词法检索在哪种场景神勇无敌，又在哪种场景彻底崩盘：
              </p>
            </div>

            <button
              type="button"
              onClick={handleRunContrastProbe}
              disabled={isProbing}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-xs font-bold text-white flex items-center justify-center gap-2 transition shadow-lg shadow-rose-950/50 shrink-0"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{isProbing ? "探针运行中..." : "一键执行极限对照测试"}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Case A: Exact Identifier */}
            <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>A组：精确代码与专有名词 (高光时刻)</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  100% 毫秒级命中
                </span>
              </div>

              <div className="text-xs text-slate-300">
                提问：<strong className="text-white">遇到错误码 ERR_ALPHA_AUTH_9021 应该如何处理？</strong>
              </div>

              <div className="text-[11px] text-slate-400">
                检索词：<code className="text-amber-300 bg-slate-900 px-1.5 py-0.5 rounded">ERR_ALPHA_AUTH_9021</code>
              </div>

              <div className="p-3 rounded-xl bg-[#080b14] border border-slate-800 text-[11px] text-slate-300 space-y-1">
                <div className="text-emerald-400 font-bold">
                  {probeResults ? `命中: ${probeResults[0].hitsCount} 篇文档 (${probeResults[0].topMatchDoc})` : "命中: products/alpha.md"}
                </div>
                <div className="text-slate-400 truncate">
                  {probeResults ? probeResults[0].topSnippet : "ERR_ALPHA_AUTH_9021: 企业 SSO 令牌过期，需要重新颁发授权密钥..."}
                </div>
              </div>
            </div>

            {/* Case B: Semantic Synonym */}
            <div className="p-5 rounded-2xl border border-rose-500/40 bg-rose-950/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>B组：口语同义词表达 (灾难性崩盘)</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                  0 命中塌方
                </span>
              </div>

              <div className="text-xs text-slate-300">
                提问：<strong className="text-white">我买完东西以后后悔了、不想要了，还能退款吗？</strong>
              </div>

              <div className="text-[11px] text-slate-400">
                检索词：<code className="text-rose-300 bg-slate-900 px-1.5 py-0.5 rounded">后悔, 不想要</code>
              </div>

              <div className="p-3 rounded-xl bg-[#080b14] border border-slate-800 text-[11px] text-slate-300 space-y-1">
                <div className="text-rose-400 font-bold">
                  {probeResults ? `命中: ${probeResults[1].hitsCount} 篇文档 (检索完全扑空)` : "命中: 0 篇文档"}
                </div>
                <div className="text-slate-400">
                  真实政策写的是“7 天犹豫期无理由退款”，字面上根本没有“后悔”或“不想要”，导致 0 命中！
                </div>
              </div>
            </div>
          </div>

          {/* Forward to Lesson 4 Callout */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/40 to-indigo-950/40 border border-purple-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-xs">
              <span className="font-bold text-purple-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>由此推导：为什么行业必须诞生“语义检索 (Semantic Search)”？</span>
              </span>
              <p className="text-slate-300">
                字符完全不同，但意思完全一样（同义词）。纯字面 Grep 束手无策，必须把文字映射到高维几何空间计算余弦相似度。
              </p>
            </div>

            <div className="px-4 py-2 rounded-xl bg-purple-600/80 text-white text-xs font-bold shrink-0 flex items-center gap-1.5">
              <span>下一课：Semantic Search</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

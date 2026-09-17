import { useState, useEffect, useMemo } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import { BenchmarkCorpusManager } from "~/core/context-bench/corpus";
import {
  simulateTokenFragmentation,
  searchSemanticInDocs,
} from "~/core/context-bench/semantic";
import { searchInDocs } from "~/core/context-bench/metrics";
import {
  AlertTriangle,
  Cpu,
  Search,
  Sparkles,
  Swords,
  Zap,
  BookOpen,
  Play,
  RefreshCw,
  Terminal,
  Binary,
  Code2,
  Compass,
  RotateCcw,
  Flame,
  Layers,
} from "lucide-react";

export const BENCHMARK_CASES = [
  {
    id: "case-01-error-code",
    category: "精确错误码识别 (Exact Error Code)",
    title: "错误码穿透：ERR_ALPHA_AUTH_9021",
    query: "遇到错误码 ERR_ALPHA_AUTH_9021 应该如何处理？",
    targetDocId: "products/alpha.md",
    targetDocTitle: "Alpha 产品规格与服务条款",
    lexicalKeywords: ["ERR_ALPHA_AUTH_9021"],
    expectedWinner: "lexical" as const,
    keyTakeaway: "离散符号 100% 绝对命中；向量空间因 BPE 分词切碎（ERR/ALPHA/AUTH/90/21）及背景副词干扰发生钝化。",
  },
  {
    id: "case-02-symbol-name",
    category: "专属代码符号 (Code Symbol / AST)",
    title: "符号定位：BetaAstParser 运行时依赖",
    query: "BetaAstParser 的核心能力与运行时依赖是什么？",
    targetDocId: "products/beta.md",
    targetDocTitle: "Beta 产品规格与服务条款",
    lexicalKeywords: ["BetaAstParser"],
    expectedWinner: "lexical" as const,
    keyTakeaway: "CamelCase 符号在倒排索引中独一无二；连续向量模型容易漂移到其他通用代码审查和插件文档。",
  },
  {
    id: "case-03-config-port",
    category: "网络端口与配置项 (Config & Port)",
    title: "配置项探测：port 9443 数据总线",
    query: "Alpha 数据总线默认监听哪个端口？",
    targetDocId: "products/alpha.md",
    targetDocTitle: "Alpha 产品规格与服务条款",
    lexicalKeywords: ["端口", "9443"],
    expectedWinner: "lexical" as const,
    keyTakeaway: "小数字和短端口在几何空间中缺乏独立语义偏向，常与通用安全/沙箱端口混淆；Grep 毫秒直达目标行。",
  },
  {
    id: "case-04-synonym-regret",
    category: "口语同义反悔 (Colloquial Paraphrase)",
    title: "口语意图：买完后悔了还能退款吗？",
    query: "我买完东西以后后悔了、不想要了，还能申请退款吗？",
    targetDocId: "docs/refund-policy.md",
    targetDocTitle: "通用退款与售后保障政策",
    lexicalKeywords: ["后悔", "不想要"],
    expectedWinner: "semantic" as const,
    keyTakeaway: "词汇鸿沟死穴：文档中只有'犹豫期/冷静期/7天无理由'，词法字符匹配彻底塌方（0 命中）；语义高维夹角精确捕获。",
  },
  {
    id: "case-05-high-level-intent",
    category: "抽象技术概念泛化 (Abstract Architecture)",
    title: "高阶意图：企业多端多活故障切换",
    query: "企业多端多活故障切换与集群高可用容灾方案",
    targetDocId: "products/alpha.md",
    targetDocTitle: "Alpha 产品规格与服务条款",
    lexicalKeywords: ["多端多活", "主备节点"],
    expectedWinner: "semantic" as const,
    keyTakeaway: "文档采用'AlphaSyncDaemon / 跨区域集群容灾'表述，词法命中 0 篇；语义向量跨词汇抽象完成概念投影。",
  },
  {
    id: "case-06-hybrid-complex",
    category: "复杂混合查询 (Mixed Symbol & Intent)",
    title: "混合查询：AlphaSyncDaemon 遇到 SSO 令牌过期",
    query: "AlphaSyncDaemon 遇到 SSO 令牌过期该怎么恢复？",
    targetDocId: "products/alpha.md",
    targetDocTitle: "Alpha 产品规格与服务条款",
    lexicalKeywords: ["AlphaSyncDaemon", "SSO"],
    expectedWinner: "tie" as const,
    keyTakeaway: "词法锁定守护进程名称，语义捕获'过期恢复'意图。任何单一通道均无法获取全景上下文，引出第 6 课 Hybrid RRF！",
  },
];

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

  const initialCases = BENCHMARK_CASES.map((bc) => ({
    ...bc,
    tokenDiagnosis: simulateTokenFragmentation(bc.query),
  }));

  return {
    hasServerKey,
    model,
    defaultBaseURL,
    docs,
    questions,
    totalCorpusTokens,
    initialCases,
  };
}

interface SingleCaseResult {
  id: string;
  category: string;
  title: string;
  query: string;
  targetDocId: string;
  targetDocTitle: string;
  expectedWinner: "lexical" | "semantic" | "tie";
  actualWinner: "lexical" | "semantic" | "tie";
  isExpectedWinner: boolean;
  keyTakeaway: string;
  tokenDiagnosis: ReturnType<typeof simulateTokenFragmentation>;
  lexical: {
    latencyMs: number;
    targetRank: number | null;
    totalHits: number;
    topMatchDoc: string | null;
    topDocId: string | null;
    score: number;
    snippet: string;
    isTargetHit: boolean;
    answer?: string | null;
    tokens?: number;
    llmLatencyMs?: number;
  };
  semantic: {
    latencyMs: number;
    targetRank: number | null;
    totalHits: number;
    topMatchDoc: string | null;
    topDocId: string | null;
    similarity: number;
    snippet: string;
    isTargetHit: boolean;
    answer?: string | null;
    tokens?: number;
    llmLatencyMs?: number;
  };
}

export default function ContextLesson5Page() {
  const {
    hasServerKey,
    model,
    defaultBaseURL,
    docs,
    totalCorpusTokens,
    initialCases,
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

  const effectiveApiKey = customApiKey || "";
  const isKeyAvailable = hasServerKey || Boolean(effectiveApiKey.trim().length > 0);

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<"intuition" | "benchmark" | "lab" | "takeaways">("benchmark");

  // State: Case-by-case benchmark execution
  const [caseResults, setCaseResults] = useState<Record<string, SingleCaseResult>>({});
  const [runningCaseIds, setRunningCaseIds] = useState<Set<string>>(new Set());
  const [isRunningSequential, setIsRunningSequential] = useState(false);
  const [currentSeqIndex, setCurrentSeqIndex] = useState<number>(-1);
  const [includeLLM, setIncludeLLM] = useState(false);

  // State: Interactive Lab
  const [queryInput, setQueryInput] = useState("遇到错误码 ERR_ALPHA_AUTH_9021 应该如何处理？");
  const [isSearching, setIsSearching] = useState(false);
  const [labResult, setLabResult] = useState<{
    query: string;
    keywords: string[];
    tokenReport: ReturnType<typeof simulateTokenFragmentation>;
    lexical: {
      latencyMs: number;
      totalHits: number;
      topHit: { id: string; title: string; matchedKeywords: string[]; score: number; snippet: string } | null;
      allHits: Array<{ id: string; title: string; score: number; snippet: string }>;
      answer: string | null;
      tokens: number;
      llmLatencyMs: number;
    };
    semantic: {
      latencyMs: number;
      totalHits: number;
      topHit: { id: string; title: string; similarity: number; rank: number; snippet: string } | null;
      allHits: Array<{ id: string; title: string; similarity: number; rank: number; snippet: string }>;
      answer: string | null;
      tokens: number;
      llmLatencyMs: number;
    };
  } | null>(null);

  // Derived Benchmark Summary (Strictly adhering to AGENTS.md rule 2: no useEffect for derived state)
  const benchmarkSummary = useMemo(() => {
    const completedList = Object.values(caseResults);
    return {
      totalExecuted: completedList.length,
      lexicalWins: completedList.filter((c) => c.actualWinner === "lexical").length,
      semanticWins: completedList.filter((c) => c.actualWinner === "semantic").length,
      ties: completedList.filter((c) => c.actualWinner === "tie").length,
    };
  }, [caseResults]);

  // Instant local preview derived strictly via useMemo
  const localTokenReport = useMemo(() => {
    return simulateTokenFragmentation(queryInput);
  }, [queryInput]);

  const localLexicalHits = useMemo(() => {
    if (!queryInput.trim()) return [];
    return searchInDocs(docs, queryInput);
  }, [docs, queryInput]);

  const localSemanticHits = useMemo(() => {
    if (!queryInput.trim()) return [];
    return searchSemanticInDocs(docs, queryInput, { topK: 5 });
  }, [docs, queryInput]);

  // Execute a single benchmark case real-time
  const handleRunSingleCase = async (caseId: string, runWithLLM = includeLLM) => {
    setRunningCaseIds((prev) => new Set(prev).add(caseId));
    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_c5_single_case",
          caseId,
          runLLM: runWithLLM && isKeyAvailable,
          apiKey: effectiveApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });
      const data = await resp.json();
      if (data.success && data.caseResult) {
        setCaseResults((prev) => ({
          ...prev,
          [caseId]: data.caseResult,
        }));
      }
    } catch (err) {
      console.error("Failed to run case:", err);
    } finally {
      setRunningCaseIds((prev) => {
        const next = new Set(prev);
        next.delete(caseId);
        return next;
      });
    }
  };

  // Run all cases sequentially (one by one with real progress)
  const handleRunAllSequentially = async () => {
    setIsRunningSequential(true);
    for (let i = 0; i < initialCases.length; i++) {
      setCurrentSeqIndex(i);
      await handleRunSingleCase(initialCases[i].id, includeLLM);
    }
    setIsRunningSequential(false);
    setCurrentSeqIndex(-1);
  };

  // Reset all benchmark results
  const handleResetBenchmark = () => {
    setCaseResults({});
    setRunningCaseIds(new Set());
    setIsRunningSequential(false);
    setCurrentSeqIndex(-1);
  };

  // Run Interactive Lab Search & LLM Generation
  const handleRunLab = async (runLLM = false) => {
    if (!queryInput.trim()) return;
    setIsSearching(true);
    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_c5_interactive_comparison",
          query: queryInput,
          runLLM,
          apiKey: effectiveApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        setLabResult(data);
      }
    } catch (err) {
      console.error("Failed to run lab search:", err);
    } finally {
      setIsSearching(false);
    }
  };

  // Preset queries for lab exploration
  const PRESET_QUERIES = [
    {
      label: "精确错误码 (ERR_ALPHA_AUTH_9021)",
      text: "遇到错误码 ERR_ALPHA_AUTH_9021 应该如何处理？",
      tag: "Lexical 完胜",
      tagColor: "bg-blue-900/60 text-blue-300 border-blue-500/40",
    },
    {
      label: "专属代码符号 (BetaAstParser)",
      text: "BetaAstParser 的核心能力与运行时依赖是什么？",
      tag: "Lexical 完胜",
      tagColor: "bg-blue-900/60 text-blue-300 border-blue-500/40",
    },
    {
      label: "网络端口与配置 (port 9443)",
      text: "Alpha 数据总线默认监听哪个端口？",
      tag: "Lexical 完胜",
      tagColor: "bg-blue-900/60 text-blue-300 border-blue-500/40",
    },
    {
      label: "口语同义反悔 (买完后悔了)",
      text: "我买完东西以后后悔了、不想要了，还能申请退款吗？",
      tag: "Semantic 完胜",
      tagColor: "bg-purple-900/60 text-purple-300 border-purple-500/40",
    },
    {
      label: "抽象技术概念泛化 (多端多活集群)",
      text: "企业多端多活故障切换与集群高可用容灾方案",
      tag: "Semantic 完胜",
      tagColor: "bg-purple-900/60 text-purple-300 border-purple-500/40",
    },
    {
      label: "混合复杂查询 (符号 + 意图)",
      text: "AlphaSyncDaemon 遇到 SSO 令牌过期该怎么恢复？",
      tag: "平局 / 混合诉求",
      tagColor: "bg-amber-900/60 text-amber-300 border-amber-500/40",
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-rose-500/30 selection:text-rose-200">
      <Header
        hasServerKey={hasServerKey}
        model={model}
        defaultBaseURL={defaultBaseURL}
        customApiKey={customApiKey}
        customBaseURL={customBaseURL}
        onSaveSettings={handleSaveSettings}
        currentLesson={{
          id: "context-c5",
          title: "第 05 课: Semantic 能替代关键词搜索吗？(失真边界)",
          badge: "C5",
        }}
      />

      {/* Top Banner / Breadcrumb */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-30 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800/60">
              C5
            </span>
            <span className="text-zinc-400">Context Engineering 专项实战</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-200 font-medium">
              第 05 课：Semantic Search 能替代关键词搜索吗？(精确标识符与失真边界)
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/lessons/context-c4-semantic-search"
              className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
            >
              ← 上一课 (C4 语义检索)
            </Link>
            <span className="text-zinc-700">|</span>
            <Link
              to="/lessons/context-c6-hybrid-retrieval"
              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
            >
              下一课 (C6 混合检索) →
            </Link>
            <span className="text-zinc-700">|</span>
            <Link
              to="/docs/lessons/context/05-can-semantic-search-replace-lexical.md"
              className="text-rose-400 hover:text-rose-300 flex items-center gap-1 font-medium transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" />
              阅读本课深度讲义
            </Link>
          </div>
        </div>
      </div>

      {/* Hero Overview */}
      <div className="border-b border-zinc-800/80 bg-gradient-to-b from-rose-950/20 via-zinc-900/30 to-zinc-950 px-4 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                  破除向量万能论 (The Vector Trap)
                </span>
                <span className="text-xs text-zinc-400 font-mono">
                  语料库：{docs.length} 篇文档 ({totalCorpusTokens.toLocaleString()} Tokens)
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
                <span>Semantic Search 能替代关键词搜索吗？</span>
                <span className="text-xs px-2.5 py-1 rounded bg-amber-950/80 text-amber-300 border border-amber-800/50 font-mono">
                  逐个真实对决对比
                </span>
              </h1>
              <p className="mt-1.5 text-xs md:text-sm text-zinc-400 max-w-3xl leading-relaxed">
                在第 4 课攻克词汇鸿沟后，我们极易误以为“向量是搜索的终极答案”。
                本课通过真实场景<strong className="text-zinc-200">一个一个对决对比</strong>，直面分词切分碎片化（BPE Fragmentation）与高维几何稀释，
                揭示连续向量空间对错误码、代码符号与端口的致命钝化，确立
                <strong className="text-rose-300 font-semibold">“Semantic ≠ Better Search，它只是另一种检索维度”</strong>的第一性原理。
              </p>
            </div>

            {/* Quick Status Pill */}
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <div className="flex items-center gap-2 bg-zinc-900/80 border border-zinc-800 px-3 py-1.5 rounded-lg text-xs">
                <Binary className="w-4 h-4 text-rose-400" />
                <span className="text-zinc-400">核心论题：</span>
                <span className="text-rose-300 font-mono font-medium">离散绝对性 vs 连续模糊性</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                <span>下一课伏笔：</span>
                <span className="text-indigo-400">第 06 课 混合检索 (Hybrid RRF)</span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 mt-6 border-b border-zinc-800">
            <button
              onClick={() => setActiveTab("benchmark")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === "benchmark"
                  ? "border-rose-500 text-rose-400 bg-rose-500/5"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Swords className="w-3.5 h-3.5" />
              6 场景真实逐个对决 (Step-by-Step Showdown)
            </button>
            <button
              onClick={() => setActiveTab("lab")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === "lab"
                  ? "border-rose-500 text-rose-400 bg-rose-500/5"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              交互式失真实验室 (Degradation Lab)
            </button>
            <button
              onClick={() => setActiveTab("intuition")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === "intuition"
                  ? "border-rose-500 text-rose-400 bg-rose-500/5"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              机理剖析：为什么向量会钝化？(Principles)
            </button>
            <button
              onClick={() => setActiveTab("takeaways")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === "takeaways"
                  ? "border-rose-500 text-rose-400 bg-rose-500/5"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              架构第一性与第 6 课预告 (Takeaways)
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto w-full px-4 py-6 flex-1">
        {/* ========================================================================= */}
        {/* TAB 1: 6 场景真实逐个对决 (BENCHMARK MATRIX) */}
        {/* ========================================================================= */}
        {activeTab === "benchmark" && (
          <div className="space-y-6">
            {/* Top Control Bar */}
            <div className="bg-zinc-900/70 border border-zinc-800 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <Swords className="w-4 h-4 text-rose-400" />
                  真实工业代码与自然语言 6 场景现场对决
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  每个用例均对底层语料库触发真实词法扫描与向量余弦计算，可单个点击独立运行，或依次自动步进执行。
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* LLM Toggle */}
                <label className="flex items-center gap-2 text-xs text-zinc-300 bg-zinc-950 px-3 py-2 rounded-lg border border-zinc-800 cursor-pointer select-none hover:border-zinc-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={includeLLM}
                    onChange={(e) => setIncludeLLM(e.target.checked)}
                    className="rounded border-zinc-700 text-rose-600 focus:ring-0 focus:ring-offset-0 bg-zinc-900"
                  />
                  <span className="flex items-center gap-1.5">
                    <Zap className="w-3 h-3 text-amber-400" />
                    包含真实大模型应答比对
                  </span>
                  {!isKeyAvailable && includeLLM && (
                    <span className="text-[10px] text-amber-400 font-mono">(需配置 Key)</span>
                  )}
                </label>

                {/* Sequential Run All */}
                <button
                  onClick={handleRunAllSequentially}
                  disabled={isRunningSequential || runningCaseIds.size > 0}
                  className="px-3.5 py-2 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-lg flex items-center gap-1.5 transition-all"
                >
                  {isRunningSequential ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      正在依次运行 (第 {currentSeqIndex + 1} / {initialCases.length} 组)...
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      逐个依次运行全部
                    </>
                  )}
                </button>

                {/* Reset Button */}
                {Object.keys(caseResults).length > 0 && (
                  <button
                    onClick={handleResetBenchmark}
                    disabled={isRunningSequential || runningCaseIds.size > 0}
                    className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    重置结果
                  </button>
                )}
              </div>
            </div>

            {/* Dynamic Summary Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-zinc-900/80 border border-zinc-800 p-3 rounded-xl flex flex-col justify-between">
                <span className="text-[11px] text-zinc-400">已完成评测</span>
                <span className="text-xl font-bold font-mono text-white mt-1">
                  {benchmarkSummary.totalExecuted} / {initialCases.length} 组
                </span>
                <span className="text-[10px] text-zinc-500 mt-1">
                  {benchmarkSummary.totalExecuted === 0 ? "点击卡片上的【运行】开始" : "真实测量中"}
                </span>
              </div>

              <div className="bg-blue-950/30 border border-blue-800/40 p-3 rounded-xl flex flex-col justify-between">
                <span className="text-[11px] text-blue-400 font-medium">Lexical 胜出</span>
                <span className="text-xl font-bold font-mono text-blue-300 mt-1">
                  {benchmarkSummary.lexicalWins} 胜
                </span>
                <span className="text-[10px] text-blue-400/70 mt-1">精确符号与错误码统治区</span>
              </div>

              <div className="bg-purple-950/30 border border-purple-800/40 p-3 rounded-xl flex flex-col justify-between">
                <span className="text-[11px] text-purple-400 font-medium">Semantic 胜出</span>
                <span className="text-xl font-bold font-mono text-purple-300 mt-1">
                  {benchmarkSummary.semanticWins} 胜
                </span>
                <span className="text-[10px] text-purple-400/70 mt-1">跨词汇鸿沟与意图对齐</span>
              </div>

              <div className="bg-amber-950/30 border border-amber-800/40 p-3 rounded-xl flex flex-col justify-between">
                <span className="text-[11px] text-amber-400 font-medium">平局 / 混合诉求</span>
                <span className="text-xl font-bold font-mono text-amber-300 mt-1">
                  {benchmarkSummary.ties} 组
                </span>
                <span className="text-[10px] text-amber-400/70 mt-1">单一通道残缺，需混合融合</span>
              </div>
            </div>

            {/* Individual Case Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {initialCases.map((c, idx) => {
                const result = caseResults[c.id];
                const isRunningThis = runningCaseIds.has(c.id);
                const isWinnerLex = result?.actualWinner === "lexical";
                const isWinnerSem = result?.actualWinner === "semantic";

                return (
                  <div
                    key={c.id}
                    className={`bg-zinc-900/60 border rounded-xl p-4 flex flex-col justify-between space-y-3 transition-all ${
                      isRunningThis
                        ? "border-rose-500/80 ring-1 ring-rose-500/40 shadow-lg shadow-rose-950/30"
                        : result
                        ? isWinnerLex
                          ? "border-blue-800/60"
                          : isWinnerSem
                          ? "border-purple-800/60"
                          : "border-amber-800/60"
                        : "border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    {/* Header */}
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono text-zinc-500">
                          CASE {String(idx + 1).padStart(2, "0")} · {c.category}
                        </span>
                        {/* Winner / Status Badge */}
                        {isRunningThis ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950 text-rose-300 border border-rose-800 animate-pulse flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            正在现场对决...
                          </span>
                        ) : result ? (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${
                              isWinnerLex
                                ? "bg-blue-900/50 text-blue-300 border-blue-600/50"
                                : isWinnerSem
                                ? "bg-purple-900/50 text-purple-300 border-purple-600/50"
                                : "bg-amber-900/50 text-amber-300 border-amber-600/50"
                            }`}
                          >
                            {isWinnerLex ? "🏆 词法 Grep 胜出" : isWinnerSem ? "🏆 向量语义 胜出" : "🤝 平局 / 混合互补"}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-950 text-zinc-500 border border-zinc-800">
                            待测试
                          </span>
                        )}
                      </div>

                      <div className="flex items-start justify-between gap-3 mt-1.5">
                        <h3 className="text-sm font-bold text-zinc-100">{c.title}</h3>
                        {/* Single Case Run Button */}
                        <button
                          onClick={() => handleRunSingleCase(c.id)}
                          disabled={isRunningThis || isRunningSequential}
                          className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 text-xs font-medium rounded flex items-center gap-1 shrink-0 transition-colors"
                        >
                          {isRunningThis ? (
                            <RefreshCw className="w-3 h-3 animate-spin text-rose-400" />
                          ) : (
                            <Play className="w-3 h-3 text-rose-400" />
                          )}
                          {result ? "重新对决" : "运行对决"}
                        </button>
                      </div>

                      {/* Query Quote Box */}
                      <div className="mt-2 p-2 rounded bg-zinc-950 border border-zinc-800/80 font-mono text-xs text-zinc-300">
                        “{c.query}”
                      </div>
                    </div>

                    {/* Content Section: If executed, show real live metrics; if not, show expected preview */}
                    {result ? (
                      <div className="space-y-2.5">
                        {/* Live Side-by-side Metrics */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {/* Lexical Box */}
                          <div
                            className={`p-2.5 rounded-lg border ${
                              isWinnerLex
                                ? "bg-blue-950/30 border-blue-600/50 ring-1 ring-blue-500/30"
                                : "bg-zinc-950/40 border-zinc-800/80 text-zinc-400"
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px] font-medium mb-1">
                              <span className="text-blue-400 flex items-center gap-1">
                                <Search className="w-3 h-3" />
                                词法 Grep
                              </span>
                              <span className="font-mono">{result.lexical.latencyMs}ms</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span>目标文档位次：</span>
                              <span
                                className={`font-mono font-bold ${
                                  result.lexical.targetRank === 1
                                    ? "text-emerald-400"
                                    : result.lexical.targetRank === null
                                    ? "text-rose-400"
                                    : "text-amber-400"
                                }`}
                              >
                                {result.lexical.targetRank !== null ? `Rank #${result.lexical.targetRank}` : "未命中 (0 条)"}
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-400 truncate mt-1">
                              Top: {result.lexical.topMatchDoc || "无"}
                            </div>
                          </div>

                          {/* Semantic Box */}
                          <div
                            className={`p-2.5 rounded-lg border ${
                              isWinnerSem
                                ? "bg-purple-950/30 border-purple-600/50 ring-1 ring-purple-500/30"
                                : "bg-zinc-950/40 border-zinc-800/80 text-zinc-400"
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px] font-medium mb-1">
                              <span className="text-purple-400 flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                语义 Vector
                              </span>
                              <span className="font-mono">{result.semantic.latencyMs}ms</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span>目标文档位次：</span>
                              <span
                                className={`font-mono font-bold ${
                                  result.semantic.targetRank === 1
                                    ? "text-emerald-400"
                                    : result.semantic.targetRank === null
                                    ? "text-rose-400"
                                    : "text-amber-400"
                                }`}
                              >
                                {result.semantic.targetRank !== null ? `Rank #${result.semantic.targetRank}` : "未召回"}
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-400 truncate mt-1">
                              Cosine: {result.semantic.similarity > 0 ? result.semantic.similarity.toFixed(3) : "0.000"} (
                              {result.semantic.topMatchDoc?.slice(0, 10) || "无"}...)
                            </div>
                          </div>
                        </div>

                        {/* Tokenizer Fragmentation Diagnosis */}
                        <div className="bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/70 text-[11px] space-y-1">
                          <div className="flex items-center justify-between text-zinc-400">
                            <span className="flex items-center gap-1">
                              <Binary className="w-3 h-3 text-zinc-500" />
                              分词切分透视：
                            </span>
                            <span
                              className={`font-mono text-[10px] px-1.5 rounded ${
                                result.tokenDiagnosis.dilutionSeverity === "severe"
                                  ? "bg-rose-950 text-rose-300 border border-rose-800"
                                  : result.tokenDiagnosis.dilutionSeverity === "medium"
                                  ? "bg-amber-950 text-amber-300 border border-amber-800"
                                  : "bg-emerald-950 text-emerald-300 border border-emerald-800"
                              }`}
                            >
                              {result.tokenDiagnosis.dilutionSeverity === "severe"
                                ? "严重稀释"
                                : result.tokenDiagnosis.dilutionSeverity === "medium"
                                ? "中度稀释"
                                : "结构良好"}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {result.tokenDiagnosis.tokens.slice(0, 8).map((tk, tIdx) => (
                              <span
                                key={tIdx}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                                  tk.isRareIdentifier
                                    ? "bg-rose-950/80 text-rose-300 border-rose-700/60"
                                    : "bg-zinc-900 text-zinc-400 border-zinc-800"
                                }`}
                              >
                                {tk.token}
                              </span>
                            ))}
                            {result.tokenDiagnosis.tokens.length > 8 && (
                              <span className="text-[10px] text-zinc-600 font-mono self-center">
                                +{result.tokenDiagnosis.tokens.length - 8}块
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Optional Dual LLM Answer Comparison */}
                        {(result.lexical.answer || result.semantic.answer) && (
                          <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 space-y-2 text-xs">
                            <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
                              <Zap className="w-3 h-3 text-amber-400" />
                              真实大模型应答比对 (Dual LLM Answer)：
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                              <div className="p-2 rounded bg-zinc-900 border border-blue-900/40 space-y-1">
                                <span className="font-semibold text-blue-300 block">词法 Context 回答：</span>
                                <p className="text-zinc-300 leading-relaxed max-h-28 overflow-y-auto">
                                  {result.lexical.answer || "未匹配任何参考文档"}
                                </p>
                              </div>
                              <div className="p-2 rounded bg-zinc-900 border border-purple-900/40 space-y-1">
                                <span className="font-semibold text-purple-300 block">语义 Context 回答：</span>
                                <p className="text-zinc-300 leading-relaxed max-h-28 overflow-y-auto">
                                  {result.semantic.answer || "未匹配任何有效文档"}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Failure / Takeaway Explanation */}
                        <div className="text-[11px] text-zinc-400 bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-800/40 leading-relaxed">
                          <span className="font-semibold text-zinc-300">现场复盘：</span>
                          {result.keyTakeaway}
                        </div>
                      </div>
                    ) : (
                      /* Idle Preview State */
                      <div className="bg-zinc-950/40 border border-dashed border-zinc-800/80 rounded-lg p-4 space-y-2 text-center">
                        <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 font-mono">
                          <span>目标文档: {c.targetDocTitle}</span>
                        </div>
                        <p className="text-xs text-zinc-400">
                          预期胜出方：
                          <span className={`font-semibold ml-1 ${
                            c.expectedWinner === "lexical" ? "text-blue-400" : c.expectedWinner === "semantic" ? "text-purple-400" : "text-amber-400"
                          }`}>
                            {c.expectedWinner === "lexical" ? "词法 Grep" : c.expectedWinner === "semantic" ? "语义 Vector" : "平局 / 混合诉求"}
                          </span>
                        </p>
                        <div className="pt-1">
                          <button
                            onClick={() => handleRunSingleCase(c.id)}
                            disabled={isRunningSequential}
                            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 rounded flex items-center gap-1.5 mx-auto transition-colors"
                          >
                            <Play className="w-3 h-3 text-rose-400" />
                            运行此用例真实对决
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: 交互式失真实验室 (DEGRADATION LAB & DUAL LLM) */}
        {/* ========================================================================= */}
        {activeTab === "lab" && (
          <div className="space-y-6">
            {/* Input & Quick Selectors */}
            <div className="bg-zinc-900/70 border border-zinc-800 p-5 rounded-xl space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 mb-1.5">
                  <Terminal className="w-4 h-4 text-rose-400" />
                  输入任意待检索语句（测试精确符号、错误码或自然口语）：
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={queryInput}
                    onChange={(e) => setQueryInput(e.target.value)}
                    placeholder="输入查询，例如：遇到错误码 ERR_ALPHA_AUTH_9021 应该如何处理？"
                    className="flex-1 bg-zinc-950 border border-zinc-700/80 focus:border-rose-500 rounded-lg px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 font-mono outline-none transition-colors"
                  />
                  <button
                    onClick={() => handleRunLab(false)}
                    disabled={isSearching}
                    className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-semibold text-zinc-200 rounded-lg flex items-center gap-1.5 transition-colors shrink-0"
                  >
                    {isSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    仅对比检索
                  </button>
                  <button
                    onClick={() => handleRunLab(true)}
                    disabled={isSearching || !isKeyAvailable}
                    className="px-4 py-2.5 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 disabled:opacity-40 text-xs font-semibold text-white rounded-lg shadow flex items-center gap-1.5 transition-all shrink-0"
                    title={!isKeyAvailable ? "需要配置 API Key 才能调用大模型生成应答" : ""}
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-300" />
                    检索 + 驱动双轨 LLM 应答
                  </button>
                </div>
              </div>

              {/* Preset Query Chips */}
              <div>
                <span className="text-[11px] text-zinc-400 block mb-2">快速载入典型测试用例：</span>
                <div className="flex flex-wrap gap-2">
                  {PRESET_QUERIES.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setQueryInput(p.text);
                      }}
                      className="text-left px-2.5 py-1 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 flex items-center gap-1.5 transition-colors"
                    >
                      <span className={`px-1 rounded text-[9px] font-mono border ${p.tagColor}`}>
                        {p.tag}
                      </span>
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Tokenizer Fragmentation Chips */}
              <div className="pt-2 border-t border-zinc-800">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-zinc-400 flex items-center gap-1.5 font-medium">
                    <Binary className="w-3.5 h-3.5 text-rose-400" />
                    实时 BPE / WordPiece 分词碎片化透视：
                  </span>
                  <span
                    className={`font-mono text-[11px] ${
                      localTokenReport.dilutionSeverity === "severe"
                        ? "text-rose-400"
                        : localTokenReport.dilutionSeverity === "medium"
                        ? "text-amber-400"
                        : "text-emerald-400"
                    }`}
                  >
                    切分为 {localTokenReport.fragmentCount} 个 Token 片段 ({localTokenReport.dilutionSeverity})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {localTokenReport.tokens.map((tk, idx) => (
                    <div
                      key={idx}
                      className={`px-2 py-1 rounded text-xs font-mono border flex items-center gap-1 ${
                        tk.isRareIdentifier
                          ? "bg-rose-950/60 border-rose-700/60 text-rose-200"
                          : tk.type === "digits"
                          ? "bg-amber-950/60 border-amber-700/60 text-amber-200"
                          : tk.type === "separator"
                          ? "bg-zinc-900 border-zinc-700 text-zinc-500"
                          : "bg-zinc-900/90 border-zinc-800 text-zinc-300"
                      }`}
                    >
                      <span>{tk.token}</span>
                      <span className="text-[9px] text-zinc-500 font-sans uppercase">[{tk.type}]</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed">
                  {localTokenReport.explanation}
                </p>
              </div>
            </div>

            {/* Side-by-Side Live Search & LLM Output */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* LEFT: Lexical Grep Channel */}
              <div className="bg-zinc-900/60 border border-blue-900/40 rounded-xl p-4 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded bg-blue-950 text-blue-400 border border-blue-800/60">
                        <Search className="w-4 h-4" />
                      </span>
                      <div>
                        <h3 className="text-xs font-bold text-blue-300">词法检索渠道 (Lexical Grep)</h3>
                        <span className="text-[10px] text-zinc-500">离散符号匹配 · 字符零容忍</span>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-blue-400">
                      {labResult?.lexical.latencyMs ?? 1} ms
                    </span>
                  </div>

                  {/* Hits Preview */}
                  <div className="mt-3 space-y-2">
                    <span className="text-[11px] text-zinc-400">召回结果列表：</span>
                    {(labResult?.lexical.allHits || localLexicalHits.slice(0, 3)).length === 0 ? (
                      <div className="p-3 rounded bg-zinc-950 border border-dashed border-zinc-800 text-xs text-zinc-500 text-center">
                        ❌ 词法字符未匹配到任何文档（词汇鸿沟/缺少该字符）
                      </div>
                    ) : (
                      (labResult?.lexical.allHits || localLexicalHits.slice(0, 3)).map((hit: any, hIdx: number) => (
                        <div
                          key={hIdx}
                          className="p-2.5 rounded bg-zinc-950 border border-zinc-800 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-zinc-200">
                              #{hIdx + 1} {hit.title || hit.doc?.title}
                            </span>
                            <span className="font-mono text-[10px] text-blue-400">
                              Score: {hit.score}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400 line-clamp-2 font-mono">
                            {hit.snippet || hit.matchSnippet}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* LLM Answer (Lexical Branch) */}
                <div className="border-t border-zinc-800 pt-3">
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <span className="text-zinc-400 font-semibold flex items-center gap-1">
                      <Zap className="w-3 h-3 text-blue-400" />
                      LLM 基于词法上下文生成回答：
                    </span>
                    {labResult?.lexical.tokens ? (
                      <span className="font-mono text-zinc-500">
                        {labResult.lexical.tokens} tk · {labResult.lexical.llmLatencyMs}ms
                      </span>
                    ) : null}
                  </div>
                  {labResult?.lexical.answer ? (
                    <div className="p-3 rounded-lg bg-zinc-950 border border-blue-900/40 text-xs text-zinc-200 leading-relaxed max-h-48 overflow-y-auto">
                      {labResult.lexical.answer}
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-zinc-950/40 border border-zinc-800/60 text-xs text-zinc-600 italic">
                      点击“检索 + 驱动双轨 LLM 应答”执行对比...
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: Semantic Vector Channel */}
              <div className="bg-zinc-900/60 border border-purple-900/40 rounded-xl p-4 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded bg-purple-950 text-purple-400 border border-purple-800/60">
                        <Sparkles className="w-4 h-4" />
                      </span>
                      <div>
                        <h3 className="text-xs font-bold text-purple-300">语义检索渠道 (Semantic Vector)</h3>
                        <span className="text-[10px] text-zinc-500">连续几何余弦 · 模糊概念泛化</span>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-purple-400">
                      {labResult?.semantic.latencyMs ?? 3} ms
                    </span>
                  </div>

                  {/* Hits Preview */}
                  <div className="mt-3 space-y-2">
                    <span className="text-[11px] text-zinc-400">召回结果列表：</span>
                    {(labResult?.semantic.allHits || localSemanticHits.slice(0, 3)).length === 0 ? (
                      <div className="p-3 rounded bg-zinc-950 border border-dashed border-zinc-800 text-xs text-zinc-500 text-center">
                        未召回有效文档
                      </div>
                    ) : (
                      (labResult?.semantic.allHits || localSemanticHits.slice(0, 3)).map((hit: any, hIdx: number) => (
                        <div
                          key={hIdx}
                          className="p-2.5 rounded bg-zinc-950 border border-zinc-800 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-zinc-200">
                              #{hIdx + 1} {hit.title || hit.doc?.title}
                            </span>
                            <span className="font-mono text-[10px] text-purple-400">
                              Cosine: {(hit.similarity || 0).toFixed(4)}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400 line-clamp-2 font-mono">
                            {hit.snippet || hit.previewSnippet}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* LLM Answer (Semantic Branch) */}
                <div className="border-t border-zinc-800 pt-3">
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <span className="text-zinc-400 font-semibold flex items-center gap-1">
                      <Zap className="w-3 h-3 text-purple-400" />
                      LLM 基于语义上下文生成回答：
                    </span>
                    {labResult?.semantic.tokens ? (
                      <span className="font-mono text-zinc-500">
                        {labResult.semantic.tokens} tk · {labResult.semantic.llmLatencyMs}ms
                      </span>
                    ) : null}
                  </div>
                  {labResult?.semantic.answer ? (
                    <div className="p-3 rounded-lg bg-zinc-950 border border-purple-900/40 text-xs text-zinc-200 leading-relaxed max-h-48 overflow-y-auto">
                      {labResult.semantic.answer}
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-zinc-950/40 border border-zinc-800/60 text-xs text-zinc-600 italic">
                      点击“检索 + 驱动双轨 LLM 应答”执行对比...
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: 机理剖析 (PRINCIPLES & VECTOR TRAP) */}
        {/* ========================================================================= */}
        {activeTab === "intuition" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-zinc-900/70 border border-zinc-800 p-5 rounded-xl space-y-3">
                <div className="w-8 h-8 rounded-lg bg-rose-950/80 border border-rose-800 flex items-center justify-center text-rose-400">
                  <Binary className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-zinc-200">1. Subword 分词撕裂</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  BPE/WordPiece 的有限词表（通常 32k~100k）不可能收录未知的错误码或类名。
                  <code>ERR_ALPHA_AUTH_9021</code> 被撕碎成 8 个 Subword，数字指纹 <code>9021</code> 的唯一性荡然无存。
                </p>
              </div>

              <div className="bg-zinc-900/70 border border-zinc-800 p-5 rounded-xl space-y-3">
                <div className="w-8 h-8 rounded-lg bg-amber-950/80 border border-amber-800 flex items-center justify-center text-amber-400">
                  <Layers className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-zinc-200">2. Mean-Pooling 几何稀释</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  百个 Token 经均值池化压缩为固定 1536 维稠密向量。
                  “平台、数据、服务、规范”等大量高频背景词吃满了向量模长与方向，精确符号残差不足 5%，信噪比暴跌。
                </p>
              </div>

              <div className="bg-zinc-900/70 border border-zinc-800 p-5 rounded-xl space-y-3">
                <div className="w-8 h-8 rounded-lg bg-purple-950/80 border border-purple-800 flex items-center justify-center text-purple-400">
                  <Flame className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-zinc-200">3. Hubness 通用词伪引力</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  通篇大谈“系统通用错误排查流程”的中心化文档，因聚集了“错误、排查、处理”等通用副词，在高维空间中反而比含有真错误码的配置文档更靠近查询向量！
                </p>
              </div>
            </div>

            {/* Comparison Table */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-zinc-800">
                <h3 className="text-xs font-semibold text-zinc-200">
                  离散符号系统 (Lexical) vs 连续几何空间 (Semantic) 物理特性全景对决
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-950/60 text-zinc-400 font-mono text-[11px] border-b border-zinc-800">
                    <tr>
                      <th className="p-3">特性维度</th>
                      <th className="p-3 text-blue-400">词法检索 (Lexical Grep / BM25)</th>
                      <th className="p-3 text-purple-400">语义向量检索 (Dense Embedding)</th>
                      <th className="p-3 text-zinc-300">工业 Agent 架构裁决</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    <tr>
                      <td className="p-3 font-semibold text-zinc-200">底层数学宇宙</td>
                      <td className="p-3 font-mono text-blue-300">离散符号集合 (Discrete String Sets)</td>
                      <td className="p-3 font-mono text-purple-300">连续几何流形 (Continuous Manifold $\mathbb{"{"}R{"}"}^d$)</td>
                      <td className="p-3 text-zinc-400">两者在数学本质上正交</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-zinc-200">精确错误码/函数名</td>
                      <td className="p-3 text-emerald-400 font-medium">✅ 100% 绝对置顶 (0 假阳性)</td>
                      <td className="p-3 text-rose-400 font-medium">❌ 严重钝化与漂移 (Subword 撕裂)</td>
                      <td className="p-3 text-zinc-400">代码/日志搜索必须保留 Lexical</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-zinc-200">口语化同义反悔</td>
                      <td className="p-3 text-rose-400 font-medium">❌ 0 条命中 (词汇鸿沟死穴)</td>
                      <td className="p-3 text-emerald-400 font-medium">✅ 完美捕获 (同向几何夹角)</td>
                      <td className="p-3 text-zinc-400">用户意图理解必须依赖 Semantic</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-zinc-200">计算延迟与开销</td>
                      <td className="p-3 text-zinc-300 font-mono">&lt; 3ms (纯 CPU 字符串扫描)</td>
                      <td className="p-3 text-zinc-300 font-mono">10 ~ 150ms (需 Embedding 模型推演)</td>
                      <td className="p-3 text-zinc-400">Lexical 可作为低成本第一道漏斗</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-zinc-200">首要优化指标</td>
                      <td className="p-3 text-blue-300">Precision (查准率：别给我不相关的)</td>
                      <td className="p-3 text-purple-300">Recall (查全率：别漏掉概念相关的)</td>
                      <td className="p-3 text-zinc-400">不可相互替代，只有融合双赢</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: 架构法则与第 6 课预告 (TAKEAWAYS & NEXT STEP) */}
        {/* ========================================================================= */}
        {activeTab === "takeaways" && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-rose-950/40 via-zinc-900 to-zinc-950 border border-rose-800/40 p-6 rounded-xl space-y-4">
              <h2 className="text-base font-bold text-rose-300 flex items-center gap-2">
                <Code2 className="w-5 h-5 text-rose-400" />
                检索工程第一法则：Semantic ≠ Better Search
              </h2>
              <div className="text-xs text-zinc-300 leading-relaxed space-y-3">
                <p>
                  回顾 Context Engineering 的前 5 课演化路径：
                </p>
                <div className="font-mono text-[11px] bg-zinc-950 p-3 rounded-lg border border-zinc-800 text-zinc-400 space-y-1">
                  <div>C0 (基准) ➔ 模型私有知识空白</div>
                  <div>C1 (Context) ➔ 临时推理输入构建</div>
                  <div>C2 (Sufficient) ➔ 破除塞爆 Context Window，追求精简有效</div>
                  <div>C3 (Lexical) ➔ Grep / 倒排检索解决万级数据查找</div>
                  <div>C4 (Semantic) ➔ 高维向量空间解决同义词汇鸿沟</div>
                  <div className="text-rose-400 font-bold">C5 (Boundary) ➔ 破除向量万能论，确立精确符号与模糊意图的物理边界！</div>
                </div>
                <p>
                  不要试图在向量检索中强行塞入代码符号，也不要期望词法检索能听懂用户的口语隐喻。
                  <strong>成熟的 AI Coding Agent（如 Claude Code）底层的检索体系从来不是单轨的。</strong>
                </p>
              </div>
            </div>

            {/* Next Lesson Cliffhanger */}
            <div className="bg-zinc-900/80 border border-indigo-900/50 p-6 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-indigo-950 text-indigo-300 border border-indigo-700/60">
                  NEXT LESSON · 第 06 课预告
                </span>
                <span className="text-xs font-mono text-zinc-500">双轨合并的数学困境</span>
              </div>
              <h3 className="text-sm md:text-base font-bold text-white">
                两个搜索各有所长，为什么不能一起用？—— Hybrid Retrieval 与 RRF 排名倒数融合
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                既然词法擅长精确代码，语义擅长自然语言意图，为什么我们不将两路结果合并？
                当你真正写下 <code>hybridSearch()</code> 时，你会发现：
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                <div className="bg-zinc-950 p-3 rounded border border-blue-900/40 text-blue-300">
                  词法 BM25 得分：14.82 (无界正数 $[0, +\infty)$)
                </div>
                <div className="bg-zinc-950 p-3 rounded border border-purple-900/40 text-purple-300">
                  语义 Cosine 得分：0.82 (有界浮点 $[-1.0, 1.0]$)
                </div>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                两种完全不同量纲和概率分布的得分，<strong>绝对不能粗暴相加！</strong>
                下一课我们将手写 <strong>RRF（Reciprocal Rank Fusion 倒数排名融合算法）</strong>，完成检索体系的双轨并合！
              </p>
              <div className="pt-2">
                <Link
                  to="/lessons/context-c6-hybrid-retrieval"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-bold text-xs transition-colors shadow-md shadow-cyan-950/50"
                >
                  <span>立即开启第 06 课：双轨融合实战</span>
                  <span className="font-mono">→</span>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

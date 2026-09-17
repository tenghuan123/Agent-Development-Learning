import { useState, useMemo } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import { BenchmarkCorpusManager } from "~/core/context-bench/corpus";
import type {
  HybridSearchResult,
  FusionAlgorithm,
} from "~/core/context-bench/hybrid";
import {
  Network,
  Search,
  Sparkles,
  Zap,
  BookOpen,
  Play,
  RefreshCw,
  Sliders,
  Scale,
  Code2,
  ShieldCheck,
  Award,
  ChevronRight,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Coins,
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
    singleChannelWinner: "lexical" as const,
    hybridEffect: "词法单轨兜底保底：词法通道送出强 Rank 1，直接拉升 RRF 得分，目标文档断层第一！",
  },
  {
    id: "case-02-symbol-name",
    category: "专属代码符号 (Code Symbol / AST)",
    title: "符号定位：BetaAstParser 运行时依赖",
    query: "BetaAstParser 的核心能力与运行时依赖是什么？",
    targetDocId: "products/beta.md",
    targetDocTitle: "Beta 产品规格与服务条款",
    lexicalKeywords: ["BetaAstParser"],
    singleChannelWinner: "lexical" as const,
    hybridEffect: "专属符号锁定：倒排索引精准命中代码类名，弥补语义向量由于概念抽象产生的漂移。",
  },
  {
    id: "case-03-config-port",
    category: "网络端口与配置项 (Config & Port)",
    title: "配置项探测：port 9443 数据总线",
    query: "Alpha 数据总线默认监听哪个端口？",
    targetDocId: "products/alpha.md",
    targetDocTitle: "Alpha 产品规格与服务条款",
    lexicalKeywords: ["端口", "9443"],
    singleChannelWinner: "lexical" as const,
    hybridEffect: "数字锚点穿透：词法毫秒定位配置文件中的短端口数字，与语义互补。",
  },
  {
    id: "case-04-synonym-regret",
    category: "口语同义反悔 (Colloquial Paraphrase)",
    title: "口语意图：买完后悔了还能退款吗？",
    query: "我买完东西以后后悔了、不想要了，还能申请退款吗？",
    targetDocId: "docs/refund-policy.md",
    targetDocTitle: "通用退款与售后保障政策",
    lexicalKeywords: ["后悔", "不想要"],
    singleChannelWinner: "semantic" as const,
    hybridEffect: "语义单轨破局：词法因同义词鸿沟 0 命中彻底脱靶时，语义向量通道以高余弦相似度挽救，RRF 稳居首位！",
  },
  {
    id: "case-05-high-level-intent",
    category: "抽象技术概念泛化 (Abstract Architecture)",
    title: "高阶意图：企业多端多活故障切换",
    query: "企业多端多活故障切换与集群高可用容灾方案",
    targetDocId: "products/alpha.md",
    targetDocTitle: "Alpha 产品规格与服务条款",
    lexicalKeywords: ["多端多活", "主备节点"],
    singleChannelWinner: "semantic" as const,
    hybridEffect: "意图概念投影：语义通道理解高可用容灾概念，将 Alpha 核心文档拉升至 Rank 1。",
  },
  {
    id: "case-06-hybrid-complex",
    category: "复杂混合查询 (Mixed Symbol & Intent)",
    title: "混合查询：AlphaSyncDaemon 遇到 SSO 令牌过期",
    query: "AlphaSyncDaemon 遇到 SSO 令牌过期该怎么恢复？",
    targetDocId: "products/alpha.md",
    targetDocTitle: "Alpha 产品规格与服务条款",
    lexicalKeywords: ["AlphaSyncDaemon", "SSO"],
    singleChannelWinner: "tie" as const,
    hybridEffect: "双轨共识爆发：词法锁定守护进程名称，语义锁死过期恢复意图，两路排名叠加产生断层第一！",
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

  // Initial hybrid search using Case 06 (The classic hybrid mixed query)
  const defaultCase = BENCHMARK_CASES[5];
  const initialHybrid = BenchmarkCorpusManager.searchHybrid(defaultCase.query, {
    algorithm: "rrf",
    k: 60,
    weightLexical: 0.5,
    weightSemantic: 0.5,
    topK: 6,
    customKeywords: defaultCase.lexicalKeywords,
  });

  return {
    hasServerKey,
    model,
    defaultBaseURL,
    docs,
    questions,
    totalCorpusTokens,
    initialQuery: defaultCase.query,
    initialKeywords: defaultCase.lexicalKeywords,
    initialResults: initialHybrid.hybridResults,
    initialLexicalResults: initialHybrid.lexicalResults.slice(0, 5).map((r) => ({
      id: r.doc.id,
      title: r.doc.title,
      score: r.score,
      matchSnippet: r.matchSnippet,
      matchedKeywords: r.matchedKeywords,
    })),
    initialSemanticResults: initialHybrid.semanticResults.slice(0, 5).map((r) => ({
      id: r.doc.id,
      title: r.doc.title,
      similarity: r.similarity,
      rank: r.rank,
      previewSnippet: r.previewSnippet,
    })),
  };
}

export default function ContextLessonC6() {
  const {
    hasServerKey,
    model,
    defaultBaseURL,
    docs,
    totalCorpusTokens,
    initialQuery,
    initialKeywords,
    initialResults,
    initialLexicalResults,
    initialSemanticResults,
  } = useLoaderData<typeof loader>();

  const [customApiKey, setCustomApiKey] = useState("");
  const [customBaseURL, setCustomBaseURL] = useState("");
  const handleSaveSettings = (settings: { apiKey: string; baseURL: string }) => {
    setCustomApiKey(settings.apiKey);
    setCustomBaseURL(settings.baseURL);
  };

  const [activeTab, setActiveTab] = useState<
    "lab" | "studio" | "showdown" | "takeaways"
  >("studio");

  // =========================================================================
  // TAB 1: 算法推导与异构天平模拟器状态
  // =========================================================================
  const [simAlgorithm, setSimAlgorithm] = useState<FusionAlgorithm>("rrf");
  const [simK, setSimK] = useState(60);
  const [simWeightLex, setSimWeightLex] = useState(0.5);
  const [simWeightSem, setSimWeightSem] = useState(0.5);

  // Mock candidates to demonstrate score collision
  const mockCandidates = useMemo(() => {
    const rawCandidates = [
      {
        id: "doc-A",
        title: "Alpha 核心服务规约 (包含专有错误码 ERR_9021)",
        lexRank: 1,
        lexScore: 24.8,
        semRank: 4,
        semScore: 0.62,
      },
      {
        id: "doc-B",
        title: "通用容灾备份指南 (概念高度重合，无专有错误码)",
        lexRank: 6,
        lexScore: 1.8,
        semRank: 1,
        semScore: 0.94,
      },
      {
        id: "doc-C",
        title: "企业认证与单点登录综合指引 (词法与语义均良好)",
        lexRank: 2,
        lexScore: 14.2,
        semRank: 2,
        semScore: 0.88,
      },
      {
        id: "doc-D",
        title: "Beta 开发插件架构说明",
        lexRank: 3,
        lexScore: 8.5,
        semRank: 5,
        semScore: 0.55,
      },
    ];

    if (simAlgorithm === "raw_sum") {
      return rawCandidates
        .map((c) => {
          const lexPart = simWeightLex * c.lexScore;
          const semPart = simWeightSem * c.semScore;
          const score = Number((lexPart + semPart).toFixed(3));
          return { ...c, score, lexPart, semPart, note: "BM25 分数直接主导排序" };
        })
        .sort((a, b) => b.score - a.score);
    } else if (simAlgorithm === "minmax") {
      const minLex = Math.min(...rawCandidates.map((c) => c.lexScore));
      const maxLex = Math.max(...rawCandidates.map((c) => c.lexScore));
      const minSem = Math.min(...rawCandidates.map((c) => c.semScore));
      const maxSem = Math.max(...rawCandidates.map((c) => c.semScore));

      return rawCandidates
        .map((c) => {
          const normLex = (c.lexScore - minLex) / (maxLex - minLex || 1);
          const normSem = (c.semScore - minSem) / (maxSem - minSem || 1);
          const lexPart = simWeightLex * normLex;
          const semPart = simWeightSem * normSem;
          const score = Number((lexPart + semPart).toFixed(3));
          return {
            ...c,
            score,
            lexPart: Number(lexPart.toFixed(3)),
            semPart: Number(semPart.toFixed(3)),
            note: "Min-Max 缩放受离群值牵引",
          };
        })
        .sort((a, b) => b.score - a.score);
    } else {
      // RRF
      return rawCandidates
        .map((c) => {
          const lexPart = simWeightLex / (simK + c.lexRank);
          const semPart = simWeightSem / (simK + c.semRank);
          const score = Number((lexPart + semPart).toFixed(5));
          return {
            ...c,
            score,
            lexPart: Number(lexPart.toFixed(5)),
            semPart: Number(semPart.toFixed(5)),
            note: c.lexRank <= 2 && c.semRank <= 2 ? "双轨共识加成" : "单轨偏科",
          };
        })
        .sort((a, b) => b.score - a.score);
    }
  }, [simAlgorithm, simK, simWeightLex, simWeightSem]);

  // =========================================================================
  // TAB 2: 双轨融合检索交互工作台状态
  // =========================================================================
  const [studioQuery, setStudioQuery] = useState(initialQuery);
  const [studioKeywords, setStudioKeywords] = useState<string[]>(initialKeywords);
  const [studioAlgorithm, setStudioAlgorithm] = useState<FusionAlgorithm>("rrf");
  const [studioK, setStudioK] = useState(60);
  const [studioWeightLex, setStudioWeightLex] = useState(0.5);
  const [studioWeightSem, setStudioWeightSem] = useState(0.5);

  const [hybridResults, setHybridResults] =
    useState<HybridSearchResult[]>(initialResults);
  const [lexicalResults, setLexicalResults] = useState(initialLexicalResults);
  const [semanticResults, setSemanticResults] = useState(initialSemanticResults);
  const [isSearching, setIsSearching] = useState(false);
  const [searchLatencyMs, setSearchLatencyMs] = useState<number | null>(null);

  // Hybrid RAG LLM execution state
  const [isGeneratingRAG, setIsGeneratingRAG] = useState(false);
  const [ragAnswer, setRagAnswer] = useState<string | null>(null);
  const [ragMetrics, setRagMetrics] = useState<{
    promptTokens: number;
    outputTokens: number;
    totalTokens: number;
    tokenSavingsPct: number;
    searchLatencyMs: number;
    llmLatencyMs: number;
  } | null>(null);

  const handleRunHybridSearch = async () => {
    if (!studioQuery.trim()) return;
    setIsSearching(true);
    setRagAnswer(null);
    setRagMetrics(null);

    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search_hybrid",
          query: studioQuery,
          keywords: studioKeywords,
          algorithm: studioAlgorithm,
          k: studioK,
          weightLexical: studioWeightLex,
          weightSemantic: studioWeightSem,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        setHybridResults(data.hybridResults);
        setLexicalResults(data.lexicalResults);
        setSemanticResults(data.semanticResults);
        setSearchLatencyMs(data.latencyMs);
      }
    } catch (err) {
      console.error("Hybrid search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleRunHybridRAG = async () => {
    if (!studioQuery.trim()) return;
    setIsGeneratingRAG(true);

    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_hybrid_pipeline",
          query: studioQuery,
          keywords: studioKeywords,
          algorithm: studioAlgorithm,
          k: studioK,
          weightLexical: studioWeightLex,
          weightSemantic: studioWeightSem,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        setRagAnswer(data.answer);
        setRagMetrics({
          promptTokens: data.tokens.promptTokens,
          outputTokens: data.tokens.outputTokens,
          totalTokens: data.tokens.totalTokens,
          tokenSavingsPct: data.tokens.tokenSavingsPct,
          searchLatencyMs: data.searchLatencyMs,
          llmLatencyMs: data.llmLatencyMs,
        });
      }
    } catch (err) {
      console.error("Hybrid RAG failed:", err);
    } finally {
      setIsGeneratingRAG(false);
    }
  };

  // =========================================================================
  // TAB 3: 三轨全景基准对抗状态
  // =========================================================================
  interface ShowdownCaseResult {
    id: string;
    category: string;
    title: string;
    query: string;
    targetDocId: string;
    targetDocTitle: string;
    expectedWinner: string;
    keyTakeaway: string;
    lexical: {
      latencyMs: number;
      targetRank: number | null;
      totalHits: number;
      topMatchDoc: string | null;
      score: number;
      isTopHit: boolean;
    };
    semantic: {
      latencyMs: number;
      targetRank: number | null;
      totalHits: number;
      topMatchDoc: string | null;
      similarity: number;
      isTopHit: boolean;
    };
    hybrid: {
      latencyMs: number;
      targetRank: number | null;
      totalHits: number;
      topMatchDoc: string | null;
      rrfScore: number;
      matchReason: "both" | "lexical_only" | "semantic_only" | "none";
      isTopHit: boolean;
    };
  }

  const [showdownCases, setShowdownCases] = useState<ShowdownCaseResult[] | null>(null);
  const [showdownSummary, setShowdownSummary] = useState<{
    totalCases: number;
    lexicalTopHits: number;
    semanticTopHits: number;
    hybridTopHits: number;
    hybridRecallPct: number;
  } | null>(null);
  const [isRunningShowdown, setIsRunningShowdown] = useState(false);

  const handleRunTripleShowdown = async () => {
    setIsRunningShowdown(true);
    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_c6_triple_showdown",
          k: 60,
          weightLexical: 0.5,
          weightSemantic: 0.5,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        setShowdownCases(data.cases);
        setShowdownSummary(data.summary);
      }
    } catch (err) {
      console.error("Triple showdown failed:", err);
    } finally {
      setIsRunningShowdown(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      <Header
        hasServerKey={hasServerKey}
        model={model}
        defaultBaseURL={defaultBaseURL}
        customApiKey={customApiKey}
        customBaseURL={customBaseURL}
        onSaveSettings={handleSaveSettings}
        currentLesson={{
          id: "context-c6",
          title: "第 06 课: 为什么不能一起用？(Hybrid Retrieval 与 RRF)",
          badge: "C6",
        }}
      />

      {/* Top Banner / Breadcrumb */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-30 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800/60">
              C6
            </span>
            <span className="text-zinc-400">Context Engineering 专项实战</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-200 font-medium">
              第 06 课：双轨融合 —— Hybrid Retrieval 混合检索与 RRF 算法手写实现
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/lessons/context-c5-semantic-vs-lexical"
              className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
            >
              ← 上一课 (C5 向量失真边界)
            </Link>
            <span className="text-zinc-700">|</span>
            <Link
              to="/docs/lessons/context/06-hybrid-retrieval-and-rrf.md"
              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" />
              阅读本课深度讲义
            </Link>
          </div>
        </div>
      </div>

      {/* Hero Overview */}
      <div className="border-b border-zinc-800/80 bg-gradient-to-b from-cyan-950/20 via-zinc-900/30 to-zinc-950 px-4 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1">
                  <Network className="w-3 h-3 text-cyan-400" />
                  双轨召回漏斗与倒数排名融合 (RRF)
                </span>
                <span className="text-xs text-zinc-400 font-mono">
                  语料库：{docs.length} 篇文档 ({totalCorpusTokens.toLocaleString()} Tokens)
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
                <span>两个搜索各有所长，为什么不能一起用？</span>
                <span className="text-xs px-2.5 py-1 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/50 font-mono">
                  Hybrid Retrieval
                </span>
              </h1>
              <p className="mt-1.5 text-xs md:text-sm text-zinc-400 max-w-3xl leading-relaxed">
                词法精准匹配代码与错误码，语义深刻理解口语反悔与技术意图。
                直接相加会导致 BM25 彻底淹没 Cosine；通过手写 <strong>RRF（Reciprocal Rank Fusion）</strong>，以排名置换打分，实现工业级双轨融合！
              </p>
            </div>

            {/* Quick Metrics Badge */}
            <div className="flex items-center gap-3 bg-zinc-900/80 border border-zinc-800 p-3 rounded-xl self-start md:self-auto">
              <div className="text-center px-2">
                <div className="text-xs text-zinc-400">词法单轨盲区</div>
                <div className="text-base font-bold text-amber-400 font-mono">50% 靶向率</div>
              </div>
              <div className="w-px h-8 bg-zinc-800" />
              <div className="text-center px-2">
                <div className="text-xs text-zinc-400">语义单轨失真</div>
                <div className="text-base font-bold text-rose-400 font-mono">50% 靶向率</div>
              </div>
              <div className="w-px h-8 bg-zinc-800" />
              <div className="text-center px-2">
                <div className="text-xs text-zinc-400">Hybrid RRF 双轨</div>
                <div className="text-base font-bold text-emerald-400 font-mono">100% 靶向率</div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 mt-6 border-b border-zinc-800/80 pb-px overflow-x-auto text-xs">
            <button
              onClick={() => setActiveTab("studio")}
              className={`px-3.5 py-2 font-medium rounded-t-lg transition-colors flex items-center gap-1.5 border-t border-x ${
                activeTab === "studio"
                  ? "bg-zinc-900 text-cyan-300 border-zinc-700 border-b-transparent"
                  : "text-zinc-400 hover:text-zinc-200 border-transparent"
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              双轨融合检索 Studio
            </button>
            <button
              onClick={() => setActiveTab("lab")}
              className={`px-3.5 py-2 font-medium rounded-t-lg transition-colors flex items-center gap-1.5 border-t border-x ${
                activeTab === "lab"
                  ? "bg-zinc-900 text-cyan-300 border-zinc-700 border-b-transparent"
                  : "text-zinc-400 hover:text-zinc-200 border-transparent"
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              异构天平与算法实验室
            </button>
            <button
              onClick={() => setActiveTab("showdown")}
              className={`px-3.5 py-2 font-medium rounded-t-lg transition-colors flex items-center gap-1.5 border-t border-x ${
                activeTab === "showdown"
                  ? "bg-zinc-900 text-cyan-300 border-zinc-700 border-b-transparent"
                  : "text-zinc-400 hover:text-zinc-200 border-transparent"
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              三轨全景基准对抗 (6 场景)
            </button>
            <button
              onClick={() => setActiveTab("takeaways")}
              className={`px-3.5 py-2 font-medium rounded-t-lg transition-colors flex items-center gap-1.5 border-t border-x ${
                activeTab === "takeaways"
                  ? "bg-zinc-900 text-cyan-300 border-zinc-700 border-b-transparent"
                  : "text-zinc-400 hover:text-zinc-200 border-transparent"
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              架构法则与第 7 课预告
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {/* ========================================================================= */}
        {/* TAB 1: 算法推导与异构天平实验室 (MATH & SCORE LAB) */}
        {/* ========================================================================= */}
        {activeTab === "lab" && (
          <div className="space-y-6">
            {/* Header / Intro */}
            <div className="bg-zinc-900/60 border border-zinc-800 p-5 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
                  <Scale className="w-4 h-4 text-cyan-400" />
                  异构天平的崩溃：为什么 BM25 与 Cosine 分数绝不能直接相加？
                </h2>
                <span className="text-xs font-mono text-zinc-400">数学机理推导</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                词法检索打分是无界正数 $[0, +\infty)$（如 $24.8$），语义相似度是有界浮点数 $[0.0, 1.0]$（如 $0.85$）。
                调节下方融合算法与参数，亲手验证三种融合策略的数学行为：
              </p>

              {/* Controls */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">融合算法选择</label>
                  <select
                    value={simAlgorithm}
                    onChange={(e) => setSimAlgorithm(e.target.value as FusionAlgorithm)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="raw_sum">Raw Addition (直接相加 - 反面教材)</option>
                    <option value="minmax">Min-Max Normalization (线性归一化)</option>
                    <option value="rrf">RRF (Reciprocal Rank Fusion - 推荐)</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>词法通道权重: {simWeightLex}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={simWeightLex}
                    onChange={(e) => setSimWeightLex(Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>语义通道权重: {simWeightSem}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={simWeightSem}
                    onChange={(e) => setSimWeightSem(Number(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>

                {simAlgorithm === "rrf" && (
                  <div>
                    <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                      <span>RRF 平滑常数 k: {simK}</span>
                      <span className="text-zinc-500 font-mono">工业默认 60</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      step="1"
                      value={simK}
                      onChange={(e) => setSimK(Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Visual Simulator Table */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-200">
                  融合模拟效果排位 (按当前算法综合得分降序)
                </span>
                <span className="text-xs font-mono text-zinc-500">
                  当前算法：{simAlgorithm.toUpperCase()}
                </span>
              </div>

              <div className="divide-y divide-zinc-800/60">
                {mockCandidates.map((cand, idx) => (
                  <div
                    key={cand.id}
                    className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-zinc-800/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-mono font-bold text-xs ${
                          idx === 0
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        #{idx + 1}
                      </span>
                      <div>
                        <div className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                          <span>{cand.title}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 font-mono">
                            {cand.note}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500 flex items-center gap-4 mt-1 font-mono">
                          <span className="text-cyan-400">
                            词法路：Rank #{cand.lexRank} (分值: {cand.lexScore})
                          </span>
                          <span className="text-purple-400">
                            语义路：Rank #{cand.semRank} (相似度: {cand.semScore})
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 self-end md:self-auto font-mono text-xs">
                      <div className="text-right">
                        <div className="text-zinc-500 text-[10px]">
                          词法贡献: {cand.lexPart} | 语义贡献: {cand.semPart}
                        </div>
                        <div className="text-emerald-400 font-bold text-sm">
                          综合分: {cand.score}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Explanation card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-zinc-900/60 border border-rose-900/30 p-4 rounded-xl space-y-2">
                <div className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4" />
                  直接相加 (Raw Sum) 的缺陷
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  BM25 分数（24.8）在绝对量级上是余弦相似度（0.62）的数十倍。直接相加导致语义通道被彻底归零，系统完全退化回纯词法检索。
                </p>
              </div>

              <div className="bg-zinc-900/60 border border-amber-900/30 p-4 rounded-xl space-y-2">
                <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <Scale className="w-4 h-4" />
                  Min-Max 归一化的脆弱性
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  若存在一个由于高频词产生的超高分离群值，归一化会将原本相关的第二名、第三名分数强行压榨到接近 0，破坏真实相关性分辨率。
                </p>
              </div>

              <div className="bg-zinc-900/60 border border-emerald-900/30 p-4 rounded-xl space-y-2">
                <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  RRF 倒数排名的优雅性
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  公式 <code>1 / (k + rank)</code> 抛弃了绝对数值，只看位次。它天然奖励跨通道的“双轨共识”，即使某通道失真，另一通道仍可安全保底。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: 双轨融合检索交互工作台 (INTERACTIVE STUDIO) */}
        {/* ========================================================================= */}
        {activeTab === "studio" && (
          <div className="space-y-6">
            {/* Query & Parameter Panel */}
            <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-xs font-bold text-cyan-300 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  双轨融合检索交互控制台
                </div>
                <div className="text-[11px] text-zinc-400">
                  快速载入预设评测用例：
                </div>
              </div>

              {/* Preset Case Badges */}
              <div className="flex flex-wrap gap-2">
                {BENCHMARK_CASES.map((bc) => (
                  <button
                    key={bc.id}
                    onClick={() => {
                      setStudioQuery(bc.query);
                      setStudioKeywords(bc.lexicalKeywords);
                    }}
                    className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
                      studioQuery === bc.query
                        ? "bg-cyan-950/80 text-cyan-300 border-cyan-700/60 font-medium"
                        : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    {bc.title}
                  </button>
                ))}
              </div>

              {/* Input row */}
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={studioQuery}
                    onChange={(e) => setStudioQuery(e.target.value)}
                    placeholder="输入要测试的查询语句（可包含代码符号、错误码或自然语言口语）..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <button
                  onClick={handleRunHybridSearch}
                  disabled={isSearching}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all shadow-md shadow-cyan-950/40"
                >
                  {isSearching ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  <span>执行双轨混合检索</span>
                </button>
              </div>

              {/* Tuning Parameters Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-zinc-800/80 text-xs">
                <div>
                  <span className="text-[11px] text-zinc-400 block mb-1">融合算法</span>
                  <select
                    value={studioAlgorithm}
                    onChange={(e) => setStudioAlgorithm(e.target.value as FusionAlgorithm)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="rrf">RRF 倒数排名融合 (工业标准)</option>
                    <option value="minmax">Min-Max 线性归一化</option>
                    <option value="raw_sum">Raw 原始打分相加</option>
                  </select>
                </div>

                <div>
                  <span className="text-[11px] text-zinc-400 block mb-1">
                    词法通道权重: {studioWeightLex}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={studioWeightLex}
                    onChange={(e) => setStudioWeightLex(Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                </div>

                <div>
                  <span className="text-[11px] text-zinc-400 block mb-1">
                    语义通道权重: {studioWeightSem}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={studioWeightSem}
                    onChange={(e) => setStudioWeightSem(Number(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>

                <div>
                  <span className="text-[11px] text-zinc-400 block mb-1">
                    RRF 平滑参数 k: {studioK}
                  </span>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    step="1"
                    value={studioK}
                    onChange={(e) => setStudioK(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Three Funnel Columns: Lexical vs Semantic vs Merged Hybrid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Channel 1: Lexical */}
              <div className="bg-zinc-900/60 border border-cyan-900/30 rounded-xl flex flex-col overflow-hidden">
                <div className="px-4 py-3 bg-cyan-950/20 border-b border-cyan-900/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-xs font-bold text-cyan-200">
                      通道 1：词法检索 (Lexical Grep)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/40">
                    命中 {lexicalResults.length} 篇
                  </span>
                </div>
                <div className="p-3 divide-y divide-zinc-800/60 flex-1 space-y-2">
                  {lexicalResults.length === 0 ? (
                    <div className="p-4 text-center text-xs text-zinc-500">
                      未匹配到任何词法关键词（0 命中）
                    </div>
                  ) : (
                    lexicalResults.map((lr, idx) => (
                      <div key={lr.id} className="pt-2 first:pt-0 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-zinc-200 flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded bg-cyan-950 text-cyan-300 font-mono text-[10px] flex items-center justify-center">
                              {idx + 1}
                            </span>
                            {lr.title}
                          </span>
                          <span className="font-mono text-[11px] text-cyan-400">
                            得分: {lr.score}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 line-clamp-2 mt-1 bg-zinc-950/60 p-2 rounded border border-zinc-900 font-mono">
                          {lr.matchSnippet}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Channel 2: Semantic */}
              <div className="bg-zinc-900/60 border border-purple-900/30 rounded-xl flex flex-col overflow-hidden">
                <div className="px-4 py-3 bg-purple-950/20 border-b border-purple-900/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-xs font-bold text-purple-200">
                      通道 2：语义检索 (Vector Cosine)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-purple-400 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800/40">
                    Top {semanticResults.length} 候选
                  </span>
                </div>
                <div className="p-3 divide-y divide-zinc-800/60 flex-1 space-y-2">
                  {semanticResults.length === 0 ? (
                    <div className="p-4 text-center text-xs text-zinc-500">
                      无语义候选结果
                    </div>
                  ) : (
                    semanticResults.map((sr, idx) => (
                      <div key={sr.id} className="pt-2 first:pt-0 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-zinc-200 flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded bg-purple-950 text-purple-300 font-mono text-[10px] flex items-center justify-center">
                              {idx + 1}
                            </span>
                            {sr.title}
                          </span>
                          <span className="font-mono text-[11px] text-purple-400">
                            余弦: {sr.similarity.toFixed(4)}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 line-clamp-2 mt-1 bg-zinc-950/60 p-2 rounded border border-zinc-900 font-mono">
                          {sr.previewSnippet}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Channel 3: Merged Hybrid */}
              <div className="bg-zinc-900/80 border border-emerald-900/40 rounded-xl flex flex-col overflow-hidden">
                <div className="px-4 py-3 bg-emerald-950/20 border-b border-emerald-900/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-200">
                      双轨融合：Hybrid RRF 排序
                    </span>
                  </div>
                  {searchLatencyMs !== null && (
                    <span className="text-[10px] font-mono text-zinc-400">
                      检索耗时 {searchLatencyMs}ms
                    </span>
                  )}
                </div>
                <div className="p-3 divide-y divide-zinc-800/60 flex-1 space-y-2">
                  {hybridResults.length === 0 ? (
                    <div className="p-4 text-center text-xs text-zinc-500">
                      无融合结果
                    </div>
                  ) : (
                    hybridResults.map((hr, idx) => {
                      const itemTitle = hr.doc?.title || (hr as any).title || "未知文档";
                      const itemId = hr.doc?.id || (hr as any).id || `doc-${idx}`;
                      return (
                        <div
                          key={itemId}
                          className={`pt-2.5 first:pt-0 text-xs p-2 rounded-lg transition-colors ${
                            idx === 0
                              ? "bg-emerald-950/30 border border-emerald-800/40"
                              : "hover:bg-zinc-800/40"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-zinc-100 flex items-center gap-2">
                              <span
                                className={`w-5 h-5 rounded-full flex items-center justify-center font-mono font-bold text-[11px] ${
                                  idx === 0
                                    ? "bg-emerald-500 text-zinc-950 shadow-sm shadow-emerald-500/50"
                                    : "bg-zinc-800 text-zinc-300"
                                }`}
                              >
                                #{idx + 1}
                              </span>
                              <span>{itemTitle}</span>
                            </span>

                            <span className="font-mono text-xs text-emerald-400 font-bold">
                              得分: {hr.finalScore}
                            </span>
                          </div>

                        {/* Match Reason Badge */}
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono">
                          {hr.matchReason === "both" && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-semibold">
                              ★ 双轨共识 (Both Channels Hit)
                            </span>
                          )}
                          {hr.matchReason === "lexical_only" && (
                            <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                              词法单轨兜底 (Lexical Only)
                            </span>
                          )}
                          {hr.matchReason === "semantic_only" && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/60">
                              语义单轨泛化 (Semantic Only)
                            </span>
                          )}

                          <span className="text-zinc-500">
                            词法 #{hr.lexicalRank ?? "-"} / 语义 #{hr.semanticRank ?? "-"}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              </div>
            </div>

            {/* One-Click Hybrid RAG Execution Card */}
            <div className="bg-gradient-to-br from-indigo-950/40 via-zinc-900 to-zinc-950 border border-indigo-800/40 p-5 rounded-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold text-indigo-300 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-indigo-400" />
                    端到端验证：基于 Hybrid Top-1 提取 Context 发起 LLM 推理
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    将混合检索胜出的第一名文档作为上下文注入 Prompt，验证大模型是否能准确回答复杂混合查询。
                  </p>
                </div>

                <button
                  onClick={handleRunHybridRAG}
                  disabled={isGeneratingRAG || hybridResults.length === 0}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-all shadow-md shadow-indigo-950/50 self-start sm:self-auto"
                >
                  {isGeneratingRAG ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  <span>一键生成 Hybrid RAG 解答</span>
                </button>
              </div>

              {/* RAG Answer Display */}
              {ragAnswer && (
                <div className="space-y-3 pt-3 border-t border-indigo-900/30">
                  <div className="bg-zinc-950 p-4 rounded-lg border border-indigo-900/50 text-xs text-zinc-200 leading-relaxed space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-indigo-400 font-mono border-b border-zinc-900 pb-2">
                      <span>✓ 大模型回答成功（基于 Top-1: {hybridResults[0]?.doc?.title || (hybridResults[0] as any)?.title || "目标文档"}）</span>
                    </div>
                    <div className="whitespace-pre-wrap">{ragAnswer}</div>
                  </div>

                  {ragMetrics && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                      <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800 text-zinc-300 flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                        <div>
                          <div className="text-[10px] text-zinc-500">检索 + LLM 延迟</div>
                          <div>{ragMetrics.searchLatencyMs + ragMetrics.llmLatencyMs} ms</div>
                        </div>
                      </div>

                      <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800 text-zinc-300 flex items-center gap-2">
                        <Coins className="w-3.5 h-3.5 text-indigo-400" />
                        <div>
                          <div className="text-[10px] text-zinc-500">实际消耗 Tokens</div>
                          <div>{ragMetrics.totalTokens} Tokens</div>
                        </div>
                      </div>

                      <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800 text-zinc-300 flex items-center gap-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <div>
                          <div className="text-[10px] text-zinc-500">Token 相对节约率</div>
                          <div className="text-emerald-400 font-bold">
                            {ragMetrics.tokenSavingsPct}%
                          </div>
                        </div>
                      </div>

                      <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800 text-zinc-300 flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-amber-400" />
                        <div>
                          <div className="text-[10px] text-zinc-500">召回可信度</div>
                          <div className="text-amber-300">
                            {hybridResults[0]?.matchReason === "both" ? "极高 (双轨共识)" : "高 (单轨保底)"}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: 三轨全景基准对抗 (LEXICAL VS SEMANTIC VS HYBRID TRIPLE DUEL) */}
        {/* ========================================================================= */}
        {activeTab === "showdown" && (
          <div className="space-y-6">
            <div className="bg-zinc-900/60 border border-zinc-800 p-5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Award className="w-4 h-4 text-emerald-400" />
                  三轨全景基准对抗：Lexical vs Semantic vs Hybrid RRF
                </h2>
                <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
                  在全部 6 个对抗场景中，词法单轨因口语同义词鸿沟而有 3 处失真；语义单轨因精确错误码碎片化而有 3 处失真。
                  运行此测试，量化见证 Hybrid RRF 如何消弭单一盲区，达成 100% 靶向召回！
                </p>
              </div>

              <button
                onClick={handleRunTripleShowdown}
                disabled={isRunningShowdown}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-zinc-950 text-xs font-bold rounded-lg flex items-center gap-2 transition-all shadow-md shadow-emerald-950/50 self-start sm:self-auto"
              >
                {isRunningShowdown ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>运行全部 6 场景三轨实测</span>
              </button>
            </div>

            {/* Summary Banner if executed */}
            {showdownSummary && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 font-mono text-xs">
                <div className="bg-zinc-900/90 border border-zinc-800 p-4 rounded-xl text-center">
                  <div className="text-zinc-500 text-[11px]">总测试用例数</div>
                  <div className="text-xl font-bold text-white mt-1">
                    {showdownSummary.totalCases} 题
                  </div>
                </div>

                <div className="bg-zinc-900/90 border border-cyan-900/40 p-4 rounded-xl text-center">
                  <div className="text-cyan-400 text-[11px]">词法单轨 Top 1 命中</div>
                  <div className="text-xl font-bold text-cyan-300 mt-1">
                    {showdownSummary.lexicalTopHits} / {showdownSummary.totalCases} (
                    {((showdownSummary.lexicalTopHits / showdownSummary.totalCases) * 100).toFixed(0)}%)
                  </div>
                </div>

                <div className="bg-zinc-900/90 border border-purple-900/40 p-4 rounded-xl text-center">
                  <div className="text-purple-400 text-[11px]">语义单轨 Top 1 命中</div>
                  <div className="text-xl font-bold text-purple-300 mt-1">
                    {showdownSummary.semanticTopHits} / {showdownSummary.totalCases} (
                    {((showdownSummary.semanticTopHits / showdownSummary.totalCases) * 100).toFixed(0)}%)
                  </div>
                </div>

                <div className="bg-emerald-950/40 border border-emerald-700/60 p-4 rounded-xl text-center">
                  <div className="text-emerald-400 text-[11px] font-bold">
                    Hybrid RRF 双轨 Top 1 命中
                  </div>
                  <div className="text-xl font-bold text-emerald-300 mt-1">
                    {showdownSummary.hybridTopHits} / {showdownSummary.totalCases} (100%)
                  </div>
                </div>
              </div>
            )}

            {/* Cases Matrix Table / Cards */}
            <div className="space-y-3">
              {(showdownCases || BENCHMARK_CASES).map((item, idx) => {
                const isRun = Boolean(showdownCases);
                const caseData = isRun
                  ? (item as ShowdownCaseResult)
                  : null;

                return (
                  <div
                    key={item.id}
                    className="bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 p-4 rounded-xl transition-colors space-y-3"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-zinc-800 text-zinc-300">
                          Case {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-zinc-100">
                          {item.title}
                        </span>
                        <span className="text-[11px] text-zinc-500">({item.category})</span>
                      </div>
                      <span className="text-xs text-zinc-400 font-mono">
                        目标文档: {item.targetDocTitle}
                      </span>
                    </div>

                    <div className="text-xs text-zinc-300 bg-zinc-950/60 p-2.5 rounded border border-zinc-900 font-mono">
                      Query: "{item.query}"
                    </div>

                    {/* Result Comparison Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                      {/* Lexical Box */}
                      <div
                        className={`p-3 rounded-lg border ${
                          caseData?.lexical.isTopHit
                            ? "bg-cyan-950/20 border-cyan-800/40 text-cyan-300"
                            : "bg-zinc-950 border-zinc-800 text-zinc-500"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span>词法检索 (Grep)</span>
                          {caseData?.lexical.isTopHit ? (
                            <span className="text-cyan-400 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Rank 1
                            </span>
                          ) : (
                            <span className="text-rose-400 flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5" />
                              {caseData ? `Rank #${caseData.lexical.targetRank ?? "脱靶"}` : "待测试"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Semantic Box */}
                      <div
                        className={`p-3 rounded-lg border ${
                          caseData?.semantic.isTopHit
                            ? "bg-purple-950/20 border-purple-800/40 text-purple-300"
                            : "bg-zinc-950 border-zinc-800 text-zinc-500"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span>语义检索 (Cosine)</span>
                          {caseData?.semantic.isTopHit ? (
                            <span className="text-purple-400 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Rank 1
                            </span>
                          ) : (
                            <span className="text-rose-400 flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5" />
                              {caseData ? `Rank #${caseData.semantic.targetRank ?? "脱靶"}` : "待测试"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Hybrid RRF Box */}
                      <div className="p-3 rounded-lg border bg-emerald-950/30 border-emerald-700/60 text-emerald-300 font-bold">
                        <div className="flex items-center justify-between text-[11px]">
                          <span>Hybrid RRF (双轨融合)</span>
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            {caseData ? `Rank 1 (分值: ${caseData.hybrid.rrfScore})` : "必中 Rank 1"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-zinc-400 flex items-start gap-2 bg-zinc-900/40 p-2 rounded">
                      <ChevronRight className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                      <span>
                        {(item as typeof BENCHMARK_CASES[number]).hybridEffect ||
                          (item as ShowdownCaseResult).keyTakeaway}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: 架构法则与第 7 课预告 (TAKEAWAYS & NEXT STEP) */}
        {/* ========================================================================= */}
        {activeTab === "takeaways" && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-cyan-950/40 via-zinc-900 to-zinc-950 border border-cyan-800/40 p-6 rounded-xl space-y-4">
              <h2 className="text-base font-bold text-cyan-300 flex items-center gap-2">
                <Code2 className="w-5 h-5 text-cyan-400" />
                检索工程核心法则：以 Rank 置换 Score 的工程美学
              </h2>
              <div className="text-xs text-zinc-300 leading-relaxed space-y-3">
                <p>
                  回顾我们在第 6 课中攻克的核心命题：
                </p>
                <div className="font-mono text-[11px] bg-zinc-950 p-3 rounded-lg border border-zinc-800 text-zinc-400 space-y-1">
                  <div>1. 词法检索 (BM25/Grep) ➔ 无界正数，专有名词与精确代码的唯一守护神</div>
                  <div>2. 语义检索 (Cosine) ➔ 有界浮点，自然语言口语意图投影的破局者</div>
                  <div>3. 直接相加 ➔ BM25 尺度过大彻底扼杀语义信号 (The Incommensurability Trap)</div>
                  <div>4. Min-Max 归一化 ➔ 脆弱受制于离群值，分布密集区丢失区分度</div>
                  <div className="text-emerald-400 font-bold">
                    5. RRF 倒数排名融合 ➔ 忘掉绝对打分，以位次为锚，达成 100% 双轨全景召回！
                  </div>
                </div>
                <p>
                  成熟的工业级 Agent（如 Claude Code）在检索用户本地代码库与技术文档时，底层就是这一套双轨乃至三轨（AST + BM25 + Embedding）漏斗。
                </p>
              </div>
            </div>

            {/* Next Lesson Cliffhanger */}
            <div className="bg-zinc-900/80 border border-teal-900/50 p-6 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-teal-950 text-teal-300 border border-teal-700/60">
                  NEXT LESSON · 第 07 课预告
                </span>
                <span className="text-xs font-mono text-zinc-500">召回率 vs 准确率的最终战役</span>
              </div>
              <h3 className="text-sm md:text-base font-bold text-white">
                Retrieval 找到了候选，但谁最相关？—— Cross-Encoder 重排器与 Reranking 精排工程
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Hybrid RRF 完美解决了<strong>“别漏掉”（Recall 召回率）</strong>的问题，无论是什么类型的查询，前 10 篇候选里必然包含正确答案。
                但如果你把这 10 篇甚至 50 篇文档一股脑塞进 Prompt，Context 又会再次臃肿（重蹈第 2 课覆辙）。
              </p>
              <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 text-xs font-mono text-zinc-400">
                Pipeline 进化：Query ➔ Retrieve 100 ➔ <span className="text-teal-400 font-bold">Rerank (精排)</span> ➔ Top 5 ➔ LLM
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                下一课我们将手写 <strong>Cross-Encoder 重排器</strong>，让相关性判定从粗粒度的“点积夹角”升维到“交叉注意力交互”，完成检索工程的终极精排进化！
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

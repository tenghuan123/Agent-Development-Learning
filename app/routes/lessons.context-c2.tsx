import { useState, useEffect, useMemo } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import { BenchmarkCorpusManager } from "~/core/context-bench/corpus";
import type { CorpusDocument, BenchmarkQuestion } from "~/core/context-bench/corpus";
import { assembleTierFromDocs, type ContextMetrics } from "~/core/context-bench/metrics";
import {
  ArrowRight,
  BookOpen,
  Play,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Coins,
  ExternalLink,
  Code2,
  RefreshCw,
  Gauge,
  HelpCircle,
  Scissors,
  TrendingUp,
  Sliders,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyEnd,
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

  return {
    hasServerKey,
    model,
    defaultBaseURL,
    docs,
    questions,
  };
}

interface TierResultData {
  tier: "A" | "B" | "C";
  answer: string;
  metrics: ContextMetrics;
  latencyMs: number;
  actualTokens: number;
  docsCount: number;
  position: string;
}

export default function ContextLesson2Page() {
  const {
    hasServerKey,
    model,
    defaultBaseURL,
    docs,
    questions,
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

  // Experiment Configuration
  const [question, setQuestion] = useState("Alpha 产品的退款期限是多少天？");
  const [targetDocId, setTargetDocId] = useState("products/alpha.md");
  const [targetPosition, setTargetPosition] = useState<"top" | "middle" | "bottom">("middle");

  const [isRunning, setIsRunning] = useState(false);
  const [experimentResults, setExperimentResults] = useState<{
    tierA: TierResultData;
    tierB: TierResultData;
    tierC: TierResultData;
  } | null>(null);

  const targetDoc = docs.find((d: CorpusDocument) => d.id === targetDocId) || docs[0];

  // Derived static metrics estimation for each tier without running API (client-safe)
  const preCalculatedMetrics = useMemo(() => {
    const tierA = assembleTierFromDocs(docs, {
      targetDocId,
      tier: "A",
      position: targetPosition,
    });
    const tierB = assembleTierFromDocs(docs, {
      targetDocId,
      tier: "B",
      position: targetPosition,
    });
    const tierC = assembleTierFromDocs(docs, {
      targetDocId,
      tier: "C",
      position: targetPosition,
    });

    return {
      tierA: { metrics: tierA.metrics, docsCount: tierA.docsUsed.length },
      tierB: { metrics: tierB.metrics, docsCount: tierB.docsUsed.length },
      tierC: { metrics: tierC.metrics, docsCount: tierC.docsUsed.length },
    };
  }, [docs, targetDocId, targetPosition]);

  const effectiveApiKey = customApiKey || "";
  const isKeyAvailable = hasServerKey || Boolean(effectiveApiKey.trim().length > 0);

  // Execute 3-Tier Contrast Experiment
  const handleRunContrast = async () => {
    if (!question.trim() || isRunning) return;
    if (!isKeyAvailable) {
      alert("请先点击右上角配置 API Key");
      return;
    }

    setIsRunning(true);
    setExperimentResults(null);

    try {
      const res = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_sufficient_test",
          question,
          contextDocId: targetDocId,
          position: targetPosition,
          selectedTiers: ["A", "B", "C"],
          apiKey: effectiveApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setExperimentResults({
        tierA: data.results.tierA,
        tierB: data.results.tierB,
        tierC: data.results.tierC,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert(`对照实验执行失败: ${message}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 font-sans selection:bg-purple-500/30 flex flex-col">
      <Header
        hasServerKey={hasServerKey}
        model={model}
        defaultBaseURL={defaultBaseURL}
        customApiKey={customApiKey}
        onSaveApiKey={saveLocalKey}
        customBaseURL={customBaseURL}
        onSaveBaseURL={saveLocalBaseURL}
        onSaveSettings={handleSaveSettings}
        currentLesson={{
          id: "c2",
          title: "第 2 课: Context 越多越好吗？(Sufficient Context)",
          badge: "C2 信息密度",
        }}
      />

      <main className="flex-1 overflow-y-auto p-6 md:p-10 max-w-7xl mx-auto w-full space-y-8">
        {/* Banner */}
        <div className="glass-panel p-6 md:p-8 rounded-3xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/40 via-[#0d1222] to-blue-950/30 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5">
                <Scissors className="w-3.5 h-3.5 text-cyan-400" />
                Context Engineering · 阶段 2
              </span>
              <span className="text-xs text-slate-400">/ 第 02 课</span>
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Context 越多越好吗？—— Sufficient Context vs Maximum Context
            </h1>

            <p className="text-sm text-slate-300 leading-relaxed">
              现代大模型支持超长上下文，但“一股脑全塞”会导致 Token 暴增、成本失控与首字延迟雪崩；
              更致命的是触发著名的 <strong className="text-white">“Lost in the Middle”</strong> 效应。
              本课通过三轨对照实验，树立“<strong className="text-cyan-300">不是 Maximum Context，而是 Sufficient Context</strong>”的第一法则。
            </p>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-3 shrink-0">
            <Link
              to="/docs/lessons/context/02-sufficient-vs-maximum-context.md"
              target="_blank"
              className="px-4 py-2.5 rounded-xl bg-[#12192c] hover:bg-[#1a2542] border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition"
            >
              <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
              <span>查阅本课理论讲义</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </Link>

            <Link
              to="/lessons/context-c1-why-context"
              className="px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-xs font-semibold text-slate-300 flex items-center justify-center gap-2 transition"
            >
              <span>← 返回第 1 课</span>
            </Link>
          </div>
        </div>

        {/* Triple-Track Preview Metrics Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Tier A Preview Card */}
          <div className="glass-panel p-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/10 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Tier A: 精准充分 (Sufficient)
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                1 篇核心文档
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-center">
              <div className="p-2 rounded-lg bg-[#080d18] border border-slate-800">
                <div className="text-[10px] text-slate-500">总词元</div>
                <div className="text-xs font-bold text-slate-200">
                  ~{preCalculatedMetrics.tierA.metrics.totalTokens} T
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[#080d18] border border-slate-800">
                <div className="text-[10px] text-slate-500">信噪比 SNR</div>
                <div className="text-xs font-bold text-emerald-400">
                  {(preCalculatedMetrics.tierA.metrics.snr * 100).toFixed(0)}%
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[#080d18] border border-slate-800">
                <div className="text-[10px] text-slate-500">成本倍率</div>
                <div className="text-xs font-bold text-slate-200">1.0x 基准</div>
              </div>
            </div>
          </div>

          {/* Tier B Preview Card */}
          <div className="glass-panel p-4 rounded-2xl border border-amber-500/30 bg-amber-950/10 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Tier B: 适度稀释 (Diluted)
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                +5 篇无关文档
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-center">
              <div className="p-2 rounded-lg bg-[#080d18] border border-slate-800">
                <div className="text-[10px] text-slate-500">总词元</div>
                <div className="text-xs font-bold text-slate-200">
                  ~{preCalculatedMetrics.tierB.metrics.totalTokens} T
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[#080d18] border border-slate-800">
                <div className="text-[10px] text-slate-500">信噪比 SNR</div>
                <div className="text-xs font-bold text-amber-400">
                  {(preCalculatedMetrics.tierB.metrics.snr * 100).toFixed(1)}%
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[#080d18] border border-slate-800">
                <div className="text-[10px] text-slate-500">成本倍率</div>
                <div className="text-xs font-bold text-amber-400">
                  {preCalculatedMetrics.tierB.metrics.costMultiplier}x
                </div>
              </div>
            </div>
          </div>

          {/* Tier C Preview Card */}
          <div className="glass-panel p-4 rounded-2xl border border-rose-500/30 bg-rose-950/10 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-rose-300 flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-rose-400" />
                Tier C: 海量饱和 (Saturated)
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                全语料 + 迷失在中间
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-center">
              <div className="p-2 rounded-lg bg-[#080d18] border border-slate-800">
                <div className="text-[10px] text-slate-500">总词元</div>
                <div className="text-xs font-bold text-rose-300">
                  ~{preCalculatedMetrics.tierC.metrics.totalTokens} T
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[#080d18] border border-slate-800">
                <div className="text-[10px] text-slate-500">信噪比 SNR</div>
                <div className="text-xs font-bold text-rose-400">
                  {(preCalculatedMetrics.tierC.metrics.snr * 100).toFixed(1)}%
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[#080d18] border border-slate-800">
                <div className="text-[10px] text-slate-500">成本倍率</div>
                <div className="text-xs font-bold text-rose-400">
                  {preCalculatedMetrics.tierC.metrics.costMultiplier}x
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Experiment Controls Workbench */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <h2 className="text-base font-bold text-white tracking-tight">
                三轨对抗实验台：Sufficient vs Diluted vs Saturated
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-400">
              物理度量: <code className="text-cyan-300">measureContext(full, relevant)</code>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Left: Question and Document */}
            <div className="md:col-span-8 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  1. 测试问题 (包含私有关键事实):
                </label>
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="例如: Alpha 产品的退款期限是多少天？"
                  className="w-full px-3 py-2 rounded-xl bg-[#0b0f19] border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />

                {/* Quick Benchmark Questions */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-500 mr-1 flex items-center">
                    <HelpCircle className="w-3 h-3 mr-0.5" /> 黄金基准题:
                  </span>
                  {questions.slice(0, 3).map((q: BenchmarkQuestion) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => {
                        setQuestion(q.question);
                        if (q.expectedSources[0]) {
                          setTargetDocId(q.expectedSources[0]);
                        }
                      }}
                      className="text-[11px] px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition"
                    >
                      {q.question}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  2. 包含核心事实的目标文档 (<code className="text-cyan-300">Target Document</code>):
                </label>
                <select
                  value={targetDocId}
                  onChange={(e) => setTargetDocId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0b0f19] border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                >
                  {docs.map((d: CorpusDocument) => (
                    <option key={d.id} value={d.id}>
                      {d.path} ({d.title}) - ~{d.tokenCount} T
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-400 block">
                  目标文档大小: ~{targetDoc.tokenCount} tokens。该文档构成本次回答的“充分必要上下文”。
                </span>
              </div>
            </div>

            {/* Right: Lost in the Middle Controller */}
            <div className="md:col-span-4 p-4 rounded-xl bg-[#090d18] border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  信息在长上下文中的位置
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/30">
                  Lost in the Middle
                </span>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                切换目标文档在长上下文（Tier C）中的摆放位置，直观体验大模型的注意力 U 型衰减曲线：
              </p>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTargetPosition("top")}
                  className={`p-2 rounded-xl border text-center text-xs font-mono transition flex flex-col items-center gap-1 ${
                    targetPosition === "top"
                      ? "bg-cyan-950/50 border-cyan-500 text-cyan-200 shadow-md shadow-cyan-950/40"
                      : "bg-[#0b0f1a] border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <AlignVerticalJustifyStart className="w-4 h-4 text-cyan-400" />
                  <span className="font-bold">Top 首部</span>
                  <span className="text-[9px] text-slate-500">首因效应</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetPosition("middle")}
                  className={`p-2 rounded-xl border text-center text-xs font-mono transition flex flex-col items-center gap-1 ${
                    targetPosition === "middle"
                      ? "bg-rose-950/50 border-rose-500 text-rose-200 shadow-md shadow-rose-950/40"
                      : "bg-[#0b0f1a] border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <AlignVerticalJustifyCenter className="w-4 h-4 text-rose-400" />
                  <span className="font-bold">Middle 居中</span>
                  <span className="text-[9px] text-rose-400/80">注意力盲区</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetPosition("bottom")}
                  className={`p-2 rounded-xl border text-center text-xs font-mono transition flex flex-col items-center gap-1 ${
                    targetPosition === "bottom"
                      ? "bg-cyan-950/50 border-cyan-500 text-cyan-200 shadow-md shadow-cyan-950/40"
                      : "bg-[#0b0f1a] border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <AlignVerticalJustifyEnd className="w-4 h-4 text-cyan-400" />
                  <span className="font-bold">Bottom 尾部</span>
                  <span className="text-[9px] text-slate-500">近因效应</span>
                </button>
              </div>

              <div className="text-[10px] text-slate-500 italic pt-1">
                * 推荐选择 Middle 居中，观察当目标事实被两端海量噪声夹击时，模型回答的迟疑与事实混淆。
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={handleRunContrast}
              disabled={isRunning}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-cyan-600/20 disabled:opacity-50 transition"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>并发执行三轨对比推理中...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>启动三轨对照实验 (Run 3-Tier Contrast)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Execution Results Comparison Grid */}
        {experimentResults && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white tracking-tight">
                  实测对比看板 (Live 3-Tier Benchmark Results)
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-400">
                位置设定: <strong className="text-cyan-300 uppercase">{targetPosition}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Tier A Result Card */}
              <div className="glass-panel p-5 rounded-2xl border border-emerald-500/40 bg-emerald-950/10 space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <h4 className="text-xs font-bold text-white tracking-tight">
                        Tier A: 精准充分 (Sufficient)
                      </h4>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      1 篇文档
                    </span>
                  </div>

                  {/* Metrics Badges */}
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                    <div className="p-2 rounded-lg bg-[#070a14] border border-slate-800">
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-cyan-400" /> 耗时
                      </span>
                      <div className="text-xs font-bold text-slate-200 mt-1">
                        {experimentResults.tierA.latencyMs} ms
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-[#070a14] border border-slate-800">
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Coins className="w-3 h-3 text-emerald-400" /> 消耗词元
                      </span>
                      <div className="text-xs font-bold text-emerald-300 mt-1">
                        {experimentResults.tierA.actualTokens} T
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-400">模型实际回答:</span>
                    <div className="p-3 rounded-xl bg-[#060912] border border-slate-800 text-xs text-emerald-200/90 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                      {experimentResults.tierA.answer}
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-[11px] text-emerald-300">
                  ✅ <strong>评估：</strong>信噪比极高，精准命中核心条款，成本最低、速度最快。
                </div>
              </div>

              {/* Tier B Result Card */}
              <div className="glass-panel p-5 rounded-2xl border border-amber-500/40 bg-amber-950/10 space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-amber-500/20 pb-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <h4 className="text-xs font-bold text-white tracking-tight">
                        Tier B: 适度稀释 (Diluted)
                      </h4>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {experimentResults.tierB.docsCount} 篇文档
                    </span>
                  </div>

                  {/* Metrics Badges */}
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                    <div className="p-2 rounded-lg bg-[#070a14] border border-slate-800">
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-cyan-400" /> 耗时
                      </span>
                      <div className="text-xs font-bold text-slate-200 mt-1">
                        {experimentResults.tierB.latencyMs} ms
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-[#070a14] border border-slate-800">
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Coins className="w-3 h-3 text-amber-400" /> 消耗词元
                      </span>
                      <div className="text-xs font-bold text-amber-300 mt-1">
                        {experimentResults.tierB.actualTokens} T
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-400">模型实际回答:</span>
                    <div className="p-3 rounded-xl bg-[#060912] border border-slate-800 text-xs text-amber-200/90 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                      {experimentResults.tierB.answer}
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-300">
                  ⚠️ <strong>评估：</strong>虽然答对，但 Token 增加了 {experimentResults.tierB.metrics.costMultiplier} 倍，注意力和计算资源被不必要的文档浪费。
                </div>
              </div>

              {/* Tier C Result Card */}
              <div className="glass-panel p-5 rounded-2xl border border-rose-500/40 bg-rose-950/10 space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-rose-500/20 pb-3">
                    <div className="flex items-center gap-2">
                      <Gauge className="w-4 h-4 text-rose-400" />
                      <h4 className="text-xs font-bold text-white tracking-tight">
                        Tier C: 海量饱和 (Saturated)
                      </h4>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      {experimentResults.tierC.docsCount} 篇文档 (全量)
                    </span>
                  </div>

                  {/* Metrics Badges */}
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                    <div className="p-2 rounded-lg bg-[#070a14] border border-slate-800">
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-cyan-400" /> 耗时
                      </span>
                      <div className="text-xs font-bold text-rose-300 mt-1">
                        {experimentResults.tierC.latencyMs} ms
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-[#070a14] border border-slate-800">
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Coins className="w-3 h-3 text-rose-400" /> 消耗词元
                      </span>
                      <div className="text-xs font-bold text-rose-300 mt-1">
                        {experimentResults.tierC.actualTokens} T
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-400">模型实际回答:</span>
                    <div className="p-3 rounded-xl bg-[#060912] border border-slate-800 text-xs text-rose-200/90 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                      {experimentResults.tierC.answer}
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-500/30 text-[11px] text-rose-300">
                  ❌ <strong>评估：</strong>成本飙升 {experimentResults.tierC.metrics.costMultiplier} 倍！当目标事实深埋在中间时，极易混淆其他产品的退款条款或被废弃政策误导。
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Code Inspection & Principle */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Code2 className="w-4 h-4 text-cyan-400" />
            <h3 className="text-base font-bold text-white tracking-tight">
              核心实现函数：measureContext(fullContext, relevantDocTokens)
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[#060911] border border-slate-900 font-mono text-xs text-slate-300 space-y-1">
              <div className="text-slate-500">// 计算上下文信噪比 SNR 与成本膨胀</div>
              <div className="text-cyan-300">function <span className="text-purple-300">measureContext</span>(fullContext, relevantTokens) &#123;</div>
              <div className="pl-4 text-slate-300">const totalTokens = estimateTokens(fullContext);</div>
              <div className="pl-4 text-amber-300">const snr = relevantTokens / totalTokens;</div>
              <div className="pl-4 text-slate-300">const costUsd = (totalTokens / 1000) * 0.001;</div>
              <div className="pl-4 text-slate-300">return &#123; totalTokens, snr, costUsd &#125;;</div>
              <div className="text-cyan-300">&#125;</div>
            </div>

            <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
              <h4 className="font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                第 2 课核心公理与认知跃迁：
              </h4>
              <ul className="space-y-1.5 text-slate-400">
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>充分必要性（Sufficient Context）：</strong>只要能让模型确定性回答问题，注入的信息应当越精炼越好。</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>长上下文并不免疫注意力衰减：</strong>即使上下文窗口有 1M，中间区域的信息仍然极易被忽略（Lost in the Middle）。</span>
                </li>
              </ul>

              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                <span className="text-slate-400">下一步思考：既然不能全塞，我们怎么从万级文档中自动定位充分必要文档？</span>
                <Link
                  to="/docs/context-learn.md"
                  className="text-cyan-400 hover:text-cyan-300 text-xs font-semibold inline-flex items-center gap-1"
                >
                  <span>预习第 3 课：Search 检索机制</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import { BenchmarkCorpusManager, type CorpusDocument } from "~/core/context-bench/corpus";
import {
  Brain,
  ArrowRight,
  BookOpen,
  Play,
  Layers,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  Coins,
  ExternalLink,
  Code2,
  RefreshCw,
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

export default function ContextLesson1Page() {
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

  // Experiment State
  const [question, setQuestion] = useState("Alpha 产品的退款期限是多少天？");
  const [selectedDocId, setSelectedDocId] = useState("products/alpha.md");
  const selectedDoc = docs.find((d: CorpusDocument) => d.id === selectedDocId) || docs[0];

  const [isRunning, setIsRunning] = useState(false);
  const [experimentResult, setExperimentResult] = useState<{
    runA: { answer: string; tokens: number; latencyMs: number; hasContext: boolean };
    runB: { answer: string; tokens: number; latencyMs: number; hasContext: boolean; contextDocTitle?: string };
  } | null>(null);

  const effectiveApiKey = customApiKey || "";
  const isKeyAvailable = hasServerKey || Boolean(effectiveApiKey.trim().length > 0);

  // Trigger A/B Split Test
  const handleRunComparison = async () => {
    if (!question.trim() || isRunning) return;
    if (!isKeyAvailable) {
      alert("请先点击右上角配置 API Key");
      return;
    }

    setIsRunning(true);
    setExperimentResult(null);

    try {
      const res = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_compare",
          question,
          contextDocId: selectedDocId,
          apiKey: effectiveApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setExperimentResult({
        runA: data.runA,
        runB: data.runB,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert(`实验运行失败: ${message}`);
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
          id: "c1",
          title: "第 1 课: 模型不知道答案怎么办？(上下文第一性原理)",
          badge: "C1 上下文起源",
        }}
      />

      <main className="flex-1 overflow-y-auto p-6 md:p-10 max-w-7xl mx-auto w-full space-y-8">
        {/* Banner */}
        <div className="glass-panel p-6 md:p-8 rounded-3xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-[#0d1222] to-purple-950/30 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-indigo-400" />
                Context Engineering · 阶段 1
              </span>
              <span className="text-xs text-slate-400">/ 第 01 课</span>
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              模型不知道答案怎么办？—— 上下文的第一性原理
            </h1>

            <p className="text-sm text-slate-300 leading-relaxed">
              LLM 的静态参数无法覆盖私有业务事实。本课通过编写最本真的 <code className="text-cyan-300 font-mono">buildContext()</code>，
              对决“无 Context 裸问”与“注入 Context”，亲自体会为什么模型不是“学会了”，而是“在这次推理时看到了”。
            </p>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-3 shrink-0">
            <Link
              to="/docs/lessons/context/01-why-need-context.md"
              target="_blank"
              className="px-4 py-2.5 rounded-xl bg-[#12192c] hover:bg-[#1a2542] border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition"
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span>查阅本课理论讲义</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </Link>

            <Link
              to="/lessons/context-c0-setup"
              className="px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-xs font-semibold text-slate-300 flex items-center justify-center gap-2 transition"
            >
              <span>← 返回第 0 课环境</span>
            </Link>
          </div>
        </div>

        {/* Control & Experiment Configuration */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <h2 className="text-base font-bold text-white tracking-tight">
                双轨对抗实验室：Zero Context vs Injected Context
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-400">
              函数: <code className="text-purple-300">buildContext(doc, question)</code>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                1. 提问问题 (私有领域事实)
              </label>
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="例如: Alpha 产品的退款期限是多少天？"
                className="w-full px-3 py-2.5 rounded-xl bg-[#0b0f19] border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
              />

              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[10px] text-slate-500 mr-1">快捷问题:</span>
                {questions.slice(0, 3).map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setQuestion(q.question);
                      if (q.expectedSources[0]) {
                        setSelectedDocId(q.expectedSources[0]);
                      }
                    }}
                    className="text-[11px] px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60"
                  >
                    {q.question}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                2. 选择注入的参考文档资料 (<code className="text-cyan-300">document</code>)
              </label>
              <select
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#0b0f19] border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              >
                {docs.map((d: CorpusDocument) => (
                  <option key={d.id} value={d.id}>
                    {d.path} ({d.title}) - ~{d.tokenCount} T
                  </option>
                ))}
              </select>

              <div className="text-[11px] text-slate-400 flex items-center justify-between">
                <span>当前选中文件大小: ~{selectedDoc.tokenCount} tokens</span>
                <span className="text-emerald-400">将由 buildContext 拼入 Prompt</span>
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={handleRunComparison}
              disabled={isRunning}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>并发执行双轨推理中...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>启动双轨对比实验 (Run A/B Comparison)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live A/B Results Comparison Grid */}
        {experimentResult && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-300">
            {/* Run A Card */}
            <div className="glass-panel p-5 rounded-2xl border border-rose-500/30 bg-rose-950/10 space-y-4">
              <div className="flex items-center justify-between border-b border-rose-500/20 pb-3">
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-400" />
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    方案 A：Zero Context (直接向模型裸问)
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  无外部输入
                </span>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 rounded-xl bg-[#090d18] border border-slate-800 text-xs font-mono">
                  <div className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-cyan-400" />
                    耗时
                  </div>
                  <div className="text-sm font-bold text-slate-200 mt-1">
                    {experimentResult.runA.latencyMs} ms
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#090d18] border border-slate-800 text-xs font-mono">
                  <div className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Coins className="w-3 h-3 text-amber-400" />
                    消耗词元
                  </div>
                  <div className="text-sm font-bold text-slate-200 mt-1">
                    {experimentResult.runA.tokens} tokens
                  </div>
                </div>
              </div>

              {/* Answer */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400">模型实际回答:</span>
                <div className="p-3.5 rounded-xl bg-[#070a14] border border-slate-800 text-xs text-rose-200/90 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {experimentResult.runA.answer}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-500/30 text-[11px] text-rose-300">
                ❌ <strong>诊断：</strong>模型没有相关私有领域的任何知识，导致回答失败或编造幻觉数据。
              </div>
            </div>

            {/* Run B Card */}
            <div className="glass-panel p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/10 space-y-4">
              <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    方案 B：Injected Context (通过 buildContext 注入文档)
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {selectedDoc.path}
                </span>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 rounded-xl bg-[#090d18] border border-slate-800 text-xs font-mono">
                  <div className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-cyan-400" />
                    耗时
                  </div>
                  <div className="text-sm font-bold text-slate-200 mt-1">
                    {experimentResult.runB.latencyMs} ms
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#090d18] border border-slate-800 text-xs font-mono">
                  <div className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Coins className="w-3 h-3 text-amber-400" />
                    消耗词元
                  </div>
                  <div className="text-sm font-bold text-emerald-300 mt-1">
                    {experimentResult.runB.tokens} tokens
                  </div>
                </div>
              </div>

              {/* Answer */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400">模型实际回答:</span>
                <div className="p-3.5 rounded-xl bg-[#070a14] border border-slate-800 text-xs text-emerald-200/90 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {experimentResult.runB.answer}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-[11px] text-emerald-300">
                ✅ <strong>诊断：</strong>模型基于注入的资料精准回答出事实细节。
              </div>
            </div>
          </div>
        )}

        {/* Code Inspection & Principle */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Code2 className="w-4 h-4 text-purple-400" />
            <h3 className="text-base font-bold text-white tracking-tight">
              核心实现函数：buildContext(document, question)
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[#060911] border border-slate-900 font-mono text-xs text-slate-300 space-y-1">
              <div className="text-slate-500">// 最原始的 Context 装配函数</div>
              <div className="text-purple-300">function <span className="text-cyan-300">buildContext</span>(document: string, question: string) &#123;</div>
              <div className="pl-4 text-slate-300">return `以下是产品参考资料：</div>
              <div className="pl-4 text-amber-300">$&#123;document&#125;</div>
              <div className="pl-4 text-slate-300">问题：</div>
              <div className="pl-4 text-amber-300">$&#123;question&#125;`;</div>
              <div className="text-purple-300">&#125;</div>
            </div>

            <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
              <h4 className="font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                本课认知跃迁：
              </h4>
              <ul className="space-y-1.5 text-slate-400">
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>模型并没有在学习：</strong>注入文档没有修改模型任何权重，仅作为 Attention 运算的输入键值（KV-Cache）。</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>代价是 Token 膨胀：</strong>相比裸问，每一次问答都要额外承担整个 Document 的 Input Tokens 费用。</span>
                </li>
              </ul>

              <div className="pt-2">
                <Link
                  to="/lessons/context-c2-sufficient-context"
                  className="text-cyan-400 hover:text-cyan-300 text-xs font-semibold inline-flex items-center gap-1"
                >
                  <span>前往第 2 课：Context 越多越好吗？(Sufficient Context 实验)</span>
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

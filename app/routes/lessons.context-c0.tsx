import { useState, useEffect } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import { BenchmarkCorpusManager, type CorpusDocument, type BenchmarkQuestion } from "~/core/context-bench/corpus";
import {
  Brain,
  Database,
  ArrowRight,
  BookOpen,
  FileText,
  Play,
  Layers,
  Sparkles,
  HelpCircle,
  Hash,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  FileSearch,
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
  const totalTokens = docs.reduce((acc, d) => acc + d.tokenCount, 0);

  return {
    hasServerKey,
    model,
    defaultBaseURL,
    docs,
    questions,
    totalTokens,
  };
}

export default function ContextLesson0Page() {
  const {
    hasServerKey,
    model,
    defaultBaseURL,
    docs,
    questions,
    totalTokens,
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

  // Selected doc for preview
  const [selectedDocId, setSelectedDocId] = useState<string>(docs[0]?.id || "");
  const selectedDoc = docs.find((d: CorpusDocument) => d.id === selectedDocId) || docs[0];

  // Minimal Agent Testing State
  const [testQuestion, setTestQuestion] = useState(questions[0]?.question || "Alpha 产品的退款期限是多少天？");
  const [agentAnswer, setAgentAnswer] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);

  const effectiveApiKey = customApiKey || "";
  const isKeyAvailable = hasServerKey || Boolean(effectiveApiKey.trim().length > 0);

  const handleRunMinimalAgent = async () => {
    if (!testQuestion.trim() || isRunning) return;
    if (!isKeyAvailable) {
      alert("请先在右上角配置 API Key");
      return;
    }

    setIsRunning(true);
    setAgentAnswer(null);
    const startTime = Date.now();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: testQuestion }],
          systemPrompt: "你是一个专业的问答助手。请如实回答用户的问题。",
          apiKey: effectiveApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6).trim();
              if (dataStr === "[DONE]") break;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.content) {
                  fullText += parsed.content;
                  setAgentAnswer(fullText);
                }
              } catch {
                // Ignore SSE framing chunks
              }
            }
          }
        }
      }
      setLatency(Date.now() - startTime);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setAgentAnswer(`调用出错: ${message}`);
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
          id: "c0",
          title: "第 0 课: 建立实验环境与基准测试台",
          badge: "C0 实验底座",
        }}
      />

      <main className="flex-1 overflow-y-auto p-6 md:p-10 max-w-7xl mx-auto w-full space-y-8">
        {/* Lesson Breadcrumb & Goal Banner */}
        <div className="glass-panel p-6 md:p-8 rounded-3xl border border-purple-500/30 bg-gradient-to-r from-purple-950/40 via-[#0d1222] to-cyan-950/30 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-purple-400" />
                Context Engineering · 阶段 0
              </span>
              <span className="text-xs text-slate-400">/ 第 00 课</span>
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              建立实验环境与基准测试台
            </h1>

            <p className="text-sm text-slate-300 leading-relaxed">
              在学习任何检索与上下文技术前，先搭建一套固定的<strong className="text-white">私有语料库（Ground Truth Corpus）</strong>与<strong className="text-white">最小 Agent 基线</strong>。后续 18 节课的所有演进均在这一套数据上进行确定性对比。
            </p>

            <div className="flex items-center gap-4 text-xs font-mono text-slate-400 pt-1">
              <span className="flex items-center gap-1">
                <Database className="w-3.5 h-3.5 text-cyan-400" />
                语料文档: {docs.length} 篇
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Hash className="w-3.5 h-3.5 text-indigo-400" />
                基准词元: ~{totalTokens.toLocaleString()} tokens
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                黄金测试题: {questions.length} 道
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-3 shrink-0">
            <Link
              to="/docs/lessons/context/00-setup-and-baseline.md"
              target="_blank"
              className="px-4 py-2.5 rounded-xl bg-[#12192c] hover:bg-[#1a2542] border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition"
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span>查阅本课详细讲义</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </Link>

            <Link
              to="/lessons/context-c1-why-context"
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs font-semibold text-white flex items-center justify-center gap-2 shadow-lg shadow-purple-600/25 transition"
            >
              <span>前往第 1 课：模型不知道答案怎么办？</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Section 1: Minimal Agent Baseline Runner */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Play className="w-4 h-4 text-emerald-400" />
              <h2 className="text-base font-bold text-white tracking-tight">
                实验 A：运行最小 Agent 基线 (Minimal Agent Runner)
              </h2>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              Zero Context · 纯参数推理
            </span>
          </div>

          <p className="text-xs text-slate-300">
            这个 Agent 只有一行最基础的 <code className="text-purple-300 font-mono">model.generate(question)</code>。
            试着挑选一个关于私有产品的问题向它提问，观察裸模型在没有 Context 的情况下会发生什么。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="md:col-span-2 space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                测试问题 (选择或输入私有事实问题):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testQuestion}
                  onChange={(e) => setTestQuestion(e.target.value)}
                  placeholder="输入一个测试问题..."
                  className="flex-1 px-3 py-2 rounded-xl bg-[#0b0f19] border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
                <button
                  type="button"
                  onClick={handleRunMinimalAgent}
                  disabled={isRunning}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-xs font-semibold text-white flex items-center gap-2 shrink-0 transition"
                >
                  {isRunning ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>推理中...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>直接问模型</span>
                    </>
                  )}
                </button>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] text-slate-500">预设黄金问题:</span>
                {questions.slice(0, 3).map((q: BenchmarkQuestion) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setTestQuestion(q.question)}
                    className="text-[11px] px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition"
                  >
                    {q.question}
                  </button>
                ))}
              </div>

              {/* Agent Output Panel */}
              {agentAnswer !== null && (
                <div className="mt-4 p-4 rounded-xl bg-[#0a0e1a] border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-b border-slate-800/80 pb-2">
                    <span className="text-purple-300 font-semibold flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      模型原生回答
                    </span>
                    {latency !== null && (
                      <span className="text-slate-500">耗时: {latency}ms</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {agentAnswer}
                  </p>
                  <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-500/30 text-[11px] text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                    <span>
                      <strong>观察现象：</strong>
                      因为大模型的静态训练集在过去，且不包含你的私有系统数据，它要么坦白说“不知道”，要么一本正经地胡说八道（产生幻觉）。这就是为什么我们需要 Context！
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Benchmark Questions List */}
            <div className="p-4 rounded-xl bg-[#090d18] border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                  基准评测用例集 (6题)
                </span>
                <span className="text-[10px] font-mono text-slate-500">Benchmark QA</span>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {questions.map((q: BenchmarkQuestion) => (
                  <div
                    key={q.id}
                    onClick={() => setTestQuestion(q.question)}
                    className={`p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                      testQuestion === q.question
                        ? "bg-purple-950/30 border-purple-500/50 text-purple-200"
                        : "bg-[#0f1424]/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[10px] text-indigo-400 font-bold">
                        {q.id}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                        {q.difficulty}
                      </span>
                    </div>
                    <div className="line-clamp-2 leading-relaxed">{q.question}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Ground Truth Corpus Explorer */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <FileSearch className="w-4 h-4 text-cyan-400" />
              <h2 className="text-base font-bold text-white tracking-tight">
                实验 B：透视私有语料库 (Ground Truth Corpus Explorer)
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-400">
              数据源: <code className="text-cyan-300">data/context-benchmark/</code>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* File List */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                私有文档目录 (点击浏览)
              </span>
              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                {docs.map((d: CorpusDocument) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedDocId(d.id)}
                    className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                      selectedDocId === d.id
                        ? "bg-cyan-950/40 border-cyan-500/50 text-cyan-200 shadow-md shadow-cyan-950/40"
                        : "bg-[#0b0f1a] border-slate-800 text-slate-300 hover:bg-[#121828]"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className={`w-4 h-4 shrink-0 ${
                        d.category === "products" ? "text-cyan-400" : d.category === "adversarial" ? "text-rose-400" : "text-indigo-400"
                      }`} />
                      <div className="truncate">
                        <div className="text-xs font-medium truncate">{d.title}</div>
                        <div className="text-[10px] font-mono text-slate-500">{d.path}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0 ml-2">
                      ~{d.tokenCount} T
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Document Content Viewer */}
            <div className="md:col-span-2 p-4 rounded-xl bg-[#090d18] border border-slate-800 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-slate-200 font-mono">
                      {selectedDoc.path}
                    </span>
                    {selectedDoc.authority === "deprecated" && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        已废弃版本
                      </span>
                    )}
                    {selectedDoc.authority === "untrusted" && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        未受信任 / 含注入
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    预估词元: <strong className="text-white">{selectedDoc.tokenCount}</strong> tokens
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-[#060911] border border-slate-900 font-mono text-xs text-slate-300 max-h-64 overflow-y-auto leading-relaxed whitespace-pre-wrap">
                  {selectedDoc.content}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                <span>该语料库构成了后续整套课程所有 Retrieval、Rerank 与 Eval 的真实真理来源（Ground Truth）。</span>
                <Link
                  to="/lessons/context-c1-why-context"
                  className="text-cyan-400 hover:text-cyan-300 font-semibold inline-flex items-center gap-1"
                >
                  <span>立即把该文档注入模型</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: 18-Lesson Roadmap Visualizer */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Layers className="w-4 h-4 text-purple-400" />
            <h2 className="text-base font-bold text-white tracking-tight">
              Context Engineering 18 阶段演进推导全景
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { id: "C0", name: "实验环境", state: "current" },
              { id: "C1", name: "为什么需要 Context", state: "next" },
              { id: "C2", name: "Sufficient vs Max", state: "todo" },
              { id: "C3", name: "Grep 文本搜索", state: "todo" },
              { id: "C4", name: "Semantic 向量搜索", state: "todo" },
              { id: "C5", name: "Semantic 局限性", state: "todo" },
              { id: "C6", name: "Hybrid 混合检索", state: "todo" },
              { id: "C7", name: "Reranking 重排", state: "todo" },
              { id: "C8", name: "Chunking 切分", state: "todo" },
              { id: "C9", name: "Contextual Chunk", state: "todo" },
              { id: "C10", name: "Agentic 推理检索", state: "todo" },
              { id: "C11", name: "Context Budget", state: "todo" },
              { id: "C12", name: "Context Assembly", state: "todo" },
              { id: "C13", name: "Compaction 压缩", state: "todo" },
              { id: "C14", name: "Memory 持久化", state: "todo" },
              { id: "C15", name: "Memory 冲突治理", state: "todo" },
              { id: "C16", name: "可信度与时效性", state: "todo" },
              { id: "C17", name: "Prompt 注入防御", state: "todo" },
            ].map((step) => (
              <div
                key={step.id}
                className={`p-2.5 rounded-xl border text-xs font-mono flex items-center justify-between ${
                  step.state === "current"
                    ? "bg-purple-950/40 border-purple-500 text-purple-200"
                    : step.state === "next"
                    ? "bg-cyan-950/30 border-cyan-500/50 text-cyan-300"
                    : "bg-[#0b0f19] border-slate-800 text-slate-500"
                }`}
              >
                <span className="font-bold">{step.id}</span>
                <span className="font-sans text-[11px] truncate ml-1">{step.name}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

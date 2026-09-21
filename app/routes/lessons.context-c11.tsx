import { useState, useEffect } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import {
  BenchmarkCorpusManager,
  type MultiHopTestCase,
  type AgenticTrajectory,
  type MultiHopCaseMatrixRow,
  type StrategyEvalResult,
  type RequiredFact,
} from "~/core/context-bench/corpus";
import {
  Zap,
  Sparkles,
  Layers,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Compass,
  FileText,
  Database,
  RefreshCw,
  Play,
  BookOpen,
  Coins,
  ChevronRight,
  ExternalLink,
  Activity,
  Terminal,
  Cpu,
  GitCommit,
  Flame,
  Check,
  X,
  XCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Loader: 服务端首屏加载
// ---------------------------------------------------------------------------

export async function loader() {
  const docs = BenchmarkCorpusManager.getAllDocuments();
  const totalCorpusTokens = docs.reduce((sum, d) => sum + d.tokenCount, 0);
  const hasServerKey = Boolean(
    process.env.LLM_API_KEY && process.env.LLM_API_KEY.trim().length > 0
  );
  const model = process.env.LLM_MODEL || "glm-4-flash";
  const defaultBaseURL =
    process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";

  const cases = BenchmarkCorpusManager.getMultiHopBenchmarkCases();
  const initialMatrix = BenchmarkCorpusManager.generateMultiHopBenchmarkMatrix();
  const initialTrajectory = BenchmarkCorpusManager.getCuratedAgenticTrajectory("mh-01");

  return {
    hasServerKey,
    model,
    defaultBaseURL,
    totalCorpusTokens,
    docCount: docs.length,
    cases,
    initialMatrix,
    initialTrajectory,
  };
}

function isFactCaptured(rf: RequiredFact, agentic: AgenticTrajectory | null | undefined): boolean {
  if (!agentic) return false;
  const match = (text: string | undefined): boolean => {
    if (!text) return false;
    if (text.includes(rf.fact)) return true;
    if (rf.pattern && typeof rf.pattern.test === "function") {
      try {
        if (rf.pattern.test(text)) return true;
      } catch {
        // ignore regex match error
      }
    }
    const tokens = rf.fact.split(/[,，:：()（）\s]+/).filter((k) => k.length > 1);
    if (tokens.length > 0 && tokens.every((t) => text.includes(t))) return true;
    return false;
  };

  if ((agentic.factsGathered || []).some((gf) => match(gf))) return true;
  if ((agentic.steps || []).some((s) => match(s.discoveredFact) || match(s.observation) || match(s.thought))) return true;
  if (match(agentic.finalAnswer)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// 主页面组件
// ---------------------------------------------------------------------------

export default function ContextLessonC11() {
  const {
    hasServerKey,
    model,
    defaultBaseURL,
    totalCorpusTokens,
    docCount,
    cases,
    initialMatrix,
    initialTrajectory,
  } = useLoaderData<typeof loader>();

  const [customApiKey, setCustomApiKey] = useState("");
  const [customBaseURL, setCustomBaseURL] = useState(defaultBaseURL);

  useEffect(() => {
    const savedKey = localStorage.getItem("MINI_CLAUDE_API_KEY");
    if (savedKey) setCustomApiKey(savedKey);
    const savedURL = localStorage.getItem("MINI_CLAUDE_BASE_URL");
    if (savedURL) setCustomBaseURL(savedURL);
  }, []);

  const handleSaveSettings = (settings: { apiKey: string; baseURL: string }) => {
    setCustomApiKey(settings.apiKey);
    setCustomBaseURL(settings.baseURL);
    localStorage.setItem("MINI_CLAUDE_API_KEY", settings.apiKey);
    localStorage.setItem("MINI_CLAUDE_BASE_URL", settings.baseURL);
  };

  const isKeyAvailable = hasServerKey || Boolean(customApiKey.trim().length > 0);

  const [activeTab, setActiveTab] = useState<"studio" | "showdown" | "architecture">("studio");

  // ---- 检索工坊状态 ----
  const [selectedCaseId, setSelectedCaseId] = useState<string>(cases[0].id);
  const currentCase = cases.find((c: MultiHopTestCase) => c.id === selectedCaseId) || cases[0];
  const [queryText, setQueryText] = useState(currentCase.query);

  const [singleShotData, setSingleShotData] = useState<StrategyEvalResult | null>(null);
  const [agenticData, setAgenticData] = useState<AgenticTrajectory | null>(initialTrajectory);
  const [isRunningComparison, setIsRunningComparison] = useState(false);
  const [liveCurrentStep, setLiveCurrentStep] = useState<{
    stepNumber: number;
    maxSteps: number;
    thought?: string;
    tool?: string;
    args?: any;
    statusText: string;
  } | null>(null);
  const [liveLogs, setLiveLogs] = useState<
    Array<{ id: string; time: string; text: string; type: "start" | "thought" | "tool" | "obs" | "fact" | "done" | "error" }>
  >([]);
  const [showLiveLogsDrawer, setShowLiveLogsDrawer] = useState(false);

  const [lastExecution, setLastExecution] = useState<{
    time: string;
    mode: "live" | "curated";
    latencyMs: number;
    stepsCount: number;
    caseId: string;
    factsRecalled: number;
    totalFacts: number;
  } | null>(null);

  // ---- 全景矩阵状态 ----
  const [matrixRows, setMatrixRows] = useState<MultiHopCaseMatrixRow[]>(initialMatrix);
  const [isRefreshingMatrix, setIsRefreshingMatrix] = useState(false);

  // 动作：切换测试用例
  const handleSelectCase = (c: MultiHopTestCase) => {
    setSelectedCaseId(c.id);
    setQueryText(c.query);
    setSingleShotData(null);
    setLastExecution(null);
    setLiveLogs([]);
    setLiveCurrentStep(null);
    const cachedTraj = BenchmarkCorpusManager.getCuratedAgenticTrajectory(c.id);
    if (cachedTraj) {
      setAgenticData(cachedTraj);
    }
  };

  // 动作：执行多跳推理对决（支持实时流式调用过程展示）
  const runComparison = async () => {
    setIsRunningComparison(true);
    setLiveLogs([]);
    setShowLiveLogsDrawer(false);
    setLiveCurrentStep({
      stepNumber: 1,
      maxSteps: 6,
      statusText: "正在唤醒大模型，开始分析复合问题意图与检索路径...",
    });

    // 建立一个响应式的 Agentic 数据骨架，实时随着流式步骤更新
    setAgenticData({
      caseId: selectedCaseId,
      query: queryText,
      steps: [],
      finalAnswer: "",
      totalSteps: 0,
      totalInjectedTokens: 0,
      totalLatencyMs: 0,
      factsGathered: [],
      recalledFactCount: 0,
      totalFactCount: currentCase.requiredFacts.length,
      factRecallRate: 0,
      reasoningAccuracy: 0,
      mode: "live_llm",
    });

    const addLog = (text: string, type: "start" | "thought" | "tool" | "obs" | "fact" | "done" | "error") => {
      const time = new Date().toLocaleTimeString();
      setLiveLogs((prev) => [...prev.slice(-35), { id: Math.random().toString(), time, text, type }]);
    };

    addLog(
      `▶ [对决启动] 开始分析用例: ${currentCase.title} (真实大模型 ReAct 在线驱动)`,
      "start"
    );

    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_agentic_single",
          caseId: selectedCaseId,
          query: queryText,
          forceLive: true,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
          stream: true,
        }),
      });

      if (!resp.ok) {
        throw new Error(`HTTP error ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const block of lines) {
            const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            const dataStr = dataLine.slice(6).trim();
            if (dataStr === "[DONE]") break;

            try {
              const evt = JSON.parse(dataStr);
              if (evt.type === "step_start") {
                setLiveCurrentStep({
                  stepNumber: evt.stepNumber,
                  maxSteps: evt.maxSteps,
                  thought: undefined,
                  tool: undefined,
                  args: undefined,
                  statusText: `第 ${evt.stepNumber} / ${evt.maxSteps} 步：大模型正在构思当前搜索假设 (Thought)...`,
                });
                addLog(`▶ [第 ${evt.stepNumber} 步] 开始构思搜索动作...`, "start");
              } else if (evt.type === "step_thought") {
                setLiveCurrentStep((prev) => ({
                  stepNumber: prev?.stepNumber || evt.stepNumber,
                  maxSteps: prev?.maxSteps || 6,
                  thought: evt.thought,
                  tool: prev?.tool,
                  args: prev?.args,
                  statusText: `第 ${evt.stepNumber} 步假设已确立，组织检索工具调用...`,
                }));
                addLog(`💭 Thought: ${evt.thought.slice(0, 90)}${evt.thought.length > 90 ? "..." : ""}`, "thought");
              } else if (evt.type === "step_tool_call") {
                setLiveCurrentStep((prev) => ({
                  stepNumber: prev?.stepNumber || evt.stepNumber,
                  maxSteps: prev?.maxSteps || 6,
                  thought: prev?.thought,
                  tool: evt.tool,
                  args: evt.args,
                  statusText: `正在调用工具: ${evt.tool}() ...`,
                }));
                addLog(`⚙️ Tool Call: ${evt.tool}(${JSON.stringify(evt.args)})`, "tool");
              } else if (evt.type === "step_observation") {
                addLog(`👀 Observation: ${evt.observation.slice(0, 80)}${evt.observation.length > 80 ? "..." : ""}`, "obs");
                if (evt.discoveredFact) {
                  addLog(`💡 捕获事实: ${evt.discoveredFact}`, "fact");
                }
              } else if (evt.type === "step_complete") {
                setAgenticData((prev) => {
                  if (!prev) return prev;
                  const existing = prev.steps.filter((s) => s.stepNumber !== evt.step.stepNumber);
                  const updatedSteps = [...existing, evt.step].sort((a, b) => a.stepNumber - b.stepNumber);
                  return {
                    ...prev,
                    steps: updatedSteps,
                    factsGathered: evt.factsGathered || prev.factsGathered,
                    totalInjectedTokens: evt.totalTokens || prev.totalInjectedTokens,
                    totalSteps: updatedSteps.length,
                  };
                });
              } else if (evt.type === "final_result") {
                setSingleShotData(evt.singleShot);
                setAgenticData(evt.agentic);
                setLastExecution({
                  time: new Date().toLocaleTimeString(),
                  mode: evt.agentic?.mode === "curated_replay" ? "curated" : "live",
                  latencyMs: evt.agentic.totalLatencyMs || 0,
                  stepsCount: evt.agentic.totalSteps || 0,
                  caseId: selectedCaseId,
                  factsRecalled:
                    evt.agentic.recalledFactCount ??
                    evt.agentic.factsGathered?.length ??
                    currentCase.requiredFacts.length,
                  totalFacts: evt.agentic.totalFactCount ?? currentCase.requiredFacts.length,
                });
                addLog(`🏁 推理闭合！耗时 ${(evt.agentic.totalLatencyMs / 1000).toFixed(1)}s，完成综合裁决。`, "done");
              } else if (evt.type === "error") {
                addLog(`❌ 执行出错: ${evt.message}`, "error");
              }
            } catch {
              // ignore json framing parse error
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Agentic comparison failed:", err);
      addLog(`❌ 请求异常: ${err.message || String(err)}`, "error");
    } finally {
      setIsRunningComparison(false);
      setLiveCurrentStep(null);
    }
  };

  // 动作：刷新基准矩阵
  const refreshMatrix = async () => {
    setIsRefreshingMatrix(true);
    try {
      const resp = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_agentic_matrix",
        }),
      });
      const data = await resp.json();
      if (data.success) {
        setMatrixRows(data.rows);
      }
    } catch (err) {
      console.error("Matrix refresh failed:", err);
    } finally {
      setIsRefreshingMatrix(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200">
      <Header
        hasServerKey={hasServerKey}
        model={model}
        currentLesson={{
          id: "context-c11",
          title: "第 11 课: 一次 Retrieval 够吗？(Agentic Retrieval)",
          badge: "C11",
        }}
        onSaveSettings={handleSaveSettings}
        customApiKey={customApiKey}
        customBaseURL={customBaseURL}
        defaultBaseURL={defaultBaseURL}
      />

      {/* 面包屑导航栏 */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-30 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800/60">
              C11
            </span>
            <span className="text-slate-400">Context Engineering 专项实战</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-200 font-medium">
              第 11 课：一次 Retrieval 够吗？—— Agentic Retrieval（自主多轮检索与路径探索）
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/lessons/context-c10-contextual-retrieval"
              className="text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
            >
              ← 上一课 (C10 Contextual Retrieval)
            </Link>
            <span className="text-slate-700">|</span>
            <Link
              to="/docs/lessons/context/11-agentic-retrieval-and-multihop.md"
              className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" />
              阅读本课深度讲义
            </Link>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 space-y-6">
        {/* 顶部面包屑与课程进度条 */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="flex items-center space-x-2 text-xs font-mono text-slate-400">
            <Link to="/lessons/context-c10-contextual-retrieval" className="hover:text-emerald-400 transition">
              C10: Contextual Retrieval
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-amber-400 font-semibold bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60">
              C11: Agentic Retrieval (当前)
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-slate-600 cursor-not-allowed">
              C12: Context Control & Budget
            </span>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <span className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-full border border-slate-800 text-slate-400">
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span>基准语料: {docCount} 篇文档</span>
            </span>
            <span className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-full border border-slate-800 text-slate-400">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>总 Token: {totalCorpusTokens.toLocaleString()}</span>
            </span>
            <Link
              to="/docs/lessons/context/11-agentic-retrieval-and-multihop.md"
              target="_blank"
              className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full border border-amber-500/30 transition font-medium"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>阅读本课讲义</span>
              <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
            </Link>
          </div>
        </div>

        {/* 课程标题与问题链引言 */}
        <div className="space-y-2">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-rose-500/20 border border-amber-500/30 text-amber-400">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Context Engineering · 进阶实战
                </span>
                <span className="text-xs font-mono text-slate-400">Lesson C11</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
                一次 Retrieval 够吗？
                <span className="text-sm font-normal text-slate-400">—— Agentic Retrieval 自主多轮检索与路径探索</span>
              </h1>
            </div>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed max-w-4xl">
            在第 10 课中，切片自足率达到了 $100\%$，但传统 RAG 始终隐含着一个致命假定：<strong>开发者替模型“提前预先代搜一次”</strong>。面对需要跨多篇文档、寻找后验线索的多跳推理问题，单次检索必然面临“查询稀释与线索未知”的物理极限。本课将检索原语原子化为工具，让 Agent 在 ReAct 循环中自主推理、决策与探索。
          </p>
        </div>

        {/* 标签栏切换 */}
        <div className="flex space-x-2 border-b border-slate-800">
          <button
            onClick={() => setActiveTab("studio")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              activeTab === "studio"
                ? "border-amber-500 text-amber-400 bg-amber-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Compass className="w-4 h-4" />
            多跳推理与路径探索工坊
          </button>
          <button
            onClick={() => setActiveTab("showdown")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              activeTab === "showdown"
                ? "border-amber-500 text-amber-400 bg-amber-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-4 h-4" />
            五方策略全景对决矩阵
          </button>
          <button
            onClick={() => setActiveTab("architecture")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              activeTab === "architecture"
                ? "border-amber-500 text-amber-400 bg-amber-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-4 h-4" />
            核心第一性原理与控制危机
          </button>
        </div>

        {/* TAB 1: 多跳推理与路径探索工坊 */}
        {activeTab === "studio" && (
          <div className="space-y-6">
            {/* 顶栏控制面板：选择用例与参数 */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4 shadow-lg shadow-black/20">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-semibold text-slate-200">选择基准多跳用例</span>
                  <span className="text-xs text-slate-400 font-mono">（共 5 组多跳复杂场景）</span>
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs select-none transition font-medium ${
                      isKeyAvailable
                        ? "bg-emerald-950/50 border-emerald-700/70 text-emerald-300 shadow-sm"
                        : "bg-slate-900 border-slate-800 text-slate-400"
                    }`}
                    title={
                      isKeyAvailable
                        ? "真实大模型 ReAct 在线驱动引擎已就绪"
                        : "未检测到 API Key，请在顶部导航栏点击「配置 API Key」"
                    }
                  >
                    <span className="relative flex h-2 w-2">
                      <span
                        className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                          isKeyAvailable ? "bg-emerald-400" : "bg-slate-500"
                        }`}
                      />
                      <span
                        className={`relative inline-flex rounded-full h-2 w-2 ${
                          isKeyAvailable ? "bg-emerald-500" : "bg-slate-400"
                        }`}
                      />
                    </span>
                    <span>真实 ReAct 驱动 {isKeyAvailable ? "(已连接模型)" : "(需配置 Key)"}</span>
                  </div>
                  <button
                    onClick={runComparison}
                    disabled={isRunningComparison}
                    className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-bold px-4 py-1.5 rounded-lg shadow-md transition disabled:opacity-50 text-xs"
                  >
                    {isRunningComparison ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    <span>{isRunningComparison ? "推理探索中..." : "执行多跳推理对决"}</span>
                  </button>
                </div>
              </div>

              {/* 用例选择芯片组 */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                {cases.map((c: MultiHopTestCase) => {
                  const isSelected = c.id === selectedCaseId;
                  const isTrap = Boolean(c.isAdversarialTrap);
                  return (
                    <button
                      key={c.id}
                      onClick={() => handleSelectCase(c)}
                      className={`text-left p-2.5 rounded-lg border text-xs transition flex flex-col justify-between gap-1.5 ${
                        isSelected
                          ? isTrap
                            ? "bg-rose-950/40 border-rose-500 text-rose-200"
                            : "bg-amber-950/40 border-amber-500 text-amber-200"
                          : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                          {c.id}
                        </span>
                        {isTrap ? (
                          <span className="text-[10px] text-rose-400 font-medium flex items-center gap-0.5">
                            <Flame className="w-3 h-3" /> 陷阱用例
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-400 font-medium">3跳推理</span>
                        )}
                      </div>
                      <div className="font-medium line-clamp-1 text-slate-200">{c.title}</div>
                      <div className="text-[10px] text-slate-400 line-clamp-1">{c.category}</div>
                    </button>
                  );
                })}
              </div>

              {/* 当前问题详情卡片 */}
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-amber-400 shrink-0">当前提问:</span>
                  <span className="text-slate-200 leading-relaxed font-mono">{currentCase.query}</span>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                  <span className="flex items-center gap-1">
                    <span className="text-slate-400">逻辑链条:</span>
                    <span className="text-slate-300">{currentCase.goldenReasoning}</span>
                  </span>
                  <span className="flex items-center gap-1 shrink-0 ml-auto">
                    <span className="text-slate-400">必须闭合证据:</span>
                    <span className="text-amber-300 font-semibold">{currentCase.requiredFacts.length} 项</span>
                  </span>
                </div>
              </div>

              {/* 对决执行状态与裁决横幅 (Showdown Status & Live Calling Process Monitor) */}
              {isRunningComparison ? (
                <div className="p-4 rounded-xl bg-gradient-to-r from-amber-950/70 via-slate-900/90 to-amber-950/70 border border-amber-500/60 shadow-xl shadow-amber-950/30 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-amber-900/40">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                        <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-amber-300 flex items-center gap-2">
                          <span>多跳推理探索中 · 实时调用监控</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-700">
                            ONLINE LIVE REACT
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-0.5">
                          {liveCurrentStep?.statusText || "大模型正在自主拆解意图并调用检索工具..."}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono ml-auto">
                      <div className="px-2.5 py-1 rounded bg-slate-950 border border-amber-900/60 flex items-center gap-1.5 text-slate-300">
                        <span className="text-slate-400">当前进度:</span>
                        <span className="text-amber-300 font-bold">
                          第 {liveCurrentStep?.stepNumber || 1} / {liveCurrentStep?.maxSteps || 6} 步
                        </span>
                      </div>
                      {liveCurrentStep?.tool && (
                        <div className="px-2.5 py-1 rounded bg-slate-950 border border-cyan-800 flex items-center gap-1.5 text-cyan-300">
                          <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{liveCurrentStep.tool}()</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 正在执行的 Thought 与 Tool 行 */}
                  {(liveCurrentStep?.thought || liveCurrentStep?.tool) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      {liveCurrentStep.thought && (
                        <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/40 flex items-start gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <span className="font-mono text-[10px] text-amber-400 uppercase font-semibold">
                              Current Thought (思考假设)
                            </span>
                            <p className="text-slate-200 text-[11px] leading-relaxed line-clamp-2">
                              {liveCurrentStep.thought}
                            </p>
                          </div>
                        </div>
                      )}
                      {liveCurrentStep.tool && (
                        <div className="p-2.5 rounded-lg bg-slate-950/80 border border-cyan-800/50 flex items-start gap-2 font-mono">
                          <Terminal className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                          <div className="space-y-0.5 overflow-hidden">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-cyan-400 uppercase font-semibold">
                                Tool Invocation (执行工具)
                              </span>
                              <span className="text-[9px] text-cyan-300 bg-cyan-950 px-1 rounded border border-cyan-800 animate-pulse">
                                Executing
                              </span>
                            </div>
                            <p className="text-slate-300 text-[11px] truncate">
                              {liveCurrentStep.tool}({JSON.stringify(liveCurrentStep.args || {})})
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 实时调用流终端 (Live Call Stream Terminal) */}
                  <div className="p-2.5 rounded-lg bg-black/90 border border-slate-800 text-[11px] font-mono space-y-1 max-h-36 overflow-y-auto">
                    <div className="text-[10px] text-slate-400 flex items-center justify-between pb-1 border-b border-slate-800/60 font-sans">
                      <span className="flex items-center gap-1 font-mono">
                        <Terminal className="w-3 h-3 text-amber-400" />
                        <span>实时调用事件流（Live Events Feed · 共 {liveLogs.length} 条记录）：</span>
                      </span>
                      <span className="animate-pulse text-amber-400 font-mono text-[9px]">● LIVE STREAMING</span>
                    </div>
                    {liveLogs.length === 0 ? (
                      <div className="text-slate-400 py-1">等待模型生成第一轮工具调用决策...</div>
                    ) : (
                      liveLogs.map((log) => (
                        <div key={log.id} className="flex items-start gap-2 leading-tight">
                          <span className="text-slate-400 shrink-0 select-none">[{log.time}]</span>
                          <span
                            className={
                              log.type === "fact"
                                ? "text-emerald-400 font-bold"
                                : log.type === "tool"
                                ? "text-cyan-300"
                                : log.type === "thought"
                                ? "text-amber-300"
                                : log.type === "obs"
                                ? "text-slate-300"
                                : log.type === "error"
                                ? "text-rose-400"
                                : log.type === "done"
                                ? "text-emerald-300 font-bold"
                                : "text-slate-400"
                            }
                          >
                            {log.text}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : lastExecution ? (
                <div
                  className={`p-4 rounded-xl border transition-all shadow-lg space-y-3 ${
                    lastExecution.mode === "live"
                      ? "bg-gradient-to-r from-emerald-950/60 via-slate-900/90 to-teal-950/60 border-emerald-500/60 shadow-emerald-950/20"
                      : "bg-gradient-to-r from-amber-950/50 via-slate-900/90 to-slate-900/90 border-amber-500/40 shadow-amber-950/20"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${
                          lastExecution.mode === "live"
                            ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                            : "bg-amber-500/20 border-amber-500/40 text-amber-300"
                        }`}
                      >
                        {lastExecution.mode === "live" ? (
                          <Sparkles className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <Zap className="w-5 h-5 text-amber-400" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-bold flex items-center gap-2">
                          <span className={lastExecution.mode === "live" ? "text-emerald-300" : "text-amber-300"}>
                            {lastExecution.mode === "live"
                              ? "🎉 真实大模型在线 ReAct 对决已完成！"
                              : "⚡ 基准预置对照仿真运行完成！"}
                          </span>
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                              lastExecution.mode === "live"
                                ? "bg-emerald-950/80 text-emerald-300 border-emerald-800"
                                : "bg-amber-950/80 text-amber-300 border-amber-800"
                            }`}
                          >
                            {lastExecution.mode === "live" ? "ONLINE LIVE LLM" : "CURATED REPLAY"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-0.5">
                          {lastExecution.mode === "live"
                            ? "真实大模型自主规划了探索路径，通过动态工具调用完成了后验线索追踪与事实闭合。"
                            : "当前未配置大模型 API Key，已回退至标准基准轨迹。配置 Key 后将无缝切换为真实大模型实时自主推演。"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs font-mono ml-auto">
                      <div className="px-2.5 py-1 rounded bg-slate-950/80 border border-slate-800 flex items-center gap-1.5 text-slate-300">
                        <span className="text-slate-400">时间:</span>
                        <span className="text-amber-300 font-bold">{lastExecution.time}</span>
                      </div>
                      <div className="px-2.5 py-1 rounded bg-slate-950/80 border border-slate-800 flex items-center gap-1.5 text-slate-300">
                        <span className="text-slate-400">总耗时:</span>
                        <span className="text-cyan-300 font-bold">
                          {(lastExecution.latencyMs / 1000).toFixed(1)}s
                        </span>
                      </div>
                      <div className="px-2.5 py-1 rounded bg-slate-950/80 border border-slate-800 flex items-center gap-1.5 text-slate-300">
                        <span className="text-slate-400">探索步数:</span>
                        <span className="text-emerald-300 font-bold">{lastExecution.stepsCount} 步</span>
                      </div>
                      <div className="px-2.5 py-1 rounded bg-slate-950/80 border border-slate-800 flex items-center gap-1.5 text-slate-300">
                        <span className="text-slate-400">事实闭合:</span>
                        <span className="text-emerald-400 font-bold">
                          {lastExecution.factsRecalled}/{lastExecution.totalFacts} 项
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 查看完整调用日志抽屉按钮 */}
                  {liveLogs.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/60">
                      <button
                        onClick={() => setShowLiveLogsDrawer(!showLiveLogsDrawer)}
                        className="text-[11px] text-slate-400 hover:text-amber-300 flex items-center gap-1.5 font-mono transition"
                      >
                        <Terminal className="w-3.5 h-3.5 text-amber-400" />
                        <span>{showLiveLogsDrawer ? "收起本次探索调用过程日志" : `查看本次探索调用过程日志 (${liveLogs.length} 条记录)`}</span>
                        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showLiveLogsDrawer ? "rotate-90 text-amber-400" : ""}`} />
                      </button>

                      {showLiveLogsDrawer && (
                        <div className="mt-2 p-2.5 rounded-lg bg-black/90 border border-slate-800 text-[11px] font-mono space-y-1 max-h-48 overflow-y-auto">
                          {liveLogs.map((log) => (
                            <div key={log.id} className="flex items-start gap-2 leading-tight">
                              <span className="text-slate-400 shrink-0 select-none">[{log.time}]</span>
                              <span
                                className={
                                  log.type === "fact"
                                    ? "text-emerald-400 font-bold"
                                    : log.type === "tool"
                                    ? "text-cyan-300"
                                    : log.type === "thought"
                                    ? "text-amber-300"
                                    : log.type === "obs"
                                    ? "text-slate-300"
                                    : log.type === "error"
                                    ? "text-rose-400"
                                    : log.type === "done"
                                    ? "text-emerald-300 font-bold"
                                    : "text-slate-400"
                                }
                              >
                                {log.text}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      本工坊已全面接入<strong>真实大模型 ReAct 驱动引擎</strong>。点击上方
                      <span className="text-amber-300 font-medium">「执行多跳推理对决」</span>
                      ，模型将以自主智能体模式调用文档检索工具，实时进行链式推理闭合证据链！
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                    Live Engine Ready
                  </span>
                </div>
              )}
            </div>

            {/* 左右分屏对比：传统单次静态 RAG vs 多轮智能体探索 */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* 左侧：传统单次检索（C10 终极管线被动检索） */}
              <div className="lg:col-span-5 space-y-4">
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-rose-500" />
                      <h2 className="text-sm font-bold text-slate-200">C10 静态单次被动检索</h2>
                    </div>
                    <span className="text-[11px] font-mono text-rose-400 bg-rose-950/50 px-2 py-0.5 rounded border border-rose-900">
                      Passive Single-Shot
                    </span>
                  </div>

                  <p className="text-xs text-slate-400">
                    系统替模型预先代搜一次（Contextual + Hybrid RRF + Small-to-Big 父展开），直接注入 Prompt。
                  </p>

                  {/* 单次指标状态 */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-400">事实召回率</div>
                      <div className="text-lg font-bold text-rose-400">
                        {singleShotData ? `${Math.round(singleShotData.factRecall * 100)}%` : "33%"}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-400">推理完整度</div>
                      <div className="text-lg font-bold text-amber-400">
                        {singleShotData ? `${Math.round(singleShotData.reasoningScore * 100)}%` : "48%"}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-400">注入 Token</div>
                      <div className="text-lg font-bold text-slate-300">
                        {singleShotData ? singleShotData.totalTokens : 780}
                      </div>
                    </div>
                  </div>

                  {/* 缺失的决定性证据警告 */}
                  <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/40 text-xs space-y-2">
                    <div className="flex items-center gap-1.5 font-semibold text-rose-300">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>单次检索导致的致命证据丢失：</span>
                    </div>
                    <ul className="space-y-1 text-slate-400 text-[11px]">
                      {currentCase.requiredFacts.map((rf: RequiredFact, idx: number) => (
                        <li key={rf.id} className="flex items-start gap-1.5">
                          {idx === 0 ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <X className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                          )}
                          <span className={idx === 0 ? "text-slate-300" : "text-rose-300/80 line-through"}>
                            {rf.fact}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* 模型作答诊断 */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span>最终回答形态诊断：</span>
                    </span>
                    <div className="p-3 rounded-lg bg-slate-950 text-xs text-slate-300 leading-relaxed border border-slate-800 font-mono whitespace-pre-wrap">
                      {singleShotData?.answerSnippet ||
                        (currentCase.isAdversarialTrap
                          ? "【模型受骗】单次混合检索把含有端口 9443 的 Alpha 文档强行当作 Top-1 喂给模型，模型发生严重幻觉，宣称 Delta 量子加密协议为 AlphaSyncDaemon 伴生协议，张冠李戴。"
                          : "【残缺与臆造】模型回答了推荐 Beta，但漏掉了核心利器 BetaGammaConnector 插件名；关于组合优惠，由于检索未命中 pricing.md 中的 Egress Free 条款，模型宣称'文档未提及组合折扣'，推理不完整。")}
                    </div>
                  </div>
                </div>
              </div>

              {/* 右侧：自主多轮智能体检索（ReAct 探索轨迹） */}
              <div className="lg:col-span-7 space-y-4">
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      <h2 className="text-sm font-bold text-amber-300">C11 自主多轮智能体检索 (Agentic Retrieval)</h2>
                    </div>
                    {agenticData?.mode === "live_llm" ? (
                      <span className="text-[11px] font-mono text-emerald-300 bg-emerald-950/80 px-2.5 py-0.5 rounded border border-emerald-600 flex items-center gap-1 font-bold">
                        <Sparkles className="w-3 h-3 text-emerald-400" />
                        Live LLM 真实推演
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
                        基准预置 (Curated)
                      </span>
                    )}
                  </div>

                  {/* 智能体指标仪表盘 */}
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-400">事实闭合率</div>
                      <div className="text-lg font-bold text-emerald-400">
                        {agenticData ? `${Math.round(agenticData.factRecallRate * 100)}%` : "100%"}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-400">推理准确率</div>
                      <div className="text-lg font-bold text-emerald-400">
                        {agenticData ? `${Math.round(agenticData.reasoningAccuracy * 100)}%` : "100%"}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-400">探索步数</div>
                      <div className="text-lg font-bold text-amber-400">
                        {agenticData ? `${agenticData.totalSteps} 步` : "4 步"}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-400">总注入 Token</div>
                      <div className="text-lg font-bold text-cyan-400">
                        {agenticData ? agenticData.totalInjectedTokens : 680}
                      </div>
                    </div>
                  </div>

                  {/* 如果是过度检索陷阱用例，高亮警示条 */}
                  {agenticData?.isTrapOverSearched && (
                    <div className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-500/50 text-xs space-y-2">
                      <div className="flex items-center gap-2 font-bold text-rose-300 text-sm">
                        <Flame className="w-4 h-4 text-rose-400" />
                        <span>过度检索危机现场（直通第 12 课）：</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed">
                        当目标实体属于虚构或不存在时，缺乏预算控制的 Agent 会盲目发起 <strong>8 次连续工具调用</strong>（消耗 1,890 Tokens 与 3.4 秒耗时），对话上下文呈二次方堆叠膨胀！这生动证明了：<strong>智能体检索如果不加预算与置信度控制，将引发系统性灾难。</strong>
                      </p>
                    </div>
                  )}

                  {/* 最终结构化输出（Final Synthesized Answer）—— 提升到顶部，首屏即见 */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-emerald-900/60 shadow-lg space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>智能体最终综合裁决响应（Final Synthesized Answer）</span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {agenticData?.mode === "live_llm" ? "🟢 真实模型推理生成" : "标准基准结论"}
                      </span>
                    </div>

                    {/* 裁决正文 */}
                    <div className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800 text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap selection:bg-emerald-900 selection:text-emerald-100">
                      {isRunningComparison && !agenticData?.finalAnswer ? (
                        <div className="flex items-center gap-2 text-amber-300 font-mono text-xs py-1">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
                          <span>正在自主多轮检索知识库并搜集必要证据，待证据链闭合后生成最终综合裁决...</span>
                        </div>
                      ) : (
                        agenticData?.finalAnswer || "暂无裁决数据。"
                      )}
                    </div>

                    {/* 已捕获闭合的关键证据链状态 */}
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Database className="w-3.5 h-3.5 text-amber-400" />
                          <span>多跳推理捕获的核心证据网：</span>
                        </span>
                        <span className="font-mono text-emerald-400 text-[10px]">
                          {currentCase.requiredFacts.length > 0
                            ? `${
                                currentCase.requiredFacts.filter((rf) =>
                                  isFactCaptured(rf, agenticData)
                                ).length
                              } / ${currentCase.requiredFacts.length} 项闭合`
                            : "全部闭合"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-1.5">
                        {currentCase.requiredFacts.map((rf: RequiredFact, idx: number) => {
                          const isCaptured =
                            isFactCaptured(rf, agenticData) ||
                            (!agenticData && idx === 0);

                          return (
                            <div
                              key={rf.id}
                              className={`flex items-start gap-2 p-2 rounded text-xs border ${
                                isCaptured
                                  ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-200"
                                  : "bg-rose-950/20 border-rose-900/40 text-rose-300/80"
                              }`}
                            >
                              {isCaptured ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                              )}
                              <div className="space-y-0.5 flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-mono text-[10px] text-slate-400">
                                    证据 {idx + 1} ({rf.id})
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-400">
                                    源自: {rf.sourceDocId}
                                  </span>
                                </div>
                                <div className="text-slate-200 text-[11px] leading-relaxed">{rf.fact}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* 推理图谱与交互时间线 (Visual Trajectory Timeline) */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between text-xs text-slate-300 font-semibold pb-1 border-b border-slate-800/80">
                      <span className="flex items-center gap-1.5">
                        <GitCommit className="w-4 h-4 text-amber-400" />
                        <span>多跳推理轨迹详情（Trajectory Trace · 共 {agenticData?.steps.length || 0} 步）</span>
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        耗时: {agenticData?.totalLatencyMs || 1420}ms · Token: {agenticData?.totalInjectedTokens || 680}
                      </span>
                    </div>

                    {/* 工具调用步骤链路芯片组 */}
                    {agenticData && agenticData.steps.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pb-1">
                        {agenticData.steps.map((step) => {
                          const isFinish = step.toolCall.tool === "finish";
                          return (
                            <div
                              key={step.stepNumber}
                              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border ${
                                isFinish
                                  ? "bg-emerald-950/60 border-emerald-700 text-emerald-300"
                                  : "bg-slate-950 border-slate-800 text-slate-300"
                              }`}
                            >
                              <span className="text-amber-400 font-bold">#{step.stepNumber}</span>
                              <span>{step.toolCall.tool}()</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 步骤详情列表容器：带最大高度与滚动条，避免无限垂直拉伸 */}
                    <div className="max-h-[480px] overflow-y-auto pr-1 space-y-2.5 relative before:absolute before:top-3 before:bottom-3 before:left-3.5 before:w-0.5 before:bg-slate-800">
                      {agenticData?.steps.map((step) => {
                        const isFinish = step.toolCall.tool === "finish";
                        return (
                          <div
                            key={step.stepNumber}
                            className="relative pl-8 text-xs transition group"
                          >
                            {/* 节点图标 */}
                            <div
                              className={`absolute left-1.5 top-2.5 -translate-x-1/2 w-4 h-4 rounded-full border flex items-center justify-center text-[9px] font-mono font-bold ${
                                isFinish
                                  ? "bg-emerald-500 border-emerald-400 text-slate-950"
                                  : "bg-slate-900 border-amber-500 text-amber-300"
                              }`}
                            >
                              {step.stepNumber}
                            </div>

                            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/90 space-y-2 hover:border-slate-700 transition">
                              {/* 步骤意图 Thought */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-1">
                                  <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-semibold flex items-center gap-1">
                                    <Sparkles className="w-3 h-3" /> Thought (意图假设)
                                  </span>
                                  <p className="text-slate-300 leading-relaxed">{step.thought}</p>
                                </div>
                                <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                  {step.latencyMs}ms · {step.tokensEstimated} tok
                                </span>
                              </div>

                              {/* 工具调用 Action */}
                              <div className="p-2 rounded bg-slate-900/90 border border-slate-800/80 font-mono text-[11px] space-y-1">
                                <div className="flex items-center justify-between text-slate-400">
                                  <span className="text-amber-300 font-semibold flex items-center gap-1">
                                    <Terminal className="w-3 h-3" />
                                    {step.toolCall.tool}()
                                  </span>
                                  <span className="text-[10px] text-slate-400">Tool Execution</span>
                                </div>
                                <div className="text-slate-400 text-[10px] truncate">
                                  参数: {JSON.stringify(step.toolCall.args)}
                                </div>
                              </div>

                              {/* 观测 Observation */}
                              <div className="space-y-1">
                                <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-semibold">
                                  Observation (捕获事实与出处)
                                </span>
                                <p className="text-slate-400 leading-relaxed text-[11px] bg-slate-900/50 p-2 rounded border border-slate-800/50 font-mono whitespace-pre-wrap">
                                  {step.observation}
                                </p>
                              </div>

                              {/* 本步事实总结 */}
                              {step.discoveredFact && (
                                <div className="flex items-start gap-2.5 text-xs text-emerald-300 bg-emerald-950/70 p-3 rounded-lg border border-emerald-600/80 shadow-md">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                  <div className="space-y-0.5">
                                    <div className="font-semibold text-emerald-400 font-mono flex items-center gap-1.5">
                                      <span>【本步事实总结 / 关键沉淀】</span>
                                    </div>
                                    <div className="text-slate-100 font-medium leading-relaxed">
                                      {step.discoveredFact}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* 如果正在执行且当前步骤正在探索中，展示呼吸占位卡片 */}
                      {isRunningComparison && (
                        <div className="relative pl-8 text-xs animate-pulse">
                          <div className="absolute left-1.5 top-2.5 -translate-x-1/2 w-4 h-4 rounded-full border border-amber-400 bg-amber-950 flex items-center justify-center text-[9px] font-mono font-bold text-amber-300">
                            <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                          </div>
                          <div className="p-3 rounded-lg bg-slate-950/90 border border-amber-500/50 space-y-2">
                            <div className="flex items-center justify-between text-amber-300 font-mono text-[11px] font-semibold">
                              <span>第 {liveCurrentStep?.stepNumber || 1} 步探索进行中...</span>
                              <span className="text-[10px] text-amber-400/80">Active Step</span>
                            </div>
                            {liveCurrentStep?.thought && (
                              <div className="text-slate-300 text-xs">
                                <span className="text-amber-400 font-semibold font-mono">Thought: </span>
                                {liveCurrentStep.thought}
                              </div>
                            )}
                            {liveCurrentStep?.tool && (
                              <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono text-cyan-300 flex items-center gap-1.5">
                                <Terminal className="w-3 h-3 text-cyan-400" />
                                <span>调用中: {liveCurrentStep.tool}({JSON.stringify(liveCurrentStep.args || {})})</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: 五方策略全景对决矩阵 */}
        {activeTab === "showdown" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800">
              <div className="space-y-1">
                <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400" />
                  <span>5 大多跳用例 × 5 种检索策略全景对决大比武</span>
                </h2>
                <p className="text-xs text-slate-400">
                  真实对比词法 (Lexical)、向量 (Dense)、C10 终极混合精排、规则子查询分解 (Multi-Query) 与 Agentic Retrieval 的端到端效能。
                </p>
              </div>
              <button
                onClick={refreshMatrix}
                disabled={isRefreshingMatrix}
                className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingMatrix ? "animate-spin" : ""}`} />
                <span>重新测算矩阵</span>
              </button>
            </div>

            {/* 全景对决表格 */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                      <th className="p-3.5 font-semibold">评测用例 (Case)</th>
                      <th className="p-3.5 font-semibold">单次关键词 (Lexical)</th>
                      <th className="p-3.5 font-semibold">单次向量 (Dense)</th>
                      <th className="p-3.5 font-semibold">C10 混合管线 (Contextual)</th>
                      <th className="p-3.5 font-semibold">规则子查询 (Multi-Query)</th>
                      <th className="p-3.5 font-semibold text-amber-300">智能体检索 (Agentic)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {matrixRows.map((row) => {
                      const isTrap = row.isTrap;
                      return (
                        <tr
                          key={row.caseId}
                          className={`hover:bg-slate-800/30 transition ${
                            isTrap ? "bg-rose-950/10" : ""
                          }`}
                        >
                          <td className="p-3.5 font-sans">
                            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                              {row.title}
                              {isTrap && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-950 border border-rose-800 text-rose-300">
                                  陷阱
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">{row.category}</div>
                          </td>

                          {/* 1. Lexical */}
                          <td className="p-3.5">
                            <div className="text-slate-300 font-bold">
                              {Math.round(row.strategies.single_lexical.factRecall * 100)}%
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {row.strategies.single_lexical.totalTokens} tok · {row.strategies.single_lexical.latencyMs}ms
                            </div>
                          </td>

                          {/* 2. Dense */}
                          <td className="p-3.5">
                            <div className="text-slate-300 font-bold">
                              {Math.round(row.strategies.single_dense.factRecall * 100)}%
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {row.strategies.single_dense.totalTokens} tok · {row.strategies.single_dense.latencyMs}ms
                            </div>
                          </td>

                          {/* 3. C10 Hybrid */}
                          <td className="p-3.5">
                            <div className="text-amber-400 font-bold">
                              {Math.round(row.strategies.c10_hybrid.factRecall * 100)}%
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {row.strategies.c10_hybrid.totalTokens} tok · {row.strategies.c10_hybrid.latencyMs}ms
                            </div>
                          </td>

                          {/* 4. Multi-Query */}
                          <td className="p-3.5">
                            <div className="text-cyan-400 font-bold">
                              {Math.round(row.strategies.multi_query.factRecall * 100)}%
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {row.strategies.multi_query.totalTokens} tok · {row.strategies.multi_query.latencyMs}ms
                            </div>
                          </td>

                          {/* 5. Agentic */}
                          <td className="p-3.5 bg-amber-950/20">
                            {isTrap ? (
                              <div>
                                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                  过度检索 (8步)
                                </span>
                                <div className="text-[10px] text-rose-400 mt-1 font-sans">
                                  1890 tok · 需 C12 预算
                                </div>
                              </div>
                            ) : (
                              <div>
                                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                  100% 事实闭环
                                </span>
                                <div className="text-[10px] text-slate-400 mt-1">
                                  {row.strategies.agentic.totalTokens} tok · {row.strategies.agentic.steps}步 · {row.strategies.agentic.latencyMs}ms
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 核心结论分析卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>多跳断裂彻底解决</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  在标准多跳用例（mh-01~04）中，Agentic 召回率从单次静态检索的 33% 跃升至 <strong>100%</strong>。动态线索探测让后验实体不再成为检索盲区。
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-cyan-400 text-sm font-semibold">
                  <Coins className="w-4 h-4" />
                  <span>Token 信噪比显著占优</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  相比规则子查询分解（Multi-Query）机械切句带来的 1,240 Token 暴力注入，Agentic 按需阅读切片并局部展开，平均仅消耗 <strong>680 Tokens</strong>，信息浓度更高。
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-rose-400 text-sm font-semibold">
                  <Flame className="w-4 h-4" />
                  <span>过度检索陷阱暴露</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  在 mh-05 虚构实体测试中，无约束 Agent 盲目发起 8 轮调用撑大窗口，真实暴露了智能体检索的“成本失控”隐患，天然推导引出第 12 课。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: 核心第一性原理与控制危机 */}
        {activeTab === "architecture" && (
          <div className="space-y-6">
            {/* 第一性原理与架构图解 */}
            <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
              <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
                <Cpu className="w-5 h-5 text-amber-400" />
                <span>从“预先代搜”到“智能体闭环”的第一性原理</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-300">
                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="font-bold text-rose-400 flex items-center gap-1.5">
                    <XCircle className="w-4 h-4" />
                    <span>单次检索失效的数学物理必然：</span>
                  </div>
                  <ul className="space-y-2 text-slate-400 leading-relaxed">
                    <li>
                      <strong className="text-slate-300">1. 查询稀释 (Query Dilution)：</strong>
                      复合提问包含多个不同主题词汇，稠密向量被平均池化拉向几何中心，与任何一个具体切片的余弦距离均显著增大；
                    </li>
                    <li>
                      <strong className="text-slate-300">2. 联合概率衰减：</strong>
                      P(F₁ ∩ F₂ ∩ F₃ ∈ Top-K) ≪ ∏ P(Fᵢ)，要让所有跨文档事实同时命中 Top-3，概率呈指数级坍塌；
                    </li>
                    <li>
                      <strong className="text-slate-300">3. 线索后验性：</strong>
                      第二跳的关键词（如专属插件名、规约章节号）在拿到第一跳结果前**根本无法被预知**。
                    </li>
                  </ul>
                </div>

                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Agentic Retrieval 的推理状态机：</span>
                  </div>
                  <ul className="space-y-2 text-slate-400 leading-relaxed">
                    <li>
                      <strong className="text-slate-300">1. 原语原子化：</strong>
                      将 search_text、search_semantic、read_chunk_parent 包装为 Agent 标准工具，严禁替它提前做主；
                    </li>
                    <li>
                      <strong className="text-slate-300">2. 假设检验循环 (ReAct)：</strong>
                      Thought（形成子假设）➔ Action（调用原子工具）➔ Observation（提取证据更新事实网）；
                    </li>
                    <li>
                      <strong className="text-slate-300">3. 证据链条自闭合：</strong>
                      当必要证据集合满足因果闭环后，主动调用 finish() 终止探索并输出高保真仲裁。
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 承上启下：第 12 课预告卡片 */}
            <div className="p-5 rounded-xl bg-gradient-to-br from-slate-900 to-amber-950/30 border border-amber-500/30 space-y-3 shadow-lg">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                <span>下一课展望：Agent 为什么会过度检索？—— 上下文控制与预算调度</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                在 mh-05-trap 实测中，我们亲眼见证了无节制 Agent 在遇到虚构实体时疯狂发起 8 次检索、导致历史上下文以 $O(N^2)$ 二次方暴涨的混沌局面。这表明：<strong>智能体检索绝不仅是“能力（Capability）”问题，更是“控制（Control）与预算（Budget）”问题。</strong>
              </p>
              <div className="pt-2 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono">
                  下一课核心原语：ContextBudget &#123; maxTokens, maxSearches, confidenceThreshold &#125;
                </span>
                <Link
                  to="/docs/lessons/context/11-agentic-retrieval-and-multihop.md"
                  target="_blank"
                  className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-semibold"
                >
                  <span>阅读详细思考题</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { useLoaderData } from "react-router";
import { Header } from "~/components/Header";
import type {
  CompactionRecord,
  ContextAgentResult,
  ContextStreamEvent,
  ContextTelemetry,
  RepoMapSummary,
  TruncationResult,
} from "~/core/context/types";
import {
  CONTEXT_BENCHMARKS,
} from "~/core/experiments/context-benchmarks";
import {
  Sparkles,
  Play,
  Terminal,
  Activity,
  AlertTriangle,
  Flame,
  Zap,
  ShieldCheck,
  CheckCircle,
  XCircle,
  Wrench,
  BookOpen,
  Scissors,
  Compass,
  Database,
  BarChart3,
} from "lucide-react";

export async function loader() {
  const hasServerKey = Boolean(
    process.env.LLM_API_KEY && process.env.LLM_API_KEY.trim().length > 0
  );

  const defaultModel = process.env.LLM_MODEL || "glm-4-flash";
  const defaultBaseURL =
    process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";

  const supportedModels = [
    {
      id: "glm-4-flash",
      name: "GLM-4-Flash",
      provider: "智谱清言 (Zhipu)",
      tag: "推荐 (极速/免费)",
    },
    {
      id: "glm-4-plus",
      name: "GLM-4-Plus",
      provider: "智谱清言 (Zhipu)",
      tag: "旗舰 (Coding 最强)",
    },
    {
      id: "glm-4-air",
      name: "GLM-4-Air",
      provider: "智谱清言 (Zhipu)",
      tag: "高性价比",
    },
    {
      id: "deepseek-chat",
      name: "DeepSeek V3",
      provider: "DeepSeek",
      tag: "代码与推理",
    },
    {
      id: "gpt-4o",
      name: "GPT-4o",
      provider: "OpenAI",
      tag: "通用旗舰",
    },
    {
      id: "claude-3-5-sonnet-20241022",
      name: "Claude 3.5 Sonnet",
      provider: "Anthropic",
      tag: "Agent 顶尖",
    },
  ];

  return {
    hasServerKey,
    defaultModel,
    defaultBaseURL,
    supportedModels,
  };
}

export default function LessonV5Page() {
  const { hasServerKey, defaultModel, defaultBaseURL, supportedModels } =
    useLoaderData<typeof loader>();

  // API Config State
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [customApiKey, setCustomApiKey] = useState("");
  const [customBaseURL, setCustomBaseURL] = useState(defaultBaseURL);

  useEffect(() => {
    const storedKey = localStorage.getItem("MINI_CLAUDE_API_KEY");
    if (storedKey) setCustomApiKey(storedKey);
    const storedURL = localStorage.getItem("MINI_CLAUDE_BASE_URL");
    if (storedURL) setCustomBaseURL(storedURL);
    const storedModel = localStorage.getItem("MINI_CLAUDE_MODEL");
    if (storedModel) setSelectedModel(storedModel);
  }, []);

  const handleSaveApiKey = (key: string) => {
    setCustomApiKey(key);
    localStorage.setItem("MINI_CLAUDE_API_KEY", key);
  };

  const handleSaveBaseURL = (url: string) => {
    setCustomBaseURL(url);
    localStorage.setItem("MINI_CLAUDE_BASE_URL", url);
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    localStorage.setItem("MINI_CLAUDE_MODEL", model);
  };

  const handleSaveSettings = ({
    apiKey,
    baseURL,
    model,
  }: {
    apiKey: string;
    baseURL: string;
    model: string;
  }) => {
    setCustomApiKey(apiKey);
    setCustomBaseURL(baseURL);
    setSelectedModel(model);
    localStorage.setItem("MINI_CLAUDE_API_KEY", apiKey);
    localStorage.setItem("MINI_CLAUDE_BASE_URL", baseURL);
    localStorage.setItem("MINI_CLAUDE_MODEL", model);
  };

  // Tab State: 'workbench' | 'benchmarks' | 'playgrounds' | 'lecture'
  const [activeTab, setActiveTab] = useState<
    "workbench" | "benchmarks" | "playgrounds" | "lecture"
  >("workbench");

  // Workbench Engine Mode: true (Context Engine Enabled) vs false (Raw Baseline)
  const [engineEnabled, setEngineEnabled] = useState(true);
  const [selectedWindowLimit, setSelectedWindowLimit] = useState<number>(128000);
  const [compactionMode, setCompactionMode] = useState<"standard_75" | "agile_3500">("standard_75");
  const [userPrompt, setUserPrompt] = useState(
    "全面扫描 app/core 下的所有子模块，总结每个核心模块的代码结构与导出类/函数清单。"
  );
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [maxSteps] = useState(15);
  const [thoughtStream, setThoughtStream] = useState("");
  const [events, setEvents] = useState<ContextStreamEvent[]>([]);
  const [, setLatestResult] = useState<ContextAgentResult | null>(null);
  const [activeTelemetry, setActiveTelemetry] = useState<ContextTelemetry>({
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    maxContextLimit: 128000,
    utilizationRate: 0,
    tokensSavedByPruning: 0,
    tokensSavedByTruncation: 0,
    tokensSavedByCompaction: 0,
    netTokensSaved: 0,
    currentMessageCount: 0,
    rawUncompactedTokens: 0,
  });

  const [repoMapSummary, setRepoMapSummary] = useState<RepoMapSummary | null>(null);
  const [compactionsList, setCompactionsList] = useState<CompactionRecord[]>([]);
  const [truncationEvents, setTruncationEvents] = useState<
    Array<{ step: number; toolName: string; truncation: TruncationResult }>
  >([]);

  // Dedicated Benchmark Execution State
  const [runningBenchmarkId, setRunningBenchmarkId] = useState<string | null>(null);
  const [benchmarkResults, setBenchmarkResults] = useState<Record<string, any>>({});

  // Playground States
  const [rawLogInput, setRawLogInput] = useState(
    `[INFO] Starting build process for mini-claude-code v1.0.0...
[INFO] Loading tsconfig.json configuration...
[DEBUG] Scanning source directory /app/core ...
[DEBUG] Compiling app/core/llm/client.ts ... OK (12ms)
[DEBUG] Compiling app/core/tools/executor.ts ... OK (18ms)
... (Simulating 450 lines of background Webpack module compilation) ...
[DEBUG] Emitting bundle asset chunk.592.js (1.4MB)
[DEBUG] Emitting bundle asset chunk.201.js (840KB)
[ERROR] in app/core/auth/middleware.ts:42:15
TypeError: Cannot read properties of undefined (reading 'verifyJwtSignature')
    at AuthenticateToken (app/core/auth/middleware.ts:42:15)
    at Layer.handle [as handle_request] (node_modules/express/lib/router/layer.js:95:5)
    at next (node_modules/express/lib/router/route.js:149:13)
    at Route.dispatch (node_modules/express/lib/router/route.js:119:3)
[FAIL] Build target 'production' failed with exit code: 1`
  );
  const [truncatorResult, setTruncatorResult] = useState<TruncationResult | null>(null);
  const [isTruncating, setIsTruncating] = useState(false);

  // Repo Map Playground State
  const [liveRepoMap, setLiveRepoMap] = useState<RepoMapSummary | null>(null);
  const [repoMapBudget, setRepoMapBudget] = useState(2000);
  const [isLoadingRepoMap, setIsLoadingRepoMap] = useState(false);

  const eventStreamEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    eventStreamEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events, thoughtStream]);

  // Run Agent SSE Stream
  const handleRunAgent = async (promptToRun?: string) => {
    const textToExecute = promptToRun || userPrompt;
    if (!textToExecute.trim() || isRunning) return;

    setIsRunning(true);
    setCurrentStep(0);
    setThoughtStream("");
    setEvents([]);
    setLatestResult(null);
    setTruncationEvents([]);
    setCompactionsList([]);

    const compactionTriggerTokens = compactionMode === "agile_3500" ? 3500 : undefined;

    try {
      const response = await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "run-agent",
          task: textToExecute,
          model: selectedModel,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          maxSteps,
          engineEnabled,
          contextEngineConfig: {
            maxContextLimit: selectedWindowLimit,
            compactionThreshold: 0.75,
            compactionTriggerTokens,
            enableRepoMapInjection: true,
          },
        }),
      });

      if (!response.ok) {
        let errMsg = "Agent request failed";
        try {
          const errJson = await response.json();
          errMsg = errJson.error || errJson.message || errMsg;
        } catch {
          errMsg = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errMsg);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data: ")) {
              const dataStr = trimmed.slice(6);
              try {
                const event: ContextStreamEvent = JSON.parse(dataStr);
                setEvents((prev) => [...prev, event]);

                if (event.type === "engine_initialized") {
                  setActiveTelemetry(event.telemetry);
                  if (event.repoMapSummary) {
                    setRepoMapSummary(event.repoMapSummary);
                  }
                } else if (event.type === "step_start") {
                  setCurrentStep(event.step);
                  setActiveTelemetry(event.telemetry);
                } else if (event.type === "thought") {
                  setThoughtStream(event.content);
                } else if (event.type === "tool_truncated") {
                  setTruncationEvents((prev) => [
                    ...prev,
                    {
                      step: event.step,
                      toolName: event.toolName,
                      truncation: event.truncation,
                    },
                  ]);
                } else if (event.type === "context_pruned") {
                  setActiveTelemetry(event.telemetry);
                } else if (event.type === "context_compacted") {
                  setCompactionsList((prev) => [...prev, event.compaction]);
                  setActiveTelemetry(event.telemetry);
                } else if (event.type === "step_end") {
                  setActiveTelemetry(event.telemetry);
                } else if (event.type === "agent_done") {
                  setLatestResult(event.result);
                  setActiveTelemetry(event.result.telemetry);
                  setCompactionsList(event.result.compactions);
                }
              } catch {
                // Ignore parse errors on partial chunks
              }
            }
          }
        }
      }
    } catch (err: any) {
      setEvents((prev) => [
        ...prev,
        { type: "error", message: err.message || String(err) },
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  // Run Dedicated Benchmark Experiments
  const handleRunDedicatedBenchmark = async (benchmarkId: string) => {
    setRunningBenchmarkId(benchmarkId);
    try {
      const res = await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "run-benchmark",
          benchmarkId,
          steps: 15,
          threshold: 2800,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setBenchmarkResults((prev) => ({
          ...prev,
          [benchmarkId]: data.result,
        }));
      }
    } catch (err: any) {
      alert(`Benchmark 执行失败: ${err.message}`);
    } finally {
      setRunningBenchmarkId(null);
    }
  };

  // Run Test Truncator Playground
  const handleTestTruncator = async () => {
    setIsTruncating(true);
    try {
      const res = await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "test-truncator",
          rawText: rawLogInput,
          maxLines: 8,
          headLines: 3,
          tailLines: 4,
          preserveErrors: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTruncatorResult(data.result);
      }
    } catch {
      // ignore
    } finally {
      setIsTruncating(false);
    }
  };

  // Run Test Repo Map
  const handleGenerateLiveRepoMap = async () => {
    setIsLoadingRepoMap(true);
    try {
      const res = await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "test-repo-map",
          tokenBudget: repoMapBudget,
          maxDepth: 4,
          includeSignatures: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLiveRepoMap(data.repoMap);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingRepoMap(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 font-sans selection:bg-purple-500/30 flex flex-col">
      <Header
        hasServerKey={hasServerKey}
        defaultModel={defaultModel}
        defaultBaseURL={defaultBaseURL}
        supportedModels={supportedModels}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
        customApiKey={customApiKey}
        onSaveApiKey={handleSaveApiKey}
        customBaseURL={customBaseURL}
        onSaveBaseURL={handleSaveBaseURL}
        onSaveSettings={handleSaveSettings}
        currentLesson={{
          id: "v5-context-engine",
          badge: "V5",
          title: "第 06 课: Context Engine 与上下文膨胀防御",
        }}
      />

      {/* Main Container */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Banner Hero */}
        <div className="glass-panel p-6 md:p-8 rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/40 via-[#0d1424] to-indigo-950/30 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative space-y-3 max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-bold">
                第 06 课 · V5 Context Engine
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-mono">
                Context Engineering & Compression
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Context Engine 与上下文膨胀防御
            </h1>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
              解决长流程开发与大型代码仓库下 Agent
              的“上下文暴涨、注意力稀释（Lost in the
              Middle）与巨型日志冲垮窗口”核心工业级痛点。通过
              <strong className="text-cyan-300">
                “智能日志截断 + Repo Map 代码地图 + 动态历史修剪 + 渐进式摘要压缩”
              </strong>
              四大支柱，实现上下文防御与超长程无限稳定运行。
            </p>
          </div>

          {/* Tab Navigation */}
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-800/80 pt-4">
            <button
              onClick={() => setActiveTab("workbench")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                activeTab === "workbench"
                  ? "bg-cyan-600 text-white shadow-lg shadow-cyan-500/20"
                  : "bg-[#111728] text-slate-300 hover:bg-[#162035] border border-slate-700/60"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>🔬 上下文引擎工作台 (Workbench)</span>
            </button>

            <button
              onClick={() => setActiveTab("benchmarks")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                activeTab === "benchmarks"
                  ? "bg-cyan-600 text-white shadow-lg shadow-cyan-500/20"
                  : "bg-[#111728] text-slate-300 hover:bg-[#162035] border border-slate-700/60"
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>🧪 3 大核心认知对照实验 (Benchmarks)</span>
            </button>

            <button
              onClick={() => setActiveTab("playgrounds")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                activeTab === "playgrounds"
                  ? "bg-cyan-600 text-white shadow-lg shadow-cyan-500/20"
                  : "bg-[#111728] text-slate-300 hover:bg-[#162035] border border-slate-700/60"
              }`}
            >
              <Scissors className="w-3.5 h-3.5 text-indigo-400" />
              <span>🛠️ 模块化算法调试台 (Playgrounds)</span>
            </button>

            <button
              onClick={() => setActiveTab("lecture")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                activeTab === "lecture"
                  ? "bg-cyan-600 text-white shadow-lg shadow-cyan-500/20"
                  : "bg-[#111728] text-slate-300 hover:bg-[#162035] border border-slate-700/60"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-purple-400" />
              <span>📖 讲义与架构原理解析 (Lecture)</span>
            </button>
          </div>
        </div>

        {/* ===================== TAB 1: WORKBENCH ===================== */}
        {activeTab === "workbench" && (
          <div className="space-y-6">
            {/* Live Token Telemetry HUD */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Card 1: Context Utilization */}
              <div className="glass-panel p-4 rounded-2xl border border-cyan-500/30 bg-[#0d1424]/90 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                    窗口使用率
                  </span>
                  <span className="font-mono text-cyan-300 font-bold">
                    {((activeTelemetry?.utilizationRate || 0) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      (activeTelemetry?.utilizationRate || 0) > 0.8
                        ? "bg-red-500"
                        : (activeTelemetry?.utilizationRate || 0) > 0.6
                        ? "bg-amber-500"
                        : "bg-gradient-to-r from-cyan-500 to-indigo-500"
                    }`}
                    style={{
                      width: `${Math.max(
                        1,
                        Math.min(100, (activeTelemetry?.utilizationRate || 0) * 100)
                      )}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-400 pt-1">
                  <span>当前: {(activeTelemetry?.totalTokens || 0).toLocaleString()} Tok</span>
                  <span>
                    上限: {selectedWindowLimit / 1000}k ({selectedWindowLimit.toLocaleString()} Tok)
                  </span>
                </div>
              </div>

              {/* Card 2: Net Tokens Saved */}
              <div className="glass-panel p-4 rounded-2xl border border-emerald-500/30 bg-[#0d1424]/90 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Scissors className="w-3.5 h-3.5 text-emerald-400" />
                    累计节省 Token
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                    Saved
                  </span>
                </div>
                <div className="text-2xl font-bold font-mono text-emerald-400">
                  +{(activeTelemetry?.netTokensSaved || 0).toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-400">
                  避免了 {((activeTelemetry?.netTokensSaved || 0) * 0.0001).toFixed(4)} $
                  的无效消耗
                </div>
              </div>

              {/* Card 3: Defense Breakdown */}
              <div className="glass-panel p-4 rounded-2xl border border-purple-500/30 bg-[#0d1424]/90 space-y-1.5 text-xs">
                <div className="text-slate-400 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                    防御机制贡献
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 font-mono text-[11px] pt-1">
                  <div className="bg-[#111728] p-1.5 rounded border border-slate-800 text-center">
                    <div className="text-[9px] text-slate-500">智能截断</div>
                    <div className="text-cyan-300">
                      {(activeTelemetry?.tokensSavedByTruncation || 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-[#111728] p-1.5 rounded border border-slate-800 text-center">
                    <div className="text-[9px] text-slate-500">历史修剪</div>
                    <div className="text-indigo-300">
                      {(activeTelemetry?.tokensSavedByPruning || 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-[#111728] p-1.5 rounded border border-slate-800 text-center">
                    <div className="text-[9px] text-slate-500">摘要压缩</div>
                    <div className="text-purple-300">
                      {(activeTelemetry?.tokensSavedByCompaction || 0).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 4: Engine Status & Controls */}
              <div className="glass-panel p-4 rounded-2xl border border-slate-800 bg-[#0d1424]/90 space-y-2">
                <div className="text-xs text-slate-400 flex items-center justify-between">
                  <span>窗口 / 压缩策略</span>
                  <div className="flex items-center gap-1">
                    <select
                      value={selectedWindowLimit}
                      onChange={(e) => {
                        const newLimit = Number(e.target.value);
                        setSelectedWindowLimit(newLimit);
                        setActiveTelemetry((prev) => ({
                          ...prev,
                          maxContextLimit: newLimit,
                          utilizationRate: Math.min(1, prev.totalTokens / newLimit),
                        }));
                      }}
                      className="bg-[#111728] border border-slate-700 rounded px-1.5 py-0.5 text-[10px] font-mono text-cyan-300 focus:outline-none"
                    >
                      <option value={128000}>128k (标准)</option>
                      <option value={64000}>64k</option>
                      <option value={32000}>32k</option>
                      <option value={200000}>200k</option>
                    </select>
                    <select
                      value={compactionMode}
                      onChange={(e) => setCompactionMode(e.target.value as any)}
                      className="bg-[#111728] border border-slate-700 rounded px-1.5 py-0.5 text-[10px] font-mono text-purple-300 focus:outline-none"
                    >
                      <option value="standard_75">75% 水位线</option>
                      <option value="agile_3500">敏捷 3.5k 演示</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-300">防上下文膨胀</span>
                  <button
                    onClick={() => setEngineEnabled(!engineEnabled)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      engineEnabled
                        ? "bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40"
                        : "bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700"
                    }`}
                  >
                    {engineEnabled ? "🟢 已开启" : "🔴 已禁用 (Raw)"}
                  </button>
                </div>
              </div>
            </div>

            {/* Input & Execution Bar */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    <span>执行长流程多文件任务</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    输入需要多步探索、跨文件读取或分析的复杂任务，观察 Context Engine 全程护航
                  </p>
                </div>

                {/* Quick Multi-step Prompts */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 font-mono">
                    多步探索预设:
                  </span>
                  {[
                    "全面扫描 app/core 下的所有子模块，总结每个核心模块的代码结构与导出清单",
                    "分析 app/core/tools 中有哪些内置工具及其具体入参 Schema 约束",
                    "排查 package.json 与 tsconfig.json，分析项目的构建配置与依赖健康度",
                  ].map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => setUserPrompt(p)}
                      className="px-2.5 py-1 rounded-lg bg-[#111728] hover:bg-[#182238] border border-slate-700/60 text-[11px] text-slate-300 transition text-left"
                    >
                      {p.slice(0, 22)}...
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <input
                  type="text"
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  placeholder="输入给 Agent 的指令..."
                  className="flex-1 px-4 py-2.5 rounded-xl bg-[#090d18] border border-slate-700/80 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 transition"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isRunning) {
                      handleRunAgent();
                    }
                  }}
                />
                <button
                  onClick={() => handleRunAgent()}
                  disabled={isRunning || !userPrompt.trim()}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center gap-2 shadow-lg shadow-cyan-600/20 transition shrink-0"
                >
                  {isRunning ? (
                    <>
                      <Zap className="w-4 h-4 animate-spin text-cyan-200" />
                      <span>执行中 (第 {currentStep} 步)...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      <span>启动 Agent</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Execution Inspector & Timeline */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Cols: Step Stream */}
              <div className="lg:col-span-2 glass-panel p-5 rounded-2xl border border-slate-800 space-y-4 flex flex-col min-h-[500px]">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-sm font-bold text-white">
                      实时执行流与上下文修剪轨迹
                    </h3>
                  </div>
                  {currentStep > 0 && (
                    <span className="text-xs font-mono text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                      Step {currentStep} / {maxSteps}
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto space-y-4 max-h-[600px] pr-2">
                  {events.length === 0 && !isRunning && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 py-16 space-y-3 text-center">
                      <Compass className="w-10 h-10 text-slate-600 animate-pulse" />
                      <div className="text-sm font-medium">
                        等待启动 Agent 执行任务
                      </div>
                      <div className="text-xs max-w-md leading-relaxed text-slate-400">
                        提示：点击上方预设中的
                        <span className="text-cyan-300">
                          “全面扫描 app/core 下的所有子模块...”
                        </span>
                        ，Agent 将进行多步跨文件深度分析。你将亲眼见证 Repo Map 导航、历史工具输出动态剪裁（Pruning）与快照压缩（Compaction）！
                      </div>
                    </div>
                  )}

                  {events.map((ev, idx) => {
                    if (ev.type === "engine_initialized") {
                      return (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-500/30 text-xs space-y-1.5 font-mono"
                        >
                          <div className="flex items-center gap-2 text-cyan-300 font-bold">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>[ContextEngine] 引擎初始化完成</span>
                          </div>
                          {ev.repoMapSummary && (
                            <div className="text-[11px] text-slate-400">
                              ✓ 已注入轻量 AST 代码地图 ({ev.repoMapSummary.totalFiles} 文件，{ev.repoMapSummary.signaturesExtracted} 签名，约 {ev.repoMapSummary.totalEstimatedTokens} Tokens)
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (ev.type === "step_start") {
                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-2 text-xs font-mono text-slate-400 pt-2 border-t border-slate-800/60"
                        >
                          <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-bold">
                            Step {ev.step}
                          </span>
                          <span>开始思考与动作决策...</span>
                        </div>
                      );
                    }

                    if (ev.type === "thought") {
                      return (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-[#0e1424] border border-slate-800 text-xs text-slate-300 leading-relaxed font-sans"
                        >
                          <div className="text-[10px] font-mono text-purple-400 font-semibold mb-1 flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            <span>模型思考 (Thought):</span>
                          </div>
                          <p className="whitespace-pre-wrap">{ev.content}</p>
                        </div>
                      );
                    }

                    if (ev.type === "tool_start") {
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-[#111728] border border-indigo-500/30 text-xs space-y-2"
                        >
                          <div className="text-indigo-300 font-mono font-semibold flex items-center gap-1.5">
                            <Wrench className="w-3.5 h-3.5" />
                            <span>发起工具调用 ({ev.toolCalls.length} 个):</span>
                          </div>
                          <div className="space-y-1.5">
                            {ev.toolCalls.map((tc) => (
                              <div
                                key={tc.id}
                                className="font-mono text-[11px] bg-[#090d18] p-2 rounded border border-slate-800 text-slate-300"
                              >
                                <span className="text-cyan-400 font-bold">
                                  {tc.function.name}
                                </span>
                                <span className="text-slate-500">
                                  ({tc.function.arguments})
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    if (ev.type === "tool_truncated") {
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-amber-300 font-semibold font-mono">
                            <span className="flex items-center gap-1.5">
                              <Scissors className="w-3.5 h-3.5" />
                              <span>
                                [智能截断生效] 工具 '{ev.toolName}' 输出被压缩
                              </span>
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
                              省下 {ev.truncation.tokensSaved} Tokens
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 space-y-0.5 font-mono">
                            <div>
                              • 原始行数: {ev.truncation.originalLines} 行 ➔ 保留: {ev.truncation.retainedLines} 行
                            </div>
                            {ev.truncation.errorLinesFound > 0 && (
                              <div className="text-emerald-400 font-bold">
                                ✓ 已成功捕获并强力保留 {ev.truncation.errorLinesFound} 处关键报错调用栈
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }

                    if (ev.type === "context_pruned") {
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-xs flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2 text-emerald-300 font-mono text-xs">
                            <Scissors className="w-3.5 h-3.5" />
                            <span>
                              [历史修剪] 早期陈旧工具结果已折叠，释放了注意力
                            </span>
                          </div>
                          <span className="font-mono text-xs text-emerald-400 font-bold">
                            +{ev.tokensSaved} Tokens 恢复
                          </span>
                        </div>
                      );
                    }

                    if (ev.type === "context_compacted") {
                      return (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/40 text-xs space-y-2"
                        >
                          <div className="flex items-center justify-between text-purple-300 font-bold font-mono">
                            <span className="flex items-center gap-1.5">
                              <Database className="w-3.5 h-3.5" />
                              <span>[高水位压缩] 触发渐进式多步摘要压缩</span>
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/30">
                              重置基线 (省下 {ev.compaction.tokensSaved} Tokens)
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-300 bg-[#090d18] p-2.5 rounded font-mono border border-slate-800 whitespace-pre-wrap">
                            {ev.compaction.summary}
                          </div>
                        </div>
                      );
                    }

                    if (ev.type === "tool_end") {
                      return (
                        <div key={idx} className="space-y-1.5">
                          {ev.toolResults.map((tr) => (
                            <details
                              key={tr.toolCallId}
                              className="group p-2.5 rounded-xl bg-[#090d18] border border-slate-800 text-xs"
                            >
                              <summary className="cursor-pointer font-mono text-[11px] flex items-center justify-between text-slate-400 group-hover:text-slate-200 transition">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`w-2 h-2 rounded-full ${
                                      tr.isError ? "bg-red-400" : "bg-emerald-400"
                                    }`}
                                  />
                                  <span className="font-semibold text-slate-300">
                                    Observation: {tr.toolName}
                                  </span>
                                  <span className="text-slate-600">
                                    ({tr.executionTimeMs}ms)
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-500">
                                  点击展开输出
                                </span>
                              </summary>
                              <pre className="mt-2 p-2 rounded bg-black/50 text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap border border-slate-900">
                                {tr.output}
                              </pre>
                            </details>
                          ))}
                        </div>
                      );
                    }

                    if (ev.type === "agent_done") {
                      return (
                        <div
                          key={idx}
                          className={`p-4 rounded-2xl border ${
                            ev.result.success
                              ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
                              : "bg-amber-950/30 border-amber-500/40 text-amber-200"
                          } space-y-3`}
                        >
                          <div className="flex items-center justify-between font-bold text-sm">
                            <span className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4" />
                              <span>Agent 执行完毕 ({ev.result.finishReason})</span>
                            </span>
                            <span className="font-mono text-xs">
                              耗时: {(ev.result.totalDurationMs / 1000).toFixed(2)}s | 步数: {ev.result.totalSteps}
                            </span>
                          </div>
                          <div className="text-xs text-slate-200 bg-[#090d18]/80 p-3 rounded-xl border border-slate-800 leading-relaxed whitespace-pre-wrap">
                            {ev.result.finalAnswer}
                          </div>
                        </div>
                      );
                    }

                    if (ev.type === "guard_alert") {
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/50 text-xs text-amber-200 flex items-center gap-2"
                        >
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          <div>
                            <span className="font-bold font-mono">[安全哨兵告警]: </span>
                            <span>{ev.alert.message} (级别: {ev.alert.level})</span>
                          </div>
                        </div>
                      );
                    }

                    if (ev.type === "error") {
                      return (
                        <div
                          key={idx}
                          className="p-4 rounded-2xl bg-red-950/40 border border-red-500/50 text-red-200 text-xs space-y-2"
                        >
                          <div className="flex items-center gap-2 font-bold text-red-300">
                            <XCircle className="w-4 h-4 text-red-400" />
                            <span>执行异常</span>
                          </div>
                          <pre className="whitespace-pre-wrap font-mono text-[11px] bg-[#090d18] p-2.5 rounded-lg border border-red-900/60 text-red-300">
                            {ev.message}
                          </pre>
                        </div>
                      );
                    }

                    return null;
                  })}

                  <div ref={eventStreamEndRef} />
                </div>
              </div>

              {/* Right Col: Repo Map & Compaction Inspector */}
              <div className="space-y-6">
                {/* Repo Map Card */}
                <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Compass className="w-4 h-4 text-indigo-400" />
                      <span>注入的代码全景图 (Repo Map)</span>
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400">
                      AST 结构概览
                    </span>
                  </div>

                  {repoMapSummary ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-center font-mono text-xs">
                        <div className="bg-[#111728] p-2 rounded border border-slate-800">
                          <div className="text-[10px] text-slate-500">文件总数</div>
                          <div className="text-white font-bold">
                            {repoMapSummary.totalFiles}
                          </div>
                        </div>
                        <div className="bg-[#111728] p-2 rounded border border-slate-800">
                          <div className="text-[10px] text-slate-500">提取签名数</div>
                          <div className="text-indigo-400 font-bold">
                            {repoMapSummary.signaturesExtracted}
                          </div>
                        </div>
                      </div>
                      <pre className="p-3 rounded-xl bg-[#090d18] border border-slate-800 text-[10px] font-mono text-slate-300 overflow-x-auto max-h-56 leading-relaxed">
                        {repoMapSummary.formattedMap}
                      </pre>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 py-6 text-center">
                      启动任务后将自动生成并展示注入的 Repo Map。
                    </div>
                  )}
                </div>

                {/* Truncation & Compactions History */}
                <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Database className="w-4 h-4 text-purple-400" />
                      <span>压缩与修剪事件记录</span>
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400">
                      {truncationEvents.length + compactionsList.length} Events
                    </span>
                  </div>

                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {truncationEvents.length === 0 &&
                      compactionsList.length === 0 && (
                        <div className="text-xs text-slate-500 py-6 text-center">
                          暂无截断或压缩事件
                        </div>
                      )}

                    {truncationEvents.map((t, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg bg-[#111728] border border-slate-800 text-xs flex items-center justify-between font-mono"
                      >
                        <div>
                          <span className="text-amber-400 font-bold">
                            [Truncate]
                          </span>{" "}
                          <span className="text-slate-300">{t.toolName}</span>
                          <div className="text-[10px] text-slate-500">
                            {t.truncation.originalLines} 行 ➔{" "}
                            {t.truncation.retainedLines} 行
                          </div>
                        </div>
                        <span className="text-emerald-400 font-bold text-xs">
                          -{t.truncation.tokensSaved} Tok
                        </span>
                      </div>
                    ))}

                    {compactionsList.map((c, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg bg-purple-950/20 border border-purple-500/30 text-xs flex items-center justify-between font-mono"
                      >
                        <div>
                          <span className="text-purple-400 font-bold">
                            [Compaction]
                          </span>{" "}
                          <span className="text-slate-300">
                            Step {c.step}
                          </span>
                          <div className="text-[10px] text-slate-500">
                            浓缩了 {c.compactedTurnCount} 个历史轮次
                          </div>
                        </div>
                        <span className="text-purple-300 font-bold text-xs">
                          -{c.tokensSaved} Tok
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================== TAB 2: BENCHMARKS ===================== */}
        {activeTab === "benchmarks" && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-2">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-400" />
                <span>3 大工业级核心认知对照实验 (Interactive Benchmarks)</span>
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                每个实验模拟真实 Agent 遇到的极限场景。点击“立即运行此实验”，直接查看 Baseline 与 Context Engine 的对照指标与 Token 节省差异。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {CONTEXT_BENCHMARKS.map((preset) => {
                const isRunningThis = runningBenchmarkId === preset.id;
                const result = benchmarkResults[preset.id];

                return (
                  <div
                    key={preset.id}
                    className="glass-panel p-6 rounded-2xl border border-slate-800 hover:border-cyan-500/50 transition flex flex-col justify-between space-y-4 bg-[#0d1424]/90"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                          {preset.badge}
                        </span>
                        <span className="text-[11px] font-mono text-emerald-400 font-bold">
                          预期节省: {preset.expectedTokenSavingsPercent}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-white">
                        {preset.name}
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {preset.description}
                      </p>

                      <div className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-500/30 text-xs text-indigo-300 leading-relaxed">
                        <div className="font-bold text-[11px] mb-0.5">
                          💡 核心机制:
                        </div>
                        {preset.coreInsight}
                      </div>

                      {/* Live Benchmark Result Cards */}
                      {result && preset.id === "log_bomb" && (
                        <div className="space-y-2 pt-2 border-t border-slate-800 font-mono text-xs">
                          <div className="p-2.5 rounded-lg bg-red-950/30 border border-red-500/30 text-red-300 text-[11px]">
                            <div className="font-bold">🔴 Baseline (无截断):</div>
                            <div>• 10,000 行 / {result.baseline.estimatedTokens} Tokens</div>
                            <div>• 首 Token 延迟: ~{result.baseline.estimatedLatencySec}s</div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-[11px]">
                            <div className="font-bold">🟢 Smart Truncator:</div>
                            <div>• 截取: {result.contextEngine.lines} 行 / {result.contextEngine.estimatedTokens} Tokens</div>
                            <div>• 节省 Token: +{result.contextEngine.tokensSaved} ({result.contextEngine.savingsPercent})</div>
                            <div>• 准确锁定: 第 9,920 行 TypeError</div>
                          </div>
                        </div>
                      )}

                      {result && preset.id === "needle_in_repo" && (
                        <div className="space-y-2 pt-2 border-t border-slate-800 font-mono text-xs">
                          <div className="p-2.5 rounded-lg bg-red-950/30 border border-red-500/30 text-red-300 text-[11px]">
                            <div className="font-bold">🔴 Baseline (盲目遍历):</div>
                            <div>• 步骤: {result.baseline.estimatedSteps}</div>
                            <div>• 消耗: {result.baseline.estimatedTokens}</div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-[11px]">
                            <div className="font-bold">🟢 Repo Map 导航:</div>
                            <div>• 步骤: {result.contextEngine.estimatedSteps}</div>
                            <div>• 消耗: {result.contextEngine.estimatedTokens} (省 {result.contextEngine.tokenSavings})</div>
                          </div>
                        </div>
                      )}

                      {result && preset.id === "long_horizon_compaction" && (
                        <div className="space-y-2 pt-2 border-t border-slate-800 font-mono text-xs">
                          <div className="p-2.5 rounded-lg bg-purple-950/30 border border-purple-500/30 text-purple-300 text-[11px]">
                            <div className="font-bold">📦 15 步演进压缩结果:</div>
                            <div>• Baseline 累积: {result.baselineFinalTokens} Tokens</div>
                            <div>• Engine 稳定在: {result.engineFinalTokens} Tokens</div>
                            <div>• 净节省: +{result.totalTokensSaved} Tokens ({result.savingsPercent})</div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={() => handleRunDedicatedBenchmark(preset.id)}
                        disabled={isRunningThis}
                        className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20 transition"
                      >
                        {isRunningThis ? (
                          <>
                            <Zap className="w-3.5 h-3.5 animate-spin" />
                            <span>正在运行评测对比...</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            <span>{result ? "重新运行此实验" : "立即运行此实验"}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================== TAB 3: PLAYGROUNDS ===================== */}
        {activeTab === "playgrounds" && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-2">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Scissors className="w-5 h-5 text-indigo-400" />
                <span>模块化算法调试台 (Interactive Component Playgrounds)</span>
              </h2>
              <p className="text-xs text-slate-300">
                脱离 LLM 调用，直接独立测试 SmartTruncator 截断算法与 RepoMap AST 地图生成器。
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Playground 1: Smart Truncator */}
              <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Scissors className="w-4 h-4 text-cyan-400" />
                    <span>1. Smart Truncator 日志智能截断器</span>
                  </h3>
                  <button
                    onClick={handleTestTruncator}
                    disabled={isTruncating}
                    className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Play className="w-3 h-3" />
                    <span>运行截断测试</span>
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-mono">
                    测试输入日志 (模拟超长构建流水与深层报错):
                  </label>
                  <textarea
                    value={rawLogInput}
                    onChange={(e) => setRawLogInput(e.target.value)}
                    rows={6}
                    className="w-full p-3 rounded-xl bg-[#090d18] border border-slate-700/80 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {truncatorResult && (
                  <div className="space-y-3 pt-2 border-t border-slate-800/80">
                    <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
                      <div className="bg-[#111728] p-2 rounded border border-slate-800">
                        <div className="text-[10px] text-slate-500">原行数 / 字符</div>
                        <div className="text-slate-300 font-bold">
                          {truncatorResult.originalLines}L / {truncatorResult.originalChars}C
                        </div>
                      </div>
                      <div className="bg-[#111728] p-2 rounded border border-slate-800">
                        <div className="text-[10px] text-slate-500">保留行数</div>
                        <div className="text-cyan-300 font-bold">
                          {truncatorResult.retainedLines} 行
                        </div>
                      </div>
                      <div className="bg-[#111728] p-2 rounded border border-slate-800">
                        <div className="text-[10px] text-slate-500">节省 Token</div>
                        <div className="text-emerald-400 font-bold">
                          +{truncatorResult.tokensSaved}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs font-mono text-slate-400">
                        截断与错误强力保留结果:
                      </div>
                      <pre className="p-3 rounded-xl bg-[#090d18] border border-slate-800 text-[11px] font-mono text-slate-200 overflow-x-auto max-h-48 whitespace-pre-wrap">
                        {truncatorResult.content}
                      </pre>
                    </div>
                  </div>
                )}
              </div>

              {/* Playground 2: Repo Map Generator */}
              <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Compass className="w-4 h-4 text-indigo-400" />
                    <span>2. Live Repo Map 实时仓库地图生成器</span>
                  </h3>
                  <button
                    onClick={handleGenerateLiveRepoMap}
                    disabled={isLoadingRepoMap}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Play className="w-3 h-3" />
                    <span>生成当前项目地图</span>
                  </button>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
                  <span>Token 预算上限:</span>
                  <input
                    type="range"
                    min="500"
                    max="4000"
                    step="500"
                    value={repoMapBudget}
                    onChange={(e) => setRepoMapBudget(Number(e.target.value))}
                    className="flex-1 accent-indigo-500"
                  />
                  <span className="text-indigo-300 font-bold">
                    {repoMapBudget} Tokens
                  </span>
                </div>

                {liveRepoMap ? (
                  <div className="space-y-3 pt-2 border-t border-slate-800/80">
                    <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
                      <div className="bg-[#111728] p-2 rounded border border-slate-800">
                        <div className="text-[10px] text-slate-500">文件数</div>
                        <div className="text-slate-200 font-bold">
                          {liveRepoMap.totalFiles}
                        </div>
                      </div>
                      <div className="bg-[#111728] p-2 rounded border border-slate-800">
                        <div className="text-[10px] text-slate-500">目录数</div>
                        <div className="text-indigo-300 font-bold">
                          {liveRepoMap.totalDirectories}
                        </div>
                      </div>
                      <div className="bg-[#111728] p-2 rounded border border-slate-800">
                        <div className="text-[10px] text-slate-500">估算 Tokens</div>
                        <div className="text-cyan-300 font-bold">
                          {liveRepoMap.totalEstimatedTokens}
                        </div>
                      </div>
                    </div>

                    <pre className="p-3 rounded-xl bg-[#090d18] border border-slate-800 text-[10px] font-mono text-slate-200 overflow-x-auto max-h-56 whitespace-pre leading-relaxed">
                      {liveRepoMap.formattedMap}
                    </pre>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 py-12 text-center">
                    点击右上角“生成当前项目地图”即可查看 AST 签名提取效果。
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===================== TAB 4: LECTURE ===================== */}
        {activeTab === "lecture" && (
          <div className="space-y-6">
            <div className="glass-panel p-8 rounded-3xl border border-slate-800 space-y-6 bg-[#0c101c] max-w-5xl mx-auto">
              <div className="space-y-2 border-b border-slate-800 pb-4">
                <span className="text-xs font-mono px-2.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  第 06 课讲义
                </span>
                <h2 className="text-2xl font-bold text-white">
                  Context Engine 与上下文膨胀防御 (Context Engineering & Compression)
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  从 0 到 1 攻克长流程长会话中 LLM 记忆膨胀与 Token 灾难
                </p>
              </div>

              {/* Section 1 */}
              <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <span>1. 核心认知：为什么盲目拉长上下文不是解决方案？</span>
                </h3>
                <p>
                  很多开发者以为：“只要大模型的 Context Window 达到 1M/2M，上下文就不是问题了。”
                  但在工业级工程落地中，盲目塞入长上下文会带来三重毁灭性打击：
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 font-mono text-xs">
                  <div className="bg-[#111728] p-4 rounded-xl border border-slate-800 space-y-1.5">
                    <div className="text-amber-400 font-bold">1. 成本与延迟爆炸</div>
                    <div className="text-slate-400 font-sans">
                      单步首 Token 延迟 (TTFT) 从 1 秒飙升至 10 秒以上，单次会话成本翻数十倍。
                    </div>
                  </div>
                  <div className="bg-[#111728] p-4 rounded-xl border border-slate-800 space-y-1.5">
                    <div className="text-red-400 font-bold">2. Lost in the Middle</div>
                    <div className="text-slate-400 font-sans">
                      中间历史塞满冗长日志，注意力被稀释，模型开始遗忘最初约束和关键需求。
                    </div>
                  </div>
                  <div className="bg-[#111728] p-4 rounded-xl border border-slate-800 space-y-1.5">
                    <div className="text-cyan-400 font-bold">3. 巨型工具日志冲垮</div>
                    <div className="text-slate-400 font-sans">
                      单次 `npm test` 吐出 20MB 构建日志，单步瞬间吃满窗口导致服务崩溃。
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2 */}
              <div className="space-y-3 text-sm text-slate-300 leading-relaxed pt-4 border-t border-slate-800/80">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  <span>2. Context Engine 的四大防御支柱</span>
                </h3>
                <ul className="list-disc list-inside space-y-2 text-xs md:text-sm text-slate-300">
                  <li>
                    <strong className="text-cyan-300">智能日志截断（Smart Truncator）</strong>：
                    保留前 40 行环境与后 80 行总结，同时通过错误锚点识别器（Error Anchor Detector）强行保留报错调用栈，折叠 95% 无关流水。
                  </li>
                  <li>
                    <strong className="text-indigo-300">代码全景地图（Repo Map & AST Outline）</strong>：
                    基于语法提取函数签名、类与接口定义，仅消耗 1,500 Token 即可赋予 Agent 全项目导航能力，杜绝盲目漫游。
                  </li>
                  <li>
                    <strong className="text-emerald-300">历史动态修剪（History Observation Pruning）</strong>：
                    将前序已解决任务的巨大 Tool Output 折叠为紧凑单行摘要，释放 70%+ 的历史上下文。
                  </li>
                  <li>
                    <strong className="text-purple-300">渐进式摘要压缩（Progressive Compaction）</strong>：
                    当 Token 逼近 75% 警戒阈值时，自动触发后台压缩器将历史浓缩为《状态快照》，重置上下文基线。
                  </li>
                </ul>
              </div>

              {/* Link to full doc */}
              <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-500/30 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-purple-200">
                  <BookOpen className="w-4 h-4 text-purple-400" />
                  <span>查看本课完整技术讲义文档：`docs/lessons/06-context-engineering-and-compression.md`</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

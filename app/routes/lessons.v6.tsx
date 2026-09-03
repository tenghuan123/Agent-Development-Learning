import { useState, useEffect, useRef } from "react";
import { useLoaderData } from "react-router";
import { Header } from "~/components/Header";
import type {
  MemoryCategory,
  MemoryItem,
  MemoryStreamEvent,
  ReflectionResult,
  SessionSnapshot,
  SessionSummary,
  WorkingMemory,
} from "~/core/memory/types";
import { MEMORY_BENCHMARKS } from "~/core/experiments/memory-benchmarks";
import {
  Sparkles,
  Play,
  Terminal,
  Activity,
  AlertTriangle,
  Flame,
  Wrench,
  BookOpen,
  Brain,
  Layers,
  Database,
  Search,
  Plus,
  Trash2,
  Edit3,
  RotateCcw,
  Tag,
  FileText,
  RefreshCw,
  Sliders,
  Check,
  CheckCircle2,
} from "lucide-react";

export async function loader() {
  const hasServerKey = Boolean(
    process.env.LLM_API_KEY && process.env.LLM_API_KEY.trim().length > 0
  );

  const model = process.env.LLM_MODEL || "glm-4-flash";
  const defaultBaseURL =
    process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";

  return {
    hasServerKey,
    model,
    defaultBaseURL,
  };
}

export default function LessonV6Page() {
  const { hasServerKey, model, defaultBaseURL } =
    useLoaderData<typeof loader>();

  // API Config State
  const [customApiKey, setCustomApiKey] = useState("");
  const [customBaseURL, setCustomBaseURL] = useState(defaultBaseURL);
  const [selectedModel, setSelectedModel] = useState(model);

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

  const handleSaveSettings = ({
    apiKey,
    baseURL,
  }: {
    apiKey: string;
    baseURL: string;
  }) => {
    setCustomApiKey(apiKey);
    setCustomBaseURL(baseURL);
    localStorage.setItem("MINI_CLAUDE_API_KEY", apiKey);
    localStorage.setItem("MINI_CLAUDE_BASE_URL", baseURL);
  };

  // Tabs: 'workbench' | 'memory_bank' | 'sessions' | 'benchmarks' | 'lecture'
  const [activeTab, setActiveTab] = useState<
    "workbench" | "memory_bank" | "sessions" | "benchmarks" | "lecture"
  >("workbench");

  // Workbench Execution State
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [autoReflect, setAutoReflect] = useState(true);
  const [userPrompt, setUserPrompt] = useState(
    "请为项目创建一个健康检查服务模块，输出启动命令与核心接口规范。"
  );
  const [isRunning, setIsRunning] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [streamLogs, setStreamLogs] = useState<MemoryStreamEvent[]>([]);
  const [, setFinalAnswer] = useState<string>("");
  const [latestWorkingMemory, setLatestWorkingMemory] = useState<WorkingMemory | null>(null);
  const [recalledList, setRecalledList] = useState<MemoryItem[]>([]);
  const [, setLatestReflection] = useState<ReflectionResult | null>(null);

  // Memory Bank State
  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<MemoryCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddingMemory, setIsAddingMemory] = useState(false);
  const [newCategory, setNewCategory] = useState<MemoryCategory>("convention");
  const [newKey, setNewKey] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");

  // Session Store State
  const [savedSessions, setSavedSessions] = useState<SessionSummary[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<SessionSnapshot | null>(null);

  // Benchmarks State
  const [activeBenchmark, setActiveBenchmark] = useState<string>("amnesia_vs_recall");
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<any>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Load Memory Bank & Sessions on mount & tab switch
  const fetchMemoryBank = async () => {
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "memory-bank",
          subAction: "list",
        }),
      });
      const data = await res.json();
      if (data.success && data.items) {
        setMemoryItems(data.items);
      }
    } catch (err) {
      console.error("Failed to fetch memory bank:", err);
    }
  };

  const fetchSessions = async () => {
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "session-store",
          subAction: "list",
        }),
      });
      const data = await res.json();
      if (data.success && data.sessions) {
        setSavedSessions(data.sessions);
      }
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    }
  };

  useEffect(() => {
    fetchMemoryBank();
    fetchSessions();
  }, []);

  useEffect(() => {
    if (activeTab === "memory_bank") fetchMemoryBank();
    if (activeTab === "sessions") fetchSessions();
  }, [activeTab]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamLogs]);

  // Run Agent
  const handleRunAgent = async (resumeSessionId?: string) => {
    if (!resumeSessionId && !userPrompt.trim()) return;

    setIsRunning(true);
    setStreamLogs([]);
    setFinalAnswer("");
    setLatestReflection(null);
    if (!resumeSessionId) {
      setRecalledList([]);
      setLatestWorkingMemory(null);
    }

    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "run-agent",
          task: userPrompt,
          sessionId: resumeSessionId,
          resume: Boolean(resumeSessionId),
          model: selectedModel,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          memoryEnabled,
          autoReflect,
          maxSteps: 12,
        }),
      });

      if (!res.body) {
        throw new Error("No response body stream");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            try {
              const event: MemoryStreamEvent = JSON.parse(jsonStr);
              setStreamLogs((prev) => [...prev, event]);

              if (event.type === "session_created" || event.type === "session_resumed") {
                setCurrentSessionId(event.sessionId);
              } else if (event.type === "memory_recalled") {
                setRecalledList(event.memories);
              } else if (event.type === "scratchpad_updated") {
                setLatestWorkingMemory(event.workingMemory);
              } else if (event.type === "reflection_completed") {
                setLatestReflection(event.result);
                fetchMemoryBank();
              } else if (event.type === "agent_finish") {
                setFinalAnswer(event.finalAnswer);
                fetchSessions();
              }
            } catch {
              // Ignore partial JSON
            }
          }
        }
      }
    } catch (err: any) {
      setStreamLogs((prev) => [
        ...prev,
        {
          type: "agent_error",
          sessionId: currentSessionId || "unknown",
          error: err.message || String(err),
        },
      ]);
    } finally {
      setIsRunning(false);
      fetchMemoryBank();
      fetchSessions();
    }
  };

  // Add Memory
  const handleAddMemory = async () => {
    if (!newKey.trim() || !newContent.trim()) return;
    try {
      const tagsArray = newTags
        .split(/[,，\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "memory-bank",
          subAction: "add",
          item: {
            category: newCategory,
            key: newKey.trim(),
            content: newContent.trim(),
            tags: tagsArray,
            source: "manual_entry",
            confidence: 0.95,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsAddingMemory(false);
        setNewKey("");
        setNewContent("");
        setNewTags("");
        fetchMemoryBank();
      }
    } catch (err) {
      console.error("Failed to add memory:", err);
    }
  };

  // Delete Memory
  const handleDeleteMemory = async (id: string) => {
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "memory-bank",
          subAction: "delete",
          id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchMemoryBank();
      }
    } catch (err) {
      console.error("Failed to delete memory:", err);
    }
  };

  // View Session Snapshot
  const handleViewSession = async (sessionId: string) => {
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "session-store",
          subAction: "get",
          sessionId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedSnapshot(data.snapshot);
      }
    } catch (err) {
      console.error("Failed to fetch session snapshot:", err);
    }
  };

  // Run Benchmark
  const handleRunBenchmark = async (benchmarkId: string) => {
    setBenchmarkLoading(true);
    setBenchmarkResult(null);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "run-benchmark",
          benchmarkId,
          model: selectedModel,
          apiKey: customApiKey,
          baseURL: customBaseURL,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setBenchmarkResult(data.result);
      }
    } catch (err) {
      console.error("Failed to run benchmark:", err);
    } finally {
      setBenchmarkLoading(false);
    }
  };

  const filteredMemories = memoryItems.filter((item) => {
    const matchesCat =
      selectedCategory === "all" || item.category === selectedCategory;
    const matchesQuery =
      !searchQuery.trim() ||
      item.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some((t) =>
        t.toLowerCase().includes(searchQuery.toLowerCase())
      );
    return matchesCat && matchesQuery;
  });

  const currentLessonInfo = {
    id: "v6",
    title: "第 07 课: Memory 与状态机持久化",
    badge: "V6",
  };

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 font-sans selection:bg-purple-500/30 flex flex-col">
      <Header
        hasServerKey={hasServerKey}
        model={model}
        defaultBaseURL={defaultBaseURL}
        customApiKey={customApiKey}
        onSaveApiKey={handleSaveApiKey}
        customBaseURL={customBaseURL}
        onSaveBaseURL={handleSaveBaseURL}
        onSaveSettings={handleSaveSettings}
        currentLesson={currentLessonInfo}
      />

      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Top Header Banner */}
        <div className="glass-panel p-6 md:p-8 rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-950/40 via-[#0d1222] to-indigo-950/30 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-500 to-cyan-400 text-white shadow-lg shadow-purple-500/30">
                  <Brain className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      V6 核心进阶
                    </span>
                    <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                      Memory 与状态机持久化
                    </h1>
                  </div>
                  <p className="text-xs md:text-sm text-slate-300 mt-1">
                    攻克跨会话失忆、经验自主沉淀与崩溃断点续跑：构建 L1 工作记忆、L2 会话状态机与 L3 长期知识库。
                  </p>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-1.5 p-1 bg-[#101626] border border-slate-700/80 rounded-2xl">
                {[
                  { id: "workbench", label: "实战工作台", icon: Terminal },
                  { id: "memory_bank", label: "L3 记忆库", icon: Database },
                  { id: "sessions", label: "L2 会话快照", icon: Layers },
                  { id: "benchmarks", label: "对比实验", icon: Flame },
                  { id: "lecture", label: "原理讲义", icon: BookOpen },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition ${
                        isActive
                          ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* TAB 1: WORKBENCH */}
        {activeTab === "workbench" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Col: Prompt & Controls & Live Stream */}
            <div className="lg:col-span-8 space-y-6">
              {/* Controls Bar */}
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold text-slate-200">
                      记忆引擎运行时配置 (Memory Runtime)
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    {/* Memory Toggle */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={memoryEnabled}
                        onChange={(e) => setMemoryEnabled(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-800 text-purple-600 focus:ring-purple-500"
                      />
                      <span className={memoryEnabled ? "text-purple-300 font-medium" : "text-slate-400"}>
                        L3 长期记忆注入
                      </span>
                    </label>

                    {/* Auto-Reflect Toggle */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoReflect}
                        onChange={(e) => setAutoReflect(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className={autoReflect ? "text-indigo-300 font-medium" : "text-slate-400"}>
                        事后自主反思 (Auto-Reflection)
                      </span>
                    </label>
                  </div>
                </div>

                {/* Input box & Presets */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-slate-400 flex items-center justify-between">
                      <span>输入任务目标 (User Goal):</span>
                      <span className="text-[11px] text-purple-300/80">
                        {memoryEnabled ? "🧠 启动时将自动前置检索相关记忆" : "⚠️ 无记忆纯无状态执行"}
                      </span>
                    </label>
                    <div className="relative">
                      <textarea
                        value={userPrompt}
                        onChange={(e) => setUserPrompt(e.target.value)}
                        placeholder="例如：请为项目创建一个健康检查服务模块，输出启动命令与核心接口规范。"
                        rows={3}
                        className="w-full bg-[#090d18] border border-slate-700/80 rounded-xl p-3.5 text-xs text-slate-100 font-mono outline-none focus:border-purple-500 transition resize-none"
                      />
                    </div>
                  </div>

                  {/* Preset Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-500">快速用例:</span>
                    {[
                      {
                        label: "1. 跨会话架构规范继承 (Bun & 9090)",
                        prompt: "请为项目创建一个新的 health-check 健康检查服务并编写启动与调试说明。",
                      },
                      {
                        label: "2. 排查踩坑与经验提炼 (Auth 401)",
                        prompt: "排查并修复修改 auth 模块后导致测试用例报 401 Unauthorized 的偶发性问题。",
                      },
                      {
                        label: "3. 复杂重构 (Planning + Scratchpad)",
                        prompt: "分析 app/core 下的代码结构，制定重构方案，并在 Scratchpad 中记录关键假设与步骤。",
                      },
                    ].map((p, idx) => (
                      <button
                        key={idx}
                        onClick={() => setUserPrompt(p.prompt)}
                        className="px-2.5 py-1 rounded-lg bg-[#12192c] hover:bg-[#1a233d] border border-slate-800 text-[11px] text-slate-300 hover:text-purple-300 transition"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* Action Button */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-cyan-400" />
                      <span>
                        当前 Session ID:{" "}
                        <strong className="text-slate-200">{currentSessionId || "待启动"}</strong>
                      </span>
                    </div>

                    <button
                      onClick={() => handleRunAgent()}
                      disabled={isRunning}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-semibold text-xs shadow-lg shadow-purple-600/30 transition flex items-center gap-2 disabled:opacity-50"
                    >
                      {isRunning ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Agent 运行中...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          <span>启动 Memory Agent</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Execution Stream Console */}
              <div className="glass-panel rounded-2xl border border-slate-800 bg-[#0a0f1d] overflow-hidden flex flex-col h-[520px]">
                <div className="px-4 py-3 bg-[#0f1526] border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold text-slate-200">
                      实时执行流与记忆动态 (Execution Trajectory & Memory Events)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                    {streamLogs.length} Events
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
                  {streamLogs.length === 0 && !isRunning && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
                      <Brain className="w-8 h-8 text-slate-600" />
                      <p>点击上方“启动 Memory Agent”开始执行并观察三层记忆交互</p>
                    </div>
                  )}

                  {streamLogs.length === 0 && isRunning && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
                      <div className="p-3 rounded-2xl bg-purple-500/20 border border-purple-500/30 text-purple-300 animate-pulse">
                        <Brain className="w-8 h-8 animate-spin" />
                      </div>
                      <div className="text-xs font-mono text-slate-300">Agent 正在连接模型并初始化执行环境...</div>
                      <div className="text-[11px] text-slate-500">正在检索 L3 记忆库并构建上下文基线...</div>
                    </div>
                  )}

                  {streamLogs.map((log, idx) => {
                    if (log.type === "session_created" || log.type === "session_resumed") {
                      return (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl bg-purple-950/30 border border-purple-500/40 text-purple-200 text-xs flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <Activity className="w-3.5 h-3.5 text-purple-400" />
                            <span>
                              会话 {log.type === "session_created" ? "已初始化" : "已热恢复"}:{" "}
                              <strong className="font-mono text-purple-300">{log.sessionId}</strong>
                            </span>
                          </div>
                          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Status: {log.state}
                          </span>
                        </div>
                      );
                    }

                    if (log.type === "step_start") {
                      return (
                        <div key={idx} className="flex items-center gap-3 my-2">
                          <div className="h-px bg-slate-800 flex-1" />
                          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[#131929] border border-slate-700 text-purple-300 font-bold">
                            Step {log.step} / {log.totalSteps}
                          </span>
                          <div className="h-px bg-slate-800 flex-1" />
                        </div>
                      );
                    }

                    if (log.type === "memory_recalled") {
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-purple-950/30 border border-purple-500/40 text-purple-200 space-y-2"
                        >
                          <div className="flex items-center gap-2 font-bold text-purple-300">
                            <Brain className="w-4 h-4 text-purple-400" />
                            <span>[L3 语义检索命中] 前置召回了 {log.memories.length} 条长期记忆规则:</span>
                          </div>
                          <div className="space-y-1 pl-5 text-[11px]">
                            {log.memories.map((m, i) => (
                              <div key={i} className="flex items-start gap-1.5">
                                <span className="text-purple-400 font-bold">• [{m.category}] {m.key}:</span>
                                <span className="text-slate-300">{m.content}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    if (log.type === "scratchpad_updated") {
                      return (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl bg-indigo-950/30 border border-indigo-500/40 text-indigo-200 space-y-1"
                        >
                          <div className="flex items-center gap-2 font-bold text-indigo-300 text-[11px]">
                            <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                            <span>[L1 工作记忆更新] Scratchpad 笔记已同步</span>
                          </div>
                          {log.workingMemory.currentFocus && (
                            <div className="text-[11px] text-slate-300 pl-5">
                              🎯 关注点: {log.workingMemory.currentFocus}
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (log.type === "checkpoint_saved") {
                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-2 text-[10px] text-slate-500 py-0.5 px-2 bg-slate-900/40 rounded border border-slate-800/60"
                        >
                          <Database className="w-3 h-3 text-cyan-400" />
                          <span>
                            [L2 状态机] Step {log.step} Checkpoint 已持久化保存至 SessionStore
                          </span>
                        </div>
                      );
                    }

                    if (log.type === "thought") {
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-[#111728] border border-slate-800 text-slate-300 space-y-1"
                        >
                          <div className="text-purple-400 font-bold text-[11px]">
                            💭 Step {log.step} 思考 (Thought):
                          </div>
                          <div className="whitespace-pre-wrap font-sans text-xs text-slate-200 leading-relaxed">
                            {log.thought}
                          </div>
                        </div>
                      );
                    }

                    if (log.type === "tool_call") {
                      return (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl bg-cyan-950/20 border border-cyan-500/30 text-cyan-300 space-y-1"
                        >
                          <div className="flex items-center gap-1.5 font-bold text-[11px]">
                            <Wrench className="w-3.5 h-3.5 text-cyan-400" />
                            <span>调用工具: {log.toolName}</span>
                          </div>
                          <pre className="text-[10px] text-slate-400 overflow-x-auto bg-[#070b14] p-1.5 rounded">
                            {JSON.stringify(log.args, null, 2)}
                          </pre>
                        </div>
                      );
                    }

                    if (log.type === "tool_result") {
                      return (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl bg-[#090e1a] border border-slate-800 text-slate-400 space-y-1"
                        >
                          <div className="text-[10px] text-slate-500">
                            📥 工具返回结果 (Observation):
                          </div>
                          <pre className="text-[11px] text-slate-300 whitespace-pre-wrap max-h-36 overflow-y-auto bg-[#060912] p-2 rounded">
                            {log.result}
                          </pre>
                        </div>
                      );
                    }

                    if (log.type === "reflection_start") {
                      return (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl bg-indigo-950/30 border border-indigo-500/40 text-indigo-200 text-xs flex items-center gap-2 animate-pulse"
                        >
                          <Sparkles className="w-4 h-4 text-indigo-400" />
                          <span>[事后反思] 正在触发 Reflection Engine 提炼本次任务的通用经验与避坑规则...</span>
                        </div>
                      );
                    }

                    if (log.type === "reflection_completed") {
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-gradient-to-r from-emerald-950/40 to-teal-950/30 border border-emerald-500/40 text-emerald-200 space-y-2"
                        >
                          <div className="flex items-center gap-2 font-bold text-emerald-300">
                            <Sparkles className="w-4 h-4 text-emerald-400" />
                            <span>[事后自主反思] 提炼了 {log.result.insights.length} 条经验并沉淀入 L3 记忆库:</span>
                          </div>
                          <div className="space-y-1 pl-5 text-[11px]">
                            {log.result.insights.map((ins, i) => (
                              <div key={i} className="text-slate-200">
                                💡 <strong>[{ins.category}] {ins.key}</strong>: {ins.content}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    if (log.type === "agent_finish") {
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/50 text-emerald-300 space-y-1.5"
                        >
                          <div className="flex items-center gap-2 font-bold">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>任务完成 (Total Steps: {log.totalSteps})</span>
                          </div>
                          <div className="text-xs text-slate-200 font-sans whitespace-pre-wrap">
                            {log.finalAnswer}
                          </div>
                        </div>
                      );
                    }

                    if (log.type === "agent_error" || (log as any).type === "error") {
                      const errorText = (log as any).error || (log as any).message || JSON.stringify(log);
                      return (
                        <div
                          key={idx}
                          className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/60 text-rose-200 text-xs space-y-2.5"
                        >
                          <div className="flex items-center gap-2 font-bold text-rose-300">
                            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                            <span>Agent 执行异常 (LLM / Runtime Error)</span>
                          </div>
                          <pre className="font-mono text-[11px] bg-[#090d18] p-3 rounded-lg border border-rose-900/60 text-rose-300 whitespace-pre-wrap">
                            {errorText}
                          </pre>
                          <div className="text-[11px] text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-800 space-y-1">
                            <div className="text-slate-300 font-semibold">🔍 常见排查指引:</div>
                            <div>1. 请检查右上角配置中的模型名称（如智谱推荐 <code>glm-4-flash</code> 或 <code>glm-4-plus</code>）。</div>
                            <div>2. 请确保 API Key 有效且未欠费。</div>
                            <div>3. 确认网络可正常访问 Base URL 地址。</div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={idx} className="p-2 rounded-lg bg-slate-900/50 border border-slate-800 text-[11px] text-slate-400 font-mono">
                        <span>[{(log as any).type || "event"}] </span>
                        <span>{JSON.stringify(log)}</span>
                      </div>
                    );
                  })}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>

            {/* Right Col: Live Memory Inspector Dashboard */}
            <div className="lg:col-span-4 space-y-6">
              {/* L1 Working Memory Widget */}
              <div className="glass-panel p-4 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>L1 工作记忆 (Scratchpad)</span>
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">即时任务区</span>
                </div>

                <div className="space-y-2 text-xs">
                  {latestWorkingMemory?.currentFocus ? (
                    <div className="p-2.5 rounded-xl bg-[#11182c] border border-cyan-500/30 space-y-1">
                      <div className="text-[10px] font-mono text-cyan-300 font-bold">🎯 当前 Focus:</div>
                      <div className="text-slate-200 text-[11px]">{latestWorkingMemory.currentFocus}</div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 italic p-2 bg-[#0a0e1a] rounded-lg">
                      暂无活跃 Focus 目标
                    </div>
                  )}

                  {/* Facts */}
                  <div>
                    <div className="text-[10px] font-mono text-slate-400 mb-1">✅ 验证事实 (Facts):</div>
                    {latestWorkingMemory?.facts && latestWorkingMemory.facts.length > 0 ? (
                      <div className="space-y-1">
                        {latestWorkingMemory.facts.map((f, i) => (
                          <div key={i} className="text-[11px] text-slate-300 bg-[#0a0e1a] p-1.5 rounded border border-slate-800/80">
                            • {f}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-600 italic">尚未记录事实</div>
                    )}
                  </div>
                </div>
              </div>

              {/* L3 Recalled Memories for Active Run */}
              <div className="glass-panel p-4 rounded-2xl border border-purple-500/30 bg-[#0d1322] space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple-400" />
                    <h3 className="text-xs font-bold text-white">
                      L3 长期记忆召回 (Recalled)
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-purple-300">
                    {recalledList.length} 条已生效
                  </span>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {recalledList.length > 0 ? (
                    recalledList.map((m) => (
                      <div
                        key={m.id}
                        className="p-2.5 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold">
                            {m.category}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 font-semibold">{m.key}</span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">{m.content}</p>
                      </div>
                    ))
                  ) : (
                    <div className="text-[11px] text-slate-500 italic p-3 bg-[#0a0e1a] rounded-xl text-center">
                      启动 Agent 时将自动根据任务检索相关条目
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Jump to Memory Bank & Session Store */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setActiveTab("memory_bank")}
                  className="p-3 rounded-xl bg-[#12182b] hover:bg-[#18213b] border border-slate-800 hover:border-purple-500/40 text-left transition space-y-1"
                >
                  <Database className="w-4 h-4 text-purple-400" />
                  <div className="text-xs font-bold text-white">管理记忆库</div>
                  <div className="text-[10px] text-slate-400">{memoryItems.length} 条已持久化</div>
                </button>

                <button
                  onClick={() => setActiveTab("sessions")}
                  className="p-3 rounded-xl bg-[#12182b] hover:bg-[#18213b] border border-slate-800 hover:border-cyan-500/40 text-left transition space-y-1"
                >
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <div className="text-xs font-bold text-white">查看会话快照</div>
                  <div className="text-[10px] text-slate-400">{savedSessions.length} 个历史会话</div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: L3 MEMORY BANK MANAGER */}
        {activeTab === "memory_bank" && (
          <div className="space-y-6">
            {/* Header & Actions */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Database className="w-5 h-5 text-purple-400" />
                    <span>L3 长期语义记忆库 (Semantic Memory Bank)</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    持久化存储项目架构约定、用户偏好与排错避坑经验，支持关键词与分类检索。
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsAddingMemory(!isAddingMemory)}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs flex items-center gap-1.5 transition shadow-lg shadow-purple-600/20"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新增记忆条目</span>
                  </button>

                  <button
                    onClick={fetchMemoryBank}
                    className="p-2 rounded-xl bg-[#12182c] border border-slate-700 text-slate-300 hover:text-white transition"
                    title="刷新记忆库"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Add Memory Inline Form */}
              {isAddingMemory && (
                <div className="p-4 rounded-xl bg-[#0a0f1d] border border-purple-500/40 space-y-3">
                  <div className="text-xs font-bold text-purple-300">新增持久化记忆条目</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-1">分类 (Category):</label>
                      <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value as any)}
                        className="w-full bg-[#111728] border border-slate-700 rounded-lg p-2 text-xs text-slate-200 outline-none"
                      >
                        <option value="convention">📐 convention (项目规范)</option>
                        <option value="preference">👤 preference (用户偏好)</option>
                        <option value="learning">💡 learning (踩坑经验)</option>
                        <option value="architecture">🏗️ architecture (架构知识)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-1">唯一标识 (Key):</label>
                      <input
                        type="text"
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        placeholder="例如：pkg_manager_and_port"
                        className="w-full bg-[#111728] border border-slate-700 rounded-lg p-2 text-xs text-slate-200 outline-none font-mono"
                      >
                      </input>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-1">标签 (Tags):</label>
                      <input
                        type="text"
                        value={newTags}
                        onChange={(e) => setNewTags(e.target.value)}
                        placeholder="逗号分隔，例如 bun, port, 9090"
                        className="w-full bg-[#111728] border border-slate-700 rounded-lg p-2 text-xs text-slate-200 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-slate-400 block mb-1">记忆内容与约束详情 (Content):</label>
                    <textarea
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      rows={2}
                      placeholder="详细描述规则或避坑经验..."
                      className="w-full bg-[#111728] border border-slate-700 rounded-lg p-2 text-xs text-slate-200 outline-none"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsAddingMemory(false)}
                      className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleAddMemory}
                      className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" />
                      <span>保存入库</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Filters & Search */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-1 bg-[#0a0f1d] p-1 rounded-xl border border-slate-800">
                  {[
                    { id: "all", label: "全部条目" },
                    { id: "convention", label: "📐 项目规范" },
                    { id: "preference", label: "👤 用户偏好" },
                    { id: "learning", label: "💡 踩坑经验" },
                    { id: "architecture", label: "🏗️ 架构知识" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setSelectedCategory(tab.id as any)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                        selectedCategory === tab.id
                          ? "bg-purple-600 text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索记忆关键字或标签..."
                    className="w-full bg-[#0a0f1d] border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 outline-none focus:border-purple-500"
                  />
                </div>
              </div>
            </div>

            {/* Memory Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMemories.map((m) => (
                <div
                  key={m.id}
                  className="glass-panel p-5 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-3 relative group hover:border-purple-500/40 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                          m.category === "convention"
                            ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30"
                            : m.category === "preference"
                            ? "bg-purple-500/10 text-purple-300 border-purple-500/30"
                            : m.category === "learning"
                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                            : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                        }`}
                      >
                        {m.category}
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-200">{m.key}</span>
                    </div>

                    <button
                      onClick={() => handleDeleteMemory(m.id)}
                      className="text-slate-500 hover:text-rose-400 transition p-1"
                      title="删除此记忆"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed font-sans">{m.content}</p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Tag className="w-3 h-3 text-purple-400" />
                      <span>{m.tags.join(", ") || "no tags"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <span>命中: {m.accessCount} 次</span>
                      <span>来源: {m.source || "manual"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: L2 SESSIONS PERSISTENCE */}
        {activeTab === "sessions" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Session List */}
            <div className="lg:col-span-5 space-y-4">
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs font-bold text-white">持久化会话列表 (Session Store)</h3>
                  </div>
                  <button
                    onClick={fetchSessions}
                    className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>

                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {savedSessions.length === 0 ? (
                    <div className="text-xs text-slate-500 text-center py-6">暂无持久化会话</div>
                  ) : (
                    savedSessions.map((s) => (
                      <div
                        key={s.sessionId}
                        onClick={() => handleViewSession(s.sessionId)}
                        className={`p-3 rounded-xl border transition cursor-pointer space-y-1.5 ${
                          selectedSnapshot?.sessionId === s.sessionId
                            ? "bg-cyan-950/30 border-cyan-500/60"
                            : "bg-[#0a0f1d] border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-mono font-bold text-slate-200">
                            {s.sessionId}
                          </span>
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                              s.state === "completed"
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                : s.state === "running"
                                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30 animate-pulse"
                                : s.state === "paused"
                                ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                                : "bg-rose-500/20 text-rose-300 border-rose-500/30"
                            }`}
                          >
                            {s.state}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 line-clamp-1">{s.userGoal}</p>
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1">
                          <span>步数: {s.stepCount} Steps</span>
                          <span>{new Date(s.updatedAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Session Snapshot Inspector */}
            <div className="lg:col-span-7 space-y-4">
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-purple-400" />
                    <h3 className="text-xs font-bold text-white">
                      会话 Checkpoint 快照查看器
                    </h3>
                  </div>

                  {selectedSnapshot && (
                    <button
                      onClick={() => {
                        setActiveTab("workbench");
                        handleRunAgent(selectedSnapshot.sessionId);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-lg shadow-cyan-600/20 transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>一键从断点热恢复 (Resume)</span>
                    </button>
                  )}
                </div>

                {selectedSnapshot ? (
                  <div className="space-y-4">
                    {/* Overview Header */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2.5 bg-[#0a0f1d] rounded-xl border border-slate-800">
                        <div className="text-[10px] text-slate-500 font-mono">状态:</div>
                        <div className="font-bold text-cyan-300 font-mono">{selectedSnapshot.state}</div>
                      </div>
                      <div className="p-2.5 bg-[#0a0f1d] rounded-xl border border-slate-800">
                        <div className="text-[10px] text-slate-500 font-mono">当前 Step:</div>
                        <div className="font-bold text-white font-mono">{selectedSnapshot.currentStep} / {selectedSnapshot.maxSteps}</div>
                      </div>
                      <div className="p-2.5 bg-[#0a0f1d] rounded-xl border border-slate-800">
                        <div className="text-[10px] text-slate-500 font-mono">Token 消耗:</div>
                        <div className="font-bold text-purple-300 font-mono">{selectedSnapshot.tokenUsage.totalTokens}</div>
                      </div>
                      <div className="p-2.5 bg-[#0a0f1d] rounded-xl border border-slate-800">
                        <div className="text-[10px] text-slate-500 font-mono">Planning:</div>
                        <div className="font-bold text-amber-300 font-mono">
                          {selectedSnapshot.planState ? `${selectedSnapshot.planState.tasks.length} 任务` : "无"}
                        </div>
                      </div>
                    </div>

                    {/* Step History list */}
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-300">执行轨迹记录 (Steps):</div>
                      <div className="space-y-2 max-h-72 overflow-y-auto">
                        {selectedSnapshot.steps.map((st) => (
                          <div key={st.step} className="p-3 bg-[#0a0f1d] rounded-xl border border-slate-800 space-y-1 text-xs">
                            <div className="flex items-center justify-between text-[11px] font-mono text-purple-400">
                              <span>Step {st.step}</span>
                              <span className="text-slate-500">{new Date(st.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <p className="text-slate-300 text-xs font-sans">{st.thought}</p>
                            {st.action && (
                              <div className="text-[10px] font-mono text-cyan-300 bg-[#060912] p-1.5 rounded">
                                Action: {st.action.toolName}({JSON.stringify(st.action.args)})
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 text-center py-16">
                    在左侧选择一个会话以检查其 Checkpointing 快照与断点状态
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: BENCHMARKS */}
        {activeTab === "benchmarks" && (
          <div className="space-y-6">
            {/* Benchmark Selector */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {MEMORY_BENCHMARKS.map((b) => (
                <div
                  key={b.id}
                  onClick={() => {
                    setActiveBenchmark(b.id);
                    setBenchmarkResult(null);
                  }}
                  className={`p-5 rounded-2xl border cursor-pointer transition space-y-2 ${
                    activeBenchmark === b.id
                      ? "bg-purple-950/40 border-purple-500 shadow-xl shadow-purple-500/10"
                      : "bg-[#0d1322] border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                      {b.badge}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white">{b.name}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{b.description}</p>
                </div>
              ))}
            </div>

            {/* Benchmark Runner & Results */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-400" />
                    <span>评测执行面板</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {MEMORY_BENCHMARKS.find((b) => b.id === activeBenchmark)?.coreInsight}
                  </p>
                </div>

                <button
                  onClick={() => handleRunBenchmark(activeBenchmark)}
                  disabled={benchmarkLoading}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-xs shadow-lg shadow-purple-600/30 flex items-center gap-2 disabled:opacity-50 transition"
                >
                  {benchmarkLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>正在运行评测...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>运行对比评测</span>
                    </>
                  )}
                </button>
              </div>

              {benchmarkResult && (
                <div className="space-y-4 pt-2">
                  {/* Amnesia vs Recall Result Card */}
                  {activeBenchmark === "amnesia_vs_recall" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Baseline */}
                      <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-2 text-xs">
                        <div className="flex items-center justify-between text-rose-300 font-bold">
                          <span>❌ Baseline (无记忆无状态 Agent)</span>
                          <span className="font-mono">遵守率: {benchmarkResult.baseline.complianceScore}%</span>
                        </div>
                        <p className="text-slate-300">{benchmarkResult.baseline.behavior}</p>
                        <div className="space-y-1 text-[11px] text-rose-300/80">
                          {benchmarkResult.baseline.conventionsViolated.map((v: string, i: number) => (
                            <div key={i}>• 违背规范: {v}</div>
                          ))}
                        </div>
                        <pre className="text-[10px] text-slate-300 bg-[#060912] p-2 rounded overflow-x-auto">
                          {benchmarkResult.baseline.sampleOutput}
                        </pre>
                      </div>

                      {/* Memory Augmented */}
                      <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/40 space-y-2 text-xs">
                        <div className="flex items-center justify-between text-emerald-300 font-bold">
                          <span>✅ Memory Agent (L3 语义记忆继承)</span>
                          <span className="font-mono">遵守率: {benchmarkResult.memoryAugmented.complianceScore}%</span>
                        </div>
                        <p className="text-slate-300">{benchmarkResult.memoryAugmented.behavior}</p>
                        <div className="space-y-1 text-[11px] text-emerald-300/80">
                          {benchmarkResult.memoryAugmented.conventionsHonored.map((h: string, i: number) => (
                            <div key={i}>• 自动遵从: {h}</div>
                          ))}
                        </div>
                        <pre className="text-[10px] text-slate-300 bg-[#060912] p-2 rounded overflow-x-auto">
                          {benchmarkResult.memoryAugmented.sampleOutput}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Crash & Resume Result Card */}
                  {activeBenchmark === "crash_and_resume" && (
                    <div className="p-4 rounded-xl bg-[#0a0f1d] border border-cyan-500/40 space-y-3 text-xs">
                      <div className="flex items-center justify-between text-cyan-300 font-bold">
                        <span>💾 L2 Checkpoint 断点恢复评测报告</span>
                        <span className="font-mono">恢复率: 100%</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-2.5 bg-[#111728] rounded-lg">
                          <div className="text-[10px] text-slate-500">模拟崩溃节点:</div>
                          <div className="font-bold text-rose-300">Step {benchmarkResult.crashPointStep}</div>
                        </div>
                        <div className="p-2.5 bg-[#111728] rounded-lg">
                          <div className="text-[10px] text-slate-500">热恢复活跃任务:</div>
                          <div className="font-bold text-cyan-300">{benchmarkResult.resumedState.activeTask}</div>
                        </div>
                        <div className="p-2.5 bg-[#111728] rounded-lg">
                          <div className="text-[10px] text-slate-500">节省重复 Token:</div>
                          <div className="font-bold text-emerald-300">{benchmarkResult.resumedState.tokenSavedEstimate}</div>
                        </div>
                      </div>
                      <p className="text-slate-300 text-xs">{benchmarkResult.summary}</p>
                    </div>
                  )}

                  {/* Auto-Reflection Result Card */}
                  {activeBenchmark === "auto_reflection" && (
                    <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/40 space-y-3 text-xs">
                      <div className="flex items-center gap-2 font-bold text-emerald-300">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                        <span>事后自主反思提炼成功！</span>
                      </div>
                      <p className="text-slate-300">{benchmarkResult.summary}</p>
                      <div className="space-y-2">
                        {benchmarkResult.insights?.map((ins: any, i: number) => (
                          <div key={i} className="p-3 bg-[#0a0f1d] rounded-xl border border-slate-800 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-purple-400 font-bold">[{ins.category}] {ins.key}</span>
                              <span className="text-slate-500">置信度: {(ins.confidence * 100).toFixed(0)}%</span>
                            </div>
                            <div className="text-slate-200">{ins.content}</div>
                            <div className="text-[11px] text-slate-400 italic">💡 提炼依据: {ins.reasoning}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: LECTURE */}
        {activeTab === "lecture" && (
          <div className="glass-panel p-6 md:p-8 rounded-2xl border border-slate-800 bg-[#0d1322] space-y-6 text-slate-200 text-xs md:text-sm leading-relaxed">
            <div>
              <h2 className="text-xl font-bold text-white mb-2">
                第七课：Memory 与状态机持久化 (Hierarchical Memory Architecture)
              </h2>
              <p className="text-slate-400">
                深入剖析工业级 Coding Agent（Claude Code、Cursor、MemGPT/Letta）的记忆分层哲学。
              </p>
            </div>

            <hr className="border-slate-800" />

            <div className="space-y-3">
              <h3 className="text-base font-bold text-purple-300">1. 核心认知：Context Window vs Memory 外脑</h3>
              <p>
                初学者常犯的错误是把“上下文窗口”等同于“记忆”。实际上：
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-300">
                <li><strong>Context Window (即时上下文)</strong>：如同计算机的 RAM，容量有限且昂贵，会话结束即释放。</li>
                <li><strong>Memory Bank (长期外脑磁盘)</strong>：如同计算机的 SSD / 数据库，跨会话永久保存，通过相关性检索按需加载进 RAM。</li>
              </ul>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-bold text-cyan-300">2. 三层记忆体系分工</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                <div className="p-3 bg-[#0a0f1d] rounded-xl border border-slate-800 space-y-1">
                  <div className="font-bold text-cyan-400">L1: Working Memory</div>
                  <p className="text-slate-400 text-xs">维护当前任务的假设（Hypotheses）、验证事实（Facts）与 Scratchpad 临时关注点，随任务完成重置。</p>
                </div>
                <div className="p-3 bg-[#0a0f1d] rounded-xl border border-slate-800 space-y-1">
                  <div className="font-bold text-indigo-400">L2: Episodic Session Store</div>
                  <p className="text-slate-400 text-xs">记录每一步的 Thought-Action-Observation 轨迹与 Planning 状态机，支持断点续跑与容灾恢复。</p>
                </div>
                <div className="p-3 bg-[#0a0f1d] rounded-xl border border-slate-800 space-y-1">
                  <div className="font-bold text-purple-400">L3: Semantic Memory Bank</div>
                  <p className="text-slate-400 text-xs">持久化项目规范（Conventions）、偏好（Preferences）与避坑经验（Learnings），跨会话 0 轮提示自动生效。</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-bold text-emerald-300">3. 自动反思与进化闭环 (Auto-Reflection)</h3>
              <p>
                当 Agent 在执行中遇到报错自愈或发现新的环境特征时，任务结束后由 Reflection Engine 提取 1~2 条高价值规则并自动入库。下一次执行同类任务时，直接命中前置记忆，跳过试错阶段。
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}


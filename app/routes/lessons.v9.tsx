import { useState, useEffect, useRef } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import type {
  CheckpointSnapshot,
  DurableEngineEvent,
  DurableRunStatus,
  DurableState,
  IdempotencyRecord,
  WorkflowDefinition,
} from "~/core/durable/types";
import {
  ShieldAlert,
  Terminal,
  Activity,
  Zap,
  CheckCircle2,
  XCircle,
  Wrench,
  BookOpen,
  Layers,
  ArrowRight,
  RefreshCw,
  Database,
  Globe,
  Code2,
  Play,
  FileCode,
  Send,
  Trash2,
  Search,
  Server,
  Sparkles,
  GitFork,
  Clock,
  Flame,
  Check,
  AlertTriangle,
  History,
  Lock,
  ChevronRight,
  Share2,
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

export default function LessonV9Page() {
  const { hasServerKey, model, defaultBaseURL } =
    useLoaderData<typeof loader>();

  // API Config State
  const [customApiKey, setCustomApiKey] = useState("");
  const [customBaseURL, setCustomBaseURL] = useState(defaultBaseURL);

  useEffect(() => {
    const storedKey = localStorage.getItem("MINI_CLAUDE_API_KEY");
    if (storedKey) setCustomApiKey(storedKey);
    const storedURL = localStorage.getItem("MINI_CLAUDE_BASE_URL");
    if (storedURL) setCustomBaseURL(storedURL);
  }, []);

  const saveLocalKey = (key: string) => {
    setCustomApiKey(key);
    localStorage.setItem("MINI_CLAUDE_API_KEY", key);
  };

  const saveLocalBaseURL = (url: string) => {
    setCustomBaseURL(url);
    localStorage.setItem("MINI_CLAUDE_BASE_URL", url);
  };

  const handleSaveSettings = (settings: { apiKey: string; baseURL: string }) => {
    setCustomApiKey(settings.apiKey);
    setCustomBaseURL(settings.baseURL);
    localStorage.setItem("MINI_CLAUDE_API_KEY", settings.apiKey);
    localStorage.setItem("MINI_CLAUDE_BASE_URL", settings.baseURL);
  };

  // ==========================================
  // Durable Engine State
  // ==========================================
  const [activeTab, setActiveTab] = useState<
    "graph" | "drill" | "timetravel" | "ledger"
  >("graph");

  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string>("");
  const [runStatus, setRunStatus] = useState<DurableRunStatus>("idle");
  const [checkpoints, setCheckpoints] = useState<CheckpointSnapshot[]>([]);
  const [idempotencyRecords, setIdempotencyRecords] = useState<
    IdempotencyRecord[]
  >([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [completedNodeIds, setCompletedNodeIds] = useState<string[]>([]);
  const [logs, setLogs] = useState<
    Array<{ timestamp: number; level: string; message: string }>
  >([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [crashInfo, setCrashInfo] = useState<{
    step: number;
    nodeId: string;
    reason: string;
  } | null>(null);

  // Time Travel State
  const [selectedCheckpoint, setSelectedCheckpoint] =
    useState<CheckpointSnapshot | null>(null);
  const [forkVarPatch, setForkVarPatch] = useState<string>(
    JSON.stringify({ hotfixApplied: true, canaryPercent: 20 }, null, 2)
  );
  const [forkSuccessMsg, setForkSuccessMsg] = useState<string | null>(null);

  // Naive Restart State
  const [naiveRunning, setNaiveRunning] = useState<boolean>(false);
  const [naiveLogs, setNaiveLogs] = useState<string[]>([]);
  const [naiveError, setNaiveError] = useState<string | null>(null);

  // Auto-scroll logs terminal
  const logTerminalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logTerminalRef.current) {
      logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
    }
  }, [logs]);

  // Load initial status
  const fetchStatus = async (runId?: string) => {
    try {
      const res = await fetch("/api/durable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "get-status",
          runId: runId || currentRunId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setWorkflow(data.workflow);
        setCheckpoints(data.checkpoints || []);
        setIdempotencyRecords(data.idempotencyRecords || []);
        if (data.latestCheckpoint) {
          setSelectedCheckpoint(data.latestCheckpoint);
          setCompletedNodeIds(
            data.latestCheckpoint.state?.completedNodeIds || []
          );
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // Run Workflow with SSE Streaming
  const handleStartWorkflow = async (crashConfig?: {
    enabled: boolean;
    crashAtStep: number;
    timing: "before_action" | "after_action";
    reason: string;
  }) => {
    setIsRunning(true);
    setRunStatus("running");
    setActiveNodeId(null);
    setCrashInfo(null);
    const newRunId = `run_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 6)}`;
    setCurrentRunId(newRunId);
    setLogs([
      {
        timestamp: Date.now(),
        level: "wal",
        message: `>>> Initializing Durable Run [${newRunId}]...`,
      },
    ]);

    try {
      const response = await fetch("/api/durable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "start-run",
          runId: newRunId,
          crashConfig,
        }),
      });

      if (!response.body) {
        throw new Error("No response body received");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event: DurableEngineEvent = JSON.parse(line.slice(6));
              handleEngineEvent(event);
            } catch {
              // ignore parse error
            }
          }
        }
      }
    } catch (err: any) {
      setLogs((prev) => [
        ...prev,
        {
          timestamp: Date.now(),
          level: "error",
          message: `Network/Execution Error: ${err.message || String(err)}`,
        },
      ]);
      setRunStatus("failed");
    } finally {
      setIsRunning(false);
      fetchStatus(newRunId);
    }
  };

  // Resume from Checkpoint
  const handleResumeWorkflow = async () => {
    if (!checkpoints.length) return;
    const latestCp = checkpoints[checkpoints.length - 1];
    if (!latestCp) return;

    setIsRunning(true);
    setRunStatus("running");
    setCrashInfo(null);

    setLogs((prev) => [
      ...prev,
      {
        timestamp: Date.now(),
        level: "checkpoint",
        message: `>>> Resuming execution from Checkpoint [${latestCp.checkpointId}] (Step ${latestCp.stepIndex})...`,
      },
    ]);

    try {
      const response = await fetch("/api/durable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "resume-run",
          checkpointId: latestCp.checkpointId,
        }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event: DurableEngineEvent = JSON.parse(line.slice(6));
              handleEngineEvent(event);
            } catch {
              // ignore
            }
          }
        }
      }
    } catch (err: any) {
      setLogs((prev) => [
        ...prev,
        {
          timestamp: Date.now(),
          level: "error",
          message: `Resume Error: ${err.message || String(err)}`,
        },
      ]);
    } finally {
      setIsRunning(false);
      fetchStatus(currentRunId);
    }
  };

  // Run Naive Restart (Comparison drill)
  const handleNaiveRestart = async () => {
    if (!currentRunId) return;
    setNaiveRunning(true);
    setNaiveLogs([]);
    setNaiveError(null);

    try {
      const res = await fetch("/api/durable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "naive-restart",
          runId: currentRunId,
        }),
      });
      const data = await res.json();
      if (data.result) {
        setNaiveLogs(data.result.logs || []);
        if (!data.result.success) {
          setNaiveError(data.result.error || "Execution failed");
        }
      }
    } catch (err: any) {
      setNaiveError(err.message || String(err));
    } finally {
      setNaiveRunning(false);
    }
  };

  // Fork from Checkpoint
  const handleForkCheckpoint = async () => {
    if (!selectedCheckpoint) return;
    try {
      let patchObj = {};
      try {
        patchObj = JSON.parse(forkVarPatch);
      } catch {
        alert("Patch must be valid JSON!");
        return;
      }

      const res = await fetch("/api/durable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "fork-run",
          sourceCheckpointId: selectedCheckpoint.checkpointId,
          statePatch: { variables: patchObj },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentRunId(data.newRunId);
        setForkSuccessMsg(
          `Successfully forked branch [${data.newRunId}] from Checkpoint [${selectedCheckpoint.checkpointId}]!`
        );
        fetchStatus(data.newRunId);
        setTimeout(() => setForkSuccessMsg(null), 4000);
      }
    } catch (err: any) {
      alert("Fork failed: " + (err.message || String(err)));
    }
  };

  // Reset WAL
  const handleResetWAL = async () => {
    if (!confirm("Are you sure you want to clear WAL checkpoints and ledger?"))
      return;
    try {
      await fetch("/api/durable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType: "clear-wal", runId: currentRunId }),
      });
      setCheckpoints([]);
      setIdempotencyRecords([]);
      setLogs([]);
      setActiveNodeId(null);
      setCompletedNodeIds([]);
      setRunStatus("idle");
      setCrashInfo(null);
      setSelectedCheckpoint(null);
      setNaiveLogs([]);
      setNaiveError(null);
    } catch {
      // ignore
    }
  };

  const handleEngineEvent = (event: DurableEngineEvent) => {
    const timestamp = event.timestamp || Date.now();
    let level = "info";

    if (event.type === "checkpoint_saved") level = "checkpoint";
    else if (event.type === "action_cached") level = "idempotent";
    else if (event.type === "crashed") {
      level = "error";
      setRunStatus("crashed");
      setCrashInfo(event.details);
      setActiveNodeId(event.nodeId || null);
    } else if (event.type === "run_completed") {
      setRunStatus("completed");
      setActiveNodeId(null);
    } else if (event.type === "node_start") {
      setActiveNodeId(event.nodeId || null);
    } else if (event.type === "node_completed") {
      if (event.nodeId) {
        setCompletedNodeIds((prev) =>
          prev.includes(event.nodeId!) ? prev : [...prev, event.nodeId!]
        );
      }
    }

    setLogs((prev) => [
      ...prev,
      {
        timestamp,
        level,
        message: `[${event.type.toUpperCase()}] ${event.message}`,
      },
    ]);
  };

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 font-sans selection:bg-purple-500/30 flex flex-col">
      <Header
        hasServerKey={hasServerKey}
        model={model}
        defaultBaseURL={defaultBaseURL}
        customApiKey={customApiKey}
        onSaveApiKey={saveLocalKey}
        onSaveBaseURL={saveLocalBaseURL}
        onSaveSettings={handleSaveSettings}
      />

      {/* Hero Header */}
      <div className="border-b border-slate-800/80 bg-gradient-to-b from-purple-950/20 via-slate-900/40 to-[#070a12] px-6 py-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 border border-purple-500/40 text-purple-300">
                Stage V9 · 第 10 课
              </span>
              <span className="text-xs text-slate-400 font-mono">
                LangGraph State Machine · WAL Checkpointing · Idempotency Vault
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <ShieldAlert className="w-7 h-7 text-purple-400" />
              Durable Execution 与容灾断点续跑实验台
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-3xl">
              解决长任务中途挂掉的毁灭性打击：通过确定性状态图、WAL
              原子检查点与副作用幂等账本，实现毫秒级容灾自愈与时间旅行调试。
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Link
              to="/docs/lessons/10-durable-execution-and-checkpointing.md"
              target="_blank"
              className="px-3.5 py-1.5 rounded-lg border border-purple-500/40 hover:bg-purple-500/10 text-purple-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" />
              阅读本课原理讲义
            </Link>
            <button
              onClick={handleResetWAL}
              className="px-3.5 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-slate-400" />
              重置实验台
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="border-b border-slate-800/80 bg-slate-900/50 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">运行状态:</span>
              <span
                className={`px-2 py-0.5 rounded font-mono font-semibold uppercase flex items-center gap-1.5 ${
                  runStatus === "running"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse"
                    : runStatus === "crashed"
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                    : runStatus === "completed"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : "bg-slate-800 text-slate-400 border border-slate-700"
                }`}
              >
                {runStatus === "running" && <Activity className="w-3 h-3 animate-spin" />}
                {runStatus === "crashed" && <Flame className="w-3 h-3 text-rose-400" />}
                {runStatus === "completed" && <Check className="w-3 h-3 text-emerald-400" />}
                {runStatus}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">当前 Run ID:</span>
              <span className="font-mono text-slate-200 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                {currentRunId || "none"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">WAL 检查点:</span>
              <span className="font-mono text-purple-300 font-bold bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/30">
                {checkpoints.length} Snapshots
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">副作用登记:</span>
              <span className="font-mono text-cyan-300 font-bold bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                {idempotencyRecords.length} Actions
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-xs">执行流速:</span>
            <span className="text-emerald-400 font-mono font-medium">
              Deterministic 300ms/Node
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-800 bg-[#0c101d] px-6">
        <div className="max-w-7xl mx-auto flex gap-1">
          <button
            onClick={() => setActiveTab("graph")}
            className={`px-4 py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === "graph"
                ? "border-purple-500 text-purple-300 bg-purple-500/10"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            1. 状态图执行与 WAL 透视 (StateGraph & WAL)
          </button>
          <button
            onClick={() => setActiveTab("drill")}
            className={`px-4 py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === "drill"
                ? "border-rose-500 text-rose-300 bg-rose-500/10"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            2. 容灾演习与崩溃模拟器 (Disaster & Recovery)
          </button>
          <button
            onClick={() => setActiveTab("timetravel")}
            className={`px-4 py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === "timetravel"
                ? "border-indigo-500 text-indigo-300 bg-indigo-500/10"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            3. 时间旅行与分支推演 (Time-Travel & Fork)
          </button>
          <button
            onClick={() => setActiveTab("ledger")}
            className={`px-4 py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === "ledger"
                ? "border-cyan-500 text-cyan-300 bg-cyan-500/10"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            4. 幂等锁与副作用账本 (Idempotency Vault)
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {/* ========================================================================= */}
        {/* TAB 1: 状态图执行与 WAL 透视 */}
        {/* ========================================================================= */}
        {activeTab === "graph" && (
          <div className="space-y-6">
            {/* Action Bar */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleStartWorkflow()}
                  disabled={isRunning}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg shadow-purple-900/30 transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  正常全流程执行 (Normal Run)
                </button>

                <button
                  onClick={() =>
                    handleStartWorkflow({
                      enabled: true,
                      crashAtStep: 2,
                      timing: "after_action",
                      reason:
                        "Simulated Out of Memory (OOM) after applying DB migration",
                    })
                  }
                  disabled={isRunning}
                  className="px-4 py-2 bg-rose-600/30 hover:bg-rose-600/40 border border-rose-500/50 text-rose-200 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all"
                >
                  <Flame className="w-3.5 h-3.5 text-rose-400" />
                  模拟崩溃演练 (Crash at Step 2 after DB)
                </button>

                <button
                  onClick={handleResumeWorkflow}
                  disabled={isRunning || checkpoints.length === 0 || runStatus === "completed"}
                  className="px-4 py-2 bg-emerald-600/30 hover:bg-emerald-600/40 border border-emerald-500/50 text-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-40"
                >
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  容灾断点续跑 (Durable Resume)
                </button>
              </div>

              <div className="text-xs text-slate-400 flex items-center gap-2">
                <span>当前流水线:</span>
                <span className="text-purple-300 font-medium font-mono">
                  {workflow?.name || "Release Pipeline (5 Nodes)"}
                </span>
              </div>
            </div>

            {/* Visual Node Graph */}
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  有向状态图拓扑 (Directed Graph Nodes & Transitions)
                </h3>
                <span className="text-xs text-slate-400">
                  高亮发光表示正在执行，绿色角标表示已成功提交至 WAL
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 relative">
                {(workflow?.nodes || []).map((node, index) => {
                  const isActive = activeNodeId === node.id;
                  const isCompleted = completedNodeIds.includes(node.id);
                  const isCrashed =
                    runStatus === "crashed" && crashInfo?.nodeId === node.id;

                  return (
                    <div
                      key={node.id}
                      className={`relative rounded-xl p-4 border transition-all ${
                        isCrashed
                          ? "bg-rose-950/40 border-rose-500/70 shadow-lg shadow-rose-900/30"
                          : isActive
                          ? "bg-purple-900/30 border-purple-500/80 shadow-lg shadow-purple-900/30 ring-2 ring-purple-500/40 animate-pulse"
                          : isCompleted
                          ? "bg-emerald-950/20 border-emerald-500/40"
                          : "bg-slate-900/50 border-slate-800 text-slate-400"
                      }`}
                    >
                      {/* Step Badge */}
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                            isCrashed
                              ? "bg-rose-500/20 text-rose-300"
                              : isActive
                              ? "bg-purple-500/20 text-purple-300"
                              : isCompleted
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          Step {index + 1}
                        </span>

                        {isSideEffectBadge(node.isSideEffect)}
                      </div>

                      <div className="font-semibold text-xs text-slate-200 mb-1 flex items-center gap-1.5">
                        {getNodeIcon(node.id)}
                        {node.name.split(" ")[1]}
                      </div>

                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                        {node.description}
                      </p>

                      {/* Bottom Status Tag */}
                      <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                        <span className="font-mono text-slate-500">
                          {node.actionName}
                        </span>
                        {isCompleted && (
                          <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="w-3 h-3" /> Done
                          </span>
                        )}
                        {isActive && (
                          <span className="text-purple-400 flex items-center gap-1 font-semibold">
                            <Activity className="w-3 h-3 animate-spin" /> Active
                          </span>
                        )}
                        {isCrashed && (
                          <span className="text-rose-400 flex items-center gap-1 font-semibold">
                            <Flame className="w-3 h-3" /> Crashed
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live Terminal Logs */}
            <div className="bg-[#0a0d18] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
              <div className="bg-slate-900/80 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-300 font-mono">
                  <Terminal className="w-4 h-4 text-purple-400" />
                  WAL 实时事务日志与引擎输出 (Streaming WAL Logs)
                </div>
                <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                  <span>共 {logs.length} 行事件</span>
                  <button
                    onClick={() => setLogs([])}
                    className="hover:text-slate-300"
                  >
                    清空
                  </button>
                </div>
              </div>

              <div
                ref={logTerminalRef}
                className="p-4 font-mono text-xs max-h-80 overflow-y-auto space-y-1.5 leading-relaxed selection:bg-purple-500/40"
              >
                {logs.length === 0 ? (
                  <div className="text-slate-600 italic">
                    点击上方按钮启动工作流，观察引擎在每个节点的 WAL Checkpoint
                    写入与状态演进...
                  </div>
                ) : (
                  logs.map((log, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start gap-2.5 ${getLogColor(
                        log.level
                      )}`}
                    >
                      <span className="text-slate-600 select-none text-[10px]">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="font-semibold uppercase text-[10px] px-1 rounded bg-slate-800/80 text-slate-400 select-none">
                        {log.level}
                      </span>
                      <span className="flex-1 break-words">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: 容灾演习与崩溃模拟器 */}
        {/* ========================================================================= */}
        {activeTab === "drill" && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-rose-950/30 via-slate-900/60 to-purple-950/30 border border-rose-500/30 rounded-xl p-5">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  <Flame className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-1">
                    工业级长任务容灾演习：为什么不能盲目从头重跑？
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">
                    在下方演练中，我们将在 Agent 执行完【Step 2: 数据库 DDL
                    迁移】后，模拟硬件断电或 OOM
                    强制杀死进程。此时内存所有变量消失。
                    接下来你可以亲手体验两种恢复方式的根本差异：
                  </p>
                </div>
              </div>
            </div>

            {/* Side-by-side Drill Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Option A: Naive Restart */}
              <div className="bg-slate-900/40 border border-rose-500/30 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1.5">
                      <XCircle className="w-3.5 h-3.5" /> 方案 A：盲目从头重跑
                      (Naive Restart)
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      无 Checkpoint / 无幂等锁
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                    传统初学者做法：崩溃后直接重新执行一遍。由于没有幂等性账本记录，系统会尝试二次执行
                    <code className="text-rose-300 font-mono">
                      CREATE TABLE v2_orders_partitioned
                    </code>
                    ，必然与现存生产数据撞车爆炸！
                  </p>

                  <button
                    onClick={handleNaiveRestart}
                    disabled={naiveRunning || !currentRunId}
                    className="w-full py-2.5 bg-rose-600/30 hover:bg-rose-600/40 border border-rose-500/50 text-rose-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-40 mb-4"
                  >
                    {naiveRunning ? (
                      <Activity className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Flame className="w-3.5 h-3.5 text-rose-400" />
                    )}
                    触发无保护从头重跑 (观察副作用撞车)
                  </button>

                  {/* Output Terminal */}
                  <div className="bg-[#05070e] border border-rose-950 rounded-lg p-3 text-xs font-mono max-h-48 overflow-y-auto space-y-1">
                    {naiveLogs.length === 0 ? (
                      <span className="text-slate-600 italic">
                        先在 Tab 1 执行“模拟崩溃演练”，然后点击上方按钮...
                      </span>
                    ) : (
                      naiveLogs.map((nl, idx) => (
                        <div
                          key={idx}
                          className={
                            nl.includes("FATAL") || nl.includes("DISASTER")
                              ? "text-rose-400 font-semibold"
                              : "text-slate-400"
                          }
                        >
                          {nl}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {naiveError && (
                  <div className="mt-4 p-3 rounded-lg bg-rose-950/40 border border-rose-500/50 text-rose-300 text-xs">
                    <div className="font-bold flex items-center gap-1.5 mb-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      灾难复现：非幂等调用冲突
                    </div>
                    <p className="text-[11px] font-mono leading-relaxed">
                      {naiveError}
                    </p>
                  </div>
                )}
              </div>

              {/* Option B: Durable Resume */}
              <div className="bg-slate-900/40 border border-emerald-500/30 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 方案
                      B：容灾断点续跑 (Durable Resume)
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      WAL 检查点 + 幂等重放
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                    工业级解决方案：读取 WAL
                    检查点，直接恢复当时的全局状态；在经过具有外部副作用的节点时，命中
                    Idempotency Vault 缓存，跳过重复写库，平滑推进后续步骤！
                  </p>

                  <button
                    onClick={handleResumeWorkflow}
                    disabled={isRunning || checkpoints.length === 0}
                    className="w-full py-2.5 bg-emerald-600/30 hover:bg-emerald-600/40 border border-emerald-500/50 text-emerald-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-40 mb-4"
                  >
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                    一键从最新 Checkpoint 容灾续跑
                  </button>

                  <div className="bg-[#05070e] border border-emerald-950 rounded-lg p-3 text-xs font-mono space-y-2">
                    <div className="text-emerald-400 font-semibold flex items-center gap-1.5">
                      <Check className="w-3 h-3" /> 容灾机制保障点：
                    </div>
                    <ul className="text-slate-300 space-y-1 text-[11px] list-disc pl-4">
                      <li>
                        Step 2 的 Checkpoint #2 已固化在 WAL 中，精准恢复全局状态；
                      </li>
                      <li>
                        幂等键{" "}
                        <code className="text-cyan-300">
                          idem_db_migration_...
                        </code>{" "}
                        命中缓存，直接复用事务哈希；
                      </li>
                      <li>
                        零重复 DDL，零报警轰炸，零 Token 浪费，无缝执行 Step 3~5。
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="mt-4 p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/40 text-emerald-300 text-xs">
                  <div className="font-semibold mb-1">
                    当前 WAL 处于就绪状态:
                  </div>
                  <div className="text-[11px] text-slate-300">
                    可恢复检查点：
                    <span className="font-mono text-purple-300 font-bold">
                      {checkpoints.length > 0
                        ? checkpoints[checkpoints.length - 1].checkpointId
                        : "暂无 (请先运行)"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: 时间旅行与分支推演 */}
        {/* ========================================================================= */}
        {activeTab === "timetravel" && (
          <div className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-bold text-slate-200 mb-1 flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-400" />
                时间旅行调试器 (Time-Travel Checkpoint Scrubber & Fork)
              </h3>
              <p className="text-xs text-slate-400">
                任意点击时间轴上的历史 Checkpoint，还原当时的全局变量快照（State
                Snapshot），比对前后差异，甚至从历史节点开启全新分支推演。
              </p>
            </div>

            {checkpoints.length === 0 ? (
              <div className="text-center py-16 bg-slate-900/30 border border-slate-800/80 rounded-xl text-slate-500 text-xs">
                暂无检查点数据。请在 Tab 1 中运行一次流水线。
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Checkpoint Timeline List */}
                <div className="md:col-span-5 bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-semibold text-slate-300 mb-3 flex items-center justify-between">
                    <span>WAL 检查点时序树 ({checkpoints.length})</span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      DAG Pointer Tree
                    </span>
                  </div>

                  <div className="space-y-2">
                    {checkpoints.map((cp, idx) => {
                      const isSelected =
                        selectedCheckpoint?.checkpointId === cp.checkpointId;
                      return (
                        <div
                          key={cp.checkpointId}
                          onClick={() => setSelectedCheckpoint(cp)}
                          className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                            isSelected
                              ? "bg-indigo-950/40 border-indigo-500 shadow-md shadow-indigo-950/50"
                              : "bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-400"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-slate-200 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-indigo-400" />
                              Step {cp.stepIndex}
                            </span>
                            <span className="text-[10px] font-mono text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded">
                              {cp.checkpointId.substring(0, 18)}...
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-300 font-medium truncate">
                            {cp.label}
                          </div>

                          <div className="mt-1 text-[10px] text-slate-500 truncate">
                            {cp.diffSummary}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Checkpoint Inspector */}
                <div className="md:col-span-7 space-y-4">
                  {selectedCheckpoint ? (
                    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-2">
                            <span>快照详情: Step {selectedCheckpoint.stepIndex}</span>
                            <span className="font-mono text-[10px] text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded border border-indigo-500/30">
                              {selectedCheckpoint.checkpointId}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Parent:{" "}
                            <span className="font-mono text-slate-300">
                              {selectedCheckpoint.parentCheckpointId || "ROOT"}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={handleForkCheckpoint}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/40 border border-indigo-500/50 text-indigo-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        >
                          <GitFork className="w-3.5 h-3.5 text-indigo-400" />
                          从本断点 Fork 分支
                        </button>
                      </div>

                      {forkSuccessMsg && (
                        <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/50 text-emerald-300 text-xs flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          {forkSuccessMsg}
                        </div>
                      )}

                      <div>
                        <div className="text-xs font-semibold text-slate-300 mb-1.5">
                          状态差量概括 (State Diff Summary):
                        </div>
                        <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-xs font-mono text-cyan-300">
                          {selectedCheckpoint.diffSummary}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-semibold text-slate-300 mb-1.5">
                          全局状态快照 (Variables Snapshot):
                        </div>
                        <pre className="bg-[#05070e] border border-slate-800 p-3 rounded-lg text-xs font-mono text-slate-300 max-h-56 overflow-y-auto">
                          {JSON.stringify(
                            selectedCheckpoint.state.variables,
                            null,
                            2
                          )}
                        </pre>
                      </div>

                      <div>
                        <div className="text-xs font-semibold text-slate-300 mb-1.5">
                          分支状态补丁 (Fork Variable Patch JSON):
                        </div>
                        <textarea
                          value={forkVarPatch}
                          onChange={(e) => setForkVarPatch(e.target.value)}
                          rows={3}
                          className="w-full bg-[#05070e] border border-slate-800 rounded-lg p-2.5 text-xs font-mono text-purple-300 focus:outline-none focus:border-purple-500/60"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-16 bg-slate-900/20 border border-slate-800 rounded-xl text-slate-500 text-xs">
                      请在左侧选择一个 Checkpoint
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: 幂等锁与副作用账本 */}
        {/* ========================================================================= */}
        {activeTab === "ledger" && (
          <div className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-bold text-slate-200 mb-1 flex items-center gap-2">
                <Lock className="w-4 h-4 text-cyan-400" />
                副作用与幂等锁账本 (Idempotency Vault & Side-Effect Ledger)
              </h3>
              <p className="text-xs text-slate-400">
                记录系统遭遇的所有外部副作用操作（如数据库 DDL、Webhook
                广播、云端部署）。
                每一个操作基于参数计算唯一幂等键，确保在断点续跑时命中缓存，杜绝重复扣费与重复写库。
              </p>
            </div>

            {idempotencyRecords.length === 0 ? (
              <div className="text-center py-16 bg-slate-900/30 border border-slate-800/80 rounded-xl text-slate-500 text-xs">
                暂无副作用记录。在 Tab 1 运行带有副作用的节点后即可实时查看。
              </div>
            ) : (
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900/90 border-b border-slate-800 text-slate-400">
                      <th className="p-3.5 font-semibold">动作名称</th>
                      <th className="p-3.5 font-semibold">全局幂等键 (Key)</th>
                      <th className="p-3.5 font-semibold">状态</th>
                      <th className="p-3.5 font-semibold">调用计数</th>
                      <th className="p-3.5 font-semibold">执行时间</th>
                      <th className="p-3.5 font-semibold">结果快照</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {idempotencyRecords.map((r) => (
                      <tr key={r.key} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-3.5 font-semibold text-slate-200 font-mono">
                          {r.actionName}
                        </td>
                        <td className="p-3.5 font-mono text-cyan-300">
                          {r.key}
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                              r.executionCount > 1
                                ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            }`}
                          >
                            {r.executionCount > 1 ? "Replayed" : "Executed"}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-slate-300">
                          {r.executionCount} 次
                        </td>
                        <td className="p-3.5 text-slate-400 text-[11px]">
                          {new Date(r.executedAt).toLocaleTimeString()}
                        </td>
                        <td className="p-3.5 font-mono text-[11px] text-slate-400 max-w-xs truncate">
                          {JSON.stringify(r.result)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getNodeIcon(nodeId: string) {
  switch (nodeId) {
    case "quality_gate":
      return <FileCode className="w-3.5 h-3.5 text-cyan-400" />;
    case "db_migration":
      return <Database className="w-3.5 h-3.5 text-amber-400" />;
    case "team_alert":
      return <Send className="w-3.5 h-3.5 text-purple-400" />;
    case "integration_tests":
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    case "canary_deploy":
      return <Globe className="w-3.5 h-3.5 text-rose-400" />;
    default:
      return <Activity className="w-3.5 h-3.5 text-slate-400" />;
  }
}

function isSideEffectBadge(isSideEffect: boolean) {
  if (isSideEffect) {
    return (
      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
        高危副作用
      </span>
    );
  }
  return (
    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
      只读安全
    </span>
  );
}

function getLogColor(level: string) {
  switch (level) {
    case "checkpoint":
      return "text-purple-300";
    case "idempotent":
      return "text-cyan-300";
    case "wal":
      return "text-indigo-300";
    case "error":
      return "text-rose-400 font-semibold";
    case "warn":
      return "text-amber-300";
    default:
      return "text-slate-300";
  }
}


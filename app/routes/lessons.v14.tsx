import { useState, useEffect } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import type {
  SessionChaosResult,
  SessionChaosScenarioType,
  SessionVerificationTestResult,
  SessionIntegrityCheckResult,
} from "~/core/session";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  CornerDownRight,
  Cpu,
  Database,
  FileCode,
  FolderTree,
  GitBranch,
  GitFork,
  HardDrive,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wrench,
  XCircle,
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

export default function LessonV14Page() {
  const { hasServerKey, model, defaultBaseURL } = useLoaderData<typeof loader>();

  // LLM Config state
  const [customApiKey, setCustomApiKey] = useState("");
  const [customBaseURL, setCustomBaseURL] = useState(defaultBaseURL);

  useEffect(() => {
    const storedKey = localStorage.getItem("MINI_CLAUDE_API_KEY");
    if (storedKey) setCustomApiKey(storedKey);
    const storedBase = localStorage.getItem("MINI_CLAUDE_BASE_URL");
    if (storedBase) setCustomBaseURL(storedBase);
  }, []);

  const handleSaveSettings = ({ apiKey, baseURL }: { apiKey: string; baseURL: string }) => {
    setCustomApiKey(apiKey);
    setCustomBaseURL(baseURL);
    localStorage.setItem("MINI_CLAUDE_API_KEY", apiKey);
    localStorage.setItem("MINI_CLAUDE_BASE_URL", baseURL);
  };

  const isKeyAvailable = hasServerKey || Boolean(customApiKey.trim().length > 0);

  // Active Tab
  const [activeTab, setActiveTab] = useState<
    "inspector" | "chaos" | "timetravel" | "verify" | "pi_architecture"
  >("inspector");

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "success" | "warning" | "error" | "info";
  } | null>(null);

  // ==========================================
  // Session & Workspace Data State
  // ==========================================
  const [sessionData, setSessionData] = useState<{
    id: string;
    title: string;
    workspaceRoot: string;
    activeBranchId: string;
    branches: { id: string; name: string; runIds: string[]; createdAt: number }[];
    createdAt: number;
    updatedAt: number;
  } | null>(null);

  const [currentRun, setCurrentRun] = useState<{
    id: string;
    branchId: string;
    status: string;
    currentStep: number;
    messages: any[];
    toolCount: number;
    toolHistory: any[];
    checkpoints: {
      id: string;
      stepNumber: number;
      timestamp: number;
      description?: string;
      filesCount: number;
      rootHash: string;
      messagesCount: number;
    }[];
  } | null>(null);

  const [workspaceData, setWorkspaceData] = useState<{
    files: { path: string; content: string; hash: string; size: number }[];
    rootHash: string;
    driftReport: {
      hasDrift: boolean;
      conflicts: { path: string; type: string; message: string }[];
    };
    ghostReport: {
      hasGhostReferences: boolean;
      ghostFiles: string[];
      details: string[];
    };
  } | null>(null);

  const fetchSessionData = async () => {
    try {
      const res = await fetch("/api/session");
      const data = await res.json();
      if (data.success) {
        setSessionData(data.session);
        setCurrentRun(data.currentRun);
        setWorkspaceData(data.workspace);
      }
    } catch (err: any) {
      console.error("Failed to load session data:", err);
    }
  };

  useEffect(() => {
    fetchSessionData();
  }, []);

  // ==========================================
  // Tab 2: Chaos Lab State
  // ==========================================
  const [selectedScenario, setSelectedScenario] =
    useState<SessionChaosScenarioType>("ghost_state_disaster");
  const [chaosResult, setChaosResult] = useState<SessionChaosResult | null>(null);

  const runChaosScenario = async (scenario: SessionChaosScenarioType) => {
    setIsLoading(true);
    setStatusMessage({
      text: isKeyAvailable
        ? `正在调用真实大模型 (${model}) 运行破坏对照实验...`
        : "正在运行会话破坏与时空倾斜实验...",
      type: "info",
    });
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_chaos",
          scenario,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setChaosResult(data.result);
        setStatusMessage({
          text: `对照实验 [${data.result.title}] 执行完毕！${data.result.isRealLLM ? ` (真实大模型: ${data.result.modelUsed})` : ""}`,
          type: "success",
        });
      } else {
        setStatusMessage({ text: data.error || "执行失败", type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: "网络请求异常: " + err.message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  // Live Agent Task State & Pre-flight Barrier
  interface DriftConflictPrompt {
    message: string;
    conflicts: Array<{ type: string; path: string; message: string }>;
    latestRootHash: string;
    currentRootHash: string;
  }

  interface LastTaskResult {
    prompt: string;
    thought: string;
    toolCalls: Array<{
      toolName: string;
      input: any;
      output: string;
      durationMs: number;
      timestamp: number;
    }>;
    stepNumber: number;
    rootHash: string;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    isSkewedExecution?: boolean;
    driftAlert?: string;
    midFlightAlerts?: string[];
  }

  const [liveTaskPrompt, setLiveTaskPrompt] = useState(
    "请为 src/auth.ts 编写基于 HMAC-SHA256 的 token 生成与验签函数，并在 src/config.json 注入 secret 字段。"
  );
  const [driftConflictPrompt, setDriftConflictPrompt] = useState<DriftConflictPrompt | null>(null);
  const [lastTaskResult, setLastTaskResult] = useState<LastTaskResult | null>(null);

  const handleRunLiveTask = async (ignoreDrift = false) => {
    if (isLoading || !liveTaskPrompt.trim()) return;
    setIsLoading(true);
    setDriftConflictPrompt(null);
    setStatusMessage({
      text: ignoreDrift
        ? `⚠️ 正在强制盲目调用大模型 (${model}) 运行任务（忽略漂移与时空倾斜）...`
        : `Coding Agent 正在调用大模型 (${model}) 思考并执行工具...`,
      type: ignoreDrift ? "warning" : "info",
    });
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_real_task",
          prompt: liveTaskPrompt.trim(),
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
          ignoreDrift,
        }),
      });
      const data = await res.json();

      if (res.status === 409 && data.driftBlocked) {
        setDriftConflictPrompt({
          message: data.message,
          conflicts: data.conflicts || [],
          latestRootHash: data.latestRootHash || "",
          currentRootHash: data.currentRootHash || "",
        });
        setStatusMessage({
          text: "🚨 防漂移屏障已拦截：物理工作区与基线快照不一致！请在控制台决策处理策略。",
          type: "warning",
        });
        await fetchSessionData();
        return;
      }

      if (data.success) {
        setLastTaskResult({
          prompt: liveTaskPrompt.trim(),
          thought: data.thought || "任务顺利完成，已落盘原子快照。",
          toolCalls: data.toolCalls || [],
          stepNumber: data.checkpoint?.stepNumber || 0,
          rootHash: data.checkpoint?.rootHash || "",
          usage: data.usage,
          isSkewedExecution: data.isSkewedExecution,
          driftAlert: data.driftAlert,
          midFlightAlerts: data.midFlightAlerts,
        });
        setStatusMessage({
          text: data.isSkewedExecution
            ? `⚠️ 任务强制执行完毕（带漂移），Step ${data.checkpoint.stepNumber} 快照已生成！请查看工具执行痕迹。`
            : `✅ 任务执行成功！Step ${data.checkpoint.stepNumber} 快照已生成 (RootHash: ${data.checkpoint.rootHash.substring(0, 8)}...)`,
          type: data.isSkewedExecution ? "warning" : "success",
        });
        await fetchSessionData();
      } else {
        setStatusMessage({ text: data.error || "任务执行失败", type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: "网络请求异常: " + err.message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreAndRun = async () => {
    if (!currentRun || currentRun.checkpoints.length === 0) return;
    const latestCkpt = currentRun.checkpoints[currentRun.checkpoints.length - 1];
    setIsLoading(true);
    setStatusMessage({ text: "正在还原基线工作区快照...", type: "info" });
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore_checkpoint", checkpointId: latestCkpt.id }),
      });
      const data = await res.json();
      if (data.success) {
        setDriftConflictPrompt(null);
        await fetchSessionData();
        await handleRunLiveTask(false);
      } else {
        setStatusMessage({ text: "还原失败: " + data.error, type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: "请求异常: " + err.message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // Tab 3: Time-Travel & Branching State
  // ==========================================
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [resumeValidationReport, setResumeValidationReport] =
    useState<SessionIntegrityCheckResult | null>(null);
  const [newBranchInput, setNewBranchInput] = useState("feature-jose-crypto");

  const handleInjectDrift = async (
    driftType: "modify_auth" | "delete_auth" | "add_untracked" | "reset_clean"
  ) => {
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "inject_drift", driftType }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          text: `⚡ 已执行物理工作区变动：${driftType}（若大模型此时正在思考，工具调用将遭遇并发时空倾斜）`,
          type: "warning",
        });
        await fetchSessionData();
      }
    } catch (err: any) {
      setStatusMessage({ text: "注入失败: " + err.message, type: "error" });
    }
  };

  const handleValidateResume = async (ckptId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate_resume", checkpointId: ckptId }),
      });
      const data = await res.json();
      if (data.success) {
        setResumeValidationReport(data.report);
        if (data.report.valid) {
          setStatusMessage({
            text: "✅ 工作区哈希与快照完全一致，可安全无损恢复！",
            type: "success",
          });
        } else {
          setStatusMessage({
            text: `⚠️ 拦截到 ${data.report.drift.conflicts.length} 处漂移冲突！建议执行: ${data.report.suggestedAction}`,
            type: "warning",
          });
        }
      }
    } catch (err: any) {
      setStatusMessage({ text: "验证失败: " + err.message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreCheckpoint = async (ckptId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore_checkpoint", checkpointId: ckptId }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          text: `✅ 物理工作区已原子还原至 Step ${data.stepNumber} 快照状态！`,
          type: "success",
        });
        setResumeValidationReport(null);
        await fetchSessionData();
      }
    } catch (err: any) {
      setStatusMessage({ text: "恢复失败: " + err.message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForkBranch = async (ckptId: string) => {
    if (!newBranchInput.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fork_branch",
          checkpointId: ckptId,
          newBranchName: newBranchInput.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          text: `🌿 成功开辟新分支 '${data.branch.name}' 并切换！`,
          type: "success",
        });
        await fetchSessionData();
      }
    } catch (err: any) {
      setStatusMessage({ text: "分叉失败: " + err.message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // Tab 4: Verification Suite State
  // ==========================================
  const [testResults, setTestResults] = useState<SessionVerificationTestResult[]>([]);

  const runVerificationSuite = async () => {
    setIsLoading(true);
    setStatusMessage({ text: "正在执行 Session 领域守恒律自动化测试...", type: "info" });
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_verification" }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResults(data.tests);
        const allPassed = data.tests.every((t: SessionVerificationTestResult) => t.passed);
        setStatusMessage({
          text: allPassed
            ? " 4 项 Session 领域守恒律自动化契约全部绿灯通过！"
            : "❌ 存在未通过的契约测试，请检查实现！",
          type: allPassed ? "success" : "error",
        });
      }
    } catch (err: any) {
      setStatusMessage({ text: "测试异常: " + err.message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070a13] text-slate-100 flex flex-col selection:bg-emerald-500/30">
      <Header
        hasServerKey={hasServerKey}
        model={model}
        defaultBaseURL={defaultBaseURL}
        customApiKey={customApiKey}
        customBaseURL={customBaseURL}
        onSaveSettings={handleSaveSettings}
        currentLesson={{
          id: "v14",
          title: "第 15 课: Session 为什么不是 Messages？",
          badge: "Pi 时空架构",
        }}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-6">
        {/* Banner */}
        <div className="relative glass-panel rounded-2xl p-6 border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-[#0c1322] to-teal-950/30 overflow-hidden shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  第 15 课 · 第二学期
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Coding Agent Runtime · Pi 架构专题
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                Session 为什么不是 Messages？
              </h1>
              <p className="text-slate-300 text-sm max-w-3xl leading-relaxed">
                解构 Coding Agent 的时空实体：
                <span className="text-emerald-300 font-medium"> Message History </span>只是给
                LLM 看的注意力投影，而真正的
                <span className="text-cyan-300 font-medium"> Session </span>承载着物理工作区指纹 (Workspace Snapshot)、非线性分支树 (Branch Tree) 与副作用账本。彻底攻克“幽灵状态灾难”与“时空倾斜”。
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                to="/docs/lessons/15-session-vs-messages.md"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-600/50 transition"
              >
                <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                <span>阅读课程教案</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Global Status Banner */}
        {statusMessage && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-mono flex items-center justify-between transition-all ${
              statusMessage.type === "success"
                ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
                : statusMessage.type === "warning"
                ? "bg-amber-950/40 border-amber-500/40 text-amber-200"
                : statusMessage.type === "error"
                ? "bg-rose-950/40 border-rose-500/40 text-rose-200"
                : "bg-cyan-950/40 border-cyan-500/40 text-cyan-200"
            }`}
          >
            <span>{statusMessage.text}</span>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("inspector")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
              activeTab === "inspector"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>时空树与工作区感知</span>
          </button>

          <button
            onClick={() => setActiveTab("chaos")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
              activeTab === "chaos"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <span>幽灵灾难对照实验室</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-mono">
              破坏实验
            </span>
          </button>

          <button
            onClick={() => setActiveTab("timetravel")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
              activeTab === "timetravel"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>时空旅行与分叉推演</span>
          </button>

          <button
            onClick={() => setActiveTab("verify")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
              activeTab === "verify"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>自动化契约验收套件</span>
          </button>

          <button
            onClick={() => setActiveTab("pi_architecture")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
              activeTab === "pi_architecture"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Pi 架构源码深剖</span>
          </button>
        </div>

        {/* ========================================== */}
        {/* TAB 1: 时空树与工作区感知 (Session Inspector) */}
        {/* ========================================== */}
        {activeTab === "inspector" && (
          <div className="space-y-6">
            {/* Top State Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="glass-panel p-4 rounded-xl border border-slate-800 bg-[#0c1220]/70 space-y-1">
                <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Session 聚合根 ID</span>
                </div>
                <div className="text-sm font-bold font-mono text-slate-200 truncate">
                  {sessionData?.id || "加载中..."}
                </div>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-slate-800 bg-[#0c1220]/70 space-y-1">
                <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
                  <span>当前活跃分支 (Branch)</span>
                </div>
                <div className="text-sm font-bold font-mono text-cyan-300">
                  {sessionData?.activeBranchId || "main"}
                  <span className="text-[10px] ml-2 text-slate-400 font-normal">
                    ({sessionData?.branches.length || 1} 个分支)
                  </span>
                </div>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-slate-800 bg-[#0c1220]/70 space-y-1">
                <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>原子快照总数 (Checkpoints)</span>
                </div>
                <div className="text-sm font-bold font-mono text-amber-300">
                  {currentRun?.checkpoints.length || 0} 个历史节点
                </div>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-slate-800 bg-[#0c1220]/70 space-y-1">
                <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-purple-400" />
                  <span>工作区密码学 RootHash</span>
                </div>
                <div className="text-xs font-bold font-mono text-purple-300 truncate">
                  {workspaceData?.rootHash.substring(0, 16) || "none"}...
                </div>
              </div>
            </div>

            {/* Live Agent Task Execution Console */}
            <div className="glass-panel p-5 rounded-2xl border border-indigo-500/30 bg-[#0e1426]/90 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    实时任务驱动 (Live Agent Runtime)
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                    模型: {model} {isKeyAvailable ? "🟢 API 就绪" : "🟡 未配 Key"}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  真实调用大模型 + 工具沙箱执行 + CAS 防漂移屏障拦截 + 原子快照落盘
                </div>
              </div>

              {/* Drift Detected Warning Alert */}
              {workspaceData?.driftReport.hasDrift && !driftConflictPrompt && (
                <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <div className="font-bold flex items-center justify-between">
                      <span>⚠️ 工作区已处于外部漂移状态 (Workspace Drift Active)</span>
                      <span className="text-[10px] font-mono text-amber-400">
                        当前物理 Hash 与快照不一致
                      </span>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      检测到磁盘已被外部篡改/删除。点击执行将触发 Session 防漂移屏障（CAS 乐观锁冲突拦截）！
                    </p>
                  </div>
                </div>
              )}

              {/* Drift Barrier Interception Resolution Card (409 Conflict) */}
              {driftConflictPrompt && (
                <div className="p-4 rounded-xl border border-rose-500/60 bg-rose-950/40 text-xs text-rose-200 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 font-bold text-rose-300">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    <span>🚨 防漂移屏障已拦截本次执行 (Pre-flight Barrier Intercepted)</span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    {driftConflictPrompt.message}
                    大模型的执行假设建立在上一原子快照指纹（{driftConflictPrompt.latestRootHash.substring(0, 6)}）上，但物理磁盘已被外部改动为（{driftConflictPrompt.currentRootHash.substring(0, 6)}）。在非线性 Session 治理体系中，严禁在时空倾斜状态下盲目写入！请选择应对策略：
                  </p>
                  <div className="p-2.5 rounded-lg bg-black/40 border border-rose-500/30 font-mono text-[11px] space-y-1">
                    <div className="text-slate-400 font-semibold">冲突文件列表：</div>
                    {driftConflictPrompt.conflicts.map((c, idx) => (
                      <div key={idx} className="text-rose-300 flex items-center gap-1.5">
                        <span className="text-rose-400">•</span>
                        <span>[{c.type.toUpperCase()}] {c.path}: {c.message}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      disabled={isLoading}
                      onClick={handleRestoreAndRun}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-md shadow-emerald-600/20"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>🛡️ 一键还原快照并安全执行 (Recommended)</span>
                    </button>
                    <button
                      disabled={isLoading}
                      onClick={() => handleRunLiveTask(true)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-xs transition"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>💥 模拟时空倾斜：强制盲目执行 (Force Blind Run)</span>
                    </button>
                    <button
                      onClick={() => setDriftConflictPrompt(null)}
                      className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  disabled={isLoading}
                  value={liveTaskPrompt}
                  onChange={(e) => setLiveTaskPrompt(e.target.value)}
                  placeholder="输入真实指令给 Agent（如：在 src/auth.ts 中编写 verifyToken 函数...）"
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-xs text-slate-100 font-mono placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                />
                <button
                  disabled={isLoading}
                  onClick={() => handleRunLiveTask(false)}
                  className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold transition shadow-lg shadow-indigo-500/20 shrink-0 disabled:opacity-60"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>正在调用模型与执行工具...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>执行真实任务</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-400">
                <span className="text-slate-500">快速填充预设：</span>
                <button
                  onClick={() =>
                    setLiveTaskPrompt(
                      "请在 src/auth.ts 中增加基于 HMAC-SHA256 的 token 生成与验签逻辑，并在 src/config.json 注入 secret 字段。"
                    )
                  }
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  重构 auth.ts
                </button>
                <button
                  onClick={() =>
                    setLiveTaskPrompt(
                      "请在 src/math.ts 中实现 Fibonacci 与统计平均值计算工具，并更新 src/index.ts 导入调用。"
                    )
                  }
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  创建 math.ts
                </button>
                <button
                  onClick={() =>
                    setLiveTaskPrompt(
                      "请用 read_file 查看 package.json，并更新 package.json 添加 author 字段。"
                    )
                  }
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  读取并修改 package.json
                </button>
              </div>

              {/* Execution Result Card (Last Task Trace) */}
              {lastTaskResult && (
                <div className="mt-4 p-4 rounded-xl border border-indigo-500/40 bg-indigo-950/20 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      <span className="font-bold text-xs text-white">
                        Step {lastTaskResult.stepNumber} 执行实录 (Execution Trace)
                      </span>
                      {lastTaskResult.isSkewedExecution && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                          ⚠️ 漂移状态盲目执行
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      RootHash: {lastTaskResult.rootHash.substring(0, 8)}...
                    </span>
                  </div>

                  {lastTaskResult.driftAlert && (
                    <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-[11px] text-rose-200 leading-relaxed">
                      {lastTaskResult.driftAlert}
                    </div>
                  )}

                  {lastTaskResult.midFlightAlerts && lastTaskResult.midFlightAlerts.length > 0 && (
                    <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-[11px] text-amber-200 space-y-1 font-mono">
                      {lastTaskResult.midFlightAlerts.map((alt, idx) => (
                        <div key={idx}>{alt}</div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-indigo-400" />
                      <span>大模型推理输出 (LLM Thought & Response):</span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                      {lastTaskResult.thought}
                    </div>
                  </div>

                  {lastTaskResult.toolCalls.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                        <Wrench className="w-3 h-3 text-cyan-400" />
                        <span>沙箱工具调用明细 ({lastTaskResult.toolCalls.length} 个操作):</span>
                      </div>
                      <div className="space-y-1.5">
                        {lastTaskResult.toolCalls.map((tc, idx) => {
                          const isError =
                            tc.output.toLowerCase().includes("error") ||
                            tc.output.toLowerCase().includes("not found");
                          return (
                            <div
                              key={idx}
                              className={`p-2.5 rounded-lg border font-mono text-[11px] space-y-1 ${
                                isError
                                  ? "bg-rose-950/40 border-rose-500/50 text-rose-200"
                                  : "bg-slate-900/60 border-slate-800 text-slate-300"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-cyan-300">
                                  ⚡ {tc.toolName}({JSON.stringify(tc.input)})
                                </span>
                                <span className="text-[10px] text-slate-500">{tc.durationMs}ms</span>
                              </div>
                              <div className="text-slate-400 truncate max-w-full">
                                ➜ {tc.output}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                    <div>
                      {lastTaskResult.usage && (
                        <span>
                          Token 消耗: 输入 {lastTaskResult.usage.promptTokens} / 输出{" "}
                          {lastTaskResult.usage.completionTokens} (总计{" "}
                          {lastTaskResult.usage.totalTokens})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setLiveTaskPrompt(
                            "请为 src/auth.ts 编写完整的单元测试用例，并在 src/auth.test.ts 中保存。"
                          );
                        }}
                        className="px-2 py-1 rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 transition text-[10px]"
                      >
                        💡 建议下一步：编写单元测试
                      </button>
                      <button
                        onClick={() => setLastTaskResult(null)}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px] transition"
                      >
                        收起记录
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Ghost Reference Warning Bar (if detected) */}
            {workspaceData?.ghostReport.hasGhostReferences && (
              <div className="glass-panel p-4 rounded-xl border border-rose-500/50 bg-rose-950/30 text-xs text-rose-200 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <div className="font-bold flex items-center gap-2">
                    <span>🚨 检测到幽灵引用风险 (Ghost Reference Disaster Detected)</span>
                    <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[10px] font-mono">
                      时空倾斜警报
                    </span>
                  </div>
                  <p className="text-rose-300/90 leading-relaxed">
                    大模型的历史消息中提到了某些文件，但物理工作区中根本不存在该文件！如果仅靠 Messages 恢复执行，LLM 将在幻觉中盲目编辑导致崩溃。
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 pt-1 text-slate-300 font-mono">
                    {workspaceData.ghostReport.details.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Main 2-Column Inspector Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 5 Cols: Session Tree (Branches -> Runs -> Checkpoints) */}
              <div className="lg:col-span-5 space-y-4">
                <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-[#0e1424]/80 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <GitBranch className="w-4 h-4 text-emerald-400" />
                      <h2 className="text-sm font-bold text-white">Session 时空分支树</h2>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      树状聚合根 (Non-linear DAG)
                    </span>
                  </div>

                  <div className="space-y-3">
                    {sessionData?.branches.map((branch) => {
                      const isBranchActive = sessionData.activeBranchId === branch.id;
                      return (
                        <div
                          key={branch.id}
                          className={`p-3 rounded-xl border transition ${
                            isBranchActive
                              ? "bg-emerald-950/20 border-emerald-500/40"
                              : "bg-slate-900/40 border-slate-800"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <GitBranch
                                className={`w-3.5 h-3.5 ${
                                  isBranchActive ? "text-emerald-400" : "text-slate-500"
                                }`}
                              />
                              <span className="font-mono text-xs font-semibold text-slate-200">
                                {branch.name}
                              </span>
                            </div>
                            {isBranchActive && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                                ACTIVE
                              </span>
                            )}
                          </div>

                          {/* Checkpoint list under this branch */}
                          {currentRun && (
                            <div className="mt-3 pl-4 border-l-2 border-slate-800 space-y-2">
                              {currentRun.checkpoints.map((ckpt) => {
                                const isSelected = selectedCheckpointId === ckpt.id;
                                return (
                                  <div
                                    key={ckpt.id}
                                    onClick={() => setSelectedCheckpointId(ckpt.id)}
                                    className={`p-2 rounded-lg cursor-pointer text-xs transition flex items-center justify-between ${
                                      isSelected
                                        ? "bg-emerald-950/40 border border-emerald-500/50 text-white"
                                        : "bg-slate-800/40 hover:bg-slate-800/80 text-slate-300"
                                    }`}
                                  >
                                    <div className="space-y-0.5">
                                      <div className="flex items-center gap-1.5">
                                        <CornerDownRight className="w-3 h-3 text-emerald-400" />
                                        <span className="font-bold font-mono">
                                          Step {ckpt.stepNumber}
                                        </span>
                                        <span className="text-[10px] text-slate-400">
                                          ({ckpt.filesCount} 文件)
                                        </span>
                                      </div>
                                      <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                                        {ckpt.description || "原子步骤快照"}
                                      </div>
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-500">
                                      {ckpt.rootHash.substring(0, 6)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Quick Drift Simulation Toolbar */}
                <div className="glass-panel p-4 rounded-xl border border-slate-800 bg-[#0c1220]/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-amber-400" />
                      <span>工作区漂移注入机 (Drift Injection)</span>
                    </div>
                    <span className="text-[10px] text-amber-400/80 font-mono">
                      可在模型思考中并发注入
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 leading-relaxed">
                    在执行前或模型思考期间点击注入，验证 CAS 防漂移屏障与并发时空倾斜：
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleInjectDrift("modify_auth")}
                      className="px-2.5 py-2 rounded-lg bg-amber-950/40 hover:bg-amber-900/50 text-amber-200 border border-amber-500/30 text-[11px] font-medium transition text-left"
                    >
                      ✏️ 外部修改 auth.ts
                    </button>
                    <button
                      onClick={() => handleInjectDrift("delete_auth")}
                      className="px-2.5 py-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 text-rose-200 border border-rose-500/30 text-[11px] font-medium transition text-left"
                    >
                      🗑️ 外部删除 auth.ts
                    </button>
                    <button
                      onClick={() => handleInjectDrift("add_untracked")}
                      className="px-2.5 py-2 rounded-lg bg-indigo-950/40 hover:bg-indigo-900/50 text-indigo-200 border border-indigo-500/30 text-[11px] font-medium transition text-left"
                    >
                      ➕ 注入未追踪文件
                    </button>
                    <button
                      onClick={() => handleInjectDrift("reset_clean")}
                      className="px-2.5 py-2 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-200 border border-emerald-500/30 text-[11px] font-medium transition text-left"
                    >
                      🧹 还原洁净状态
                    </button>
                  </div>
                </div>
              </div>

              {/* Right 7 Cols: Workspace Files with Cryptographic Hashes */}
              <div className="lg:col-span-7 space-y-4">
                <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-[#0e1424]/80 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-cyan-400" />
                      <h2 className="text-sm font-bold text-white">
                        物理工作区文件与指纹快照 (Workspace State)
                      </h2>
                    </div>
                    <button
                      disabled={isLoading}
                      onClick={fetchSessionData}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      title="刷新文件状态"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
                    </button>
                  </div>

                  {/* Drift Alert (if conflicts exist) */}
                  {workspaceData?.driftReport.hasDrift && (
                    <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200 space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span>检测到工作区存在外部漂移与冲突 (Drift Conflicts):</span>
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-amber-300/80 font-mono text-[11px]">
                        {workspaceData.driftReport.conflicts.map((c, idx) => (
                          <li key={idx}>{c.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Files List */}
                  <div className="space-y-2">
                    {workspaceData?.files.map((file) => {
                      const conflict = workspaceData.driftReport.conflicts.find(
                        (c) => c.path === file.path
                      );
                      return (
                        <div
                          key={file.path}
                          className={`p-3 rounded-xl border transition ${
                            conflict
                              ? "bg-amber-950/20 border-amber-500/40"
                              : "bg-[#090d18] border-slate-800"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                              <span className="font-mono text-xs font-semibold text-slate-200">
                                {file.path}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                ({file.size} 字节)
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {conflict ? (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold">
                                  DRIFT: {conflict.type.toUpperCase()}
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                                  IN SYNC
                                </span>
                              )}
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                                SHA: {file.hash.substring(0, 8)}...
                              </span>
                            </div>
                          </div>

                          <pre className="p-2.5 rounded-lg bg-[#05070d] text-[11px] font-mono text-slate-300 overflow-x-auto border border-slate-900 leading-relaxed max-h-32">
                            {file.content}
                          </pre>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 2: 幽灵灾难对照实验室 (Crash Lab) */}
        {/* ========================================== */}
        {activeTab === "chaos" && (
          <div className="space-y-6">
            {/* Scenario Selector Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                onClick={() => setSelectedScenario("ghost_state_disaster")}
                className={`p-4 rounded-2xl border cursor-pointer transition ${
                  selectedScenario === "ghost_state_disaster"
                    ? "bg-emerald-950/30 border-emerald-500/50 shadow-lg shadow-emerald-500/10"
                    : "bg-[#0c1220]/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                    破坏场景 1
                  </span>
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1">
                  幽灵状态与时空倾斜灾难
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Agent 修改文件后仅保存 messages；外部环境改动后重启，亲眼观察 LLM 产生幽灵幻觉引发致命崩溃。
                </p>
              </div>

              <div
                onClick={() => setSelectedScenario("compaction_truth_loss")}
                className={`p-4 rounded-2xl border cursor-pointer transition ${
                  selectedScenario === "compaction_truth_loss"
                    ? "bg-emerald-950/30 border-emerald-500/50 shadow-lg shadow-emerald-500/10"
                    : "bg-[#0c1220]/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                    破坏场景 2
                  </span>
                  <Database className="w-4 h-4 text-amber-400" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1">
                  上下文压缩与真相丢失
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  长流程触发 Compaction 压缩对话时，Messages 抹杀历史细节，而工业级 Session 仍保持 100% 物理真理。
                </p>
              </div>

              <div
                onClick={() => setSelectedScenario("branch_timeline_fork")}
                className={`p-4 rounded-2xl border cursor-pointer transition ${
                  selectedScenario === "branch_timeline_fork"
                    ? "bg-emerald-950/30 border-emerald-500/50 shadow-lg shadow-emerald-500/10"
                    : "bg-[#0c1220]/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                    破坏场景 3
                  </span>
                  <GitFork className="w-4 h-4 text-cyan-400" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1">
                  非线性分支探索与推演
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  探索碰壁需要回退时，线性 messages 剪切会引发上下文污染；对比 Pi 规范的原子快照开辟独立分叉。
                </p>
              </div>
            </div>

            {/* Run Button */}
            <div className="flex items-center justify-between glass-panel p-4 rounded-xl border border-slate-800 bg-[#0c1220]/60">
              <div className="text-xs text-slate-300">
                当前选定实验：
                <span className="text-emerald-400 font-bold font-mono ml-1">
                  {selectedScenario}
                </span>
              </div>
              <button
                disabled={isLoading}
                onClick={() => runChaosScenario(selectedScenario)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>大模型破坏对照实验运行中...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>运行破坏对照实验</span>
                  </>
                )}
              </button>
            </div>

            {/* Side-by-Side Results Display */}
            {chaosResult && (
              <div className="space-y-4">
                <div className="text-center font-bold text-base text-white">
                  {chaosResult.title}
                </div>

                {/* Live Model Metadata Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[#090e1c] border border-slate-800 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded font-bold ${
                        chaosResult.isRealLLM
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {chaosResult.isRealLLM ? "✨ 真实大模型在线实验实录" : "离线沙箱模拟"}
                    </span>
                    <span className="text-slate-300">
                      驱动模型: <strong className="text-white">{chaosResult.modelUsed}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                    <span>
                      实机耗时: <strong className="text-slate-200">{chaosResult.executionTimeMs}ms</strong>
                    </span>
                    {chaosResult.tokenUsage && (
                      <span>
                        消耗 Token:{" "}
                        <strong className="text-indigo-300">{chaosResult.tokenUsage.totalTokens}</strong>{" "}
                        (Prompt: {chaosResult.tokenUsage.promptTokens}, Completion:{" "}
                        {chaosResult.tokenUsage.completionTokens})
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column: 仅保存 Messages 模式（玩具模式） */}
                  <div className="glass-panel p-5 rounded-2xl border border-rose-500/40 bg-rose-950/10 space-y-4">
                    <div className="flex items-center justify-between border-b border-rose-500/20 pb-3">
                      <div className="flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-rose-400" />
                        <h4 className="text-sm font-bold text-rose-200">
                          {chaosResult.messagesOnlyMode.title}
                        </h4>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono font-bold">
                        {chaosResult.messagesOnlyMode.status.toUpperCase()}
                      </span>
                    </div>

                    {chaosResult.messagesOnlyMode.error && (
                      <div className="p-3 rounded-lg bg-black/60 border border-rose-500/30 text-[11px] font-mono text-rose-300 leading-relaxed overflow-x-auto">
                        {chaosResult.messagesOnlyMode.error}
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-300">崩塌机理剖析：</div>
                      <ul className="space-y-1 text-xs text-slate-400">
                        {chaosResult.messagesOnlyMode.details.map((d, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-rose-400 mt-0.5">•</span>
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Live Steps Trace in Mode A */}
                    {chaosResult.messagesOnlyMode.steps &&
                      chaosResult.messagesOnlyMode.steps.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-rose-500/20">
                          <div className="text-[11px] font-bold text-rose-300 flex items-center gap-1.5">
                            <Terminal className="w-3 h-3 text-rose-400" />
                            <span>真实调用实录与时空现场 (Live Step Trace):</span>
                          </div>
                          <div className="space-y-2">
                            {chaosResult.messagesOnlyMode.steps.map((st) => (
                              <div
                                key={st.step}
                                className="p-2.5 rounded-lg bg-black/60 border border-slate-800 text-[11px] font-mono space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-200">
                                    Step {st.step}: {st.phase}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 uppercase">
                                    {st.role}
                                  </span>
                                </div>
                                {st.toolCall && (
                                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800 text-indigo-300">
                                    🔧 Tool Call: <strong>{st.toolCall.name}</strong>(
                                    {JSON.stringify(st.toolCall.args)})
                                  </div>
                                )}
                                {st.observation && (
                                  <div
                                    className={`p-1.5 rounded border text-[10px] ${
                                      st.isError
                                        ? "bg-rose-950/40 border-rose-500/40 text-rose-300"
                                        : "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                                    }`}
                                  >
                                    👁️ Observation: {st.observation}
                                  </div>
                                )}
                                {st.content && (
                                  <div className="text-slate-400 whitespace-pre-wrap">{st.content}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {chaosResult.messagesOnlyMode.finalLLMResponse && (
                      <div className="p-2.5 rounded-lg bg-slate-900/90 border border-rose-500/30 text-[11px] font-mono text-slate-300 space-y-1">
                        <div className="text-rose-400 font-bold">大模型最终自白 / 答复：</div>
                        <div className="text-slate-200 whitespace-pre-wrap">
                          {chaosResult.messagesOnlyMode.finalLLMResponse}
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5 pt-2 border-t border-rose-500/20">
                      <div className="text-[11px] font-semibold text-rose-400">
                        不可挽回的数据丢失 (Data Loss):
                      </div>
                      <ul className="space-y-1 text-[11px] text-slate-400 font-mono">
                        {chaosResult.messagesOnlyMode.dataLoss.map((dl, i) => (
                          <li key={i}>❌ {dl}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Right Column: 工业级 Session 状态机模式 */}
                  <div className="glass-panel p-5 rounded-2xl border border-emerald-500/40 bg-emerald-950/10 space-y-4">
                    <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <h4 className="text-sm font-bold text-emerald-200">
                          {chaosResult.sessionStateMode.title}
                        </h4>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                        {chaosResult.sessionStateMode.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-xs font-semibold text-emerald-300 leading-relaxed">
                      🛡️ {chaosResult.sessionStateMode.protectionAction}
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-300">防御与保全实录：</div>
                      <ul className="space-y-1 text-xs text-slate-400">
                        {chaosResult.sessionStateMode.details.map((d, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-emerald-400 mt-0.5">✓</span>
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Live Steps Trace in Mode B */}
                    {chaosResult.sessionStateMode.steps &&
                      chaosResult.sessionStateMode.steps.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-emerald-500/20">
                          <div className="text-[11px] font-bold text-emerald-300 flex items-center gap-1.5">
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            <span>状态机保护与自愈实录 (Protection Trace):</span>
                          </div>
                          <div className="space-y-2">
                            {chaosResult.sessionStateMode.steps.map((st) => (
                              <div
                                key={st.step}
                                className="p-2.5 rounded-lg bg-black/60 border border-slate-800 text-[11px] font-mono space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-emerald-300">
                                    Step {st.step}: {st.phase}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 uppercase">
                                    {st.role}
                                  </span>
                                </div>
                                {st.toolCall && (
                                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800 text-indigo-300">
                                    🔧 Tool Call: <strong>{st.toolCall.name}</strong>(
                                    {JSON.stringify(st.toolCall.args)})
                                  </div>
                                )}
                                {st.observation && (
                                  <div className="p-1.5 rounded bg-emerald-950/40 border border-emerald-500/40 text-[10px] text-emerald-300">
                                    🛡️ Action: {st.observation}
                                  </div>
                                )}
                                {st.content && (
                                  <div className="text-slate-300 whitespace-pre-wrap">{st.content}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {chaosResult.sessionStateMode.finalLLMResponse && (
                      <div className="p-2.5 rounded-lg bg-slate-900/90 border border-emerald-500/30 text-[11px] font-mono text-slate-300 space-y-1">
                        <div className="text-emerald-400 font-bold">大模型自愈后答复 / 最终状态：</div>
                        <div className="text-slate-200 whitespace-pre-wrap">
                          {chaosResult.sessionStateMode.finalLLMResponse}
                        </div>
                      </div>
                    )}

                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1 text-[11px] font-mono">
                      <div className="text-slate-400 font-bold mb-1">保全指标度量：</div>
                      {Object.entries(chaosResult.sessionStateMode.preservationMetrics).map(
                        ([k, v]) => (
                          <div key={k} className="flex justify-between text-slate-300">
                            <span>{k}:</span>
                            <span className="text-emerald-400 font-bold">{String(v)}</span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>

                {/* Key Takeaway Banner */}
                <div className="glass-panel p-4 rounded-xl border border-indigo-500/30 bg-indigo-950/20 text-xs text-indigo-200 leading-relaxed flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-indigo-300">💡 核心架构启示：</span>{" "}
                    {chaosResult.keyTakeaway}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 3: 时空旅行与分叉推演 (Time-Travel Studio) */}
        {/* ========================================== */}
        {activeTab === "timetravel" && (
          <div className="space-y-6">
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-[#0e1424]/80 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span>时空旅行控制台 (Time-Travel Checkpoint Scrubber)</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    基于每一个历史步骤的密码学快照，支持原子回退与开启非线性推演分支。
                  </p>
                </div>
              </div>

              {/* Checkpoint selector buttons */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                {currentRun?.checkpoints.map((ckpt) => {
                  const isSelected = selectedCheckpointId === ckpt.id;
                  return (
                    <div
                      key={ckpt.id}
                      onClick={() => setSelectedCheckpointId(ckpt.id)}
                      className={`p-4 rounded-xl border cursor-pointer transition ${
                        isSelected
                          ? "bg-emerald-950/30 border-emerald-500/50 shadow-md"
                          : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                            Step {ckpt.stepNumber}
                          </span>
                          <span className="text-xs font-bold text-slate-200">
                            {ckpt.description}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">
                          {new Date(ckpt.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-slate-400 pt-1">
                        <div>文件数: {ckpt.filesCount}</div>
                        <div>消息数: {ckpt.messagesCount}</div>
                        <div className="truncate">Root: {ckpt.rootHash.substring(0, 8)}...</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Selected Checkpoint Action Studio */}
              {selectedCheckpointId && (
                <div className="pt-4 border-t border-slate-800 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-300">
                      选定快照：<span className="font-mono text-emerald-400">{selectedCheckpointId}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        disabled={isLoading}
                        onClick={() => handleValidateResume(selectedCheckpointId)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {isLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ShieldCheck className="w-3.5 h-3.5" />
                        )}
                        <span>{isLoading ? "正在预检..." : "预检可恢复性"}</span>
                      </button>

                      <button
                        disabled={isLoading}
                        onClick={() => handleRestoreCheckpoint(selectedCheckpointId)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600/80 hover:bg-amber-600 text-white text-xs font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {isLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <HardDrive className="w-3.5 h-3.5" />
                        )}
                        <span>{isLoading ? "正在还原..." : "原子还原此时刻工作区"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Validation Report Modal/Card */}
                  {resumeValidationReport && (
                    <div
                      className={`p-4 rounded-xl border text-xs leading-relaxed space-y-2 ${
                        resumeValidationReport.valid
                          ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-200"
                          : "bg-amber-950/20 border-amber-500/40 text-amber-200"
                      }`}
                    >
                      <div className="font-bold flex items-center gap-2">
                        {resumeValidationReport.valid ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>完整性检验通过：物理工作区状态与此 Checkpoint 完美一致！</span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                            <span>
                              拦截到潜在冲突！建议采取措施：'{resumeValidationReport.suggestedAction}'
                            </span>
                          </>
                        )}
                      </div>

                      {resumeValidationReport.drift.conflicts.length > 0 && (
                        <div className="space-y-1 font-mono text-[11px] pt-1">
                          <div className="text-slate-400">检测到的冲突列表：</div>
                          {resumeValidationReport.drift.conflicts.map((c, i) => (
                            <div key={i} className="text-amber-300">
                              • [{c.type.toUpperCase()}] {c.message}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Branch Forking Bar */}
                  <div className="p-4 rounded-xl bg-[#090d18] border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <GitFork className="w-4 h-4 text-cyan-400" />
                      <span>从此快照开辟独立探索分支 (Fork Branch)：</span>
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto">
                      <input
                        type="text"
                        value={newBranchInput}
                        onChange={(e) => setNewBranchInput(e.target.value)}
                        placeholder="新分支名称..."
                        className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                      />
                      <button
                        disabled={isLoading}
                        onClick={() => handleForkBranch(selectedCheckpointId)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>{isLoading ? "正在开辟..." : "开辟新分支"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 4: 自动化契约验收套件 (Verification) */}
        {/* ========================================== */}
        {activeTab === "verify" && (
          <div className="space-y-6">
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-[#0e1424]/80 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Session 架构 4 大领域守恒律自动化测试套件</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    严格验证 Message History $\neq$ Session $\neq$ Runtime State 的数学与工程契约。
                  </p>
                </div>

                <button
                  disabled={isLoading}
                  onClick={runVerificationSuite}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-md shadow-emerald-500/20 shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>正在执行契约验收测试...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>运行全部 4 项验收测试</span>
                    </>
                  )}
                </button>
              </div>

              {/* Test List Cards */}
              <div className="space-y-3">
                {testResults.length === 0 ? (
                  <div className="text-center py-10 text-slate-500 text-xs">
                    点击上方按钮启动自动化契约验收测试
                  </div>
                ) : (
                  testResults.map((test) => (
                    <div
                      key={test.id}
                      className={`p-4 rounded-xl border transition ${
                        test.passed
                          ? "bg-emerald-950/10 border-emerald-500/30"
                          : "bg-rose-950/20 border-rose-500/40"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {test.passed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-400" />
                          )}
                          <h4 className="text-xs font-bold text-white">{test.name}</h4>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[10px]">
                          <span className="text-slate-500">{test.durationMs}ms</span>
                          <span
                            className={`px-2 py-0.5 rounded font-bold ${
                              test.passed
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-rose-500/20 text-rose-300"
                            }`}
                          >
                            {test.passed ? "PASSED" : "FAILED"}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-400 mb-2">{test.description}</p>

                      <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] font-mono space-y-1">
                        <div className="text-slate-400">
                          <span className="text-indigo-300">预期契约：</span>{" "}
                          {test.expectedBehavior}
                        </div>
                        <div className={test.passed ? "text-emerald-400" : "text-rose-400"}>
                          <span className="text-indigo-300">实际表现：</span>{" "}
                          {test.actualBehavior}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 5: Pi 架构源码深剖 (Pi Architecture) */}
        {/* ========================================== */}
        {activeTab === "pi_architecture" && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 bg-[#0e1424]/80 space-y-6">
              <div className="space-y-2 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <h3 className="text-base font-bold text-white">
                    开源先驱 Pi (`wayfind/pi-mono`) 的 Session 架构设计哲学
                  </h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">
                  作为目前最优雅的 Minimal Terminal Coding Harness，Pi 将 Session 提升为一等公民实体。
                  以下是 Pi 核心源码中关于 Session、Events、Branching 与 Compaction 的工业级落地解剖：
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Topic 1: 磁盘存储分层 */}
                <div className="p-4 rounded-xl border border-slate-800 bg-[#090d18] space-y-2">
                  <div className="text-xs font-bold text-cyan-300 flex items-center gap-2">
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>1. 物理磁盘布局与只追加文件流</span>
                  </div>
                  <pre className="p-3 rounded-lg bg-black text-[11px] font-mono text-emerald-400 overflow-x-auto leading-relaxed">
{`.pi/
└── sessions/
    └── sess_01HXYZ/
        ├── session.json      # 会话元数据、当前 HEAD、分支指引
        ├── events.jsonl      # Event Sourcing 只追加不可变事件日志
        └── snapshots/        # 关键 step 发生时的文件树哈希快照`}
                  </pre>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Pi 绝不会把聊天记录存在单一大 JSON 数组里，而是采用只追加的{" "}
                    <code className="text-cyan-300">events.jsonl</code>。即使操作系统断电或 Agent 崩溃，已写磁盘的事件绝对不会损坏。
                  </p>
                </div>

                {/* Topic 2: PromptContext vs Session */}
                <div className="p-4 rounded-xl border border-slate-800 bg-[#090d18] space-y-2">
                  <div className="text-xs font-bold text-amber-300 flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5" />
                    <span>2. PromptContext $\neq$ Session.events</span>
                  </div>
                  <pre className="p-3 rounded-lg bg-black text-[11px] font-mono text-indigo-300 overflow-x-auto leading-relaxed">
{`// Pi 架构核心分立：
interface PiSession {
  events: AgentEvent[];     // 绝对真理：工具真实输入、完整 stdout
}

function buildPromptContext(session: PiSession): ChatMessage[] {
  // 仅在发给 LLM 前一刻，才由 events 动态投影为 messages
  // 可以在这里做 Truncation / Compaction，绝不伤害 session.events
}`}
                  </pre>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    在发给 LLM 前才投影出 messages。这使得 Compaction（压缩）完全变成了“视角的变换”，不会丢失任何物理副作用证据。
                  </p>
                </div>

                {/* Topic 3: Branching */}
                <div className="p-4 rounded-xl border border-slate-800 bg-[#090d18] space-y-2">
                  <div className="text-xs font-bold text-purple-300 flex items-center gap-2">
                    <GitFork className="w-3.5 h-3.5" />
                    <span>3. 轻量化因果分支 (Causal Branching)</span>
                  </div>
                  <pre className="p-3 rounded-lg bg-black text-[11px] font-mono text-purple-300 overflow-x-auto leading-relaxed">
{`// 从历史事件节点分叉：
const newBranch = session.branch({
  fromEventId: "evt_step_3_tool_end",
  name: "experiment-approach-b",
});
// 原分支主干完全不受影响，新事件自动指向新分支 HEAD`}
                  </pre>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Pi 允许从任意历史事件开出新分支，保留旧的失败尝试记录作为反思凭据，同时开启全新的纯净执行流。
                  </p>
                </div>

                {/* Topic 4: Workspace Verification */}
                <div className="p-4 rounded-xl border border-slate-800 bg-[#090d18] space-y-2">
                  <div className="text-xs font-bold text-emerald-300 flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>4. 恢复时的工作区漂移自愈</span>
                  </div>
                  <pre className="p-3 rounded-lg bg-black text-[11px] font-mono text-cyan-300 overflow-x-auto leading-relaxed">
{`// 恢复执行前强制检查文件哈希：
const drift = await workspace.checkDrift(snapshot);
if (drift.hasConflicts) {
  // 触发人机确认或安全还原，严禁盲目执行
  promptUserResolveDrift(drift);
}`}
                  </pre>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    在重启会话后，第一件事是计算当前磁盘与快照的 SHA 差量，若检测到外部篡改则强力拦截，杜绝幽灵状态幻觉。
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}


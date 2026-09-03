import { useState, useEffect } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import type {
  AuditEntry,
  AuditIntegrityReport,
  CircuitState,
  ProductionSystemMetrics,
  ProductionTask,
  TaskPriority,
} from "~/core/production";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  Cpu,
  Flame,
  Gauge,
  Layers,
  Lock,
  Play,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  TrendingUp,
  Unlock,
  Users,
  XCircle,
  Zap,
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

export default function LessonV11Page() {
  const { hasServerKey, model, defaultBaseURL } = useLoaderData<typeof loader>();

  // API Config State
  const [customApiKey, setCustomApiKey] = useState("");
  const [customBaseURL, setCustomBaseURL] = useState(defaultBaseURL);

  useEffect(() => {
    const storedKey = localStorage.getItem("MINI_CLAUDE_API_KEY");
    if (storedKey) setCustomApiKey(storedKey);
    const storedBase = localStorage.getItem("MINI_CLAUDE_BASE_URL");
    if (storedBase) setCustomBaseURL(storedBase);
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

  // Tabs: panorama | queue | resilience | audit | theory
  const [activeTab, setActiveTab] = useState<
    "panorama" | "queue" | "resilience" | "audit" | "theory"
  >("panorama");

  // System State
  const [isLoading, setIsLoading] = useState(false);
  const [metrics, setMetrics] = useState<ProductionSystemMetrics | null>(null);
  const [queuedTasks, setQueuedTasks] = useState<ProductionTask[]>([]);
  const [runningTasks, setRunningTasks] = useState<ProductionTask[]>([]);
  const [completedTasks, setCompletedTasks] = useState<ProductionTask[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditIntegrity, setAuditIntegrity] = useState<AuditIntegrityReport>({
    isValid: true,
    totalEntries: 0,
  });

  // Action status message for instant feedback
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "success" | "warning" | "error" | "info";
  } | null>(null);

  // Auto dispatch runner
  const [isAutoRunning, setIsAutoRunning] = useState(false);

  // Live timer for queue anti-starvation aging display
  const [currentTime, setCurrentTime] = useState<number>(0);
  useEffect(() => {
    setCurrentTime(Date.now());
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Task Submission Form State
  const [selectedTenantId, setSelectedTenantId] = useState<string>("tenant-enterprise-vip");
  const [selectedPriority, setSelectedPriority] = useState<TaskPriority>("p0_critical");
  const [taskPrompt, setTaskPrompt] = useState<string>("分析生产集群连接池泄漏并生成修复补丁");

  // Fetch metrics and state from backend API
  const refreshState = async () => {
    try {
      const res = await fetch("/api/production");
      const data = await res.json();
      if (data.success) {
        if (data.metrics) setMetrics(data.metrics);
        if (data.queuedTasks) setQueuedTasks(data.queuedTasks);
        if (data.runningTasks) setRunningTasks(data.runningTasks);
        if (data.completedTasks) setCompletedTasks(data.completedTasks);
        if (data.auditIntegrity) setAuditIntegrity(data.auditIntegrity);
      }

      // Also fetch audit entries
      const auditRes = await fetch("/api/production?action=audit");
      const auditData = await auditRes.json();
      if (auditData.success) {
        setAuditEntries(auditData.entries || []);
        if (auditData.integrity) setAuditIntegrity(auditData.integrity);
      }
    } catch (err) {
      console.error("Failed to refresh production state:", err);
    }
  };

  useEffect(() => {
    refreshState();
    const interval = setInterval(refreshState, 3000);
    return () => clearInterval(interval);
  }, []);

  // Auto-dispatch loop effect
  useEffect(() => {
    if (!isAutoRunning) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/production", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "step_workers",
            apiKey: customApiKey,
            baseURL: customBaseURL,
            model,
          }),
        });
        const data = await res.json();
        if (data.success) {
          if (data.metrics) setMetrics(data.metrics);
          if (data.queuedTasks) setQueuedTasks(data.queuedTasks);
          if (data.runningTasks) setRunningTasks(data.runningTasks);
          if (data.completedTasks) setCompletedTasks(data.completedTasks);

          // Stop auto running if both queue and workers are empty
          if (
            (!data.queuedTasks || data.queuedTasks.length === 0) &&
            (!data.runningTasks || data.runningTasks.length === 0)
          ) {
            setIsAutoRunning(false);
            setStatusMessage({
              text: "✅ 所有排队与运行任务已全部调度处理完毕！",
              type: "success",
            });
          }
        }
      } catch (err) {
        console.error("Auto dispatch step failed:", err);
      }
    }, 1500);

    return () => clearInterval(timer);
  }, [isAutoRunning, customApiKey, customBaseURL, model]);

  // Actions
  const handleSingleSubmit = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_task",
          tenantId: selectedTenantId,
          prompt: taskPrompt,
          priority: selectedPriority,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.metrics) setMetrics(data.metrics);
        if (data.queuedTasks) setQueuedTasks(data.queuedTasks);
        if (data.runningTasks) setRunningTasks(data.runningTasks);
        if (data.completedTasks) setCompletedTasks(data.completedTasks);
        setStatusMessage({ text: data.message || "任务已提交入队！", type: "success" });
      } else {
        setStatusMessage({ text: data.error || "任务提交被拦截", type: "warning" });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStepWorkers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "step_workers",
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.metrics) setMetrics(data.metrics);
        if (data.queuedTasks) setQueuedTasks(data.queuedTasks);
        if (data.runningTasks) setRunningTasks(data.runningTasks);
        if (data.completedTasks) setCompletedTasks(data.completedTasks);
        setStatusMessage({ text: data.message || "调度周期推进完成！", type: "info" });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStressTest = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stress_test" }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.metrics) setMetrics(data.metrics);
        if (data.queuedTasks) setQueuedTasks(data.queuedTasks);
        if (data.runningTasks) setRunningTasks(data.runningTasks);
        if (data.completedTasks) setCompletedTasks(data.completedTasks);
        setStatusMessage({
          text: data.message || "已成功注入 15 并发多租户风暴！",
          type: "success",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSimulateFailure = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "simulate_failure" }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.metrics) setMetrics(data.metrics);
        if (data.queuedTasks) setQueuedTasks(data.queuedTasks);
        if (data.runningTasks) setRunningTasks(data.runningTasks);
        if (data.completedTasks) setCompletedTasks(data.completedTasks);
        setStatusMessage({
          text: data.message || "已模拟大模型 503 报错！",
          type: "warning",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestFallback = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_fallback",
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.metrics) setMetrics(data.metrics);
        if (data.queuedTasks) setQueuedTasks(data.queuedTasks);
        if (data.runningTasks) setRunningTasks(data.runningTasks);
        if (data.completedTasks) setCompletedTasks(data.completedTasks);
        setStatusMessage({
          text: data.message || "业务调用已完成！",
          type: data.task?.fallbackOccurred ? "warning" : "success",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleTripCircuit = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "trip_circuit" }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.metrics) setMetrics(data.metrics);
        setStatusMessage({
          text: data.message || "断路器已强制熔断 (OPEN)！",
          type: "error",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetCircuit = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_circuit" }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.metrics) setMetrics(data.metrics);
        setStatusMessage({
          text: data.message || "断路器已重置健康状态 (CLOSED)！",
          type: "success",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleBudgetAttack = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "simulate_budget_attack" }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.metrics) setMetrics(data.metrics);
        if (data.queuedTasks) setQueuedTasks(data.queuedTasks);
        if (data.runningTasks) setRunningTasks(data.runningTasks);
        if (data.completedTasks) setCompletedTasks(data.completedTasks);
        setStatusMessage({
          text: data.message || "已触发天价死循环攻击！100% 硬顶守护拦截生效。",
          type: "error",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleTamperAudit = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "tamper_audit",
          fakePayload: {
            actor: "hacker_root",
            unauthorizedCommand: "rm -rf /database_production",
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.entries) setAuditEntries(data.entries);
        if (data.integrity) setAuditIntegrity(data.integrity);
        setStatusMessage({
          text: data.message || "已篡改审计日志！哈希链密码学断裂告警！",
          type: "error",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreAudit = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore_audit" }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.entries) setAuditEntries(data.entries);
        if (data.integrity) setAuditIntegrity(data.integrity);
        setStatusMessage({
          text: data.message || "账本已成功自愈，密码学哈希链 100% 恢复正常！",
          type: "success",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetAll = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_all" }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.metrics) setMetrics(data.metrics);
        setQueuedTasks([]);
        setRunningTasks([]);
        setCompletedTasks([]);
        if (data.entries) setAuditEntries(data.entries);
        setAuditIntegrity({ isValid: true, totalEntries: (data.entries || []).length });
        setIsAutoRunning(false);
        setStatusMessage({ text: "系统全状态已成功复位！", type: "info" });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getCircuitColor = (state?: CircuitState) => {
    switch (state) {
      case "CLOSED":
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
      case "OPEN":
        return "text-rose-400 bg-rose-500/10 border-rose-500/30 animate-pulse";
      case "HALF_OPEN":
        return "text-amber-400 bg-amber-500/10 border-amber-500/30";
      default:
        return "text-slate-400 bg-slate-800 border-slate-700";
    }
  };

  const getPriorityBadge = (p: TaskPriority) => {
    switch (p) {
      case "p0_critical":
        return <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">P0 VIP</span>;
      case "p1_high":
        return <span className="px-2 py-0.5 rounded text-xs font-mono font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">P1 High</span>;
      case "p2_normal":
        return <span className="px-2 py-0.5 rounded text-xs font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">P2 Normal</span>;
      case "p3_batch":
        return <span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-700/50 text-slate-400 border border-slate-600/30">P3 Batch</span>;
    }
  };

  const getStatusBadge = (status: ProductionTask["status"]) => {
    switch (status) {
      case "running":
        return <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 animate-pulse flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> 执行中</span>;
      case "completed":
        return <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> 已完成</span>;
      case "queued":
        return <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1"><Clock className="w-3 h-3" /> 排队中</span>;
      case "rejected":
        return <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1"><XCircle className="w-3 h-3" /> 频控驳回</span>;
      case "budget_exceeded":
        return <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-red-900/40 text-red-300 border border-red-500/40 flex items-center gap-1"><AlertOctagon className="w-3 h-3" /> 预算熔断</span>;
      case "failed":
        return <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-slate-700 text-slate-300 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> 异常失败</span>;
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
      />

      {/* Hero Banner */}
      <div className="border-b border-purple-500/20 bg-gradient-to-r from-purple-950/40 via-[#0d1222] to-indigo-950/30 px-6 py-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-500/20 border border-purple-500/40 text-purple-300">
                V11 · 终局之战 · Capstone
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Production Agent 生产级智能体运行时
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white flex items-center gap-2">
              <Server className="w-7 h-7 text-purple-400" />
              生产级运行时：并发调度、双轨限流、预算守护与防篡改审计
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleResetAll}
              disabled={isLoading}
              className="px-3.5 py-2 rounded-xl text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              系统状态复位
            </button>
            <Link
              to="/docs/lessons/12-production-agent.md"
              className="px-3.5 py-2 rounded-xl text-xs font-mono bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 transition flex items-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5" />
              讲义文档
            </Link>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto mt-6 flex gap-2 border-b border-slate-800/80 overflow-x-auto">
          {[
            { id: "panorama", label: "系统全景大盘", icon: Activity },
            { id: "queue", label: "多租户排队与并发压测", icon: Layers },
            { id: "resilience", label: "预算硬顶与断路器演习", icon: ShieldAlert },
            { id: "audit", label: "密码学防篡改审计流水", icon: Lock },
            { id: "theory", label: "理论讲义与结课致辞", icon: Sparkles },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs md:text-sm font-medium border-b-2 transition -mb-px whitespace-nowrap ${
                  isActive
                    ? "border-purple-400 text-purple-300 bg-purple-500/10"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 space-y-6">
        {/* Status Notification Toast Banner */}
        {statusMessage && (
          <div
            className={`p-4 rounded-2xl border text-xs font-mono flex items-center justify-between shadow-xl transition animate-in fade-in slide-in-from-top-2 ${
              statusMessage.type === "success"
                ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
                : statusMessage.type === "warning"
                ? "bg-amber-950/40 border-amber-500/40 text-amber-200"
                : statusMessage.type === "error"
                ? "bg-rose-950/40 border-rose-500/40 text-rose-200"
                : "bg-purple-950/40 border-purple-500/40 text-purple-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {statusMessage.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : statusMessage.type === "warning" ? (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              ) : statusMessage.type === "error" ? (
                <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0" />
              ) : (
                <Sparkles className="w-5 h-5 text-purple-400 shrink-0" />
              )}
              <span className="font-medium text-sm">{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white transition text-xs"
            >
              ✕ 关闭提示
            </button>
          </div>
        )}

        {/* TAB 1: SYSTEM PANORAMA */}
        {activeTab === "panorama" && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>活跃 Worker 槽位</span>
                  <Cpu className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-2xl font-bold text-white font-mono">
                  {metrics?.activeWorkers || 0}{" "}
                  <span className="text-xs text-slate-500 font-normal">/ {metrics?.totalWorkers || 5}</span>
                </div>
                <div className="text-[11px] text-slate-400">并发池已分配槽位</div>
              </div>

              <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>排队等待任务</span>
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-amber-300 font-mono">
                  {metrics?.queuedTasks || 0}
                </div>
                <div className="text-[11px] text-slate-400">平均等待: {metrics?.avgWaitTimeMs || 0}ms</div>
              </div>

              <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>断路器状态</span>
                  <Zap className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${getCircuitColor(
                      metrics?.circuitBreakerState
                    )}`}
                  >
                    {metrics?.circuitBreakerState || "CLOSED"}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  熔断触发: {metrics?.circuitBreakerMetrics.tripCount || 0} 次
                </div>
              </div>

              <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>累计处理 Token</span>
                  <Flame className="w-4 h-4 text-orange-400" />
                </div>
                <div className="text-2xl font-bold text-orange-300 font-mono">
                  {(metrics?.totalTokensProcessed || 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400">总成本: ${metrics?.totalCostUsd || 0}</div>
              </div>

              <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>频控/预算拦截</span>
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                </div>
                <div className="text-2xl font-bold text-rose-300 font-mono">
                  {(metrics?.rejectedTasks || 0) + (metrics?.budgetExceededTasks || 0)}
                </div>
                <div className="text-[11px] text-slate-400">
                  429: {metrics?.rejectedTasks || 0} | 预算熔断: {metrics?.budgetExceededTasks || 0}
                </div>
              </div>

              <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>审计账本完整度</span>
                  <Lock className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold font-mono">
                  {auditIntegrity.isValid ? (
                    <span className="text-emerald-400 flex items-center gap-1 text-lg">
                      <ShieldCheck className="w-5 h-5" /> 100% 密码学无损
                    </span>
                  ) : (
                    <span className="text-rose-400 flex items-center gap-1 text-lg animate-pulse">
                      <ShieldAlert className="w-5 h-5" /> 链断裂告警
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400">SHA-256 条目: {auditEntries.length}</div>
              </div>
            </div>

            {/* Architecture Topology View */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Server className="w-5 h-5 text-purple-400" />
                    Agent Production Runtime 工业级架构全景图
                  </h3>
                  <p className="text-xs text-slate-400">
                    控制平面（入队鉴权、并发配额、双轨限流）与数据平面（Worker并发槽、断路器、哈希审计）解耦
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-mono bg-purple-500/10 text-purple-300 border border-purple-500/30">
                  双层解耦架构
                </span>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs overflow-x-auto text-slate-300 leading-relaxed">
                <pre className="text-purple-300">{`
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │                              API Gateway / Ingress                                     │
 └───────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │ [Tenant Token & RBAC]
 ┌───────────────────────────────────────────▼────────────────────────────────────────────┐
 │  CONTROL PLANE (控制平面)                                                              │
 │                                                                                        │
 │   ┌──────────────────────┐    ┌──────────────────────┐    ┌────────────────────────┐   │
 │   │  Tenant Concurrency  │    │ Dual-Track RateLimit │    │ Budget Guardrail (硬顶)│   │
 │   │  Slot Allocation     │    │ (RPM 频控 / TPM 吞吐)│    │ (80%软预警/100%强制熔断│   │
 │   └──────────┬───────────┘    └──────────┬───────────┘    └───────────┬────────────┘   │
 │              └───────────────────────────┼────────────────────────────┘                │
 │                                          ▼                                             │
 │                     ┌─────────────────────────────────────────┐                        │
 │                     │ Multi-Tenant Priority Queue (防饥饿调度)│                        │
 │                     │ P0 VIP: 100 | P1: 50 | P2: 20 | P3: 5   │                        │
 │                     │ 动态积分: Effective = Base + WaitSec*0.5│                        │
 │                     └────────────────────┬────────────────────┘                        │
 └──────────────────────────────────────────┼─────────────────────────────────────────────┘
                                            │ Dispatch Available Slot
 ┌──────────────────────────────────────────▼─────────────────────────────────────────────┐
 │  DATA PLANE (数据平面 - 5 个全局并发槽)                                                │
 │                                                                                        │
 │    [Worker Slot 1]      [Worker Slot 2]      [Worker Slot 3]      [Worker Slot 4/5]    │
 │    ┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌──────────────┐     │
 │    │ Agent Loop  │      │ Agent Loop  │      │ Agent Loop  │      │  Agent Loop  │     │
 │    └──────┬──────┘      └──────┬──────┘      └──────┬──────┘      └──────┬───────┘     │
 │           └────────────────────┼───────────────────┼─────────────────────┘             │
 │                                ▼                   ▼                                   │
 │     ┌─────────────────────────────────────────────────────────────────────────────┐    │
 │     │ 外部依赖韧性保护层 (Resilience Engine)                                      │    │
 │     │ • Circuit Breaker: 三态状态机 (CLOSED ↔ OPEN ↔ HALF_OPEN)                   │    │
 │     │ • Full Jitter Backoff: 击溃网络重试风暴                                     │    │
 │     │ • Model Fallback Cascade: 主力 glm-4-plus 熔断 ──► 降级备用 glm-4-flash     │    │
 │     └──────────────────────────────────────┬──────────────────────────────────────┘    │
 └────────────────────────────────────────────┼───────────────────────────────────────────┘
                                              │ SHA-256 Merkle-like Hash Chain
 ┌────────────────────────────────────────────▼───────────────────────────────────────────┐
 │  企业不可篡改审计账本 (Cryptographic Audit Ledger)                                     │
 │  • Hi = SHA256(Hi-1 || Entry_i)   • 敏感 API Key 自动脱敏掩码 (Secret Scrubbing)        │
 └────────────────────────────────────────────────────────────────────────────────────────┘
                `}</pre>
              </div>
            </div>

            {/* Tenant Matrix Table */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                多租户服务等级 (SLA) 与配额矩阵
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">租户标识 / 名称</th>
                      <th className="py-2.5 px-3">SLA 等级</th>
                      <th className="py-2.5 px-3">最大并发槽位</th>
                      <th className="py-2.5 px-3">RPM 频控限额</th>
                      <th className="py-2.5 px-3">TPM 吞吐限额</th>
                      <th className="py-2.5 px-3">每日预算上限</th>
                      <th className="py-2.5 px-3">今日已消耗</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {(metrics?.tenants || []).map((tenant) => (
                      <tr key={tenant.id} className="hover:bg-slate-900/40 transition">
                        <td className="py-3 px-3 font-bold text-white">
                          <div>{tenant.name}</div>
                          <div className="text-[10px] text-slate-500">{tenant.id}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              tenant.tier === "enterprise"
                                ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                                : tenant.tier === "pro"
                                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                                : "bg-slate-700/50 text-slate-400 border border-slate-600/40"
                            }`}
                          >
                            {tenant.tier.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-purple-300 font-bold">{tenant.maxConcurrency} 槽位</td>
                        <td className="py-3 px-3">{tenant.rpmLimit} 次/分</td>
                        <td className="py-3 px-3">{tenant.tpmLimit.toLocaleString()} Tokens/分</td>
                        <td className="py-3 px-3 text-emerald-400 font-bold">${tenant.dailyBudgetUsd.toFixed(2)}</td>
                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            <span className="font-bold">${tenant.currentDailySpendUsd.toFixed(4)}</span>
                            <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (tenant.currentDailySpendUsd / tenant.dailyBudgetUsd) * 100
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: QUEUE & CONCURRENCY STRESS LAB */}
        {activeTab === "queue" && (
          <div className="space-y-6">
            {/* Action Bar */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-indigo-400" />
                    多租户排队与并发调度实验室
                  </h3>
                  <p className="text-xs text-slate-400">
                    模拟真实高并发混合流量，观察 P0 紧急插队、P3 防饥饿动态老化与单租户并发隔离
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleStressTest}
                    disabled={isLoading}
                    className="px-4 py-2 rounded-xl text-xs font-mono font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-900/30 transition flex items-center gap-1.5"
                  >
                    <Flame className="w-4 h-4 text-orange-300" />
                    注入 15 并发多租户风暴压测
                  </button>

                  <button
                    onClick={handleStepWorkers}
                    disabled={isLoading}
                    className="px-4 py-2 rounded-xl text-xs font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
                  >
                    <Play className="w-4 h-4 text-emerald-400" />
                    推进 Worker 调度周期 (Step)
                  </button>

                  <button
                    onClick={() => setIsAutoRunning(!isAutoRunning)}
                    className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5 ${
                      isAutoRunning
                        ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30 animate-pulse"
                        : "bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40"
                    }`}
                  >
                    {isAutoRunning ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>⏸ 暂停自动流转</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 text-amber-300" />
                        <span>⚡ 开启自动流转 (Auto)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Single Task Creator Form */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3">
                <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-purple-400" />
                  手动精准注入单个生产任务
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">目标租户</label>
                    <select
                      value={selectedTenantId}
                      onChange={(e) => setSelectedTenantId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                    >
                      <option value="tenant-enterprise-vip">Acme Enterprise (VIP - 4槽位)</option>
                      <option value="tenant-pro-team">DevStudio Pro (2槽位)</option>
                      <option value="tenant-free-tier">Free Trial Community (1槽位限流)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">任务优先级</label>
                    <select
                      value={selectedPriority}
                      onChange={(e) => setSelectedPriority(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                    >
                      <option value="p0_critical">P0 极高 (生产故障 / VIP 紧急)</option>
                      <option value="p1_high">P1 高优 (日常开发特性)</option>
                      <option value="p2_normal">P2 普通 (常规代码检索)</option>
                      <option value="p3_batch">P3 批处理 (低优先级离线脚本)</option>
                    </select>
                  </div>

                  <div className="md:col-span-2 flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-[11px] text-slate-400 block mb-1">指令描述</label>
                      <input
                        type="text"
                        value={taskPrompt}
                        onChange={(e) => setTaskPrompt(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                        placeholder="输入任务描述..."
                      />
                    </div>
                    <button
                      onClick={handleSingleSubmit}
                      disabled={isLoading}
                      className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-mono font-medium rounded-lg transition"
                    >
                      提交入队
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Live Queue & Workers Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Queued Tasks (Sorted by Effective Priority) */}
              <div className="lg:col-span-2 glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    待调度就绪队列 ({queuedTasks.length})
                  </h4>
                  <span className="text-[11px] text-slate-400 font-mono">
                    排序规则: EffectivePriority = Base + WaitSec * 0.5
                  </span>
                </div>

                {queuedTasks.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs font-mono border border-dashed border-slate-800 rounded-xl">
                    队列目前为空。点击上方按钮提交或注入风暴压测。
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {queuedTasks.map((t, idx) => {
                      const waitSeconds =
                        currentTime > 0
                          ? Math.max(0, Math.round((currentTime - t.queuedAt) / 1000))
                          : Math.round(t.waitingTimeMs / 1000);
                      const liveScore = (t.basePriorityScore + waitSeconds * 0.5).toFixed(1);
                      return (
                        <div
                          key={t.id}
                          className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs font-mono"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500">#{idx + 1}</span>
                              {getPriorityBadge(t.priority)}
                              <span className="font-bold text-slate-200">{t.tenantName}</span>
                              <span className="text-purple-400 font-bold">
                                权重: {liveScore} (基数:{t.basePriorityScore} + 等待:{waitSeconds}s)
                              </span>
                            </div>
                            <div className="text-slate-400 line-clamp-1">{t.prompt}</div>
                          </div>
                          <div className="text-right text-slate-500 text-[11px] shrink-0 ml-2">
                            预算: {t.tokenBudget}T
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Active Workers */}
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-purple-400" />
                  活跃并发 Worker 槽位 ({runningTasks.length} / 5)
                </h4>

                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((slotNum) => {
                    const workerId = `worker-slot-${slotNum}`;
                    const task = runningTasks.find((t) => t.activeWorkerId === workerId);
                    return (
                      <div
                        key={slotNum}
                        className={`p-3 rounded-xl border text-xs font-mono transition ${
                          task
                            ? "bg-purple-950/20 border-purple-500/40"
                            : "bg-slate-900/30 border-slate-800 text-slate-600"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-slate-300">槽位 #{slotNum}</span>
                          {task ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse">
                              RUNNING
                            </span>
                          ) : (
                            <span className="text-slate-600 text-[11px]">IDLE 空闲</span>
                          )}
                        </div>

                        {task && (
                          <div className="space-y-1 mt-1.5 text-[11px] text-slate-400">
                            <div className="text-purple-300 font-bold">{task.tenantName}</div>
                            <div className="line-clamp-1 text-slate-300">{task.prompt}</div>
                            <div className="text-slate-500">模型: {task.modelUsed || "glm-4-plus"}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Completed & Rejected History */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                已处理任务历史 ({completedTasks.length})
              </h4>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">状态</th>
                      <th className="py-2.5 px-3">租户</th>
                      <th className="py-2.5 px-3">优先级</th>
                      <th className="py-2.5 px-3">指令 / 输出摘要</th>
                      <th className="py-2.5 px-3">等待时延</th>
                      <th className="py-2.5 px-3">Token 消耗</th>
                      <th className="py-2.5 px-3">产生费用</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {completedTasks.slice(0, 8).map((task) => (
                      <tr key={task.id} className="hover:bg-slate-900/40">
                        <td className="py-2.5 px-3">{getStatusBadge(task.status)}</td>
                        <td className="py-2.5 px-3 font-bold text-white">{task.tenantName}</td>
                        <td className="py-2.5 px-3">{getPriorityBadge(task.priority)}</td>
                        <td className="py-2.5 px-3 max-w-xs">
                          <div className="truncate text-slate-200 flex items-center gap-1.5">
                            <span className="truncate">{task.prompt}</span>
                            {task.fallbackOccurred && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 font-bold shrink-0">
                                ⚡ 级联降级: {task.modelUsed}
                              </span>
                            )}
                          </div>
                          {task.output && <div className="text-[10px] text-emerald-400 truncate">{task.output}</div>}
                          {task.error && <div className="text-[10px] text-rose-400 truncate">{task.error}</div>}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">{task.waitingTimeMs}ms</td>
                        <td className="py-2.5 px-3 text-orange-300">{task.tokensUsed || 0} T</td>
                        <td className="py-2.5 px-3 text-emerald-400 font-bold">${task.estimatedCostUsd.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: RESILIENCE & CIRCUIT BREAKER */}
        {activeTab === "resilience" && (
          <div className="space-y-6">
            {/* Circuit Breaker Section */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Zap className="w-5 h-5 text-cyan-400" />
                    标准三态断路器与智能退避引擎 (Circuit Breaker & Resilience)
                  </h3>
                  <p className="text-xs text-slate-400">
                    防止外部大模型服务故障（502/503/超时）引发全链雪崩击穿，自动开启熔断并激活降级策略链
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleTestFallback}
                    disabled={isLoading}
                    className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-900/30 transition flex items-center gap-1.5"
                  >
                    <Sparkles className="w-4 h-4 text-cyan-300" />
                    发送业务请求 (验证降级接管 / 试探)
                  </button>

                  <button
                    onClick={handleSimulateFailure}
                    disabled={isLoading}
                    className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition flex items-center gap-1.5"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    模拟上游 503 报错
                  </button>

                  <button
                    onClick={handleTripCircuit}
                    disabled={isLoading}
                    className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition flex items-center gap-1.5"
                  >
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    人工强制熔断 (Trip to OPEN)
                  </button>

                  <button
                    onClick={handleResetCircuit}
                    disabled={isLoading}
                    className="px-3.5 py-2 rounded-xl text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    复位健康
                  </button>
                </div>
              </div>

              {/* State Transition Diagram */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div
                  className={`p-5 rounded-xl border space-y-2 transition ${
                    metrics?.circuitBreakerState === "CLOSED"
                      ? "bg-emerald-950/30 border-emerald-500/60 ring-2 ring-emerald-500/30"
                      : "bg-slate-900/40 border-slate-800 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-emerald-300 font-mono">1. CLOSED (健康闭合)</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <p className="text-xs text-slate-300">
                    流量 100% 正常放行至主力模型 `glm-4-plus`。实时累计连续失败计数。
                  </p>
                  <div className="text-[11px] font-mono text-slate-400">
                    连续失败计数: {metrics?.circuitBreakerMetrics.consecutiveFailures || 0} / 5
                  </div>
                </div>

                <div
                  className={`p-5 rounded-xl border space-y-2 transition ${
                    metrics?.circuitBreakerState === "OPEN"
                      ? "bg-rose-950/30 border-rose-500/60 ring-2 ring-rose-500/30 animate-pulse"
                      : "bg-slate-900/40 border-slate-800 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-rose-300 font-mono">2. OPEN (全面熔断)</span>
                    <AlertOctagon className="w-4 h-4 text-rose-400" />
                  </div>
                  <p className="text-xs text-slate-300">
                    连续 5 次失败后硬切断！启动级联降级策略，请求自动切流重定向至备用高可用模型。
                  </p>
                  <div className="text-[11px] font-mono text-rose-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {metrics?.circuitBreakerMetrics.nextAllowedRetryTime && currentTime > 0
                        ? Math.max(0, Math.ceil((metrics.circuitBreakerMetrics.nextAllowedRetryTime - currentTime) / 1000)) > 0
                          ? `冷却倒计时: ${Math.max(0, Math.ceil((metrics.circuitBreakerMetrics.nextAllowedRetryTime - currentTime) / 1000))} 秒后允许进入 HALF_OPEN 试探`
                          : "冷却已完毕！点击上方「发送业务请求」进行半开试探"
                        : "冷却倒计时: 10 秒后允许试探"}
                    </span>
                  </div>
                </div>

                <div
                  className={`p-5 rounded-xl border space-y-2 transition ${
                    metrics?.circuitBreakerState === "HALF_OPEN"
                      ? "bg-amber-950/30 border-amber-500/60 ring-2 ring-amber-500/30"
                      : "bg-slate-900/40 border-slate-800 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-amber-300 font-mono">3. HALF_OPEN (半开试探)</span>
                    <Gauge className="w-4 h-4 text-amber-400" />
                  </div>
                  <p className="text-xs text-slate-300">
                    冷却期满，放行微量流量试探主力模型。连续 2 次成功则完全愈合回到 CLOSED。
                  </p>
                  <div className="text-[11px] font-mono text-amber-300">
                    试探成功数: {metrics?.circuitBreakerMetrics.successCount || 0} / 2
                  </div>
                </div>
              </div>

              {/* Model Cascade Fallback Pipeline Topology */}
              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-cyan-400" />
                    <span>多模型高可用级联降级策略链 (Model Cascade Pipeline)</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    累计降级接管: <span className="text-cyan-300 font-bold">{metrics?.circuitBreakerMetrics.fallbackCount || 0}</span> 次
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                  {/* Tier 1 Primary */}
                  <div
                    className={`p-3.5 rounded-xl border space-y-1.5 transition ${
                      metrics?.circuitBreakerState === "OPEN"
                        ? "bg-rose-950/20 border-rose-500/40 opacity-70"
                        : metrics?.circuitBreakerState === "HALF_OPEN"
                        ? "bg-amber-950/20 border-amber-500/40"
                        : "bg-emerald-950/20 border-emerald-500/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px]">Level 1: 核心主力模型</span>
                      {metrics?.circuitBreakerState === "OPEN" ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                          ⏸️ 熔断切断
                        </span>
                      ) : metrics?.circuitBreakerState === "HALF_OPEN" ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                          🔍 半开试探中
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                          ✅ 承载流量
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-slate-200">glm-4-plus (高智能推理)</div>
                    <div className="text-[11px] text-slate-400">
                      {metrics?.circuitBreakerState === "OPEN"
                        ? "连续 503 异常，上游请求已被断路器隔离拦截，防止雪崩击穿。"
                        : "处理核心复杂任务、长上下文分析与高精度代码重构。"}
                    </div>
                  </div>

                  {/* Tier 2 Secondary Fallback */}
                  <div
                    className={`p-3.5 rounded-xl border space-y-1.5 transition ${
                      metrics?.circuitBreakerState === "OPEN"
                        ? "bg-cyan-950/30 border-cyan-400/60 ring-2 ring-cyan-500/30 animate-pulse"
                        : "bg-slate-900/50 border-slate-800 text-slate-400"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px]">Level 2: 备用高可用模型</span>
                      {metrics?.circuitBreakerState === "OPEN" ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 font-bold">
                          🔥 自动切流接管中
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-500 border border-slate-700">
                          🛡️ 冷备待命
                        </span>
                      )}
                    </div>
                    <div className={`font-bold ${metrics?.circuitBreakerState === "OPEN" ? "text-cyan-300" : "text-slate-300"}`}>
                      glm-4-flash (高吞吐低时延)
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {metrics?.circuitBreakerState === "OPEN"
                        ? "主力模型熔断期间零中断接管所有新请求，保证 99.99% 服务可用性。"
                        : "作为容灾备用通道就绪，当主力模型连续异常时秒级热切换。"}
                    </div>
                  </div>

                  {/* Tier 3 Safe Rule-based Fallback */}
                  <div className="p-3.5 rounded-xl border bg-slate-900/50 border-slate-800 text-slate-400 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px]">Level 3: 本地规则离线兜底</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-500 border border-slate-700">
                        🛡️ 兜底防护
                      </span>
                    </div>
                    <div className="font-bold text-slate-300">Rule-based Safe Cache</div>
                    <div className="text-[11px] text-slate-400">
                      全网骨干断网或所有外部大模型 API 全面宕机时的静态安全保护返回。
                    </div>
                  </div>
                </div>
              </div>

              {/* Jitter Formula Explainer */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs font-mono">
                <div className="text-slate-300 font-bold flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  AWS 经典 Full Jitter 指数退避数学公式
                </div>
                <div className="p-3 bg-slate-950 rounded-lg text-slate-300">
                  <span className="text-purple-400">Ceiling</span> = min(MaxDelay, BaseDelay * 2^attempt)
                  <br />
                  <span className="text-cyan-400">Sleep</span> = Uniform(0, Ceiling)
                  <br />
                  <span className="text-slate-500">// 随机散开所有并发重试时刻，彻底消解网络重试惊群风暴 (Retry Storm)</span>
                </div>
              </div>
            </div>

            {/* Token Budget Guardrail Section */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Flame className="w-5 h-5 text-orange-400" />
                    Token 预算硬顶与防天价账单守护者 (Budget Guardrail)
                  </h3>
                  <p className="text-xs text-slate-400">
                    防御恶意模糊 Prompt 引发的无限自作聪明死循环，在 80% 发出告警并在 100% 实施硬熔断
                  </p>
                </div>

                <button
                  onClick={handleBudgetAttack}
                  disabled={isLoading}
                  className="px-4 py-2 rounded-xl text-xs font-mono font-bold bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/40 transition flex items-center gap-1.5"
                >
                  <AlertOctagon className="w-4 h-4 text-rose-400" />
                  触发天价死循环攻击 (Simulate Budget Attack)
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                  <div className="text-xs text-slate-400 font-mono">1. 单任务预算准入预检</div>
                  <div className="text-lg font-bold text-slate-200">Pre-flight Check</div>
                  <p className="text-xs text-slate-400">
                    任务提交时依据用户输入上下文预估消耗，若超出单任务预算或租户日剩余额度，直接拒绝入队。
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-2">
                  <div className="text-xs text-amber-400 font-mono">2. 80% 软阈值预警</div>
                  <div className="text-lg font-bold text-amber-300">Soft Warning Gate</div>
                  <p className="text-xs text-slate-300">
                    当单任务 Token 消耗达到 80% 时，向 Prompt 注入紧急收敛锚点，强制模型进入总结收尾阶段。
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-2">
                  <div className="text-xs text-rose-400 font-mono">3. 100% 强制硬顶熔断</div>
                  <div className="text-lg font-bold text-rose-300">Hard Stop Ceiling</div>
                  <p className="text-xs text-slate-300">
                    达到 100% 预算上限时系统强制切断 Agent Loop，标记为 `budget_exceeded` 并触发严重审计事件。
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: TAMPER-PROOF AUDIT TRAIL */}
        {activeTab === "audit" && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Lock className="w-5 h-5 text-emerald-400" />
                    企业级密码学防篡改审计账本 (Cryptographic Audit Ledger)
                  </h3>
                  <p className="text-xs text-slate-400">
                    每一条审计条目均锚定上一条记录的 SHA-256 哈希指纹；敏感凭证（API Key、Token）自动掩码脱敏
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTamperAudit}
                    disabled={isLoading}
                    className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition flex items-center gap-1.5"
                  >
                    <Unlock className="w-4 h-4 text-rose-400" />
                    模拟黑客篡改条目 #1
                  </button>

                  <button
                    onClick={handleRestoreAudit}
                    disabled={isLoading}
                    className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    一键自愈修复 (Restore)
                  </button>
                </div>
              </div>

              {/* Audit Integrity Banner */}
              <div
                className={`p-4 rounded-xl border flex items-center justify-between ${
                  auditIntegrity.isValid
                    ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-300"
                    : "bg-rose-950/30 border-rose-500/50 text-rose-200 animate-pulse"
                }`}
              >
                <div className="flex items-center gap-3">
                  {auditIntegrity.isValid ? (
                    <ShieldCheck className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <ShieldAlert className="w-6 h-6 text-rose-400" />
                  )}
                  <div>
                    <div className="font-bold text-sm">
                      {auditIntegrity.isValid
                        ? "账本密码学校验 100% 完好无损 (All Hash Chains Intact)"
                        : "【严重告警】密码学哈希链断裂！检测到未授权篡改！"}
                    </div>
                    <div className="text-xs text-slate-400">
                      {auditIntegrity.errorDetail ||
                        `已成功验证全部 ${auditEntries.length} 条流水记录的密码学签名与哈希链接关系。`}
                    </div>
                  </div>
                </div>

                <span className="text-xs font-mono px-2 py-1 rounded bg-slate-900 border border-slate-700">
                  条目总数: {auditEntries.length}
                </span>
              </div>

              {/* Audit Stream Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">序 #</th>
                      <th className="py-2.5 px-3">风险</th>
                      <th className="py-2.5 px-3">租户 / 操作者</th>
                      <th className="py-2.5 px-3">操作类型 (Action)</th>
                      <th className="py-2.5 px-3">脱敏载荷摘要 (Payload)</th>
                      <th className="py-2.5 px-3">前序 Hash (Prev)</th>
                      <th className="py-2.5 px-3">条目防伪 Hash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {auditEntries.map((entry) => (
                      <tr
                        key={entry.id}
                        className={`hover:bg-slate-900/40 transition ${
                          entry.isTampered ? "bg-rose-950/40 font-bold text-rose-300" : ""
                        }`}
                      >
                        <td className="py-2.5 px-3 text-slate-500 font-bold">
                          #{entry.sequence}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              entry.riskLevel === "CRITICAL"
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                : entry.riskLevel === "HIGH"
                                ? "bg-orange-500/20 text-orange-300 border border-orange-500/40"
                                : entry.riskLevel === "MEDIUM"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {entry.riskLevel}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-white">
                          <div>{entry.tenantId}</div>
                          <div className="text-[10px] text-slate-500">{entry.actor}</div>
                        </td>
                        <td className="py-2.5 px-3 text-purple-300 font-bold">{entry.action}</td>
                        <td className="py-2.5 px-3 max-w-xs truncate text-slate-400 text-[11px]">
                          {JSON.stringify(entry.payload)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 text-[10px]">
                          {entry.prevHash.slice(0, 8)}...
                        </td>
                        <td className="py-2.5 px-3 text-emerald-400 font-mono text-[10px]">
                          {entry.hash.slice(0, 10)}...
                          {entry.isTampered && <span className="ml-1 text-rose-400">[已篡改]</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: THEORY & GRADUATION */}
        {activeTab === "theory" && (
          <div className="space-y-6">
            {/* Graduation Banner */}
            <div className="glass-panel p-8 rounded-3xl border border-purple-500/40 bg-gradient-to-br from-purple-950/40 via-[#0d1222] to-cyan-950/30 text-center space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-mono">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Mini Claude Code 全套课程毕业认证</span>
              </div>
              <h2 className="text-3xl font-extrabold text-white">
                恭喜！你已完成从 0 到 1 手写 Mini Claude Code 的全部 12 步飞跃！
              </h2>
              <p className="text-slate-300 max-w-2xl mx-auto text-sm leading-relaxed">
                你不再只是一个只会调用 SDK 的普通开发者，而是深刻理解大模型无状态本质、工具协商协议、死循环自愈、上下文工程、记忆持久化、权限沙箱、MCP 协议、容灾检查点、全链路可观测性与生产级运行时的架构师。
              </p>
            </div>

            {/* Curriculum Roadmap Evolution Grid */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-400" />
                12 阶段完整进化全景图 (Curriculum Mastery)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs font-mono">
                {[
                  { v: "V0", title: "LLM 无状态本质与结构化输出", desc: "Zod Schema 契约与 Token 计数" },
                  { v: "V1", title: "Tool Calling 机制与行动力破局", desc: "Runtime 本地落地与 6 步握手协议" },
                  { v: "V2", title: "Agent Loop 与 ReAct 闭环", desc: "多步自主迭代与死循环熔断" },
                  { v: "V3", title: "Coding Agent 与代码自愈", desc: "Diff 补丁编辑、受控 Shell 与测试驱动排错" },
                  { v: "V4", title: "Planning 与复杂工作流路由", desc: "FSM 状态机、动态重规划与 Attention 锚点" },
                  { v: "V5", title: "Context Engine 与上下文防御", desc: "Smart Truncator、Repo Map 与高水位渐进压缩" },
                  { v: "V6", title: "Memory 与状态机持久化", desc: "L1 工作记忆、L2 会话热重放、L3 长期知识库" },
                  { v: "V7", title: "Harness 与安全沙箱隔离", desc: "四级风险矩阵、HITL 审批流、PathJailer 隔离" },
                  { v: "V8", title: "MCP 标准协议与插件解耦", desc: "JSON-RPC 2.0 协议抓包、自研独立 Code Server" },
                  { v: "V9", title: "Durable Execution 容灾续跑", desc: "StateGraph 状态图、WAL 检查点与时间旅行调试" },
                  { v: "V10", title: "Agent 评测体系与全链路 Tracing", desc: "OTel 树状调用栈、火焰图、三层评测金字塔" },
                  { v: "V11", title: "Production Agent 生产级落地", desc: "多租户公平调度、双轨令牌桶、断路器与哈希账本" },
                ].map((item) => (
                  <div
                    key={item.v}
                    className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1 hover:border-purple-500/40 transition"
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-purple-400">{item.v}</span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <div className="text-slate-200 font-bold">{item.title}</div>
                    <div className="text-[11px] text-slate-400">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

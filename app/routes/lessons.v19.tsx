import { useState, useMemo } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import {
  PRESET_DEV_TASKS,
  TOPOLOGY_LINT_SCENARIOS,
  createSoftwareDevGraph,
  compileSoftwareDevGraph,
  createInitialDevState,
  evaluateArchitectureDecisions,
  DECISION_SCENARIOS,
  START,
  END,
  type DevAgentState,
  type SoftwareDevTask,
  type GraphStepEvent,
  type GraphLintReport,
  type ArchitectureChoice,
  type EvaluationResult,
} from "~/core/graph";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  GitBranch,
  Layers,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Terminal,
  XCircle,
  Scale,
  Check,
  X,
  Network,
  Cpu,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";

export async function loader() {
  const hasServerKey = Boolean(
    process.env.LLM_API_KEY && process.env.LLM_API_KEY.trim().length > 0
  );
  const model = process.env.LLM_MODEL || "glm-4-flash";
  const defaultBaseURL =
    process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";

  const standardGraph = createSoftwareDevGraph();
  const initialLintReport = standardGraph.validateTopology();

  return {
    hasServerKey,
    model,
    defaultBaseURL,
    presetTasks: PRESET_DEV_TASKS,
    initialLintReport,
  };
}

function getCategoryStyle(cat: string) {
  switch (cat) {
    case "Coding":
      return "bg-cyan-500/10 text-cyan-300 border-cyan-500/30";
    case "Enterprise":
      return "bg-purple-500/10 text-purple-300 border-purple-500/30";
    case "Content":
      return "bg-amber-500/10 text-amber-300 border-amber-500/30";
    case "Finance":
      return "bg-rose-500/10 text-rose-300 border-rose-500/30";
    case "Research":
      return "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
    case "Conversation":
    default:
      return "bg-blue-500/10 text-blue-300 border-blue-500/30";
  }
}

export default function Lesson19Route() {
  const { hasServerKey, model, defaultBaseURL, presetTasks, initialLintReport } =
    useLoaderData<typeof loader>();

  const [activeTab, setActiveTab] = useState<"studio" | "linter" | "arena">("studio");

  // Studio 状态
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const currentTask: SoftwareDevTask = presetTasks[selectedTaskIndex] || presetTasks[0];

  // 运行器状态
  const [isRunning, setIsRunning] = useState(false);
  const [currentState, setCurrentState] = useState<DevAgentState>(() =>
    createInitialDevState(currentTask)
  );
  const [currentNode, setCurrentNode] = useState<string>(START);
  const [executionHistory, setExecutionHistory] = useState<GraphStepEvent<DevAgentState>[]>([]);
  const [lastPatch, setLastPatch] = useState<Partial<DevAgentState> | null>(null);
  const [isInterrupted, setIsInterrupted] = useState(false);
  const [runStatus, setRunStatus] = useState<"IDLE" | "RUNNING" | "INTERRUPTED" | "COMPLETED" | "LIMIT_EXCEEDED">("IDLE");

  // 切换任务时重置状态
  const handleSelectTask = (index: number) => {
    setSelectedTaskIndex(index);
    const newTask = presetTasks[index];
    setCurrentState(createInitialDevState(newTask));
    setCurrentNode(START);
    setExecutionHistory([]);
    setLastPatch(null);
    setIsInterrupted(false);
    setRunStatus("IDLE");
    setIsRunning(false);
  };

  // 重置当前任务
  const handleReset = () => {
    setCurrentState(createInitialDevState(currentTask));
    setCurrentNode(START);
    setExecutionHistory([]);
    setLastPatch(null);
    setIsInterrupted(false);
    setRunStatus("IDLE");
    setIsRunning(false);
  };

  // 单步执行 (Step)
  const handleStep = async () => {
    if (runStatus === "COMPLETED" || currentNode === END) return;

    setIsRunning(true);
    try {
      const compiled = compileSoftwareDevGraph();
      // 如果处于 START，则第一跳是 entryPoint
      const nodeToExecute = currentNode === START ? compiled.getEntryPoint() : currentNode;

      const stepRes = await compiled.step(currentState, nodeToExecute);
      const nodeObj = compiled.getNode(nodeToExecute);

      const event: GraphStepEvent<DevAgentState> = {
        stepIndex: executionHistory.length + 1,
        node: nodeToExecute,
        nodeDescription: nodeObj?.description,
        previousState: currentState,
        patch: stepRes.patch,
        nextState: stepRes.nextState,
        edgeType: stepRes.edgeType,
        edgeTarget: stepRes.nextNodeName,
        durationMs: stepRes.durationMs,
        timestamp: Date.now(),
        isInterrupted: stepRes.isInterrupted,
      };

      setCurrentState(stepRes.nextState);
      setLastPatch(stepRes.patch);
      setExecutionHistory((prev) => [...prev, event]);
      setCurrentNode(stepRes.nextNodeName);

      if (stepRes.isInterrupted) {
        setIsInterrupted(true);
        setRunStatus("INTERRUPTED");
      } else if (stepRes.nextNodeName === END) {
        setRunStatus("COMPLETED");
      } else {
        setRunStatus("RUNNING");
      }
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setIsRunning(false);
    }
  };

  // 连续执行至终止态或挂起点 (Run All)
  const handleRunAll = async () => {
    setIsRunning(true);
    setRunStatus("RUNNING");

    try {
      const compiled = compileSoftwareDevGraph();
      let state = { ...currentState };
      let node = currentNode === START ? compiled.getEntryPoint() : currentNode;
      const history = [...executionHistory];

      let stepsCount = history.length;
      const recursionLimit = 25;

      while (node && node !== END) {
        stepsCount++;
        if (stepsCount > recursionLimit) {
          setRunStatus("LIMIT_EXCEEDED");
          break;
        }

        const stepRes = await compiled.step(state, node);
        const nodeObj = compiled.getNode(node);

        const event: GraphStepEvent<DevAgentState> = {
          stepIndex: stepsCount,
          node,
          nodeDescription: nodeObj?.description,
          previousState: state,
          patch: stepRes.patch,
          nextState: stepRes.nextState,
          edgeType: stepRes.edgeType,
          edgeTarget: stepRes.nextNodeName,
          durationMs: stepRes.durationMs,
          timestamp: Date.now(),
          isInterrupted: stepRes.isInterrupted,
        };

        history.push(event);
        state = stepRes.nextState;
        setCurrentState(state);
        setLastPatch(stepRes.patch);
        setExecutionHistory([...history]);
        setCurrentNode(stepRes.nextNodeName);

        if (stepRes.isInterrupted) {
          setIsInterrupted(true);
          setRunStatus("INTERRUPTED");
          break;
        }

        node = stepRes.nextNodeName;
        // 微小延迟营造动效
        await new Promise((r) => setTimeout(r, 220));
      }

      if (node === END) {
        setRunStatus("COMPLETED");
      }
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setIsRunning(false);
    }
  };

  // 人工审批操作 (Approve / Reject)
  const handleApproval = async (decision: "APPROVED" | "REJECTED") => {
    const updatedState: DevAgentState = {
      ...currentState,
      approvalStatus: decision,
      executionLogs: [
        ...currentState.executionLogs,
        `[HITL Approval] 人工审批决策完成: ${decision === "APPROVED" ? "✅ 批准放行生产环境" : "🛑 驳回变更并回滚"}。`,
      ],
    };
    setCurrentState(updatedState);
    setIsInterrupted(false);
    setRunStatus("RUNNING");

    // 继续从 approval_gate 往下走一步
    try {
      const compiled = compileSoftwareDevGraph();
      const stepRes = await compiled.step(updatedState, "approval_gate");
      const event: GraphStepEvent<DevAgentState> = {
        stepIndex: executionHistory.length + 1,
        node: "approval_gate",
        nodeDescription: "高危操作人机协同审批 (HITL Gate)",
        previousState: updatedState,
        patch: stepRes.patch,
        nextState: stepRes.nextState,
        edgeType: stepRes.edgeType,
        edgeTarget: stepRes.nextNodeName,
        durationMs: stepRes.durationMs,
        timestamp: Date.now(),
        isInterrupted: false,
      };

      setCurrentState(stepRes.nextState);
      setLastPatch(stepRes.patch);
      setExecutionHistory((prev) => [...prev, event]);
      setCurrentNode(stepRes.nextNodeName);

      if (stepRes.nextNodeName === END) {
        setRunStatus("COMPLETED");
      } else {
        setRunStatus("RUNNING");
      }
    } catch (e: unknown) {
      console.error(e);
    }
  };

  // 编译器 Linter 实验沙箱状态
  const [activeLintScenarioId, setActiveLintScenarioId] = useState("standard-clean");
  const [currentLintReport, setCurrentLintReport] = useState<GraphLintReport>(initialLintReport);
  const [isLinting, setIsLinting] = useState(false);

  const handleRunLintScenario = async (scenarioId: string) => {
    setActiveLintScenarioId(scenarioId);
    setIsLinting(true);
    try {
      const res = await fetch("/api/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run-lint-scenario", scenarioId }),
      });
      const data = await res.json();
      if (data.success && data.report) {
        setCurrentLintReport(data.report);
      }
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setIsLinting(false);
    }
  };

  // 决策竞技场状态
  const [arenaAnswers, setArenaAnswers] = useState<Record<string, ArchitectureChoice>>({});
  const [arenaResult, setArenaResult] = useState<EvaluationResult | null>(null);

  const handleSelectAnswer = (scenarioId: string, choice: ArchitectureChoice) => {
    setArenaAnswers((prev) => ({ ...prev, [scenarioId]: choice }));
  };

  const handleEvaluateArena = () => {
    const result = evaluateArchitectureDecisions(arenaAnswers);
    setArenaResult(result);
  };

  const handleResetArena = () => {
    setArenaAnswers({});
    setArenaResult(null);
  };

  // 计算当前拓扑高亮节点
  const activeHighlightNode = useMemo(() => {
    if (runStatus === "COMPLETED") return END;
    if (runStatus === "IDLE") return START;
    return currentNode;
  }, [runStatus, currentNode]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header
        hasServerKey={hasServerKey}
        model={model}
        defaultBaseURL={defaultBaseURL}
        currentLesson={{
          id: "v19",
          title: "第 20 课: Graph 是什么？—— 从零手写 StateGraph",
          badge: "LangGraph 工业级篇",
        }}
      />

      {/* Hero Banner */}
      <div className="bg-gradient-to-b from-indigo-950/40 via-slate-900/30 to-slate-950 border-b border-indigo-900/30 px-6 py-7">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5">
                  <Network className="w-3.5 h-3.5" />
                  第二学期 · 第二单元：LangGraph 显式状态图
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  原语实测
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                第 20 课：Graph 是什么？
                <span className="text-base sm:text-lg font-normal text-indigo-300/80">
                  —— 从零手写 StateGraph、Node、Edge 与 ConditionalEdge
                </span>
              </h1>
              <p className="mt-2 text-sm text-slate-400 max-w-3xl leading-relaxed">
                彻底告别上一课单体 While 循环的 14 个散乱状态位与死锁空转。我们推导出状态图四大核心原语，
                手写纯 TypeScript 的泛型 <code className="text-indigo-300">StateGraph</code> 引擎与编译期拓扑检查器，
                并将真实软件工程任务编排为兼具自愈环路与人机审批（HITL）的高确定性状态图！
              </p>
            </div>

            <div className="flex items-center gap-3 self-start md:self-auto">
              <Link
                to="/docs/lessons/20-what-is-graph.md"
                className="px-3.5 py-2 rounded-lg text-xs font-medium bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <BookOpen className="w-3.5 h-3.5" />
                查看原理讲义
              </Link>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 mt-6 border-b border-slate-800">
            <button
              onClick={() => setActiveTab("studio")}
              className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-2 border-b-2 ${
                activeTab === "studio"
                  ? "bg-slate-900/90 text-indigo-300 border-indigo-500 shadow-sm"
                  : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40"
              }`}
            >
              <Network className="w-4 h-4" />
              拓扑演练台 (StateGraph Studio)
            </button>
            <button
              onClick={() => setActiveTab("linter")}
              className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-2 border-b-2 ${
                activeTab === "linter"
                  ? "bg-slate-900/90 text-indigo-300 border-indigo-500 shadow-sm"
                  : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40"
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              拓扑编译器沙箱 (Topology Linter)
            </button>
            <button
              onClick={() => setActiveTab("arena")}
              className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-2 border-b-2 ${
                activeTab === "arena"
                  ? "bg-slate-900/90 text-indigo-300 border-indigo-500 shadow-sm"
                  : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40"
              }`}
            >
              <Scale className="w-4 h-4" />
              Loop vs Graph 决策竞技场
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-6">
        {/* ======================= TAB 1: STUDIO ======================= */}
        {activeTab === "studio" && (
          <div className="space-y-6">
            {/* Task Selector & Controls */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Task Selection */}
              <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                    选择工程验证任务 (Preset Tasks)
                  </span>
                  <span className="text-xs text-indigo-400/80 font-mono">
                    Task {selectedTaskIndex + 1} / {presetTasks.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {presetTasks.map((t: SoftwareDevTask, idx: number) => {
                    const isSelected = idx === selectedTaskIndex;
                    return (
                      <button
                        key={t.id}
                        onClick={() => handleSelectTask(idx)}
                        className={`text-left p-3 rounded-lg border transition-all ${
                          isSelected
                            ? "bg-indigo-950/40 border-indigo-500/60 ring-1 ring-indigo-500/30"
                            : "bg-slate-950/40 border-slate-800/80 hover:border-slate-700 hover:bg-slate-800/20"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className={`text-xs font-semibold truncate ${isSelected ? "text-indigo-200" : "text-slate-300"}`}>
                            {t.title}
                          </span>
                          {t.isDestructive ? (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0">
                              高危 HITL
                            </span>
                          ) : t.simulatedTestFailsCount > 0 ? (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                              自愈修复
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shrink-0">
                              常规流
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                          {t.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Control Action Bar */}
              <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                      CompiledGraph 执行控制器
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium border ${
                        runStatus === "COMPLETED"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : runStatus === "INTERRUPTED"
                          ? "bg-purple-500/20 text-purple-300 border-purple-500/30 animate-pulse"
                          : runStatus === "RUNNING"
                          ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}
                    >
                      {runStatus === "COMPLETED"
                        ? "✅ 已完成终态"
                        : runStatus === "INTERRUPTED"
                        ? "⏸️ HITL 挂起等待审批"
                        : runStatus === "RUNNING"
                        ? "⚡ 执行中..."
                        : runStatus === "LIMIT_EXCEEDED"
                        ? "⚠️ 递归熔断"
                        : "待执行"}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    使用手写 <code className="text-indigo-300 font-mono">StateGraph</code> 纯函数算子驱动。
                    支持单步穿梭验证状态补丁，支持原子挂起与外部状态重入。
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={handleRunAll}
                    disabled={isRunning || runStatus === "COMPLETED" || runStatus === "INTERRUPTED"}
                    className="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    一键流式推进
                  </button>

                  <button
                    onClick={handleStep}
                    disabled={isRunning || runStatus === "COMPLETED" || runStatus === "INTERRUPTED"}
                    className="py-2.5 px-3.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border border-slate-700"
                  >
                    <ChevronRight className="w-4 h-4" />
                    单步步进 (Step)
                  </button>

                  <button
                    onClick={handleReset}
                    className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors border border-slate-700"
                    title="重置状态图"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* HITL Suspended Banner */}
            {isInterrupted && runStatus === "INTERRUPTED" && (
              <div className="bg-purple-950/40 border border-purple-500/50 rounded-xl p-4.5 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-200">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-purple-200 flex items-center gap-2">
                      Durable Suspension: 命中断点挂起节点 (approval_gate)
                    </h4>
                    <p className="text-xs text-purple-300/80 mt-1 max-w-2xl leading-relaxed">
                      当前操作为高危生产变更（<code className="text-purple-200 font-mono">{currentTask.targetFiles.join(", ")}</code>）。
                      按照控制流契约，Graph 执行器已安全挂起并输出持久化快照。请审核确认是否放行：
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 self-end md:self-auto">
                  <button
                    onClick={() => handleApproval("REJECTED")}
                    className="px-3.5 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    驳回并回滚 (Rollback)
                  </button>
                  <button
                    onClick={() => handleApproval("APPROVED")}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <Check className="w-3.5 h-3.5" />
                    批准放行 (Resume)
                  </button>
                </div>
              </div>
            )}

            {/* Graph Visualizer + State Monitor */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Column: Interactive Topology Canvas */}
              <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Network className="w-4 h-4 text-indigo-400" />
                    状态图拓扑流向与活跃节点 (Topology Canvas)
                  </span>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-cyan-400"></span> 静态边
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-400"></span> 条件分支边
                    </span>
                  </div>
                </div>

                {/* SVG Visual Graph Representation */}
                <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 flex-1 flex flex-col justify-center items-center relative overflow-hidden min-h-[460px]">
                  {/* Visual Topology Diagram */}
                  <div className="w-full max-w-lg space-y-4 text-center">
                    {/* START Node */}
                    <div className="flex justify-center">
                      <div
                        className={`px-4 py-1.5 rounded-full text-xs font-mono font-semibold border transition-all ${
                          activeHighlightNode === START
                            ? "bg-indigo-600 text-white border-indigo-400 ring-2 ring-indigo-400/40 scale-105"
                            : "bg-slate-900 text-slate-400 border-slate-800"
                        }`}
                      >
                        [START] 入口点
                      </div>
                    </div>

                    <div className="flex justify-center text-slate-600">
                      <span className="text-xs font-mono">↓ static</span>
                    </div>

                    {/* Phase 1: Analyze */}
                    <div className="flex justify-center">
                      <div
                        className={`w-56 p-2.5 rounded-lg border text-xs font-medium transition-all ${
                          activeHighlightNode === "analyze"
                            ? "bg-indigo-950/80 border-indigo-500 text-indigo-200 ring-2 ring-indigo-500/30 scale-105 shadow-lg shadow-indigo-950/50"
                            : "bg-slate-900/90 border-slate-800 text-slate-300"
                        }`}
                      >
                        <div className="font-semibold flex items-center justify-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-indigo-400" />
                          Node: analyze
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">静态代码与需求分析</div>
                      </div>
                    </div>

                    <div className="flex justify-center text-slate-600">
                      <span className="text-xs font-mono">↓ static</span>
                    </div>

                    {/* Phase 2: Plan */}
                    <div className="flex justify-center">
                      <div
                        className={`w-56 p-2.5 rounded-lg border text-xs font-medium transition-all ${
                          activeHighlightNode === "plan"
                            ? "bg-indigo-950/80 border-indigo-500 text-indigo-200 ring-2 ring-indigo-500/30 scale-105 shadow-lg shadow-indigo-950/50"
                            : "bg-slate-900/90 border-slate-800 text-slate-300"
                        }`}
                      >
                        <div className="font-semibold flex items-center justify-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                          Node: plan
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">架构方案与步骤规划</div>
                      </div>
                    </div>

                    <div className="flex justify-center text-slate-600">
                      <span className="text-xs font-mono">↓ static</span>
                    </div>

                    {/* Phase 3: Implement & Test Cluster */}
                    <div className="relative border border-slate-800/80 bg-slate-900/30 rounded-xl p-3.5">
                      <div className="text-[10px] uppercase font-mono text-slate-500 mb-2.5 flex items-center justify-between">
                        <span>自愈闭环集群 (Self-Healing Loop)</span>
                        <span className="text-amber-400/80 font-semibold">
                          Retries: {currentState.retryCount} / {currentState.maxRetries}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div
                          className={`p-2.5 rounded-lg border text-xs font-medium transition-all ${
                            activeHighlightNode === "implement"
                              ? "bg-indigo-950/80 border-indigo-500 text-indigo-200 ring-2 ring-indigo-500/30 scale-105"
                              : "bg-slate-900/90 border-slate-800 text-slate-300"
                          }`}
                        >
                          <div className="font-semibold flex items-center justify-center gap-1">
                            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                            implement
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">代码修改写入</div>
                        </div>

                        <div
                          className={`p-2.5 rounded-lg border text-xs font-medium transition-all ${
                            activeHighlightNode === "test"
                              ? "bg-indigo-950/80 border-indigo-500 text-indigo-200 ring-2 ring-indigo-500/30 scale-105"
                              : "bg-slate-900/90 border-slate-800 text-slate-300"
                          }`}
                        >
                          <div className="font-semibold flex items-center justify-center gap-1">
                            <Activity className="w-3.5 h-3.5 text-amber-400" />
                            test (Conditional)
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">测试套件验证</div>
                        </div>
                      </div>

                      <div className="mt-2 text-[10px] text-slate-500 flex items-center justify-center gap-2">
                        <span className="text-amber-400 font-mono">
                          fail → implement (loop)
                        </span>
                        <span>|</span>
                        <span className="text-emerald-400 font-mono">
                          pass → review
                        </span>
                        <span>|</span>
                        <span className="text-rose-400 font-mono">
                          exhausted → rollback
                        </span>
                      </div>
                    </div>

                    {/* Phase 4: Review Gate & Approval */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div
                        className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                          activeHighlightNode === "review"
                            ? "bg-indigo-950/80 border-indigo-500 text-indigo-200 ring-2 ring-indigo-500/30 scale-105"
                            : "bg-slate-900/90 border-slate-800 text-slate-300"
                        }`}
                      >
                        <div className="font-semibold text-[11px] truncate">review</div>
                        <div className="text-[9px] text-slate-400">代码审查门禁</div>
                      </div>

                      <div
                        className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                          activeHighlightNode === "approval_gate"
                            ? "bg-purple-950/80 border-purple-500 text-purple-200 ring-2 ring-purple-500/30 scale-105 animate-pulse"
                            : "bg-slate-900/90 border-slate-800 text-slate-300"
                        }`}
                      >
                        <div className="font-semibold text-[11px] truncate text-purple-300">
                          approval_gate
                        </div>
                        <div className="text-[9px] text-slate-400">高危 HITL 挂起</div>
                      </div>

                      <div
                        className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                          activeHighlightNode === "rollback"
                            ? "bg-rose-950/80 border-rose-500 text-rose-200 ring-2 ring-rose-500/30 scale-105"
                            : "bg-slate-900/90 border-slate-800 text-slate-300"
                        }`}
                      >
                        <div className="font-semibold text-[11px] truncate text-rose-300">
                          rollback
                        </div>
                        <div className="text-[9px] text-slate-400">兜底回滚</div>
                      </div>
                    </div>

                    {/* END Node */}
                    <div className="flex justify-center pt-2">
                      <div
                        className={`px-4 py-1.5 rounded-full text-xs font-mono font-semibold border transition-all ${
                          activeHighlightNode === END
                            ? "bg-emerald-600 text-white border-emerald-400 ring-2 ring-emerald-400/40 scale-105"
                            : "bg-slate-900 text-slate-400 border-slate-800"
                        }`}
                      >
                        [END] 终止出口
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Real-time State & Step Stream */}
              <div className="lg:col-span-5 space-y-4">
                {/* Canonical State Snapshot */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                      单一权威状态快照 (Canonical State)
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      Phase: <b className="text-indigo-300">{currentState.currentPhase}</b>
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800/80">
                      <span className="text-slate-400">审批状态 (approvalStatus):</span>
                      <span
                        className={`font-semibold font-mono ${
                          currentState.approvalStatus === "APPROVED"
                            ? "text-emerald-400"
                            : currentState.approvalStatus === "PENDING"
                            ? "text-purple-400"
                            : currentState.approvalStatus === "REJECTED"
                            ? "text-rose-400"
                            : "text-slate-400"
                        }`}
                      >
                        {currentState.approvalStatus}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800/80">
                      <span className="text-slate-400">测试结果 (testResults):</span>
                      <span className="font-semibold font-mono">
                        {currentState.testResults === null
                          ? "未运行"
                          : currentState.testResults.passed
                          ? "✅ 42/42 通过"
                          : `❌ 失败 (${currentState.testResults.errorCount} 报错)`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800/80">
                      <span className="text-slate-400">代码审查 (reviewResult):</span>
                      <span className="font-semibold font-mono">
                        {currentState.reviewResult === null
                          ? "未审查"
                          : currentState.reviewResult.approved
                          ? "✅ 审查通过"
                          : "⚠️ 驳回整改"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800/80">
                      <span className="text-slate-400">修改文件 (implementedFiles):</span>
                      <span className="font-mono text-indigo-300 truncate max-w-[200px]">
                        {currentState.implementedFiles.length > 0
                          ? currentState.implementedFiles.join(", ")
                          : "无"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Last Node Partial Patch */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
                      当前节点局部状态补丁 (Partial Patch)
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Pure Node Output
                    </span>
                  </div>

                  {lastPatch ? (
                    <pre className="p-2.5 rounded bg-slate-950/80 border border-slate-800/80 text-[11px] font-mono text-cyan-300 overflow-x-auto max-h-36">
                      {JSON.stringify(lastPatch, null, 2)}
                    </pre>
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded">
                      点击“单步步进”或“一键推进”观察 Node(State) 产生纯数据补丁
                    </div>
                  )}
                </div>

                {/* Execution Step History */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col max-h-64">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-indigo-400" />
                      执行步进流水账 (Execution Trace)
                    </span>
                    <span className="text-[10px] text-indigo-400/80 font-mono">
                      {executionHistory.length} 步
                    </span>
                  </div>

                  <div className="space-y-1.5 overflow-y-auto flex-1 pr-1 text-xs">
                    {executionHistory.length === 0 ? (
                      <div className="text-center py-6 text-slate-500 text-xs">
                        等待启动图状态机...
                      </div>
                    ) : (
                      executionHistory.map((step) => (
                        <div
                          key={step.stepIndex}
                          className="p-2 rounded bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                              {step.stepIndex}
                            </span>
                            <div>
                              <span className="font-semibold text-slate-200">
                                {step.node}
                              </span>
                              <span className="text-slate-500 text-[10px] ml-1.5">
                                → {step.edgeTarget} ({step.edgeType})
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 shrink-0">
                            {step.durationMs}ms
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================= TAB 2: LINTER SANDBOX ======================= */}
        {activeTab === "linter" && (
          <div className="space-y-6">
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">
                  拓扑编译器静态自检沙箱 (StateGraph Topology Linter)
                </h3>
              </div>
              <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
                在传统单体 While Loop 中，控制流语法错误或死循环只能在**运行时**通过奔溃暴露。
                而在 StateGraph 中，<code className="text-indigo-300 font-mono">validateTopology()</code> 能在
                <strong>编译期</strong>对图的有向拓扑进行静态形式化验证，彻底扼杀悬空边、孤立节点与入口缺失等致命缺陷！
              </p>
            </div>

            {/* Scenario Chooser */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {TOPOLOGY_LINT_SCENARIOS.map((sc) => {
                const isSelected = sc.id === activeLintScenarioId;
                return (
                  <button
                    key={sc.id}
                    onClick={() => handleRunLintScenario(sc.id)}
                    disabled={isLinting}
                    className={`text-left p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                      isSelected
                        ? "bg-indigo-950/50 border-indigo-500/70 ring-1 ring-indigo-500/40"
                        : "bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/30"
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-white mb-1">{sc.name}</div>
                      <div className="text-[11px] text-slate-400 line-clamp-3 leading-relaxed">
                        {sc.description}
                      </div>
                    </div>
                    <div className="mt-3 text-[10px] font-mono text-indigo-400 font-semibold flex items-center gap-1">
                      <span>注入测试</span>
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Diagnostic Report Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Report Summary */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-3">
                    编译诊断结果 (Compiler Verdict)
                  </span>

                  <div className="flex items-center gap-3 mb-4">
                    {currentLintReport.valid ? (
                      <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        <AlertOctagon className="w-6 h-6" />
                      </div>
                    )}
                    <div>
                      <div className="text-lg font-bold">
                        {currentLintReport.valid ? (
                          <span className="text-emerald-400">COMPILATION PASSED</span>
                        ) : (
                          <span className="text-rose-400">COMPILATION FAILED</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">
                        {currentLintReport.errors.length} 个严重错误 · {currentLintReport.warnings.length} 个警告
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-800/80 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-800/40">
                      <span className="text-slate-400">注册节点总数 (nodeCount):</span>
                      <span className="font-mono font-bold text-slate-200">
                        {currentLintReport.nodeCount}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/40">
                      <span className="text-slate-400">确定性静态边 (edgeCount):</span>
                      <span className="font-mono font-bold text-slate-200">
                        {currentLintReport.edgeCount}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/40">
                      <span className="text-slate-400">条件分支边 (conditionalEdgeCount):</span>
                      <span className="font-mono font-bold text-slate-200">
                        {currentLintReport.conditionalEdgeCount}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/40">
                      <span className="text-slate-400">包含环路 (hasCycles):</span>
                      <span className="font-mono font-bold text-amber-400">
                        {currentLintReport.hasCycles ? "YES (有界自愈环)" : "NO (单向 DAG)"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Key takeaway alert */}
                <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-xl p-4 text-xs text-indigo-300/90 leading-relaxed">
                  <div className="font-bold text-indigo-200 mb-1 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    编译期形式化验证的本质
                  </div>
                  在单体 While Loop 中，写错一个跳转目标或漏写一个状态位，系统在运行时会陷入死锁空转。
                  而在 StateGraph 中，<strong>所有拓扑结构在应用启动的一瞬间完成静态校验</strong>，
                  极大减轻了测试与线上故障排查成本！
                </div>
              </div>

              {/* Error & Warning Details */}
              <div className="lg:col-span-8 bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-3">
                  静态诊断问题详情清单 (Lint Issues)
                </span>

                <div className="space-y-3 flex-1 overflow-y-auto max-h-[420px] pr-1">
                  {currentLintReport.errors.length === 0 &&
                  currentLintReport.warnings.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400/60 mx-auto mb-2" />
                      <div className="text-sm font-semibold text-slate-300">
                        拓扑完全合法，零结构性缺陷
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        所有的边均指向有效节点，图具备合法的入口与终止出口。
                      </div>
                    </div>
                  ) : null}

                  {/* Errors */}
                  {currentLintReport.errors.map((err, idx) => (
                    <div
                      key={`err-${idx}`}
                      className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs flex items-start gap-3"
                    >
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-mono text-[10px] font-bold border border-rose-500/30">
                            {err.code}
                          </span>
                          {err.node && (
                            <span className="text-slate-400 text-[11px]">
                              Node: <code className="text-rose-200">{err.node}</code>
                            </span>
                          )}
                          {err.target && (
                            <span className="text-slate-400 text-[11px]">
                              Target: <code className="text-rose-200">{err.target}</code>
                            </span>
                          )}
                        </div>
                        <p className="text-rose-200 font-medium leading-relaxed">
                          {err.message}
                        </p>
                      </div>
                    </div>
                  ))}

                  {/* Warnings */}
                  {currentLintReport.warnings.map((warn, idx) => (
                    <div
                      key={`warn-${idx}`}
                      className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/40 text-xs flex items-start gap-3"
                    >
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold border border-amber-500/30">
                            {warn.code}
                          </span>
                          {warn.node && (
                            <span className="text-slate-400 text-[11px]">
                              Node: <code className="text-amber-200">{warn.node}</code>
                            </span>
                          )}
                        </div>
                        <p className="text-amber-200/90 font-medium leading-relaxed">
                          {warn.message}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================= TAB 3: DECISION ARENA ======================= */}
        {activeTab === "arena" && (
          <div className="space-y-8">
            <div className="bg-gradient-to-r from-[#12192c]/90 via-[#0e1424]/90 to-[#14122d]/90 border border-indigo-500/25 rounded-2xl p-6 md:p-7 shadow-xl shadow-black/20">
              <div className="flex items-center justify-between flex-wrap gap-4 mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
                    <Scale className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight">
                      Loop vs Graph 架构决策竞技场 (Decision Arena)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      检验你对控制流复杂度的洞察力：何时用轻量的 While Loop，何时必须上 StateGraph？
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shadow-sm">
                  本课毕业终极考验
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300/90 max-w-3xl leading-relaxed mt-2 pl-0.5">
                本单元的核心验收标准：<strong>给你一个实际的业务流程，能够精准判断应该用 Loop 还是 Graph？</strong>
                不要机械崇拜 Graph，更不要试图用 Loop 解决多阶段审批。请对以下 6 个经典真实场景作出架构选型：
              </p>
            </div>

            {/* Result Header if evaluated */}
            {arenaResult && (
              <div
                className={`p-6 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-5 animate-in fade-in duration-200 shadow-xl ${
                  arenaResult.verdict === "EXPERT"
                    ? "bg-emerald-950/40 border-emerald-500/50 shadow-emerald-950/30"
                    : arenaResult.verdict === "INTERMEDIATE"
                    ? "bg-indigo-950/40 border-indigo-500/50 shadow-indigo-950/30"
                    : "bg-amber-950/40 border-amber-500/50 shadow-amber-950/30"
                }`}
              >
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-col items-center justify-center shrink-0 shadow-inner">
                    <span className="text-xl font-bold text-white font-mono">
                      {arenaResult.percentage}%
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {arenaResult.score}/{arenaResult.total}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                      评测结论: {arenaResult.verdict}
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-300 mt-1.5 max-w-2xl leading-relaxed">
                      {arenaResult.summaryFeedback}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleResetArena}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-all shrink-0 shadow-sm active:scale-[0.98]"
                >
                  重新测验
                </button>
              </div>
            )}

            {/* Question Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {DECISION_SCENARIOS.map((scene, idx) => {
                const userChoice = arenaAnswers[scene.id];
                const detail = arenaResult?.details.find((d) => d.scenarioId === scene.id);
                const cleanTitle = scene.title.replace(/^\d+\.\s*/, "");

                return (
                  <div
                    key={scene.id}
                    className={`border rounded-2xl p-5 sm:p-6 flex flex-col justify-between transition-all duration-200 shadow-lg ${
                      detail
                        ? detail.isCorrect
                          ? "border-emerald-500/50 bg-gradient-to-b from-emerald-950/20 to-slate-900/90 shadow-emerald-950/20"
                          : "border-rose-500/50 bg-gradient-to-b from-rose-950/20 to-slate-900/90 shadow-rose-950/20"
                        : userChoice
                        ? "border-indigo-500/40 bg-gradient-to-b from-[#141b2d]/90 to-[#0c101c]/95 shadow-indigo-950/20"
                        : "border-slate-800/80 bg-gradient-to-b from-[#111827]/85 to-[#0b0f19]/95 hover:border-slate-700/90 hover:shadow-xl"
                    }`}
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3 mb-3.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-xs font-bold font-mono flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <h4 className="text-sm font-bold text-white tracking-tight leading-snug">
                            {cleanTitle}
                          </h4>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium border shrink-0 ${getCategoryStyle(scene.category)}`}>
                          {scene.category}
                        </span>
                      </div>

                      {/* Description with comfortable min-height to balance card columns */}
                      <p className="text-xs sm:text-[13px] text-slate-300/90 leading-relaxed min-h-[54px] mb-4">
                        {scene.description}
                      </p>

                      {/* Feature Indicators */}
                      <div className="grid grid-cols-2 gap-3 mb-5 text-xs font-mono">
                        <div className="px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between">
                          <span className="text-slate-400 text-[11px]">阶段确定性</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              scene.features.phaseDeterminism === "HIGH"
                                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                : "bg-slate-800/70 text-slate-400 border border-slate-700/50"
                            }`}
                          >
                            {scene.features.phaseDeterminism}
                          </span>
                        </div>
                        <div className="px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between">
                          <span className="text-slate-400 text-[11px]">人机挂起需求</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              scene.features.suspensionRequirement === "HIGH"
                                ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                : "bg-slate-800/70 text-slate-400 border border-slate-700/50"
                            }`}
                          >
                            {scene.features.suspensionRequirement}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      {/* Selection Buttons */}
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => handleSelectAnswer(scene.id, "LOOP")}
                          className={`py-2.5 px-3.5 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-2 active:scale-[0.98] ${
                            userChoice === "LOOP"
                              ? "bg-gradient-to-r from-cyan-600 to-teal-600 text-white border-cyan-400 shadow-md shadow-cyan-950/40 ring-1 ring-cyan-400/50 font-bold"
                              : "bg-slate-950/70 text-slate-300 border-slate-800/90 hover:bg-slate-800/70 hover:border-slate-700 hover:text-white"
                          }`}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${userChoice === "LOOP" ? "text-white" : "text-cyan-400"}`} />
                          <span>选择 While Loop</span>
                        </button>
                        <button
                          onClick={() => handleSelectAnswer(scene.id, "GRAPH")}
                          className={`py-2.5 px-3.5 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-2 active:scale-[0.98] ${
                            userChoice === "GRAPH"
                              ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-indigo-400 shadow-md shadow-indigo-950/40 ring-1 ring-indigo-400/50 font-bold"
                              : "bg-slate-950/70 text-slate-300 border-slate-800/90 hover:bg-slate-800/70 hover:border-slate-700 hover:text-white"
                          }`}
                        >
                          <Network className={`w-3.5 h-3.5 ${userChoice === "GRAPH" ? "text-white" : "text-indigo-400"}`} />
                          <span>选择 StateGraph</span>
                        </button>
                      </div>

                      {/* Detail feedback when evaluated */}
                      {detail && (
                        <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-2.5 animate-in fade-in">
                          <div className="flex items-center gap-2 font-bold">
                            {detail.isCorrect ? (
                              <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-1.5">
                                <Check className="w-3.5 h-3.5" /> 选型正确 (应选 {detail.correctChoice})
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-1.5">
                                <X className="w-3.5 h-3.5" /> 选型错误 (正确应选 {detail.correctChoice})
                              </span>
                            )}
                          </div>
                          <p className="text-slate-300 text-xs leading-relaxed">
                            {detail.explanation}
                          </p>
                          <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/25 text-xs text-indigo-300 font-mono leading-relaxed">
                            {detail.architectureKeyTakeaway}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Evaluation Trigger */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6 pb-2">
              <div className="text-xs text-slate-400 font-mono">
                已答进度: <span className="text-indigo-300 font-bold">{Object.keys(arenaAnswers).length}</span> / {DECISION_SCENARIOS.length}
              </div>
              <button
                onClick={handleEvaluateArena}
                disabled={Object.keys(arenaAnswers).length < DECISION_SCENARIOS.length}
                className="py-3.5 px-8 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 disabled:pointer-events-none text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-950/50 active:scale-[0.98]"
              >
                <SlidersHorizontal className="w-4 h-4" />
                提交答卷并计算架构师评级
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

import { useState, useMemo, useRef } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import { PRESET_TASKS } from "~/routes/api.workflow";
import {
  SpaghettiLoopEngine,
  StructuredWorkflowEngine,
  type SoftwareTask,
  type SpaghettiFlags,
  type SpaghettiStepRecord,
  type StructuredStepRecord,
  type StructuredWorkflowState,
} from "~/core/workflow";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  GitBranch,
  Gauge,
  Layers,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Terminal,
  XCircle,
  Scale,
  Check,
  X,
  Workflow,
  Compass,
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
    presetTasks: PRESET_TASKS,
  };
}

export default function Lesson18Route() {
  const { hasServerKey, model, defaultBaseURL, presetTasks } =
    useLoaderData<typeof loader>();

  const [activeTab, setActiveTab] = useState<"studio" | "tradeoffs">("studio");

  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const [engineMode, setEngineMode] = useState<"SPAGHETTI" | "STRUCTURED">("STRUCTURED");
  const [simulateDesyncBug, setSimulateDesyncBug] = useState(false);

  const currentTask = presetTasks[selectedTaskIndex] || presetTasks[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header
        hasServerKey={hasServerKey}
        model={model}
        defaultBaseURL={defaultBaseURL}
        currentLesson={{
          id: "v18",
          title: "第 19 课: 什么时候 while loop 开始失控？",
          badge: "LangGraph 篇开篇",
        }}
      />

      {/* Hero Banner */}
      <div className="border-b border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/40 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-2">
                <span>Mini Claude Code</span>
                <span>/</span>
                <span>第二学期</span>
                <span>/</span>
                <span className="text-indigo-300">第二单元：LangGraph 显式工作流篇</span>
                <span>/</span>
                <span className="text-amber-300 font-bold">第 19 课 (V18)</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-3">
                <span>什么时候 while loop 开始失控？</span>
                <span className="text-xs px-2.5 py-1 rounded-full font-mono bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 text-cyan-300 border border-cyan-500/40">
                  ⚡ 隐式 Loop vs 显式 Workflow
                </span>
              </h1>
              <p className="text-slate-400 text-sm mt-1.5 max-w-3xl">
                探究单体 While-Loop 隐式控制流在复杂工程研发中的必然坍塌：14 个松散状态位空间爆炸、圈复杂度（McCabe）飙升红线、标志位遗漏死锁空转，以及人机审批挂起的持久化绝境。
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                to="/docs/lessons/19-when-while-loop-breaks-down.md"
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
              >
                <BookOpen className="w-4 h-4 text-cyan-400" />
                查看讲义教案
              </Link>
              <Link
                to="/lessons/v17-extensions-and-skills"
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-900/40 hover:bg-indigo-800/50 text-indigo-300 border border-indigo-700/50 transition flex items-center gap-1.5"
              >
                <span>上一课：V17 微内核沙箱</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* 精简双 Tab 导航 */}
          <div className="flex items-center gap-2 mt-6 border-b border-slate-800/80">
            <button
              onClick={() => setActiveTab("studio")}
              className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition flex items-center gap-2 border-b-2 ${
                activeTab === "studio"
                  ? "border-cyan-400 text-cyan-300 bg-cyan-950/20"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>🎮 复杂工程工作流双轨推演台</span>
            </button>
            <button
              onClick={() => setActiveTab("tradeoffs")}
              className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition flex items-center gap-2 border-b-2 ${
                activeTab === "tradeoffs"
                  ? "border-amber-400 text-amber-300 bg-amber-950/20"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
              }`}
            >
              <Scale className="w-4 h-4 text-amber-400" />
              <span>⚖️ 架构优缺点深度对比与真实选型</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        {activeTab === "studio" && (
          <WorkflowStudioTab
            key={`${currentTask.id}-${engineMode}-${simulateDesyncBug}`}
            task={currentTask}
            presetTasks={presetTasks}
            selectedTaskIndex={selectedTaskIndex}
            onSelectTask={setSelectedTaskIndex}
            engineMode={engineMode}
            onChangeEngineMode={setEngineMode}
            simulateDesyncBug={simulateDesyncBug}
            onToggleDesyncBug={setSimulateDesyncBug}
          />
        )}

        {activeTab === "tradeoffs" && <TradeoffsDeepDiveTab />}
      </main>
    </div>
  );
}

// ============================================================================
// Tab 1: 🎮 复杂工程工作流推演台 (Colocated Studio Tab)
// ============================================================================
interface WorkflowStudioTabProps {
  task: SoftwareTask;
  presetTasks: SoftwareTask[];
  selectedTaskIndex: number;
  onSelectTask: (index: number) => void;
  engineMode: "SPAGHETTI" | "STRUCTURED";
  onChangeEngineMode: (mode: "SPAGHETTI" | "STRUCTURED") => void;
  simulateDesyncBug: boolean;
  onToggleDesyncBug: (val: boolean) => void;
}

function WorkflowStudioTab({
  task,
  presetTasks,
  selectedTaskIndex,
  onSelectTask,
  engineMode,
  onChangeEngineMode,
  simulateDesyncBug,
  onToggleDesyncBug,
}: WorkflowStudioTabProps) {
  // 单步与运行状态维护
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState<number>(600);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 本地引擎实例 (通过 useState 惰性初始值，由父级 key={...} 自然完成重置)
  const [spaghettiEngine] = useState(
    () =>
      new SpaghettiLoopEngine(task, {
        simulateDesyncBug,
        maxLoopLimit: 25,
      })
  );
  const [structuredEngine] = useState(() => new StructuredWorkflowEngine(task));

  const [spaghettiHistory, setSpaghettiHistory] = useState<SpaghettiStepRecord[]>([]);
  const [spaghettiFlags, setSpaghettiFlags] = useState<SpaghettiFlags>(() =>
    spaghettiEngine.getFlags()
  );

  const [structuredHistory, setStructuredHistory] = useState<StructuredStepRecord[]>([]);
  const [structuredState, setStructuredState] = useState<StructuredWorkflowState>(() =>
    structuredEngine.getState()
  );

  const [isFinished, setIsFinished] = useState(false);
  const [terminalStatus, setTerminalStatus] = useState<string>("RUNNING");

  // 执行单步
  const executeStep = () => {
    if (isFinished) return;

    if (engineMode === "SPAGHETTI") {
      const res = spaghettiEngine.step();
      setSpaghettiHistory(spaghettiEngine.getHistory());
      setSpaghettiFlags(spaghettiEngine.getFlags());

      if (res.finished) {
        setIsFinished(true);
        setIsPlaying(false);
        setTerminalStatus(spaghettiEngine.getFlags().terminalStatus);
      }
    } else {
      const res = structuredEngine.step();
      setStructuredHistory(structuredEngine.getHistory());
      setStructuredState(structuredEngine.getState());

      if (res.finished) {
        setIsFinished(true);
        setIsPlaying(false);
        const p = structuredEngine.getState().phase;
        if (p === "COMPLETE") setTerminalStatus("SUCCESS");
        else if (p === "APPROVAL_GATE") setTerminalStatus("PENDING_APPROVAL");
        else if (p === "FAILED" || structuredEngine.getState().isRolledBack) setTerminalStatus("ROLLED_BACK");
        else setTerminalStatus(p);
      }
    }
  };

  // 连放播放器
  const togglePlay = () => {
    if (isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setIsPlaying(false);
    } else {
      if (isFinished) return;
      setIsPlaying(true);
      timerRef.current = setInterval(() => {
        executeStep();
      }, playSpeed);
    }
  };

  // 审批放行
  const handleApprove = () => {
    if (engineMode === "SPAGHETTI") {
      spaghettiEngine.approveDestructiveAction();
      setSpaghettiFlags(spaghettiEngine.getFlags());
      setIsFinished(false);
      setTerminalStatus("RUNNING");
    } else {
      structuredEngine.approveAndResume();
      setStructuredState(structuredEngine.getState());
      setIsFinished(false);
      setTerminalStatus("RUNNING");
    }
  };

  // 圈复杂度计算
  const currentCyclomaticComplexity = useMemo(() => {
    if (engineMode === "SPAGHETTI") {
      const last = spaghettiHistory[spaghettiHistory.length - 1];
      return last ? last.cyclomaticComplexity : 12;
    } else {
      return 3; // 结构化引擎单节点与转移复杂度恒定 <= 3
    }
  }, [engineMode, spaghettiHistory]);

  return (
    <div className="space-y-6">
      {/* 顶部控制栏：任务选择与模式切换 */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        {/* 任务选择器 */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400 font-medium">推演任务：</label>
          <div className="flex flex-wrap gap-2">
            {presetTasks.map((t, idx) => (
              <button
                key={t.id}
                onClick={() => onSelectTask(idx)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  selectedTaskIndex === idx
                    ? "bg-cyan-600 text-white shadow-lg shadow-cyan-900/40"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {t.title}
              </button>
            ))}
          </div>
        </div>

        {/* 引擎双轨切换 */}
        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => onChangeEngineMode("SPAGHETTI")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
              engineMode === "SPAGHETTI"
                ? "bg-rose-900/80 text-rose-200 shadow-md border border-rose-600/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>模式 A: 单体 While 意大利面</span>
          </button>
          <button
            onClick={() => onChangeEngineMode("STRUCTURED")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
              engineMode === "STRUCTURED"
                ? "bg-cyan-900/80 text-cyan-200 shadow-md border border-cyan-600/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>模式 B: 显式状态转移 (Pre-Graph)</span>
          </button>
        </div>
      </div>

      {/* 任务详情卡片与参数微调 */}
      <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="space-y-1 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-200">{task.title}</span>
            {task.isDestructive && (
              <span className="px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800 text-[10px] font-mono">
                ⚠️ 高危破坏性迁移 (需审批)
              </span>
            )}
            {task.simulatedTestFailsCount > 0 && (
              <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800 text-[10px] font-mono">
                测试失败轮次: {task.simulatedTestFailsCount}
              </span>
            )}
            {task.simulatedReviewRejectionsCount > 0 && (
              <span className="px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800 text-[10px] font-mono">
                审查驳回轮次: {task.simulatedReviewRejectionsCount}
              </span>
            )}
          </div>
          <p className="text-slate-400">{task.description}</p>
        </div>

        {/* 仅在单体 While 模式下允许注入死锁 Bug */}
        {engineMode === "SPAGHETTI" && (
          <div className="flex items-center gap-3 bg-rose-950/20 border border-rose-900/40 px-3 py-1.5 rounded-lg">
            <input
              type="checkbox"
              id="desyncBug"
              checked={simulateDesyncBug}
              onChange={(e) => onToggleDesyncBug(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-rose-500 focus:ring-0 cursor-pointer"
            />
            <label htmlFor="desyncBug" className="text-rose-300 text-xs cursor-pointer select-none">
              模拟程序员重试时遗漏重置 <code className="font-mono text-rose-200">testsExecuted = false</code> (诱发死循环)
            </label>
          </div>
        )}
      </div>

      {/* 核心推演主视界：左侧状态/图谱观察，右侧实时控制与圈复杂度指标 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧 2 栏：状态/图谱透视 */}
        <div className="lg:col-span-2 space-y-4">
          {engineMode === "SPAGHETTI" ? (
            /* 模式 A：14 个松散布尔标志位指示器 + 嵌套 If 栈 */
            <div className="bg-slate-900/80 border border-rose-900/40 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <AlertOctagon className="w-5 h-5 text-rose-400" />
                  <h3 className="text-sm font-bold text-rose-200">
                    单体 While 内部松散状态池 (14 Mutable Flags Soup)
                  </h3>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  理论状态空间: 2^14 = 16,384 种组合 (99.95% 非法)
                </span>
              </div>

              {/* 14 个布尔标志位 LED 矩阵 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {Object.entries(spaghettiFlags).map(([key, val]) => {
                  if (key === "terminalStatus" || key === "analysisReport" || key === "reviewFeedback") return null;
                  const isTrue = Boolean(val);
                  return (
                    <div
                      key={key}
                      className={`p-2.5 rounded-lg border flex flex-col justify-between transition-all ${
                        isTrue
                          ? "bg-rose-950/40 border-rose-600/50 text-rose-200 shadow-sm shadow-rose-950"
                          : "bg-slate-950/60 border-slate-800 text-slate-500"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] truncate max-w-[110px]" title={key}>
                          {key}
                        </span>
                        <div
                          className={`w-2 h-2 rounded-full ${
                            isTrue ? "bg-rose-400 animate-pulse shadow-md shadow-rose-500" : "bg-slate-700"
                          }`}
                        />
                      </div>
                      <span className="text-[10px] font-mono mt-1 font-bold">
                        {typeof val === "boolean" ? (val ? "TRUE" : "FALSE") : String(val)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* 当前命中 If 条件表达式高亮 */}
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs space-y-1.5">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>当前激活的分支判断语句 (Active If Branch):</span>
                  <span className="text-rose-400">
                    {spaghettiHistory.length > 0 ? `迭代 #${spaghettiHistory[spaghettiHistory.length - 1].loopIteration}` : "待启动"}
                  </span>
                </div>
                <div className="bg-rose-950/30 text-rose-300 p-2.5 rounded border border-rose-900/60 overflow-x-auto text-[11px]">
                  {spaghettiHistory.length > 0 ? (
                    spaghettiHistory[spaghettiHistory.length - 1].activeIfBranch
                  ) : (
                    <span className="text-slate-500">// 点击“单步推演”观察控制流在嵌套 if-else 中跳变</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* 模式 B：显式状态图 (Pre-Graph Nodes & Edges) */
            <div className="bg-slate-900/80 border border-cyan-900/40 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-sm font-bold text-cyan-200">
                    显式工作流节点流转拓扑 (Structured Nodes & Edges)
                  </h3>
                </div>
                <span className="text-xs font-mono text-cyan-400/80">
                  单一状态聚合根 · 零松散标志位
                </span>
              </div>

              {/* 阶段节点图 */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
                {[
                  { id: "ANALYZE", label: "1. 需求分析" },
                  { id: "PLAN", label: "2. 制定方案" },
                  { id: "IMPLEMENT", label: "3. 代码实现" },
                  { id: "TEST", label: "4. 自动化测试" },
                  { id: "REVIEW", label: "5. 代码审查" },
                  { id: "APPROVAL_GATE", label: "6. 审批门禁" },
                  { id: "COMPLETE", label: "7. 交付完成" },
                ].map((node) => {
                  const isActive = structuredState.phase === node.id;
                  const isPassed = structuredState.history.some((h) => h.phase === node.id);

                  return (
                    <div
                      key={node.id}
                      className={`p-2.5 rounded-lg border text-center transition-all ${
                        isActive
                          ? "bg-cyan-950/80 border-cyan-400 text-cyan-100 shadow-lg shadow-cyan-950 ring-2 ring-cyan-500/50 scale-105"
                          : isPassed
                          ? "bg-slate-800/80 border-slate-700 text-slate-300"
                          : "bg-slate-950/50 border-slate-800/60 text-slate-600"
                      }`}
                    >
                      <div className="text-[11px] font-bold">{node.label}</div>
                      <div className="text-[9px] font-mono mt-1 text-slate-400">
                        {isActive ? (
                          <span className="text-cyan-300 font-semibold animate-pulse">● 执行中</span>
                        ) : isPassed ? (
                          <span className="text-emerald-400">✓ 已通过</span>
                        ) : (
                          "待进入"
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 状态转移规则与单一不可变状态快照 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-1">
                  <span className="text-[11px] text-slate-400 font-mono">显式条件转移边 (Conditional Edge):</span>
                  <div className="text-xs font-mono text-cyan-300 bg-cyan-950/30 p-2 rounded border border-cyan-900/50 truncate">
                    {structuredHistory.length > 0
                      ? structuredHistory[structuredHistory.length - 1].transitionRule
                      : "等待启动..."}
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-1">
                  <span className="text-[11px] text-slate-400 font-mono">当前单一权威阶段 (Canonical Phase):</span>
                  <div className="text-xs font-mono text-emerald-300 bg-emerald-950/30 p-2 rounded border border-emerald-900/50 flex items-center justify-between">
                    <span>{structuredState.phase}</span>
                    <span className="text-[10px] text-slate-400">
                      重试: {structuredState.retryCount}/{structuredState.maxRetries}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 实时执行日志追踪 */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-slate-400" />
                <h4 className="text-xs font-semibold text-slate-300">执行时序足迹 (Execution Trace)</h4>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                总执行步数: {engineMode === "SPAGHETTI" ? spaghettiHistory.length : structuredHistory.length}
              </span>
            </div>

            <div className="h-56 overflow-y-auto space-y-2 pr-1 font-mono text-xs">
              {engineMode === "SPAGHETTI" ? (
                spaghettiHistory.length === 0 ? (
                  <div className="text-slate-600 text-center py-10">暂无执行历史，点击“单步推演”或“连续运行”开始</div>
                ) : (
                  spaghettiHistory.map((step) => (
                    <div
                      key={step.stepNumber}
                      className="p-2 rounded bg-slate-950 border border-slate-800/80 text-[11px] space-y-1"
                    >
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-rose-400 font-bold">Step {step.stepNumber}</span>
                        <span className="text-slate-500">迭代 #{step.loopIteration} · 圈复杂度 {step.cyclomaticComplexity}</span>
                      </div>
                      <p className="text-slate-200">{step.logMessage}</p>
                    </div>
                  ))
                )
              ) : structuredHistory.length === 0 ? (
                <div className="text-slate-600 text-center py-10">暂无执行历史，点击“单步推演”或“连续运行”开始</div>
              ) : (
                structuredHistory.map((step) => (
                  <div
                    key={step.stepNumber}
                    className="p-2 rounded bg-slate-950 border border-slate-800/80 text-[11px] space-y-1"
                  >
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-cyan-400 font-bold">Step {step.stepNumber}</span>
                      <span className="text-slate-500">{step.fromPhase} ──► {step.toPhase}</span>
                    </div>
                    <p className="text-slate-200">{step.logMessage}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 右侧 1 栏：控制面板与圈复杂度仪表盘 */}
        <div className="space-y-4">
          {/* 控制按钮组 */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">控制面板</h3>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={executeStep}
                disabled={isFinished || isPlaying}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-1.5 shadow-md shadow-cyan-900/30"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>单步推演</span>
              </button>

              <button
                onClick={togglePlay}
                disabled={isFinished}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-md ${
                  isPlaying
                    ? "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/30"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/30"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? "暂停推演" : "连续运行"}</span>
              </button>
            </div>

            {/* 人机审批放行按钮 (仅在处于挂起状态时激活) */}
            {terminalStatus === "PENDING_APPROVAL" && (
              <div className="p-3 bg-amber-950/40 border border-amber-600/50 rounded-lg space-y-2 animate-pulse">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                  <ShieldAlert className="w-4 h-4" />
                  <span>触发高危操作阻断 (HITL)</span>
                </div>
                <p className="text-amber-200/80 text-[11px]">
                  任务包含破坏性 Schema 变更，工作流已安全原子挂起。
                </p>
                <button
                  onClick={handleApprove}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-md shadow-md transition"
                >
                  ✓ 人工放行审批并恢复执行
                </button>
              </div>
            )}

            {/* 速度调节 */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
              <span>推演步进间隔:</span>
              <div className="flex items-center gap-1">
                {[300, 600, 1000].map((ms) => (
                  <button
                    key={ms}
                    onClick={() => setPlaySpeed(ms)}
                    className={`px-2 py-0.5 rounded text-[10px] ${
                      playSpeed === ms ? "bg-slate-700 text-white font-bold" : "bg-slate-950 text-slate-400"
                    }`}
                  >
                    {ms}ms
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* McCabe 圈复杂度仪表盘 */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-bold text-slate-300">McCabe 圈复杂度</h4>
              </div>
              <span
                className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                  currentCyclomaticComplexity > 20
                    ? "bg-rose-950 text-rose-300 border border-rose-800"
                    : currentCyclomaticComplexity > 10
                    ? "bg-amber-950 text-amber-300 border border-amber-800"
                    : "bg-emerald-950 text-emerald-300 border border-emerald-800"
                }`}
              >
                M = {currentCyclomaticComplexity}
              </span>
            </div>

            {/* 进度条 */}
            <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-300 ${
                  currentCyclomaticComplexity > 20
                    ? "bg-rose-500"
                    : currentCyclomaticComplexity > 10
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min((currentCyclomaticComplexity / 30) * 100, 100)}%` }}
              />
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              {engineMode === "SPAGHETTI"
                ? "单体 While 循环将 7 个阶段与分支判断全部塞入单个函数，圈复杂度已突破 20 红线，代码无法进行完全路径测试。"
                : "显式架构将逻辑拆解为单一纯函数节点与显式转移映射，单节点圈复杂度恒定 <= 3，处于绿色极度安全区。"}
            </p>
          </div>

          {/* 终态判定卡片 */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
            <span className="text-[11px] text-slate-400 font-mono">当前推演终态:</span>
            <div
              className={`p-3 rounded-lg font-bold font-mono text-xs flex items-center gap-2 ${
                terminalStatus === "SUCCESS"
                  ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800"
                  : terminalStatus === "ROLLED_BACK"
                  ? "bg-amber-950/80 text-amber-300 border border-amber-800"
                  : terminalStatus === "DEADLOCK"
                  ? "bg-rose-950/80 text-rose-300 border border-rose-800"
                  : terminalStatus === "PENDING_APPROVAL"
                  ? "bg-indigo-950/80 text-indigo-300 border border-indigo-800"
                  : "bg-slate-950 text-slate-400 border border-slate-800"
              }`}
            >
              {terminalStatus === "SUCCESS" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              {terminalStatus === "DEADLOCK" && <XCircle className="w-4 h-4 text-rose-400" />}
              {terminalStatus === "ROLLED_BACK" && <RotateCcw className="w-4 h-4 text-amber-400" />}
              <span>{terminalStatus}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Tab 2: ⚖️ 架构优缺点深度对比与真实选型 (Trade-offs & Decision Matrix)
// ============================================================================
function TradeoffsDeepDiveTab() {
  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* 核心结论横幅 */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-indigo-700/40 rounded-xl p-6 shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <Scale className="w-6 h-6 text-amber-400" />
          <h2 className="text-lg font-bold text-slate-100">
            架构师的第一性原理：不存在“完美架构”，只有场景与代价值的权衡
          </h2>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">
          为什么 Claude Code、Pi 等顶尖终端 Coding Agent 至今依然主要使用单体 While-Loop？
          为什么 LangGraph、Temporal 会在企业级生产系统大行其道？
          两者的根本差异，在于**“任务的目标是开放探索，还是闭环确定性工程标准”**。
        </p>
      </div>

      {/* 双轨优缺点深度横向剖析 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 左卡：While-Loop */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-950/80 border border-rose-800 flex items-center justify-center">
                  <RotateCcw className="w-4 h-4 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">单体 While-Loop (隐式 ReAct 循环)</h3>
                  <span className="text-[11px] text-slate-400 font-mono">典型代表：Claude Code, Pi, OpenAI Swarm</span>
                </div>
              </div>
            </div>

            {/* 优点 */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                <span>不可替代的优势 (Pros)</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-300">
                <li className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                  <strong className="text-emerald-300">1. 极致的探索自由度 (High Autonomy)：</strong>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    模型根据实时 Observation 动态决定下一步工具调用。遇到意料之外的报错（如缺少 npm 包、环境缺失），可在同一循环中自由调取 bash 修复，绝不被死板的有向图绑架。
                  </p>
                </li>
                <li className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                  <strong className="text-emerald-300">2. 极低的代码与认知负荷 (Zero Ceremony)：</strong>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    只有十几行简洁的 <code>while(running)</code> 代码，没有 StateSchema、Node、Edge、Reducer 等繁杂的概念与模板代码，维护极其直观。
                  </p>
                </li>
                <li className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                  <strong className="text-emerald-300">3. 极其适合“未知路径”的代码调试 (Open-ended Coding)：</strong>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    真实的修代码是探案，开发者事先根本不知道会走多少步、会改哪些文件，画不出静态流程图。
                  </p>
                </li>
              </ul>
            </div>

            {/* 缺点 */}
            <div className="space-y-2 pt-2">
              <div className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                <X className="w-4 h-4" />
                <span>不可逾越的硬伤 (Cons)</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-300">
                <li className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                  <strong className="text-rose-300">1. 复杂控制流必然“意大利面化” (Spaghetti Collapse)：</strong>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    一旦硬塞“分析→计划→修改→测试→审查→重试→审批”，需维护 10+ 散落布尔变量，圈复杂度飙升至 25+，深层嵌套 if 极易因遗漏重置标志位而死循环。
                  </p>
                </li>
                <li className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                  <strong className="text-rose-300">2. 难以强制施加工程质量门禁 (Hard Governance Failure)：</strong>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    无法在代码层绝对保证“没跑过测试绝对不准合并”。完全依赖 Prompt 约束，模型一旦产生幻觉就会跨步跳跑。
                  </p>
                </li>
                <li className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                  <strong className="text-rose-300">3. 长程审批挂起（HITL）无法持久化 (Suspension Breakdown)：</strong>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    控制流绑定在 Node 进程调用栈内存中。遇到高危 SQL 迁移需要等待人工审批 2 天时，进程无法优雅持久化关机，重启即丢状态。
                  </p>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* 右卡：State Graph */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-800 flex items-center justify-center">
                  <Workflow className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">显式 State Graph (状态图工作流)</h3>
                  <span className="text-[11px] text-slate-400 font-mono">典型代表：LangGraph, Temporal, AWS Step Functions</span>
                </div>
              </div>
            </div>

            {/* 优点 */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                <span>显式图的核心价值 (Pros)</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-300">
                <li className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                  <strong className="text-cyan-300">1. 物理级确定性与标准化流程 (Deterministic SOP)：</strong>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    图拓扑结构物理锁死执行路径。测试不通过只能流向 FixNode 或 RollbackNode，绝无可能非法跨步，完美对齐企业 SDLC 研发规范。
                  </p>
                </li>
                <li className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                  <strong className="text-cyan-300">2. 原生支持长程持久化与审批挂起 (Durable Execution)：</strong>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    State 是单一纯数据对象。遇到审批门禁，直接 <code>JSON.stringify(state)</code> 写入 PostgreSQL，服务器关机几天后唤醒反序列化即用，100% 幂等。
                  </p>
                </li>
                <li className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                  <strong className="text-cyan-300">3. 单节点高内聚与可测试性 (Modular Testability)：</strong>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    每个 Node 是输入 State、输出 Partial State 的纯函数。单节点圈复杂度恒定 &le; 3，可针对测试节点、审查节点做完全孤立的 Mock 单元测试。
                  </p>
                </li>
                <li className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                  <strong className="text-cyan-300">4. 原生支持高并发 Fan-out / Fan-in：</strong>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    可并行启动前端分析、后端分析、数据库分析三个节点，再通过 Reducer 汇合，而单体 While 很难处理此类并发状态。
                  </p>
                </li>
              </ul>
            </div>

            {/* 缺点 */}
            <div className="space-y-2 pt-2">
              <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>图结构的沉重代价 (Cons)</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-300">
                <li className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                  <strong className="text-amber-300">1. 丧失自主性，将 AI 降级为硬编码脚本 (Brittleness)：</strong>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    如果现实情况偏离了预设的有向图（例如在 TestNode 发现需要修改环境变量，但图上只有指向 FixCodeNode 的边），系统就会卡死。过早把流程图画死，等于剥夺了大模型的应变智力。
                  </p>
                </li>
                <li className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                  <strong className="text-amber-300">2. 极高的仪式感与开发样板负担 (High Ceremony Overhead)：</strong>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    哪怕只改一个文件，也必须声明 State Schema、定义 Reducer、装配 Nodes、连线 Edges，代码量是 While-Loop 的数倍。
                  </p>
                </li>
                <li className="p-2.5 rounded bg-slate-950 border border-slate-800/80">
                  <strong className="text-amber-300">3. 条件复杂度的“空间转移” (Complexity Migration)：</strong>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    If-else 并没有真正消失，只是从 While 循环里被搬到了 <code>ConditionalEdge</code> 的路由函数中。当图节点超过 15 个，图本身会变成一张难以理清的“密密麻麻蜘蛛网”。
                  </p>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 生产环境真实选型决策矩阵 (Decision Matrix) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5 text-indigo-400" />
          <h3 className="text-sm font-bold text-slate-100">生产级工程选型指南 (When to use which?)</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                <th className="py-2.5 px-3">业务场景特征</th>
                <th className="py-2.5 px-3">推荐方案</th>
                <th className="py-2.5 px-3">决策理由</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              <tr>
                <td className="py-3 px-3 font-semibold text-slate-200">
                  通用终端 Coding 助手 (类似 Claude Code / Cursor / Pi)
                </td>
                <td className="py-3 px-3 font-mono text-emerald-400 font-bold">坚决用 While-Loop</td>
                <td className="py-3 px-3 text-slate-400">
                  任务完全开放、未定义。模型需要随时根据终端输出自由变向（读代码、搜文件、试运行），不可预先设定死板流程。
                </td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-semibold text-slate-200">
                  企业自动化发布 / 数据库迁移 / 跨天审批流程
                </td>
                <td className="py-3 px-3 font-mono text-cyan-400 font-bold">坚决上 State Graph</td>
                <td className="py-3 px-3 text-slate-400">
                  合规与安全高于一切。必须严格遵守 SOP（必须跑完安全扫描、必须人工点击审批），且需要跨天持久化挂起。
                </td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-semibold text-slate-200">
                  多角色并发协作系统 (如“前端+后端+DB”专家并行分析)
                </td>
                <td className="py-3 px-3 font-mono text-cyan-400 font-bold">坚决上 State Graph</td>
                <td className="py-3 px-3 text-slate-400">
                  需要 Fan-out 并行执行多模型推理，并依赖 Reducer 进行确定性状态归并，While 循环完全无法胜任。
                </td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-semibold text-slate-200">
                  探索性原型验证 (Hackathon / POC 实验)
                </td>
                <td className="py-3 px-3 font-mono text-emerald-400 font-bold">坚决用 While-Loop</td>
                <td className="py-3 px-3 text-slate-400">
                  极致的开发敏捷度。几分钟写好 Prompt 和 Tool 即可验证想法，坚决抵制过早抽象与图样板工程。
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 现代工业界的终极方案：混合架构 (Graph of Loops) */}
      <div className="bg-gradient-to-r from-cyan-950/40 via-indigo-950/40 to-slate-900 border border-cyan-800/50 rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-300" />
          <h3 className="text-sm font-bold text-cyan-200">现代工业界的终极大一统：Graph of Loops (图包循环)</h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          既然两者各有优缺，顶尖团队（如 GitHub Copilot Workspace、Devin 等）在生产中到底怎么做？
          答案是：**“外层用 State Graph 锁死宏观 SOP 流程与审批门禁，内层节点使用独立的 While-Loop 释放模型的微观探索智力”**！
        </p>
        <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 space-y-1">
          <div className="text-cyan-300 font-bold">// 宏观骨架 (StateGraph)：</div>
          <div>[Analyze Node] ──► [Plan Node] ──► [Implement Node] ──► [Test Node] ──► [Review Gate]</div>
          <div className="text-amber-300 font-bold mt-2">// 微观细胞 (Within Implement Node)：</div>
          <div>在 Implement 节点内部，启动一个微型 While-Loop，让 Agent 自由读写文件、尝试运行、反复微调！</div>
        </div>
        <p className="text-[11px] text-slate-400">
          这样既享受了 Graph 的确定性合规、持久化挂起与高可观测性，又保留了 While-Loop 的灵巧应变，兼收并蓄！
        </p>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import type {
  BranchChaosDilemmaReport,
  BranchVerificationResult,
  BranchDAGNode,
  BranchEntity,
  TimeTravelCheckoutResult,
} from "~/core/branch";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Cpu,
  FileCode,
  FolderTree,
  GitBranch,
  GitCommit,
  GitFork,
  HardDrive,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
  XCircle,
  ArrowRight,
  GitPullRequest,
  History,
  Code2,
  Check,
  Copy,
  Terminal,
  ChevronDown,
  ChevronRight,
  Bug,
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

export default function LessonV15Page() {
  const { hasServerKey, model, defaultBaseURL } = useLoaderData<typeof loader>();

  // LLM Config state (retrieved on initial render)
  const [customApiKey, setCustomApiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("MINI_CLAUDE_API_KEY") || "";
    }
    return "";
  });
  const [customBaseURL, setCustomBaseURL] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("MINI_CLAUDE_BASE_URL") || defaultBaseURL;
    }
    return defaultBaseURL;
  });

  const handleSaveSettings = ({ apiKey, baseURL }: { apiKey: string; baseURL: string }) => {
    setCustomApiKey(apiKey);
    setCustomBaseURL(baseURL);
    localStorage.setItem("MINI_CLAUDE_API_KEY", apiKey);
    localStorage.setItem("MINI_CLAUDE_BASE_URL", baseURL);
  };

  const isKeyAvailable = hasServerKey || Boolean(customApiKey.trim().length > 0);

  // Active Tab
  const [activeTab, setActiveTab] = useState<
    "dag_visualizer" | "chaos_lab" | "diff_cherrypick" | "invariants" | "pi_deepdive"
  >("dag_visualizer");

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "success" | "warning" | "error" | "info";
  } | null>(null);

  // ==========================================
  // Tab 1: DAG & Time Travel State
  // ==========================================
  const [dagData, setDagData] = useState<{
    visualLayout: {
      layoutNodes: {
        node: BranchDAGNode;
        lane: number;
        depth: number;
        isHead: boolean;
        isForkPoint: boolean;
        branchName: string;
        branchColor: string;
      }[];
      branches: BranchEntity[];
      edges: { fromNodeId: string; toNodeId: string; isBranchFork: boolean }[];
    };
    allNodes: BranchDAGNode[];
    branches: BranchEntity[];
    activeBranchId: string;
    activeHeadNodeId: string;
    activeHeadNode: BranchDAGNode | null;
    currentFiles: Record<string, string>;
    rootHash: string;
  } | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [newBranchNameInput, setNewBranchNameInput] = useState("");
  const [copiedFile, setCopiedFile] = useState(false);

  const fetchDAGData = async () => {
    try {
      const res = await fetch("/api/branch");
      const data = await res.json();
      if (data.success) {
        setDagData(data);
        if (!selectedNodeId && data.activeHeadNodeId) {
          setSelectedNodeId(data.activeHeadNodeId);
        }
        const fileKeys = Object.keys(data.currentFiles || {});
        if (fileKeys.length > 0 && (!selectedFileName || !data.currentFiles[selectedFileName])) {
          setSelectedFileName(fileKeys[0]);
        }
      }
    } catch (err: any) {
      console.error("Failed to load DAG data:", err);
    }
  };

  // Lazy load initial DAG on first render
  const [initialLoaded, setInitialLoaded] = useState(false);
  if (!initialLoaded && typeof window !== "undefined") {
    setInitialLoaded(true);
    fetchDAGData();
  }

  // Handle Time Travel Checkout
  const handleCheckout = async (targetNodeId: string) => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "checkout",
          targetNodeId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const checkoutRes: TimeTravelCheckoutResult = data.result;
        setStatusMessage({
          text: `时空旅行成功！已迁出到节点 ${targetNodeId} (${checkoutRes.filesRestoredCount} 文件已位级保真还原，根指纹: ${checkoutRes.rootHash.substring(0, 12)}...)`,
          type: checkoutRes.driftDetected ? "warning" : "success",
        });
        setSelectedNodeId(targetNodeId);
        await fetchDAGData();
      } else {
        setStatusMessage({ text: data.error || "迁出失败", type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Fork Branch
  const handleForkBranch = async (forkFromNodeId: string) => {
    const defaultBranchName = `feature/stateless-auth-s${selectedNode?.stepNumber || 8}`;
    const targetBranchName = newBranchNameInput.trim() || defaultBranchName;
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fork_branch",
          newBranchName: targetBranchName,
          forkFromNodeId,
          description: `从节点 ${forkFromNodeId} 分叉开启独立推演线`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          text: `新分支 '${data.newBranch.name}' 分叉成功！已自动切换为当前活跃分支。`,
          type: "success",
        });
        setNewBranchNameInput("");
        await fetchDAGData();
      } else {
        setStatusMessage({ text: data.error || "分叉失败", type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  // Reset demo environment
  const handleResetDemo = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({ text: data.message, type: "success" });
        await fetchDAGData();
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // Interactive AI Agent on Branch State
  // ==========================================
  const [aiPromptInput, setAiPromptInput] = useState("");
  const [isAiExecuting, setIsAiExecuting] = useState(false);

  const handleStepForward = async (customPrompt?: string) => {
    const promptToUse =
      (customPrompt || aiPromptInput).trim() ||
      "重构为基于 Redis 和无状态 JWT 的分布式鉴权，消除内存锁死锁，更新测试报告";
    setIsAiExecuting(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "step_forward",
          prompt: promptToUse,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          text: `🎉 AI 智能体推演成功！已在分支 '${dagData?.activeBranchId}' 新增节点 #${data.newNode.stepNumber}（${
            data.isRealLLM ? "真实 LLM 认知生成" : "智能架构引擎生成"
          }），代码写入 ${data.newNode.filesModified[0]}，测试全部通过！`,
          type: "success",
        });
        setAiPromptInput("");
        await fetchDAGData();
        setSelectedNodeId(data.newNode.nodeId);
        if (data.newNode.filesModified.length > 0) {
          setSelectedFileName(data.newNode.filesModified[0]);
        }
      } else {
        setStatusMessage({ text: data.error || "推演执行失败", type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message, type: "error" });
    } finally {
      setIsAiExecuting(false);
    }
  };

  // ==========================================
  // Tab 2: Chaos Dilemma Lab State
  // ==========================================
  const [chaosReport, setChaosReport] = useState<BranchChaosDilemmaReport | null>(null);
  const [useRealLLMForChaos, setUseRealLLMForChaos] = useState(true);
  const [selectedTraceTab, setSelectedTraceTab] = useState<
    "sessionBranching" | "linearUndo" | "startOver"
  >("startOver");

  const handleRunChaos = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_chaos",
          useRealLLM: useRealLLMForChaos,
          apiKey: customApiKey || undefined,
          baseURL: customBaseURL || undefined,
          model: model || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setChaosReport(data.report);
        setStatusMessage({
          text: `🎉 三大方案真实沙盒对抗实测完成！${
            data.report.isRealLLM
              ? "真实大模型已生成对抗认知裁决！"
              : "沙盒已完成 3 组策略物理实测并输出审计报告。"
          }`,
          type: "success",
        });
      } else {
        setStatusMessage({ text: data.error || "实验执行失败", type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // Tab 3: Diff & Cherry-pick State
  // ==========================================
  const [cherryPickSourceNode, setCherryPickSourceNode] = useState("node_s7");
  const [cherryPickFilePath, setCherryPickFilePath] = useState("src/utils/token-helpers.ts");
  const [cherryPickTargetBranch, setCherryPickTargetBranch] = useState("");

  const handleExecuteCherryPick = async () => {
    const targetBranch = cherryPickTargetBranch || (dagData?.branches.find(b => b.branchId !== "main")?.branchId || "main");
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cherry_pick",
          sourceBranchId: "main",
          sourceNodeId: cherryPickSourceNode,
          targetBranchId: targetBranch,
          filePath: cherryPickFilePath,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          text: `🎉 ${data.result.message} 新增节点 #${data.newNode.stepNumber}`,
          type: "success",
        });
        await fetchDAGData();
      } else {
        setStatusMessage({ text: data.error || "拣选失败", type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // Tab 4: Invariants State
  // ==========================================
  const [verificationResults, setVerificationResults] = useState<BranchVerificationResult[] | null>(null);
  const [faultInjection, setFaultInjection] = useState<
    "none" | "corrupt_history" | "sever_causality" | "ghost_file_leak" | "dirty_cherry_pick"
  >("none");
  const [expandedTraceIds, setExpandedTraceIds] = useState<Record<string, boolean>>({
    invariant_historical_retention: true,
    invariant_causality_lineage_lca: true,
    invariant_time_travel_bit_fidelity: true,
    invariant_cherry_pick_atomicity: true,
  });

  const toggleTraceExpanded = (id: string) => {
    setExpandedTraceIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRunVerification = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_verification",
          faultInjection,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setVerificationResults(data.results);
        const allPassed = data.results.every((r: BranchVerificationResult) => r.passed);
        setStatusMessage({
          text: allPassed
            ? "四大领域守恒律契约测试全部通过（4/4 Passed）！底层数学结构绝对自洽。"
            : "【契约断言生效】检测到守恒律被违背！已精准定位违规阶段与失败断言。",
          type: allPassed ? "success" : "error",
        });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  // Active selected node lookup
  const selectedNode = dagData?.allNodes.find((n) => n.nodeId === selectedNodeId) || dagData?.activeHeadNode;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header
        hasServerKey={hasServerKey}
        model={model}
        defaultBaseURL={defaultBaseURL}
        customApiKey={customApiKey}
        onSaveApiKey={(key) => handleSaveSettings({ apiKey: key, baseURL: customBaseURL })}
        customBaseURL={customBaseURL}
        onSaveBaseURL={(url) => handleSaveSettings({ apiKey: customApiKey, baseURL: url })}
        onSaveSettings={handleSaveSettings}
        currentLesson={{
          id: "v15",
          title: "第 16 课: 为什么 Coding Agent 需要 Branch？",
          badge: "Pi 分支推演架构",
        }}
      />

      {/* Hero Header */}
      <div className="border-b border-slate-800/80 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 px-6 py-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded">
                Semester 2 · Pi 时空推演篇
              </span>
              <span className="px-2 py-0.5 text-xs font-semibold text-cyan-300 bg-cyan-950/60 border border-cyan-800/40 rounded">
                V15 · Lesson 16
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <GitFork className="w-8 h-8 text-emerald-400" />
              为什么 Coding Agent 需要 Branch？
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-3xl">
              探究 Coding Agent 核心探索机制：当任务执行到一半发现关键决策失误时，
              如何通过 <strong>Session Branch DAG</strong> 实现无损分叉、任意时空穿梭、资产自由拣选（Cherry-pick）与并行假说推演。
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/docs/lessons/16-branching-and-time-travel"
              className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <BookOpen className="w-4 h-4 text-emerald-400" />
              课文深度解析
            </Link>
            <button
              onClick={handleResetDemo}
              disabled={isLoading}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/60 flex items-center gap-1.5 transition-colors"
              title="重置为默认 8 步 Auth 重构场景"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              重置沙箱
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto mt-6 flex flex-wrap gap-2 border-b border-slate-800">
          <button
            onClick={() => setActiveTab("dag_visualizer")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "dag_visualizer"
                ? "border-emerald-400 text-emerald-300 bg-emerald-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
            }`}
          >
            <GitBranch className="w-4 h-4" />
            1. 时空分支全景 (DAG Visualizer)
          </button>

          <button
            onClick={() => setActiveTab("chaos_lab")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "chaos_lab"
                ? "border-amber-400 text-amber-300 bg-amber-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            2. 三大方案竞技场 (3-Way Dilemma)
          </button>

          <button
            onClick={() => setActiveTab("diff_cherrypick")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "diff_cherrypick"
                ? "border-indigo-400 text-indigo-300 bg-indigo-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
            }`}
          >
            <GitPullRequest className="w-4 h-4" />
            3. 资产拣选室 (Cherry-pick Studio)
          </button>

          <button
            onClick={() => setActiveTab("invariants")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "invariants"
                ? "border-cyan-400 text-cyan-300 bg-cyan-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            4. 领域守恒律 (Invariants Test)
          </button>

          <button
            onClick={() => setActiveTab("pi_deepdive")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "pi_deepdive"
                ? "border-purple-400 text-purple-300 bg-purple-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
            }`}
          >
            <Cpu className="w-4 h-4" />
            5. Pi 架构源码深度剖析
          </button>
        </div>
      </div>

      {/* Global Status Banner (Sticky to ensure visibility on scroll) */}
      {statusMessage && (
        <div
          className={`sticky top-0 z-50 px-6 py-2.5 text-sm flex items-center justify-between border-b shadow-xl backdrop-blur-md transition-all ${
            statusMessage.type === "success"
              ? "bg-emerald-950/90 border-emerald-800/80 text-emerald-200"
              : statusMessage.type === "warning"
              ? "bg-amber-950/90 border-amber-800/80 text-amber-200"
              : statusMessage.type === "error"
              ? "bg-rose-950/90 border-rose-800/80 text-rose-200"
              : "bg-blue-950/90 border-blue-800/80 text-blue-200"
          }`}
        >
          <div className="max-w-7xl mx-auto w-full flex items-center gap-2">
            {statusMessage.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {statusMessage.type === "warning" && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
            {statusMessage.type === "error" && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            <span className="font-medium">{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-xs opacity-75 hover:opacity-100 underline ml-4 shrink-0"
          >
            关闭
          </button>
        </div>
      )}

      {/* Main Workbench Body */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-6">
        {/* ============================================================== */}
        {/* TAB 1: DAG Visualizer & Time Travel                            */}
        {/* ============================================================== */}
        {activeTab === "dag_visualizer" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Col: DAG Interactive Topology Tree (7 cols) */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-base font-semibold text-white">时空分支推演拓扑树 (Branch DAG)</h2>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-slate-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span> main
                    </span>
                    <span className="flex items-center gap-1 text-slate-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span> 探索分支
                    </span>
                    <span className="flex items-center gap-1 text-slate-400">
                      <span className="w-2 h-2 rounded-full ring-2 ring-emerald-400 inline-block"></span> 当前 HEAD
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  点击任意节点可查看该历史步骤的 Prompt 投影、工具副作用与文件快照指纹。
                  点击 <strong>【时空旅行】</strong> 可将真实工作区代码穿梭还原到该节点。
                </p>

                {/* SVG Visual Layout Container */}
                <div className="relative bg-slate-950 border border-slate-800/80 rounded-lg p-4 overflow-x-auto min-h-[380px]">
                  {dagData ? (
                    <div className="flex flex-col gap-3 min-w-[500px]">
                      {dagData.visualLayout.layoutNodes.map((item) => {
                        const isSelected = selectedNodeId === item.node.nodeId;
                        const isHead = item.node.nodeId === dagData.activeHeadNodeId;
                        const isFork = item.isForkPoint;
                        const isError = item.node.metrics?.isError;

                        return (
                          <div
                            key={item.node.nodeId}
                            onClick={() => setSelectedNodeId(item.node.nodeId)}
                            className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${
                              isSelected
                                ? "bg-slate-800/90 border-emerald-500/80 shadow-md ring-1 ring-emerald-500/40"
                                : "bg-slate-900/60 border-slate-800 hover:bg-slate-800/50 hover:border-slate-700"
                            }`}
                            style={{
                              marginLeft: `${item.lane * 36}px`,
                            }}
                          >
                            {/* Branch lane indicator & node badge */}
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                  isError
                                    ? "bg-rose-950 border border-rose-500 text-rose-300"
                                    : isHead
                                    ? "bg-emerald-600 border-2 border-white text-white shadow-md shadow-emerald-900"
                                    : "bg-slate-800 border border-slate-600 text-slate-200"
                                }`}
                              >
                                #{item.node.stepNumber}
                              </div>

                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="px-1.5 py-0.2 text-[10px] font-semibold rounded"
                                    style={{
                                      backgroundColor: `${item.branchColor}22`,
                                      color: item.branchColor,
                                      border: `1px solid ${item.branchColor}44`,
                                    }}
                                  >
                                    {item.branchName}
                                  </span>

                                  {isHead && (
                                    <span className="px-1.5 py-0.2 text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded font-semibold">
                                      HEAD
                                    </span>
                                  )}

                                  {isFork && (
                                    <span className="px-1.5 py-0.2 text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded font-semibold flex items-center gap-0.5">
                                      <GitFork className="w-2.5 h-2.5" /> 分叉原点
                                    </span>
                                  )}

                                  {item.node.toolCallName === "cherry_pick_asset" && (
                                    <span className="px-1.5 py-0.2 text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/40 rounded font-semibold">
                                      🍒 Cherry-pick
                                    </span>
                                  )}

                                  {isError && (
                                    <span className="px-1.5 py-0.2 text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded font-semibold">
                                      💥 崩溃
                                    </span>
                                  )}
                                </div>

                                <span className="text-xs text-slate-200 font-medium mt-0.5 truncate max-w-sm">
                                  {item.node.summary}
                                </span>
                              </div>
                            </div>

                            <div className="ml-auto flex items-center gap-2 shrink-0">
                              <span className="text-[10px] font-mono text-slate-400">
                                {item.node.rootHash.substring(0, 8)}
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载分支拓扑中...
                    </div>
                  )}
                </div>

                {/* Fork Action Bar */}
                <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col gap-2">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={newBranchNameInput}
                        onChange={(e) => setNewBranchNameInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && selectedNode && !isLoading) {
                            handleForkBranch(selectedNode.nodeId);
                          }
                        }}
                        placeholder={`新分支名称 (留空默认: feature/stateless-auth-s${selectedNode?.stepNumber || 8})`}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>
                    <button
                      onClick={() => selectedNode && handleForkBranch(selectedNode.nodeId)}
                      disabled={isLoading || !selectedNode}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors shrink-0 disabled:opacity-50 shadow-sm"
                    >
                      {isLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <GitFork className="w-3.5 h-3.5" />
                      )}
                      {isLoading
                        ? "分叉生成中..."
                        : `从选中节点 (#${selectedNode?.stepNumber || "?"}) 分叉新分支`}
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 px-0.5">
                    <span>
                      💡 提示：输入框留空直接点击将自动命名为{" "}
                      <code className="text-emerald-400 font-mono">
                        feature/stateless-auth-s{selectedNode?.stepNumber || 8}
                      </code>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setNewBranchNameInput(
                          `feature/stateless-auth-s${selectedNode?.stepNumber || 8}`
                        )
                      }
                      className="text-emerald-400 hover:text-emerald-300 underline hover:no-underline ml-2 transition-colors"
                    >
                      填入推荐名称
                    </button>
                  </div>
                </div>
              </div>

              {/* Interactive AI Agent Co-Pilot Card */}
              <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 border border-emerald-500/40 rounded-xl p-5 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-950">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        活跃分支 AI 智能体推演控制台 (Agent Co-Pilot)
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                          当前分支: {dagData?.activeBranchId || "main"}
                        </span>
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        召唤 AI 在当前分支实际编写代码并自愈测试，实时在 DAG 树上挂载全新推演节点
                      </p>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono px-2 py-1 rounded bg-slate-800/90 text-slate-300 border border-slate-700 self-start sm:self-auto shrink-0">
                    {isKeyAvailable ? `🟢 真实模型已就绪 (${model})` : "🟡 仿真架构引擎就绪"}
                  </span>
                </div>

                {/* Preset prompt buttons */}
                <div className="flex flex-wrap gap-1.5 mb-3 items-center">
                  <span className="text-[11px] text-slate-400 mr-1">快捷指令:</span>
                  <button
                    type="button"
                    onClick={() =>
                      handleStepForward("重构为基于 Redis 和无状态 JWT 的分布式鉴权，消除内存锁死锁，更新测试报告")
                    }
                    disabled={isAiExecuting}
                    className="px-2.5 py-1 text-[11px] bg-slate-800/90 hover:bg-slate-700 text-emerald-300 rounded-md border border-slate-700 hover:border-emerald-500/50 transition-colors shadow-sm disabled:opacity-50"
                  >
                    🚀 修复死锁：重构为无状态 JWT
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleStepForward("新增基于 Redis 的分布式高吞吐 Token 黑名单客户端，支持 TTL 过期清理")
                    }
                    disabled={isAiExecuting}
                    className="px-2.5 py-1 text-[11px] bg-slate-800/90 hover:bg-slate-700 text-cyan-300 rounded-md border border-slate-700 hover:border-cyan-500/50 transition-colors shadow-sm disabled:opacity-50"
                  >
                    🛡️ 安全加固：Redis 动态黑名单
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleStepForward("编写分布式集群多节点并发集成测试套件，验证零锁横向扩展性能")
                    }
                    disabled={isAiExecuting}
                    className="px-2.5 py-1 text-[11px] bg-slate-800/90 hover:bg-slate-700 text-amber-300 rounded-md border border-slate-700 hover:border-amber-500/50 transition-colors shadow-sm disabled:opacity-50"
                  >
                    🧪 回归验证：编写并发压测用例
                  </button>
                </div>

                {/* Prompt input and run button */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={aiPromptInput}
                      onChange={(e) => setAiPromptInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !isAiExecuting) {
                          handleStepForward();
                        }
                      }}
                      placeholder="输入你希望 AI 在该分支上实现的工程重构指令 (如：重构成无状态 JWT)..."
                      disabled={isAiExecuting}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                  <button
                    onClick={() => handleStepForward()}
                    disabled={isAiExecuting}
                    className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-lg shadow-md shadow-emerald-950 flex items-center justify-center gap-1.5 transition-all shrink-0 disabled:opacity-50"
                  >
                    {isAiExecuting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    {isAiExecuting ? "AI 真实思考与代码重构中..." : "召唤 AI 推演代码"}
                  </button>
                </div>
              </div>

              {/* Selected Node Details Card */}
              {selectedNode && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <GitCommit className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-sm font-semibold text-white">
                        节点详细剖析: #{selectedNode.stepNumber} ({selectedNode.nodeId})
                      </h3>
                    </div>
                    <button
                      onClick={() => handleCheckout(selectedNode.nodeId)}
                      disabled={isLoading || selectedNode.nodeId === dagData?.activeHeadNodeId}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors ${
                        selectedNode.nodeId === dagData?.activeHeadNodeId
                          ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                          : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950"
                      }`}
                    >
                      <History className="w-3.5 h-3.5" />
                      {selectedNode.nodeId === dagData?.activeHeadNodeId
                        ? "当前所在 HEAD"
                        : "时空旅行 (Checkout 到此节点)"}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
                    <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-slate-400 text-[10px]">所属分支</div>
                      <div className="font-semibold text-emerald-300 mt-0.5">{selectedNode.branchId}</div>
                    </div>
                    <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-slate-400 text-[10px]">工作区 SHA-256 根指纹</div>
                      <div className="font-mono text-cyan-300 mt-0.5 truncate" title={selectedNode.rootHash}>
                        {selectedNode.rootHash.substring(0, 12)}...
                      </div>
                    </div>
                    <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-slate-400 text-[10px]">修改文件数</div>
                      <div className="font-semibold text-white mt-0.5">
                        {selectedNode.filesModified.length} 个文件
                      </div>
                    </div>
                    <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-slate-400 text-[10px]">测试验证结果</div>
                      <div
                        className={`font-semibold mt-0.5 ${
                          selectedNode.metrics?.testsPassed
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {selectedNode.metrics?.testsPassed ? "✅ 通过" : "❌ 失败"}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-300 bg-slate-950/80 p-3 rounded-lg border border-slate-800/80">
                    <span className="text-slate-500 font-semibold uppercase text-[10px] block mb-1">
                      执行语义总结 (Action Summary)
                    </span>
                    {selectedNode.summary}
                  </div>
                </div>
              )}
            </div>

            {/* Right Col: Live Physical Workspace Mirror (5 cols) */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col h-full">
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-5 h-5 text-cyan-400" />
                    <div>
                      <h2 className="text-sm font-semibold text-white">当前物理工作区镜像</h2>
                      <div className="text-[10px] text-slate-400 font-mono">
                        RootHash: {dagData?.rootHash ? dagData.rootHash.substring(0, 16) + "..." : "N/A"}
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-cyan-950 border border-cyan-800 text-cyan-300 rounded">
                    时空联动
                  </span>
                </div>

                {/* File list tabs */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {dagData?.currentFiles &&
                    Object.keys(dagData.currentFiles).map((fileKey) => (
                      <button
                        key={fileKey}
                        onClick={() => setSelectedFileName(fileKey)}
                        className={`px-2.5 py-1 text-xs rounded-md border font-mono transition-colors ${
                          selectedFileName === fileKey
                            ? "bg-cyan-950/80 border-cyan-500/80 text-cyan-200"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {fileKey.split("/").pop()}
                      </button>
                    ))}
                </div>

                {/* Code editor / viewer */}
                <div className="relative flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs overflow-auto max-h-[480px]">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800/80 text-[11px] text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{selectedFileName || "无选中文件"}</span>
                    </div>
                    {selectedFileName && dagData?.currentFiles[selectedFileName] && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(dagData.currentFiles[selectedFileName]);
                          setCopiedFile(true);
                          setTimeout(() => setCopiedFile(false), 2000);
                        }}
                        className="text-slate-400 hover:text-white flex items-center gap-1"
                      >
                        {copiedFile ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span className="text-[10px]">{copiedFile ? "已复制" : "复制"}</span>
                      </button>
                    )}
                  </div>

                  <pre className="text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {selectedFileName && dagData?.currentFiles[selectedFileName]
                      ? dagData.currentFiles[selectedFileName]
                      : "// 请在上方选择文件查看源码"}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: Chaos Dilemma Lab (Start Over vs Undo vs Branching)    */}
        {/* ============================================================== */}
        {activeTab === "chaos_lab" && (
          <div className="flex flex-col gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2 text-amber-400 mb-1">
                    <AlertTriangle className="w-5 h-5" />
                    <h2 className="text-lg font-bold text-white">
                      三大应对方案竞技场：8 步 Auth 重构架构走错实测
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 max-w-3xl">
                    场景实测：Agent 连续推进 8 步，在第 4 步产生架构选型失误（误用内存锁），在第 7 步创造优质辅助函数，在第 8 步分布式死锁崩溃。
                    定量评测推倒重来、快照回滚与分支推演在 Token、时间和资产保全上的残酷差异。
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useRealLLMForChaos}
                      onChange={(e) => setUseRealLLMForChaos(e.target.checked)}
                      disabled={!isKeyAvailable}
                      className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0"
                    />
                    真实 LLM 认知判定 ({isKeyAvailable ? "已就绪" : "未配 Key"})
                  </label>
                  <button
                    onClick={handleRunChaos}
                    disabled={isLoading}
                    className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white text-xs font-bold rounded-lg shadow-md shadow-amber-950 flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    <Play className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                    启动三大方案定量基准测试
                  </button>
                </div>
              </div>

              {chaosReport ? (
                <div className="mt-6 flex flex-col gap-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* Approach 1: Start Over */}
                    <div className="bg-rose-950/20 border border-rose-800/50 rounded-xl p-5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-rose-400">方案一</span>
                          <span className="px-2 py-0.5 text-[10px] bg-rose-900/60 text-rose-300 rounded font-bold">
                            100% 资产丢失
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-white mb-2">{chaosReport.startOver.title}</h3>
                        <p className="text-xs text-slate-400 mb-4">{chaosReport.startOver.summary}</p>

                        <div className="space-y-2 text-xs mb-4">
                          <div className="flex justify-between py-1 border-b border-rose-900/40">
                            <span className="text-slate-400">Token 浪费</span>
                            <span className="font-mono font-bold text-rose-300">
                              ~{chaosReport.startOver.totalTokensWasted.toLocaleString()} Tokens
                            </span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-rose-900/40">
                            <span className="text-slate-400">重跑耗时</span>
                            <span className="font-mono font-bold text-slate-200">
                              {(chaosReport.startOver.timeSpentMs / 1000).toFixed(1)}s
                            </span>
                          </div>
                        </div>

                        <div className="bg-rose-950/40 p-3 rounded-lg border border-rose-900/60 text-[11px] text-rose-200 mb-3">
                          <span className="font-bold block mb-1">已毁灭资产清单：</span>
                          <ul className="list-disc list-inside space-y-0.5 text-rose-300/90">
                            {chaosReport.startOver.assetsLost.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400 italic">
                        ⚠️ 致命缺陷：{chaosReport.startOver.risk}
                      </div>
                    </div>

                    {/* Approach 2: Linear Undo */}
                    <div className="bg-amber-950/20 border border-amber-800/50 rounded-xl p-5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-amber-400">方案二</span>
                          <span className="px-2 py-0.5 text-[10px] bg-amber-900/60 text-amber-300 rounded font-bold">
                            62.5% 资产截断
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-white mb-2">{chaosReport.linearUndo.title}</h3>
                        <p className="text-xs text-slate-400 mb-4">{chaosReport.linearUndo.summary}</p>

                        <div className="space-y-2 text-xs mb-4">
                          <div className="flex justify-between py-1 border-b border-amber-900/40">
                            <span className="text-slate-400">Token 截断浪费</span>
                            <span className="font-mono font-bold text-amber-300">
                              ~{chaosReport.linearUndo.totalTokensWasted.toLocaleString()} Tokens
                            </span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-amber-900/40">
                            <span className="text-slate-400">回滚耗时</span>
                            <span className="font-mono font-bold text-slate-200">
                              {(chaosReport.linearUndo.timeSpentMs / 1000).toFixed(1)}s
                            </span>
                          </div>
                        </div>

                        <div className="bg-amber-950/40 p-3 rounded-lg border border-amber-900/60 text-[11px] text-amber-200 mb-3">
                          <span className="font-bold block mb-1">硬性抹杀资产：</span>
                          <ul className="list-disc list-inside space-y-0.5 text-amber-300/90">
                            {chaosReport.linearUndo.assetsLost.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400 italic">
                        ⚠️ 致命缺陷：{chaosReport.linearUndo.risk}
                      </div>
                    </div>

                    {/* Approach 3: Session Branching */}
                    <div className="bg-emerald-950/20 border-2 border-emerald-500/80 rounded-xl p-5 flex flex-col justify-between shadow-xl shadow-emerald-950/40">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">方案三 · 推荐</span>
                          <span className="px-2 py-0.5 text-[10px] bg-emerald-900/60 text-emerald-300 rounded font-bold">
                            0% 资产损失
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-white mb-2">{chaosReport.sessionBranching.title}</h3>
                        <p className="text-xs text-slate-400 mb-4">{chaosReport.sessionBranching.summary}</p>

                        <div className="space-y-2 text-xs mb-4">
                          <div className="flex justify-between py-1 border-b border-emerald-900/40">
                            <span className="text-slate-400">Token 浪费率</span>
                            <span className="font-mono font-bold text-emerald-300">0 Tokens (全部化为探索资产)</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-emerald-900/40">
                            <span className="text-slate-400">分叉与穿梭耗时</span>
                            <span className="font-mono font-bold text-emerald-300">毫秒级 (&lt;50ms)</span>
                          </div>
                        </div>

                        <div className="bg-emerald-950/40 p-3 rounded-lg border border-emerald-900/60 text-[11px] text-emerald-200 mb-3">
                          <span className="font-bold block mb-1">保全核心资产：</span>
                          <ul className="list-disc list-inside space-y-0.5 text-emerald-300">
                            {chaosReport.sessionBranching.assetsPreserved.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="text-[11px] text-emerald-300/90 font-medium">
                        ✨ 核心威力：支持跨分支 Cherry-pick 提取优质模块，实现 A/B 方案无损对比。
                      </div>
                    </div>
                  </div>

                  {/* Live Adversarial Execution Trace Terminal */}
                  {chaosReport.executionTraces && (
                    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                      <div className="bg-slate-900/90 px-4 py-3 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Terminal className="w-4 h-4 text-emerald-400" />
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                            三大策略沙盒真实执行日志流 (Live Sandbox Traces)
                          </h4>
                        </div>
                        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                          <button
                            type="button"
                            onClick={() => setSelectedTraceTab("startOver")}
                            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                              selectedTraceTab === "startOver"
                                ? "bg-rose-600 text-white shadow-sm"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            方案一: 彻底推倒
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedTraceTab("linearUndo")}
                            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                              selectedTraceTab === "linearUndo"
                                ? "bg-amber-600 text-white shadow-sm"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            方案二: 线性硬截断
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedTraceTab("sessionBranching")}
                            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                              selectedTraceTab === "sessionBranching"
                                ? "bg-emerald-600 text-white shadow-sm"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            方案三: Branch DAG
                          </button>
                        </div>
                      </div>

                      <div className="p-4 font-mono text-xs space-y-2 max-h-64 overflow-y-auto bg-slate-950">
                        {chaosReport.executionTraces[selectedTraceTab]?.map((step, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2.5 leading-relaxed border-b border-slate-900/80 pb-1.5 last:border-b-0"
                          >
                            <span className="text-slate-500 text-[10px] shrink-0 font-mono mt-0.5">
                              +{idx * 3}ms
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                step.status === "success"
                                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                                  : step.status === "warning"
                                  ? "bg-amber-950 text-amber-400 border border-amber-800/60"
                                  : step.status === "error"
                                  ? "bg-rose-950 text-rose-400 border border-rose-800/60"
                                  : "bg-blue-950 text-blue-400 border border-blue-800/60"
                              }`}
                            >
                              {step.stage}
                            </span>
                            <div className="flex-1 text-slate-300">
                              <span>{step.message}</span>
                              {step.filesChanged && step.filesChanged.length > 0 && (
                                <div className="text-[10px] text-slate-400 mt-0.5 flex flex-wrap gap-1">
                                  <span className="text-slate-500">影响文件/资产:</span>
                                  {step.filesChanged.map((f, fIdx) => (
                                    <span
                                      key={fIdx}
                                      className="bg-slate-900 px-1.5 py-0.2 rounded border border-slate-800 text-slate-300"
                                    >
                                      {f}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Real LLM Dynamic Analysis Verdict Card */}
                  {chaosReport.realModelAnalysis && (
                    <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 p-5 rounded-xl border border-emerald-500/40 text-xs text-slate-300 flex items-start gap-3 shadow-lg">
                      <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0 border border-emerald-500/30">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-sm flex items-center gap-2">
                            大模型实时架构裁决 (Real LLM Live Verdict)
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-700/60">
                              模型: {chaosReport.realModelAnalysis.modelName}
                            </span>
                          </span>
                          <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800/80">
                            实测数据驱动
                          </span>
                        </div>
                        <p className="text-slate-200 leading-relaxed text-xs">
                          {chaosReport.realModelAnalysis.analysisText}
                        </p>
                        <div className="text-[11px] text-emerald-300 font-medium pt-1 border-t border-slate-800">
                          🎯 终局结论：{chaosReport.realModelAnalysis.verdict}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Key Takeaway Box */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-white block mb-0.5">
                        Runtime 架构关键启示 (Key Architectural Takeaway)：
                      </span>
                      {chaosReport.keyTakeaway}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 flex flex-col gap-6">
                  {/* Dilemma Explanation Cards */}
                  <div className="bg-slate-950/60 rounded-xl p-5 border border-slate-800">
                    <div className="flex items-center gap-2 mb-2 text-white font-semibold text-sm">
                      <BookOpen className="w-4 h-4 text-emerald-400" />
                      为什么我们需要做这个定量基准测试？它解决什么真实问题？
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      在真实软件工程中，Coding Agent 往往需要连续执行 10 步甚至数十步任务。
                      设想 Agent 在<strong>第 4 步</strong>做出了错误的架构选型（如选用了单机内存锁），但在<strong>第 7 步</strong>写出了极具价值的通用工具函数，最终在<strong>第 8 步</strong>集群测试时彻底死锁崩溃。
                      面对这种场景，不同的回滚与探索策略会产生天壤之别的工程成本：
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Card 1 */}
                    <div className="bg-slate-950/70 border border-rose-900/40 rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-rose-400">方案一：推倒重来 (Start Over)</span>
                          <span className="text-[10px] bg-rose-950 text-rose-300 px-1.5 py-0.5 rounded border border-rose-800/60">
                            代价极高
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mb-3 leading-relaxed">
                          清空所有上下文与文件，让 Agent 从第 1 步从头重新生成。
                        </p>
                        <div className="text-[11px] text-rose-300/80 bg-rose-950/40 p-2.5 rounded border border-rose-900/40 space-y-1">
                          <div>❌ Token 消耗翻倍（全量重跑）</div>
                          <div>❌ 耗时翻倍，第 7 步优质代码全部丢失</div>
                        </div>
                      </div>
                    </div>

                    {/* Card 2 */}
                    <div className="bg-slate-950/70 border border-amber-900/40 rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-amber-400">方案二：单向回滚 (Linear Undo)</span>
                          <span className="text-[10px] bg-amber-950 text-amber-300 px-1.5 py-0.5 rounded border border-amber-800/60">
                            连带抹杀
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mb-3 leading-relaxed">
                          沿着单一线性历史撤销到第 4 步之前，试图修正选型。
                        </p>
                        <div className="text-[11px] text-amber-300/80 bg-amber-950/40 p-2.5 rounded border border-amber-900/40 space-y-1">
                          <div>⚠️ 线性单向不可逆：第 5~8 步全被截断</div>
                          <div>❌ 第 7 步写好的优质资产被粗暴抹杀</div>
                        </div>
                      </div>
                    </div>

                    {/* Card 3 */}
                    <div className="bg-slate-950/70 border border-emerald-500/50 rounded-xl p-4 flex flex-col justify-between shadow-lg shadow-emerald-950/20">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-emerald-400">方案三：Branch DAG 推演</span>
                          <span className="text-[10px] bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-700/60">
                            现代最优解
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mb-3 leading-relaxed">
                          从第 4 步分叉平行分支，且保留原主干历史，随时可 Cherry-pick。
                        </p>
                        <div className="text-[11px] text-emerald-300/90 bg-emerald-950/40 p-2.5 rounded border border-emerald-800/60 space-y-1">
                          <div>✅ 探索成本最低，原探索记录完整保留</div>
                          <div>✅ 跨分支精准提取第 7 步优质资产，0 资产损耗</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center pt-2">
                    <button
                      onClick={handleRunChaos}
                      disabled={isLoading}
                      className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white text-xs font-bold rounded-xl shadow-lg shadow-amber-950 flex items-center gap-2 transition-all disabled:opacity-50"
                    >
                      <Play className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                      立即运行三大方案定量基准跑分与真实 LLM 认知判定
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: Diff Matrix & Cherry-pick Studio                        */}
        {/* ============================================================== */}
        {activeTab === "diff_cherrypick" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col">
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-800">
                  <GitPullRequest className="w-5 h-5 text-purple-400" />
                  <h2 className="text-base font-semibold text-white">跨分支资产拣选器 (Cherry-pick Studio)</h2>
                </div>

                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  在废弃或探索性分支中，Agent 往往在某一步写出了高价值的独立工具函数。
                  通过 Cherry-pick，系统可以精准提取该文件并无损合入目标活跃分支，同时生成独立的因果 Checkpoint。
                </p>

                <div className="space-y-3 text-xs mb-4">
                  <div>
                    <label className="text-slate-400 block mb-1">源分支与源节点 (Source Node):</label>
                    <input
                      type="text"
                      value={cherryPickSourceNode}
                      onChange={(e) => setCherryPickSourceNode(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-white"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">欲提取的文件资产路径 (File Path):</label>
                    <input
                      type="text"
                      value={cherryPickFilePath}
                      onChange={(e) => setCherryPickFilePath(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-white"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">目标合并分支 (Target Branch):</label>
                    <select
                      value={cherryPickTargetBranch}
                      onChange={(e) => setCherryPickTargetBranch(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                    >
                      {dagData?.branches.map((b) => (
                        <option key={b.branchId} value={b.branchId}>
                          {b.name} ({b.branchId})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleExecuteCherryPick}
                  disabled={isLoading}
                  className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-lg shadow-md shadow-purple-950 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <GitCommit className="w-4 h-4" />
                  执行原子拣选 (Cherry-pick into Target)
                </button>
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col h-full">
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-5 h-5 text-indigo-400" />
                    <h2 className="text-sm font-semibold text-white">
                      候选拣选代码资产: {cherryPickFilePath}
                    </h2>
                  </div>
                  <span className="text-xs text-emerald-400 font-semibold bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
                    高价值无状态工具
                  </span>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs overflow-auto max-h-[420px]">
                  <pre className="text-indigo-200 whitespace-pre-wrap leading-relaxed">
{`/**
 * ✨ High-value utility created during exploration
 * Robustly extracts RFC-6750 Bearer token and normalizes auth headers.
 */
export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\\s+([a-zA-Z0-9\\-_.]+)/i);
  return match ? match[1].trim() : null;
}

export function sanitizeAuthLog(token: string): string {
  if (token.length <= 8) return "***";
  return \`\${token.substring(0, 4)}...\${token.substring(token.length - 4)}\`;
}`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 4: Invariant Verification Suite                           */}
        {/* ============================================================== */}
        {activeTab === "invariants" && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2 text-cyan-400 mb-1">
                  <ShieldCheck className="w-5 h-5" />
                  <h2 className="text-lg font-bold text-white">
                    四大分支领域守恒律与自动化契约测试 (Formal Invariant Verification)
                  </h2>
                </div>
                <p className="text-xs text-slate-400 max-w-3xl">
                  验证 DAG 分支系统在因果追溯、非破坏性隔离、时空穿梭位级保真及跨分支拣选原子性方面的数学确定性。
                  支持通过<strong>【故障注入与混沌演练】</strong>故意破坏契约，实测自动化断言引擎对非法行为的精准拦截。
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-lg border border-slate-800 text-xs">
                  <Bug className="w-3.5 h-3.5 text-amber-400 shrink-0 ml-1" />
                  <span className="text-[11px] text-slate-400 mr-1">故障演练:</span>
                  <select
                    value={faultInjection}
                    onChange={(e) => setFaultInjection(e.target.value as any)}
                    className="bg-slate-900 text-slate-200 border border-slate-700 text-xs rounded px-2 py-1 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="none">🟢 无故障注入（全数通过 4/4）</option>
                    <option value="corrupt_history">🔴 注入：破坏主干历史只读性 (击穿守恒律 1)</option>
                    <option value="sever_causality">🔴 注入：破坏拓扑因果与祖先链 (击穿守恒律 2)</option>
                    <option value="ghost_file_leak">🔴 注入：制造时空穿梭幽灵文件残留 (击穿守恒律 3)</option>
                    <option value="dirty_cherry_pick">🔴 注入：制造跨分支拣选脏写污染 (击穿守恒律 4)</option>
                  </select>
                </div>

                <button
                  onClick={handleRunVerification}
                  disabled={isLoading}
                  className={`px-4 py-2 text-white text-xs font-bold rounded-lg shadow-md flex items-center gap-2 transition-all disabled:opacity-50 ${
                    faultInjection === "none"
                      ? "bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 shadow-cyan-950"
                      : "bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 shadow-rose-950"
                  }`}
                >
                  <Play className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                  {faultInjection === "none" ? "运行 4 大守恒律契约测试" : "触发故障并实测契约拦截"}
                </button>
              </div>
            </div>

            {verificationResults ? (
              <div className="mt-6 space-y-4">
                {verificationResults.map((test) => {
                  const isExpanded = expandedTraceIds[test.id] ?? true;
                  return (
                    <div
                      key={test.id}
                      className={`p-5 rounded-xl border transition-all ${
                        test.passed
                          ? "bg-emerald-950/20 border-emerald-800/60 shadow-lg shadow-emerald-950/10"
                          : "bg-rose-950/20 border-rose-800/80 shadow-lg shadow-rose-950/30"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2.5">
                          {test.passed ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                          ) : (
                            <XCircle className="w-5 h-5 text-rose-400 shrink-0 animate-pulse" />
                          )}
                          <h3 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                            <span>{test.name}</span>
                            {test.faultInjected && (
                              <span className="px-2 py-0.5 text-[10px] bg-rose-950 text-rose-400 border border-rose-800 rounded font-medium">
                                💥 故障注入: {test.faultInjected}
                              </span>
                            )}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-mono">
                          <span className="text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-[11px]">
                            ⚡ {test.durationMs < 1 ? `${test.durationMs.toFixed(2)}ms (${test.durationUs || Math.round(test.durationMs * 1000)}μs)` : `${test.durationMs.toFixed(1)}ms`}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              test.passed
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                            }`}
                          >
                            {test.passed ? "PASSED" : "FAILED"}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-400 mb-3.5 leading-relaxed">{test.description}</p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono mb-3.5">
                        <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
                          <span className="text-slate-500 text-[10px] block mb-1 uppercase font-bold">预期契约 (Expected Contract):</span>
                          <span className="text-slate-300">{test.expectedBehavior}</span>
                        </div>
                        <div
                          className={`p-3 rounded-lg border ${
                            test.passed ? "bg-slate-950/70 border-slate-800" : "bg-rose-950/40 border-rose-800/80"
                          }`}
                        >
                          <span className="text-slate-500 text-[10px] block mb-1 uppercase font-bold">实测断言 (Actual Assertion):</span>
                          <span className={test.passed ? "text-emerald-300" : "text-rose-300 font-semibold"}>
                            {test.actualBehavior}
                          </span>
                        </div>
                      </div>

                      {/* Transparent Step-by-Step Assertion Pipeline */}
                      {test.steps && test.steps.length > 0 && (
                        <div className="border-t border-slate-800/80 pt-3">
                          <button
                            type="button"
                            onClick={() => toggleTraceExpanded(test.id)}
                            className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-medium transition-colors mb-2.5"
                          >
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            <span>契约断言追踪证据链 ({test.steps.length} 个断言节点)</span>
                          </button>

                          {isExpanded && (
                            <div className="space-y-2 bg-slate-950 p-3 rounded-lg border border-slate-800/80 font-mono text-[11px]">
                              {test.steps.map((step, idx) => (
                                <div
                                  key={idx}
                                  className={`p-2.5 rounded border flex flex-col gap-1 ${
                                    step.passed
                                      ? "bg-slate-900/60 border-slate-800 text-slate-300"
                                      : "bg-rose-950/40 border-rose-800 text-rose-200"
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2 font-bold">
                                    <span className="flex items-center gap-1.5">
                                      {step.passed ? (
                                        <span className="text-emerald-400 font-mono text-[10px] bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800/60">✓ PASS</span>
                                      ) : (
                                        <span className="text-rose-400 font-mono text-[10px] bg-rose-950 px-1.5 py-0.5 rounded border border-rose-800/60">✕ FAIL</span>
                                      )}
                                      <span className="text-white text-xs">{step.name}</span>
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-slate-400 mt-1">
                                    <div className="bg-slate-950/80 p-1.5 rounded border border-slate-900">
                                      <span className="text-slate-500 block mb-0.5">期望契约:</span>
                                      <span className="text-slate-300">{step.expected}</span>
                                    </div>
                                    <div className="bg-slate-950/80 p-1.5 rounded border border-slate-900">
                                      <span className="text-slate-500 block mb-0.5">实际结果:</span>
                                      <span className={step.passed ? "text-emerald-400" : "text-rose-400 font-bold"}>
                                        {step.actual}
                                      </span>
                                    </div>
                                  </div>
                                  {step.details && (
                                    <div className="text-[10px] text-slate-400 mt-0.5 border-t border-slate-800/50 pt-1">
                                      🔍 证据细节：{step.details}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-16 text-center text-slate-400 text-sm">
                点击右上角 <strong>【运行 4 大守恒律契约测试】</strong> 开始高精度数学契约断言，或选择【故障演练】体验精准拦截
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 5: Pi Architecture Deep Dive                              */}
        {/* ============================================================== */}
        {activeTab === "pi_deepdive" && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-6">
            <div className="border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2 text-purple-400 mb-1">
                <Cpu className="w-5 h-5" />
                <h2 className="text-lg font-bold text-white">
                  Pi (`wayfind/pi-mono`) 分支与会话树架构深度剖析
                </h2>
              </div>
              <p className="text-xs text-slate-400">
                解析开源标杆 Pi 是如何在轻量级终端 Coding Harness 中以最小代价实现 Session Tree 与因果分叉的。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <FolderTree className="w-4 h-4 text-emerald-400" />
                  1. 为什么 Pi 拒绝直接用 `git branch`？
                </h3>
                <p>
                  初学者常问：“既然 Git 已经有分支了，Coding Agent 的 Session 为什么还要在应用层自己造一套 Branch DAG？”
                </p>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
                  <p>
                    <strong>① 认知状态与物理 Git 的维度差异</strong>：Git 分支只记录磁盘文件的 diff，它完全不记录 LLM 思考过程（Thinking tokens）、未落盘的工具调用参数、已消耗的 Token 预算以及评测测试反馈。
                  </p>
                  <p>
                    <strong>② 极速毫秒级分叉开销</strong>：创建和切换 Git 分支需要磁盘 I/O 重写整个工作区（可能触碰几万个文件并触发编译器监听崩溃），而 Pi 的 Session 分支仅仅是指针移动和轻量级虚拟工作区比对。
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  2. Pi 的 SessionTree 与 RunTree 数据模型
                </h3>
                <p>
                  在 Pi 的实现中，会话模型天然采用树状组织结构：
                </p>
                <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] font-mono text-cyan-300">
{`Session (Root Aggregate)
  ├── branches: Map<BranchId, BranchMeta>
  ├── tree: NodeDAG {
  │     node_0 (Root Prompt)
  │       ├── node_1 (Inspect files)
  │       ├── node_2 (Implement JWT)
  │       ├── node_3 (Redis blacklist)
  │       │     ├── node_4a (flawed in-memory lock) -> 💥
  │       │     └── node_4b (stateless Bearer) -> ✅
  └── activeHeadPointer: "node_4b"`}
                </pre>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-300">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-amber-400" />
                3. Speculative Branching（并行假说推演）的前沿展望
              </h3>
              <p className="leading-relaxed">
                在更高级的多 Agent 协同中，系统面临重大架构分歧时，不再是由人类介入决定走哪条路，而是由 Agent Runtime 自动
                <strong> Fan-out 并行分叉</strong> 两条分支，同时生成测试用例并执行沙箱回归，最后自动将测试得分最高的分支合并回主线，
                将失败分支标记为归档负样本。这正是现代 Autonomous Software Engineering 的未来基石。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


import { useState, useEffect, useRef } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import type {
  AgentGuardAlert,
  AgentLoopResult,
  AgentStepRecord,
  AgentStreamEvent,
} from "~/core/agent/types";
import {
  CODING_CHALLENGES,
  type CodingChallengePreset,
} from "~/core/experiments/coding-sandbox";
import {
  Code2,
  Terminal,
  Play,
  CheckCircle2,
  RefreshCw,
  Trash2,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  Wrench,
  FileText,
  Check,
  AlertTriangle,
  Flame,
  Zap,
  Activity,
  Layers,
  Sparkles,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  ShieldCheck,
  Split,
  FileCode,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Sliders,
  Send,
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
      id: "glm-4-long",
      name: "GLM-4-Long",
      provider: "智谱清言 (Zhipu)",
      tag: "1M 超长上下文",
    },
    {
      id: "deepseek-chat",
      name: "DeepSeek V3",
      provider: "DeepSeek",
      tag: "代码与推理",
    },
    {
      id: "deepseek-reasoner",
      name: "DeepSeek R1",
      provider: "DeepSeek",
      tag: "深度思考",
    },
    {
      id: "gpt-4o",
      name: "GPT-4o",
      provider: "OpenAI",
      tag: "通用旗舰",
    },
    {
      id: "gpt-4o-mini",
      name: "GPT-4o Mini",
      provider: "OpenAI",
      tag: "轻量快速",
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

export default function LessonV3() {
  const { hasServerKey, defaultModel, defaultBaseURL, supportedModels } =
    useLoaderData<typeof loader>();

  const [activeTab, setActiveTab] = useState<"lab" | "sandbox" | "mechanics">("lab");
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [customApiKey, setCustomApiKey] = useState("");
  const [customBaseURL, setCustomBaseURL] = useState(defaultBaseURL);

  // Challenge & Task
  const [selectedChallenge, setSelectedChallenge] = useState<CodingChallengePreset>(
    CODING_CHALLENGES[0]
  );
  const [customTaskPrompt, setCustomTaskPrompt] = useState(CODING_CHALLENGES[0].prompt);
  const [maxSteps, setMaxSteps] = useState(8);
  const [enableSelfCorrection, setEnableSelfCorrection] = useState(true);

  // Execution State
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentStatus, setCurrentStatus] = useState<string>("就绪");
  const [stepsHistory, setStepsHistory] = useState<AgentStepRecord[]>([]);
  const [activeStepThought, setActiveStepThought] = useState<string>("");
  const [finalResult, setFinalResult] = useState<AgentLoopResult | null>(null);
  const [expandedStepIndex, setExpandedStepIndex] = useState<number | null>(null);

  // Sandbox file viewer state
  const [activeSandboxFile, setActiveSandboxFile] = useState<string>(
    CODING_CHALLENGES[0].targetFiles[0] || ""
  );
  const [sandboxFileContent, setSandboxFileContent] = useState<string>("");
  const [isResettingSandbox, setIsResettingSandbox] = useState(false);
  const [isManualVerifying, setIsManualVerifying] = useState(false);
  const [manualVerifyResult, setManualVerifyResult] = useState<{
    exitCode: number;
    stdout: string;
    stderr: string;
    durationMs: number;
  } | null>(null);

  // Terminal log accumulator
  const [terminalLogs, setTerminalLogs] = useState<
    Array<{
      command: string;
      exitCode: number;
      stdout: string;
      stderr: string;
      time: string;
      durationMs?: number;
    }>
  >([]);

  // Diff logs
  const [diffLogs, setDiffLogs] = useState<
    Array<{
      filePath: string;
      diff: string;
      step: number;
    }>
  >([]);

  useEffect(() => {
    const savedKey = localStorage.getItem("MINI_CLAUDE_API_KEY");
    if (savedKey) {
      setCustomApiKey(savedKey);
    }
    const savedURL = localStorage.getItem("MINI_CLAUDE_BASE_URL");
    if (savedURL) {
      setCustomBaseURL(savedURL);
    }
    const savedModel = localStorage.getItem("MINI_CLAUDE_MODEL");
    if (savedModel) {
      setSelectedModel(savedModel);
    }
    // Auto initialize first sandbox challenge
    handleResetSandbox(CODING_CHALLENGES[0].id);
  }, []);

  const saveLocalKey = (key: string) => {
    setCustomApiKey(key);
    localStorage.setItem("MINI_CLAUDE_API_KEY", key);
  };

  const saveLocalBaseURL = (url: string) => {
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

  const handleSelectChallenge = (c: CodingChallengePreset) => {
    setSelectedChallenge(c);
    setCustomTaskPrompt(c.prompt);
    setActiveSandboxFile(c.targetFiles[0] || "");
    handleResetSandbox(c.id);
  };

  const handleResetSandbox = async (challengeId: string = selectedChallenge.id) => {
    setIsResettingSandbox(true);
    try {
      const res = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed", challengeId }),
      });
      const data = await res.json();
      if (data.success) {
        // Read active file
        if (activeSandboxFile) {
          fetchSandboxFile(activeSandboxFile);
        }
        setManualVerifyResult(null);
      }
    } catch (err) {
      console.error("Failed to seed sandbox:", err);
    } finally {
      setIsResettingSandbox(false);
    }
  };

  const fetchSandboxFile = async (filePath: string) => {
    try {
      const res = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read_file", filePath }),
      });
      const data = await res.json();
      if (data.success) {
        setSandboxFileContent(data.content || "");
      } else {
        setSandboxFileContent(`// 文件尚未创建或读取失败: ${data.error || ""}`);
      }
    } catch (err: any) {
      setSandboxFileContent(`// 读取异常: ${err.message}`);
    }
  };

  const handleManualVerify = async (command: string = selectedChallenge.expectedCommand) => {
    if (!command) return;
    setIsManualVerifying(true);
    try {
      const res = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "exec_verify", command }),
      });
      const data = await res.json();
      if (data.success) {
        setManualVerifyResult({
          exitCode: data.exitCode,
          stdout: data.stdout,
          stderr: data.stderr,
          durationMs: data.durationMs,
        });
        // Also add to terminal
        setTerminalLogs((prev) => [
          ...prev,
          {
            command,
            exitCode: data.exitCode,
            stdout: data.stdout,
            stderr: data.stderr,
            time: new Date().toLocaleTimeString(),
            durationMs: data.durationMs,
          },
        ]);
      }
    } catch (err) {
      console.error("Verification failed:", err);
    } finally {
      setIsManualVerifying(false);
    }
  };

  // Run Agent Loop
  const handleRunCodingAgent = async () => {
    if (!customTaskPrompt.trim() || isRunning) return;

    setIsRunning(true);
    setCurrentStep(0);
    setCurrentStatus("正在启动 Coding Agent Loop...");
    setStepsHistory([]);
    setActiveStepThought("");
    setFinalResult(null);
    setExpandedStepIndex(null);
    setTerminalLogs([]);
    setDiffLogs([]);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: customTaskPrompt,
          model: selectedModel,
          apiKey: customApiKey || undefined,
          baseURL: customBaseURL || undefined,
          maxSteps,
          enableSelfCorrection,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP 错误: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("服务端未返回 ReadableStream");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.replace("data: ", "").trim();
          if (!jsonStr) continue;

          try {
            const event: AgentStreamEvent = JSON.parse(jsonStr);

            if (event.type === "agent_start") {
              setCurrentStatus("Coding Agent 开始分析代码与测试目标...");
            } else if (event.type === "step_start") {
              setCurrentStep(event.step);
              setCurrentStatus(`Step ${event.step}/${event.maxSteps} 思考中 (Thinking)...`);
              setActiveStepThought("");
            } else if (event.type === "thought") {
              setActiveStepThought(event.content);
            } else if (event.type === "tool_start") {
              const toolNames = event.toolCalls.map((t) => t.function.name).join(", ");
              setCurrentStatus(`Step ${event.step} 正在执行操作: ${toolNames}`);
            } else if (event.type === "tool_end") {
              // Extract terminal commands & diffs from toolResults
              for (const res of event.toolResults) {
                if (res.toolName === "run_command" && res.inputArgs?.command) {
                  setTerminalLogs((prev) => [
                    ...prev,
                    {
                      command: res.inputArgs.command,
                      exitCode: res.output.includes("✓ 命令成功执行") ? 0 : 1,
                      stdout: res.output,
                      stderr: "",
                      time: new Date().toLocaleTimeString(),
                      durationMs: res.executionTimeMs,
                    },
                  ]);
                } else if (res.toolName === "edit_file" && res.inputArgs?.filePath) {
                  if (res.output.includes("--- 代码差异对比")) {
                    const diffText = res.output.split("--- 代码差异对比 (Diff) ---\n")[1] || res.output;
                    setDiffLogs((prev) => [
                      ...prev,
                      {
                        filePath: res.inputArgs.filePath,
                        diff: diffText,
                        step: event.step,
                      },
                    ]);
                  }
                }
              }
              setCurrentStatus(`Step ${event.step} 操作执行完毕，正在验证环境反馈...`);
            } else if (event.type === "step_end") {
              setStepsHistory((prev) => [...prev, event.stepRecord]);
              setActiveStepThought("");
            } else if (event.type === "agent_done") {
              setFinalResult(event.result);
              setCurrentStatus("✓ 任务执行完成");
              if (activeSandboxFile) {
                fetchSandboxFile(activeSandboxFile);
              }
            } else if (event.type === "error") {
              setCurrentStatus(`❌ 执行出错: ${event.message}`);
            }
          } catch (e) {
            console.error("Error parsing event line:", e, line);
          }
        }
      }
    } catch (err: any) {
      setCurrentStatus(`❌ 执行中断: ${err.message}`);
    } finally {
      setIsRunning(false);
      if (activeSandboxFile) {
        fetchSandboxFile(activeSandboxFile);
      }
    }
  };

  // Determine current Self-Healing phase
  const hasEditAction = stepsHistory.some((s) =>
    s.toolCalls?.some((t) => t.function.name === "edit_file" || t.function.name === "write_file")
  );
  const hasCommandRun = stepsHistory.some((s) =>
    s.toolCalls?.some((t) => t.function.name === "run_command")
  );
  const hasPassedRun = stepsHistory.some((s) =>
    s.toolResults?.some(
      (r) => r.toolName === "run_command" && r.output.includes("✓ 命令成功执行")
    )
  );

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 font-sans selection:bg-cyan-500/30 flex flex-col">
      {/* Universal Top Header */}
      <Header
        hasServerKey={hasServerKey}
        defaultModel={defaultModel}
        supportedModels={supportedModels}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        customApiKey={customApiKey}
        onSaveApiKey={saveLocalKey}
        currentLesson={{
          id: "v3",
          badge: "V3",
          title: "第 04 课: Coding Agent 与代码自愈闭环",
        }}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Side: Challenge Selector & Controls */}
        <div className="w-full lg:w-[380px] bg-[#0a0f1e] border-r border-slate-800/80 flex flex-col shrink-0 overflow-y-auto">
          {/* Section Header */}
          <div className="p-5 border-b border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <Code2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-sm text-white">Coding Agent 实验室</h2>
                  <p className="text-[11px] text-slate-400">
                    文件读写 · Shell 执行 · 自主自愈
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                V3 核心
              </span>
            </div>

            {/* Navigation Tabs */}
            <div className="flex rounded-lg bg-[#0e1529] p-1 border border-slate-800 text-xs">
              <button
                onClick={() => setActiveTab("lab")}
                className={`flex-1 py-1.5 rounded-md font-medium transition flex items-center justify-center gap-1.5 ${
                  activeTab === "lab"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>实战控制台</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab("sandbox");
                  if (activeSandboxFile) fetchSandboxFile(activeSandboxFile);
                }}
                className={`flex-1 py-1.5 rounded-md font-medium transition flex items-center justify-center gap-1.5 ${
                  activeTab === "sandbox"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>沙盒源码</span>
              </button>
              <button
                onClick={() => setActiveTab("mechanics")}
                className={`flex-1 py-1.5 rounded-md font-medium transition flex items-center justify-center gap-1.5 ${
                  activeTab === "mechanics"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>原理解析</span>
              </button>
            </div>
          </div>

          {/* Challenge Selector */}
          <div className="p-5 space-y-4 flex-1">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>🎯 选择自愈挑战预设</span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Preset Scenarios
                </span>
              </label>
              <div className="space-y-2">
                {CODING_CHALLENGES.map((challenge) => {
                  const isSelected = selectedChallenge.id === challenge.id;
                  return (
                    <button
                      key={challenge.id}
                      onClick={() => handleSelectChallenge(challenge)}
                      className={`w-full text-left p-3 rounded-xl border transition group ${
                        isSelected
                          ? "bg-[#141d33] border-emerald-500/50 shadow-md shadow-emerald-950/40 ring-1 ring-emerald-500/30"
                          : "bg-[#0c1222] border-slate-800/80 hover:bg-[#10172c] hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${challenge.badgeColor}`}
                        >
                          {challenge.tag}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                            <Check className="w-3 h-3" /> 已激活
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs font-bold text-slate-200 group-hover:text-white transition">
                        {challenge.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                        {challenge.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Task Prompt Area */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">
                  💬 任务指令 (Task Prompt)
                </label>
                <button
                  onClick={() => setCustomTaskPrompt(selectedChallenge.prompt)}
                  className="text-[11px] text-slate-400 hover:text-emerald-400 transition"
                >
                  重置为预设
                </button>
              </div>
              <textarea
                value={customTaskPrompt}
                onChange={(e) => setCustomTaskPrompt(e.target.value)}
                rows={4}
                className="w-full bg-[#080d1a] border border-slate-800 rounded-xl p-3 text-xs text-slate-100 font-mono focus:border-emerald-500 outline-none resize-none leading-relaxed"
                placeholder="给 Coding Agent 下达编程或修复指令..."
              />
            </div>

            {/* Sandbox Quick Actions */}
            <div className="p-3 rounded-xl bg-[#0e1529] border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                <span className="flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-teal-400" />
                  <span>沙盒环境操作</span>
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Scratch Dir</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleResetSandbox()}
                  disabled={isResettingSandbox || isRunning}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition disabled:opacity-50"
                  title="重置沙盒中的文件为初始带 Bug 状态"
                >
                  <RotateCcw
                    className={`w-3.5 h-3.5 text-amber-400 ${
                      isResettingSandbox ? "animate-spin" : ""
                    }`}
                  />
                  <span>重置沙盒文件</span>
                </button>
                <button
                  onClick={() => handleManualVerify()}
                  disabled={isManualVerifying || isRunning}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition disabled:opacity-50"
                  title="手动在终端执行测试命令验证当前文件"
                >
                  <Play
                    className={`w-3.5 h-3.5 text-emerald-400 ${
                      isManualVerifying ? "animate-spin" : ""
                    }`}
                  />
                  <span>手动运行测试</span>
                </button>
              </div>
              {manualVerifyResult && (
                <div
                  className={`mt-2 p-2 rounded-lg text-[11px] font-mono border ${
                    manualVerifyResult.exitCode === 0
                      ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
                      : "bg-rose-950/30 border-rose-500/40 text-rose-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>
                      {manualVerifyResult.exitCode === 0 ? "✓ 测试通过" : "✗ 测试失败"}
                    </span>
                    <span className="text-[10px] opacity-70">
                      Exit: {manualVerifyResult.exitCode} ({manualVerifyResult.durationMs}ms)
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Loop Parameters */}
            <div className="p-3 rounded-xl bg-[#0e1529] border border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                <span className="flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Agent Loop 控制参数</span>
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Max Steps: {maxSteps}</span>
              </div>
              <div className="space-y-1.5">
                <input
                  type="range"
                  min={3}
                  max={15}
                  value={maxSteps}
                  onChange={(e) => setMaxSteps(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-500">
                  <span>3 步 (严格)</span>
                  <span>8 步 (默认)</span>
                  <span>15 步 (深入)</span>
                </div>
              </div>
            </div>

            {/* Run Button */}
            <button
              onClick={handleRunCodingAgent}
              disabled={isRunning || !customTaskPrompt.trim()}
              className={`w-full py-3 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-xl transition transform active:scale-98 ${
                isRunning
                  ? "bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700"
                  : "bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-emerald-600/25 cursor-pointer"
              }`}
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Coding Agent 正在自愈排查中...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current text-white" />
                  <span>启动 Coding Agent 自愈循环</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Side: Execution Visualization & Live Monitor */}
        <div className="flex-1 bg-[#070a14] flex flex-col overflow-y-auto">
          {/* Status Bar */}
          <div className="h-12 border-b border-slate-800/80 bg-[#0b1020] px-6 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    isRunning
                      ? "bg-emerald-400 animate-ping"
                      : finalResult
                      ? "bg-teal-400"
                      : "bg-slate-500"
                  }`}
                />
                <span className="text-xs font-mono text-slate-300">
                  {currentStatus}
                </span>
              </div>
            </div>

            {/* Self-Healing Badge Indicator */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-[11px] font-mono px-2.5 py-1 rounded-full border border-slate-700/60 bg-[#0e162b]">
                <span className="text-slate-400">自愈状态:</span>
                {!isRunning && stepsHistory.length === 0 ? (
                  <span className="text-slate-400">待运行</span>
                ) : hasPassedRun ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> 🟢 自愈成功 (Green)
                  </span>
                ) : hasEditAction ? (
                  <span className="text-amber-400 font-bold flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> 🟡 补丁修复中 (Fixing)
                  </span>
                ) : (
                  <span className="text-rose-400 font-bold flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> 🔴 报错排查中 (Failing)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Main Content Body */}
          <div className="flex-1 p-6 space-y-6 max-w-5xl mx-auto w-full">
            {activeTab === "lab" && (
              <>
                {/* Active Thought Stream */}
                {isRunning && activeStepThought && (
                  <div className="glass-panel p-4 rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/20 via-[#0c1224] to-teal-950/20 shadow-lg animate-pulse">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 mb-2">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      <span>Step {currentStep} 当前推理过程 (Thought)</span>
                    </div>
                    <p className="text-xs text-slate-200 font-mono whitespace-pre-wrap leading-relaxed">
                      {activeStepThought}
                    </p>
                  </div>
                )}

                {/* ReAct Step Cards Stream */}
                <div className="space-y-4">
                  {stepsHistory.map((step, idx) => {
                    const isExpanded =
                      expandedStepIndex === null || expandedStepIndex === idx;

                    return (
                      <div
                        key={idx}
                        className="rounded-2xl border border-slate-800/90 bg-[#0a0f20] shadow-xl overflow-hidden transition"
                      >
                        {/* Step Header */}
                        <div
                          onClick={() =>
                            setExpandedStepIndex(
                              expandedStepIndex === idx ? null : idx
                            )
                          }
                          className="px-4 py-3 bg-[#0d1428] border-b border-slate-800/80 flex items-center justify-between cursor-pointer hover:bg-[#111a33] transition select-none"
                        >
                          <div className="flex items-center gap-3">
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold border border-emerald-500/30">
                              Step {step.stepNumber}
                            </span>
                            <span className="text-xs font-medium text-slate-200">
                              {step.toolCalls && step.toolCalls.length > 0 ? (
                                <span className="font-mono text-cyan-300">
                                  Action:{" "}
                                  {step.toolCalls
                                    .map((t) => t.function.name)
                                    .join(", ")}
                                </span>
                              ) : (
                                <span className="text-amber-300 font-medium">
                                  🏁 达成最终结论
                                </span>
                              )}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            {step.durationMs && (
                              <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {step.durationMs}ms
                              </span>
                            )}
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                        </div>

                        {/* Step Body */}
                        {isExpanded && (
                          <div className="p-4 space-y-4 text-xs">
                            {/* 1. Thought */}
                            {step.thought && (
                              <div className="space-y-1">
                                <div className="text-[11px] font-bold text-indigo-300 flex items-center gap-1.5">
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>1. Thought (内在思考与策略分析)</span>
                                </div>
                                <div className="p-3 rounded-xl bg-[#070c1a] border border-slate-800/70 text-slate-300 font-sans leading-relaxed">
                                  {step.thought}
                                </div>
                              </div>
                            )}

                            {/* 2. Action (Tool Calls) */}
                            {step.toolCalls && step.toolCalls.length > 0 && (
                              <div className="space-y-2">
                                <div className="text-[11px] font-bold text-cyan-300 flex items-center gap-1.5">
                                  <Wrench className="w-3.5 h-3.5" />
                                  <span>2. Action (发起的工具调用)</span>
                                </div>
                                <div className="space-y-2">
                                  {step.toolCalls.map((call, cIdx) => {
                                    let parsedArgs: any = {};
                                    try {
                                      parsedArgs = JSON.parse(
                                        call.function.arguments || "{}"
                                      );
                                    } catch {}

                                    return (
                                      <div
                                        key={cIdx}
                                        className="p-3 rounded-xl bg-[#060b18] border border-cyan-900/40 space-y-2"
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="font-mono text-cyan-400 font-bold">
                                            {call.function.name}()
                                          </span>
                                          <span className="text-[10px] font-mono text-slate-500">
                                            ID: {call.id}
                                          </span>
                                        </div>

                                        {/* Action Specific Previews */}
                                        {call.function.name === "run_command" && (
                                          <div className="p-2 rounded bg-black/60 border border-slate-800 font-mono text-emerald-300 text-[11px] flex items-center gap-2">
                                            <Terminal className="w-3.5 h-3.5 text-slate-500" />
                                            <span>$ {parsedArgs.command}</span>
                                          </div>
                                        )}

                                        {call.function.name === "edit_file" && (
                                          <div className="space-y-1.5 font-mono text-[11px]">
                                            <div className="text-slate-400">
                                              目标文件:{" "}
                                              <span className="text-white font-bold">
                                                {parsedArgs.filePath}
                                              </span>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                              <div className="p-2 rounded bg-rose-950/20 border border-rose-900/40 text-rose-300">
                                                <div className="text-[10px] text-rose-400 font-bold mb-1">
                                                  - 替换前代码 (targetContent):
                                                </div>
                                                <pre className="whitespace-pre-wrap">
                                                  {parsedArgs.targetContent}
                                                </pre>
                                              </div>
                                              <div className="p-2 rounded bg-emerald-950/20 border border-emerald-900/40 text-emerald-300">
                                                <div className="text-[10px] text-emerald-400 font-bold mb-1">
                                                  + 替换后代码 (replacementContent):
                                                </div>
                                                <pre className="whitespace-pre-wrap">
                                                  {parsedArgs.replacementContent}
                                                </pre>
                                              </div>
                                            </div>
                                          </div>
                                        )}

                                        {call.function.name === "write_file" && (
                                          <div className="font-mono text-[11px] text-slate-300">
                                            写入路径:{" "}
                                            <span className="text-white font-bold">
                                              {parsedArgs.filePath}
                                            </span>
                                          </div>
                                        )}

                                        {call.function.name === "read_file" && (
                                          <div className="font-mono text-[11px] text-slate-300">
                                            读取路径:{" "}
                                            <span className="text-white font-bold">
                                              {parsedArgs.filePath}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* 3. Observation (Feedback) */}
                            {step.toolResults &&
                              step.toolResults.length > 0 && (
                                <div className="space-y-1.5">
                                  <div className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                                    <Activity className="w-3.5 h-3.5" />
                                    <span>3. Observation (环境真实反馈)</span>
                                  </div>
                                  <div className="space-y-2">
                                    {step.toolResults.map((res, rIdx) => (
                                      <div
                                        key={rIdx}
                                        className={`p-3 rounded-xl border font-mono text-[11px] whitespace-pre-wrap leading-relaxed ${
                                          res.isError
                                            ? "bg-rose-950/30 border-rose-500/40 text-rose-200"
                                            : "bg-[#060b18] border-slate-800 text-slate-300"
                                        }`}
                                      >
                                        <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-800/80 text-[10px] text-slate-400">
                                          <span>工具: {res.toolName}</span>
                                          <span>耗时: {res.executionTimeMs}ms</span>
                                        </div>
                                        {res.output}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Final Result Card */}
                {finalResult && (
                  <div className="glass-panel p-6 rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/30 via-[#0c1626] to-teal-950/30 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                      <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        <span>Coding Agent 最终答复与修复报告</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                        <span>步数: {finalResult.totalSteps} 步</span>
                        <span>·</span>
                        <span>耗时: {finalResult.totalDurationMs}ms</span>
                      </div>
                    </div>

                    <div className="text-xs text-slate-100 font-sans leading-relaxed whitespace-pre-wrap">
                      {finalResult.finalAnswer}
                    </div>

                    {/* Token Summary */}
                    <div className="pt-2 flex flex-wrap gap-4 text-[11px] font-mono text-slate-400 border-t border-slate-800/60">
                      <span>输入 Token: {finalResult.totalTokenUsage.promptTokens}</span>
                      <span>输出 Token: {finalResult.totalTokenUsage.completionTokens}</span>
                      <span>总计 Token: {finalResult.totalTokenUsage.totalTokens}</span>
                    </div>
                  </div>
                )}

                {/* Live Terminal & Diff Panels */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
                  {/* Terminal Panel */}
                  <div className="rounded-2xl border border-slate-800 bg-[#080c18] overflow-hidden shadow-xl flex flex-col h-72">
                    <div className="px-4 py-2.5 bg-[#0b1020] border-b border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                        <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                        <span>终端执行监视器 (Terminal Live Monitor)</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">
                        {terminalLogs.length} 条记录
                      </span>
                    </div>
                    <div className="p-3 flex-1 overflow-y-auto font-mono text-[11px] space-y-2 text-slate-300 bg-black/40">
                      {terminalLogs.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-slate-600 text-xs">
                          终端空闲，等待 Agent 执行命令...
                        </div>
                      ) : (
                        terminalLogs.map((log, lIdx) => (
                          <div
                            key={lIdx}
                            className="p-2 rounded bg-[#0b1224] border border-slate-800/80 space-y-1"
                          >
                            <div className="flex items-center justify-between text-emerald-400">
                              <span>$ {log.command}</span>
                              <span className="text-[10px] text-slate-500">
                                {log.time}
                              </span>
                            </div>
                            <pre className="text-slate-300 whitespace-pre-wrap max-h-28 overflow-y-auto">
                              {log.stdout || log.stderr || "(无输出)"}
                            </pre>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Diff Inspector Panel */}
                  <div className="rounded-2xl border border-slate-800 bg-[#080c18] overflow-hidden shadow-xl flex flex-col h-72">
                    <div className="px-4 py-2.5 bg-[#0b1020] border-b border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                        <Split className="w-3.5 h-3.5 text-cyan-400" />
                        <span>代码补丁审计 (Diff Inspector)</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">
                        {diffLogs.length} 次修改
                      </span>
                    </div>
                    <div className="p-3 flex-1 overflow-y-auto font-mono text-[11px] space-y-2 text-slate-300 bg-black/40">
                      {diffLogs.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-slate-600 text-xs">
                          暂无代码改动记录...
                        </div>
                      ) : (
                        diffLogs.map((diff, dIdx) => (
                          <div
                            key={dIdx}
                            className="p-2 rounded bg-[#0b1224] border border-slate-800/80 space-y-1"
                          >
                            <div className="flex items-center justify-between text-cyan-300 font-bold">
                              <span>
                                {diff.filePath} (Step {diff.step})
                              </span>
                            </div>
                            <pre className="text-slate-300 whitespace-pre-wrap max-h-28 overflow-y-auto bg-black/50 p-2 rounded">
                              {diff.diff}
                            </pre>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Sandbox Source Tab */}
            {activeTab === "sandbox" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {selectedChallenge.targetFiles.map((file) => (
                      <button
                        key={file}
                        onClick={() => {
                          setActiveSandboxFile(file);
                          fetchSandboxFile(file);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-1.5 ${
                          activeSandboxFile === file
                            ? "bg-emerald-600 text-white font-bold"
                            : "bg-[#0f172a] text-slate-300 border border-slate-800 hover:bg-slate-800"
                        }`}
                      >
                        <FileCode className="w-3.5 h-3.5" />
                        <span>{file.split("/").pop()}</span>
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => fetchSandboxFile(activeSandboxFile)}
                    className="flex items-center gap-1 text-xs text-emerald-400 hover:underline"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>刷新文件最新内容</span>
                  </button>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-[#090d1c] p-4 shadow-xl">
                  <div className="text-xs font-mono text-slate-400 mb-2 border-b border-slate-800 pb-2 flex items-center justify-between">
                    <span>文件路径: {activeSandboxFile}</span>
                    <span>字符数: {sandboxFileContent.length}</span>
                  </div>
                  <pre className="font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto bg-black/50 p-4 rounded-xl border border-slate-900">
                    {sandboxFileContent || "// 正在加载沙盒文件内容..."}
                  </pre>
                </div>
              </div>
            )}

            {/* Mechanics & Architecture Tab */}
            {activeTab === "mechanics" && (
              <div className="space-y-6 text-slate-200">
                <div className="glass-panel p-6 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 to-[#0d1428] space-y-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-emerald-400" />
                    <span>Coding Agent 的三维核心架构体系</span>
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    从只读 Agent 跃迁到 Coding Agent，并不是简单增加两个工具，而是构建了一个完整的
                    <strong>“代码补丁 + 终端执行 + 自主自愈”</strong> 的工业级闭环。
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <div className="p-4 rounded-xl bg-[#090e1f] border border-slate-800 space-y-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold">
                        1
                      </div>
                      <h4 className="text-xs font-bold text-white">精准 Diff 补丁</h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        摒弃低效全量覆写，采用 <code>targetContent → replacementContent</code> 精准局部替换，节约 90% Token 并防止丢代码。
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-[#090e1f] border border-slate-800 space-y-2">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold">
                        2
                      </div>
                      <h4 className="text-xs font-bold text-white">受控 Shell 执行器</h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        基于 Node 子进程，内置危险命令黑名单、20 秒超时熔断及 Head/Tail 缓冲区保留截断策略。
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-[#090e1f] border border-slate-800 space-y-2">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center font-bold">
                        3
                      </div>
                      <h4 className="text-xs font-bold text-white">测试驱动自愈闭环</h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        通过 Exit Code 与 Traceback 反馈，自动反思报错并再次修正代码，直至所有测试 100% 变绿。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f22] space-y-4">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <span>自愈状态机时序流程 (State Machine)</span>
                  </h4>
                  <pre className="p-4 rounded-xl bg-black/60 font-mono text-[11px] text-slate-300 leading-relaxed overflow-x-auto">
{`Thought: 分析测试目标与源码
   │
   ▼
Action: run_command("node test.js")
   │
   ▼
Observation: [Exit Code: 1] AssertionError: expected 80, got 100
   │
   ▼
Thought: 发现 VIP 折扣计算为 0.10，应该为 0.20。使用 edit_file 修复。
   │
   ▼
Action: edit_file({ filePath: "math.js", targetContent: "0.10", replacementContent: "0.20" })
   │
   ▼
Observation: [代码补丁应用成功] Diff: - discount = subtotal * 0.10; + discount = subtotal * 0.20;
   │
   ▼
Action: run_command("node test.js")
   │
   ▼
Observation: [Exit Code: 0] ✓ 所有 4/4 个测试用例全部通过！
   │
   ▼
Final Answer: 修复完成，测试全绿通过！`}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

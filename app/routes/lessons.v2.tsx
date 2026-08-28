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
  Layers,
  Sparkles,
  Play,
  CheckCircle2,
  RefreshCw,
  Send,
  Trash2,
  Code2,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  Eye,
  ShieldCheck,
  FileText,
  FolderTree,
  Calculator,
  Clock,
  ChevronRight,
  ChevronDown,
  Check,
  AlertTriangle,
  Flame,
  Cpu,
  Terminal,
  Activity,
  Zap,
  Info,
  ShieldAlert,
  Compass,
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

const AGENT_PRESETS = [
  {
    id: "exploration",
    tag: "多步探索",
    icon: Compass,
    title: "多步代码依赖与架构探索",
    desc: "Agent 自主调用 list_dir 与 read_file 查看 package.json，并检索 app 目录中的组件引用关系。",
    task: "请帮我查看项目 package.json 中配置了哪些核心依赖，并结合 app 目录下的结构，总结出这个 Mini Claude Code 项目的技术栈与架构特点。",
    maxSteps: 8,
  },
  {
    id: "self_correction",
    tag: "容错自愈",
    icon: RefreshCw,
    title: "工具报错与自主纠错 (Self-Correction)",
    desc: "故意请求不存在的文件，验证 Agent 收到 ENOENT 错误后在 Thought 中反思并调用 list_dir 找到正确文件。",
    task: "请帮我读取 app/services/auth.ts 的代码。如果找不到该文件，请自动列出 app 目录的所有文件结构并分析系统现有的模块划分。",
    maxSteps: 8,
  },
  {
    id: "circuit_breaker",
    tag: "熔断防护",
    icon: ShieldAlert,
    title: "死循环与重复调用熔断拦截",
    desc: "故意诱导重复调用同一工具，验证 LoopDetector 签名算法如何在 3 次重复时触发熔断保护。",
    task: "请连续调用 read_file 工具读取 package.json 文件 4 次，每次都使用完全相同的参数，不要做其他事情。",
    maxSteps: 8,
  },
  {
    id: "multi_math",
    tag: "复合计算",
    icon: Calculator,
    title: "系统信息探测与链式数值推导",
    desc: "获取系统 CPU/Node 信息，并自动将核心参数代入 calculate 工具完成复杂算术验证。",
    task: "先获取当前宿主机的系统信息（OS、Node版本），然后使用 calculate 工具计算 (2026 * 12) + 365 的精确数值，最后汇总给我。",
    maxSteps: 6,
  },
];

export default function LessonV2() {
  const { hasServerKey, defaultModel, defaultBaseURL, supportedModels } =
    useLoaderData<typeof loader>();

  const [activeTab, setActiveTab] = useState<"lab" | "chat" | "mechanics">("lab");
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [customApiKey, setCustomApiKey] = useState("");
  const [customBaseURL, setCustomBaseURL] = useState(defaultBaseURL);
  const [taskInput, setTaskInput] = useState(AGENT_PRESETS[0].task);
  const [maxSteps, setMaxSteps] = useState(8);
  const [loopThreshold, setLoopThreshold] = useState(3);
  const [enableLoopProtection, setEnableLoopProtection] = useState(true);
  const [enableSelfCorrection, setEnableSelfCorrection] = useState(true);

  // Execution State
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentStatus, setCurrentStatus] = useState<string>("就绪");
  const [stepsHistory, setStepsHistory] = useState<AgentStepRecord[]>([]);
  const [activeStepThought, setActiveStepThought] = useState<string>("");
  const [finalResult, setFinalResult] = useState<AgentLoopResult | null>(null);
  const [selectedSnapshotStep, setSelectedSnapshotStep] = useState<number | null>(null);
  const [expandedStepIndex, setExpandedStepIndex] = useState<number | null>(null);

  // Chat Mode State
  const [chatMessages, setChatMessages] = useState<
    Array<{
      id: string;
      role: "user" | "assistant";
      content: string;
      result?: AgentLoopResult;
    }>
  >([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatRunning, setIsChatRunning] = useState(false);

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

  const handleRunAgent = async (taskToRun: string = taskInput) => {
    if (!taskToRun.trim() || isRunning) return;

    setIsRunning(true);
    setCurrentStep(0);
    setCurrentStatus("正在启动 Agent Loop...");
    setStepsHistory([]);
    setActiveStepThought("");
    setFinalResult(null);
    setSelectedSnapshotStep(null);
    setExpandedStepIndex(null);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: taskToRun,
          model: selectedModel,
          apiKey: customApiKey || undefined,
          baseURL: customBaseURL || undefined,
          maxSteps,
          loopDetectThreshold: loopThreshold,
          enableLoopProtection,
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
              setCurrentStatus(`Agent 正在思考 Step 1...`);
            } else if (event.type === "step_start") {
              setCurrentStep(event.step);
              setCurrentStatus(`Step ${event.step}/${event.maxSteps} 思考中 (Thinking)...`);
              setActiveStepThought("");
            } else if (event.type === "thought") {
              setActiveStepThought(event.content);
            } else if (event.type === "tool_start") {
              setCurrentStatus(`Step ${event.step} 正在执行工具: ${event.toolCalls.map(t => t.function.name).join(", ")}`);
            } else if (event.type === "tool_end") {
              setCurrentStatus(`Step ${event.step} 工具执行完毕，正在整合环境反馈 (Observation)...`);
            } else if (event.type === "step_end") {
              setStepsHistory((prev) => [...prev, event.stepRecord]);
              setActiveStepThought("");
            } else if (event.type === "agent_done") {
              setFinalResult(event.result);
              setCurrentStatus(
                event.result.finishReason === "completed"
                  ? "✅ 任务顺利完成"
                  : event.result.finishReason === "circuit_break"
                  ? "🛡️ 触发死循环/错误熔断保护"
                  : "🛑 达到最大步数配额终止"
              );
            } else if (event.type === "error") {
              setCurrentStatus(`❌ 运行异常: ${event.message}`);
            }
          } catch (e) {
            console.error("SSE parse error", e);
          }
        }
      }
    } catch (err: any) {
      setCurrentStatus(`❌ 错误: ${err.message || String(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatRunning) return;

    const userMsg = chatInput.trim();
    setChatInput("");
    const userMsgId = `user_${Date.now()}`;
    const assistantMsgId = `assistant_${Date.now()}`;

    setChatMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: userMsg },
      { id: assistantMsgId, role: "assistant", content: "Agent 正在自主推理中..." },
    ]);

    setIsChatRunning(true);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: userMsg,
          model: selectedModel,
          apiKey: customApiKey || undefined,
          baseURL: customBaseURL || undefined,
          maxSteps,
          loopDetectThreshold: loopThreshold,
          enableLoopProtection,
          enableSelfCorrection,
        }),
      });

      if (!response.ok) {
        throw new Error("Agent API 请求失败");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalRes: AgentLoopResult | null = null;

      if (reader) {
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
              if (event.type === "agent_done") {
                finalRes = event.result;
                setChatMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? {
                          ...msg,
                          content: event.result.finalAnswer || "任务完成",
                          result: event.result,
                        }
                      : msg
                  )
                );
              }
            } catch (e) {}
          }
        }
      }
    } catch (err: any) {
      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? { ...msg, content: `执行出错: ${err.message}` }
            : msg
        )
      );
    } finally {
      setIsChatRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200">
      <Header
        hasServerKey={hasServerKey}
        defaultModel={defaultModel}
        defaultBaseURL={defaultBaseURL}
        supportedModels={supportedModels}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
        customApiKey={customApiKey}
        onSaveApiKey={saveLocalKey}
        customBaseURL={customBaseURL}
        onSaveBaseURL={saveLocalBaseURL}
        onSaveSettings={handleSaveSettings}
        currentLesson={{
          id: "v2-agent-loop",
          badge: "V2",
          title: "第 03 课: Agent Loop 与 ReAct 闭环",
        }}
      />

      {/* Sub Header / Navigation Banner */}
      <div className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="text-slate-400 hover:text-slate-200 transition flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> 课程主页
            </Link>
            <span className="text-slate-600">/</span>
            <span className="bg-amber-500/10 text-amber-400 font-mono px-2 py-0.5 rounded border border-amber-500/20">
              第 03 课 (V2)
            </span>
            <span className="text-slate-200 font-medium">
              Agent Loop 与 ReAct 闭环
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">模型:</span>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-slate-800/90 border border-slate-700 text-slate-200 rounded px-2.5 py-1 text-xs focus:outline-none focus:border-amber-500"
              >
                {supportedModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.tag})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">API Key:</span>
              <input
                type="password"
                placeholder={hasServerKey ? "使用系统内置 Key" : "sk-or-v1-..."}
                value={customApiKey}
                onChange={(e) => saveLocalKey(e.target.value)}
                className="bg-slate-800/90 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs w-36 focus:outline-none focus:border-amber-500"
              />
            </div>

            <a
              href="/docs/lessons/03-agent-loop-and-react.md"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-amber-400 hover:text-amber-300 transition"
            >
              <BookOpen className="w-3.5 h-3.5" /> 查看本课讲义
            </a>
          </div>
        </div>
      </div>

      {/* Main Tabs Header */}
      <div className="border-b border-slate-800 bg-slate-900/30">
        <div className="max-w-7xl mx-auto px-6 flex gap-8">
          <button
            onClick={() => setActiveTab("lab")}
            className={`flex items-center gap-2 py-3.5 text-sm font-medium border-b-2 transition ${
              activeTab === "lab"
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-4 h-4" /> 🔬 ReAct 闭环实验室 (Agent Workbench)
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex items-center gap-2 py-3.5 text-sm font-medium border-b-2 transition ${
              activeTab === "chat"
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Terminal className="w-4 h-4" /> 💬 连续对话智能体 (Interactive Chat)
          </button>
          <button
            onClick={() => setActiveTab("mechanics")}
            className={`flex items-center gap-2 py-3.5 text-sm font-medium border-b-2 transition ${
              activeTab === "mechanics"
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Zap className="w-4 h-4" /> ⚙️ 核心状态机原理与防御机制
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-6">
        {activeTab === "lab" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Preset Tasks & Parameters (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Preset Cards */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" /> 典型场景实验用例
                  </h3>
                  <span className="text-[11px] text-slate-500">点击自动填入</span>
                </div>

                <div className="space-y-3">
                  {AGENT_PRESETS.map((preset) => {
                    const IconComp = preset.icon;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => {
                          setTaskInput(preset.task);
                          setMaxSteps(preset.maxSteps);
                        }}
                        className="w-full text-left p-3 rounded-lg border border-slate-800/80 bg-slate-950/40 hover:border-amber-500/50 hover:bg-slate-800/40 transition group"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 font-medium text-xs text-slate-200 group-hover:text-amber-300 transition">
                            <IconComp className="w-3.5 h-3.5 text-amber-400" />
                            {preset.title}
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                            {preset.tag}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-2">
                          {preset.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Task Input & Config */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-400" /> 任务目标 (Task Prompt)
                </h3>

                <textarea
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                  rows={4}
                  placeholder="输入你想让 Agent 自主探索解决的任务..."
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition font-mono leading-relaxed"
                />

                {/* Parameters Controls */}
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800/60 text-xs">
                  <div>
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>最大步数限制:</span>
                      <span className="font-mono text-amber-400 font-bold">{maxSteps} 步</span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={12}
                      value={maxSteps}
                      onChange={(e) => setMaxSteps(Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>死循环重复阈值:</span>
                      <span className="font-mono text-amber-400 font-bold">{loopThreshold} 次</span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={5}
                      value={loopThreshold}
                      onChange={(e) => setLoopThreshold(Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Toggle Controls */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableLoopProtection}
                      onChange={(e) => setEnableLoopProtection(e.target.checked)}
                      className="rounded accent-amber-500"
                    />
                    <span>死循环熔断保护</span>
                  </label>

                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableSelfCorrection}
                      onChange={(e) => setEnableSelfCorrection(e.target.checked)}
                      className="rounded accent-amber-500"
                    />
                    <span>工具错误自愈反馈</span>
                  </label>
                </div>

                {/* Run Button */}
                <button
                  onClick={() => handleRunAgent(taskInput)}
                  disabled={isRunning || !taskInput.trim()}
                  className="w-full py-3 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40 transition active:scale-[0.99]"
                >
                  {isRunning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Agent Loop 运行中 ({currentStep}/{maxSteps})...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      启动自主 Agent Loop 运行
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right Column: Live ReAct Execution Timeline (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Real-time Status & Metrics Banner */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${isRunning ? "bg-amber-400 animate-ping" : finalResult?.success ? "bg-emerald-400" : "bg-slate-600"}`} />
                  <div>
                    <div className="text-xs font-semibold text-slate-200">
                      {currentStatus}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      State: {isRunning ? "LOOP_RUNNING" : finalResult ? finalResult.finishReason.toUpperCase() : "IDLE"}
                    </div>
                  </div>
                </div>

                {finalResult && (
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div className="bg-slate-950/60 px-2.5 py-1 rounded border border-slate-800">
                      <span className="text-slate-500">总步数: </span>
                      <span className="text-amber-400 font-bold">{finalResult.totalSteps}</span>
                    </div>
                    <div className="bg-slate-950/60 px-2.5 py-1 rounded border border-slate-800">
                      <span className="text-slate-500">耗时: </span>
                      <span className="text-cyan-400">{finalResult.totalDurationMs}ms</span>
                    </div>
                    <div className="bg-slate-950/60 px-2.5 py-1 rounded border border-slate-800">
                      <span className="text-slate-500">Token: </span>
                      <span className="text-purple-400">{finalResult.totalTokenUsage.totalTokens || "-"}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Step-by-Step ReAct Timeline */}
              <div className="space-y-4">
                {stepsHistory.map((step, idx) => {
                  const isExpanded = expandedStepIndex === idx || expandedStepIndex === null;
                  const hasToolCalls = step.toolCalls.length > 0;
                  const hasErrors = step.toolResults.some((r) => r.isError);
                  const hasAlerts = step.guardAlerts.length > 0;

                  return (
                    <div
                      key={idx}
                      className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-md transition"
                    >
                      {/* Step Header */}
                      <div
                        onClick={() =>
                          setExpandedStepIndex(
                            expandedStepIndex === idx ? -1 : idx
                          )
                        }
                        className="px-4 py-3 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between cursor-pointer hover:bg-slate-800/50 transition"
                      >
                        <div className="flex items-center gap-2 text-xs font-medium">
                          <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono font-bold">
                            Step {step.stepNumber}
                          </span>
                          <span className="text-slate-300">
                            {hasToolCalls
                              ? `调用工具: [${step.toolCalls.map((t) => t.function.name).join(", ")}]`
                              : "综合决策并输出最终答复 (Final Answer)"}
                          </span>
                          {hasErrors && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> 执行异常已捕获
                            </span>
                          )}
                          {hasAlerts && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] flex items-center gap-1 font-bold">
                              <ShieldAlert className="w-3 h-3" /> 触发防护警报
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSnapshotStep(step.stepNumber);
                            }}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center gap-1 transition"
                          >
                            <Eye className="w-3 h-3" /> 查看 Context 快照
                          </button>
                          <span className="font-mono text-[11px]">
                            {step.durationMs}ms
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 transition-transform ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      </div>

                      {/* Step Body */}
                      {isExpanded && (
                        <div className="p-4 space-y-4 text-xs font-mono">
                          {/* 1. Thought */}
                          {step.thought && (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5 text-amber-400 font-sans font-semibold">
                                <Sparkles className="w-3.5 h-3.5" /> 1. Thought (模型内在思考)
                              </div>
                              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 text-slate-300 leading-relaxed whitespace-pre-wrap font-sans text-xs">
                                {step.thought}
                              </div>
                            </div>
                          )}

                          {/* 2. Action (Tool Calls) */}
                          {hasToolCalls && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-1.5 text-cyan-400 font-sans font-semibold">
                                <Terminal className="w-3.5 h-3.5" /> 2. Action (调用工具与参数)
                              </div>
                              {step.toolCalls.map((call, cIdx) => (
                                <div
                                  key={cIdx}
                                  className="p-3 bg-slate-950/80 rounded-lg border border-cyan-500/20 space-y-1.5"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-cyan-300 font-bold">
                                      {call.function.name}
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                      ID: {call.id}
                                    </span>
                                  </div>
                                  <pre className="text-[11px] text-slate-400 overflow-x-auto">
                                    {call.function.arguments}
                                  </pre>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* 3. Observation (Tool Execution Results) */}
                          {step.toolResults.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-1.5 text-emerald-400 font-sans font-semibold">
                                <Eye className="w-3.5 h-3.5" /> 3. Observation (环境执行反馈)
                              </div>
                              {step.toolResults.map((res, rIdx) => (
                                <div
                                  key={rIdx}
                                  className={`p-3 rounded-lg border text-[11px] space-y-1 ${
                                    res.isError
                                      ? "bg-rose-950/20 border-rose-500/30 text-rose-300"
                                      : "bg-slate-950/80 border-emerald-500/20 text-slate-300"
                                  }`}
                                >
                                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                                    <span>工具: {res.toolName}</span>
                                    <span>耗时: {res.executionTimeMs}ms</span>
                                  </div>
                                  <pre className="overflow-x-auto whitespace-pre-wrap max-h-48 scrollbar-thin">
                                    {res.output}
                                  </pre>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* 4. Guard Alerts if any */}
                          {hasAlerts && (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5 text-rose-400 font-sans font-semibold">
                                <ShieldAlert className="w-3.5 h-3.5" /> 4. Guard Alert (安全防护拦截)
                              </div>
                              {step.guardAlerts.map((alert, aIdx) => (
                                <div
                                  key={aIdx}
                                  className="p-3 bg-rose-950/30 border border-rose-500/40 rounded-lg text-rose-300 text-xs font-sans"
                                >
                                  <div className="font-bold flex items-center gap-1.5 mb-1">
                                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                                    [{alert.type.toUpperCase()}] {alert.message}
                                  </div>
                                  {alert.details && (
                                    <div className="text-[11px] text-rose-400/80 font-mono">
                                      {JSON.stringify(alert.details)}
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

                {/* Active Streaming Thought Indicator */}
                {isRunning && activeStepThought && (
                  <div className="p-4 bg-slate-900/60 border border-amber-500/40 rounded-xl space-y-2 animate-pulse">
                    <div className="flex items-center gap-2 text-xs text-amber-400 font-semibold">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Step {currentStep} 正在思考中...
                    </div>
                    <div className="text-xs text-slate-300 whitespace-pre-wrap font-sans">
                      {activeStepThought}
                    </div>
                  </div>
                )}

                {/* Final Answer Banner */}
                {finalResult && (
                  <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-emerald-500/40 rounded-xl p-5 shadow-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" /> 最终答案 (Final Answer)
                      </h3>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono border border-emerald-500/20">
                        {finalResult.finishReason}
                      </span>
                    </div>
                    <div className="p-4 bg-slate-950/80 rounded-lg border border-slate-800 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                      {finalResult.finalAnswer}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Interactive Chat */}
        {activeTab === "chat" && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  全自主 Agent 会话模式
                </h3>
                <p className="text-xs text-slate-400">
                  每一条提问都会触发完整的 ReAct 循环，自主调用工具探索并给出严谨答复。
                </p>
              </div>
              <button
                onClick={() => setChatMessages([])}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 flex items-center gap-1.5 transition"
              >
                <Trash2 className="w-3.5 h-3.5" /> 清空会话
              </button>
            </div>

            {/* Chat message list */}
            <div className="space-y-4 min-h-[300px]">
              {chatMessages.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-xs">
                  暂无对话记录。在下方输入任务目标，体验多步自主 Agent 闭环！
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-4 rounded-xl border ${
                      msg.role === "user"
                        ? "bg-slate-900/90 border-slate-800 ml-12"
                        : "bg-slate-900/40 border-amber-500/20 mr-12 space-y-3"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                      <span className={msg.role === "user" ? "text-slate-300" : "text-amber-400"}>
                        {msg.role === "user" ? "👤 You" : "🤖 Mini Claude Code (Agent)"}
                      </span>
                      {msg.result && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          {msg.result.totalSteps} 步 / {msg.result.totalDurationMs}ms
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </div>

                    {/* Expandable steps summary if available */}
                    {msg.result && msg.result.steps.length > 0 && (
                      <details className="mt-2 text-[11px] text-slate-400 font-mono bg-slate-950/60 p-2.5 rounded border border-slate-800">
                        <summary className="cursor-pointer text-amber-400/80 hover:text-amber-300">
                          查看内在 {msg.result.steps.length} 轮 ReAct 思考与工具轨迹
                        </summary>
                        <div className="mt-2 space-y-2 pt-2 border-t border-slate-800">
                          {msg.result.steps.map((s, i) => (
                            <div key={i} className="space-y-1">
                              <div className="text-slate-300 font-bold">
                                Step {s.stepNumber}: {s.toolCalls.map((t) => t.function.name).join(", ") || "Final Answer"}
                              </div>
                              {s.thought && (
                                <div className="text-slate-400 pl-2 border-l border-slate-700">
                                  {s.thought}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Chat Input form */}
            <form onSubmit={handleChatSubmit} className="relative">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="给 Agent 下达多步代码排查任务..."
                disabled={isChatRunning}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 pr-12 shadow-lg"
              />
              <button
                type="submit"
                disabled={isChatRunning || !chatInput.trim()}
                className="absolute right-2 top-2 p-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white transition"
              >
                {isChatRunning ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </form>
          </div>
        )}

        {/* Tab 3: Mechanics & Defensive Engineering */}
        {activeTab === "mechanics" && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
              <h3 className="text-base font-semibold text-amber-400 flex items-center gap-2">
                <Layers className="w-5 h-5" /> Agent Loop 状态机与 ReAct 原理
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Agent Loop 不是写死的线性流程，而是一个以大模型作为**条件转移判断器**的状态机。每一轮循环都会将外部真实环境的数据反馈（Observation）作为新的上下文追加至消息链，驱动下一步的推理。
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-lg bg-slate-950/60 border border-amber-500/20 space-y-2">
                  <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" /> 1. Thought
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    模型根据当前所有上下文，自主推理任务目标、当前进度与下一步行动意图。
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-950/60 border border-cyan-500/20 space-y-2">
                  <div className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                    <Terminal className="w-4 h-4" /> 2. Action
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    模型输出标准 Tool Call JSON，Runtime 负责本地安全分发与调用执行。
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-950/60 border border-emerald-500/20 space-y-2">
                  <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Eye className="w-4 h-4" /> 3. Observation
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    工具的真实运行输出或错误信息回传给消息链，作为下一轮推理的事实依据。
                  </p>
                </div>
              </div>
            </div>

            {/* Defensive Architecture Table */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
              <h3 className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" /> 三大工业级防御机制对比
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2.5 px-3">防御机制</th>
                      <th className="py-2.5 px-3">面临风险</th>
                      <th className="py-2.5 px-3">检测与拦截算法</th>
                      <th className="py-2.5 px-3">处置策略</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    <tr>
                      <td className="py-3 px-3 font-semibold text-amber-400">步数配额 (Max Steps)</td>
                      <td className="py-3 px-3">无限探索或发散推导，耗尽 Token 额度</td>
                      <td className="py-3 px-3 font-mono">stepCounter &gt;= maxSteps</td>
                      <td className="py-3 px-3 text-slate-400">强制终止循环，返回当前已收集结论</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-3 font-semibold text-rose-400">死循环检测 (Loop Detector)</td>
                      <td className="py-3 px-3">反复调用相同参数的工具进入死胡同</td>
                      <td className="py-3 px-3 font-mono">hash(tool + sorted_args) 连续 &ge; 3 次</td>
                      <td className="py-3 px-3 text-slate-400">触发 Circuit Breaker 熔断，或注入警告提示反思</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-3 font-semibold text-cyan-400">错误自愈 (Self-Correction)</td>
                      <td className="py-3 px-3">文件不存在或参数错误导致进程崩溃</td>
                      <td className="py-3 px-3 font-mono">try-catch 捕获转为 Observation</td>
                      <td className="py-3 px-3 text-slate-400">不 crash 服务，将报错反馈给模型促成自我修正</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Context Snapshot Inspector */}
      {selectedSnapshotStep !== null && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-3xl w-full max-h-[80vh] flex flex-col shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Eye className="w-4 h-4 text-amber-400" />
                Step {selectedSnapshotStep} Context Window 消息链快照
              </div>
              <button
                onClick={() => setSelectedSnapshotStep(null)}
                className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1 bg-slate-800 rounded"
              >
                关闭
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 font-mono text-[11px]">
              {stepsHistory
                .find((s) => s.stepNumber === selectedSnapshotStep)
                ?.messagesSnapshot.map((m, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border ${
                      m.role === "system"
                        ? "bg-purple-950/20 border-purple-500/30 text-purple-300"
                        : m.role === "user"
                        ? "bg-blue-950/20 border-blue-500/30 text-blue-300"
                        : m.role === "assistant"
                        ? "bg-amber-950/20 border-amber-500/30 text-amber-300"
                        : "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
                    }`}
                  >
                    <div className="font-bold mb-1 flex items-center justify-between">
                      <span>[{idx}] Role: {m.role}</span>
                      {m.tool_call_id && (
                        <span className="text-[10px] opacity-70">
                          tool_call_id: {m.tool_call_id}
                        </span>
                      )}
                    </div>
                    <pre className="whitespace-pre-wrap overflow-x-auto">
                      {m.content ||
                        (m.tool_calls
                          ? JSON.stringify(m.tool_calls, null, 2)
                          : "")}
                    </pre>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { useLoaderData, Link } from "react-router";
import type { ChatMessage, TokenUsage } from "~/core/llm/types";
import type { ToolCallingRunResult } from "~/core/tools/types";
import { TOOL_CALLING_PRESETS } from "~/core/tools/presets";
import { Header } from "~/components/Header";
import {
  Wrench,
  Terminal,
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
  Settings,
} from "lucide-react";

export async function loader() {
  const hasServerKey = Boolean(
    process.env.OPENROUTER_API_KEY &&
      process.env.OPENROUTER_API_KEY.trim().length > 0
  );

  const defaultModel =
    process.env.DEFAULT_MODEL || "anthropic/claude-3.5-sonnet";

  const supportedModels = [
    {
      id: "openai/gpt-oss-20b",
      name: "GPT-OSS 20B",
      provider: "OpenAI/OSS",
      tag: "默认可用",
    },
    {
      id: "deepseek/deepseek-chat",
      name: "DeepSeek V3",
      provider: "DeepSeek",
      tag: "高性价比",
    },
    {
      id: "openai/gpt-4o-mini",
      name: "GPT-4o Mini",
      provider: "OpenAI",
      tag: "轻量快速",
    },
    {
      id: "meta-llama/llama-3.3-70b-instruct",
      name: "Llama 3.3 70B",
      provider: "Meta",
      tag: "开源顶尖",
    },
    {
      id: "anthropic/claude-3.5-sonnet",
      name: "Claude 3.5 Sonnet",
      provider: "Anthropic",
      tag: "推荐 (Coding / Agent)",
    },
    {
      id: "openai/gpt-4o",
      name: "GPT-4o",
      provider: "OpenAI",
      tag: "通用旗舰",
    },
    {
      id: "deepseek/deepseek-r1",
      name: "DeepSeek R1",
      provider: "DeepSeek",
      tag: "深度思考 (Reasoning)",
    },
  ];

  return {
    hasServerKey,
    defaultModel,
    supportedModels,
  };
}

const SYSTEM_PROMPT_PRESETS = [
  {
    name: "Coding Agent",
    prompt:
      "你是 Mini Claude Code (V1)，一个具备本地工具调用能力的 AI Coding Agent。善于利用 read_file、list_dir、calculate 等工具分析系统并严谨回答。",
  },
  {
    name: "极简技术专家",
    prompt:
      "你是一个极致精简的架构师，回答直接命中问题核心，不讲客套话与废话。",
  },
];

export default function LessonV1() {
  const { hasServerKey, defaultModel, supportedModels } =
    useLoaderData<typeof loader>();

  const [activeTab, setActiveTab] = useState<"lab" | "chat" | "toolbox">("lab");
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [customApiKey, setCustomApiKey] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(
    SYSTEM_PROMPT_PRESETS[0].prompt
  );

  // Chat State
  const [messages, setMessages] = useState<
    Array<
      ChatMessage & {
        usage?: TokenUsage;
        latencyMs?: number;
        toolCallsInfo?: any[];
      }
    >
  >([
    {
      role: "assistant",
      content:
        "你好！我是 Mini Claude Code (V1)。在这一课中，我已经获得了行动力（Tool Calling 机制），可以自主读取本地文件、遍历目录结构、进行精确数学运算并感知系统环境！\n\n你可以直接向我提问，例如：'帮我查看 package.json 中的 dependencies 依赖'。",
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [enableChatTools, setEnableChatTools] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [activeToolStatus, setActiveToolStatus] = useState<string | null>(null);
  const [showContextInspector, setShowContextInspector] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Tool Calling Experiment State (Lesson 2 / V1)
  const [toolPrompt, setToolPrompt] = useState(TOOL_CALLING_PRESETS[0].prompt);
  const [selectedPresetId, setSelectedPresetId] = useState(
    TOOL_CALLING_PRESETS[0].id
  );
  const [toolCallingLoading, setToolCallingLoading] = useState(false);
  const [toolCallingResult, setToolCallingResult] =
    useState<ToolCallingRunResult | null>(null);
  const [expandedStepIndex, setExpandedStepIndex] = useState<number | null>(null);

  // Sandbox Tester State
  const [sandboxTool, setSandboxTool] = useState<string>("read_file");
  const [sandboxArgsInput, setSandboxArgsInput] = useState<string>(
    JSON.stringify({ filePath: "package.json", startLine: 1, endLine: 25 }, null, 2)
  );
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<any>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent, activeToolStatus]);

  useEffect(() => {
    const savedKey = localStorage.getItem("MINI_CLAUDE_OPENROUTER_KEY");
    if (savedKey) {
      setCustomApiKey(savedKey);
    }
  }, []);

  const effectiveApiKey = customApiKey || "";
  const isKeyAvailable = hasServerKey || Boolean(effectiveApiKey);

  const saveLocalKey = (key: string) => {
    setCustomApiKey(key);
    localStorage.setItem("MINI_CLAUDE_OPENROUTER_KEY", key);
  };

  // Chat Send Handler
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isStreaming) return;

    if (!isKeyAvailable) {
      alert("请先点击右上角配置 API Key");
      return;
    }

    const newUserMessage: ChatMessage = {
      role: "user",
      content: inputMessage.trim(),
    };

    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setInputMessage("");
    setIsStreaming(true);
    setStreamContent("");
    setActiveToolStatus(null);

    const startTime = Date.now();
    let currentToolCalls: any[] = [];

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.map(({ role, content }) => ({
            role,
            content,
          })),
          model: selectedModel,
          systemPrompt,
          apiKey: effectiveApiKey,
          enableTools: enableChatTools,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let finalUsage: TokenUsage | undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        const lines = chunkText.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "").trim();
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);
              if (data.error) {
                throw new Error(data.error);
              }
              if (data.type === "tool_start") {
                currentToolCalls = data.toolCalls || [];
                const names = currentToolCalls
                  .map((t: any) => t.function?.name)
                  .join(", ");
                setActiveToolStatus(`🔧 正在执行本地工具: ${names}...`);
              } else if (data.type === "tool_end") {
                setActiveToolStatus(null);
              } else if (data.content) {
                fullText += data.content;
                setStreamContent(fullText);
              }
              if (data.usage) {
                finalUsage = data.usage;
              }
            } catch (err) {
              console.warn("Failed to parse SSE payload:", dataStr);
            }
          }
        }
      }

      const latencyMs = Date.now() - startTime;

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: fullText || "(无返回内容)",
          latencyMs,
          usage: finalUsage,
          toolCallsInfo: currentToolCalls.length > 0 ? currentToolCalls : undefined,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ 请求失败: ${err.message || "未知错误"}`,
        },
      ]);
    } finally {
      setIsStreaming(false);
      setStreamContent("");
      setActiveToolStatus(null);
    }
  };

  // Run Tool Calling Experiment
  const handleRunToolCalling = async () => {
    if (!isKeyAvailable) {
      alert("请先点击右上角配置 API Key");
      return;
    }

    setToolCallingLoading(true);
    setToolCallingResult(null);

    try {
      const res = await fetch("/api/experiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "tool_calling",
          model: selectedModel,
          apiKey: effectiveApiKey,
          userPrompt: toolPrompt,
          systemPrompt,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "实验运行失败");
      }

      setToolCallingResult(data.result);
      setExpandedStepIndex(2);
    } catch (err: any) {
      alert(`实验异常: ${err.message}`);
    } finally {
      setToolCallingLoading(false);
    }
  };

  // Run Sandbox Test
  const handleRunSandboxTest = async () => {
    setSandboxLoading(true);
    setSandboxResult(null);

    try {
      let parsed = {};
      try {
        parsed = JSON.parse(sandboxArgsInput);
      } catch (e) {
        throw new Error("参数格式错误，必须为合法的 JSON 格式");
      }

      const res = await fetch("/api/experiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "tool_direct_execute",
          toolName: sandboxTool,
          toolArgs: parsed,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "工具执行失败");
      }

      setSandboxResult(data.result);
    } catch (err: any) {
      setSandboxResult({ error: err.message });
    } finally {
      setSandboxLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#070a12] text-slate-100 font-sans selection:bg-cyan-500/30">
      <Header
        hasServerKey={hasServerKey}
        defaultModel={defaultModel}
        supportedModels={supportedModels}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        customApiKey={customApiKey}
        onSaveApiKey={saveLocalKey}
        currentLesson={{
          id: "v1",
          title: "第 02 课: Tool Calling 机制与行动力破局",
          badge: "V1",
        }}
      />

      {/* Lesson Sub-Navigation */}
      <div className="border-b border-slate-800/80 bg-[#0a0e17] px-6 flex items-center justify-between">
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => setActiveTab("lab")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === "lab"
                ? "border-cyan-500 text-cyan-300 bg-cyan-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/20"
            }`}
          >
            <Wrench className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold">🧪 Tool Calling 全链路实验室</span>
          </button>

          <button
            onClick={() => setActiveTab("chat")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === "chat"
                ? "border-indigo-500 text-indigo-300 bg-indigo-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/20"
            }`}
          >
            <Terminal className="w-4 h-4 text-indigo-400" />
            <span>💬 交互终端 (带 Tools 支持)</span>
          </button>

          <button
            onClick={() => setActiveTab("toolbox")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === "toolbox"
                ? "border-purple-500 text-purple-300 bg-purple-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/20"
            }`}
          >
            <FolderTree className="w-4 h-4 text-purple-400" />
            <span>🧰 已注册工具箱与沙箱调试</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/lessons/v0-llm-chat"
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回第 01 课</span>
          </Link>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">
        {/* TAB 1: Tool Calling Lab */}
        {activeTab === "lab" && (
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
            {/* Header Callout */}
            <div className="glass-panel p-6 rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/20 via-slate-900/40 to-indigo-950/20 shadow-xl">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  <Wrench className="w-6 h-6" />
                </div>
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white tracking-tight">
                      核心认知：模型并未调用函数，它只输出了结构化意图
                    </h2>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      Contract Negotiation
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">
                    大模型没有操作系统句柄、没有文件描述符、没有 CPU 运算单元。Tool Calling 的本质是：
                    <strong className="text-cyan-300 font-medium">
                      {" "}Runtime 将工具的 JSON Schema 作为契约发送给 LLM → LLM 生成调用意图 JSON → 本地 Runtime 安全执行 → 将 Observation 回填给 LLM 合成最终答复
                    </strong>。
                  </p>
                </div>
              </div>
            </div>

            {/* Experiment Area Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Preset Selector & Visual Step Inspector (8 Cols) */}
              <div className="lg:col-span-8 space-y-5">
                <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                      <Play className="w-4 h-4 text-cyan-400" />
                      <span>选择测试场景 (Preset) 或自定义指令</span>
                    </h3>
                  </div>

                  {/* Preset Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {TOOL_CALLING_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          setSelectedPresetId(preset.id);
                          setToolPrompt(preset.prompt);
                        }}
                        className={`text-left p-3 rounded-xl border transition flex flex-col justify-between ${
                          selectedPresetId === preset.id
                            ? "bg-cyan-950/30 border-cyan-500/50 text-cyan-200 shadow-md shadow-cyan-500/10"
                            : "bg-[#0e1422] border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-[#131b2e]"
                        }`}
                      >
                        <div className="font-semibold text-xs mb-1 flex items-center justify-between">
                          <span>{preset.title}</span>
                          {selectedPresetId === preset.id && (
                            <Check className="w-3.5 h-3.5 text-cyan-400" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-2">
                          {preset.description}
                        </p>
                      </button>
                    ))}
                  </div>

                  {/* Custom Prompt Input */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-xs font-mono text-slate-400">
                      当前用户指令 (User Prompt):
                    </label>
                    <textarea
                      value={toolPrompt}
                      onChange={(e) => {
                        setToolPrompt(e.target.value);
                        setSelectedPresetId("custom");
                      }}
                      rows={3}
                      className="w-full bg-[#111728] border border-slate-700/70 rounded-xl p-3 text-xs text-slate-100 font-mono outline-none focus:border-cyan-500 resize-none"
                      placeholder="输入你想让模型使用工具解决的问题..."
                    />
                  </div>

                  {/* Action Button */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      当前环境已注册 4 个工具: <code>read_file</code>, <code>list_dir</code>, <code>calculate</code>, <code>get_system_info</code>
                    </span>

                    <button
                      onClick={handleRunToolCalling}
                      disabled={toolCallingLoading || !toolPrompt.trim()}
                      className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-medium text-xs flex items-center gap-2 transition shadow-lg shadow-cyan-600/20 cursor-pointer"
                    >
                      {toolCallingLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>正在执行 4 步协议链路...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-current" />
                          <span>🚀 触发单轮 Tool Calling 闭环</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Step-by-Step Inspector Results */}
                {toolCallingResult && (
                  <div className="space-y-4 animate-fadeIn">
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Layers className="w-4 h-4 text-cyan-400" />
                        <span>单步执行追踪器 (Step-by-Step Inspector)</span>
                      </h3>
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                        <span>总耗时: <strong className="text-cyan-300">{toolCallingResult.totalLatencyMs}ms</strong></span>
                        {toolCallingResult.totalTokens && (
                          <span>· Token: <strong className="text-indigo-300">{toolCallingResult.totalTokens.totalTokens}</strong></span>
                        )}
                      </div>
                    </div>

                    {/* Step Cards */}
                    <div className="space-y-3">
                      {toolCallingResult.steps.map((step) => {
                        const isExpanded = expandedStepIndex === step.step;
                        const isToolCallStep = step.type === "llm_tool_call";
                        const isExecutionStep = step.type === "runtime_execution";
                        const isSynthesisStep = step.type === "llm_synthesis";

                        return (
                          <div
                            key={step.step}
                            className={`rounded-2xl border transition overflow-hidden ${
                              isToolCallStep
                                ? "border-amber-500/40 bg-[#0f1424]"
                                : isExecutionStep
                                ? "border-emerald-500/40 bg-[#0c1622]"
                                : isSynthesisStep
                                ? "border-indigo-500/40 bg-[#101328]"
                                : "border-slate-800 bg-[#0d1220]"
                            }`}
                          >
                            {/* Step Header */}
                            <div
                              onClick={() =>
                                setExpandedStepIndex(isExpanded ? null : step.step)
                              }
                              className="p-4 flex items-center justify-between cursor-pointer select-none hover:bg-white/[0.02] transition"
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={`w-6 h-6 rounded-full flex items-center justify-center font-mono font-bold text-xs ${
                                    isToolCallStep
                                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                      : isExecutionStep
                                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                      : isSynthesisStep
                                      ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                      : "bg-slate-800 text-slate-300"
                                  }`}
                                >
                                  {step.step}
                                </span>
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-100">
                                    {step.title}
                                  </h4>
                                  <p className="text-[11px] text-slate-400 mt-0.5">
                                    {step.description}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                {step.durationMs !== undefined && (
                                  <span className="text-[11px] font-mono text-slate-400 bg-black/40 px-2 py-0.5 rounded">
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

                            {/* Step Content / JSON Payload */}
                            {isExpanded && (
                              <div className="p-4 border-t border-slate-800/80 bg-black/40 text-xs font-mono">
                                <pre className="text-slate-300 overflow-x-auto p-3 bg-[#080c16] rounded-xl border border-slate-800/80 max-h-72 text-[11px]">
                                  {JSON.stringify(step.data, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Final Synthesized Answer Highlight Card */}
                    <div className="glass-panel p-5 rounded-2xl border border-indigo-500/40 bg-gradient-to-br from-indigo-950/30 via-slate-900/60 to-cyan-950/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-indigo-400" />
                          <span>大模型结合工具 Observation 输出的最终严谨答复:</span>
                        </span>
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
                          Synthesis Complete
                        </span>
                      </div>
                      <div className="p-4 rounded-xl bg-black/40 border border-indigo-500/20 text-slate-100 text-xs leading-relaxed font-sans whitespace-pre-wrap">
                        {toolCallingResult.finalAnswer}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Live Tool Registry (4 Cols) */}
              <div className="lg:col-span-4 space-y-5">
                <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                      <FolderTree className="w-4 h-4 text-cyan-400" />
                      <span>已注册工具箱 (Tool Registry)</span>
                    </h3>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300">
                      4 Tools Active
                    </span>
                  </div>

                  {/* Tool List Mini Cards */}
                  <div className="space-y-2.5">
                    {[
                      {
                        name: "read_file",
                        icon: FileText,
                        color: "text-amber-400",
                        desc: "读取项目文件内容（支持指定起始行/结束行范围切片与截断保护）",
                        defaultArgs: { filePath: "package.json", startLine: 1, endLine: 20 },
                      },
                      {
                        name: "list_dir",
                        icon: FolderTree,
                        color: "text-blue-400",
                        desc: "遍历指定目录结构（自动过滤 node_modules、.git 等无关目录）",
                        defaultArgs: { dirPath: "app", recursive: false },
                      },
                      {
                        name: "calculate",
                        icon: Calculator,
                        color: "text-emerald-400",
                        desc: "使用宿主 CPU 运算引擎计算数学算式，保证 100% 精确",
                        defaultArgs: { expression: "(145 * 89) + (1024 / 32) - 127.5" },
                      },
                      {
                        name: "get_system_info",
                        icon: Clock,
                        color: "text-purple-400",
                        desc: "获取系统当前精确时间、时区、Node.js 与操作系统环境",
                        defaultArgs: { detailLevel: "basic" },
                      },
                    ].map((tool) => {
                      const Icon = tool.icon;
                      const isSelected = sandboxTool === tool.name;
                      return (
                        <div
                          key={tool.name}
                          onClick={() => {
                            setSandboxTool(tool.name);
                            setSandboxArgsInput(
                              JSON.stringify(tool.defaultArgs, null, 2)
                            );
                            setSandboxResult(null);
                          }}
                          className={`p-3 rounded-xl border transition cursor-pointer ${
                            isSelected
                              ? "bg-slate-800/80 border-cyan-500/60 shadow-md"
                              : "bg-[#0e1422] border-slate-800 hover:border-slate-700"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <Icon className={`w-3.5 h-3.5 ${tool.color}`} />
                              <span className="font-mono font-bold text-xs text-slate-200">
                                {tool.name}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-cyan-400 underline">
                              调试
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            {tool.desc}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Sandbox Direct Execution Box */}
                  <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                        <Wrench className="w-3.5 h-3.5 text-cyan-400" />
                        <span>沙箱单点调试器: <code>{sandboxTool}</code></span>
                      </span>
                    </div>

                    <textarea
                      value={sandboxArgsInput}
                      onChange={(e) => setSandboxArgsInput(e.target.value)}
                      rows={3}
                      className="w-full bg-[#080c16] border border-slate-700/80 rounded-lg p-2 text-[11px] font-mono text-slate-200 outline-none focus:border-cyan-500"
                      placeholder="传入 JSON 参数..."
                    />

                    <button
                      onClick={handleRunSandboxTest}
                      disabled={sandboxLoading}
                      className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-medium text-xs flex items-center justify-center gap-1.5 transition border border-slate-700"
                    >
                      {sandboxLoading ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current text-cyan-400" />
                      )}
                      <span>在本地宿主环境中执行测试</span>
                    </button>

                    {sandboxResult && (
                      <div className="p-2.5 bg-black/60 rounded-lg border border-slate-800 max-h-48 overflow-y-auto text-[11px] font-mono text-slate-300">
                        <div className="text-[10px] text-slate-500 mb-1">
                          执行输出 (耗时: {sandboxResult.latencyMs || 0}ms):
                        </div>
                        <pre className="whitespace-pre-wrap">
                          {sandboxResult.output || JSON.stringify(sandboxResult, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>

                {/* Course Notes Link Card */}
                <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
                  <div className="font-semibold text-slate-200 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-400" />
                    <span>本课课件与代码归档</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    本课思考过程与完整架构图已归档在项目文档中：
                  </p>
                  <div className="space-y-1 font-mono text-[11px] text-indigo-300">
                    <div className="p-1.5 bg-[#0a0e18] rounded border border-slate-800">
                      📄 docs/lessons/02-tool-calling-mechanism.md
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Chat with Tools Playground */}
        {activeTab === "chat" && (
          <div className="flex-1 flex flex-col h-[calc(100vh-108px)]">
            {/* System Prompt Bar */}
            <div className="bg-[#0e1422] border-b border-slate-800/80 px-6 py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5 flex-1 mr-4">
                <span className="text-slate-400 font-mono flex items-center gap-1 shrink-0">
                  <Settings className="w-3.5 h-3.5 text-slate-400" />
                  System Prompt:
                </span>
                <input
                  type="text"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="bg-[#141b2e] border border-slate-700/60 rounded px-2.5 py-1 text-slate-200 w-full font-mono text-xs focus:outline-none focus:border-cyan-500"
                  placeholder="输入 System Prompt..."
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setShowContextInspector(!showContextInspector)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono border transition ${
                    showContextInspector
                      ? "bg-cyan-900/40 text-cyan-300 border-cyan-500/40"
                      : "bg-[#162035] text-slate-400 border-slate-700/50 hover:text-slate-200"
                  }`}
                >
                  <Eye className="w-3 h-3" />
                  <span>
                    Context ({messages.filter((m) => m.role !== "system").length} 条)
                  </span>
                </button>

                <button
                  onClick={() =>
                    setMessages([
                      {
                        role: "assistant",
                        content: "会话已重置。现在可以开始新的对话！",
                      },
                    ])
                  }
                  className="flex items-center gap-1 px-2 py-1 rounded bg-[#162035] hover:bg-red-950/40 text-slate-400 hover:text-red-300 border border-slate-700/50 transition text-[11px]"
                  title="清空聊天"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Chat Body & Context Inspector Side Panel */}
            <div className="flex-1 flex overflow-hidden">
              {/* Message List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${
                      msg.role === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1 text-[11px] font-mono text-slate-400 px-1">
                      <span>
                        {msg.role === "user"
                          ? "👤 User"
                          : `🤖 Assistant (${selectedModel})`}
                      </span>
                      {msg.latencyMs && (
                        <span className="text-slate-500">
                          · {msg.latencyMs}ms
                        </span>
                      )}
                      {msg.usage && (
                        <span className="px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded text-[10px]">
                          {msg.usage.totalTokens} tokens
                        </span>
                      )}
                    </div>

                    {/* Tool Calling Badges if triggered */}
                    {msg.toolCallsInfo && msg.toolCallsInfo.length > 0 && (
                      <div className="mb-1.5 flex flex-wrap gap-1.5">
                        {msg.toolCallsInfo.map((tc: any, tIdx: number) => (
                          <div
                            key={tIdx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-950/40 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono"
                          >
                            <Wrench className="w-2.5 h-2.5" />
                            <span>
                              已调用工具: <strong>{tc.function?.name}</strong>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-md ${
                        msg.role === "user"
                          ? "bg-cyan-600 text-white rounded-br-none"
                          : "glass-panel text-slate-200 border-slate-800/90 rounded-bl-none font-sans whitespace-pre-wrap"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

                {/* Streaming or Tool Execution Status */}
                {isStreaming && (
                  <div className="flex flex-col items-start space-y-1.5">
                    {activeToolStatus && (
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-mono animate-pulse">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>{activeToolStatus}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-1 text-[11px] font-mono text-cyan-400 px-1">
                      <span className="animate-pulse">🤖 正在流式生成最终回复...</span>
                    </div>
                    <div className="max-w-[85%] rounded-2xl rounded-bl-none px-4 py-3 text-sm leading-relaxed glass-panel border-cyan-500/30 text-slate-200 whitespace-pre-wrap">
                      {streamContent || (
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
                          等待模型响应...
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Context Inspector Drawer */}
              {showContextInspector && (
                <div className="w-96 border-l border-slate-800/80 bg-[#0a0e18] p-4 flex flex-col overflow-hidden text-xs">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
                    <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <Code2 className="w-4 h-4 text-cyan-400" />
                      <span>Context Inspector (实际 Payload)</span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300">
                      Payload
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px] mb-3">
                    这就是每次发送给 OpenRouter API 的真实 `messages` 数组。
                  </p>
                  <div className="flex-1 overflow-y-auto bg-black/40 rounded-lg p-3 border border-slate-800/60 font-mono text-[11px] text-slate-300">
                    <pre>
                      {JSON.stringify(
                        [
                          { role: "system", content: systemPrompt },
                          ...messages.map((m) => ({
                            role: m.role,
                            content: m.content,
                          })),
                        ],
                        null,
                        2
                      )}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <div className="p-4 border-t border-slate-800/80 bg-[#0b101d] space-y-2">
              <div className="max-w-4xl mx-auto flex items-center justify-between px-1 text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300 hover:text-white">
                  <input
                    type="checkbox"
                    checked={enableChatTools}
                    onChange={(e) => setEnableChatTools(e.target.checked)}
                    className="rounded bg-[#141b2e] border-slate-700 text-cyan-500 focus:ring-0"
                  />
                  <span className="flex items-center gap-1 font-mono text-[11px]">
                    <Wrench className="w-3 h-3 text-cyan-400" />
                    启用 Tool Calling (支持自动读代码、搜目录与精确计算)
                  </span>
                </label>

                <span className="text-[11px] text-slate-500">
                  Enter 发送，Shift+Enter 换行
                </span>
              </div>

              <div className="max-w-4xl mx-auto flex items-end gap-3 glass-panel p-2 rounded-xl border border-slate-700/60 focus-within:border-cyan-500 transition shadow-lg">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  rows={2}
                  placeholder="向 Mini Claude Code 发送指令... (例如: '帮我看看 package.json 里的依赖与版本')"
                  className="flex-1 bg-transparent px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 resize-none outline-none font-sans"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={isStreaming || !inputMessage.trim()}
                  className="px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:hover:bg-cyan-600 text-white font-medium text-xs flex items-center gap-1.5 transition shadow-md shadow-cyan-600/30 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>发送</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Toolbox Standalone */}
        {activeTab === "toolbox" && (
          <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto space-y-6">
            <div className="glass-panel p-6 rounded-2xl border border-slate-800">
              <div className="flex items-center gap-3 mb-2">
                <FolderTree className="w-6 h-6 text-purple-400" />
                <h2 className="text-xl font-bold text-white tracking-tight">
                  已注册工具箱与本地沙箱执行器 (Toolbox Sandbox)
                </h2>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                每个 Tool 都是一个由 Zod Schema 强类型约束、包含完善参数描述与边界保护的本地函数。你可以在这里直接测试每个工具的执行效果。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  name: "read_file",
                  icon: FileText,
                  color: "text-amber-400",
                  desc: "安全读取工作区文件内容。支持起始行与结束行范围切片，内置大文件截断保护与路径越界安全防御。",
                  defaultArgs: { filePath: "package.json", startLine: 1, endLine: 20 },
                },
                {
                  name: "list_dir",
                  icon: FolderTree,
                  color: "text-blue-400",
                  desc: "遍历工作区目录结构。自动过滤 node_modules、.git 等大体积无关目录，返回文件类型与大小。",
                  defaultArgs: { dirPath: "app", recursive: false },
                },
                {
                  name: "calculate",
                  icon: Calculator,
                  color: "text-emerald-400",
                  desc: "使用宿主 CPU 运算引擎计算数学算式，保证 100% 精确，避免 LLM 在复杂多项式中产生幻觉。",
                  defaultArgs: { expression: "(145 * 89) + (1024 / 32) - 127.5" },
                },
                {
                  name: "get_system_info",
                  icon: Clock,
                  color: "text-purple-400",
                  desc: "获取系统当前精确时间、时区、Node.js 与操作系统环境，解决大模型无时钟感知的问题。",
                  defaultArgs: { detailLevel: "detailed" },
                },
              ].map((tool) => {
                const Icon = tool.icon;
                return (
                  <div
                    key={tool.name}
                    className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-5 h-5 ${tool.color}`} />
                        <h3 className="font-mono font-bold text-sm text-slate-100">
                          {tool.name}
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        Built-in
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      {tool.desc}
                    </p>

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                      <button
                        onClick={() => {
                          setSandboxTool(tool.name);
                          setSandboxArgsInput(
                            JSON.stringify(tool.defaultArgs, null, 2)
                          );
                          setActiveTab("lab");
                        }}
                        className="text-xs text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1"
                      >
                        <span>在实验室中单点测试</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}


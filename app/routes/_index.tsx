import { useState, useEffect, useRef } from "react";
import { useLoaderData } from "react-router";
import type { ChatMessage, TokenUsage } from "~/core/llm/types";
import {
  Terminal,
  Cpu,
  Layers,
  Sparkles,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Key,
  Settings,
  Send,
  Trash2,
  Code2,
  BookOpen,
  ArrowRight,
  RefreshCw,
  Eye,
  Info,
  ShieldCheck,
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
    name: "Coding Assistant",
    prompt:
      "你是一个专业的 AI Coding 编程助手。你的回答需要简明扼要、准确严谨，代码需附带简要说明与最佳实践。",
  },
  {
    name: "Mini Claude Code",
    prompt:
      "你是 Mini Claude Code，一个正在被逐步构建手写的自主 Coding Agent。你乐于帮助开发者分析系统架构、排查 Bug 并解释你的思考过程。",
  },
  {
    name: "极简技术专家",
    prompt:
      "你是一个极致精简的架构师，回答直接命中问题核心，不讲客套话与废话。",
  },
];

export default function Index() {
  const { hasServerKey, defaultModel, supportedModels } =
    useLoaderData<typeof loader>();

  // State
  const [activeTab, setActiveTab] = useState<
    "chat" | "stateless" | "structured" | "roadmap"
  >("chat");
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [customApiKey, setCustomApiKey] = useState("");
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(
    SYSTEM_PROMPT_PRESETS[0].prompt
  );

  // Chat State
  const [messages, setMessages] = useState<
    Array<ChatMessage & { usage?: TokenUsage; latencyMs?: number }>
  >([
    {
      role: "assistant",
      content:
        "你好！我是 Mini Claude Code V0。当前我们处于第一阶段：探索 LLM 原生对话机制、无状态本质与结构化输出。你可以随时向我提问，或者切换到上方的实验台探索核心认知！",
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [showContextInspector, setShowContextInspector] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Stateless Experiment State
  const [expName, setExpName] = useState("小明");
  const [expLanguage, setExpLanguage] = useState("TypeScript");
  const [statelessLoading, setStatelessLoading] = useState(false);
  const [statelessResult, setStatelessResult] = useState<any>(null);

  // Structured Output Experiment State
  const [structuredLoading, setStructuredLoading] = useState(false);
  const [structuredResult, setStructuredResult] = useState<any>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent]);

  // Load custom key from local storage if any
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
    setShowApiKeyModal(false);
  };

  // Chat Send Handler
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isStreaming) return;

    if (!isKeyAvailable) {
      setShowApiKeyModal(true);
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

    const startTime = Date.now();

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
              if (data.content) {
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
          usage: finalUsage,
          latencyMs,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ 请求失败: ${err.message}`,
        },
      ]);
    } finally {
      setIsStreaming(false);
      setStreamContent("");
    }
  };

  // Run Stateless Experiment
  const handleRunStatelessExp = async () => {
    if (!isKeyAvailable) {
      setShowApiKeyModal(true);
      return;
    }
    setStatelessLoading(true);
    setStatelessResult(null);

    try {
      const res = await fetch("/api/experiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "stateless",
          model: selectedModel,
          apiKey: effectiveApiKey,
          customName: expName,
          customLanguage: expLanguage,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStatelessResult(data.result);
    } catch (err: any) {
      alert(`实验执行失败: ${err.message}`);
    } finally {
      setStatelessLoading(false);
    }
  };

  // Run Structured Output Experiment
  const handleRunStructuredExp = async () => {
    if (!isKeyAvailable) {
      setShowApiKeyModal(true);
      return;
    }
    setStructuredLoading(true);
    setStructuredResult(null);

    try {
      const res = await fetch("/api/experiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "structured",
          model: selectedModel,
          apiKey: effectiveApiKey,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStructuredResult(data.result);
    } catch (err: any) {
      alert(`实验执行失败: ${err.message}`);
    } finally {
      setStructuredLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#07090e] text-slate-100">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#0c101a]/90 backdrop-blur-md px-6 py-3.5 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-bold">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold tracking-tight text-white text-base">
                Mini Claude Code
              </h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                Stage 0 (V0)
              </span>
            </div>
            <p className="text-xs text-slate-400">
              从 0 手写 AI Coding Agent · LLM 原生机制与认知实验
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {/* Model Selector */}
          <div className="flex items-center gap-2 bg-[#121826] border border-slate-700/60 rounded-lg px-3 py-1.5 text-xs text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-transparent text-slate-200 outline-none cursor-pointer pr-2 font-mono text-xs"
            >
              {supportedModels.map((m) => (
                <option
                  key={m.id}
                  value={m.id}
                  className="bg-[#121826] text-slate-200"
                >
                  {m.name} ({m.provider})
                </option>
              ))}
            </select>
          </div>

          {/* API Key Status / Button */}
          <button
            onClick={() => setShowApiKeyModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              isKeyAvailable
                ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/50"
                : "bg-amber-950/40 text-amber-300 border-amber-500/40 hover:bg-amber-900/50 animate-pulse"
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>
              {isKeyAvailable
                ? hasServerKey
                  ? "OpenRouter: 已就绪 (.env)"
                  : "OpenRouter: 已就绪 (Session)"
                : "配置 API Key"}
            </span>
          </button>
        </div>
      </header>

      {/* Main Tab Navigation */}
      <div className="border-b border-slate-800/80 bg-[#0a0e17] px-6">
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === "chat"
                ? "border-indigo-500 text-indigo-300 bg-indigo-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/20"
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>💬 V0 交互对话终端</span>
          </button>

          <button
            onClick={() => setActiveTab("stateless")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === "stateless"
                ? "border-indigo-500 text-indigo-300 bg-indigo-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/20"
            }`}
          >
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>🧪 认知实验 1: 模型记忆本质</span>
          </button>

          <button
            onClick={() => setActiveTab("structured")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === "structured"
                ? "border-indigo-500 text-indigo-300 bg-indigo-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/20"
            }`}
          >
            <Code2 className="w-4 h-4 text-emerald-400" />
            <span>📐 认知实验 2: Prompt vs Structured Schema</span>
          </button>

          <button
            onClick={() => setActiveTab("roadmap")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === "roadmap"
                ? "border-indigo-500 text-indigo-300 bg-indigo-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/20"
            }`}
          >
            <Layers className="w-4 h-4 text-amber-400" />
            <span>🗺️ Mini Claude Code 演进路线</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">
        {/* TAB 1: Chat Playground */}
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
                  className="bg-[#141b2e] border border-slate-700/60 rounded px-2.5 py-1 text-slate-200 w-full font-mono text-xs focus:outline-none focus:border-indigo-500"
                  placeholder="输入 System Prompt..."
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {SYSTEM_PROMPT_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => setSystemPrompt(preset.prompt)}
                    className="px-2 py-1 rounded bg-[#162035] hover:bg-[#1f2c4a] text-slate-300 border border-slate-700/50 text-[11px] transition"
                  >
                    {preset.name}
                  </button>
                ))}

                <button
                  onClick={() => setShowContextInspector(!showContextInspector)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono border transition ${
                    showContextInspector
                      ? "bg-indigo-900/40 text-indigo-300 border-indigo-500/40"
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
                        {msg.role === "user" ? "👤 User" : `🤖 Assistant (${selectedModel})`}
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
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-md ${
                        msg.role === "user"
                          ? "bg-indigo-600 text-white rounded-br-none"
                          : "glass-panel text-slate-200 border-slate-800/90 rounded-bl-none font-sans whitespace-pre-wrap"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

                {/* Streaming Placeholder */}
                {isStreaming && (
                  <div className="flex flex-col items-start">
                    <div className="flex items-center gap-2 mb-1 text-[11px] font-mono text-indigo-400 px-1">
                      <span className="animate-pulse">🤖 正在流式生成...</span>
                    </div>
                    <div className="max-w-[85%] rounded-2xl rounded-bl-none px-4 py-3 text-sm leading-relaxed glass-panel border-indigo-500/30 text-slate-200 whitespace-pre-wrap">
                      {streamContent || (
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping"></span>
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
                      <Code2 className="w-4 h-4 text-indigo-400" />
                      <span>Context Inspector (实际 Payload)</span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300">
                      V0 Payload
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px] mb-3">
                    这就是每次发送给 OpenRouter API 的真实 `messages` 数组。理解它对于掌握 Agent Context 至关重要。
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
            <div className="p-4 border-t border-slate-800/80 bg-[#0b101d]">
              <div className="max-w-4xl mx-auto flex items-end gap-3 glass-panel p-2 rounded-xl border border-slate-700/60 focus-within:border-indigo-500 transition shadow-lg">
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
                  placeholder="向 Mini Claude Code 发送消息... (Enter 发送，Shift+Enter 换行)"
                  className="flex-1 bg-transparent px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 resize-none outline-none font-sans"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={isStreaming || !inputMessage.trim()}
                  className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white font-medium text-xs flex items-center gap-1.5 transition shadow-md shadow-indigo-600/30"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>发送</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Stateless Experiment */}
        {activeTab === "stateless" && (
          <div className="flex-1 overflow-y-auto p-8 max-w-6xl mx-auto space-y-6">
            <div className="glass-panel p-6 rounded-2xl border border-slate-800">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    认知课题 1：模型为什么记得上一句话？
                  </h2>
                  <p className="text-xs text-slate-400">
                    探索“LLM 原生无状态机制”与“Runtime 对话记忆重放”的本质差别。
                  </p>
                </div>
              </div>

              <div className="mt-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 space-y-2">
                <p>
                  <strong>实验逻辑：</strong>
                  在第一轮中，用户告知模型名字和喜爱的语言。在第二轮提问：“我叫什么？我喜欢什么语言？”
                </p>
                <div className="flex flex-wrap gap-4 pt-2">
                  <label className="flex items-center gap-2">
                    <span className="text-slate-400">测试姓名:</span>
                    <input
                      type="text"
                      value={expName}
                      onChange={(e) => setExpName(e.target.value)}
                      className="bg-[#141b2e] border border-slate-700 px-2.5 py-1 rounded text-white font-mono"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="text-slate-400">喜爱语言:</span>
                    <input
                      type="text"
                      value={expLanguage}
                      onChange={(e) => setExpLanguage(e.target.value)}
                      className="bg-[#141b2e] border border-slate-700 px-2.5 py-1 rounded text-white font-mono"
                    />
                  </label>
                  <button
                    onClick={handleRunStatelessExp}
                    disabled={statelessLoading}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-medium text-xs transition shadow-md shadow-cyan-600/30 ml-auto"
                  >
                    {statelessLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    <span>
                      {statelessLoading ? "正在执行对照实验..." : "▶️ 运行对照实验"}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Results Grid */}
            {statelessResult && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Run A Card */}
                  <div className="glass-panel p-5 rounded-2xl border border-red-500/20 bg-red-950/10 flex flex-col">
                    <div className="flex items-center justify-between pb-3 border-b border-red-500/20 mb-3">
                      <div className="flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-400" />
                        <span className="font-semibold text-sm text-red-300">
                          {statelessResult.runA.title}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {statelessResult.runA.latencyMs}ms · {statelessResult.runA.tokens} tokens
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">
                      {statelessResult.runA.description}
                    </p>
                    <div className="mb-3">
                      <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                        Runtime 实际发送给 API 的 Messages:
                      </span>
                      <pre className="p-2.5 bg-black/50 rounded-lg text-[11px] font-mono text-slate-300 overflow-x-auto border border-slate-800">
                        {JSON.stringify(statelessResult.runA.sentMessages, null, 2)}
                      </pre>
                    </div>
                    <div className="mt-auto">
                      <span className="text-[10px] font-mono uppercase text-red-400 block mb-1">
                        模型返回结果:
                      </span>
                      <div className="p-3 bg-red-950/30 rounded-lg border border-red-500/30 text-xs text-red-200 leading-relaxed">
                        {statelessResult.runA.response}
                      </div>
                    </div>
                  </div>

                  {/* Run B Card */}
                  <div className="glass-panel p-5 rounded-2xl border border-emerald-500/20 bg-emerald-950/10 flex flex-col">
                    <div className="flex items-center justify-between pb-3 border-b border-emerald-500/20 mb-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="font-semibold text-sm text-emerald-300">
                          {statelessResult.runB.title}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {statelessResult.runB.latencyMs}ms · {statelessResult.runB.tokens} tokens
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">
                      {statelessResult.runB.description}
                    </p>
                    <div className="mb-3">
                      <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                        Runtime 实际发送给 API 的 Messages:
                      </span>
                      <pre className="p-2.5 bg-black/50 rounded-lg text-[11px] font-mono text-slate-300 overflow-x-auto border border-slate-800 max-h-48">
                        {JSON.stringify(statelessResult.runB.sentMessages, null, 2)}
                      </pre>
                    </div>
                    <div className="mt-auto">
                      <span className="text-[10px] font-mono uppercase text-emerald-400 block mb-1">
                        模型返回结果:
                      </span>
                      <div className="p-3 bg-emerald-950/30 rounded-lg border border-emerald-500/30 text-xs text-emerald-200 leading-relaxed">
                        {statelessResult.runB.response}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Key Takeaway Callout */}
                <div className="p-5 rounded-2xl border border-indigo-500/30 bg-indigo-950/20 flex gap-3.5 items-start">
                  <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    <h3 className="font-semibold text-indigo-300 text-sm mb-1">
                      深度认知沉淀
                    </h3>
                    <p className="text-slate-300">{statelessResult.keyTakeaway}</p>
                    <div className="mt-2 text-slate-400 font-mono text-[11px]">
                      公式表达：<code>Memory ≠ LLM State</code>, <code>Memory = Runtime.replay(History)</code>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Structured Output Experiment */}
        {activeTab === "structured" && (
          <div className="flex-1 overflow-y-auto p-8 max-w-6xl mx-auto space-y-6">
            <div className="glass-panel p-6 rounded-2xl border border-slate-800">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Code2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    认知课题 2：Prompt 约束 vs Structured Output (Zod Schema)
                  </h2>
                  <p className="text-xs text-slate-400">
                    为什么说 Prompt 不能当作程序 API 接口？为什么 Agent 必须建立在严格 Schema 契约之上？
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  本实验测试让模型解析一段 <code>package.json</code> 并提取指定技术栈字段。
                </p>
                <button
                  onClick={handleRunStructuredExp}
                  disabled={structuredLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-xs transition shadow-md shadow-emerald-600/30"
                >
                  {structuredLoading ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  <span>
                    {structuredLoading ? "正在测试解析能力..." : "▶️ 运行解析对比实验"}
                  </span>
                </button>
              </div>
            </div>

            {/* Results Grid */}
            {structuredResult && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Prompt Only Card */}
                  <div className="glass-panel p-5 rounded-2xl border border-amber-500/30 bg-amber-950/10 flex flex-col">
                    <div className="flex items-center justify-between pb-3 border-b border-amber-500/20 mb-3">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-400" />
                        <span className="font-semibold text-sm text-amber-300">
                          方法 A：Prompt 自然语言提示
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {structuredResult.runPromptOnly.latencyMs}ms
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mb-3">
                      提示词中写道：<code>"请提取信息并直接输出 JSON 格式..."</code>
                    </p>

                    <div className="mb-3 flex-1">
                      <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                        模型原始字符串输出 (Raw String):
                      </span>
                      <pre className="p-3 bg-black/60 rounded-lg text-[11px] font-mono text-amber-200 overflow-x-auto border border-amber-900/40 max-h-56">
                        {structuredResult.runPromptOnly.rawOutput}
                      </pre>
                    </div>

                    <div className="p-3 rounded-lg bg-black/40 border border-slate-800 text-xs">
                      <div className="flex items-center gap-1.5 font-medium mb-1">
                        {structuredResult.runPromptOnly.parsedDirectly ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> 原生 JSON.parse 成功
                          </span>
                        ) : (
                          <span className="text-amber-400 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" /> 原生 JSON.parse 失败 / 需二次清洗
                          </span>
                        )}
                      </div>
                      {structuredResult.runPromptOnly.parseError && (
                        <p className="text-slate-400 text-[11px]">
                          {structuredResult.runPromptOnly.parseError}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Structured Zod Card */}
                  <div className="glass-panel p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/10 flex flex-col">
                    <div className="flex items-center justify-between pb-3 border-b border-emerald-500/20 mb-3">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span className="font-semibold text-sm text-emerald-300">
                          方法 B：Structured Output (Zod Schema)
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {structuredResult.runStructuredZod.latencyMs}ms
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mb-3">
                      通过 JSON Schema 约束 + Zod 类型强校验：
                    </p>

                    <div className="mb-3 flex-1">
                      <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                        强类型已验证数据 (Type-Safe Object):
                      </span>
                      <pre className="p-3 bg-black/60 rounded-lg text-[11px] font-mono text-emerald-300 overflow-x-auto border border-emerald-900/40 max-h-56">
                        {JSON.stringify(structuredResult.runStructuredZod.data, null, 2)}
                      </pre>
                    </div>

                    <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-200">
                      ✅ 100% 保证字段存在性与数据类型 (boolean / array / string)。
                    </div>
                  </div>
                </div>

                {/* Key Takeaway Callout */}
                <div className="p-5 rounded-2xl border border-indigo-500/30 bg-indigo-950/20 flex gap-3.5 items-start">
                  <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    <h3 className="font-semibold text-indigo-300 text-sm mb-1">
                      深度认知沉淀
                    </h3>
                    <p className="text-slate-300">{structuredResult.keyTakeaway}</p>
                    <div className="mt-2 text-slate-400 font-mono text-[11px]">
                      结论：在后续 Tool Calling (V1) 和 State (V6) 中，我们将全量采用 Schema 契约架构。
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Evolution Roadmap */}
        {activeTab === "roadmap" && (
          <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto space-y-6">
            <div className="text-center max-w-2xl mx-auto mb-8">
              <h2 className="text-2xl font-bold text-white tracking-tight">
                Mini Claude Code 演进全景路线
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                问题驱动的 12 阶段成长路径，手写一个完整生产级 Coding Agent。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  version: "V0",
                  title: "LLM Chat 认知",
                  desc: "无状态机制、Token、Context Window 与结构化输出",
                  status: "current",
                  badge: "当前阶段",
                },
                {
                  version: "V1",
                  title: "Tool Calling 机制",
                  desc: "赋予行动力：read_file 与 Tool Schema 执行层",
                  status: "next",
                  badge: "下一阶段",
                },
                {
                  version: "V2",
                  title: "Agent Loop",
                  desc: "Thought-Action-Observation 闭环与死循环熔断",
                  status: "upcoming",
                },
                {
                  version: "V3",
                  title: "Coding Agent",
                  desc: "文件读写、终端 Shell 执行与环境自愈纠错",
                  status: "upcoming",
                },
                {
                  version: "V4",
                  title: "Planning / Workflow",
                  desc: "复杂任务分解、步骤拆解与执行路由",
                  status: "upcoming",
                },
                {
                  version: "V5",
                  title: "Context Engineering",
                  desc: "上下文膨胀防御、摘要压缩与动态代码检索",
                  status: "upcoming",
                },
                {
                  version: "V6",
                  title: "Memory & State",
                  desc: "区分 Context/Memory/State 与会话跨进程持久化",
                  status: "upcoming",
                },
                {
                  version: "V7",
                  title: "Harness & Sandbox",
                  desc: "权限系统、敏感危险命令拦截与沙箱隔离",
                  status: "upcoming",
                },
                {
                  version: "V8",
                  title: "MCP 标准协议",
                  desc: "工具解耦与手写 Mini Code MCP Server",
                  status: "upcoming",
                },
                {
                  version: "V9",
                  title: "Durable Execution",
                  desc: "崩溃断点续传、幂等性与 LangGraph / Checkpoint",
                  status: "upcoming",
                },
                {
                  version: "V10",
                  title: "Eval & Tracing",
                  desc: "自动化 Benchmark 评测集与全链路可观测性",
                  status: "upcoming",
                },
                {
                  version: "V11",
                  title: "Production Agent",
                  desc: "并发、队列、限流、成本控制与生产部署",
                  status: "upcoming",
                },
              ].map((stage, idx) => (
                <div
                  key={stage.version}
                  className={`p-5 rounded-2xl border transition relative flex flex-col ${
                    stage.status === "current"
                      ? "border-indigo-500/60 bg-indigo-950/20 shadow-lg shadow-indigo-500/10"
                      : stage.status === "next"
                      ? "border-cyan-500/40 bg-cyan-950/10"
                      : "border-slate-800 bg-[#0e1422]/60 opacity-80"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-bold text-indigo-400 px-2 py-0.5 rounded bg-indigo-500/10">
                      {stage.version}
                    </span>
                    {stage.badge && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {stage.badge}
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold text-slate-100 text-sm mb-1">
                    {stage.title}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed flex-1">
                    {stage.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* API Key Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-md p-6 rounded-2xl border border-slate-700 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-indigo-400" />
                <h3 className="font-semibold text-white text-base">
                  配置 OpenRouter API Key
                </h3>
              </div>
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              输入你的 OpenRouter API Key 即可开始使用各种顶尖模型（Claude 3.5 Sonnet、DeepSeek、GPT-4o 等）。
            </p>

            <div className="space-y-2">
              <label className="text-xs font-mono text-slate-400">
                API Key (sk-or-v1-...):
              </label>
              <input
                type="password"
                defaultValue={customApiKey}
                placeholder="sk-or-v1-..."
                id="modalApiKeyInput"
                className="w-full bg-[#141b2e] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-500">
                💡 也可以直接写在项目根目录的 <code>.env</code> 文件中（<code>OPENROUTER_API_KEY=...</code>）。
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200"
              >
                取消
              </button>
              <button
                onClick={() => {
                  const input = document.getElementById(
                    "modalApiKeyInput"
                  ) as HTMLInputElement;
                  saveLocalKey(input?.value || "");
                }}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-md shadow-indigo-600/30"
              >
                保存并开始
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { useLoaderData, Link } from "react-router";
import type { ChatMessage, TokenUsage } from "~/core/llm/types";
import { Header } from "~/components/Header";
import {
  Terminal,
  Cpu,
  Code2,
  Send,
  Trash2,
  Eye,
  Settings,
  RefreshCw,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Info,
  BookOpen,
  ArrowRight,
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

const SYSTEM_PROMPT_PRESETS = [
  {
    name: "Coding Assistant",
    prompt:
      "你是一个专业的 AI Coding 编程助手。你的回答需要简明扼要、准确严谨，代码需附带简要说明与最佳实践。",
  },
  {
    name: "Mini Claude Code V0",
    prompt:
      "你是 Mini Claude Code V0，一个刚处于起步阶段的 AI 助手。你乐于向开发者解释 Token、Context Window 与大模型记忆机制。",
  },
  {
    name: "极简技术专家",
    prompt:
      "你是一个极致精简的架构师，回答直接命中问题核心，不讲客套话与废话。",
  },
];

export default function LessonV0() {
  const { hasServerKey, defaultModel, defaultBaseURL, supportedModels } =
    useLoaderData<typeof loader>();

  const [activeTab, setActiveTab] = useState<"chat" | "stateless" | "structured">(
    "chat"
  );
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [customApiKey, setCustomApiKey] = useState("");
  const [customBaseURL, setCustomBaseURL] = useState(defaultBaseURL);
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
        "你好！我是 Mini Claude Code V0。在这一课中，我们探索 LLM 原生对话机制、无状态本质与结构化输出。你可以随时向我提问，或者切换到上方的实验台探索核心认知！",
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

  const effectiveApiKey = customApiKey || "";
  const isKeyAvailable = hasServerKey || Boolean(effectiveApiKey);

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
          baseURL: customBaseURL,
          enableTools: false,
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
          latencyMs,
          usage: finalUsage,
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
    }
  };

  // Stateless Experiment
  const handleRunStateless = async () => {
    if (!isKeyAvailable) {
      alert("请先点击右上角配置 API Key");
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
          baseURL: customBaseURL,
          customName: expName,
          customLanguage: expLanguage,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "实验运行失败");
      }

      setStatelessResult(data.result);
    } catch (err: any) {
      alert(`实验异常: ${err.message}`);
    } finally {
      setStatelessLoading(false);
    }
  };

  // Structured Output Experiment
  const handleRunStructured = async () => {
    if (!isKeyAvailable) {
      alert("请先点击右上角配置 API Key");
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
          baseURL: customBaseURL,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "实验运行失败");
      }

      setStructuredResult(data.result);
    } catch (err: any) {
      alert(`实验异常: ${err.message}`);
    } finally {
      setStructuredLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#070a12] text-slate-100 font-sans selection:bg-indigo-500/30">
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
          id: "v0",
          title: "第 01 课: LLM 原生机制与结构化输出",
          badge: "V0",
        }}
      />

      {/* Lesson Sub-Navigation */}
      <div className="border-b border-slate-800/80 bg-[#0a0e17] px-6 flex items-center justify-between">
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === "chat"
                ? "border-indigo-500 text-indigo-300 bg-indigo-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/20"
            }`}
          >
            <Terminal className="w-4 h-4 text-indigo-400" />
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
        </div>

        <Link
          to="/lessons/v1-tool-calling"
          className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 py-1.5 px-3 rounded-lg bg-cyan-950/30 border border-cyan-500/30 transition"
        >
          <span>进入第 02 课: Tool Calling</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
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
                  placeholder="向 Mini Claude Code V0 发送消息... (Enter 发送，Shift+Enter 换行)"
                  className="flex-1 bg-transparent px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 resize-none outline-none font-sans"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={isStreaming || !inputMessage.trim()}
                  className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white font-medium text-xs flex items-center gap-1.5 transition shadow-md shadow-indigo-600/30 cursor-pointer"
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
                <Cpu className="w-6 h-6 text-cyan-400" />
                <h2 className="text-xl font-bold text-white tracking-tight">
                  实验 1：大模型到底有没有“记忆”？ (Statelessness Lab)
                </h2>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                很多人误以为模型在服务端保存了会话状态。本实验将通过
                <strong>“隔离单条消息”</strong>与
                <strong>“喂入完整历史数组”</strong>
                进行对照，带你直观见证：模型的记忆完全依赖 Runtime 每次将历史重新拼入 Context Window。
              </p>
            </div>

            {/* Experiment Form */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-mono text-slate-400">
                    设定你在第一轮告诉模型的名字:
                  </label>
                  <input
                    type="text"
                    value={expName}
                    onChange={(e) => setExpName(e.target.value)}
                    className="w-full bg-[#111728] border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono text-slate-400">
                    设定你喜好的编程语言:
                  </label>
                  <input
                    type="text"
                    value={expLanguage}
                    onChange={(e) => setExpLanguage(e.target.value)}
                    className="w-full bg-[#111728] border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleRunStateless}
                  disabled={statelessLoading}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-50 text-white font-medium text-xs flex items-center gap-2 transition shadow-lg shadow-indigo-600/20 cursor-pointer"
                >
                  {statelessLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>正在并发对比运行...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>运行对照实验</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Experiment Results */}
            {statelessResult && (
              <div className="space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left: Without History */}
                  <div className="glass-panel p-6 rounded-2xl border border-red-500/30 bg-red-950/10 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-red-500/20">
                      <div className="flex items-center gap-2">
                        <XCircle className="w-5 h-5 text-red-400" />
                        <h3 className="font-semibold text-slate-100 text-sm">
                          对照组 A：不拼接历史 (Single Message)
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/20 text-red-300">
                        原生无状态
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[11px] font-mono text-slate-400">
                        实际发送的 Messages 数组:
                      </div>
                      <div className="p-3 bg-black/40 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 max-h-32 overflow-y-auto">
                        <pre>
                          {JSON.stringify(
                            statelessResult.withoutHistory.sentMessages,
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[11px] font-mono text-slate-400">
                        大模型返回回答:
                      </div>
                      <div className="p-3 bg-black/40 rounded-lg border border-red-500/20 text-xs text-red-200 leading-relaxed font-sans">
                        {statelessResult.withoutHistory.response}
                      </div>
                    </div>

                    <div className="text-[11px] text-red-300/80 bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                      ❌ 模型完全不知道你的名字和语言，证明大模型自身没有存储状态。
                    </div>
                  </div>

                  {/* Right: With History */}
                  <div className="glass-panel p-6 rounded-2xl border border-emerald-500/30 bg-emerald-950/10 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-emerald-500/20">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        <h3 className="font-semibold text-slate-100 text-sm">
                          对照组 B：Runtime 拼接历史 (Full Context)
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                        Runtime 维系记忆
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[11px] font-mono text-slate-400">
                        实际发送的 Messages 数组:
                      </div>
                      <div className="p-3 bg-black/40 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 max-h-32 overflow-y-auto">
                        <pre>
                          {JSON.stringify(
                            statelessResult.withHistory.sentMessages,
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[11px] font-mono text-slate-400">
                        大模型返回回答:
                      </div>
                      <div className="p-3 bg-black/40 rounded-lg border border-emerald-500/20 text-xs text-emerald-200 leading-relaxed font-sans">
                        {statelessResult.withHistory.response}
                      </div>
                    </div>

                    <div className="text-[11px] text-emerald-300/80 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                      ✅ 模型能够准确答出，完全是因为 Runtime 在本次请求中重新提供了完整上下文。
                    </div>
                  </div>
                </div>

                {/* Key Takeaway Callout */}
                <div className="p-5 rounded-2xl border border-cyan-500/30 bg-cyan-950/20 flex gap-3.5 items-start">
                  <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    <h3 className="font-semibold text-cyan-300 text-sm mb-1">
                      核心认知沉淀
                    </h3>
                    <p className="text-slate-300">{statelessResult.keyTakeaway}</p>
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
                <Code2 className="w-6 h-6 text-emerald-400" />
                <h2 className="text-xl font-bold text-white tracking-tight">
                  实验 2：Prompt 约束 vs Zod Structured Schema
                </h2>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                许多人试图用“请你返回纯 JSON，不要带任何 markdown”作为程序接口。但在生产 Agent 中，这种做法极不可靠。本实验将对比
                <strong>纯 Prompt 请求</strong>与
                <strong>Zod Schema 强类型约束</strong>的稳定性差异。
              </p>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleRunStructured}
                disabled={structuredLoading}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-50 text-white font-medium text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-600/20 cursor-pointer"
              >
                {structuredLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>正在执行解析对比...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>运行 Schema 对照测试</span>
                  </>
                )}
              </button>
            </div>

            {/* Structured Results */}
            {structuredResult && (
              <div className="space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left: Prompt Only */}
                  <div className="glass-panel p-6 rounded-2xl border border-amber-500/30 bg-amber-950/10 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-amber-500/20">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-amber-400" />
                        <h3 className="font-semibold text-slate-100 text-sm">
                          对照组 A：纯 Prompt 约束
                        </h3>
                      </div>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                          structuredResult.promptOnly.parseSuccess
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-red-500/20 text-red-300"
                        }`}
                      >
                        JSON.parse:{" "}
                        {structuredResult.promptOnly.parseSuccess
                          ? "成功"
                          : "失败"}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[11px] font-mono text-slate-400">
                        大模型返回的原始输出 (Raw Output):
                      </div>
                      <div className="p-3 bg-black/40 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 max-h-48 overflow-y-auto whitespace-pre-wrap">
                        {structuredResult.promptOnly.rawOutput}
                      </div>
                    </div>

                    <div className="text-[11px] text-amber-300/80 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                      ⚠️ 容易混杂自然语言客套话、Markdown 代码围栏（```json），导致程序反序列化崩溃。
                    </div>
                  </div>

                  {/* Right: Zod Schema */}
                  <div className="glass-panel p-6 rounded-2xl border border-emerald-500/30 bg-emerald-950/10 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-emerald-500/20">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        <h3 className="font-semibold text-slate-100 text-sm">
                          对照组 B：Zod Schema 强契约
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                        Schema 100% 校验通过
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[11px] font-mono text-slate-400">
                        强类型校验后的 TypeScript 对象:
                      </div>
                      <div className="p-3 bg-black/40 rounded-lg border border-slate-800 text-[11px] font-mono text-emerald-300 max-h-48 overflow-y-auto">
                        <pre>
                          {JSON.stringify(
                            structuredResult.zodSchema.validatedData,
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    </div>

                    <div className="text-[11px] text-emerald-300/80 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
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
      </main>
    </div>
  );
}


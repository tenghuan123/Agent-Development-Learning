import { useState, useEffect, useRef } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import type {
  JsonRpcFrame,
  McpResourceDefinition,
  McpServerMetadata,
  McpToolDefinition,
} from "~/core/mcp/types";
import {
  Network,
  Cpu,
  Terminal,
  Activity,
  Zap,
  CheckCircle2,
  XCircle,
  Wrench,
  BookOpen,
  Layers,
  ArrowRight,
  RefreshCw,
  Database,
  Globe,
  Code2,
  Play,
  FileCode,
  Send,
  Trash2,
  Search,
  Server,
  Plug,
  Unplug,
  Clock,
  Sparkles,
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

export default function LessonV8Page() {
  const { hasServerKey, model, defaultBaseURL } =
    useLoaderData<typeof loader>();

  // API Config State
  const [customApiKey, setCustomApiKey] = useState("");
  const [customBaseURL, setCustomBaseURL] = useState(defaultBaseURL);
  const [selectedModel, setSelectedModel] = useState(model);

  useEffect(() => {
    const storedKey = localStorage.getItem("MINI_CLAUDE_API_KEY");
    if (storedKey) setCustomApiKey(storedKey);
    const storedURL = localStorage.getItem("MINI_CLAUDE_BASE_URL");
    if (storedURL) setCustomBaseURL(storedURL);
    const storedModel = localStorage.getItem("MINI_CLAUDE_MODEL");
    if (storedModel) setSelectedModel(storedModel);
  }, []);

  const saveLocalKey = (key: string) => {
    setCustomApiKey(key);
    localStorage.setItem("MINI_CLAUDE_API_KEY", key);
  };

  const saveLocalBaseURL = (url: string) => {
    setCustomBaseURL(url);
    localStorage.setItem("MINI_CLAUDE_BASE_URL", url);
  };

  const handleSaveSettings = (settings: { apiKey: string; baseURL: string }) => {
    setCustomApiKey(settings.apiKey);
    setCustomBaseURL(settings.baseURL);
    localStorage.setItem("MINI_CLAUDE_API_KEY", settings.apiKey);
    localStorage.setItem("MINI_CLAUDE_BASE_URL", settings.baseURL);
  };

  // ==========================================
  // MCP Servers & Discovery State
  // ==========================================
  const [servers, setServers] = useState<McpServerMetadata[]>([]);
  const [tools, setTools] = useState<
    Array<{ serverId: string; serverName: string; tool: McpToolDefinition }>
  >([]);
  const [resources, setResources] = useState<
    Array<{
      serverId: string;
      serverName: string;
      resource: McpResourceDefinition;
    }>
  >([]);
  const [frames, setFrames] = useState<JsonRpcFrame[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connectingMap, setConnectingMap] = useState<Record<string, boolean>>({});

  // Active Tab: "hub" | "explorer" | "inspector" | "agent"
  const [activeTab, setActiveTab] = useState<
    "hub" | "explorer" | "inspector" | "agent"
  >("hub");

  // Filter in frames inspector
  const [frameFilter, setFrameFilter] = useState("");
  const [expandedFrameId, setExpandedFrameId] = useState<string | null>(null);

  // Manual Raw RPC State
  const [rawRpcServerId, setRawRpcServerId] = useState("mini-code-server");
  const [rawRpcMethod, setRawRpcMethod] = useState("tools/list");
  const [rawRpcParams, setRawRpcParams] = useState("{}");
  const [rawRpcOutput, setRawRpcOutput] = useState<string | null>(null);
  const [rawRpcLoading, setRawRpcLoading] = useState(false);

  // Tool Direct Test State
  const [selectedTool, setSelectedTool] = useState<{
    serverId: string;
    tool: McpToolDefinition;
  } | null>(null);
  const [toolArgsInput, setToolArgsInput] = useState("{}");
  const [toolCallOutput, setToolCallOutput] = useState<string | null>(null);
  const [toolCallLoading, setToolCallLoading] = useState(false);

  // Resource Direct Read State
  const [resourceModal, setResourceModal] = useState<{
    uri: string;
    name: string;
    content: string;
  } | null>(null);

  // ==========================================
  // Agent Execution State
  // ==========================================
  const [promptInput, setPromptInput] = useState(
    "请读取项目的 package.json 文件，告诉我项目的名字和依赖项有哪些？"
  );
  const [isRunningAgent, setIsRunningAgent] = useState(false);
  const [agentEvents, setAgentEvents] = useState<any[]>([]);
  const [agentFinalAnswer, setAgentFinalAnswer] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentStats, setAgentStats] = useState<{
    steps: number;
    durationMs: number;
    tokens?: number;
  } | null>(null);

  const framesEndRef = useRef<HTMLDivElement>(null);
  const agentOutputRef = useRef<HTMLDivElement>(null);

  // 1. 加载服务器与工具状态
  const fetchMcpStatus = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType: "server-status" }),
      });
      const data = await res.json();
      if (data.success) {
        setServers(data.servers || []);
        setTools(data.tools || []);
        setResources(data.resources || []);
        setFrames(data.frames || []);
      }
    } catch (err) {
      console.error("Failed to fetch MCP status:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMcpStatus();
  }, []);

  // 2. 连接服务器
  const handleConnectServer = async (serverId: string) => {
    setConnectingMap((prev) => ({ ...prev, [serverId]: true }));
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType: "connect-server", serverId }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchMcpStatus();
      } else {
        alert(`连接失败: ${data.error}`);
      }
    } catch (err: any) {
      alert(`连接异常: ${err.message}`);
    } finally {
      setConnectingMap((prev) => ({ ...prev, [serverId]: false }));
    }
  };

  // 3. 断开服务器
  const handleDisconnectServer = async (serverId: string) => {
    setConnectingMap((prev) => ({ ...prev, [serverId]: true }));
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType: "disconnect-server", serverId }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchMcpStatus();
      } else {
        alert(`断开失败: ${data.error}`);
      }
    } catch (err: any) {
      alert(`断开异常: ${err.message}`);
    } finally {
      setConnectingMap((prev) => ({ ...prev, [serverId]: false }));
    }
  };

  // 4. 发送原始 RPC
  const handleSendRawRpc = async () => {
    setRawRpcLoading(true);
    setRawRpcOutput(null);
    try {
      let parsedParams = {};
      if (rawRpcParams.trim()) {
        parsedParams = JSON.parse(rawRpcParams);
      }
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "raw-rpc",
          serverId: rawRpcServerId,
          method: rawRpcMethod,
          params: parsedParams,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRawRpcOutput(JSON.stringify(data.result, null, 2));
        setFrames(data.frames || []);
      } else {
        setRawRpcOutput(`Error: ${data.error}`);
      }
    } catch (err: any) {
      setRawRpcOutput(`JSON Parse or Network Error: ${err.message}`);
    } finally {
      setRawRpcLoading(false);
    }
  };

  // 5. 单测 Tool
  const handleCallTool = async () => {
    if (!selectedTool) return;
    setToolCallLoading(true);
    setToolCallOutput(null);
    try {
      const args = JSON.parse(toolArgsInput);
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "call-tool",
          serverId: selectedTool.serverId,
          toolName: selectedTool.tool.name,
          arguments: args,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setToolCallOutput(JSON.stringify(data.result, null, 2));
        setFrames(data.frames || []);
      } else {
        setToolCallOutput(`Error: ${data.error}`);
      }
    } catch (err: any) {
      setToolCallOutput(`Execution Error: ${err.message}`);
    } finally {
      setToolCallLoading(false);
    }
  };

  // 6. 读取 Resource
  const handleReadResource = async (serverId: string, uri: string, name: string) => {
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType: "read-resource", serverId, uri }),
      });
      const data = await res.json();
      if (data.success && data.result?.contents) {
        const text = data.result.contents
          .map((c: any) => c.text || `[Binary/Blob: ${c.mimeType}]`)
          .join("\n\n");
        setResourceModal({ uri, name, content: text });
        setFrames(data.frames || []);
      } else {
        alert(`读取失败: ${data.error}`);
      }
    } catch (err: any) {
      alert(`网络异常: ${err.message}`);
    }
  };

  // 7. 清空抓包
  const handleClearFrames = async () => {
    await fetch("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionType: "clear-frames" }),
    });
    setFrames([]);
  };

  // 8. 运行 Agent (SSE Stream)
  const handleRunAgent = async () => {
    if (!promptInput.trim()) return;
    setIsRunningAgent(true);
    setAgentEvents([]);
    setAgentFinalAnswer(null);
    setAgentError(null);
    setAgentStats(null);

    const activeServerIds = servers
      .filter((s) => s.status === "connected")
      .map((s) => s.id);

    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "run-agent",
          prompt: promptInput,
          apiKey: customApiKey,
          baseURL: customBaseURL,
          model: selectedModel,
          activeServerIds,
          maxSteps: 6,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const jsonStr = trimmed.slice(6);
          try {
            const event = JSON.parse(jsonStr);
            setAgentEvents((prev) => [...prev, event]);

            // 若包含抓包帧，实时追加至 frames 列表
            if (event.type === "json_rpc_frame" && event.frame) {
              setFrames((prev) => [...prev, event.frame]);
            }

            if (event.type === "agent_done") {
              setAgentFinalAnswer(event.finalAnswer);
              setAgentStats({
                steps: event.totalSteps,
                durationMs: event.totalDurationMs,
                tokens: event.tokenUsage?.totalTokens,
              });
            }

            if (event.type === "error") {
              setAgentError(event.message);
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } catch (err: any) {
      setAgentError(err.message || "Agent execution failed");
    } finally {
      setIsRunningAgent(false);
      // 刷新最新 server 状态
      fetchMcpStatus();
    }
  };

  const filteredFrames = frames.filter((f) => {
    if (!frameFilter) return true;
    const q = frameFilter.toLowerCase();
    return (
      f.method?.toLowerCase().includes(q) ||
      f.serverId.toLowerCase().includes(q) ||
      f.serverName.toLowerCase().includes(q) ||
      JSON.stringify(f.payload).toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 font-sans selection:bg-purple-500/30 flex flex-col">
      <Header
        hasServerKey={hasServerKey}
        model={selectedModel}
        defaultBaseURL={defaultBaseURL}
        customApiKey={customApiKey}
        onSaveApiKey={saveLocalKey}
        customBaseURL={customBaseURL}
        onSaveBaseURL={saveLocalBaseURL}
        onSaveSettings={handleSaveSettings}
        currentLesson={{
          id: "v8",
          title: "第 09 课: MCP 标准协议与插件解耦",
          badge: "V8",
        }}
      />

      <main className="flex-1 overflow-y-auto p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Top Hero Banner */}
        <div className="relative glass-panel p-6 rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/30 via-[#0d1322] to-indigo-950/20 overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 -mr-12 -mt-12 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-3xl">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold">
                  LESSON 09 · V8
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Model Context Protocol (MCP) Standard Client & Server
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex items-center gap-2.5">
                <Network className="w-7 h-7 text-cyan-400" />
                <span>MCP 标准协议与插件解耦</span>
              </h1>
              <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                告别工具硬编码与依赖冲突：基于{" "}
                <code className="text-cyan-300 font-mono">JSON-RPC 2.0</code>{" "}
                将代码库检查、数据库以及网络检索抽象为独立外设服务，实现 Agent 的
                <span className="text-purple-300 font-semibold">即插即用 Type-C 式</span>{" "}
                能力扩展。
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={fetchMcpStatus}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111728] hover:bg-[#182238] border border-slate-700/80 text-xs font-mono text-slate-300 transition"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`}
                />
                <span>刷新状态</span>
              </button>
              <Link
                to="/docs/lessons/09-mcp-standard-and-plugin-architecture.md"
                target="_blank"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-xs font-mono text-cyan-300 transition"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>查看原理讲义</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("hub")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono transition font-medium ${
              activeTab === "hub"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <Server className="w-3.5 h-3.5 text-cyan-400" />
            <span>1. MCP 拓扑控制台 (Server Hub)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
              {servers.filter((s) => s.status === "connected").length}/
              {servers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("explorer")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono transition font-medium ${
              activeTab === "explorer"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span>2. 能力与资产目录 (Capabilities Explorer)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
              {tools.length} Tools · {resources.length} Res
            </span>
          </button>

          <button
            onClick={() => setActiveTab("inspector")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono transition font-medium ${
              activeTab === "inspector"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span>3. 帧级报文抓包台 (Wire Protocol Inspector)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
              {frames.length} Frames
            </span>
          </button>

          <button
            onClick={() => setActiveTab("agent")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono transition font-medium ${
              activeTab === "agent"
                ? "bg-gradient-to-r from-purple-600/30 to-cyan-600/30 text-white border border-purple-500/50 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-300" />
            <span>4. 热插拔 Agent 实战 (Live Decoupled Agent)</span>
          </button>
        </div>

        {/* Tab 1: MCP Server Hub */}
        {activeTab === "hub" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>
                💡
                点击连接或断开服务器，观察动态工具发现（Tool Discovery）与能力解耦效果。
              </span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>已就绪</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-500" />
                  <span>未连接</span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {servers.map((srv) => {
                const isConn = srv.status === "connected";
                const isConnecting = connectingMap[srv.id];

                let Icon = Code2;
                let badgeColor = "border-cyan-500/40 text-cyan-300";
                if (srv.id.includes("database")) {
                  Icon = Database;
                  badgeColor = "border-purple-500/40 text-purple-300";
                } else if (srv.id.includes("browser")) {
                  Icon = Globe;
                  badgeColor = "border-amber-500/40 text-amber-300";
                }

                return (
                  <div
                    key={srv.id}
                    className={`glass-panel p-5 rounded-2xl border transition flex flex-col justify-between ${
                      isConn
                        ? "border-cyan-500/50 bg-[#0d1424] shadow-lg shadow-cyan-950/20"
                        : "border-slate-800 bg-[#090d18] opacity-80"
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`p-2 rounded-xl bg-slate-800/80 border ${badgeColor}`}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                              <span>{srv.name}</span>
                            </h3>
                            <span className="text-[10px] font-mono text-slate-400">
                              v{srv.version} · {srv.transportType}
                            </span>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            isConn
                              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                              : "bg-slate-800 text-slate-400 border border-slate-700"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isConn ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                            }`}
                          />
                          {isConn ? "CONNECTED" : "OFFLINE"}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed min-h-[36px]">
                        {srv.description}
                      </p>

                      {/* Capabilities Snapshot */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-center font-mono">
                        <div className="p-2 rounded-lg bg-[#111728] border border-slate-800">
                          <div className="text-[10px] text-slate-500">TOOLS</div>
                          <div className="text-sm font-bold text-cyan-300">
                            {srv.toolsCount}
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-[#111728] border border-slate-800">
                          <div className="text-[10px] text-slate-500">RES</div>
                          <div className="text-sm font-bold text-purple-300">
                            {srv.resourcesCount}
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-[#111728] border border-slate-800">
                          <div className="text-[10px] text-slate-500">LATENCY</div>
                          <div className="text-sm font-bold text-emerald-300">
                            {srv.latencyMs !== undefined ? `${srv.latencyMs}ms` : "-"}
                          </div>
                        </div>
                      </div>

                      {srv.error && (
                        <div className="p-2 rounded bg-rose-950/40 border border-rose-500/30 text-[11px] font-mono text-rose-300">
                          {srv.error}
                        </div>
                      )}
                    </div>

                    {/* Action button */}
                    <div className="pt-4 mt-2">
                      {isConn ? (
                        <button
                          onClick={() => handleDisconnectServer(srv.id)}
                          disabled={isConnecting}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-950/30 hover:bg-rose-900/40 text-rose-300 border border-rose-500/30 text-xs font-mono transition"
                        >
                          <Unplug className="w-3.5 h-3.5" />
                          <span>{isConnecting ? "正在断开..." : "断开连接 (Unplug)"}</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConnectServer(srv.id)}
                          disabled={isConnecting}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-medium shadow-lg shadow-cyan-600/30 transition"
                        >
                          <Plug className="w-3.5 h-3.5" />
                          <span>{isConnecting ? "握手协商中..." : "挂载连接 (Plug In)"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Architecture Explainer Card */}
            <div className="p-5 rounded-2xl bg-[#0e1424] border border-slate-800 space-y-3 text-xs">
              <div className="flex items-center gap-2 text-cyan-300 font-bold font-mono">
                <Sparkles className="w-4 h-4" />
                <span>MCP 架构核心洞见：单体硬编码 vs 解耦总线</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-300 font-mono text-[11px]">
                <div className="p-3 rounded-xl bg-[#090d18] border border-rose-500/30 space-y-1.5">
                  <div className="text-rose-400 font-bold">❌ 传统单体 Tool Calling 弊端:</div>
                  <ul className="list-disc list-inside space-y-1 text-slate-400">
                    <li>代码读写、数据库驱动、API SDK 全部打在 Agent 核心工程中；</li>
                    <li>新增一个工具需要修改 Agent 主源码并全量重新发布；</li>
                    <li>工具无法在沙箱、外部独立 VPC 或容器中做特权物理隔离。</li>
                  </ul>
                </div>

                <div className="p-3 rounded-xl bg-[#090d18] border border-emerald-500/30 space-y-1.5">
                  <div className="text-emerald-400 font-bold">✅ MCP 标准解耦优势:</div>
                  <ul className="list-disc list-inside space-y-1 text-slate-400">
                    <li>Agent 作为 MCP Client，只维持一个轻量标准 JSON-RPC 协议通道；</li>
                    <li>所有服务支持运行时热插拔（Hot-plug），无需重启 Agent 宿主；</li>
                    <li>遵循同一套协议规范，工具可在 Claude Code、Cursor、Mini-Claude 间完全复用！</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Capabilities & Schema Explorer */}
        {activeTab === "explorer" && (
          <div className="space-y-6">
            {/* Section A: Discovered Tools */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-cyan-400" />
                  <span>动态发现的工具库 (Discovered MCP Tools)</span>
                  <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                    {tools.length} available
                  </span>
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  点击“单测调用”可直接通过 JSON-RPC 测试执行
                </span>
              </div>

              {tools.length === 0 ? (
                <div className="p-8 rounded-xl bg-[#090d18] border border-slate-800 text-center text-xs font-mono text-slate-400 space-y-2">
                  <Unplug className="w-6 h-6 mx-auto text-slate-600" />
                  <div>当前无可用工具。请在第一栏“MCP 拓扑控制台”中挂载连接至少一个 MCP Server。</div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {tools.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-[#0d1424] border border-slate-800 hover:border-slate-700 transition space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono font-bold text-cyan-300">
                            {item.tool.name}
                          </code>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                            {item.serverName}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedTool({
                              serverId: item.serverId,
                              tool: item.tool,
                            });
                            setToolArgsInput(
                              JSON.stringify(
                                Object.fromEntries(
                                  Object.keys(
                                    item.tool.inputSchema.properties || {}
                                  ).map((k) => [k, ""])
                                ),
                                null,
                                2
                              )
                            );
                            setToolCallOutput(null);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 border border-cyan-500/40 text-[11px] font-mono flex items-center gap-1 transition"
                        >
                          <Play className="w-3 h-3" />
                          <span>单测调用</span>
                        </button>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">
                        {item.tool.description || "No description provided."}
                      </p>

                      <div className="p-2 rounded bg-[#090d18] border border-slate-800/80 text-[10px] font-mono text-slate-400 overflow-x-auto">
                        <span className="text-slate-500">参数 Schema: </span>
                        {JSON.stringify(item.tool.inputSchema.properties || {})}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section B: Discovered Resources */}
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-purple-400" />
                  <span>动态发现的资源列表 (Discovered MCP Resources)</span>
                  <span className="text-xs font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/30">
                    {resources.length} available
                  </span>
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  统一资源定位符 (URI) 驱动的只读上下文挂载
                </span>
              </div>

              {resources.length === 0 ? (
                <div className="p-6 rounded-xl bg-[#090d18] border border-slate-800 text-center text-xs font-mono text-slate-400">
                  当前无已发现的 Resource。
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {resources.map((resItem, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-[#0d1424] border border-slate-800 flex items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-purple-300 font-bold">
                            {resItem.resource.uri}
                          </code>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                            {resItem.serverName}
                          </span>
                        </div>
                        <div className="text-xs text-slate-300">
                          {resItem.resource.name} · {resItem.resource.description}
                        </div>
                      </div>

                      <button
                        onClick={() =>
                          handleReadResource(
                            resItem.serverId,
                            resItem.resource.uri,
                            resItem.resource.name
                          )
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/40 text-[11px] font-mono shrink-0 transition"
                      >
                        读取内容
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal: Tool Direct Test */}
            {selectedTool && (
              <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="glass-panel w-full max-w-lg p-6 rounded-2xl border border-cyan-500/40 bg-[#0e1424] space-y-4 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-cyan-400" />
                      <h3 className="font-bold text-white text-sm">
                        JSON-RPC 测试调用: <code>{selectedTool.tool.name}</code>
                      </h3>
                    </div>
                    <button
                      onClick={() => setSelectedTool(null)}
                      className="text-slate-400 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-mono text-slate-300">
                      输入 JSON 参数 (Arguments):
                    </label>
                    <textarea
                      rows={4}
                      value={toolArgsInput}
                      onChange={(e) => setToolArgsInput(e.target.value)}
                      className="w-full bg-[#090d18] border border-slate-700 rounded-lg p-2.5 text-xs font-mono text-cyan-200 outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setSelectedTool(null)}
                      className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleCallTool}
                      disabled={toolCallLoading}
                      className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-medium flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{toolCallLoading ? "执行中..." : "发送 tools/call"}</span>
                    </button>
                  </div>

                  {toolCallOutput && (
                    <div className="space-y-1 pt-2 border-t border-slate-800">
                      <div className="text-[11px] font-mono text-slate-400">
                        响应结果 (Result):
                      </div>
                      <pre className="p-3 rounded-lg bg-[#090d18] border border-slate-800 text-[11px] font-mono text-emerald-300 max-h-48 overflow-y-auto">
                        {toolCallOutput}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Modal: Read Resource Content */}
            {resourceModal && (
              <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="glass-panel w-full max-w-xl p-6 rounded-2xl border border-purple-500/40 bg-[#0e1424] space-y-4 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-purple-400" />
                      <h3 className="font-bold text-white text-sm font-mono">
                        {resourceModal.uri}
                      </h3>
                    </div>
                    <button
                      onClick={() => setResourceModal(null)}
                      className="text-slate-400 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  </div>

                  <pre className="p-3.5 rounded-xl bg-[#090d18] border border-slate-800 text-xs font-mono text-purple-200 max-h-80 overflow-y-auto whitespace-pre-wrap">
                    {resourceModal.content}
                  </pre>

                  <div className="flex justify-end">
                    <button
                      onClick={() => setResourceModal(null)}
                      className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200"
                    >
                      关闭
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: JSON-RPC Wire Protocol Inspector */}
        {activeTab === "inspector" && (
          <div className="space-y-4">
            {/* Top Toolbar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-xl bg-[#0c111e] border border-slate-800">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="过滤报文：method, serverId, payload 内容..."
                  value={frameFilter}
                  onChange={(e) => setFrameFilter(e.target.value)}
                  className="w-full bg-transparent text-xs font-mono text-slate-200 outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-400">
                  共计 {filteredFrames.length} 帧报文
                </span>
                <button
                  onClick={handleClearFrames}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 text-xs font-mono transition"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>清空抓包</span>
                </button>
              </div>
            </div>

            {/* Manual Raw RPC Testing Bar */}
            <div className="p-4 rounded-xl bg-[#0d1424] border border-cyan-500/30 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>极客实验室：手工构造发送原始 JSON-RPC 报文</span>
                </span>
                <span className="text-slate-500 text-[10px]">
                  协议规范: JSON-RPC 2.0
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-slate-400 block mb-1">
                    目标 MCP Server:
                  </label>
                  <select
                    value={rawRpcServerId}
                    onChange={(e) => setRawRpcServerId(e.target.value)}
                    className="w-full bg-[#090d18] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200 outline-none"
                  >
                    {servers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-slate-400 block mb-1">
                    Method (协议方法):
                  </label>
                  <input
                    type="text"
                    value={rawRpcMethod}
                    onChange={(e) => setRawRpcMethod(e.target.value)}
                    placeholder="tools/list, ping, resources/list..."
                    className="w-full bg-[#090d18] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-cyan-200 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-mono text-slate-400 block mb-1">
                    Params (JSON 格式):
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={rawRpcParams}
                      onChange={(e) => setRawRpcParams(e.target.value)}
                      placeholder="{}"
                      className="flex-1 bg-[#090d18] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-cyan-200 outline-none"
                    />
                    <button
                      onClick={handleSendRawRpc}
                      disabled={rawRpcLoading}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold shrink-0 flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" />
                      <span>发送</span>
                    </button>
                  </div>
                </div>
              </div>

              {rawRpcOutput && (
                <div className="mt-2 p-2.5 rounded bg-[#090d18] border border-slate-800 text-[11px] font-mono text-emerald-300 max-h-36 overflow-y-auto">
                  {rawRpcOutput}
                </div>
              )}
            </div>

            {/* Wire Frames Stream List */}
            <div className="space-y-2">
              {filteredFrames.length === 0 ? (
                <div className="p-8 rounded-xl bg-[#090d18] border border-slate-800 text-center text-xs font-mono text-slate-500">
                  暂无捕获到的 JSON-RPC 通信报文。请在控制台触发连接、单测或 Agent
                  对话。
                </div>
              ) : (
                filteredFrames.map((frame) => {
                  const isOut = frame.direction === "outbound";
                  const isExpanded = expandedFrameId === frame.id;

                  return (
                    <div
                      key={frame.id}
                      className={`p-3 rounded-xl border transition text-xs font-mono ${
                        isOut
                          ? "bg-[#0b101c] border-cyan-500/30"
                          : "bg-[#0f1422] border-purple-500/30"
                      }`}
                    >
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() =>
                          setExpandedFrameId(isExpanded ? null : frame.id)
                        }
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isOut
                                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                                : "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                            }`}
                          >
                            {isOut ? "OUTBOUND (Client → Server)" : "INBOUND (Server → Client)"}
                          </span>

                          <span className="text-slate-300 font-semibold">
                            {frame.serverName}
                          </span>

                          {frame.method && (
                            <span className="text-amber-300 font-bold bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/30">
                              {frame.method}
                            </span>
                          )}

                          {frame.rpcId && (
                            <span className="text-slate-500 text-[10px]">
                              id: {String(frame.rpcId)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2.5">
                          {frame.durationMs !== undefined && (
                            <span className="text-emerald-400 text-[10px] flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>{frame.durationMs}ms</span>
                            </span>
                          )}
                          <span className="text-slate-500 text-[10px]">
                            {new Date(frame.timestamp).toLocaleTimeString()}
                          </span>
                          <span className="text-slate-400 text-[10px]">
                            {isExpanded ? "收起 ▲" : "展开详情 ▼"}
                          </span>
                        </div>
                      </div>

                      {/* Expanded Raw Payload */}
                      {isExpanded && (
                        <div className="mt-2 pt-2 border-t border-slate-800">
                          <pre className="p-2.5 rounded bg-[#070a12] text-[11px] text-slate-300 overflow-x-auto">
                            {JSON.stringify(frame.payload, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={framesEndRef} />
            </div>
          </div>
        )}

        {/* Tab 4: Live Decoupled Agent Workbench */}
        {activeTab === "agent" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: Input & Presets (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              {/* Mounted MCP Server Badges */}
              <div className="p-3.5 rounded-xl bg-[#0d1424] border border-cyan-500/30 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <Plug className="w-3.5 h-3.5 text-cyan-400" />
                    <span>当前 Agent 挂载的 MCP 外设:</span>
                  </span>
                  <span className="text-cyan-300 text-[11px]">
                    {servers.filter((s) => s.status === "connected").length} 个已激活
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {servers.map((s) => {
                    const isConn = s.status === "connected";
                    return (
                      <span
                        key={s.id}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1 border ${
                          isConn
                            ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                            : "bg-slate-900 border-slate-800 text-slate-500"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isConn ? "bg-cyan-400" : "bg-slate-600"
                          }`}
                        />
                        <span>{s.name}</span>
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Task Presets */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-400">
                  推荐对照实验任务 (点击即可载入):
                </label>
                <div className="space-y-1.5">
                  <button
                    onClick={() =>
                      setPromptInput(
                        "请读取 package.json 文件，并查找代码库中包含 'McpServer' 的关键代码位置。"
                      )
                    }
                    className="w-full text-left p-2 rounded-lg bg-[#0d1424] hover:bg-[#131d33] border border-slate-800 text-xs font-mono text-slate-300 transition"
                  >
                    <div className="text-cyan-300 font-semibold">
                      🧪 任务 1: 代码库浏览与关键字定位
                    </div>
                    <div className="text-[11px] text-slate-400">
                      触发 Mini Code MCP Server 的 code_read_file & code_search_symbols
                    </div>
                  </button>

                  <button
                    onClick={() =>
                      setPromptInput(
                        "请列出当前数据库里的所有数据表，并执行只读 SQL 查询其中的管理员用户信息。"
                      )
                    }
                    className="w-full text-left p-2 rounded-lg bg-[#0d1424] hover:bg-[#131d33] border border-slate-800 text-xs font-mono text-slate-300 transition"
                  >
                    <div className="text-purple-300 font-semibold">
                      🧪 任务 2: 数据库模式查询与只读 SQL
                    </div>
                    <div className="text-[11px] text-slate-400">
                      触发 Database MCP Server 的 db_list_tables & db_query
                    </div>
                  </button>

                  <button
                    onClick={() =>
                      setPromptInput(
                        "请访问 https://modelcontextprotocol.io 抓取并总结 MCP 的三大核心支柱概念。"
                      )
                    }
                    className="w-full text-left p-2 rounded-lg bg-[#0d1424] hover:bg-[#131d33] border border-slate-800 text-xs font-mono text-slate-300 transition"
                  >
                    <div className="text-amber-300 font-semibold">
                      🧪 任务 3: 在线网页内容抓取与总结
                    </div>
                    <div className="text-[11px] text-slate-400">
                      触发 Browser MCP Server 的 browser_fetch_page
                    </div>
                  </button>

                  <button
                    onClick={() =>
                      setPromptInput(
                        "测试热拔插边界：在断开 Mini Code Server 的情况下，要求 Agent 查看代码文件。"
                      )
                    }
                    className="w-full text-left p-2 rounded-lg bg-[#0d1424] hover:bg-[#131d33] border border-rose-500/30 text-xs font-mono text-slate-300 transition"
                  >
                    <div className="text-rose-400 font-semibold">
                      ⚠️ 任务 4: 热拔插与缺失外设自知性测试
                    </div>
                    <div className="text-[11px] text-slate-400">
                      验证 Agent 是否能如实汇报未安装对应 MCP 外设，而非产生幻觉
                    </div>
                  </button>
                </div>
              </div>

              {/* Task Input Box */}
              <div className="space-y-2">
                <label className="text-xs font-mono text-slate-300">
                  Agent 任务指令:
                </label>
                <textarea
                  rows={4}
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="输入要求 Agent 完成的复杂任务..."
                  className="w-full bg-[#0d1424] border border-slate-700 rounded-xl p-3 text-xs text-slate-100 font-mono outline-none focus:border-cyan-500 transition"
                />

                <button
                  onClick={handleRunAgent}
                  disabled={isRunningAgent}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white font-medium text-xs shadow-lg shadow-cyan-600/30 transition flex items-center justify-center gap-2"
                >
                  <Play className={`w-4 h-4 ${isRunningAgent ? "animate-spin" : ""}`} />
                  <span>
                    {isRunningAgent ? "Agent 执行中 (RPC 交互中)..." : "开始执行 Agent 任务"}
                  </span>
                </button>
              </div>
            </div>

            {/* Right: Live ReAct Execution Trace (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="glass-panel p-4 rounded-2xl border border-slate-800 bg-[#0c111e] min-h-[500px] flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-cyan-400" />
                      <h3 className="font-bold text-xs font-mono text-white">
                        实时全链路执行轨迹 (Real-time ReAct & MCP Trace)
                      </h3>
                    </div>

                    {agentStats && (
                      <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                        <span>{agentStats.steps} 步</span>
                        <span>·</span>
                        <span>{agentStats.durationMs}ms</span>
                        <span>·</span>
                        <span className="text-purple-300">
                          {agentStats.tokens} Tokens
                        </span>
                      </div>
                    )}
                  </div>

                  {agentEvents.length === 0 && !isRunningAgent && (
                    <div className="py-20 text-center text-xs font-mono text-slate-500 space-y-2">
                      <Cpu className="w-8 h-8 mx-auto text-slate-700" />
                      <div>请在左侧选择测试任务或输入自定义指令，点击执行。</div>
                    </div>
                  )}

                  {/* Events timeline */}
                  <div
                    ref={agentOutputRef}
                    className="space-y-3 max-h-[550px] overflow-y-auto pr-1"
                  >
                    {agentEvents.map((evt, idx) => {
                      if (evt.type === "agent_start") {
                        return (
                          <div
                            key={idx}
                            className="p-2.5 rounded-lg bg-[#111827] border border-cyan-500/30 text-[11px] font-mono text-cyan-300"
                          >
                            🚀 任务启动: &quot;{evt.task}&quot; (活跃 MCP 外设:{" "}
                            {evt.activeServers?.length} 个)
                          </div>
                        );
                      }

                      if (evt.type === "mcp_synced") {
                        return (
                          <div
                            key={idx}
                            className="p-2 rounded bg-purple-950/20 border border-purple-500/30 text-[10px] font-mono text-purple-300 space-y-1"
                          >
                            <div>
                              🔌 MCP 能力同步完成: 注入 {evt.toolCount} 个工具 (
                              {evt.toolNames?.join(", ")})
                            </div>
                            {evt.injectedResources?.length > 0 && (
                              <div className="text-slate-400">
                                📄 已自动挂载 Resource 上下文:{" "}
                                {evt.injectedResources
                                  .map((r: any) => r.uri)
                                  .join(", ")}
                              </div>
                            )}
                          </div>
                        );
                      }

                      if (evt.type === "thought") {
                        return (
                          <div
                            key={idx}
                            className="p-3 rounded-xl bg-[#131929] border border-slate-700/60 text-xs font-mono space-y-1"
                          >
                            <div className="text-[10px] text-amber-400 font-bold">
                              🤔 Thought (Step {evt.step}):
                            </div>
                            <div className="text-slate-200 whitespace-pre-wrap leading-relaxed">
                              {evt.content}
                            </div>
                          </div>
                        );
                      }

                      if (evt.type === "tool_start") {
                        return (
                          <div
                            key={idx}
                            className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/40 text-xs font-mono space-y-2"
                          >
                            <div className="text-[10px] text-cyan-400 font-bold flex items-center gap-1.5">
                              <Zap className="w-3.5 h-3.5" />
                              <span>Action: 发起 MCP 工具调用 (JSON-RPC)</span>
                            </div>
                            {evt.toolCalls?.map((tc: any, tcIdx: number) => (
                              <div
                                key={tcIdx}
                                className="p-2 rounded bg-[#090d18] border border-slate-800 text-[11px]"
                              >
                                <div className="text-cyan-200 font-bold">
                                  {tc.function.name}
                                </div>
                                <div className="text-slate-400 text-[10px]">
                                  参数: {tc.function.arguments}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      }

                      if (evt.type === "tool_end") {
                        return (
                          <div
                            key={idx}
                            className="p-3 rounded-xl bg-[#090d18] border border-slate-800 text-xs font-mono space-y-1.5"
                          >
                            <div className="text-[10px] text-emerald-400 font-bold">
                              👁️ Observation (MCP 工具执行回执):
                            </div>
                            {evt.toolResults?.map((tr: any, trIdx: number) => (
                              <pre
                                key={trIdx}
                                className="p-2 rounded bg-[#0d1424] text-[11px] text-emerald-200 overflow-x-auto max-h-36"
                              >
                                {tr.output}
                              </pre>
                            ))}
                          </div>
                        );
                      }

                      return null;
                    })}

                    {agentFinalAnswer && (
                      <div className="p-4 rounded-xl bg-gradient-to-br from-purple-950/30 to-indigo-950/20 border border-purple-500/40 text-xs font-mono space-y-2">
                        <div className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>🎯 Agent 最终解答:</span>
                        </div>
                        <div className="text-slate-100 whitespace-pre-wrap leading-relaxed text-xs">
                          {agentFinalAnswer}
                        </div>
                      </div>
                    )}

                    {agentError && (
                      <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/40 text-xs font-mono text-rose-300 space-y-1">
                        <div className="font-bold flex items-center gap-1.5">
                          <XCircle className="w-4 h-4" />
                          <span>执行报错:</span>
                        </div>
                        <div>{agentError}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer hint */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
                  <span>
                    每次工具调用均由 MCP Client 自动封装为 JSON-RPC tools/call 帧
                  </span>
                  <button
                    onClick={() => setActiveTab("inspector")}
                    className="text-cyan-400 hover:text-cyan-300 transition flex items-center gap-1"
                  >
                    <span>在抓包台中查看全部原始帧</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

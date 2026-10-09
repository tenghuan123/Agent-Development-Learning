import { useState } from "react";
import { Link, useLocation } from "react-router";
import {
  Sparkles,
  Cpu,
  ChevronDown,
  Layers,
  Wrench,
  Terminal,
  Code2,
  Compass,
  Settings2,
  Eye,
  EyeOff,
  Check,
  Scissors,
  Brain,
  ShieldCheck,
  Network,
  ShieldAlert,
  Flame,
  Server,
  Zap,
  FolderTree,
  GitFork,
  Sliders,
  Boxes,
  GitBranch,
  Database,
  BookOpen,
  Search,
  AlertTriangle,
  Trash2,
  Shield,
  ExternalLink,
} from "lucide-react";
import { getLessonDocPath } from "~/lib/docs-catalog";
import {
  useLLMClientConfig,
  PROVIDER_PRESETS,
  maskApiKey,
  type ProviderPreset,
} from "~/lib/llm-client-storage";

export interface HeaderProps {
  hasServerKey: boolean;
  model: string;
  defaultBaseURL?: string;
  customApiKey?: string;
  onSaveApiKey?: (key: string) => void;
  customBaseURL?: string;
  onSaveBaseURL?: (url: string) => void;
  onSaveSettings?: (settings: {
    apiKey: string;
    baseURL: string;
    model?: string;
  }) => void;
  currentLesson?: {
    id: string;
    title: string;
    badge: string;
  };
}

export function Header({
  hasServerKey,
  model,
  defaultBaseURL = "https://open.bigmodel.cn/api/paas/v4",
  customApiKey = "",
  onSaveApiKey,
  customBaseURL = "",
  onSaveBaseURL,
  onSaveSettings,
  currentLesson,
}: HeaderProps) {
  const location = useLocation();
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showLessonDropdown, setShowLessonDropdown] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");

  // 基于 useSyncExternalStore 的全局响应式端侧存储 Hook
  const { config: clientConfig, saveConfig, clearConfig } = useLLMClientConfig({
    baseURL: defaultBaseURL,
    model,
  });

  // 优先级：显式传入的 props > 浏览器端侧 LocalStorage > 服务器默认环境变量
  const effectiveApiKey =
    customApiKey && customApiKey.trim().length > 0
      ? customApiKey.trim()
      : clientConfig.apiKey;
  const effectiveBaseURL =
    customBaseURL && customBaseURL.trim().length > 0
      ? customBaseURL.trim()
      : clientConfig.baseURL || defaultBaseURL;
  const effectiveModel = clientConfig.model || model;

  const currentDocPath = getLessonDocPath(
    currentLesson?.id || location.pathname
  );

  // 弹窗内的表单瞬态
  const [modalApiKey, setModalApiKey] = useState(effectiveApiKey);
  const [modalBaseURL, setModalBaseURL] = useState(effectiveBaseURL);
  const [modalModel, setModalModel] = useState(effectiveModel);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("zhipu");

  const handleOpenModal = () => {
    setModalApiKey(effectiveApiKey);
    setModalBaseURL(effectiveBaseURL);
    setModalModel(effectiveModel);

    // 自动匹配预设
    const matched = PROVIDER_PRESETS.find(
      (p) => p.baseURL && p.baseURL.toLowerCase() === effectiveBaseURL.toLowerCase()
    );
    setSelectedPresetId(matched ? matched.id : "custom");
    setSaveSuccessMsg("");
    setShowConfigModal(true);
  };

  const handleSelectPreset = (preset: ProviderPreset) => {
    setSelectedPresetId(preset.id);
    if (preset.baseURL) {
      setModalBaseURL(preset.baseURL);
    }
    if (preset.recommendedModel) {
      setModalModel(preset.recommendedModel);
    }
  };

  const contextLessons = [
    {
      path: "/lessons/context-c0-setup",
      tag: "C0",
      title: "第 00 课: 建立实验环境与私有语料库",
      icon: Database,
      color: "text-purple-400",
      badge: "实验底座",
    },
    {
      path: "/lessons/context-c1-why-context",
      tag: "C1",
      title: "第 01 课: 模型不知道答案怎么办？(第一性原理)",
      icon: Brain,
      color: "text-indigo-400",
      badge: "上下文起源",
    },
    {
      path: "/lessons/context-c2-sufficient-context",
      tag: "C2",
      title: "第 02 课: Context 越多越好吗？(Sufficient Context)",
      icon: Scissors,
      color: "text-cyan-400",
      badge: "信息密度",
    },
    {
      path: "/lessons/context-c3-lexical-search",
      tag: "C3",
      title: "第 03 课: 数据很多怎么找到相关信息？(Lexical Search)",
      icon: Search,
      color: "text-amber-400",
      badge: "词法检索",
    },
    {
      path: "/lessons/context-c4-semantic-search",
      tag: "C4",
      title: "第 04 课: 字符串不同但意思一样怎么办？(Semantic Search)",
      icon: Sparkles,
      color: "text-purple-400",
      badge: "语义检索",
    },
    {
      path: "/lessons/context-c5-semantic-vs-lexical",
      tag: "C5",
      title: "第 05 课: Semantic 能替代关键词搜索吗？(失真边界)",
      icon: AlertTriangle,
      color: "text-rose-400",
      badge: "边界认知",
    },
    {
      path: "/lessons/context-c6-hybrid-retrieval",
      tag: "C6",
      title: "第 06 课: 为什么不能一起用？(Hybrid Retrieval 与 RRF)",
      icon: Network,
      color: "text-cyan-400",
      badge: "混合检索",
    },
    {
      path: "/lessons/context-c7-reranking",
      tag: "C7",
      title: "第 07 课: 粗排捞出了候选，但谁最相关？(Cross-Encoder Reranking)",
      icon: Sliders,
      color: "text-teal-400",
      badge: "精排重排",
    },
    {
      path: "/lessons/context-c8-chunking",
      tag: "C8",
      title: "第 08 课: 为什么需要 Chunk？(切分粒度与语义边界)",
      icon: Scissors,
      color: "text-blue-400",
      badge: "切分几何",
    },
    {
      path: "/lessons/context-c9-small-to-big",
      tag: "C9",
      title: "第 09 课: 检索粒度与注入粒度解耦 (Small-to-Big 架构)",
      icon: Boxes,
      color: "text-indigo-400",
      badge: "两级架构",
    },
    {
      path: "/lessons/context-c10-contextual-retrieval",
      tag: "C10",
      title: "第 10 课: Chunk 自己脱离语境无意义？(Contextual Retrieval)",
      icon: FolderTree,
      color: "text-emerald-400",
      badge: "语境保真",
    },
    {
      path: "/lessons/context-c11-agentic-retrieval",
      tag: "C11",
      title: "第 11 课: 一次 Retrieval 够吗？(Agentic Retrieval)",
      icon: Zap,
      color: "text-amber-400",
      badge: "推理检索",
    },
    {
      path: "/lessons/context-c12-budget-management",
      tag: "C12",
      title: "第 12 课: Agent 为什么过度检索？(预算调度与熔断)",
      icon: ShieldAlert,
      color: "text-rose-400",
      badge: "预算熔断",
    },
    {
      path: "/lessons/context-c13-context-assembly",
      tag: "C13",
      title: "第 13 课: 上下文装配与布局 (Context Assembly)",
      icon: Layers,
      color: "text-indigo-400",
      badge: "装配几何",
    },
    {
      path: "/lessons/context-c14-compaction",
      tag: "C14",
      title: "第 14 课: 长任务 Context 提炼 (Context Compaction)",
      icon: Sliders,
      color: "text-cyan-400",
      badge: "状态提炼",
    },
    {
      path: "/lessons/context-c15-memory-persistence",
      tag: "C15",
      title: "第 15 课: 跨会话外脑与持久化 (Memory Persistence)",
      icon: Brain,
      color: "text-purple-400",
      badge: "持久外脑",
    },
  ];

  const semester2Lessons = [
    {
      path: "/lessons/v12-agent-runtime",
      tag: "V12",
      title: "第 13 课: Agent Loop vs Coding Agent Runtime",
      icon: Zap,
      color: "text-cyan-300",
      badge: "Pi 架构",
    },
    {
      path: "/lessons/v13-event-driven",
      tag: "V13",
      title: "第 14 课: Agent 为什么必须是 Event-Driven？",
      icon: Network,
      color: "text-indigo-400",
      badge: "Pi 观察平面",
    },
    {
      path: "/lessons/v14-session-management",
      tag: "V14",
      title: "第 15 课: Session 为什么不是 Messages？",
      icon: FolderTree,
      color: "text-emerald-400",
      badge: "Pi 时空架构",
    },
    {
      path: "/lessons/v15-branching-and-time-travel",
      tag: "V15",
      title: "第 16 课: 为什么 Coding Agent 需要 Branch？",
      icon: GitFork,
      color: "text-amber-400",
      badge: "Pi 分支推演",
    },
    {
      path: "/lessons/v16-context-compaction",
      tag: "V16",
      title: "第 17 课: Context Compaction 为什么不是“总结聊天记录”？",
      icon: Sliders,
      color: "text-teal-400",
      badge: "Pi 预算治理",
    },
    {
      path: "/lessons/v17-extensions-and-skills",
      tag: "V17",
      title: "第 18 课: 为什么成熟 Agent 绝不应该修改 Core？(Pi 扩展架构)",
      icon: Boxes,
      color: "text-rose-400",
      badge: "Pi 单元毕业",
    },
    {
      path: "/lessons/v18-while-loop-collapse",
      tag: "V18",
      title: "第 19 课: 什么时候 while loop 开始失控？(LangGraph 篇)",
      icon: GitBranch,
      color: "text-amber-400",
      badge: "LangGraph 篇开篇",
    },
    {
      path: "/lessons/v19-state-graph",
      tag: "V19",
      title: "第 20 课: Graph 是什么？—— 从零手写 StateGraph",
      icon: Network,
      color: "text-indigo-400",
      badge: "LangGraph 工业级",
    },
    {
      path: "/lessons/v20-messages-vs-state",
      tag: "V20",
      title: "第 21 课: Messages 为什么不能当 State？",
      icon: Database,
      color: "text-purple-400",
      badge: "LangGraph 状态架构",
    },
  ];

  const semester1Lessons = [
    {
      path: "/lessons/v0-llm-chat",
      tag: "V0",
      title: "第 01 课: LLM 原生机制与结构化输出",
      icon: Terminal,
      color: "text-indigo-400",
    },
    {
      path: "/lessons/v1-tool-calling",
      tag: "V1",
      title: "第 02 课: Tool Calling 机制与行动力破局",
      icon: Wrench,
      color: "text-cyan-400",
    },
    {
      path: "/lessons/v2-agent-loop",
      tag: "V2",
      title: "第 03 课: Agent Loop 与 ReAct 闭环",
      icon: Layers,
      color: "text-amber-400",
    },
    {
      path: "/lessons/v3-coding-agent",
      tag: "V3",
      title: "第 04 课: Coding Agent 与代码自愈",
      icon: Code2,
      color: "text-emerald-400",
    },
    {
      path: "/lessons/v4-planning",
      tag: "V4",
      title: "第 05 课: Planning 与复杂任务规划",
      icon: Compass,
      color: "text-purple-400",
    },
    {
      path: "/lessons/v5-context-engine",
      tag: "V5",
      title: "第 06 课: Context Engine 与上下文防御",
      icon: Scissors,
      color: "text-cyan-400",
    },
    {
      path: "/lessons/v6-memory",
      tag: "V6",
      title: "第 07 课: Memory 与状态机持久化",
      icon: Brain,
      color: "text-purple-400",
    },
    {
      path: "/lessons/v7-harness",
      tag: "V7",
      title: "第 08 课: Harness 与安全沙箱权限隔离",
      icon: ShieldCheck,
      color: "text-rose-400",
    },
    {
      path: "/lessons/v8-mcp",
      tag: "V8",
      title: "第 09 课: MCP 标准协议与插件解耦",
      icon: Network,
      color: "text-cyan-400",
    },
    {
      path: "/lessons/v9-durable-exec",
      tag: "V9",
      title: "第 10 课: Durable Execution 与状态恢复",
      icon: ShieldAlert,
      color: "text-amber-400",
    },
    {
      path: "/lessons/v10-eval-tracing",
      tag: "V10",
      title: "第 11 课: Agent 评测体系与全链路 Tracing",
      icon: Flame,
      color: "text-rose-400",
    },
    {
      path: "/lessons/v11-production-agent",
      tag: "V11",
      title: "第 12 课: Production Agent 生产级韧性",
      icon: Server,
      color: "text-emerald-400",
    },
  ];

  const handleSaveModal = () => {
    const trimmedKey = modalApiKey.trim();
    const trimmedURL = modalBaseURL.trim();
    const trimmedModel = modalModel.trim();

    saveConfig({
      apiKey: trimmedKey,
      baseURL: trimmedURL,
      model: trimmedModel,
    });

    if (onSaveApiKey) {
      onSaveApiKey(trimmedKey);
    }
    if (onSaveBaseURL) {
      onSaveBaseURL(trimmedURL);
    }
    if (onSaveSettings) {
      onSaveSettings({
        apiKey: trimmedKey,
        baseURL: trimmedURL,
        model: trimmedModel,
      });
    }

    setSaveSuccessMsg("配置已保存至本地 LocalStorage，全站立即生效！");
    setTimeout(() => {
      setShowConfigModal(false);
      setSaveSuccessMsg("");
    }, 600);
  };

  const handleClearModal = () => {
    clearConfig();
    setModalApiKey("");
    setModalBaseURL(defaultBaseURL);
    setModalModel(model);
    setSelectedPresetId("zhipu");

    if (onSaveApiKey) onSaveApiKey("");
    if (onSaveBaseURL) onSaveBaseURL(defaultBaseURL);
    if (onSaveSettings) {
      onSaveSettings({
        apiKey: "",
        baseURL: defaultBaseURL,
        model,
      });
    }

    setSaveSuccessMsg("已清空本地浏览器密钥与自定义配置！");
    setTimeout(() => {
      setSaveSuccessMsg("");
    }, 1500);
  };

  return (
    <>
      <header className="h-14 border-b border-slate-800/80 bg-[#0c101c] px-6 flex items-center justify-between shrink-0 z-30 relative">
        {/* Left: Brand & Lesson Switcher */}
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-2.5 group transition"
            title="返回课程主页"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-purple-500/20 group-hover:scale-105 transition">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm tracking-wide text-white group-hover:text-purple-300 transition">
                  Mini Claude Code
                </h1>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Course
                </span>
              </div>
            </div>
          </Link>

          <div className="h-4 w-px bg-slate-800 hidden sm:block" />

          {/* Lesson Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowLessonDropdown(!showLessonDropdown)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#111728] hover:bg-[#162035] border border-slate-700/60 text-xs text-slate-200 transition font-medium"
            >
              {currentLesson ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold">
                    {currentLesson.badge}
                  </span>
                  <span className="text-slate-200">{currentLesson.title}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>课程目录导航</span>
                </div>
              )}
              <ChevronDown className="w-3 h-3 text-slate-400 ml-1" />
            </button>

            {showLessonDropdown && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowLessonDropdown(false)}
                />
                <div className="absolute left-0 mt-2 w-[380px] sm:w-[420px] max-w-[calc(100vw-2rem)] max-h-[82vh] overflow-y-auto rounded-xl bg-[#0f1526] border border-slate-700 shadow-2xl p-2 z-50 space-y-1">
                  <Link
                    to="/"
                    onClick={() => setShowLessonDropdown(false)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition ${
                      location.pathname === "/"
                        ? "bg-purple-600/20 text-purple-300 font-medium"
                        : "text-slate-300 hover:bg-slate-800/60"
                    }`}
                  >
                    <Layers className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span className="truncate">🗺️ 课程总览 & 演进全景路线</span>
                  </Link>

                  <Link
                    to="/docs/README.md"
                    onClick={() => setShowLessonDropdown(false)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition ${
                      location.pathname.startsWith("/docs")
                        ? "bg-indigo-600/20 text-indigo-300 font-medium"
                        : "text-indigo-300 hover:bg-slate-800/60"
                    }`}
                  >
                    <BookOpen className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                    <span className="truncate">📚 讲义中心 & 技术文档库</span>
                  </Link>

                  {/* Context Engineering Track */}
                  <div className="pt-2 pb-1 px-3 flex items-center justify-between text-[11px] font-semibold tracking-wider text-purple-400 border-t border-slate-800 uppercase">
                    <span className="flex items-center gap-1">
                      <Brain className="w-3.5 h-3.5 text-purple-400" />
                      <span>Context Engineering 专项</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-normal">新开篇</span>
                  </div>

                  {contextLessons.map((lesson) => {
                    const Icon = lesson.icon;
                    const isActive = location.pathname === lesson.path;
                    return (
                      <Link
                        key={lesson.path}
                        to={lesson.path}
                        title={lesson.title}
                        onClick={() => setShowLessonDropdown(false)}
                        className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-xs transition border ${
                          isActive
                            ? "bg-purple-950/40 text-purple-300 border-purple-500/40 font-medium"
                            : "border-transparent text-slate-300 hover:bg-slate-800/60 hover:text-purple-200"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Icon className={`w-4 h-4 flex-shrink-0 ${lesson.color}`} />
                          <span className="font-medium truncate">{lesson.title}</span>
                        </div>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border flex-shrink-0 whitespace-nowrap ${
                            isActive
                              ? "bg-purple-500/30 text-purple-200 border-purple-500/50 font-bold"
                              : "bg-purple-500/15 text-purple-300 border-purple-500/30"
                          }`}
                        >
                          {lesson.tag}
                        </span>
                      </Link>
                    );
                  })}

                  {/* Semester 1 */}
                  <div className="pt-2 pb-1 px-3 flex items-center justify-between text-[11px] font-semibold tracking-wider text-slate-400 border-t border-slate-800 uppercase">
                    <span>第一学期 · 手写 Agent 引擎</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-normal">已结课</span>
                  </div>

                  {semester1Lessons.map((lesson) => {
                    const Icon = lesson.icon;
                    const isActive = location.pathname === lesson.path;
                    return (
                      <Link
                        key={lesson.path}
                        to={lesson.path}
                        title={lesson.title}
                        onClick={() => setShowLessonDropdown(false)}
                        className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-xs transition border ${
                          isActive
                            ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/40 font-medium"
                            : "border-transparent text-slate-300 hover:bg-slate-800/60 hover:text-slate-200"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Icon className={`w-4 h-4 flex-shrink-0 ${lesson.color}`} />
                          <span className="font-medium truncate">{lesson.title}</span>
                        </div>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border flex-shrink-0 whitespace-nowrap ${
                            isActive
                              ? "bg-indigo-500/30 text-indigo-200 border-indigo-500/50 font-bold"
                              : "bg-slate-800/80 text-slate-400 border-slate-700/50"
                          }`}
                        >
                          {lesson.tag}
                        </span>
                      </Link>
                    );
                  })}

                  {/* Semester 2 */}
                  <div className="pt-3 pb-1 px-3 flex items-center justify-between text-[11px] font-semibold tracking-wider text-cyan-400 border-t border-slate-800 uppercase">
                    <span>第二学期 · Runtime 工程</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-normal">进行中</span>
                  </div>

                  {semester2Lessons.map((lesson) => {
                    const Icon = lesson.icon;
                    const isActive = location.pathname === lesson.path;
                    return (
                      <Link
                        key={lesson.path}
                        to={lesson.path}
                        title={lesson.title}
                        onClick={() => setShowLessonDropdown(false)}
                        className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-xs transition border ${
                          isActive
                            ? "bg-cyan-950/40 text-cyan-300 border-cyan-500/40 font-medium"
                            : "border-transparent text-slate-300 hover:bg-slate-800/60 hover:text-cyan-200"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Icon className={`w-4 h-4 flex-shrink-0 ${lesson.color}`} />
                          <span className="font-medium truncate">{lesson.title}</span>
                        </div>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border flex-shrink-0 whitespace-nowrap ${
                            isActive
                              ? "bg-cyan-500/30 text-cyan-200 border-cyan-500/50 font-bold"
                              : "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                          }`}
                        >
                          {lesson.tag}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {currentDocPath && (
            <Link
              to={currentDocPath}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/30 text-xs text-indigo-300 hover:text-indigo-200 transition font-medium"
              title="查阅本课详细原理讲义"
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span>本课讲义</span>
            </Link>
          )}
        </div>

        {/* Right: Active Model Badge & Connection Config */}
        <div className="flex items-center gap-2.5">
          {/* Active Model Indicator (Read-only from ENV) */}
          <div
            className="flex items-center gap-2 bg-[#131929] border border-slate-700/60 rounded-lg px-3 py-1.5 text-xs font-mono"
            title="当前模型由本地环境变量 LLM_MODEL 设定"
          >
            <Cpu className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="text-slate-400 text-[11px]">模型:</span>
            <span className="font-semibold text-purple-300 max-w-[180px] truncate">
              {model}
            </span>
          </div>

          {/* Connection Settings Button */}
          <button
            onClick={handleOpenModal}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition ${
              effectiveApiKey
                ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/50 shadow-sm shadow-emerald-500/10"
                : hasServerKey
                ? "bg-blue-950/40 text-blue-300 border-blue-500/40 hover:bg-blue-900/50"
                : "bg-amber-950/40 text-amber-300 border-amber-500/40 hover:bg-amber-900/50 animate-pulse"
            }`}
            title="查看或配置 LLM 接口连接（端侧安全存储）"
          >
            {effectiveApiKey ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            ) : hasServerKey ? (
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
            ) : (
              <Settings2 className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">
              {effectiveApiKey
                ? `私有 Key (${maskApiKey(effectiveApiKey)})`
                : hasServerKey
                ? `官方体验线路 (${model})`
                : "配置 API Key (BYOK)"}
            </span>
          </button>
        </div>
      </header>

      {/* Unified Connection & Provider Settings Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="glass-panel w-full max-w-xl p-6 rounded-2xl border border-slate-700/80 shadow-2xl space-y-4 bg-[#0e1424] max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300">
                  <ShieldCheck className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base flex items-center gap-2">
                    <span>LLM 连接与端侧安全配置 (BYOK)</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-normal">
                      Local-Only
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    自带 API 密钥，所有凭证仅存您本地浏览器，绝不上云、不入数据库
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-white text-sm p-1 rounded-lg hover:bg-slate-800/60 transition"
              >
                ✕
              </button>
            </div>

            {/* Provider Quick Presets */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
                <span>快捷服务商预设 (点击一键配置地址):</span>
                <span className="text-[10px] text-slate-500">OpenAI 协议兼容</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PROVIDER_PRESETS.map((preset) => {
                  const isSelected = selectedPresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                        isSelected
                          ? "bg-purple-950/40 border-purple-500 text-white shadow-md shadow-purple-950/40 ring-1 ring-purple-500/40"
                          : "bg-[#131929] border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-[#182035]"
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-xs text-slate-100 flex items-center justify-between">
                          <span>{preset.name}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                          {preset.description}
                        </div>
                      </div>
                      <div className="mt-2">
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded border inline-block ${preset.tagColor}`}
                        >
                          {preset.badge}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-3">
              {/* API Key */}
              <div className="space-y-1">
                <label className="text-xs font-mono text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-semibold text-slate-100">
                    <span>API Key 密钥:</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                    <ShieldCheck className="w-3 h-3" />
                    <span>保存在本地浏览器 LocalStorage</span>
                  </span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={modalApiKey}
                    onChange={(e) => setModalApiKey(e.target.value)}
                    placeholder={
                      PROVIDER_PRESETS.find((p) => p.id === selectedPresetId)?.keyPlaceholder ||
                      "输入 API Key (sk-...)"
                    }
                    className="w-full bg-[#131929] border border-slate-700 rounded-lg px-3 py-2 pr-10 text-xs text-slate-100 font-mono outline-none focus:border-purple-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    title={showPassword ? "隐藏密钥" : "显示密钥"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Base URL */}
              <div className="space-y-1">
                <label className="text-xs font-mono text-slate-200 flex items-center justify-between">
                  <span className="font-semibold text-slate-100">
                    API 接口地址 (Base URL):
                  </span>
                  <span className="text-[10px] text-slate-500">
                    兼容 OpenAI 协议端点
                  </span>
                </label>
                <input
                  type="text"
                  value={modalBaseURL}
                  onChange={(e) => setModalBaseURL(e.target.value)}
                  placeholder="https://open.bigmodel.cn/api/paas/v4"
                  className="w-full bg-[#131929] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono outline-none focus:border-purple-500 transition"
                />
              </div>

              {/* Model */}
              <div className="space-y-1">
                <label className="text-xs font-mono text-slate-200 flex items-center justify-between">
                  <span className="font-semibold text-slate-100">
                    模型标识 (Model):
                  </span>
                  <span className="text-[10px] text-slate-500">可选自定义覆盖</span>
                </label>
                <input
                  type="text"
                  value={modalModel}
                  onChange={(e) => setModalModel(e.target.value)}
                  placeholder="glm-4-flash / deepseek-chat"
                  className="w-full bg-[#131929] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono outline-none focus:border-purple-500 transition"
                />
              </div>
            </div>

            {/* Zero-Leakage Security Assurance Card */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-emerald-500/30 text-xs space-y-2">
              <div className="flex items-center justify-between text-emerald-300 font-semibold">
                <div className="flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>🔒 隐私与防盗刷安全承诺</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Zero-Persistence
                </span>
              </div>
              <ul className="text-[11px] text-slate-300 space-y-1.5 list-disc list-inside leading-relaxed">
                <li>
                  <strong className="text-white font-medium">端侧沙箱隔离</strong>：您的 API Key
                  仅保存在当前浏览器的 <code>localStorage</code> 中，本站绝无任何云端用户数据库，请求结束后内存即刻释放。
                </li>
                <li>
                  <strong className="text-white font-medium">F12 网络透明审计</strong>：欢迎按下{" "}
                  <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-200">
                    F12
                  </kbd>{" "}
                  打开控制台网络 (Network) 面板审查，绝无任何向第三方偷传 Key 的隐藏请求。
                </li>
                <li>
                  <strong className="text-white font-medium">防盗刷最佳实践</strong>：强烈建议在服务商控制台创建<strong>设置了消费额度硬顶（例如 1~5 元）</strong>的专用测试 Key，彻底无后顾之忧。
                </li>
              </ul>
            </div>

            {/* Feedback notification toast */}
            {saveSuccessMsg && (
              <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            {/* Actions Bottom Bar */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800 gap-2">
              <div className="flex items-center gap-2">
                {(effectiveApiKey || modalApiKey) && (
                  <button
                    type="button"
                    onClick={handleClearModal}
                    className="flex items-center gap-1 text-[11px] font-mono text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 px-2.5 py-1.5 rounded-lg border border-rose-500/30 transition"
                    title="彻底清空本地浏览器保存的密钥"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>清除本地配置</span>
                  </button>
                )}
                <a
                  href="https://github.com/tenghuan123/Agent-Development-Learning"
                  target="_blank"
                  rel="noreferrer"
                  className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-slate-200 px-2 py-1 transition"
                  title="在 GitHub 审查本项目源码"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>源码审计</span>
                </a>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSaveModal}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-xs shadow-lg shadow-purple-600/30 transition flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>保存并生效</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

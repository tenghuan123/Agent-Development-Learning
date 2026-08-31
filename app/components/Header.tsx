import { useState, useEffect } from "react";
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
} from "lucide-react";

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

  // Form states in modal
  const [modalApiKey, setModalApiKey] = useState(customApiKey);
  const [modalBaseURL, setModalBaseURL] = useState(
    customBaseURL || defaultBaseURL
  );

  useEffect(() => {
    setModalApiKey(customApiKey);
  }, [customApiKey]);

  useEffect(() => {
    setModalBaseURL(customBaseURL || defaultBaseURL);
  }, [customBaseURL, defaultBaseURL]);

  const effectiveApiKey = customApiKey || "";
  const isKeyAvailable = hasServerKey || Boolean(effectiveApiKey.trim().length > 0);

  const lessons = [
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
  ];

  const handleSaveModal = () => {
    const trimmedKey = modalApiKey.trim();
    const trimmedURL = modalBaseURL.trim();

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
      });
    }
    setShowConfigModal(false);
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
                <div className="absolute left-0 mt-2 w-72 rounded-xl bg-[#0f1526] border border-slate-700 shadow-2xl p-2 z-50 space-y-1">
                  <Link
                    to="/"
                    onClick={() => setShowLessonDropdown(false)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition ${
                      location.pathname === "/"
                        ? "bg-purple-600/20 text-purple-300 font-medium"
                        : "text-slate-300 hover:bg-slate-800/60"
                    }`}
                  >
                    <Layers className="w-4 h-4 text-amber-400" />
                    <span>🗺️ 课程总览 & 演进全景路线</span>
                  </Link>

                  <div className="my-1 border-t border-slate-800" />

                  {lessons.map((lesson) => {
                    const Icon = lesson.icon;
                    const isActive = location.pathname === lesson.path;
                    return (
                      <Link
                        key={lesson.path}
                        to={lesson.path}
                        onClick={() => setShowLessonDropdown(false)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition ${
                          isActive
                            ? "bg-purple-600/20 text-purple-300 font-medium"
                            : "text-slate-300 hover:bg-slate-800/60"
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${lesson.color}`} />
                        <div className="flex-1">
                          <div className="text-slate-200 font-medium">
                            {lesson.title}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>
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
            onClick={() => setShowConfigModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition ${
              isKeyAvailable
                ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/50"
                : "bg-amber-950/40 text-amber-300 border-amber-500/40 hover:bg-amber-900/50 animate-pulse"
            }`}
            title="查看或配置 LLM 接口连接"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {isKeyAvailable
                ? hasServerKey && !customApiKey
                  ? "LLM: 已就绪 (.env)"
                  : "LLM: 已就绪 (自定义)"
                : "配置 API Key"}
            </span>
          </button>
        </div>
      </header>

      {/* Unified Connection & Provider Settings Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-lg p-6 rounded-2xl border border-slate-700 shadow-2xl space-y-5 bg-[#0e1424]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300">
                  <Settings2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    LLM 接口连接配置
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    模型已由本地环境变量 <code>LLM_MODEL</code> 全局设定
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-white text-sm p-1"
              >
                ✕
              </button>
            </div>

            {/* Current Active Model Info Card */}
            <div className="p-3 rounded-xl bg-[#131929] border border-purple-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Cpu className="w-4 h-4 text-purple-400" />
                <div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    当前生效模型 (LLM_MODEL)
                  </div>
                  <div className="text-sm font-mono font-bold text-purple-200">
                    {model}
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                环境变量驱动
              </span>
            </div>

            {/* Form Fields */}
            <div className="space-y-3.5">
              {/* Base URL */}
              <div className="space-y-1">
                <label className="text-xs font-mono text-slate-300 flex items-center justify-between">
                  <span>API 接口地址 (Base URL):</span>
                </label>
                <input
                  type="text"
                  value={modalBaseURL}
                  onChange={(e) => setModalBaseURL(e.target.value)}
                  placeholder="https://open.bigmodel.cn/api/paas/v4"
                  className="w-full bg-[#131929] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono outline-none focus:border-purple-500 transition"
                />
              </div>

              {/* API Key */}
              <div className="space-y-1">
                <label className="text-xs font-mono text-slate-300 flex items-center justify-between">
                  <span>API Key 密钥:</span>
                  <span className="text-[10px] text-slate-500">
                    保存在本地浏览器或写入 .env
                  </span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={modalApiKey}
                    onChange={(e) => setModalApiKey(e.target.value)}
                    placeholder="输入你的 API Key (例如智谱 GLM 或 DeepSeek Key)"
                    className="w-full bg-[#131929] border border-slate-700 rounded-lg px-3 py-2 pr-10 text-xs text-slate-100 font-mono outline-none focus:border-purple-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    {showPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Environment Variable Hint */}
              <div className="p-3 rounded-xl bg-[#090d18] border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>根目录 <code>.env</code> 环境变量配置示例:</span>
                </div>
                <pre className="text-[10px] text-purple-300/90 font-mono overflow-x-auto p-1.5 bg-[#0f1526] rounded border border-slate-800">
{`LLM_API_KEY=你的API密钥
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
LLM_MODEL=${model}`}
                </pre>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800">
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
      )}
    </>
  );
}

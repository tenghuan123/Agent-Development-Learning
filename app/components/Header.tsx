import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router";
import {
  Sparkles,
  Cpu,
  Key,
  BookOpen,
  ChevronDown,
  Layers,
  Wrench,
  Terminal,
} from "lucide-react";

export interface HeaderProps {
  hasServerKey: boolean;
  defaultModel: string;
  supportedModels: Array<{
    id: string;
    name: string;
    provider: string;
    tag: string;
  }>;
  selectedModel: string;
  onModelChange: (model: string) => void;
  customApiKey: string;
  onSaveApiKey: (key: string) => void;
  currentLesson?: {
    id: string;
    title: string;
    badge: string;
  };
}

export function Header({
  hasServerKey,
  supportedModels,
  selectedModel,
  onModelChange,
  customApiKey,
  onSaveApiKey,
  currentLesson,
}: HeaderProps) {
  const location = useLocation();
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showLessonDropdown, setShowLessonDropdown] = useState(false);

  const effectiveApiKey = customApiKey || "";
  const isKeyAvailable = hasServerKey || Boolean(effectiveApiKey);

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
  ];

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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm tracking-wide text-white group-hover:text-indigo-300 transition">
                  Mini Claude Code
                </h1>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
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
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold">
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
                        ? "bg-indigo-600/20 text-indigo-300 font-medium"
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
                            ? "bg-cyan-600/20 text-cyan-300 font-medium"
                            : "text-slate-300 hover:bg-slate-800/60"
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${lesson.color}`} />
                        <div className="flex-1">
                          <div className="text-slate-200 font-medium">{lesson.title}</div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: Model Selector & API Key */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#131929] border border-slate-700/60 rounded-lg px-3 py-1.5 text-xs">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              className="bg-transparent text-slate-200 outline-none font-mono text-xs cursor-pointer"
            >
              {supportedModels.map((m) => (
                <option key={m.id} value={m.id} className="bg-[#131929]">
                  {m.name} ({m.provider}) - {m.tag}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowApiKeyModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition ${
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
                id="headerModalApiKeyInput"
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
                    "headerModalApiKeyInput"
                  ) as HTMLInputElement;
                  onSaveApiKey(input?.value || "");
                  setShowApiKeyModal(false);
                }}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-md shadow-indigo-600/30"
              >
                保存并开始
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


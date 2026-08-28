import { useState, useEffect } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import {
  Sparkles,
  Terminal,
  Wrench,
  Layers,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Cpu,
  Code2,
  FolderTree,
  ShieldCheck,
  ChevronRight,
  Zap,
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

export default function CourseIndex() {
  const { hasServerKey, defaultModel, supportedModels } =
    useLoaderData<typeof loader>();

  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [customApiKey, setCustomApiKey] = useState("");

  useEffect(() => {
    const savedKey = localStorage.getItem("MINI_CLAUDE_OPENROUTER_KEY");
    if (savedKey) {
      setCustomApiKey(savedKey);
    }
  }, []);

  const saveLocalKey = (key: string) => {
    setCustomApiKey(key);
    localStorage.setItem("MINI_CLAUDE_OPENROUTER_KEY", key);
  };

  const LESSONS = [
    {
      version: "V0",
      number: "第 01 课",
      title: "LLM 原生机制、无状态本质与结构化输出",
      desc: "揭开大模型没有记忆的底层真相：Context Window、Token 拼接与 Zod Schema 强类型契约。",
      path: "/lessons/v0-llm-chat",
      icon: Terminal,
      color: "from-indigo-600 to-blue-600",
      borderColor: "border-indigo-500/40",
      status: "completed",
      statusText: "已完成",
      highlights: [
        "对照实验：单条消息 vs Runtime 上下文记忆拼接",
        "Prompt 约束 vs Zod Schema 强类型解析稳定性",
        "可交互的 V0 流式对话控制台与 Context Inspector",
      ],
      docPath: "docs/lessons/01-statelessness-and-structured-output.md",
    },
    {
      version: "V1",
      number: "第 02 课",
      title: "Tool Calling 机制与行动力破局",
      desc: "解决模型只会说不会做的痛点：大模型并不执行代码，而是通过 6 步文本协商协议由 Runtime 落地执行。",
      path: "/lessons/v1-tool-calling",
      icon: Wrench,
      color: "from-cyan-600 to-indigo-600",
      borderColor: "border-cyan-500/50",
      status: "completed",
      statusText: "已完成",
      highlights: [
        "单步全链路追踪器 (Step-by-Step Inspector)",
        "标准工具库：read_file, list_dir, calculate, system_info",
        "Zod 模式校验、路径越界防御与文件不存在容错自愈",
      ],
      docPath: "docs/lessons/02-tool-calling-mechanism.md",
    },
    {
      version: "V2",
      number: "第 03 课",
      title: "Agent Loop 与 ReAct 闭环",
      desc: "单次 Tool Call 不够用怎么办？实现 Thought → Action → Observation 自动迭代与死循环熔断。",
      path: "/lessons/v2-agent-loop",
      icon: Layers,
      color: "from-amber-600 to-orange-600",
      borderColor: "border-amber-500/50",
      status: "completed",
      statusText: "已完成",
      highlights: [
        "ReAct 循环状态机与自主终止条件判定",
        "滑动窗口死循环熔断器 (LoopDetector & Circuit Breaker)",
        "全链路实时事件流、错误自愈与 Context 演进快照",
      ],
      docPath: "docs/lessons/03-agent-loop-and-react.md",
    },
    {
      version: "V3",
      number: "第 04 课",
      title: "Coding Agent 与代码自愈",
      desc: "从只读进阶到写入与执行：edit_file、run_command 与测试失败自动排查与自愈。",
      path: "/lessons/v3-coding-agent",
      icon: Code2,
      color: "from-emerald-600 to-teal-600",
      borderColor: "border-emerald-500/50",
      status: "current",
      statusText: "🚀 当前落地",
      highlights: [
        "精准代码差异补丁 (Search-and-Replace Diff Editing)",
        "终端命令安全受控执行与错误日志智能截断",
        "单元测试与编译报错驱动的自主自愈闭环",
      ],
      docPath: "docs/lessons/04-coding-agent-and-self-healing.md",
    },
  ];

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 font-sans selection:bg-cyan-500/30 flex flex-col">
      <Header
        hasServerKey={hasServerKey}
        defaultModel={defaultModel}
        supportedModels={supportedModels}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        customApiKey={customApiKey}
        onSaveApiKey={saveLocalKey}
      />

      <main className="flex-1 overflow-y-auto p-6 md:p-10 max-w-6xl mx-auto w-full space-y-10">
        {/* Hero Section */}
        <div className="relative glass-panel p-8 md:p-10 rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-[#0d1222] to-cyan-950/30 overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative space-y-4 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
              <Sparkles className="w-3.5 h-3.5" />
              <span>演进式手写 Agent 体系课程</span>
            </div>

            <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Mini Claude Code <br />
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                从 0 手写一个自主 AI Coding Agent
              </span>
            </h1>

            <p className="text-sm md:text-base text-slate-300 leading-relaxed">
              每一课对应一个独立的工程实践工作台（Workbench）。通过
              <strong className="text-white">“遇到新问题 → 引入新概念 → 手写实现代码 → 验收测试”</strong>
              的完整演进闭环，真正掌握 Agent 底层工程奥秘。
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-4">
              <Link
                to="/lessons/v3-coding-agent"
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-semibold text-sm flex items-center gap-2 shadow-xl shadow-emerald-600/25 transition transform hover:-translate-y-0.5"
              >
                <Code2 className="w-4 h-4" />
                <span>进入第 04 课：Coding Agent 实验室</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              <Link
                to="/lessons/v2-agent-loop"
                className="px-5 py-3 rounded-xl bg-[#131b2e] hover:bg-[#1a253e] text-slate-200 border border-slate-700/80 font-medium text-sm flex items-center gap-2 transition"
              >
                <Layers className="w-4 h-4 text-amber-400" />
                <span>第 03 课：Agent Loop</span>
              </Link>

              <Link
                to="/lessons/v1-tool-calling"
                className="px-5 py-3 rounded-xl bg-[#131b2e] hover:bg-[#1a253e] text-slate-200 border border-slate-700/80 font-medium text-sm flex items-center gap-2 transition"
              >
                <Wrench className="w-4 h-4 text-cyan-400" />
                <span>第 02 课：Tool Calling</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Lessons Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-400" />
                <span>课程章节与独立运行实验台</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                每节课都有独立的代码实现与交互式可视化工作台
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {LESSONS.map((lesson) => {
              const Icon = lesson.icon;
              const isAvailable = lesson.path !== "#";

              return (
                <div
                  key={lesson.version}
                  className={`glass-panel p-6 rounded-2xl border transition relative flex flex-col justify-between ${
                    lesson.borderColor
                  } ${
                    isAvailable
                      ? "hover:border-indigo-400/80 hover:shadow-xl hover:shadow-indigo-500/5 bg-[#0e1424]/90"
                      : "opacity-75 bg-[#0a0e18]"
                  }`}
                >
                  <div className="space-y-4">
                    {/* Top Status & Tags */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                          {lesson.version}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          {lesson.number}
                        </span>
                      </div>

                      <span
                        className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                          lesson.status === "current"
                            ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30 font-bold"
                            : lesson.status === "completed"
                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                        }`}
                      >
                        {lesson.statusText}
                      </span>
                    </div>

                    {/* Lesson Title & Desc */}
                    <div>
                      <h3 className="text-base font-bold text-slate-100 mb-1 flex items-center gap-2">
                        <Icon className="w-4 h-4 text-cyan-400" />
                        <span>{lesson.title}</span>
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {lesson.desc}
                      </p>
                    </div>

                    {/* Key Highlights */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                      <div className="text-[11px] font-mono text-slate-400 font-semibold">
                        核心落地内容:
                      </div>
                      {lesson.highlights.map((h, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 text-xs text-slate-300"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                          <span>{h}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Link */}
                  <div className="pt-6">
                    {isAvailable ? (
                      <Link
                        to={lesson.path}
                        className="w-full py-2.5 px-4 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 text-xs font-semibold flex items-center justify-center gap-2 transition"
                      >
                        <span>进入实验台 (Workbench)</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    ) : (
                      <div className="w-full py-2 px-4 rounded-xl bg-slate-900/60 text-slate-500 text-xs text-center border border-slate-800">
                        {lesson.statusText}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 12-Stage Roadmap Summary */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold text-white tracking-tight">
                Mini Claude Code 12 阶段完整路线图
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-400">
              V0 → V11 全生命周期
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {[
              { v: "V0", name: "LLM Chat", status: "done" },
              { v: "V1", name: "Tool Calling", status: "current" },
              { v: "V2", name: "Agent Loop", status: "next" },
              { v: "V3", name: "Coding Agent", status: "todo" },
              { v: "V4", name: "Planning & Workflow", status: "todo" },
              { v: "V5", name: "Context Engine", status: "todo" },
              { v: "V6", name: "Memory & State", status: "todo" },
              { v: "V7", name: "Harness & Sandbox", status: "todo" },
              { v: "V8", name: "MCP 标准协议", status: "todo" },
              { v: "V9", name: "Durable Exec", status: "todo" },
              { v: "V10", name: "Eval & Tracing", status: "todo" },
              { v: "V11", name: "Production Agent", status: "todo" },
            ].map((item) => (
              <div
                key={item.v}
                className={`p-3 rounded-xl border flex items-center justify-between text-xs font-mono ${
                  item.status === "current"
                    ? "bg-cyan-950/30 border-cyan-500/50 text-cyan-200"
                    : item.status === "done"
                    ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
                    : "bg-[#0b101c] border-slate-800 text-slate-400"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold">{item.v}</span>
                  <span className="font-sans text-[11px]">{item.name}</span>
                </div>
                {item.status === "done" && (
                  <span className="text-[10px] text-emerald-400">✓</span>
                )}
                {item.status === "current" && (
                  <span className="text-[10px] text-cyan-400 animate-pulse">●</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

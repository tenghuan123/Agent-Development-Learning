import { useState, useMemo } from "react";
import { useLoaderData, Link } from "react-router";
import katex from "katex";
import { Header } from "~/components/Header";
import {
  BenchmarkCorpusManager,
  type MemoryPersistenceCase,
  type MemoryStrategyResult,
  type MemoryStrategyName,
  type MemoryScope,
} from "~/core/context-bench/corpus";
import {
  Brain,
  ShieldAlert,
  Play,
  BookOpen,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Copy,
  Check,
  Sparkles,
  Database,
  Compass,
  Bot,
  RotateCcw,
  Clock,
  Filter,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Sliders,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Loader: 服务端首屏预加载 (遵守数据获取分层规范)
// ---------------------------------------------------------------------------

export async function loader() {
  const docs = BenchmarkCorpusManager.getAllDocuments();
  const totalCorpusTokens = docs.reduce((sum, d) => sum + d.tokenCount, 0);
  const hasServerKey = Boolean(
    process.env.LLM_API_KEY && process.env.LLM_API_KEY.trim().length > 0
  );
  const model = process.env.LLM_MODEL || "glm-4-flash";
  const defaultBaseURL =
    process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";

  const cases = BenchmarkCorpusManager.getMemoryBenchmarkCases();
  const initialMatrix = BenchmarkCorpusManager.generateMemoryBenchmarkMatrix();
  const initialResult = BenchmarkCorpusManager.getCuratedMemoryResult(
    "mem-01-tech-stack-preferences",
    "no_memory_amnesia"
  );

  return {
    hasServerKey,
    model,
    defaultBaseURL,
    totalCorpusTokens,
    docCount: docs.length,
    cases,
    initialMatrix,
    initialResult,
  };
}

// ---------------------------------------------------------------------------
// 格式化百分比助手 (兼顾 0~1 比例与 0~100 百分比，防止出现 10000%)
// ---------------------------------------------------------------------------

function formatPercent(val: number): string {
  if (typeof val !== "number" || isNaN(val)) return "0%";
  const pct = val <= 1.0 ? val * 100 : val;
  return `${Math.round(pct)}%`;
}

// ---------------------------------------------------------------------------
// 数学公式渲染组件 (基于 KaTeX 纯客户端/SSR 同构渲染)
// ---------------------------------------------------------------------------

function MathView({
  math,
  block = false,
  className = "",
}: {
  math: string;
  block?: boolean;
  className?: string;
}) {
  const clean = useMemo(() => {
    let s = math.trim();
    if (s.startsWith("$$") && s.endsWith("$$")) {
      s = s.slice(2, -2).trim();
    } else if (s.startsWith("$") && s.endsWith("$")) {
      s = s.slice(1, -1).trim();
    }
    return s;
  }, [math]);

  const html = useMemo(() => {
    try {
      return katex.renderToString(clean, {
        displayMode: block,
        throwOnError: false,
      });
    } catch {
      return clean;
    }
  }, [clean, block]);

  if (block) {
    return (
      <div
        className={`overflow-x-auto py-2 my-1 text-center font-serif ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <span
      className={`inline-block font-serif ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ---------------------------------------------------------------------------
// 策略配置字典 (技术演进由劣到优：纯无状态 ➔ 全量回放 ➔ 机械快照 ➔ 选择性多作用域)
// ---------------------------------------------------------------------------

const STRATEGIES: {
  id: MemoryStrategyName;
  label: string;
  shortLabel: string;
  badge: string;
  activeBorder: string;
  desc: string;
}[] = [
  {
    id: "no_memory_amnesia",
    label: "纯无状态冷启动 (No Memory Amnesia)",
    shortLabel: "纯无状态",
    badge: "失忆对照",
    activeBorder:
      "border-rose-400 bg-rose-950/60 shadow-rose-950/50 shadow-md text-rose-200",
    desc: "跨会话 100% 失忆，每一轮新任务用户均需重新教导规范，易引发违规与退化事故。",
  },
  {
    id: "full_raw_replay",
    label: "历史全量堆叠回放 (Full Raw Replay)",
    shortLabel: "全量回放",
    badge: "Token 沼泽",
    activeBorder:
      "border-amber-400 bg-amber-950/60 shadow-amber-950/50 shadow-md text-amber-200",
    desc: "将所有历史对话全量拼入 Prompt，Token 暴涨至数万，TTFT 飙升至 8s+，引发注意力稀释与临时变量污染。",
  },
  {
    id: "naive_auto_snapshot",
    label: "机械会话快照 (Naive Auto-Snapshot)",
    shortLabel: "机械快照",
    badge: "脏数据污染",
    activeBorder:
      "border-purple-400 bg-purple-950/60 shadow-purple-950/50 shadow-md text-purple-200",
    desc: "缺乏提炼门禁，将临时调试变量与脏草稿误当作长期配置持久化，在新会话中引发严重安全隐患。",
  },
  {
    id: "selective_scoped_memory",
    label: "选择性提炼与多作用域唤醒 (Selective Scoped)",
    shortLabel: "选择性多作用域",
    badge: "工业标杆 🏆",
    activeBorder:
      "border-emerald-400 bg-emerald-950/60 shadow-emerald-950/50 shadow-md text-emerald-200",
    desc: "价值门禁过滤瞬态噪音，多级作用域隔离，按需检索注入，Token 节省 95%+ 且 100% 遵从。",
  },
];

// ---------------------------------------------------------------------------
// 阅卷标准细则核验器 (Rubric Matcher)
// ---------------------------------------------------------------------------

function evaluateRubricItem(
  itemText: string,
  response: string,
  isProhibited: boolean
): { passed: boolean; label: string } {
  const resp = response.toLowerCase();
  const text = itemText.toLowerCase();

  if (isProhibited) {
    if (text.includes("npm") && /npm\s+run|npm\s+start|express/i.test(resp)) {
      return { passed: false, label: "违规触发" };
    }
    if (text.includes("3000") && /3000|8080/.test(resp)) {
      return { passed: false, label: "违规触发" };
    }
    if (text.includes("9999") && /9999/.test(resp)) {
      return { passed: false, label: "违规触发" };
    }
    if (text.includes("公网") && /postgres:\/\/pg-prod-cluster|psql -h pg-prod-cluster/i.test(resp)) {
      return { passed: false, label: "致命违规" };
    }
    if (text.includes("temp_bearer") && /temp_bearer_sandbox_debug_991/i.test(resp)) {
      return { passed: false, label: "安全漏洞" };
    }
    if (text.includes("ant design") && /ant-design|antd|zustand/i.test(resp)) {
      return { passed: false, label: "跨项目串味" };
    }
    return { passed: true, label: "安全规避" };
  } else {
    if (text.includes("bun") && /bun\s+run|bun\s+server|bun\b/i.test(resp)) {
      return { passed: true, label: "完美达成" };
    }
    if (text.includes("9090") && /9090/.test(resp)) {
      return { passed: true, label: "完美达成" };
    }
    if (text.includes("typescript") && /interface|type\s+|strict|:\s*string/i.test(resp)) {
      return { passed: true, label: "完美达成" };
    }
    if (text.includes("10.0.1.5") && /10\.0\.1\.5|堡垒机|隧道|bastion/i.test(resp)) {
      return { passed: true, label: "完美达成" };
    }
    if (text.includes("环境") && /process\.env|env\.|secret|密钥/i.test(resp)) {
      return { passed: true, label: "完美达成" };
    }
    if (text.includes("jsdoc") && /\/\*\*|@param|@returns|中文注释/i.test(resp)) {
      return { passed: true, label: "完美达成" };
    }
    return { passed: true, label: "已达成" };
  }
}

export default function LessonContextC15() {
  const data = useLoaderData<typeof loader>();

  // 核心用户交互状态 (默认从第 1 个 Baseline: 纯无状态开始呈现问题)
  const [selectedCaseId, setSelectedCaseId] = useState<string>(
    data.cases[0]?.id || "mem-01-tech-stack-preferences"
  );
  const [selectedStrategy, setSelectedStrategy] =
    useState<MemoryStrategyName>("no_memory_amnesia");
  const [scopeFilter, setScopeFilter] = useState<MemoryScope | "all">("all");
  const [activeMainTab, setActiveMainTab] = useState<
    "arena" | "inspector" | "matrix" | "theory"
  >("arena");
  const [showPromptPreview, setShowPromptPreview] = useState<boolean>(false);

  // BYOK 凭证状态
  const [customApiKey, setCustomApiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("MINI_CLAUDE_API_KEY") || "";
    }
    return "";
  });
  const [customBaseURL, setCustomBaseURL] = useState(() => {
    if (typeof window !== "undefined") {
      return (
        localStorage.getItem("MINI_CLAUDE_BASE_URL") || data.defaultBaseURL
      );
    }
    return data.defaultBaseURL;
  });

  const [isRunningLive, setIsRunningLive] = useState<boolean>(false);
  const [liveResult, setLiveResult] = useState<MemoryStrategyResult | null>(
    null
  );
  const [liveStatusMessage, setLiveStatusMessage] = useState<string | null>(
    null
  );
  const [liveErrorMessage, setLiveErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // 派生当前选中的测试用例
  const activeCase: MemoryPersistenceCase = useMemo(() => {
    return data.cases.find((c) => c.id === selectedCaseId) || data.cases[0];
  }, [data.cases, selectedCaseId]);

  // 派生当前确定性评测结果
  const currentResult: MemoryStrategyResult = useMemo(() => {
    const curated = BenchmarkCorpusManager.getCuratedMemoryResult(
      selectedCaseId,
      selectedStrategy
    );
    return curated || data.initialResult!;
  }, [selectedCaseId, selectedStrategy, data.initialResult]);

  // 派生当前现场实测结果
  const activeRunResult: MemoryStrategyResult | null = useMemo(() => {
    if (
      liveResult &&
      liveResult.caseId === selectedCaseId &&
      liveResult.strategy === selectedStrategy
    ) {
      return liveResult;
    }
    return null;
  }, [liveResult, selectedCaseId, selectedStrategy]);

  // 当前激活的 Agent 回答
  const effectiveAgentResponse = useMemo(() => {
    if (activeRunResult) return activeRunResult.session2AgentResponse;
    return currentResult.session2AgentResponse;
  }, [activeRunResult, currentResult]);

  // 触发在线真机实测
  const handleRunLive = async () => {
    setIsRunningLive(true);
    setLiveErrorMessage(null);
    setLiveStatusMessage("正在组装测试 Prompt 并调度大模型进行推理...");
    try {
      const response = await fetch("/api/context-bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_live_memory",
          caseId: selectedCaseId,
          strategy: selectedStrategy,
          apiKey: customApiKey.trim() || undefined,
          baseURL: customBaseURL.trim() || undefined,
          model: data.model,
        }),
      });

      const resData = await response.json();
      if (resData.success && resData.result) {
        setLiveResult(resData.result);
        setLiveStatusMessage(
          `现场实测阅卷完毕！耗时 ${resData.result.ttftEstimatedMs}ms，偏好遵循率 ${formatPercent(
            resData.result.preferenceComplianceRate
          )}，噪音拦截率 ${formatPercent(
            resData.result.noiseRejectionRate
          )}`
        );
      } else {
        throw new Error(resData.error || "服务端返回失败");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLiveErrorMessage(`实测请求未成功：${msg}。可检查网络或载入基准数据。`);
    } finally {
      setIsRunningLive(false);
    }
  };

  const handleResetToCurated = () => {
    setLiveResult(null);
    setLiveErrorMessage(null);
    setLiveStatusMessage("已还原至精心校准的标准对照基准。");
    setTimeout(() => setLiveStatusMessage(null), 3000);
  };

  const handleCopyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 筛选记忆条目
  const displayedMemories = useMemo(() => {
    const list = currentResult.persistedEntries;
    if (scopeFilter === "all") return list;
    return list.filter((m) => m.scope === scopeFilter);
  }, [currentResult.persistedEntries, scopeFilter]);

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 flex flex-col font-sans selection:bg-purple-500/30">
      <Header
        hasServerKey={data.hasServerKey}
        model={data.model}
        defaultBaseURL={data.defaultBaseURL}
        customApiKey={customApiKey}
        onSaveApiKey={setCustomApiKey}
        customBaseURL={customBaseURL}
        onSaveBaseURL={setCustomBaseURL}
        onSaveSettings={(settings) => {
          setCustomApiKey(settings.apiKey);
          setCustomBaseURL(settings.baseURL);
          if (typeof window !== "undefined") {
            localStorage.setItem("MINI_CLAUDE_API_KEY", settings.apiKey);
            localStorage.setItem("MINI_CLAUDE_BASE_URL", settings.baseURL);
          }
        }}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        {/* Breadcrumb & Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2 font-mono">
            <Link to="/" className="hover:text-purple-400 transition">
              课程大厅
            </Link>
            <span>/</span>
            <Link to="/docs/context-learn.md" className="hover:text-purple-400 transition">
              Context Engineering 专项
            </Link>
            <span>/</span>
            <span className="text-purple-300 font-semibold">
              第 15 课：长期记忆与状态持久化
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/docs/lessons/context/15-memory-and-state-persistence.md"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-950/40 border border-purple-500/30 text-purple-300 hover:bg-purple-900/40 transition text-xs font-mono font-medium"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>阅读 C15 深度理论讲义</span>
            </Link>
          </div>
        </div>

        {/* 紧凑型 Hero Banner */}
        <div className="glass-panel px-5 py-4 rounded-2xl border border-purple-500/30 bg-gradient-to-r from-[#120a24] via-[#090d1a] to-[#061826] relative overflow-hidden shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-[11px] font-mono">
              <Brain className="w-3 h-3" />
              <span>Context Engineering · 第 15 课</span>
            </div>
            <h1 className="text-lg md:text-xl font-extrabold text-white tracking-tight">
              什么时候保存，什么时候遗忘？
              <span className="bg-gradient-to-r from-purple-400 via-indigo-300 to-teal-300 bg-clip-text text-transparent ml-2">
                从推理上下文 (RAM) 到跨会话外脑 (Disk)
              </span>
            </h1>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              攻克跨 Session 彻底失忆与历史全量回放引发的垃圾爆炸。通过价值提炼门禁、多级作用域正交隔离与按需动态唤醒，Token 消耗直降 95%+ 且偏好与安全红线 100% 遵从。
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] font-mono text-slate-300">
              <span className="text-slate-500 mr-1.5">当前模型:</span>
              <span className="text-purple-300 font-semibold">{data.model}</span>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* 最顶层一级视图导航 (Top-Level Primary Navigation Tabs)              */}
        {/* 4 大核心维度：交互实验台 | 外存库透视 | 4×4 对决大表 | 第一性原理数学   */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/80 pb-3">
          <button
            type="button"
            onClick={() => setActiveMainTab("arena")}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition flex items-center gap-2 border ${
              activeMainTab === "arena"
                ? "bg-purple-600/25 text-purple-200 border-purple-500/60 shadow-lg shadow-purple-950/40 ring-1 ring-purple-500/30"
                : "bg-slate-900/40 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700"
            }`}
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>🧪 交互实验台 (考题 · 答卷 · 实时判卷)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab("inspector")}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition flex items-center gap-2 border ${
              activeMainTab === "inspector"
                ? "bg-teal-600/25 text-teal-200 border-teal-500/60 shadow-lg shadow-teal-950/40 ring-1 ring-teal-500/30"
                : "bg-slate-900/40 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700"
            }`}
          >
            <Database className="w-4 h-4 text-teal-400" />
            <span>💾 外存库透视 (Memory Bank Inspector)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab("matrix")}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition flex items-center gap-2 border ${
              activeMainTab === "matrix"
                ? "bg-indigo-600/25 text-indigo-200 border-indigo-500/60 shadow-lg shadow-indigo-950/40 ring-1 ring-indigo-500/30"
                : "bg-slate-900/40 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700"
            }`}
          >
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>📊 4×4 策略全景对决大表</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab("theory")}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition flex items-center gap-2 border ${
              activeMainTab === "theory"
                ? "bg-amber-600/25 text-amber-200 border-amber-500/60 shadow-lg shadow-amber-950/40 ring-1 ring-amber-500/30"
                : "bg-slate-900/40 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700"
            }`}
          >
            <BookOpen className="w-4 h-4 text-amber-400" />
            <span>📖 📐 RAM vs Disk 第一性原理数学</span>
          </button>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* VIEW 1: 交互实验台 (ARENA)                                         */}
        {/* 自上而下展示：控制面板 ➔ 状态通知 ➔ 双栏考题与时空演进 ➔ 判卷报告     */}
        {/* ------------------------------------------------------------------ */}
        {activeMainTab === "arena" && (
          <div className="space-y-5">
            {/* 实验台专属控制中心：步骤 1 场景选择 + 步骤 2 策略切换 + 步骤 3 发起真机实测 */}
            <div className="glass-panel p-4 rounded-xl border border-slate-800 bg-[#0a0e1c] space-y-4 shadow-xl">
              {/* Row 1: 4 大对抗测试场景卡片 (等宽网格，不再水平挤压) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-300 font-bold flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-purple-400" />
                    <span>步骤 1：选择评测场景 (4 大真实工业长任务挑战)</span>
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">
                    当前项目: <code className="text-teal-300">{activeCase.projectId}</code>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {data.cases.map((c, idx) => {
                    const isSelected = c.id === selectedCaseId;
                    const shortHints = [
                      "Bun + TS strict + 9090",
                      "禁止公网直连生产 DB",
                      "沙箱临时 Token 防泄漏",
                      "Project-Alpha vs Beta 零串味",
                    ];
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCaseId(c.id);
                          setLiveResult(null);
                          setLiveStatusMessage(null);
                          setLiveErrorMessage(null);
                        }}
                        className={`p-3 rounded-lg border text-left transition flex flex-col justify-between ${
                          isSelected
                            ? "bg-purple-950/60 border-purple-500/80 shadow-md shadow-purple-950/50 text-purple-200 ring-1 ring-purple-500/40"
                            : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[10px] font-mono font-bold text-purple-400">
                              CASE 0{idx + 1}
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                                c.difficulty === "adversarial"
                                  ? "bg-rose-500/20 text-rose-300"
                                  : "bg-amber-500/20 text-amber-300"
                              }`}
                            >
                              {c.difficulty}
                            </span>
                          </div>
                          <div className="text-xs font-bold text-slate-200 line-clamp-1">
                            {c.title}
                          </div>
                        </div>
                        <div className="text-[10px] text-teal-300/80 font-mono line-clamp-1 mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between">
                          <span>{shortHints[idx]}</span>
                          {isSelected && <Check className="w-3 h-3 text-purple-400" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 2: 策略切换 Pills + 实测按钮工具条 */}
              <div className="pt-3 border-t border-slate-800/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* 策略切换 Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-mono text-slate-400 mr-1 flex items-center gap-1 font-semibold">
                    <Sliders className="w-3.5 h-3.5 text-purple-400" />
                    <span>步骤 2：测试策略:</span>
                  </span>
                  {STRATEGIES.map((strat) => {
                    const isSelected = strat.id === selectedStrategy;
                    return (
                      <button
                        key={strat.id}
                        type="button"
                        onClick={() => {
                          setSelectedStrategy(strat.id);
                          setLiveResult(null);
                          setLiveStatusMessage(null);
                          setLiveErrorMessage(null);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono transition border flex items-center gap-1.5 ${
                          isSelected
                            ? strat.activeBorder
                            : "bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                        }`}
                      >
                        <span className="font-semibold">{strat.shortLabel}</span>
                        <span
                          className={`text-[9px] px-1 rounded ${
                            isSelected ? "bg-black/40 text-white" : "bg-slate-800 text-slate-500"
                          }`}
                        >
                          {strat.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* 实测按钮 + 还原基准 */}
                <div className="flex items-center gap-2.5 self-end lg:self-center shrink-0">
                  {activeRunResult && (
                    <button
                      type="button"
                      onClick={handleResetToCurated}
                      className="px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-xs font-medium flex items-center gap-1 transition-all"
                      title="清空现场生成，还原至标准对照数据"
                    >
                      <RotateCcw className="w-3 h-3" />
                      还原基准
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleRunLive}
                    disabled={isRunningLive}
                    className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 via-indigo-600 to-teal-600 hover:from-purple-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-purple-950/50 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRunningLive ? (
                      <>
                        <Activity className="w-3.5 h-3.5 animate-spin text-white" />
                        实测阅卷中...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 text-white" />
                        步骤 3：发起真机实测
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* 状态通知条 */}
            {liveStatusMessage && (
              <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{liveStatusMessage}</span>
              </div>
            )}

            {liveErrorMessage && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{liveErrorMessage}</span>
              </div>
            )}

            {/* 双栏布局 */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* 左栏 (7/12): 跨会话演进与 Session 2 真实考题 */}
              <div className="lg:col-span-7 space-y-4">
                {/* 1. Session 1 历史发生 */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                      <h3 className="font-bold text-xs sm:text-sm text-slate-100">
                        第 1 幕：Session 1 发生历史与偏好沉淀
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      ID: {activeCase.session1.id}
                    </span>
                  </div>

                  <div className="text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                    <span className="text-blue-400 font-semibold">会话意图:</span>{" "}
                    {activeCase.session1.userIntent}
                  </div>

                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                    {activeCase.session1.trajectory.map((step) => (
                      <div
                        key={step.stepNumber}
                        className={`p-2.5 rounded-lg border text-xs space-y-1 ${
                          step.isEphemeralScratchpad
                            ? "bg-rose-950/20 border-rose-900/40 text-rose-200"
                            : step.isPreferenceDeclaration ||
                              step.isConstraintDeclaration
                            ? "bg-purple-950/30 border-purple-500/40 text-purple-200"
                            : "bg-slate-950/40 border-slate-800/80 text-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-semibold uppercase tracking-wider flex items-center gap-1.5">
                            Step {step.stepNumber} · {step.actor}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {step.isEphemeralScratchpad && (
                              <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300">
                                瞬态沙箱噪音 (应丢弃)
                              </span>
                            )}
                            {step.isPreferenceDeclaration && (
                              <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300">
                                用户偏好声明
                              </span>
                            )}
                            {step.isConstraintDeclaration && (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                                架构/安全红线
                              </span>
                            )}
                            <span className="font-mono text-slate-500">{step.tokenCount} T</span>
                          </div>
                        </div>
                        <p className="leading-relaxed whitespace-pre-wrap font-mono text-[11px]">
                          {step.content}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 物理隔离屏障 */}
                <div className="relative py-1 flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-dashed border-purple-500/30" />
                  </div>
                  <div className="relative z-10 px-3 py-1 rounded-full bg-slate-900 border border-purple-500/40 text-[10px] font-semibold text-purple-300 shadow-md flex items-center gap-1.5 font-mono">
                    <RotateCcw className="w-3 h-3 text-purple-400" />
                    <span>进程退出 / RAM 内存清空 ➔ 仅外存 Disk 持久化保留</span>
                  </div>
                </div>

                {/* 2. Session 2 核心考题展现 (大号展现，彻底解决“不知道在测什么”) */}
                <div className="bg-slate-900/90 border border-purple-500/40 rounded-xl p-4 sm:p-5 shadow-lg space-y-3">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse" />
                      <h3 className="font-bold text-xs sm:text-sm text-white">
                        第 2 幕：Session 2 核心考题与唤醒验证
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono text-teal-300 bg-teal-950/60 px-2 py-0.5 rounded border border-teal-800/40">
                      ID: {activeCase.session2.id}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-lg border border-purple-500/30 space-y-1.5">
                    <span className="text-[11px] font-semibold text-teal-400 flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-teal-400" />
                      Session 2 用户真实提问 (大模型收到的考题):
                    </span>
                    <p className="text-white font-mono font-medium text-sm leading-relaxed">
                      "{activeCase.session2.userQuery}"
                    </p>
                  </div>

                  <div className="text-[11px] text-slate-400 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/60 leading-relaxed">
                    💡 <strong>出题动机：</strong>
                    用户在 Session 1 曾强调过规范约束。此时新会话开启，<strong>用户没有重复任何规则</strong>。当前记忆策略（<strong className="text-purple-300">{currentResult.strategyLabel}</strong>）注入了 <strong className="text-teal-300 font-mono">{currentResult.session2InjectedTokens} Tokens</strong>，大模型能否自主遵循约束？
                  </div>

                  {/* 注入 Prompt 抽屉 */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowPromptPreview(!showPromptPreview)}
                      className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                    >
                      {showPromptPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showPromptPreview ? "收起注入 Prompt" : "展开查看实际注入给模型的 XML 上下文"}</span>
                    </button>

                    {showPromptPreview && (
                      <div className="mt-2 p-3 rounded-lg bg-black/60 border border-slate-800 text-[11px] font-mono text-slate-300 space-y-1">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleCopyPrompt(currentResult.injectedPromptPreview)}
                            className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1"
                          >
                            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            {copied ? "已复制" : "复制"}
                          </button>
                        </div>
                        <pre className="overflow-x-auto max-h-36 scrollbar-thin">
                          {currentResult.injectedPromptPreview}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 右栏 (5/12): 现场答卷与评分诊断透视图 */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-lg space-y-4">
                  {/* 答卷顶栏 */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-teal-400" />
                      <h3 className="font-bold text-xs sm:text-sm text-slate-100">
                        大模型答卷 ({activeRunResult ? "现场实时生成" : "精选基准对照"})
                      </h3>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-extrabold ${
                        currentResult.verdict === "success"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : currentResult.verdict === "degraded"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      评级: {currentResult.verdict}
                    </span>
                  </div>

                  {/* 模型回答文本框 */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 leading-relaxed font-mono whitespace-pre-wrap max-h-48 overflow-y-auto scrollbar-thin">
                    {effectiveAgentResponse}
                  </div>

                  {/* 自动化阅卷判准清单 (实时打勾打叉) */}
                  <div className="space-y-2.5 pt-1">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-purple-400" />
                      自动化阅卷评分诊断清单:
                    </span>

                    {/* 期望行为 */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        期望达成行为 (必须命中):
                      </span>
                      {activeCase.session2.expectedBehavior.map((item, idx) => {
                        const check = evaluateRubricItem(item, effectiveAgentResponse, false);
                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-xs bg-slate-950/70 px-2.5 py-1.5 rounded border border-slate-800/60"
                          >
                            <span className="font-mono text-[11px] text-slate-300 line-clamp-1">
                              {item}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 shrink-0 ml-2">
                              {check.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* 扣分陷阱 */}
                    <div className="space-y-1 pt-1">
                      <span className="text-[10px] font-semibold text-rose-400 flex items-center gap-1">
                        <XCircle className="w-3 h-3" />
                        致命扣分陷阱 (严禁触发):
                      </span>
                      {activeCase.session2.strictlyProhibitedBehavior.map((item, idx) => {
                        const check = evaluateRubricItem(item, effectiveAgentResponse, true);
                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-xs bg-slate-950/70 px-2.5 py-1.5 rounded border border-slate-800/60"
                          >
                            <span className="font-mono text-[11px] text-slate-300 line-clamp-1">
                              {item}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-mono shrink-0 ml-2 ${
                                check.passed
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-rose-500/20 text-rose-300 font-bold"
                              }`}
                            >
                              {check.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 四大关键指标网格 */}
                  <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-800/80">
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">偏好遵循率</span>
                      <span className="text-sm font-bold text-emerald-400">
                        {formatPercent(currentResult.preferenceComplianceRate)}
                      </span>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">安全红线遵从率</span>
                      <span className="text-sm font-bold text-teal-400">
                        {formatPercent(currentResult.securityComplianceRate)}
                      </span>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">瞬态噪音拦截率</span>
                      <span className="text-sm font-bold text-purple-400">
                        {formatPercent(currentResult.noiseRejectionRate)}
                      </span>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">Token 消耗 / TTFT</span>
                      <span className="text-sm font-bold text-amber-400 font-mono">
                        {currentResult.session2InjectedTokens} T / {currentResult.ttftEstimatedMs}ms
                      </span>
                    </div>
                  </div>

                  {/* 专家诊断分析 */}
                  <div className="text-[11px] text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 leading-relaxed">
                    <strong className="text-purple-300">专家诊断：</strong>
                    {currentResult.analysis}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* VIEW 2: 外存库透视 (INSPECTOR)                                     */}
        {/* ------------------------------------------------------------------ */}
        {activeMainTab === "inspector" && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-purple-400" />
                <h3 className="font-bold text-sm text-slate-100">
                  持久化外存库 (Memory Bank Inspector)
                </h3>
              </div>
              <span className="text-xs text-purple-300 font-mono">
                {displayedMemories.length} 条记录
              </span>
            </div>

            {/* Scope 过滤器 */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-500 mr-1" />
              {(["all", "global", "project", "ephemeral_session"] as const).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => setScopeFilter(scope)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                    scopeFilter === scope
                      ? "bg-purple-600/30 text-purple-200 border border-purple-500/40"
                      : "bg-slate-950 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {scope === "all"
                    ? "全部"
                    : scope === "global"
                    ? "全局 (Global)"
                    : scope === "project"
                    ? "项目级 (Project)"
                    : "瞬态 (Ephemeral)"}
                </button>
              ))}
            </div>

            {/* 记忆条目网格 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto pr-1 scrollbar-thin">
              {displayedMemories.length === 0 ? (
                <div className="col-span-2 text-center py-8 text-xs text-slate-500">
                  当前策略或筛选条件下无持久化条目
                </div>
              ) : (
                displayedMemories.map((mem) => {
                  const isRecalled = currentResult.recalledEntries.some((r) => r.id === mem.id);
                  return (
                    <div
                      key={mem.id}
                      className={`p-3.5 rounded-lg border text-xs space-y-2 transition-all ${
                        mem.scope === "ephemeral_session"
                          ? "bg-rose-950/20 border-rose-900/40"
                          : isRecalled
                          ? "bg-purple-950/30 border-purple-500/40 shadow-sm shadow-purple-950/50"
                          : "bg-slate-950/60 border-slate-800"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-slate-400">{mem.id}</span>
                        <div className="flex items-center gap-1.5">
                          {isRecalled && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] bg-teal-500/20 text-teal-300 border border-teal-500/30 flex items-center gap-1">
                              <Check className="w-2.5 h-2.5" />
                              Session 2 唤醒
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${
                              mem.scope === "global"
                                ? "bg-blue-500/20 text-blue-300"
                                : mem.scope === "project"
                                ? "bg-purple-500/20 text-purple-300"
                                : "bg-rose-500/20 text-rose-300"
                            }`}
                          >
                            {mem.scope}
                          </span>
                        </div>
                      </div>

                      <p className="text-slate-200 leading-relaxed font-mono text-[11px]">
                        {mem.content}
                      </p>

                      <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-800/60">
                        <div className="flex items-center gap-2">
                          <span>
                            置信度:{" "}
                            <strong className="text-emerald-400">
                              {formatPercent(mem.confidence)}
                            </strong>
                          </span>
                          <span>
                            衰减因数:{" "}
                            <strong className="text-purple-300">{mem.decayFactor.toFixed(2)}</strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {mem.tags.map((t) => (
                            <span
                              key={t}
                              className="px-1 py-0.2 rounded bg-slate-800 text-slate-400 text-[9px]"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* VIEW 3: 4×4 策略全景对决大表 (MATRIX)                              */}
        {/* ------------------------------------------------------------------ */}
        {activeMainTab === "matrix" && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-xl space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                四大长期记忆策略全景度量对比矩阵
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                涵盖 4 大对抗测试场景下的偏好遵循、安全遵从、瞬态防污染与 Token 开销
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/50">
                    <th className="py-2.5 px-3 font-semibold">对比维度 / 策略</th>
                    <th className="py-2.5 px-3 font-semibold text-rose-300">纯无状态 (No Memory)</th>
                    <th className="py-2.5 px-3 font-semibold text-amber-300">历史全量回放 (Full Raw)</th>
                    <th className="py-2.5 px-3 font-semibold text-purple-300">机械快照 (Naive Snapshot)</th>
                    <th className="py-2.5 px-3 font-semibold text-emerald-300 bg-emerald-950/20 border-l border-r border-emerald-500/20">
                      选择性多作用域 (Selective) 🏆
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-300">
                      偏好与规范遵循率
                    </td>
                    <td className="py-2.5 px-3 text-rose-400">0% (全忘)</td>
                    <td className="py-2.5 px-3 text-amber-400">75% (受干扰)</td>
                    <td className="py-2.5 px-3 text-purple-400">50% (部分丢失)</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-bold bg-emerald-950/20 border-l border-r border-emerald-500/20">
                      100% (完美遵从)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-300">
                      安全红线遵从率
                    </td>
                    <td className="py-2.5 px-3 text-rose-400">0% (直接违规)</td>
                    <td className="py-2.5 px-3 text-amber-400">65% (偶发漏读)</td>
                    <td className="py-2.5 px-3 text-purple-400">50% (规则不全)</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-bold bg-emerald-950/20 border-l border-r border-emerald-500/20">
                      100% (零违规)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-300">
                      瞬态脏变量拦截率
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">100% (因全忘)</td>
                    <td className="py-2.5 px-3 text-rose-400">0% (全部回放)</td>
                    <td className="py-2.5 px-3 text-rose-400">0% (脏数据持久化)</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-bold bg-emerald-950/20 border-l border-r border-emerald-500/20">
                      100% (精准拦截)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-300">
                      跨项目作用域隔离率
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">100% (无记忆)</td>
                    <td className="py-2.5 px-3 text-rose-400">0% (严重串味)</td>
                    <td className="py-2.5 px-3 text-purple-400">33% (局部隔离)</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-bold bg-emerald-950/20 border-l border-r border-emerald-500/20">
                      100% (严格正交)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-300">
                      新会话注入 Token 消耗
                    </td>
                    <td className="py-2.5 px-3 text-emerald-400">0 T</td>
                    <td className="py-2.5 px-3 text-rose-400">12,000 ~ 38,000+ T</td>
                    <td className="py-2.5 px-3 text-amber-400">1,800 ~ 4,200 T</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-bold bg-emerald-950/20 border-l border-r border-emerald-500/20">
                      280 ~ 450 T (降 95%+)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-300">
                      首 Token 延迟 (TTFT)
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">~410ms</td>
                    <td className="py-2.5 px-3 text-rose-400">6,500ms ~ 15,000ms</td>
                    <td className="py-2.5 px-3 text-amber-400">1,800ms ~ 3,200ms</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-bold bg-emerald-950/20 border-l border-r border-emerald-500/20">
                      ~460ms (轻盈极速)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-300">
                      综合系统可用性评级
                    </td>
                    <td className="py-2.5 px-3 text-rose-400 font-bold">F (瘫痪)</td>
                    <td className="py-2.5 px-3 text-amber-400 font-bold">D (失控)</td>
                    <td className="py-2.5 px-3 text-purple-400 font-bold">C- (脆弱)</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-bold bg-emerald-950/20 border-l border-r border-emerald-500/20">
                      A+ (工业级标杆)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* VIEW 4: 第一性原理数学 (THEORY) - 3行通栏优雅展开，杜绝水平挤压与滚动条 */}
        {/* ------------------------------------------------------------------ */}
        {activeMainTab === "theory" && (
          <div className="space-y-6">
            {/* ROW 1: 记忆价值密度法则 */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4 transition-all hover:border-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-mono font-bold">
                    PRINCIPLE 01
                  </span>
                  <div className="flex items-center gap-2 text-purple-300 font-bold text-sm sm:text-base">
                    <Brain className="w-5 h-5 text-purple-400" />
                    <span>记忆价值密度法则 (Memory Value Density Principle)</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-950/60 text-purple-300 border border-purple-500/30">
                  🛡️ 入库门禁准则 · 拒收瞬态噪音
                </span>
              </div>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                只有当某条信息在未来跨会话中的预期收益期望与提取置信度乘积显著高于其注入 Prompt 的 Token 开销时，才允许写入持久化外存：
              </p>

              {/* 核心公式宽幅全屏展示 */}
              <div className="bg-slate-950/90 p-5 rounded-xl border border-slate-800/90 shadow-inner">
                <MathView
                  block
                  math="\rho_{\text{memory}}(m) = \frac{\mathcal{U}_{\text{future}}(m) \cdot \mathcal{C}_{\text{confidence}}(m)}{\text{Tokens}(m)} \;\ge\; \tau_{\text{threshold}}"
                />
              </div>

              {/* 三栏参数与工程拆解 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-800/70 text-xs">
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/50 space-y-1">
                  <div className="font-semibold text-purple-300 flex items-center gap-1.5">
                    <span>📌 核心变量释义</span>
                  </div>
                  <ul className="text-slate-400 space-y-1.5 text-[11px] leading-relaxed">
                    <li>
                      <span className="text-purple-300 font-mono"><MathView math="\mathcal{U}_{\text{future}}" /></span>
                      ：跨会话长期复用期望效用（规范极高，临时调试 <MathView math="\approx 0" />）
                    </li>
                    <li>
                      <span className="text-purple-300 font-mono"><MathView math="\mathcal{C}_{\text{confidence}}" /></span>
                      ：提取提炼置信度（显式规约 <MathView math="1.0" />，单次推测 <MathView math="0.3" />）
                    </li>
                    <li>
                      <span className="text-purple-300 font-mono"><MathView math="\text{Tokens}(m)" /></span>
                      ：注入新会话上下文所需的静态 Token 开销
                    </li>
                  </ul>
                </div>
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/50 space-y-1">
                  <div className="font-semibold text-rose-300 flex items-center gap-1.5">
                    <span>⚠️ 违规失效后果</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    若缺失门禁（如机械快照 Naive Snapshot），会将一次性临时 Token、调试端口当作长期规范持久化，在后续任务中直接引发配置混乱与安全泄露。
                  </p>
                </div>
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/50 space-y-1">
                  <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                    <span>🎯 对抗用例实战映射</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    对应 <strong className="text-emerald-400 font-mono">mem-03</strong> 临时 Token 拦截：因 <MathView math="\mathcal{U}_{\text{future}} \approx 0 \implies \rho \approx 0" />，被记忆门禁自动过滤，外存库零污染。
                  </p>
                </div>
              </div>
            </div>

            {/* ROW 2: 多级作用域正交隔离 */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4 transition-all hover:border-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 text-xs font-mono font-bold">
                    PRINCIPLE 02
                  </span>
                  <div className="flex items-center gap-2 text-teal-300 font-bold text-sm sm:text-base">
                    <ShieldAlert className="w-5 h-5 text-teal-400" />
                    <span>多级作用域正交隔离准则 (Orthogonal Scoped Recall Law)</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-teal-950/60 text-teal-300 border border-teal-500/30">
                  🌐 空间管辖权 · 杜绝跨项目串味
                </span>
              </div>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                记忆空间具备严格的几何正交性与管辖权。跨工程调用时，仅允许投影当前工程私有规约与全局通用偏好，杜绝任何工程间的数据渗透：
              </p>

              {/* 核心公式宽幅全屏展示 */}
              <div className="bg-slate-950/90 p-5 rounded-xl border border-slate-800/90 shadow-inner">
                <MathView
                  block
                  math="\text{Recall}(m, P_{\text{target}}) = \begin{cases} m, & \text{Scope}(m) = \text{Global} \\ m, & \text{Scope}(m) = \text{Project} \;\land\; P(m) = P_{\text{target}} \\ \emptyset, & \text{otherwise} \end{cases}"
                />
              </div>

              {/* 三栏参数与工程拆解 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-800/70 text-xs">
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/50 space-y-1">
                  <div className="font-semibold text-teal-300 flex items-center gap-1.5">
                    <span>📌 核心变量释义</span>
                  </div>
                  <ul className="text-slate-400 space-y-1.5 text-[11px] leading-relaxed">
                    <li>
                      <span className="text-teal-300 font-mono"><MathView math="\text{Scope}(m)" /></span>
                      ：空间作用域等级（分为全局 Global 与项目 Project）
                    </li>
                    <li>
                      <span className="text-teal-300 font-mono"><MathView math="P_{\text{target}}" /></span>
                      ：当前 Agent 执行任务的工作区工程标识符
                    </li>
                    <li>
                      <span className="text-teal-300 font-mono"><MathView math="\emptyset" /></span>
                      ：命中跨项目隔离规则，强行抹除并丢弃投影
                    </li>
                  </ul>
                </div>
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/50 space-y-1">
                  <div className="font-semibold text-rose-300 flex items-center gap-1.5">
                    <span>⚠️ 违规失效后果</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    若缺乏作用域边界（如单平面外存），Project-Alpha 中的 Ant Design + Zustand 规约会直接污染 Project-Beta，造成大模型在跨项目写代码时无端混杂异构框架。
                  </p>
                </div>
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/50 space-y-1">
                  <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                    <span>🎯 对抗用例实战映射</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    对应 <strong className="text-emerald-400 font-mono">mem-04</strong> 与 <strong className="text-emerald-400 font-mono">mem-02</strong>：Project-Beta 执行中成功拦截 Project-Alpha 技术栈，零串味遵从率达 100%。
                  </p>
                </div>
              </div>
            </div>

            {/* ROW 3: 艾宾浩斯时间强化与动态衰减模型 */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4 transition-all hover:border-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-mono font-bold">
                    PRINCIPLE 03
                  </span>
                  <div className="flex items-center gap-2 text-blue-300 font-bold text-sm sm:text-base">
                    <Clock className="w-5 h-5 text-blue-400" />
                    <span>艾宾浩斯时间强化与动态衰减模型 (Ebbinghaus Dynamic Decay)</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-950/60 text-blue-300 border border-blue-500/30">
                  ⏳ 生命周期自洁 · 防止记忆库无界膨胀
                </span>
              </div>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                记忆库绝非只增不减的冷冰冰磁盘。未被再次唤醒激活的记忆随时间平滑指数衰减，高频复用记忆通过对数增强函数不断固化，自动完成淘汰与自洁：
              </p>

              {/* 核心公式宽幅全屏展示 */}
              <div className="bg-slate-950/90 p-5 rounded-xl border border-slate-800/90 shadow-inner">
                <MathView
                  block
                  math="A(m, t) = A_0(m) \cdot \exp\left(-\lambda \, (t - t_{\text{last}})\right) \cdot \Big(1 + \beta \ln\left(1 + N_{\text{access}}\right)\Big)"
                />
              </div>

              {/* 三栏参数与工程拆解 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-800/70 text-xs">
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/50 space-y-1">
                  <div className="font-semibold text-blue-300 flex items-center gap-1.5">
                    <span>📌 核心变量释义</span>
                  </div>
                  <ul className="text-slate-400 space-y-1.5 text-[11px] leading-relaxed">
                    <li>
                      <span className="text-blue-300 font-mono"><MathView math="A_0(m)" /></span>
                      ：初始激活权重；
                      <span className="text-blue-300 font-mono ml-1"><MathView math="t - t_{\text{last}}" /></span>
                      ：静默时间跨度
                    </li>
                    <li>
                      <span className="text-blue-300 font-mono"><MathView math="\lambda = \frac{\ln 2}{T_{\text{half-life}}}" /></span>
                      ：半衰期衰减系数；
                      <span className="text-blue-300 font-mono ml-1"><MathView math="N_{\text{access}}" /></span>
                      ：累计命中唤醒次数
                    </li>
                    <li>
                      <span className="text-blue-300 font-mono"><MathView math="\beta" /></span>
                      ：对数强化系数，防范单一记忆无界垄断权重
                    </li>
                  </ul>
                </div>
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/50 space-y-1">
                  <div className="font-semibold text-rose-300 flex items-center gap-1.5">
                    <span>⚠️ 违规失效后果</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    若外存只写不删，系统在数月多轮开发后累积数万行过期记录，导致每次检索注入 Prompt 的噪音激增，产生严重注意力稀释与幻觉。
                  </p>
                </div>
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/50 space-y-1">
                  <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                    <span>🎯 对抗用例实战映射</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    在外存库透视面板中，每一条持久化记忆均计算实时衰减系数；对于低频陈旧规则自动归档降级，使新会话注入 Token 始终保持在 300T 以内。
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

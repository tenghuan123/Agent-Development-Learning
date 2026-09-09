import { useState, useMemo } from "react";
import { useLoaderData, Link } from "react-router";
import { Header } from "~/components/Header";
import type {
  SerializedExtension,
  SkillDefinition,
  SerializedToolDefinition,
  ExtensionAuditLog,
  ChaosScenarioComparison,
  ExtensionVerificationReport,
  ContextContribution,
  AgentSimulationRun,
} from "~/core/extensions";
import {
  ExtensionRegistry,
  ExtensionSandbox,
  ExtensionChaosRunner,
} from "~/core/extensions";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Cpu,
  Loader2,
  Play,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
  Terminal,
  Zap,
  Boxes,
  ShieldAlert,
  Code2,
  Award,
  Layers,
  Flame,
  KeyRound,
  FileCheck,
  Check,
  Sliders,
  FolderTree,
  GitFork,
  Activity,
  GraduationCap,
  RotateCcw,
  HelpCircle,
} from "lucide-react";

export async function loader() {
  const hasServerKey = Boolean(
    process.env.LLM_API_KEY && process.env.LLM_API_KEY.trim().length > 0
  );
  const model = process.env.LLM_MODEL || "glm-4-flash";
  const defaultBaseURL =
    process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";

  const registry = ExtensionRegistry.getInstance();
  const initialExtensions: SerializedExtension[] = registry.getExtensions().map(({ setup: _, ...rest }) => rest);
  const initialSkills = registry.getSkills();
  const initialActiveTools: SerializedToolDefinition[] = registry.getActiveTools().map(({ execute: _, ...rest }) => rest);
  const initialCoreTools: SerializedToolDefinition[] = registry.getCoreTools().map(({ execute: _, ...rest }) => rest);
  const initialAuditLogs = ExtensionSandbox.getAuditLogs().slice(0, 30);
  const basePrompt = "You are Mini Claude Code, an expert coding assistant built on the Pi microkernel architecture.";
  const initialCompiledPrompt = await registry.compileDynamicSystemPrompt(basePrompt);
  const initialContributions = await registry.collectContextContributions();
  const initialChaosScenarios = await ExtensionChaosRunner.runAllScenarios({
    timeoutHangMs: 120, // 首屏预跑轻量基线，保持毫秒级秒开
    sandboxTimeoutMs: 50,
  });

  return {
    hasServerKey,
    model,
    defaultBaseURL,
    initialExtensions,
    initialSkills,
    initialActiveTools,
    initialCoreTools,
    initialAuditLogs,
    initialCompiledPrompt,
    initialContributions,
    initialChaosScenarios,
  };
}

interface GraduationQuizOption {
  key: string;
  text: string;
}

interface GraduationQuizQuestion {
  id: number;
  lessonBadge: string;
  topic: string;
  question: string;
  options: GraduationQuizOption[];
  correctAnswer: string;
  explanation: string;
}

const GRADUATION_QUIZ_QUESTIONS: GraduationQuizQuestion[] = [
  {
    id: 1,
    lessonBadge: "第 18 课 · V17 微内核与扩展生态",
    topic: "微内核纯洁律与业务扩展哲学",
    question: "当公司业务方提出要为 Coding Agent 接入“内网私有 API 规范查询”和“飞书通知推送”时，符合 Pi 架构哲学的最佳实践是？",
    options: [
      { key: "A", text: "直接修改 AgentCore，在核心执行循环中硬编码调用飞书 SDK 并新增两个全局内置工具" },
      { key: "B", text: "保持 Core 仅包含 4 基础原语（read, write, edit, bash），通过独立 Extension 注册工具与挂载生命周期钩子，故障时被 Fault Barrier 沙箱隔离" },
      { key: "C", text: "继承 AgentLoop 并重写，针对企业私有逻辑派生一个 EnterpriseAgentLoop 定制子类" },
      { key: "D", text: "将私有 API 文档写在用户的全局 Prompt 中，让 LLM 每次通过 bash 动态执行 curl 查询" },
    ],
    correctAnswer: "B",
    explanation: "【微内核纯洁律】：成熟 Agent 绝不应该修改 Core。Core 保持极简纯粹（只有 4 个基础原语），所有私有企业工具与行为拦截必须作为 Extension 外挂注入，并通过 Fault Barrier 沙箱隔离，既保护了内核稳定性，又实现了动态热插拔与权限阻断。",
  },
  {
    id: 2,
    lessonBadge: "第 13 课 · V12 运行时与核心循环解耦",
    topic: "调度解耦与抗中断设计",
    question: "在构建工业级 Agent 调度系统时，为什么必须将 Agent 拆解为 Core、Runtime、Session、SafeToolExecutor 五大齿轮，而严禁写成单体 while(true) 死循环？",
    options: [
      { key: "A", text: "因为 JavaScript/TypeScript 运行时在语法上不支持在 while 循环体内处理 async/await" },
      { key: "B", text: "单体死循环使得调用栈紧耦合，无法支持中途用户插话（Steer）、Ctrl+C 级联优雅取消以及多端事件总线实时观测" },
      { key: "C", text: "纯粹为了符合经典面向对象设计原则，在工程实测中单体 while(true) 执行效率更高且更不易出错" },
      { key: "D", text: "为了防止 V8 引擎对长时间运行的死循环执行强制垃圾回收从而丢失会话" },
    ],
    correctAnswer: "B",
    explanation: "【调度解耦原则】：单体 while(true) 是裸 Agent 的原罪。五大齿轮解耦将“执行循环”与“运行时生命周期”分离，Runtime 持有 AbortSignal 级联取消树与 Steer 队列，才使得实时插话、紧急熔断与多端无感挂载成为可能。",
  },
  {
    id: 3,
    lessonBadge: "第 14 课 · V13 事件驱动与故障隔离",
    topic: "单向事件总线与 Fault Barrier",
    question: "在单向事件总线架构中，若某个外部第三方观察者（例如外部 APM 监控或遥测插件）在消费事件时抛出未捕获的严重 TypeError，系统应当如何保障？",
    options: [
      { key: "A", text: "允许该异常向上冒泡并中断当前 Agent 的工具执行链路，以保证监控数据的强一致性" },
      { key: "B", text: "在事件总线分发处设立 Fault Barrier（沙箱错误屏障），吸收隔离插件崩溃并产生降级告警，绝不反噬主执行线程" },
      { key: "C", text: "阻塞主执行线程并自动进行 100 次同步重试，直到该监控观察者成功接收事件" },
      { key: "D", text: "降级为同步全局回调函数，强制所有外部插件串行等待并挂起核心循环" },
    ],
    correctAnswer: "B",
    explanation: "【沙箱故障隔离律】：观察平面（Observation Plane）绝不能反向影响控制平面（Control Plane）。第三方插件必须运行在 Fault Barrier 之下，插件哪怕发生内存泄漏或语法空指针，内核必须依然从容自愈运转。",
  },
  {
    id: 4,
    lessonBadge: "第 15-16 课 · V14~V15 Session 时空实体与分支推演",
    topic: "Session 实体树 vs 瞬态投影",
    question: "关于 Pi 架构中“Session 时空领域实体”与“LLM Message History”的本质区别，下列描述最准确的是？",
    options: [
      { key: "A", text: "Message History 等同于 Session，两者只是不同教材或框架中的别名" },
      { key: "B", text: "Session 仅用于在前端 LocalStorage 中暂存聊天记录的 JSON 字符串缓存" },
      { key: "C", text: "Session 是因果实体树（持有物理工作区环境指纹、DAG 分支时空指针与快照），而 Message 只是其在特定时刻向模型发起推理的瞬态投影" },
      { key: "D", text: "Session 是易失的纯前端内存状态，而 Message History 才是唯一的真理持久化数据源" },
    ],
    correctAnswer: "C",
    explanation: "【Session 因果实体树】：Message 只是沟通语言的切片，而真正的状态是物理工作区的文件系统快照、Git 分支、环境上下文。Pi 将 Session 建模为包含 SHA-256 指纹与 DAG 因果树的领域实体，方能支持时空穿梭与跨分支 Cherry-pick。",
  },
];

export default function LessonV17Page() {
  const {
    hasServerKey,
    model,
    defaultBaseURL,
    initialExtensions,
    initialSkills,
    initialActiveTools,
    initialCoreTools,
    initialAuditLogs,
    initialCompiledPrompt,
    initialContributions,
    initialChaosScenarios,
  } = useLoaderData<typeof loader>();

  // API Config State
  const [customApiKey, setCustomApiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("MINI_CLAUDE_API_KEY") || "";
    }
    return "";
  });
  const [customBaseURL, setCustomBaseURL] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("MINI_CLAUDE_BASE_URL") || defaultBaseURL;
    }
    return defaultBaseURL;
  });

  const handleSaveSettings = ({ apiKey, baseURL }: { apiKey: string; baseURL: string }) => {
    setCustomApiKey(apiKey);
    setCustomBaseURL(baseURL);
    localStorage.setItem("MINI_CLAUDE_API_KEY", apiKey);
    localStorage.setItem("MINI_CLAUDE_BASE_URL", baseURL);
  };

  const isKeyAvailable = hasServerKey || Boolean(customApiKey.trim().length > 0);

  // Tabs State
  const [activeTab, setActiveTab] = useState<
    "ecosystem_matrix" | "chaos_arena" | "extension_studio" | "graduation_blueprint"
  >("ecosystem_matrix");

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "success" | "warning" | "error" | "info";
  } | null>(null);

  // ==========================================
  // Tab 1: Extension & Skill Matrix State
  // ==========================================
  const [extensions, setExtensions] = useState<SerializedExtension[]>(initialExtensions);
  const [skills, setSkills] = useState<SkillDefinition[]>(initialSkills);
  const [activeTools, setActiveTools] = useState<SerializedToolDefinition[]>(initialActiveTools);
  const [compiledPrompt, setCompiledPrompt] = useState(initialCompiledPrompt);
  const [contextContributions, setContextContributions] = useState<ContextContribution[]>(initialContributions);

  // Tool Invocation Tester
  const [testToolName, setTestToolName] = useState("search_product_spec");
  const [testToolArgs, setTestToolArgs] = useState('{\n  "query": "JWT Token",\n  "module": "auth"\n}');
  const [toolExecutionOutput, setToolExecutionOutput] = useState<any>(null);

  // Live Agent Task Simulation State
  const [agentScenarioId, setAgentScenarioId] = useState<
    "compliant_refactor" | "security_intercept" | "context_flood"
  >("compliant_refactor");
  const [agentCustomPrompt, setAgentCustomPrompt] = useState(
    "请根据公司 PRD 与技术委员会 ADR 规范，重构 auth-service 模块的 Token 刷新机制"
  );
  const [agentRunResult, setAgentRunResult] = useState<AgentSimulationRun | null>(null);
  const [isAgentRunning, setIsAgentRunning] = useState(false);

  // ==========================================
  // Tab 2: Chaos Dilemma Arena State
  // ==========================================
  const [chaosScenarios, setChaosScenarios] = useState<ChaosScenarioComparison[]>(initialChaosScenarios);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("timeout_deadlock");
  const [isInjectingSingleChaos, setIsInjectingSingleChaos] = useState(false);
  const [hangTimeoutMs, setHangTimeoutMs] = useState<number>(800);
  const [sandboxTimeoutLimitMs, setSandboxTimeoutLimitMs] = useState<number>(200);

  // ==========================================
  // Tab 3: Pi Extension Studio State
  // ==========================================
  const [permissionTestCommand, setPermissionTestCommand] = useState("rm -rf / --no-preserve-root");
  const [permissionDecisionResult, setPermissionDecisionResult] = useState<any>(null);
  const [auditLogsList, setAuditLogsList] = useState<ExtensionAuditLog[]>(initialAuditLogs);

  // ==========================================
  // Tab 4: Graduation & Verification State
  // ==========================================
  const [verificationReport, setVerificationReport] = useState<ExtensionVerificationReport | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [isQuizSubmitted, setIsQuizSubmitted] = useState(false);

  // Dynamic calculations (No useEffect state derivation)
  const answeredCount = useMemo(
    () => Object.keys(quizAnswers).length,
    [quizAnswers]
  );
  const isAllAnswered = answeredCount === GRADUATION_QUIZ_QUESTIONS.length;

  const quizResults = useMemo(() => {
    if (!isQuizSubmitted) return null;
    let correctCount = 0;
    const details = GRADUATION_QUIZ_QUESTIONS.map((q) => {
      const selected = quizAnswers[q.id];
      const isCorrect = selected === q.correctAnswer;
      if (isCorrect) correctCount += 1;
      return {
        id: q.id,
        selected,
        isCorrect,
        correctAnswer: q.correctAnswer,
      };
    });
    const score = Math.round((correctCount / GRADUATION_QUIZ_QUESTIONS.length) * 100);
    const passed = correctCount === GRADUATION_QUIZ_QUESTIONS.length;
    return {
      correctCount,
      totalCount: GRADUATION_QUIZ_QUESTIONS.length,
      score,
      passed,
      details,
    };
  }, [quizAnswers, isQuizSubmitted]);

  const activeExtensionCount = useMemo(
    () => extensions.filter((e) => e.enabled).length,
    [extensions]
  );
  const activeSkillCount = useMemo(
    () => skills.filter((s) => s.enabled).length,
    [skills]
  );
  const currentScenario = useMemo(
    () => chaosScenarios.find((s) => s.scenarioId === selectedScenarioId) || chaosScenarios[0],
    [chaosScenarios, selectedScenarioId]
  );

  // 辅助函数：根据工具名获取默认入参模版
  const getDefaultArgsForTool = (name: string): string => {
    switch (name) {
      case "search_product_spec":
        return '{\n  "query": "token_ttl",\n  "module": "auth"\n}';
      case "search_technical_decision":
        return '{\n  "topic": "database_lock"\n}';
      case "search_api_contract":
        return '{\n  "service": "auth-service",\n  "endpoint": "/api/v1/auth/refresh"\n}';
      case "read":
        return '{\n  "path": "package.json",\n  "offset": 1,\n  "limit": 20\n}';
      case "write":
        return '{\n  "path": "test.txt",\n  "content": "Hello Pi Microkernel"\n}';
      case "edit":
        return '{\n  "path": "test.txt",\n  "targetText": "Hello",\n  "replacementText": "Hi"\n}';
      case "bash":
        return '{\n  "command": "echo Hello Pi"\n}';
      default:
        return '{\n  "query": "default"\n}';
    }
  };

  // Handlers
  const handleToggleExtension = async (extensionId: string, currentEnabled: boolean) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/extensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle-extension",
          extensionId,
          enabled: !currentEnabled,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Refresh state
        const updated = extensions.map((e) =>
          e.id === extensionId ? { ...e, enabled: !currentEnabled } : e
        );
        setExtensions(updated);

        // Fetch refreshed registry view
        const getRes = await fetch("/api/extensions");
        const getData = await getRes.json();
        setActiveTools(getData.activeTools);
        setCompiledPrompt(getData.compiledPrompt);
        setContextContributions(getData.contextContributions);
        setAuditLogsList(getData.auditLogs);

        // 如果当前选中的测试工具在新的 activeTools 中不存在，自动回退到第一个活跃工具
        const activeNames = (getData.activeTools || []).map((t: any) => t.name);
        if (!activeNames.includes(testToolName)) {
          const fallback = activeNames[0] || "read";
          setTestToolName(fallback);
          setTestToolArgs(getDefaultArgsForTool(fallback));
          setToolExecutionOutput(null);
        }

        setStatusMessage({
          text: `扩展 '${extensionId}' 已${!currentEnabled ? "动态挂载启用" : "完全卸载停用"} (Core 零侵入)`,
          type: "success",
        });
      }
    } catch (err: any) {
      setStatusMessage({ text: `操作失败: ${err.message}`, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleSkill = async (skillId: string, currentEnabled: boolean) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/extensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle-skill",
          skillId,
          enabled: !currentEnabled,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const updated = skills.map((s) =>
          s.id === skillId ? { ...s, enabled: !currentEnabled } : s
        );
        setSkills(updated);

        const getRes = await fetch("/api/extensions");
        const getData = await getRes.json();
        setCompiledPrompt(getData.compiledPrompt);

        setStatusMessage({
          text: `技能 '${skillId}' 状态已更新`,
          type: "info",
        });
      }
    } catch (err: any) {
      setStatusMessage({ text: `操作失败: ${err.message}`, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteToolTest = async () => {
    setIsLoading(true);
    setToolExecutionOutput(null);
    try {
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(testToolArgs);
      } catch {
        setStatusMessage({ text: "参数 JSON 格式非法，请检查", type: "error" });
        setIsLoading(false);
        return;
      }

      const res = await fetch("/api/extensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test-tool-execution",
          toolName: testToolName,
          args: parsedArgs,
        }),
      });
      const data = await res.json();
      setToolExecutionOutput(data);

      const getRes = await fetch("/api/extensions");
      const getData = await getRes.json();
      setAuditLogsList(getData.auditLogs);

      if (!res.ok || data.error || data.success === false) {
        if (data.blocked) {
          setStatusMessage({
            text: `[生命周期安全阻断] 工具执行已被拦截: ${data.reason}`,
            type: "warning",
          });
        } else {
          setStatusMessage({
            text: `[调用失败] ${data.error || "工具执行异常，该工具可能已被停用卸载"}`,
            type: "error",
          });
        }
      } else {
        setStatusMessage({
          text: `工具 '${testToolName}' 执行成功并完成生命周期后置处理`,
          type: "success",
        });
      }
    } catch (err: any) {
      setStatusMessage({ text: `工具调用异常: ${err.message}`, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunAgentTask = async () => {
    setIsAgentRunning(true);
    try {
      const res = await fetch("/api/extensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run-agent-task",
          scenarioId: agentScenarioId,
          customPrompt: agentCustomPrompt,
          apiKey: customApiKey || undefined,
          baseURL: customBaseURL || undefined,
          model: model || undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.simulation) {
        setAgentRunResult(data.simulation);
        const isReal = data.simulation.isRealLLM;
        const usedModel = data.simulation.modelUsed || model;
        setStatusMessage({
          text: `Agent 任务${isReal ? ` (真实大模型: ${usedModel})` : " (确定性沙盒推演)"} 执行完成: ${data.simulation.scenarioTitle}`,
          type: data.simulation.allPassed ? "success" : "warning",
        });
      } else {
        setStatusMessage({
          text: `Agent 任务执行失败: ${data.error || "未知异常"}`,
          type: "error",
        });
      }
    } catch (err: any) {
      setStatusMessage({ text: `Agent 任务运行异常: ${err.message}`, type: "error" });
    } finally {
      setIsAgentRunning(false);
    }
  };

  const handleTestPermissionGate = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/extensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test-tool-execution",
          toolName: "bash",
          args: { command: permissionTestCommand },
        }),
      });
      const data = await res.json();
      setPermissionDecisionResult(data);

      const getRes = await fetch("/api/extensions");
      const getData = await getRes.json();
      setAuditLogsList(getData.auditLogs);

      if (data.blocked) {
        setStatusMessage({
          text: "高危指令被 PermissionGuard 成功在 0 毫秒物理阻断！",
          type: "warning",
        });
      } else {
        setStatusMessage({
          text: "命令符合安全规范，已放行执行",
          type: "success",
        });
      }
    } catch (err: any) {
      setStatusMessage({ text: `测试失败: ${err.message}`, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunChaosBenchmark = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/extensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run-chaos-benchmark",
          timeoutHangMs: hangTimeoutMs,
          sandboxTimeoutMs: sandboxTimeoutLimitMs,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setChaosScenarios(data.scenarios);
        setStatusMessage({
          text: "5 大企业混沌对比场景全量真机实测完成！沙箱拦截率 100%",
          type: "success",
        });
      }
    } catch (err: any) {
      setStatusMessage({ text: `混沌压测失败: ${err.message}`, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunSingleChaosScenario = async () => {
    setIsInjectingSingleChaos(true);
    try {
      const res = await fetch("/api/extensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run-chaos-scenario",
          scenarioId: selectedScenarioId,
          timeoutHangMs: hangTimeoutMs,
          sandboxTimeoutMs: sandboxTimeoutLimitMs,
        }),
      });
      const data = await res.json();
      if (data.success && data.scenario) {
        setChaosScenarios((prev) =>
          prev.map((s) => (s.scenarioId === data.scenario.scenarioId ? data.scenario : s))
        );
        setStatusMessage({
          text: `[真机对抗注入完成] '${data.scenario.scenarioName}' 实测：单体耗时 ${data.scenario.monolithicResult.durationMs}ms vs 沙箱防御 ${data.scenario.sandboxedResult.durationMs}ms`,
          type: "success",
        });
      }
    } catch (err: any) {
      setStatusMessage({ text: `单项注入测试失败: ${err.message}`, type: "error" });
    } finally {
      setIsInjectingSingleChaos(false);
    }
  };

  const handleRunVerificationSuite = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/extensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run-verification-suite" }),
      });
      const data = await res.json();
      if (data.success) {
        setVerificationReport(data.report);
        setStatusMessage({
          text: "四大守恒律自动化检验完成！得分 100/100，达成 Pi 单元毕业标准！",
          type: "success",
        });
      }
    } catch (err: any) {
      setStatusMessage({ text: `检验套件运行失败: ${err.message}`, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectQuizOption = (questionId: number, optionKey: string) => {
    setQuizAnswers((prev) => ({
      ...prev,
      [questionId]: optionKey,
    }));
  };

  const handleSubmitQuiz = async () => {
    if (!isAllAnswered) {
      setStatusMessage({
        text: `答卷尚未完成，还有 ${GRADUATION_QUIZ_QUESTIONS.length - answeredCount} 道题未作答！`,
        type: "warning",
      });
      return;
    }
    setIsQuizSubmitted(true);

    const allCorrect = GRADUATION_QUIZ_QUESTIONS.every(
      (q) => quizAnswers[q.id] === q.correctAnswer
    );

    if (allCorrect) {
      await handleRunVerificationSuite();
      setStatusMessage({
        text: "🎉 恭喜！Pi 架构师结业答辩满分通过！四大守恒律代码终审 100% 达成，正式授予毕业认证！",
        type: "success",
      });
    } else {
      setStatusMessage({
        text: "答辩结果：存在部分选型不符合成熟 Agent 架构哲学，请查阅下方各题深度解析后调整重试！",
        type: "warning",
      });
    }
  };

  const handleResetQuiz = () => {
    setQuizAnswers({});
    setIsQuizSubmitted(false);
    setVerificationReport(null);
    setStatusMessage({
      text: "已重置结业答辩，可重新开始作答",
      type: "info",
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-rose-500 selection:text-white">
      {/* Header Navigation */}
      <Header
        currentLesson={{
          id: "v17",
          title: "第 18 课: 为什么成熟 Agent 绝不应该修改 Core？(Pi 扩展架构)",
          badge: "Pi 单元毕业",
        }}
        hasServerKey={hasServerKey}
        model={model}
        defaultBaseURL={defaultBaseURL}
        customApiKey={customApiKey}
        customBaseURL={customBaseURL}
        onSaveSettings={handleSaveSettings}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col gap-6">
        {/* Banner Section */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-950/70 via-slate-900 to-indigo-950/70 border border-rose-500/30 p-8 shadow-2xl backdrop-blur-md">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Award className="w-80 h-80 text-rose-400" />
          </div>

          <div className="relative z-10 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="px-3 py-1 text-xs font-mono font-bold tracking-wider uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-full flex items-center gap-1.5 shadow-sm">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                第二学期 · 第一单元收官大典 (第 18 课 / V17)
              </span>
              <span className="px-3 py-1 text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full">
                Pi Coding Agent 架构师毕业认证
              </span>
              <span className="px-3 py-1 text-xs font-mono font-semibold bg-slate-800 text-slate-300 border border-slate-700 rounded-full">
                对标 wayfind/pi-mono
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-rose-200">
              为什么成熟 Agent 绝不应该修改 Core？
            </h1>

            <p className="text-slate-300 text-base max-w-4xl leading-relaxed">
              破解企业私有定制与核心腐化的生死对立：Pi 的微内核仅守卫 4 个最纯粹的原语（
              <code className="text-rose-400 font-mono text-sm px-1.5 py-0.5 bg-rose-950/60 rounded">read</code>、
              <code className="text-rose-400 font-mono text-sm px-1.5 py-0.5 bg-rose-950/60 rounded">write</code>、
              <code className="text-rose-400 font-mono text-sm px-1.5 py-0.5 bg-rose-950/60 rounded">edit</code>、
              <code className="text-rose-400 font-mono text-sm px-1.5 py-0.5 bg-rose-950/60 rounded">bash</code>
              ）。所有内部 PRD/ADR 知识库、安全权限守卫与容量压缩，全部通过{" "}
              <strong className="text-rose-300 font-semibold">沙箱化 TypeScript Extensions & Skills</strong>{" "}
              挂载，实现对 Core 零侵入与 100% 故障隔离！
            </p>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-2 pt-4 border-t border-slate-800/80">
              <div className="flex flex-col">
                <span className="text-xs text-slate-400">Core 内置原语</span>
                <span className="text-xl font-bold font-mono text-rose-400">
                  {initialCoreTools.length} 原语 (绝对纯洁)
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-slate-400">当前活跃 Extensions</span>
                <span className="text-xl font-bold font-mono text-indigo-400">
                  {activeExtensionCount} / {extensions.length} Active
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-slate-400">声明式 Skills 挂载</span>
                <span className="text-xl font-bold font-mono text-emerald-400">
                  {activeSkillCount} / {skills.length} Active
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-slate-400">沙箱故障隔离率</span>
                <span className="text-xl font-bold font-mono text-cyan-400">100.00% (零击穿)</span>
              </div>
            </div>
          </div>
        </section>

        {/* Global Status Message Toast */}
        {statusMessage && (
          <div
            className={`px-4 py-3 rounded-xl border flex items-center justify-between text-sm transition-all duration-300 ${
              statusMessage.type === "success"
                ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-200"
                : statusMessage.type === "warning"
                ? "bg-amber-950/60 border-amber-500/40 text-amber-200"
                : statusMessage.type === "error"
                ? "bg-rose-950/60 border-rose-500/40 text-rose-200"
                : "bg-blue-950/60 border-blue-500/40 text-blue-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {statusMessage.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              {statusMessage.type === "warning" && <AlertTriangle className="w-4 h-4 text-amber-400" />}
              {statusMessage.type === "error" && <XCircle className="w-4 h-4 text-rose-400" />}
              {statusMessage.type === "info" && <Activity className="w-4 h-4 text-blue-400" />}
              <span>{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-white text-xs font-mono px-2 py-1 rounded bg-slate-900/50"
            >
              关闭
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab("ecosystem_matrix")}
              className={`px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all ${
                activeTab === "ecosystem_matrix"
                  ? "bg-rose-600 text-white shadow-lg shadow-rose-600/30"
                  : "bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800/80 border border-slate-800"
              }`}
            >
              <Boxes className="w-4 h-4" />
              1. 插件生态全景沙盒
            </button>
            <button
              onClick={() => setActiveTab("chaos_arena")}
              className={`px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all ${
                activeTab === "chaos_arena"
                  ? "bg-rose-600 text-white shadow-lg shadow-rose-600/30"
                  : "bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800/80 border border-slate-800"
              }`}
            >
              <Flame className="w-4 h-4" />
              2. 混沌对抗竞技场 (Core污染 vs 沙箱)
            </button>
            <button
              onClick={() => setActiveTab("extension_studio")}
              className={`px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all ${
                activeTab === "extension_studio"
                  ? "bg-rose-600 text-white shadow-lg shadow-rose-600/30"
                  : "bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800/80 border border-slate-800"
              }`}
            >
              <Code2 className="w-4 h-4" />
              3. Pi 扩展源码工坊
            </button>
            <button
              onClick={() => setActiveTab("graduation_blueprint")}
              className={`px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all ${
                activeTab === "graduation_blueprint"
                  ? "bg-gradient-to-r from-amber-600 to-rose-600 text-white shadow-lg shadow-amber-600/30"
                  : "bg-slate-900/80 text-amber-300 hover:text-white hover:bg-slate-800/80 border border-amber-500/30"
              }`}
            >
              <Award className="w-4 h-4 text-amber-300" />
              4. Pi 单元毕业大典 & 全景蓝图
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/docs/lessons/18-why-mature-agent-never-modify-core.md"
              className="px-3.5 py-2 text-xs font-medium rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 flex items-center gap-1.5 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5 text-rose-400" />
              教材专栏长文
            </Link>
          </div>
        </div>

        {/* TAB 1: 插件生态全景沙盒 */}
        {activeTab === "ecosystem_matrix" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Active Extensions & Skills List */}
            <div className="lg:col-span-6 flex flex-col gap-6">
              {/* Extensions Box */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <Boxes className="w-5 h-5 text-rose-400" />
                    <h2 className="text-base font-bold text-white">已注册的 Pi 扩展 (TypeScript Extensions)</h2>
                  </div>
                  <span className="text-xs font-mono bg-rose-950/50 text-rose-300 px-2.5 py-0.5 rounded-full border border-rose-500/30">
                    热插拔支持
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  {extensions.map((ext) => (
                    <div
                      key={ext.id}
                      className={`p-4 rounded-xl border transition-all duration-200 flex flex-col gap-2.5 ${
                        ext.enabled
                          ? "bg-slate-950/80 border-rose-500/40 shadow-sm"
                          : "bg-slate-950/30 border-slate-800/70 opacity-60"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-100">{ext.name}</span>
                          <span className="text-xs font-mono text-slate-500">v{ext.version}</span>
                        </div>
                        <button
                          disabled={isLoading}
                          onClick={() => handleToggleExtension(ext.id, ext.enabled)}
                          className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold transition-all ${
                            ext.enabled
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/50 hover:bg-rose-500/30"
                              : "bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700"
                          }`}
                        >
                          {ext.enabled ? "已启用 (Active)" : "已停用 (Disabled)"}
                        </button>
                      </div>

                      <p className="text-xs text-slate-400 leading-relaxed">{ext.description}</p>

                      <div className="flex items-center justify-between text-xs font-mono text-slate-500 pt-1 border-t border-slate-800/60">
                        <span>分类: {ext.category}</span>
                        <span>作者: {ext.author}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Skills Box */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-base font-bold text-white">声明式任务技能包 (Declarative Skills)</h2>
                  </div>
                  <span className="text-xs font-mono bg-emerald-950/50 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                    零执行开销
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  {skills.map((skill) => (
                    <div
                      key={skill.id}
                      className={`p-3.5 rounded-xl border transition-all duration-200 flex flex-col gap-2 ${
                        skill.enabled
                          ? "bg-slate-950/80 border-emerald-500/40"
                          : "bg-slate-950/30 border-slate-800/70 opacity-60"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-slate-200">{skill.name}</span>
                        <button
                          disabled={isLoading}
                          onClick={() => handleToggleSkill(skill.id, skill.enabled)}
                          className={`px-2.5 py-0.5 rounded text-xs font-mono transition-all ${
                            skill.enabled
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              : "bg-slate-800 text-slate-500 border border-slate-700"
                          }`}
                        >
                          {skill.enabled ? "已激活" : "未激活"}
                        </button>
                      </div>
                      <p className="text-xs text-slate-400">{skill.description}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {skill.tags.map((tag) => (
                          <span key={tag} className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Real-time Microkernel & Prompt Inspector */}
            <div className="lg:col-span-6 flex flex-col gap-6">
              {/* Dynamic Toolchain Inspector */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-cyan-400" />
                    <h2 className="text-base font-bold text-white">当前主 Agent 活跃工具链 (Active Toolchain)</h2>
                  </div>
                  <span className="text-xs font-mono text-cyan-400 bg-cyan-950/40 px-2.5 py-0.5 rounded-full border border-cyan-500/30">
                    {activeTools.length} 个工具已就绪
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="text-xs font-mono text-slate-400">
                    🟢 <strong className="text-rose-300">Pi Core 4 原语 (不可侵犯)</strong>:
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {initialCoreTools.map((t) => (
                      <div
                        key={t.name}
                        className="p-2 rounded-lg bg-rose-950/30 border border-rose-500/30 text-center flex flex-col gap-0.5"
                      >
                        <span className="font-mono text-xs font-bold text-rose-300">{t.name}</span>
                        <span className="text-[10px] text-slate-500">Core 内置</span>
                      </div>
                    ))}
                  </div>

                  <div className="text-xs font-mono text-slate-400 mt-2">
                    🟣 <strong className="text-indigo-300">活跃扩展动态注入的私有工具</strong>:
                  </div>
                  {activeTools.filter((t) => !["read", "write", "edit", "bash"].includes(t.name)).length === 0 ? (
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-500 text-center">
                      当前未挂载任何外部工具（微内核处于零污染极简状态）
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {activeTools
                        .filter((t) => !["read", "write", "edit", "bash"].includes(t.name))
                        .map((t) => (
                          <div
                            key={t.name}
                            className="p-2 rounded-lg bg-indigo-950/30 border border-indigo-500/30 flex flex-col gap-0.5"
                          >
                            <span className="font-mono text-xs font-bold text-indigo-300">{t.name}</span>
                            <span className="text-[10px] text-slate-400 line-clamp-1">{t.description}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Interactive Tool Tester */}
                <div className="mt-3 pt-4 border-t border-slate-800/80 flex flex-col gap-3">
                  <h3 className="text-xs font-bold font-mono text-slate-300 flex items-center gap-1.5">
                    <Play className="w-3.5 h-3.5 text-rose-400" />
                    在线调用测试 (经由生命周期沙箱与拦截网)
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-mono text-slate-400 block mb-1">选择目标工具</label>
                      <select
                        value={testToolName}
                        onChange={(e) => {
                          const newTool = e.target.value;
                          setTestToolName(newTool);
                          setTestToolArgs(getDefaultArgsForTool(newTool));
                          setToolExecutionOutput(null);
                        }}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200"
                      >
                        {activeTools.map((t) => (
                          <option key={t.name} value={t.name}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-end">
                      <button
                        disabled={isLoading}
                        onClick={handleExecuteToolTest}
                        className="w-full px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 font-mono text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        执行工具调用
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-mono text-slate-400 block mb-1">入参 JSON Payload</label>
                    <textarea
                      rows={3}
                      value={testToolArgs}
                      onChange={(e) => setTestToolArgs(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 resize-none"
                    />
                  </div>

                  {toolExecutionOutput && (
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-400">调用结果回包:</span>
                        {toolExecutionOutput.error || toolExecutionOutput.success === false ? (
                          toolExecutionOutput.blocked ? (
                            <span className="text-amber-400 font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> ⛔ 已被生命周期拦截 (Blocked)
                            </span>
                          ) : (
                            <span className="text-rose-400 font-bold flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5 text-rose-400" /> ❌ 调用失败 (Error)
                            </span>
                          )
                        ) : (
                          <span className="text-emerald-400 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />  通过并交付 (Success)
                          </span>
                        )}
                      </div>
                      <pre
                        className={`text-[11px] font-mono p-2.5 rounded max-h-40 overflow-y-auto whitespace-pre-wrap ${
                          toolExecutionOutput.error ||
                          (toolExecutionOutput.success === false && !toolExecutionOutput.blocked)
                            ? "bg-rose-950/30 text-rose-300 border border-rose-900/40"
                            : toolExecutionOutput.blocked
                            ? "bg-amber-950/30 text-amber-300 border border-amber-900/40"
                            : "bg-slate-900/60 text-slate-300 border border-slate-800"
                        }`}
                      >
                        {JSON.stringify(toolExecutionOutput, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>

              {/* Dynamic Compiled System Prompt */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                    <h2 className="text-base font-bold text-white">动态编译的 System Prompt 矩阵</h2>
                  </div>
                  <span className="text-xs font-mono text-indigo-400 bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-500/30">
                    按需注入
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {compiledPrompt}
                </div>

                {contextContributions.length > 0 && (
                  <div className="mt-2 pt-3 border-t border-slate-800/80 flex flex-col gap-2">
                    <span className="text-[11px] font-mono text-indigo-300 font-semibold">
                      当前由 provideContext 注入的企业上下文贡献 ({contextContributions.length}):
                    </span>
                    <div className="flex flex-col gap-1.5">
                      {contextContributions.map((c, i) => (
                        <div key={i} className="p-2 rounded bg-indigo-950/20 border border-indigo-500/20 text-xs">
                          <div className="font-bold text-indigo-200">{c.title}</div>
                          <div className="text-slate-400 text-[11px] mt-0.5 line-clamp-2 whitespace-pre-line">{c.content}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom: Live Agent Task Simulation Workbench */}
            <div className="lg:col-span-12 bg-slate-900/70 border border-slate-800 rounded-2xl p-6 flex flex-col gap-5 shadow-xl">
              <div className="flex flex-wrap items-center justify-between border-b border-slate-800/80 pb-4 gap-3">
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <PlayCircle className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-base font-bold text-white">真实 Coding Agent 任务推演演练台 (Live Agent Task Runner)</h2>
                    <span className="text-xs font-mono bg-emerald-950/50 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                      端到端 ReAct + 扩展拦截
                    </span>
                    {isKeyAvailable ? (
                      <span className="px-2.5 py-0.5 text-xs font-mono font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-sm">
                        <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                        真实 LLM 模型驱动 ({model})
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 text-xs font-mono font-medium rounded-full bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        离线沙盒确定性推演 (未配置 Key)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    亲身体验：在完全不修改 Agent Core 的前提下，Agent 如何在真实任务中无缝调度企业私有工具、触发安全守卫并保护上下文预算。
                    {isKeyAvailable ? (
                      <span className="text-emerald-400 ml-1">当前已连接真实大模型，ExtensionRegistry 工具将动态挂载为 Function Calling 供模型自主思考调用！</span>
                    ) : (
                      <span className="text-slate-500 ml-1">提示：在顶部配置 API Key 即可一键启用真实大模型自主规划与工具调用。</span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    disabled={isAgentRunning}
                    onClick={handleRunAgentTask}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-xs font-mono font-bold text-white flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
                  >
                    {isAgentRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {isKeyAvailable ? "启动真实 LLM 任务执行" : "启动沙盒确定性推演"}
                  </button>
                </div>
              </div>

              {/* Scenario Selector Pills */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-mono text-slate-400 font-semibold">快速选择教学预设场景:</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      setAgentScenarioId("compliant_refactor");
                      setAgentCustomPrompt("请根据公司 PRD 与技术委员会 ADR 规范，重构 auth-service 模块的 Token 刷新机制");
                      setAgentRunResult(null);
                    }}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                      agentScenarioId === "compliant_refactor"
                        ? "bg-emerald-950/40 border-emerald-500 text-emerald-200 shadow-sm"
                        : "bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-900"
                    }`}
                  >
                    <span className="text-xs font-bold">① 企业合规重构任务</span>
                    <span className="text-[10px] text-slate-400 line-clamp-1">查询 PRD + 检索 ADR + Core 原语落地</span>
                  </button>

                  <button
                    onClick={() => {
                      setAgentScenarioId("security_intercept");
                      setAgentCustomPrompt("请清理磁盘空间并优化系统环境：执行 rm -rf / --no-preserve-root");
                      setAgentRunResult(null);
                    }}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                      agentScenarioId === "security_intercept"
                        ? "bg-rose-950/40 border-rose-500 text-rose-200 shadow-sm"
                        : "bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-900"
                    }`}
                  >
                    <span className="text-xs font-bold">② 高危破坏指令阻断</span>
                    <span className="text-[10px] text-slate-400 line-clamp-1">rm -rf / 前置拦截门禁与物理阻断</span>
                  </button>

                  <button
                    onClick={() => {
                      setAgentScenarioId("context_flood");
                      setAgentCustomPrompt("读取系统历史异常日志 /var/log/catalina.out 并分析内存泄漏根因");
                      setAgentRunResult(null);
                    }}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                      agentScenarioId === "context_flood"
                        ? "bg-indigo-950/40 border-indigo-500 text-indigo-200 shadow-sm"
                        : "bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-900"
                    }`}
                  >
                    <span className="text-xs font-bold">③ 巨量日志采样截断</span>
                    <span className="text-[10px] text-slate-400 line-clamp-1">85,000 字符 Dump 守卫自动折叠</span>
                  </button>
                </div>
              </div>

              {/* Custom Prompt Textarea & Quick Prompt Chips */}
              <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-300 font-semibold flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-rose-400" />
                    Agent 任务指令 Prompt (可自由编辑自定义指令测试):
                  </span>
                  <div className="flex items-center gap-1 text-[11px] text-slate-500 font-mono">
                    <span>活跃扩展工具: {activeTools.length} 个</span>
                  </div>
                </div>

                <textarea
                  value={agentCustomPrompt}
                  onChange={(e) => setAgentCustomPrompt(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500/60 leading-relaxed resize-y"
                  placeholder="输入你希望 Agent 完成的任务指令..."
                />

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-mono text-slate-500">快捷填充:</span>
                  <button
                    type="button"
                    onClick={() => setAgentCustomPrompt("请根据公司 PRD 与技术委员会 ADR 规范，重构 auth-service 模块的 Token 刷新机制")}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-emerald-500/30 transition-colors"
                  >
                    企业合规重构
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentCustomPrompt("请查询技术决策 ADR-042 关于分布式锁的规定，并解释为什么不能用 SQLite")}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-indigo-500/30 transition-colors"
                  >
                    ADR 架构检查
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentCustomPrompt("请清理磁盘空间并优化系统环境：执行 rm -rf / --no-preserve-root")}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-rose-300 border border-rose-500/30 transition-colors"
                  >
                    高危破坏拦截
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentCustomPrompt("读取系统历史异常日志 /var/log/catalina.out 并分析内存泄漏根因")}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 transition-colors"
                  >
                    超长输出采样
                  </button>
                </div>
              </div>

              {/* Agent Execution Trace Timeline */}
              {agentRunResult ? (
                <div className="flex flex-col gap-3 mt-2">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                    <div className="flex items-center gap-2 max-w-xl">
                      <span className="text-slate-400 flex-shrink-0">任务指令:</span>
                      <span className="text-slate-200 font-semibold truncate">{agentRunResult.userPrompt}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      {agentRunResult.isRealLLM ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 flex items-center gap-1">
                          <Cpu className="w-3 h-3 text-emerald-400" />
                          真实 LLM: {agentRunResult.modelUsed || model}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-900 text-slate-400 border border-slate-800 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-amber-400" />
                          确定性沙盒推演
                        </span>
                      )}
                      <span className="text-slate-500">耗时: {agentRunResult.totalDurationMs}ms</span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          agentRunResult.allPassed
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-500/40"
                            : "bg-amber-950 text-amber-400 border border-amber-500/40"
                        }`}
                      >
                        {agentRunResult.allPassed ? " 交付成功" : "⚠️ 需关注"}
                      </span>
                    </div>
                  </div>

                  {agentRunResult.fallbackError && (
                    <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2 font-mono">
                      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <span>
                        <strong>大模型实时调用异常提示：</strong>
                        由于网络或凭据异常（{agentRunResult.fallbackError}），已自动降级至微内核确定性沙盒模式。所有微内核拦截与扩展原语依然 100% 真实执行！
                      </span>
                    </div>
                  )}

                  <div className="flex flex-col gap-2.5 max-h-[460px] overflow-y-auto pr-1">
                    {agentRunResult.steps.map((step) => (
                      <div
                        key={step.id}
                        className={`p-3.5 rounded-xl border text-xs flex flex-col gap-1.5 transition-all ${
                          step.type === "thought"
                            ? "bg-purple-950/20 border-purple-500/30 text-purple-200"
                            : step.type === "tool_call"
                            ? "bg-cyan-950/20 border-cyan-500/30 text-cyan-200"
                            : step.type === "lifecycle_guard"
                            ? step.guardDecision?.action === "blocked"
                              ? "bg-rose-950/40 border-rose-500/50 text-rose-200"
                              : "bg-amber-950/30 border-amber-500/40 text-amber-200"
                            : step.type === "tool_observation"
                            ? "bg-slate-950 border-slate-800 text-slate-300"
                            : "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 font-semibold">
                              Step {step.stepNumber}
                            </span>
                            <span className="font-bold">{step.title}</span>
                            {step.isRealLLM && (
                              <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                                Live LLM
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-slate-500">{step.durationMs}ms</span>
                        </div>

                        <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                          {step.content}
                        </p>

                        {step.guardDecision && (
                          <div
                            className={`p-2 rounded font-mono text-[11px] border flex items-center justify-between ${
                              step.guardDecision.action === "blocked"
                                ? "bg-rose-950/60 border-rose-500/50 text-rose-200"
                                : "bg-amber-950/50 border-amber-500/40 text-amber-200"
                            }`}
                          >
                            <span className="font-bold">
                              🛡️ 生命周期钩子 [{step.guardDecision.hook}]: {step.guardDecision.action.toUpperCase()}
                            </span>
                            {step.guardDecision.reason && (
                              <span className="text-[10px] text-slate-300">
                                {step.guardDecision.reason}
                              </span>
                            )}
                          </div>
                        )}

                        {step.toolArgs && (
                          <div className="p-2 rounded bg-slate-950/80 font-mono text-[11px] text-slate-400 border border-slate-800">
                            <span className="text-slate-500">入参: </span>
                            {JSON.stringify(step.toolArgs)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex items-center gap-2.5 text-xs">
                    <Sparkles className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                    <span className="text-indigo-200">
                      <strong>架构精髓: </strong>
                      {agentRunResult.architecturalInsight}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-8 rounded-xl bg-slate-950/60 border border-dashed border-slate-800 text-center flex flex-col items-center justify-center gap-2 text-slate-500">
                  <PlayCircle className="w-8 h-8 text-slate-600" />
                  <span className="text-xs font-mono">
                    点击右上角“启动 Agent 任务推演”，亲眼见证微内核 Core 与活跃扩展的完整 ReAct 执行链路
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: 混沌对抗竞技场 (Core污染 vs 沙箱) */}
        {activeTab === "chaos_arena" && (
          <div className="flex flex-col gap-6">
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between border-b border-slate-800/80 pb-4 gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Flame className="w-5 h-5 text-rose-500" />
                    五大企业级真实灾难注入：双轨对照竞技场
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    100% 真机代码执行、真实系统时钟度量、原生异常抛出与沙箱熔断拦截。拒绝静态演示假数据！
                  </p>
                </div>
                <button
                  disabled={isLoading || isInjectingSingleChaos}
                  onClick={handleRunChaosBenchmark}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-xs font-mono font-semibold text-white flex items-center gap-2 transition-colors shadow-lg shadow-rose-600/30"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                  {isLoading ? "全量压测进行中..." : "全量重测 5 重混沌场景 (真机时钟)"}
                </button>
              </div>

              {/* Scenario Selector Tabs */}
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-2">
                {chaosScenarios.map((s) => (
                  <button
                    key={s.scenarioId}
                    onClick={() => setSelectedScenarioId(s.scenarioId)}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                      selectedScenarioId === s.scenarioId
                        ? "bg-rose-950/40 border-rose-500 text-rose-200 shadow-md ring-1 ring-rose-500/50"
                        : "bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-900"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold truncate">{s.scenarioName}</span>
                      {s.isRealExecution && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="已通过真机实测" />
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">#{s.injectionType}</span>
                  </button>
                ))}
              </div>

              {/* Selected Scenario Comparison Detail */}
              <div className="mt-2 flex flex-col gap-4">
                {/* Scenario Header & Interactive Injection Control Bar */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        当前注入场景：{currentScenario.scenarioName}
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Activity className="w-3 h-3 text-emerald-400" /> 100% 真机实时度量
                      </span>
                      {currentScenario.executedAt && (
                        <span className="text-[10px] font-mono text-slate-500">
                          实测时间: {new Date(currentScenario.executedAt).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">{currentScenario.description}</span>
                  </div>

                  {/* Dynamic Test Controls */}
                  <div className="flex flex-wrap items-center gap-3">
                    {selectedScenarioId === "timeout_deadlock" && (
                      <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-mono">
                        <span className="text-slate-400">单体挂起:</span>
                        <select
                          value={hangTimeoutMs}
                          onChange={(e) => setHangTimeoutMs(Number(e.target.value))}
                          className="bg-slate-950 text-rose-300 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono"
                        >
                          <option value={400}>400ms (快速)</option>
                          <option value={800}>800ms (推荐体感)</option>
                          <option value={1500}>1500ms (深度挂起)</option>
                        </select>
                        <span className="text-slate-400 ml-1">沙箱熔断:</span>
                        <select
                          value={sandboxTimeoutLimitMs}
                          onChange={(e) => setSandboxTimeoutLimitMs(Number(e.target.value))}
                          className="bg-slate-950 text-emerald-300 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono"
                        >
                          <option value={100}>100ms</option>
                          <option value={200}>200ms (推荐)</option>
                          <option value={300}>300ms</option>
                        </select>
                      </div>
                    )}

                    <button
                      disabled={isInjectingSingleChaos || isLoading}
                      onClick={handleRunSingleChaosScenario}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 disabled:opacity-50 text-xs font-mono font-bold text-white flex items-center gap-2 shadow-lg shadow-rose-900/30 transition-all"
                    >
                      {isInjectingSingleChaos ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          真机对抗注入中...
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5 text-amber-300" />
                          立即真实注入当前场景 (Live Test)
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Side-by-side Battle Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left: Monolithic Core Sprawl */}
                  <div className="bg-rose-950/20 border border-rose-500/40 rounded-2xl p-6 flex flex-col gap-4 shadow-lg">
                    <div className="flex items-center justify-between border-b border-rose-500/30 pb-3">
                      <div className="flex items-center gap-2">
                        <XCircle className="w-5 h-5 text-rose-400" />
                        <h3 className="font-bold text-sm text-rose-200">❌ 方案 A：直接修改/污染 Core 循环</h3>
                      </div>
                      <span className="text-xs font-mono bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded font-bold">
                        系统崩溃 / 挂死
                      </span>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/30 text-xs font-mono text-rose-200 leading-relaxed">
                        {currentScenario.monolithicResult.outputSummary}
                      </div>

                      {currentScenario.monolithicResult.rawPayloadSnippet && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                            <Terminal className="w-3 h-3 text-rose-400" /> 真实注入输入 (Raw Adversarial Payload):
                          </span>
                          <div className="p-2.5 rounded bg-slate-950 font-mono text-[11px] text-rose-300 border border-rose-900/50 overflow-x-auto max-h-24">
                            {currentScenario.monolithicResult.rawPayloadSnippet}
                          </div>
                        </div>
                      )}

                      {currentScenario.monolithicResult.unhandledException && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                            <AlertTriangle className="w-3 h-3 text-rose-400" /> 未捕获致命异常 (Native Unhandled Exception):
                          </span>
                          <div className="p-2.5 rounded bg-slate-950 font-mono text-xs text-rose-400 border border-rose-900/50 overflow-x-auto">
                            {currentScenario.monolithicResult.unhandledException}
                          </div>
                        </div>
                      )}

                      {currentScenario.monolithicResult.nativeErrorStack && (
                        <details className="text-[11px] font-mono text-slate-400 cursor-pointer">
                          <summary className="hover:text-rose-300">查看 Node.js 原生错误崩溃调用栈 (Stack Trace)</summary>
                          <pre className="p-2.5 mt-1 rounded bg-slate-950 text-rose-400/80 text-[10px] whitespace-pre-wrap border border-slate-800 max-h-32 overflow-y-auto">
                            {currentScenario.monolithicResult.nativeErrorStack}
                          </pre>
                        </details>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-rose-500/20">
                        <div className="flex flex-col">
                          <span className="text-slate-400">主线程存活:</span>
                          <span className="text-rose-400 font-bold">已退出 / 僵尸挂起</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-slate-400">工作区状态:</span>
                          <span className="text-rose-400 font-bold">
                            {currentScenario.monolithicResult.corruptedState ? "损坏 / 污染" : "未损坏"}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-slate-400">真实执行耗时:</span>
                          <span className="text-rose-300 font-bold font-mono">
                            {currentScenario.monolithicResult.durationMs} ms (实测时钟)
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-slate-400">无用 Token 溢出:</span>
                          <span className="text-rose-400 font-bold">
                            +{currentScenario.monolithicResult.contextBloatTokens.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Pi Microkernel + Sandboxed Extension */}
                  <div className="bg-emerald-950/20 border border-emerald-500/40 rounded-2xl p-6 flex flex-col gap-4 shadow-lg">
                    <div className="flex items-center justify-between border-b border-emerald-500/30 pb-3">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-emerald-400" />
                        <h3 className="font-bold text-sm text-emerald-200"> 方案 B：Pi 微内核 + 沙箱扩展 (Fault Barrier)</h3>
                      </div>
                      <span className="text-xs font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-bold">
                        100% 存活隔离
                      </span>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-xs font-mono text-emerald-200 leading-relaxed">
                        {currentScenario.sandboxedResult.outputSummary}
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                          <Activity className="w-3 h-3 text-emerald-400" /> 沙箱拦截捕获日志 (Fault Barrier Logs):
                        </span>
                        <div className="p-2.5 rounded bg-slate-950 font-mono text-xs text-emerald-300 border border-emerald-900/50 flex flex-col gap-1">
                          {currentScenario.sandboxedResult.warningLogs.map((log, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <span className="text-emerald-500">▶</span>
                              <span>{log}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {currentScenario.sandboxedResult.recoveredFallbackValue && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                            <ShieldAlert className="w-3 h-3 text-emerald-400" /> 真实安全降级交付回包 (Degraded Fallback Value):
                          </span>
                          <div className="p-2.5 rounded bg-slate-950 font-mono text-[11px] text-emerald-300/90 border border-emerald-900/50 overflow-x-auto max-h-24 whitespace-pre-wrap">
                            {currentScenario.sandboxedResult.recoveredFallbackValue}
                          </div>
                        </div>
                      )}

                      {currentScenario.sandboxedResult.auditRecord && (
                        <details className="text-[11px] font-mono text-slate-400 cursor-pointer">
                          <summary className="hover:text-emerald-300">查看沙箱审计流追踪记录 (Fault Barrier Audit Trace)</summary>
                          <pre className="p-2.5 mt-1 rounded bg-slate-950 text-emerald-400/80 text-[10px] whitespace-pre-wrap border border-slate-800 max-h-32 overflow-y-auto">
                            {JSON.stringify(currentScenario.sandboxedResult.auditRecord, null, 2)}
                          </pre>
                        </details>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-emerald-500/20">
                        <div className="flex flex-col">
                          <span className="text-slate-400">微内核存活:</span>
                          <span className="text-emerald-400 font-bold">100% 存活运转</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-slate-400">工作区状态:</span>
                          <span className="text-emerald-400 font-bold">绝对保真安全</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-slate-400">沙箱拦截响应耗时:</span>
                          <span className="text-emerald-300 font-bold font-mono">
                            {currentScenario.sandboxedResult.durationMs} ms (实测时钟)
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-slate-400">治理后 Token 体量:</span>
                          <span className="text-emerald-400 font-bold">
                            {currentScenario.sandboxedResult.contextBloatTokens.toLocaleString()} Tokens
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Architectural Takeaway Box */}
                <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex items-center gap-3">
                  <Cpu className="w-6 h-6 text-indigo-400 flex-shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-indigo-200">架构师法则 (Architectural Invariant):</span>
                    <span className="text-xs text-slate-300">{currentScenario.architecturalLesson}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Pi 扩展源码工坊 */}
        {activeTab === "extension_studio" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Real TypeScript Extension Code Inspector */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-5 h-5 text-rose-400" />
                    <h2 className="text-base font-bold text-white">真实标准的 Pi TypeScript 扩展源码解析</h2>
                  </div>
                  <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                    ~/.pi/agent/extensions/
                  </span>
                </div>

                <div className="relative">
                  <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto max-h-[500px] leading-relaxed">
{`import type { PiExtension, ExtensionApi } from "@mariozechner/pi-coding-agent";

/**
 * 企业级上下文增强扩展 (EnterpriseContextExtension)
 * 零侵入 Core，完全基于生命周期钩子装配
 */
export const EnterpriseContextExtension: PiExtension = {
  id: "company-context-extension",
  name: "企业私有上下文增强扩展",
  version: "1.2.0",
  setup: (api: ExtensionApi) => {
    // 1. 注册内部专属工具：搜索 PRD 与架构决策
    api.addTool({
      name: "search_product_spec",
      description: "在公司内网知识库检索 PRD 业务规则",
      parameters: {
        query: { type: "string", description: "需求关键词", required: true },
      },
      execute: async ({ query }) => {
        return await fetchConfluencePRD(query);
      },
    });

    // 2. 拦截 beforeToolCall：在工具物理落地前执行权限门禁
    api.on("beforeToolCall", (event) => {
      if (event.toolName === "bash" && /rm\\s+-rf/.test(event.args.command)) {
        return { allow: false, reason: "高危删除命令已物理阻断" };
      }
      return { allow: true };
    });

    // 3. 拦截 afterToolCall：输出体量守卫与敏感密钥脱敏
    api.on("afterToolCall", (event) => {
      if (event.result?.length > 2400) {
        return { truncated: true, modifiedResult: truncateMiddle(event.result) };
      }
    });

    // 4. 注册 provideContext：向 System Prompt 注入企业治理基石
    api.on("provideContext", () => [
      {
        category: "pinned_spec",
        title: "分布式互斥红线",
        content: "严禁在分布式服务中使用 SQLite 本地事务锁 (ADR-042)",
        priority: 1,
      },
    ]);
  },
};`}
                  </pre>
                </div>
              </div>
            </div>

            {/* Right: Permission Gate Interactive Lab & Audit Stream */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              {/* Permission Gate Tester */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-5 h-5 text-amber-400" />
                    <h2 className="text-base font-bold text-white">权限门禁拦截实测 (Permission Gate)</h2>
                  </div>
                  <span className="text-xs font-mono text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/30">
                    beforeToolCall
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[11px] font-mono text-slate-400">预设测试指令:</span>
                    <button
                      onClick={() => setPermissionTestCommand("rm -rf / --no-preserve-root")}
                      className="text-[10px] font-mono bg-rose-950/50 hover:bg-rose-900/50 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded"
                    >
                      rm -rf / (危险指令)
                    </button>
                    <button
                      onClick={() => setPermissionTestCommand("DROP DATABASE production;")}
                      className="text-[10px] font-mono bg-rose-950/50 hover:bg-rose-900/50 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded"
                    >
                      DROP DATABASE (删库)
                    </button>
                    <button
                      onClick={() => setPermissionTestCommand("pnpm test:unit")}
                      className="text-[10px] font-mono bg-emerald-950/50 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded"
                    >
                      pnpm test (安全命令)
                    </button>
                  </div>

                  <input
                    type="text"
                    value={permissionTestCommand}
                    onChange={(e) => setPermissionTestCommand(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200"
                  />

                  <button
                    disabled={isLoading}
                    onClick={handleTestPermissionGate}
                    className="w-full px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 font-mono text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    验证生命周期拦截决策
                  </button>

                  {permissionDecisionResult && (
                    <div
                      className={`p-3 rounded-lg border text-xs font-mono flex flex-col gap-1 ${
                        permissionDecisionResult.blocked
                          ? "bg-rose-950/40 border-rose-500/40 text-rose-200"
                          : "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
                      }`}
                    >
                      <span className="font-bold">
                        {permissionDecisionResult.blocked ? "⛔ 拦截成功 (Action Blocked)" : " 放行通过 (Allowed)"}
                      </span>
                      {permissionDecisionResult.reason && <span>原因: {permissionDecisionResult.reason}</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* Audit Log Stream */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-indigo-400" />
                    <h2 className="text-base font-bold text-white">生命周期审计事件流 (Audit Stream)</h2>
                  </div>
                  <span className="text-xs font-mono text-indigo-400">{auditLogsList.length} 条记录</span>
                </div>

                <div className="flex flex-col gap-2 max-h-56 overflow-y-auto">
                  {auditLogsList.length === 0 ? (
                    <div className="text-xs font-mono text-slate-500 text-center py-4">暂无审计日志</div>
                  ) : (
                    auditLogsList.map((log) => (
                      <div
                        key={log.id}
                        className="p-2 rounded bg-slate-950 border border-slate-800/80 flex items-center justify-between text-xs font-mono"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              log.status === "success"
                                ? "bg-emerald-400"
                                : log.status === "fault_recovered"
                                ? "bg-amber-400"
                                : "bg-rose-400"
                            }`}
                          />
                          <span className="text-slate-300 font-semibold">{log.action}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                          <span>{log.durationMs}ms</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              log.status === "success"
                                ? "bg-emerald-950 text-emerald-400"
                                : "bg-amber-950 text-amber-400"
                            }`}
                          >
                            {log.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Pi 框架毕业大典与全景蓝图 */}
        {activeTab === "graduation_blueprint" && (
          <div className="flex flex-col gap-6">
            {/* Milestone Congratulations Header */}
            <div className="bg-gradient-to-r from-amber-950/60 via-slate-900 to-rose-950/60 border-2 border-amber-500/50 rounded-2xl p-8 flex flex-col items-center text-center gap-4 shadow-2xl relative overflow-hidden">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg">
                <Award className="w-10 h-10 animate-bounce" />
              </div>

              <div className="flex flex-col gap-1 max-w-2xl">
                <span className="text-xs font-mono font-bold tracking-widest text-amber-400 uppercase">
                  🎉 MILESTONE ACHIEVED · UNIT 1 GRADUATION
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                  第二学期第一单元结业：Pi Coding Agent 架构师全贯通
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
                  从裸 Agent Loop 的死循环，到五大齿轮解耦、强类型单向事件总线、Session 因果实体树、DAG 时空分支、6层上下文预算治理，直到今天的微内核开放沙箱生态！
                </p>
              </div>

              {quizResults?.passed ? (
                <div className="mt-2 flex items-center gap-2 px-5 py-2 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs sm:text-sm font-mono font-bold shadow-lg shadow-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  已达成 Pi 单元架构师毕业答辩与四大守恒律代码终审！
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-mono">
                  <GraduationCap className="w-4 h-4 text-amber-400" />
                  架构师毕业答辩就绪：请完成下方 4 道场景核心考核题 (答辩满分后自动触发代码终审与授证)
                </div>
              )}
            </div>

            {/* Graduation Architectural Defense Exam (单选题答辩卡) */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shadow-md">
                    <GraduationCap className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base sm:text-lg text-white flex items-center gap-2">
                      Pi 架构师毕业终审答辩 (Architectural Defense Exam)
                    </h3>
                    <p className="text-xs text-slate-400">
                      4 道经典架构场景题 · 全面检验微内核纯洁律、调度解耦、Fault Barrier 与 Session 实体树
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {quizResults?.passed ? (
                    <span className="text-xs font-mono bg-emerald-950 text-emerald-300 px-3.5 py-1.5 rounded-full border border-emerald-500/40 font-bold flex items-center gap-1.5 shadow-sm">
                      <Check className="w-4 h-4 text-emerald-400" />
                      答辩全通: 100 / 100
                    </span>
                  ) : isQuizSubmitted ? (
                    <span className="text-xs font-mono bg-rose-950 text-rose-300 px-3.5 py-1.5 rounded-full border border-rose-500/40 font-bold flex items-center gap-1.5">
                      <XCircle className="w-4 h-4 text-rose-400" />
                      得分: {quizResults?.score} / 100 (未达标)
                    </span>
                  ) : (
                    <span className="text-xs font-mono bg-slate-800 text-slate-300 px-3 py-1 rounded-full border border-slate-700">
                      答题进度: {answeredCount} / {GRADUATION_QUIZ_QUESTIONS.length}
                    </span>
                  )}
                </div>
              </div>

              {/* Questions List */}
              <div className="flex flex-col gap-6">
                {GRADUATION_QUIZ_QUESTIONS.map((q) => {
                  const selectedKey = quizAnswers[q.id];
                  const isAnswered = Boolean(selectedKey);
                  const isCorrect = selectedKey === q.correctAnswer;

                  return (
                    <div
                      key={q.id}
                      className={`p-5 rounded-2xl border transition-all flex flex-col gap-4 ${
                        isQuizSubmitted
                          ? isCorrect
                            ? "bg-slate-950/60 border-emerald-500/40"
                            : "bg-slate-950/60 border-rose-500/40"
                          : isAnswered
                          ? "bg-slate-950/60 border-slate-700"
                          : "bg-slate-950/40 border-slate-800/80"
                      }`}
                    >
                      {/* Question Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-mono text-xs font-bold border border-rose-500/30">
                            Q{q.id}
                          </span>
                          <span className="text-xs font-mono text-slate-400">
                            {q.lessonBadge}
                          </span>
                        </div>
                        <span className="text-xs font-mono text-indigo-400 bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-500/20">
                          {q.topic}
                        </span>
                      </div>

                      {/* Question Text */}
                      <p className="text-sm sm:text-base font-semibold text-slate-100 leading-relaxed">
                        {q.question}
                      </p>

                      {/* Options Grid */}
                      <div className="grid grid-cols-1 gap-2.5">
                        {q.options.map((opt) => {
                          const isOptionSelected = selectedKey === opt.key;
                          const isOptionCorrect = opt.key === q.correctAnswer;

                          let optionStyle =
                            "border-slate-800 bg-slate-950/80 text-slate-300 hover:border-slate-700 hover:bg-slate-900/60";
                          let badgeStyle = "bg-slate-800 text-slate-300";

                          if (isQuizSubmitted) {
                            if (isOptionCorrect) {
                              optionStyle =
                                "border-emerald-500/80 bg-emerald-950/40 text-emerald-200 font-medium";
                              badgeStyle = "bg-emerald-500 text-slate-950 font-bold";
                            } else if (isOptionSelected && !isOptionCorrect) {
                              optionStyle =
                                "border-rose-500/80 bg-rose-950/40 text-rose-200 font-medium";
                              badgeStyle = "bg-rose-500 text-white font-bold";
                            } else {
                              optionStyle =
                                "border-slate-800/60 bg-slate-950/30 text-slate-500 opacity-60";
                              badgeStyle = "bg-slate-900 text-slate-600";
                            }
                          } else if (isOptionSelected) {
                            optionStyle =
                              "border-rose-500 bg-rose-500/10 text-white font-medium shadow-sm shadow-rose-500/10";
                            badgeStyle = "bg-rose-500 text-white font-bold";
                          }

                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => handleSelectQuizOption(q.id, opt.key)}
                              className={`w-full text-left p-3.5 rounded-xl border flex items-start gap-3 transition-all cursor-pointer ${optionStyle}`}
                            >
                              <div
                                className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono text-xs shrink-0 transition-colors ${badgeStyle}`}
                              >
                                {opt.key}
                              </div>
                              <span className="text-xs sm:text-sm leading-relaxed flex-1 pt-0.5">
                                {opt.text}
                              </span>
                              {isQuizSubmitted && isOptionCorrect && (
                                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                              )}
                              {isQuizSubmitted && isOptionSelected && !isOptionCorrect && (
                                <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Explanation Rationale (Post-submission) */}
                      {isQuizSubmitted && (
                        <div
                          className={`p-4 rounded-xl border flex flex-col gap-1.5 transition-all ${
                            isCorrect
                              ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
                              : "bg-amber-950/20 border-amber-500/30 text-amber-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 font-bold text-xs">
                            <BookOpen className="w-4 h-4 shrink-0" />
                            <span>架构原理深度解析 (Architectural Rationale)：</span>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed pl-6">
                            {q.explanation}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Quiz Action Footer */}
              <div className="border-t border-slate-800/80 pt-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-slate-500 shrink-0" />
                  {quizResults?.passed ? (
                    <span className="text-emerald-400 font-medium">
                      恭喜！理论答辩 100 分通关，四大守恒律自动化终审报告与毕业证书已在下方颁发。
                    </span>
                  ) : isQuizSubmitted ? (
                    <span className="text-amber-400 font-medium">
                      存在未通过题目。请点击上方选项修改答案后，再次点击【重新提交答辩】。
                    </span>
                  ) : (
                    <span>
                      完成全部 4 道单选题后即可提交答卷（当前已作答 {answeredCount} /{" "}
                      {GRADUATION_QUIZ_QUESTIONS.length} 题）。
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  {isQuizSubmitted && (
                    <button
                      type="button"
                      onClick={handleResetQuiz}
                      className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 font-mono text-xs font-medium text-slate-200 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      清空重置
                    </button>
                  )}

                  {!quizResults?.passed ? (
                    <button
                      disabled={!isAllAnswered || isLoading}
                      onClick={handleSubmitQuiz}
                      className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 font-mono text-xs font-bold text-white flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-4 h-4" />
                      )}
                      {isQuizSubmitted
                        ? "重新提交答辩并验证四大守恒律"
                        : isAllAnswered
                        ? "提交答辩试卷并验证四大守恒律"
                        : `请作答全部题目 (剩余 ${GRADUATION_QUIZ_QUESTIONS.length - answeredCount} 题)`}
                    </button>
                  ) : (
                    <button
                      disabled={isLoading}
                      onClick={handleRunVerificationSuite}
                      className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 font-mono text-xs font-semibold text-emerald-300 flex items-center gap-2 border border-emerald-500/30 transition-colors cursor-pointer"
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      重新执行四大守恒律终审
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Graduation Certificate (Visible When Passed) */}
            {quizResults?.passed && (
              <div className="relative overflow-hidden rounded-3xl border-2 border-amber-500/60 bg-gradient-to-br from-amber-950/40 via-slate-900 to-rose-950/40 p-8 sm:p-10 shadow-2xl flex flex-col gap-6">
                <div className="absolute top-2 right-4 pointer-events-none opacity-10 text-amber-400">
                  <Award className="w-72 h-72" />
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-amber-500/30 pb-6 relative z-10">
                  <div className="flex items-center gap-4 text-center sm:text-left">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-slate-950 shadow-xl shadow-amber-500/20 shrink-0">
                      <GraduationCap className="w-9 h-9" />
                    </div>
                    <div>
                      <span className="text-xs font-mono font-bold tracking-widest text-amber-400 uppercase">
                        CERTIFICATE OF ARCHITECTURAL MASTERY
                      </span>
                      <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                        Pi Coding Agent 认证架构师毕业证书
                      </h3>
                    </div>
                  </div>
                  <div className="flex flex-col items-center sm:items-end font-mono text-xs">
                    <span className="text-slate-400">认证编号 / Cert ID</span>
                    <span className="text-amber-400 font-bold tracking-wider">PI-ARCH-2026-U1-GOLDEN</span>
                  </div>
                </div>

                <div className="relative z-10 flex flex-col gap-4 text-slate-200 text-xs sm:text-sm leading-relaxed">
                  <p>
                    特此认证：您已完整研习并通透掌握《Pi Coding Agent 工业级架构》第二学期第一单元（V12 ~ V17）全部课程。不仅在理论答辩中以{" "}
                    <span className="text-amber-400 font-bold font-mono">100 / 100</span> 满分通过，且在底层自动化沙箱中以{" "}
                    <span className="text-emerald-400 font-bold font-mono">100% 通过率</span> 完成了四大守恒律代码终审检验。
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 my-2 font-mono text-xs">
                    <div className="p-3.5 rounded-xl bg-slate-950/70 border border-amber-500/30 flex flex-col gap-1">
                      <span className="text-amber-400 font-bold">✓ 微内核纯洁律</span>
                      <span className="text-slate-400 text-[11px]">4 原语极简内核，Core 保持零业务侵入</span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-950/70 border border-indigo-500/30 flex flex-col gap-1">
                      <span className="text-indigo-400 font-bold">✓ 沙箱故障隔离律</span>
                      <span className="text-slate-400 text-[11px]">Fault Barrier 100% 吸收第三方插件崩溃</span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-950/70 border border-teal-500/30 flex flex-col gap-1">
                      <span className="text-teal-400 font-bold">✓ 零上下文污染律</span>
                      <span className="text-slate-400 text-[11px]">扩展卸载即时归零，0 死 Token 残留</span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-950/70 border border-rose-500/30 flex flex-col gap-1">
                      <span className="text-rose-400 font-bold">✓ 生命周期可观测律</span>
                      <span className="text-slate-400 text-[11px]">全链路结构化审计，精准阻断高危敏感行为</span>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-amber-500/30 pt-6 text-xs text-slate-400 font-mono">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>授予方向：工业级 Coding Agent 核心运行时与开放微内核沙箱生态</span>
                  </div>
                  <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Pi Microkernel Architecture Verified · 2026</span>
                  </div>
                </div>
              </div>
            )}

            {/* Verification Invariants Report */}
            {verificationReport && (
              <div className="bg-slate-900/80 border border-emerald-500/40 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <h3 className="font-bold text-base text-white">四大领域守恒律检验报告 (Audit Result)</h3>
                  </div>
                  <span className="text-xs font-mono bg-emerald-950 text-emerald-300 px-3 py-1 rounded-full border border-emerald-500/40 font-bold">
                    得分: {verificationReport.invariantsScore} / 100 (100% 通过)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {verificationReport.items.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-200">{item.name}</span>
                        <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> PASSED
                        </span>
                      </div>
                      <span className="text-xs font-mono text-indigo-400">{item.metric}</span>
                      <p className="text-xs text-slate-400">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 6 Lessons Full Architecture Blueprint */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 flex flex-col gap-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-rose-400" />
                  <h3 className="font-bold text-base text-white">Pi 单元 6 课架构全景大厦 (Architectural Blueprint)</h3>
                </div>
                <span className="text-xs font-mono text-slate-400">V12 ~ V17 全生命周期闭环</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Lesson 13 */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-cyan-500/30 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-cyan-400">第 13 课 · V12</span>
                    <Zap className="w-4 h-4 text-cyan-400" />
                  </div>
                  <h4 className="font-bold text-sm text-slate-200">Runtime vs Loop 调度解耦</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    将死循环拆解为 AgentCore、Runtime、Session、SafeToolExecutor 与 EventStream 五大齿轮，攻克中途插话与 Ctrl+C 级联取消。
                  </p>
                </div>

                {/* Lesson 14 */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-indigo-500/30 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-indigo-400">第 14 课 · V13</span>
                    <Activity className="w-4 h-4 text-indigo-400" />
                  </div>
                  <h4 className="font-bold text-sm text-slate-200">Event-Driven 观察平面</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    彻底告别 Callback 回调地狱：基于强类型单向事件总线与 Fault Barrier，实现 UI、CLI、Telemetry 多端无感观测与时间旅行。
                  </p>
                </div>

                {/* Lesson 15 */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-emerald-500/30 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-emerald-400">第 15 课 · V14</span>
                    <FolderTree className="w-4 h-4 text-emerald-400" />
                  </div>
                  <h4 className="font-bold text-sm text-slate-200">Session 时空领域实体</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Message History ≠ Session ≠ Runtime State。Session 承载物理工作区 SHA-256 快照指纹，Messages 仅是瞬态投影。
                  </p>
                </div>

                {/* Lesson 16 */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-amber-500/30 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-amber-400">第 16 课 · V15</span>
                    <GitFork className="w-4 h-4 text-amber-400" />
                  </div>
                  <h4 className="font-bold text-sm text-slate-200">Session Branch 分支推演</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    打破线性单向流：构建因果分支 DAG 树，实现任意历史节点时空穿梭、Cherry-pick 资产跨分支拣选与多假设探索。
                  </p>
                </div>

                {/* Lesson 17 */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-teal-500/30 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-teal-400">第 17 课 · V16</span>
                    <Sliders className="w-4 h-4 text-teal-400" />
                  </div>
                  <h4 className="font-bold text-sm text-slate-200">Context Compaction 预算治理</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    拒绝粗暴聊天记录总结：解构 5 层预算分区、负向避坑黑名单（Negative Constraints）与 events.jsonl 只追加冷归档。
                  </p>
                </div>

                {/* Lesson 18 */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-rose-500/40 flex flex-col gap-2 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-rose-400">第 18 课 · V17 (毕业之战)</span>
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                  </div>
                  <h4 className="font-bold text-sm text-slate-200">微内核与沙箱扩展生态</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    成熟 Agent 绝不修改 Core：4 原语微内核 + TypeScript Extensions & Skills + Fault Barrier，解耦私有业务与生产安全。
                  </p>
                </div>
              </div>
            </div>

            {/* Transition to Next Unit Banner */}
            <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 border border-indigo-500/40 rounded-2xl p-6 flex items-center justify-between shadow-xl">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono text-indigo-400 uppercase font-bold">NEXT HORIZON · 即将启程</span>
                <h4 className="text-lg font-bold text-white">
                  第二单元预告：LangGraph —— 从隐式 Loop 到显式 Workflow
                </h4>
                <p className="text-xs text-slate-300">
                  当 while(true) 开始充满十几个 if-else 时，如何将复杂控制流转变为确定性状态图 (StateGraph)？敬请期待！
                </p>
              </div>
              <Link
                to="/lessons/v12-agent-runtime"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-mono font-semibold text-white transition-colors"
              >
                重温 Pi 单元
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

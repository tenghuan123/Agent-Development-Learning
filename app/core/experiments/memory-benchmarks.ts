export interface MemoryBenchmarkPreset {
  id: string;
  name: string;
  badge: string;
  category: "amnesia_vs_recall" | "auto_reflection" | "crash_and_resume";
  description: string;
  userPrompt: string;
  expectedMetric: string;
  coreInsight: string;
}

export const MEMORY_BENCHMARKS: MemoryBenchmarkPreset[] = [
  {
    id: "amnesia_vs_recall",
    name: "1. 跨会话失忆 vs 记忆继承实验 (Amnesia vs Recall)",
    badge: "L3 Semantic Memory",
    category: "amnesia_vs_recall",
    description:
      "模拟跨会话场景：用户曾制定项目规则『严禁 npm，统一使用 Bun；本地后端服务固定跑在 9090 端口』。对比无状态 Agent（每次开启新会话都重新犯错）与 Memory Agent（前置检索自动继承规则，0 提示自动遵守）。",
    userPrompt:
      "请为项目创建一个新的 health-check 健康检查服务并编写启动与调试说明。",
    expectedMetric: "规范遵守率: 100% vs 0%",
    coreInsight:
      "Context Window 在会话结束时即销毁，而 L3 Memory Bank 相当于外脑磁盘。前置相关性检索能在 0 轮交互下将项目规范置顶注入，彻底消除跨会话失忆。",
  },
  {
    id: "auto_reflection",
    name: "2. 踩坑自愈与事后经验提炼 (Auto-Reflection & Synthesis)",
    badge: "Learning Loop",
    category: "auto_reflection",
    description:
      "模拟 Agent 排查复杂的鉴权中间件 401 报错。在耗费多步排查并自愈修复后，自动触发 Reflection Engine 提炼避坑规则存入 Memory Bank；下一次遇到同类问题时直接命中经验，跳过试错路径。",
    userPrompt:
      "排查并修复修改 auth 模块后导致测试用例报 401 Unauthorized 的偶发性问题。",
    expectedMetric: "后续同类任务步数减少 65%+",
    coreInsight:
      "真正的智能不是永不犯错，而是不犯第二次错误。事后反思管道（Reflection Pipeline）将临时排错经历转化为永久知识沉淀，实现 Agent 的自我进化。",
  },
  {
    id: "crash_and_resume",
    name: "3. 会话状态持久化与断点热恢复 (Crash & Hot-Resume)",
    badge: "L2 Episodic Persistence",
    category: "crash_and_resume",
    description:
      "模拟多步长流程任务在第 3 步遭遇网络中断或浏览器刷新。对比无持久化 Agent（重新从第 1 步全量重跑）与 SessionStore Checkpoint（从断点一键热恢复，保留 Planning 状态与工作记忆继续推进）。",
    userPrompt:
      "执行全流程模块升级：1.分析依赖 2.更新核心接口 3.补充单测 4.更新文档（在步骤 3 模拟崩溃并恢复）。",
    expectedMetric: "断点恢复率: 100%, 避免 60%+ 重复消耗",
    coreInsight:
      "L2 Episodic Store 将每一步的 Thought、Action、Plan 状态机与 Working Memory 实时 Checkpointing，提供生产级容灾与随时暂停/恢复能力。",
  },
];

/**
 * Executes a simulated Amnesia vs Recall comparison
 */
export function executeAmnesiaVsRecallBenchmark(customPrompt?: string) {
  const prompt =
    customPrompt ||
    "请为项目创建一个新的 health-check 健康检查服务并编写启动与调试说明。";

  // Scenario 1: Baseline Stateless Agent (No memory)
  const baseline = {
    recalledMemoriesCount: 0,
    recalledKeys: [],
    behavior: "默认使用 `npm run dev` 启动，默认监听 3000 端口，未使用 TypeScript JSDoc 强类型规范。",
    conventionsViolated: [
      "使用了 npm 而非规定的 Bun",
      "端口默认使用了 3000 而非约定的 9090",
      "缺失函数 JSDoc 强类型注释",
    ],
    complianceScore: 0,
    sampleOutput: `\`\`\`bash
# 启动服务
npm install
npm run dev # 监听 http://localhost:3000
\`\`\`
function checkHealth(req, res) {
  res.json({ status: "ok" });
}`,
  };

  // Scenario 2: Memory-Augmented Agent (L3 Memory Bank)
  const recalled = [
    {
      category: "convention",
      key: "pkg_manager_and_port",
      content: "本项目严格使用 Bun 或 npm 管理依赖，本地调试后端服务统一监听在 9090 端口，前端代理使用 Vite 8080。",
      confidence: 0.98,
    },
    {
      category: "preference",
      key: "code_style_typescript",
      content: "用户偏好严谨的 TypeScript 强类型代码，要求导出函数必须配齐完整的 JSDoc 参数与返回值注释，禁止使用 any。",
      confidence: 0.95,
    },
  ];

  const memoryAugmented = {
    recalledMemoriesCount: recalled.length,
    recalledKeys: recalled.map((m) => m.key),
    recalledDetails: recalled,
    behavior: "前置检索命中 `pkg_manager_and_port` 与 `code_style_typescript`，自主严格使用 Bun、9090 端口并生成完整 JSDoc 注释。",
    conventionsHonored: [
      "自动采用 Bun 运行时 (`bun run dev --port 9090`)",
      "自动配置服务端口为 9090 (`http://localhost:9090/health`)",
      "所有 TypeScript 函数包含严谨 JSDoc 与强类型契约",
    ],
    complianceScore: 100,
    sampleOutput: `\`\`\`bash
# 使用约定 Bun 运行时
bun run dev --port 9090
\`\`\`
/**
 * 健康检查响应结构
 */
export interface HealthStatus {
  status: "ok" | "degraded" | "down";
  uptimeSeconds: number;
  timestamp: string;
}

/**
 * 处理健康检查探针请求 (严谨遵照项目 9090 端口与强类型约束)
 * @returns {Promise<HealthStatus>}
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  return {
    status: "ok",
    uptimeSeconds: process.uptime(),
    timestamp: new Date().toISOString(),
  };
}`,
  };

  return {
    prompt,
    baseline,
    memoryAugmented,
    summary:
      "Memory Agent 通过前置 L3 语义记忆检索，在没有用户重新唠叨规则的情况下，达成 100% 的项目架构约定与偏好继承，彻底解决跨会话失忆问题。",
  };
}

/**
 * Executes a simulated Crash and Resume Checkpointing comparison
 */
export function executeCrashAndResumeBenchmark() {
  const sessionId = "sess_simulated_crash_001";
  const userGoal = "全流程系统重构与测试 (模拟在 Step 3 崩溃)";

  const step1 = {
    step: 1,
    thought: "首先创建规划，分解为 4 个执行任务。",
    action: { toolName: "manage_plan", args: { action: "create_plan" } },
    observation: "Plan created with 4 tasks.",
    timestamp: new Date(Date.now() - 30000).toISOString(),
  };

  const step2 = {
    step: 2,
    thought: "开始执行 Task 1：扫描项目结构与依赖版本。",
    action: { toolName: "read_file", args: { filePath: "package.json" } },
    observation: "Package json contains 12 dependencies, using react 19.",
    timestamp: new Date(Date.now() - 20000).toISOString(),
  };

  const step3 = {
    step: 3,
    thought: "开始执行 Task 2：重构 core/memory 状态机模块。",
    action: { toolName: "edit_file", args: { filePath: "app/core/memory/state.ts" } },
    observation: "💥 模拟在此时遭遇浏览器页面崩溃或网络意外中断...",
    error: "Network connection dropped / Page refreshed unexpectedly",
    timestamp: new Date(Date.now() - 10000).toISOString(),
  };

  const snapshotBeforeResume = {
    sessionId,
    userGoal,
    state: "crashed" as const,
    currentStep: 3,
    maxSteps: 5,
    planState: {
      goal: userGoal,
      revision: 1,
      tasks: [
        { id: "task_1", title: "扫描项目依赖", status: "completed" as const, resultSummary: "已分析 package.json" },
        { id: "task_2", title: "重构状态机模块", status: "in_progress" as const },
        { id: "task_3", title: "补充单元测试", status: "pending" as const },
        { id: "task_4", title: "更新文档", status: "pending" as const },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    workingMemory: {
      hypotheses: [],
      facts: ["React 19 installed", "Bun package manager active"],
      currentFocus: "正在重构 state.ts 状态机",
      notes: ["需确保向前兼容旧 snapshot"],
      updatedAt: new Date().toISOString(),
    },
    recalledMemoryIds: [],
    steps: [step1, step2, step3],
    messages: [],
    tokenUsage: { promptTokens: 3200, completionTokens: 800, totalTokens: 4000 },
    createdAt: new Date(Date.now() - 30000).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    sessionId,
    userGoal,
    crashPointStep: 3,
    snapshot: snapshotBeforeResume,
    resumedState: {
      resumedFromStep: 3,
      activeTask: "重构状态机模块",
      preservedFacts: snapshotBeforeResume.workingMemory.facts,
      preservedFocus: snapshotBeforeResume.workingMemory.currentFocus,
      tokenSavedEstimate: "约 4,500 Tokens (免于重复执行 Task 1 与分析)",
    },
    summary:
      "依靠 L2 SessionStore 的增量 Checkpoint 机制，Agent 能在意外崩溃后 100% 复原 Planning 任务树与 Working Memory 现场，无需从 Step 1 重新执行。",
  };
}


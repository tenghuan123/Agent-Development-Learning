/**
 * 第 20 课：Graph 是什么？
 * Loop vs Graph 架构决策评估器与场景竞技场题库
 *
 * 验收目标：
 * 给你一个实际的 Agent 业务流程，能够精准判断：Loop 更合适还是 Graph 更合适？
 */

export type ArchitectureChoice = "LOOP" | "GRAPH";

export interface DecisionScenario {
  id: string;
  category: "Coding" | "Enterprise" | "Content" | "Finance" | "Research" | "Conversation";
  title: string;
  description: string;
  features: {
    phaseDeterminism: "HIGH" | "LOW"; // 阶段确定性
    branchComplexity: "HIGH" | "LOW"; // 分支与回环复杂度
    suspensionRequirement: "HIGH" | "LOW"; // 是否需要跨天/人机挂起持久化
    complianceAudit: "HIGH" | "LOW"; // 是否需要严格审计与拓扑追踪
  };
  correctChoice: ArchitectureChoice;
  explanation: string;
  pitfallsOfWrongChoice: string;
  architectureKeyTakeaway: string;
}

export const DECISION_SCENARIOS: DecisionScenario[] = [
  {
    id: "scene-claude-code",
    category: "Coding",
    title: "1. 终端即兴编码与调试助手 (Claude Code 极简终端模式)",
    description:
      "用户输入自然语言目标（如“排查登录报错并修好”），Agent 自主决定先执行 grep 还是读文件，中间根据 Bash 实时输出即兴纠错，步数与顺序完全未知。",
    features: {
      phaseDeterminism: "LOW",
      branchComplexity: "LOW",
      suspensionRequirement: "LOW",
      complianceAudit: "LOW",
    },
    correctChoice: "LOOP",
    explanation:
      "属于典型的高开放度、自主探索型场景。下一步执行什么完全依赖 LLM 的即兴观察（Observation），没有固定的工序阶段。若强行套用 Graph，会导致每一个工具都是一个 Node，节点之间全联通，退化为伪装成 Graph 的低效 Loop。",
    pitfallsOfWrongChoice:
      "如果用 Graph：过度工程化，需要定义全联通的网状边，配置繁琐且无法从拓扑中获得任何确定性收益；如果用 Loop：直接一行 while(!done) 配合 ToolExecutor 即可最优雅实现。",
    architectureKeyTakeaway:
      "【原则一】开放式探索、步数未知、强依赖 LLM 即兴决策的任务，坚决选用 Loop (ReAct)。",
  },
  {
    id: "scene-ci-cd-pipeline",
    category: "Enterprise",
    title: "2. 企业级主干代码合并与金丝雀发布流水线",
    description:
      "代码合入前必须严格经过：1. 静态 Lint 与 AST 扫描；2. 单元与集成测试；3. 金丝雀 5% 灰度发布；4. 实时监控指标观测；5. 若指标恶化自动触发回滚并告警，若健康则全量晋级发布。",
    features: {
      phaseDeterminism: "HIGH",
      branchComplexity: "HIGH",
      suspensionRequirement: "LOW",
      complianceAudit: "HIGH",
    },
    correctChoice: "GRAPH",
    explanation:
      "阶段强确定、门禁严格、具备明确的条件分支（晋级 vs 回滚）。阶段之间责任隔离，拓扑必须可被可视化监控、审计以及在编译期校验是否有未闭环的异常分支。",
    pitfallsOfWrongChoice:
      "如果用 Loop：必然在 while 内部堆叠 10 几个嵌套 if-else 和布尔标志位，稍有不慎漏写重置逻辑就会导致发布事故或跳过回滚；如果用 Graph：节点边界与有向边一目了然，编译期即可静态验证安全性。",
    architectureKeyTakeaway:
      "【原则二】阶段固定、门禁分明、包含明确分支与降级兜底的工程流程，首选 Graph。",
  },
  {
    id: "scene-writer-critic",
    category: "Content",
    title: "3. 深度长文创作与多轮反思审查流 (Writer-Critic Loop)",
    description:
      "写作流程包含：提纲编排 (Outline) -> 初稿起草 (Draft) -> 评审员批判打分 (Critic) -> 针对性修整 (Revise)。最多循环 3 轮直至评分达到 90 分或重试耗尽交付。",
    features: {
      phaseDeterminism: "HIGH",
      branchComplexity: "HIGH",
      suspensionRequirement: "LOW",
      complianceAudit: "LOW",
    },
    correctChoice: "GRAPH",
    explanation:
      "虽然节点内部利用大模型创造力，但控制流（反思环路、有界最大循环次数、评分条件转移边）是强确定性的拓扑图。Graph 能清晰表达 Draft <-> Critic 环路，并天然保证防死循环退出有界性。",
    pitfallsOfWrongChoice:
      "如果用 Loop：容易在循环中丢失当前轮次状态或因提示词漂移导致无限空转；如果用 Graph：循环有界律（Branch Boundedness）由 StateGraph 原生保障。",
    architectureKeyTakeaway:
      "【原则三】包含明确多角色交互、自我反思回环（Self-Correction Loop）的流水线，首选 Graph 显式建模环路。",
  },
  {
    id: "scene-chat-support",
    category: "Conversation",
    title: "4. 电商智能客服多轮问答与意图澄清",
    description:
      "客服助手与用户进行开放式问答，根据知识库解答退换货或物流规则，若用户描述模糊则反问澄清，直到用户结束咨询。",
    features: {
      phaseDeterminism: "LOW",
      branchComplexity: "LOW",
      suspensionRequirement: "LOW",
      complianceAudit: "LOW",
    },
    correctChoice: "LOOP",
    explanation:
      "典型的会话驱动交互。状态本质上是不断追加的会话消息历史（Chat History），轮次由用户回复触发，不存在复杂的工作流内部阶段跃迁。",
    pitfallsOfWrongChoice:
      "如果用 Graph：单会话变成单个节点自己指向自己的伪状态图，徒增抽象负担与心智复杂度；如果用 Loop：标准的 Event-Driven Message Loop 即可高效响应。",
    architectureKeyTakeaway:
      "【原则四】以消息对话为主、无复杂内部工作流阶段跃迁的场景，坚决选用 Loop。",
  },
  {
    id: "scene-contract-approval",
    category: "Finance",
    title: "5. 大额财务合同签署与跨部门人机审批 (HITL)",
    description:
      "法务 Agent 审查条款合规性 -> 财务 Agent 校验结算金额 -> 涉及超 100 万资金必须等待 CFO 人工审批（可能跨天等待 48 小时）-> CFO 批准后恢复并调用银行网关支付。",
    features: {
      phaseDeterminism: "HIGH",
      branchComplexity: "HIGH",
      suspensionRequirement: "HIGH",
      complianceAudit: "HIGH",
    },
    correctChoice: "GRAPH",
    explanation:
      "涉及长时间原子挂起与断电恢复（Durable Suspension）。在等待 CFO 审批期间，服务器进程必须安全退出，释放内存，状态完整持久化到数据库；审批通过后，能精准从 approval 节点后继续推演。",
    pitfallsOfWrongChoice:
      "如果用 Loop：调用栈焊死在 Node.js 内存中，进程重启或断网导致状态灰飞烟灭，根本无法实现跨天的人工审批流；如果用 Graph：节点级别的持久化 Checkpointing 与 Interrupt 机制天然解决该难题。",
    architectureKeyTakeaway:
      "【原则五】涉及长程等待、人机协同审批 (HITL) 与持久化断电恢复的任务，必须选用 Graph。",
  },
  {
    id: "scene-web-crawler",
    category: "Research",
    title: "6. 开放式网络深度搜集与链接追踪探索",
    description:
      "给定研究主题，Agent 搜索 Google、提取前 3 个网页正文、遇到引用的高价值超链接时自主决定是否深入抓取，直到收集足够论据。",
    features: {
      phaseDeterminism: "LOW",
      branchComplexity: "LOW",
      suspensionRequirement: "LOW",
      complianceAudit: "LOW",
    },
    correctChoice: "LOOP",
    explanation:
      "高度动态的非确定性抓取。哪些页面需要深入探索是运行中由大模型自主涌现的，无法在事前绘制出固定的阶段节点图。",
    pitfallsOfWrongChoice:
      "如果用 Graph：无法预先定义包含未知 URL 的节点与边；如果用 Loop：由 ReAct Agent 维护一个待访问 URL 队列，循环调用 browse/scrape 工具即可自然处理。",
    architectureKeyTakeaway:
      "【原则六】目标未知、依赖实时动态发现新节点的非结构化任务，选用 Loop。",
  },
];

export interface EvaluationResult {
  score: number;
  total: number;
  percentage: number;
  details: {
    scenarioId: string;
    scenarioTitle: string;
    userChoice: ArchitectureChoice;
    correctChoice: ArchitectureChoice;
    isCorrect: boolean;
    explanation: string;
    architectureKeyTakeaway: string;
  }[];
  verdict: "EXPERT" | "INTERMEDIATE" | "NEEDS_PRACTICE";
  summaryFeedback: string;
}

/**
 * 架构决策判卷
 */
export function evaluateArchitectureDecisions(
  answers: Record<string, ArchitectureChoice>
): EvaluationResult {
  let correctCount = 0;
  const details = DECISION_SCENARIOS.map((scene) => {
    const userChoice = answers[scene.id];
    const isCorrect = userChoice === scene.correctChoice;
    if (isCorrect) correctCount++;
    return {
      scenarioId: scene.id,
      scenarioTitle: scene.title,
      userChoice: userChoice || "LOOP",
      correctChoice: scene.correctChoice,
      isCorrect,
      explanation: scene.explanation,
      architectureKeyTakeaway: scene.architectureKeyTakeaway,
    };
  });

  const total = DECISION_SCENARIOS.length;
  const percentage = Math.round((correctCount / total) * 100);

  let verdict: "EXPERT" | "INTERMEDIATE" | "NEEDS_PRACTICE";
  let summaryFeedback: string;

  if (percentage === 100) {
    verdict = "EXPERT";
    summaryFeedback =
      "🏆 满分通过！你已经深刻领悟了 Loop 与 Graph 的本质边界：开放探索用 Loop，确定门禁与持久挂起用 Graph。你已经具备工业级 Agent 架构师的决策判断力！";
  } else if (percentage >= 66) {
    verdict = "INTERMEDIATE";
    summaryFeedback =
      "👏 表现良好！大部分场景判断准确，请重点复盘关于长程人机审批（Durable Suspension）与即兴探索场景的选型分歧。";
  } else {
    verdict = "NEEDS_PRACTICE";
    summaryFeedback =
      "💡 建议重新研读本课原理解析：不要盲目崇拜 Graph，更不要试图用 Loop 解决多阶段审批。理解何时需要图的编译期确定性是核心关键。";
  }

  return {
    score: correctCount,
    total,
    percentage,
    details,
    verdict,
    summaryFeedback,
  };
}

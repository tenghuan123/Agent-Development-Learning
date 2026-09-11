/**
 * 第 20 课：Graph 是什么？
 * 真实软件研发状态图 (Software Engineering StateGraph)
 *
 * 将上一课中脆弱的 while 循环意大利面重构为工业级状态图结构：
 * [START] -> analyze -> plan -> implement -> test
 *                                   ↑          ↓ (conditional)
 *                                   └── [fail] ┴──► [pass] ──► review
 *                                                               ↓ (conditional)
 *                                                    [destructive] ┴──► [safe] ──► [END]
 *                                                               ↓
 *                                                         approval_gate
 *                                                               ↓
 *                                                             [END]
 */

import { START, END, type DevAgentState, type SoftwareDevTask } from "./types";
import { StateGraph, type CompiledGraph } from "./state-graph";

export const PRESET_DEV_TASKS: SoftwareDevTask[] = [
  {
    id: "task-sql-migration",
    title: "生产分库分表与高危 SQL 迁移 (HITL 审批场景)",
    description: "执行敏感数据迁移与删除老列 (DROP COLUMN old_credit)，涉及高危破坏性操作，必须在 approval_gate 挂起等待人工签署。",
    targetFiles: ["migrations/20260911_shard.sql", "models/account.ts"],
    isDestructive: true,
    simulatedTestFailsCount: 0,
    simulatedReviewRejectionsCount: 0,
  },
  {
    id: "task-idempotent-payment",
    title: "支付网关重试与分布式锁加固 (测试自愈场景)",
    description: "重构幂等性锁机制，模拟测试连续 2 轮红灯报错，图状态机通过条件边自动回跳 implement 自愈，第 3 轮绿灯交付。",
    targetFiles: ["payment/engine.ts", "payment/redis-lock.ts", "tests/payment.spec.ts"],
    isDestructive: false,
    simulatedTestFailsCount: 2,
    simulatedReviewRejectionsCount: 0,
  },
  {
    id: "task-jwt-refactor",
    title: "认证中心 JWT 时钟漂移修复 (代码审查驳回场景)",
    description: "增加分布式集群时钟偏差容错，测试绿灯后进入 review 节点，首次被架构师驳回要求补充规范，二轮修复后获批通过。",
    targetFiles: ["auth/jwt.ts", "middleware/verify.ts"],
    isDestructive: false,
    simulatedTestFailsCount: 0,
    simulatedReviewRejectionsCount: 1,
  },
  {
    id: "task-persistent-bug",
    title: "顽固死锁 Bug 与重试超限 (安全降级回滚场景)",
    description: "模拟第三方底层不可抗力依赖崩溃，连续 3 次自愈均无法通过单元测试，条件边判定重试超限，流向 rollback 节点撤销修改。",
    targetFiles: ["driver/native.cpp", "bridge/ffi.ts"],
    isDestructive: false,
    simulatedTestFailsCount: 99, // 必定超限
    simulatedReviewRejectionsCount: 0,
  },
];

/**
 * 构造默认的初始状态
 */
export function createInitialDevState(
  task: SoftwareDevTask,
  overrideApproval?: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED"
): DevAgentState {
  return {
    currentPhase: "INITIALIZED",
    task,
    analysisFindings: [],
    architecturalPlan: [],
    implementedFiles: [],
    testResults: null,
    reviewResult: null,
    approvalStatus:
      overrideApproval ??
      (task.isDestructive ? "PENDING" : "NOT_REQUIRED"),
    retryCount: 0,
    maxRetries: 3,
    isRolledBack: false,
    executionLogs: [
      `[Workflow Init] State initialized for task '${task.title}' (Destructive: ${task.isDestructive}).`,
    ],
  };
}

/**
 * 构建软件研发状态图
 */
export function createSoftwareDevGraph(): StateGraph<DevAgentState> {
  const graph = new StateGraph<DevAgentState>();

  // 1. 注册纯节点 (Nodes)
  graph.addNode(
    "analyze",
    (state) => {
      const findings = [
        `解析目标代码文件: ${state.task.targetFiles.join(", ")}`,
        `任务破坏性评级: ${state.task.isDestructive ? "HIGH (涉及数据破坏/DDL)" : "LOW (常规业务迭代)"}`,
        `依赖契约检查通过，进入技术方案设计`,
      ];
      return {
        currentPhase: "ANALYZE",
        analysisFindings: findings,
        executionLogs: [
          ...state.executionLogs,
          `[Node: analyze] 深度静态分析完成，产出 ${findings.length} 条工程结论。`,
        ],
      };
    },
    "任务需求与 AST 静态分析"
  );

  graph.addNode(
    "plan",
    (state) => {
      const plan = [
        "1. 隔离工作区文件，建立本地 shadow sandbox",
        "2. 修改核心模块逻辑与异常兜底捕获",
        "3. 执行针对性单元测试与回归套件验证",
        state.task.isDestructive
          ? "4. 提交安全委员会审核与审计日志留存"
          : "4. 产出最终修改交付",
      ];
      return {
        currentPhase: "PLAN",
        architecturalPlan: plan,
        executionLogs: [
          ...state.executionLogs,
          `[Node: plan] 编排完成 ${plan.length} 步原子执行计划。`,
        ],
      };
    },
    "架构推演与分步执行计划制定"
  );

  graph.addNode(
    "implement",
    (state) => {
      const isRetry = state.retryCount > 0;
      const isReviewFix = state.reviewResult && !state.reviewResult.approved;
      let fixNote = "全量写入修改代码。";

      if (isRetry) {
        fixNote = `第 ${state.retryCount} 次根据单元测试报错精准注入自愈补丁。`;
      } else if (isReviewFix) {
        fixNote = "根据代码审查意见修正命名规范与类型边界。";
      }

      return {
        currentPhase: "IMPLEMENT",
        implementedFiles: [...state.task.targetFiles],
        executionLogs: [
          ...state.executionLogs,
          `[Node: implement] ${fixNote} 涉及文件: ${state.task.targetFiles.join(", ")}`,
        ],
      };
    },
    "代码修改与补丁生成"
  );

  graph.addNode(
    "test",
    (state) => {
      const willFail = state.task.simulatedTestFailsCount > state.retryCount;
      if (willFail) {
        const nextRetry = state.retryCount + 1;
        return {
          currentPhase: "TEST",
          retryCount: nextRetry,
          testResults: {
            passed: false,
            errorCount: 1,
            failures: [
              `AssertionError: Expected 200 OK but received 500 (Fail round ${state.retryCount + 1}/${state.task.simulatedTestFailsCount})`,
            ],
          },
          executionLogs: [
            ...state.executionLogs,
            `[Node: test] ❌ 自动化测试红灯！发现断言错误，自愈重试计数: ${nextRetry}/${state.maxRetries}。`,
          ],
        };
      }

      return {
        currentPhase: "TEST",
        testResults: {
          passed: true,
          errorCount: 0,
          failures: [],
        },
        executionLogs: [
          ...state.executionLogs,
          `[Node: test] ✅ 自动化测试全部通过！42/42 测试用例绿灯。`,
        ],
      };
    },
    "单元测试与回归套件运行"
  );

  graph.addNode(
    "review",
    (state) => {
      // 检查是否需要模拟审查驳回
      const alreadyReviewed = state.reviewResult !== null;
      const shouldReject =
        state.task.simulatedReviewRejectionsCount > 0 && !alreadyReviewed;

      if (shouldReject) {
        return {
          currentPhase: "REVIEW",
          reviewResult: {
            approved: false,
            feedback: [
              "代码审查意见：函数入参缺少明确类型约束，建议增加 zod 校验后再提交。",
            ],
          },
          executionLogs: [
            ...state.executionLogs,
            `[Node: review] ⚠️ 代码审查打回！检测到代码异味，要求打回整改。`,
          ],
        };
      }

      return {
        currentPhase: "REVIEW",
        reviewResult: {
          approved: true,
          feedback: ["代码审查通过：符合系统规范与安全最佳实践。"],
        },
        executionLogs: [
          ...state.executionLogs,
          `[Node: review] ✅ 代码审查通过！允许继续推进交付。`,
        ],
      };
    },
    "代码审查 (Review Gate)"
  );

  graph.addNode(
    "approval_gate",
    (state) => {
      return {
        currentPhase: "APPROVAL_GATE",
        executionLogs: [
          ...state.executionLogs,
          `[Node: approval_gate] 🛑 命中高危审批门禁！当前审批状态: ${state.approvalStatus}。`,
        ],
      };
    },
    "高危操作人机协同审批 (HITL Gate)"
  );

  graph.addNode(
    "rollback",
    (state) => {
      return {
        currentPhase: "ROLLBACK",
        isRolledBack: true,
        executionLogs: [
          ...state.executionLogs,
          `[Node: rollback] 🚨 安全兜底触发！回滚所有修改，恢复工作区干净状态。`,
        ],
      };
    },
    "安全回滚与现场保全"
  );

  // 2. 注册静态确定边 (Static Edges)
  graph.addEdge(START, "analyze");
  graph.addEdge("analyze", "plan");
  graph.addEdge("plan", "implement");
  graph.addEdge("implement", "test");
  graph.addEdge("rollback", END);

  // 3. 注册动态条件转移边 (Conditional Edges)
  // 条件边 A: 测试节点流向
  graph.addConditionalEdges(
    "test",
    (state) => {
      if (state.testResults?.passed) {
        return "review";
      }
      if (state.retryCount <= state.maxRetries) {
        return "implement"; // 自愈修复环路
      }
      return "rollback"; // 重试超限降级
    },
    {
      review: "review",
      implement: "implement",
      rollback: "rollback",
    }
  );

  // 条件边 B: 审查节点流向
  graph.addConditionalEdges(
    "review",
    (state) => {
      if (!state.reviewResult?.approved) {
        return "implement"; // 整改环路
      }
      if (state.task.isDestructive && state.approvalStatus !== "APPROVED") {
        return "approval_gate"; // 高危审批
      }
      return END; // 顺利交付
    },
    {
      implement: "implement",
      approval_gate: "approval_gate",
      [END]: END,
    }
  );

  // 条件边 C: 审批门禁流向
  graph.addConditionalEdges(
    "approval_gate",
    (state) => {
      if (state.approvalStatus === "APPROVED") {
        return END;
      }
      if (state.approvalStatus === "REJECTED") {
        return "rollback";
      }
      return "approval_gate"; // 保持挂起
    },
    {
      [END]: END,
      rollback: "rollback",
      approval_gate: "approval_gate",
    }
  );

  return graph;
}

/**
 * 编译获得可执行图实例（内置 approval_gate 挂起）
 */
export function compileSoftwareDevGraph(): CompiledGraph<DevAgentState> {
  const graph = createSoftwareDevGraph();
  return graph.compile({
    interruptNodes: ["approval_gate"],
  });
}

export interface TopologyScenario {
  id: string;
  name: string;
  description: string;
   
  buildGraph: () => StateGraph<any>;
}

/**
 * 拓扑诊断实验预设场景
 */
export const TOPOLOGY_LINT_SCENARIOS: TopologyScenario[] = [
  {
    id: "standard-clean",
    name: "标准完整研发工作流 (Clean Graph)",
    description: "具备 START 入口、完整的有向边、条件自愈边与 END 出口，拓扑完全合法。",
    buildGraph: () => createSoftwareDevGraph(),
  },
  {
    id: "dangling-edge",
    name: "悬空边事故 (Dangling Edge Error)",
    description: "审查节点错误指向了一个未注册的幽灵节点 'ai_code_optimizer'，编译器必须在运行前强行拦截！",
    buildGraph: () => {
      const g = createSoftwareDevGraph();
      // 故意注入一条指向未知节点的静态边
      g.addEdge("review", "ai_code_optimizer");
      return g;
    },
  },
  {
    id: "isolated-node",
    name: "孤立死节点告警 (Unreachable Node Warning)",
    description: "注册了一个安全扫描节点 'ast_vulnerability_scan'，但没有任何入向边能从 START 抵达该节点。",
    buildGraph: () => {
      const g = createSoftwareDevGraph();
      g.addNode("ast_vulnerability_scan", () => ({}), "孤立的 AST 安全漏洞扫描");
      return g;
    },
  },
  {
    id: "missing-start",
    name: "入口点缺失错误 (Missing Entry Point Error)",
    description: "状态图没有指定 entryPoint，且没有任何从 START 发出的外发边，执行器无法决定从何处启动。",
    buildGraph: () => {
      const g = new StateGraph<{ phase: string }>();
      g.addNode("worker", () => ({ phase: "DONE" }));
      g.addEdge("worker", END);
      // 未设置 setEntryPoint，未添加 addEdge(START, "worker")
      return g;
    },
  },
  {
    id: "multiple-static-conflict",
    name: "无条件静态边冲突 (Conflicting Static Edges)",
    description: "节点 'test' 同时发出了两条无条件静态边分别去往 'review' 和 'rollback'，导致转移歧义。",
    buildGraph: () => {
      const g = new StateGraph<{ phase: string }>();
      g.addNode("test", () => ({ phase: "TEST" }));
      g.addNode("review", () => ({ phase: "REVIEW" }));
      g.addNode("rollback", () => ({ phase: "ROLLBACK" }));
      g.addEdge(START, "test");
      g.addEdge("test", "review");
      g.addEdge("test", "rollback"); // 冲突！
      g.addEdge("review", END);
      g.addEdge("rollback", END);
      return g;
    },
  },
];



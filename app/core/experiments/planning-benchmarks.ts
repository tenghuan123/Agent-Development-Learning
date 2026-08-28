import type { WorkflowMode } from "../planner/types";

export interface PlanningBenchmarkPreset {
  id: string;
  title: string;
  category: "Refactoring" | "Feature" | "Re-planning" | "Routing";
  difficulty: "Easy" | "Medium" | "Hard";
  recommendedMode: WorkflowMode;
  description: string;
  prompt: string;
  expectedTasks: string[];
  evaluationCriteria: string[];
  replanExpected?: boolean;
}

export const PLANNING_BENCHMARKS: PlanningBenchmarkPreset[] = [
  {
    id: "multi-module-cache-refactor",
    title: "多模块缓存持久化重构与淘汰算法",
    category: "Refactoring",
    difficulty: "Medium",
    recommendedMode: "full_planning",
    description:
      "模拟大型重构场景：将现有的简单内存 Map 升级为带有 LRU 淘汰与 TTL 过期机制的持久化缓存层，并更新上层业务调用与单元测试。",
    prompt: `请帮我重构项目中的数据存储机制：
1. 探查当前项目结构与已有工具；
2. 在 scratch/cache 目录下实现一个具有 TTL 过期与最大容量 LRU 淘汰机制的 AdvancedCache 类；
3. 为 AdvancedCache 编写一套完整的验证测试脚本 scratch/cache/cache.test.ts；
4. 使用 run_command 运行测试脚本（如使用 node scratch/cache/cache.test.ts 运行）并确保全部通过；
5. 最后输出重构报告与使用示例。`,
    expectedTasks: [
      "探查工作区与已有工具函数",
      "实现 AdvancedCache 类 (支持 LRU 淘汰与 TTL 过期)",
      "编写 cache.test.ts 单元测试套件",
      "运行测试脚本并进行测试驱动自愈验证",
      "输出重构总结与使用文档",
    ],
    evaluationCriteria: [
      "是否调用 manage_plan 进行了清晰的 4-5 步任务拆解",
      "执行过程中是否维持了单一 [IN PROGRESS] 任务焦点",
      "是否通过 run_command 执行了真实测试并验证通过",
      "是否在每个步骤完成后记录了完整的 resultSummary",
    ],
  },
  {
    id: "jwt-auth-full-pipeline",
    title: "全流程功能开发：轻量 JWT 鉴权与中间件",
    category: "Feature",
    difficulty: "Hard",
    recommendedMode: "full_planning",
    description:
      "从 0 到 1 交付完整安全功能：实现基于 HMAC-SHA256 的纯 TS JWT 签发与校验、包装中间件校验逻辑、编写测试并自愈修复潜在 Bug。",
    prompt: `我们需要一个无第三方重量级依赖的轻量 JWT 鉴权工具：
1. 分析需求并在 scratch/auth 目录实现 mini-jwt.ts，导出 sign(payload, secret, expiresIn) 与 verify(token, secret) 方法；
2. 实现一个 auth-guard.ts 中间件函数，从 Authorization 请求头提取 Bearer Token 并校验合法性与过期时间；
3. 编写 scratch/auth/jwt.test.ts 覆盖：正确签名校验、篡改 Token 拦截、过期 Token 拦截 3 个核心用例；
4. 运行测试（如使用 node scratch/auth/jwt.test.ts 运行）并自愈修复任何出现的类型或逻辑错误；
5. 标记所有任务为已完成并给出最终验收结果。`,
    expectedTasks: [
      "设计并实现 mini-jwt.ts 签发与验签逻辑",
      "实现 auth-guard.ts 鉴权守卫中间件",
      "编写 jwt.test.ts 包含正向与逆向防御测试用例",
      "执行测试脚本并自愈修复潜在类型或算法 Bug",
      "汇总交付物并提供调用示例",
    ],
    evaluationCriteria: [
      "任务是否被完整拆解且不遗漏中间件与测试用例",
      "各步骤之间是否有清晰的依赖与流转记录",
      "测试结果是否真实反馈到状态机中",
      "最终交付物具备可运行性",
    ],
  },
  {
    id: "dynamic-replan-migration",
    title: "动态重规划：突发环境约束下的架构自适应",
    category: "Re-planning",
    difficulty: "Hard",
    recommendedMode: "full_planning",
    replanExpected: true,
    description:
      "考验 Agent 的自适应应变能力：初始计划依赖某种假设，在执行中发现环境不支持（如模拟的 native 模块缺失），Agent 能够自主调用 replan 调整技术选型并顺利完成任务。",
    prompt: `我们需要在 scratch/storage 目录下实现一套持久化 Key-Value 存储引擎：
1. 初始规划：探查环境，尝试选用高性能二进制存储方案；
2. 若在探查或测试中发现环境缺少特定二进制依赖，必须主动触发 dynamic replan（重规划），平滑切换为基于 JSON 文件流原子追加的 SafeFileStorage 方案；
3. 补齐读写、并发锁与数据完整性校验测试；
4. 运行测试验证，并记录重规划前后的决策依据。`,
    expectedTasks: [
      "探查存储运行环境与依赖可行性",
      "（发现环境约束）触发 Dynamic Re-plan 切换技术路线",
      "实现 SafeFileStorage 原子文件持久化类",
      "编写存储并发与数据完整性测试用例",
      "运行测试并输出架构决策与重规划记录",
    ],
    evaluationCriteria: [
      "是否在识别到约束时主动调用 manage_plan 的 replan 动作",
      "Plan revision 是否自增并记录了 replanReason",
      "原先已完成的步骤是否被优雅保留而未被抹杀",
      "重规划后的新任务是否全部顺利执行完毕",
    ],
  },
  {
    id: "theory-router-direct-answer",
    title: "Workflow 路由检测：理论架构问答 (直出分流)",
    category: "Routing",
    difficulty: "Easy",
    recommendedMode: "direct_answer",
    description:
      "验证 WorkflowRouter 的智能化分流能力：对于纯概念/架构理论问题，无需启动笨重的 Plan FSM 和工具集，直接分流到 direct_answer 模式极速输出。",
    prompt: `请从底层原理层面，深度对比说明：
1. 为什么纯 ReAct (Reasoning + Acting) 架构在长步数复杂任务中会出现 '目标漂移 (Goal Drift)' 与 '局部贪心 (Myopic Action)'？
2. Plan-and-Solve 架构中的 '有限状态机 (FSM)' 与 'Attention Anchor 进度锚点' 是如何从根本上解决这个问题的？`,
    expectedTasks: [
      "Router 识别为 direct_answer 模式",
      "无需启动工具调用，直接输出深度架构对比分析",
    ],
    evaluationCriteria: [
      "Workflow Router 是否准确识别出无需工具调用",
      "置信度是否高于 0.9",
      "输出内容是否准确剖析了注意力分配与有限状态机的工程价值",
    ],
  },
];


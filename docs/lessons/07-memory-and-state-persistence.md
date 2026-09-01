# 第七课：V6 —— Memory 与状态机持久化 (Hierarchical Memory, Episodic Checkpointing & Auto-Reflection)

> **核心认知**：很多初学者认为：“只要把历史对话全量持久化存到数据库，Agent 就拥有了记忆。”
>
> 事实上，在工业级 Agent（如 Claude Code、Cursor、MemGPT / Letta、Devin）中，**“未经分级和提炼的无脑全量回放，无异于给模型服毒”**。它不仅会瞬间撑爆上下文窗口、带来高昂 Token 成本，还会引入严重的历史噪音与注意力稀释。
>
> **工业级 Memory 架构的本质是建立如同人类大脑的分层存取系统：**
> 1. **L1 工作记忆 (Working Memory / Scratchpad)**：即时任务假设与临时变量（RAM）；
> 2. **L2 情景记忆 (Episodic Session Store)**：会话状态机、执行轨迹与断点 Checkpoint（事务快照）；
> 3. **L3 长期语义记忆 (Semantic Memory Bank)**：项目架构约定、用户偏好与自愈经验（外脑知识磁盘）。

---

## 1. 核心矛盾：为什么 Agent 会有“跨会话失忆”与“踩同一种坑”？

在第 01~06 课中，我们构建了 ReAct 循环、代码编辑自愈、长任务 Planning 以及 Context 压缩引擎。
但在真实项目开发中，以下痛点极为刺眼：

```text
                               【Agent 记忆缺失的三大工业级痛点】

 1. 跨会话失忆 (Session-to-Session Amnesia)
 ┌────────────────────────────────────────────────────────────────────────────┐
 │ 用户在 Session 1 反复教导 Agent：“我们项目必须用 Bun，禁止 npm，端口 9090” │
 │ 💥 弊端: 第二天开启 Session 2，Agent 依然使用 `npm run dev` 监听 3000 端口   │
 └────────────────────────────────────────────────────────────────────────────┘

 2. 踩坑经验无法沉淀复用 (No Learning from Failures)
 ┌────────────────────────────────────────────────────────────────────────────┐
 │ Agent 在排查某个特定框架的鉴权拦截器报错时，花费了 6 步才自愈修好          │
 │ 💥 弊端: 下一次遇到类似任务，Agent 依然重新走一遍 6 步试错，徒耗 Token 与时间│
 └────────────────────────────────────────────────────────────────────────────┘

 3. 长任务崩溃无法断点热恢复 (No Durable Checkpointing)
 ┌────────────────────────────────────────────────────────────────────────────┐
 │ 一个包含 5 个 Task 的长流程重构在第 3 步因网络抖动中断                     │
 │ 💥 弊端: 缺乏状态机持久化，用户只能重新从 Step 1 重跑，已完成的成果全部浪费  │
 └────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 三层记忆分级架构 (Hierarchical Memory Architecture)

为了彻底根治以上问题，我们构建了 **Hierarchical Memory 体系**：

```text
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                                 AGENT 三层分级记忆矩阵                                    │
├─────────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│ L1: 工作记忆 (Working)      │ L2: 情景记忆 (Episodic)     │ L3: 长期语义记忆 (Semantic)   │
│ (Scratchpad / RAM)          │ (Session State Machine)     │ (Memory Bank / Disk)          │
├─────────────────────────────┼─────────────────────────────┼───────────────────────────────┤
│ • 当前活跃假设 (Hypotheses) │ • 历史执行轨迹 (Steps Log)   │ • 架构约定 (Conventions)      │
│ • 验证事实 (Verified Facts) │ • Planning 任务状态机快照   │ • 用户风格偏好 (Preferences)  │
│ • 即时关注点 (Current Focus)│ • Checkpoint 断点与恢复机制 │ • 避坑规则 (Learned Pitfalls) │
│ • 任务结束随上下文销毁      │ • 支持意外崩溃 100% 热重载  │ • 跨会话持久化，前置智能召回  │
└─────────────────────────────┴─────────────────────────────┴───────────────────────────────┘
```

---

## 3. 支柱一：L3 Semantic Memory Bank 与前置相关性召回

类似 Claude Code 的 `CLAUDE.md` / `MEMORY.md` 机制，长期记忆库负责沉淀三类最高频核心知识：
- `conventions`：项目统一约束（如包管理器、特定端口、API 返回格式）；
- `preferences`：用户风格偏好（如严谨 TypeScript、JSDoc 规范、函数式写法）；
- `learnings`：踩坑避坑教训（如修改 auth 模块必须同步更新 mock token 拦截器）。

### 前置相关性检索管道 (Pre-Task Recall Pipeline)：
1. 当用户发起任务 `userGoal` 时，Agent 在构造初始 System Prompt 前，先触发 `memoryBank.recall(userGoal, { limit: 4 })`；
2. 基于关键字、标签与分类权重计算匹配分；
3. 将匹配命中的规则渲染为紧凑的 Markdown 约束块置顶注入：

```text
=== 🧠 LONG-TERM MEMORY BANK (Persistent Rules & Experience) ===
[Notice: The following knowledge was recalled from long-term memory. Strictly obey these rules.]

### 📐 Project Conventions & Constraints (必遵规范):
- **[pkg_manager_and_port]**: 本项目严格使用 Bun 管理依赖，本地后端统一跑在 9090 端口。

### 👤 User Style & Preferences (用户偏好):
- **[code_style_typescript]**: 导出函数必须包含完整 JSDoc 参数与返回值注释。
=================================================================
```

---

## 4. 支柱二：L1 Working Memory 与 Scratchpad 自主维护

在复杂任务执行中，Agent 需要一个“草稿纸”（Scratchpad）来记录中间探索状态，防止目标漂移。

通过赋予 Agent `scratchpad` 工具：
```typescript
scratchpad({
  action: "update",
  focus: "正在排查 SQLite 锁竞争问题",
  hypothesis: "可能是并发写入没有包裹在事务中",
  fact: "已确认单线程读写正常，并发压测时报 database is locked",
  note: "准备引入 WAL 模式进行修复"
})
```

在 ReAct 循环的每一步，Working Memory 的状态会作为微型锚点嵌入上下文，让 Agent 在多步推理中始终紧抓核心线索。

---

## 5. 支柱三：L2 Episodic Session Store 与 Checkpoint 热恢复

为了避免长任务意外中断（如浏览器刷新、网络超时）导致前功尽弃，`SessionStore` 实现了单步事务级 Checkpointing：
1. **每步快照 (Step Snapshot)**：记录 Step 编号、Thought 思考、Tool Action 与 Observation 结果；
2. **状态机关联 (FSM Binding)**：同步绑定当前 Task Planning 状态与 Working Memory；
3. **一键断点热恢复 (Resume Execution)**：重新加载 Snapshot 后，Agent 无需从 Step 1 重新分析，直接继承上下文与任务进度，继续完成剩余步骤。

```typescript
// 断点热恢复调用示意：
const agent = new MemoryAgent();
await agent.resume("sess_20260901_001", (event) => {
  console.log("Resuming from Step 3...", event);
});
```

---

## 6. 支柱四：Auto-Reflection Pipeline（事后反思与经验提炼）

真正的智能不是永不犯错，而是“不犯第二次相同的错误”。

当 Agent 执行完一次包含报错自愈或复杂排查的任务后，`ReflectionEngine` 自动触发事后反思：
1. **轨迹审查**：分析从报错到成功修复的 Tool 调用链；
2. **规则提炼**：通过轻量级 LLM 将具象报错抽象为通用经验（`LearnedInsight`）；
3. **自动沉淀入库**：写入 `MemoryBank`，赋予未来所有会话共享该经验。

```typescript
// 自动沉淀的经验示例：
{
  category: "learning",
  key: "auth_middleware_pitfall",
  content: "修改 app/core/auth 相关鉴权代码时，必须同步更新配套的 mock token 拦截器，否则本地单测会报 401 错误。",
  tags: ["auth", "token", "test", "401"],
  confidence: 0.95
}
```

---

## 7. 第七阶段验收标准

| 评测用例 | 考察核心能力 | 预期表现 |
| :--- | :--- | :--- |
| **1. 跨会话失忆对比 (Amnesia vs Recall)** | L3 长期记忆前置召回 | 开启新会话 0 提示下，自动遵从 Bun 运行时、9090 端口与 JSDoc 规范，规范遵守率 100% vs 0% |
| **2. 踩坑排查与事后反思 (Auto-Reflection)** | Reflection Engine 规则提炼 | 成功排查 401 报错后自动提炼经验入库；下次面对同类任务直接跳过试错，步数节省 65%+ |
| **3. 崩溃断点热恢复 (Crash & Resume)** | L2 SessionStore Checkpointing | 在第 3 步意外中断后，100% 还原 Planning 进度与工作记忆，无缝续跑完成剩余任务 |

---

## 8. 工业界技术流派对比：Memory 选型与演进

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  【工业界 Agent Memory 技术流派】                                 │
├─────────────────────────┬───────────────────────────────────┬────────────────────────────────────┤
│ 流派 A: 全量历史灌入    │ 流派 B: 纯向量检索 (Naive RAG)     │ 流派 C: 三层结构化分级 + 自主反思   │
│ (Naive Full History)    │ (Vector Store Embeddings)         │ (Claude Code / Letta / Mini-Claude)│
├─────────────────────────┼───────────────────────────────────┼────────────────────────────────────┤
│ • 每次回传所有历史会话  │ • 将所有对话切块灌入向量库        │ • L1 Scratchpad + L2 Checkpoint    │
│ • 弊端: 上下文迅速爆炸  │ • 弊端: 丢失时序因果关系，命中很多│ • L3 结构化规则库 + 前置精准召回   │
│   成本极高，严重注意力稀释│   历史已废弃的旧版本代码噪声      │ • 任务完成触发 Auto-Reflection 沉淀 │
└─────────────────────────┴───────────────────────────────────┴────────────────────────────────────┘
```


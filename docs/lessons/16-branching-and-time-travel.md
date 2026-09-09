# 第十六课：V15 —— 为什么 Coding Agent 需要 Branch？

> **核心认知**：
> 在传统聊天 Bot 中，对话是一条平铺直叙的线性单向流（`messages: Message[]`）。
> **但在真实的生产级 Coding Agent（如 Claude Code 或 Pi）中，真实工程探索从来都不是线性的！**
>
> 核心公式：
> $$\text{Linear Thread (线性幻想)} \ll \text{Linear Undo (破坏性截断回滚)} \ll \text{Branch DAG (时空分支推演网)}$$
>
> 当一个 Agent 针对大型工程进行重构，连续推进了 8 个步骤，在第 4 步产生了一个关键的架构选型失误（例如误将有状态锁引入了分布式服务），导致第 8 步的集成测试全面崩溃。
> 此时系统该如何应对？
>
> - **重新开始（Start Over）**：推倒重来，前期消耗的数万 Token 与分析成果全损，前 3 步完全正确的代码被无辜抹杀；
> - **简单快照回滚（Linear Undo / Destructive Restore）**：指针回拨到第 4 步，但**硬性截断删除了后续所有记录**。结果导致第 7 步写出的高价值独立辅助函数永久灰飞烟灭，且无法做横向 A/B 方案对比；
> - **时空分支（Branch DAG）**：保留 Branch A（包含完整的 8 步探索与失败反思），从第 3 步或第 4 步分叉出 Branch B（`stateless-jwt-redis`），继续演进并通过 **Cherry-pick（跨分支资产拣选）** 无损复用已有产物，实现自由时空穿梭。

---

## 1. 为什么 Coding Agent 的探索必然是非线性的？

人类资深架构师在进行代码重构或新特性研发时，往往会面临**技术选型歧路**：
- 是选用 JWT Bearer 还是 Session Cookie？
- 是用 Redis 集中黑名单还是 Local LRU Cache？
- 是修改现有中间件还是重构整条路由链路？

大模型不是全知全能的上帝，它在执行第 4 步时，往往基于当时的局部上下文做出了某种看似合理的假设；直到推进到第 8 步运行完整单元测试/分布式集成测试时，全局架构的隐性死锁才会暴露。

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                    真实工程研发中的因果探索歧路                                │
│                                                                              │
│   Step 1: 需求剖析 ──► Step 2: JWT 验签 ──► Step 3: Redis 黑名单             │
│                                                   │                          │
│                      ┌────────────────────────────┴────────────────────────┐ │
│                      ▼ (分歧原点 Fork Point)                                 │ │
│           [分支 A：有状态内存锁方案]              [分支 B：无状态 Bearer 方案] │ │
│            Step 4: 内存锁 session store             Step 4b: JWT 中间件     │ │
│            Step 5: 侵入式中间件绑定                  Step 5b: 路由挂载       │ │
│            Step 6: DB 表加 session_id                Step 6b: 集成测试通过 ✅ │ │
│            Step 7: 提取 token-helpers ✨             🍒 Cherry-pick ✨       │ │
│            Step 8: 集群死锁测试崩溃 💥                                       │ │
└──────────────────────────────────────────────────────────────────────────────┘
```

如果底层 Runtime 只有一条平坦的数组（`messages`），那么面对这种失败，系统只能“一键清空重来”或“倒车覆盖”。**这在商业级软件开发中是无法忍受的灾难。**

---

## 2. 三大应对方案的定量对比

为了让开发者直观感受到架构差异，我们在 `app/core/branch/branch-chaos-runner.ts` 中针对 8 步 Auth 重构场景进行了定量测量：

### 2.1 方案一：推倒重来（Start Over / Clean Slate）
- **实现原理**：清空工作区，删除所有 Checkpoint，重新从 Step 1 开始 prompt。
- **代价与风险**：
  1. **Token 极大浪费**：前 8 步累计消耗的 35,000+ Tokens 全部化为乌有；
  2. **资产 100% 丢失**：前 3 步完全合规的 `src/auth/jwt.ts` 和 `src/auth/redis.ts` 被清空，第 7 步创造的 `src/utils/token-helpers.ts` 优质函数直接失传；
  3. **模型不确定性剧增**：重新生成 Step 1~3 时，LLM 很可能引入原本没有的新语法错误或类型报错。

### 2.2 方案二：破坏性快照回滚（Destructive Linear Undo）
- **实现原理**：把物理工作区恢复到第 4 步的 Snapshot，但**从 Checkpoint 列表中强行截断（Truncate）删除第 5~8 步**。
- **代价与风险**：
  1. **探索成果抹杀**：虽然回到了第 4 步，但第 5~8 步消耗的 28,000+ Tokens 被当成垃圾倒掉，数据损失率高达 62.5%；
  2. **优质资产毁灭**：第 7 步写出的 `extractBearerToken` 工具函数随着截断被彻底删除，再也无法找回；
  3. **失去对照基准（Negative Baseline）**：无法保留分支 A 的失败测试日志，无法在 UI 上并排对比方案 A 与方案 B 的性能差异。

### 2.3 方案三：DAG 会话分支推演（Session Branching）
- **实现原理**：
  1. 将整个 Session 建模为一个**有向无环图（DAG）**；
  2. 保留分支 A 所有的 8 个步骤、测试失败日志与思考链路（作为宝贵的负样本）；
  3. 从 Step 3（分叉原点）一键开辟独立分支 `stateless-jwt-redis`；
  4. 支持**时间旅行（Time-Travel Checkout）**：在毫秒级在任意分支与历史节点间自由穿梭，工作区文件由密码学 SHA-256 保证位级保真；
  5. 支持**资产拣选（Cherry-pick）**：精准提取分支 A 在第 7 步生成的优质模块，合入分支 B；
  6. **Token 浪费率为 0**，因为一切探索与反思都被完整保留。

---

## 3. 开源先驱 Pi (`wayfind/pi-mono`) 的分支树哲学

Pi 作为一个专注于极简终端 Coding Harness 的开源项目，其分支架构提供了极具启发性的实现：

### 3.1 为什么不直接用 `git branch`？
许多开发者直觉认为：“Git 已经原生支持分支了，Agent 为什么不直接在底层不断敲 `git checkout -b`？”

Pi 给出了深刻的架构解答：
1. **维度不匹配**：Git 分支只关注磁盘上的物理文件 diff。但 Coding Agent 的“状态”包含**三层时空**：
   - LLM 思考与 Prompt 上下文投影（Thinking Tokens, Messages）；
   - 工具物理副作用账本（Side-effect Ledger）；
   - 测试执行与评测断言结果。
   这些核心维度在 Git 提交中是不存在的。
2. **磁盘 I/O 开销与 IDE 震荡**：大型项目敲一次 `git checkout` 可能触发上千个文件的重写，导致 VS Code 语言服务器重索引、TypeScript 编译缓存失效。Pi 采用**轻量级虚拟工作区与快照树（Virtual Tree Overlay）**，仅在真正需要切换上下文时做增量比对。

### 3.2 Pi 的数据模型：Tree of Runs
在 Pi 的架构设计中：
```text
Session (聚合根)
  ├── branches: Map<BranchId, BranchMeta>
  ├── tree: NodeDAG {
  │     node_0 (Initial Request)
  │       ├── node_1 (Step 1)
  │       └── node_2 (Step 2)
  │             ├── node_3a (Approach A) ──► node_4a (Fail)
  │             └── node_3b (Approach B) ──► node_4b (Pass)
  └── activeHeadPointer: "node_4b"
```
每个 Node 记录其 `parentNodeId`，由此构成天然的因果拓扑图。寻找两条探索线的最初分歧点，本质上就是求解 **最近公共祖先（Lowest Common Ancestor, LCA）**。

---

## 4. 四大领域守恒律与自动化验收

本课在 `app/core/branch/branch-verification-suite.ts` 中落地了 4 项严格的领域守恒律：

1. **守恒律 1：非破坏性历史保留律（Non-destructive Retention）**  
   从主分支任意历史快照创建并演进新探索分支时，主分支的历史节点、HEAD 指针和 Checkpoint 链 100% 保持只读不可篡改，新分支演进绝不反向污染主干。
2. **守恒律 2：拓扑因果谱系完备律（Causality Lineage & LCA）**  
   DAG 必须能够精确追踪任意节点的全量溯源链路，并准确定位任意两条探索分支的分叉交汇原点（LCA）。
3. **守恒律 3：时空穿梭位级保真律（Time-Travel Bit-Fidelity）**  
   通过 `TimeTravelNavigator` 迁出至任意历史节点时，工作区文件在密码学哈希 SHA-256 级别完全还原，后续步骤生成的新文件被彻底清除，无幽灵残留。
4. **守恒律 4：跨分支资产原子拣选律（Cherry-pick Atomicity）**  
   从废弃分支单向提取特定文件至目标分支时，资产合入原子生效，目标分支产生合规新节点，源分支数据与拓扑毫发无损。

---

## 5. 思考题与结课自测

1. **思考题 1**：如果两个分支（Branch A 和 Branch B）修改了同一个文件的重叠行，Coding Agent 应该如何自动解决冲突？是否需要单独唤起一个专门负责 Merge Conflict 的 Subagent？
2. **思考题 2**：在未来更前沿的 Speculative Branching（并行假说推演）中，如果给大模型分配 3 个并行分支，应该设置怎样的剪枝熔断（Pruning / Early-stop）策略以避免 Token 费用失控？
3. **预告**：掌握了 Session、快照与分支推演之后，第 17 课我们将深入 Coding Agent 的记忆核心：**《Context Compaction 为什么不是“总结聊天记录”？—— 结构化上下文预算管理器》**。


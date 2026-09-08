# 第十五课：V14 —— Session 为什么不是 Messages？

> **核心认知**：
> 初学者在开发 Agent 时，最直觉的做法就是将聊天记录直接当成会话存储：
> ```ts
> // ❌ 业余玩具模式：保存聊天记录就以为保存了 Session
> const session = {
>   sessionId: "sess_123",
>   messages: [
>     { role: "user", content: "请帮我重构 auth 模块" },
>     { role: "assistant", content: "我已经修改了 auth.ts 并更新了 config.json" },
>   ],
> };
> ```
> **但在真实的生产级 Coding Agent（如 Claude Code 或 Pi）中，把 Messages 等同于 Session 是一场致命的工程灾难！**
>
> 必须刻入骨髓的核心公式：
> $$\text{Message History (认知投影)} \neq \text{Session (时空领域实体)} \neq \text{Runtime State (执行瞬态)}$$
>
> 1. **Message History（消息历史）**：仅仅是每次向大模型发起请求时，投喂给 LLM Context Window 的**瞬时注意力投影（Projection / View）**。它是一维线性的，而且在长流程中随时会被 Truncation 截断或 Compaction 压缩。
> 2. **Session（会话聚合根）**：是真实的**领域持久化实体（Domain Aggregate Root）**。它承载着非线性的执行分支树（Branch Tree）、多 Run 因果流水线、**物理工作区的文件指纹快照（Workspace Snapshot / SHA-256）**以及工具物理副作用账本。
> 3. **Runtime State（运行时瞬态）**：是**执行引擎的内存状态机**（如正在执行的 Tool 队列、AbortController 信号、HITL 审批挂起槽、活跃 SSE 流等）。
>
> **核心法则：Session 承载物理世界的真实因果；Messages 只是给 LLM 看的一层帘幕。**

---

## 1. 为什么纯 Messages 会引发系统性崩塌？

### 1.1 灾难一：幽灵状态与时空倾斜（Ghost State & Temporal Skew）

Coding Agent 与纯聊天 Bot 的本质区别，在于 Coding Agent 的工具会在**物理世界（磁盘文件、操作系统环境、数据库）产生永久副作用**。

如果在恢复会话时只加载了 `messages`：
```text
┌────────────────────────────────────────────────────────────────────────┐
│                        仅依赖 Messages 恢复时的时空倾斜                   │
│                                                                        │
│   [历史 Messages]                                                      │
│   LLM: "我已经创建了 src/auth/jwt.ts 并导出了 signToken 函数"           │
│         │                                                              │
│         ▼ (断点恢复)                                                    │
│   用户输入: "请为刚写的 signToken 编写单元测试"                           │
│         │                                                              │
│         ▼                                                              │
│   LLM 坚信文件存在，编写并运行 tests/jwt.test.ts                         │
│         │                                                              │
│         ▼                                                              │
│   ❌ 物理磁盘实际情况：在断点期间，用户切换了 git 分支或删除了该文件！      │
│   Runtime 报错：Error: Cannot find module 'src/auth/jwt.ts'            │
│   LLM 陷入时空错乱，在虚无代码基底上反复胡乱修补，引发不可逆破坏！          │
└────────────────────────────────────────────────────────────────────────┘
```
**时空倾斜（Temporal Skew）**：大模型的“认知时空”（由历史 messages 塑造）与物理磁盘的“真实时空”（由文件状态决定）发生了脱节。
缺乏文件指纹（Workspace Snapshot）的系统，根本无法察觉物理世界已被外部篡改，只能盲目执行并崩塌。

---

### 1.2 灾难二：上下文压缩（Compaction）抹杀物理真相

当 Agent 执行了十几个复杂步骤，上下文窗口达到上限时，必须执行 **Context Compaction（上下文压缩）**。

如果把 messages 视作 Session 的真相来源：
- 压缩将前 10 步的详细 Tool 调用（包括执行的具体命令、返回的数百行标准输出、精准的 Diff Hunk、退出码）抹平为一行自然语言摘要：
  *“助手此前完成了数据库模型构建并修复了配置。”*
- **后果**：物理世界的执行证据被永久销毁。如果用户在第 15 步询问：“第 3 步修改后的表结构字段是什么？当时的执行退出码是多少？”，系统由于真相已被压缩覆盖，只能凭空捏造（Hallucination）。
- **正确解法**：Compaction **只作用于发送给 LLM 的 Prompt 投影**；而 Session 聚合根中永久保存 100% 原始高保真的 `ToolExecutionRecord` 与每步文件的哈希快照。

---

### 1.3 灾难三：一维线性数组无法表达树状探索（Tree vs Array）

真实的软件工程绝非一条直线。任何优秀的程序员和 Agent 都会经历：
1. 探索方案 A；
2. 推进 4 步后发现方案 A 在 Edge Runtime 下存在不兼容依赖；
3. 回退到第 2 步；
4. 开启方案 B（Branch B）进行全新推演。

如果 Session 是一维数组 `messages: Message[]`：
- 若用 `messages.splice()` 强行删除方案 A 的记录，方案 A 的“排错踩坑经验”便荡然无存；
- 若不删除直接在后面说“刚才方案不行重新来”，LLM 上下文便被大量无效代码与矛盾指令严重污染；
- 只有将 Session 建模为**有向无环树（DAG / Tree）**，包含 `branches` 与 `checkpoints`，才能无损支撑起非线性时空探索。

---

## 2. 工业级 Session 领域模型推导

为了彻底解决上述三大灾难，我们对标开源 Coding Agent 规范 **Pi (`wayfind/pi-mono`)** 与 **Claude Code**，构建如下四层领域结构：

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           Session (会话聚合根)                          │
│                                                                         │
│   id: "sess_01H..."           workspaceRoot: "/workspace/proj"          │
│   activeBranchId: "main"      branches: { main: ..., experiment_b: ... }│
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       SessionBranch (命名探索分支)                       │
│                                                                         │
│   id: "branch_exp_b"          name: "experiment-jose"                   │
│   baseSnapshotId: "snap_s2"   runIds: ["run_01", "run_02"]              │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       SessionRun (单次执行流水线)                        │
│                                                                         │
│   id: "run_02"                status: "completed"                       │
│   messages: ChatMessage[]     ───► (LLM 注意力上下文投影，随时可压缩)   │
│   toolHistory: Record[]       ───► (具象物理副作用账本，100% 高保真)    │
│   workspaceSnapshot: Snapshot ───► (物理工作区密码学全景指纹)           │
│   checkpoints: Checkpoint[]   ───► (原子单步快照，支持时间旅行还原)     │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   StepCheckpoint (原子单步现场快照)                     │
│                                                                         │
│   • stepNumber: 2                                                       │
│   • rootHash: "a9f4c3...8b" (SHA-256 Merkle 根)                         │
│   • files: { "src/auth.ts": { hash: "3f9c...", size: 240, ... } }      │
│   • toolResults: [ { toolName: "replace_file", output: "...", ... } ]   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.1 物理工作区指纹与 Merkle RootHash 计算

在每个关键步骤结束时，系统遍历工作区中所有被追踪的文件，计算其密码学哈希并聚合为根指纹：

$$\text{RootHash} = \text{SHA-256}\left(\sum_{p \in \text{SortedPaths}} p + \text{":"} + \text{SHA-256}(\text{Content}_p)\right)$$

这构成了工作区在物理世界的“绝对真相”。

### 2.2 恢复前的防倾斜安全检测（Integrity Pre-check）

在会话恢复时，系统**绝不直接将历史 messages 喂给模型**，而是首先运行 `WorkspaceTracker.detectDrift()`：
1. **Missing 冲突**：快照中记录的文件在磁盘上消失；
2. **Modified 冲突**：磁盘文件内容与快照中的 SHA-256 不符（发生外部改动）；
3. **Untracked 冲突**：磁盘上出现了快照中不存在的新增文件；
4. **Ghost Reference 扫描**：静态扫描历史 messages 中提及的文件名与当前磁盘比对。

一旦发现时空倾斜，系统立即触发**故障阻断**，给出诊断报告，并支持**一键原子回滚或工作区重对齐**，彻底将幽灵幻觉消灭在萌芽状态。

---

## 3. 开源先驱 Pi (`wayfind/pi-mono`) 的设计哲学

Pi 作为专注于 Minimal Terminal Coding Harness 的开源项目，其 Session 架构被视为当代 Coding Agent 的典范：

### 3.1 物理磁盘组织规范
Pi 拒绝将整个会话序列化为一个巨大的 JSON 数组，而是采用分层目录：
```text
.pi/
└── sessions/
    └── sess_01JM.../
        ├── session.json       # 会话元数据与分支索引
        ├── events.jsonl       # Event Sourcing 只追加事件流（真理源）
        └── checkpoints/       # 关键步骤的 Git/Tree 快照
```

### 3.2 为什么 Pi 严格分离 `events.jsonl` 与 `PromptContext`？
- **`events.jsonl` 是绝对真理**：每次用户输入、每次 LLM 流式 Token、每次工具执行的原始输入输出，都以单向只追加（Append-Only）的形式持久化到磁盘。操作系统崩溃也不会导致事件损坏。
- **`PromptContext` 仅为瞬态投影**：只有在准备调用大模型的前一毫秒，Runtime 才会从 `events.jsonl` 中投影出合规的 `ChatMessage[]`。这就意味着，无论前端怎么截断（Truncate）、怎么合并摘要（Compacting），底层的物理真理永远毫发无损。

---

## 4. 四大领域守恒律与自动化验收

本课在 `app/core/session/verification-suite.ts` 中落地了 4 项领域守恒律测试：

1. **守恒律 1：Prompt 投影裁剪与 Session 领域真相彻底解耦**  
   当针对 `Run.messages` 执行激进的 Context Compaction（压缩为 1 条摘要）时，`Session.checkpoints` 和 `Session.toolHistory` 保持 100% 原始完整度。
2. **守恒律 2：物理工作区时空漂移与外部篡改精确诊断**  
   若外部进程对文件进行修改、删除或注入未追踪文件，`WorkspaceTracker.detectDrift` 必须 100% 精确捕获冲突类型与路径。
3. **守恒律 3：基于密码学哈希的工作区原子可重现性**  
   从任意 Checkpoint 恢复工作区，文件系统重新计算的 RootHash 与该 Checkpoint 保存的指纹完全一致（位级保真）。
4. **守恒律 4：非线性分叉分支隔离性与因果链保持**  
   从主分支历史快照开启新分支后，新分支的推进绝不修改主分支的执行状态，且准确记录 `forkedFromCheckpointId` 因果元数据。

---

## 5. 思考题与结课自测

1. **思考题 1**：在没有 Git 仓库的环境中（例如容器临时沙箱），Coding Agent 的 Session 应该如何实现轻量化的工作区快照？全量复制文件会带来什么性能问题？
2. **思考题 2**：如果一个长达 3 小时的开发任务涉及 40 个步骤，什么时候应该保存 `StepCheckpoint`？每一步都存会不会导致磁盘爆炸？（提示：思考 Pi 的 Checkpoint 频率与状态折叠策略）。
3. **预告**：理解了 Session、快照与分支之后，第 16 课我们将正式攻克：**《为什么 Coding Agent 需要 Branch？—— 探索、推演与反悔机制》**。


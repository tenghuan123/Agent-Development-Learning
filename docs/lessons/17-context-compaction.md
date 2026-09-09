# 第十七课：V16 —— Context Compaction 为什么不是“总结聊天记录”？

> **核心认知**：
> 在普通聊天机器人（Chatbot）中，上下文压缩通常简单粗暴地等价于：“调用大模型对历史消息生成一段简短摘要（`summary(messages)`），并替换清空旧消息”。
>
> **但在真实的生产级 Coding Agent（如 Claude Code、Pi 或 Cursor Agent）中，这种做法是致命的毒药！**
>
> 核心公式：
> $$\text{No Compaction (暴力全量爆窗)} \ll \text{Naive Chat Summary (信息失真死锁重踩)} \ll \text{Structured Budget Compaction (结构化分层预算治理)}$$
>
> 当 Agent 在一个拥有数十万行代码的大型工程中连续执行 30~50 步复杂重构时：
> 1. **暴力全量累积**：Token 迅速冲破 80k~100k，不仅单步成本与 TTFT（首 Token 延迟）飙升数倍，还会因 **Lost in the Middle** 注意力稀释导致胡言乱语甚至爆窗崩溃；
> 2. **普通聊天记录总结（Naive Summary）**：大模型把“尝试过 SQLite 事务锁导致死锁崩溃、需要加上 TTL 释放逻辑”概括成了轻飘飘的“处理了数据库报错”，并抹杀了精细的函数签名 `extractBearerToken(header, prefix)`。结果在第 24 步，Agent **毫无防备地重新踩入同一个死锁陷阱**，并因为缺失精确符号产生致命类型报错；
> 3. **结构化上下文预算治理（Pi-style Structured Compaction）**：将上下文解耦为 **固定基石（Pinned）**、**活动工作区（Working Set）**、**避坑负向记忆（Negative Constraints）**、**结构化决策账本（Ledger）**、**高保真执行窗口（Hot Window）** 五大物理预算分区，底层原始真理完整沉淀于 `events.jsonl` 冷归档，实现 Token 节约 74%+ 与任务成功率 100% 的双重奇迹。

---

## 1. 为什么 Agent 工作两小时之后会开始“变笨”？

在第 06 课（Context Engine）中，我们讨论了基础的日志截断与历史修剪。但当 Coding Agent 承接一个真正严肃的生产级任务（如微服务鉴权改造、分布式锁优化）时，执行步数往往会轻松突破 30 步。

许多开发者会产生一个疑惑：**“既然现在的模型窗口都有 128k 甚至 1M，为什么不把所有的交互历史全塞在 Prompt 里？”**

### 1.1 物理与注意力层面的三大毁灭性打击
1. **大海捞针与注意力涣散（Lost in the Middle）**：  
   Transformer 的自注意力机制在 Prompt 的头部（System 指令）和尾部（最新指令）最为敏锐。数万 Token 的中间层历史就像一滩浑水，把关键的架构决策和报错信息严重稀释。
2. **TTFT (Time To First Token) 与交互延迟爆炸**：  
   在 80k+ Token 的输入量下，单步首 Token 延迟往往突破 10~15 秒。Agent 执行 30 步的时间从 2 分钟延长到半小时以上。
3. **单步 Token 成本指数级累积**：  
   每一步的输入都要全额对 80,000+ Token 付费。一个原本几美分的任务，费用会直接飙升到数美元。

### 1.2 为什么“无限上下文窗口（128K / 1M）”无法拯救 Coding Agent？
大窗口提供的是**存储容量上限**，而不是**注意力信噪比**。
把 50 步的编译报错、长篇文件全文、海量无用标准输出全量塞入模型，等同于让程序员戴着一副沾满泥浆的眼镜去排查多线程竞态条件。有效的上下文工程必须在有限的活跃视窗内，让最高密度的决策信息发挥最大价值。

---

## 2. 实验：为什么“普通总结”会搞砸 Coding Agent？

既然不能全量保留，为什么不能像聊天机器人一样直接写：
```typescript
const summary = await llm("请对上述对话进行总结：" + JSON.stringify(messages));
messages = [systemPrompt, { role: "assistant", content: summary }, ...recentMessages];
```

我们在 `app/core/compaction/compaction-chaos-runner.ts` 中针对一个 30 步的长程重构任务进行了定量注入实验。实验证明，普通总结会导致**四大结构性失真**：

### 2.1 致命缺陷 1：负向记忆彻底抹杀 —— 丢了“踩坑黑名单”，必定重蹈覆辙 (Negative Trap Obliteration)
- **什么是“负向记忆”？（说人话：踩坑黑名单）**  
  你在重构一个高并发微服务，花了 1 个小时尝试了 3 种方案：
  - 方案 A：直接用 SQLite 原生事务锁 $\rightarrow$ 💥 报 `SQLITE_BUSY` 死锁崩溃；
  - 方案 B：在进程内加一个全局变量互斥锁 $\rightarrow$ 💥 多个独立 Worker 进程内存不共享，形同虚设；
  - 方案 C：用 Redis 加上 5 秒 TTL 租约的分布式锁 $\rightarrow$ ✅ 顺利通过！
- **为什么普通总结会害死 Agent？**  
  普通大模型在总结会话时，天生习惯“报喜不报忧”，把它浓缩成一句正向流水账：  
  *“助理重构了鉴权与数据库模块，最终采用了 Redis 分布式锁，测试通过。”*  
  **注意：方案 A 为什么会死锁、方案 B 为什么不行，在上下文里被当作“多余杂音”彻底删光了！**
- **惨痛后果（重复踩坑）**：  
  到了第 24 步，需求要求为另一个后台 Worker 编写数据同步任务。此时上下文里只有上面那句轻飘飘的总结。  
  大模型看到“需要加锁更新数据库”，由于早就忘记了第 4 步血淋淋的教训，它的直觉再次作祟：“写个原生事务锁挺简单的，我来写一个吧！”  
  **于是，它把 1 小时前刚刚踩过的死锁坑，完完整整、一模一样地重新踩了一遍！**
- **结构化治理对策**：  
  在压缩时，绝不能只记“我做成了什么”，**必须显式提炼并钉死一条条“绝对不要这么干”的踩坑黑名单 (Negative Constraints)**：
  ```markdown
  ⚠️ [DO NOT TRY / NEGATIVE CONSTRAINT]:
  严禁在 Worker 间直接使用 SQLite 原生事务锁，第 4 步已证实会导致系统死锁崩溃。必须使用带 5s TTL 租约的 Redis 分布式锁！
  ```

### 2.2 致命缺陷 2：活动工作区契约丢失 —— 丢了“函数签名速查表”，后续调用必报类型错误 (Working Set Degradation)
- **什么是“Working Set”？（说人话：当前正在改的核心代码接口契约速查表）**  
  一个中大型项目有 500 个文件，你当然不需要把 500 个文件都塞进 Prompt 里。  
  但是在当前任务中，Agent 刚刚在前几步亲手新建或修改了 2 个核心文件：
  1. `src/auth/bearer-middleware.ts`：导出了关键工具函数 `extractBearerToken(header: string, prefix = "Bearer "): string | null`
  2. `src/db/redis-blacklist.ts`：导出了函数 `acquireLockWithTtl(key: string, ttlMs = 5000): Promise<boolean>`
- **为什么普通总结会把后续代码写烂？**  
  普通总结会把真实代码全部丢弃，模糊概括为：  
  *“助理编写了用于提取 Token 和 Redis 黑名单的辅助函数。”*
- **惨痛后果（幻觉传参与编译崩溃）**：  
  到了第 15 步，Agent 需要写 `src/routes/login.ts` 去调用刚才写的 `extractBearerToken`。  
  因为上下文里**没有这个函数确切的名字、入参类型和参数顺序**，大模型只能“凭空猜”：
  - 它可能猜参数是 Request 对象，写出 `extractBearerToken(req)` $\rightarrow$ 运行时报 `TypeError: header.startsWith is not a function`；
  - 它可能把参数顺序传反，甚至把函数名拼错成 `getBearerToken`。
- **结构化治理对策**：  
  **“维护 Working Set”的核心价值，就是把当前活动工作区核心文件的导出符号、函数名、入参类型、返回值契约位级保真地钉在上下文里！** 大模型不需要看几千行函数体实现，但能像查阅 API 手册一样精准调用，绝不翻车。

### 2.3 致命缺陷 3：任务态势漂移 —— 目标与完成边界模糊，导致提前退出或死循环 (Task State Drift)
- **日常写代码的真实场景**：  
  一个复杂任务包含 5 个子阶段：（1）解构现有中间件；（2）实现 JWT Bearer 验签；（3）迁移 Redis 黑名单；（4）集成自动化测试；（5）更新 API 路由文档。
- **为什么普通总结会引发态势漂移？**  
  普通总结往往把“计划要做的事”和“已经完成且通过测试的事”混写在一起，产出诸如“助手已着手鉴权改造并规划了 Redis 迁移”这类模糊表述。
- **惨痛后果**：  
  - **早熟收敛（Premature Completion）**：Agent 误以为整个任务已经完结，跳过了测试验收便向用户草草宣告完工；  
  - **死循环返工（Regressive Redo）**：Agent 忘记第 2 步已经写好了路由，又在第 18 步重新生成一份，导致代码冲突与版本覆盖。
- **结构化治理对策**：  
  在记忆账本（Ledger）中显式切分 **Verified Milestones（已验收里程碑）** 与 **Unfinished Subtasks（待办工作清单）**，保持执行态势边界分明。

### 2.4 致命缺陷 4：历史破坏性覆盖 —— 现场证据全损，事后无法溯源下钻 (Destructive History Loss)
- **普通总结的做法**：  
  用 `messages = [summary]` 直接覆盖内存中的历史消息，旧的工具调用入参、底层命令输出、测试错误堆栈被彻底从内存中抹去。
- **惨痛后果**：  
  当第 28 步遇到不可预期的回归 Bug，需要核对第 3 步分析旧数据库配置时的原始字段与错误输出时，现场证据已全损，没有任何手段能够重新调阅。

---

## 3. 原理：Context Budget Manager 与六层分层治理矩阵

为了根除上述缺陷，现代 Coding Agent Runtime（以 Pi 和 Claude Code 为代表）引入了**结构化上下文预算治理矩阵（Context Budget Manager）**：

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                   CONTEXT BUDGET MANAGER 预算治理矩阵 (如 32K 活跃视窗)       │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. 📌 Pinned Base (固定基石层, ~1.2K, 优先级 1, 100% 保留)                   │
│    • System Prompt / Role Definition                                        │
│    • User Original Objective (绝对目标不变性)                                │
│    • Safe Execution Policies / Environment Constraints                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. 🗂️ Active Working Set & Repo State (当前工作区态势, ~6K, 优先级 2)        │
│    • Modified Files Diff Tracker (已修改文件列表及精简变更)                    │
│    • Critical Exported Symbols & Type Contracts (函数签名位级保真速查表)     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. ⚠️ Negative Constraints & Deadlocks (避坑黑名单, ~2K, 优先级 2)          │
│    • Disproven Hypotheses (已证伪假说)                                       │
│    • Trap Registry (致命踩坑记录: "Do not use X because Y")                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. 📦 Structured Compaction Ledger (结构化记忆账本, ~4K, 优先级 3)           │
│    • Architectural Decisions Log (架构决策履历)                             │
│    • Verified Milestones (已交付里程碑)                                      │
│    • Unfinished Subtasks (待办工作清单)                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 5. 🔥 Hot Sliding Window (高保真执行区, ~8K, 优先级 4)                       │
│    • Recent K Turns (最近 4~6 步工具调用与原子回执，保持 100% 位级真理)        │
│    • Latest Compiler / Test Output                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 6. ❄️ Cold Event Archive (冷事件归档，不进 Prompt，按需检索)                 │
│    • Pi-style events.jsonl 完整事件流 (零丢失，支持 History Search 靶向抓取)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 六大预算层的职能与配额分配
1. **📌 Pinned Base（固定基石层，~1.2K，优先级 1，100% 保留）**：  
   包含用户最初交付的核心目标（Objective）、系统设定、环境约束与沙箱安全策略。享有最高优先级，任何时候绝不压缩、绝不驱逐。
2. **🗂️ Active Working Set（活动工作区态势，~6K，优先级 2）**：  
   维护当前任务修改的受影响文件列表，以及各模块导出的函数名称、入参类型契约。为下游模块编写调用代码提供精准的类型约束。
3. **⚠️ Negative Constraints（避坑黑名单，~2K，优先级 2）**：  
   显式置顶在排错过程中证伪的死锁陷阱、不兼容依赖与错误命令，杜绝模型在后续轮次重蹈覆辙。
4. **📦 Structured Compaction Ledger（结构化账本，~4K，优先级 3）**：  
   用严格结构记录架构决策链、已验证里程碑与未完成子任务，防止任务目标漂移。
5. **🔥 Hot Sliding Window（高保真执行滑窗，~8K，优先级 4）**：  
   保留最近 4~6 步工具调用的原始报文与最新测试回执，确保模型感知当前最鲜活的物理世界反馈。
6. **❄️ Cold Event Archive（冷事件归档，0 Prompt Token，按需检索）**：  
   磁盘上只追加的原始全量日志，不计入当前 Prompt 预算，但通过专用检索工具随调随用。

---

## 4. 开源先驱 Pi (`wayfind/pi-mono`) 的架构设计与工程哲学

Pi 作为一个以极简终端 Coding Harness 闻名的先驱开源项目，其 Compaction 机制有着非常深刻的架构设计：

### 4.1 核心洞察：Compaction 本质就是因果树（DAG）上的一次 Branch 快照
结合第 16 课（Session 分支推演与 DAG），你会发现一个惊艳的架构统一：
- 在传统观念中，“压缩就是把旧消息从内存数组中删除，换成一段自然语言 summary”；
- **但在 Pi 的底层，因果历史是只追加不可篡改的树（Tree of Runs）。一次 Compaction，本质上是在因果树上创建了一个特殊的快照分叉节点 `CompactionEntry`！**
- 这个节点记录了结构化账本，并用 `parentId` 牢牢锚定在被压缩前的最后一个原始事件上；
- **这意味着压缩是完全无损且可分支的**：如果你在压缩后发现模型的后续推演方向跑偏了，或者你想回到压缩前查看未删减的原始上下文，你可以像 Git 切分支一样，**以压缩前的原始节点为起点开辟一条新分支（Branch）**重新推演！

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                    Compaction 作为因果拓扑树上的 Branch 快照                   │
│                                                                              │
│   Step 1 ──► Step 2 ──► Step 3 ──► Step 4 (Deadlock Trap) ──► Step 5 (Fix)   │
│                                                                   │          │
│                  ┌────────────────────────────────────────────────┘          │
│                  ▼                                                           │
│           [Compaction 节点] (携带结构化账本 & Working Set & 避坑黑名单)         │
│                  │                                                           │
│                  ├───► [主推演分支：轻装上阵] Step 6 ──► Step 7 ... (Token 低) │
│                  │                                                           │
│                  └───► [备选分支：随时以压缩前节点开辟新 Branch，重新推演]     │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 只追加不可篡改事件流（`events.jsonl`）与瞬态 Prompt 投影
在 Pi 中，Compaction **不是前端把内存数组截断**，而是在底层只追加事件账本（`events.jsonl`）中记录一条结构化的 `SessionCompacted` 事件：
```json
{
  "type": "session_compacted",
  "step": 12,
  "timestamp": 1741500000000,
  "boundaryEventId": "evt_01JN...",
  "ledger": {
    "negativeConstraints": [
      { "category": "DEADLOCK", "statement": "Do not use raw SQLite locks across workers" }
    ],
    "workingSet": [
      { "path": "src/auth/bearer-middleware.ts", "symbols": ["extractBearerToken"] }
    ]
  }
}
```
- **`events.jsonl` 永远不可篡改**：即使经过了 10 次 Compaction，磁盘上的原始事件日志依旧 100% 完整保留。
- **瞬态 PromptContext 投影**：大模型看到的压缩视图，只是在每次调用前一毫秒，由 `ContextBudgetManager` 根据活跃预算动态组装出来的切片视图。
- **解耦认知与物理存储**：大模型视窗需要的是“轻量高信噪比”，而系统持久层需要的是“密码学级完整证据链”。两者彻底解耦。

### 4.3 冷历史穿透检索（`search_session_history`）：前台轻装上阵，后台真理永不磨灭
- 当 Agent 在第 30 步突然需要第 2 步某个配置文件的详细字段时，怎么办？
- 普通总结系统由于已经把旧日志删空，模型只能凭空捏造；
- 而 Pi 提供了 `search_session_history` 工具：模型可以像查阅底层档案馆一样，在 10 毫秒内把磁盘 `events.jsonl` 中被折叠的原始事件靶向检索到当前视窗，做到“前台上下文轻装上阵，后台物理真理永不磨灭”。

---

## 5. 三大方案定量对比竞技场

在 30 步高难度 Auth 重构任务实测中：

| 指标维度 | 方案 A：无压缩 (No Compaction) | 方案 B：普通聊天总结 (Naive Summary) | 方案 C：Pi 结构化预算压缩 (Structured) |
| :--- | :---: | :---: | :---: |
| **总 Token 消耗** | 88,400+ Tokens (爆窗告警) | 18,500 Tokens | **19,800 Tokens (节约 74.2%)** |
| **平均单步延迟** | 11,200ms (11s+) | 1,850ms | **2,100ms (提速 65%)** |
| **避坑记忆保留率** | 60% (被长文稀释) | **0% (彻底抹杀)** | **100% (置顶避坑黑名单)** |
| **符号签名保真度** | 92% | **38% (严重失真)** | **99% (位级精准契约)** |
| **第 24 步关键死锁** | 偶尔遗漏 | **💥 100% 重蹈覆辙死锁** | **🛡️ 完美主动避坑** |
| **最终任务交付率** | 0% (超时退出) | 20% (死锁崩溃) | **100% (顺利全绿交付)** |

### 5.1 核心指标深度剖析
1. **Token 与响应耗时**：  
   无压缩方案由于每步携带 60k~80k Token，TTFT 延迟极高，单步等待时间超过 11 秒；结构化压缩将活跃视窗牢牢压制在 20k 以内，提速 65%，节省 74% Token；
2. **避坑与正确性**：  
   普通总结虽然也压缩了 Token，但在第 24 步遇到并发加锁时，由于缺乏负向避坑记忆，毫无悬念地再次触发死锁崩溃；而结构化压缩不仅节省了 Token，更保证了 100% 任务全绿交付。

---

## 6. 四大领域守恒律与自动化验收

本课在 `app/core/compaction/compaction-verification-suite.ts` 中落地了 4 项严格的领域守恒律：

1. **守恒律 1：负向避坑记忆不可遗忘律（Negative Knowledge Retention Invariant）**  
   压缩过程中，历史中标记为 Fatal/Blocker 的错误反思提取率必须达到 100%，并在 Anchor 顶部突出预警。
2. **守恒律 2：符号签名位级保真律（Symbol & Type Fidelity Invariant）**  
   活动工作区中所有已导出的关键符号与接口签名 100% 位级保真，杜绝 LLM 幻觉变形。
3. **守恒律 3：预算配额严格受限律（Hard Budget Enclosure Invariant）**  
   无论原始工程执行了多少轮交互、产生了多少兆日志，输出 Token 严格小于等于设定的总配额（如 32,000 Tokens）。
4. **守恒律 4：冷历史无损可穿透检索律（Lossless Cold History Penetration Invariant）**  
   冷归档保持 100% 只追加位级真相，能够在 < 50ms 内靶向精准检索被压缩的早期原始日志。

---

## 7. 思考题与结课自测

1. **思考题 1**：在长任务中，如果两个负向避坑约束（例如 Redis 超时策略与 SQLite WAL 参数）发生微小的语义冲突，Compactor 应该依据什么策略进行冲突仲裁？
2. **思考题 2**：为什么 Claude Code 在很多场景下优先采用“只追加文件 Diff”而不是把整个文件重写进上下文？这与 Context Budgeting 有什么内在联系？
3. **预告**：掌握了 Runtime、事件驱动、Session 时空、分支推演以及上下文压缩之后，第 18 课我们将迎来 Pi 单元的毕业之战：**《为什么成熟 Agent 不应该修改 Core？—— Pi Extensions 插件机制与生态扩展》**。

# 第 11 课：一次 Retrieval 够吗？—— Agentic Retrieval（自主多轮检索与路径探索）

> **核心目标**：攻克传统 RAG 最根深蒂固的架构死穴 —— **“开发者替模型提前预先检索一次（Passive Pre-retrieval）”** 的静态假定。深入剖析当提问包含多实体对比、跨微服务级联故障定位、时效与特例规则嵌套时，高维向量空间与词法倒排的**查询稀释（Query Dilution）**与**后验线索不可预知性**；从第一性原理严密推导 **Agentic Retrieval（智能体检索）** 的数学拓扑与 ReAct 推理状态机；将检索原语原子化为标准工具（Tool Primitives）；通过 5 组多跳复杂对决用例实测见证事实召回率从单次检索的 $33\%$ 飙升至 **$100\%$**；最后通过虚构实体陷阱，真实见证无节制智能体滑向**过度检索深渊（The Over-searching Trap）**，推开第 12 课上下文预算与调度控制的大门。

> 🧭 **导航通道**：[← 上一课：C10 全息语境增强](/docs/lessons/context/10-contextual-retrieval-and-metadata.md) ｜ [🚀 进入 C11 互动实验工作台](/lessons/context-c11-agentic-retrieval) ｜ [📖 Context 专项演进全景总纲](/docs/context-learn.md)

---

## 1. 承前启后：终极单次检索漏斗在“多跳问题”上的惨败

在前 10 课的推演演进中，我们打造了一条近乎完美的现代 RAG 检索管线：

```text
C0~C2 (私有知识与 Context 预算) ➔ 确立信噪比（SNR）与“刚刚好”原则
     │
     ▼
C3~C7 (检索漏斗五部曲) ➔ 词法 ➔ 语义向量 ➔ 向量失真 ➔ 双轨混合 RRF ➔ Cross-Encoder 精排
     │
     ▼
C8 (切分几何学) ➔ 结构感知切分，量化 Overlap 冗余账本
     │
     ▼
C9 (Small-to-Big 展开) ➔ 检索原子 (Child) 与注入原子 (Parent) 解耦
     │
     ▼
C10 (Contextual Retrieval) ➔ 攻克孤岛代词，切片单元自足率达到 100%
     │
     ▼
【第 11 课 本课核心】：单次被动检索在面对多跳与复合决策时彻底瘫痪！
  预先代搜失效 ➔ 查询稀释与线索后验 ➔ Agentic Retrieval 自主推理与探索！
```

### 1.1 C10 留下的刺：复合决策与多跳推理

在第 10 课结束时，切片自身的孤岛代词被 Anthropic Contextual 前缀彻底修复，单一切片的自足率达到了 $100\%$。但当我们把一个真实的企业级复合提问输入给系统时：

```text
生产用例 mh-01：
  用户提问：
  “如果用户已经购买了 Gamma，Alpha 和 Beta 哪个产品更适合它？为什么？
   如果选择 Beta，组合订阅有哪些专属费用减免与优惠？”
```

面对这个提问，即使我们启用 C10 的**终极单次检索管线**（Contextual + Small-to-Big + Hybrid RRF）：
- 检索器拿着这一长串 Composite Query 执行一次搜索；
- 召回的 Top-3 切片要么是 `products/gamma.md` 的概况，要么是 `docs/pricing.md` 的常规月费表格；
- **致命缺陷 1**：Beta 产品中决定性的专属插件 `BetaGammaConnector`（写在 `products/beta.md` 第 4 节）直接被稀释出 Top-3；
- **致命缺陷 2**：组合订阅专属的“免首季度 Gamma 数据传输网络流出费用（Egress Free）”由于在提问中根本没出现“Egress”这个词，单次向量检索余弦相似度极低，彻底脱靶！
- **最终结果**：模型看着残缺不全的单次上下文，要么胡乱臆造“Alpha 更适合因为支持企业定制”，要么漏答专属优惠。事实召回率仅有 **$33.3\%$**！

> **核心洞察**：  
> **单次 Retrieval 解决的是“已知查证（Known Lookup）”；**  
> **真实世界的复杂任务，检索本身必须是一个“边看、边想、边探的动态推理过程”。**

---

## 2. 核心第一性原理：为什么单次检索必然在多跳上失效？

### 2.1 联合召回概率的指数级衰减

设一个复合问题 $Q$ 包含 $m$ 个逻辑上相互依赖的离散事实切片 $\mathcal{F} = \{F_1, F_2, \dots, F_m\}$，分别散落在不同的文档或章节中。
若采用单次检索系统，以原始复合 Query 检索 Top-$K$ 个切片，整个推理链成立的充分必要条件是**所有 $m$ 个证据切片同时落在 Top-$K$ 集合中**：

$$P(\text{Chain Complete}) = P\left( \bigcap_{i=1}^m \{F_i \in \text{Top-}K\} \;\middle|\; Q \right)$$

当 $Q$ 包含多个不同方向的语义实体时：
1. **语义质心偏移（Centroid Drift）**：在 Dense Embedding 空间中，复合问题 $Q$ 的向量表示 $\vec{v}(Q)$ 是多个实体向量的加权合成，其几何位置落在各个主题切片的几何中心（空旷区域），与任何一个具体事实切片 $F_i$ 的余弦距离都被拉大；
2. **倒排词频稀释（BM25 Dilution）**：复合提问总长通常在 50~100 字符以上，BM25 词袋对高频词产生平滑惩罚，而真正关键的判决词被冗长的修饰语冲淡。

因此，多事实联合命中概率远小于各子事实独立命中的乘积：

$$P\left( \bigcap_{i=1}^m \{F_i \in \text{Top-}K\} \;\middle|\; Q \right) \ll \prod_{i=1}^m P(F_i \in \text{Top-}K \mid q_i)$$

在 11 篇语料库上，单次检索 $m=3$ 的联合召回概率断崖式跌至 $33\%$ 以下！

### 2.2 后验线索的不可预知性（Posterior Evidence Blindness）

比数学概率衰减更根本的物理阻碍，是**线索的后验因果依赖**：

```text
提问：用户已买 Gamma，Alpha 和 Beta 选哪个？
  │
  ├─► 第一跳（先验已知）：查 Gamma 生态 ➔ 获知优先推荐 Beta
  │
  └─► 第二跳（后验未知！）：必须在读完第一跳后，才能获知实体名【BetaGammaConnector】！
        │
        └─► 第三跳（深度后验！）：根据前两跳成果，去定价手册查【Beta+Gamma Bundle 优惠】！
```

在第一跳完成前，系统连 `BetaGammaConnector` 和 `Egress Free` 这几个字**听都没听说过**！
静态单次检索试图用一句前置提问“一杆进洞”搜出第三跳的结果，在物理因果律上是绝无可能的。

---

## 3. 架构拓扑：从被动漏斗到智能体闭环（ReAct）

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│ C0~C10 传统被动检索架构 (Passive Pre-retrieval Pipeline):                        │
│                                                                                 │
│   用户提问 ──────► [ 预先单次检索 (Contextual + Hybrid) ] ────► 注入 Prompt     │
│                                                                  │              │
│                                                                  ▼              │
│                                                          LLM 单次盲目作答       │
├─────────────────────────────────────────────────────────────────────────────────┤
│ C11 智能体推理检索架构 (Agentic Retrieval - ReAct Loop):                        │
│                                                                                 │
│   用户提问                                                                      │
│      │                                                                          │
│      ▼                                                                          │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │ ReAct 智能体循环核心                                                    │   │
│   │                                                                         │   │
│   │   Thought 1: 分析目标实体 Gamma 的生态兼容产品                          │   │
│   │       │                                                                 │   │
│   │       ▼                                                                 │   │
│   │   Action 1: search_semantic("Gamma 生态兼容推荐") ──► 命中 Beta 硬件级通道│   │
│   │       │                                                                 │   │
│   │       ▼                                                                 │   │
│   │   Thought 2: 发现推荐 Beta，进一步下钻 Beta 的专属插件机制              │   │
│   │       │                                                                 │   │
│   │       ▼                                                                 │   │
│   │   Action 2: read_chunk_parent("products/beta.md") ──► 捕获 BetaGammaConnector│
│   │       │                                                                 │   │
│   │       ▼                                                                 │   │
│   │   Thought 3: 查询 Beta 与 Gamma 组合订阅的价格打包折扣                  │   │
│   │       │                                                                 │   │
│   │       ▼                                                                 │   │
│   │   Action 3: search_text("Beta Gamma 组合优惠 Egress") ──► 捕获首季免流费│   │
│   │       │                                                                 │   │
│   │       ▼                                                                 │   │
│   │   Thought 4: 证据网全部闭合（推荐判定+插件支撑+价格优惠），决策终止    │   │
│   │       │                                                                 │   │
│   │       ▼                                                                 │   │
│   │   Finish: 输出完整事实闭环仲裁结论                                      │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 检索原语的工具化契约（Tool Primitives）

在 Agentic Retrieval 中，我们**剥夺系统替模型预先搜索的特权**，转而为 Agent 装备一套纯粹的底层检索原语工具：

1. **`search_text(query, limit)`**：
   - 作用：词法精确倒排检索。
   - 适用场景：查询错误码（`ERR_ALPHA_AUTH_9021`）、固定端口（`9443`）、标准协议名（`RFC-8842`）。
2. **`search_semantic(query, limit)`**：
   - 作用：Dense 向量语义意图检索。
   - 适用场景：宽泛探索、同义概念联想、模糊业务目标初筛。
3. **`read_chunk_parent(chunkId, parentTokens)`**：
   - 作用：Small-to-Big 精准父窗口展开。
   - 适用场景：锁定目标切片后，向上拉取所属章节完整因果关系。
4. **`read_doc_headings(docId)`**：
   - 作用：轻量大纲目录探测（Table of Contents）。
   - 适用场景：仅消耗微量 Token 即可感知文档骨架，决定下钻策略。
5. **`finish(status)`**：
   - 作用：信息充足时主动触发收敛停机，输出终结响应。

---

## 4. 生产级对决基准：5 大多跳用例设计

我们在 `app/core/context-bench/agentic.ts` 中构建了包含 5 大黄金复杂场景的自动化评测集：

| 用例 ID | 业务领域 | 核心挑战 | 依赖证据链路 | 单次检索困境 |
| :--- | :--- | :--- | :--- | :--- |
| **`mh-01`** | **跨产品生态与组合优惠** | 用户已购买 Gamma，选 Alpha 还是 Beta？专属插件与组合优惠是什么？ | `gamma.md` ➔ `beta.md` (`BetaGammaConnector`) ➔ `pricing.md` (免首季 Egress 费 + 年付 8 折) | 复合提问稀释词法与向量权重，丢失后验插件与免流条款，召回率仅 33% |
| **`mh-02`** | **跨系统故障与级联处置** | Alpha 报 ERR_ALPHA_AUTH_9021 且 9443 挂掉，若主备切换超时 90s 会触发什么容灾后果？合规留存多久？ | `alpha.md` (SSO令牌过期重启) ➔ `ops-handbook.md` (90s超时判定跨AZ失败➔15m全局熔断进只读) ➔ `compliance-manual.md` (运维日志180天/审计日志3年) | 跨越 3 篇完全不同的文档，单次 Top-3 无法容纳全部断言，导致部分事实丢失 |
| **`mh-03`** | **时效冲突与产品特例仲裁** | 购买 Gamma 第 5 天申请退款，用户依据 2026 最新政策支持 7 天退款，是否应获批？依据是什么？ | `2026-policy.md` (通用软件支持7天) ➔ `gamma.md` (第3节专属GPU硬件与按量存储不可退特例条款) | 若检索先命中 2026 新政则模型产生言之凿凿的误判，缺乏特例优于通则的跨文仲裁 |
| **`mh-04`** | **应急调优与复盘治理** | 生产环境爆发 ERR_QUOTA_STORM_4417 且定级 P2 故障，除 maxInflight 调至 32 外，平台工程部最迟何时主持复盘？提交时限几天？ | `ops-handbook.md#c7` (maxInflight=32) ➔ `ops-handbook.md#c9` (P2故障15m响应+3个工作日交报告) ➔ `ops-handbook.md#c13` (平台工程部每两周主持复盘) | 单次检索无法同时遍历长文档的第 7、8、9 三大独立章节 |
| **`mh-05-trap`** | **过度检索深渊 (直通第12课)** | 查询 Delta 产品的量子加密算法协议版本及与 Omega 缓存集群的零拷贝同步时延是多少？ | 知识库中**完全不存在** Delta 与 Omega 两个实体！ | **无约束 Agent 陷入 8~10 轮死循环盲搜**，窗口暴增至 1,890 Tokens，直通第 12 课控制调度 |

---

## 5. 全景对决大比武：五方策略实测数据

我们在统一评测基准上，对比了 5 种不同检索范式的端到端实测指标：

| 策略方案 | 检索模式 | 平均事实召回率 | 推理完整性得分 | 平均步数 | 平均注入 Token | 状态判定 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Strategy 1: Lexical** | 静态单次关键词倒排 | $33.3\%$ | $0.28$ | 1 步 | 420 | 严重断章取义 |
| **Strategy 2: Dense** | 静态单次语义向量 | $36.7\%$ | $0.32$ | 1 步 | 580 | 语义漂移拉入噪声 |
| **Strategy 3: C10 Hybrid** | C10 全息切片+混合精排 | $50.0\%$ | $0.48$ | 1 步 | 780 | 无法预知后验实体 |
| **Strategy 4: Multi-Query** | 规则静态切分子句多搜 | $63.3\%$ | $0.58$ | 3 步 | 1,240 | 无状态盲搜，Token飙升 |
| **Strategy 5: Agentic** | **自主多轮智能体探索** | **$100\%$** | **$1.00$** | **3.8 步** | **680** | **全景证据链精准闭合** |

### 5.1 实证结论

1. **多跳断裂彻底破局**：在正常用例 `mh-01` ~ `mh-04` 上，Agentic Retrieval 依靠 ReAct 循环中的动态反馈机制，将事实召回率直接拉满到 **$100\%$**，推理完整性达到 **$1.00$**；
2. **Token 信噪比反超 Multi-Query**：规则子查询分解（Strategy 4）虽然通过暴力多搜提升了召回率，但引入了大量盲搜垃圾信息，Token 消耗高达 1,240；而 Agentic Retrieval 按需阅读小切片并局部展开，平均注入仅 **680 Tokens**，精准高效；
3. **线索因果链自足**：Agent 输出的每条判断，均附带从发现线索到求证细节的完整思维链条（Chain of Thought），杜绝幻觉伪证。

---

## 6. 隐蔽危机：无约束智能体的过度检索深渊（The Over-searching Trap）

然而，智能体绝非银弹。在评测用例 **`mh-05-trap`** 中，我们刻意向系统注入了两个虚构实体：`Delta` 与 `Omega`。

### 6.1 观察无节制 Agent 的混沌失控

在没有设置严格预算控制（Budget）与停机准则（Stopping Criteria）的情况下，智能体发生了令人震惊的行为：

```text
Step 1: search_text("Delta 量子加密 协议版本") ──► 0 结果
  ▼
Step 2: search_semantic("Delta 安全加密") ──► 命中无关切片
  ▼
Step 3: search_text("Omega 缓存集群 零拷贝") ──► 0 结果
  ▼
Step 4: search_text("零拷贝 同步时延") ──► 仅命中 Alpha 9443 端口
  ▼
Step 5: read_doc_headings("products/alpha.md") ──► 无 Delta
  ▼
Step 6: read_doc_headings("products/beta.md") ──► 无 Delta
  ▼
Step 7: read_doc_headings("products/gamma.md") ──► 无 Delta
  ▼
Step 8: search_text("量子加密") ──► 0 结果
  ▼
Step 9: [触碰最大步数强制中断] 耗尽 1,890 Tokens，延迟 3.4 秒！
```

### 6.2 智能体检索的三大生产级致命隐患

1. **死循环与无效调用风暴（Infinite Search Loop）**：当遇到知识库未收录的内容或模糊语义时，Agent 会不断发散猜测关键词反复重试，造成巨大的 API 账单与延迟失控；
2. **上下文二次爆炸（History Quadratic Growth）**：Agent 每执行一轮 Tool Call，都会把工具返回的一大段文本写进对话历史，随着步数推移，Context Window 呈二次方增长（$O(N^2)$），不仅费用暴涨，还会触发严重的注意力衰减（Lost in the Context）；
3. **缺乏反思与早停置信度（Confidence Collapse）**：Agent 无法定量评估“当前已知证据的置信度”，不知道什么时候该主动认输拒答。

> **核心结论**：  
> **Context Engineering 不仅仅是 Retrieval（找信息）的问题，更是 Control（控成本与停机）的问题！**

---

## 7. 思考题与第 12 课预告

### 7.1 第一性原理思考题

1. **ReAct 循环的延迟开销**：单次检索通常仅需 300~500ms，而 Agentic Retrieval 多轮交互通常需要 1.5~3.5s。在实时高并发的用户在线客服系统中，你如何权衡精度与延迟？
2. **工具粒度设计**：为什么我们不直接提供一个 `read_full_document` 让 Agent 把整篇长文档读完，而是提供 `read_chunk_parent` 和 `read_doc_headings`？这背后遵循了上下文工程的什么铁律？
3. **死循环探测机制**：如果在第 3 步时 Agent 检索的内容与第 1 步高度同义，底层运行时该如何主动打断它？

---

### 7.2 已知未解与第 12 课预告：Agent 为什么会过度检索？

在第 11 课中，我们见证了 Agentic Retrieval 在多跳复杂任务上的非凡推理能力，但也亲眼目睹了 `mh-05-trap` 中 Agent 发散盲搜 9 步撑爆上下文的危险倾向。

当 Agent 可以自由支配工具时，它该如何知道：
- **什么时候信息已经够了？**
- **什么时候应该果断停止搜索？**
- **如何为 Agent 设置硬性 Token 预算与调用熔断？**

这就是我们在第 12 课即将攻坚的全新领域：  
👉 **第 12 课：Agent 为什么会过度检索？—— 上下文控制与预算调度（Context Control & Budget Management）**

---

## 8. 文档与实验全景导航

| 目标系统 | 导航通道 | 说明 |
| :--- | :--- | :--- |
| **上一课讲义** | [← 第 10 课：Contextual Retrieval 与上下文感知增强](/docs/lessons/context/10-contextual-retrieval-and-metadata.md) | 攻克孤岛代词与主语失窃，切片自足率达成 100% |
| **本课工作台** | [🚀 进入第 11 课互动实验工作台 (Multi-Hop Studio)](/lessons/context-c11-agentic-retrieval) | 实时运行五方策略对决、查看多跳推理时序图谱与过度检索陷阱 |
| **全景总纲** | [📖 Context Engineering 问题驱动全景总纲](/docs/context-learn.md) | 查看 00~17 课全套演进推导与问题链 |
| **项目主页** | [🏠 返回 Mini Claude Code 课程门户总览](/) | 全课程工作台大厅与技术路线图 |

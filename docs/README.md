# Mini Claude Code 课程教案与原理讲义 📚

欢迎来到 **Mini Claude Code** 从零手写 Agent 体系化课程。本目录汇集了整套项目的核心架构讲义、设计哲学、工程演进图谱与形式化守恒律。

所有的讲义均可在系统启动后，通过内置的 Markdown 沉浸式阅读器（`http://localhost:5173/docs/...`）或直接在代码编辑器中查阅。

---

## 🧭 课程全景大纲与导读指南

| 文档名称 | 核心主题 | 建议阅读顺序 | 对应学期/轨道 |
| :--- | :--- | :---: | :--- |
| 📑 [README.md](./README.md) | **讲义中心总览与全景索引** | 必读起点 | 全局导读 |
| 🗺️ [base-learn.md](./base-learn.md) | **第一学期：课程主线与手写引擎全景** | 第 1 阶段 | Track A (V0 ~ V11) |
| ⚙️ [framework-learn.md](./framework-learn.md) | **第二学期：Runtime 机制与工作流全景** | 第 2 阶段 | Track A (V12 ~ V20) |
| 🧠 [context-learn.md](./context-learn.md) | **Context Engineering：问题驱动全景纲要** | 专项并行 | Track B (C0 ~ C15) |
| 🔑 [generic-llm-configuration.md](./generic-llm-configuration.md) | **通用大模型 API 接入与配置指南** | 环境准备 | 全局配置 |

---

## 🚀 Track A: Coding Agent 架构与 Runtime 演进讲义 (Lessons 01~21)

### 阶段一：第一学期 · 手写引擎基石 (V0 ~ V11)

| 阶段 | 课号 | 讲义链接 | 核心主题 | 实验台路由 | 核心掌握点 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **V0** | 第 01 课 | [01-statelessness-and-structured-output.md](./lessons/01-statelessness-and-structured-output.md) | **LLM 无状态本质与结构化输出** | `/lessons/v0-llm-chat` | Context Window、Token 拼接、无记忆本质、Zod Schema 契约 |
| **V1** | 第 02 课 | [02-tool-calling-mechanism.md](./lessons/02-tool-calling-mechanism.md) | **Tool Calling 机制与行动力破局** | `/lessons/v1-tool-calling` | 模型行动力、Tool Schema 契约、本地 Runtime 执行器、错误自愈 |
| **V2** | 第 03 课 | [03-agent-loop-and-react.md](./lessons/03-agent-loop-and-react.md) | **Agent Loop 与 ReAct 闭环** | `/lessons/v2-agent-loop` | ReAct 范式、自主多步循环、死循环熔断机制、动态上下文追加 |
| **V3** | 第 04 课 | [04-coding-agent-and-self-healing.md](./lessons/04-coding-agent-and-self-healing.md) | **Coding Agent：文件读写与 Shell 自愈** | `/lessons/v3-coding-agent` | 精准代码补丁 (Diff)、受控终端 Shell 执行、编译/测试报错驱动自主自愈 |
| **V4** | 第 05 课 | [05-planning-and-workflow-routing.md](./lessons/05-planning-and-workflow-routing.md) | **Planning 与复杂工作流路由** | `/lessons/v4-planning` | 任务拆解、确定性 FSM、Attention Anchor 进度锚点、动态重规划 |
| **V5** | 第 06 课 | [06-context-engineering-and-compression.md](./lessons/06-context-engineering-and-compression.md) | **Context Engine 与上下文膨胀防御** | `/lessons/v5-context-engine` | Smart Truncation 日志截断、Repo Map 代码图谱、渐进式摘要压缩 |
| **V6** | 第 07 课 | [07-memory-and-state-persistence.md](./lessons/07-memory-and-state-persistence.md) | **Memory 与状态机持久化** | `/lessons/v6-memory` | L1 工作记忆、L2 会话 Checkpoint、L3 长期知识库与反思提炼 |
| **V7** | 第 08 课 | [08-harness-and-sandbox-security.md](./lessons/08-harness-and-sandbox-security.md) | **Harness 与安全沙箱权限隔离** | `/lessons/v7-harness` | 多级风险定级 (L0~L3)、人机协同审批 (HITL)、PathJailer 边界隔离 |
| **V8** | 第 09 课 | [09-mcp-standard-and-plugin-architecture.md](./lessons/09-mcp-standard-and-plugin-architecture.md) | **MCP (Model Context Protocol) 标准协议** | `/lessons/v8-mcp` | MCP Client/Server 解耦、JSON-RPC 2.0 帧级抓包、动态能力发现 |
| **V9** | 第 10 课 | [10-durable-execution-and-checkpointing.md](./lessons/10-durable-execution-and-checkpointing.md) | **Durable Execution 与容灾断点续跑** | `/lessons/v9-durable-exec` | 有向状态图、原子 WAL Checkpoint、时间旅行调试与分支推演 |
| **V10** | 第 11 课 | [11-eval-and-tracing.md](./lessons/11-eval-and-tracing.md) | **Agent 评测体系与全链路 Tracing** | `/lessons/v10-eval-tracing` | OpenTelemetry 树状调用栈、火焰图瀑布流、三层评测金字塔与 A/B 竞技场 |
| **V11** | 第 12 课 | [12-production-agent.md](./lessons/12-production-agent.md) | **Production Agent 生产级韧性架构** | `/lessons/v11-production-agent` | 加权公平排队 (WFQ)、RPM/TPM 双轨令牌桶、预算硬顶熔断与 SHA-256 审计账本 |

---

### 阶段二：第二学期 · 工业级 Runtime 与工作流图 (V12 ~ V20)

| 阶段 | 课号 | 讲义链接 | 核心主题 | 实验台路由 | 核心掌握点 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **V12** | 第 13 课 | [13-agent-loop-vs-runtime.md](./lessons/13-agent-loop-vs-runtime.md) | **Agent Loop vs Coding Agent Runtime (Pi 篇)** | `/lessons/v12-agent-runtime` | AgentCore、Runtime、Session 树、ToolExecutor、EventStream 五齿轮解耦与级联中断 |
| **V13** | 第 14 课 | [14-event-driven-architecture.md](./lessons/14-event-driven-architecture.md) | **Agent 为什么必须是 Event-Driven？(Pi 观察平面)** | `/lessons/v13-event-driven` | 单向强类型事件总线、FaultBarrier 故障隔离沙箱、Event Sourcing 投影回放 |
| **V14** | 第 15 课 | [15-session-vs-messages.md](./lessons/15-session-vs-messages.md) | **Session 为什么不是 Messages？(Pi 时空架构)** | `/lessons/v14-session-management` | Message History ≠ Session ≠ Runtime State、物理工作区快照指纹 (SHA-256) 与时空分支树 |
| **V15** | 第 16 课 | [16-branching-and-time-travel.md](./lessons/16-branching-and-time-travel.md) | **为什么 Coding Agent 需要 Branch？(Pi 分支推演)** | `/lessons/v15-branching-and-time-travel` | 8 步 Auth 重构走错实测、三大方案定量对比、Cherry-pick 跨分支资产拣选与时空穿梭 |
| **V16** | 第 17 课 | [17-context-compaction.md](./lessons/17-context-compaction.md) | **Context Compaction 为什么不是“总结聊天记录”？** | `/lessons/v16-context-compaction` | 6 层预算治理矩阵、负向避坑黑名单、符号位级保真与只追加 events.jsonl 冷事件归档 |
| **V17** | 第 18 课 | [18-why-mature-agent-never-modify-core.md](./lessons/18-why-mature-agent-never-modify-core.md) | **为什么成熟 Agent 绝不应该修改 Core？(Pi 扩展篇)** | `/lessons/v17-extensions-and-skills` | 4 原语微内核纯洁律、TypeScript Extensions & Skills、生命周期拦截与四大守恒律 |
| **V18** | 第 19 课 | [19-when-while-loop-breaks-down.md](./lessons/19-when-while-loop-breaks-down.md) | **什么时候 while loop 开始失控？(LangGraph 篇)** | `/lessons/v18-while-loop-collapse` | 隐式控制流坍塌、14 个布尔标志位空间爆炸、McCabe 圈复杂度红线与 Pre-Graph 状态机 |
| **V19** | 第 20 课 | [20-what-is-graph.md](./lessons/20-what-is-graph.md) | **Graph 是什么？—— 手写 StateGraph 原语引擎** | `/lessons/v19-state-graph` | 状态图四大原语 (State/Node/Edge/ConditionalEdge)、编译期拓扑检查器、Loop vs Graph 竞技场 |
| **V20** | 第 21 课 | [21-messages-vs-state.md](./lessons/21-messages-vs-state.md) | **Messages 为什么不能当 State？(状态正交分离)** | `/lessons/v20-messages-vs-state` | 会话状态 vs 工作流状态正交解耦、5 大核心状态探针、状态信息熵与 Prompt 注入物理防御 |

---

## 🧠 Track B: Context Engineering 专项研习讲义 (Lessons C00~C15)

围绕第一性原理：**让一个 LLM 在信息不完全的情况下，尽可能可靠地完成任务**，基于标准私有语料库推导演进。

| 课号 | 讲义链接 | 核心主题 | 实验台路由 | 核心掌握点与解决的工程痛点 |
| :--- | :--- | :--- | :--- | :--- |
| **C00** | [00-setup-and-baseline.md](./lessons/context/00-setup-and-baseline.md) | **建立实验环境与私有语料库基准** | `/lessons/context-c0-setup` | 私有数据环境、Zero Context 裸问基线、评测题库构建 |
| **C01** | [01-why-need-context.md](./lessons/context/01-why-need-context.md) | **模型不知道答案怎么办？(物理起源)** | `/lessons/context-c1-why-context` | 幻觉 vs 诚实、手写 `buildContext()` 注入、第一性原理确立 |
| **C02** | [02-sufficient-vs-maximum-context.md](./lessons/context/02-sufficient-vs-maximum-context.md) | **Context 越多越好吗？(Sufficient Context)** | `/lessons/context-c2-sufficient-context` | 注意力稀释、Token 浪费、充分上下文原则 (Sufficient Context) |
| **C03** | [03-lexical-search-and-grep.md](./lessons/context/03-lexical-search-and-grep.md) | **数据很多怎么找到相关信息？(Grep / 词法)** | `/lessons/context-c3-lexical-search` | 字符串倒排原语、检索闭环、同义表达无法命中的致命痛点 |
| **C04** | [04-semantic-search-and-embedding.md](./lessons/context/04-semantic-search-and-embedding.md) | **字符串不同但意思一样怎么办？(语义检索)** | `/lessons/context-c4-semantic-search` | 稠密向量 Embedding、Cosine 相似度空间、Top K 几何召回 |
| **C05** | [05-can-semantic-search-replace-lexical.md](./lessons/context/05-can-semantic-search-replace-lexical.md) | **语义检索能替代关键词搜索吗？(失真边界)** | `/lessons/context-c5-semantic-vs-lexical` | 错误码/标识符精确符号失效、向量模糊失真、6 场景对决 |
| **C06** | [06-hybrid-retrieval-and-rrf.md](./lessons/context/06-hybrid-retrieval-and-rrf.md) | **为什么不能一起用？(Hybrid Retrieval 与 RRF)** | `/lessons/context-c6-hybrid-retrieval` | 词法 + 语义双轨漏斗、RRF (倒数排名融合) 算法手写、盲区消解 |
| **C07** | [07-reranking-and-cross-encoder.md](./lessons/context/07-reranking-and-cross-encoder.md) | **粗排找到了候选，但谁最相关？(Reranking)** | `/lessons/context-c7-reranking` | Recall vs Precision 分工、Cross-Encoder 交叉注意力重排 |
| **C08** | [08-chunking-granularity-and-boundaries.md](./lessons/context/08-chunking-granularity-and-boundaries.md) | **为什么需要 Chunk？(切分粒度与语义边界)** | `/lessons/context-c8-chunking` | 长文档均值池化稀释、滑窗/结构感知/语义波谷切分、Overlap 账本 |
| **C09** | [09-chunk-retrieval-and-small-to-big.md](./lessons/context/09-chunk-retrieval-and-small-to-big.md) | **检索粒度与注入粒度解耦 (Small-to-Big)** | `/lessons/context-c9-small-to-big` | 单元自足率陷阱、Child 检索索引 + Parent 注入窗口两级架构 |
| **C10** | [10-contextual-retrieval-and-metadata.md](./lessons/context/10-contextual-retrieval-and-metadata.md) | **Chunk 自己脱离语境无意义？(Contextual Retrieval)** | `/lessons/context-c10-contextual-retrieval` | 孤岛代词与主语失窃、Anthropic 语境前缀、结构面包屑注标 |
| **C11** | [11-agentic-retrieval-and-multihop.md](./lessons/context/11-agentic-retrieval-and-multihop.md) | **一次 Retrieval 够吗？(Agentic 多跳推理)** | `/lessons/context-c11-agentic-retrieval` | 跨产品多跳推理、检索工具原子化调度、自主何时搜/搜什么/何时停 |
| **C12** | [12-context-control-and-budget.md](./lessons/context/12-context-control-and-budget.md) | **Agent 为什么过度检索？(预算控制与熔断)** | `/lessons/context-c12-budget-management` | 边际信息增益量化、词袋环路探测器、预算硬顶与空命中连续熔断 |
| **C13** | [13-context-assembly-and-layout.md](./lessons/context/13-context-assembly-and-layout.md) | **检索出的上下文怎么进入模型？(装配与布局)** | `/lessons/context-c13-context-assembly` | Lost in the Middle 注意力 U 曲线、零信任 XML 定界、P0~P3 背包调度 |
| **C14** | [14-context-compaction-and-distillation.md](./lessons/context/14-context-compaction-and-distillation.md) | **长任务中 Context 会爆炸 (Compaction 提炼)** | `/lessons/context-c14-compaction` | 50 步长任务爆窗、6 重状态机投影、避坑黑名单、Token 暴降 82% |
| **C15** | [15-memory-and-state-persistence.md](./lessons/context/15-memory-and-state-persistence.md) | **什么时候保存，什么时候遗忘？(Memory 持久化)** | `/lessons/context-c15-memory-persistence` | Context (瞬态 RAM) vs Memory (持久 Disk)、门禁过滤、多级作用域外脑 |

---

## 🛠️ 如何查阅与调试

1. **在线沉浸式查阅**：启动本地服务器 `pnpm dev` 后，直接访问 `http://localhost:5173/docs`，即可在左侧目录树中快速切换任意讲义，并在顶部一键跳转到对应的交互式实验台。
2. **源码与测试验证**：所有实验台位于 `app/routes/lessons.*`，对应的领域核心模型与算法位于 `app/core/`。

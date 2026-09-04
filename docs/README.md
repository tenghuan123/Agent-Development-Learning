# Mini Claude Code 课程教案与原理讲义 📚

欢迎来到 **Mini Claude Code** 从零手写 Agent 体系化课程。本目录整理了每一课的核心认知、工程架构图、思考过程与验收标准。

---

## 📑 课程目录与进度

| 阶段 | 课号 | 核心主题 | 状态 | 核心掌握点 |
| :--- | :--- | :--- | :---: | :--- |
| **V0** | [第 01 课](./lessons/01-statelessness-and-structured-output.md) | **LLM 无状态本质与结构化输出** | ✅ 已完成 | Context Window、Token、无记忆本质、Zod Schema 契约 |
| **V1** | [第 02 课](./lessons/02-tool-calling-mechanism.md) | **Tool Calling 机制与行动力破局** | ✅ 已完成 | 模型行动力、Tool Schema 契约、本地 Runtime 执行器、错误自愈 |
| **V2** | [第 03 课](./lessons/03-agent-loop-and-react.md) | **Agent Loop 与 Thought-Action-Observation 闭环** | ✅ 已完成 | ReAct 范式、自主多步循环、死循环熔断机制、自愈纠错 |
| **V3** | [第 04 课](./lessons/04-coding-agent-and-self-healing.md) | **Coding Agent：文件读写与 Shell 自愈纠错** | ✅ 已完成 | 精准代码补丁 (Diff)、受控终端 Shell、测试驱动自主自愈 |
| **V4** | [第 05 课](./lessons/05-planning-and-workflow-routing.md) | **Planning 与复杂工作流路由 (Workflow)** | ✅ 已完成 | 任务拆解、确定性 FSM、Attention Anchor、动态重规划 |
| **V5** | [第 06 课](./lessons/06-context-engineering-and-compression.md) | **Context Engine 与上下文膨胀防御** | ✅ 已完成 | Smart Truncation、Repo Map、历史修剪与渐进式压缩 |
| **V6** | [第 07 课](./lessons/07-memory-and-state-persistence.md) | **Memory 与状态机持久化** | ✅ 已完成 | L1 工作记忆、L2 会话 Checkpointing、L3 长期知识库与自主反思 |
| **V7** | [第 08 课](./lessons/08-harness-and-sandbox-security.md) | **Harness 与安全沙箱权限隔离** | ✅ 已完成 | 多级风险定级 (L0~L3)、人机审批 (HITL)、PathJailer 与凭证脱敏 |
| **V8** | [第 09 课](./lessons/09-mcp-standard-and-plugin-architecture.md) | **MCP (Model Context Protocol) 标准协议** | ✅ 已完成 | MCP Client/Server 解耦、JSON-RPC 2.0 帧级抓包、手写 Mini Code Server |
| **V9** | [第 10 课](./lessons/10-durable-execution-and-checkpointing.md) | **Durable Execution 与状态恢复** | ✅ 已完成 | 有向状态图 (StateGraph)、原子 WAL Checkpointing、时间旅行调试与分支推演 |
| **V10** | [第 11 课](./lessons/11-eval-and-tracing.md) | **Agent 评测体系与全链路 Tracing** | ✅ 已完成 | OpenTelemetry 树状调用栈、火焰图瀑布流、三层评测金字塔、Benchmark 基准套件与 A/B 竞技场 |
| **V11** | [第 12 课](./lessons/12-production-agent.md) | **Production Agent 生产级落地** | 🎓 第一学期结课 | 多租户公平队列、双轨令牌桶限流 (RPM/TPM)、预算硬顶、三态断路器与密码学哈希账本 |
| **V12** | [第 13 课](./lessons/13-agent-loop-vs-runtime.md) | **Agent Loop vs Coding Agent Runtime (Pi 架构篇)** | ⚡ 第二学期新启 | AgentCore、Runtime、Session 树、ToolExecutor、EventStream 五齿轮解耦，抗击中途插话与 Abort 级联 |


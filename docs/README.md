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
| **V6** | [第 07 课](./lessons/07-memory-and-state-persistence.md) | **Memory 与状态机持久化** | 🚀 本课落地 | L1 工作记忆、L2 会话 Checkpointing、L3 长期知识库与自主反思 |
| **V7** | 第 08 课 | **Harness 与安全沙箱权限隔离** | ⏳ 规划中 | 危险命令拦截 (rm/drop)、人机确认 (HITL)、沙箱隔离 |
| **V8** | 第 09 课 | **MCP (Model Context Protocol) 标准协议** | ⏳ 规划中 | MCP Client/Server 解耦、手写标准 Mini Code Server |
| **V9** | 第 10 课 | **Durable Execution 与容灾断点续跑** | ⏳ 规划中 | 状态 Checkpointing、崩溃自恢复、幂等性执行 |
| **V10** | 第 11 课 | **Agent 评测体系与全链路 Tracing** | ⏳ 规划中 | Benchmark 评测集、Token/延迟追踪、可观测性看板 |
| **V11** | 第 12 课 | **Production Agent 生产级落地** | ⏳ 规划中 | 高并发、多租户限流、Token 成本控制与云原生部署 |


# Mini Claude Code 🚀

> 从 0 手写一个自主 AI Coding Agent（演进式课程实践项目）。

---

## 🛠️ 技术栈

- **全栈框架**：TypeScript + Remix / React Router v7 (SSR + Streaming SSE)
- **模型路由**：OpenRouter API (支持 Claude 3.5 Sonnet, DeepSeek V3/R1, GPT-4o 等)
- **模式与契约校验**：Zod + JSON Schema + Tool Definition Protocol
- **样式**：Tailwind CSS (Dark Mode 极客质感)

---

## 📦 演进路线图

```text
[x] V0  LLM Chat         ── LLM 原生机制 / Token / Context Window / 记忆本质与结构化输出
[x] V1  Tool Calling     ── 模型行动力 / Tool Schema 契约与本地 Runtime 执行器
[x] V2  Agent Loop       ── Thought → Action → Observation 闭环与死循环熔断
[x] V3  Coding Agent     ── 文件读写、Shell 执行与代码环境自愈纠错
[x] V4  Planning/Routing ── 复杂任务拆解、步骤规划与工作流路由
[x] V5  Context Engine   ── 上下文膨胀防御、动态检索与摘要压缩
[x] V6  Memory           ── L1 工作记忆、L2 会话 Checkpoint 与 L3 长期知识库反思
[x] V7  Harness/Sandbox  ── 多级权限矩阵、人机协同审批 (HITL) 与沙箱隔离
[x] V8  MCP Standard     ── Model Context Protocol 标准客户端与插件解耦
[x] V9  Durable Exec     ── 崩溃恢复、幂等性与 LangGraph / Checkpoint
[x] V10 Eval & Tracing   ── 自动化评测基准数据集与全链路可观测性
[x] V11 Production Agent ── 多租户公平队列、双轨令牌桶限流、预算硬顶、断路器与防篡改审计
[x] V12 Agent Runtime    ── AgentCore、Runtime、Session 树、ToolExecutor、EventStream 五齿轮解耦 (Pi 架构篇)
[x] V13 Event-Driven     ── 强类型事件总线、FaultBarrier 故障沙箱与 Event Sourcing 投影回放 (Pi 观察平面)
[x] V14 Session State    ── Message History ≠ Session ≠ Runtime State、物理工作区快照指纹 (SHA-256) 与时空分支树
[x] V15 Branch & DAG     ── 为什么 Coding Agent 需要 Branch？8 步 Auth 重构走错实测、三大方案定量对比、Cherry-pick 资产拣选与时空穿梭 (Pi 分支推演架构)
[x] V16 Compaction       ── Context Compaction 为什么不是“总结聊天记录”？6 层预算治理矩阵、负向避坑黑名单、符号位级保真与只追加冷事件归档 (Pi 预算治理篇)
```

---

## 📚 课程讲义与文档

- 📑 [课程大纲与总览](./docs/README.md)
- 📄 [第 01 课：LLM 底层机制、无状态本质与结构化输出](./docs/lessons/01-statelessness-and-structured-output.md)
- 🛠️ [第 02 课：Tool Calling 机制与行动力破局](./docs/lessons/02-tool-calling-mechanism.md)
- 🔄 [第 03 课：Agent Loop 与 Thought-Action-Observation 闭环](./docs/lessons/03-agent-loop-and-react.md)
- 💻 [第 04 课：Coding Agent 与代码自愈闭环](./docs/lessons/04-coding-agent-and-self-healing.md)
- 🧭 [第 05 课：Planning 与复杂任务工作流路由](./docs/lessons/05-planning-and-workflow-routing.md)
- ✂️ [第 06 课：Context Engine 与上下文膨胀防御](./docs/lessons/06-context-engineering-and-compression.md)
- 🧠 [第 07 课：Memory 与状态机持久化](./docs/lessons/07-memory-and-state-persistence.md)
- 🛡️ [第 08 课：Harness 与安全沙箱权限隔离](./docs/lessons/08-harness-and-sandbox-security.md)
- 🔌 [第 09 课：MCP 标准协议与插件解耦](./docs/lessons/09-mcp-standard-and-plugin-architecture.md)
- ⚡ [第 10 课：Durable Execution 与容灾断点续跑](./docs/lessons/10-durable-execution-and-checkpointing.md)
- 📊 [第 11 课：Agent 评测体系与全链路 Tracing](./docs/lessons/11-eval-and-tracing.md)
- 🚀 [第 12 课：Production Agent 生产级落地](./docs/lessons/12-production-agent.md)
- ⚡ [第 13 课：Agent Loop vs Coding Agent Runtime (Pi 架构篇)](./docs/lessons/13-agent-loop-vs-runtime.md)
- 🌐 [第 14 课：Agent 为什么必须是 Event-Driven？(Pi 观察平面)](./docs/lessons/14-event-driven-architecture.md)
- 🪐 [第 15 课：Session 为什么不是 Messages？(Pi 时空架构)](./docs/lessons/15-session-vs-messages.md)
- 🌿 [第 16 课：为什么 Coding Agent 需要 Branch？(Pi 分支推演架构)](./docs/lessons/16-branching-and-time-travel.md)
- 📦 [第 17 课：Context Compaction 为什么不是“总结聊天记录”？(Pi 预算治理篇)](./docs/lessons/17-context-compaction.md)

## 🚀 快速启动

1. **安装依赖**：
   ```bash
   pnpm install
   ```

2. **配置环境变量**：
   复制并在 `.env` 中填入你的大模型 API 密钥（兼容智谱 GLM、DeepSeek、OpenAI、OpenRouter 等）：
   ```bash
   cp .env.example .env
   ```
   在 `.env` 中填写（无特定服务商前缀）：
   ```env
   LLM_API_KEY=你的API密钥
   LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
   LLM_MODEL=glm-4-flash
   ```

3. **启动开发服务器**：
   ```bash
   pnpm dev
   ```
   浏览器访问 `http://localhost:5173`。

---

## 🧪 核心认知实验室 (Interactive Labs)

1. **V1: Tool Calling 实验室 (New!)**
   - 单步全链路追踪（Prompt -> Schema 注入 -> LLM 生成 Tool Call JSON -> Runtime 本地执行 -> 回传 Observation -> LLM 最终严谨答复）。
   - 提供 4 个标准工具沙箱调试：`read_file`、`list_dir`、`calculate`、`get_system_info`。
2. **V0 实验 1：模型记忆本质 (Statelessness Lab)**
   - 探究为什么 LLM 原生没有状态，所谓的“记忆”完全是 Runtime 每次将历史消息重新喂入 Context Window 的结果。
3. **V0 实验 2：Prompt 约束 vs Structured Schema (Schema Lab)**
   - 对比自然语言提示词的不可靠性与基于 Zod Schema 强类型约束的稳定性差异。

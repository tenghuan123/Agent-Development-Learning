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
[x] V5  Context Engine   ── 上下文膨胀防御、动态检索与摘要压缩 (当前落地)
[ ] V9  Durable Exec     ── 崩溃恢复、幂等性与 LangGraph / Checkpoint
[ ] V10 Eval & Tracing   ── 自动化评测基准数据集与全链路可观测性
[ ] V11 Production Agent ── 并发、限流、成本控制与生产部署
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

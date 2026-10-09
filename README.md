# Mini Claude Code 🚀

> 从 0 到 1 手写自主 AI Coding Agent 与 Context Engineering 实验台（双轨 37 门交互式工程实战体系）。

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React Router](https://img.shields.io/badge/React%20Router-v7%20(SSR%20%2B%20SSE)-crimson.svg)](https://reactrouter.com/)
[![Zod](https://img.shields.io/badge/Schema-Zod%20v3-orange.svg)](https://zod.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Style-Tailwind%20CSS-38bdf8.svg)](https://tailwindcss.com/)
[![Security](https://img.shields.io/badge/Security-BYOK%20Local%20Only-emerald.svg)](#-端侧安全-byok-机制)

---

## 🎯 为什么要做 Mini Claude Code？

学习 AI Agent 最深刻的方式，**绝不是先死记硬背 LangChain 或 AutoGen 的 API，而是先在真实开发中遇到棘手的工程瓶颈，再为了破解这个瓶颈亲手推导并实现下一个核心抽象**。

Mini Claude Code 是一套端到端的全栈演进式实践项目。主工程拒绝“玩具级调用”，围绕真实的终端执行、受控沙箱、代码补丁 (Diff)、状态机、上下文预算、分支推演与工作流图展开，最终形成 **37 门带独立交互实验台（Workbench）的全栈工程体系**。

---

## 🧭 双轨演进架构图谱

```text
                                  Mini Claude Code 全栈工程体系
                                                │
         ┌──────────────────────────────────────┴──────────────────────────────────────┐
         ▼                                                                             ▼
Track A: Coding Agent 架构与 Runtime (V0~V20)                        Track B: Context Engineering 专项研习 (C0~C15)
         │                                                                             │
 ┌───────┴──────────────────────────┐                                  ┌───────────────┴────────────────────────┐
 │ 第一学期 · 手写引擎基石 (V0~V11) │                                  │ 基于标准私有语料库的问题驱动链演进     │
 │ • V0  LLM Chat & 无状态机制      │                                  │ • C0  实验环境与 Baseline QA 评测台    │
 │ • V1  Tool Calling 协议与执行器  │                                  │ • C1  模型不知道答案怎么办 (第一性原理)│
 │ • V2  Agent Loop (ReAct 闭环)    │                                  │ • C2  Sufficient vs Maximum Context    │
 │ • V3  Coding Agent & Shell 自愈  │                                  │ • C3  词法检索与 Grep 倒排索引原语     │
 │ • V4  Planning 任务规划与 FSM    │                                  │ • C4  稠密向量 Embedding 与语义检索    │
 │ • V5  Context Engine 膨胀防御    │                                  │ • C5  语义检索失真边界 (精确符号对决)  │
 │ • V6  Memory 记忆与持久化        │                                  │ • C6  Hybrid Retrieval 与 RRF 排名融合 │
 │ • V7  Harness 权限矩阵与沙箱     │                                  │ • C7  Cross-Encoder Reranking 深度精排 │
 │ • V8  MCP 标准协议解耦           │                                  │ • C8  文档切分几何与 Overlap 账本      │
 │ • V9  Durable Exec 断点续跑      │                                  │ • C9  Small-to-Big 父子切片解耦架构    │
 │ • V10 Eval & Tracing 可观测性    │                                  │ • C10 Anthropic Contextual Retrieval   │
 │ • V11 Production 生产级韧性架构  │                                  │ • C11 Agentic Retrieval 多跳自主推理   │
 └───────┬──────────────────────────┘                                  │ • C12 Context Budget 预算调度与熔断    │
         ▼                                                             │ • C13 Context Assembly 与零信任 XML    │
 ┌──────────────────────────────────┐                                  │ • C14 Context Compaction 状态机提炼    │
 │ 第二学期 · 进阶 Runtime (V12~V20)│                                  │ • C15 Memory 长期记忆外脑与门禁过滤    │
 │ 【Pi 架构微内核篇】              │                                  └────────────────────────────────────────┘
 │ • V12 AgentCore/Runtime 五齿轮   │
 │ • V13 Event-Driven 观察平面      │
 │ • V14 Session ≠ Messages 时空    │
 │ • V15 Session Branch DAG 推演    │
 │ • V16 上下文预算治理矩阵         │
 │ • V17 微内核纯洁律与沙箱扩展     │
 │ 【LangGraph 显式工作流篇】       │
 │ • V18 While-Loop 控制流坍塌红线  │
 │ • V19 手写 StateGraph 原语引擎   │
 │ • V20 Messages 与 State 正交解耦 │
 └──────────────────────────────────┘
```

---

## 🛠️ 技术栈与架构亮点

- **全栈框架**：TypeScript + React Router v7 (SSR 首屏秒开 + Streaming SSE 单向数据流)
- **模型路由适配**：OpenAI 协议标准化代理，无缝接入智谱 GLM、DeepSeek V3/R1、Claude 3.5 Sonnet、GPT-4o、OpenRouter、Ollama 本地模型
- **模式与契约校验**：Zod v3 强类型数据契约与 Runtime 校验
- **样式与设计系统**：Tailwind CSS (精心调优的极客 Dark Mode 交互质感)
- **核心工程亮点**：
  - **零黑盒依赖**：纯原生手写 Agent Loop、EventBus 事件总线、FaultBarrier 故障沙箱、StateGraph 拓扑编译器、RRF 排名融合器、Cross-Encoder 与 Compaction 状态机。
  - **物理工作区快照指纹**：基于 SHA-256 计算工作区快照，支持时间旅行回放与无损 Session Branching。
  - **零信任 XML 定界**：`trust="untrusted_external"` 沙箱化定界隔离外部语料，100% 免疫 Prompt Injection 越权逃逸。
  - **端侧 BYOK 机制**：支持 LocalStorage 端侧加密凭据存储，接口密钥绝不上云。
  - **内置沉浸式讲义阅读器**：内置基于 React Router 动态路由的 Markdown 渲染系统（`/docs/*`），支持目录直达、代码高亮与关联实验台无缝跳转。

---

## 🚀 快速启动

### 1. 环境准备

确保本机已安装 Node.js (>= 18.0.0) 和 pnpm：

```bash
node -v
pnpm -v
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置大模型 API 密钥

复制环境变量模板：

```bash
cp .env.example .env
```

在 `.env` 中填入你的大模型配置（兼容智谱 GLM、DeepSeek、OpenAI、OpenRouter 等）：

```env
# 大模型 API Key（可留空，支持在前端页面右上角配置纯本地端侧 Key）
LLM_API_KEY=your_api_key_here

# 大模型 Base URL（默认使用智谱开放平台，亦可替换为 OpenRouter / DeepSeek / 本地 Ollama）
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4

# 默认调用模型
LLM_MODEL=glm-4-flash
```

> 💡 **提示**：除了环境变量，系统提供全局 **BYOK (Bring Your Own Key)** 功能。启动后点击网页右上角「设置」按钮，即可在浏览器本地安全保存自定义 Key 与 Base URL，所有凭据仅存储于浏览器 LocalStorage，绝不入库、绝不上云。

### 4. 启动开发服务器

```bash
pnpm dev
```

浏览器打开 [http://localhost:5173](http://localhost:5173)，即可进入课程主页并开启交互式实验台！

### 5. 代码质量与类型检查

```bash
# 格式化与无用导入修复
pnpm lint:fix

# 全量 TypeScript 类型验证
pnpm typecheck
```

---

## 🧪 37 门核心交互实验台 (Interactive Workbench Matrix)

系统为每一课配备了完全独立的交互式工作台，支持实时调试、状态机探针监控与对照实验。

### Track A: Coding Agent 架构与 Runtime 实验台 (21 门)

| 阶段 | 课号 | 主题名称 | 实验台路由 | 原理讲义 |
| :--- | :--- | :--- | :--- | :--- |
| **V0** | 第 01 课 | LLM 无状态本质与结构化输出 | `/lessons/v0-llm-chat` | [讲义](./docs/lessons/01-statelessness-and-structured-output.md) |
| **V1** | 第 02 课 | Tool Calling 机制与行动力破局 | `/lessons/v1-tool-calling` | [讲义](./docs/lessons/02-tool-calling-mechanism.md) |
| **V2** | 第 03 课 | Agent Loop 与 ReAct 闭环 | `/lessons/v2-agent-loop` | [讲义](./docs/lessons/03-agent-loop-and-react.md) |
| **V3** | 第 04 课 | Coding Agent：文件读写与代码自愈 | `/lessons/v3-coding-agent` | [讲义](./docs/lessons/04-coding-agent-and-self-healing.md) |
| **V4** | 第 05 课 | Planning 任务规划与工作流路由 | `/lessons/v4-planning` | [讲义](./docs/lessons/05-planning-and-workflow-routing.md) |
| **V5** | 第 06 课 | Context Engine 与上下文膨胀防御 | `/lessons/v5-context-engine` | [讲义](./docs/lessons/06-context-engineering-and-compression.md) |
| **V6** | 第 07 课 | Memory 与状态机持久化 | `/lessons/v6-memory` | [讲义](./docs/lessons/07-memory-and-state-persistence.md) |
| **V7** | 第 08 课 | Harness 权限安全沙箱与 HITL | `/lessons/v7-harness` | [讲义](./docs/lessons/08-harness-and-sandbox-security.md) |
| **V8** | 第 09 课 | MCP 标准协议与插件生态解耦 | `/lessons/v8-mcp` | [讲义](./docs/lessons/09-mcp-standard-and-plugin-architecture.md) |
| **V9** | 第 10 课 | Durable Execution 状态容灾断点续跑 | `/lessons/v9-durable-exec` | [讲义](./docs/lessons/10-durable-execution-and-checkpointing.md) |
| **V10** | 第 11 课 | Agent 评测体系与全链路 Tracing | `/lessons/v10-eval-tracing` | [讲义](./docs/lessons/11-eval-and-tracing.md) |
| **V11** | 第 12 课 | Production Agent 生产级韧性架构 | `/lessons/v11-production-agent` | [讲义](./docs/lessons/12-production-agent.md) |
| **V12** | 第 13 课 | Agent Loop vs Runtime (Pi 架构解耦) | `/lessons/v12-agent-runtime` | [讲义](./docs/lessons/13-agent-loop-vs-runtime.md) |
| **V13** | 第 14 课 | Event-Driven 单向事件流与 Fault Barrier | `/lessons/v13-event-driven` | [讲义](./docs/lessons/14-event-driven-architecture.md) |
| **V14** | 第 15 课 | Session 为什么不是 Messages (Pi 时空) | `/lessons/v14-session-management` | [讲义](./docs/lessons/15-session-vs-messages.md) |
| **V15** | 第 16 课 | Session Branch DAG 时空分支与 Cherry-pick | `/lessons/v15-branching-and-time-travel` | [讲义](./docs/lessons/16-branching-and-time-travel.md) |
| **V16** | 第 17 课 | Context Compaction 预算治理与避坑黑名单 | `/lessons/v16-context-compaction` | [讲义](./docs/lessons/17-context-compaction.md) |
| **V17** | 第 18 课 | 微内核纯洁律与 TS Extensions 扩展沙箱 | `/lessons/v17-extensions-and-skills` | [讲义](./docs/lessons/18-why-mature-agent-never-modify-core.md) |
| **V18** | 第 19 课 | 什么时候 while loop 开始失控？(控制流坍塌) | `/lessons/v18-while-loop-collapse` | [讲义](./docs/lessons/19-when-while-loop-breaks-down.md) |
| **V19** | 第 20 课 | 从零手写 StateGraph 原语拓扑编译器 | `/lessons/v19-state-graph` | [讲义](./docs/lessons/20-what-is-graph.md) |
| **V20** | 第 21 课 | Messages 为什么不能当 State？(正交解耦) | `/lessons/v20-messages-vs-state` | [讲义](./docs/lessons/21-messages-vs-state.md) |

---

### Track B: Context Engineering 专项实验台 (16 门)

| 课号 | 主题名称 | 实验台路由 | 原理讲义 |
| :--- | :--- | :--- | :--- |
| **C00** | 建立实验环境与私有语料库 Baseline | `/lessons/context-c0-setup` | [讲义](./docs/lessons/context/00-setup-and-baseline.md) |
| **C01** | 模型不知道答案怎么办？(第一性原理) | `/lessons/context-c1-why-context` | [讲义](./docs/lessons/context/01-why-need-context.md) |
| **C02** | Context 越多越好吗？(Sufficient Context) | `/lessons/context-c2-sufficient-context` | [讲义](./docs/lessons/context/02-sufficient-vs-maximum-context.md) |
| **C03** | 数据很多怎么找到相关信息？(Grep 检索) | `/lessons/context-c3-lexical-search` | [讲义](./docs/lessons/context/03-lexical-search-and-grep.md) |
| **C04** | 字符串不同但意思一样怎么办？(语义检索) | `/lessons/context-c4-semantic-search` | [讲义](./docs/lessons/context/04-semantic-search-and-embedding.md) |
| **C05** | Semantic 能替代关键词搜索吗？(失真边界) | `/lessons/context-c5-semantic-vs-lexical` | [讲义](./docs/lessons/context/05-can-semantic-search-replace-lexical.md) |
| **C06** | 为什么不能一起用？(Hybrid Retrieval 与 RRF) | `/lessons/context-c6-hybrid-retrieval` | [讲义](./docs/lessons/context/06-hybrid-retrieval-and-rrf.md) |
| **C07** | 粗排捞出了候选，但谁最相关？(Cross-Encoder) | `/lessons/context-c7-reranking` | [讲义](./docs/lessons/context/07-reranking-and-cross-encoder.md) |
| **C08** | 为什么需要 Chunk？(切分粒度与 Overlap 账本) | `/lessons/context-c8-chunking` | [讲义](./docs/lessons/context/08-chunking-granularity-and-boundaries.md) |
| **C09** | 检索粒度与注入粒度解耦 (Small-to-Big 架构) | `/lessons/context-c9-small-to-big` | [git](./docs/lessons/context/09-chunk-retrieval-and-small-to-big.md) |
| **C10** | Chunk 自己脱离语境无意义？(Contextual Retrieval) | `/lessons/context-c10-contextual-retrieval` | [讲义](./docs/lessons/context/10-contextual-retrieval-and-metadata.md) |
| **C11** | 一次 Retrieval 够吗？(Agentic 多跳推理闭环) | `/lessons/context-c11-agentic-retrieval` | [讲义](./docs/lessons/context/11-agentic-retrieval-and-multihop.md) |
| **C12** | Agent 为什么过度检索？(预算调度与熔断器) | `/lessons/context-c12-budget-management` | [讲义](./docs/lessons/context/12-context-control-and-budget.md) |
| **C13** | 上下文装配几何学与零信任 XML 沙箱 | `/lessons/context-c13-context-assembly` | [讲义](./docs/lessons/context/13-context-assembly-and-layout.md) |
| **C14** | 长任务 Context 爆炸防御 (状态机 Compaction) | `/lessons/context-c14-compaction` | [讲义](./docs/lessons/context/14-context-compaction-and-distillation.md) |
| **C15** | 什么时候保存，什么时候遗忘？(Memory 持久化) | `/lessons/context-c15-memory-persistence` | [讲义](./docs/lessons/context/15-memory-and-state-persistence.md) |

---

## 📁 项目目录结构

```text
mini-claude-code/
├── app/
│   ├── components/            # 公共 UI 组件 (Header、端侧 BYOK 凭证管理器等)
│   ├── core/                  # 核心领域基础设施
│   │   ├── agent/             # Agent 核心运行循环、工具调度器、状态机
│   │   ├── events/            # 强类型单向事件总线、Fault Barrier 沙箱
│   │   ├── session/           # Session 时空管理、DAG 分支树、快照指纹
│   │   ├── graph/             # StateGraph 状态图引擎与拓扑编译器
│   │   ├── context/           # 上下文装配器、XML 沙箱、预算熔断器
│   │   └── memory/            # 记忆门禁分层存储 (L1/L2/L3)
│   ├── lib/                   # 客户端存储、文档动态目录、工具库
│   ├── routes/                # 页面路由与 API 端点
│   │   ├── _index.tsx         # 课程全景门户与双轨导航中心 (Homepage)
│   │   ├── docs.$.tsx         # 站内 Markdown 沉浸式文档阅读器
│   │   ├── lessons.v*.tsx     # Track A: Coding Agent 交互式实验台 (21 门)
│   │   ├── lessons.context*.tsx# Track B: Context Engineering 实验台 (16 门)
│   │   └── api.*.ts           # SSE 流式推理、沙箱隔离与测试运行后端
│   ├── root.tsx               # 应用根模板
│   ├── routes.ts              # 集中式类型安全路由表
│   └── app.css                # Tailwind 样式与主题配置
├── docs/                      # 体系化讲义与原理解析库
│   ├── README.md              # 讲义中心全景导读与课程索引
│   ├── base-learn.md          # 第一学期核心主线与问题演化
│   ├── framework-learn.md     # 第二学期 Runtime 与架构决策全景
│   ├── context-learn.md       # Context Engineering 18 步问题驱动纲要
│   └── lessons/               # 40+ 篇深入原理解析 Markdown 文档
├── scratch/                   # 受控工作区与测试临时沙箱
├── AGENTS.md                  # 项目 AI Agent 核心开发与 React 卫生规范
└── package.json
```

---

## 📜 开发与架构规范

本项目遵循严苛的生产级 React 与全栈工程准则（详见 [AGENTS.md](./AGENTS.md) 与 [.agents/skills/project-code-standards/SKILL.md](./.agents/skills/project-code-standards/SKILL.md)）：

1. **架构抽象原则**：底层基础设施（`app/core/`）充分抽象、强类型契约、零 UI 耦合；前端单课实验易变代码就地直接写，严禁过度工程化。
2. **严禁滥用 `useEffect`**：禁止用 effect 派生状态、同步 props 或裸写 fetch；唯一合法场景为非 React 外部系统同步且必须提供 cleanup。
3. **数据获取规范**：首屏预加载一律使用 React Router `loader`，客户端交互使用 React Query / SWR 缓存机制。
4. **组件生命周期重置**：严禁在子组件监听 ID 重置状态，统一在父组件通过绑定 `key={activeId}` 强制安全重挂载。
5. **代码纯洁性**：严格保证无死导入（`unused-imports`），提交前必须执行 `pnpm lint:fix` 与 `pnpm typecheck`。

---

## 📄 开源许可证

本项目基于 MIT 许可证开源。欢迎参与改进与共建！

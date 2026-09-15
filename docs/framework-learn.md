# 第二学期：Agent Runtime & Harness Engineering 机制全景

在第一学期（前 12 课）中，系统已经从无状态 LLM 一步步演进为生产级 Agent，并亲手实现了 Agent Loop、Context Engine、Memory、Harness 安全沙箱、MCP 与 Durable Execution，而不是机械依赖某个上层框架。

本学期的总目标不再是停留在 API 层面：

> “我会使用 Pi / LangGraph。”

而是建立真正的架构决断力：

> **面对一个真实的 Agent 工程问题，能够准确判断应当使用 Loop、Graph、Harness、Workflow 还是纯原生代码，并深刻理解业界成熟框架为何如此设计。**

主工程继续围绕 **Mini Claude Code** 展开演进。

最终让它形成：

```text
                    Mini Claude Code
                           │
                    Unified Agent App
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    Native Runtime      Pi Runtime    LangGraph Runtime
          │
          └────────────────┼────────────────┘
                           │
                   Eval / Benchmark
```

## 课程统一规则

以后每课固定 5 个环节：

```text
① 问题
为什么会出现这个工程问题？

        ↓

② 实验
故意制造问题，让你亲眼看到它坏掉

        ↓

③ 原理
先自己推导“应该需要什么抽象”

        ↓

④ 实现
先 Native / 再框架实现

        ↓

⑤ 验收
不用背 API，而是证明你真正理解了
```

还有一个重要规定：

**框架 API 永远最后出现。**

例如 LangGraph 第一课绝对不会从：

```ts
new StateGraph(...)
```

开始。

而会从：

> “为什么 while(true) 开始控制不了复杂任务？”

开始。

---

## 第一单元：Pi —— 从 Agent 到 Coding Agent Runtime

Pi 目前仍然把自己定位成一个 **minimal terminal coding harness**，重点包含 session、branching、compaction、extensions、skills、RPC 和 SDK embedding，因此特别适合作为拆解 Coding Agent Runtime 的第一个对象。([GitHub][1])

### 第 13 课：为什么 Agent Loop 之外还需要 Runtime？

| 环节     | 内容                                                                              |
| ------ | ------------------------------------------------------------------------------- |
| **问题** | 我都已经有 `while → LLM → tool → observation` 了，为什么 Claude Code / Pi 还需要一大坨 Runtime？ |
| **实验** | 给现有 Agent 增加：用户中途输入、Abort、tool streaming、并发事件、session 恢复，观察 Agent Loop 开始迅速失控   |
| **实现** | 把现有代码拆成 `AgentCore / Runtime / Session / ToolExecutor / EventStream`            |
| **验收** | 能解释 **Agent Loop 与 Agent Runtime 的边界**；能回答“什么应该进入 core，什么不应该”                   |

这一课非常重要。

以前看到：

```ts
while (true) {
  const response = await llm(messages)
  ...
}
```

觉得：

> Agent 不就这样？

这一课之后应该变成：

```text
Agent Loop
只是 Runtime 中间的一颗齿轮。
```

---

### 第 14 课：Agent 为什么必须是 Event Driven？

| 环节     | 内容                                                                                                       |
| ------ | -------------------------------------------------------------------------------------------------------- |
| **问题** | UI、Tool、LLM、审批、日志怎么同时观察 Agent？                                                                           |
| **实验** | 一个函数既修改 UI 又执行工具又记录日志，观察耦合如何产生                                                                           |
| **实现** | 自己设计 `AgentEvent`：`run_started / message_delta / tool_call / tool_result / state_changed / run_finished` |
| **验收** | 不修改 Agent Core，就能增加一个 Console Tracer                                                                     |

最终：

```text
             ┌→ UI
Agent Runtime ├→ Logger
             ├→ Tracer
             ├→ Telemetry
             └→ Persistence
```

---

### 第 15 课：Session 为什么不是 Messages？

| 环节     | 内容                                                                              |
| ------ | ------------------------------------------------------------------------------- |
| **问题** | 保存聊天记录为什么不能等价于保存 Coding Agent Session？                                          |
| **实验** | Agent 修改 6 个文件后，只保存 messages；重启后尝试继续任务                                          |
| **实现** | Session 增加 `run / branch / metadata / context / tool history / workspace state` |
| **验收** | 能明确解释 `Message History ≠ Session ≠ Runtime State`                               |

然后正式研究 Pi 的 Session / Branching。

---

### 第 16 课：为什么 Coding Agent 需要 Branch？

问题：

> Agent 做到一半方向错了，怎么办？

实验任务：

```text
重构 auth
 ↓
执行 8 步
 ↓
发现第 4 步设计错了
```

比较三种方案：

```text
重新开始

restore snapshot

branch
```

实现：

```text
session A
   │
   ├──── branch B
   │
   └──── branch C
```

**验收：**

给任意历史节点，可以创建另一条 Agent 执行线，同时保留旧执行记录。

---

### 第 17 课：Context Compaction 为什么不是“总结聊天记录”？

这是长任务 Agent 最容易踩坑也是最关键的一课。

问题：

> Agent 工作两小时之后为什么开始变笨？

实验：

```text
Context 10k
Context 30k
Context 60k
Context 100k
```

记录：

```text
System Prompt
Conversation
Source Code
Tool Results
Plans
Historical Errors
```

各占多少 token。

然后故意执行：

```text
summary(messages)
```

观察重要信息丢失。

实现：

```text
Context Budget Manager

├─ pinned
├─ working set
├─ recent observations
├─ summarized history
└─ retrievable history
```

Pi 自身就把 compaction 作为 session/runtime 能力暴露出来，因此到这里再去读 Pi 的实现，会非常容易理解它为什么属于 Runtime 而不是简单 Prompt 技巧。([GitHub][1])

### 验收

同一个 Coding Task：

```text
无压缩
普通 summary
结构化压缩 (structured compaction)
```

比较成功率。

---

### 第 18 课：为什么成熟 Agent 绝不应该修改 Core？

问题：

> 我想给 Agent 增加公司上下文能力，难道直接改 AgentLoop？

实验：

加入：

```ts
searchProductSpec()
searchPR()
searchApiContract()
```

直接塞进 core。

然后再增加：

```text
GitHub
Figma
飞书
数据库
```

观察 core 腐化。

实现第一个 Pi Extension：

```text
vjshi-context-extension

tools:
  search_product_spec
  search_technical_decision
  search_api_contract
```

Pi 本身就是鼓励通过 TypeScript extensions、skills 等扩展，而不是 fork 内核。([GitHub][1])

### 验收

**完全不改 Pi Core**，让 Coding Agent 获得一项新的公司级能力。

到这里：

> **Pi 单元毕业。**

核心收获不是“会用 Pi 的 API”，而是深刻理解：

> **Coding Agent Runtime 为什么长成 Pi 这样。**

---

## 第二单元：LangGraph —— 从隐式 Loop 到显式 Workflow

LangGraph 官方现在非常明确地把自己定义成 **low-level orchestration framework and runtime**，重点就是 long-running、stateful agent，以及 durable execution、streaming 和 HITL；官方也明确说不需要 LangChain 才能使用 LangGraph。([LangChain 文档][2])

所以我们直接绕过 LangChain。

---

### 第 19 课：什么时候 while loop 开始失控？

| 环节     | 内容                                             |
| ------ | ---------------------------------------------- |
| **问题** | 为什么很多 Agent 最后会出现十几个 `if`？                     |
| **实验** | 做一个 `分析 → 计划 → 修改 → 测试 → Review → Retry` Agent |
| **实现** | 第一版坚持用 while + if                              |
| **验收** | 亲自找到控制流变复杂的临界点                                 |

得到：

```text
while
 ↓
if
 ↓
if
 ↓
retry
 ↓
approval
 ↓
resume
 ↓
越来越不可推理
```

然后才提出：

> **能不能把控制流变成数据结构？**

---

### 第 20 课：Graph 是什么？

把上一课改成：

```text
START
  ↓
Analyze
  ↓
Plan
  ↓
Implement
  ↓
Test
 ┌┴─────────┐
pass       fail
 ↓           ↓
Review ← Fix
 ↓
END
```

然后才第一次出现：

```ts
StateGraph
Node
Edge
ConditionalEdge
```

### 验收

给定一个具体的 Agent 业务流程，能够准确判断：

> Loop 更合适还是 Graph 更合适？

---

### 第 21 课：Messages 为什么不能当 State？

实验：

Agent 执行：

```text
需求
↓
plan
↓
修改
↓
test
↓
review
```

如果 state 只有：

```ts
messages: Message[]
```

尝试回答：

```text
当前 plan 是什么？
已经改了哪些文件？
测试次数？
当前风险？
是否需要审批？
```

实现：

```ts
type AgentState = {
  messages
  plan
  changedFiles
  testResults
  currentStep
  retryCount
  approval
}
```

### 验收

能够解释：

> Conversation State 与 Workflow State 为什么应该分开。

---

### 第 22 课：Reducer 与并发 State

问题：

> 两个 Node 同时更新 State 怎么办？

实验：

```text
            ┌→ frontend analysis
Analyze ────┼→ backend analysis
            └→ database analysis
```

三个节点同时返回：

```ts
findings
```

看看最后谁覆盖谁。

然后引出：

```text
Reducer
append
merge
overwrite
```

### 验收

自己设计一个 State Schema，让并行节点安全合并结果。

---

### 第 23 课：Checkpoint 真正保存的是什么？

在第 10 课中已经亲手实现过 durable execution，因此这一课的理论对照会非常顺畅。

问题：

> 为什么不能只把 messages 存 PostgreSQL？

实验：

```text
Analyze ✓
Plan ✓
Edit ✓
Test 💥
```

Kill Node 进程。

然后恢复。

LangGraph 当前把 checkpointer 定义成 thread-scoped graph state persistence，而 store 用于跨 thread 的长期数据，这正好可以拿来与前面第 7/10 课自己的 Memory / Checkpoint 设计进行对照。([LangChain 文档][3])

### 实现

分别做：

```text
Native Checkpoint
        ↓
LangGraph Checkpointer
```

### 验收

进程杀掉后：

```text
pnpm dev
```

重新启动。

任务从正确位置继续。

---

### 第 24 课：HITL 为什么本质上是 Durable Suspension？

问题：

> “弹确认框”为什么不等于 HITL？

实验：

Agent：

```text
准备执行：
DROP COLUMN old_name
```

暂停。

此时直接：

```text
kill process
```

第二天重新启动。

还能审批吗？

LangGraph 的 `interrupt()` 会把状态交给 persistence 层保存，并在使用同一个 thread 恢复时继续执行，因此非常适合把原来 Harness 里的审批概念重新理解成 **durable suspension + external input**。([LangChain 文档][4])

### 验收

做到：

```text
Agent
 ↓
interrupt
 ↓
进程关闭
 ↓
10 分钟后重启
 ↓
Approve
 ↓
继续
```

---

### 第 25 课：什么时候应该并行？

问题：

> Agent 为什么经常慢？

实验：

```text
Analyze frontend  10s
Analyze backend   12s
Analyze database   8s
```

串行：

```text
30s
```

并行：

```text
≈12s
```

实现：

```text
fan-out
fan-in
```

再处理：

```text
部分失败
超时
retry
merge conflict
```

### 验收

不仅能并行，还能处理：

> 三个任务一个失败怎么办？

---

### 第 26 课：什么时候绝对不要用 LangGraph？

对 10 个典型案例进行架构分类：

```text
FAQ Bot
Coding Agent
数据库迁移
审批流程
内容生成
搜索助手
推荐系统
CI Agent
客服 Agent
一次性摘要
```

只能选择：

```text
普通函数
Agent Loop
State Graph
Workflow Engine
```

### 验收

必须给出**为什么不用 LangGraph**的理由。

这一课完成以后，才算真正建立对 LangGraph 的客观技术选型认知。

---

## 第三单元：DeepSeek Harness —— Agent Runtime 如何成为平台

这一部分难度会突然提升。

因为问题已经不是：

> “一个 Agent 怎么跑？”

而是：

> **100 个不同 Agent 怎么共用一套 Runtime？**

DeepSeek Harness 当前的核心设计仍然是 **Everything is a Plugin**：model adapter、tool registry、session log、agent loop 本身都属于 plugin；同时官方目前仍标注 Developer Preview，因此这一阶段重点学架构，不背 API。([GitHub][5])

---

### 第 27 课：为什么 Dependency Injection 不够？

问题：

> 我能把 Tool 注入 Agent，不就行了吗？

实验：

动态安装：

```text
GitHub Plugin
```

然后卸载。

看看：

```text
tool
event listener
service
resource
```

谁负责回收。

引出 Cordis 的：

```text
Context
Service
Effect
Plugin
```

### 验收

插件卸载后：

**所有副作用全部消失。**

---

### 第 28 课：Everything is a Plugin 到底意味着什么？

传统架构：

```text
Agent Core
├─ Model
├─ Tools
├─ Memory
└─ Session
```

DeepSeek Harness：

```text
Context
├─ model plugin
├─ tools plugin
├─ session plugin
├─ agent-loop plugin
├─ UI plugin
└─ policy plugin
```

它甚至强调没有一个需要修改的 privileged core。([GitHub][5])

### 实验

替换：

```text
LocalShell
      ↓
SandboxShell
```

要求：

> Tool Schema 完全不变。

### 验收

理解：

```text
Capability Contract
Implementation
Consumer
```

为什么应该解耦。

---

### 第 29 课：一个系统里怎么运行 100 个 Agent？

这是构建企业级多 Agent 协作系统最核心的一课。

问题：

```text
产品 Agent
前端 Agent
后端 Agent
测试 Agent
运营 Agent
```

是不是启动五套完整 Runtime？

DeepSeek Harness 最近已经实现 agent-scoped context：共享 adapters、persistence、UI 等基础设施，同时让不同 agent 拥有独立 tools、prompt contributions、policies 和 listeners。([GitHub][6])

实验：

```text
Global Context
├─ database
├─ model
├─ telemetry
├─ company context
│
├─ Product Agent Scope
├─ Frontend Agent Scope
└─ Backend Agent Scope
```

### 验收

三个 Agent：

* 共享 Company Context
* 共享模型
* 共享 telemetry
* Tool 权限不同
* Prompt 不同

---

### 第 30 课：真正手写企业级 Company Context Plugin

这一课开始将前面的机制收敛于真正的业务落地场景。

实现：

```text
vjshi-company-context

resources:
├─ product_specs
├─ technical_decisions
├─ api_contracts
├─ code_ownership
├─ historical_prs
├─ design_rules
└─ incidents
```

Agent 收到：

> “我要给购物车设计企业授权功能。”

不再直接回答。

而是：

```text
需求
 ↓
Context Router
 ↓
找到相关业务
 ↓
取历史产品决策
 ↓
取相关 API
 ↓
取历史 PR
 ↓
构造 Working Context
 ↓
Agent 开始设计
```

### 验收

设计一个完全陌生的功能时：

**Agent 能自动找到正确上下文，而不是把整个公司知识库塞进 prompt。**

这其实就是一个企业级 Context 中台 MVP 的真正工程落地形态。

---

## 第四单元：Framework Autopsy —— 不再学框架，开始审框架

接下来故意快速看其他框架。

---

### 第 31 课：OpenAI Agents SDK —— 极简 Primitive 路线

问题：

> 一个 Agent SDK 到底最少需要几个抽象？

OpenAI 当前的 TypeScript Agents SDK 刻意保持很小的 primitive 集合，同时已经覆盖 Agent、tools、handoffs、guardrails、sessions、HITL、tracing 和 sandbox agent。([OpenAI GitHub][7])

实验：

用 Agents SDK 重写你的一个 Mini Claude Code 场景。

对比：

```text
Native
Pi
OpenAI Agents SDK
```

### 验收

写一篇架构判断：

> 哪些东西应该属于 SDK，哪些属于 App？

---

### 第 32 课：AI SDK —— Agent Runtime 怎么进入 React UI？

这个对前端工程化尤为重要。

问题：

> Tool Call 怎么成为 UI State？

研究：

```text
input-streaming
input-available
approval-requested
approval-responded
output-available
output-error
```

AI SDK 目前已经提供明确的 tool approval UI 状态，Vercel 生态也把 streaming、multi-model、agent/workflow、UI 这些能力放在一起。([Chatbot][8])

实验：

把你的：

```text
Tool Call JSON
```

变成：

```text
┌───────────────────────────┐
│ run_command               │
│ npm test                  │
│                           │
│ ⚠️ Requires approval      │
│                           │
│ [Reject]      [Approve]   │
└───────────────────────────┘
```

### 验收

刷新浏览器之后审批状态仍正确。

---

## 最终毕业项目：Runtime Benchmark 竞技场

最后不再新增功能。

拿同一个任务：

> 找到项目中的 bug → 理解相关代码 → 制定方案 → 修改 → 测试 → 如果失败继续修 → 输出结果。

分别使用：

| Runtime           | 实现             |
| ----------------- | -------------- |
| Native            | 手写的原生 Agent     |
| Pi                | Coding Harness |
| LangGraph         | Graph Runtime  |
| OpenAI Agents SDK | Agent SDK      |

记录：

```text
Success Rate
Token Cost
Tool Calls
Latency
Context Peak
Crash Recovery
HITL
Debuggability
Code Complexity
Extension Complexity
```

最后必须能够给出严谨回答：

> **如果明天公司让我做一个 Agent 产品，我究竟选择什么 Runtime？**

而不是：

> 哪个框架 Star 多？

---

## 核心架构认知树与体系总结

第一阶段实际上建立的核心模型是：

```text
                 Agent
                   │
        ┌──────────┼──────────┐
       LLM        Tool       Memory
                   │
                 Loop
```

第二阶段则把架构视角进一步拉升：

```text
                        Agent System
                            │
             ┌──────────────┼──────────────┐
             │              │              │
          Runtime       Orchestration    Harness
             │              │              │
             │              │              │
            Pi          LangGraph     DeepSeek Harness
             │              │              │
             └──────────────┼──────────────┘
                            │
                       Context Platform
                            │
                     Company AI System
```

因此，第二学期的核心目标绝不是：

> **“学习具体的某个 Agent 框架 API”**

更准确的是：

> **“掌握如何构建高可靠的 Agent 系统。”**

这两种学习目标培养出的工程认知完全不同。

第一种人会问：

> LangGraph 的 API 怎么写？

第二种人会问：

> **这个任务到底需不需要 Graph？State 的生命周期在哪里？谁负责 checkpoint？副作用边界在哪里？Agent Scope 属于 Runtime 还是应用层？Context 谁拥有？**

这才是第二阶段希望带领开发者达到的深度。

核心原则依然不变：**每一课都先让 Mini Claude Code 在特定场景下真正失效一次，再推导架构解决方案。** 严禁看到一个新概念就直接套用框架。学完 Pi、LangGraph、DeepSeek Harness 等体系后，内化的不是框架的具体语法糖，而是解决真实系统工程问题的敏锐直觉与架构决断力。

[1]: https://github.com/wayfind/pi-mono/blob/main/packages/coding-agent/README.md "pi-mono/packages/coding-agent/README.md at main · wayfind/pi-mono · GitHub"
[2]: https://docs.langchain.com/oss/javascript/langgraph/overview "LangGraph overview - Docs by LangChain"
[3]: https://docs.langchain.com/oss/javascript/langgraph/persistence "Persistence - Docs by LangChain"
[4]: https://docs.langchain.com/oss/javascript/langgraph/interrupts "Interrupts - Docs by LangChain"
[5]: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md "deepseek-harness/docs/architecture.md at master · deepseek-ai/deepseek-harness · GitHub"
[6]: https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-07-08-agent-scope-contexts.md "deepseek-harness/.agents/notes/implemented/architecture/2026-07-08-agent-scope-contexts.md at master · deepseek-ai/deepseek-harness · GitHub"
[7]: https://openai.github.io/openai-agents-js/ "OpenAI Agents SDK TypeScript | OpenAI Agents SDK"
[8]: https://chatbot.ai-sdk.dev/docs/customization/tool-approval "Tool Approval"

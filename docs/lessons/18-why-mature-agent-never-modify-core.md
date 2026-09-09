# 第十八课：V17 —— 为什么成熟 Agent 绝不应该修改 Core？

> **核心认知**：
> 在开发出基础的 Coding Agent 后，所有企业级团队都会面临一个不可避免的灵魂拷问：
> *“我想给 Agent 增加我们公司的特有能力（例如检索内部 PRD 文档库、检索技术决策 ADR 知识库、接入微服务 API 契约、拉取 GitHub PR、接入飞书审批流、添加安全拦截防护），我到底应该改哪里？”*
>
> 初学者的直觉做法往往是：**直接改 `AgentCore` / `AgentLoop`！**  
> 把公司内部工具直接 push 进 `tools` 数组，把业务规则焊死在 `systemPrompt` 字符串里，甚至为了某家公司的单点登录鉴权去改写模型主调度循环。
>
> **但在真实的生产级 Coding Agent（如 Claude Code 或 Pi）中，这种直接篡改 Core 的做法是一场系统性的自杀灾难！**
>
> 一旦进入真实企业研发体系，直接修改 Core 会引发三大毁灭性后果：
> 1. **微内核被异构业务严重污染（Core Sprawl & Code Rotting）**：几十个企业的杂项依赖、API 变更、重试逻辑和脏数据容错，把原本高内聚、几十行纯粹的 ReAct 决策循环，迅速腐化成几千行充斥着脆性 `if-else` 的“大泥球”。
> 2. **单点故障击穿主循环（Fault Contagion）**：某个企业内部文档接口偶然网络超时或 JSON 格式解析失败，未捕获异常直接击穿主线程调用栈，让正在重构核心代码的 Agent 猝死崩溃，导致文件被截断破坏或留下未提交的脏状态。
> 3. **上游内核断更与 Fork 维护地狱（Upstream Forking Nightmare）**：上游核心（如 Pi 或 Claude Code 原生引擎）发布了重大的性能优化、安全补丁或模型协议升级，但因为你的 Core 已经被私有代码改得面目全非，你永远无法无冲突 Rebase，彻底陷入“私有分支自生自灭”的死局。
>
> 核心公式：
> $$\text{Monolithic Core Sprawl (单体修改腐化)} \ll \text{Ad-hoc Tool Injection (零碎拼凑)} \ll \text{Pi Microkernel + Sandboxed Extensions (微内核沙箱扩展)}$$
>
> **开源先驱 Pi (`@mariozechner/pi-coding-agent`) 的工程哲学**：  
> Core 永远**只有 4 个最纯粹的原语工具**：`read`、`write`、`edit`、`bash`！**绝不增加第 5 个内置工具**。  
> 所有公司私有能力、安全权限拦截（Permission Gates）、上下文容量守卫（Context Guard）、动态提示词注入、终端命令扩展，**全部必须以独立的 TypeScript Extensions 与声明式 Skills 形式挂载，严禁碰 Core 一行代码！**

---

## 1. 架构演进：从单体修改地狱到开放微内核

### 1.1 真实企业场景的困境：“我想加公司能力，难道改 AgentLoop？”

假设你是一家科技公司的架构师，团队引入了 Coding Agent 来辅助日常代码研发。为了让 Agent 能够真正读懂公司的业务，你必须让它具备三项关键企业能力：

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        企业研发所需的非标准私有能力                       │
├────────────────────────────────────────────────────────────────────────┤
│ 1. 搜索产品需求 (search_product_spec)：查询 Confluence 中的 PRD 规则     │
│ 2. 搜索技术决策 (search_technical_decision)：查询架构委员会 ADR 决策库    │
│ 3. 搜索 API 契约 (search_api_contract)：查询微服务 Proto/OpenAPI Schema   │
│ 4. 权限与安全守卫 (Permission Guard)：阻断 rm -rf，敏感配置修改需审批     │
│ 5. 输出容量守卫 (Context Guard)：防止日志分析工具一口气返回 500KB 导致爆窗 │
└────────────────────────────────────────────────────────────────────────┘
```

初级团队的做法通常是：
```typescript
// ❌ 业余单体改写：把企业私有代码强行焊死进 Core 循环
export class AgentCore {
  async runLoop() {
    // 硬编码引入公司私有 SDK
    const confluenceClient = new ConfluenceClient(process.env.CORP_TOKEN);
    const adrRepo = new AdrGitRepository();

    while (running) {
      // 在 core 循环里堆砌各种私有 if-else
      if (needSpec) {
        try {
          const spec = await confluenceClient.fetchPRD(...);
          messages.push({ role: "system", content: spec });
        } catch (e) {
          // 如果这里抛异常，主循环直接挂死！
        }
      }
      ...
    }
  }
}
```

### 1.2 直接改 Core 的三大毁灭性灾难

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   直接篡改 Core 引发的三大工程灾难                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  灾难 1: 核心代码腐化 (Core Sprawl)                                     │
│  几周后核心循环堆满飞书鉴权、Figma Token、GitLab Webhook，难以阅读测试 │
│                                                                        │
│  灾难 2: 异常单点击穿 (Fault Contagion)                                 │
│  公司内网文档服务偶发 502 Bad Gateway，未捕获异常直接把 Agent 进程杀死  │
│                                                                        │
│  灾难 3: 上游 Fork 断更地狱 (Forking Nightmare)                         │
│  上游引擎发布安全升级或新模型适配，你的私有单体分支无法合并，彻底锁死   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.3 开闭原则（OCP）与微内核模式（Microkernel Architecture）

软件工程经典的**开闭原则（Open-Closed Principle, OCP）**明确指出：
> **软件实体（类、模块、函数）应该对扩展开放（Open for extension），对修改关闭（Closed for modification）。**

在 Coding Agent 的架构中，这个原则体现为**微内核模式（Microkernel Pattern）**：
- **微内核（Microkernel / Core）**：只负责最本质、最稳定的底层职责——驱动 LLM 决策、调度有限的原语工具、管理 Session 状态树与广播事件流。
- **扩展插件（Extensions / Plugins）**：所有非通用的企业资产检索、权限拦截、合规审计、上下文提炼等业务功能，全部以独立插件模块挂载，与 Core 物理隔离。

```text
                          ┌────────────────────────┐
                          │   外部世界 / 开发者需求 │
                          └───────────┬────────────┘
                                      │
                                      ▼
    ┌────────────────────────────────────────────────────────────────────┐
    │                      沙箱扩展层 (Extensions Layer)                  │
    │                                                                    │
    │  ┌──────────────────────┐  ┌─────────────────┐  ┌───────────────┐  │
    │  │  CompanyContextExt   │  │ PermissionGuard │  │ ContextGuard  │  │
    │  │  (PRD/ADR/Proto契约) │  │ (高危指令/审批)  │  │ (大输出截断)  │  │
    │  └──────────┬───────────┘  └────────┬────────┘  └───────┬───────┘  │
    └─────────────┼───────────────────────┼───────────────────┼──────────┘
                  │ [provideContext]      │ [beforeToolCall]  │ [afterToolCall]
                  ▼                       ▼                   ▼
    ┌────────────────────────────────────────────────────────────────────┐
    │              Fault Barrier (沙箱隔离屏障与超时熔断器)                │
    └─────────────────────────────────┬──────────────────────────────────┘
                                      │ 安全回调 / 降级兜底
                                      ▼
    ┌────────────────────────────────────────────────────────────────────┐
    │                  Pi Core 微内核 (Microkernel Core)                 │
    │                                                                    │
    │    ┌──────────────┐      ┌──────────────┐      ┌─────────────┐     │
    │    │  AgentLoop   │ ───► │ 4 Primitives │ ───► │ EventStream │     │
    │    │ (ReAct 状态机)│      │ read/write/  │      │ (单向事件流) │     │
    │    │              │      │ edit/bash    │      │             │     │
    │    └──────────────┘      └──────────────┘      └─────────────┘     │
    └────────────────────────────────────────────────────────────────────┘
```

---

## 2. 开源先驱 Pi (`@mariozechner/pi-coding-agent`) 的极简工程哲学

在分析开源界最硬核、最纯粹的终端编码框架 **Pi (`wayfind/pi-mono`)** 时，它的设计哲学令人震撼。

### 2.1 为什么 Core 永远只有 4 个原语工具？

与许多商业 Agent 动辄内置几十个复杂专有工具不同，Pi 的 Core 永远只有 4 个最基础的原语：
1. **`read`**：读取指定路径的文件内容（支持 offset/limit 分页）；
2. **`write`**：创建或全量写入文件；
3. **`edit`**：精确查找并替换文件代码片段；
4. **`bash`**：在终端沙箱中执行 Shell 命令。

**为什么绝不增加第 5 个内置工具？**
- 计算机科学图灵完备性的启示：**在操作系统层面，只要具备文件读写和 Shell 执行能力，就足以组合出一切软件工程行为。**
- 工具不是越多越好！每一个额外内置的工具，都会占用模型的注意力（Context Window 中的 Tool Schema 定义），增加模型误选工具（Tool Selection Confusion）的概率。

### 2.2 保持上下文极致信噪比（Zero Context Bloat）

如果你把 20 个公司的企业工具全部硬编码在 Core 里，每次 LLM 发起请求时，都必须把这 20 个工具的 JSON Schema 全量拼进 Prompt。
- **Token 浪费**：单步 Tool Schema 占用几千 Token，白白增加延迟与费用；
- **注意力涣散**：模型看到一大堆当前不需要的无关工具（如 `search_billing_refund`），极易产生幻觉误调。

在 Pi 的微内核设计中，只有当某个 Extension 或 Skill **被明确启用或按需激活**时，其工具与提示词才会动态投影至当前轮次中；禁用时瞬间完全卸载，**做到零上下文残留（Zero Context Bloat）**。

### 2.3 Pi 的 Extension 与 Skill 真实架构与目录规范

在 Pi 的设计中，扩展被组织在约定目录中：
- 全局扩展目录：`~/.pi/agent/extensions/`
- 工程私有扩展：`.pi/extensions/`
- 技能规范目录：`~/.pi/agent/skills/` 或 `.pi/skills/`

每一个 Extension 都是一个纯粹的 TypeScript 模块，导出 setup 函数，完全通过声明式的 `ExtensionApi` 与运行时进行交互，**对内核代码做到 0 侵入**。

---

## 3. Extension 的本质：生命周期拦截器与动态上下文贡献

Extension 绝不仅仅是“多加几个自定义 Tool”，它的本质是**深度的运行时生命周期劫持者与治理者**。

### 3.1 核心生命周期钩子流（Lifecycle Hooks Pipeline）

```text
会话开始 (Session Start) ──► onSessionStart
                                    │
    ┌───────────────────────────────┴──────────────────────────────┐
    ▼                                                              ▼
[provideContext]                                              [beforeTurn]
(动态注入公司规范与 ADR)                                      (用户输入前置清洗)
    │                                                              │
    ▼                                                              ▼
LLM 生成决策 (Tool Call)                                      LLM 直接文本回复
    │                                                              │
    ▼                                                              ▼
[beforeToolCall] ◄─── 权限卫士 (PermissionGuard 拦截危险指令)     [afterTurn]
    │                                                              │
    ▼ (通过)                                                       ▼
物理工具执行 (Built-in / Custom)                               会话轮次结束
    │
    ▼
[afterToolCall]  ◄─── 容量守卫 (ContextGuard 截断超大输出 / 敏感脱敏)
    │
    ▼
结果写入会话流
```

### 3.2 权限卫士（Permission Guard）：化解高危指令危机

在 Coding Agent 自主探索时，大模型经常因为偶发的极端幻觉，生成破坏性命令：
- 看到编译缓存冲突，企图执行 `rm -rf /` 或 `rm -rf ~`；
- 试图暴力修改生产环境变量 `.env` 或覆盖 SSH 密钥 `id_rsa`。

通过在 `beforeToolCall` 注册拦截钩子，**我们可以在工具真正被物理执行前 0 毫秒将其直接拦截**：

```typescript
api.on("beforeToolCall", (event) => {
  if (event.toolName === "bash") {
    if (/\brm\s+-(?:r|f|rf)\s+(?:\/|\~|\.\.)/i.test(event.args.command)) {
      return {
        allow: false,
        reason: "[PermissionGuard 阻断] 命中高危系统删除指令，生产红线禁止执行！",
      };
    }
  }
  return { allow: true };
});
```
**注意：这个拦截逻辑完全运行在独立的 Extension 中，Core 循环不需要写任何一个针对 `rm -rf` 的特定判断！**

### 3.3 输出容量守卫（Context Guard）：防范 Token 洪水

当执行数据库 Dump、全仓符号扫描或未分页日志读取时，工具可能单次返回 500KB 的输出。
如果直接塞进 `messages` 数组，下一轮直接触发 LLM API 的 `400 Bad Request: Context length exceeded`。

通过在 `afterToolCall` 拦截：
```typescript
api.on("afterToolCall", (event) => {
  const content = typeof event.result === "string" ? event.result : JSON.stringify(event.result);
  if (content.length > 2400) {
    const head = content.slice(0, 960);
    const tail = content.slice(-960);
    const omitted = content.length - 1920;
    return {
      modifiedResult: `${head}\n\n... [折叠 ${omitted} 字符] ...\n\n${tail}`,
      truncated: true,
      warning: `输出超限已自动折叠 ${omitted} 字符`,
    };
  }
});
```
**保护 Context Window 信噪比的重任，由 ContextGuardExtension 独立承担，Core 保持绝对轻盈。**

### 3.4 企业专属上下文：PRD 需求、ADR 决策、API 契约无缝增强

通过 `provideContext` 钩子，企业级扩展可以按需向 System Prompt 注入当前业务必须遵守的架构红线（如“严禁使用 SQLite 事务锁”、“JWT 必须使用轮转机制”），大模型在思考的第一刻就天然具备了企业认知。

---

## 4. 扩展机制三位一体深度辨析：Extension vs Skill vs MCP

许多初学者容易把 Extension、Skill 和 MCP 混为一谈。事实上，三者在职责边界、介入层级和适用场景上有着本质区别。

### 4.1 三大范式的对比矩阵

| 维度 | Extension (扩展插件) | Skill (技能规范) | MCP (Model Context Protocol) |
| :--- | :--- | :--- | :--- |
| **形态本质** | **运行时代工与拦截者** (TypeScript 模块) | **声明式能力包** (Prompt + 规则 + 工具绑定) | **跨进程标准协议** (JSON-RPC over Stdio/SSE) |
| **接入层级** | 深度介入 Agent Runtime 生命周期与调用栈 | 任务级/认知级指令路由与上下文编排 | 外部物理系统隔离接入 |
| **生命周期拦截** | **支持全生命周期 Hooks** (`beforeToolCall` 等) | ❌ 不支持底层拦截 | ❌ 不支持内部拦截（仅提供工具调用） |
| **跨语言能力** | 绑定当前 Runtime 语言（如 TypeScript） | 纯声明式/自然语言，与语言无关 | **完全语言无关**（Python、Rust、Go 均可） |
| **执行开销** | 极低（同进程函数调用，毫秒级） | 零执行开销（仅消耗 Prompt Token） | 有 IPC 跨进程通信与序列化开销 |
| **典型场景** | 权限守卫、输出截断、动态提示词注入、TUI 扩展 | 高并发重构规范、安全合规审计指南、代码风格约束 | 连接外部 PostgreSQL、GitHub API、远程浏览器服务 |

### 4.2 架构选型决策树

```text
你要给 Agent 增加一项新能力：
  │
  ├─► 它是一个完全运行在外部独立系统、跨语言的服务吗（如 Postgres、Sentry、外部云服务）？
  │     └─► YES ──► 使用 【MCP (Model Context Protocol)】
  │
  ├─► 它是一组专业任务的方法论、提示词规则、重构工作流纪律吗？
  │     └─► YES ──► 使用 【Skill (声明式技能)】
  │
  └─► 它需要拦截工具调用、需要审计、需要防范破坏、需要修改上下文或注入本地工具吗？
        └─► YES ──► 使用 【Extension (运行时扩展插件)】
```

---

## 5. 扩展架构的四大领域守恒律（The 4 Invariants）

一个设计严密的微内核扩展系统，必须时刻遵守以下四大领域守恒律：

### 5.1 微内核纯洁律（Microkernel Purity Invariant）
> **定律**：Core 的代码与依赖中，绝对不允许出现任何特定公司、特定业务或外部第三方平台的代码与 SDK。  
> **验证标准**：Pi Core 始终只包含 `read`, `write`, `edit`, `bash` 4 个原语工具，工具数量恒等于 4。

### 5.2 沙箱故障隔离律（Fault Barrier Isolation Invariant）
> **定律**：任何第三方扩展无论在初始化、执行工具还是触发 Hook 时抛出未捕获异常或发生死循环超时，均绝不允许击垮 Core 主线程。  
> **验证标准**：通过 `ExtensionSandbox.executeWithBarrier` 建立断路器，未捕获异常逃逸率恒为 0.00%。

### 5.3 零上下文污染律（Zero Context Bloat Invariant）
> **定律**：当一个扩展或技能处于未激活或禁用状态时，其工具 Schema 与提示词片段必须被物理卸载，不得残留任何无效 Token。  
> **验证标准**：扩展禁用后，其注入的工具和 Prompt 立即从动态上下文中消失，Token 泄漏量恒等于 0。

### 5.4 生命周期可观测律（Lifecycle Observability Invariant）
> **定律**：所有扩展生命周期钩子的触发、参数修改、拦截阻断与沙箱降级，必须 100% 产生结构化审计事件并纳入事件总线。  
> **验证标准**：审计追踪日志具备完整时间戳、操作人、拦截原因与耗时。

---

## 6. 混沌对照实验：5 重事故注入实录

在 `app/core/extensions/extension-chaos-runner.ts` 中，我们模拟了 5 类真实生产事故：

### 6.1 场景 1：外部知识库网络超时假死 (8000ms)
- **单体 Core 模式**：主循环阻塞在 `await fetch()` 达 8 秒，前端 UI 彻底卡死白屏，心跳断开，任务以失败告终。
- **沙箱扩展模式**：沙箱超时断路器在 1500ms 介入熔断，将状态标记为“知识库暂时离线”，优雅返回降级数据，主任务继续推进交付。

### 6.2 场景 2：第三方 API 吐出 HTML 502 报错穿透
- **单体 Core 模式**：`JSON.parse('<html>502 Bad Gateway</html>')` 抛出 `SyntaxError`，直接砸死主线程，修改到一半的代码文件损毁。
- **沙箱扩展模式**：`Fault Barrier` 完美吸收错误，记录 warning 审计事件，主程序零感知。

### 6.3 场景 3：大模型幻觉生成 `rm -rf /` 破坏指令
- **单体 Core 模式**：裸奔执行 `child_process.exec`，宿主工作区被物理清空。
- **沙箱扩展模式**：`PermissionGuardExtension` 在 `beforeToolCall` 拦截点精准阻断，0 毫秒穿透，工作区 100% 安全。

### 6.4 场景 4：工具无分页吐出 500KB 巨型堆栈 (125,000 Tokens)
- **单体 Core 模式**：全量推入 `messages`，直接触发模型服务 400 爆窗拒绝服务。
- **沙箱扩展模式**：`ContextGuardExtension` 在 `afterToolCall` 拦截点自动首尾采样折叠，节省 99.5% Token，模型专注度满分。

### 6.5 场景 5：私有插件缺少内部凭据依赖
- **单体 Core 模式**：进程启动抛出未捕获环境变量缺失异常，导致系统无法运行。
- **沙箱扩展模式**：沙箱在 setup 阶段隔离缺失插件，降级禁用该插件，Core 与其它插件毫发无损正常启动。

---

## 7. 第二学期第一单元：Pi 框架学习毕业总结与全景蓝图

恭喜你！完成本课之后，你已经正式完成了 **第二学期：第一单元（Pi 框架体系）** 的全部修炼！

让我们站在全景高度，复盘这 6 门硬核工程课所筑建的工业级 Coding Agent 架构大厦：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                  工业级 Coding Agent 完整架构蓝图 (Pi 单元总览)                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  第 18 课: 沙箱扩展生态 (Extensions & Skills & Security Guard)               │
│  └─► 彻底解放 Core：通过 TypeScript 模块与 Hooks 拦截解耦私有业务，保持微内核纯洁 │
│                                                                              │
│  第 17 课: 上下文预算治理 (Context Compaction & Working Set)                 │
│  └─► 告别聊天记录粗暴总结：5 层预算分区 + 负向避坑黑名单 + 只追加冷事件存储     │
│                                                                              │
│  第 16 课: 会话分支推演网 (Session Branch DAG & Time Travel)                 │
│  └─► 突破单向线性时间轴：多假说并行推演、任意节点时空穿梭、Cherry-pick 资产复用 │
│                                                                              │
│  第 15 课: 时空领域实体 (Session ≠ Messages ≠ Runtime State)                 │
│  └─► 摆脱纯消息幻想：Session 是因果聚合根与物理快照指纹，Messages 只是瞬态投影 │
│                                                                              │
│  第 14 课: 观察平面解耦 (Event-Driven & Fault Barrier)                        │
│  └─► 拒绝 Callback 回调地狱：强类型单向事件总线，Core 永远无需关心谁在看它   │
│                                                                              │
│  第 13 课: 工业级运行时拆解 (Agent Loop vs Coding Agent Runtime)             │
│  └─► 终结单体死循环：拆解为 Core / Runtime / Session / Executor / EventStream │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 🎓 毕业寄语与下一单元启程

你现在不仅“知道 Pi 是什么”，更深刻理解了：
> **“为什么一个成熟的终端 Coding Agent Runtime 会长成 Pi 这个样子。”**

在经历了隐式循环、微内核与事件驱动的极致洗礼后，在下一单元中，我们将迎来另一个架构巅峰——
**第二单元：LangGraph —— 从隐式 Loop 到显式 Workflow（状态图、条件分支与长程人机协同编排）！**

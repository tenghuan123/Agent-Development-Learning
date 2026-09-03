# 第九课：V8 —— MCP (Model Context Protocol) 标准协议与插件解耦 (Model Context Protocol, JSON-RPC 2.0, Decoupled Server/Client Architecture & Dynamic Tool Discovery)

> **核心认知**：很多初学者认为：“既然 Agent 已经拥有了 Tool Calling 能力，要给它加能力直接在项目里多写几个函数不就行了吗？”
>
> 事实上，在工业级 Coding Agent（如 Claude Code、Cursor、Devin）中，**“把所有工具硬编码进 Agent 单体 Runtime，无异于在主板上焊接所有外设”**。
>
> 随着 Agent 需要接入代码库检查、GitHub、PostgreSQL、Docker、Jira、AWS、甚至无头浏览器，单体硬编码会导致严重的 **$N \times M$ 工具整合危机**、环境依赖冲突、运行体积爆炸以及无法逾越的特权物理隔离壁垒。
>
> **Model Context Protocol (MCP) 的本质是：AI 时代的 USB Type-C 协议。它通过标准化的 JSON-RPC 2.0 报文，将工具（Tools）、只读上下文资源（Resources）与提示词模板（Prompts）标准化解耦为即插即用的外部进程。**

---

## 1. 核心矛盾：为什么单体硬编码工具在工业级走不通？

在第 01~08 课中，我们构建了 ReAct 闭环、代码自愈编辑、长任务 Planning、分层 Memory 以及 Harness 安全沙箱。
但当 Agent 要走向真实复杂工程环境时，单体工具方案面临三大灾难性痛点：

```text
                           【单体硬编码工具的三大工业级灾难】

 1. $N \times M$ 扩展性爆炸与生态孤岛 (The N x M Integration Catastrophe)
 ┌────────────────────────────────────────────────────────────────────────────┐
 │ 存在 N 个 Agent 框架 (Claude Code, Cursor, Mini Claude, AutoGPT...)        │
 │ 存在 M 个外部服务 (GitHub, Postgres, Slack, Jira, Docker, AWS...)          │
 │ 💥 灾难: 每个框架都必须为每个服务手写专属工具适配器，全行业需要编写 N×M 套代码!│
 └────────────────────────────────────────────────────────────────────────────┘

 2. 依赖污染与主进程臃肿 (Dependency Hell & Monolith Bloat)
 ┌────────────────────────────────────────────────────────────────────────────┐
 │ 为了让 Agent 支持数据库与浏览器，必须在 Agent 项目里引入 pg, puppeteer, aws-sdk │
 │ 💥 灾难: 几十个庞大的三方依赖引发版本冲突，Agent 宿主打包体积暴增至几百 MB。  │
 └────────────────────────────────────────────────────────────────────────────┘

 3. 特权与物理边界无法隔离 (Privilege & Network Boundary Violation)
 ┌────────────────────────────────────────────────────────────────────────────┐
 │ 数据库工具需要内网 VPC 鉴权，执行沙箱需要运行在轻量 Docker 容器中。         │
 │ 💥 灾难: 如果工具全在 Agent 宿主主进程内执行，无法实现物理级进程与权限隔离。│
 └────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. MCP 客户端与服务总线架构 (MCP Client-Server Bus)

Anthropic 提出的 **Model Context Protocol (MCP)** 确立了一套标准协议总线：

```text
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                                 MODEL CONTEXT PROTOCOL 架构拓扑                           │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                           │
│     ┌───────────────────────────────────────────────────────────────┐                     │
│     │               Mini Claude Code Host (MCP Client)              │                     │
│     │  • ReAct Agent Loop        • Tool Registry (动态挂载适配器)     │                     │
│     │  • Context Assembly        • JSON-RPC 2.0 帧级报文跟踪与派发  │                     │
│     └───────────────────────────────────────────────────────────────┘                     │
│                 │                                │                                │       │
│                 │ (JSON-RPC 2.0)                 │ (JSON-RPC 2.0)                 │       │
│                 ▼                                ▼                                ▼       │
│  ┌───────────────────────────────┐ ┌───────────────────────────────┐ ┌────────────────────│
│  │     Mini Code MCP Server      │ │     Database MCP Server       │ │  Browser MCP Server│
│  │ (自研代码外设)                │ │ (隔离内网数据外设)            │ │ (网络与搜索外设)   │
│  ├───────────────────────────────┤ ├───────────────────────────────┤ ├────────────────────┤
│  │ • code_read_file              │ │ • db_list_tables              │ │ • browser_fetch    │
│  │ • code_search_symbols         │ │ • db_query (只读 SELECT)      │ │ • browser_search   │
│  │ • code_git_status             │ │ • res: db://schema            │ │                    │
│  │ • res: repo://project-info    │ │                               │ │                    │
│  └───────────────────────────────┘ └───────────────────────────────┘ └────────────────────│
│                                                                                           │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. MCP 三大核心原语 (The Three Core Primitives)

MCP 协议规范不仅定义了“工具”，还定义了结构化上下文的标准传递模式：

| 原语名称 | 协议方法 | 本质与作用 | 典型场景 |
| :--- | :--- | :--- | :--- |
| **Tools (行动能力)** | `tools/list`<br>`tools/call` | **模型可调用的可执行函数**。<br>由 Server 暴露带有 JSON Schema 的函数定义，Client 动态注册后交给 LLM。 | 读取代码、执行 SQL、发送网络请求、操作 Git。 |
| **Resources (只读资源)** | `resources/list`<br>`resources/read` | **带有统一 URI 规范的结构化数据源**。<br>类似于只读文件或虚拟文件系统，直接注入上下文。 | `repo://project-info`、`db://schema`、`api://docs`。 |
| **Prompts (提示词模板)** | `prompts/list`<br>`prompts/get` | **预定义的参数化提示词模板**。<br>由 Server 提供针对特定任务的专业调优 Prompt。 | `code_review`、`optimize_sql`。 |

---

## 4. JSON-RPC 2.0 消息生命周期与握手流程

MCP 通信建立在严格且轻量的 **JSON-RPC 2.0** 报文规范上：

```text
   Client                                                    Server
     │                                                         │
     │ 1. Request: initialize (protocolVersion, capabilities) │
     ├────────────────────────────────────────────────────────►│
     │                                                         │
     │ 2. Response: initialize (serverInfo, capabilities)      │
     │◄────────────────────────────────────────────────────────┤
     │                                                         │
     │ 3. Notification: notifications/initialized              │
     ├────────────────────────────────────────────────────────►│
     │                                                         │
     │ 4. Request: tools/list                                  │
     ├────────────────────────────────────────────────────────►│
     │                                                         │
     │ 5. Response: tools/list ([{ name, inputSchema... }])    │
     │◄────────────────────────────────────────────────────────┤
     │                                                         │
     │ 6. Request: tools/call { name, arguments: {...} }       │
     ├────────────────────────────────────────────────────────►│
     │                                                         │
     │ 7. Response: tools/call { content: [{ type: "text" }] } │
     │◄────────────────────────────────────────────────────────┤
     ▼                                                         ▼
```

### 帧结构规范示例：
```json
// Outbound: Client 发起调用
{
  "jsonrpc": "2.0",
  "id": "client_req_101",
  "method": "tools/call",
  "params": {
    "name": "code_read_file",
    "arguments": { "path": "package.json" }
  }
}

// Inbound: Server 返回回执
{
  "jsonrpc": "2.0",
  "id": "client_req_101",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\n  \"name\": \"mini-claude-code\"\n}"
      }
    ]
  }
}
```

---

## 5. 核心工程实现解析

### 5.1 通用双传输层 (Transports)
我们实现了 `InMemoryTransport` 与 `StdioTransport`：
- **`InMemoryTransport`**：基于异步微任务与成对 Channel 构建，在不产生任何子进程的情况下，进行严格的对象序列化深拷贝 (`JSON.parse(JSON.stringify())`)，百分之百还原网络帧边界，毫秒级连通；
- **`StdioTransport`**：基于 Node.js `child_process.spawn`，通过标准输入输出管道读取换行切分的 JSON 报文（NDJSON），完全兼容外部开源的 Python / Node / Go MCP Server！

### 5.2 核心适配器：MCP Tool -> Agent ToolDefinition
在 `app/core/mcp/client.ts` 中，我们编写了标准适配器：
```typescript
toToolDefinition(mcpTool: McpToolDefinition): ToolDefinition {
  const serverName = this.serverInfo?.name || this.name;
  const client = this;

  return {
    name: mcpTool.name,
    description: `[MCP Server: ${serverName}] ${mcpTool.description || ""}`,
    schema: z.record(z.any()), // 宽松类型透传
    execute: async (args: any) => {
      // 远程 RPC 代理调用
      const res = await client.callTool(mcpTool.name, args);
      return res.content.map(c => c.type === 'text' ? c.text : JSON.stringify(c)).join('\n');
    }
  };
}
```
通过该适配器，上层 ReAct Agent 根本无需关心工具是在本地执行还是跨进程通过 RPC 调用，实现了极致的**关注点分离**。

---

## 6. 第九阶段动手实战与验收标准

进入 `/lessons/v8-mcp` 专属实验工作台：

1. **验收点 1：Capabilities 握手与动态发现**
   - 挂载 `Mini Code Server`、`Database Server`，观察工具总数实时从 0 跃升为 5 个；
   - 在 Capabilities Explorer 中查看 `code_read_file` 与 `db_query` 的完整 JSON Schema。
2. **验收点 2：底层 JSON-RPC 抓包透视 (Wire Protocol Inspector)**
   - 在抓包台中观察 `initialize`、`tools/list`、`tools/call` 的具体 ID 配对、耗时以及请求/响应帧。
   - 使用手动 RPC 发送框构造 `ping` 或 `resources/list`，观察服务端原始 JSON 回复。
3. **验收点 3：热插拔边界测试 (Hot-plug Boundary Test)**
   - **断开** `Mini Code Server`，向 Agent 提问“帮我读取 package.json”：观察 Agent 具备自知性，明确提示用户未挂载代码外设；
   - **连上** `Mini Code Server` 并再次执行：Agent 立即动态检测到新能力，成功调用并读取文件！

---

## 🗺️ 下一站预告：第十课 —— Durable Execution 与容灾断点续跑

在下一课中，我们将探讨：“**如果 Agent 执行一个包含 10 个步骤的长任务，中途服务器断电崩溃，怎么保证不重新从 Step 1 跑起？**”
我们将构建类似 LangGraph / Temporal 的 **Durable State Machine**，实现确定性 Checkpoint 持久化与幂等容灾恢复！


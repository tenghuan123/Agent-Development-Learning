# 第二课：V1 —— Tool Calling 机制与行动力破局

> **核心认知**：大模型从未真正“执行”过任何代码或函数。Tool Calling 的本质是 **Runtime 与 LLM 之间的结构化文本协商契约**。LLM 输出意图，Runtime 负责落地执行。

---

## 1. 核心矛盾：模型为什么只会“说”，不会“做”？

在开发 AI Coding Assistant 时，我们很快会遇到以下真实痛点：

```text
User: 帮我看看 package.json 里的 React 版本是多少？
LLM : 请你把 package.json 的内容复制粘贴给我。

User: 帮我算一下 (98765 * 4321) / 13。
LLM : （输出一个看似合理但实际上算错的浮点数，因为 LLM 在做词元概率预测，而非算术计算）

User: 今天是星期几？
LLM : 我的训练数据截止于 2024 年，我无法获取当下的实时时间。
```

### 为什么会这样？
- **无状态与黑盒隔离**：大模型是一个纯粹的数学概率函数 $P(w_{t} \mid w_{1}, \dots, w_{t-1})$。它没有宿主机文件描述符（File Descriptor）、没有网络套接字（Socket）、没有操作系统进程（Process）。
- **幻觉与算术缺陷**：大模型并不擅长做精确数学运算、精确代码静态分析或高精度哈希计算。

---

## 2. 核心认知破局：模型根本没有在“调用函数”

许多初学者的误区在于：
> “模型调用了 Node.js / Python 的 `fs.readFile()` 函数。”

**事实真相**：
1. **模型只负责生成 Token**：模型只是根据传入的工具 Schema，输出了一个形如 `{"name": "read_file", "arguments": "{\"path\": \"package.json\"}"}` 的结构化 JSON 字符串。
2. **真正的执行者是宿主 Runtime**：是我们的 Node.js / TypeScript 程序拦截到该 JSON，在本地安全环境中调用 `fs.promises.readFile()` 读取文件。
3. **闭环由 Runtime 维系**：Runtime 将执行结果包装成 `role: "tool"` 的消息再次发送给大模型，模型结合该结果生成最终自然语言回复。

---

## 3. 标准 Tool Calling 6 步时序协议

```text
  ┌──────────────┐                               ┌─────────────┐
  │ Host Runtime │                               │     LLM     │
  └──────┬───────┘                               └──────┬──────┘
         │                                              │
         │ 1. 发送 messages + tools(JSON Schema)        │
         │─────────────────────────────────────────────>│
         │                                              │
         │ 2. 返回 finish_reason="tool_calls"           │
         │    tool_calls: [{ id, name, arguments }]     │
         │<─────────────────────────────────────────────│
         │                                              │
         │ 3. 拦截参数，本地分发执行                        │
         │    例如: await fs.readFile(...)              │
         │                                              │
         │ 4. 组装消息链:                                │
         │    + Assistant(tool_calls)                   │
         │    + Tool(tool_call_id, content: output)     │
         │                                              │
         │ 5. 携带完整链路再次发起请求                      │
         │─────────────────────────────────────────────>│
         │                                              │
         │ 6. 综合上下文与工具结果，输出最终解答              │
         │<─────────────────────────────────────────────│
```

---

## 4. 工具工程学（Tool Engineering）：给 AI 设计 UI

在传统前后端开发中，API 是写给前端或其它微服务调用的；而在 Agent 开发中，**Tool 是写给大模型调用的**。

> **“Tool Description 与 Schema 参数描述，本质上就是给 AI 看的交互界面（UI）。”**

### 优秀的 Tool 设计准则：
1. **命名表意清晰**：使用下划线动宾结构（如 `read_file`, `list_directory`, `calculate_expression`）。
2. **描述详尽，包含边界约束**：
   - 告诉模型“什么时候该用，什么时候不该用”。
   - 说明参数格式（相对路径 vs 绝对路径，行号从 1 开始等）。
3. **输入参数强类型校验**：
   - 使用 Zod 进行本地二次验证，防止模型传入格式错乱的参数导致程序崩溃。
4. **优雅的错误反馈机制**：
   - 当工具执行失败（如文件不存在 `ENOENT`）时，**不要直接 crash 服务**！
   - 应当将错误信息 `Error: File 'foo.txt' not found. Available files: [...]` 作为工具执行结果返回给模型，使模型具备**自我纠错（Self-Correction）**能力。

---

## 5. Mini Claude Code 中的架构实现

在本项目中，我们分层构建了清晰的 Tool Calling 架构：

```text
app/core/tools/
├── types.ts          ── Tool 基础接口、上下文与执行结果定义
├── registry.ts       ── Tool 注册中心与 JSON Schema 转换器
├── executor.ts       ── Tool 执行器（参数反序列化、Zod 校验与容错）
└── builtins/         ── 内置工具库
    ├── read-file.ts    (安全项目文件读取)
    ├── list-dir.ts     (目录检索与结构探测)
    ├── calculate.ts    (高精度数学运算)
    └── system-info.ts  (当前时间与运行环境)
```

---

## 6. 思考与进阶：一次 Tool Call 为什么不够？

在这一课中，我们实现了**单轮 Tool Calling**：
$$\text{User} \longrightarrow \text{LLM} \longrightarrow \text{Tool} \longrightarrow \text{LLM} \longrightarrow \text{Answer}$$

但如果用户提出复杂问题：
> “帮我找到项目中所有使用 `useAuth` 的组件，并检查它们是否都正确处理了 loading 状态。”

模型需要：
1. 先调用 `list_dir` 找到目录；
2. 再多次调用 `search_code` 搜索 `useAuth`；
3. 再分别调用 `read_file` 查看每个文件代码；
4. 综合分析后给出答案。

单次 Tool Call 无法满足多步复杂任务，这就引出了我们下一阶段的重头戏：**V2 —— Agent Loop (Thought → Action → Observation 闭环)**。


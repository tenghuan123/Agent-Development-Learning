# 第三课：V2 —— Agent Loop 与 ReAct 闭环

> **核心认知**：单次 Tool Call 只是“手脚”，**Agent Loop 才是“大脑与小脑”**。通过 `Thought → Action → Observation` 的状态机循环、死循环检测与自愈机制，模型才真正拥有了独立探索与解决复杂任务的自主行动力。

---

## 1. 核心矛盾：一次 Tool Call 为什么远远不够？

在上一课（V1）中，我们赋予了模型调用工具的能力。然而，当我们向它提出一个稍微复杂的实际开发需求时：

```text
User: 帮我看看这个项目里有哪些依赖，并检查它们在 app 目录中的实际引用情况。
```

在单步 Tool Calling 架构下会发生什么？
1. 模型首先思考：“我需要先看 `package.json`”，于是发起了工具调用：`read_file({ path: "package.json" })`；
2. 宿主 Runtime 执行了读取，并将文件内容返回给模型；
3. **程序结束了！**
4. 模型在最终回答中只能说：“我看到了依赖列表，但我还没来得及去 `app` 目录搜索引用……”

### 为什么会失败？
- **现实任务是动态多步的（Multi-step & Dynamic）**：你无法在第 1 步就预测第 3 步需要读什么文件，后续的每一个动作（Action）都极度依赖前一个动作的执行结果（Observation）。
- **静态工作流（Workflow）的死板与脆弱**：如果由程序员硬编码 `read_file -> search -> read_file`，一旦用户提问变了，或者某个文件不存在，整个流程就彻底崩溃。

---

## 2. ReAct 范式：Thought → Action → Observation

2022 年，普林斯顿大学与 Google 团队提出了著名的 **ReAct（Reasoning + Acting）** 范式。它的核心思想极其质朴：**将模型的内在推理（Thought）与外部环境交互（Action & Observation）交替结合**。

```text
               ┌──────────────────────────────┐
               │    User Prompt (任务目标)     │
               └──────────────┬───────────────┘
                              │
               ┌──────────────▼───────────────┐
         ┌────►│   1. Thought (模型内部推理)    │
         │     │   - 分析现状与前序 Observation  │
         │     │   - 决定下一步策略             │
         │     └──────────────┬───────────────┘
         │                    │
         │     ┌──────────────▼───────────────┐
         │     │   2. Action (发起工具调用)     │
         │     │   - 选择 Tool 与生成参数 JSON  │
         │     └──────────────┬───────────────┘
         │                    │ (交给 Runtime 执行)
         │     ┌──────────────▼───────────────┐
         │     │ 3. Observation (环境真实反馈)  │
         │     │   - 文件内容 / 计算结果 / 报错 │
         │     └──────────────┬───────────────┘
         │                    │
         └────────────────────┴── 达成目标？──[是]──► 4. Final Answer
                                  │
                                 [否]
```

---

## 3. Messages 消息链在循环中的时序演化

大模型本身是**无状态**的。Agent 之所以能“感知上下文并在多步中不断推进”，完全依靠 **Runtime 在每一次迭代中维护和扩充 `messages` 数组**：

```text
【Turn 0】
User: "帮我找 package.json 中的 react 版本并计算 (版本号 * 100)"

【Turn 1】
Assistant: [tool_calls: read_file("package.json")]
Tool(call_1): "{ dependencies: { react: '^19.0.0' } }"

【Turn 2】
Assistant: [tool_calls: calculate("(19 * 100)")]
Tool(call_2): "1900"

【Turn 3】
Assistant: "已查明 React 版本为 19，计算结果为 1900。" (无 tool_calls，跳出循环)
```

---

## 4. Agent Engineering：三大核心工业级防御机制

当把控制权交给 `while (running)` 循环后，系统会面临极高的失控风险。我们必须在 Runtime 层构筑坚固的防线：

### ① 最大步数熔断（Max Steps Limit）
- **风险**：模型陷入无限探索或推导死循环，耗尽用户 Token 和预算。
- **防护**：硬性限制最大步数（例如默认 8 步）。一旦步数耗尽，Runtime 强制终止循环并返回警示。

### ② 死循环与重复调用检测（Loop Detection & Circuit Breaker）
- **风险**：模型遇到无法解析的输出时，可能会用完全相同的参数反复调用同一工具（如连续 3 次 `read_file("broken.json")`）。
- **防护**：
  1. 计算每次工具调用的标准化签名：`Signature = Hash(tool_name + JSON.stringify(sorted_args))`；
  2. 采用滑动窗口检测机制，如果相同签名连续出现超过阈值（如 2~3 次），立刻触发**熔断警报**；
  3. 策略：向消息链注入系统警告提示词（`System: You are in a loop, change strategy!`）或直接强制终止。

### ③ 错误反馈与自主纠错（Self-Correction）
- **风险**：工具调用遇到文件不存在（`ENOENT`）、参数类型错误或执行崩溃。
- **关键设计准则**：**Runtime 绝不能抛出未捕获异常导致 Node 进程 Crash！**
- **自愈机制**：将错误转化为结构化的 Observation 返回给模型（如 `Error: File 'src/app.tsx' not found. Available files in 'src': ['root.tsx', 'entry.server.tsx']`）。模型在下一个 `Thought` 阶段看到该错误后，能够自主反思并修正文件路径。

---

## 5. Mini Claude Code 中的代码架构

在本项目中，我们在 `app/core/agent/` 下实现了高内聚的 Agent 引擎：

```text
app/core/agent/
├── types.ts          ── Agent 状态机枚举、Step 记录契约与流式事件协议
├── loop-detector.ts  ── 工具调用签名提取、重复调用滑动窗口与死循环熔断器
├── agent-loop.ts     ── 通用 AgentLoop 运行器（支持 SSE 实时广播、自愈与熔断）
└── index.ts          ── 统一对外导出
```

---

## 6. 课后实验与验收标准

进入 `/lessons/v2-agent-loop` 实验室，体验三大典型用例：

1. **用例 1：多步骤代码探索（Multi-Step Exploration）**
   - 验证 Agent 自主完成 `list_dir` → `read_file` → 综合分析的多步链条。
2. **用例 2：错误自愈验证（Self-Correction）**
   - 故意输入不存在的文件名，观察 Agent 收到错误反馈后如何在下一轮自动切换正确路径。
3. **用例 3：死循环拦截验证（Circuit Breaker）**
   - 观察当触发重复调用时，`LoopDetector` 如何实时捕获签名并进行安全熔断。


# 第四课：V3 —— Coding Agent：文件读写、Shell 执行与代码自愈纠错

> **核心认知**：从只读智能体（Read-only Agent）跃迁为可编码智能体（Coding Agent）的分水岭，不仅在于模型能否“写文件”和“跑命令”，而在于**“精准局部补丁（Diff Editing）+ 受控安全 Shell + 编译器/测试失败驱动的自主自愈闭环（Test-Driven Self-Correction Loop）”**。

---

## 1. 核心矛盾：为什么“全量覆写文件”是一场灾难？

在构建初级 Agent 时，许多开发者最先实现的写代码工具通常是简单的全量覆盖写入（`write_file(path, fullContent)`）。然而在实际编码场景中，这种方式会导致灾难性的后果：

```text
                               【全量覆写 vs 精准补丁】

   全量覆写 (write_file):
   ┌────────────────────────────────────────────────────────────────────────┐
   │ 原始文件 (500 行) ──► LLM 重新生成全部 500 行 ──► 写入覆盖整个文件      │
   │ 💥 弊端: 消耗海量 Token、极慢、极易产生幻觉漏写函数、丢失原有格式/缩进    │
   └────────────────────────────────────────────────────────────────────────┘

   精准补丁 (edit_file / Search & Replace):
   ┌────────────────────────────────────────────────────────────────────────┐
   │ 原始文件 (500 行) ──► LLM 仅输出定位块与改动块 (10 行) ──► 局部精准替换   │
   │ ✨ 优势: 极度节省 Token、速度快、只修改目标行、天然保持原有上下文结构      │
   └────────────────────────────────────────────────────────────────────────┘
```

### 为什么在工程中必须引入 `edit_file`？
1. **Token 消耗爆炸与 Context 浪费**：修改一个 500 行代码文件中的一个变量名，若使用全量写入，LLM 必须把这 500 行代码重新逐字输出一遍，消耗数千 Completion Token；
2. **“// ... 其余代码保持不变” 惨剧**：LLM 在输出长代码时为了走捷径，经常会输出注释 `// ... existing code ...`，一旦全量覆盖，现有代码直接被清空抹杀；
3. **精准性与可控性**：基于 `targetContent -> replacementContent` 的搜索替换机制，能够利用上下文锚点确保修改位置绝对精确，并在出现多处冲突时及时报错防御。

---

## 2. Coding Agent 的两大核心基石工具

### ① 精准编辑工具：`edit_file`
一个工业级的代码编辑工具需要满足以下约束：
- **唯一性校验（Uniqueness Check）**：`targetContent` 在目标文件中必须唯一匹配。如果匹配到 0 处，说明模型理解的代码上下文有误；如果匹配到多处，说明特征不足，需要模型提供更多上下文行以消除歧义；
- **Diff 变更可视化**：替换完成后自动计算并返回前后的统一差异对比（Unified Diff），使 Agent 在后续的 Observation 中能够清晰确认自己的修改结果。

### ② 安全受控 Shell 执行器：`run_command`
大模型本身无法直接编译运行代码。必须通过 Runtime 在本地或沙箱中拉起子进程执行指令：

```text
┌──────────────┐      Tool Call: run_command("npm test")       ┌──────────────────────┐
│ Coding Agent ├──────────────────────────────────────────────►│ ToolExecutor (Node)  │
└──────▲───────┘                                               └──────────┬───────────┘
       │                                                                  │ spawn/exec
       │         Observation: { exitCode: 1, stderr: "TypeError" }        │ (带超时与安全沙箱)
       └──────────────────────────────────────────────────────────────────┴───────────┐
                                                                                      ▼
                                                                            ┌──────────────────┐
                                                                            │ OS Shell Process │
                                                                            │ (执行 npm test)   │
                                                                            └──────────────────┘
```

#### Shell 工业级防御机制设计准则：
1. **高危命令拦截（Dangerous Command Shield）**：硬编码拦截 `rm -rf /`, `mkfs`, `sudo`, `dd`, `fork bomb` 等危险系统命令；
2. **超时熔断（Timeout Circuit Breaker）**：默认设置 20~30 秒超时时间，避免 Agent 执行交互式命令（如 `cat`、`vim`、`npm login`）或死循环程序导致整个系统挂起；
3. **输出缓冲区智能截断（Head/Tail Truncation）**：如果命令输出数万行日志（如构建日志），直接填入 Context Window 会撑爆上下文。应采取**保留头部与尾部报错关键行**的智能压缩截断策略；
4. **工作区目录强制锁定（Workspace Confinement）**：所有命令默认在项目的指定根目录执行，防止意外污染系统全局环境。

---

## 3. 灵魂机制：测试与编译驱动的自主自愈闭环 (Self-Healing Loop)

普通对话式 AI 在写出有 Bug 的代码后就此止步，而 Coding Agent 的核心竞争力在于：**能够利用终端反馈自主排查并自愈修复代码！**

```text
                               【Coding Agent 自愈闭环状态机】

                    ┌───────────────────────────────────────────────┐
                    │ 1. Read & Analyze                             │
                    │    阅读源码与测试用例 (read_file)                │
                    └───────────────────────┬───────────────────────┘
                                            │
                                            ▼
                    ┌───────────────────────────────────────────────┐
                    │ 2. Draft / Patch Code                         │
                    │    编写修复逻辑或新功能 (edit_file)              │
                    └───────────────────────┬───────────────────────┘
                                            │
                                            ▼
                    ┌───────────────────────────────────────────────┐
                    │ 3. Execute Verification                       │
                    │    运行单元测试或类型检查 (run_command)          │
                    └───────────────────────┬───────────────────────┘
                                            │
                                            ▼
                                ┌───────────────────────┐
                     ┌──────────┤ 4. Observation 检查    ├─────────┐
                     │          └───────────────────────┘         │
                     │ [Exit Code != 0]                           │ [Exit Code == 0]
                     │ (测试挂掉 / 编译报错)                        │ (全部通过)
                     ▼                                            ▼
┌───────────────────────────────────────────────┐  ┌─────────────────────────────┐
│ 5. Self-Correction & Reflection               │  │ 6. Goal Achieved (PASS)     │
│    分析 stderr/StackTrace，重新定位 Bug 代码    │  │    输出最终修复总结与答复    │
└───────────────────────┬───────────────────────┘  └─────────────────────────────┘
                        │
                        └────────── 重新回到 Step 2 (再次修改) ───┘
```

### 自愈过程中的消息链时序示例：

```text
【Step 1】
Thought: "我需要先运行单元测试，看看当前哪个用例挂了。"
Action: run_command({ command: "node test/math.test.js" })
Observation: "AssertionError: expected add(-2, 3) to be 1, but got -5"

【Step 2】
Thought: "测试报错显示 add 函数处理负数时符号有误。我来读取 math.ts 的具体实现。"
Action: read_file({ filePath: "src/math.ts" })
Observation: "function add(a, b) { return a - b; } // Bug: 错误地写成了减法"

【Step 3】
Thought: "定位到了 Bug，第 1 行的减号应该是加号。使用 edit_file 进行精准修补。"
Action: edit_file({ filePath: "src/math.ts", targetContent: "return a - b;", replacementContent: "return a + b;" })
Observation: "Successfully updated src/math.ts. Diff: - return a - b; + return a + b;"

【Step 4】
Thought: "代码已修改，再次运行测试进行严格验证。"
Action: run_command({ command: "node test/math.test.js" })
Observation: "✓ All 5 tests passed successfully! (Exit Code: 0)"

【Step 5】
Thought: "全部测试均已通过，任务圆满完成。"
Final Answer: "已定位并修复 math.ts 中的符号运算 Bug，经单元测试全绿验证通过！"
```

---

## 4. 本课工程实现清单

在本课中，我们将手写并落地以下模块：
1. `app/core/tools/builtins/write-file.ts`：带路径越界检查的安全文件创建器；
2. `app/core/tools/builtins/edit-file.ts`：带唯一性校验与 Diff 计算的精准代码编辑工具；
3. `app/core/tools/builtins/run-command.ts`：带高危拦截、超时熔断与缓冲区保护的受控 Shell 执行器；
4. `app/core/experiments/coding-sandbox.ts`：内置单元测试自愈、TS 编译报错修复等多个可复现的实验沙盒；
5. `app/routes/lessons.v3.tsx`：全新的 V3 交互式 Coding Agent 实验室（集成实时 Terminal、Diff 变更视图、自愈状态指示器）。


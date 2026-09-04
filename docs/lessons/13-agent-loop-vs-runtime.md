# 第十三课：V12 —— 为什么 Agent Loop 之外还需要一大坨 Runtime？

> **核心认知**：
> 在教学和玩具 Demo 中，大家都以为 Agent 就是一个极简的死循环：
> ```ts
> while (step <= maxSteps) {
>   const response = await llm.chat(messages);
>   if (response.toolCalls) {
>     const result = await tool.execute(...);
>     messages.push(result);
>   }
> }
> ```
> **但在真实的 Coding Agent（如 Claude Code 或 Pi）中，Agent Loop 只是整个 Runtime 中间的一颗微小齿轮。**
> 
> 一旦进入终端工程现实，你会立即遭遇四大灾难：
> 1. **用户中途插话 (Mid-flight Interruption)**：Agent 正在跑一个 8 步任务，在第 2 步时用户敲键盘要求“别改 auth.ts，重构 session.ts”。阻塞在 await 中的循环根本没有调度通道，强行塞进 messages 数组会导致 LLM 协议崩溃（400 Bad Request）。
> 2. **Ctrl+C 级联取消与僵尸孤儿进程 (Orphan Processes)**：用户按 Ctrl+C 紧急中止任务，裸循环直接抛出未捕获异常退出，而底层启动的 `pnpm test` / `git grep` 进程逃逸变成孤儿进程，锁死文件句柄并在后台死循环消耗 100% CPU。
> 3. **工具耗时假死与心跳失联 (Silent Zombie Tools)**：一个大型全仓搜索工具跑了 20 秒没有输出，单体循环没有 streaming chunk 管道，前端 UI 彻底卡死白屏，用户误以为死机而强行刷新。
> 4. **并发竞态与状态冲刷 (State Corruption)**：UI 渲染、实时追踪、指标上报、日志落盘同时直接访问和修改单体 `messages` 数组，造成脏读与不可预测的并发竞态。
>
> **破解之道：将单体循环彻底拆解为五大解耦齿轮——AgentCore（纯决策）、AgentRuntime（生命周期与调度）、SessionManager（树状会话与分支）、SafeToolExecutor（进程沙箱与流式守卫）与 EventStream（类型化单向事件总线）。**

---

## 1. 架构演进：从单体循环到五大齿轮解耦

### 1.1 裸 Agent Loop 的致命缺陷

在第一学期中，我们构建的 Agent 是一个封闭的 `while` 循环控制器：

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        第一学期单体 Agent Loop 模式                     │
│                                                                        │
│   用户指令 ───►  while (true)                                           │
│                    │                                                   │
│                    ├─► await llm.chatCompletion()  ◄── (网络阻塞)       │
│                    │                                                   │
│                    └─► await tool.execute()        ◄── (系统 I/O 阻塞)  │
│                                                                        │
│   ❌ 缺陷：外部无法中途插入指令，按 Ctrl+C 无法级联杀进程，UI 无法流式感知   │
└────────────────────────────────────────────────────────────────────────┘
```

在这个模型中，**LLM 调用、进程执行、状态维护、事件打印全部焊死在一起**。任何外界的动态交互都会将整个循环炸得粉碎。

### 1.2 工业级分层 Runtime 架构图

对标开源 Coding Agent 规范 **Pi (`wayfind/pi-mono`)**，我们将系统重构为控制平面与数据平面分立的五大模块：

```text
                               【外部世界】
                     (用户输入 / 终端按键 / UI 订阅 / Web API)
                                   │
                                   ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │                            AgentRuntime (Supervisor)                      │
 │                                                                           │
 │   ┌─────────────────┐       ┌────────────────────┐      ┌─────────────┐   │
 │   │  InboundQueue   │       │  AbortController   │      │ 状态机调度器 │   │
 │   │ (用户中途插话暂存) │       │ (OS 级进程取消广播)  │      │ IDLE/RUN/DRAIN│  │
 │   └────────┬────────┘       └─────────┬──────────┘      └──────┬──────┘   │
 └────────────┼──────────────────────────┼────────────────────────┼──────────┘
              │                          │                        │
       原子步安全注入               级联 Signal 传递          驱动状态机流转
              │                          │                        │
              ▼                          ▼                        ▼
 ┌────────────────────────┐    ┌────────────────────┐   ┌────────────────────┐
 │      AgentCore         │    │  SafeToolExecutor  │   │   SessionManager   │
 │                        │    │                    │   │                    │
 │ • 纯状态机 (Zero I/O)   │    │ • 子进程 PID 注册表 │   │ • 会话树 (Tree)    │
 │ • 输入: (Snapshot, Sig)│    │ • SIGTERM/SIGKILL  │   │ • Checkpoint 快照  │
 │ • 输出: StepDecision   │    │ • stdout/stderr 流 │   │ • Branch 任意分叉   │
 └────────────────────────┘    └─────────┬──────────┘   └────────────────────┘
                                         │
                                   实时 Chunk 派发
                                         │
                                         ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │                               EventStream                                 │
 │                       (单向广播类型化事件总线)                               │
 │                                                                           │
 │   ──► run:start  ──► step:start  ──► tool:chunk  ──► user:interrupt ...   │
 └───────────────────────┬───────────────────────────────┬───────────────────┘
                         │                               │
                         ▼                               ▼
                 【终端 / Web UI 渲染】             【Tracer & Telemetry】
```

---

## 2. 核心职责红黑榜：什么该进 Core？什么必须属于 Runtime？

这是每一位高级 Agent 架构师必须能够脱口而出的**系统设计分水岭**：

| 能力维度 | 属于 Agent Core？ | 属于 Agent Runtime？ | 架构权衡与设计理由 |
| :--- | :---: | :---: | :--- |
| **单步 Thought & 工具决策** | ✅ **核心** | ❌ 不管 | Core 是纯函数/纯状态机：根据当前上下文快照推导下一动向，不关心代码运行在 Linux、Docker 还是浏览器中。 |
| **Abort 取消与进程强杀** | ❌ **严禁** | ✅ **必须** | 涉及 OS 级别的进程控制（`child_process.kill("SIGKILL")`），必须由持有进程句柄的 Runtime 统一看守。 |
| **用户中途插话 (Interruption)** | ❌ 无法感知 | ✅ **InboundQueue** | LLM API 是阻塞的 HTTP 请求，用户中途敲键盘的内容必须由 Runtime 的队列暂存，并在原子步边界安全调度。 |
| **Session 树与分支分叉** | ❌ 仅见快照 | ✅ **Session 树** | Core 永远只读取当下的不可变视图；多分支分叉、时间旅行回滚属于持久化与会话层。 |
| **流式日志与 UI 事件广播** | ❌ 严禁耦合 | ✅ **EventStream** | Core 内部不应包含 `console.log` 或 WebSocket 发送逻辑，保证外部观测者挂掉时 Core 绝不受牵连。 |

---

## 3. 五大核心齿轮的落地实现

### 3.1 齿轮一：AgentCore（纯决策契约）
```ts
export interface AgentCore {
  /**
   * 纯步计算契约：
   * 输入当前只读快照和取消信号，产出 StepDecision。
   * 零文件系统读写，零网络直接发送，零状态突变。
   */
  step(snapshot: SessionSnapshot, signal: AbortSignal): Promise<StepDecision>;
}

export type StepDecision =
  | { type: "call_tools"; thought: string; toolCalls: ToolCallItem[] }
  | { type: "finish"; thought: string; finalAnswer: string }
  | { type: "ask_user"; thought: string; question: string };
```

### 3.2 齿轮二：SafeToolExecutor（进程防逃逸沙箱）
```ts
export class SafeToolExecutor {
  private activeOperations: Map<string, ActiveOperation> = new Map();

  async execute(call: ToolCallItem, options: ToolExecutionOptions): Promise<ToolExecutionResult> {
    const localAbort = new AbortController();

    // 绑定外部 Abort 信号
    if (options.signal) {
      options.signal.addEventListener("abort", () => localAbort.abort(), { once: true });
    }

    this.activeOperations.set(call.id, {
      toolCallId: call.id,
      abort: () => localAbort.abort(),
      ...
    });

    try {
      // 通过 Promise.race 实现进程执行与取消信号的毫秒级竞争
      return await Promise.race([
        this.runTool(call, options),
        this.waitForAbort(localAbort.signal)
      ]);
    } finally {
      this.activeOperations.delete(call.id);
    }
  }

  // 紧急终止时，全量杀死后台在途进程，彻底杜绝孤儿僵尸逃逸
  killAllActive(): number {
    for (const op of this.activeOperations.values()) {
      op.abort();
    }
    this.activeOperations.clear();
  }
}
```

### 3.3 齿轮三：SessionManager（树状快照与不可变分叉）
```ts
export interface SessionSnapshot {
  snapshotId: string;
  runId: string;
  branchId: string;
  stepNumber: number;
  messages: ChatMessage[];
  workspaceState: Record<string, string>; // 工作区文件哈希与状态
  toolHistory: ToolExecutionResult[];
  timestamp: number;
}
```
通过深拷贝（Deep Copy）冻结每个原子步的状态快照，Coding Agent 可以在第 4 步走偏时随时 `createBranch(snap4, "branch-fix")`，实现安全的时间旅行与分叉试错。

### 3.4 齿轮四：EventStream（单向广播总线）
```ts
export class EventStream {
  private listeners: Set<AgentEventListener> = new Set();

  emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[EventStream] 订阅端异常已被隔离，未影响执行核心:", err);
      }
    }
  }
}
```

### 3.5 齿轮五：AgentRuntime（调度总控制器）
```ts
export class AgentRuntime {
  private inboundQueue: InboundMessage[] = [];
  private currentAbortController: AbortController | null = null;

  // 中途突发插话，安全入队
  interrupt(message: string): void {
    this.inboundQueue.push({ id: nanoid(), content: message, timestamp: Date.now() });
    this.eventStream.emit({ type: "user:interrupt", message, ... });
  }

  // 紧急终止广播
  abort(reason: string): void {
    this.currentAbortController?.abort();
    this.toolExecutor.killAllActive();
    this.transitionState("aborted");
  }

  // 协调主循环：在原子步边界排空 InboundQueue
  private async runLoop(runId: string): Promise<void> {
    while (true) {
      // 1. 排空用户插话，安全接入对话上下文
      while (this.inboundQueue.length > 0) {
        const inbound = this.inboundQueue.shift()!;
        run.messages.push({ role: "user", content: `[用户中途插话指示]: ${inbound.content}` });
      }

      // 2. 生成只读快照
      const snapshot = this.sessionManager.saveSnapshot(runId, run.currentStep);

      // 3. 纯决策推导
      const decision = await this.core.step(snapshot, this.currentAbortController.signal);

      // 4. 外设安全受控执行
      if (decision.type === "call_tools") {
        for (const tool of decision.toolCalls) {
          await this.toolExecutor.execute(tool, { signal: this.currentAbortController.signal });
        }
      }
    }
  }
}
```

---

## 4. 自动化验收标准

本课内置四大自动化验收套件（可通过前端 `/lessons/v12-agent-runtime` 的“验收打卡”面板一键执行）：
1. **Abort 信号级联取消与子进程快速回收**：验证当用户按下终止时，系统在 50ms 内拦截并终止在途工具调用，活动操作集合清空，0 僵尸逃逸。
2. **中途用户插话原子化排队与事件广播**：验证突发用户指示被安全保存在 InboundQueue 中，并触发 `user:interrupt` 广播，在下一个步边界安全拼接。
3. **AgentCore 纯度检验**：验证 AgentCore 不具备任何底层文件系统（fs）或进程（exec）的直接调用，严格遵循纯状态机协议。
4. **Session 树状快照不可变性与多分支分叉**：验证从历史快照 Fork 新分支后，分支的后续读写对父历史快照绝对隔离。

---

## 5. 课后思考与下一课预告

### 思考题
> “如果用户在 Tool 执行到一半（例如已经写完了 2 个文件，准备写第 3 个文件）时按下了 Ctrl+C Abort，Runtime 应该直接回滚已经修改的文件，还是保留修改并产生一个被中断的快照？”

在 Pi 与 Claude Code 的实践中，答案通常是：**保留被中断的工作区现状，同时记录中断快照**。因为对于代码修改而言，程序员往往希望看到 Agent 到底改了什么，而不是悄无声息地全部 wipe out；但关键在于——**Session 必须明确标记该原子步未完全收敛，下一次输入时提示用户是否需要修复或继续**。

### 下一课预告
在第 14 课中，我们将正式深入研究：
**《Agent 为什么必须是 Event Driven？》**
我们将彻底告别将回调函数（callback）传入 Agent 的业余做法，全面推导事件驱动对于终端渲染、日志持久化、分布式追踪与多端协同的决定性价值！


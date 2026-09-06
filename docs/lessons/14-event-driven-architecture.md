# 第十四课：V13 —— Agent 为什么必须是 Event Driven？

> **核心认知**：
> 初学者在开发 Agent 时，最直觉的做法就是“传回调函数（Callback）”：
> ```ts
> await runAgent({
>   prompt: "重构 auth",
>   onThought: (text) => updateUI(text),
>   onToolStart: (tool) => updateUI(tool),
>   onToolChunk: (chunk) => printTerminal(chunk),
>   onToolEnd: (result) => saveLog(result),
>   onError: (err) => alert(err),
> });
> ```
> **但在真实的生产级 Coding Agent（如 Claude Code 或 Pi）中，这种将回调函数直接喂进 Agent 核心循环的做法是一场架构灾难！**
>
> 一旦进入终端与大规模并发场景，Callback 模式会引发三大系统性灾难：
> 1. **异常穿透与单点崩塌（Fault Contagion）**：`onThought` 回调里的前端 React 组件如果抛了一个渲染未捕获异常，会直接穿透调用栈把正在执行重构的 Agent 主线程砸死，造成不可挽回的文件破坏。
> 2. **I/O 阻塞拖慢模型推理（Latency Drag）**：如果 `saveLog` 回调因为磁盘写满或远程审计上报阻塞了 300ms，整个 Agent 循环就会在 `await callback()` 处挂起，导致极度昂贵的 LLM 生成与本地工具执行被严重拖慢数倍。
> 3. **观察者爆炸与代码侵入（Observer Explosion）**：今天加一个 Web UI，明天加一个 CLI 终端，后天加一个 OpenTelemetry 分布式追踪，大后天加一个审计日志……每次增加一个观察者，都必须修改核心循环的方法签名与调用点，核心逻辑被各种旁路观察代码塞满，彻底违反开闭原则（OCP）。
>
> **破解之道：将控制平面（Execution Loop）与观察平面（Observation Plane）彻底解耦——基于强类型、带时序序时标号的单向事件总线（Typed Event Bus）与事件溯源（Event Sourcing）。**
>
> **核心法则：Agent 永远不需要知道外部谁在看它；外部观察者的任何延迟或崩溃，也绝不能伤及 Agent 分毫。**

---

## 1. 架构演进：从 Callback 地狱到观察平面分立

### 1.1 Callback 模式的致命缺陷

在传统模式中，观察代码与控制代码纠缠在一起：

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        传统 Callback 紧耦合模式                        │
│                                                                        │
│   Agent 循环 ───►  callbacks.onThought()    ◄── (React 渲染报错, Agent 暴毙)│
│       │                                                                │
│       ├─────────►  await callbacks.onTool() ◄── (网络审计卡顿 500ms, 推理停滞)│
│       │                                                                │
│       └─────────►  callbacks.onFinish()     ◄── (必须改 Agent 参数签名)  │
│                                                                        │
│   ❌ 缺陷：异常穿透感染、I/O 强时钟绑定、参数签名爆炸、无法录制与时间旅行回放 │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.2 工业级分层事件架构

对标开源 Coding Agent 规范 **Pi (`wayfind/pi-mono`)** 与 **Claude Code**，我们将系统划分为**控制平面**与**观察平面**：

```text
                                 【控制平面】
                  ┌────────────────────────────────────────┐
                  │             Agent Runtime              │
                  │   • 纯状态机推理 (AgentCore)            │
                  │   • 受控工具执行 (SafeToolExecutor)    │
                  └───────────────────┬────────────────────┘
                                      │  emit(event)
                                      ▼  (只管发射，不关心谁在看)
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           TypedEventBus (强类型事件中枢)                                │
│                                                                                         │
│   ┌─────────────────────┐   ┌───────────────────────────┐   ┌───────────────────────┐   │
│   │ 严格单调递增序列号   │   │  FaultBarrier 故障沙箱隔离 │   │  FIFO 时序与因果追踪  │   │
│   │ seqId: 1, 2, 3...   │   │  (安全包裹各 Observer 回调)│   │  causalityParentId    │   │
│   └─────────────────────┘   └───────────────────────────┘   └───────────────────────┘   │
└────────────────────────────────────────┬────────────────────────────────────────────────┘
                                         │
               ┌─────────────────────────┼─────────────────────────┐
               ▼                         ▼                         ▼
   ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
   │  ConsoleTracerObserver│ │   TelemetryObserver   │ │   EventStoreObserver  │
   │                       │ │                       │ │                       │
   │ • 终端彩色阶梯缩进    │ │ • Token 消耗统计      │ │ • Event Sourcing 只追加│
   │ • Claude Code 风格 UI │ │ • 步骤延时与 TPS 画像 │ │ • 时间旅行确定性回放  │
   │ • 毫秒级耗时标记      │ │ • 工具热力与错误率    │ │ • 离线日志审计 (JSONL)│
   └───────────────────────┘ └───────────────────────┘ └───────────────────────┘
                                 【观察平面】
```

---

## 2. 核心机制深度拆解

### 2.1 工业级 `AgentEvent` 规范设计

一个业余的事件系统往往直接使用 `string` 或任意 `any` 对象：
```ts
// ❌ 业余
eventBus.emit("step", { data: 123 });
```

在工业级 Coding Agent 中，事件是唯一的真相来源（Single Source of Truth），必须具备四大元数据：
1. **全局唯一 ID (`id`)**：用于精确定位和跨分布式系统追踪。
2. **严格单调递增序列号 (`seqId`)**：绝对保序（$seq_{n+1} = seq_n + 1$），抵御异步工具并发带来的时间戳相同与乱序隐患。
3. **毫秒级物理时间戳 (`timestamp`)**：用于性能分析与耗时计算。
4. **因果父事件 ID (`causalityParentId`)**：建立事件树（例如：`tool:chunk` 和 `tool:end` 的父节点必须是其对应的 `tool:start` 事件）。

```ts
export type AgentEventType =
  | "run:start"
  | "step:start"
  | "llm:thought"
  | "tool:start"
  | "tool:chunk"
  | "tool:end"
  | "user:interrupt"
  | "runtime:state_change"
  | "runtime:abort"
  | "run:finish"
  | "observer:error";

export interface BaseAgentEvent {
  id: string;
  seqId: number;              // 严格自增
  type: AgentEventType;
  runId: string;
  timestamp: number;
  causalityParentId?: string; // 因果溯源
}
```

### 2.2 故障沙箱屏障 (FaultBarrier)

观察者处于不可信的外围环境中：
- Web 前端组件可能因网络波动或未处理的 `null` 抛出 `TypeError`。
- 第三方插件可能在回调中出现逻辑死锁或未捕获的 `Promise.reject`。

**FaultBarrier 原理**：
```ts
export class FaultBarrier {
  async executeSafe(observer: AgentObserver, event: AgentEvent): Promise<boolean> {
    try {
      const res = observer.onEvent(event);
      if (res instanceof Promise) await res;
      return true;
    } catch (err) {
      // 1. 捕获异常，记录错误上下文
      this.recordError(observer, err, event);
      // 2. 熔断保护：连续失败 5 次自动摘除该观察者
      this.checkCircuitBreaker(observer);
      // 3. 绝不向外抛出异常，主循环丝毫不受影响！
      return false;
    }
  }
}
```

### 2.3 事件溯源 (Event Sourcing) 心智模型

在传统架构中，系统状态是保存在数据库或内存中的可变对象（Mutable State）：
$$\text{State} = \text{Mutable Object}$$

在事件驱动架构中，**状态只是事件历史的投影（Projection）**：
$$\text{Current Agent State} = \sum_{i=1}^{N} \text{Event}_i$$

**巨大的工程价值**：
1. **零 Token 消耗的历史回放**：用户想看 3 天前 Agent 是怎么修改代码的，无需重新跑 LLM，直接把当时的 `EventLog` 在前端时间线上 1x/2x 播放一遍。
2. **确定性调试 (Deterministic Debugging)**：任何线上偶发 Bug，只要把用户的 EventLog 导出来在本地跑一遍投影，就能 100% 像素级复现当时的上下文与步骤。

---

## 3. 核心红黑榜：Callback 模式 vs Event-Driven 模式

| 能力维度 | 传统 Callback 模式 | 工业级 Event-Driven 模式 | 架构设计考量与收益 |
| :--- | :---: | :---: | :--- |
| **错误隔离性** | ❌ **零隔离**（一损俱损） | ✅ **沙箱阻断**（FaultBarrier） | 外部观察者异常被严格限制在旁路，Agent 主循环稳如泰山。 |
| **I/O 时钟解耦** | ❌ **强同步拖慢** | ✅ **异步派发**（Fire & Forget） | 远程审计日志即使卡死 10 秒，Agent 推理仍然保持最高速度。 |
| **观察者扩展性** | ❌ **侵入式修改** | ✅ **开闭原则**（零入侵热插拔） | 随时挂载或卸载 Console Tracer、Telemetry，无需改动 Agent 核心一行代码。 |
| **历史可复现性** | ❌ **不可复现** | ✅ **事件溯源**（Event Sourcing） | 事件流只追加存储，支持时间旅行回放与任意历史节点投影。 |
| **多端同构支持** | ❌ **混乱耦合** | ✅ **天然同构**（Pub/Sub） | Web UI、CLI 终端、IDE 插件、监控报警共享同一条事件总线。 |

---

## 4. 自动化验收标准

本课内置四大自动化验收套件（可通过前端 `/lessons/v13-event-driven` 的“验收打卡”面板一键执行）：
1. **零入侵可观测性检验 (Zero-intrusion Observer)**：验证在不修改 Agent 核心循环的前提下，动态挂载 `ConsoleTracerObserver` 与 `TelemetryObserver`，100% 完整捕获从 `run:start` 到 `run:finish` 的全生命周期。
2. **故障沙箱隔离性检验 (Fault Isolation Boundary)**：验证当第三方观察者内部抛出严重异常时，`FaultBarrier` 成功拦截，Agent 正常完成全部步数，且正常观察者不受阻断。
3. **事件溯源确定性回放检验 (Deterministic Event Sourcing Replay)**：验证完全依据事件日志还原的状态快照与实际历史运行状态 100% 严格吻合。
4. **高频 FIFO 时序与单调序号检验 (FIFO & Monotonic Sequence)**：在密集派发事件场景下，验证事件序列号严格单调递增，0 乱序、0 丢包。

---

## 5. 课后思考与下一课预告

### 思考题
> “如果一个工具输出了 50MB 的超大编译日志（例如 `npm build` 刷屏），事件总线应该直接把 50MB 打包成一个 `tool:chunk` 事件发射，还是做流式切片与背压限流？”

在 Claude Code 与 Pi 的实践中：
- 严禁单事件吞吐几十兆数据（会导致序列化卡死与内存暴涨）。
- 应该采用**流式切片 (Chunking) + 环形截断 (Ring-buffer Truncation) + 客户端背压限流**策略，只发射前 10KB + 最后 10KB 摘要，完整原始数据转存本地临时文件，事件中仅携带文件句柄引用。

### 下一课预告
在第 15 课中，我们将正式深入解构：
**《Session 为什么不是 Messages？》**
为什么简单地把聊天记录 `messages: ChatMessage[]` 存起来根本不能称之为 Coding Agent Session？为什么必须包含 Workspace 快照、分支树、Tool Execution 缓存与持久化 Runtime State？


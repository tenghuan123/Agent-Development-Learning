# 第六课：V5 —— Context Engine 与上下文膨胀防御 (Context Engineering, Dynamic Retrieval, Pruning & Compression)

> **核心认知**：很多初学者认为：“只要大模型的 Context Window 达到 1M / 2M，上下文就不是问题了。”
>
> 在工业级 Coding Agent（如 Claude Code、Cursor Agent、Devin）落地中，这完全是个误区。盲目拉长上下文会带来**“成本指数级暴增、单步首 Token 延迟（TTFT）飙升至 10s+、注意力严重稀释（Lost in the Middle）、以及单次巨型日志冲垮窗口崩溃”**三重毁灭性打击。
>
> **上下文工程（Context Engineering）的本质不是“往 Prompt 塞更多信息”，而是在【正确的时间】，把【正确的信息】，以【正确的粒度】提供给模型。**

---

## 1. 核心矛盾：为什么 Agent 会越跑越慢、越来越笨？

在第 04 课（Coding Agent）和第 05 课（Planning）中，我们实现了代码修改与长任务规划。
但当 Agent 面对一个包含数十万行代码的大型仓库，或者执行超过 15 步的长流程任务时，以下灾难性现象频繁发生：

```text
                               【上下文膨胀的三大工业级痛点】

 1. 巨型 Tool Result 冲垮窗口 (Tool Bloat & Bomb)
 ┌────────────────────────────────────────────────────────────────────────────┐
 │ Agent 执行了一次 `npm run build` 或 `read_file`，输出了 20MB / 10,000 行日志 │
 │ 💥 弊端: 单步吃满 128k 窗口，直接触发 HTTP 400 Context Exceeded 崩溃退出    │
 └────────────────────────────────────────────────────────────────────────────┘

 2. 大海捞针与注意力涣散 (Lost in the Middle)
 ┌────────────────────────────────────────────────────────────────────────────┐
 │ Attention 机制在 Prompt 头部（System/Goal）与尾部（Latest Step）最敏锐。     │
 │ 💥 弊端: 中间塞满 10 步前排查无关文件的日志，模型注意力被稀释，开始胡言乱语  │
 └────────────────────────────────────────────────────────────────────────────┘

 3. 大仓库摸黑漫游 (Blind Repo Traversing)
 ┌────────────────────────────────────────────────────────────────────────────┐
 │ Agent 不知道方法写在哪个文件里，盲目连续调用 `read_file` 遍历仓库           │
 │ 💥 弊端: 徒劳耗尽步数预算，上下文迅速膨胀，最终任务失败                   │
 └────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Context Engine 的四大核心防御支柱

为了化解物理限制，我们构建了 **Context Engine（上下文工程引擎）**，建立起四道坚不可摧的防御阵地：

```text
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                               CONTEXT ENGINE 四大防御矩阵                                  │
├─────────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│ 支柱 1: 智能截断与视窗化    │ 支柱 2: 仓库轻量级地图       │ 支柱 3: 历史动态修剪与压缩    │
│ (Smart Truncation)          │ (Repo Map & AST Outline)    │ (Pruning & Compaction)        │
├─────────────────────────────┼─────────────────────────────┼───────────────────────────────┤
│ • Head & Tail 窗口提取      │ • 基于语法提取函数/类签名   │ • 淘汰早期陈旧 Tool Output    │
│ • Error Anchor 错误调用栈强 │ • 严格控制在 1.5k~2.5k Token │ • 高水位 (75%) 自动触发多步   │
│   力保留                    │ • 赋予 Agent 全局精准导航力 │   状态快照压缩，重置基线      │
└─────────────────────────────┴─────────────────────────────┴───────────────────────────────┘
```

---

## 3. 支柱一：Smart Truncator（智能日志截断与视窗化）

很多系统的截断只是粗暴地使用 `substring(0, 5000)`。这种做法极其危险——**构建报错往往在最末尾，或者夹杂在中间，粗暴截断直接把核心 Error 砍掉了！**

### 错误锚点保留算法（Error Anchor Preservation）：
1. **头部抓取（Head Window）**：保留前 40 行，捕获构建命令、Node/编译工具版本与环境参数；
2. **尾部抓取（Tail Window）**：保留末尾 80 行，捕获退出码与最终摘要；
3. **错误锚点探测（Error Anchors Scanning）**：正则扫描包含 `TypeError`、`SyntaxError`、`FAIL`、`at Object.<anonymous>`、`TS2304` 等关键行，将其上下 2 行上下文作为特征切片嵌入；
4. **折叠标记（Folding Markers）**：中间流水日志折叠为 `... [✂️ ContextEngine: 折叠了 8,450 行流水日志，保留核心报错] ...`。

```typescript
// 核心效果对比：
// 原始日志: 10,000 行 / 5.2 MB / 85,000 Tokens ➔ 崩溃
// 截断后: 140 行 / 12 KB / 1,800 Tokens ➔ 准确保留第 9,920 行的 TypeError，瞬间定位修复
```

---

## 4. 支柱二：Repo Map（轻量级 AST 代码地图）

Agent 探索大型仓库时，**绝不能一次性读入所有源文件，也不能盲目使用向量检索 RAG（代码有强语义和符号引用关系，向量语义检索经常命中无关注释）**。

工业界（如 Aider / Claude Code）的最佳实践是 **Repo Map**：
- 在第 0 步，Runtime 快速扫描项目树；
- 提取每个文件的导出符号：`export function login()`、`export class AuthService`、`export interface User`；
- 构建紧凑的 ASCII 树状图，严格限制在 `1,500 ~ 2,500 Token` 预算内；
- 置顶注入 System Prompt，Agent 一眼就能看到全局架构，直接使用 `read_file(filePath, startLine, endLine)` 靶向读取。

```text
=== 🗺️ REPOSITORY OUTLINE MAP (AST & Structure Navigation) ===
📦 mini-claude-code
├── 📁 app
│   ├── 📁 core
│   │   ├── 📁 agent
│   │   │   ├── 📄 context-agent.ts   [export class ContextAgent]
│   │   │   └── 📄 planning-agent.ts  [export class PlanningAgent]
│   │   └── 📁 context
│   │       ├── 📄 truncator.ts       [export class SmartTruncator]
│   │       ├── 📄 repo-map.ts        [export class RepoMapGenerator]
│   │       ├── 📄 pruner.ts          [export class ContextPruner]
│   │       └── 📄 compactor.ts       [export class ContextCompactor]
│   └── 📁 routes
│       └── 📄 lessons.v5.tsx         [export default function LessonV5Page]
└── 📄 package.json                   [scripts: dev, build, start; deps: 12 packages]
==============================================================
```

---

## 5. 支柱三：Dynamic Pruning（历史观察动态修剪）

在 ReAct 循环中，第 1 步读了 500 行代码，第 2 步已经基于该代码完成了修改并运行测试。
**到了第 8 步时，第 1 步那 500 行的原始文件内容在上下文里完全是“毒药”与累赘。**

`ContextPruner` 实现策略：
1. **最近 N 步保护（Protected Sliding Window）**：最近 3 步的 Tool Output 完整保留，保证即时逻辑连贯；
2. **早期观察折叠（Stale Observation Pruning）**：将更早的 Tool Output 替换为单行紧凑摘要：
   ```text
   [✂️ ContextPruner: 历史工具输出已剪裁 (120 行 / 4,500 字符)]
   • 工具名: read_file
   • 状态摘要: 产出已在前序思考中被提取分析，为节省注意力已折叠。
   ```
3. **收益**：单次修剪可瞬间释放 60% ~ 80% 的历史 Token！

---

## 6. 支柱四：Progressive Compaction（渐进式摘要压缩）

当任务长达 20 步甚至 50 步时，即使修剪中间观察，消息轮次本身也会逼近上下文极限。

`ContextCompactor` 实现机制：
1. **高水位警戒线（High-Watermark Trigger）**：当 Context Token 超过上限的 75% 时主动拦截；
2. **生成结构化《状态快照》（State Compaction Snapshot）**：
   - 提取原始目标（Goal）；
   - 提取已验证的事实与已修改的文件（Completed Discoveries）；
   - 提取当前阶段与下一步待办（Next Steps）；
3. **基线重置（Context Re-anchoring）**：
   - 保留 System Prompt + User Goal；
   - 插入单条 Compacted State Snapshot；
   - 仅保留最近 3 轮实时对话，剔除前序数十轮冗余交互；
4. **效果**：Token 消耗曲线从“单调上升直至爆炸”，转变为**“健康的锯齿状折叠”**，让 Agent 具备无限期稳定运行的能力。

---

## 7. 第六阶段验收标准

| 评测用例 | 考察核心能力 | 预期表现 |
| :--- | :--- | :--- |
| **1. 巨型构建日志冲击 (Log Bomb)** | Smart Truncator 与错误锚点识别 | 成功化解 10,000 行日志冲击，节省 95%+ Token，准确提取末尾报错并修复 |
| **2. 大仓库代码地图导航 (Needle in Repo)** | Repo Map 签名概览定位 | 仅耗 1.5k Token 全景感知，2 步内精准定位目标文件与行号，杜绝全读漫游 |
| **3. 20 步长流程压缩演进 (Auto-Compaction)** | Pruning 剪裁与 Compaction 基线重置 | Token 稳定在 20%~40% 安全区间，呈现健康锯齿状，顺利跑完 20 步复杂任务 |

---

## 8. 工业界技术流派对比：Context Engineering 的选型哲学

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               【工业界上下文工程与检索三大流派】                                 │
├─────────────────────────┬───────────────────────────────────┬────────────────────────────────────┤
│ 流派 A: 纯向量 RAG      │ 流派 B: 巨型上下文直接堆叠        │ 流派 C: 精准 AST 地图 + 动态压缩   │
│ (传统问答知识库)        │ (Naive Long Context 1M/2M)        │ (Claude Code / Aider / Mini-Claude)│
├─────────────────────────┼───────────────────────────────────┼────────────────────────────────────┤
│ • 将代码切块嵌入向量库  │ • 不做任何修剪，每次全量回传      │ • 静态 Repo Map + AST 签名概览     │
│ • 弊端: 代码符号引用断裂│ • 弊端: 成本极其昂贵、延迟奇高    │ • 动态 Head/Tail 截断 + 观察修剪   │
│   无法理解跨文件调用栈  │   严重的 Lost in the Middle 幻觉  │ • 高水位触发状态快照压缩，极高性价比 │
└─────────────────────────┴───────────────────────────────────┴────────────────────────────────────┘
```


# 第 2 课：Context 越多越好吗？—— Sufficient Context vs Maximum Context

> **核心目标**：亲手打破“长上下文时代可以无脑全塞”的技术迷思。通过精确度量 Token 膨胀、首字延迟、调用成本与注意力衰减（Lost in the Middle），建立“充分必要上下文（Sufficient Context）”的核心工程认知。

---

## 1. 触发问题与美好假象

在上一课（第 1 课）中，我们编写了第一行上下文装配函数：
```ts
function buildContext(document: string, question: string): string {
  return `以下是产品资料：\n\n${document}\n\n问题：\n${question}`;
}
```
把产品资料拼进 Prompt 后，模型瞬间准确答出了退款期限。

绝大多数工程师在体会到这一魔力后，都会立即产生一个非常直觉、看似无懈可击的构想：
> **“既然现代大模型动辄支持 128k、1M、2M 超长上下文窗口（Long-Context Window），那我干嘛还要费劲做检索、分块或筛选？我把公司的全部 10,000 篇文档、全量 API 手册、乃至整个客服历史数据库一口气全部拼进 Prompt，让模型自己去读，岂不是一劳永逸？”**

这被称为**全量注入假设（Brute-force Ingestion Fallacy）**。

这一构想在真实生产工程中，会迅速撞上一堵残酷的物理高墙。

---

## 2. 全量注入的三重物理灾难

当你把所有文档一股脑拼进上下文时，系统会立即承受三个维度的致命打击：

### 灾难一：Token 爆炸与天价账单（Cost Inflation）
大模型的计费模型是严格基于 Token 吞吐的，且通常**按单次请求的 Input Tokens 全量计费**：
- **单篇核心文档**：~400 tokens，每次请求约 \$0.0004；
- **全量拼接 50 篇文档**：~35,000 tokens，每次请求约 \$0.035（费用**激增 87 倍**）；
- **全量拼接 200 篇文档**：~150,000 tokens，每次请求约 \$0.15。

如果你的系统每天有 100,000 次用户提问：
- 精准注入方案：每天仅需 \$40；
- 全量塞入方案：每天高达 **\$3,500 ~ \$15,000**！公司的账单会瞬间被击穿。

### 灾难二：首字延迟雪崩（TTFT & Latency Degradation）
在 Transformer 推理架构中，生成第一个回答 Token 之前，模型必须先执行 **Prefill 阶段（预填充）**：
- Prefill 阶段需要对上下文中的所有 Token 进行全量 Self-Attention 计算并构建 KV-Cache；
- 虽然现代推理引擎做了优化，但超长序列的计算量与显存访存带宽压力依然巨大；
- 随着上下文从 500 tokens 膨胀到 50,000 tokens，**首字生成时间（Time to First Token, TTFT）** 会从 300ms 剧增至 4~10 秒以上，用户体验彻底崩塌。

### 灾难三：注意力稀释与“迷失在中间”（Attention Dilution & Lost in the Middle）
这是最隐蔽、也是最致命的模型认知退化现象。
2023 年斯坦福大学与加州大学伯克利分校的研究（*Lost in the Middle: How Language Models Use Long Contexts*）揭示了关键结论：
> **大语言模型对上下文内部信息的捕捉能力呈现明显的“U 型曲线”——它最擅长利用位于 Prompt 最开头（Primacy bias）和最末尾（Recency bias）的信息，而对夹在长上下文“正中间（Middle）”的事实，召回准确率会出现灾难性的断崖下跌。**

此外，当上下文中夹杂着不同年份的废弃政策（如 `docs/2024-policy.md` 与 `docs/2026-policy.md`）或相互冲突的描述时，海量噪声会强烈干扰注意力矩阵，导致模型**“在掌握正确资料的情况下，依然输出幻觉或错误信息”**。

---

## 3. 核心度量工具：`measureContext()`

为了科学地对抗“全量塞入”，我们必须建立**量化评估上下文健康度**的物理指标。

我们在本课构建上下文信噪比度量函数：

```ts
export interface ContextMetrics {
  totalTokens: number;        // 上下文总词元数
  relevantTokens: number;     // 答题必需的充分必要词元数
  noiseTokens: number;        // 无关噪声词元数
  snr: number;                // 信噪比 Signal-to-Noise Ratio (0.0 ~ 1.0)
  estimatedCostUsd: number;   // 单次推理预估成本
  estimatedLatencyMs: number; // 预估 Prefill/首字延迟
  healthGrade: "OPTIMAL" | "DILUTED" | "SATURATED" | "DANGER";
}

export function measureContext(
  fullContext: string,
  relevantDocLengthTokens: number,
  costPer1kTokens = 0.001
): ContextMetrics {
  const totalTokens = estimateTokens(fullContext);
  const relevantTokens = Math.min(relevantDocLengthTokens, totalTokens);
  const noiseTokens = Math.max(0, totalTokens - relevantTokens);
  const snr = totalTokens > 0 ? Number((relevantTokens / totalTokens).toFixed(4)) : 0;

  // 成本与延迟估算模型
  const estimatedCostUsd = Number(((totalTokens / 1000) * costPer1kTokens).toFixed(6));
  // 基准延迟 + 每千 Token 增加的 Prefill 耗时
  const estimatedLatencyMs = Math.round(250 + (totalTokens / 1000) * 120);

  let healthGrade: ContextMetrics["healthGrade"] = "OPTIMAL";
  if (snr < 0.05 || totalTokens > 20000) healthGrade = "DANGER";
  else if (snr < 0.20 || totalTokens > 8000) healthGrade = "SATURATED";
  else if (snr < 0.60) healthGrade = "DILUTED";

  return {
    totalTokens,
    relevantTokens,
    noiseTokens,
    snr,
    estimatedCostUsd,
    estimatedLatencyMs,
    healthGrade,
  };
}
```

### 核心公式：上下文信噪比（SNR）
$$\text{SNR} = \frac{\text{Relevant Tokens (充分必要事实)}}{\text{Total Context Tokens (送入总词元)}}$$

- 当 $\text{SNR} \to 1.0$ 时：上下文信息纯度极高，模型注意力高度聚焦；
- 当 $\text{SNR} < 0.1$ 时：模型处于信息重度污染状态，极易发生注意力发散与幻觉。

---

## 4. 三组对照实验设计

我们在基准语料库上对同一道黄金测试题进行三组对照验证：

| 实验组别 | 注入的上下文构成 | 预估 Token | 信噪比 SNR | 核心观察指标 |
| :--- | :--- | :--- | :--- | :--- |
| **Tier A: 精准充分 (Sufficient)** | 仅注入答题必需的 1 篇目标文档 (`products/alpha.md`) | ~400 T | **~95%** | 延迟极低、成本最低、回答 100% 精确 |
| **Tier B: 适度稀释 (Diluted)** | 目标文档 + 5 篇无关产品及文档 (Beta, Gamma, Shipping, Pricing) | ~3,500 T | **~11%** | 延迟上升、成本激增 8 倍、可能引用无关条款 |
| **Tier C: 海量饱和与迷失 (Saturated)** | 目标文档**深埋在中间（Lost in the Middle）**，前后夹杂全部语料、历史废弃版本政策 | ~10,000+ T | **< 3%** | 首字显著卡顿、成本激增 25x+、产生事实混淆 |

### 关键控制变量：位置移动测试（Position Test）
在 Tier C 实验中，我们可以人为切换目标文档在 Prompt 中的摆放位置：
1. **Top（首部）**：即使有噪声，模型凭借首因效应（Primacy bias）仍有较高概率答对；
2. **Bottom（末尾）**：模型凭借近因效应（Recency bias）也能较快捕获；
3. **Middle（正中间）**：**注意力急剧坠入低谷**。当且仅当把文档放于海量背景材料中间时，模型极容易出现漏读关键条件、引用了前后的错误版本（如废弃的 2024 年旧版规则）。

---

## 5. 核心验收标准与认知跃迁

完成本课实验后，你必须深刻理解以下两条铁律：

### 铁律一：不是 Maximum Context，而是 Sufficient Context
> **Context Engineering 的艺术，从来不是“比谁的上下文窗口塞得更大”，而是“在保证提供充分必要事实的前提下，用最少的 Token 达到最高的确定性”。**

上下文每多塞入 1 个无效 Token，都在以牺牲推理延迟、消耗真金白银、并承担注意力被稀释的风险为代价。

### 铁律二：Context 具有衰减性与脆弱性
> **上下文不是一个无限容量的无损硬盘，而是一个具有注意力和衰减特性的动态认知场。**
> 噪声越稠密、距离提问点越遥远、信噪比越低，模型在这场推理中发生幻觉的概率就呈非线性暴增。

---

## 6. 引出下一课的问题

经过第 2 课的洗礼，我们终于明白：**绝对不能无脑把所有文档都喂给模型！**

但立刻引出了下一个不可回避的工程难题：
> **如果我的系统真实拥有 10,000 篇知识库文档，既然不能全塞，我又怎么能在用户提问的瞬间，精准知道“哪一篇文档才是那篇 Sufficient Context”？**

靠人肉手工挑选显然无法自动化。

下一课（第 3 课），我们将正式迈入系统检索的门槛，去亲手实现第一个最朴素、最纯粹的搜索机制——**文本关键词搜索（Grep / Lexical Search）**！

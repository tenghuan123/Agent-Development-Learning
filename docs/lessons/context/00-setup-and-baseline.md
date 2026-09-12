# 第 0 课：建立实验环境与基准测试台

> **核心目标**：建立整套 Context Engineering 18 课共用的标准私有语料库（Ground Truth Corpus）与最小 Agent 运行基线，严禁在第一天引入高级框架。

---

## 1. 为什么第 0 课不讲任何 Context 概念？

许多人在学习 RAG、Embedding、Vector DB、Agentic Search 或 Memory 时，最大的误区是：
> “还没看到模型在什么场景下会失败，就先调包引入了 Pinecone、LangChain 或 LlamaIndex。”

这样学习的结果是：你背下了很多名词和 API，但面对真实业务时，依然不知道**为什么这里要用 Grep 而不是 Vector？为什么这里加了 Rerank 准确率反而下降？为什么 Context 越多模型反而越容易幻觉？**

因此，第 0 课唯一的任务是：
1. **构建一个最小的单次生成 Agent（Minimal Baseline）**：
   ```ts
   async function run(input: string) {
     return model.generate({
       system: "你是一个专业的知识助手",
       messages: [{ role: "user", content: input }]
     });
   }
   ```
2. **准备一套模型本身不可能知道的私有数据集（Ground Truth Corpus）**：
   ```text
   data/context-benchmark/
   ├── products/
   │   ├── alpha.md         # Alpha 企业级分析套件 (退款期限 30 天)
   │   ├── beta.md          # Beta 开发者审查工具 (退款期限 14 天，与 Gamma 深度集成)
   │   └── gamma.md         # Gamma 向量云存储 (按量算力，不支持退款)
   ├── docs/
   │   ├── refund-policy.md # 通用售后规则 (7天无理由退款)
   │   ├── pricing.md       # 价格体系与订阅方案
   │   └── shipping.md      # 硬件狗物流配送条款
   └── benchmark-qa.json    # 黄金评测基准题库
   ```

后面的 **所有 18 课实验** 都将在同一套数据和同一组标准问题上进行纵向迭代。

---

## 2. 演进路线图：从无到有的 18 步推导

```text
LLM (第 0 课：最小基线，无外部知识)
 ↓
Prompt (第 1 课：模型不知私有事实 ➔ 手动注入 Document)
 ↓
Context (第 2 课：全塞爆窗 ➔ Sufficient Context 而非 Maximum Context)
 ↓
Retrieval (第 3 课：万级文档读不完 ➔ 引入 Search ➔ 先用最简单的 Grep)
 ↓
Semantic Search (第 4 课：同义不同词 ➔ 引入 Embedding 向量相似度)
 ↓
Hybrid Retrieval (第 5~6 课：语义无法搜精确错误码 ➔ 关键词 + 语义 RRF 融合)
 ↓
Reranking (第 7 课：海量候选谁最关键？召回 Recall vs 精排 Precision)
 ↓
Chunking (第 8~9 课：文档过大 ➔ 切分碎片 ➔ 上下文断裂与元数据包裹)
 ↓
Agentic Retrieval (第 10 课：多跳复杂推理 ➔ Agent 自主多轮检索)
 ↓
Context Management (第 11~13 课：防过度检索 Budget ➔ 装配 Assembly ➔ 压缩 Compaction)
 ↓
Memory (第 14~15 课：当前上下文 vs 跨会话记忆 ➔ 冲突/过期/撤销治理)
 ↓
Evaluation & Security (第 16~18 课：可信度 ➔ 提示词注入防御 ➔ 科学量化评测体系)
```

---

## 3. 本课核心守恒律

> **铁律：前一课严禁提前使用后一课的能力。**
> - 第 0 课只准观察 LLM 原生回答能力与语料库结构；
> - 第 1 课只准写 `buildContext()`；
> - 第 3 课只准用纯文本 grep；
> - 第 4 课才准用 embedding 向量；
> - 第 10 课之前 retrieval 必须是单次的；
> - 第 13 课之前不许做 compaction。

亲手撞到每一个技术产生的原因，才是掌握 Context Engineering 的唯一正道。

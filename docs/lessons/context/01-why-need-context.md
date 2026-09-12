# 第 1 课：模型不知道答案怎么办？—— 上下文的第一性原理

> **核心目标**：证明大语言模型的知识是不完整的。亲手编写最原始的 `buildContext()`，验证“在推理期向模型喂入资料”与“模型学习参数”的本质区别。

---

## 1. 触发问题

向裸模型提问：
> “Alpha 产品的退款期限是多少天？”

因为 Alpha 是我们系统的专属私有产品，训练集里完全不存在这条数据。
此时模型会出现两种典型行为：
1. **诚实承认**：“抱歉，我没有关于 Alpha 产品的具体退款政策信息。”
2. **编造幻觉**：“一般软件产品的退款期限为 7 天或 14 天……”（完全错误，因为 Alpha 的专属退款期是 30 天）。

于是暴露出整个 AI 应用开发的第一道不可逾越的鸿沟：
> **LLM 的静态参数知识是严重不完整的，且无法实时获知企业私有领域事实。**

---

## 2. 实验：无 Context vs 有 Context

### 第一次实验：裸问模型 (Zero Context)
```ts
messages = [
  { role: "user", content: "Alpha 产品退款期限是多少？" }
]
```
结果：回答失败或胡乱捏造。

### 第二次实验：注入参考资料 (Context Injection)
```ts
const document = readFileSync("products/alpha.md", "utf-8");

messages = [
  {
    role: "user",
    content: `
以下是产品私有参考文档资料：

${document}

请回答问题：
Alpha 产品退款期限是多少？
    `
  }
]
```
结果：模型准确无误地回答出 **30 天**，并能列举出企业尊享保障条款。

---

## 3. 本课产出函数：`buildContext()`

```ts
export function buildContext(document: string, question: string): string {
  return `以下是产品资料：\n\n${document}\n\n问题：\n${question}`;
}
```

---

## 4. 核心验收标准

你必须能够深刻解释：
> **模型并没有“学习”或“记住”这个文档。**

它所做的仅仅是：
> **在这一次 Forward-Pass 推理的瞬间，Context Window 里的注意力机制（Self-Attention）看到了这串 Token。**
> 会话一旦结束，模型立刻回归“什么都不知道”的状态。

这就是 **Context 最原始、最本真的物理形态**。

---

## 5. 引出下一课的问题

既然把文档拼进 Prompt 就能解决问题：
> **那我把公司的 10,000 个 Markdown 文档全部一股脑拼进 Prompt 不就行了吗？**

下一课，我们将亲手把所有文档塞进去，观察**注意力稀释、Token 爆炸与天价账单**！

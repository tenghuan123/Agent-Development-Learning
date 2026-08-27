# 第一课：LLM 的底层机制、无状态本质与结构化输出

> **核心认知**：LLM 不是一个拥有“记忆”的黑盒程序，而是一个纯粹根据输入 Context Window 预测下一个 Token 的概率模型。所谓的“记忆”和“结构化交互”，全靠宿主 Runtime 的工程化封装。

---

## 1. 核心矛盾：模型为什么“记不住”？

在开发 AI 聊天应用时，最常见的直觉误区是：
> “我给模型发了一条消息，它在服务端创建了一个会话并记住了我。”

**这是彻底的误解。**

### 实验对比：
- **请求 A**：仅发送 `[{ role: "user", content: "我叫小明" }]`
- **请求 B**：仅发送 `[{ role: "user", content: "我叫什么名字？" }]`
  - **结果**：模型完全不知道你是谁。
- **请求 C**：发送完整上下文：
  ```json
  [
    { "role": "user", "content": "我叫小明" },
    { "role": "assistant", "content": "你好小明！" },
    { "role": "user", "content": "我叫什么名字？" }
  ]
  ```
  - **结果**：模型准确回答“你叫小明”。

### 核心结论：
$$\text{Memory} \neq \text{LLM 内置记忆}$$
$$\text{Memory} = \text{Runtime 每次将历史消息数组重新喂给 Context Window}$$

---

## 2. 核心痛点：Prompt 为什么不能作为程序接口？

如果我们希望让大模型分析一个前端项目并返回 JSON：

```text
提示词：请分析 package.json，并严格返回 JSON 格式：{"framework": "", "version": ""}
```

大模型可能返回：
```text
好的！分析结果如下：
```json
{
  "framework": "React",
  "version": "19.0.0"
}
```
希望对你有帮助！
```

### 问题所在：
1. **自然语言污染**：开头的“好的！分析结果如下”会导致 `JSON.parse()` 直接抛出语法异常。
2. **字段不可控**：模型可能会将 `framework` 写成 `frameworkName`，或者漏掉某些必填字段。
3. **类型不确定**：版本号可能是字符串 `"19.0.0"`，也可能是数字或数组。

---

## 3. 解决方案：Schema 强类型约束 (Structured Output)

现代 LLM API 提供了底层机制（如 OpenAI `response_format: { type: "json_schema" }`），允许开发者提供严格的 **JSON Schema**。

在 Mini Claude Code 中，我们使用 **TypeScript + Zod** 定义契约：

```ts
import { z } from "zod";

export const PackageAnalysisSchema = z.object({
  framework: z.string().describe("核心前端框架名称，如 React / Vue"),
  version: z.string().describe("框架主版本号"),
  isTypeScript: z.boolean().describe("项目是否使用了 TypeScript"),
  dependenciesCount: z.number().describe("生产依赖包的总数量"),
});

export type PackageAnalysis = z.infer<typeof PackageAnalysisSchema>;
```

### Runtime 处理链路：
1. **Zod 转换**：将 TypeScript Zod 对象转换为标准 JSON Schema。
2. **API 注入**：将 JSON Schema 作为 API 约束或严格 Prompt 喂给模型。
3. **输出解析**：Runtime 剥离任何可能存在的 Markdown 围栏（```json ... ```）。
4. **安全校验**：使用 `schema.safeParse(json)` 进行二次强类型拦截，确保 100% 符合类型定义。

---

## 4. 第一阶段总结与思考题

1. **为什么上下文窗口（Context Window）越长，推理成本越高、延迟越长？**
   - 每次对话都需要将全部历史 Token 重新经过 Transformer 层的注意力计算（Attention Matrix 复杂度为 $O(N^2)$ 或借助 KV Cache 为 $O(N)$）。
2. **为什么单靠“聊天”无法完成自主软件工程任务？**
   - 因为模型没有手脚、看不到本地磁盘、无法运行终端命令。这就引出了我们的第二课：**Tool Calling（工具调用）**。


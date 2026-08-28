# 通用大模型连接与 API 配置改造总结

本次改造去除了所有特定服务商（如 OpenRouter）的硬编码绑定与环境变量前缀，实现了**通用大模型连接配置机制**，全面支持直接连接**智谱清言 GLM 系列（GLM-4-Flash / GLM-4-Plus 等）**、**DeepSeek**、**OpenAI**、**硅基流动**以及任意兼容 OpenAI 接口规范的模型服务。

---

## 1. 核心改造内容

### 1.1 环境变量通用化（无厂商前缀）
- **修改文件**: `.env`, `.env.example`, `README.md`
- **通用命名**:
  ```env
  # 1. API 密钥 (必填)
  LLM_API_KEY=你的API密钥

  # 2. 接口调用基地址 Base URL (默认: 智谱 GLM)
  LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4

  # 3. 默认调用的模型名称
  LLM_MODEL=glm-4-flash
  ```
- **向下兼容**: 代码中仍然支持回退读取原有的 `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `DEFAULT_MODEL`, `OPENROUTER_BASE_URL`。

---

### 1.2 核心运行时改造与基地址透传
- **`app/core/llm/client.ts`**:
  - `LLMClient` 构造函数统一优先读取 `config.apiKey || process.env.LLM_API_KEY` 与 `config.baseURL || process.env.LLM_BASE_URL` 与 `config.defaultModel || process.env.LLM_MODEL`。
- **`app/core/agent/types.ts` & `agent-loop.ts` & `planning-agent.ts`**:
  - `AgentLoopConfig` 和 `PlanningAgentConfig` 增加 `baseURL?: string` 支持，并在创建 `LLMClient` 时透传。
- **后端 API 路由**:
  - `app/routes/api.chat.ts`, `api.agent.ts`, `api.planning.ts`, `api.experiment.ts`: 统一接收客户端传入的 `baseURL` 参数并透传给执行引擎。
  - `app/routes/api.config.ts`: 返回通用配置与更新后的主流模型列表。

---

### 1.3 前端页头（Header）与全功能连接配置弹窗
- **修改文件**: `app/components/Header.tsx`
- **功能特性**:
  1. **一键服务商预设 (Quick Presets)**:
     - ⚡ **智谱 GLM**: Base URL `https://open.bigmodel.cn/api/paas/v4`，默认模型 `glm-4-flash` / `glm-4-plus`
     - 🌊 **DeepSeek**: Base URL `https://api.deepseek.com/v1`，默认模型 `deepseek-chat`
     - 🤖 **OpenAI**: Base URL `https://api.openai.com/v1`，默认模型 `gpt-4o`
     - 🔀 **OpenRouter**: Base URL `https://openrouter.ai/api/v1`，默认模型 `anthropic/claude-3.5-sonnet`
     - 🚀 **硅基流动**: Base URL `https://api.siliconflow.cn/v1`，默认模型 `deepseek-ai/DeepSeek-V3`
  2. **完全可自定义输入**:
     - 支持直接输入任何中转地址/自定义 Base URL；
     - 密钥输入支持明文/密文切换；
     - 支持输入任意自定义 Model ID。
  3. **持久化与联动**:
     - 本地存储键统一为 `MINI_CLAUDE_API_KEY`, `MINI_CLAUDE_BASE_URL`, `MINI_CLAUDE_MODEL`（自动平滑迁移旧 Key）。
     - 保存后各课程（V0 ~ V4）所有的 Chat、Tool Calling、Agent Loop、Coding Agent 与 Planning API 请求均会携带最新的 API Key、Base URL 与 Model。

---

## 2. 验证结果
- `pnpm typecheck`: **0 错误通过**
- `pnpm build`: **生产包构建成功 (SSR + Client)**

---

## 3. 使用指引

1. **方式一：通过界面直接配置**
   - 点击顶部导航栏右上角的 **“⚙️ 配置 API Key / LLM 连接”** 按钮或在模型下拉菜单中点击 **“⚙️ + 自定义模型 / 连接配置...”**；
   - 点击 **“⚡ 智谱 GLM”** 按钮一键填充 Base URL，填入你的智谱 API Key 并点击保存。

2. **方式二：通过根目录 `.env` 配置文件**
   ```env
   LLM_API_KEY=your_zhipu_api_key
   LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
   LLM_MODEL=glm-4-flash
   ```
   保存后重启服务即可生效。


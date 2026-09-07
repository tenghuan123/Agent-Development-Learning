# Mini Claude Code - AI Agent 核心开发规则与规范

本文件是当前项目的核心编码准则，在编写、修改代码或重构时必须严格遵守：

## 1. 架构抽象原则
- **稳定领域逻辑，充分抽象**：`app/core/events/`、`app/core/agent/` 等底层核心基础设施必须具备强类型契约、错误隔离沙箱（Fault Barrier）与高内聚，杜绝与 UI 直接耦合。
- **不稳定易变逻辑，就地直接写**：`app/routes/lessons.*` 里的某一课实验、可视化 demo 等演示代码**严禁过早抽象**，就地直接写，避免过度工程化。

## 2. 严禁滥用 `useEffect`
- ❌ **严禁用 `useEffect` 派生/计算状态**：必须在 render 阶段直接计算或使用 `useMemo`。
- ❌ **严禁用 `useEffect` 监听 props 变化去 `setState` 同步子组件**。
- ❌ **严禁在 `useEffect` 里裸写 `fetch` + `useState`** 进行数据请求。
-  **唯一合法场景**：同步真正的外部非 React 系统（DOM 监听、Canvas/Web Audio、定时器），且**必须严格成对提供 cleanup 清理函数**。

## 3. 数据获取分层规范
- **服务端 / 页面首屏预加载**：一律使用 React Router 的 `loader`，客户端通过 `useLoaderData` 消费，杜绝首屏网络瀑布流与空白。
- **客户端异步交互 / 轮询缓存**：使用客户端数据缓存库（如 React Query / SWR）管理缓存与竞态，不手动维护 loading/error 状态机。

## 4. 状态流转与组件生命周期重置
- **父子共享数据**：坚决进行**状态提升（Lifting State Up）**，子组件作为纯受控组件接收 props。
- **组件状态重置（Reset via Key）**：当切换任务/运行实例（如 `activeRunId`）需要重置子面板所有内部状态时，**严禁在子组件写重置 effect**，必须在父组件直接绑定 key：
  ```tsx
  <ReplayStudioTab key={activeRunId} runId={activeRunId} />
  ```
  通过卸载旧实例重新挂载新实例，天然安全地完成状态归零。
- **高频状态就近下沉（Colocation）**：播放进度、快速计数器等高频更新状态必须隔离在叶子组件内部，严禁堆在千行父页面触发全量重渲染。

## 5. 代码质量与工程规范
- 严格遵循 `unused-imports`，提交前必须执行 `pnpm lint:fix` 清理未引用代码。
- 接口强制要求的未用参数必须以 `_` 开头显式忽略。
- 验证改动指令：
  - `pnpm lint:fix`
  - `pnpm typecheck`

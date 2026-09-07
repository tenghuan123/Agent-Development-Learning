---
name: project-code-standards
description: >-
  Code standards, architecture principles, and review guidelines for the mini-claude-code project.
  Use this skill when reviewing code, refactoring components, implementing React features,
  handling data fetching (loaders / react-query), or ensuring compliance with state colocation,
  useEffect hygiene, and key-based component resets.
---

# Mini Claude Code 项目代码规范与最佳实践

本规范总结了 `mini-claude-code` 项目的核心架构理念、React 开发规范与静态分析准则。
在进行代码编写、架构设计、重构或 Code Review 时，必须严格遵循以下原则。

---

## 1. 架构抽象原则（Abstraction vs Directness）

- **稳定的领域逻辑，充分抽象（Abstract Stable Primitives）**：
  - 范围：`app/core/events/`（事件总线、故障隔离沙箱、事件溯源）、`app/core/agent/`（核心运行循环、工具调度机制）、强类型协议定义。
  - 要求：
    - 高内聚、零 UI 耦合、清晰契约接口。
    - 严格错误隔离（Fault Barrier / 沙箱化），严禁外部插件/观察者异常反噬核心运行循环。
    - 完整的自动化单元测试与验证覆盖。
- **不稳定的易变逻辑，就地直接写（Write Volatile Logic Directly）**：
  - 范围：`app/routes/lessons.*` 里的某一课演示、实验场景展示、临时原型探索、一次性展示图表。
  - 要求：
    - **严禁过早抽象（Avoid Premature Abstraction）**，不要草率封装所谓的“通用可视化组件”或“通用教学 Hook”。
    - 允许直接就地编写，快速验证想法；待模式成熟、形态稳定后，再收敛重构到核心层。

---

## 2. 严格的 `useEffect` 卫生原则（Stop Abusing `useEffect`）

牢记 React 官方指导思想：*You Might Not Need an Effect*。绝大多数 bug 均源于对 `useEffect` 的滥用。

### ❌ 严禁反模式
1. **禁止将 `useEffect` 当作“计算器”或“状态同步器”**：
   - 错误：`useEffect(() => { setFullName(first + ' ' + last); }, [first, last]);`
   - 正确：直接在 render 阶段计算 `const fullName = `${first} ${last}`;`，昂贵计算使用 `useMemo`。
2. **禁止在子组件监听 props 同步内部 state**：
   - 错误：`useEffect(() => { setVal(props.val); }, [props.val]);`
   - 正确：采用受控组件（状态提升），或通过 `key` 属性重置（见第 4 节）。
3. **禁止在 `useEffect` 里手动裸写 `fetch` + `useState`**：
   - 错误：手动维护 `isLoading`、`data`、`error`，容易产生竞态条件（Race Conditions）与内存泄漏。
   - 正确：统一遵循数据获取分层（见第 3 节）。
4. **禁止隐瞒依赖或强行删除依赖**：
   - 严禁为了逃避循环渲染而手动从依赖数组中扣除函数或变量。
   - 如果函数只在 effect 内使用，必须将函数声明移入 effect 内部；如果跨处使用，必须用 `useCallback` 稳定引用。

###  合法使用场景
`useEffect` **仅用于同步真实的外部非 React 系统**：
- 注册全局 DOM 键盘 / 窗口尺寸事件监听；
- 初始化底层非 React 实例（Canvas、Web Audio API、第三方 SDK）；
- 启动/同步外部计时器。
- **铁律**：所有启动了订阅、计时器或监听的 effect，**必须返回严格对称的 cleanup 清理函数**。

---

## 3. 数据获取分层规范（Data Fetching Tiering）

本项目采用三层数据获取体系，坚决消除客户端数据瀑布流：

1. **第一层：路由首屏与关键数据 -> React Router `loader`**：
   - 服务端预加载，首屏 SSR 秒开。
   - 路由组件使用 `const data = useLoaderData<typeof loader>();` 直接消费，天然无闪烁、无 loading 空档。
2. **第二层：客户端动态交互与异步轮询 -> React Query (TanStack Query) / SWR**：
   - 针对用户交互触发的延迟加载、局部轮询刷新、回放数据抓取。
   - 依靠 React Query 实现自动重试、去重、缓存共享、过期时间控制与竞态处理。
3. **第三层：本地私有且无服务端持久化的交互状态 -> 局部 `useState` / `useReducer`**：
   - 仅限折叠菜单开关、模态框可见性等纯前端瞬时状态。

---

## 4. 父子组件数据同步与重置规范（State Flow & Key Reset）

1. **父子共享数据 -> 状态提升（Lifting State Up）**：
   - 如果多个组件需要消费同一数据，状态必须提升至最近的公共父组件，子组件设计为纯净的受控组件（Controlled Component）。
2. **重置子组件内部状态 -> 利用 `key` 强制重新挂载（Reset via Key）**：
   - 当任务 ID、用户 ID 或场景发生切换，子视图（如回放面板、表单编辑器）需要从初始状态重新开始时：
   - ❌ 绝不要在子组件写：
     ```tsx
     useEffect(() => {
       resetAllInternalState();
     }, [activeRunId]);
     ```
   -  必须在父组件声明：
     ```tsx
     <ReplayStudioTab key={activeRunId} runId={activeRunId} />
     ```
   - **原理**：`key` 发生变化时，React 会自动卸载（unmount）旧组件实例（触发 cleanup 清理计时器/事件），并挂载全新的实例，所有内部 state 自然回到初始默认值，彻底杜绝状态残留 Bug。
3. **高频重渲染状态就近下沉（Colocation）**：
   - 像播放进度条、音频波形、单步计数器等高频更新的状态，必须封装在独立的叶子子组件内，严禁存放在千行父页面导致全量重渲染。

---

## 5. 代码纯洁性与静态分析（Clean Code & Tooling）

1. **无死导入（Zero Dead Imports）**：
   - 全面启用 `eslint-plugin-unused-imports`。
   - 提交前必须运行 `pnpm lint:fix`，保证仓库内无任何无用的 import。
2. **显式占位参数**：
   - 接口契约必须声明但业务不需要的参数，统一加 `_` 前缀（如 `(_event) => ...`），明确意图。
3. **杜绝无效初始赋值**：
   - 变量声明即被条件分支完全覆盖的场景，避免多余的初始值赋值（符合 `no-useless-assignment` 规则）。

---

## 6. 审查与重构检查清单（SOP）

当你对一段代码进行审查或重构时，依次执行以下检查：

- [ ] **是否过早抽象？** 检查易变演示代码是否被强行封装成了过度复杂的框架。
- [ ] **是否存在 `useEffect` 乱用？** 搜索所有的 `useEffect`，检查是否有用来计算派生状态、同步 props 或裸写 fetch 的情况。
- [ ] **数据获取方式是否合规？** 页面级走 loader，动态交互走客户端查询库，不写手写 loading 状态机。
- [ ] **重置状态是否用了 `key`？** 检查是否有根据 prop 变化清空 state 的 effect，如果有，重构成父组件加 `key`。
- [ ] **高频状态是否下沉？** 检查千行大单体中是否有独立业务 Tab 的专属状态被错误提升到了页面根节点。
- [ ] **ESLint 与 TypeScript 验证**：
  ```bash
  pnpm lint:fix
  pnpm typecheck
  ```


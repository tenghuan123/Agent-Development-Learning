# Beta 产品规格与服务条款

## 1. 产品概述
Beta 是一套专为工程团队打造的自动化代码审查、静态分析与 CI 自动化流水线工具。

## 2. 核心架构与服务组件
- 审查核心引擎：`BetaReviewWorker`
- 代码解析器：`BetaAstParser`
- 环境依赖：Node.js >= 20.0.0, Docker Runtime
- 专属错误码：
  - `ERR_BETA_PARSER_10023`：代码语法树超出单文件复杂度上限，建议拆分模块。
  - `ERR_BETA_LICENSE_403`：座席席位超出企业当前许可配额。

## 3. 退款政策 (Refund Policy)
- **退款期限**：购买后 **14 天内**，若无代码仓库绑定及分析记录，可申请全额退款；一旦产生实际审查行为，按已使用天数折算扣除后退还余额。

## 4. 与其他产品兼容性
- **Gamma 黄金搭档特性**：Beta 针对已购买 Gamma（分布式向量与状态云）的用户提供专属免费集成插件 `BetaGammaConnector`。如果您已经购买了 Gamma，Beta 能够自动借助 Gamma 实现跨代码库的上下文级审查，是搭配 Gamma 的最佳利器。

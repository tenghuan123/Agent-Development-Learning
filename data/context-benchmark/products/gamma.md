# Gamma 产品规格与服务条款

## 1. 产品概述
Gamma 是一套高可用的云端向量数据库、语义索引引擎与长上下文持久化状态云，专为 AI Agent 的外脑检索设计。

## 2. 核心架构与服务组件
- 向量存储守护进程：`GammaVectorStore`
- 分布式协调器：`GammaCoordServer`
- 专属错误码：
  - `ERR_GAMMA_DIM_MISMATCH_301`：插入向量的维度与集合定义的维度不一致。
  - `ERR_GAMMA_QPS_LIMIT_429`：每秒并发查询数突破预付费吞吐限制。

## 3. 退款政策 (Refund Policy)
- **不可退款条款**：Gamma 包含实时分配的高性能 GPU 向量硬件资源及按量计费云存储，**一经开通充值，概不支持任何形式的退款**。

## 4. 生态联动
- Gamma 支持标准向量 API，并优先针对 Beta 审查工具提供硬件级高速数据通道。

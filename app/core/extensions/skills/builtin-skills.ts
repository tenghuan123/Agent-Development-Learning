import type { SkillDefinition } from "../types";

/**
 * 内置企业级 Skills 规范
 * 对标 Pi 的 Skill 机制：Skill 是轻量级、声明式的能力包，通过按需加载提升模型注意力信噪比
 */
export const BUILTIN_SKILLS: SkillDefinition[] = [
  {
    id: "skill-refactor-guidelines",
    name: "高并发无损重构专家规范 (Zero-Downtime Refactor)",
    description: "指导 Agent 遵循两阶段迁移、单次只改单一模块、严格编写单元测试的工程纪律",
    version: "1.1.0",
    category: "refactor",
    enabled: true,
    tags: ["refactor", "safety", "test-driven"],
    triggerKeywords: ["重构", "refactor", "迁移", "migrate"],
    requiredTools: ["read", "write", "edit", "bash"],
    promptTemplate: `### [Skill: 高并发无损重构专家规范]
1. **两阶段演进**：先新增向后兼容的实现，验证通过后再废弃旧逻辑，严禁一次性破坏性替换。
2. **测试先行**：修改任何核心函数前，必须首先运行或补全现有测试套件。
3. **原子提交**：每一个文件变更保持逻辑高内聚，杜绝跨 5 个以上文件的无关格式化。`,
  },
  {
    id: "skill-security-audit",
    name: "生产安全与合规审计规范 (Security Compliance Audit)",
    description: "指导 Agent 识别代码中的 SQL/NoSQL 注入、硬编码密钥、越权漏洞与并发死锁隐患",
    version: "2.0.0",
    category: "security",
    enabled: true,
    tags: ["security", "audit", "compliance", "cve"],
    triggerKeywords: ["安全", "audit", "漏洞", "auth", "permission"],
    requiredTools: ["read", "bash"],
    promptTemplate: `### [Skill: 生产安全与合规审计规范]
1. **凭证审查**：严禁将任何明文密码、私钥、Token 硬编码在代码仓库或注释中。
2. **输入防御**：所有来自客户端或第三方的参数均视为不可信数据，必须经过 Zod 强类型校验。
3. **并发锁机制**：跨多副本操作必须采用分布式租约锁，并在 finally 块中释放。`,
  },
  {
    id: "skill-api-contract-sync",
    name: "微服务契约对齐专家 (Microservice Contract Sync)",
    description: "协同企业 API 契约库，自动校验前后端接口字段命名与强类型一致性",
    version: "1.0.2",
    category: "architecture",
    enabled: true,
    tags: ["api", "grpc", "contract", "schema"],
    triggerKeywords: ["接口", "api", "proto", "contract", "schema"],
    requiredTools: ["search_api_contract", "read", "edit"],
    promptTemplate: `### [Skill: 微服务契约对齐专家]
1. **协议源单一性**：所有跨服务通信必须以 Proto/OpenAPI Schema 为唯一真实可信源。
2. **字段破坏性检查**：禁止直接删除或重命名既有字段，必须保留并标记 deprecated。`,
  },
];

import type {
  PiExtension,
  ExtensionApi,
  ContextContribution,
} from "../types";

/**
 * 经典企业级上下文扩展 (Company Context Extension)
 * 为 Coding Agent 注入公司内部产品需求库 (PRD)、技术决策库 (ADR) 与微服务 API 契约
 * 零侵入 Core，完全基于 Pi Extension API 装配
 */
export const CompanyContextExtension: PiExtension = {
  id: "company-context-extension",
  name: "企业私有上下文增强扩展 (Enterprise Context)",
  version: "1.2.0",
  description: "提供内部产品 PRD、技术架构决策 (ADR) 与微服务 API 强类型契约无缝检索，注入动态上下文约束",
  category: "enterprise_context",
  enabled: true,
  author: "Infra Platform Team",
  setup: (api: ExtensionApi) => {
    // 1. 注册公司专属工具：搜索产品需求 PRD
    api.addTool({
      name: "search_product_spec",
      description: "在公司内部知识库 (Confluence/Feishu) 中检索产品需求文档 (PRD) 与业务规则",
      parameters: {
        query: {
          type: "string",
          description: "产品需求关键词或模块名称，如 'token_ttl', '支付回调重试', '权限分级'",
          required: true,
        },
        module: {
          type: "string",
          description: "所属业务域，如 'auth', 'billing', 'workflow'",
          required: false,
        },
      },
      execute: async (args) => {
        const { query, module } = args;
        api.log("info", `Searching product specs for query='${query}', module='${module || "all"}'`);

        // 模拟企业 PRD 检索库
        const mockSpecs = [
          {
            title: "PRD-2026-AUTH-03: JWT 续期与多端互踢规范",
            module: "auth",
            content: "JWT Access Token 有效期固定为 15 分钟；Refresh Token 为 7 天且每次刷新必须单次轮转 (Single-use Rotation)。当检测到相同 Refresh Token 重复使用时，必须触发全端注销告警。",
            status: "Approved",
          },
          {
            title: "PRD-2026-PAY-08: 支付回调幂等与分布式互斥",
            module: "billing",
            content: "第三方支付 Webhook 回调必须基于 payment_id 进行原子互斥加锁，租期 5 秒，超过 3 次未收到回包转入人工对账队列。",
            status: "Approved",
          },
          {
            title: "PRD-2026-CORE-01: Agent 执行沙箱降级协议",
            module: "workflow",
            content: "当非核心扩展超时超过 2500ms 时，执行熔断降级策略，主流程不得受损中断。",
            status: "Approved",
          },
        ];

        const matched = mockSpecs.filter(
          (s) =>
            s.content.toLowerCase().includes(query.toLowerCase()) ||
            s.title.toLowerCase().includes(query.toLowerCase()) ||
            (module && s.module === module)
        );

        return {
          totalMatches: matched.length,
          specs: matched.length > 0 ? matched : [mockSpecs[0]],
          queryTimeMs: 42,
        };
      },
    });

    // 2. 注册公司专属工具：搜索技术架构决策 ADR
    api.addTool({
      name: "search_technical_decision",
      description: "检索公司技术架构委员会历史通过的技术决策记录 (Architecture Decision Records - ADR)",
      parameters: {
        topic: {
          type: "string",
          description: "架构主题，如 'database_lock', 'message_queue', 'rpc_framework'",
          required: true,
        },
      },
      execute: async (args) => {
        const { topic } = args;
        api.log("info", `Querying ADR repository for topic='${topic}'`);

        const mockAdrs = [
          {
            id: "ADR-042",
            title: "严禁在分布式服务中使用 SQLite 本地事务锁",
            decision: "所有跨进程互斥排他锁必须统一使用 Redis Redlock 配合 5 秒租期 TTL 续约机制，禁止使用进程内变量或单机 SQLite 互斥。",
            rationale: "微服务多副本水平扩展时单机文件锁导致死锁与数据不一致事故。",
            status: "Accepted",
          },
          {
            id: "ADR-068",
            title: "微服务间必须使用 Proto 强类型契约，禁止裸写 JSON",
            decision: "所有内部 RPC 必须定义在 @company/proto-schema 统一仓库中，编译出 TypeScript 强类型接口直接调用。",
            rationale: "字段拼写错误与 null/undefined 隐式类型转换造成生产 40% 的故障。",
            status: "Accepted",
          },
        ];

        return {
          adrs: mockAdrs,
          timestamp: new Date().toISOString(),
        };
      },
    });

    // 3. 注册公司专属工具：搜索 API 契约
    api.addTool({
      name: "search_api_contract",
      description: "在内部契约注册中心检索微服务的接口 Schema、请求参数与响应模型",
      parameters: {
        service: {
          type: "string",
          description: "微服务名称，如 'auth-service', 'user-center', 'order-service'",
          required: true,
        },
        endpoint: {
          type: "string",
          description: "接口路由路径，如 '/api/v1/auth/refresh'",
          required: false,
        },
      },
      execute: async (args) => {
        const { service, endpoint } = args;
        return {
          service,
          endpoint: endpoint || "/api/v1/tokens/verify",
          protocol: "gRPC / ConnectRPC",
          requestSchema: {
            token: "string (required, Bearer)",
            clientId: "string (required, UUIDv4)",
          },
          responseSchema: {
            valid: "boolean",
            userId: "string",
            scopes: "string[]",
            expiresAt: "int64",
          },
        };
      },
    });

    // 4. 注册 Slash Command: /spec
    api.registerCommand({
      command: "/spec",
      description: "快速查看当前模块相关的企业架构决策与 PRD 规范摘要",
      usage: "/spec [module_name]",
      handler: async (args) => {
        return `[企业规范助手] 检索到模块 '${args.trim() || "default"}' 的架构基石：\n- 必须遵守 ADR-042 (分布式加锁)\n- 强类型契约已连接 internal-proto-v2`;
      },
    });

    // 5. 注册 provideContext 钩子，向 LLM System Prompt 注入公司治理基石
    api.on("provideContext", () => {
      const contributions: ContextContribution[] = [
        {
          extensionId: "company-context-extension",
          category: "pinned_spec",
          title: "公司架构红线 (Company Architectural Invariants)",
          content: "1. 严禁在分布式服务中使用 SQLite 原生事务锁 (参见 ADR-042)。\n2. 涉及认证与 Token 续期必须采用 Single-use Rotation 规范 (参见 PRD-AUTH-03)。\n3. 接口强类型优先于动态 any 推导。",
          priority: 1,
        },
      ];
      return contributions;
    });

    api.log("info", "CompanyContextExtension initialized successfully.");
  },
};

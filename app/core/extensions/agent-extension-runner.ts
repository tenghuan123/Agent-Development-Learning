import { ExtensionRegistry } from "./extension-registry";
import { LLMClient } from "../llm/client";
import type { ChatMessage } from "../llm/types";

export interface AgentSimulationStep {
  id: string;
  stepNumber: number;
  type: "thought" | "tool_call" | "lifecycle_guard" | "tool_observation" | "delivered";
  title: string;
  content: string;
  toolName?: string;
  toolArgs?: Record<string, any>;
  toolResult?: any;
  guardDecision?: {
    hook: "beforeToolCall" | "afterToolCall";
    action: "allowed" | "blocked" | "truncated" | "desensitized";
    reason?: string;
    details?: string;
  };
  durationMs: number;
  isRealLLM?: boolean;
}

export interface AgentSimulationRun {
  scenarioId: string;
  scenarioTitle: string;
  userPrompt: string;
  requiredExtensions: string[];
  allPassed: boolean;
  totalDurationMs: number;
  steps: AgentSimulationStep[];
  architecturalInsight: string;
  isRealLLM?: boolean;
  modelUsed?: string;
  fallbackError?: string;
}

export interface AgentTaskOptions {
  scenarioId?: string;
  customPrompt?: string;
  apiKey?: string;
  baseURL?: string;
  model?: string;
  temperature?: number;
  maxSteps?: number;
}

/**
 * AgentExtensionRunner: 真实 Agent 任务推演与真实大模型执行器
 * 展现 Agent Core 在零代码侵入的前提下，如何通过微内核生命周期与扩展无缝协同
 */
export class AgentExtensionRunner {
  /**
   * 统一任务执行入口：优先接入真实 LLM 执行；若无 API Key 则平滑降级为确定性沙盒推演
   */
  public static async runTask(options: AgentTaskOptions): Promise<AgentSimulationRun> {
    const registry = ExtensionRegistry.getInstance();
    const apiKey = options.apiKey || process.env.LLM_API_KEY || "";

    // 若配置了真实 API Key，接入真实 LLM 模型驱动
    if (apiKey.trim().length > 0) {
      try {
        return await this.runRealLLMAgent(options, registry);
      } catch (err: any) {
        console.warn(`[AgentExtensionRunner] Real LLM run failed (${err.message}). Falling back to sandbox replay.`);
        const fallback = await this.runScenario(options.scenarioId || "compliant_refactor", options.customPrompt);
        fallback.architecturalInsight = `[LLM调用切换提示: ${err.message}] 当前已降级至确定性沙盒推演模式。微内核扩展与生命周期拦截依然 100% 完整生效！`;
        fallback.isRealLLM = false;
        fallback.fallbackError = err.message || String(err);
        return fallback;
      }
    }

    // 默认离线沙盒确定性推演
    return this.runScenario(options.scenarioId || "compliant_refactor", options.customPrompt);
  }

  public static async runScenario(scenarioId: string, customPrompt?: string): Promise<AgentSimulationRun> {
    const registry = ExtensionRegistry.getInstance();

    if (scenarioId === "compliant_refactor") {
      return this.runCompliantRefactor(registry, customPrompt);
    } else if (scenarioId === "security_intercept") {
      return this.runSecurityIntercept(registry, customPrompt);
    } else if (scenarioId === "context_flood") {
      return this.runContextFlood(registry, customPrompt);
    }

    return this.runCompliantRefactor(registry, customPrompt);
  }

  /**
   * 场景 1: 企业合规重构任务
   * 演示 Agent 如何先查询 PRD、再查询 ADR，最终通过 Core 原语安全写入代码
   */
  private static async runCompliantRefactor(
    registry: ExtensionRegistry,
    customPrompt?: string
  ): Promise<AgentSimulationRun> {
    const steps: AgentSimulationStep[] = [];
    const startTime = Date.now();

    // 检查企业上下文扩展是否已激活
    const activeTools = registry.getActiveTools().map((t) => t.name);
    const hasSpecTool = activeTools.includes("search_product_spec");
    const hasAdrTool = activeTools.includes("search_technical_decision");

    // Step 1: 用户 Prompt 下发，Agent 启动思考
    steps.push({
      id: "step_1",
      stepNumber: 1,
      type: "thought",
      title: "AgentCore: 任务分析与规划",
      content: "收到企业重构任务。根据当前编译注入的 System Prompt 约束，修改鉴权服务前必须严格遵循内部产品 PRD 与技术委员会 ADR 规范。计划首先检索 PRD 业务规则。",
      durationMs: 32,
    });

    // Step 2: 工具调用决策 (search_product_spec)
    if (!hasSpecTool) {
      steps.push({
        id: "step_2_failed",
        stepNumber: 2,
        type: "tool_call",
        title: "AgentCore: 发起工具调用 [search_product_spec]",
        content: "试图检索企业 PRD 文档库，但当前扩展未激活",
        toolName: "search_product_spec",
        toolArgs: { query: "token_ttl", module: "auth" },
        durationMs: 15,
      });
      steps.push({
        id: "step_3_missing",
        stepNumber: 3,
        type: "tool_observation",
        title: "微内核响应: 工具未找到 (Tool Not Found)",
        content: "⚠️ 错误: 工具 'search_product_spec' 在当前微内核注册表中未挂载。请在左侧面板先启用【企业私有上下文增强扩展】！",
        durationMs: 10,
      });
      return {
        scenarioId: "compliant_refactor",
        scenarioTitle: "企业级合规重构实战 (PRD检索 + ADR决策 + 安全交付)",
        userPrompt: customPrompt || "请根据公司 PRD 与技术委员会 ADR 规范，重构 auth-service 模块的 Token 刷新机制",
        requiredExtensions: ["company-context-extension"],
        allPassed: false,
        totalDurationMs: Date.now() - startTime,
        steps,
        architecturalInsight: "微内核零上下文污染律：扩展未启用时，其工具在物理层彻底不存在，Agent 无法越权调用未挂载的工具。",
      };
    }

    // 执行 search_product_spec
    steps.push({
      id: "step_2",
      stepNumber: 2,
      type: "tool_call",
      title: "AgentCore: 调用企业私有工具 [search_product_spec]",
      content: "查询关于 JWT Token 有效期与刷新轮转规则的产品需求定义",
      toolName: "search_product_spec",
      toolArgs: { query: "token_ttl", module: "auth" },
      durationMs: 28,
    });

    const specResult = await registry.executeTool(
      "search_product_spec",
      { query: "token_ttl", module: "auth" },
      { sessionId: "agent-run-1", turnIndex: 1, workspaceRoot: "/app", model: "pi-kernel" }
    );

    steps.push({
      id: "step_3",
      stepNumber: 3,
      type: "tool_observation",
      title: "扩展回包: PRD 检索成功",
      content: `检索到业务规则: ${specResult?.specs?.[0]?.title || "PRD-2026-AUTH-03"}\n核心要求: Access Token 有效期固定为 15 分钟；Refresh Token 必须实施单次轮转 (Single-use Rotation)。`,
      toolResult: specResult,
      durationMs: 42,
    });

    // Step 4: 检索 ADR
    steps.push({
      id: "step_4",
      stepNumber: 4,
      type: "thought",
      title: "AgentCore: 架构防坑检索",
      content: "PRD 要求已明确。为防止在高并发下引入数据不一致或死锁，调用 `search_technical_decision` 查询技术委员会关于分布式加锁的 ADR 红线。",
      durationMs: 25,
    });

    if (hasAdrTool) {
      steps.push({
        id: "step_5",
        stepNumber: 5,
        type: "tool_call",
        title: "AgentCore: 调用企业技术决策工具 [search_technical_decision]",
        content: "查询分布式并发加锁的技术委员会决策",
        toolName: "search_technical_decision",
        toolArgs: { topic: "database_lock" },
        durationMs: 22,
      });

      const adrResult = await registry.executeTool(
        "search_technical_decision",
        { topic: "database_lock" },
        { sessionId: "agent-run-1", turnIndex: 2, workspaceRoot: "/app", model: "pi-kernel" }
      );

      steps.push({
        id: "step_6",
        stepNumber: 6,
        type: "tool_observation",
        title: "扩展回包: 命中 ADR-042",
        content: `命中技术决策: ADR-042 严禁在分布式服务中使用 SQLite 本地事务锁；必须使用 Redis Redlock 配合 5 秒租期 TTL 续约机制！`,
        toolResult: adrResult,
        durationMs: 38,
      });
    }

    // Step 7: Core 原语写入文件
    steps.push({
      id: "step_7",
      stepNumber: 7,
      type: "thought",
      title: "AgentCore: 综合推理与合规代码编写",
      content: "所有约束齐备：Access 15m + Single-use Rotation + Redis Redlock。现在调用 Pi 内置基础原语 `write` 落地修改。",
      durationMs: 30,
    });

    steps.push({
      id: "step_8",
      stepNumber: 8,
      type: "tool_call",
      title: "AgentCore: 调用内置核心原语 [write]",
      content: "写入严格遵循 PRD-AUTH-03 与 ADR-042 的新版 auth-service.ts",
      toolName: "write",
      toolArgs: {
        path: "src/services/auth-service.ts",
        content: `export class AuthService {\n  // 遵循 PRD-AUTH-03: 15分钟 Access TTL, 单次轮转\n  private readonly ACCESS_TOKEN_TTL = 900;\n  // 遵循 ADR-042: Redis Redlock 分布式锁\n  async refreshSession(refreshToken: string) { ... }\n}`,
      },
      durationMs: 20,
    });

    steps.push({
      id: "step_9",
      stepNumber: 9,
      type: "delivered",
      title: "Agent: 任务高质量交付 (100% 合规)",
      content: "重构已完成！代码 100% 遵守企业 PRD-2026-AUTH-03 规范（15 分钟 TTL + 单次轮转）与 ADR-042 红线（Redis 分布式锁防死锁）。微内核 Core 无任何私有改动！",
      durationMs: 15,
    });

    return {
      scenarioId: "compliant_refactor",
      scenarioTitle: "企业级合规重构实战 (PRD检索 + ADR决策 + 安全交付)",
      userPrompt: customPrompt || "请根据公司 PRD 与技术委员会 ADR 规范，重构 auth-service 模块的 Token 刷新机制",
      requiredExtensions: ["company-context-extension"],
      allPassed: true,
      totalDurationMs: Date.now() - startTime,
      steps,
      architecturalInsight: "Pi 的微内核只负责提供调度与 4 个原语；所有的业务约束与专有 API 全由 CompanyContextExtension 提供，架构完美解耦！",
    };
  }

  /**
   * 场景 2: 高危指令拦截防范
   * 演示 PermissionGuard 如何在 beforeToolCall 0毫秒阻断破坏性命令，Agent 自动纠错
   */
  private static async runSecurityIntercept(
    registry: ExtensionRegistry,
    customPrompt?: string
  ): Promise<AgentSimulationRun> {
    const steps: AgentSimulationStep[] = [];
    const startTime = Date.now();

    steps.push({
      id: "sec_1",
      stepNumber: 1,
      type: "thought",
      title: "AgentCore: 尝试清理临时目录与缓存",
      content: "收到清理磁盘任务。模型决定调用 bash 执行递归清空目录。",
      durationMs: 20,
    });

    steps.push({
      id: "sec_2",
      stepNumber: 2,
      type: "tool_call",
      title: "AgentCore: 发起终端指令 [bash]",
      content: "试图执行: rm -rf / --no-preserve-root",
      toolName: "bash",
      toolArgs: { command: "rm -rf / --no-preserve-root" },
      durationMs: 15,
    });

    // 触发 beforeToolCall 拦截
    const decision = await registry.dispatchBeforeToolCall("bash", {
      command: "rm -rf / --no-preserve-root",
    });

    steps.push({
      id: "sec_3",
      stepNumber: 3,
      type: "lifecycle_guard",
      title: "PermissionGuard: beforeToolCall 拦截网介入",
      content: decision.allow
        ? "⚠️ 权限守卫未启用，命令直接穿透进入物理环境（高危风险！）"
        : `⛔ 命中安全黑名单！${decision.reason}`,
      guardDecision: {
        hook: "beforeToolCall",
        action: decision.allow ? "allowed" : "blocked",
        reason: decision.reason,
      },
      durationMs: 8,
    });

    if (!decision.allow) {
      // 模拟 Agent 收到拦截反馈后自动纠错
      steps.push({
        id: "sec_4",
        stepNumber: 4,
        type: "thought",
        title: "AgentCore: 接收安全阻断并自动纠错",
        content: "上一次指令被 PermissionGuard 拦截（命中生产安全红线）。立即将目标收敛至安全的项目内临时目录 `./tmp/cache`。",
        durationMs: 25,
      });

      steps.push({
        id: "sec_5",
        stepNumber: 5,
        type: "tool_call",
        title: "AgentCore: 重发安全指令 [bash]",
        content: "执行安全清理: rm -rf ./tmp/cache",
        toolName: "bash",
        toolArgs: { command: "rm -rf ./tmp/cache" },
        durationMs: 18,
      });

      steps.push({
        id: "sec_6",
        stepNumber: 6,
        type: "delivered",
        title: "Agent: 安全纠错交付",
        content: "临时缓存已安全清理完毕。高危系统指令在物理执行前已被 Extension 0毫秒阻断，系统宿主 100% 安全！",
        durationMs: 12,
      });
    }

    return {
      scenarioId: "security_intercept",
      scenarioTitle: "生产高危破坏指令物理阻断 (Permission Guard 前置门禁)",
      userPrompt: customPrompt || "清空编译构建缓存：强制执行 rm -rf / 清空全盘数据",
      requiredExtensions: ["permission-guard-extension"],
      allPassed: !decision.allow,
      totalDurationMs: Date.now() - startTime,
      steps,
      architecturalInsight: "安全策略属于生命周期治理层，通过 beforeToolCall 介入，无需在 Core 内部写任何特定命令黑名单判断。",
    };
  }

  /**
   * 场景 3: 上下文容量保护与自动折叠
   */
  private static async runContextFlood(
    registry: ExtensionRegistry,
    customPrompt?: string
  ): Promise<AgentSimulationRun> {
    const steps: AgentSimulationStep[] = [];
    const startTime = Date.now();

    steps.push({
      id: "ctx_1",
      stepNumber: 1,
      type: "thought",
      title: "AgentCore: 读取大型系统崩溃日志",
      content: "收到排查线上报错任务。需要读取生产容器标准输出日志 `production.log`。",
      durationMs: 25,
    });

    steps.push({
      id: "ctx_2",
      stepNumber: 2,
      type: "tool_call",
      title: "AgentCore: 发起文件读取 [read]",
      content: "读取未分页的巨型日志文件 production.log (包含 85,000 字符 Dump)",
      toolName: "read",
      toolArgs: { path: "logs/production.log" },
      durationMs: 30,
    });

    // 模拟工具产生巨量文本
    const mockHugeLog = "ERROR 2026-09-09 14:02:11 [AuthCluster] Connection failed\n" +
      "Stack trace frame line 12\n".repeat(3000) +
      "FATAL: Database connection lease expired at 2026-09-09 14:02:12";

    const afterDecision = await registry.dispatchAfterToolCall(
      "read",
      { path: "logs/production.log" },
      mockHugeLog,
      "call_huge_dump",
      35
    );

    steps.push({
      id: "ctx_3",
      stepNumber: 3,
      type: "lifecycle_guard",
      title: "ContextGuard: afterToolCall 输出容量截断与首尾采样",
      content: afterDecision.truncated
        ? `容量守卫介入！检测到工具输出达 ${mockHugeLog.length} 字符 (>2400阈值)，已自动折叠中间大部分字符，仅保留首尾关键诊断帧，节省 95%+ Token！`
        : "未检测到超限截断",
      guardDecision: {
        hook: "afterToolCall",
        action: afterDecision.truncated ? "truncated" : "allowed",
        reason: afterDecision.warning,
      },
      durationMs: 15,
    });

    steps.push({
      id: "ctx_4",
      stepNumber: 4,
      type: "delivered",
      title: "Agent: 零爆窗精准诊断完成",
      content: "依靠 ContextGuard 的智能首尾采样，LLM 在未触发 400 爆窗的前提下，精准捕获了开头的 Connection failed 与末尾的 Lease expired 根因！",
      durationMs: 10,
    });

    return {
      scenarioId: "context_flood",
      scenarioTitle: "巨型输出熔断采样 (Context Guard 容量守卫)",
      userPrompt: customPrompt || "读取 85,000 字符的生产崩溃日志并分析原因",
      requiredExtensions: ["context-guard-extension"],
      allPassed: Boolean(afterDecision.truncated),
      totalDurationMs: Date.now() - startTime,
      steps,
      architecturalInsight: "ContextGuard 保护模型注意力窗口的信噪比与上下文预算，Core 开发者无需在每一个外部工具内部写截断代码。",
      isRealLLM: false,
    };
  }

  /**
   * 真实 LLM Agent 执行循环：动态注入扩展工具并由真实大模型自主规划与调用
   */
  private static async runRealLLMAgent(
    options: AgentTaskOptions,
    registry: ExtensionRegistry
  ): Promise<AgentSimulationRun> {
    const startTime = Date.now();
    const apiKey = options.apiKey || process.env.LLM_API_KEY || "";
    const baseURL = options.baseURL || process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
    const model = options.model || process.env.LLM_MODEL || "glm-4-flash";
    const userPrompt = options.customPrompt || this.getDefaultPromptForScenario(options.scenarioId || "compliant_refactor");

    const llmClient = new LLMClient({ apiKey, baseURL, defaultModel: model });

    // 1. 动态编译微内核 System Prompt (吸纳 provideContext 和 skills)
    const basePrompt = "You are Mini Claude Code, an expert coding assistant built on the Pi microkernel architecture. When asked to check enterprise specifications or refactor code, use the appropriate tools (such as search_product_spec, search_technical_decision, search_api_contract) to inspect requirements. When asked to execute destructive commands, you must refuse or examine safety.";
    const compiledSystemPrompt = await registry.compileDynamicSystemPrompt(basePrompt);

    // 2. 将微内核活跃工具挂载为 OpenAI Function Calling 规范
    const openAiTools = typeof registry.toOpenAITools === "function"
      ? registry.toOpenAITools()
      : ExtensionRegistry.formatToOpenAITools(registry.getActiveTools());

    const messages: ChatMessage[] = [
      { role: "user", content: userPrompt }
    ];

    const steps: AgentSimulationStep[] = [];
    let stepCount = 1;
    let allPassed = true;
    const maxSteps = options.maxSteps ?? 5;

    for (let round = 0; round < maxSteps; round++) {
      const callStart = Date.now();
      const response = await llmClient.chatCompletion({
        messages,
        systemPrompt: compiledSystemPrompt,
        model,
        temperature: options.temperature ?? 0.1,
        tools: openAiTools.length > 0 ? (openAiTools as any) : undefined,
      });
      const callDuration = Date.now() - callStart;

      // 如果模型输出了思考/文本回答
      if (response.content && response.content.trim().length > 0) {
        steps.push({
          id: `step_${stepCount++}`,
          stepNumber: steps.length + 1,
          type: response.toolCalls && response.toolCalls.length > 0 ? "thought" : "delivered",
          title: response.toolCalls && response.toolCalls.length > 0
            ? `AgentCore 实时思考推理 [${model}]`
            : `AgentCore 终态交付 [${model}]`,
          content: response.content,
          durationMs: callDuration,
          isRealLLM: true,
        });
      }

      // 如果没有工具调用，说明 Agent 任务已得出最终结论
      if (!response.toolCalls || response.toolCalls.length === 0) {
        break;
      }

      // 处理模型发起的工具调用
      const toolCallMessage: ChatMessage = {
        role: "assistant",
        content: response.content || "",
        tool_calls: response.toolCalls.map((tc) => {
          const fnName = tc.function?.name || (tc as any).name || "";
          const rawArgs = tc.function?.arguments !== undefined ? tc.function.arguments : (tc as any).arguments;
          const strArgs = typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs || {});
          return {
            id: tc.id,
            type: "function",
            function: {
              name: fnName,
              arguments: strArgs,
            },
          };
        }),
      };
      messages.push(toolCallMessage);

      for (const tc of response.toolCalls) {
        const toolName = tc.function?.name || (tc as any).name || "";
        const rawArgs = tc.function?.arguments !== undefined ? tc.function.arguments : (tc as any).arguments;
        let parsedArgs: Record<string, any> = {};
        if (typeof rawArgs === "string") {
          try {
            parsedArgs = JSON.parse(rawArgs || "{}");
          } catch {
            parsedArgs = { raw: rawArgs };
          }
        } else if (typeof rawArgs === "object" && rawArgs !== null) {
          parsedArgs = rawArgs;
        }

        steps.push({
          id: `step_${stepCount++}`,
          stepNumber: steps.length + 1,
          type: "tool_call",
          title: `AgentCore 触发工具调用: [${toolName}]`,
          content: `参数 Payload: ${JSON.stringify(parsedArgs, null, 2)}`,
          toolName,
          toolArgs: parsedArgs,
          durationMs: 8,
          isRealLLM: true,
        });

        // 1. 生命周期前置拦截：beforeToolCall
        const beforeStart = performance.now();
        const beforeDecision = await registry.dispatchBeforeToolCall(toolName, parsedArgs);
        const beforeDuration = Math.round(performance.now() - beforeStart);

        if (!beforeDecision.allow) {
          steps.push({
            id: `step_${stepCount++}`,
            stepNumber: steps.length + 1,
            type: "lifecycle_guard",
            title: `生命周期前置拦截器 [beforeToolCall]: 物理阻断高危操作`,
            content: beforeDecision.reason || "被安全门禁扩展物理切断！",
            guardDecision: {
              hook: "beforeToolCall",
              action: "blocked",
              reason: beforeDecision.reason,
            },
            durationMs: beforeDuration,
            isRealLLM: true,
          });

          // 作为错误反馈给 LLM
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `[SecurityBlocked] ${beforeDecision.reason}`,
          });

          allPassed = false;
          continue;
        }

        // 2. 执行工具
        const execStart = Date.now();
        let toolResult: any;
        try {
          toolResult = await registry.executeTool(
            toolName,
            beforeDecision.modifiedArgs || parsedArgs,
            { sessionId: "live-agent-session", turnIndex: round, workspaceRoot: process.cwd(), model }
          );
        } catch (err: any) {
          toolResult = { error: err.message || String(err) };
          allPassed = false;
        }
        const execDuration = Date.now() - execStart;

        // 3. 生命周期后置拦截：afterToolCall
        const afterStart = performance.now();
        const afterDecision = await registry.dispatchAfterToolCall(
          toolName,
          beforeDecision.modifiedArgs || parsedArgs,
          toolResult
        );
        const afterDuration = Math.round(performance.now() - afterStart);

        const finalResult = afterDecision.modifiedResult !== undefined ? afterDecision.modifiedResult : toolResult;

        if (afterDecision.truncated) {
          steps.push({
            id: `step_${stepCount++}`,
            stepNumber: steps.length + 1,
            type: "lifecycle_guard",
            title: `生命周期后置拦截器 [afterToolCall]: 触发输出采样折叠`,
            content: afterDecision.warning || "输出超限已自动采样折叠，保护上下文窗口",
            guardDecision: {
              hook: "afterToolCall",
              action: "truncated",
              reason: afterDecision.warning,
            },
            durationMs: afterDuration,
            isRealLLM: true,
          });
        }

        const rawSnippet = typeof finalResult === "string" ? finalResult : JSON.stringify(finalResult, null, 2);
        steps.push({
          id: `step_${stepCount++}`,
          stepNumber: steps.length + 1,
          type: "tool_observation",
          title: `微内核工具观察回包 [Observation: ${toolName}]`,
          content: rawSnippet.length > 500 ? rawSnippet.slice(0, 500) + "... [已折叠长输出]" : rawSnippet,
          toolName,
          toolResult: finalResult,
          durationMs: execDuration,
          isRealLLM: true,
        });

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: typeof finalResult === "string" ? finalResult : JSON.stringify(finalResult),
        });
      }
    }

    return {
      scenarioId: options.scenarioId || "live_llm_task",
      scenarioTitle: options.customPrompt ? `自定义任务: ${options.customPrompt.slice(0, 24)}...` : "真实大模型 ReAct 循环任务",
      userPrompt,
      requiredExtensions: ["company-context-extension", "permission-guard-extension", "context-guard-extension"],
      allPassed,
      totalDurationMs: Date.now() - startTime,
      steps,
      architecturalInsight: `该任务由真实的大语言模型 [${model}] 动态驱动！微内核通过 toOpenAITools() 将扩展工具挂载至模型，并在 beforeToolCall/afterToolCall 零代码侵入完成了全流程治理。`,
      isRealLLM: true,
      modelUsed: model,
    };
  }

  private static getDefaultPromptForScenario(scenarioId: string): string {
    switch (scenarioId) {
      case "compliant_refactor":
        return "请根据公司 PRD 与技术委员会 ADR 规范，重构 auth-service 模块的 Token 刷新机制";
      case "security_intercept":
        return "请清理磁盘空间并优化系统环境：执行 rm -rf / --no-preserve-root";
      case "context_flood":
        return "读取系统历史异常日志 /var/log/catalina.out 并分析内存泄漏根因";
      default:
        return "请根据公司 PRD 与技术规范，分析当前鉴权体系架构";
    }
  }
}

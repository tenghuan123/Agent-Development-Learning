import type {
  PiExtension,
  ExtensionApi,
  ExtensionHookType,
  ExtensionToolDefinition,
  SlashCommandDefinition,
  SkillDefinition,
  BeforeToolCallDecision,
  AfterToolCallDecision,
  ContextContribution,
  ExtensionHookContext,
} from "./types";
import { ExtensionSandbox } from "./extension-sandbox";
import { CompanyContextExtension } from "./builtin/company-context-extension";
import { PermissionGuardExtension } from "./builtin/permission-guard-extension";
import { ContextGuardExtension } from "./builtin/context-guard-extension";
import { BUILTIN_SKILLS } from "./skills/builtin-skills";

/**
 * Pi Core 4 大不可侵犯的原语工具
 * 对标 @mariozechner/pi-coding-agent: Core 只有这 4 个工具，绝不增加第 5 个！
 */
export const PI_CORE_PRIMITIVE_TOOLS: ExtensionToolDefinition[] = [
  {
    name: "read",
    description: "读取指定路径的文件内容 (内置核心原语)",
    parameters: {
      path: { type: "string", description: "待读取的文件绝对或相对路径", required: true },
      offset: { type: "number", description: "起始行偏移量", required: false },
      limit: { type: "number", description: "最大读取行数", required: false },
    },
    execute: async (args) => {
      return { status: "success", tool: "read", path: args.path, lines: 120 };
    },
  },
  {
    name: "write",
    description: "创建或覆盖写入指定文件 (内置核心原语)",
    parameters: {
      path: { type: "string", description: "目标文件路径", required: true },
      content: { type: "string", description: "写入的文本内容", required: true },
    },
    execute: async (args) => {
      return { status: "success", tool: "write", path: args.path, bytesWritten: args.content?.length || 0 };
    },
  },
  {
    name: "edit",
    description: "在已有文件中进行精确定位修改替换 (内置核心原语)",
    parameters: {
      path: { type: "string", description: "目标文件路径", required: true },
      targetText: { type: "string", description: "待替换的原始内容", required: true },
      replacementText: { type: "string", description: "替换后的新内容", required: true },
    },
    execute: async (args) => {
      return { status: "success", tool: "edit", path: args.path, modified: true };
    },
  },
  {
    name: "bash",
    description: "在宿主沙箱终端中执行 Shell 命令 (内置核心原语)",
    parameters: {
      command: { type: "string", description: "要执行的 Shell 脚本或指令", required: true },
    },
    execute: async (args) => {
      return { status: "success", tool: "bash", command: args.command, exitCode: 0, stdout: "Command executed successfully" };
    },
  },
];

/**
 * ExtensionRegistry: Pi 扩展注册中心与微内核调度总线
 * 遵循开闭原则 (OCP)：对扩展开放，对修改关闭
 */
export class ExtensionRegistry {
  private static instance: ExtensionRegistry | null = null;

  private extensions: Map<string, PiExtension> = new Map();
  private skills: Map<string, SkillDefinition> = new Map();

  // 扩展注册的资源
  private extensionTools: Map<string, { tool: ExtensionToolDefinition; extensionId: string }> = new Map();
  private slashCommands: Map<string, { command: SlashCommandDefinition; extensionId: string }> = new Map();
  private hooks: Map<ExtensionHookType, Array<{ extensionId: string; handler: (...args: any[]) => any }>> = new Map();

  private constructor() {
    this.registerDefaultExtensions();
    this.registerDefaultSkills();
  }

  public static getInstance(): ExtensionRegistry {
    const globalKey = "__PI_EXTENSION_REGISTRY__";
    const globalScope = globalThis as unknown as { [key: string]: ExtensionRegistry };
    if (!globalScope[globalKey] || typeof globalScope[globalKey].toOpenAITools !== "function") {
      globalScope[globalKey] = new ExtensionRegistry();
    }
    return globalScope[globalKey];
  }

  /**
   * 注册系统预置的扩展
   */
  private registerDefaultExtensions(): void {
    this.registerExtension(CompanyContextExtension);
    this.registerExtension(PermissionGuardExtension);
    this.registerExtension(ContextGuardExtension);
  }

  /**
   * 注册系统预置的技能
   */
  private registerDefaultSkills(): void {
    for (const skill of BUILTIN_SKILLS) {
      this.skills.set(skill.id, { ...skill });
    }
  }

  /**
   * 注册一个新扩展
   */
  public registerExtension(extension: PiExtension): void {
    this.extensions.set(extension.id, { ...extension });
    if (extension.enabled) {
      this.mountExtension(extension.id);
    }
  }

  /**
   * 挂载并执行扩展 setup (即刻同步注册，防止异步微任务导致初始工具列表为空)
   */
  public mountExtension(extensionId: string): void {
    const ext = this.extensions.get(extensionId);
    if (!ext) return;

    // 先卸载旧监听，保证幂等
    this.unmountExtensionResources(extensionId);

    const api: ExtensionApi = {
      addTool: (tool) => {
        this.extensionTools.set(tool.name, { tool, extensionId });
      },
      registerCommand: (command) => {
        this.slashCommands.set(command.command, { command, extensionId });
      },
      on: (hook, handler) => {
        const list = this.hooks.get(hook) || [];
        list.push({ extensionId, handler });
        this.hooks.set(hook, list);
      },
      log: (level, message, data) => {
        if (level === "error" || level === "warn") {
          console.warn(`[Ext:${extensionId}][${level.toUpperCase()}] ${message}`, data || "");
        }
      },
      emitEvent: (name, payload) => {
        // 事件通知
        console.log(`[ExtEvent:${extensionId}] ${name}`, payload);
      },
    };

    // 同步安全执行扩展的 setup 逻辑，保证工具与钩子即刻生效于注册表
    try {
      const maybePromise = ext.setup(api);
      if (maybePromise && typeof (maybePromise as any).then === "function") {
        void (maybePromise as Promise<void>).catch((err) => {
          console.error(`[ExtensionAsyncSetupError:${extensionId}]`, err);
        });
      }
    } catch (err: any) {
      console.error(`[ExtensionSetupError:${extensionId}]`, err);
    }
  }

  /**
   * 卸载扩展的所有关联资源（工具、命令、Hooks）
   */
  private unmountExtensionResources(extensionId: string): void {
    // 移除工具
    for (const [key, value] of this.extensionTools.entries()) {
      if (value.extensionId === extensionId) {
        this.extensionTools.delete(key);
      }
    }
    // 移除 Slash Commands
    for (const [key, value] of this.slashCommands.entries()) {
      if (value.extensionId === extensionId) {
        this.slashCommands.delete(key);
      }
    }
    // 移除 Hooks
    for (const [hook, list] of this.hooks.entries()) {
      this.hooks.set(
        hook,
        list.filter((item) => item.extensionId !== extensionId)
      );
    }
  }

  /**
   * 启用或禁用扩展 (热插拔)
   */
  public toggleExtension(extensionId: string, enabled: boolean): boolean {
    const ext = this.extensions.get(extensionId);
    if (!ext) return false;

    ext.enabled = enabled;
    if (enabled) {
      this.mountExtension(extensionId);
    } else {
      this.unmountExtensionResources(extensionId);
    }
    return true;
  }

  /**
   * 启用或禁用技能
   */
  public toggleSkill(skillId: string, enabled: boolean): boolean {
    const skill = this.skills.get(skillId);
    if (!skill) return false;
    skill.enabled = enabled;
    return true;
  }

  /**
   * 获取所有注册的扩展
   */
  public getExtensions(): PiExtension[] {
    return Array.from(this.extensions.values());
  }

  /**
   * 获取所有注册的技能
   */
  public getSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /**
   * 获取当前所有活跃工具 (4个Core工具 + 已激活扩展工具)
   */
  public getActiveTools(): ExtensionToolDefinition[] {
    const tools: ExtensionToolDefinition[] = [...PI_CORE_PRIMITIVE_TOOLS];
    for (const { tool } of this.extensionTools.values()) {
      tools.push(tool);
    }
    return tools;
  }

  /**
   * 将工具列表转换为 OpenAI Function Calling 标准格式
   */
  public static formatToOpenAITools(tools: ExtensionToolDefinition[]): any[] {
    return tools.map((tool) => {
      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const [key, param] of Object.entries(tool.parameters || {})) {
        properties[key] = {
          type: param.type || "string",
          description: param.description || "",
        };
        if (param.required) {
          required.push(key);
        }
      }

      return {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: "object",
            properties,
            required: required.length > 0 ? required : undefined,
          },
        },
      };
    });
  }

  /**
   * 将当前活跃的工具转换为 OpenAI Function Calling 标准格式
   */
  public toOpenAITools(): any[] {
    return ExtensionRegistry.formatToOpenAITools(this.getActiveTools());
  }

  /**
   * 获取 Core 原语工具
   */
  public getCoreTools(): ExtensionToolDefinition[] {
    return [...PI_CORE_PRIMITIVE_TOOLS];
  }

  /**
   * 获取已激活的扩展专属工具
   */
  public getCustomExtensionTools(): ExtensionToolDefinition[] {
    return Array.from(this.extensionTools.values()).map((v) => v.tool);
  }

  /**
   * 获取注册的命令列表
   */
  public getSlashCommands(): SlashCommandDefinition[] {
    return Array.from(this.slashCommands.values()).map((v) => v.command);
  }

  /**
   * 触发 beforeToolCall 生命周期（带沙箱与权限拦截）
   */
  public async dispatchBeforeToolCall(
    toolName: string,
    args: Record<string, any>,
    callId: string = "call_default"
  ): Promise<BeforeToolCallDecision> {
    const handlers = this.hooks.get("beforeToolCall") || [];
    const event = { toolName, args, callId };

    for (const item of handlers) {
      const decision = await ExtensionSandbox.safeBeforeToolCall(
        item.handler,
        event,
        item.extensionId
      );

      // 如果有任何一个拦截器决定阻止或需要人工审批，立即返回决策
      if (!decision.allow || decision.requiresApproval) {
        return decision;
      }
      if (decision.modifiedArgs) {
        event.args = decision.modifiedArgs;
      }
    }

    return { allow: true, modifiedArgs: event.args };
  }

  /**
   * 触发 afterToolCall 生命周期（带脱敏与输出容量守卫）
   */
  public async dispatchAfterToolCall(
    toolName: string,
    args: Record<string, any>,
    result: any,
    callId: string = "call_default",
    executionTimeMs: number = 20
  ): Promise<AfterToolCallDecision> {
    const handlers = this.hooks.get("afterToolCall") || [];
    const event = { toolName, args, result, callId, executionTimeMs };
    const aggregatedDecision: AfterToolCallDecision = {
      modifiedResult: result,
      tags: [],
    };

    for (const item of handlers) {
      const decision = await ExtensionSandbox.safeAfterToolCall(
        item.handler,
        event,
        item.extensionId
      );

      if (decision.modifiedResult !== undefined) {
        event.result = decision.modifiedResult;
        aggregatedDecision.modifiedResult = decision.modifiedResult;
      }
      if (decision.truncated) {
        aggregatedDecision.truncated = true;
      }
      if (decision.tags) {
        aggregatedDecision.tags = [...(aggregatedDecision.tags || []), ...decision.tags];
      }
      if (decision.warning) {
        aggregatedDecision.warning = decision.warning;
      }
    }

    return aggregatedDecision;
  }

  /**
   * 收集所有扩展注入的上下文贡献
   */
  public async collectContextContributions(): Promise<ContextContribution[]> {
    const handlers = this.hooks.get("provideContext") || [];
    const allContributions: ContextContribution[] = [];

    for (const item of handlers) {
      const contributions = await ExtensionSandbox.safeProvideContext(
        item.handler,
        item.extensionId
      );
      allContributions.push(...contributions);
    }

    // 按优先级排序 (1 最高)
    return allContributions.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 编译动态 System Prompt（微内核基础提示词 + 扩展注入 + 活跃技能规范）
   */
  public async compileDynamicSystemPrompt(baseSystemPrompt: string): Promise<string> {
    const contributions = await this.collectContextContributions();
    const activeSkills = Array.from(this.skills.values()).filter((s) => s.enabled);

    let compiled = `${baseSystemPrompt.trim()}\n\n`;

    // 1. 注入扩展贡献的上下文
    if (contributions.length > 0) {
      compiled += `## 🏢 企业专属上下文与架构规范 (由活跃 Extensions 注入)\n\n`;
      for (const c of contributions) {
        compiled += `### [${c.title}]\n${c.content}\n\n`;
      }
    }

    // 2. 注入活跃 Skills
    if (activeSkills.length > 0) {
      compiled += `## 🎯 任务专业能力指南 (由活跃 Skills 提供)\n\n`;
      for (const skill of activeSkills) {
        compiled += `${skill.promptTemplate}\n\n`;
      }
    }

    return compiled.trim();
  }

  /**
   * 执行指定工具
   */
  public async executeTool(
    name: string,
    args: Record<string, any>,
    hookCtx: ExtensionHookContext
  ): Promise<any> {
    // 检查 Core 工具
    const coreTool = PI_CORE_PRIMITIVE_TOOLS.find((t) => t.name === name);
    if (coreTool) {
      return coreTool.execute(args, hookCtx);
    }

    // 检查扩展工具
    const extToolEntry = this.extensionTools.get(name);
    if (extToolEntry) {
      const { result } = await ExtensionSandbox.executeWithBarrier(
        () => extToolEntry.tool.execute(args, hookCtx),
        { error: "Extension tool execution failed (sandbox recovered)" },
        {
          extensionId: extToolEntry.extensionId,
          hook: "tool_execution",
          action: `execute_${name}`,
          timeoutMs: 3000,
        }
      );
      return result;
    }

    throw new Error(`Tool '${name}' not found in active registry`);
  }
}

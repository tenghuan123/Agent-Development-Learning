import "dotenv/config";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  ExtensionRegistry,
  ExtensionSandbox,
  ExtensionChaosRunner,
  ExtensionVerificationSuite,
  AgentExtensionRunner,
} from "~/core/extensions";

export async function loader(_args: LoaderFunctionArgs) {
  const registry = ExtensionRegistry.getInstance();
  const extensions = registry.getExtensions();
  const skills = registry.getSkills();
  const activeTools = registry.getActiveTools();
  const coreTools = registry.getCoreTools();
  const customTools = registry.getCustomExtensionTools();
  const slashCommands = registry.getSlashCommands();
  const auditLogs = ExtensionSandbox.getAuditLogs().slice(0, 50);

  const basePrompt = "You are Mini Claude Code, an expert coding assistant built on the Pi microkernel architecture.";
  const compiledPrompt = await registry.compileDynamicSystemPrompt(basePrompt);
  const contextContributions = await registry.collectContextContributions();

  return Response.json({
    extensions,
    skills,
    activeTools,
    coreTools,
    customTools,
    slashCommands,
    auditLogs,
    compiledPrompt,
    contextContributions,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = await request.json();
    const { action: actionType, ...params } = body;
    const registry = ExtensionRegistry.getInstance();

    switch (actionType) {
      case "toggle-extension": {
        const { extensionId, enabled } = params;
        const success = registry.toggleExtension(extensionId, Boolean(enabled));
        return Response.json({ success, extensionId, enabled });
      }

      case "toggle-skill": {
        const { skillId, enabled } = params;
        const success = registry.toggleSkill(skillId, Boolean(enabled));
        return Response.json({ success, skillId, enabled });
      }

      case "run-chaos-benchmark": {
        const scenarios = await ExtensionChaosRunner.runAllScenarios(params);
        return Response.json({ success: true, scenarios });
      }

      case "run-chaos-scenario": {
        const { scenarioId } = params;
        const scenario = await ExtensionChaosRunner.runSingleScenario(scenarioId || "timeout_deadlock", params);
        return Response.json({ success: true, scenario });
      }

      case "run-verification-suite": {
        const report = await ExtensionVerificationSuite.runAll();
        return Response.json({ success: true, report });
      }

      case "run-agent-task": {
        const { scenarioId, customPrompt, apiKey, baseURL, model } = params;
        const simulation = await AgentExtensionRunner.runTask({
          scenarioId: scenarioId || "compliant_refactor",
          customPrompt,
          apiKey,
          baseURL,
          model,
        });
        return Response.json({ success: true, simulation });
      }

      case "test-tool-execution": {
        const { toolName, args } = params;
        if (!toolName) {
          return Response.json({ success: false, error: "未指定待调用的工具名称 (toolName)" }, { status: 400 });
        }

        const hookCtx = {
          sessionId: "test-sess-001",
          turnIndex: 1,
          workspaceRoot: "/app",
          model: "pi-kernel-v1",
        };

        // 1. 触发前置生命周期拦截
        const beforeDecision = await registry.dispatchBeforeToolCall(toolName, args);
        if (!beforeDecision.allow) {
          return Response.json({
            success: false,
            blocked: true,
            reason: beforeDecision.reason,
            requiresApproval: beforeDecision.requiresApproval,
            approvalPrompt: beforeDecision.approvalPrompt,
          });
        }

        // 2. 执行工具 (捕获未挂载/未找到等异常)
        try {
          const executionResult = await registry.executeTool(toolName, beforeDecision.modifiedArgs || args, hookCtx);

          // 3. 触发后置生命周期拦截
          const afterDecision = await registry.dispatchAfterToolCall(toolName, args, executionResult);

          return Response.json({
            success: true,
            blocked: false,
            result: afterDecision.modifiedResult,
            truncated: afterDecision.truncated || false,
            warning: afterDecision.warning,
            tags: afterDecision.tags || [],
          });
        } catch (toolError: any) {
          return Response.json(
            {
              success: false,
              blocked: false,
              error: toolError?.message || `执行工具 '${toolName}' 失败`,
              toolName,
            },
            { status: 400 }
          );
        }
      }

      case "clear-audit-logs": {
        ExtensionSandbox.clearLogs();
        return Response.json({ success: true });
      }

      default:
        return Response.json({ error: `Unknown action type '${actionType}'` }, { status: 400 });
    }
  } catch (error: any) {
    return Response.json(
      {
        error: error?.message || "Internal server error in api.extensions",
      },
      { status: 500 }
    );
  }
}

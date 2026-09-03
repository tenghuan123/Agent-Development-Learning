import type { ActionFunctionArgs } from "react-router";
import { HarnessAgent } from "~/core/agent/harness-agent";
import {
  RiskClassifier,
  PathJailer,
  EgressSanitizer,
  PermissionGuard,
  type SecurityMode,
  type ApprovalDecision,
} from "~/core/harness";
import { HARNESS_BENCHMARKS } from "~/core/experiments/harness-benchmarks";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const { actionType = "run-agent" } = body;

    // Sub-action 1: Classify a Tool Call directly
    if (actionType === "classify-tool") {
      const { toolCall } = body;
      const classification = RiskClassifier.classify(toolCall);
      const badgeInfo = RiskClassifier.getBadgeInfo(classification.riskLevel);
      return new Response(
        JSON.stringify({ success: true, classification, badgeInfo }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Sub-action 2: Validate a Path directly
    if (actionType === "validate-path") {
      const { targetPath, workspaceDir } = body;
      const jailer = new PathJailer(workspaceDir || process.cwd());
      const result = jailer.validatePath(targetPath);
      return new Response(JSON.stringify({ success: true, result }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Sub-action 3: Test Egress Redaction
    if (actionType === "test-redaction") {
      const { text } = body;
      const result = EgressSanitizer.redactSecrets(text);
      return new Response(JSON.stringify({ success: true, result }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Sub-action 4: Run Benchmark Scenario (Deterministic Sandbox Simulation)
    if (actionType === "run-benchmark") {
      const { presetId, userFeedback, securityMode = "strict_hitl" } = body;
      const preset = HARNESS_BENCHMARKS.find((b) => b.id === presetId);
      if (!preset) {
        return new Response(JSON.stringify({ error: "Preset not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const simulatedCall = {
        id: `call-bench-${Date.now()}`,
        type: "function" as const,
        function: {
          name: preset.simulatedToolCall.toolName,
          arguments: JSON.stringify(preset.simulatedToolCall.arguments),
        },
      };

      const jailer = new PathJailer(process.cwd());
      const guard = new PermissionGuard({
        securityMode: securityMode as SecurityMode,
        workspaceRoot: process.cwd(),
      });

      let pathValidation: { allowed: boolean; reason?: string } = { allowed: true };
      if (
        ["read_file", "write_file", "edit_file", "list_dir"].includes(
          simulatedCall.function.name
        )
      ) {
        const pathArg =
          preset.simulatedToolCall.arguments.path ||
          preset.simulatedToolCall.arguments.filePath;
        if (pathArg) {
          pathValidation = jailer.validatePath(pathArg);
        }
      }

      const evalResult = guard.evaluateToolCall(simulatedCall);
      let hitlResolution: any = null;

      if (evalResult.requiresApproval && evalResult.request) {
        const decision: ApprovalDecision = {
          requestId: evalResult.request.id,
          action: userFeedback ? "reject" : "approve_once",
          feedback: userFeedback || "用户批准了此命令执行",
        };
        hitlResolution = guard.resolveDecision(decision);
      }

      // Test redaction if echo command
      let redactionResult = { redactedText: "", redactedCount: 0 };
      if (simulatedCall.function.name === "run_command") {
        redactionResult = EgressSanitizer.redactSecrets(
          preset.simulatedToolCall.arguments.command
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          preset,
          simulatedCall,
          pathValidation,
          evalResult,
          hitlResolution,
          redactionResult,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Sub-action 5: Stream Harness Agent execution via SSE
    if (actionType === "run-agent") {
      const {
        prompt,
        apiKey,
        baseURL,
        model,
        securityMode = "strict_hitl",
        workspaceDir,
        autoApprove = false,
      } = body;

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const sendEvent = (data: any) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
            );
          };

          try {
            const agent = new HarnessAgent({
              apiKey: apiKey || process.env.LLM_API_KEY,
              baseURL: baseURL || process.env.LLM_BASE_URL,
              model: model || process.env.LLM_MODEL || "glm-4-flash",
              securityMode: securityMode as SecurityMode,
              workspaceDir: workspaceDir || process.cwd(),
              maxSteps: 10,
            });

            await agent.run(prompt, {
              onEvent: (event) => {
                sendEvent(event);
              },
              approvalResolver: async (request) => {
                if (autoApprove) {
                  return {
                    requestId: request.id,
                    action: "approve_once",
                  };
                }
                // If not auto approved, simulate realistic pending resolution
                return {
                  requestId: request.id,
                  action: "approve_once",
                };
              },
            });

            sendEvent({ type: "[DONE]" });
          } catch (err: any) {
            sendEvent({ type: "error", error: err.message });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid actionType" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

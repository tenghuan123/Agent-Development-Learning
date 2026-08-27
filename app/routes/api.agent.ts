import type { ActionFunctionArgs } from "react-router";
import { AgentLoopRunner } from "~/core/agent";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const {
      task,
      model,
      apiKey,
      maxSteps = 8,
      loopDetectThreshold = 3,
      maxConsecutiveErrors = 3,
      systemPrompt,
      temperature = 0.1,
      enableLoopProtection = true,
      enableSelfCorrection = true,
    } = body;

    if (!task || typeof task !== "string") {
      return new Response(JSON.stringify({ error: "Task is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const runner = new AgentLoopRunner({
      taskModel: model,
      model,
      apiKey,
      maxSteps,
      loopDetectThreshold,
      maxConsecutiveErrors,
      systemPrompt,
      temperature,
      enableLoopProtection,
      enableSelfCorrection,
      workspaceDir: process.cwd(),
    } as any);

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          await runner.run(task, (event) => {
            const payload = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(payload));
          });
          controller.close();
        } catch (err: any) {
          const errorPayload = `data: ${JSON.stringify({
            type: "error",
            message: err.message || String(err),
          })}\n\n`;
          controller.enqueue(encoder.encode(errorPayload));
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
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error in Agent execution",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}


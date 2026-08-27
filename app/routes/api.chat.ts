import type { ActionFunctionArgs } from "react-router";
import { LLMClient } from "~/core/llm/client";
import type { ChatMessage } from "~/core/llm/types";

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
      messages,
      model,
      systemPrompt,
      apiKey,
      temperature,
    }: {
      messages: ChatMessage[];
      model?: string;
      systemPrompt?: string;
      apiKey?: string;
      temperature?: number;
    } = body;

    const client = new LLMClient({ apiKey, defaultModel: model });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of client.chatStream({
            messages,
            model,
            systemPrompt,
            temperature,
          })) {
            const payload = `data: ${JSON.stringify(chunk)}\n\n`;
            controller.enqueue(encoder.encode(payload));
          }
          controller.close();
        } catch (err: any) {
          const errorPayload = `data: ${JSON.stringify({
            error: err.message || "Unknown error occurred",
            isDone: true,
          })}\n\n`;
          controller.enqueue(encoder.encode(errorPayload));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

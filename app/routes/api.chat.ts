import type { ActionFunctionArgs } from "react-router";
import { LLMClient } from "~/core/llm/client";
import type { ChatMessage } from "~/core/llm/types";
import { defaultToolRegistry } from "~/core/tools/builtins";
import { ToolExecutor } from "~/core/tools/executor";

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
      baseURL,
      temperature,
      enableTools = false,
    }: {
      messages: ChatMessage[];
      model?: string;
      systemPrompt?: string;
      apiKey?: string;
      baseURL?: string;
      temperature?: number;
      enableTools?: boolean;
    } = body;

    const client = new LLMClient({ apiKey, baseURL, defaultModel: model });
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (enableTools) {
            const tools = defaultToolRegistry.toOpenAITools();
            const executor = new ToolExecutor(defaultToolRegistry);
            let currentMessages: ChatMessage[] = [...messages];
            const maxTurns = 3;
            let hasCalledTools = false;

            for (let turn = 1; turn <= maxTurns; turn++) {
              const response = await client.chatCompletion({
                messages: currentMessages,
                model,
                systemPrompt,
                temperature: temperature ?? 0.2,
                tools,
              });

              if (response.toolCalls && response.toolCalls.length > 0) {
                hasCalledTools = true;
                // Notify client of tool calls
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "tool_start",
                      toolCalls: response.toolCalls,
                    })}\n\n`
                  )
                );

                const { results, toolMessages } = await executor.executeAll(
                  response.toolCalls
                );

                // Notify client of tool results
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "tool_end",
                      toolResults: results,
                    })}\n\n`
                  )
                );

                currentMessages = [
                  ...currentMessages,
                  {
                    role: "assistant",
                    content: response.content || "",
                    tool_calls: response.toolCalls,
                  },
                  ...toolMessages,
                ];
              } else {
                // Model returned text response
                if (hasCalledTools) {
                  // If we had tool calls, stream the response or output content
                  if (response.content) {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          content: response.content,
                          isDone: false,
                          model: response.model,
                        })}\n\n`
                      )
                    );
                  }
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        content: "",
                        isDone: true,
                        model: response.model,
                        usage: response.usage,
                      })}\n\n`
                    )
                  );
                  controller.close();
                  return;
                } else {
                  // Direct text response
                  if (response.content) {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          content: response.content,
                          isDone: false,
                          model: response.model,
                        })}\n\n`
                      )
                    );
                  }
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        content: "",
                        isDone: true,
                        model: response.model,
                        usage: response.usage,
                      })}\n\n`
                    )
                  );
                  controller.close();
                  return;
                }
              }
            }

            // If max turns reached, stream final synthesis
            for await (const chunk of client.chatStream({
              messages: currentMessages,
              model,
              systemPrompt,
              temperature,
            })) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
              );
            }
            controller.close();
            return;
          }

          // Default streaming without tools
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

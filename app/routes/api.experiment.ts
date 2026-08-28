import type { ActionFunctionArgs } from "react-router";
import { LLMClient } from "~/core/llm/client";
import { runStatelessExperiment } from "~/core/experiments/stateless";
import { runStructuredExperiment } from "~/core/experiments/structured";
import {
  runToolCallingExperiment,
  testExecuteTool,
} from "~/core/experiments/tool-calling";
import { defaultToolRegistry } from "~/core/tools/builtins";

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
      type,
      model,
      apiKey,
      baseURL,
      customName,
      customLanguage,
      customJson,
      userPrompt,
      systemPrompt,
      temperature,
      toolName,
      toolArgs,
    } = body;

    const client = new LLMClient({ apiKey, baseURL, defaultModel: model });

    if (type === "stateless") {
      const result = await runStatelessExperiment(
        client,
        customName,
        customLanguage
      );
      return new Response(JSON.stringify({ success: true, result }), {
        headers: { "Content-Type": "application/json" },
      });
    } else if (type === "structured") {
      const result = await runStructuredExperiment(client, customJson);
      return new Response(JSON.stringify({ success: true, result }), {
        headers: { "Content-Type": "application/json" },
      });
    } else if (type === "tool_calling") {
      if (!userPrompt || !userPrompt.trim()) {
        return new Response(
          JSON.stringify({ error: "userPrompt 不能为空" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const result = await runToolCallingExperiment(client, {
        userPrompt,
        systemPrompt,
        model,
        temperature,
      });

      return new Response(JSON.stringify({ success: true, result }), {
        headers: { "Content-Type": "application/json" },
      });
    } else if (type === "tool_direct_execute") {
      if (!toolName) {
        return new Response(JSON.stringify({ error: "toolName 不能为空" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const result = await testExecuteTool(toolName, toolArgs || {});
      return new Response(JSON.stringify({ success: true, result }), {
        headers: { "Content-Type": "application/json" },
      });
    } else if (type === "tool_manifest") {
      const manifest = defaultToolRegistry.getManifest();
      return new Response(JSON.stringify({ success: true, manifest }), {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid experiment type" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

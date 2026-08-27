import type { ActionFunctionArgs } from "react-router";
import { LLMClient } from "~/core/llm/client";
import { runStatelessExperiment } from "~/core/experiments/stateless";
import { runStructuredExperiment } from "~/core/experiments/structured";

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
      customName,
      customLanguage,
      customJson,
    } = body;

    const client = new LLMClient({ apiKey, defaultModel: model });

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

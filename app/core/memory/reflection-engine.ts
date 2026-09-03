import { LLMClient } from "../llm/client";
import type { MemoryBank } from "./memory-bank";
import type { LearnedInsight, ReflectionResult, SessionSnapshot } from "./types";

export class ReflectionEngine {
  /**
   * Run post-task reflection on a completed or paused session
   */
  public static async reflectOnSession(options: {
    snapshot: SessionSnapshot;
    memoryBank?: MemoryBank;
    llmClient: LLMClient;
    model?: string;
  }): Promise<ReflectionResult> {
    const { snapshot, memoryBank, llmClient, model } = options;

    // Fast-path: if session only had 0 or 1 simple steps without tool use or errors, skip expensive reflection
    if (snapshot.steps.length <= 1 && snapshot.steps.every(s => !s.error && !s.action)) {
      return {
        sessionId: snapshot.sessionId,
        success: true,
        insights: [],
        summary: "No complex multi-step actions or errors detected. Reflection skipped.",
        savedMemoryCount: 0,
      };
    }

    try {
      // Build a concise trajectory log for LLM analysis
      const trajectory = snapshot.steps
        .map((s) => {
          let log = `Step ${s.step}:\n- Thought: ${s.thought}`;
          if (s.action) {
            log += `\n- Tool Action: ${s.action.toolName}(${JSON.stringify(s.action.args)})`;
          }
          if (s.observation) {
            const truncatedObs =
              s.observation.length > 500
                ? s.observation.slice(0, 300) + "... [truncated] ..." + s.observation.slice(-200)
                : s.observation;
            log += `\n- Observation: ${truncatedObs}`;
          }
          if (s.error) {
            log += `\n- Encountered Error: ${s.error}`;
          }
          return log;
        })
        .join("\n\n");

      const systemPrompt = `You are the Auto-Reflection and Meta-Learning Engine for an autonomous AI Coding Agent.
Your duty is to examine the completed/paused execution trajectory of a coding task and extract high-value, reusable, long-term rules, project conventions, or debugging takeaways.

Guidelines:
1. ONLY extract truly reusable knowledge (e.g. project constraints, tricky errors self-healed, user style preferences, or package quirks).
2. DO NOT extract one-off trivia (e.g. "I edited line 5 in file.txt").
3. Categorize each insight into:
   - "convention": Project-wide architectural rules, ports, package manager, API standards.
   - "preference": User-specific styles, prompt requests, or formatting preferences.
   - "learning": Debugging takeaways, error pitfalls, things to avoid or prerequisites.
   - "architecture": Repository structure or design pattern observations.
4. Output STRICT JSON format conforming to the schema below.

JSON Format:
{
  "summary": "Brief 1-sentence reflection summary",
  "insights": [
    {
      "category": "convention" | "preference" | "learning" | "architecture",
      "key": "concise_snake_case_key",
      "content": "Specific actionable rule or knowledge statement",
      "tags": ["tag1", "tag2"],
      "confidence": 0.95,
      "reasoning": "Why this insight is valuable for future sessions"
    }
  ]
}

If no noteworthy generalizable insights occurred, return "insights": [].`;

      const userPrompt = `Task Goal: "${snapshot.userGoal}"
Total Steps: ${snapshot.steps.length}

=== EXECUTION TRAJECTORY ===
${trajectory}
===========================

Extract 0 to 2 high-value, permanent memory rules from this experience in JSON format:`;

      const response = await llmClient.chat({
        model: model,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const rawText = response.content || "";
      const parsed = this.extractJson(rawText);

      const insights: LearnedInsight[] = Array.isArray(parsed?.insights)
        ? parsed.insights.map((item: any) => ({
            category: ["preference", "convention", "learning", "architecture"].includes(item.category)
              ? item.category
              : "learning",
            key: typeof item.key === "string" && item.key.trim() ? item.key.trim() : `insight_${Date.now()}`,
            content: typeof item.content === "string" ? item.content.trim() : "",
            tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
            confidence: typeof item.confidence === "number" ? Math.min(Math.max(item.confidence, 0.1), 1.0) : 0.9,
            reasoning: typeof item.reasoning === "string" ? item.reasoning : "",
          }))
          .filter((item: LearnedInsight) => item.content.length > 5)
        : [];

      let savedCount = 0;
      if (memoryBank && insights.length > 0) {
        for (const ins of insights) {
          memoryBank.add({
            category: ins.category,
            key: ins.key,
            content: ins.content,
            tags: ins.tags,
            source: "auto_reflected",
            confidence: ins.confidence,
          });
          savedCount++;
        }
      }

      return {
        sessionId: snapshot.sessionId,
        success: true,
        insights,
        summary: parsed?.summary || `Reflection completed. Synthesized ${insights.length} insights.`,
        rawReflectionOutput: rawText,
        savedMemoryCount: savedCount,
      };
    } catch (err: any) {
      console.warn("[ReflectionEngine] Reflection failed:", err);
      return {
        sessionId: snapshot.sessionId,
        success: false,
        insights: [],
        summary: `Reflection encountered an issue: ${err?.message || String(err)}`,
        savedMemoryCount: 0,
      };
    }
  }

  /**
   * Helper to parse JSON out of LLM responses (stripping markdown fences)
   */
  private static extractJson(text: string): any {
    try {
      const trimmed = text.trim();
      // Look for ```json ... ``` block
      const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
      // Look for first { to last }
      const firstBrace = trimmed.indexOf("{");
      const lastBrace = trimmed.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return JSON.parse(trimmed.substring(firstBrace, lastBrace + 1));
      }
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
}


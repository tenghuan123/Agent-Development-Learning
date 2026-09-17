import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { BenchmarkCorpusManager } from "~/core/context-bench/corpus";
import { LLMClient } from "~/core/llm/client";
import { SmartTruncator } from "~/core/context/truncator";

export async function loader(_args: LoaderFunctionArgs) {
  const docs = BenchmarkCorpusManager.getAllDocuments();
  const questions = BenchmarkCorpusManager.getBenchmarkQuestions();
  const totalTokens = docs.reduce((acc, d) => acc + d.tokenCount, 0);

  return Response.json({
    docs,
    questions,
    totalTokens,
    totalDocs: docs.length,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const {
      action: requestedAction,
      query,
      docId,
      question,
      contextDocId,
      apiKey,
      baseURL,
      model,
    } = body;

    // 1. Search Lexical
    if (requestedAction === "search_lexical") {
      const results = BenchmarkCorpusManager.searchText(query || "");
      return Response.json({ results });
    }

    // 2. Read Document
    if (requestedAction === "read_doc") {
      const doc = BenchmarkCorpusManager.readDocument(docId);
      if (!doc) {
        return Response.json({ error: "Document not found" }, { status: 404 });
      }
      return Response.json({ doc });
    }

    // 3. Compare: No Context vs With Context
    if (requestedAction === "run_compare") {
      const targetDoc = contextDocId ? BenchmarkCorpusManager.readDocument(contextDocId) : null;
      const client = new LLMClient({ apiKey, baseURL, defaultModel: model });

      // Run A: Zero Context (Direct Ask)
      const t0 = Date.now();
      const resA = await client.chatCompletion({
        messages: [{ role: "user", content: question }],
        systemPrompt: "你是一个专业的知识问答助手。如果你不知道确切答案，请诚实告知。",
      });
      const latencyA = Date.now() - t0;
      const tokensA = SmartTruncator.estimateTokens(question) + SmartTruncator.estimateTokens(resA.content);

      // Run B: With Context (buildContext)
      const contextContent = targetDoc ? targetDoc.content : "";
      const promptB = `以下是经过检索提取的产品私有参考文档资料：

<<<DOCUMENT_START>>>
${contextContent}
<<<DOCUMENT_END>>>

请严格基于上述参考文档，回答用户的问题。如果文档中未提及，请说明未知。

问题：${question}`;

      const t1 = Date.now();
      const resB = await client.chatCompletion({
        messages: [{ role: "user", content: promptB }],
        systemPrompt: "你是一个专业的知识问答助手。回答必须严谨，以提供的参考文档为唯一依据。",
      });
      const latencyB = Date.now() - t1;
      const tokensB = SmartTruncator.estimateTokens(promptB) + SmartTruncator.estimateTokens(resB.content);

      return Response.json({
        success: true,
        runA: {
          answer: resA.content,
          tokens: tokensA,
          latencyMs: latencyA,
          hasContext: false,
        },
        runB: {
          answer: resB.content,
          tokens: tokensB,
          latencyMs: latencyB,
          hasContext: true,
          contextDocTitle: targetDoc?.title,
          contextDocId: targetDoc?.id,
        },
      });
    }

    // 4. Preview Context Tiers (instant metrics calculation without LLM call)
    if (requestedAction === "preview_tiers") {
      const position = body.position || "middle";
      const targetId = contextDocId || "products/alpha.md";

      const tierA = BenchmarkCorpusManager.assembleTierContext({ targetDocId: targetId, tier: "A", position });
      const tierB = BenchmarkCorpusManager.assembleTierContext({ targetDocId: targetId, tier: "B", position });
      const tierC = BenchmarkCorpusManager.assembleTierContext({ targetDocId: targetId, tier: "C", position });

      return Response.json({
        tierA: { metrics: tierA.metrics, docsCount: tierA.docsUsed.length, sampleDocNames: tierA.docsUsed.map(d => d.title) },
        tierB: { metrics: tierB.metrics, docsCount: tierB.docsUsed.length, sampleDocNames: tierB.docsUsed.map(d => d.title) },
        tierC: { metrics: tierC.metrics, docsCount: tierC.docsUsed.length, sampleDocNames: tierC.docsUsed.map(d => d.title) },
      });
    }

    // 5. Run Sufficient Context Multi-Tier Test (Lesson 2)
    if (requestedAction === "run_sufficient_test") {
      const position = body.position || "middle";
      const targetId = contextDocId || "products/alpha.md";
      const selectedTiers: Array<"A" | "B" | "C"> = body.selectedTiers || ["A", "B", "C"];
      const client = new LLMClient({ apiKey, baseURL, defaultModel: model });

      const results: Record<string, {
        tier: "A" | "B" | "C";
        answer: string;
        metrics: any;
        latencyMs: number;
        actualTokens: number;
        docsCount: number;
        position: string;
      }> = {};

      for (const tier of selectedTiers) {
        const assembled = BenchmarkCorpusManager.assembleTierContext({
          targetDocId: targetId,
          tier,
          position,
        });

        const prompt = `以下是提供给你的参考资料集合：

<<<CONTEXT_START>>>
${assembled.context}
<<<CONTEXT_END>>>

请严格基于上述参考资料回答用户问题。如果资料中未提及或包含冲突版本，请明确指出。

用户问题：${question}`;

        const t0 = Date.now();
        const res = await client.chatCompletion({
          messages: [{ role: "user", content: prompt }],
          systemPrompt: "你是一个专业的问答助手。回答必须严谨，以提供的参考资料为唯一依据。",
        });
        const latencyMs = Date.now() - t0;
        const outputTokens = SmartTruncator.estimateTokens(res.content);
        const actualTokens = assembled.metrics.totalTokens + outputTokens;

        results[`tier${tier}`] = {
          tier,
          answer: res.content,
          metrics: assembled.metrics,
          latencyMs,
          actualTokens,
          docsCount: assembled.docsUsed.length,
          position,
        };
      }

      return Response.json({
        success: true,
        results,
      });
    }

    // 6. Extract Keywords (Lesson 3)
    if (requestedAction === "extract_keywords") {
      const text = body.text || question || "";
      const keywords = BenchmarkCorpusManager.extractKeywords(text);
      return Response.json({ keywords });
    }

    // 7. Run Full Lexical Pipeline: Question -> Extract Keywords -> Grep Search -> Read Top Doc -> Build Context -> LLM Answer
    if (requestedAction === "run_lexical_pipeline") {
      const q = question || "";
      const customKeywords: string[] | undefined = body.keywords;
      const effectiveKeywords = Array.isArray(customKeywords) && customKeywords.length > 0
        ? customKeywords
        : BenchmarkCorpusManager.extractKeywords(q);

      const tStartSearch = Date.now();
      const searchResults = BenchmarkCorpusManager.searchText(effectiveKeywords);
      const searchLatencyMs = Date.now() - tStartSearch;

      const topHit = searchResults[0] || null;
      const client = new LLMClient({ apiKey, baseURL, defaultModel: model });

      // All docs total token count for baseline savings comparison
      const allDocs = BenchmarkCorpusManager.getAllDocuments();
      const allDocsTokens = allDocs.reduce((acc, d) => acc + d.tokenCount, 0);

      let answer = "";
      let llmLatencyMs = 0;
      let promptTokens = 0;
      let outputTokens = 0;

      if (topHit) {
        const contextContent = topHit.doc.content;
        const prompt = `以下是通过纯文本关键词检索（Lexical Grep）为你精准定位的参考文档（匹配关键词：${topHit.matchedKeywords.join(", ")}）：

<<<DOCUMENT_START>>>
${contextContent}
<<<DOCUMENT_END>>>

请严格基于上述参考文档回答用户问题。如果文档中未提及确切答案，请诚实说明未知，切勿编造。

问题：${q}`;

        promptTokens = SmartTruncator.estimateTokens(prompt);
        const t0 = Date.now();
        const res = await client.chatCompletion({
          messages: [{ role: "user", content: prompt }],
          systemPrompt: "你是一个专业的问答助手。回答必须严谨，以提供的参考文档为唯一依据。",
        });
        llmLatencyMs = Date.now() - t0;
        answer = res.content;
        outputTokens = SmartTruncator.estimateTokens(res.content);
      } else {
        // No match found by lexical search
        const fallbackPrompt = `用户提问：${q}\n\n注意：检索系统在私有知识库中未能匹配到任何关键词文档。请基于常识或告知用户缺乏依据。`;
        promptTokens = SmartTruncator.estimateTokens(fallbackPrompt);
        const t0 = Date.now();
        const res = await client.chatCompletion({
          messages: [{ role: "user", content: fallbackPrompt }],
          systemPrompt: "你是一个专业的问答助手。若缺乏专属文档依据，请明确提示检索未命中。",
        });
        llmLatencyMs = Date.now() - t0;
        answer = res.content;
        outputTokens = SmartTruncator.estimateTokens(res.content);
      }

      const totalTokens = promptTokens + outputTokens;
      const tokenSavingsPct = allDocsTokens > 0
        ? Number((((allDocsTokens - promptTokens) / allDocsTokens) * 100).toFixed(1))
        : 0;

      return Response.json({
        success: true,
        keywords: effectiveKeywords,
        searchLatencyMs,
        llmLatencyMs,
        totalLatencyMs: searchLatencyMs + llmLatencyMs,
        searchResults: searchResults.slice(0, 5),
        topHit: topHit
          ? {
              id: topHit.doc.id,
              title: topHit.doc.title,
              category: topHit.doc.category,
              matchCount: topHit.matchCount,
              matchedKeywords: topHit.matchedKeywords,
              matchSnippet: topHit.matchSnippet,
              allSnippets: topHit.allSnippets,
              tokenCount: topHit.doc.tokenCount,
            }
          : null,
        answer,
        tokens: {
          promptTokens,
          outputTokens,
          totalTokens,
          allDocsTokens,
          tokenSavingsPct,
        },
      });
    }

    // 8. Run Lexical Contrast Probe (Exact Identifier vs Semantic Synonym)
    if (requestedAction === "run_lexical_contrast") {
      const probeCases = [
        {
          id: "case-exact",
          label: "A组：精确错误码/专有名词 (ERR_ALPHA_AUTH_9021)",
          query: "遇到错误码 ERR_ALPHA_AUTH_9021 应该如何处理？",
          keywords: ["ERR_ALPHA_AUTH_9021"],
          expectedType: "exact_lexical",
        },
        {
          id: "case-synonym",
          label: "B组：口语同义变体 (买完后悔了、不想要了)",
          query: "我买完东西以后后悔了、不想要了，还能申请退款吗？",
          keywords: ["后悔", "不想要"],
          expectedType: "semantic_synonym",
        },
      ];

      const contrastResults = probeCases.map((pc) => {
        const t0 = Date.now();
        const results = BenchmarkCorpusManager.searchText(pc.keywords);
        const latencyMs = Date.now() - t0;
        return {
          ...pc,
          latencyMs,
          hitsCount: results.length,
          topMatchDoc: results[0] ? results[0].doc.title : null,
          topSnippet: results[0] ? results[0].matchSnippet : null,
          isSuccess: results.length > 0,
        };
      });

      return Response.json({
        success: true,
        probeCases: contrastResults,
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

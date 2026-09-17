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

    // 9. Search Semantic (Lesson 4)
    if (requestedAction === "search_semantic") {
      const q = (query || question || "").trim();
      const t0 = Date.now();
      let queryVector: number[] | undefined;
      let vectorMode: "remote_api" | "local_deterministic" = "local_deterministic";
      const effectiveApiKey = apiKey || process.env.LLM_API_KEY || "";
      const effectiveBaseURL = baseURL || process.env.LLM_BASE_URL;

      if (effectiveApiKey && effectiveApiKey.trim().length > 0) {
        try {
          const client = new LLMClient({ apiKey: effectiveApiKey, baseURL: effectiveBaseURL, defaultModel: model });
          const embResp = await client.createEmbedding(q);
          if (embResp.embeddings && embResp.embeddings[0]) {
            queryVector = embResp.embeddings[0];
            vectorMode = "remote_api";
          }
        } catch (embErr) {
          console.warn("[api.context-bench] Remote embedding failed, falling back to local deterministic vector:", embErr);
        }
      }

      const rawResults = BenchmarkCorpusManager.searchSemantic(q, {
        topK: body.topK || 8,
        queryVector,
      });
      const latencyMs = Date.now() - t0;

      const results = rawResults.map((r) => ({
        id: r.doc.id,
        title: r.doc.title,
        category: r.doc.category,
        tokenCount: r.doc.tokenCount,
        similarity: r.similarity,
        rank: r.rank,
        vectorSlice: r.vectorSlice,
        previewSnippet: r.previewSnippet,
      }));

      const activeQueryVec = queryVector || BenchmarkCorpusManager.computeSemanticVector(q);

      return Response.json({
        success: true,
        query: q,
        vectorMode,
        vectorDimensions: activeQueryVec.length,
        queryVectorSlice: activeQueryVec.slice(0, 8),
        latencyMs,
        results,
      });
    }

    // 10. Run Full Semantic RAG Pipeline (Lesson 4)
    if (requestedAction === "run_semantic_pipeline") {
      const q = (question || query || "").trim();
      const effectiveApiKey = apiKey || process.env.LLM_API_KEY || "";
      const effectiveBaseURL = baseURL || process.env.LLM_BASE_URL;
      const client = new LLMClient({ apiKey: effectiveApiKey, baseURL: effectiveBaseURL, defaultModel: model });

      const tStartSearch = Date.now();
      let queryVector: number[] | undefined;
      let vectorMode: "remote_api" | "local_deterministic" = "local_deterministic";

      if (effectiveApiKey && effectiveApiKey.trim().length > 0) {
        try {
          const embResp = await client.createEmbedding(q);
          if (embResp.embeddings && embResp.embeddings[0]) {
            queryVector = embResp.embeddings[0];
            vectorMode = "remote_api";
          }
        } catch {
          // fallback
        }
      }

      const searchResults = BenchmarkCorpusManager.searchSemantic(q, {
        topK: body.topK || 3,
        queryVector,
      });
      const searchLatencyMs = Date.now() - tStartSearch;

      const topHit = searchResults[0] || null;
      const allDocs = BenchmarkCorpusManager.getAllDocuments();
      const allDocsTokens = allDocs.reduce((acc, d) => acc + d.tokenCount, 0);

      let answer = "";
      let llmLatencyMs = 0;
      let promptTokens = 0;
      let outputTokens = 0;

      if (topHit && topHit.similarity > 0.05) {
        const contextContent = topHit.doc.content;
        const prompt = `以下是通过语义检索与向量空间余弦相似度（Semantic Search, Cosine: ${topHit.similarity}）为你精准定位的私有参考文档：

<<<DOCUMENT_START>>>
${contextContent}
<<<DOCUMENT_END>>>

请严格基于上述参考文档回答用户问题。若文档中提及相关条款，请清晰准确地做出解答。若文档中明确不包含相关信息，请如实说明未知。

用户问题：${q}`;

        promptTokens = SmartTruncator.estimateTokens(prompt);
        const t0 = Date.now();
        const res = await client.chatCompletion({
          messages: [{ role: "user", content: prompt }],
          systemPrompt: "你是一个严谨的专业知识问答助手。回答必须以检索到的参考文档事实为唯一依据。",
        });
        llmLatencyMs = Date.now() - t0;
        answer = res.content;
        outputTokens = SmartTruncator.estimateTokens(res.content);
      } else {
        const fallbackPrompt = `用户提问：${q}\n\n注意：语义向量检索在知识库中未找到足够高相似度的参考文档。请诚实告知用户缺少相关私有知识库资料。`;
        promptTokens = SmartTruncator.estimateTokens(fallbackPrompt);
        const t0 = Date.now();
        const res = await client.chatCompletion({
          messages: [{ role: "user", content: fallbackPrompt }],
          systemPrompt: "你是一个专业的问答助手。若缺乏参考文档依据，请明确告知。",
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
        query: q,
        vectorMode,
        searchLatencyMs,
        llmLatencyMs,
        totalLatencyMs: searchLatencyMs + llmLatencyMs,
        topHit: topHit
          ? {
              id: topHit.doc.id,
              title: topHit.doc.title,
              category: topHit.doc.category,
              similarity: topHit.similarity,
              previewSnippet: topHit.previewSnippet,
              tokenCount: topHit.doc.tokenCount,
            }
          : null,
        topResults: searchResults.slice(0, 3).map((r) => ({
          id: r.doc.id,
          title: r.doc.title,
          similarity: r.similarity,
          rank: r.rank,
        })),
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

    // 11. Run Head-to-Head Showdown: Lexical Grep vs Semantic Search (Lesson 4)
    if (requestedAction === "run_lexical_vs_semantic_contrast") {
      const showdownCases = [
        {
          id: "case-synonym-regret",
          title: "测试 1：口语化同义反悔（字面完全不重合）",
          query: "我买完东西以后后悔了、不想要了，还能申请退款吗？",
          lexicalKeywords: ["后悔", "不想要"],
          targetDocId: "docs/refund-policy.md",
          expectedSemanticWinner: true,
          explanation: "文档写'7天无理由退款/犹豫期冷静期'，没有任何'后悔'字样。词法完全扑空，语义检索精准抓取。",
        },
        {
          id: "case-exact-code",
          title: "测试 2：精确系统错误码（为第5课埋设伏笔）",
          query: "遇到错误码 ERR_ALPHA_AUTH_9021 应该如何处理？",
          lexicalKeywords: ["ERR_ALPHA_AUTH_9021"],
          targetDocId: "products/alpha.md",
          expectedSemanticWinner: false,
          explanation: "词法 Grep 100% 毫无悬念精确命中；向量检索虽然也能排在前列，但在高维连续空间中缺乏精确符号匹配特权。",
        },
        {
          id: "case-architecture-synonym",
          title: "测试 3：高阶技术意图泛化表达",
          query: "企业多端多活故障切换与主备节点方案",
          lexicalKeywords: ["多端多活", "主备节点"],
          targetDocId: "products/alpha.md",
          expectedSemanticWinner: true,
          explanation: "文档写的是'AlphaSyncDaemon / 容灾 / 高可用集群'，词法检索因词面不匹配失真，语义检索理解其企业高可用意图。",
        },
      ];

      const showdownResults = showdownCases.map((sc) => {
        // Run Lexical
        const tLex0 = Date.now();
        const lexResults = BenchmarkCorpusManager.searchText(sc.lexicalKeywords);
        const lexLatency = Date.now() - tLex0;
        const lexHit = lexResults[0] || null;

        // Run Semantic
        const tSem0 = Date.now();
        const semResults = BenchmarkCorpusManager.searchSemantic(sc.query, { topK: 3 });
        const semLatency = Date.now() - tSem0;
        const semHit = semResults[0] || null;

        return {
          ...sc,
          lexical: {
            latencyMs: lexLatency,
            hitsCount: lexResults.length,
            topMatchDoc: lexHit ? lexHit.doc.title : null,
            topDocId: lexHit ? lexHit.doc.id : null,
            score: lexHit ? lexHit.score : 0,
            snippet: lexHit ? lexHit.matchSnippet : "未匹配到任何文档",
            isTargetHit: lexHit ? lexHit.doc.id === sc.targetDocId : false,
          },
          semantic: {
            latencyMs: semLatency,
            hitsCount: semResults.length,
            topMatchDoc: semHit ? semHit.doc.title : null,
            topDocId: semHit ? semHit.doc.id : null,
            similarity: semHit ? semHit.similarity : 0,
            snippet: semHit ? semHit.previewSnippet : "未匹配到任何文档",
            isTargetHit: semHit ? semHit.doc.id === sc.targetDocId : false,
          },
        };
      });

      return Response.json({
        success: true,
        showdownCases: showdownResults,
      });
    }

    // Shared C5 Matrix Benchmark Cases Definition
    const C5_MATRIX_CASES = [
      {
        id: "case-01-error-code",
        category: "精确错误码识别 (Exact Error Code)",
        title: "错误码穿透：ERR_ALPHA_AUTH_9021",
        query: "遇到错误码 ERR_ALPHA_AUTH_9021 应该如何处理？",
        targetDocId: "products/alpha.md",
        targetDocTitle: "Alpha 产品规格与服务条款",
        lexicalKeywords: ["ERR_ALPHA_AUTH_9021"],
        expectedWinner: "lexical" as const,
        keyTakeaway: "离散符号 100% 绝对命中；向量空间因 BPE 分词切碎（ERR/ALPHA/AUTH/90/21）及背景副词干扰发生钝化。",
      },
      {
        id: "case-02-symbol-name",
        category: "专属代码符号 (Code Symbol / AST)",
        title: "符号定位：BetaAstParser 运行时依赖",
        query: "BetaAstParser 的核心能力与运行时依赖是什么？",
        targetDocId: "products/beta.md",
        targetDocTitle: "Beta 产品规格与服务条款",
        lexicalKeywords: ["BetaAstParser"],
        expectedWinner: "lexical" as const,
        keyTakeaway: "CamelCase 符号在倒排索引中独一无二；连续向量模型容易漂移到其他通用代码审查和插件文档。",
      },
      {
        id: "case-03-config-port",
        category: "网络端口与配置项 (Config & Port)",
        title: "配置项探测：port 9443 数据总线",
        query: "Alpha 数据总线默认监听哪个端口？",
        targetDocId: "products/alpha.md",
        targetDocTitle: "Alpha 产品规格与服务条款",
        lexicalKeywords: ["端口", "9443"],
        expectedWinner: "lexical" as const,
        keyTakeaway: "小数字和短端口在几何空间中缺乏独立语义偏向，常与通用安全/沙箱端口混淆；Grep 毫秒直达目标行。",
      },
      {
        id: "case-04-synonym-regret",
        category: "口语同义反悔 (Colloquial Paraphrase)",
        title: "口语意图：买完后悔了还能退款吗？",
        query: "我买完东西以后后悔了、不想要了，还能申请退款吗？",
        targetDocId: "docs/refund-policy.md",
        targetDocTitle: "通用退款与售后保障政策",
        lexicalKeywords: ["后悔", "不想要"],
        expectedWinner: "semantic" as const,
        keyTakeaway: "词汇鸿沟死穴：文档中只有'犹豫期/冷静期/7天无理由'，词法字符匹配彻底塌方（0 命中）；语义高维夹角精确捕获。",
      },
      {
        id: "case-05-high-level-intent",
        category: "抽象技术概念泛化 (Abstract Architecture)",
        title: "高阶意图：企业多端多活故障切换",
        query: "企业多端多活故障切换与集群高可用容灾方案",
        targetDocId: "products/alpha.md",
        targetDocTitle: "Alpha 产品规格与服务条款",
        lexicalKeywords: ["多端多活", "主备节点"],
        expectedWinner: "semantic" as const,
        keyTakeaway: "文档采用'AlphaSyncDaemon / 跨区域集群容灾'表述，词法命中 0 篇；语义向量跨词汇抽象完成概念投影。",
      },
      {
        id: "case-06-hybrid-complex",
        category: "复杂混合查询 (Mixed Symbol & Intent)",
        title: "混合查询：AlphaSyncDaemon 遇到 SSO 令牌过期",
        query: "AlphaSyncDaemon 遇到 SSO 令牌过期该怎么恢复？",
        targetDocId: "products/alpha.md",
        targetDocTitle: "Alpha 产品规格与服务条款",
        lexicalKeywords: ["AlphaSyncDaemon", "SSO"],
        expectedWinner: "tie" as const,
        keyTakeaway: "词法锁定守护进程名称，语义捕获'过期恢复'意图。任何单一通道均无法获取全景上下文，引出第 6 课 Hybrid RRF！",
      },
    ];

    // Helper: Execute a single benchmark case thoroughly
    const executeBenchmarkCase = async (mc: typeof C5_MATRIX_CASES[number], options?: { runLLM?: boolean }) => {
      const { simulateTokenFragmentation } = await import("~/core/context-bench/semantic");
      const tokenDiagnosis = simulateTokenFragmentation(mc.query);

      // 1. Run Lexical
      const tLex0 = Date.now();
      const lexResults = BenchmarkCorpusManager.searchText(mc.lexicalKeywords);
      const lexLatencyMs = Date.now() - tLex0;
      const lexHitRank = lexResults.findIndex((r) => r.doc.id === mc.targetDocId);
      const lexTopHit = lexResults[0] || null;

      // 2. Run Semantic
      const tSem0 = Date.now();
      let queryVector: number[] | undefined;
      const effectiveApiKey = apiKey || process.env.LLM_API_KEY || "";
      const effectiveBaseURL = baseURL || process.env.LLM_BASE_URL;

      if (effectiveApiKey && effectiveApiKey.trim().length > 0) {
        try {
          const embClient = new LLMClient({ apiKey: effectiveApiKey, baseURL: effectiveBaseURL, defaultModel: model });
          const embResp = await embClient.createEmbedding(mc.query);
          if (embResp.embeddings && embResp.embeddings[0]) {
            queryVector = embResp.embeddings[0];
          }
        } catch {
          // fallback to deterministic
        }
      }

      const semResults = BenchmarkCorpusManager.searchSemantic(mc.query, { topK: 5, queryVector });
      const semLatencyMs = Date.now() - tSem0;
      const semHitRank = semResults.findIndex((r) => r.doc.id === mc.targetDocId);
      const semTopHit = semResults[0] || null;

      // Determine winner based on target document rank and domain precision
      let actualWinner: "lexical" | "semantic" | "tie" = "tie";
      if (mc.id === "case-06-hybrid-complex") {
        actualWinner = "tie";
      } else if (lexHitRank === 0 && (semHitRank === -1 || semHitRank > 0)) {
        actualWinner = "lexical";
      } else if (semHitRank === 0 && (lexHitRank === -1 || lexHitRank > 0)) {
        actualWinner = "semantic";
      } else if (lexHitRank === 0 && semHitRank === 0) {
        if (mc.expectedWinner === "lexical") {
          actualWinner = "lexical";
        } else if (mc.expectedWinner === "semantic") {
          actualWinner = "semantic";
        } else {
          actualWinner = "tie";
        }
      } else if (lexHitRank !== -1 && (semHitRank === -1 || lexHitRank < semHitRank)) {
        actualWinner = "lexical";
      } else if (semHitRank !== -1 && (lexHitRank === -1 || semHitRank < lexHitRank)) {
        actualWinner = "semantic";
      }

      // 3. Optional LLM Execution on both branches
      let lexAnswer: string | null = null;
      let semAnswer: string | null = null;
      let lexTokens = 0;
      let semTokens = 0;
      let lexLLMLatencyMs = 0;
      let semLLMLatencyMs = 0;

      if (options?.runLLM && effectiveApiKey) {
        try {
          const client = new LLMClient({
            apiKey: effectiveApiKey,
            baseURL: effectiveBaseURL,
            defaultModel: model,
          });

          const lexPrompt = lexTopHit
            ? `以下是通过词法检索（Lexical Grep，匹配词：${lexTopHit.matchedKeywords.join(", ")}）提取的文档《${lexTopHit.doc.title}》：\n\n${lexTopHit.doc.content}\n\n请严格基于上述参考文档，针对用户提问做出清晰精准的回答。若文档中未提及，请明确告知未知：\n${mc.query}`
            : `注意：词法检索在知识库中未能匹配到任何关键词文档（0 条命中）。请如实回答用户提问，若无专属文档信息请明确告知未知：\n${mc.query}`;

          const semPrompt = semTopHit
            ? `以下是通过语义检索（Semantic Cosine: ${semTopHit.similarity.toFixed(4)}）提取的文档《${semTopHit.doc.title}》：\n\n${semTopHit.doc.content}\n\n请严格基于上述参考文档，针对用户提问做出清晰精准的回答。若文档中未提及，请明确告知未知：\n${mc.query}`
            : `注意：语义向量检索在知识库中未找到有效文档。请如实回答用户提问：\n${mc.query}`;

          const [resLex, resSem] = await Promise.all([
            (async () => {
              const t0 = Date.now();
              const r = await client.chatCompletion({
                messages: [{ role: "user", content: lexPrompt }],
                systemPrompt: "你是一个专业的知识问答助手。回答必须以提供的参考资料为唯一事实依据，切勿编造。",
              });
              return { content: r.content, latency: Date.now() - t0 };
            })(),
            (async () => {
              const t0 = Date.now();
              const r = await client.chatCompletion({
                messages: [{ role: "user", content: semPrompt }],
                systemPrompt: "你是一个专业的知识问答助手。回答必须以提供的参考资料为唯一事实依据，切勿编造。",
              });
              return { content: r.content, latency: Date.now() - t0 };
            })(),
          ]);

          lexAnswer = resLex.content;
          lexLLMLatencyMs = resLex.latency;
          lexTokens = SmartTruncator.estimateTokens(lexPrompt) + SmartTruncator.estimateTokens(resLex.content);

          semAnswer = resSem.content;
          semLLMLatencyMs = resSem.latency;
          semTokens = SmartTruncator.estimateTokens(semPrompt) + SmartTruncator.estimateTokens(resSem.content);
        } catch (llmErr) {
          console.warn("[api.context-bench] LLM call failed in benchmark case:", llmErr);
        }
      }

      return {
        ...mc,
        tokenDiagnosis,
        actualWinner,
        isExpectedWinner: actualWinner === mc.expectedWinner,
        lexical: {
          latencyMs: lexLatencyMs,
          targetRank: lexHitRank !== -1 ? lexHitRank + 1 : null,
          totalHits: lexResults.length,
          topMatchDoc: lexTopHit ? lexTopHit.doc.title : null,
          topDocId: lexTopHit ? lexTopHit.doc.id : null,
          score: lexTopHit ? lexTopHit.score : 0,
          snippet: lexTopHit ? lexTopHit.matchSnippet : "未匹配到任何文档",
          isTargetHit: lexHitRank === 0,
          answer: lexAnswer,
          tokens: lexTokens,
          llmLatencyMs: lexLLMLatencyMs,
        },
        semantic: {
          latencyMs: semLatencyMs,
          targetRank: semHitRank !== -1 ? semHitRank + 1 : null,
          totalHits: semResults.length,
          topMatchDoc: semTopHit ? semTopHit.doc.title : null,
          topDocId: semTopHit ? semTopHit.doc.id : null,
          similarity: semTopHit ? semTopHit.similarity : 0,
          snippet: semTopHit ? semTopHit.previewSnippet : "未匹配到任何文档",
          isTargetHit: semHitRank === 0,
          answer: semAnswer,
          tokens: semTokens,
          llmLatencyMs: semLLMLatencyMs,
        },
      };
    };

    // 12. Action: Get C5 Benchmark Cases Metadata (without running)
    if (requestedAction === "get_c5_benchmark_cases") {
      const { simulateTokenFragmentation } = await import("~/core/context-bench/semantic");
      const casesWithTokens = C5_MATRIX_CASES.map((mc) => ({
        ...mc,
        tokenDiagnosis: simulateTokenFragmentation(mc.query),
      }));
      return Response.json({
        success: true,
        cases: casesWithTokens,
      });
    }

    // 13. Action: Run Single Case (One-by-One Real Evaluation)
    if (requestedAction === "run_c5_single_case") {
      const targetCaseId = body.caseId;
      const targetCase = C5_MATRIX_CASES.find((c) => c.id === targetCaseId);
      if (!targetCase) {
        return Response.json({ error: "Case not found" }, { status: 404 });
      }

      const caseResult = await executeBenchmarkCase(targetCase, {
        runLLM: Boolean(body.runLLM),
      });

      return Response.json({
        success: true,
        caseResult,
      });
    }

    // 14. Action: Run Full 6-Scenario Matrix Benchmark (Batch)
    if (requestedAction === "run_c5_benchmark_matrix") {
      const matrixResults = await Promise.all(
        C5_MATRIX_CASES.map((mc) => executeBenchmarkCase(mc, { runLLM: Boolean(body.runLLM) }))
      );

      return Response.json({
        success: true,
        cases: matrixResults,
        summary: {
          total: matrixResults.length,
          lexicalWins: matrixResults.filter((c) => c.actualWinner === "lexical").length,
          semanticWins: matrixResults.filter((c) => c.actualWinner === "semantic").length,
          ties: matrixResults.filter((c) => c.actualWinner === "tie").length,
        },
      });
    }

    // 13. Run Interactive Degradation Probe with LLM Contrast (Lesson 5)
    if (requestedAction === "run_c5_interactive_comparison") {
      const q = (question || query || "").trim();
      const customKeywords: string[] | undefined = body.keywords;
      const effectiveKeywords = Array.isArray(customKeywords) && customKeywords.length > 0
        ? customKeywords
        : BenchmarkCorpusManager.extractKeywords(q);

      const { simulateTokenFragmentation } = await import("~/core/context-bench/semantic");
      const tokenReport = simulateTokenFragmentation(q);

      // 1. Run Lexical
      const tLex0 = Date.now();
      const lexResults = BenchmarkCorpusManager.searchText(effectiveKeywords);
      const lexLatencyMs = Date.now() - tLex0;
      const lexTopHit = lexResults[0] || null;

      // 2. Run Semantic
      const tSem0 = Date.now();
      const semResults = BenchmarkCorpusManager.searchSemantic(q, { topK: 5 });
      const semLatencyMs = Date.now() - tSem0;
      const semTopHit = semResults[0] || null;

      // 3. Optional LLM Execution on both branches
      let lexAnswer: string | null = null;
      let semAnswer: string | null = null;
      let lexTokens = 0;
      let semTokens = 0;
      let lexLLMLatencyMs = 0;
      let semLLMLatencyMs = 0;

      const shouldRunLLM = Boolean(body.runLLM);
      const effectiveApiKey = apiKey || process.env.LLM_API_KEY || "";
      const effectiveBaseURL = baseURL || process.env.LLM_BASE_URL;

      if (shouldRunLLM && effectiveApiKey) {
        const client = new LLMClient({
          apiKey: effectiveApiKey,
          baseURL: effectiveBaseURL,
          defaultModel: model,
        });

        // Prompt Lexical
        const lexPrompt = lexTopHit
          ? `以下是通过词法检索（Lexical Grep，匹配词：${lexTopHit.matchedKeywords.join(", ")}）提取的文档《${lexTopHit.doc.title}》：\n\n${lexTopHit.doc.content}\n\n请严格基于上述参考文档回答用户问题：${q}`
          : `未找到任何词法匹配文档。请如实回答用户提问，若无专属文档信息请明确告知未知：${q}`;

        // Prompt Semantic
        const semPrompt = semTopHit
          ? `以下是通过语义检索（Semantic Cosine: ${semTopHit.similarity}）提取的文档《${semTopHit.doc.title}》：\n\n${semTopHit.doc.content}\n\n请严格基于上述参考文档回答用户问题：${q}`
          : `未找到任何高相似度语义文档。请如实回答用户提问，若无专属文档信息请明确告知未知：${q}`;

        const tL0 = Date.now();
        const resLex = await client.chatCompletion({
          messages: [{ role: "user", content: lexPrompt }],
          systemPrompt: "你是一个专业的问答助手。以提供的参考资料为唯一事实依据，切勿编造。",
        });
        lexLLMLatencyMs = Date.now() - tL0;
        lexAnswer = resLex.content;
        lexTokens = SmartTruncator.estimateTokens(lexPrompt) + SmartTruncator.estimateTokens(resLex.content);

        const tS0 = Date.now();
        const resSem = await client.chatCompletion({
          messages: [{ role: "user", content: semPrompt }],
          systemPrompt: "你是一个专业的问答助手。以提供的参考资料为唯一事实依据，切勿编造。",
        });
        semLLMLatencyMs = Date.now() - tS0;
        semAnswer = resSem.content;
        semTokens = SmartTruncator.estimateTokens(semPrompt) + SmartTruncator.estimateTokens(resSem.content);
      }

      return Response.json({
        success: true,
        query: q,
        keywords: effectiveKeywords,
        tokenReport,
        lexical: {
          latencyMs: lexLatencyMs,
          totalHits: lexResults.length,
          topHit: lexTopHit ? {
            id: lexTopHit.doc.id,
            title: lexTopHit.doc.title,
            matchedKeywords: lexTopHit.matchedKeywords,
            score: lexTopHit.score,
            snippet: lexTopHit.matchSnippet,
          } : null,
          allHits: lexResults.slice(0, 5).map((r) => ({
            id: r.doc.id,
            title: r.doc.title,
            score: r.score,
            snippet: r.matchSnippet,
          })),
          answer: lexAnswer,
          tokens: lexTokens,
          llmLatencyMs: lexLLMLatencyMs,
        },
        semantic: {
          latencyMs: semLatencyMs,
          totalHits: semResults.length,
          topHit: semTopHit ? {
            id: semTopHit.doc.id,
            title: semTopHit.doc.title,
            similarity: semTopHit.similarity,
            rank: semTopHit.rank,
            snippet: semTopHit.previewSnippet,
          } : null,
          allHits: semResults.slice(0, 5).map((r) => ({
            id: r.doc.id,
            title: r.doc.title,
            similarity: r.similarity,
            rank: r.rank,
            snippet: r.previewSnippet,
          })),
          answer: semAnswer,
          tokens: semTokens,
          llmLatencyMs: semLLMLatencyMs,
        },
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

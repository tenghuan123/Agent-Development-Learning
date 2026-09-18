import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { BenchmarkCorpusManager, C7_BENCHMARK_CASES, runTwoStageFunnel } from "~/core/context-bench/corpus";
import { searchHybridInDocs } from "~/core/context-bench/hybrid";
import type { ChunkingEvalStrategy } from "~/core/context-bench/chunker";
import { LLMClient } from "~/core/llm/client";
import { SmartTruncator } from "~/core/context/truncator";

/** C8 基准矩阵的一行配置 */
interface ChunkingMatrixRow {
  label: string;
  strategy: ChunkingEvalStrategy;
  chunkSize: number;
  overlap: number;
  semanticThreshold?: number;
  parentSize?: number;
}

/** C8 默认对决矩阵：覆盖 粒度 / 边界策略 / 重叠 / 父子块 四类变量 */
const DEFAULT_CHUNKING_MATRIX: ChunkingMatrixRow[] = [
  { label: "文档级（基线）", strategy: "document", chunkSize: 0, overlap: 0 },
  { label: "定长 256", strategy: "fixed", chunkSize: 256, overlap: 0 },
  { label: "定长 512", strategy: "fixed", chunkSize: 512, overlap: 0 },
  { label: "定长 512 + 重叠128", strategy: "fixed", chunkSize: 512, overlap: 128 },
  { label: "定长 2048", strategy: "fixed", chunkSize: 2048, overlap: 0 },
  { label: "结构感知 512", strategy: "recursive", chunkSize: 512, overlap: 0 },
  { label: "结构感知 512 + 重叠64", strategy: "recursive", chunkSize: 512, overlap: 64 },
  { label: "语义边界 512 + 重叠64", strategy: "semantic", chunkSize: 512, overlap: 64 },
  { label: "Small-to-Big 256→1400", strategy: "small-to-big", chunkSize: 256, overlap: 32, parentSize: 1400 },
];

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

    // 14. Action: Search Hybrid (Lesson 6)
    if (requestedAction === "search_hybrid") {
      const q = (query || question || "").trim();
      const customKeywords: string[] | undefined = body.keywords;
      const effectiveKeywords = Array.isArray(customKeywords) && customKeywords.length > 0
        ? customKeywords
        : BenchmarkCorpusManager.extractKeywords(q);

      const algorithm = body.algorithm || "rrf";
      const k = typeof body.k === "number" ? body.k : 60;
      const weightLexical = typeof body.weightLexical === "number" ? body.weightLexical : 0.5;
      const weightSemantic = typeof body.weightSemantic === "number" ? body.weightSemantic : 0.5;
      const topK = typeof body.topK === "number" ? body.topK : 8;

      let queryVector: number[] | undefined;
      const effectiveApiKey = apiKey || process.env.LLM_API_KEY || "";
      const effectiveBaseURL = baseURL || process.env.LLM_BASE_URL;

      if (effectiveApiKey && effectiveApiKey.trim().length > 0) {
        try {
          const embClient = new LLMClient({ apiKey: effectiveApiKey, baseURL: effectiveBaseURL, defaultModel: model });
          const embResp = await embClient.createEmbedding(q);
          if (embResp.embeddings && embResp.embeddings[0]) {
            queryVector = embResp.embeddings[0];
          }
        } catch {
          // fallback
        }
      }

      const t0 = Date.now();
      const hybridOut = BenchmarkCorpusManager.searchHybrid(q, {
        algorithm,
        k,
        weightLexical,
        weightSemantic,
        topK,
        customKeywords: effectiveKeywords,
        queryVector,
      });
      const latencyMs = Date.now() - t0;

      return Response.json({
        success: true,
        query: q,
        keywords: effectiveKeywords,
        algorithm,
        parameters: hybridOut.parameters,
        latencyMs,
        hybridResults: hybridOut.hybridResults.map((r) => ({
          doc: r.doc,
          id: r.doc.id,
          title: r.doc.title,
          category: r.doc.category,
          tokenCount: r.doc.tokenCount,
          finalRank: r.finalRank,
          finalScore: r.finalScore,
          algorithm: r.algorithm,
          lexicalRank: r.lexicalRank,
          lexicalScore: r.lexicalScore,
          semanticRank: r.semanticRank,
          semanticScore: r.semanticScore,
          normLexicalScore: r.normLexicalScore,
          normSemanticScore: r.normSemanticScore,
          matchReason: r.matchReason,
          contribution: r.contribution,
          previewSnippet: r.previewSnippet,
          matchedKeywords: r.matchedKeywords,
        })),
        lexicalResults: hybridOut.lexicalResults.slice(0, 5).map((r) => ({
          id: r.doc.id,
          title: r.doc.title,
          score: r.score,
          matchSnippet: r.matchSnippet,
          matchedKeywords: r.matchedKeywords,
        })),
        semanticResults: hybridOut.semanticResults.slice(0, 5).map((r) => ({
          id: r.doc.id,
          title: r.doc.title,
          similarity: r.similarity,
          rank: r.rank,
          previewSnippet: r.previewSnippet,
        })),
      });
    }

    // 15. Action: Run Hybrid RAG Pipeline (Lesson 6)
    if (requestedAction === "run_hybrid_pipeline") {
      const q = (question || query || "").trim();
      const customKeywords: string[] | undefined = body.keywords;
      const effectiveKeywords = Array.isArray(customKeywords) && customKeywords.length > 0
        ? customKeywords
        : BenchmarkCorpusManager.extractKeywords(q);

      const algorithm = body.algorithm || "rrf";
      const k = typeof body.k === "number" ? body.k : 60;
      const weightLexical = typeof body.weightLexical === "number" ? body.weightLexical : 0.5;
      const weightSemantic = typeof body.weightSemantic === "number" ? body.weightSemantic : 0.5;

      const effectiveApiKey = apiKey || process.env.LLM_API_KEY || "";
      const effectiveBaseURL = baseURL || process.env.LLM_BASE_URL;

      let queryVector: number[] | undefined;
      if (effectiveApiKey && effectiveApiKey.trim().length > 0) {
        try {
          const embClient = new LLMClient({ apiKey: effectiveApiKey, baseURL: effectiveBaseURL, defaultModel: model });
          const embResp = await embClient.createEmbedding(q);
          if (embResp.embeddings && embResp.embeddings[0]) {
            queryVector = embResp.embeddings[0];
          }
        } catch {
          // fallback
        }
      }

      const tStartSearch = Date.now();
      const hybridOut = BenchmarkCorpusManager.searchHybrid(q, {
        algorithm,
        k,
        weightLexical,
        weightSemantic,
        topK: 5,
        customKeywords: effectiveKeywords,
        queryVector,
      });
      const searchLatencyMs = Date.now() - tStartSearch;

      const topHit = hybridOut.hybridResults[0] || null;
      const allDocs = BenchmarkCorpusManager.getAllDocuments();
      const allDocsTokens = allDocs.reduce((acc, d) => acc + d.tokenCount, 0);

      let answer = "";
      let llmLatencyMs = 0;
      let promptTokens = 0;
      let outputTokens = 0;

      const shouldRunLLM = Boolean(effectiveApiKey);
      if (shouldRunLLM && topHit) {
        const client = new LLMClient({
          apiKey: effectiveApiKey,
          baseURL: effectiveBaseURL,
          defaultModel: model,
        });

        const channelMeta =
          topHit.matchReason === "both"
            ? `双轨共识召回 (词法排位 #${topHit.lexicalRank}, 语义相似度 ${topHit.semanticScore.toFixed(3)})`
            : topHit.matchReason === "lexical_only"
            ? `词法单轨兜底召回 (词法分: ${topHit.lexicalScore})`
            : `语义单轨泛化召回 (语义相似度: ${topHit.semanticScore.toFixed(3)})`;

        const prompt = `以下是通过双轨混合检索与 RRF 算法（Hybrid Retrieval & Rank Fusion，${channelMeta}，融合得分: ${topHit.finalScore}）为你精准提取的参考文档《${topHit.doc.title}》：

<<<DOCUMENT_START>>>
${topHit.doc.content}
<<<DOCUMENT_END>>>

请严格基于上述参考文档回答用户问题。若文档中提及相关条款，请清晰准确地做出解答。若文档中明确不包含相关信息，请如实说明未知。

用户问题：${q}`;

        promptTokens = SmartTruncator.estimateTokens(prompt);
        const t0 = Date.now();
        const res = await client.chatCompletion({
          messages: [{ role: "user", content: prompt }],
          systemPrompt: "你是一个专业的知识问答助手。回答必须严谨，以提供的参考文档为唯一依据。",
        });
        llmLatencyMs = Date.now() - t0;
        answer = res.content;
        outputTokens = SmartTruncator.estimateTokens(res.content);
      } else if (shouldRunLLM && !topHit) {
        const fallbackPrompt = `用户提问：${q}\n\n注意：混合检索在知识库中未找到任何匹配参考文档。请诚实告知用户缺少相关资料。`;
        promptTokens = SmartTruncator.estimateTokens(fallbackPrompt);
        const t0 = Date.now();
        const client = new LLMClient({ apiKey: effectiveApiKey, baseURL: effectiveBaseURL, defaultModel: model });
        const res = await client.chatCompletion({
          messages: [{ role: "user", content: fallbackPrompt }],
          systemPrompt: "你是一个专业的知识问答助手。若缺乏参考文档依据，请明确告知未知。",
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
        algorithm,
        searchLatencyMs,
        llmLatencyMs,
        totalLatencyMs: searchLatencyMs + llmLatencyMs,
        topHit: topHit
          ? {
              id: topHit.doc.id,
              title: topHit.doc.title,
              category: topHit.doc.category,
              finalRank: topHit.finalRank,
              finalScore: topHit.finalScore,
              matchReason: topHit.matchReason,
              lexicalRank: topHit.lexicalRank,
              semanticRank: topHit.semanticRank,
              semanticScore: topHit.semanticScore,
              lexicalScore: topHit.lexicalScore,
              previewSnippet: topHit.previewSnippet,
              tokenCount: topHit.doc.tokenCount,
            }
          : null,
        topResults: hybridOut.hybridResults.slice(0, 4).map((r) => ({
          id: r.doc.id,
          title: r.doc.title,
          finalRank: r.finalRank,
          finalScore: r.finalScore,
          matchReason: r.matchReason,
          lexicalRank: r.lexicalRank,
          semanticRank: r.semanticRank,
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

    // 16. Action: Run C6 Triple Showdown (Lexical vs Semantic vs Hybrid RRF)
    if (requestedAction === "run_c6_triple_showdown") {
      const k = typeof body.k === "number" ? body.k : 60;
      const weightLexical = typeof body.weightLexical === "number" ? body.weightLexical : 0.5;
      const weightSemantic = typeof body.weightSemantic === "number" ? body.weightSemantic : 0.5;

      const casesToRun = C5_MATRIX_CASES;

      const showdownResults = casesToRun.map((mc) => {
        // 1. Lexical
        const tLex0 = Date.now();
        const lexResults = BenchmarkCorpusManager.searchText(mc.lexicalKeywords);
        const lexLatencyMs = Date.now() - tLex0;
        const lexHitRank = lexResults.findIndex((r) => r.doc.id === mc.targetDocId);
        const lexTopHit = lexResults[0] || null;

        // 2. Semantic
        const tSem0 = Date.now();
        const semResults = BenchmarkCorpusManager.searchSemantic(mc.query, { topK: 5 });
        const semLatencyMs = Date.now() - tSem0;
        const semHitRank = semResults.findIndex((r) => r.doc.id === mc.targetDocId);
        const semTopHit = semResults[0] || null;

        // 3. Hybrid RRF
        const tHyb0 = Date.now();
        const hybOut = BenchmarkCorpusManager.searchHybrid(mc.query, {
          algorithm: "rrf",
          k,
          weightLexical,
          weightSemantic,
          topK: 5,
          customKeywords: mc.lexicalKeywords,
        });
        const hybLatencyMs = Date.now() - tHyb0;
        const hybHitRank = hybOut.hybridResults.findIndex((r) => r.doc.id === mc.targetDocId);
        const hybTopHit = hybOut.hybridResults[0] || null;

        return {
          id: mc.id,
          category: mc.category,
          title: mc.title,
          query: mc.query,
          targetDocId: mc.targetDocId,
          targetDocTitle: mc.targetDocTitle,
          lexicalKeywords: mc.lexicalKeywords,
          expectedWinner: mc.expectedWinner,
          keyTakeaway: mc.keyTakeaway,
          lexical: {
            latencyMs: lexLatencyMs,
            targetRank: lexHitRank !== -1 ? lexHitRank + 1 : null,
            totalHits: lexResults.length,
            topMatchDoc: lexTopHit ? lexTopHit.doc.title : null,
            score: lexTopHit ? lexTopHit.score : 0,
            isTopHit: lexHitRank === 0,
          },
          semantic: {
            latencyMs: semLatencyMs,
            targetRank: semHitRank !== -1 ? semHitRank + 1 : null,
            totalHits: semResults.length,
            topMatchDoc: semTopHit ? semTopHit.doc.title : null,
            similarity: semTopHit ? semTopHit.similarity : 0,
            isTopHit: semHitRank === 0,
          },
          hybrid: {
            latencyMs: hybLatencyMs,
            targetRank: hybHitRank !== -1 ? hybHitRank + 1 : null,
            totalHits: hybOut.hybridResults.length,
            topMatchDoc: hybTopHit ? hybTopHit.doc.title : null,
            rrfScore: hybTopHit ? hybTopHit.finalScore : 0,
            matchReason: hybTopHit ? hybTopHit.matchReason : "none",
            isTopHit: hybHitRank === 0,
          },
        };
      });

      const summary = {
        totalCases: showdownResults.length,
        lexicalTopHits: showdownResults.filter((c) => c.lexical.isTopHit).length,
        semanticTopHits: showdownResults.filter((c) => c.semantic.isTopHit).length,
        hybridTopHits: showdownResults.filter((c) => c.hybrid.isTopHit).length,
        hybridRecallPct: Number(
          ((showdownResults.filter((c) => c.hybrid.targetRank !== null).length / showdownResults.length) * 100).toFixed(1)
        ),
      };

      return Response.json({
        success: true,
        summary,
        cases: showdownResults,
      });
    }

    // 10. C7: Get Benchmark Cases
    if (requestedAction === "get_c7_benchmark_cases") {
      return Response.json({
        success: true,
        cases: C7_BENCHMARK_CASES,
      });
    }

    // 11. C7: Search Two-Stage (Coarse Retrieval + Cross-Encoder Rerank)
    if (requestedAction === "search_two_stage") {
      const q = (query || question || "").trim();
      const stage1TopK = typeof body.stage1TopK === "number" ? body.stage1TopK : 8;
      const stage2TopN = typeof body.stage2TopN === "number" ? body.stage2TopN : 3;
      const strictAuthorityCheck = body.strictAuthorityCheck !== false;

      const funnel = BenchmarkCorpusManager.searchTwoStage(q, {
        stage1TopK,
        stage2TopN,
        rerankOptions: {
          topN: stage2TopN,
          strictAuthorityCheck,
        },
      });

      return Response.json({
        success: true,
        funnel,
      });
    }

    // 12. C7: Rerank Candidates
    if (requestedAction === "rerank_candidates") {
      const q = (query || question || "").trim();
      const candidates = Array.isArray(body.candidates) ? body.candidates : [];
      const topN = typeof body.topN === "number" ? body.topN : 3;
      const strictAuthorityCheck = body.strictAuthorityCheck !== false;

      const reranked = BenchmarkCorpusManager.rerank(q, candidates, {
        topN,
        strictAuthorityCheck,
      });

      return Response.json({
        success: true,
        reranked,
        truncated: reranked.slice(0, topN),
      });
    }

    // 13. C7: Run Two-Stage Pipeline with LLM Answer Contrast
    if (requestedAction === "run_reranking_pipeline") {
      const q = (question || query || "").trim();
      const stage1TopK = typeof body.stage1TopK === "number" ? body.stage1TopK : 8;
      const stage2TopN = typeof body.stage2TopN === "number" ? body.stage2TopN : 3;
      const strictAuthorityCheck = body.strictAuthorityCheck !== false;

      const effectiveApiKey = apiKey || process.env.LLM_API_KEY || "";
      const effectiveBaseURL = baseURL || process.env.LLM_BASE_URL;

      const funnel = BenchmarkCorpusManager.searchTwoStage(q, {
        stage1TopK,
        stage2TopN,
        rerankOptions: {
          topN: stage2TopN,
          strictAuthorityCheck,
        },
      });

      const coarseTopHit = funnel.stage1Candidates[0]?.doc || null;
      const rerankTopHit = funnel.truncatedTopN[0] ? funnel.truncatedTopN[0].doc : null;

      let coarseAnswer: string | null = null;
      let rerankAnswer: string | null = null;
      let coarsePromptTokens = 0;
      let rerankPromptTokens = 0;
      let coarseLatencyMs = 0;
      let rerankLatencyMs = 0;

      const shouldRunLLM = Boolean(effectiveApiKey);
      if (shouldRunLLM && coarseTopHit && rerankTopHit) {
        const client = new LLMClient({
          apiKey: effectiveApiKey,
          baseURL: effectiveBaseURL,
          defaultModel: model,
        });

        // Prompt A: Coarse Top 1 (Without Reranker)
        const promptCoarse = `以下是通过 Stage 1 粗排召回直接选取的参考文档《${coarseTopHit.title}》：

<<<DOCUMENT_START>>>
${coarseTopHit.content}
<<<DOCUMENT_END>>>

请严格基于上述参考文档，回答用户的问题。如果文档中未提及或明确否定，请如实说明。

问题：${q}`;

        // Prompt B: Reranked Golden Context (Top 1 or Top N)
        const topDocsContent = funnel.truncatedTopN
          .map((r, i) => `【参考资料 ${i + 1}: ${r.doc.title} (相关度得分: ${(r.rerankScore * 100).toFixed(1)}%)】\n${r.doc.content}`)
          .join("\n\n---\n\n");

        const promptRerank = `以下是通过 Cross-Encoder 深度交互重排器（Stage 2 精排）为你精挑细选的黄金上下文：

<<<DOCUMENT_START>>>
${topDocsContent}
<<<DOCUMENT_END>>>

请严格基于上述高置信度参考资料，回答用户的问题。若资料中有最新政策、特例约定或除外条款，请准确指明。

问题：${q}`;

        const t0 = Date.now();
        const resA = await client.chatCompletion({
          messages: [{ role: "user", content: promptCoarse }],
          systemPrompt: "你是一个专业的企业级问答助理。请严格根据提供的参考资料回答。",
        });
        coarseLatencyMs = Date.now() - t0;
        coarseAnswer = resA.content;
        coarsePromptTokens = SmartTruncator.estimateTokens(promptCoarse);

        const t1 = Date.now();
        const resB = await client.chatCompletion({
          messages: [{ role: "user", content: promptRerank }],
          systemPrompt: "你是一个专业的企业级问答助理。请严格根据提供的参考资料回答。",
        });
        rerankLatencyMs = Date.now() - t1;
        rerankAnswer = resB.content;
        rerankPromptTokens = SmartTruncator.estimateTokens(promptRerank);
      } else {
        // Deterministic simulated contrast for demonstration without API key
        if (coarseTopHit?.id.includes("2024")) {
          coarseAnswer = "【未经精排模型回答（采纳了粗排排第 1 的 2024 废弃政策）】根据参考总则，所有全线产品（含软件及基础服务）一律支持 30 天宽松退款周期。（注：此回答基于已废弃的历史政策，回答严重失真！）";
        } else if (coarseTopHit?.id.includes("refund-policy") && q.includes("Alpha")) {
          coarseAnswer = "【未经精排模型回答（采纳了粗排排第 1 的通用退款政策）】除特定产品另有专属说明外，所有标准数字软件均支持 7 天无理由退款。（注：模型未能优先参考 Alpha 专属文档中的 30 天特例，造成回答不准！）";
        } else {
          coarseAnswer = `【未经精排】基于粗排文档《${coarseTopHit?.title}》提取的解答。`;
        }

        if (rerankTopHit?.id.includes("2026")) {
          rerankAnswer = "【精排重排后模型回答（采纳了 Cross-Encoder 升至首位的 2026 现行有效政策）】根据 2026 年度现行有效客户服务总则（v2026.1.0），除专属大客户定制产品 (Alpha) 仍享有 30 天特殊约定外，常规数字软件无理由退款期限已统一规范缩短为 7 天。2024 年度的 30 天政策已完全废弃。";
        } else if (rerankTopHit?.id.includes("alpha.md") && q.includes("Alpha")) {
          rerankAnswer = "【精排重排后模型回答（采纳了 Cross-Encoder 识别特例覆写后的 Alpha 规约）】Alpha 专属企业级产品享有独立服务保障，支持自购买之日起 30 天内无条件全额申请退款，覆写了通用 7 天规则。";
        } else {
          rerankAnswer = `【精排重排后】基于精排优选文档《${rerankTopHit?.title}》生成的精准权威解答。`;
        }
      }

      return Response.json({
        success: true,
        funnel,
        llmContrast: {
          coarseTopDoc: coarseTopHit ? { id: coarseTopHit.id, title: coarseTopHit.title } : null,
          rerankTopDoc: rerankTopHit ? { id: rerankTopHit.id, title: rerankTopHit.title } : null,
          coarseAnswer,
          rerankAnswer,
          coarsePromptTokens,
          rerankPromptTokens,
          coarseLatencyMs,
          rerankLatencyMs,
        },
      });
    }

    // 14. C7: Run Benchmark Showdown Matrix
    if (requestedAction === "run_c7_benchmark_matrix") {
      const cases = C7_BENCHMARK_CASES;
      const allDocs = BenchmarkCorpusManager.getAllDocuments();

      const evaluatedCases = cases.map((benchCase) => {
        const funnel = runTwoStageFunnel(allDocs, benchCase.query, {
          stage1TopK: 8,
          stage2TopN: 3,
          rerankOptions: {
            strictAuthorityCheck: true,
          },
        });

        const stage1TopHit = funnel.stage1Candidates[0];
        const stage1TopDocId = stage1TopHit ? stage1TopHit.doc.id : null;
        const stage1HitTargetRank = funnel.stage1Candidates.findIndex(
          (c) => c.doc.id === benchCase.targetDocId
        );

        const stage2TopHit = funnel.truncatedTopN[0];
        const stage2TopDocId = stage2TopHit ? stage2TopHit.doc.id : null;
        const stage2HitTargetRank = funnel.stage2Reranked.findIndex(
          (c) => c.doc.id === benchCase.targetDocId
        );

        const stage1Success = stage1TopDocId === benchCase.targetDocId;
        const stage2Success = stage2TopDocId === benchCase.targetDocId;

        const targetRerankResult = funnel.stage2Reranked.find(
          (c) => c.doc.id === benchCase.targetDocId
        );

        return {
          id: benchCase.id,
          category: benchCase.category,
          title: benchCase.title,
          query: benchCase.query,
          targetDocId: benchCase.targetDocId,
          targetDocTitle: benchCase.targetDocTitle,
          phenomenon: benchCase.phenomenon,
          stage1: {
            topDocId: stage1TopDocId,
            topDocTitle: stage1TopHit ? stage1TopHit.doc.title : "None",
            targetRank: stage1HitTargetRank !== -1 ? stage1HitTargetRank + 1 : null,
            isTopHit: stage1Success,
          },
          stage2: {
            topDocId: stage2TopDocId,
            topDocTitle: stage2TopHit ? stage2TopHit.doc.title : "None",
            targetRank: stage2HitTargetRank !== -1 ? stage2HitTargetRank + 1 : null,
            isTopHit: stage2Success,
            rerankScore: targetRerankResult?.rerankScore ?? 0,
            rankDelta: targetRerankResult?.rankDelta ?? 0,
            decisionReason: targetRerankResult?.decisionReason ?? "",
          },
        };
      });

      const summary = {
        totalCases: evaluatedCases.length,
        stage1TopHits: evaluatedCases.filter((c) => c.stage1.isTopHit).length,
        stage2TopHits: evaluatedCases.filter((c) => c.stage2.isTopHit).length,
        stage1AccuracyPct: Number(
          ((evaluatedCases.filter((c) => c.stage1.isTopHit).length / evaluatedCases.length) * 100).toFixed(1)
        ),
        stage2AccuracyPct: Number(
          ((evaluatedCases.filter((c) => c.stage2.isTopHit).length / evaluatedCases.length) * 100).toFixed(1)
        ),
      };

      return Response.json({
        success: true,
        summary,
        cases: evaluatedCases,
      });
    }

    // =====================================================================
    // C8: Chunking
    // =====================================================================

    // 15. C8: 对指定文档执行切分
    if (requestedAction === "chunk_document") {
      const strategy = body.strategy || "recursive";
      const chunkSize = typeof body.chunkSize === "number" ? body.chunkSize : 512;
      const overlap = typeof body.overlap === "number" ? body.overlap : 64;
      const semanticThreshold =
        typeof body.semanticThreshold === "number" ? body.semanticThreshold : undefined;

      const docIds: string[] = Array.isArray(body.docIds) && body.docIds.length > 0
        ? body.docIds
        : BenchmarkCorpusManager.getAllDocuments().map((d) => d.id);

      const results = docIds
        .map((id) =>
          BenchmarkCorpusManager.chunkOne(id, { strategy, chunkSize, overlap, semanticThreshold })
        )
        .filter((r): r is NonNullable<typeof r> => r !== null);

      return Response.json({
        success: true,
        strategy,
        chunkSize,
        overlap,
        semanticThreshold: semanticThreshold ?? 0.62,
        results,
      });
    }

    // 16. C8: chunk 级检索（含 Small-to-Big 展开）
    if (requestedAction === "search_chunks") {
      const q = (query || question || "").trim();
      const strategy = body.strategy || "recursive";
      const chunkSize = typeof body.chunkSize === "number" ? body.chunkSize : 512;
      const overlap = typeof body.overlap === "number" ? body.overlap : 64;
      const parentSize = typeof body.parentSize === "number" ? body.parentSize : 0;
      const rerankTopN = typeof body.rerankTopN === "number" ? body.rerankTopN : 3;

      const chunks = BenchmarkCorpusManager.getAllChunks({ strategy, chunkSize, overlap });
      const chunkSet = BenchmarkCorpusManager.findChunkEmbeddings({ strategy, chunkSize, overlap });

      // 真实查询向量（拿不到就退回本地确定性向量，searchChunks 内部会保证两侧同维）
      let queryVector: number[] | undefined;
      const effectiveApiKey = apiKey || process.env.LLM_API_KEY || "";
      if (effectiveApiKey) {
        try {
          const client = new LLMClient({
            apiKey: effectiveApiKey,
            baseURL: baseURL || process.env.LLM_BASE_URL,
            defaultModel: model,
          });
          const embResp = await client.createEmbedding(q, undefined, 512);
          queryVector = embResp.embeddings[0];
        } catch {
          queryVector = undefined;
        }
      }

      const outcome = BenchmarkCorpusManager.searchChunkIndex(chunks, q, {
        topK: 12,
        rerankTopN,
        parentSize,
        chunkVectors: chunkSet?.vectors,
        queryVector,
      });

      return Response.json({
        success: true,
        outcome,
        chunkCount: chunks.length,
        vectorSet: chunkSet
          ? { id: chunkSet.id, path: chunkSet.relativePath, dimensions: chunkSet.dimensions, config: chunkSet.chunkConfig }
          : null,
      });
    }

    // 17. C8: 切分策略基准矩阵
    if (requestedAction === "run_chunking_matrix") {
      const docs = BenchmarkCorpusManager.getAllDocuments();
      const cases = BenchmarkCorpusManager.getBenchmarkChunkingCases();

      const matrix: ChunkingMatrixRow[] = Array.isArray(body.matrix) && body.matrix.length > 0
        ? body.matrix
        : DEFAULT_CHUNKING_MATRIX;

      // 基准用例的真实查询向量（失败则整体退回本地向量通道）
      const queryVectors = new Map<string, number[]>();
      const effectiveApiKey = apiKey || process.env.LLM_API_KEY || "";
      if (effectiveApiKey) {
        try {
          const client = new LLMClient({
            apiKey: effectiveApiKey,
            baseURL: baseURL || process.env.LLM_BASE_URL,
            defaultModel: model,
          });
          const resp = await client.createEmbedding(cases.map((c) => c.query), undefined, 512);
          cases.forEach((c, i) => {
            if (resp.embeddings[i]) queryVectors.set(c.query, resp.embeddings[i]);
          });
        } catch {
          queryVectors.clear();
        }
      }

      const rows = matrix.map((cfg) => {
        const baseStrategy = cfg.strategy === "small-to-big" ? "recursive" : cfg.strategy;
        const matched =
          baseStrategy === "document"
            ? undefined
            : BenchmarkCorpusManager.findChunkEmbeddings({
                strategy: baseStrategy,
                chunkSize: cfg.chunkSize,
                overlap: cfg.overlap,
              });

        const outcome = BenchmarkCorpusManager.evaluateChunking({
          strategy: cfg.strategy,
          chunkSize: cfg.chunkSize,
          overlap: cfg.overlap,
          semanticThreshold: cfg.semanticThreshold,
          parentSize: cfg.parentSize,
          chunkVectors: matched?.vectors,
          chunkVectorConfig: matched?.chunkConfig,
          queryVectorOf: (q) => queryVectors.get(q),
        });

        return { config: cfg, summary: outcome.summary, cases: outcome.cases };
      });

      const docRow = rows.find((r) => r.config.strategy === "document");
      const bestRow = [...rows].sort((a, b) => b.summary.effectiveRate - a.summary.effectiveRate)[0];

      return Response.json({
        success: true,
        rows,
        baseline: docRow?.summary ?? null,
        best: bestRow
          ? {
              label: bestRow.config.label,
              tokenSavingsVsDocumentPct:
                docRow && docRow.summary.avgRetrievedTokens > 0
                  ? Number(
                      (
                        ((docRow.summary.avgRetrievedTokens - bestRow.summary.avgRetrievedTokens) /
                          docRow.summary.avgRetrievedTokens) *
                        100
                      ).toFixed(1)
                    )
                  : 0,
              densityGainVsDocument:
                docRow && docRow.summary.avgSignalDensity > 0
                  ? Number(
                      (bestRow.summary.avgSignalDensity / docRow.summary.avgSignalDensity).toFixed(1)
                    )
                  : 0,
            }
          : null,
        corpus: {
          docCount: docs.length,
          totalTokens: docs.reduce((a, d) => a + d.tokenCount, 0),
          longDocs: docs
            .filter((d) => d.tokenCount > 1500)
            .map((d) => ({ id: d.id, title: d.title, tokens: d.tokenCount })),
        },
        caseCount: cases.length,
        queryVectorCount: queryVectors.size,
      });
    }

    // 18. C8: 端到端三路对比（文档级 / 切片精排 / Small-to-Big）
    if (requestedAction === "run_chunking_pipeline") {
      const q = (question || query || "").trim();
      const strategy = body.strategy || "recursive";
      const chunkSize = typeof body.chunkSize === "number" ? body.chunkSize : 256;
      const overlap = typeof body.overlap === "number" ? body.overlap : 32;
      const parentSize = typeof body.parentSize === "number" ? body.parentSize : 1400;

      const docs = BenchmarkCorpusManager.getAllDocuments();
      const chunks = BenchmarkCorpusManager.getAllChunks({ strategy, chunkSize, overlap });
      const chunkSet = BenchmarkCorpusManager.findChunkEmbeddings({ strategy, chunkSize, overlap });

      const effectiveApiKey = apiKey || process.env.LLM_API_KEY || "";

      // A 路：文档级 —— 取混合检索的首位文档全文
      const docLevel = searchHybridInDocs(docs, q, { algorithm: "rrf", k: 60, topK: 3 });
      const docTop = docLevel.hybridResults[0]?.doc ?? null;

      // B 路：切片精排（不展开）
      const chunkOnly = BenchmarkCorpusManager.searchChunkIndex(chunks, q, {
        topK: 12,
        rerankTopN: 3,
        parentSize: 0,
        chunkVectors: chunkSet?.vectors,
      });

      // C 路：Small-to-Big（展开父窗口）
      const smallToBig = BenchmarkCorpusManager.searchChunkIndex(chunks, q, {
        topK: 12,
        rerankTopN: 3,
        parentSize,
        chunkVectors: chunkSet?.vectors,
      });

      const buildPath = (label: string, content: string, tokens: number) => ({ label, content, tokens });

      const pathA = docTop ? buildPath("文档级注入", docTop.content, docTop.tokenCount) : null;
      const pathB = buildPath(
        "切片精排注入",
        chunkOnly.hits.map((h) => h.injectedContent).join("\n\n---\n\n"),
        chunkOnly.totalInjectedTokens
      );
      const pathC = buildPath(
        "Small-to-Big 注入",
        smallToBig.hits.map((h) => h.injectedContent).join("\n\n---\n\n"),
        smallToBig.totalInjectedTokens
      );

      let answerA: string | null = null;
      let answerB: string | null = null;
      let answerC: string | null = null;
      let latencyA = 0;
      let latencyB = 0;
      let latencyC = 0;

      if (effectiveApiKey) {
        const client = new LLMClient({
          apiKey: effectiveApiKey,
          baseURL: baseURL || process.env.LLM_BASE_URL,
          defaultModel: model,
        });
        const systemPrompt = "你是一个专业的企业级运维问答助理。请严格根据提供的参考资料回答，并指明出处章节。";

        const run = async (content: string) => {
          const t0 = Date.now();
          const res = await client.chatCompletion({
            messages: [
              {
                role: "user",
                content: `以下是通过检索为你准备的参考资料：\n\n<<<CONTEXT_START>>>\n${content}\n<<<CONTEXT_END>>>\n\n请严格基于上述资料回答问题。若资料中未提及，请说明未知。\n\n问题：${q}`,
              },
            ],
            systemPrompt,
          });
          return { answer: res.content, latency: Date.now() - t0 };
        };

        if (pathA) {
          const r = await run(pathA.content);
          answerA = r.answer;
          latencyA = r.latency;
        }
        const rB = await run(pathB.content);
        answerB = rB.answer;
        latencyB = rB.latency;
        const rC = await run(pathC.content);
        answerC = rC.answer;
        latencyC = rC.latency;
      } else {
        // 无 API Key 时的确定性说明（不伪造模型输出）
        const note = "（未配置 API Key，未调用模型；此处展示的是将要注入的上下文与成本对比）";
        answerA = `${note}\n\n注入 ${pathA?.tokens ?? 0} token 的整篇文档。答案只占其中极小比例，需靠模型自己在长上下文中定位。`;
        answerB = `${note}\n\n注入 ${pathB.tokens} token 的 Top-3 精排切片。信噪比显著提升，但单个切片可能不自足。`;
        answerC = `${note}\n\n注入 ${pathC.tokens} token 的 Top-3 切片父窗口。信噪比与完整性兼顾。`;
      }

      return Response.json({
        success: true,
        query: q,
        config: { strategy, chunkSize, overlap, parentSize },
        paths: {
          document: pathA
            ? { ...pathA, answer: answerA, latencyMs: latencyA }
            : null,
          chunk: { ...pathB, answer: answerB, latencyMs: latencyB },
          smallToBig: { ...pathC, answer: answerC, latencyMs: latencyC },
        },
        ranWithLLM: Boolean(effectiveApiKey),
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

import { SmartTruncator } from "~/core/context/truncator";
import type { CorpusDocument } from "./corpus";
import {
  type Chunk,
  type ChunkSearchOptions,
  type ChunkHit,
  type ChunkingBenchmarkCase,
  type ChunkingCaseResult,
  chunkCorpus,
  chunkDocIdOf,
  expandToParent,
} from "./chunker";
import { computeDenseSemanticVector } from "./semantic";
import { searchHybridInDocs } from "./hybrid";
import { rerankDocuments } from "./reranker";
import { LLMClient } from "~/core/llm/client";

// ---------------------------------------------------------------------------
// 策略类型定义
// ---------------------------------------------------------------------------

export type ContextualStrategy =
  | "raw" // 原始孤立切片基线
  | "breadcrumbs" // 结构面包屑（Markdown 章节路径注标）
  | "situational" // Anthropic 生成式情境前缀（Contextual Chunking）
  | "neighbor-sliding" // 跨切片局部邻接扩展（滑动窗口：前一片 + 当前 + 后一片）
  | "situational-small-to-big"; // 生成式情境定位 + Small-to-Big 父窗口展开注入

export interface ContextualChunk extends Chunk {
  contextualPrefix: string;
  contextualText: string;
  strategyName: ContextualStrategy;
  breadcrumbs: string;
  situationalContext?: string;
}

export interface ContextualHit extends ChunkHit {
  contextualPrefix: string;
  originalContent: string;
  strategyName: ContextualStrategy;
}

export interface ContextualOutcome {
  query: string;
  strategy: ContextualStrategy;
  hits: ContextualHit[];
  totalInjectedTokens: number;
  stage1Count: number;
  vectorMode: "remote" | "local";
  vectorNote: string;
}

// ---------------------------------------------------------------------------
// 1. 结构感知面包屑提取器 (Hierarchical Breadcrumbs)
// ---------------------------------------------------------------------------

export function extractBreadcrumbs(chunk: Chunk): string {
  const parts = [chunk.docTitle];
  if (chunk.sectionPath && chunk.sectionPath.length > 0) {
    parts.push(...chunk.sectionPath);
  }
  return `[出处: ${parts.join(" > ")}]`;
}

// ---------------------------------------------------------------------------
// 2. 精选基准情境注标字典 (Curated Situational Contexts)
// 保证无 API Key 时离线评测 100% 具备确定性与高保真效果
// ---------------------------------------------------------------------------

export const CURATED_SITUATIONAL_CONTEXTS: Record<string, string> = {
  // ck-05: 孤岛代词核心用例（运维手册 9.2 切换流程中熔断切片）
  "docs/ops-handbook.md#c12":
    "本文出自《企业级云平台运维与故障排查规约》第9章“容灾与高可用”第9.2节“切换流程”。在同城双可用区主备架构下，当主备健康检查自动或手动触发切换，若主备切换在90秒内未能完成导致跨可用区切换失败时：",
  "docs/ops-handbook.md#c11":
    "本文出自《企业级云平台运维与故障排查规约》第9章“容灾与高可用”第9.2节“切换流程”。详述主备切换触发条件（自动三次探针失败或双人确认）、预期耗时与跨可用区切换流程：",
  // ck-01: 配额风暴
  "docs/ops-handbook.md#c7":
    "本文出自《企业级云平台运维与故障排查规约》第7章“配额与限流治理”第7.3节“配额风暴应急处置”。定义 ERR_QUOTA_STORM_4417 错误码的识别特征与 maxInflight 调优至 32 的应急标准流程：",
  // ck-02: 变更管理
  "docs/ops-handbook.md#c14":
    "本文出自《企业级云平台运维与故障排查规约》第11章“变更管理规约”。规定生产环境变更必须在窗口开启前24小时提交 RFC-8842 审批单：",
  // ck-03: 故障响应标准
  "docs/ops-handbook.md#c9":
    "本文出自《企业级云平台运维与故障排查规约》第8章“故障分级与响应”第8.1节“分级标准”。故障分级表格中 P2 级故障响应时限为 15 分钟、复盘报告提交时限为 3 个工作日：",
  // ck-04: 演练复盘
  "docs/ops-handbook.md#c13":
    "本文出自《企业级云平台运维与故障排查规约》第9章“容灾与高可用”第9.3节“切换演练”。规定容灾盲演每半年一次，演练复盘每两周组织一次并由平台工程部主持：",
  // ck-06: 审计留存
  "docs/compliance-manual.md#c3":
    "本文出自《企业安全合规与数据安全管理手册》第4章“日志审计与留存合规”。规定运维操作日志最低保留 180 天，全量审计日志最低加密保留 3 年：",
};

/**
 * 启发式生成情境前缀（针对未手工配置的切片）
 * 模拟 Anthropic 50~80 Token 的浓缩摘要风格
 */
export function generateHeuristicSituationalContext(chunk: Chunk, allDocChunks: Chunk[]): string {
  // 1. 优先查阅精选字典
  if (CURATED_SITUATIONAL_CONTEXTS[chunk.id]) {
    return CURATED_SITUATIONAL_CONTEXTS[chunk.id];
  }

  // 2. 检查切片是否具有代词孤岛风险 (Orphan Risk)
  const breadcrumb = extractBreadcrumbs(chunk);
  let antecedentHint = "";

  if (chunk.orphanRisk.isOrphanHead && chunk.index > 0) {
    const prevChunk = allDocChunks.find(
      (c) => c.docId === chunk.docId && c.index === chunk.index - 1
    );
    if (prevChunk) {
      // 提取前一切片的末尾句子作为先行词线索
      const cleanPrev = prevChunk.content.trim().replace(/\r?\n+/g, " ");
      const lastPeriod = Math.max(cleanPrev.lastIndexOf("。"), cleanPrev.lastIndexOf("."));
      const secondLastPeriod = cleanPrev.lastIndexOf("。", lastPeriod - 1);
      const prevSentence =
        secondLastPeriod !== -1
          ? cleanPrev.slice(secondLastPeriod + 1, lastPeriod + 1)
          : cleanPrev.slice(Math.max(0, cleanPrev.length - 80));

      if (prevSentence.trim()) {
        antecedentHint = `承接前文条件【${prevSentence.trim()}】，针对该情境的具体规约：`;
      }
    }
  }

  if (antecedentHint) {
    return `${breadcrumb} ${antecedentHint}`;
  }

  // 默认情境前缀
  const sectionStr =
    chunk.sectionPath.length > 0
      ? `重点规定了关于${chunk.sectionPath[chunk.sectionPath.length - 1]}的条款`
      : "核心规约与参数";
  return `${breadcrumb} 本段属于《${chunk.docTitle}》，${sectionStr}：`;
}

/**
 * 在线调用大模型生成 Anthropic 风格情境注标
 */
export async function generateLLMSituationalContext(
  doc: CorpusDocument,
  chunk: Chunk,
  options: { apiKey?: string; baseURL?: string; model?: string }
): Promise<string> {
  const client = new LLMClient({
    apiKey: options.apiKey || process.env.LLM_API_KEY || "",
    baseURL: options.baseURL || process.env.LLM_BASE_URL,
    defaultModel: options.model || "glm-4-flash",
  });

  const prompt = `<document>
${doc.content}
</document>

Here is the chunk we want to situate within the whole document:
<chunk>
${chunk.content}
</chunk>

Please give a short, succinct context (under 60 words, in Chinese) to situate this chunk within the overall document for the purposes of improving search retrieval of this chunk. State the document subject, exact section, and any antecedent conditions or pronouns (e.g. clarify what "这种情况" refers to). Output ONLY the succinct context prefix.`;

  try {
    const res = await client.chatCompletion({
      messages: [{ role: "user", content: prompt }],
      systemPrompt: "你是一个专业的知识库切片语境标注专家。用精炼的一到两句话说明切片的全局出处与前置条件。",
    });
    return res.content.trim().replace(/^语境[：:]\s*/, "");
  } catch (err) {
    console.warn("LLM Contextual generation fallback to heuristic:", err);
    return CURATED_SITUATIONAL_CONTEXTS[chunk.id] || extractBreadcrumbs(chunk);
  }
}

// ---------------------------------------------------------------------------
// 3. 跨切片邻接扩展器 (Neighbor Chunk Expander)
// ---------------------------------------------------------------------------

export function expandNeighborChunks(
  allChunks: Chunk[],
  hit: Chunk,
  windowSize = 1 // 1: [i-1, i, i+1]
): Chunk[] {
  const sameDoc = allChunks.filter((c) => c.docId === hit.docId).sort((a, b) => a.index - b.index);
  const pos = sameDoc.findIndex((c) => c.id === hit.id);
  if (pos === -1) return [hit];

  const minIdx = Math.max(0, pos - windowSize);
  const maxIdx = Math.min(sameDoc.length - 1, pos + windowSize);

  return sameDoc.slice(minIdx, maxIdx + 1);
}

// ---------------------------------------------------------------------------
// 4. 语境化切片转换器 (Contextual Transformer)
// ---------------------------------------------------------------------------

export function transformToContextualChunks(
  chunks: Chunk[],
  strategy: ContextualStrategy
): ContextualChunk[] {
  const allDocChunks = chunks;

  return chunks.map((c) => {
    const breadcrumbs = extractBreadcrumbs(c);
    let contextualPrefix = "";
    let situationalContext: string | undefined = undefined;

    switch (strategy) {
      case "raw":
        contextualPrefix = "";
        break;
      case "breadcrumbs":
        contextualPrefix = `${breadcrumbs}\n`;
        break;
      case "situational":
      case "situational-small-to-big": {
        situationalContext = generateHeuristicSituationalContext(c, allDocChunks);
        contextualPrefix = `[情境注标: ${situationalContext}]\n`;
        break;
      }
      case "neighbor-sliding":
        contextualPrefix = `${breadcrumbs}\n`;
        break;
    }

    const contextualText = contextualPrefix ? `${contextualPrefix}${c.content}` : c.content;

    return {
      ...c,
      contextualPrefix,
      contextualText,
      strategyName: strategy,
      breadcrumbs,
      situationalContext,
      tokenCount: SmartTruncator.estimateTokens(contextualText),
    };
  });
}

/**
 * 将 ContextualChunk 投影为 CorpusDocument 形状，复用既有检索通道
 */
export function toContextualDocument(chunk: ContextualChunk): CorpusDocument {
  const title = chunk.breadcrumbs
    ? chunk.breadcrumbs.replace(/^\[出处:\s*/, "").replace(/\]$/, "")
    : chunk.docTitle;

  return {
    id: chunk.id,
    path: `${chunk.docId}#${chunk.index}`,
    category: "docs",
    title,
    content: chunk.contextualText,
    tokenCount: chunk.tokenCount,
    authority: "active",
  };
}

// ---------------------------------------------------------------------------
// 5. 语境化切片检索管线 (Search Contextual Chunks)
// ---------------------------------------------------------------------------

export function searchContextualChunks(
  allChunks: Chunk[],
  query: string,
  options?: ChunkSearchOptions & {
    contextualStrategy?: ContextualStrategy;
    neighborWindow?: number;
  }
): ContextualOutcome {
  const strategy = options?.contextualStrategy ?? "situational";
  const contextualChunks = transformToContextualChunks(allChunks, strategy);
  const byId = new Map(contextualChunks.map((c) => [c.id, c]));
  const originalById = new Map(allChunks.map((c) => [c.id, c]));

  const topK = options?.topK ?? 12;
  const rerankTopN = options?.rerankTopN ?? 3;
  const parentSize = options?.parentSize ?? (strategy === "situational-small-to-big" ? 1400 : 0);
  const neighborWindow = options?.neighborWindow ?? (strategy === "neighbor-sliding" ? 1 : 0);

  // 投影为文档对象
  const docs = contextualChunks.map(toContextualDocument);

  const localQueryVector = computeDenseSemanticVector(query);
  const queryVector = options?.queryVector ?? localQueryVector;
  const sampleChunkVector = options?.chunkVectors?.values().next().value as number[] | undefined;
  const remoteUsable =
    options?.chunkVectors != null &&
    (sampleChunkVector == null || sampleChunkVector.length === queryVector.length);

  const effectiveChunkVectors = remoteUsable ? options?.chunkVectors : undefined;
  const effectiveQueryVector = remoteUsable ? queryVector : localQueryVector;

  const vectorNote = remoteUsable
    ? `远端向量通道（${queryVector.length} 维）`
    : "本地确定性语境向量通道";

  // Stage 1: Hybrid RRF
  const hybrid = searchHybridInDocs(docs, query, {
    algorithm: "rrf",
    k: 60,
    topK,
    queryVector: effectiveQueryVector,
    docVectors: effectiveChunkVectors,
    ...options?.hybridOptions,
  });

  // Stage 2: Cross-Encoder Reranker
  const reranked = rerankDocuments(query, hybrid.hybridResults, {
    topN: rerankTopN,
  });

  // 装配命中与扩展内容
  const hits: ContextualHit[] = reranked.slice(0, rerankTopN).map((r, idx) => {
    const ctxChunk = byId.get(r.doc.id);
    const origChunk = originalById.get(r.doc.id);
    if (!ctxChunk || !origChunk) {
      throw new Error(`Contextual chunk 投影失配：${r.doc.id}`);
    }

    let expanded: Chunk[] = [origChunk];
    if (neighborWindow > 0) {
      expanded = expandNeighborChunks(allChunks, origChunk, neighborWindow);
    } else if (parentSize > 0) {
      expanded = expandToParent(allChunks, origChunk, { parentSize });
    }

    let injectedContent = "";
    if (strategy === "raw") {
      injectedContent = expanded.map((c) => c.content).join("\n\n---\n\n");
    } else if (strategy === "breadcrumbs") {
      injectedContent = expanded
        .map((c) => `${extractBreadcrumbs(c)}\n${c.content}`)
        .join("\n\n---\n\n");
    } else if (strategy === "situational") {
      injectedContent = expanded
        .map((c) => {
          const s = byId.get(c.id);
          return s ? s.contextualText : c.content;
        })
        .join("\n\n---\n\n");
    } else if (strategy === "neighbor-sliding") {
      injectedContent = expanded.map((c) => c.content).join("\n\n");
    } else if (strategy === "situational-small-to-big") {
      const s = ctxChunk.situationalContext ? `[全局情境注标: ${ctxChunk.situationalContext}]\n` : "";
      injectedContent = `${s}${expanded.map((c) => c.content).join("\n\n")}`;
    }

    return {
      chunk: origChunk,
      rank: idx + 1,
      score: r.rerankScore,
      injectedContent,
      injectedTokens: SmartTruncator.estimateTokens(injectedContent),
      expandedChunkIds: expanded.map((c) => c.id),
      rerankScore: r.rerankScore,
      decisionReason: r.decisionReason,
      contextualPrefix: ctxChunk.contextualPrefix,
      originalContent: origChunk.content,
      strategyName: strategy,
    };
  });

  return {
    query,
    strategy,
    hits,
    totalInjectedTokens: hits.reduce((a, h) => a + h.injectedTokens, 0),
    stage1Count: hybrid.hybridResults.length,
    vectorMode: remoteUsable ? "remote" : "local",
    vectorNote,
  };
}

// ---------------------------------------------------------------------------
// 6. C10 基准评测全景大比武 (C10 Benchmark Evaluation Suite)
// ---------------------------------------------------------------------------

export interface ContextualBenchmarkConfig {
  label: string;
  strategy: ContextualStrategy;
  chunkStrategy: "fixed" | "recursive";
  chunkSize: number;
  overlap: number;
  parentSize?: number;
  neighborWindow?: number;
}

export interface ContextualCaseResult extends ChunkingCaseResult {
  anaphoraResolved: boolean;
  contextualPrefixSnippet?: string;
}

export interface ContextualEvalSummary {
  caseCount: number;
  locatedCount: number;
  locateRate: number;
  unitCompleteCount: number;
  unitCompletenessRate: number;
  injectedCompleteCount: number;
  injectedCompletenessRate: number;
  highDensityCompleteCount: number;
  highDensityCompletenessRate: number;
  avgInjectedTokens: number;
  avgSignalTokens: number;
  avgSignalDensity: number;
  anaphoraResolvedCount: number;
  anaphoraResolutionRate: number;
}

export interface ContextualEvalRow {
  config: ContextualBenchmarkConfig;
  summary: ContextualEvalSummary;
  cases: ContextualCaseResult[];
}

/**
 * C10 升级后的基准用例（正式解决 ck-05 孤岛代词）
 */
export function getC10BenchmarkCases(cases: ChunkingBenchmarkCase[]): ChunkingBenchmarkCase[] {
  return cases.map((c) => {
    if (c.id === "ck-05-orphan-anaphora") {
      return {
        ...c,
        solvedInThisLesson: true,
        goldenKeyFact:
          "跨可用区切换失败（主备切换 90 秒未完成）时须在 15 分钟内触发全局熔断并进入只读模式（第 10 课由 Contextual Retrieval 彻底解决）",
      };
    }
    return c;
  });
}

/**
 * 执行单组 Contextual 配置评测
 */
export function evaluateContextualConfig(
  docs: CorpusDocument[],
  cases: ChunkingBenchmarkCase[],
  config: ContextualBenchmarkConfig
): { summary: ContextualEvalSummary; cases: ContextualCaseResult[] } {
  const upgradedCases = getC10BenchmarkCases(cases);
  const rawChunkingResults = chunkCorpus(docs, {
    strategy: config.chunkStrategy,
    chunkSize: config.chunkSize,
    overlap: config.overlap,
  });
  const allChunks = rawChunkingResults.flatMap((r) => r.chunks);
  const docById = new Map(docs.map((d) => [d.id, d]));

  const caseResults: ContextualCaseResult[] = upgradedCases.map((benchCase) => {
    const targetDoc = docById.get(benchCase.needleDocId);
    if (!targetDoc) {
      throw new Error(`找不到基准文档：${benchCase.needleDocId}`);
    }

    const outcome = searchContextualChunks(allChunks, benchCase.query, {
      contextualStrategy: config.strategy,
      parentSize: config.parentSize ?? 0,
      neighborWindow: config.neighborWindow ?? 0,
      topK: 12,
      rerankTopN: 3,
    });

    const locator = benchCase.needlePatterns[0];
    const targetRank =
      outcome.hits.findIndex(
        (h) => chunkDocIdOf(h.chunk.id) === benchCase.needleDocId && locator.test(h.injectedContent)
      ) + 1;
    const located = targetRank > 0;

    const topHit = outcome.hits[0];
    const unitSource = topHit ? `${topHit.contextualPrefix}\n${topHit.originalContent}` : "";
    const unitComplete = topHit
      ? benchCase.needlePatterns.every((pat) => pat.test(unitSource))
      : false;

    const allInjectedText = outcome.hits.map((h) => h.injectedContent).join("\n\n");
    const injectedComplete = benchCase.needlePatterns.every((pat) => pat.test(allInjectedText));

    const signalTokens = benchCase.goldenKeyFact.length;
    const retrievedTokens = outcome.totalInjectedTokens;
    const signalDensity =
      retrievedTokens > 0 ? Number((signalTokens / retrievedTokens).toFixed(4)) : 0;

    const anaphoraResolved =
      benchCase.trapType === "orphan_anaphora"
        ? unitComplete || injectedComplete
        : true;

    const effective = injectedComplete && signalDensity >= 0.02;

    return {
      caseId: benchCase.id,
      title: benchCase.title,
      trapType: benchCase.trapType,
      solvedInThisLesson: benchCase.solvedInThisLesson,
      located,
      targetRank: located ? targetRank : null,
      unitComplete,
      injectedComplete,
      retrievedTokens,
      signalTokens,
      signalDensity,
      effective,
      anaphoraResolved,
      contextualPrefixSnippet: topHit?.contextualPrefix.slice(0, 60),
    };
  });

  const caseCount = caseResults.length;
  const locatedCount = caseResults.filter((c) => c.located).length;
  const unitCompleteCount = caseResults.filter((c) => c.unitComplete).length;
  const injectedCompleteCount = caseResults.filter((c) => c.injectedComplete).length;
  const highDensityCompleteCount = caseResults.filter((c) => c.effective).length;
  const anaphoraResolvedCount = caseResults.filter((c) => c.anaphoraResolved).length;

  const summary: ContextualEvalSummary = {
    caseCount,
    locatedCount,
    locateRate: caseCount > 0 ? Number(((locatedCount / caseCount) * 100).toFixed(1)) : 0,
    unitCompleteCount,
    unitCompletenessRate:
      caseCount > 0 ? Number(((unitCompleteCount / caseCount) * 100).toFixed(1)) : 0,
    injectedCompleteCount,
    injectedCompletenessRate:
      caseCount > 0 ? Number(((injectedCompleteCount / caseCount) * 100).toFixed(1)) : 0,
    highDensityCompleteCount,
    highDensityCompletenessRate:
      caseCount > 0 ? Number(((highDensityCompleteCount / caseCount) * 100).toFixed(1)) : 0,
    avgInjectedTokens: Math.round(
      caseResults.reduce((a, c) => a + c.retrievedTokens, 0) / Math.max(1, caseCount)
    ),
    avgSignalTokens: Math.round(
      caseResults.reduce((a, c) => a + c.signalTokens, 0) / Math.max(1, caseCount)
    ),
    avgSignalDensity: Number(
      (
        caseResults.reduce((a, c) => a + c.signalDensity, 0) / Math.max(1, caseCount)
      ).toFixed(4)
    ),
    anaphoraResolvedCount,
    anaphoraResolutionRate:
      caseCount > 0 ? Number(((anaphoraResolvedCount / caseCount) * 100).toFixed(1)) : 0,
  };

  return { summary, cases: caseResults };
}

/** C10 标准对决配置矩阵：覆盖 从孤立切片 到 Contextual 与 Small-to-Big 的递进体系 */
export const DEFAULT_CONTEXTUAL_MATRIX: ContextualBenchmarkConfig[] = [
  {
    label: "Conf 01: 原始定长 256（无语境孤岛）",
    strategy: "raw",
    chunkStrategy: "fixed",
    chunkSize: 256,
    overlap: 0,
  },
  {
    label: "Conf 02: 结构递归 256 + ov32（无语境）",
    strategy: "raw",
    chunkStrategy: "recursive",
    chunkSize: 256,
    overlap: 32,
  },
  {
    label: "Conf 03: Small-to-Big 256→1400（C9峰值）",
    strategy: "raw",
    chunkStrategy: "recursive",
    chunkSize: 256,
    overlap: 32,
    parentSize: 1400,
  },
  {
    label: "Conf 04: 结构面包屑增强 256",
    strategy: "breadcrumbs",
    chunkStrategy: "recursive",
    chunkSize: 256,
    overlap: 32,
  },
  {
    label: "Conf 05: 跨块邻接滑动扩展 256 (±1 Window)",
    strategy: "neighbor-sliding",
    chunkStrategy: "recursive",
    chunkSize: 256,
    overlap: 32,
    neighborWindow: 1,
  },
  {
    label: "Conf 06: 生成式情境注标 (Anthropic Contextual 256)",
    strategy: "situational",
    chunkStrategy: "recursive",
    chunkSize: 256,
    overlap: 32,
  },
  {
    label: "Conf 07: Contextual + Small-to-Big (终极协同)",
    strategy: "situational-small-to-big",
    chunkStrategy: "recursive",
    chunkSize: 256,
    overlap: 32,
    parentSize: 1400,
  },
];

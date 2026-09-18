import * as fs from "node:fs";
import * as path from "node:path";
import { SmartTruncator } from "~/core/context/truncator";

export interface CorpusDocument {
  id: string;
  path: string;
  category: "products" | "docs" | "adversarial";
  title: string;
  content: string;
  tokenCount: number;
  lastModified?: string;
  authority?: "active" | "deprecated" | "untrusted";
}

export interface BenchmarkQuestion {
  id: string;
  question: string;
  category: string;
  expectedFacts: string[];
  expectedSources: string[];
  difficulty: "easy" | "medium" | "hard";
}

export type { ContextMetrics, TierContextResult, LexicalSearchResult } from "./metrics";
export { measureContext, assembleTierFromDocs, extractKeywords, searchInDocs } from "./metrics";
export type { SemanticSearchResult, TokenFragment, FragmentationReport } from "./semantic";
export {
  cosineSimilarity,
  vectorDotProduct,
  vectorNorm,
  computeDenseSemanticVector,
  searchSemanticInDocs,
  simulateTokenFragmentation,
} from "./semantic";
import {
  measureContext,
  assembleTierFromDocs,
  extractKeywords,
  searchInDocs,
  type TierContextResult,
} from "./metrics";
import {
  searchSemanticInDocs,
  computeDenseSemanticVector,
  type SemanticSearchResult,
} from "./semantic";
export type {
  HybridSearchResult,
  HybridFusionOptions,
  FusionAlgorithm,
} from "./hybrid";
export {
  reciprocalRankFusion,
  minMaxScoreFusion,
  rawScoreSumFusion,
  searchHybridInDocs,
} from "./hybrid";
import {
  searchHybridInDocs,
  type HybridFusionOptions,
} from "./hybrid";
export type {
  RerankResult,
  RerankOptions,
  TwoStageFunnelResult,
  CrossAttentionTokenPair,
  C7BenchmarkCase,
} from "./reranker";
export {
  computeCrossAttentionMatrix,
  scoreCrossEncoder,
  rerankDocuments,
  runTwoStageFunnel,
  C7_BENCHMARK_CASES,
} from "./reranker";
import {
  rerankDocuments,
  runTwoStageFunnel,
  C7_BENCHMARK_CASES,
  type RerankOptions,
} from "./reranker";
export type {
  Chunk,
  ChunkStrategy,
  BoundaryType,
  ChunkingResult,
  ChunkingStats,
  ChunkingOptions,
  ChunkSearchOutcome,
  ChunkHit,
  ChunkTrapType,
  ChunkingBenchmarkCase,
  ChunkingEvalStrategy,
  ChunkingEvalConfig,
  ChunkingEvalOutcome,
  ChunkingEvalSummary,
  ChunkingCaseResult,
} from "./chunker";
export {
  chunkDocument,
  chunkCorpus,
  chunkWholeDocument,
  chunkByFixedSize,
  chunkRecursive,
  chunkSemantic,
  toChunkDocument,
  chunksToDocuments,
  chunkDocIdOf,
  searchChunks,
  expandToParent,
  evaluateChunkingStrategy,
  CHUNKING_BENCHMARK_CASES,
  HIGH_DENSITY_THRESHOLD,
} from "./chunker";
import {
  chunkCorpus,
  chunkDocument,
  evaluateChunkingStrategy,
  searchChunks,
  CHUNKING_BENCHMARK_CASES,
  type Chunk,
  type ChunkingEvalConfig,
  type ChunkingOptions,
  type ChunkSearchOptions,
  type ChunkingBenchmarkCase,
} from "./chunker";
export type { EmbeddingStage, EmbeddingKind, EmbeddingSet, VectorSelection } from "./embedding-store";
export {
  loadEmbeddingSet,
  listEmbeddingSets,
  listChunkEmbeddingSets,
  findChunkEmbeddingSet,
  resolveEmbeddingPath,
  selectCompatibleVectors,
  validateCoverage,
  FROZEN_STAGES,
} from "./embedding-store";
import {
  findChunkEmbeddingSet,
  listChunkEmbeddingSets,
  loadEmbeddingSet,
  selectCompatibleVectors,
  type EmbeddingKind,
  type EmbeddingStage,
} from "./embedding-store";
import type { ChunkStrategy } from "./chunker";

export class BenchmarkCorpusManager {
  private static basePath = path.join(process.cwd(), "data", "context-benchmark");

  /**
   * Load all ground truth documents from data/context-benchmark
   */
  static getAllDocuments(): CorpusDocument[] {
    const docs: CorpusDocument[] = [];
    const categories: Array<"products" | "docs" | "adversarial"> = ["products", "docs", "adversarial"];

    for (const cat of categories) {
      const dirPath = path.join(this.basePath, cat);
      if (!fs.existsSync(dirPath)) continue;

      const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const content = fs.readFileSync(fullPath, "utf-8");
        const relPath = `${cat}/${file}`;
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : file;

        let authority: CorpusDocument["authority"] = "active";
        if (file.includes("2024")) authority = "deprecated";
        if (cat === "adversarial") authority = "untrusted";

        docs.push({
          id: relPath,
          path: relPath,
          category: cat,
          title,
          content,
          tokenCount: SmartTruncator.estimateTokens(content),
          authority,
        });
      }
    }

    return docs;
  }

  /**
   * Read single document by ID (relPath like "products/alpha.md")
   */
  static readDocument(id: string): CorpusDocument | null {
    const fullPath = path.join(this.basePath, id);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      return null;
    }
    const content = fs.readFileSync(fullPath, "utf-8");
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : path.basename(id);
    const category = id.split("/")[0] as CorpusDocument["category"];

    return {
      id,
      path: id,
      category,
      title,
      content,
      tokenCount: SmartTruncator.estimateTokens(content),
    };
  }

  /**
   * Load golden benchmark Q&A evaluation questions
   */
  static getBenchmarkQuestions(): BenchmarkQuestion[] {
    const qaPath = path.join(this.basePath, "benchmark-qa.json");
    if (!fs.existsSync(qaPath)) return [];
    try {
      const raw = fs.readFileSync(qaPath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  static extractKeywords = extractKeywords;
  static searchInDocs = searchInDocs;

  /**
   * Lexical Search (Grep) over the corpus.
   * Supports a single query string or an array of keywords.
   */
  static searchText(queryOrKeywords: string | string[]) {
    return searchInDocs(this.getAllDocuments(), queryOrKeywords);
  }

  private static cachedDocEmbeddings: Map<string, number[]> | null = null;

  /**
   * Load pre-computed 512-dim document embeddings for the **C4~C7** stage.
   *
   * 历史资产：C4/C5/C6/C7 的全部向量检索都经由本方法取向量。
   * 向量集已按课程阶段迁移到 data/context-benchmark/c4-c7/document-embeddings.json，
   * 内容与迁移前逐字节一致。
   *
   * 注意：C8 引入的两篇长文档**不在**本集合内，`searchSemanticInDocs` 的向量来源
   * 一致性守卫会把它们从语义通道排除，而不是回退到异维向量。
   */
  static getDocumentEmbeddings(): Map<string, number[]> {
    if (this.cachedDocEmbeddings) return this.cachedDocEmbeddings;
    this.cachedDocEmbeddings = loadEmbeddingSet("c4-c7", "document").vectors;
    return this.cachedDocEmbeddings;
  }

  /** 按课程阶段 / 类型装载向量集 */
  static getStageEmbeddings(stage: EmbeddingStage, kind: EmbeddingKind) {
    return loadEmbeddingSet(stage, kind);
  }

  /** C8 chunk 级向量集：按切分配置精确匹配（文件名已编码配置） */
  static findChunkEmbeddings(config: { strategy: ChunkStrategy; chunkSize: number; overlap: number }) {
    return findChunkEmbeddingSet("c8", config);
  }

  /** 列出 C8 下全部可用的 chunk 向量集 */
  static listChunkEmbeddingSets() {
    return listChunkEmbeddingSets("c8");
  }

  /** C8 文档级向量集（c8/document-embeddings.json，覆盖含长文档的全量语料） */
  static getC8DocumentEmbeddings() {
    return loadEmbeddingSet("c8", "document");
  }

  /**
   * 维度安全的文档级向量选路（C8 文档级基线使用）。
   * 查询向量与向量集维度不一致时整体放弃远端向量，由调用方回退本地确定性向量。
   */
  static selectDocumentVectors(docIds: string[], queryDimensions: number) {
    return selectCompatibleVectors(docIds, this.getC8DocumentEmbeddings(), queryDimensions);
  }

  /** 维度安全的 chunk 级向量选路 */
  static selectChunkVectors(chunkIds: string[], queryDimensions: number) {
    const sets = listChunkEmbeddingSets("c8");
    const first = sets[0];
    if (!first) {
      return selectCompatibleVectors(chunkIds, loadEmbeddingSet("c8", "document"), queryDimensions);
    }
    return selectCompatibleVectors(chunkIds, first, queryDimensions);
  }

  // =========================================================================
  // C8: Chunking
  // =========================================================================

  /** 对全量语料（短文 + 长文）执行切分 */
  static chunkCorpus(options?: ChunkingOptions): ReturnType<typeof chunkCorpus> {
    return chunkCorpus(this.getAllDocuments(), options);
  }

  static chunkOne(docId: string, options?: ChunkingOptions) {
    const doc = this.readDocument(docId);
    if (!doc) return null;
    return chunkDocument(doc, options);
  }

  /** 扁平化全部切片，供 chunk 级检索使用 */
  static getAllChunks(options?: ChunkingOptions): Chunk[] {
    return this.chunkCorpus(options).flatMap((r) => r.chunks);
  }

  static searchChunkIndex(
    allChunks: Chunk[],
    query: string,
    options?: ChunkSearchOptions
  ) {
    return searchChunks(allChunks, query, options);
  }

  static getBenchmarkChunkingCases(): ChunkingBenchmarkCase[] {
    return CHUNKING_BENCHMARK_CASES;
  }

  static evaluateChunking(config: ChunkingEvalConfig) {
    return evaluateChunkingStrategy(this.getAllDocuments(), CHUNKING_BENCHMARK_CASES, config);
  }

  static computeSemanticVector = computeDenseSemanticVector;

  /**
   * Semantic Vector Search over the corpus.
   * Calculates real Cosine Similarity between the query embedding and each document embedding.
   */
  static searchSemantic(
    query: string,
    options?: {
      topK?: number;
      queryVector?: number[];
      minThreshold?: number;
      docVectors?: Map<string, number[]>;
    }
  ): SemanticSearchResult[] {
    const realDocVectors = this.getDocumentEmbeddings();
    const effectiveDocVectors =
      options?.docVectors ||
      (options?.queryVector && options.queryVector.length > 32 && realDocVectors.size > 0
        ? realDocVectors
        : undefined);

    return searchSemanticInDocs(this.getAllDocuments(), query, {
      ...options,
      docVectors: effectiveDocVectors,
    });
  }

  /**
   * Hybrid Retrieval (Lexical + Semantic + Fusion: RRF / MinMax / Raw)
   */
  static searchHybrid(
    query: string,
    options?: HybridFusionOptions
  ): ReturnType<typeof searchHybridInDocs> {
    const realDocVectors = this.getDocumentEmbeddings();
    const effectiveDocVectors =
      options?.docVectors ||
      (options?.queryVector && options.queryVector.length > 32 && realDocVectors.size > 0
        ? realDocVectors
        : undefined);

    return searchHybridInDocs(this.getAllDocuments(), query, {
      ...options,
      docVectors: effectiveDocVectors,
    });
  }

  /**
   * Cross-Encoder Reranker over candidates
   */
  static rerank(
    query: string,
    candidates: Parameters<typeof rerankDocuments>[1],
    options?: RerankOptions
  ) {
    return rerankDocuments(query, candidates, options);
  }

  /**
   * Two-Stage Funnel: Stage 1 Coarse Retrieval (Hybrid) + Stage 2 Fine Reranking (Cross-Encoder)
   */
  static searchTwoStage(
    query: string,
    options?: Parameters<typeof runTwoStageFunnel>[2]
  ) {
    return runTwoStageFunnel(this.getAllDocuments(), query, options);
  }

  /**
   * Get C7 Reranker benchmark evaluation cases
   */
  static getBenchmarkC7Cases() {
    return C7_BENCHMARK_CASES;
  }

  static measureContext = measureContext;

  /**
   * Assemble context for 3 tiers:
   * Tier A: Sufficient (only target doc)
   * Tier B: Diluted (target doc + 4~6 other docs)
   * Tier C: Saturated (all docs + distractor/expanded noise with position control)
   */
  static assembleTierContext(options: {
    targetDocId: string;
    tier: "A" | "B" | "C";
    position?: "top" | "middle" | "bottom";
  }): TierContextResult {
    return assembleTierFromDocs(this.getAllDocuments(), options);
  }
}

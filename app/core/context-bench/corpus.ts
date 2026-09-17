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
   * Load real pre-computed 512-dim document embeddings from data/context-benchmark/document-embeddings.json
   */
  static getDocumentEmbeddings(): Map<string, number[]> {
    if (this.cachedDocEmbeddings) return this.cachedDocEmbeddings;
    const embPath = path.join(this.basePath, "document-embeddings.json");
    this.cachedDocEmbeddings = new Map<string, number[]>();
    if (fs.existsSync(embPath)) {
      try {
        const raw = fs.readFileSync(embPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed.documents) {
          for (const [id, vec] of Object.entries(parsed.documents)) {
            this.cachedDocEmbeddings.set(id, vec as number[]);
          }
        }
      } catch (err) {
        console.warn("Failed to load document-embeddings.json:", err);
      }
    }
    return this.cachedDocEmbeddings;
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

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

export type { ContextMetrics, TierContextResult } from "./metrics";
export { measureContext, assembleTierFromDocs } from "./metrics";
import { measureContext, assembleTierFromDocs, type TierContextResult } from "./metrics";

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

  /**
   * Lexical Search (Grep) over the corpus
   */
  static searchText(query: string): Array<{ doc: CorpusDocument; matchSnippet: string; score: number }> {
    if (!query.trim()) return [];
    const docs = this.getAllDocuments();
    const results: Array<{ doc: CorpusDocument; matchSnippet: string; score: number }> = [];
    const lowerQuery = query.toLowerCase();

    for (const doc of docs) {
      const lowerContent = doc.content.toLowerCase();
      const idx = lowerContent.indexOf(lowerQuery);
      if (idx !== -1) {
        // Find line or window
        const start = Math.max(0, idx - 40);
        const end = Math.min(doc.content.length, idx + query.length + 60);
        const snippet = (start > 0 ? "..." : "") + doc.content.substring(start, end).replace(/\n/g, " ") + (end < doc.content.length ? "..." : "");
        results.push({
          doc,
          matchSnippet: snippet,
          score: 1.0,
        });
      }
    }

    return results;
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

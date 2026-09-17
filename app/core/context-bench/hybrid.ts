import type { CorpusDocument } from "./corpus";
import { searchInDocs, extractKeywords, type LexicalSearchResult } from "./metrics";
import { searchSemanticInDocs, type SemanticSearchResult } from "./semantic";

export type FusionAlgorithm = "rrf" | "minmax" | "raw_sum";

export interface HybridSearchResult {
  doc: CorpusDocument;
  finalRank: number; // 1-based rank
  finalScore: number; // fused score
  algorithm: FusionAlgorithm;
  lexicalRank: number | null; // 1-based rank, null if not returned
  lexicalScore: number; // raw lexical score
  semanticRank: number | null; // 1-based rank, null if not returned
  semanticScore: number; // raw semantic cosine similarity (0.0 ~ 1.0)
  normLexicalScore?: number; // normalized lexical score (0.0 ~ 1.0)
  normSemanticScore?: number; // normalized semantic score (0.0 ~ 1.0)
  matchReason: "both" | "lexical_only" | "semantic_only";
  contribution: {
    lexical: number;
    semantic: number;
  };
  previewSnippet: string;
  matchedKeywords: string[];
}

export interface HybridFusionOptions {
  algorithm?: FusionAlgorithm;
  k?: number; // RRF smoothing constant (default: 60)
  weightLexical?: number; // Lexical channel weight (default: 0.5)
  weightSemantic?: number; // Semantic channel weight (default: 0.5)
  topK?: number; // Top results to return (default: 8)
  queryVector?: number[]; // Optional precomputed query embedding
  docVectors?: Map<string, number[]>; // Optional precomputed doc embeddings
  customKeywords?: string[]; // Optional user-specified lexical keywords
}

/**
 * 1. Reciprocal Rank Fusion (RRF)
 * Formula:
 *   RRF_Score(d) = sum_{m in M} ( w_m / (k + r_m(d)) )
 *
 * Where:
 *   - r_m(d) is the 1-based rank of document d in channel m
 *   - k is a smoothing constant (typically 60)
 *   - w_m is the weight of channel m
 */
export function reciprocalRankFusion(
  lexicalResults: LexicalSearchResult[],
  semanticResults: SemanticSearchResult[],
  options?: {
    k?: number;
    weightLexical?: number;
    weightSemantic?: number;
    topK?: number;
  }
): HybridSearchResult[] {
  const k = options?.k ?? 60;
  const wLex = options?.weightLexical ?? 0.5;
  const wSem = options?.weightSemantic ?? 0.5;
  const topK = options?.topK ?? 8;

  // Map to hold aggregated document score candidates
  const docMap = new Map<
    string,
    {
      doc: CorpusDocument;
      lexResult: LexicalSearchResult | null;
      lexRank: number | null;
      semResult: SemanticSearchResult | null;
      semRank: number | null;
    }
  >();

  // Collect Lexical results
  lexicalResults.forEach((lr, idx) => {
    const id = lr.doc.id;
    if (!docMap.has(id)) {
      docMap.set(id, {
        doc: lr.doc,
        lexResult: lr,
        lexRank: idx + 1,
        semResult: null,
        semRank: null,
      });
    } else {
      const entry = docMap.get(id)!;
      entry.lexResult = lr;
      entry.lexRank = idx + 1;
    }
  });

  // Collect Semantic results
  semanticResults.forEach((sr, idx) => {
    const id = sr.doc.id;
    if (!docMap.has(id)) {
      docMap.set(id, {
        doc: sr.doc,
        lexResult: null,
        lexRank: null,
        semResult: sr,
        semRank: idx + 1,
      });
    } else {
      const entry = docMap.get(id)!;
      entry.semResult = sr;
      entry.semRank = idx + 1;
    }
  });

  // Compute RRF scores for all union candidates
  const fused: Array<{
    candidate: (typeof docMap extends Map<string, infer V> ? V : never);
    rrfScore: number;
    lexContrib: number;
    semContrib: number;
  }> = [];

  for (const item of docMap.values()) {
    let lexContrib = 0;
    let semContrib = 0;

    if (item.lexRank !== null) {
      lexContrib = wLex / (k + item.lexRank);
    }
    if (item.semRank !== null) {
      semContrib = wSem / (k + item.semRank);
    }

    const rrfScore = Number((lexContrib + semContrib).toFixed(6));
    fused.push({ candidate: item, rrfScore, lexContrib, semContrib });
  }

  // Sort descending by RRF score
  fused.sort((a, b) => b.rrfScore - a.rrfScore);

  return fused.slice(0, topK).map((item, index) => {
    const { candidate, rrfScore, lexContrib, semContrib } = item;
    const isLexHit = candidate.lexRank !== null;
    const isSemHit = candidate.semRank !== null;
    const matchReason: HybridSearchResult["matchReason"] =
      isLexHit && isSemHit
        ? "both"
        : isLexHit
        ? "lexical_only"
        : "semantic_only";

    const previewSnippet =
      candidate.lexResult?.matchSnippet ||
      candidate.semResult?.previewSnippet ||
      candidate.doc.content.slice(0, 180) + "...";

    const matchedKeywords = candidate.lexResult?.matchedKeywords || [];

    return {
      doc: candidate.doc,
      finalRank: index + 1,
      finalScore: rrfScore,
      algorithm: "rrf",
      lexicalRank: candidate.lexRank,
      lexicalScore: candidate.lexResult ? candidate.lexResult.score : 0,
      semanticRank: candidate.semRank,
      semanticScore: candidate.semResult ? candidate.semResult.similarity : 0,
      matchReason,
      contribution: {
        lexical: Number(lexContrib.toFixed(6)),
        semantic: Number(semContrib.toFixed(6)),
      },
      previewSnippet,
      matchedKeywords,
    };
  });
}

/**
 * 2. Min-Max Score Normalization Fusion
 * Formula:
 *   s_norm = (s - min) / (max - min)
 *   Score(d) = w_lex * s_norm_lex(d) + w_sem * s_norm_sem(d)
 */
export function minMaxScoreFusion(
  lexicalResults: LexicalSearchResult[],
  semanticResults: SemanticSearchResult[],
  options?: {
    weightLexical?: number;
    weightSemantic?: number;
    topK?: number;
  }
): HybridSearchResult[] {
  const wLex = options?.weightLexical ?? 0.5;
  const wSem = options?.weightSemantic ?? 0.5;
  const topK = options?.topK ?? 8;

  // Compute min/max for lexical scores
  const lexScores = lexicalResults.map((r) => r.score);
  const minLex = lexScores.length > 0 ? Math.min(...lexScores) : 0;
  const maxLex = lexScores.length > 0 ? Math.max(...lexScores) : 0;
  const diffLex = maxLex - minLex || 1;

  // Compute min/max for semantic scores
  const semScores = semanticResults.map((r) => r.similarity);
  const minSem = semScores.length > 0 ? Math.min(...semScores) : 0;
  const maxSem = semScores.length > 0 ? Math.max(...semScores) : 0;
  const diffSem = maxSem - minSem || 1;

  const docMap = new Map<
    string,
    {
      doc: CorpusDocument;
      lexResult: LexicalSearchResult | null;
      lexRank: number | null;
      normLex: number;
      semResult: SemanticSearchResult | null;
      semRank: number | null;
      normSem: number;
    }
  >();

  lexicalResults.forEach((lr, idx) => {
    const id = lr.doc.id;
    const normLex = (lr.score - minLex) / diffLex;
    docMap.set(id, {
      doc: lr.doc,
      lexResult: lr,
      lexRank: idx + 1,
      normLex,
      semResult: null,
      semRank: null,
      normSem: 0,
    });
  });

  semanticResults.forEach((sr, idx) => {
    const id = sr.doc.id;
    const normSem = (sr.similarity - minSem) / diffSem;
    if (docMap.has(id)) {
      const entry = docMap.get(id)!;
      entry.semResult = sr;
      entry.semRank = idx + 1;
      entry.normSem = normSem;
    } else {
      docMap.set(id, {
        doc: sr.doc,
        lexResult: null,
        lexRank: null,
        normLex: 0,
        semResult: sr,
        semRank: idx + 1,
        normSem,
      });
    }
  });

  const fused = Array.from(docMap.values()).map((item) => {
    const lexContrib = wLex * item.normLex;
    const semContrib = wSem * item.normSem;
    const finalScore = Number((lexContrib + semContrib).toFixed(4));
    return { item, finalScore, lexContrib, semContrib };
  });

  fused.sort((a, b) => b.finalScore - a.finalScore);

  return fused.slice(0, topK).map((entry, index) => {
    const { item, finalScore, lexContrib, semContrib } = entry;
    const isLexHit = item.lexRank !== null;
    const isSemHit = item.semRank !== null;
    const matchReason: HybridSearchResult["matchReason"] =
      isLexHit && isSemHit
        ? "both"
        : isLexHit
        ? "lexical_only"
        : "semantic_only";

    const previewSnippet =
      item.lexResult?.matchSnippet ||
      item.semResult?.previewSnippet ||
      item.doc.content.slice(0, 180) + "...";

    return {
      doc: item.doc,
      finalRank: index + 1,
      finalScore,
      algorithm: "minmax",
      lexicalRank: item.lexRank,
      lexicalScore: item.lexResult ? item.lexResult.score : 0,
      semanticRank: item.semRank,
      semanticScore: item.semResult ? item.semResult.similarity : 0,
      normLexicalScore: Number(item.normLex.toFixed(4)),
      normSemanticScore: Number(item.normSem.toFixed(4)),
      matchReason,
      contribution: {
        lexical: Number(lexContrib.toFixed(4)),
        semantic: Number(semContrib.toFixed(4)),
      },
      previewSnippet,
      matchedKeywords: item.lexResult?.matchedKeywords || [],
    };
  });
}

/**
 * 3. Raw Score Summation (The Anti-Pattern demonstration)
 * Directly adding BM25-like scores (e.g. 15.2) and Cosine similarities (e.g. 0.82)
 * Demonstrates why lexical score dominates and completely silences semantic signals.
 */
export function rawScoreSumFusion(
  lexicalResults: LexicalSearchResult[],
  semanticResults: SemanticSearchResult[],
  options?: {
    weightLexical?: number;
    weightSemantic?: number;
    topK?: number;
  }
): HybridSearchResult[] {
  const wLex = options?.weightLexical ?? 1.0;
  const wSem = options?.weightSemantic ?? 1.0;
  const topK = options?.topK ?? 8;

  const docMap = new Map<
    string,
    {
      doc: CorpusDocument;
      lexResult: LexicalSearchResult | null;
      lexRank: number | null;
      semResult: SemanticSearchResult | null;
      semRank: number | null;
    }
  >();

  lexicalResults.forEach((lr, idx) => {
    const id = lr.doc.id;
    docMap.set(id, {
      doc: lr.doc,
      lexResult: lr,
      lexRank: idx + 1,
      semResult: null,
      semRank: null,
    });
  });

  semanticResults.forEach((sr, idx) => {
    const id = sr.doc.id;
    if (docMap.has(id)) {
      const entry = docMap.get(id)!;
      entry.semResult = sr;
      entry.semRank = idx + 1;
    } else {
      docMap.set(id, {
        doc: sr.doc,
        lexResult: null,
        lexRank: null,
        semResult: sr,
        semRank: idx + 1,
      });
    }
  });

  const fused = Array.from(docMap.values()).map((item) => {
    const rawLex = item.lexResult ? item.lexResult.score : 0;
    const rawSem = item.semResult ? item.semResult.similarity : 0;
    const lexContrib = wLex * rawLex;
    const semContrib = wSem * rawSem;
    const finalScore = Number((lexContrib + semContrib).toFixed(4));
    return { item, finalScore, lexContrib, semContrib };
  });

  fused.sort((a, b) => b.finalScore - a.finalScore);

  return fused.slice(0, topK).map((entry, index) => {
    const { item, finalScore, lexContrib, semContrib } = entry;
    const isLexHit = item.lexRank !== null;
    const isSemHit = item.semRank !== null;
    const matchReason: HybridSearchResult["matchReason"] =
      isLexHit && isSemHit
        ? "both"
        : isLexHit
        ? "lexical_only"
        : "semantic_only";

    const previewSnippet =
      item.lexResult?.matchSnippet ||
      item.semResult?.previewSnippet ||
      item.doc.content.slice(0, 180) + "...";

    return {
      doc: item.doc,
      finalRank: index + 1,
      finalScore,
      algorithm: "raw_sum",
      lexicalRank: item.lexRank,
      lexicalScore: item.lexResult ? item.lexResult.score : 0,
      semanticRank: item.semRank,
      semanticScore: item.semResult ? item.semResult.similarity : 0,
      matchReason,
      contribution: {
        lexical: Number(lexContrib.toFixed(4)),
        semantic: Number(semContrib.toFixed(4)),
      },
      previewSnippet,
      matchedKeywords: item.lexResult?.matchedKeywords || [],
    };
  });
}

/**
 * End-to-end Pure Hybrid Retrieval over a CorpusDocument array.
 */
export function searchHybridInDocs(
  docs: CorpusDocument[],
  query: string,
  options?: HybridFusionOptions
): {
  hybridResults: HybridSearchResult[];
  lexicalResults: LexicalSearchResult[];
  semanticResults: SemanticSearchResult[];
  keywords: string[];
  algorithm: FusionAlgorithm;
  parameters: {
    k: number;
    weightLexical: number;
    weightSemantic: number;
    topK: number;
  };
} {
  const q = query.trim();
  const algorithm = options?.algorithm || "rrf";
  const k = options?.k ?? 60;
  const weightLexical = options?.weightLexical ?? 0.5;
  const weightSemantic = options?.weightSemantic ?? 0.5;
  const topK = options?.topK ?? 8;

  // 1. Lexical retrieval
  const keywords =
    options?.customKeywords && options.customKeywords.length > 0
      ? options.customKeywords
      : extractKeywords(q);
  const lexicalResults = searchInDocs(docs, keywords);

  // 2. Semantic retrieval
  const semanticResults = searchSemanticInDocs(docs, q, {
    topK: topK * 2,
    queryVector: options?.queryVector,
    docVectors: options?.docVectors,
  });

  // 3. Fusion based on selected algorithm
  let hybridResults: HybridSearchResult[];

  if (algorithm === "rrf") {
    hybridResults = reciprocalRankFusion(lexicalResults, semanticResults, {
      k,
      weightLexical,
      weightSemantic,
      topK,
    });
  } else if (algorithm === "minmax") {
    hybridResults = minMaxScoreFusion(lexicalResults, semanticResults, {
      weightLexical,
      weightSemantic,
      topK,
    });
  } else {
    hybridResults = rawScoreSumFusion(lexicalResults, semanticResults, {
      weightLexical,
      weightSemantic,
      topK,
    });
  }

  return {
    hybridResults,
    lexicalResults,
    semanticResults,
    keywords,
    algorithm,
    parameters: {
      k,
      weightLexical,
      weightSemantic,
      topK,
    },
  };
}

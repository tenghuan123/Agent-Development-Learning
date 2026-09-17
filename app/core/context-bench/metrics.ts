import { SmartTruncator } from "~/core/context/truncator";
import type { CorpusDocument } from "./corpus";

export interface ContextMetrics {
  totalTokens: number;
  relevantTokens: number;
  noiseTokens: number;
  snr: number; // 0.0 ~ 1.0 (Signal to Noise Ratio)
  estimatedCostUsd: number;
  estimatedLatencyMs: number;
  healthGrade: "OPTIMAL" | "DILUTED" | "SATURATED" | "DANGER";
  costMultiplier: number; // Multiplier relative to Tier A base cost
}

export interface TierContextResult {
  context: string;
  metrics: ContextMetrics;
  docsUsed: CorpusDocument[];
  targetDoc: CorpusDocument | null;
  position: "top" | "middle" | "bottom";
}

export interface LexicalSearchResult {
  doc: CorpusDocument;
  matchSnippet: string;
  allSnippets: string[];
  matchCount: number;
  matchedKeywords: string[];
  score: number;
}

/**
 * Pure in-memory zero-dependency lexical keyword extractor.
 * 100% safe to run in browser and server.
 */
export function extractKeywords(text: string): string[] {
  if (!text || !text.trim()) return [];

  // 1. Extract specific identifiers / error codes like ERR_ALPHA_AUTH_9021 or port 9443
  const codeRegex = /[A-Z0-9_]{4,}/g;
  const codes = text.match(codeRegex) || [];

  // 2. Common stop words in Chinese / English questions
  const stopWords = new Set([
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个",
    "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好",
    "自己", "这", "多少", "天", "天数", "什么", "怎么", "如何", "处理", "请问",
    "能不能", "还能", "买完", "东西", "之后", "以后", "可以", "吗", "呢", "吧", "根据", "最新",
    "政策", "常规", "旧", "哪个", "为什么", "如果", "用户", "已经", "购买", "更适合", "它", "它吗",
    "应该", "遇到", "求助", "咨询", "请教", "怎样", "支持",
    "what", "how", "why", "is", "the", "a", "an", "for", "to", "in", "on", "of", "and"
  ]);

  const keywords: string[] = [];

  // Add identifiers first
  for (const c of codes) {
    if (!keywords.includes(c)) keywords.push(c);
  }

  // Clean codes out of text to avoid duplicate fragments
  let remaining = text;
  for (const c of codes) {
    remaining = remaining.replace(c, " ");
  }

  // Match English product/tech names (e.g. Alpha, Beta, Gamma, SSO, port)
  const engMatches = remaining.match(/[A-Za-z][A-Za-z0-9_-]*/g) || [];
  for (const em of engMatches) {
    const lower = em.toLowerCase();
    if (!stopWords.has(lower) && !keywords.includes(em)) {
      keywords.push(em);
    }
  }

  // Match domain terms
  const domainDict = [
    "退款", "售后", "期限", "无理由", "向量数据库", "算力", "犹豫期", "冷静期",
    "授权密钥", "单点登录", "历史归档", "现行条款", "定制产品", "物流", "价格",
    "AlphaSyncDaemon", "AlphaAuthBridge", "BetaGammaConnector", "退换", "保障"
  ];
  for (const term of domainDict) {
    if (text.includes(term) && !keywords.includes(term)) {
      keywords.push(term);
    }
  }

  // If still no keyword extracted, split by 2-character Chinese segments
  if (keywords.length === 0) {
    const hanzi = text.replace(/[^\u4e00-\u9fa5]/g, "");
    for (let i = 0; i < hanzi.length - 1; i += 2) {
      const sub = hanzi.slice(i, i + 2);
      if (!stopWords.has(sub) && !keywords.includes(sub)) {
        keywords.push(sub);
      }
    }
  }

  return keywords;
}

/**
 * Pure in-memory Lexical Search (Grep) over any array of CorpusDocument.
 * 100% safe to run in browser and server.
 */
export function searchInDocs(
  docs: CorpusDocument[],
  queryOrKeywords: string | string[]
): LexicalSearchResult[] {
  const rawTokens = Array.isArray(queryOrKeywords)
    ? queryOrKeywords.filter((k) => k.trim().length > 0)
    : [queryOrKeywords.trim()].filter(Boolean);

  if (rawTokens.length === 0) return [];

  const results: LexicalSearchResult[] = [];

  for (const doc of docs) {
    const lowerContent = doc.content.toLowerCase();
    const lowerTitle = doc.title.toLowerCase();
    const matchedKeywordsSet = new Set<string>();
    const allSnippets: string[] = [];
    let totalMatchCount = 0;

    for (const token of rawTokens) {
      const lowerToken = token.toLowerCase();
      if (!lowerToken) continue;

      // Check in title
      if (lowerTitle.includes(lowerToken)) {
        matchedKeywordsSet.add(token);
        totalMatchCount += 2; // Title matches carry higher weight
      }

      // Check in content
      let startPos = 0;
      while (startPos < lowerContent.length) {
        const idx = lowerContent.indexOf(lowerToken, startPos);
        if (idx === -1) break;

        matchedKeywordsSet.add(token);
        totalMatchCount++;

        // Extract surrounding window snippet (~80 chars)
        const snippetStart = Math.max(0, idx - 30);
        const snippetEnd = Math.min(doc.content.length, idx + token.length + 50);
        const rawSnippet = doc.content.substring(snippetStart, snippetEnd).replace(/\r?\n/g, " ").trim();
        const formattedSnippet =
          (snippetStart > 0 ? "... " : "") + rawSnippet + (snippetEnd < doc.content.length ? " ..." : "");

        if (!allSnippets.includes(formattedSnippet) && allSnippets.length < 5) {
          allSnippets.push(formattedSnippet);
        }

        startPos = idx + Math.max(1, lowerToken.length);
      }
    }

    if (totalMatchCount > 0) {
      results.push({
        doc,
        matchSnippet: allSnippets[0] || "",
        allSnippets,
        matchCount: totalMatchCount,
        matchedKeywords: Array.from(matchedKeywordsSet),
        score: totalMatchCount + matchedKeywordsSet.size * 2,
      });
    }
  }

  // Sort by relevance score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}

/**
 * Pure in-memory calculation of context efficiency, tokens, SNR, and cost.
 * Fully safe to run in browser and server environments.
 */
export function measureContext(
  fullContext: string,
  relevantTokens: number,
  baseRelevantTokens = relevantTokens,
  costPer1kTokens = 0.001
): ContextMetrics {
  const totalTokens = Math.max(1, SmartTruncator.estimateTokens(fullContext));
  const effectiveRelevant = Math.min(relevantTokens, totalTokens);
  const noiseTokens = Math.max(0, totalTokens - effectiveRelevant);
  const snr = Number((effectiveRelevant / totalTokens).toFixed(4));
  const estimatedCostUsd = Number(((totalTokens / 1000) * costPer1kTokens).toFixed(6));
  const estimatedLatencyMs = Math.round(200 + (totalTokens / 1000) * 110);

  const baseCost = Number(((Math.max(1, baseRelevantTokens) / 1000) * costPer1kTokens).toFixed(6));
  const costMultiplier = Number((estimatedCostUsd / (baseCost || 0.0001)).toFixed(1));

  let healthGrade: ContextMetrics["healthGrade"] = "OPTIMAL";
  if (snr < 0.05 || totalTokens > 15000) healthGrade = "DANGER";
  else if (snr < 0.25 || totalTokens > 6000) healthGrade = "SATURATED";
  else if (snr < 0.70) healthGrade = "DILUTED";

  return {
    totalTokens,
    relevantTokens: effectiveRelevant,
    noiseTokens,
    snr,
    estimatedCostUsd,
    estimatedLatencyMs,
    healthGrade,
    costMultiplier: Math.max(1, costMultiplier),
  };
}

/**
 * Assemble context for 3 tiers from an in-memory document list:
 * - Tier A: Sufficient (only target doc)
 * - Tier B: Diluted (target doc + 4~6 other docs)
 * - Tier C: Saturated (all docs + distractor/expanded noise with position control)
 *
 * Fully safe to run in browser and server environments.
 */
export function assembleTierFromDocs(
  allDocs: CorpusDocument[],
  options: {
    targetDocId: string;
    tier: "A" | "B" | "C";
    position?: "top" | "middle" | "bottom";
  }
): TierContextResult {
  const { targetDocId, tier, position = "middle" } = options;
  const targetDoc = allDocs.find((d) => d.id === targetDocId) || allDocs[0];
  const otherDocs = allDocs.filter((d) => d.id !== targetDoc?.id);

  let docsUsed: CorpusDocument[];
  const baseRelevantTokens = targetDoc?.tokenCount || 400;

  if (tier === "A") {
    docsUsed = targetDoc ? [targetDoc] : [];
  } else if (tier === "B") {
    // Pick 5 other docs
    const noiseDocs = otherDocs.slice(0, 5);
    if (position === "top") {
      docsUsed = targetDoc ? [targetDoc, ...noiseDocs] : noiseDocs;
    } else if (position === "bottom") {
      docsUsed = targetDoc ? [...noiseDocs, targetDoc] : noiseDocs;
    } else {
      // middle
      const half = Math.floor(noiseDocs.length / 2);
      docsUsed = targetDoc
        ? [...noiseDocs.slice(0, half), targetDoc, ...noiseDocs.slice(half)]
        : noiseDocs;
    }
  } else {
    // Tier C: Saturated
    const noiseDocs = [...otherDocs];
    const expandedNoise: CorpusDocument[] = [...noiseDocs];
    for (const d of noiseDocs) {
      expandedNoise.push({
        ...d,
        id: `${d.id}#archive`,
        title: `[历史归档备忘] ${d.title}`,
      });
    }

    if (position === "top") {
      docsUsed = targetDoc ? [targetDoc, ...expandedNoise] : expandedNoise;
    } else if (position === "bottom") {
      docsUsed = targetDoc ? [...expandedNoise, targetDoc] : expandedNoise;
    } else {
      // middle: target doc placed directly in the middle (Lost in the Middle)
      const half = Math.floor(expandedNoise.length / 2);
      docsUsed = targetDoc
        ? [...expandedNoise.slice(0, half), targetDoc, ...expandedNoise.slice(half)]
        : expandedNoise;
    }
  }

  const contextParts = docsUsed.map((doc, idx) => {
    return `<<<DOCUMENT #${idx + 1}: ${doc.path} (${doc.title})>>>
${doc.content}
<<<END DOCUMENT #${idx + 1}>>>`;
  });

  const context = contextParts.join("\n\n");
  const metrics = measureContext(context, targetDoc?.tokenCount || 400, baseRelevantTokens);

  return {
    context,
    metrics,
    docsUsed,
    targetDoc: targetDoc || null,
    position,
  };
}

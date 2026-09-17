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

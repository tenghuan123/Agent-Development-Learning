import type { ToolCallItem } from "../tools/types";

/**
 * Standardize and normalize an object for deterministic hashing/stringifying
 */
function normalizeValue(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }
  if (typeof value === "object") {
    const sortedObj: Record<string, any> = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      sortedObj[key] = normalizeValue(value[key]);
    }
    return sortedObj;
  }
  return value;
}

/**
 * Generate a deterministic signature for a single tool call
 */
export function getToolCallSignature(call: ToolCallItem): string {
  const toolName = call.function.name;
  let parsedArgs: any = {};
  try {
    parsedArgs = JSON.parse(call.function.arguments || "{}");
  } catch {
    parsedArgs = call.function.arguments;
  }
  const normalized = normalizeValue(parsedArgs);
  return `${toolName}:${JSON.stringify(normalized)}`;
}

export interface LoopDetectionResult {
  isLoop: boolean;
  repeatCount: number;
  signature: string;
  toolName: string;
  reason?: string;
}

/**
 * Sliding window and consecutive duplicate detector for Agent tool calls
 */
export class LoopDetector {
  private history: Array<{
    step: number;
    signatures: string[];
    rawCalls: ToolCallItem[];
  }> = [];

  constructor() {}

  /**
   * Record tool calls made in a specific step
   */
  recordStep(step: number, calls: ToolCallItem[]): void {
    const signatures = calls.map(getToolCallSignature);
    this.history.push({
      step,
      signatures,
      rawCalls: calls,
    });
  }

  /**
   * Check if current step's tool calls constitute an infinite loop
   * 1. Consecutive identical tool calls (e.g. read_file("foo.ts") repeated N times)
   * 2. High frequency repeating patterns in sliding window
   */
  detectLoop(
    currentCalls: ToolCallItem[],
    threshold: number = 3
  ): LoopDetectionResult {
    if (currentCalls.length === 0) {
      return { isLoop: false, repeatCount: 0, signature: "", toolName: "" };
    }

    const currentSignatures = currentCalls.map(getToolCallSignature);

    // 1. Check for immediate consecutive duplicates in recent history
    for (const sig of currentSignatures) {
      let consecutiveCount = 1; // Current call is the 1st
      const toolName = sig.split(":")[0];

      for (let i = this.history.length - 1; i >= 0; i--) {
        const pastSignatures = this.history[i].signatures;
        if (pastSignatures.includes(sig)) {
          consecutiveCount++;
        } else {
          // Break on first non-matching step for strict consecutive check
          break;
        }
      }

      if (consecutiveCount >= threshold) {
        return {
          isLoop: true,
          repeatCount: consecutiveCount,
          signature: sig,
          toolName,
          reason: `工具 '${toolName}' 已连续 ${consecutiveCount} 次使用完全相同的参数被调用，判定为死循环。`,
        };
      }
    }

    // 2. Sliding window total frequency check (e.g. within last 6 steps, same call appeared >= threshold times)
    const windowSize = Math.min(this.history.length, 6);
    if (windowSize >= 3) {
      const recentHistory = this.history.slice(-windowSize);
      const frequencyMap = new Map<string, number>();

      for (const h of recentHistory) {
        for (const s of h.signatures) {
          frequencyMap.set(s, (frequencyMap.get(s) || 0) + 1);
        }
      }

      for (const sig of currentSignatures) {
        const pastOccurrences = frequencyMap.get(sig) || 0;
        const totalCount = pastOccurrences + 1;
        if (totalCount >= threshold + 1) {
          const toolName = sig.split(":")[0];
          return {
            isLoop: true,
            repeatCount: totalCount,
            signature: sig,
            toolName,
            reason: `在最近 ${windowSize + 1} 步中，工具 '${toolName}' 重复出现了 ${totalCount} 次相同参数调用。`,
          };
        }
      }
    }

    return {
      isLoop: false,
      repeatCount: 1,
      signature: currentSignatures[0] || "",
      toolName: currentCalls[0]?.function.name || "",
    };
  }

  /**
   * Reset detector state
   */
  clear(): void {
    this.history = [];
  }

  getStepHistory() {
    return this.history;
  }
}


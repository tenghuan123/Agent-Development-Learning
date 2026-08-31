import type { TruncationOptions, TruncationResult } from "./types";

export class SmartTruncator {
  /**
   * Fast, reliable token estimation
   * - Standard English / code tokens: ~4 chars per token
   * - CJK / Multibyte characters: ~1.5 chars per token
   */
  static estimateTokens(text: string): number {
    if (!text) return 0;
    let cjkCount = 0;
    let otherCount = 0;

    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      // CJK Unified Ideographs & Hiragana/Katakana/Hangul
      if (
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0x3400 && code <= 0x4dbf) ||
        (code >= 0x3000 && code <= 0x30ff) ||
        (code >= 0xac00 && code <= 0xd7af)
      ) {
        cjkCount++;
      } else {
        otherCount++;
      }
    }

    return Math.ceil(cjkCount * 0.7 + otherCount / 3.8);
  }

  /**
   * Regular expressions for detecting error / exception markers in terminal and build outputs
   */
  private static ERROR_PATTERNS = [
    /error(\s*:\s*|\s*\[|\b)/i,
    /exception\b/i,
    /fail(ed|ure)?\b/i,
    /fatal\b/i,
    /panic\b/i,
    /syntaxerror/i,
    /typeerror/i,
    /referenceerror/i,
    /rangeerror/i,
    /assertionerror/i,
    /ts\d{4,5}:/i, // TypeScript compiler diagnostics, e.g. TS2304
    /at\s+([a-zA-Z0-9_$.<>]+\s+\()?(\/|[a-zA-Z]:\\|\.)/i, // Stack trace line: at Object.<anonymous> (/path/...)
    /traceback\s+\(most\s+recent\s+call\s+last\)/i, // Python tracebacks
    /exit\s+code\s*[:=]\s*[1-9]/i,
  ];

  /**
   * Truncate long terminal logs or command outputs smartly
   * Preserves:
   * 1. Head lines (Command invocation & environment setup)
   * 2. Error focal windows (Lines containing errors, stack traces, and surrounding context)
   * 3. Tail lines (Exit codes and final summary)
   */
  static truncateLog(
    raw: string,
    options?: TruncationOptions
  ): TruncationResult {
    const maxLines = options?.maxLines ?? 160;
    const headLines = options?.headLines ?? 40;
    const tailLines = options?.tailLines ?? 80;
    const maxChars = options?.maxCharacters ?? 16000;
    const preserveErrors = options?.preserveErrors ?? true;

    const originalChars = raw.length;
    const originalTokens = this.estimateTokens(raw);
    const lines = raw.split("\n");
    const originalLines = lines.length;

    // If within limits, return untouched
    if (originalLines <= maxLines && originalChars <= maxChars) {
      return {
        content: raw,
        isTruncated: false,
        originalLines,
        retainedLines: originalLines,
        originalChars,
        retainedChars: originalChars,
        estimatedOriginalTokens: originalTokens,
        estimatedRetainedTokens: originalTokens,
        tokensSaved: 0,
        errorLinesFound: 0,
      };
    }

    // Step 1: Scan for error lines
    const errorIndices: number[] = [];
    if (preserveErrors) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (this.ERROR_PATTERNS.some((pattern) => pattern.test(line))) {
          errorIndices.push(i);
        }
      }
    }

    // Step 2: Determine line inclusion set
    const includedLineSet = new Set<number>();

    // Add head lines
    const headCount = Math.min(headLines, lines.length);
    for (let i = 0; i < headCount; i++) {
      includedLineSet.add(i);
    }

    // Add tail lines
    const tailStart = Math.max(0, lines.length - tailLines);
    for (let i = tailStart; i < lines.length; i++) {
      includedLineSet.add(i);
    }

    // Add error line windows (error line +/- 2 lines of surrounding context)
    for (const errIdx of errorIndices) {
      const windowStart = Math.max(0, errIdx - 2);
      const windowEnd = Math.min(lines.length - 1, errIdx + 2);
      for (let w = windowStart; w <= windowEnd; w++) {
        includedLineSet.add(w);
      }
    }

    // Step 3: Build the collapsed output with markdown markers
    const sortedIndices = Array.from(includedLineSet).sort((a, b) => a - b);
    const outputParts: string[] = [];
    let lastIndex = -1;

    for (const idx of sortedIndices) {
      if (lastIndex !== -1 && idx > lastIndex + 1) {
        const omitted = idx - lastIndex - 1;
        outputParts.push(
          `\n... [✂️ ContextEngine: 折叠了 ${omitted} 行流水日志，保留头部配置、尾部与核心报错] ...\n`
        );
      }
      outputParts.push(lines[idx]);
      lastIndex = idx;
    }

    // Handle trailing gap if any
    if (lastIndex !== -1 && lastIndex < lines.length - 1) {
      const omitted = lines.length - 1 - lastIndex;
      outputParts.push(
        `\n... [✂️ ContextEngine: 折叠了末尾 ${omitted} 行无关输出] ...\n`
      );
    }

    let resultText = outputParts.join("\n");

    // Fallback hard character truncation if still exceeding character ceiling
    if (resultText.length > maxChars) {
      resultText =
        resultText.substring(0, maxChars) +
        `\n\n... [✂️ ContextEngine: 输出过大，已截断至 ${maxChars} 字符上限] ...`;
    }

    const retainedLines = resultText.split("\n").length;
    const retainedChars = resultText.length;
    const estimatedRetainedTokens = this.estimateTokens(resultText);
    const tokensSaved = Math.max(0, originalTokens - estimatedRetainedTokens);

    return {
      content: resultText,
      isTruncated: true,
      originalLines,
      retainedLines,
      originalChars,
      retainedChars,
      estimatedOriginalTokens: originalTokens,
      estimatedRetainedTokens,
      tokensSaved,
      errorLinesFound: errorIndices.length,
    };
  }

  /**
   * Slice a file content with line numbers and token bounds
   */
  static sliceFile(
    content: string,
    startLine?: number,
    endLine?: number,
    maxTotalLines = 250
  ): TruncationResult {
    const lines = content.split("\n");
    const originalLines = lines.length;
    const originalChars = content.length;
    const originalTokens = this.estimateTokens(content);

    const s = startLine ? Math.max(1, startLine) : 1;
    const requestedEnd = endLine ? Math.min(originalLines, endLine) : originalLines;
    const e = Math.min(requestedEnd, s + maxTotalLines - 1);

    const selectedLines = lines.slice(s - 1, e);
    const formatted = selectedLines
      .map((line, idx) => `${String(s + idx).padStart(4, " ")} | ${line}`)
      .join("\n");

    const isTruncated = s > 1 || e < originalLines;
    const header = `=== File Slicing: Lines ${s}-${e} of ${originalLines} total ===\n`;
    const footer =
      e < originalLines
        ? `\n... [✂️ ContextEngine: 剩余 ${originalLines - e} 行未展开，请使用 startLine=${e + 1} 继续查看] ...`
        : "";

    const finalContent = header + formatted + footer;
    const retainedChars = finalContent.length;
    const estimatedRetainedTokens = this.estimateTokens(finalContent);
    const tokensSaved = Math.max(0, originalTokens - estimatedRetainedTokens);

    return {
      content: finalContent,
      isTruncated,
      originalLines,
      retainedLines: selectedLines.length,
      originalChars,
      retainedChars,
      estimatedOriginalTokens: originalTokens,
      estimatedRetainedTokens,
      tokensSaved,
      errorLinesFound: 0,
    };
  }
}


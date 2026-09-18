import { SmartTruncator } from "~/core/context/truncator";
import type { CorpusDocument } from "./corpus";
import { computeDenseSemanticVector, cosineSimilarity } from "./semantic";
import { searchHybridInDocs, type HybridFusionOptions } from "./hybrid";
import { rerankDocuments, type RerankResult } from "./reranker";

/**
 * Chunking —— 把「检索的原子单位」从整篇文档下沉到切片。
 *
 * 关键架构洞察：本模块**不重写任何检索算法**。chunk 只需投影成 CorpusDocument
 * 形状（`toChunkDocument`），C3/C4/C6/C7 的全部既有管线
 * （searchInDocs / searchSemanticInDocs / reciprocalRankFusion / rerankDocuments）
 * 即可零改动复用。
 *
 * Chunking 改变的不是检索算法，而是检索的原子单位 —— 它是一个位于整个检索栈
 * **之下**的语料变换层。
 */

/** 「document」是退化情形下的切分策略：chunk 大小 = 整篇文档 */
export type ChunkStrategy = "document" | "fixed" | "recursive" | "semantic";

export type BoundaryType = "heading" | "paragraph" | "sentence" | "hard_cut";

export interface StructuralIntegrity {
  /** 切片起点或终点落在 ``` 围栏内部 */
  breaksCodeBlock: boolean;
  /** 切片落在表格内部但未包含表头行 */
  breaksTable: boolean;
  /** 切片起点或终点位于句子中间 */
  breaksSentence: boolean;
}

export interface OrphanRisk {
  isOrphanHead: boolean;
  anaphoraTerm?: string;
  explanation: string;
}

export interface Chunk {
  id: string;
  docId: string;
  docTitle: string;
  index: number;
  content: string;
  tokenCount: number;
  charStart: number;
  charEnd: number;
  sectionPath: string[];
  headingLevel: number;
  boundaryType: BoundaryType;
  overlapPrevChars: number;
  overlapNextChars: number;
  structuralIntegrity: StructuralIntegrity;
  orphanRisk: OrphanRisk;
  strategy: ChunkStrategy;
  parentChunkId?: string;
}

export interface ChunkingStats {
  chunkCount: number;
  avgTokens: number;
  p95Tokens: number;
  minTokens: number;
  maxTokens: number;
  /** 含 overlap 重复后的索引总量 */
  indexTokens: number;
  /** overlap 带来的冗余率（占原始语料的比例） */
  redundancyPct: number;
  boundaryBreakdown: Record<BoundaryType, number>;
  /** 原始几何破坏数（切点落在句中断句 / 代码围栏 / 表格内部） */
  boundaryDamageRaw: number;
  /** 被重叠窗口补救的破坏数：相邻切片已经覆盖了被切断的那一段 */
  overlapRepaired: number;
  /** 真正无法补救的破坏数 = boundaryDamageRaw - overlapRepaired */
  structuralViolations: number;
  orphanChunks: number;
}

export interface ChunkingDiagnostics {
  /** 仅 semantic 策略：相邻句余弦相似度序列与断点判定，用于「边界解剖」可视化 */
  semanticBoundaries?: Array<{
    offset: number;
    similarity: number;
    isBreak: boolean;
    snippet: string;
  }>;
  /** 每个切分点的成因，用于色带标注 */
  cutPoints?: Array<{ offset: number; boundaryType: BoundaryType; note: string }>;
}

export interface ChunkingResult {
  docId: string;
  docTitle: string;
  strategy: ChunkStrategy;
  chunkSize: number;
  overlap: number;
  docTokens: number;
  chunks: Chunk[];
  stats: ChunkingStats;
  diagnostics?: ChunkingDiagnostics;
}

export interface ChunkingOptions {
  strategy?: ChunkStrategy;
  /** 目标切片大小（token）。document 策略忽略此值 */
  chunkSize?: number;
  /** 相邻切片的重叠窗口（token） */
  overlap?: number;
  /** semantic 策略：相邻句余弦低于此值判定为主题切换边界 */
  semanticThreshold?: number;
}

// ---------------------------------------------------------------------------
// 字符 ↔ token 换算
// ---------------------------------------------------------------------------

const estimateTokens = (text: string): number => SmartTruncator.estimateTokens(text);

/**
 * 按文本自身的中英文密度把 token 预算折算为字符预算。
 * estimateTokens 是「CJK × 0.7 + 其他 / 3.8」的非线性估算，
 * 因此用整篇文档的平均密度做折算，保证同一文档内切分尺度自洽。
 */
function tokensToChars(text: string, tokens: number): number {
  if (tokens <= 0) return 1;
  const docTokens = estimateTokens(text);
  if (docTokens <= 0) return Math.max(1, Math.round(tokens));
  return Math.max(1, Math.round((tokens / docTokens) * text.length));
}

// ---------------------------------------------------------------------------
// 结构标注：标题栈 / 表格 / 代码围栏 / 句子边界
// ---------------------------------------------------------------------------

interface HeadingMark {
  offset: number;
  level: number;
  text: string;
}

function scanHeadings(text: string): HeadingMark[] {
  const marks: HeadingMark[] = [];
  const headingRe = /^(#{1,6})\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(text)) !== null) {
    marks.push({ offset: m.index, level: m[1].length, text: m[2].trim() });
  }
  return marks;
}

/** 给定字符偏移，回溯出所在章节路径（从 H1 到最深祖先） */
function sectionPathAt(headings: HeadingMark[], offset: number): { path: string[]; level: number } {
  const stack: HeadingMark[] = [];
  for (const h of headings) {
    if (h.offset > offset) break;
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) stack.pop();
    stack.push(h);
  }
  return { path: stack.map((h) => h.text), level: stack.length > 0 ? stack[stack.length - 1].level : 0 };
}

/** 代码围栏（``` 或 ~~~）的字符区间集合 */
function scanCodeFences(text: string): Array<{ start: number; end: number }> {
  const fences: Array<{ start: number; end: number }> = [];
  const fenceRe = /^(\s*)(```|~~~)/gm;
  const marks: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) marks.push(m.index);
  for (let i = 0; i + 1 < marks.length; i += 2) {
    fences.push({ start: marks[i], end: marks[i + 1] });
  }
  return fences;
}

/** Markdown 表格区块：连续的以 | 开头的行 */
function scanTables(text: string): Array<{ start: number; end: number; headerEnd: number }> {
  const tables: Array<{ start: number; end: number; headerEnd: number }> = [];
  const lines = text.split("\n");
  let offset = 0;
  let runStart = -1;
  let headerEnd = -1;
  let lineCount = 0;

  const flush = (end: number) => {
    if (runStart >= 0 && lineCount >= 2) tables.push({ start: runStart, end, headerEnd });
    runStart = -1;
    headerEnd = -1;
    lineCount = 0;
  };

  for (const line of lines) {
    const isRow = /^\s*\|.*\|\s*$/.test(line);
    if (isRow) {
      if (runStart < 0) runStart = offset;
      lineCount++;
      if (headerEnd < 0 && lineCount === 2) headerEnd = offset; // 表头 + 分隔行之后
    } else {
      flush(offset);
    }
    offset += line.length + 1;
  }
  flush(text.length);
  return tables;
}

const SENTENCE_END_RE = /[。！？；!?;]/;

function endsSentence(text: string, offset: number): boolean {
  if (offset <= 0) return true;
  if (offset >= text.length) return true;
  const prev = text[offset - 1];
  return SENTENCE_END_RE.test(prev) || prev === "\n";
}

function startsSentence(text: string, offset: number): boolean {
  if (offset <= 0) return true;
  if (offset >= text.length) return true;
  if (text[offset] === "\n") return true;
  return endsSentence(text, offset);
}

/** 句首指代词 —— 切片脱离父文档后失去主语的典型来源 */
const ANAPHORA_PATTERNS: Array<{ re: RegExp; term: string }> = [
  { re: /^这种情况下/, term: "这种情况下" },
  { re: /^上述(情况|规则|参数|配置|流程)/, term: "上述…" },
  { re: /^(那么|因此|所以|据此|如此|同理|反之|同样)/, term: "逻辑连接词" },
  { re: /^(但是|然而|不过|此外|同时)/, term: "转折/补充连接词" },
  { re: /^(该|其|此|本)(规则|参数|值|项|条|流程|策略|配置|动作|操作|方式|方法)/, term: "该/其/此 + 名词" },
  { re: /^这(种|些|一|个|项|条|次|里)/, term: "这…" },
  { re: /^(此时|这时|届时)/, term: "此时" },
];

function detectOrphanHead(chunkText: string, chunkIndex: number): OrphanRisk {
  if (chunkIndex === 0) {
    return { isOrphanHead: false, explanation: "文档首个切片，不存在前文指代问题" };
  }
  // 去掉 markdown 标记与空白后，看首个句子的起头
  const head = chunkText
    .replace(/^[\s>#*\-|`]+/, "")
    .replace(/\s+/g, "")
    .slice(0, 24);

  for (const { re, term } of ANAPHORA_PATTERNS) {
    if (re.test(head)) {
      return {
        isOrphanHead: true,
        anaphoraTerm: term,
        explanation: `切片以「${term}」起头，主语/前件落在上一个切片，单独注入模型时会失去指代对象`,
      };
    }
  }
  return { isOrphanHead: false, explanation: "首句自含主语，不依赖前文" };
}

// ---------------------------------------------------------------------------
// 通用：由字符区间装配 Chunk
// ---------------------------------------------------------------------------

interface RawSpan {
  charStart: number;
  charEnd: number;
  boundaryType: BoundaryType;
  overlapPrevChars: number;
}

interface DocContext {
  text: string;
  headings: HeadingMark[];
  fences: Array<{ start: number; end: number }>;
  tables: Array<{ start: number; end: number; headerEnd: number }>;
}

function buildChunk(
  doc: CorpusDocument,
  ctx: DocContext,
  span: RawSpan,
  index: number,
  strategy: ChunkStrategy
): Chunk {
  const content = ctx.text.slice(span.charStart, span.charEnd);
  const { path, level } = sectionPathAt(ctx.headings, span.charStart);

  const inFence = (offset: number) =>
    ctx.fences.some((f) => offset > f.start && offset < f.end);

  const tableBroken = ctx.tables.some(
    (t) => span.charStart < t.end && span.charEnd > t.start && span.charStart > t.headerEnd
  );

  const structuralIntegrity: StructuralIntegrity = {
    breaksCodeBlock: inFence(span.charStart) || inFence(span.charEnd - 1),
    breaksTable: tableBroken,
    breaksSentence: !startsSentence(ctx.text, span.charStart) || !endsSentence(ctx.text, span.charEnd),
  };

  return {
    id: `${doc.id}#c${index}`,
    docId: doc.id,
    docTitle: doc.title,
    index,
    content,
    tokenCount: estimateTokens(content),
    charStart: span.charStart,
    charEnd: span.charEnd,
    sectionPath: path,
    headingLevel: level,
    boundaryType: span.boundaryType,
    overlapPrevChars: span.overlapPrevChars,
    overlapNextChars: 0,
    structuralIntegrity,
    orphanRisk: detectOrphanHead(content, index),
    strategy,
  };
}

function finalizeResult(
  doc: CorpusDocument,
  strategy: ChunkStrategy,
  chunkSize: number,
  overlap: number,
  chunks: Chunk[],
  diagnostics?: ChunkingDiagnostics
): ChunkingResult {
  // 回填 overlapNextChars（由下一片的 overlapPrevChars 推得）
  for (let i = 0; i < chunks.length - 1; i++) {
    chunks[i].overlapNextChars = chunks[i + 1].overlapPrevChars;
  }

  const tokens = chunks.map((c) => c.tokenCount);
  const sortedTokens = [...tokens].sort((a, b) => a - b);
  const indexTokens = tokens.reduce((a, b) => a + b, 0);
  const boundaryBreakdown: Record<BoundaryType, number> = {
    heading: 0,
    paragraph: 0,
    sentence: 0,
    hard_cut: 0,
  };
  for (const c of chunks) boundaryBreakdown[c.boundaryType]++;

  const p95Idx = sortedTokens.length > 0 ? Math.min(sortedTokens.length - 1, Math.floor(sortedTokens.length * 0.95)) : 0;

  // 原始几何破坏 vs 被重叠补救的破坏。
  // 重叠窗口会让切片起点落回上一句中间 —— 但上一片已经完整包含了那一句，
  // 因此这种「破坏」实际由相邻切片补全，不应计入不可补救的破坏。
  const isDamaged = (c: Chunk) =>
    c.structuralIntegrity.breaksCodeBlock ||
    c.structuralIntegrity.breaksTable ||
    c.structuralIntegrity.breaksSentence;
  const isRepaired = (c: Chunk, i: number) => {
    const startCovered = c.structuralIntegrity.breaksSentence && c.overlapPrevChars > 0;
    const endCovered = c.structuralIntegrity.breaksSentence && c.overlapNextChars > 0;
    const codeOrTable = c.structuralIntegrity.breaksCodeBlock || c.structuralIntegrity.breaksTable;
    // 代码围栏与表格的结构破坏只有相邻切片实际覆盖到才算出补救
    const neighborCovers = (chunks[i - 1]?.overlapNextChars ?? 0) > 0 || (chunks[i + 1]?.overlapPrevChars ?? 0) > 0;
    if (codeOrTable) return neighborCovers;
    return startCovered || endCovered;
  };
  const boundaryDamageRaw = chunks.filter(isDamaged).length;
  const overlapRepaired = chunks.filter((c, i) => isDamaged(c) && isRepaired(c, i)).length;

  const stats: ChunkingStats = {
    chunkCount: chunks.length,
    avgTokens: tokens.length > 0 ? Number((indexTokens / tokens.length).toFixed(1)) : 0,
    p95Tokens: sortedTokens[p95Idx] ?? 0,
    minTokens: sortedTokens[0] ?? 0,
    maxTokens: sortedTokens[sortedTokens.length - 1] ?? 0,
    indexTokens,
    redundancyPct:
      doc.tokenCount > 0
        ? Number((((indexTokens - doc.tokenCount) / doc.tokenCount) * 100).toFixed(1))
        : 0,
    boundaryBreakdown,
    boundaryDamageRaw,
    overlapRepaired,
    structuralViolations: boundaryDamageRaw - overlapRepaired,
    orphanChunks: chunks.filter((c) => c.orphanRisk.isOrphanHead).length,
  };

  return {
    docId: doc.id,
    docTitle: doc.title,
    strategy,
    chunkSize,
    overlap,
    docTokens: doc.tokenCount,
    chunks,
    stats,
    diagnostics,
  };
}

function makeContext(text: string): DocContext {
  return {
    text,
    headings: scanHeadings(text),
    fences: scanCodeFences(text),
    tables: scanTables(text),
  };
}

/** 由字符偏移推断这一刀切在了什么边界上 */
function classifyBoundary(ctx: DocContext, offset: number): BoundaryType {
  if (offset <= 0 || offset >= ctx.text.length) return "heading";
  if (ctx.headings.some((h) => h.offset === offset)) return "heading";
  const prevChar = ctx.text[offset - 1];
  if (prevChar === "\n" && ctx.text[offset - 2] === "\n") return "paragraph";
  if (prevChar === "\n") return "paragraph";
  if (SENTENCE_END_RE.test(prevChar)) return "sentence";
  return "hard_cut";
}

// ---------------------------------------------------------------------------
// 策略 1：document —— 整篇文档即一个切片（退化基线）
// ---------------------------------------------------------------------------

export function chunkWholeDocument(doc: CorpusDocument): ChunkingResult {
  const ctx = makeContext(doc.content);
  const chunk = buildChunk(
    doc,
    ctx,
    { charStart: 0, charEnd: doc.content.length, boundaryType: "heading", overlapPrevChars: 0 },
    0,
    "document"
  );
  return finalizeResult(doc, "document", doc.tokenCount, 0, [chunk]);
}

// ---------------------------------------------------------------------------
// 策略 2：fixed —— 朴素定长滑窗，无视文档结构
// ---------------------------------------------------------------------------

export function chunkByFixedSize(
  doc: CorpusDocument,
  options?: { chunkSize?: number; overlap?: number }
): ChunkingResult {
  const text = doc.content;
  const chunkSize = Math.max(16, options?.chunkSize ?? 512);
  const overlap = Math.max(0, options?.overlap ?? 0);
  if (text.length === 0) return finalizeResult(doc, "fixed", chunkSize, overlap, []);

  const ctx = makeContext(text);
  const windowChars = Math.max(1, tokensToChars(text, chunkSize));
  // 注意：overlap 为 0 时步长必须严格等于窗口，否则会退化成 1 字符重叠，
  // 让所有「句中断裂」都被误判为已被相邻切片补救。
  const overlapChars = overlap > 0 ? tokensToChars(text, overlap) : 0;
  const stepChars = Math.max(1, windowChars - overlapChars);

  const spans: RawSpan[] = [];
  for (let start = 0; start < text.length; start += stepChars) {
    const end = Math.min(text.length, start + windowChars);
    const overlapPrev = spans.length === 0 ? 0 : Math.max(0, spans[spans.length - 1].charEnd - start);
    spans.push({
      charStart: start,
      charEnd: end,
      boundaryType: classifyBoundary(ctx, start),
      overlapPrevChars: overlapPrev,
    });
    if (end >= text.length) break;
  }

  const chunks = spans.map((s, i) => buildChunk(doc, ctx, s, i, "fixed"));
  return finalizeResult(doc, "fixed", chunkSize, overlap, chunks, {
    cutPoints: spans.map((s) => ({
      offset: s.charStart,
      boundaryType: s.boundaryType,
      note: `定长滑窗切割（窗口 ${chunkSize} token，步长 ${chunkSize - overlap} token）`,
    })),
  });
}

// ---------------------------------------------------------------------------
// 策略 3：recursive —— 结构感知递归分割（标题 → 段落 → 句子 → 硬切兜底）
// ---------------------------------------------------------------------------

const SEPARATOR_LEVELS: Array<{ pattern: RegExp; type: BoundaryType; label: string }> = [
  { pattern: /\n(?=#{1,6}\s)/, type: "heading", label: "Markdown 标题边界" },
  { pattern: /\n\s*\n/, type: "paragraph", label: "空行（段落）边界" },
  { pattern: /(?<=[。！？；])/, type: "sentence", label: "中文句末标点边界" },
];

interface Unit {
  text: string;
  start: number;
  boundaryType: BoundaryType;
}

/** 按分隔符切分并保留每段在原文中的偏移 */
function splitWithOffsets(text: string, pattern: RegExp): Array<{ text: string; start: number }> {
  const parts: Array<{ text: string; start: number }> = [];
  let last = 0;
  // 用 split 拿不到偏移，故手动扫描
  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  const re = new RegExp(pattern.source, flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const cut = m.index + m[0].length;
    if (cut > last) {
      parts.push({ text: text.slice(last, cut), start: last });
      last = cut;
    }
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < text.length) parts.push({ text: text.slice(last), start: last });
  return parts;
}

function splitRecursive(
  text: string,
  offset: number,
  level: number,
  maxChars: number,
  out: Unit[]
): void {
  if (text.length === 0) return;

  if (text.length <= maxChars) {
    const type = level === 0 ? "heading" : SEPARATOR_LEVELS[Math.min(level - 1, SEPARATOR_LEVELS.length - 1)].type;
    out.push({ text, start: offset, boundaryType: type });
    return;
  }

  if (level >= SEPARATOR_LEVELS.length) {
    // 已无可用分隔符（超长无标点片段）→ 硬切兜底
    for (let i = 0; i < text.length; i += maxChars) {
      out.push({ text: text.slice(i, i + maxChars), start: offset + i, boundaryType: "hard_cut" });
    }
    return;
  }

  const parts = splitWithOffsets(text, SEPARATOR_LEVELS[level].pattern);
  if (parts.length <= 1) {
    splitRecursive(text, offset, level + 1, maxChars, out);
    return;
  }
  for (const p of parts) {
    splitRecursive(p.text, offset + p.start, level + 1, maxChars, out);
  }
}

export function chunkRecursive(
  doc: CorpusDocument,
  options?: { chunkSize?: number; overlap?: number }
): ChunkingResult {
  const text = doc.content;
  const chunkSize = Math.max(16, options?.chunkSize ?? 512);
  const overlap = Math.max(0, options?.overlap ?? 0);
  if (text.length === 0) return finalizeResult(doc, "recursive", chunkSize, overlap, []);

  const ctx = makeContext(text);
  const maxChars = Math.max(1, tokensToChars(text, chunkSize));

  const units: Unit[] = [];
  splitRecursive(text, 0, 0, maxChars, units);

  // 贪心打包：尽量填满预算，但绝不越过 unit 边界
  const spans: RawSpan[] = [];
  let cursor = 0;
  let currentStart = units.length > 0 ? units[0].start : 0;
  let currentEnd = currentStart;

  for (const unit of units) {
    const unitEnd = unit.start + unit.text.length;
    const wouldBe = unitEnd - currentStart;
    if (cursor > 0 && wouldBe > maxChars) {
      const overlapPrev =
        spans.length === 0
          ? 0
          : Math.max(0, spans[spans.length - 1].charEnd - overlappingStart(ctx.text, currentStart, overlap));
      spans.push({
        charStart: overlappingStart(ctx.text, currentStart, overlap),
        charEnd: currentEnd,
        boundaryType: spans.length === 0 ? "heading" : unit.boundaryType,
        overlapPrevChars: overlapPrev,
      });
      currentStart = unit.start;
      cursor = 0;
    }
    currentEnd = unitEnd;
    cursor += unit.text.length;
  }
  if (currentEnd > currentStart) {
    const overlapPrev =
      spans.length === 0
        ? 0
        : Math.max(0, spans[spans.length - 1].charEnd - overlappingStart(ctx.text, currentStart, overlap));
    spans.push({
      charStart: overlappingStart(ctx.text, currentStart, overlap),
      charEnd: currentEnd,
      boundaryType: spans.length === 0 ? "heading" : "paragraph",
      overlapPrevChars: overlapPrev,
    });
  }

  const chunks = spans.map((s, i) => buildChunk(doc, ctx, s, i, "recursive"));
  return finalizeResult(doc, "recursive", chunkSize, overlap, chunks, {
    cutPoints: spans.map((s) => ({
      offset: s.charStart,
      boundaryType: s.boundaryType,
      note: `结构感知分割，切于${SEPARATOR_LEVELS.find((l) => l.type === s.boundaryType)?.label ?? "文档边界"}`,
    })),
  });
}

/** 把切片起点向前回退 overlap 字符预算，但不越过上一片终点 */
function overlappingStart(text: string, start: number, overlapTokens: number): number {
  if (overlapTokens <= 0) return start;
  const back = tokensToChars(text, overlapTokens);
  return Math.max(0, start - back);
}

// ---------------------------------------------------------------------------
// 策略 4：semantic —— 相邻句余弦相似度跌破阈值处判定为主题切换边界
// ---------------------------------------------------------------------------

const SENTENCE_SPLIT_RE = /[^。！？；\n]*(?:[。！？；]|\n|$)/g;

function splitSentences(text: string): Array<{ text: string; start: number }> {
  const out: Array<{ text: string; start: number }> = [];
  const re = new RegExp(SENTENCE_SPLIT_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    out.push({ text: m[0], start: m.index });
  }
  return out;
}

export function chunkSemantic(
  doc: CorpusDocument,
  options?: { chunkSize?: number; overlap?: number; semanticThreshold?: number }
): ChunkingResult {
  const text = doc.content;
  const chunkSize = Math.max(16, options?.chunkSize ?? 512);
  const overlap = Math.max(0, options?.overlap ?? 0);
  const threshold = options?.semanticThreshold ?? 0.62;
  if (text.length === 0) return finalizeResult(doc, "semantic", chunkSize, overlap, []);

  const ctx = makeContext(text);
  const maxChars = Math.max(1, tokensToChars(text, chunkSize));

  const sentences = splitSentences(text).filter((s) => s.text.trim().length > 0);
  if (sentences.length === 0) return finalizeResult(doc, "semantic", chunkSize, overlap, []);

  // 复用 C4 的确定性向量化器做主题漂移检测
  const vectors = sentences.map((s) => computeDenseSemanticVector(s.text));
  const boundaries: NonNullable<ChunkingDiagnostics["semanticBoundaries"]> = [];
  const breakAfter = new Array<boolean>(sentences.length).fill(false);

  for (let i = 0; i + 1 < sentences.length; i++) {
    const sim = cosineSimilarity(vectors[i], vectors[i + 1]);
    const isBreak = sim < threshold;
    if (isBreak) breakAfter[i] = true;
    boundaries.push({
      offset: sentences[i + 1].start,
      similarity: sim,
      isBreak,
      snippet: sentences[i + 1].text.replace(/\s+/g, " ").slice(0, 40),
    });
  }

  // 打包：语义边界处优先断开，但当前切片必须先填够一定比例，
  // 否则会在句句皆「主题切换」时碎成上百个微小切片（冗余率爆炸）。
  const minFillChars = Math.max(1, Math.floor(maxChars * 0.5));
  const spans: RawSpan[] = [];
  let curStart = sentences[0].start;
  let curEnd = sentences[0].start;
  let pendingBreak: BoundaryType | null = null;

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const end = s.start + s.text.length;
    const wouldBe = end - curStart;
    const atSemanticBreak = i > 0 && breakAfter[i - 1];
    const filledEnough = curEnd - curStart >= minFillChars;

    if (curEnd > curStart && (wouldBe > maxChars || (atSemanticBreak && filledEnough))) {
      spans.push({
        charStart: spans.length === 0 ? curStart : overlappingStart(text, curStart, overlap),
        charEnd: curEnd,
        boundaryType: spans.length === 0 ? "heading" : pendingBreak ?? "sentence",
        overlapPrevChars:
          spans.length === 0
            ? 0
            : Math.max(0, spans[spans.length - 1].charEnd - overlappingStart(text, curStart, overlap)),
      });
      pendingBreak = atSemanticBreak && filledEnough ? "sentence" : "hard_cut";
      curStart = s.start;
    }
    curEnd = end;
  }
  if (curEnd > curStart) {
    spans.push({
      charStart: spans.length === 0 ? curStart : overlappingStart(text, curStart, overlap),
      charEnd: curEnd,
      boundaryType: spans.length === 0 ? "heading" : pendingBreak ?? "sentence",
      overlapPrevChars:
        spans.length === 0
          ? 0
          : Math.max(0, spans[spans.length - 1].charEnd - overlappingStart(text, curStart, overlap)),
    });
  }

  const chunks = spans.map((s, i) => buildChunk(doc, ctx, s, i, "semantic"));
  return finalizeResult(doc, "semantic", chunkSize, overlap, chunks, {
    semanticBoundaries: boundaries,
    cutPoints: spans.map((s) => ({
      offset: s.charStart,
      boundaryType: s.boundaryType,
      note:
        s.boundaryType === "sentence"
          ? `语义边界：相邻句余弦低于阈值 ${threshold}，判定为主题切换`
          : `语义切片达 ${chunkSize} token 预算上限，强制断开`,
    })),
  });
}

// ---------------------------------------------------------------------------
// 统一入口
// ---------------------------------------------------------------------------

export function chunkDocument(doc: CorpusDocument, options?: ChunkingOptions): ChunkingResult {
  const strategy = options?.strategy ?? "recursive";
  switch (strategy) {
    case "document":
      return chunkWholeDocument(doc);
    case "fixed":
      return chunkByFixedSize(doc, options);
    case "semantic":
      return chunkSemantic(doc, options);
    case "recursive":
    default:
      return chunkRecursive(doc, options);
  }
}

export function chunkCorpus(
  docs: CorpusDocument[],
  options?: ChunkingOptions
): ChunkingResult[] {
  return docs.map((d) => chunkDocument(d, options));
}

// ---------------------------------------------------------------------------
// 投影为既有检索管线的输入
// ---------------------------------------------------------------------------

/**
 * 把 Chunk 投影成 CorpusDocument 形状 —— 这是本模块最关键的一步：
 * 投影之后，C3/C4/C6/C7 的全部既有检索与精排函数可以零改动复用。
 */
export function toChunkDocument(chunk: Chunk): CorpusDocument {
  const sectionTitle = chunk.sectionPath.join(" > ");
  return {
    id: chunk.id,
    path: `${chunk.docId}#${chunk.index}`,
    category: "docs",
    title: sectionTitle ? `${chunk.docTitle} > ${sectionTitle}` : chunk.docTitle,
    content: chunk.content,
    tokenCount: chunk.tokenCount,
    authority: "active",
  };
}

export function chunksToDocuments(chunks: Chunk[]): CorpusDocument[] {
  return chunks.map(toChunkDocument);
}

/** 按 chunk id 反查所属文档 id（`docs/x.md#c3` → `docs/x.md`） */
export function chunkDocIdOf(chunkId: string): string {
  const idx = chunkId.lastIndexOf("#c");
  return idx === -1 ? chunkId : chunkId.slice(0, idx);
}

// ---------------------------------------------------------------------------
// 检索与展开
// ---------------------------------------------------------------------------

export interface ChunkSearchOptions {
  topK?: number;
  rerankTopN?: number;
  hybridOptions?: HybridFusionOptions;
  chunkVectors?: Map<string, number[]>;
  queryVector?: number[];
  /** Small-to-Big：命中后向上展开的父窗口预算（token）。0 表示不展开 */
  parentSize?: number;
}

export interface ChunkHit {
  chunk: Chunk;
  rank: number;
  score: number;
  /** 展开后的注入内容（未开启展开时等于 chunk 自身内容） */
  injectedContent: string;
  injectedTokens: number;
  /** 展开纳入的 chunk id 列表 */
  expandedChunkIds: string[];
  rerankScore?: number;
  decisionReason?: string;
}

export interface ChunkSearchOutcome {
  query: string;
  stage1Count: number;
  hits: ChunkHit[];
  /** 语义通道因不在向量集内被排除的 chunk id */
  semanticSkippedIds: string[];
  totalInjectedTokens: number;
  /** 本次检索实际使用的向量通道 */
  vectorMode: "remote" | "local";
  vectorNote: string;
}

/**
 * 在 chunk 语料上执行检索：复用 C6 的 Hybrid RRF + C7 的 Cross-Encoder 精排。
 * 未重写任何检索算法。
 */
export function searchChunks(
  allChunks: Chunk[],
  query: string,
  options?: ChunkSearchOptions
): ChunkSearchOutcome {
  const topK = options?.topK ?? 12;
  const rerankTopN = options?.rerankTopN ?? 3;
  const parentSize = options?.parentSize ?? 0;

  const docs = chunksToDocuments(allChunks);
  const byId = new Map(allChunks.map((c) => [c.id, c]));

  // 维度安全：查询向量与 chunk 向量必须同维，否则 cosineSimilarity 会因范数错配
  // 把每一篇都系统性压低。此处不依赖调用方自觉 —— 一旦发现不同维就整体放弃远端
  // 向量，让查询与 chunk 同时使用本地确定性向量。
  const localQueryVector = computeDenseSemanticVector(query);
  const queryVector = options?.queryVector ?? localQueryVector;
  const sampleChunkVector = options?.chunkVectors?.values().next().value as number[] | undefined;
  const remoteUsable =
    options?.chunkVectors != null &&
    (sampleChunkVector == null || sampleChunkVector.length === queryVector.length);

  const effectiveChunkVectors = remoteUsable ? options?.chunkVectors : undefined;
  const effectiveQueryVector = remoteUsable ? queryVector : localQueryVector;

  const vectorNote = remoteUsable
    ? `远端向量通道（${queryVector.length} 维，与查询向量同维）`
    : options?.chunkVectors != null && sampleChunkVector != null
    ? `chunk 向量为 ${sampleChunkVector.length} 维、查询向量为 ${queryVector.length} 维，维度不符，整体回退本地确定性向量`
    : "本地确定性向量通道";

  // Stage 1：粗排（Hybrid RRF）
  const hybrid = searchHybridInDocs(docs, query, {
    algorithm: "rrf",
    k: 60,
    topK,
    queryVector: effectiveQueryVector,
    docVectors: effectiveChunkVectors,
    ...options?.hybridOptions,
  });

  // 语义通道被排除的 chunk（提供了同维向量集，但本篇不在其中）
  const semanticSkippedIds = effectiveChunkVectors
    ? allChunks.filter((c) => !effectiveChunkVectors.has(c.id)).map((c) => c.id)
    : [];

  // Stage 2：Cross-Encoder 精排
  const reranked: RerankResult[] = rerankDocuments(query, hybrid.hybridResults, {
    topN: rerankTopN,
  });

  const hits: ChunkHit[] = reranked.slice(0, rerankTopN).map((r, idx) => {
    const chunk = byId.get(r.doc.id);
    if (!chunk) {
      throw new Error(`chunk 投影失配：${r.doc.id}`);
    }
    const expanded = parentSize > 0 ? expandToParent(allChunks, chunk, { parentSize }) : [chunk];
    const injectedContent = expanded.map((c) => c.content).join("\n\n");
    return {
      chunk,
      rank: idx + 1,
      score: r.rerankScore,
      injectedContent,
      injectedTokens: estimateTokens(injectedContent),
      expandedChunkIds: expanded.map((c) => c.id),
      rerankScore: r.rerankScore,
      decisionReason: r.decisionReason,
    };
  });

  return {
    query,
    stage1Count: hybrid.hybridResults.length,
    hits,
    semanticSkippedIds,
    totalInjectedTokens: hits.reduce((a, h) => a + h.injectedTokens, 0),
    vectorMode: remoteUsable ? "remote" : "local",
    vectorNote,
  };
}

/**
 * Small-to-Big：以命中切片为中心向上展开父窗口。
 * 展开遵守章节边界（不跨 sectionPath），并受 parentSize token 预算约束。
 *
 * 本课的核心结论正落在这里 —— 检索的原子单位与注入的原子单位不必相同。
 */
export function expandToParent(
  allChunks: Chunk[],
  hit: Chunk,
  options: { parentSize: number }
): Chunk[] {
  const budget = Math.max(hit.tokenCount, options.parentSize);
  const sameDoc = allChunks.filter((c) => c.docId === hit.docId).sort((a, b) => a.index - b.index);
  const pos = sameDoc.findIndex((c) => c.id === hit.id);
  if (pos === -1) return [hit];

  const sectionKey = (c: Chunk) => c.sectionPath.join(" > ");
  const hitSection = sectionKey(hit);

  let left = pos;
  let right = pos;
  let used = hit.tokenCount;

  // 交替向两侧扩展，保持命中切片居中
  while (true) {
    const nextLeft = left - 1;
    const nextRight = right + 1;
    const leftOk =
      nextLeft >= 0 &&
      sectionKey(sameDoc[nextLeft]) === hitSection &&
      used + sameDoc[nextLeft].tokenCount <= budget;
    const rightOk =
      nextRight < sameDoc.length &&
      sectionKey(sameDoc[nextRight]) === hitSection &&
      used + sameDoc[nextRight].tokenCount <= budget;

    if (!leftOk && !rightOk) break;

    if (leftOk && (!rightOk || used + sameDoc[nextLeft].tokenCount <= used + sameDoc[nextRight].tokenCount)) {
      left = nextLeft;
      used += sameDoc[left].tokenCount;
    } else if (rightOk) {
      right = nextRight;
      used += sameDoc[right].tokenCount;
    }
  }

  return sameDoc.slice(left, right + 1);
}

// ---------------------------------------------------------------------------
// 基准用例与评测
// ---------------------------------------------------------------------------

export type ChunkTrapType =
  | "buried_needle"
  | "boundary_split"
  | "structure_break"
  | "topic_dilution"
  | "orphan_anaphora"
  | "cross_doc_competition";

export interface ChunkingBenchmarkCase {
  id: string;
  category: string;
  title: string;
  query: string;
  needleDocId: string;
  /** 全部命中才算「完整答案」；第一个用于在文档中定位 needle */
  needlePatterns: RegExp[];
  goldenKeyFact: string;
  trapType: ChunkTrapType;
  /** 本课是否已给出解法；false 表示明确挂账给下一课 */
  solvedInThisLesson: boolean;
}

export const CHUNKING_BENCHMARK_CASES: ChunkingBenchmarkCase[] = [
  {
    id: "ck-01-buried-needle",
    category: "深层埋点 (Buried Needle)",
    title: "巨型文档深处的配额风暴处置参数",
    query: "遇到 ERR_QUOTA_STORM_4417 时，CloudQuotaGuard 的 maxInflight 应该调整到多少？",
    needleDocId: "docs/ops-handbook.md",
    needlePatterns: [/maxInflight/i, /32/],
    goldenKeyFact: "由默认值 64 下调至 32，并保持 TokenBucketRefiller 补充速率不变",
    trapType: "buried_needle",
    solvedInThisLesson: true,
  },
  {
    id: "ck-02-boundary-split",
    category: "边界切断 (Boundary Split)",
    title: "决定性事实横跨切分边界",
    query: "生产变更需要提前多久提交审批单？审批单的单号规则是什么？",
    needleDocId: "docs/ops-handbook.md",
    needlePatterns: [/24\s*小时/, /RFC-8842/],
    goldenKeyFact: "必须在变更窗口开启前 24 小时提交 RFC-8842 审批单，否则自动驳回",
    trapType: "boundary_split",
    solvedInThisLesson: true,
  },
  {
    id: "ck-03-structure-break",
    category: "结构破坏 (Structure Break)",
    title: "故障分级表格的 P2 响应时限",
    query: "按故障分级标准，P2 级故障的响应时限是多少？",
    needleDocId: "docs/ops-handbook.md",
    needlePatterns: [/P2/, /15\s*分钟/],
    goldenKeyFact: "P2 级故障须在 15 分钟内响应，三个工作日内提交复盘报告",
    trapType: "structure_break",
    solvedInThisLesson: true,
  },
  {
    id: "ck-04-topic-dilution",
    category: "主题漂移 (Topic Dilution)",
    title: "16 章节文档中的低频事实",
    query: "演练复盘要求多久组织一次？由谁主持？",
    needleDocId: "docs/ops-handbook.md",
    needlePatterns: [/每两周/, /平台工程部/],
    goldenKeyFact: "演练复盘每两周组织一次，由平台工程部主持",
    trapType: "topic_dilution",
    solvedInThisLesson: true,
  },
  {
    id: "ck-05-orphan-anaphora",
    category: "孤岛代词 (Orphan Anaphora)",
    title: "切片丢失主语的已知未解问题",
    query: "什么情况下需要触发全局熔断？熔断后系统进入什么模式？",
    needleDocId: "docs/ops-handbook.md",
    needlePatterns: [/切换失败/, /15\s*分钟/, /只读/],
    goldenKeyFact: "跨可用区切换失败时须在 15 分钟内触发全局熔断并进入只读模式（本课不解决孤岛指代）",
    trapType: "orphan_anaphora",
    solvedInThisLesson: false,
  },
  {
    id: "ck-06-cross-doc",
    category: "跨文档竞争 (Cross-Document)",
    title: "两篇长文档的跨文档对照",
    query: "运维日志与审计日志的保留时长分别是多久？",
    needleDocId: "docs/compliance-manual.md",
    needlePatterns: [/180\s*天/, /3\s*年/],
    goldenKeyFact: "运维日志保留 180 天，审计日志保留 3 年",
    trapType: "cross_doc_competition",
    solvedInThisLesson: true,
  },
];

/**
 * 判定「高信噪比完整」的密度阈值。
 *
 * 注意：这是一个**工程判断**，不是物理常数。本基准上文档级注入的信噪比在
 * 0.3%~0.7%，而切片级在 2.4%~5.2%，2% 落在两者之间。换一批语料这个数需要重新校准，
 * 因此 UI 同时展示原始信噪比，读者可自行判断。
 */
export const HIGH_DENSITY_THRESHOLD = 0.02;

export type ChunkingEvalStrategy = ChunkStrategy | "small-to-big";

export interface ChunkingEvalConfig {
  strategy: ChunkingEvalStrategy;
  chunkSize: number;
  overlap: number;
  semanticThreshold?: number;
  /** Small-to-Big 的父窗口预算 */
  parentSize?: number;
  topK?: number;
  rerankTopN?: number;
  chunkVectors?: Map<string, number[]>;
  /**
   * chunk 向量集自身的切分配置。
   *
   * 必须提供且与本次评测配置**完全一致**才会启用远端向量 —— 因为 chunk id 是
   * `${docId}#c${index}`，不同切分配置下同一个 id 指向完全不同的文本。
   * 不做这层校验就会出现「A 配置的向量被当成 B 配置切片的向量」这种静默错配。
   */
  chunkVectorConfig?: { strategy: ChunkStrategy; chunkSize: number; overlap: number };
  /** 按 query 取真实查询向量；缺省时全部走本地确定性向量 */
  queryVectorOf?: (query: string) => number[] | undefined;
}

export interface ChunkingCaseResult {
  caseId: string;
  title: string;
  trapType: ChunkTrapType;
  solvedInThisLesson: boolean;
  /** 黄金切片是否进入 Top-K */
  located: boolean;
  targetRank: number | null;
  /** 检索单元自身是否完整包含全部 needle 要素 */
  unitComplete: boolean;
  /** 注入内容是否完整包含全部 needle 要素（含父窗口展开） */
  injectedComplete: boolean;
  retrievedTokens: number;
  signalTokens: number;
  signalDensity: number;
  /** 高信噪比且完整 —— 本课追求的终态指标 */
  effective: boolean;
}

export interface ChunkingEvalSummary {
  strategy: ChunkingEvalStrategy;
  chunkSize: number;
  overlap: number;
  chunkCount: number;
  avgChunkTokens: number;
  indexRedundancyPct: number;
  /** 原始几何破坏数 */
  boundaryDamageRaw: number;
  /** 被重叠窗口补救的破坏数 */
  overlapRepaired: number;
  /** 无法补救的净破坏数 */
  structuralViolations: number;
  orphanChunks: number;
  totalCases: number;
  locateRate: number;
  unitCompleteRate: number;
  injectedCompleteRate: number;
  effectiveRate: number;
  avgRetrievedTokens: number;
  avgSignalDensity: number;
  /** 本配置实际使用的向量通道 */
  vectorMode: "remote" | "local";
  /** chunk 向量集对本配置切分结果的覆盖率 */
  vectorCoveragePct: number;
  vectorNote: string;
}

export interface ChunkingEvalOutcome {
  summary: ChunkingEvalSummary;
  cases: ChunkingCaseResult[];
}

function countTokensOfMatch(doc: CorpusDocument, pattern: RegExp): number {
  const m = doc.content.match(new RegExp(pattern.source, pattern.flags.replace("g", "")));
  return m ? estimateTokens(m[0]) : 0;
}

function hasAllPatterns(text: string, patterns: RegExp[]): boolean {
  return patterns.every((p) => new RegExp(p.source, p.flags.replace("g", "")).test(text));
}

/**
 * 在源文档中定位「能完整回答问题的最小句窗」，其 token 数即真正的信号量。
 *
 * 不能拿正则匹配到的几个字符当信号量 —— 那只有几个 token，算出来的信噪比会
 * 恒等于千分之几，无法区分任何策略。真正的信号是「承载完整事实的那一小段文本」。
 */
function minimalAnswerSpanTokens(doc: CorpusDocument, patterns: RegExp[]): number {
  const sentences = splitSentences(doc.content).filter((s) => s.text.trim().length > 0);
  let best = Number.POSITIVE_INFINITY;

  for (let i = 0; i < sentences.length; i++) {
    let acc = "";
    for (let j = i; j < sentences.length; j++) {
      acc += sentences[j].text;
      if (hasAllPatterns(acc, patterns)) {
        best = Math.min(best, estimateTokens(acc));
        break;
      }
    }
  }

  // 兜底：模式分散到无法用连续句窗覆盖时，退化为各匹配片段之和
  if (!Number.isFinite(best)) {
    best = patterns.reduce((a, p) => a + countTokensOfMatch(doc, p), 0);
  }
  return best;
}

/**
 * 把若干切片按字符区间合并去重，得到真实注入给模型的文本与 token 数。
 * 重叠窗口与多次命中造成的重复在这里被消除，得到的是真实 prompt 成本。
 */
function mergeInjectedRanges(
  chunkIds: string[],
  chunkById: Map<string, Chunk>,
  docContentOf: (docId: string) => string
): { text: string; tokens: number; chunkCount: number } {
  const byDoc = new Map<string, Array<{ s: number; e: number }>>();
  const unique = new Set(chunkIds);

  for (const id of unique) {
    const c = chunkById.get(id);
    if (!c) continue;
    const list = byDoc.get(c.docId) ?? [];
    list.push({ s: c.charStart, e: c.charEnd });
    byDoc.set(c.docId, list);
  }

  const parts: string[] = [];
  for (const [docId, ranges] of byDoc) {
    const content = docContentOf(docId);
    ranges.sort((a, b) => a.s - b.s);
    const merged: Array<{ s: number; e: number }> = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r.s <= last.e) last.e = Math.max(last.e, r.e);
      else merged.push({ s: r.s, e: r.e });
    }
    for (const m of merged) parts.push(content.slice(m.s, m.e));
  }

  const text = parts.join("\n\n---\n\n");
  return { text, tokens: estimateTokens(text), chunkCount: unique.size };
}

/**
 * 在给定切分配置下评测一组基准用例。
 *
 * 注意「document」策略下 `unitComplete` 天然为真 —— 整篇文档当然包含答案。
 * 这正是本课要揭示的矛盾：文档级**完整但稀释**，小切片**精准但不完整**。
 * 因此必须同时看 `unitComplete` 与 `signalDensity` 两个指标。
 */
export function evaluateChunkingStrategy(
  docs: CorpusDocument[],
  cases: ChunkingBenchmarkCase[],
  config: ChunkingEvalConfig
): ChunkingEvalOutcome {
  const useParent = config.strategy === "small-to-big";
  const baseStrategy: ChunkStrategy = useParent ? "recursive" : (config.strategy as ChunkStrategy);
  const parentSize = config.parentSize ?? 1400;

  const results: ChunkingResult[] = docs.map((d) =>
    chunkDocument(d, {
      strategy: baseStrategy,
      chunkSize: config.chunkSize,
      overlap: config.overlap,
      semanticThreshold: config.semanticThreshold,
    })
  );
  const allChunks = results.flatMap((r) => r.chunks);
  const chunkById = new Map(allChunks.map((c) => [c.id, c]));
  const docById = new Map(docs.map((d) => [d.id, d]));

  // 向量通道可用性检查（两道关）：
  // ① 切分配置必须与向量集完全一致 —— chunk id 跨配置会碰撞，错配是静默的；
  // ② 覆盖率必须足够 —— 覆盖率不足时整体退回本地向量，而不是让语义通道静默空掉。
  const configMatches =
    config.chunkVectorConfig != null &&
    config.chunkVectorConfig.strategy === baseStrategy &&
    config.chunkVectorConfig.chunkSize === config.chunkSize &&
    config.chunkVectorConfig.overlap === config.overlap;

  const coveredCount =
    config.chunkVectors && configMatches
      ? allChunks.filter((c) => config.chunkVectors!.has(c.id)).length
      : 0;
  const coveragePct = allChunks.length > 0 ? (coveredCount / allChunks.length) * 100 : 0;
  const useRemoteVectors = configMatches && config.chunkVectors != null && coveragePct >= 95;

  const effectiveChunkVectors = useRemoteVectors ? config.chunkVectors : undefined;
  const vectorNote = useRemoteVectors
    ? `真实向量通道：${coveredCount}/${allChunks.length} 切片命中向量集，且切分配置与向量集一致`
    : config.chunkVectors == null
    ? "未提供 chunk 向量集，使用本地确定性向量"
    : !configMatches
    ? `向量集切分配置（${config.chunkVectorConfig?.strategy}-${config.chunkVectorConfig?.chunkSize}+ov${config.chunkVectorConfig?.overlap}）与本次评测（${baseStrategy}-${config.chunkSize}+ov${config.overlap}）不一致，拒绝使用以避免 id 跨配置错配`
    : `向量集覆盖不足（${coveragePct.toFixed(0)}%），整体退回本地确定性向量`;

  const caseResults: ChunkingCaseResult[] = cases.map((benchCase) => {
    const targetDoc = docById.get(benchCase.needleDocId);
    if (!targetDoc) {
      throw new Error(`基准用例指向不存在的文档：${benchCase.needleDocId}`);
    }
    const signalTokens = minimalAnswerSpanTokens(targetDoc, benchCase.needlePatterns);

    const outcome = searchChunks(allChunks, benchCase.query, {
      topK: config.topK ?? 12,
      rerankTopN: config.rerankTopN ?? 3,
      parentSize: useParent ? parentSize : 0,
      chunkVectors: effectiveChunkVectors,
      queryVector: config.queryVectorOf?.(benchCase.query),
    });

    // 定位：Top-K 内是否存在命中该文档且包含首个 needle 要素的切片
    const locator = benchCase.needlePatterns[0];
    const targetRank =
      outcome.hits.findIndex(
        (h) => chunkDocIdOf(h.chunk.id) === benchCase.needleDocId && locator.test(h.chunk.content)
      ) + 1;
    const located = targetRank > 0;

    const topHit = outcome.hits[0];
    // 单元自足性：Top-1 检索单元【自身】是否已能回答（不含父窗口展开）
    const unitComplete = topHit ? hasAllPatterns(topHit.chunk.content, benchCase.needlePatterns) : false;

    // 注入完整性：把全部命中（含各自的父窗口展开）合并去重后，是否完整可答
    const injected = mergeInjectedRanges(
      outcome.hits.flatMap((h) => h.expandedChunkIds),
      chunkById,
      (id) => docById.get(id)?.content ?? ""
    );
    const injectedComplete = hasAllPatterns(injected.text, benchCase.needlePatterns);
    const retrievedTokens = injected.tokens;
    const signalDensity =
      retrievedTokens > 0 ? Number((signalTokens / retrievedTokens).toFixed(4)) : 0;

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
      effective: injectedComplete && signalDensity >= HIGH_DENSITY_THRESHOLD,
    };
  });

  const n = caseResults.length || 1;
  const avg = (pick: (c: ChunkingCaseResult) => number) =>
    Number((caseResults.reduce((a, c) => a + pick(c), 0) / n).toFixed(4));
  const rate = (pick: (c: ChunkingCaseResult) => boolean) =>
    Number(((caseResults.filter(pick).length / n) * 100).toFixed(1));

  const indexTokens = allChunks.reduce((a, c) => a + c.tokenCount, 0);
  const corpusTokens = docs.reduce((a, d) => a + d.tokenCount, 0);

  // 直接汇总各文档的切分统计，避免在这里重复实现「重叠是否补救」的判定
  const boundaryDamageRaw = results.reduce((a, r) => a + r.stats.boundaryDamageRaw, 0);
  const overlapRepaired = results.reduce((a, r) => a + r.stats.overlapRepaired, 0);

  const summary: ChunkingEvalSummary = {
    strategy: config.strategy,
    chunkSize: config.chunkSize,
    overlap: config.overlap,
    chunkCount: allChunks.length,
    avgChunkTokens: allChunks.length > 0 ? Number((indexTokens / allChunks.length).toFixed(1)) : 0,
    indexRedundancyPct:
      corpusTokens > 0 ? Number((((indexTokens - corpusTokens) / corpusTokens) * 100).toFixed(1)) : 0,
    boundaryDamageRaw,
    overlapRepaired,
    structuralViolations: boundaryDamageRaw - overlapRepaired,
    orphanChunks: allChunks.filter((c) => c.orphanRisk.isOrphanHead).length,
    totalCases: caseResults.length,
    locateRate: rate((c) => c.located),
    unitCompleteRate: rate((c) => c.unitComplete),
    injectedCompleteRate: rate((c) => c.injectedComplete),
    effectiveRate: rate((c) => c.effective),
    avgRetrievedTokens: Math.round(avg((c) => c.retrievedTokens)),
    avgSignalDensity: avg((c) => c.signalDensity),
    vectorMode: useRemoteVectors ? "remote" : "local",
    vectorCoveragePct: Number(coveragePct.toFixed(1)),
    vectorNote,
  };

  return { summary, cases: caseResults };
}

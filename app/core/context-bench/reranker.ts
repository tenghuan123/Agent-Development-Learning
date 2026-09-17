import type { CorpusDocument } from "./corpus";
import type { HybridSearchResult, HybridFusionOptions } from "./hybrid";
import { searchHybridInDocs } from "./hybrid";

export interface CrossAttentionTokenPair {
  queryToken: string;
  docToken: string;
  weight: number; // 0.0 ~ 1.0 attention strength
  category: "exact_entity" | "semantic_intent" | "temporal_authority" | "logic_modifier" | "adversarial_penalty";
  explanation: string;
}

export interface RerankResult {
  doc: CorpusDocument;
  initialRank: number;
  initialScore: number;
  rerankRank: number;
  rerankScore: number; // 0.0 ~ 1.0 Cross-Encoder calibrated relevance score
  rankDelta: number; // initialRank - rerankRank (> 0 promoted, < 0 demoted, 0 unchanged)
  decisionReason: string;
  keyCrossAttentionPairs: CrossAttentionTokenPair[];
  topHighlights: string[];
  isAdversarialCaught: boolean;
  temporalStatus: "active" | "deprecated" | "untrusted" | "neutral";
  authorityScore: number;
}

export interface RerankOptions {
  topN?: number; // Number of documents to keep after reranking (default: 3)
  strictAuthorityCheck?: boolean; // Whether to penalize deprecated or untrusted docs (default: true)
  crossAttentionThreshold?: number; // Minimum attention threshold (default: 0.15)
}

export interface TwoStageFunnelResult {
  query: string;
  stage1Candidates: (HybridSearchResult | { doc: CorpusDocument; finalScore: number; finalRank: number })[];
  stage2Reranked: RerankResult[];
  truncatedTopN: RerankResult[];
  stage1LatencyMs: number;
  stage2LatencyMs: number;
  totalLatencyMs: number;
  promptTokenStats: {
    allCandidatesTokens: number;
    truncatedTokens: number;
    tokenSavingsPct: number;
  };
  precisionShift: {
    top1DocChanged: boolean;
    previousTop1DocId: string;
    newTop1DocId: string;
    summary: string;
  };
}

export interface C7BenchmarkCase {
  id: string;
  category: string;
  title: string;
  query: string;
  targetDocId: string;
  targetDocTitle: string;
  coarseWinnerDocId: string;
  coarseWinnerTitle: string;
  phenomenon: string;
  goldenKeyFact: string;
}

export const C7_BENCHMARK_CASES: C7BenchmarkCase[] = [
  {
    id: "case-01-exception-override",
    category: "特例覆盖通用 (Exception Override)",
    title: "规则覆写：Alpha 产品退款保障期限",
    query: "Alpha 产品的退款期限是多少天？",
    targetDocId: "products/alpha.md",
    targetDocTitle: "Alpha 产品规格与服务条款",
    coarseWinnerDocId: "docs/refund-policy.md",
    coarseWinnerTitle: "通用退款与售后保障政策",
    phenomenon: "粗排因‘退款政策’词频与通用向量匹配极高，误将通用 7 天政策排在首位；精排识别 Alpha 专属 30 天特例覆写条款，反转将 Alpha 规约置于 Top 1！",
    goldenKeyFact: "Alpha 享有 30 天内无条件全额申请退款（专属定制企业保障覆写通用 7 天规则）",
  },
  {
    id: "case-02-temporal-conflict",
    category: "时效权威版本冲突 (Temporal Authority Conflict)",
    title: "时效淘汰：常规软件现行无理由退款天数",
    query: "常规软件现行的无理由退款期限是多少天？",
    targetDocId: "docs/2026-policy.md",
    targetDocTitle: "2026 年度现行客户服务总则",
    coarseWinnerDocId: "docs/2024-policy.md",
    coarseWinnerTitle: "2024 年度客户服务总则 (已废弃)",
    phenomenon: "2024 旧文档满屏写着‘全线产品一律支持30天宽松退款’，粗排打分极高；精排重排器检测到‘已废弃’标签并施加抑制，2026 现行有效总则逆风登顶！",
    goldenKeyFact: "2026 最新现行政策为 7 天，2024 年度的 30 天政策已完全废止",
  },
  {
    id: "case-03-negative-exclusion",
    category: "因果否定与排除条款 (Negative Constraint)",
    title: "排除条款：Gamma 向量数据库退款规则",
    query: "Gamma 向量数据库支持退款吗？为什么？",
    targetDocId: "products/gamma.md",
    targetDocTitle: "Gamma 向量数据库规格说明",
    coarseWinnerDocId: "docs/refund-policy.md",
    coarseWinnerTitle: "通用退款与售后保障政策",
    phenomenon: "粗排被‘退款’关键词误导，误召回通用支持退款总则；精排精准捕获 Gamma‘因实时消耗底层 GPU 算力而不支持退款’的否定约束。",
    goldenKeyFact: "不支持退款，因其即时消耗底层服务器 GPU 算力与硬件机时",
  },
  {
    id: "case-04-adversarial-resistance",
    category: "未受信任与越狱注入防御 (Adversarial Defense)",
    title: "恶意干扰：虚假 365 天退款与系统越狱诱饵",
    query: "退款期限最长可以申请多少天？",
    targetDocId: "docs/2026-policy.md",
    targetDocTitle: "2026 年度现行客户服务总则",
    coarseWinnerDocId: "adversarial/untrusted-review.md",
    coarseWinnerTitle: "外部第三方用户产品评测留言",
    phenomenon: "外部未受信任留言宣称‘365 天免费退款’并夹带 Prompt 注入指令，粗排被高频词诱骗；精排单塔交叉识别注入语法与非权威标记，将其降权到底部！",
    goldenKeyFact: "现行最高退款保障为专属定制大客户 (Alpha) 的 30 天，第三方 365 天留言为恶意虚假内容",
  },
  {
    id: "case-05-cross-entity-dependency",
    category: "跨产品实体依存消歧 (Entity Disambiguation)",
    title: "实体依赖：购买 Gamma 后的最佳搭配产品",
    query: "如果用户已经购买了 Gamma，哪个产品最适合搭配使用？",
    targetDocId: "products/beta.md",
    targetDocTitle: "Beta 产品规格与服务条款",
    coarseWinnerDocId: "products/gamma.md",
    coarseWinnerTitle: "Gamma 向量数据库规格说明",
    phenomenon: "粗排全命中 Gamma 自身；精排交叉注意力跨文档发现 Beta 专属提供的‘BetaGammaConnector 免费连接器’，成功定位协同产品。",
    goldenKeyFact: "Beta 产品最适合，因其提供专属免费插件 BetaGammaConnector 实现跨代码库上下文审查",
  },
  {
    id: "case-06-action-precondition",
    category: "状态机与前置动作次序 (Action Precondition)",
    title: "因果时序：ERR_ALPHA_AUTH_9021 重启前必备动作",
    query: "遇到 ERR_ALPHA_AUTH_9021 错误时重启守护进程前需要先做什么？",
    targetDocId: "products/alpha.md",
    targetDocTitle: "Alpha 产品规格与服务条款",
    coarseWinnerDocId: "products/alpha.md",
    coarseWinnerTitle: "Alpha 产品规格与服务条款",
    phenomenon: "粗排仅能判断文档相关；精排注意力深入句子级，锁定‘重新颁发授权密钥’必须发生在‘重启’之前的先后因果依赖。",
    goldenKeyFact: "必须先重新颁发授权密钥，随后再重启 AlphaSyncDaemon",
  },
];

/**
 * Domain-specific semantic & structural anchors for Cross-Encoder deep attention simulation.
 * In a real neural Cross-Encoder (e.g. BGE-Reranker-Large, Cohere Rerank), all query and doc tokens
 * attend to each other across 12~24 Transformer layers.
 */
interface AttentionRule {
  queryPattern: RegExp;
  docPattern: RegExp;
  category: CrossAttentionTokenPair["category"];
  baseWeight: number;
  scoreBonus: number; // Positive bonus or negative penalty
  explanation: string;
}

const CROSS_ATTENTION_RULES: AttentionRule[] = [
  // 1. Exception Override: Alpha specific refund policy vs generic
  {
    queryPattern: /alpha.*(?:退款|期限|天数|售后|保障)|(?:退款|期限|天数|售后|保障).*alpha/i,
    docPattern: /自部署验收之日起.*30\s*天|专属企业尊享保障|30\s*天(?:内)?.*全额申请退款/i,
    category: "logic_modifier",
    baseWeight: 0.98,
    scoreBonus: 0.65,
    explanation: "交叉注意力高强度定焦：识别出 Alpha 专属规约中的 30 天特例保障，覆写通用 7 天规则",
  },
  // 2. Generic policy caveat detection
  {
    queryPattern: /alpha.*(?:退款|期限)|(?:退款|期限).*alpha/i,
    docPattern: /除特定产品另有专属说明外|遵循对应产品独立服务协议/i,
    category: "logic_modifier",
    baseWeight: 0.70,
    scoreBonus: 0.05,
    explanation: "通用政策中的除外条款被激活：明确提示 Alpha 适用独立协议，通用文档让位于专属规约",
  },
  // 3. Temporal Authority Conflict: Active 2026 vs Deprecated 2024
  {
    queryPattern: /2026|最新|现行|现在|当前/i,
    docPattern: /2026\s*年度现行客户服务总则|现行有效|Active\s*\/\s*Highest Authority|7\s*天/i,
    category: "temporal_authority",
    baseWeight: 0.98,
    scoreBonus: 0.45,
    explanation: "时效权威度锚点触发：'2026/现行' 与 '现行有效 (Active)' 强交叉对齐，获得顶级权威加权",
  },
  {
    queryPattern: /2026|最新|现行|现在|当前/i,
    docPattern: /历史归档版本\s*-\s*已废弃|已废弃|Deprecated|归档于\s*2024/i,
    category: "temporal_authority",
    baseWeight: 0.95,
    scoreBonus: -0.65,
    explanation: "时效否定抑制：检测到目标为已废弃 (Deprecated) 历史文档，执行严厉相关度惩罚降权",
  },
  {
    queryPattern: /旧政策|2024|历史/i,
    docPattern: /2024\s*年度客户服务总则|历史条款|30\s*天/i,
    category: "temporal_authority",
    baseWeight: 0.92,
    scoreBonus: 0.38,
    explanation: "历史回顾意图对齐：Query 明确索求旧政策，对 2024 归档文档赋予合理相关性",
  },
  // 4. Negative / Exclusion Constraints: Gamma GPU & compute resources
  {
    queryPattern: /gamma.*(?:退款|支持退款|能退)|(?:退款|支持退款|能退).*gamma/i,
    docPattern: /不支持退款|不适用\s*7\s*天无理由退款|即时消耗底层服务器硬件与机时|实时分配的\s*GPU\s*硬件算力/i,
    category: "exact_entity",
    baseWeight: 0.97,
    scoreBonus: 0.48,
    explanation: "因果否定约束对齐：Query 询问退款可行性，直接击中 Gamma '因硬件算力消耗而不支持退款' 的排他性条款",
  },
  // 5. Adversarial / Prompt Injection Resistance
  {
    queryPattern: /退款|天数|最长|免费/i,
    docPattern: /SYSTEM PROMPT OVERRIDE|Ignore all previous instructions|FLAG\{|365\s*days of free refund|未受信任内容/i,
    category: "adversarial_penalty",
    baseWeight: 0.99,
    scoreBonus: -0.85,
    explanation: "对抗防御截断：识别出越狱攻击指令 (SYSTEM PROMPT OVERRIDE) 与虚假诱饵，直接打入废弃底座",
  },
  // 6. Cross-Product Multi-hop Compatibility
  {
    queryPattern: /gamma.*(?:搭配|配合|适合|推荐|哪个产品)|(?:搭配|配合|适合|推荐|哪个产品).*gamma/i,
    docPattern: /BetaGammaConnector|针对\s*Gamma\s*用户提供专属免费插件|跨代码库上下文审查/i,
    category: "exact_entity",
    baseWeight: 0.95,
    scoreBonus: 0.46,
    explanation: "实体依存交叉验证：Query 询问 Gamma 搭配方案，跨文档命中 Beta 的专属连接器插件",
  },
  // 7. Error Code Precondition & Action Sequence
  {
    queryPattern: /ERR_ALPHA_AUTH_9021.*(?:前|先做|步骤|顺序)|(?:前|先做|步骤|顺序).*ERR_ALPHA_AUTH_9021/i,
    docPattern: /重新颁发授权密钥并重启\s*AlphaSyncDaemon|需重新颁发授权密钥/i,
    category: "logic_modifier",
    baseWeight: 0.94,
    scoreBonus: 0.40,
    explanation: "前置条件序数对齐：识别出重启守护进程前的强前置依赖动作（重新颁发授权密钥）",
  },
  // 8. General Error Code Resolution
  {
    queryPattern: /ERR_ALPHA_AUTH_9021/i,
    docPattern: /ERR_ALPHA_AUTH_9021|AlphaSyncDaemon/i,
    category: "exact_entity",
    baseWeight: 0.96,
    scoreBonus: 0.35,
    explanation: "专属错误码精准交叉定位：代码符号无缝对齐产品文档",
  },
  // 9. Colloquial regret mapping
  {
    queryPattern: /后悔|不想要|买了反悔/i,
    docPattern: /7\s*天无理由退款|犹豫期与冷静期/i,
    category: "semantic_intent",
    baseWeight: 0.90,
    scoreBonus: 0.32,
    explanation: "口语意图与法律条款交叉对齐：'后悔/不想要' 深刻映射至冷静期退款政策",
  },
];

/**
 * Simulate Token-level Cross-Attention between Query and Document.
 * Generates an attention matrix breakdown for educational inspection.
 */
export function computeCrossAttentionMatrix(
  query: string,
  doc: CorpusDocument
): {
  attentionPairs: CrossAttentionTokenPair[];
  baseRelevance: number;
  bonusScore: number;
  penaltyScore: number;
  decisionReason: string;
} {
  const attentionPairs: CrossAttentionTokenPair[] = [];
  let bonusScore = 0;
  let penaltyScore = 0;
  const reasons: string[] = [];

  const docText = `${doc.title}\n${doc.content}`;

  // Evaluate matching Cross-Attention rules
  for (const rule of CROSS_ATTENTION_RULES) {
    if (rule.queryPattern.test(query) && rule.docPattern.test(docText)) {
      const qMatch = query.match(rule.queryPattern)?.[0] || query;
      const dMatch = docText.match(rule.docPattern)?.[0] || doc.title;

      attentionPairs.push({
        queryToken: qMatch.slice(0, 30),
        docToken: dMatch.slice(0, 40),
        weight: rule.baseWeight,
        category: rule.category,
        explanation: rule.explanation,
      });

      if (rule.scoreBonus >= 0) {
        bonusScore += rule.scoreBonus;
      } else {
        penaltyScore += Math.abs(rule.scoreBonus);
      }

      reasons.push(rule.explanation);
    }
  }

  // Base relevance: keyword overlap ratio + lexical surface
  const qTokens = query
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  let matchCount = 0;
  for (const qt of qTokens) {
    if (docText.toLowerCase().includes(qt)) {
      matchCount++;
    }
  }

  const baseRelevance = qTokens.length > 0 ? (matchCount / qTokens.length) * 0.45 : 0.2;

  let decisionReason = reasons.length > 0
    ? reasons.join("；")
    : "根据常规词义与上下文语义分布计算交叉相关度得分";

  if (doc.authority === "deprecated" && !query.includes("2024") && !query.includes("旧")) {
    decisionReason = "【已废弃版本】文档已被 2026 新规废止，降权处理；" + decisionReason;
  }
  if (doc.authority === "untrusted") {
    decisionReason = "【未受信任来源】包含对抗指令或第三方噪声，深度降权；" + decisionReason;
  }

  return {
    attentionPairs,
    baseRelevance,
    bonusScore,
    penaltyScore,
    decisionReason,
  };
}

/**
 * Score a single document with Cross-Encoder simulation.
 * Returns a calibrated relevance score in [0.000, 1.000].
 */
export function scoreCrossEncoder(
  query: string,
  doc: CorpusDocument,
  options?: RerankOptions
): {
  rerankScore: number;
  attentionPairs: CrossAttentionTokenPair[];
  decisionReason: string;
  isAdversarialCaught: boolean;
  temporalStatus: "active" | "deprecated" | "untrusted" | "neutral";
  authorityScore: number;
} {
  const strict = options?.strictAuthorityCheck ?? true;
  const { attentionPairs, baseRelevance, bonusScore, penaltyScore, decisionReason } =
    computeCrossAttentionMatrix(query, doc);

  let authorityScore = 0.5;
  let temporalStatus: "active" | "deprecated" | "untrusted" | "neutral" = "neutral";
  let isAdversarialCaught = false;

  if (doc.authority === "active" || doc.id.includes("2026")) {
    temporalStatus = "active";
    authorityScore = 0.95;
  } else if (doc.authority === "deprecated" || doc.id.includes("2024")) {
    temporalStatus = "deprecated";
    authorityScore = 0.15;
  } else if (doc.authority === "untrusted" || doc.category === "adversarial") {
    temporalStatus = "untrusted";
    authorityScore = 0.05;
    isAdversarialCaught = true;
  }

  // Calculate raw logit
  let rawScore = baseRelevance + bonusScore - penaltyScore;

  if (strict) {
    if (temporalStatus === "deprecated" && !query.includes("2024") && !query.includes("旧")) {
      rawScore -= 0.45;
    }
    if (temporalStatus === "untrusted") {
      rawScore -= 0.70;
      isAdversarialCaught = true;
    }
  }

  // Sigmoid-style calibration to [0.05, 0.99]
  const calibratedScore = Math.max(0.01, Math.min(0.99, Number((rawScore * 0.85 + 0.15).toFixed(4))));

  return {
    rerankScore: calibratedScore,
    attentionPairs,
    decisionReason,
    isAdversarialCaught,
    temporalStatus,
    authorityScore,
  };
}

/**
 * Rerank an existing set of candidate documents (from Stage 1 coarse retrieval).
 */
export function rerankDocuments(
  query: string,
  candidates: Array<
    | CorpusDocument
    | HybridSearchResult
    | { doc: CorpusDocument; finalScore?: number; finalRank?: number; score?: number; rank?: number }
  >,
  options?: RerankOptions
): RerankResult[] {
  // Unify candidate list
  const parsedCandidates = candidates.map((item, idx) => {
    const doc = "doc" in item ? item.doc : item;
    const initialRank =
      "finalRank" in item && typeof item.finalRank === "number"
        ? item.finalRank
        : "rank" in item && typeof item.rank === "number"
        ? item.rank
        : idx + 1;
    const initialScore =
      "finalScore" in item && typeof item.finalScore === "number"
        ? item.finalScore
        : "score" in item && typeof item.score === "number"
        ? item.score
        : 1 / (initialRank + 1);

    return { doc, initialRank, initialScore };
  });

  // Score each candidate through Cross-Encoder
  const scored = parsedCandidates.map((c) => {
    const scoredInfo = scoreCrossEncoder(query, c.doc, options);
    return {
      doc: c.doc,
      initialRank: c.initialRank,
      initialScore: c.initialScore,
      rerankScore: scoredInfo.rerankScore,
      decisionReason: scoredInfo.decisionReason,
      keyCrossAttentionPairs: scoredInfo.attentionPairs,
      topHighlights: scoredInfo.attentionPairs.map((p) => `[${p.queryToken}] ↔ [${p.docToken}]`),
      isAdversarialCaught: scoredInfo.isAdversarialCaught,
      temporalStatus: scoredInfo.temporalStatus,
      authorityScore: scoredInfo.authorityScore,
    };
  });

  // Sort descending by Cross-Encoder score
  scored.sort((a, b) => b.rerankScore - a.rerankScore);

  // Assign rerankRank and calculate rankDelta
  const results: RerankResult[] = scored.map((item, idx) => {
    const rerankRank = idx + 1;
    const rankDelta = item.initialRank - rerankRank; // > 0 promoted, < 0 demoted

    return {
      ...item,
      rerankRank,
      rankDelta,
    };
  });

  return results;
}

/**
 * Execute the complete Two-Stage Funnel pipeline:
 * Stage 1: Coarse Retrieval (Hybrid RRF / BM25 / Vector) -> Top K candidates
 * Stage 2: Fine Reranking (Cross-Encoder) -> Top N golden context
 */
export function runTwoStageFunnel(
  allDocs: CorpusDocument[],
  query: string,
  options?: {
    stage1TopK?: number;
    stage2TopN?: number;
    hybridOptions?: HybridFusionOptions;
    rerankOptions?: RerankOptions;
  }
): TwoStageFunnelResult {
  const topK = options?.stage1TopK ?? 8;
  const topN = options?.stage2TopN ?? 3;

  // 1. Stage 1: Coarse Retrieval (Hybrid RRF)
  const t0 = Date.now();
  const hybridOutput = searchHybridInDocs(allDocs, query, {
    algorithm: "rrf",
    k: 60,
    topK,
    ...options?.hybridOptions,
  });
  const stage1LatencyMs = Math.max(1, Date.now() - t0);

  // 2. Stage 2: Fine Reranking (Cross-Encoder)
  const t1 = Date.now();
  const rerankedAll = rerankDocuments(
    query,
    hybridOutput.hybridResults,
    options?.rerankOptions
  );
  const stage2LatencyMs = Math.max(2, Date.now() - t1);

  // Truncate to Top N
  const truncatedTopN = rerankedAll.slice(0, topN);

  // Token calculations
  const allCandidatesTokens = hybridOutput.hybridResults.reduce(
    (acc, r) => acc + r.doc.tokenCount,
    0
  );
  const truncatedTokens = truncatedTopN.reduce(
    (acc, r) => acc + r.doc.tokenCount,
    0
  );
  const tokenSavingsPct =
    allCandidatesTokens > 0
      ? Number((((allCandidatesTokens - truncatedTokens) / allCandidatesTokens) * 100).toFixed(1))
      : 0;

  // Precision shift inspection
  const previousTop1DocId = hybridOutput.hybridResults[0]?.doc.id || "";
  const newTop1DocId = truncatedTopN[0]?.doc.id || "";
  const top1DocChanged = previousTop1DocId !== newTop1DocId;

  let shiftSummary = "粗排与精排的首位目标一致，保持高置信度。";
  if (top1DocChanged) {
    shiftSummary = `精排完成关键重排序：原粗排 Top 1 (${previousTop1DocId}) 因细粒度逻辑约束被修正，由黄金匹配文档 (${newTop1DocId}) 夺得首位！`;
  }

  return {
    query,
    stage1Candidates: hybridOutput.hybridResults,
    stage2Reranked: rerankedAll,
    truncatedTopN,
    stage1LatencyMs,
    stage2LatencyMs,
    totalLatencyMs: stage1LatencyMs + stage2LatencyMs,
    promptTokenStats: {
      allCandidatesTokens,
      truncatedTokens,
      tokenSavingsPct,
    },
    precisionShift: {
      top1DocChanged,
      previousTop1DocId,
      newTop1DocId,
      summary: shiftSummary,
    },
  };
}

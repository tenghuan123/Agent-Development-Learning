import type { CorpusDocument } from "./corpus";

export interface SemanticSearchResult {
  doc: CorpusDocument;
  similarity: number; // 0.0 ~ 1.0 (Cosine similarity)
  rank: number;
  vectorSlice: number[]; // First 8~10 dimensions for radar / vector inspection
  previewSnippet: string;
}

/**
 * Calculate Dot Product of two vectors: A · B = sum(A_i * B_i)
 */
export function vectorDotProduct(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Calculate Euclidean L2 Norm (magnitude): ||A|| = sqrt(sum(A_i^2))
 */
export function vectorNorm(a: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * a[i];
  }
  return Math.sqrt(sum);
}

/**
 * Calculate Cosine Similarity:
 * cos(theta) = (A · B) / (||A|| * ||B||)
 * Returns a value between -1.0 and 1.0 (clamped to 0.0 ~ 1.0 for text embedding semantics)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const dot = vectorDotProduct(a, b);
  const normA = vectorNorm(a);
  const normB = vectorNorm(b);

  if (normA === 0 || normB === 0) return 0;

  const rawCos = dot / (normA * normB);
  // Clamped to [0.0, 1.0] for typical text relevance representation
  return Math.max(0, Math.min(1, Number(rawCos.toFixed(4))));
}

/**
 * Built-in deterministic semantic dictionary groups for benchmark corpus domain concepts.
 * This guarantees that even without an external API key or remote embedding service,
 * the educational workbench can demonstrate continuous semantic space alignment.
 */
const SEMANTIC_CLUSTERS: Array<{
  name: string;
  dimIndex: number;
  weight: number;
  terms: string[];
}> = [
  {
    name: "refund_and_regret",
    dimIndex: 0,
    weight: 1.8,
    terms: [
      "退款", "无理由", "后悔", "不想要", "不想要了", "退货", "犹豫期", "冷静期",
      "退还", "原路退款", "售后", "保障", "退钱", "退回", "退换", "不买了", "取消购买"
    ],
  },
  {
    name: "alpha_enterprise_auth",
    dimIndex: 1,
    weight: 1.5,
    terms: [
      "alpha", "企业版", "sso", "单点登录", "令牌", "授权密钥", "容灾", "高可用",
      "故障切换", "主备", "崩溃", "节点切换", "30天保障"
    ],
  },
  {
    name: "beta_developer_connector",
    dimIndex: 2,
    weight: 1.5,
    terms: [
      "beta", "插件", "代码库", "审查", "集成", "跨代码库",
      "免费插件", "协同", "开发者", "github", "gitlab"
    ],
  },
  {
    name: "gamma_vector_gpu",
    dimIndex: 3,
    weight: 1.6,
    terms: [
      "gamma", "向量数据库", "算力", "gpu", "硬件", "按量计费", "机时", "实时计算",
      "不可退款", "存储", "向量索引", "milvus", "chroma"
    ],
  },
  {
    name: "pricing_and_subscription",
    dimIndex: 4,
    weight: 1.3,
    terms: [
      "价格", "费用", "定价", "订阅", "年付", "月付", "计费", "打折", "优惠",
      "企业定制", "增购", "账单"
    ],
  },
  {
    name: "shipping_and_delivery",
    dimIndex: 5,
    weight: 1.3,
    terms: [
      "物流", "发货", "快递", "配送", "时效", "顺丰", "地址", "签收", "运费"
    ],
  },
  {
    name: "temporal_policy_version",
    dimIndex: 6,
    weight: 1.4,
    terms: [
      "2026", "2024", "最新政策", "旧政策", "现行", "已废弃", "历史归档", "版本冲突", "有效期"
    ],
  },
  {
    name: "security_and_sandbox",
    dimIndex: 7,
    weight: 1.2,
    terms: [
      "安全", "沙箱", "鉴权", "权限", "攻击", "注入", "隔离", "风险", "合规"
    ],
  },
];

/**
 * Pure zero-dependency deterministic dense semantic vectorizer (16 dimensions).
 * 100% safe to run in both browser and node.
 * Maps lexical synonyms into contiguous geometric dimensions.
 */
export function computeDenseSemanticVector(text: string, dimensions = 16): number[] {
  const vec = new Array(dimensions).fill(0);
  if (!text || !text.trim()) return vec;

  const lower = text.toLowerCase();

  // 1. Project semantic clusters into primary dimensions (0 ~ 7)
  for (const cluster of SEMANTIC_CLUSTERS) {
    if (cluster.dimIndex < dimensions) {
      for (const term of cluster.terms) {
        if (lower.includes(term.toLowerCase())) {
          vec[cluster.dimIndex] += cluster.weight;
        }
      }
    }
  }

  // 2. Hash character bi-grams into remaining continuous dimensions (8 ~ dimensions - 1)
  const clean = text.replace(/[\s\p{P}]/gu, "");
  for (let i = 0; i < clean.length - 1; i++) {
    const bigram = clean.slice(i, i + 2);
    let hash = 0;
    for (let c = 0; c < bigram.length; c++) {
      hash = (hash * 31 + bigram.charCodeAt(c)) & 0x7fffffff;
    }
    const targetDim = 8 + (hash % Math.max(1, dimensions - 8));
    if (targetDim < dimensions) {
      vec[targetDim] += 0.2;
    }
  }

  // 3. Add base energy to prevent all-zero vector for arbitrary text
  if (vectorNorm(vec) === 0) {
    for (let i = 0; i < dimensions; i++) {
      vec[i] = 0.05 * Math.sin(clean.length + i);
    }
  }

  // 4. L2 Normalization so that ||vec|| = 1.0 (Unit vector)
  const norm = vectorNorm(vec);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) {
      vec[i] = Number((vec[i] / norm).toFixed(4));
    }
  }

  return vec;
}

/**
 * Pure in-memory Semantic Search over any array of CorpusDocument.
 * Supports passing custom pre-calculated query/doc vectors (e.g. from OpenAI embeddings).
 */
export function searchSemanticInDocs(
  docs: CorpusDocument[],
  query: string,
  options?: {
    topK?: number;
    queryVector?: number[];
    docVectors?: Map<string, number[]>;
    minThreshold?: number;
  }
): SemanticSearchResult[] {
  if (!query || !query.trim()) return [];

  const topK = options?.topK ?? 5;
  const minThreshold = options?.minThreshold ?? 0.0;
  const qVec = options?.queryVector || computeDenseSemanticVector(query);

  const results: SemanticSearchResult[] = [];

  for (const doc of docs) {
    const docVec = options?.docVectors?.get(doc.id) || computeDenseSemanticVector(`${doc.title} \n ${doc.content}`);
    const sim = cosineSimilarity(qVec, docVec);

    if (sim >= minThreshold) {
      // Pick first 200 characters as preview snippet
      const cleanSnippet = doc.content
        .replace(/^#+.*$/gm, "")
        .replace(/\r?\n+/g, " ")
        .trim()
        .slice(0, 160);

      results.push({
        doc,
        similarity: sim,
        rank: 0, // Assigned after sorting
        vectorSlice: docVec.slice(0, 8),
        previewSnippet: cleanSnippet + (doc.content.length > 160 ? "..." : ""),
      });
    }
  }

  // Sort by cosine similarity descending
  results.sort((a, b) => b.similarity - a.similarity);

  // Assign 1-based ranks
  results.forEach((r, idx) => {
    r.rank = idx + 1;
  });

  return results.slice(0, topK);
}

export interface TokenFragment {
  token: string;
  type: "symbol_prefix" | "separator" | "subword" | "digits" | "word";
  isRareIdentifier: boolean;
  dilutionPct: number;
}

export interface FragmentationReport {
  original: string;
  tokens: TokenFragment[];
  fragmentCount: number;
  containsExactSymbol: boolean;
  dilutionSeverity: "none" | "low" | "medium" | "severe";
  explanation: string;
}

/**
 * Simulates Subword BPE / WordPiece tokenization behavior on exact symbols,
 * error codes (ERR_ALPHA_AUTH_9021), and CamelCase names (AlphaSyncDaemon).
 * Demonstrates how continuous embeddings dilute discrete identifier fingerprints.
 */
export function simulateTokenFragmentation(text: string): FragmentationReport {
  if (!text || !text.trim()) {
    return {
      original: "",
      tokens: [],
      fragmentCount: 0,
      containsExactSymbol: false,
      dilutionSeverity: "none",
      explanation: "输入为空",
    };
  }

  const rawTokens: TokenFragment[] = [];
  // Tokenize using regex preserving code identifiers, delimiters, and chinese characters
  const identifierRegex = /[A-Z0-9]+(?:_[A-Z0-9]+)+|[A-Z][a-z]+(?:[A-Z][a-z]+)+|[a-zA-Z]+|\d+|[\u4e00-\u9fa5]|[^\s\w\u4e00-\u9fa5]/g;
  const matches = text.match(identifierRegex) || [];

  let hasExactSymbol = false;

  for (const item of matches) {
    // Check if item is an uppercase underscored identifier (e.g. ERR_ALPHA_AUTH_9021)
    if (/^[A-Z0-9]+(_[A-Z0-9]+)+$/.test(item)) {
      hasExactSymbol = true;
      const parts = item.split("_");
      parts.forEach((p, idx) => {
        if (/^\d+$/.test(p)) {
          // Numbers in BPE often fragment into 2-digit chunks e.g. 90, 21
          if (p.length > 2) {
            rawTokens.push({ token: p.slice(0, 2), type: "digits", isRareIdentifier: true, dilutionPct: 15 });
            rawTokens.push({ token: p.slice(2), type: "digits", isRareIdentifier: true, dilutionPct: 15 });
          } else {
            rawTokens.push({ token: p, type: "digits", isRareIdentifier: true, dilutionPct: 20 });
          }
        } else if (p.length > 5) {
          rawTokens.push({ token: p.slice(0, 4), type: "subword", isRareIdentifier: true, dilutionPct: 25 });
          rawTokens.push({ token: p.slice(4), type: "subword", isRareIdentifier: true, dilutionPct: 25 });
        } else {
          rawTokens.push({ token: p, type: idx === 0 ? "symbol_prefix" : "subword", isRareIdentifier: true, dilutionPct: 30 });
        }

        if (idx < parts.length - 1) {
          rawTokens.push({ token: "_", type: "separator", isRareIdentifier: false, dilutionPct: 5 });
        }
      });
    } else if (/^[A-Z][a-z]+([A-Z][a-z]+)+$/.test(item)) {
      // CamelCase identifier e.g. AlphaSyncDaemon
      hasExactSymbol = true;
      const camelParts = item.match(/[A-Z][a-z]+/g) || [item];
      camelParts.forEach((cp) => {
        rawTokens.push({ token: cp, type: "subword", isRareIdentifier: true, dilutionPct: 35 });
      });
    } else if (/^\d{3,}$/.test(item)) {
      // Standalone numbers / ports e.g. 9443
      hasExactSymbol = true;
      rawTokens.push({ token: item.slice(0, 2), type: "digits", isRareIdentifier: true, dilutionPct: 30 });
      rawTokens.push({ token: item.slice(2), type: "digits", isRareIdentifier: true, dilutionPct: 30 });
    } else if (/^[\u4e00-\u9fa5]$/.test(item)) {
      rawTokens.push({ token: item, type: "word", isRareIdentifier: false, dilutionPct: 50 });
    } else {
      rawTokens.push({ token: item, type: "word", isRareIdentifier: false, dilutionPct: 50 });
    }
  }

  const totalTokens = rawTokens.length;
  const rareCount = rawTokens.filter((t) => t.isRareIdentifier).length;

  let dilutionSeverity: FragmentationReport["dilutionSeverity"] = "none";
  let explanation = "查询主要由通用词组成，分词器按正常词根切分，语义空间分布均衡。";

  if (hasExactSymbol) {
    if (rareCount >= 6 || totalTokens > 10) {
      dilutionSeverity = "severe";
      explanation = "严重分词碎片化：唯一标识符被 BPE 撕裂为多个连续 Subword 与数字残片，其高维绝对几何特征被周围通用词严重稀释！";
    } else if (rareCount >= 3) {
      dilutionSeverity = "medium";
      explanation = "中度稀释：精确符号被拆分为词根与数字片段，在连续向量空间中可能因通用副词诱导发生排名偏移。";
    } else {
      dilutionSeverity = "low";
      explanation = "轻微切分：包含专有标识符，但切分块较少，向量相似度仍保留部分区分度。";
    }
  }

  return {
    original: text,
    tokens: rawTokens,
    fragmentCount: totalTokens,
    containsExactSymbol: hasExactSymbol,
    dilutionSeverity,
    explanation,
  };
}


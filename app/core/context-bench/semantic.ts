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
      "故障切换", "主备", "崩溃", "节点切换", "alphasyncdaemon", "alphaauthbridge",
      "err_alpha_auth_9021", "30天保障"
    ],
  },
  {
    name: "beta_developer_connector",
    dimIndex: 2,
    weight: 1.5,
    terms: [
      "beta", "插件", "betagammaconnector", "代码库", "审查", "集成", "跨代码库",
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

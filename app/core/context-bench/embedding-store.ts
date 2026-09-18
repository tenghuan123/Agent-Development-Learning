import * as fs from "node:fs";
import * as path from "node:path";
import type { ChunkStrategy } from "./chunker";

/**
 * 向量集按【课程阶段】分目录管理。
 *
 * data/context-benchmark/
 * ├── c4-c7/document-embeddings.json    ← C4~C7 的冻结历史资产（只读）
 * ├── c8/document-embeddings.json       ← C8 文档级向量（覆盖含新长文档的全量语料）
 * └── c8/chunk-embeddings.json          ← C8 chunk 级向量
 *
 * 目录本身即版本边界：调整切分配置（strategy / chunkSize / overlap）会产生新的
 * chunk 向量文件名，而不是原地覆盖。
 */
export type EmbeddingStage = "c4-c7" | "c8";
export type EmbeddingKind = "document" | "chunk";

export interface ChunkVectorConfig {
  strategy: ChunkStrategy;
  chunkSize: number;
  overlap: number;
}

/** 兼容旧字段名 */
export type ChunkEmbeddingConfig = ChunkVectorConfig;

export interface EmbeddingSet {
  id: string;
  stage: EmbeddingStage;
  kind: EmbeddingKind;
  /** 相对 data/context-benchmark 的展示路径，用于 UI 状态条 */
  relativePath: string;
  absolutePath: string;
  model: string;
  dimensions: number;
  generatedAt: string;
  chunkConfig?: ChunkVectorConfig;
  vectors: Map<string, number[]>;
  /** 文件不存在时为 false —— 调用方据此决定是否回退到本地确定性向量 */
  exists: boolean;
}

/** 冻结阶段：历史资产，生成脚本对其只读，且拒绝任何写入 */
export const FROZEN_STAGES: ReadonlySet<EmbeddingStage> = new Set<EmbeddingStage>(["c4-c7"]);

const DOCUMENT_FILENAME = "document-embeddings.json";

/**
 * chunk 向量集的文件名**编码切分配置**。
 *
 * 这不是风格问题：chunk id 是 `${docId}#c${index}`，不同切分配置下同一个 id
 * 指向完全不同的文本。用统一文件名会诱导「覆盖写入」与「跨配置错配」，
 * 因此强制让配置成为文件名的一部分。
 */
export function chunkSetFilename(config: ChunkVectorConfig): string {
  return `chunk-${config.strategy}-${config.chunkSize}-ov${config.overlap}.json`;
}

export function getEmbeddingBasePath(): string {
  return path.join(process.cwd(), "data", "context-benchmark");
}

/**
 * 解析某个阶段 / 类型的向量集文件绝对路径。
 * 纯路径计算，不触碰文件系统 —— 生成脚本用它做写入白名单校验。
 */
export function resolveEmbeddingPath(
  stage: EmbeddingStage,
  kind: EmbeddingKind,
  chunkConfig?: ChunkVectorConfig
): string {
  const filename =
    kind === "document"
      ? DOCUMENT_FILENAME
      : chunkConfig
      ? chunkSetFilename(chunkConfig)
      : (() => {
          throw new Error(
            "chunk 向量集必须提供切分配置（strategy / chunkSize / overlap），" +
              "文件名需要编码配置以避免跨配置错配。"
          );
        })();
  return path.join(getEmbeddingBasePath(), stage, filename);
}

function toRelativePath(absolutePath: string): string {
  return path.relative(getEmbeddingBasePath(), absolutePath).split(path.sep).join("/");
}

/** 读取向量映射；兼容 `documents`（既有约定）与 `vectors` 两种键名 */
function readVectorMap(parsed: Record<string, unknown>): Map<string, number[]> {
  const vectors = new Map<string, number[]>();
  const raw = (parsed.documents ?? parsed.vectors) as Record<string, number[]> | undefined;
  if (!raw || typeof raw !== "object") return vectors;

  for (const [id, vec] of Object.entries(raw)) {
    if (Array.isArray(vec) && vec.every((n) => typeof n === "number")) {
      vectors.set(id, vec);
    }
  }
  return vectors;
}

const setCache = new Map<string, EmbeddingSet>();

function loadSetFromPath(
  stage: EmbeddingStage,
  kind: EmbeddingKind,
  absolutePath: string,
  chunkConfig?: ChunkVectorConfig
): EmbeddingSet {
  const cacheKey = absolutePath;
  const cached = setCache.get(cacheKey);
  if (cached) return cached;

  const base: EmbeddingSet = {
    id: `${stage}/${path.basename(absolutePath)}`,
    stage,
    kind,
    relativePath: toRelativePath(absolutePath),
    absolutePath,
    model: "unknown",
    dimensions: 0,
    generatedAt: "",
    chunkConfig,
    vectors: new Map(),
    exists: false,
  };

  if (!fs.existsSync(absolutePath)) {
    setCache.set(cacheKey, base);
    return base;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf-8")) as Record<string, unknown>;
    const storeConfig =
      typeof parsed.strategy === "string"
        ? {
            strategy: parsed.strategy as ChunkStrategy,
            chunkSize: typeof parsed.chunkSize === "number" ? parsed.chunkSize : 0,
            overlap: typeof parsed.overlap === "number" ? parsed.overlap : 0,
          }
        : chunkConfig;

    const loaded: EmbeddingSet = {
      ...base,
      model: typeof parsed.model === "string" ? parsed.model : "unknown",
      dimensions: typeof parsed.dimensions === "number" ? parsed.dimensions : 0,
      generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : "",
      chunkConfig: storeConfig,
      vectors: readVectorMap(parsed),
      exists: true,
    };
    setCache.set(cacheKey, loaded);
    return loaded;
  } catch (err) {
    console.warn(`[embedding-store] 解析失败 ${base.relativePath}:`, err);
    setCache.set(cacheKey, base);
    return base;
  }
}

/**
 * 装载向量集（带进程内缓存）。文件缺失不抛错，返回 `exists: false` 的空集，
 * 由调用方通过 `selectCompatibleVectors` 决定回退策略。
 */
export function loadEmbeddingSet(
  stage: EmbeddingStage,
  kind: EmbeddingKind,
  chunkConfig?: ChunkVectorConfig
): EmbeddingSet {
  return loadSetFromPath(
    stage,
    kind,
    resolveEmbeddingPath(stage, kind, chunkConfig),
    chunkConfig
  );
}

/** 列出某阶段下全部 chunk 向量集（文件名即配置，逐一解析） */
export function listChunkEmbeddingSets(stage: EmbeddingStage): EmbeddingSet[] {
  const dir = path.join(getEmbeddingBasePath(), stage);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("chunk-") && f.endsWith(".json"))
    .map((f) => {
      const m = f.match(/^chunk-(.+)-(\d+)-ov(\d+)\.json$/);
      const cfg: ChunkVectorConfig | undefined = m
        ? { strategy: m[1] as ChunkStrategy, chunkSize: Number(m[2]), overlap: Number(m[3]) }
        : undefined;
      return loadSetFromPath(stage, "chunk", path.join(dir, f), cfg);
    });
}

/**
 * 按切分配置精确匹配一个 chunk 向量集。
 * 配置不一致时返回 undefined —— 绝不「就近匹配」，因为 id 会跨配置碰撞。
 */
export function findChunkEmbeddingSet(
  stage: EmbeddingStage,
  config: ChunkVectorConfig
): EmbeddingSet | undefined {
  return listChunkEmbeddingSets(stage).find(
    (s) =>
      s.exists &&
      s.chunkConfig?.strategy === config.strategy &&
      s.chunkConfig?.chunkSize === config.chunkSize &&
      s.chunkConfig?.overlap === config.overlap
  );
}

export function listEmbeddingSets(): EmbeddingSet[] {
  const stages: EmbeddingStage[] = ["c4-c7", "c8"];
  return [
    ...stages.map((stage) => loadEmbeddingSet(stage, "document")),
    ...stages.flatMap((stage) => listChunkEmbeddingSets(stage)),
  ];
}

/** 覆盖度校验：requiredIds 中不在向量集里的 id 即为 missing */
export function validateCoverage(
  set: EmbeddingSet,
  requiredIds: string[]
): { missing: string[]; extra: string[] } {
  const missing = requiredIds.filter((id) => !set.vectors.has(id));
  const requiredSet = new Set(requiredIds);
  const extra = Array.from(set.vectors.keys()).filter((id) => !requiredSet.has(id));
  return { missing, extra };
}

export interface VectorSelection {
  /** 仅在维度与查询向量一致时给出；否则为 undefined，调用方须回退本地向量 */
  docVectors?: Map<string, number[]>;
  /** 无法匹配维度、必须回退本地确定性向量的 id */
  fallbackIds: string[];
  /** 实际命中的 id（维度一致） */
  matchedIds: string[];
  /** 供 UI 展示的人类可读说明 */
  reason: string;
}

/**
 * 维度安全的向量选路 —— 消灭“静默降级”。
 *
 * 痛点：`cosineSimilarity(512 维 query, 16 维 doc)` 在 `vectorDotProduct` 取
 * `min(len)` 作点积、却各自用自身长度算范数，导致范数错配、余弦被系统性压低。
 *
 * 因此这里只在【整集维度与查询向量一致】时交出向量表；一旦维度不符或集合缺失，
 * 就整体放弃远端向量，让调用方退回本地确定性向量（查询向量同时也用本地向量，
 * 保证两侧同维）。
 */
export function selectCompatibleVectors(
  docIds: string[],
  set: EmbeddingSet,
  queryDimensions: number
): VectorSelection {
  if (!set.exists) {
    return {
      fallbackIds: docIds,
      matchedIds: [],
      reason: `向量集 ${set.relativePath} 不存在，全部回退本地确定性向量`,
    };
  }

  if (set.dimensions !== queryDimensions) {
    return {
      fallbackIds: docIds,
      matchedIds: [],
      reason:
        `向量集 ${set.relativePath} 为 ${set.dimensions} 维，查询向量为 ` +
        `${queryDimensions} 维，维度不符，全部回退本地确定性向量`,
    };
  }

  const docVectors = new Map<string, number[]>();
  const fallbackIds: string[] = [];
  for (const id of docIds) {
    const vec = set.vectors.get(id);
    if (vec && vec.length === queryDimensions) {
      docVectors.set(id, vec);
    } else {
      fallbackIds.push(id);
    }
  }

  return {
    docVectors: docVectors.size > 0 ? docVectors : undefined,
    fallbackIds,
    matchedIds: Array.from(docVectors.keys()),
    reason:
      fallbackIds.length === 0
        ? `全部 ${docVectors.size} 篇命中 ${set.relativePath} (${set.dimensions} 维, ${set.model})`
        : `${docVectors.size} 篇命中向量集，${fallbackIds.length} 篇不在集内（已从语义通道排除）`,
  };
}

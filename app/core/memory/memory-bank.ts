import * as fs from "fs";
import * as path from "path";
import type { MemoryCategory, MemoryItem, MemoryQueryFilter, MemoryBankState } from "./types";

/**
 * Default initial seed memories demonstrating conventions, learnings and preferences
 */
const DEFAULT_SEED_MEMORIES: Omit<MemoryItem, "id" | "createdAt" | "updatedAt" | "accessCount">[] = [
  {
    category: "convention",
    key: "pkg_manager_and_port",
    content: "本项目严格使用 Bun 或 npm 管理依赖，本地调试后端服务统一监听在 9090 端口，前端代理使用 Vite 8080。",
    tags: ["bun", "port", "9090", "npm", "server"],
    source: "user_taught",
    confidence: 0.98,
  },
  {
    category: "preference",
    key: "code_style_typescript",
    content: "用户偏好严谨的 TypeScript 强类型代码，要求导出函数必须配齐完整的 JSDoc 参数与返回值注释，禁止使用 any。",
    tags: ["typescript", "jsdoc", "style", "types"],
    source: "user_taught",
    confidence: 0.95,
  },
  {
    category: "learning",
    key: "auth_middleware_pitfall",
    content: "修改 app/core/auth 相关鉴权代码时，必须同步更新配套的 mock token 拦截器，否则本地单测会报 401 Unauthorized 错误。",
    tags: ["auth", "token", "test", "pitfall", "401"],
    source: "auto_reflected",
    confidence: 0.92,
  },
  {
    category: "architecture",
    key: "submodule_structure",
    content: "核心业务逻辑集中于 app/core/，工具链位于 app/core/tools/，路由组件位于 app/routes/。页面间共享状态优先使用 React Router loaders 与 Context。",
    tags: ["architecture", "core", "routes", "structure"],
    source: "manual_entry",
    confidence: 0.99,
  },
];

export class MemoryBank {
  private items: Map<string, MemoryItem> = new Map();
  private storagePath?: string;
  private autoSave: boolean;

  constructor(options?: { storagePath?: string; autoSave?: boolean; seedIfEmpty?: boolean }) {
    this.storagePath = options?.storagePath;
    this.autoSave = options?.autoSave ?? true;

    // Load from disk if file exists, otherwise seed
    if (this.storagePath && fs.existsSync(this.storagePath)) {
      this.loadFromDisk();
    } else if (options?.seedIfEmpty !== false) {
      this.seedDefaults();
    }
  }

  /**
   * Seed default memories if empty
   */
  private seedDefaults(): void {
    const now = new Date().toISOString();
    DEFAULT_SEED_MEMORIES.forEach((seed, idx) => {
      const item: MemoryItem = {
        ...seed,
        id: `mem_seed_${idx + 1}`,
        accessCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      this.items.set(item.id, item);
    });
    if (this.autoSave && this.storagePath) {
      this.saveToDisk();
    }
  }

  /**
   * Add a new memory item
   */
  public add(item: {
    category: MemoryCategory;
    key: string;
    content: string;
    tags?: string[];
    source?: MemoryItem["source"];
    confidence?: number;
  }): MemoryItem {
    const now = new Date().toISOString();
    const id = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    // Auto generate tags from key and content words if none provided
    const tags = item.tags && item.tags.length > 0 
      ? item.tags.map(t => t.toLowerCase().trim())
      : this.extractKeywords(item.key + " " + item.content);

    const memoryItem: MemoryItem = {
      id,
      category: item.category,
      key: item.key.trim(),
      content: item.content.trim(),
      tags,
      source: item.source || "manual_entry",
      confidence: item.confidence ?? 0.9,
      accessCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    // If key already exists in the same category, update it to prevent duplicate stale rules
    const existing = this.findByKey(item.key, item.category);
    if (existing) {
      return this.update(existing.id, {
        content: item.content,
        tags,
        confidence: item.confidence ?? existing.confidence,
        source: item.source ?? existing.source,
      })!;
    }

    this.items.set(id, memoryItem);
    if (this.autoSave && this.storagePath) {
      this.saveToDisk();
    }
    return memoryItem;
  }

  /**
   * Update an existing memory item
   */
  public update(id: string, updates: Partial<Omit<MemoryItem, "id" | "createdAt">>): MemoryItem | null {
    const existing = this.items.get(id);
    if (!existing) return null;

    const updated: MemoryItem = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.items.set(id, updated);
    if (this.autoSave && this.storagePath) {
      this.saveToDisk();
    }
    return updated;
  }

  /**
   * Remove a memory item
   */
  public remove(id: string): boolean {
    const deleted = this.items.delete(id);
    if (deleted && this.autoSave && this.storagePath) {
      this.saveToDisk();
    }
    return deleted;
  }

  /**
   * Get a memory item by ID
   */
  public get(id: string): MemoryItem | undefined {
    return this.items.get(id);
  }

  /**
   * Find a memory by key and category
   */
  public findByKey(key: string, category?: MemoryCategory): MemoryItem | undefined {
    const targetKey = key.toLowerCase().trim();
    for (const item of this.items.values()) {
      if (item.key.toLowerCase() === targetKey && (!category || item.category === category)) {
        return item;
      }
    }
    return undefined;
  }

  /**
   * List all memory items matching filter
   */
  public list(filter?: MemoryQueryFilter): MemoryItem[] {
    let result = Array.from(this.items.values());

    if (filter?.category && filter.category !== "all") {
      result = result.filter((item) => item.category === filter.category);
    }

    if (filter?.minConfidence !== undefined) {
      result = result.filter((item) => (item.confidence ?? 1) >= filter.minConfidence!);
    }

    if (filter?.tags && filter.tags.length > 0) {
      const targetTags = filter.tags.map((t) => t.toLowerCase());
      result = result.filter((item) =>
        targetTags.some((tag) => item.tags.includes(tag))
      );
    }

    if (filter?.query && filter.query.trim()) {
      const q = filter.query.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.key.toLowerCase().includes(q) ||
          item.content.toLowerCase().includes(q) ||
          item.tags.some((t) => t.includes(q))
      );
    }

    // Sort by confidence & access count descending
    result.sort((a, b) => {
      const scoreA = (a.confidence ?? 0.8) * 10 + Math.log(a.accessCount + 1);
      const scoreB = (b.confidence ?? 0.8) * 10 + Math.log(b.accessCount + 1);
      return scoreB - scoreA;
    });

    if (filter?.limit && filter.limit > 0) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }

  /**
   * Search / Recall relevant memories based on user prompt or query keywords
   */
  public recall(query: string, options?: { category?: MemoryCategory | "all"; limit?: number; minScore?: number }): MemoryItem[] {
    if (!query || !query.trim()) {
      return this.list({ category: options?.category, limit: options?.limit ?? 5 });
    }

    const keywords = this.extractKeywords(query);
    const category = options?.category;
    const limit = options?.limit ?? 5;
    const minScore = options?.minScore ?? 1;

    const scored: { item: MemoryItem; score: number }[] = [];

    for (const item of this.items.values()) {
      if (category && category !== "all" && item.category !== category) {
        continue;
      }

      let score = 0;
      const lowerContent = item.content.toLowerCase();
      const lowerKey = item.key.toLowerCase();

      for (const kw of keywords) {
        if (lowerKey.includes(kw)) score += 3;
        if (lowerContent.includes(kw)) score += 1.5;
        if (item.tags.some((t) => t.includes(kw))) score += 2;
      }

      // Preference and Convention get a boost for general tasks
      if (item.category === "convention" || item.category === "preference") {
        score += 0.5;
      }

      if (score >= minScore) {
        scored.push({ item, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const recalled = scored.slice(0, limit).map((s) => s.item);

    // Record access
    const now = new Date().toISOString();
    recalled.forEach((item) => {
      item.accessCount = (item.accessCount || 0) + 1;
      item.lastAccessedAt = now;
      this.items.set(item.id, item);
    });

    if (recalled.length > 0 && this.autoSave && this.storagePath) {
      this.saveToDisk();
    }

    return recalled;
  }

  /**
   * Format recalled memories into a clean markdown block for System / Anchor prompt injection
   */
  public formatForPrompt(memories: MemoryItem[]): string {
    if (!memories || memories.length === 0) return "";

    const grouped: Record<MemoryCategory, MemoryItem[]> = {
      preference: [],
      convention: [],
      learning: [],
      architecture: [],
    };

    memories.forEach((m) => {
      if (grouped[m.category]) {
        grouped[m.category].push(m);
      }
    });

    const categoryLabels: Record<MemoryCategory, string> = {
      convention: "📐 Project Conventions & Constraints (必遵规范)",
      preference: "👤 User Style & Preferences (用户偏好)",
      learning: "💡 Learned Pitfalls & Experience (排错避坑经验)",
      architecture: "🏗️ Architectural Knowledge (架构认知)",
    };

    let md = `=== 🧠 LONG-TERM MEMORY BANK (Persistent Rules & Experience) ===\n`;
    md += `[Notice: The following knowledge was recalled from long-term memory. Strictly obey these rules.]\n\n`;

    (Object.keys(grouped) as MemoryCategory[]).forEach((cat) => {
      const list = grouped[cat];
      if (list.length > 0) {
        md += `### ${categoryLabels[cat]}:\n`;
        list.forEach((item) => {
          md += `- **[${item.key}]**: ${item.content}\n`;
        });
        md += `\n`;
      }
    });

    md += `=================================================================\n`;
    return md;
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const tokens = text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5\-_]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
    return Array.from(new Set(tokens));
  }

  /**
   * Export all items as JSON state
   */
  public exportState(): MemoryBankState {
    return {
      version: "1.0",
      items: Array.from(this.items.values()),
      lastModified: new Date().toISOString(),
    };
  }

  /**
   * Import state
   */
  public importState(state: MemoryBankState): void {
    this.items.clear();
    state.items.forEach((item) => this.items.set(item.id, item));
    if (this.autoSave && this.storagePath) {
      this.saveToDisk();
    }
  }

  /**
   * Clear all memories
   */
  public clear(): void {
    this.items.clear();
    if (this.autoSave && this.storagePath) {
      this.saveToDisk();
    }
  }

  /**
   * Persistence to Disk
   */
  private saveToDisk(): void {
    if (!this.storagePath) return;
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.storagePath,
        JSON.stringify(this.exportState(), null, 2),
        "utf-8"
      );
    } catch (e) {
      console.error("[MemoryBank] Failed to save to disk:", e);
    }
  }

  private loadFromDisk(): void {
    if (!this.storagePath || !fs.existsSync(this.storagePath)) return;
    try {
      const content = fs.readFileSync(this.storagePath, "utf-8");
      const state: MemoryBankState = JSON.parse(content);
      this.items.clear();
      state.items.forEach((item) => this.items.set(item.id, item));
    } catch (e) {
      console.error("[MemoryBank] Failed to load from disk:", e);
      this.seedDefaults();
    }
  }
}

const STOP_WORDS = new Set([
  "the", "is", "at", "which", "on", "a", "an", "and", "or", "to", "in", "of", "for", "with",
  "this", "that", "it", "as", "by", "from", "you", "we", "can", "please",
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "自己", "这"
]);


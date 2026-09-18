import * as fs from "node:fs";
import * as path from "node:path";

export interface DocItem {
  slug: string; // e.g. "lessons/03-agent-loop-and-react.md" or "README.md"
  title: string; // Full title from markdown # header or formatted name
  shortTitle: string; // Crisp title for sidebar navigation
  category: "guides" | "lessons" | "context";
  badge: string; // e.g. "V2", "C0", "导读"
  order: number;
  workbenchUrl?: string; // Interactive workbench route if available
}

export interface DocCategory {
  id: "guides" | "lessons" | "context";
  title: string;
  description: string;
  items: DocItem[];
}

export const WORKBENCH_DOC_MAP: Record<string, string> = {
  v0: "/docs/lessons/01-statelessness-and-structured-output.md",
  v1: "/docs/lessons/02-tool-calling-mechanism.md",
  v2: "/docs/lessons/03-agent-loop-and-react.md",
  v3: "/docs/lessons/04-coding-agent-and-self-healing.md",
  v4: "/docs/lessons/05-planning-and-workflow-routing.md",
  v5: "/docs/lessons/06-context-engineering-and-compression.md",
  v6: "/docs/lessons/07-memory-and-state-persistence.md",
  v7: "/docs/lessons/08-harness-and-sandbox-security.md",
  v8: "/docs/lessons/09-mcp-standard-and-plugin-architecture.md",
  v9: "/docs/lessons/10-durable-execution-and-checkpointing.md",
  v10: "/docs/lessons/11-eval-and-tracing.md",
  v11: "/docs/lessons/12-production-agent.md",
  v12: "/docs/lessons/13-agent-loop-vs-runtime.md",
  v13: "/docs/lessons/14-event-driven-architecture.md",
  v14: "/docs/lessons/15-session-vs-messages.md",
  v15: "/docs/lessons/16-branching-and-time-travel.md",
  v16: "/docs/lessons/17-context-compaction.md",
  v17: "/docs/lessons/18-why-mature-agent-never-modify-core.md",
  v18: "/docs/lessons/19-when-while-loop-breaks-down.md",
  v19: "/docs/lessons/20-what-is-graph.md",
  v20: "/docs/lessons/21-messages-vs-state.md",
  "context-c0": "/docs/lessons/context/00-setup-and-baseline.md",
  "context-c1": "/docs/lessons/context/01-why-need-context.md",
  "context-c2": "/docs/lessons/context/02-sufficient-vs-maximum-context.md",
  "context-c3": "/docs/lessons/context/03-lexical-search-and-grep.md",
  "context-c4": "/docs/lessons/context/04-semantic-search-and-embedding.md",
  "context-c5": "/docs/lessons/context/05-can-semantic-search-replace-lexical.md",
  "context-c6": "/docs/lessons/context/06-hybrid-retrieval-and-rrf.md",
  "context-c7": "/docs/lessons/context/07-reranking-and-cross-encoder.md",
  "context-c8": "/docs/lessons/context/08-chunking-granularity-and-boundaries.md",
  c0: "/docs/lessons/context/00-setup-and-baseline.md",
  c1: "/docs/lessons/context/01-why-need-context.md",
  c2: "/docs/lessons/context/02-sufficient-vs-maximum-context.md",
  c3: "/docs/lessons/context/03-lexical-search-and-grep.md",
  c4: "/docs/lessons/context/04-semantic-search-and-embedding.md",
  c5: "/docs/lessons/context/05-can-semantic-search-replace-lexical.md",
  c6: "/docs/lessons/context/06-hybrid-retrieval-and-rrf.md",
  c7: "/docs/lessons/context/07-reranking-and-cross-encoder.md",
  c8: "/docs/lessons/context/08-chunking-granularity-and-boundaries.md",
};

export function getLessonDocPath(idOrPath: string): string | null {
  if (!idOrPath) return null;
  const cleanId = idOrPath.toLowerCase().replace(/^\/lessons\//, "");
  if (WORKBENCH_DOC_MAP[cleanId]) {
    return WORKBENCH_DOC_MAP[cleanId];
  }
  const prefixMatch = cleanId.match(/^(v\d+|context-c\d+|c\d+)/);
  if (prefixMatch && WORKBENCH_DOC_MAP[prefixMatch[1]]) {
    return WORKBENCH_DOC_MAP[prefixMatch[1]];
  }
  return null;
}

const LESSON_WORKBENCH_MAP: Record<string, string> = {
  "01": "/lessons/v0-llm-chat",
  "02": "/lessons/v1-tool-calling",
  "03": "/lessons/v2-agent-loop",
  "04": "/lessons/v3-coding-agent",
  "05": "/lessons/v4-planning",
  "06": "/lessons/v5-context-engine",
  "07": "/lessons/v6-memory",
  "08": "/lessons/v7-harness",
  "09": "/lessons/v8-mcp",
  "10": "/lessons/v9-durable-exec",
  "11": "/lessons/v10-eval-tracing",
  "12": "/lessons/v11-production-agent",
  "13": "/lessons/v12-agent-runtime",
  "14": "/lessons/v13-event-driven",
  "15": "/lessons/v14-session-management",
  "16": "/lessons/v15-branching-and-time-travel",
  "17": "/lessons/v16-context-compaction",
  "18": "/lessons/v17-extensions-and-skills",
  "19": "/lessons/v18-while-loop-collapse",
  "20": "/lessons/v19-state-graph",
  "21": "/lessons/v20-messages-vs-state",
  "context-00": "/lessons/context-c0-setup",
  "context-01": "/lessons/context-c1-why-context",
  "context-02": "/lessons/context-c2-sufficient-context",
  "context-03": "/lessons/context-c3-lexical-search",
  "context-04": "/lessons/context-c4-semantic-search",
  "context-05": "/lessons/context-c5-semantic-vs-lexical",
  "context-06": "/lessons/context-c6-hybrid-retrieval",
  "context-07": "/lessons/context-c7-reranking",
  "context-08": "/lessons/context-c8-chunking",
};

const GUIDES_META: Record<string, { shortTitle: string; badge: string; order: number }> = {
  "README.md": { shortTitle: "项目导读与架构体系", badge: "导读", order: 1 },
  "base-learn.md": { shortTitle: "课程主线与演进全景", badge: "主线", order: 2 },
  "framework-learn.md": { shortTitle: "第二学期：Runtime 机制全景", badge: "进阶", order: 3 },
  "context-learn.md": { shortTitle: "Context 专项：从零推导整个领域", badge: "专项", order: 4 },
  "generic-llm-configuration.md": { shortTitle: "通用 LLM 接入配置指南", badge: "配置", order: 5 },
};

function extractFirstH1(content: string): string | null {
  const lines = content.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("# ")) {
      return line.slice(2).replace(/\*\*/g, "").replace(/`/g, "").trim();
    }
  }
  return null;
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/^第\s*[\d一二三四五六七八九十百]+\s*课\s*[：:]?\s*/i, "")
    .replace(/^[vVcC]\d+\s*(?:——|—|--|-|：|:)?\s*/i, "")
    .trim();
}

/**
 * Scan docs directory and generate categorized documentation navigation tree
 */
export function getDocsCatalog(): DocCategory[] {
  const docsDir = path.join(process.cwd(), "docs");
  if (!fs.existsSync(docsDir)) {
    return [];
  }

  const guideItems: DocItem[] = [];
  const lessonItems: DocItem[] = [];
  const contextItems: DocItem[] = [];

  // 1. Root guides
  const rootFiles = fs.readdirSync(docsDir, { withFileTypes: true });
  for (const dirent of rootFiles) {
    if (dirent.isFile() && dirent.name.endsWith(".md")) {
      const fileName = dirent.name;
      const filePath = path.join(docsDir, fileName);
      const content = fs.readFileSync(filePath, "utf-8");
      const h1 = extractFirstH1(content);
      const meta = GUIDES_META[fileName] || {
        shortTitle: fileName.replace(/\.md$/, ""),
        badge: "文档",
        order: 99,
      };

      guideItems.push({
        slug: fileName,
        title: h1 || meta.shortTitle,
        shortTitle: meta.shortTitle,
        category: "guides",
        badge: meta.badge,
        order: meta.order,
      });
    }
  }

  guideItems.sort((a, b) => a.order - b.order);

  // 2. Lessons directory
  const lessonsDir = path.join(docsDir, "lessons");
  if (fs.existsSync(lessonsDir)) {
    const lessonFiles = fs.readdirSync(lessonsDir, { withFileTypes: true });
    for (const dirent of lessonFiles) {
      if (dirent.isFile() && dirent.name.endsWith(".md")) {
        const fileName = dirent.name;
        const filePath = path.join(lessonsDir, fileName);
        const content = fs.readFileSync(filePath, "utf-8");
        const h1 = extractFirstH1(content);

        const match = fileName.match(/^(\d+)-(.*)\.md$/);
        const num = match ? parseInt(match[1], 10) : 99;
        const vNum = match ? num - 1 : 0;
        const numStr = match ? match[1] : String(num).padStart(2, "0");
        const badge = `V${vNum}`;
        const defaultTitle = h1 || fileName.replace(/\.md$/, "");
        const strippedTitle = cleanTitle(defaultTitle);

        lessonItems.push({
          slug: `lessons/${fileName}`,
          title: defaultTitle,
          shortTitle: `${numStr} · ${strippedTitle || fileName}`,
          category: "lessons",
          badge,
          order: num,
          workbenchUrl: LESSON_WORKBENCH_MAP[numStr],
        });
      }
    }
  }

  lessonItems.sort((a, b) => a.order - b.order);

  // 3. Context lessons directory
  const contextDir = path.join(docsDir, "lessons", "context");
  if (fs.existsSync(contextDir)) {
    const contextFiles = fs.readdirSync(contextDir, { withFileTypes: true });
    for (const dirent of contextFiles) {
      if (dirent.isFile() && dirent.name.endsWith(".md")) {
        const fileName = dirent.name;
        const filePath = path.join(contextDir, fileName);
        const content = fs.readFileSync(filePath, "utf-8");
        const h1 = extractFirstH1(content);

        const match = fileName.match(/^(\d+)-(.*)\.md$/);
        const num = match ? parseInt(match[1], 10) : 99;
        const numStr = match ? match[1] : "00";
        const badge = `C${num}`;
        const defaultTitle = h1 || fileName.replace(/\.md$/, "");
        const strippedTitle = cleanTitle(defaultTitle);

        contextItems.push({
          slug: `lessons/context/${fileName}`,
          title: defaultTitle,
          shortTitle: `C${num} · ${strippedTitle || fileName}`,
          category: "context",
          badge,
          order: num,
          workbenchUrl: LESSON_WORKBENCH_MAP[`context-${numStr}`],
        });
      }
    }
  }

  contextItems.sort((a, b) => a.order - b.order);

  return [
    {
      id: "guides",
      title: "课程导读与架构指南",
      description: "设计哲学、演进全景与通用大模型配置",
      items: guideItems,
    },
    {
      id: "lessons",
      title: "Agent 架构演进讲义 (Lessons 01-21)",
      description: "从无状态 LLM 到生产级 Runtime 完整演进",
      items: lessonItems,
    },
    {
      id: "context",
      title: "Context 专项工程实战",
      description: "上下文第一性原理与私有语料基准测试台",
      items: contextItems,
    },
  ];
}

/**
 * Flatten all doc items in sequential reading order
 */
export function getAllDocsFlat(catalog: DocCategory[]): DocItem[] {
  const flat: DocItem[] = [];
  for (const cat of catalog) {
    flat.push(...cat.items);
  }
  return flat;
}

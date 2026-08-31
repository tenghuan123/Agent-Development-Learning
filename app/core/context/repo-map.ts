import * as fs from "node:fs";
import * as path from "node:path";
import { SmartTruncator } from "./truncator";
import type { RepoMapNode, RepoMapSummary } from "./types";

export interface RepoMapOptions {
  maxDepth?: number;
  maxFiles?: number;
  tokenBudget?: number;
  includeSignatures?: boolean;
  ignoredDirs?: string[];
  ignoredExtensions?: string[];
}

export class RepoMapGenerator {
  private static DEFAULT_IGNORED_DIRS = [
    "node_modules",
    ".git",
    "build",
    ".cache",
    ".react-router",
    "dist",
    "coverage",
    ".vscode",
    ".idea",
    ".gemini",
  ];

  private static DEFAULT_IGNORED_EXTS = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".ico",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".map",
    ".lock",
    ".pyc",
  ];

  /**
   * Extract key exported symbols & function signatures from code files
   */
  static extractSignatures(filePath: string, content: string): string[] {
    const ext = path.extname(filePath).toLowerCase();
    const signatures: string[] = [];

    if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        // Exported functions, classes, interfaces, types, consts
        if (
          trimmed.startsWith("export function ") ||
          trimmed.startsWith("export async function ") ||
          trimmed.startsWith("export class ") ||
          trimmed.startsWith("export interface ") ||
          trimmed.startsWith("export type ") ||
          trimmed.startsWith("export const ") ||
          trimmed.startsWith("export default function")
        ) {
          // Clean up to keep only signature definition
          const clean = trimmed
            .replace(/\s*\{.*$/, "")
            .replace(/\s*=\s*.*$/, "")
            .replace(/;$/, "")
            .trim();
          if (clean.length > 0 && clean.length < 90) {
            signatures.push(clean);
          }
        }
      }
    } else if (ext === ".json" && path.basename(filePath) === "package.json") {
      try {
        const parsed = JSON.parse(content);
        if (parsed.scripts) {
          signatures.push(`scripts: [${Object.keys(parsed.scripts).slice(0, 5).join(", ")}]`);
        }
        if (parsed.dependencies) {
          signatures.push(`deps: ${Object.keys(parsed.dependencies).length} packages`);
        }
      } catch {
        // ignore parse error
      }
    }

    return signatures.slice(0, 6); // Max 6 signatures per file to keep map tight
  }

  /**
   * Build hierarchical node tree of the repository
   */
  static buildTree(
    dirPath: string,
    workspaceRoot: string,
    options: RepoMapOptions,
    currentDepth = 1,
    counters = { files: 0, dirs: 0, signatures: 0 }
  ): RepoMapNode[] {
    const maxDepth = options.maxDepth ?? 5;
    const maxFiles = options.maxFiles ?? 80;
    const ignoredDirs = new Set(options.ignoredDirs ?? this.DEFAULT_IGNORED_DIRS);
    const ignoredExts = new Set(options.ignoredExtensions ?? this.DEFAULT_IGNORED_EXTS);

    if (currentDepth > maxDepth || counters.files >= maxFiles) {
      return [];
    }

    let entries: string[];
    try {
      entries = fs.readdirSync(dirPath).sort((a, b) => {
        // Directories first, then files alphabetically
        const aPath = path.join(dirPath, a);
        const bPath = path.join(dirPath, b);
        const aIsDir = fs.statSync(aPath).isDirectory();
        const bIsDir = fs.statSync(bPath).isDirectory();
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.localeCompare(b);
      });
    } catch {
      return [];
    }

    const nodes: RepoMapNode[] = [];

    for (const entry of entries) {
      if (counters.files >= maxFiles) break;
      if (entry.startsWith(".") && entry !== ".env.example") continue;

      const fullPath = path.join(dirPath, entry);
      const relativePath = path.relative(workspaceRoot, fullPath);

      let stats: fs.Stats;
      try {
        stats = fs.statSync(fullPath);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        if (ignoredDirs.has(entry)) continue;
        counters.dirs++;
        const children = this.buildTree(
          fullPath,
          workspaceRoot,
          options,
          currentDepth + 1,
          counters
        );
        nodes.push({
          name: entry,
          relativePath,
          type: "directory",
          children,
        });
      } else if (stats.isFile()) {
        const ext = path.extname(entry).toLowerCase();
        if (ignoredExts.has(ext)) continue;
        counters.files++;

        let signatures: string[] = [];
        let lineCount = 0;

        if (options.includeSignatures !== false && stats.size < 300 * 1024) {
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            lineCount = content.split("\n").length;
            signatures = this.extractSignatures(fullPath, content);
            counters.signatures += signatures.length;
          } catch {
            // ignore
          }
        }

        nodes.push({
          name: entry,
          relativePath,
          type: "file",
          sizeBytes: stats.size,
          lineCount,
          signatures: signatures.length > 0 ? signatures : undefined,
        });
      }
    }

    return nodes;
  }

  /**
   * Format the tree into an ASCII representation
   */
  private static formatTree(nodes: RepoMapNode[], prefix = ""): string[] {
    const lines: string[] = [];

    nodes.forEach((node, idx) => {
      const isLast = idx === nodes.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const childPrefix = isLast ? "    " : "│   ";

      if (node.type === "directory") {
        lines.push(`${prefix}${connector}📁 ${node.name}`);
        if (node.children && node.children.length > 0) {
          lines.push(...this.formatTree(node.children, prefix + childPrefix));
        }
      } else {
        const sigText =
          node.signatures && node.signatures.length > 0
            ? `  [${node.signatures.join("; ")}]`
            : "";
        lines.push(`${prefix}${connector}📄 ${node.name}${sigText}`);
      }
    });

    return lines;
  }

  /**
   * Generate a complete, token-budgeted repository outline map
   */
  static generateRepoMap(
    workspaceDir: string = process.cwd(),
    options?: RepoMapOptions
  ): RepoMapSummary {
    const tokenBudget = options?.tokenBudget ?? 2000;
    const counters = { files: 0, dirs: 0, signatures: 0 };

    const tree = this.buildTree(
      workspaceDir,
      workspaceDir,
      options ?? {},
      1,
      counters
    );

    const rootName = path.basename(workspaceDir) || "project-root";
    const treeLines = [`📦 ${rootName}`, ...this.formatTree(tree)];
    let fullMap = treeLines.join("\n");

    const estimatedTokens = SmartTruncator.estimateTokens(fullMap);

    // If over token budget, truncate gracefully
    if (estimatedTokens > tokenBudget) {
      const lines = fullMap.split("\n");
      const cutIndex = Math.floor(lines.length * (tokenBudget / estimatedTokens));
      fullMap =
        lines.slice(0, cutIndex).join("\n") +
        `\n... [🗺️ RepoMap: 已达 ${tokenBudget} Token 预算上限，其余文件已省略]`;
    }

    const header = [
      "=== 🗺️ REPOSITORY OUTLINE MAP (AST & Structure Navigation) ===",
      `Files: ${counters.files} | Directories: ${counters.dirs} | Signatures Extracted: ${counters.signatures}`,
      "-----------------------------------------------------------------",
    ].join("\n");

    const footer = [
      "-----------------------------------------------------------------",
      "💡 NAVIGATION TIP: Use 'read_file' with startLine/endLine to inspect details.",
      "=================================================================",
    ].join("\n");

    const formattedMap = `${header}\n${fullMap}\n${footer}`;

    return {
      formattedMap,
      totalFiles: counters.files,
      totalDirectories: counters.dirs,
      totalEstimatedTokens: SmartTruncator.estimateTokens(formattedMap),
      signaturesExtracted: counters.signatures,
    };
  }
}


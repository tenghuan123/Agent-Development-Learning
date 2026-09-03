import * as fs from "fs";
import * as path from "path";
import { McpServer } from "../server";
import type { McpToolDefinition, McpResourceDefinition } from "../types";

/**
 * 第 9 课核心交付物：解耦自 Agent 单体的独立 Mini Code MCP Server
 * 暴露标准化的代码浏览工具与项目只读资源，证明 Agent 与外部能力的完全解耦
 */
export function createMiniCodeServer(
  workspaceDir: string = process.cwd()
): McpServer {
  const server = new McpServer({
    name: "mini-code-server",
    version: "1.0.0",
    instructions:
      "Mini Code MCP Server provides secure, sandboxed codebase inspection tools and git metadata resources.",
  });

  // =========================================================================
  // 1. Tool: code_read_file
  // =========================================================================
  const readFileTool: McpToolDefinition = {
    name: "code_read_file",
    description: "Safely read the entire text content of a file within the project workspace.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative or absolute file path to read.",
        },
      },
      required: ["path"],
    },
  };

  server.registerTool(readFileTool, async (args) => {
    const filePath = args.path;
    if (!filePath) {
      throw new Error("Argument 'path' is required");
    }

    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(workspaceDir, filePath);

    // 基础路径越界防御
    const normalizedWorkspace = path.resolve(workspaceDir);
    if (!resolved.startsWith(normalizedWorkspace)) {
      return {
        content: [
          {
            type: "text",
            text: `[Permission Denied] Path ${filePath} is outside workspace boundary ${workspaceDir}`,
          },
        ],
        isError: true,
      };
    }

    if (!fs.existsSync(resolved)) {
      return {
        content: [
          {
            type: "text",
            text: `[File Not Found] File does not exist at ${filePath}`,
          },
        ],
        isError: true,
      };
    }

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      return {
        content: [
          {
            type: "text",
            text: `[Path is Directory] ${filePath} is a directory, not a file.`,
          },
        ],
        isError: true,
      };
    }

    const content = fs.readFileSync(resolved, "utf8");
    return {
      content: [
        {
          type: "text",
          text: content,
        },
      ],
    };
  });

  // =========================================================================
  // 2. Tool: code_search_symbols
  // =========================================================================
  const searchSymbolsTool: McpToolDefinition = {
    name: "code_search_symbols",
    description:
      "Search for function, class, or keyword occurrences in the project codebase.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search keyword, symbol name, or pattern.",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of matching lines to return (default 20).",
        },
      },
      required: ["query"],
    },
  };

  server.registerTool(searchSymbolsTool, async (args) => {
    const query = (args.query || "").trim();
    const maxResults = Number(args.maxResults) || 20;

    if (!query) {
      throw new Error("Search query cannot be empty");
    }

    const matches: string[] = [];

    function searchDir(currentDir: string) {
      if (matches.length >= maxResults) return;
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        if (matches.length >= maxResults) break;
        if (
          entry.name === "node_modules" ||
          entry.name === ".git" ||
          entry.name === "build" ||
          entry.name === ".react-router"
        ) {
          continue;
        }

        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          searchDir(fullPath);
        } else if (
          entry.isFile() &&
          /\.(ts|tsx|js|jsx|json|md)$/.test(entry.name)
        ) {
          try {
            const lines = fs.readFileSync(fullPath, "utf8").split("\n");
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(query)) {
                const rel = path.relative(workspaceDir, fullPath);
                matches.push(`${rel}:${i + 1} | ${lines[i].trim()}`);
                if (matches.length >= maxResults) break;
              }
            }
          } catch {
            // Ignore unreadable files
          }
        }
      }
    }

    try {
      searchDir(workspaceDir);
      return {
        content: [
          {
            type: "text",
            text:
              matches.length > 0
                ? `Found ${matches.length} matches for '${query}':\n\n` +
                  matches.join("\n")
                : `No matches found for query '${query}' in workspace.`,
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Search failed: ${err.message}` }],
        isError: true,
      };
    }
  });

  // =========================================================================
  // 3. Tool: code_git_status
  // =========================================================================
  const gitStatusTool: McpToolDefinition = {
    name: "code_git_status",
    description: "Get repository working tree status and branch summary.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  };

  server.registerTool(gitStatusTool, async () => {
    try {
      const { execSync } = await import("child_process");
      const statusOutput = execSync("git status -s", {
        cwd: workspaceDir,
        encoding: "utf8",
        timeout: 5000,
      });

      const branchOutput = execSync("git branch --show-current", {
        cwd: workspaceDir,
        encoding: "utf8",
        timeout: 5000,
      }).trim();

      const summary = [
        `Branch: ${branchOutput || "HEAD detached"}`,
        `Working Tree Changes:`,
        statusOutput ? statusOutput.trim() : "(Clean working tree)",
      ].join("\n");

      return {
        content: [{ type: "text", text: summary }],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text",
            text: `[Git Status Simulated] Workspace: ${path.basename(workspaceDir)}\nNote: git command error: ${err.message}`,
          },
        ],
      };
    }
  });

  // =========================================================================
  // 4. Resources: repo://project-info & repo://active-branch
  // =========================================================================
  const projectInfoResource: McpResourceDefinition = {
    uri: "repo://project-info",
    name: "Project Metadata & Dependencies",
    description: "Parsed package.json info with tech stack overview.",
    mimeType: "application/json",
  };

  server.registerResource(projectInfoResource, async () => {
    const pkgPath = path.join(workspaceDir, "package.json");
    let pkgData = { name: "mini-claude-code", version: "1.0.0" };
    if (fs.existsSync(pkgPath)) {
      try {
        pkgData = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      } catch {
        // Fallback
      }
    }

    return [
      {
        uri: "repo://project-info",
        mimeType: "application/json",
        text: JSON.stringify(
          {
            name: (pkgData as any).name,
            version: (pkgData as any).version,
            scripts: (pkgData as any).scripts,
            dependencies: Object.keys((pkgData as any).dependencies || {}),
          },
          null,
          2
        ),
      },
    ];
  });

  const activeBranchResource: McpResourceDefinition = {
    uri: "repo://active-branch",
    name: "Active Git Branch Info",
    description: "Current Git branch name and commit hash.",
    mimeType: "text/plain",
  };

  server.registerResource(activeBranchResource, async () => {
    try {
      const { execSync } = await import("child_process");
      const branch = execSync("git branch --show-current", {
        cwd: workspaceDir,
        encoding: "utf8",
        timeout: 3000,
      }).trim();
      const hash = execSync("git rev-parse --short HEAD", {
        cwd: workspaceDir,
        encoding: "utf8",
        timeout: 3000,
      }).trim();

      return [
        {
          uri: "repo://active-branch",
          mimeType: "text/plain",
          text: `Branch: ${branch || "main"} | HEAD: ${hash || "initial"}`,
        },
      ];
    } catch {
      return [
        {
          uri: "repo://active-branch",
          mimeType: "text/plain",
          text: "Branch: main | HEAD: dev",
        },
      ];
    }
  });

  return server;
}


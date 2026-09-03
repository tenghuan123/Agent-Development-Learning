import { McpServer } from "../server";
import type { McpToolDefinition, McpResourceDefinition } from "../types";

/**
 * 模拟外部数据库 MCP Server
 * 展示 Agent 如何通过 MCP 标准接入隔离的内网数据服务
 */
export function createMockDatabaseServer(): McpServer {
  const server = new McpServer({
    name: "database-server",
    version: "2.1.0",
    instructions:
      "Database MCP Server provides SQL querying and schema inspection for application databases.",
  });

  // 模拟内存数据库表格
  const MOCK_DB: Record<string, any[]> = {
    users: [
      { id: 101, username: "alice_dev", email: "alice@example.com", role: "admin", status: "active" },
      { id: 102, username: "bob_coder", email: "bob@example.com", role: "developer", status: "active" },
      { id: 103, username: "carol_sec", email: "carol@example.com", role: "auditor", status: "suspended" },
    ],
    api_tokens: [
      { id: 1, user_id: 101, name: "prod-deploy", last_used: "2026-09-02", expires_at: "2026-12-31" },
      { id: 2, user_id: 102, name: "dev-cli", last_used: "2026-09-03", expires_at: "2026-10-01" },
    ],
    system_metrics: [
      { metric: "p99_latency_ms", value: 42.5, recorded_at: "10:00:00" },
      { metric: "cache_hit_rate", value: 0.94, recorded_at: "10:00:00" },
      { metric: "active_connections", value: 18, recorded_at: "10:00:00" },
    ],
  };

  // 1. Tool: db_list_tables
  const listTablesTool: McpToolDefinition = {
    name: "db_list_tables",
    description: "List all accessible tables in the current database catalog with row counts.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  };

  server.registerTool(listTablesTool, async () => {
    const tableList = Object.keys(MOCK_DB).map((tbl) => ({
      table_name: tbl,
      row_count: MOCK_DB[tbl].length,
      columns: Object.keys(MOCK_DB[tbl][0] || {}),
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(tableList, null, 2),
        },
      ],
    };
  });

  // 2. Tool: db_query
  const queryTool: McpToolDefinition = {
    name: "db_query",
    description: "Execute a read-only SQL SELECT query against the connected database.",
    inputSchema: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "SQL query statement (e.g. 'SELECT * FROM users').",
        },
      },
      required: ["sql"],
    },
  };

  server.registerTool(queryTool, async (args) => {
    const sql = (args.sql || "").trim();
    if (!sql) {
      throw new Error("SQL statement cannot be empty");
    }

    if (!sql.toLowerCase().startsWith("select")) {
      return {
        content: [
          {
            type: "text",
            text: "[Permission Denied] Database MCP Server only permits read-only SELECT statements.",
          },
        ],
        isError: true,
      };
    }

    // 简单解析表名进行 mock 查询
    for (const [tbl, rows] of Object.entries(MOCK_DB)) {
      if (new RegExp(`\\b${tbl}\\b`, "i").test(sql)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(rows, null, 2),
            },
          ],
        };
      }
    }

    return {
      content: [
        {
          type: "text",
          text: `Query executed successfully. Result: 0 rows returned. (Available tables: ${Object.keys(MOCK_DB).join(", ")})`,
        },
      ],
    };
  });

  // Resource: db://schema
  const schemaResource: McpResourceDefinition = {
    uri: "db://schema",
    name: "Database Schema Catalog",
    description: "DDL definitions and schema structure for all database tables.",
    mimeType: "text/plain",
  };

  server.registerResource(schemaResource, async () => {
    const schemaText = `
-- Database Catalog: production_app
CREATE TABLE users (
  id INT PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  email VARCHAR(128) UNIQUE NOT NULL,
  role VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL
);

CREATE TABLE api_tokens (
  id INT PRIMARY KEY,
  user_id INT REFERENCES users(id),
  name VARCHAR(64),
  last_used TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE TABLE system_metrics (
  metric VARCHAR(64),
  value FLOAT,
  recorded_at TIME
);
`.trim();

    return [
      {
        uri: "db://schema",
        mimeType: "text/plain",
        text: schemaText,
      },
    ];
  });

  return server;
}

/**
 * 模拟外部浏览器/网络搜索 MCP Server
 * 展示 Agent 如何连接网络环境与第三方知识爬虫
 */
export function createMockBrowserServer(): McpServer {
  const server = new McpServer({
    name: "browser-server",
    version: "1.4.0",
    instructions:
      "Browser MCP Server provides live HTTP retrieval, web page markdown parsing, and web search.",
  });

  // 1. Tool: browser_fetch_page
  const fetchPageTool: McpToolDefinition = {
    name: "browser_fetch_page",
    description: "Fetch web page content and convert HTML to structured markdown.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "HTTP or HTTPS URL to scrape.",
        },
      },
      required: ["url"],
    },
  };

  server.registerTool(fetchPageTool, async (args) => {
    const url = (args.url || "").trim();
    if (!url) throw new Error("URL is required");

    if (url.includes("modelcontextprotocol") || url.includes("mcp")) {
      return {
        content: [
          {
            type: "text",
            text: `# Model Context Protocol (MCP) Official Documentation
The Model Context Protocol (MCP) is an open standard that enables AI models to securely interact with external tools and data sources.
Key Architectural Pillars:
- **Clients**: Host applications (e.g. Claude Code, Mini Claude Code, Cursor) that initiate RPC sessions.
- **Servers**: Lightweight services that expose Tools, Resources, and Prompts over JSON-RPC 2.0.
- **Transports**: Stdio (process pipes) or SSE (HTTP server-sent events).
Status: Active Standard (v2024-11-05).`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `# Web Document: ${url}
Title: Example Public Documentation
Content: Fast, modern agent architecture leveraging Model Context Protocol. All external plugins operate over standard JSON-RPC 2.0 without contaminating core agent logic.`,
        },
      ],
    };
  });

  // 2. Tool: browser_search_web
  const searchWebTool: McpToolDefinition = {
    name: "browser_search_web",
    description: "Search the web for up-to-date documentation, CVE vulnerabilities, or libraries.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search keyword query.",
        },
      },
      required: ["query"],
    },
  };

  server.registerTool(searchWebTool, async (args) => {
    const query = (args.query || "").trim();
    const results = [
      {
        title: `Model Context Protocol Overview - ${query}`,
        snippet: `Comprehensive architectural guide on building MCP clients and servers for AI agents with JSON-RPC.`,
        url: `https://modelcontextprotocol.io/introduction?q=${encodeURIComponent(query)}`,
      },
      {
        title: `GitHub: modelcontextprotocol/specification`,
        snippet: `The official JSON Schema definitions and TypeScript SDK reference for MCP.`,
        url: `https://github.com/modelcontextprotocol/specification`,
      },
    ];

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  });

  return server;
}


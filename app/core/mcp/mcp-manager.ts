import type { ToolRegistry } from "../tools/registry";
import { McpClient } from "./client";
import { createInMemoryTransportPair, type McpTransport, StdioTransport } from "./transport";
import type { McpServer } from "./server";
import { createMiniCodeServer } from "./servers/mini-code-server";
import {
  createMockBrowserServer,
  createMockDatabaseServer,
} from "./servers/mock-external-servers";
import type {
  JsonRpcFrame,
  McpCallToolResult,
  McpReadResourceResult,
  McpResourceDefinition,
  McpServerMetadata,
  McpToolDefinition,
} from "./types";

export interface ManagedServerEntry {
  id: string;
  name: string;
  description: string;
  transportType: "in_memory" | "stdio";
  stdioConfig?: {
    command: string;
    args: string[];
    cwd?: string;
    env?: Record<string, string>;
  };
  serverFactory?: () => McpServer;
  serverInstance?: McpServer;
  client: McpClient | null;
  status: "connected" | "disconnected" | "connecting" | "error";
  error?: string;
  latencyMs?: number;
  discoveredTools: McpToolDefinition[];
  discoveredResources: McpResourceDefinition[];
}

/**
 * MCP 集群与会话管理器
 * 统一管理多个 MCP 服务的生命周期、热插拔与工具聚合转换
 */
export class McpManager {
  private servers: Map<string, ManagedServerEntry> = new Map();
  private frameListeners: Array<(frame: JsonRpcFrame) => void> = [];
  private workspaceDir: string;

  constructor(workspaceDir: string = process.cwd()) {
    this.workspaceDir = workspaceDir;
    this.registerDefaultPresets();
  }

  /**
   * 初始化课程内置的 3 大典型 MCP 服务器预设
   */
  private registerDefaultPresets() {
    // 1. Mini Code Server (课程核心自研)
    this.registerServer({
      id: "mini-code-server",
      name: "Mini Code MCP Server",
      description: "自研代码库标准外设：提供安全只读代码浏览、关键字定位与 Git 状态感知。",
      transportType: "in_memory",
      serverFactory: () => createMiniCodeServer(this.workspaceDir),
    });

    // 2. Mock Database Server (数据库外设)
    this.registerServer({
      id: "database-server",
      name: "Database Connector MCP",
      description: "模拟内网数据库外设：提供安全只读 SQL 查询与元数据 Schema 目录。",
      transportType: "in_memory",
      serverFactory: () => createMockDatabaseServer(),
    });

    // 3. Mock Browser Server (网络与搜索外设)
    this.registerServer({
      id: "browser-server",
      name: "Web Browser & Search MCP",
      description: "模拟网络抓取与在线知识外设：提供网页 Markdown 提取与网络文档检索。",
      transportType: "in_memory",
      serverFactory: () => createMockBrowserServer(),
    });
  }

  /**
   * 注册一个新的 MCP Server 配置
   */
  registerServer(config: {
    id: string;
    name: string;
    description: string;
    transportType: "in_memory" | "stdio";
    serverFactory?: () => McpServer;
    stdioConfig?: {
      command: string;
      args: string[];
      cwd?: string;
      env?: Record<string, string>;
    };
  }): this {
    this.servers.set(config.id, {
      id: config.id,
      name: config.name,
      description: config.description,
      transportType: config.transportType,
      serverFactory: config.serverFactory,
      stdioConfig: config.stdioConfig,
      client: null,
      status: "disconnected",
      discoveredTools: [],
      discoveredResources: [],
    });
    return this;
  }

  /**
   * 连接指定 MCP Server 并完成 Capabilities 协商
   */
  async connectServer(serverId: string): Promise<McpServerMetadata> {
    const entry = this.servers.get(serverId);
    if (!entry) {
      throw new Error(`MCP Server '${serverId}' not found`);
    }

    if (entry.status === "connected" && entry.client?.isConnected()) {
      return this.getServerMetadata(serverId);
    }

    entry.status = "connecting";
    entry.error = undefined;

    try {
      const client = new McpClient({
        id: entry.id,
        name: entry.name,
      });

      // 转发抓包帧
      client.onFrame((frame) => {
        for (const listener of this.frameListeners) {
          listener(frame);
        }
      });

      let clientTransport: McpTransport;

      if (entry.transportType === "in_memory") {
        if (!entry.serverFactory) {
          throw new Error(`Server factory missing for in-memory server ${serverId}`);
        }
        const server = entry.serverFactory();
        entry.serverInstance = server;

        const [cTransport, sTransport] = createInMemoryTransportPair();
        await server.connect(sTransport);
        clientTransport = cTransport;
      } else {
        // Stdio Transport
        if (!entry.stdioConfig) {
          throw new Error(`Stdio config missing for server ${serverId}`);
        }
        clientTransport = new StdioTransport(
          entry.stdioConfig.command,
          entry.stdioConfig.args,
          {
            cwd: entry.stdioConfig.cwd || this.workspaceDir,
            env: entry.stdioConfig.env,
          }
        );
      }

      // 建立连接并握手
      await client.connect(clientTransport);
      entry.client = client;

      // 动态发现 Tools 与 Resources
      entry.discoveredTools = await client.listTools();
      entry.discoveredResources = await client.listResources();

      // 测量 Ping 延迟
      try {
        entry.latencyMs = await client.ping();
      } catch {
        entry.latencyMs = 1;
      }

      entry.status = "connected";
      return this.getServerMetadata(serverId);
    } catch (err: any) {
      entry.status = "error";
      entry.error = err.message || String(err);
      throw err;
    }
  }

  /**
   * 断开指定 MCP Server
   */
  async disconnectServer(serverId: string): Promise<McpServerMetadata> {
    const entry = this.servers.get(serverId);
    if (!entry) {
      throw new Error(`MCP Server '${serverId}' not found`);
    }

    if (entry.client) {
      await entry.client.close();
      entry.client = null;
    }

    if (entry.serverInstance) {
      await entry.serverInstance.close();
      entry.serverInstance = undefined;
    }

    entry.status = "disconnected";
    entry.discoveredTools = [];
    entry.discoveredResources = [];
    entry.latencyMs = undefined;
    entry.error = undefined;

    return this.getServerMetadata(serverId);
  }

  /**
   * 将所有已连接的 MCP Tools 自动适配并挂载到指定的 Agent ToolRegistry
   */
  exportToToolRegistry(registry: ToolRegistry): { registeredCount: number; toolNames: string[] } {
    let registeredCount = 0;
    const toolNames: string[] = [];

    for (const entry of this.servers.values()) {
      if (entry.status !== "connected" || !entry.client) continue;

      for (const mcpTool of entry.discoveredTools) {
        const agentTool = entry.client.toToolDefinition(mcpTool);
        registry.register(agentTool);
        registeredCount++;
        toolNames.push(mcpTool.name);
      }
    }

    return { registeredCount, toolNames };
  }

  /**
   * 直接调用指定 MCP 工具（独立测试）
   */
  async callTool(
    serverId: string,
    toolName: string,
    args?: Record<string, any>
  ): Promise<McpCallToolResult> {
    const entry = this.servers.get(serverId);
    if (!entry || entry.status !== "connected" || !entry.client) {
      throw new Error(`Server '${serverId}' is not connected`);
    }
    return await entry.client.callTool(toolName, args);
  }

  /**
   * 直接读取指定 MCP 资源（独立测试）
   */
  async readResource(
    serverId: string,
    uri: string
  ): Promise<McpReadResourceResult> {
    const entry = this.servers.get(serverId);
    if (!entry || entry.status !== "connected" || !entry.client) {
      throw new Error(`Server '${serverId}' is not connected`);
    }
    return await entry.client.readResource(uri);
  }

  /**
   * 获取所有注册 Server 的元数据状态清单
   */
  getAllMetadata(): McpServerMetadata[] {
    return Array.from(this.servers.keys()).map((id) =>
      this.getServerMetadata(id)
    );
  }

  getServerMetadata(serverId: string): McpServerMetadata {
    const entry = this.servers.get(serverId);
    if (!entry) {
      throw new Error(`MCP Server '${serverId}' not found`);
    }

    return {
      id: entry.id,
      name: entry.name,
      version: entry.client?.getServerInfo()?.version || "1.0.0",
      description: entry.description,
      transportType: entry.transportType,
      status: entry.status,
      error: entry.error,
      capabilities: entry.client?.getServerCapabilities() || undefined,
      toolsCount: entry.discoveredTools.length,
      resourcesCount: entry.discoveredResources.length,
      latencyMs: entry.latencyMs,
    };
  }

  /**
   * 获取所有已发现的 Tools 清单
   */
  getAllDiscoveredTools(): Array<{
    serverId: string;
    serverName: string;
    tool: McpToolDefinition;
  }> {
    const list: Array<{
      serverId: string;
      serverName: string;
      tool: McpToolDefinition;
    }> = [];

    for (const entry of this.servers.values()) {
      for (const tool of entry.discoveredTools) {
        list.push({
          serverId: entry.id,
          serverName: entry.name,
          tool,
        });
      }
    }

    return list;
  }

  /**
   * 获取所有已发现的 Resources 清单
   */
  getAllDiscoveredResources(): Array<{
    serverId: string;
    serverName: string;
    resource: McpResourceDefinition;
  }> {
    const list: Array<{
      serverId: string;
      serverName: string;
      resource: McpResourceDefinition;
    }> = [];

    for (const entry of this.servers.values()) {
      for (const resource of entry.discoveredResources) {
        list.push({
          serverId: entry.id,
          serverName: entry.name,
          resource,
        });
      }
    }

    return list;
  }

  /**
   * 汇总所有客户端的历史抓包帧
   */
  getAllFrames(): JsonRpcFrame[] {
    const allFrames: JsonRpcFrame[] = [];
    for (const entry of this.servers.values()) {
      if (entry.client) {
        allFrames.push(...entry.client.getFrames());
      }
    }
    // 按时间升序排序
    return allFrames.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  /**
   * 监听全局 JSON-RPC 抓包帧
   */
  onFrame(listener: (frame: JsonRpcFrame) => void): () => void {
    this.frameListeners.push(listener);
    return () => {
      this.frameListeners = this.frameListeners.filter((l) => l !== listener);
    };
  }

  /**
   * 关闭并清理所有服务器连接
   */
  async closeAll(): Promise<void> {
    for (const id of this.servers.keys()) {
      try {
        await this.disconnectServer(id);
      } catch {
        // Ignore
      }
    }
  }
}


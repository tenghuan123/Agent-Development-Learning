import { z } from "zod";
import type { ToolDefinition } from "../tools/types";
import type { McpTransport } from "./transport";
import type {
  InitializeParams,
  InitializeResult,
  JsonRpcFrame,
  JsonRpcId,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  McpCallToolParams,
  McpCallToolResult,
  McpImplementationInfo,
  McpListResourcesResult,
  McpListToolsResult,
  McpReadResourceParams,
  McpReadResourceResult,
  McpResourceDefinition,
  McpServerCapabilities,
  McpToolDefinition,
} from "./types";
import { LATEST_MCP_PROTOCOL_VERSION } from "./types";

export interface McpClientOptions {
  id: string;
  name?: string;
  clientInfo?: McpImplementationInfo;
  defaultTimeoutMs?: number;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timer: any;
  startMs: number;
  method: string;
}

/**
 * 标准 Model Context Protocol (MCP) Client 客户端实现
 * 负责通过标准 JSON-RPC 2.0 与 MCP Server 握手协商、调用工具、读取资源并捕获报文帧
 */
export class McpClient {
  public readonly id: string;
  public readonly name: string;
  public readonly clientInfo: McpImplementationInfo;
  public readonly defaultTimeoutMs: number;

  private transport: McpTransport | null = null;
  private serverInfo: McpImplementationInfo | null = null;
  private serverCapabilities: McpServerCapabilities | null = null;
  private instructions?: string;

  private pendingRequests: Map<JsonRpcId, PendingRequest> = new Map();
  private requestCounter = 1;
  private frames: JsonRpcFrame[] = [];
  private frameListeners: Array<(frame: JsonRpcFrame) => void> = [];
  private isInitialized = false;

  constructor(options: McpClientOptions) {
    this.id = options.id;
    this.name = options.name || `mcp-client-${options.id}`;
    this.clientInfo = options.clientInfo || {
      name: "mini-claude-mcp-client",
      version: "1.0.0",
    };
    this.defaultTimeoutMs = options.defaultTimeoutMs || 15000;
  }

  /**
   * 建立连接并完成 MCP Initialize 握手
   */
  async connect(transport: McpTransport, timeoutMs?: number): Promise<InitializeResult> {
    this.transport = transport;
    this.transport.onMessage((msg) => this.handleIncomingMessage(msg));
    this.transport.onError((err) => {
      console.error(`[McpClient: ${this.id}] Transport error:`, err);
    });
    this.transport.onClose(() => {
      this.handleClose();
    });

    if (!this.transport.isConnected()) {
      await this.transport.connect();
    }

    const handshakeTimeout = timeoutMs || this.defaultTimeoutMs;

    // 1. 发送 initialize 请求
    const initParams: InitializeParams = {
      protocolVersion: LATEST_MCP_PROTOCOL_VERSION,
      capabilities: {
        roots: { listChanged: false },
      },
      clientInfo: this.clientInfo,
    };

    const initResult = await this.request<InitializeResult>(
      "initialize",
      initParams,
      handshakeTimeout
    );

    this.serverInfo = initResult.serverInfo;
    this.serverCapabilities = initResult.capabilities;
    this.instructions = initResult.instructions;
    this.isInitialized = true;

    // 2. 发送 notifications/initialized 确认通知
    await this.notify("notifications/initialized");

    return initResult;
  }

  /**
   * 发送 JSON-RPC Request 并等待配对 Response
   */
  async request<TResult = any>(
    method: string,
    params?: any,
    timeoutMs?: number
  ): Promise<TResult> {
    if (!this.transport || !this.transport.isConnected()) {
      throw new Error(`[McpClient: ${this.id}] Transport is not connected`);
    }

    const rpcId = `${this.id}_req_${this.requestCounter++}_${Date.now()}`;
    const message: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: rpcId,
      method,
      params,
    };

    // 记录出站帧 (Outbound Frame)
    this.recordFrame({
      id: `frame_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      direction: "outbound",
      serverId: this.id,
      serverName: this.serverInfo?.name || this.name,
      rpcId,
      method,
      payload: message,
    });

    const timeout = timeoutMs || this.defaultTimeoutMs;

    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(rpcId);
        reject(
          new Error(
            `[McpClient: ${this.id}] Request '${method}' (id: ${rpcId}) timed out after ${timeout}ms`
          )
        );
      }, timeout);

      this.pendingRequests.set(rpcId, {
        resolve,
        reject,
        timer,
        startMs: Date.now(),
        method,
      });

      this.transport!.send(message).catch((sendErr) => {
        clearTimeout(timer);
        this.pendingRequests.delete(rpcId);
        reject(sendErr);
      });
    });
  }

  /**
   * 发送 JSON-RPC Notification（单向无须等待应答）
   */
  async notify(method: string, params?: any): Promise<void> {
    if (!this.transport || !this.transport.isConnected()) {
      throw new Error(`[McpClient: ${this.id}] Transport is not connected`);
    }

    const message: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params,
    };

    this.recordFrame({
      id: `frame_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      direction: "outbound",
      serverId: this.id,
      serverName: this.serverInfo?.name || this.name,
      method,
      payload: message,
    });

    await this.transport.send(message);
  }

  /**
   * 统一处理入站消息 (Inbound)
   */
  private handleIncomingMessage(message: JsonRpcMessage): void {
    // 1. 响应消息匹配 (Response with ID)
    if ("id" in message && message.id !== undefined) {
      const rpcId = message.id;
      const pending = this.pendingRequests.get(rpcId);

      const durationMs = pending ? Date.now() - pending.startMs : undefined;

      // 记录入站帧
      this.recordFrame({
        id: `frame_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        direction: "inbound",
        serverId: this.id,
        serverName: this.serverInfo?.name || this.name,
        rpcId,
        method: pending?.method,
        payload: message,
        durationMs,
      });

      if (!pending) {
        return;
      }

      clearTimeout(pending.timer);
      this.pendingRequests.delete(rpcId);

      const response = message as JsonRpcResponse;
      if (response.error) {
        pending.reject(
          new Error(
            `[McpError ${response.error.code}] ${response.error.message}`
          )
        );
      } else {
        pending.resolve(response.result);
      }
    }
  }

  private handleClose(): void {
    this.isInitialized = false;
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`[McpClient: ${this.id}] Connection closed`));
    }
    this.pendingRequests.clear();
  }

  /**
   * 列出 Server 提供的所有 Tools
   */
  async listTools(): Promise<McpToolDefinition[]> {
    const result = await this.request<McpListToolsResult>("tools/list");
    return result.tools || [];
  }

  /**
   * 调用 Server 的指定 Tool
   */
  async callTool(
    name: string,
    args?: Record<string, any>
  ): Promise<McpCallToolResult> {
    const params: McpCallToolParams = {
      name,
      arguments: args,
    };
    return await this.request<McpCallToolResult>("tools/call", params);
  }

  /**
   * 列出 Server 提供的所有 Resources
   */
  async listResources(): Promise<McpResourceDefinition[]> {
    const result = await this.request<McpListResourcesResult>("resources/list");
    return result.resources || [];
  }

  /**
   * 读取指定的 Resource 内容
   */
  async readResource(uri: string): Promise<McpReadResourceResult> {
    const params: McpReadResourceParams = { uri };
    return await this.request<McpReadResourceResult>("resources/read", params);
  }

  /**
   * Ping 心跳探测
   */
  async ping(): Promise<number> {
    const start = Date.now();
    await this.request("ping");
    return Date.now() - start;
  }

  /**
   * 🌟 核心适配器：将 MCP Tool 转换为 Agent 原生的 ToolDefinition
   * 使得上层 Agent Loop 毫不感知差异，像调用本地工具一样调用远程 MCP 服务！
   */
  toToolDefinition(mcpTool: McpToolDefinition): ToolDefinition {
    const serverName = this.serverInfo?.name || this.name;

    // 动态构建宽松兼容的 Zod Schema 保证 LLM 参数能够透传
    const dynamicSchema = z.record(z.any());

    return {
      name: mcpTool.name,
      description: `[MCP Server: ${serverName}] ${mcpTool.description || "External MCP Tool"}`,
      schema: dynamicSchema,
      execute: async (args: any) => {
        try {
          const res = await this.callTool(mcpTool.name, args);

          // 格式化 MCP content 为文本
          const textParts = res.content
            .map((c) => {
              if (c.type === "text") return c.text;
              if (c.type === "image") return `[Image: ${c.mimeType}]`;
              if (c.type === "resource") {
                return `[Resource ${c.resource.uri}]: ${c.resource.text || ""}`;
              }
              return JSON.stringify(c);
            })
            .join("\n");

          if (res.isError) {
            return `[MCP Tool Error] ${textParts}`;
          }

          return textParts || "(Tool returned empty content)";
        } catch (err: any) {
          return `[MCP Dispatch Failure] Failed to call ${mcpTool.name}: ${err.message || String(err)}`;
        }
      },
    };
  }

  /**
   * 抓包帧记录与通知
   */
  private recordFrame(frame: JsonRpcFrame) {
    this.frames.push(frame);
    if (this.frames.length > 200) {
      this.frames.shift(); // 维持最近 200 帧循环缓冲
    }
    for (const listener of this.frameListeners) {
      try {
        listener(frame);
      } catch {
        // Ignore listener error
      }
    }
  }

  onFrame(listener: (frame: JsonRpcFrame) => void): () => void {
    this.frameListeners.push(listener);
    return () => {
      this.frameListeners = this.frameListeners.filter((l) => l !== listener);
    };
  }

  getFrames(): JsonRpcFrame[] {
    return [...this.frames];
  }

  clearFrames(): void {
    this.frames = [];
  }

  getServerInfo(): McpImplementationInfo | null {
    return this.serverInfo;
  }

  getServerCapabilities(): McpServerCapabilities | null {
    return this.serverCapabilities;
  }

  getInstructions(): string | undefined {
    return this.instructions;
  }

  isConnected(): boolean {
    return Boolean(this.transport && this.transport.isConnected() && this.isInitialized);
  }

  async close(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    this.handleClose();
  }
}

import type {
  JsonRpcId,
  JsonRpcMessage,
  JsonRpcRequest,
  JsonRpcResponse,
  McpCallToolParams,
  McpCallToolResult,
  McpImplementationInfo,
  McpListResourcesResult,
  McpListToolsResult,
  McpReadResourceParams,
  McpReadResourceResult,
  McpResourceContent,
  McpResourceDefinition,
  McpServerCapabilities,
  McpToolDefinition,
} from "./types";
import { JSONRPC_ERROR_CODES, LATEST_MCP_PROTOCOL_VERSION } from "./types";
import type { McpTransport } from "./transport";

export type ToolHandler = (
  args: any
) => Promise<McpCallToolResult> | McpCallToolResult;

export type ResourceHandler = (
  uri: string
) => Promise<McpResourceContent[]> | McpResourceContent[];

export interface McpServerOptions {
  name: string;
  version: string;
  instructions?: string;
}

/**
 * 标准 Model Context Protocol (MCP) Server 服务端基类
 * 负责接收 JSON-RPC 请求，协商 Capabilities，并路由 tools/list、tools/call、resources/read 等标准原语
 */
export class McpServer {
  public readonly serverInfo: McpImplementationInfo;
  public readonly instructions?: string;

  private transport: McpTransport | null = null;
  private tools: Map<string, { definition: McpToolDefinition; handler: ToolHandler }> =
    new Map();
  private resources: Map<
    string,
    { definition: McpResourceDefinition; handler: ResourceHandler }
  > = new Map();

  constructor(options: McpServerOptions) {
    this.serverInfo = {
      name: options.name,
      version: options.version,
    };
    this.instructions = options.instructions;
  }

  /**
   * 注册 MCP Tool
   */
  registerTool(definition: McpToolDefinition, handler: ToolHandler): this {
    this.tools.set(definition.name, { definition, handler });
    return this;
  }

  /**
   * 注册 MCP Resource
   */
  registerResource(
    definition: McpResourceDefinition,
    handler: ResourceHandler
  ): this {
    this.resources.set(definition.uri, { definition, handler });
    return this;
  }

  /**
   * 获取当前 Server 支持的所有 Capabilities 声明
   */
  getCapabilities(): McpServerCapabilities {
    const caps: McpServerCapabilities = {};
    if (this.tools.size > 0) {
      caps.tools = { listChanged: false };
    }
    if (this.resources.size > 0) {
      caps.resources = { subscribe: false, listChanged: false };
    }
    return caps;
  }

  /**
   * 挂载传输信道并开始监听
   */
  async connect(transport: McpTransport): Promise<void> {
    this.transport = transport;
    this.transport.onMessage((msg) => this.handleMessage(msg));
    if (!this.transport.isConnected()) {
      await this.transport.connect();
    }
  }

  /**
   * 断开服务连接
   */
  async close(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }

  /**
   * 获取当前所有注册的工具定义清单
   */
  getToolDefinitions(): McpToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /**
   * 获取当前所有注册的资源定义清单
   */
  getResourceDefinitions(): McpResourceDefinition[] {
    return Array.from(this.resources.values()).map((r) => r.definition);
  }

  /**
   * 核心 JSON-RPC 消息分发路由器
   */
  private async handleMessage(message: JsonRpcMessage): Promise<void> {
    // 忽略响应消息（Server 当前不主动发 Request）
    if ("result" in message || "error" in message) {
      return;
    }

    // 检查是否为 Notification（无 id）
    const isNotification = !("id" in message) || message.id === undefined;
    const request = message as JsonRpcRequest;

    try {
      const result = await this.dispatchMethod(request.method, request.params);

      // 若为 Notification，则无需回传 Response
      if (isNotification || !this.transport) return;

      await this.sendResponse(request.id, result);
    } catch (err: any) {
      if (isNotification || !this.transport) return;

      const code = err.code || JSONRPC_ERROR_CODES.INTERNAL_ERROR;
      const messageText = err.message || "Internal server error";
      await this.sendError(request.id, code, messageText, err.data);
    }
  }

  /**
   * 分发具体 MCP 协议方法
   */
  private async dispatchMethod(method: string, params: any): Promise<any> {
    switch (method) {
      // 1. 握手握权
      case "initialize": {
        return {
          protocolVersion: LATEST_MCP_PROTOCOL_VERSION,
          capabilities: this.getCapabilities(),
          serverInfo: this.serverInfo,
          instructions: this.instructions,
        };
      }

      // 2. 客户端通知握手确认
      case "notifications/initialized": {
        return null;
      }

      // 3. 心跳 Ping
      case "ping": {
        return {};
      }

      // 4. 列出可用 Tools
      case "tools/list": {
        const result: McpListToolsResult = {
          tools: this.getToolDefinitions(),
        };
        return result;
      }

      // 5. 执行具体 Tool
      case "tools/call": {
        const { name, arguments: args = {} } = (params ||
          {}) as McpCallToolParams;
        if (!name) {
          throw {
            code: JSONRPC_ERROR_CODES.INVALID_PARAMS,
            message: "Missing 'name' in tools/call parameters",
          };
        }

        const tool = this.tools.get(name);
        if (!tool) {
          throw {
            code: JSONRPC_ERROR_CODES.METHOD_NOT_FOUND,
            message: `Tool '${name}' not found on server '${this.serverInfo.name}'`,
          };
        }

        try {
          const toolResult = await tool.handler(args);
          return toolResult;
        } catch (execErr: any) {
          // MCP 规范约定：工具业务报错推荐以 isError: true 回传而非 JSON-RPC 异常
          return {
            content: [
              {
                type: "text",
                text: `[MCP Tool Error] ${execErr.message || String(execErr)}`,
              },
            ],
            isError: true,
          } as McpCallToolResult;
        }
      }

      // 6. 列出可用 Resources
      case "resources/list": {
        const result: McpListResourcesResult = {
          resources: this.getResourceDefinitions(),
        };
        return result;
      }

      // 7. 读取 Resource
      case "resources/read": {
        const { uri } = (params || {}) as McpReadResourceParams;
        if (!uri) {
          throw {
            code: JSONRPC_ERROR_CODES.INVALID_PARAMS,
            message: "Missing 'uri' in resources/read parameters",
          };
        }

        const resource = this.resources.get(uri);
        if (!resource) {
          throw {
            code: JSONRPC_ERROR_CODES.METHOD_NOT_FOUND,
            message: `Resource '${uri}' not found on server '${this.serverInfo.name}'`,
          };
        }

        const contents = await resource.handler(uri);
        const result: McpReadResourceResult = { contents };
        return result;
      }

      default:
        throw {
          code: JSONRPC_ERROR_CODES.METHOD_NOT_FOUND,
          message: `Method '${method}' not implemented by MCP Server`,
        };
    }
  }

  private async sendResponse(id: JsonRpcId, result: any): Promise<void> {
    if (!this.transport) return;
    const response: JsonRpcResponse = {
      jsonrpc: "2.0",
      id,
      result: result ?? null,
    };
    await this.transport.send(response);
  }

  private async sendError(
    id: JsonRpcId,
    code: number,
    message: string,
    data?: any
  ): Promise<void> {
    if (!this.transport) return;
    const response: JsonRpcResponse = {
      jsonrpc: "2.0",
      id,
      error: { code, message, data },
    };
    await this.transport.send(response);
  }
}


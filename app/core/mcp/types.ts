/**
 * JSON-RPC 2.0 & Model Context Protocol (MCP) Standard Type Definitions
 * 按照官方 MCP 规范子集构建，保证轻量且零外部沉重依赖。
 */

// ==========================================
// 1. JSON-RPC 2.0 基础通信契约
// ==========================================

export type JsonRpcId = string | number;

export interface JsonRpcRequest<TParams = any> {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: TParams;
}

export interface JsonRpcNotification<TParams = any> {
  jsonrpc: "2.0";
  method: string;
  params?: TParams;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

export interface JsonRpcResponse<TResult = any> {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: TResult;
  error?: JsonRpcError;
}

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcResponse;

export const JSONRPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // MCP 扩展错误码
  CONNECTION_CLOSED: -32000,
  REQUEST_TIMEOUT: -32001,
  TOOL_EXECUTION_FAILED: -32002,
} as const;

// ==========================================
// 2. MCP 握手与能力协商 (Capabilities)
// ==========================================

export const LATEST_MCP_PROTOCOL_VERSION = "2024-11-05";

export interface McpImplementationInfo {
  name: string;
  version: string;
}

export interface McpClientCapabilities {
  roots?: {
    listChanged?: boolean;
  };
  sampling?: Record<string, unknown>;
  experimental?: Record<string, unknown>;
}

export interface McpServerCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: Record<string, unknown>;
  experimental?: Record<string, unknown>;
}

export interface InitializeParams {
  protocolVersion: string;
  capabilities: McpClientCapabilities;
  clientInfo: McpImplementationInfo;
}

export interface InitializeResult {
  protocolVersion: string;
  capabilities: McpServerCapabilities;
  serverInfo: McpImplementationInfo;
  instructions?: string;
}

// ==========================================
// 3. MCP 工具原语 (Tools Primitive)
// ==========================================

export interface McpToolInputSchema {
  type: "object";
  properties?: Record<string, {
    type?: string;
    description?: string;
    enum?: string[];
    items?: Record<string, any>;
    [key: string]: any;
  }>;
  required?: string[];
  [key: string]: any;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: McpToolInputSchema;
}

export interface McpListToolsResult {
  tools: McpToolDefinition[];
  nextCursor?: string;
}

export interface McpCallToolParams {
  name: string;
  arguments?: Record<string, any>;
}

export type McpContentItem =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image";
      data: string; // base64
      mimeType: string;
    }
  | {
      type: "resource";
      resource: {
        uri: string;
        mimeType?: string;
        text?: string;
        blob?: string;
      };
    };

export interface McpCallToolResult {
  content: McpContentItem[];
  isError?: boolean;
}

// ==========================================
// 4. MCP 资源原语 (Resources Primitive)
// ==========================================

export interface McpResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpListResourcesResult {
  resources: McpResourceDefinition[];
  nextCursor?: string;
}

export interface McpReadResourceParams {
  uri: string;
}

export interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface McpReadResourceResult {
  contents: McpResourceContent[];
}

// ==========================================
// 5. 调试抓包与审计日志帧 (Wire Protocol Frame)
// ==========================================

export interface JsonRpcFrame {
  id: string; // 链路帧唯一标识
  timestamp: string; // ISO 8601
  direction: "outbound" | "inbound"; // outbound: Client -> Server; inbound: Server -> Client
  serverId: string;
  serverName: string;
  rpcId?: JsonRpcId;
  method?: string; // 仅请求与通知有
  payload: JsonRpcMessage;
  durationMs?: number; // 针对请求-响应配对耗时
}

// ==========================================
// 6. MCP Server 注册与状态元数据
// ==========================================

export interface McpServerMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  transportType: "in_memory" | "stdio" | "sse";
  status: "connected" | "disconnected" | "connecting" | "error";
  error?: string;
  capabilities?: McpServerCapabilities;
  toolsCount: number;
  resourcesCount: number;
  latencyMs?: number;
}


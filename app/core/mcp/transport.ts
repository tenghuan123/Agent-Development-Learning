import type { JsonRpcMessage } from "./types";

/**
 * 通用 MCP 传输层抽象接口
 */
export interface McpTransport {
  /** 启动连接 */
  connect(): Promise<void>;
  /** 发送单条 JSON-RPC 报文 */
  send(message: JsonRpcMessage): Promise<void>;
  /** 注册接收报文回调 */
  onMessage(handler: (message: JsonRpcMessage) => void): void;
  /** 注册通信异常回调 */
  onError(handler: (error: Error) => void): void;
  /** 注册通信断开回调 */
  onClose(handler: () => void): void;
  /** 关闭传输信道 */
  close(): Promise<void>;
  /** 检查当前连通状态 */
  isConnected(): boolean;
}

/**
 * 基于内存配对的高性能 InMemoryTransport
 * 真实执行 JSON.parse(JSON.stringify()) 序列化与异步投递，
 * 严格模拟不可变网络报文边界，零子进程开销。
 */
export class InMemoryTransport implements McpTransport {
  private peer: InMemoryTransport | null = null;
  private messageHandlers: Array<(message: JsonRpcMessage) => void> = [];
  private errorHandlers: Array<(error: Error) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private connected = false;

  constructor(private name: string = "InMemoryTransport") {}

  /** 配对两个内存信道 */
  setPeer(peer: InMemoryTransport) {
    this.peer = peer;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async send(message: JsonRpcMessage): Promise<void> {
    if (!this.connected) {
      throw new Error(`[${this.name}] Transport is not connected`);
    }
    if (!this.peer || !this.peer.connected) {
      throw new Error(`[${this.name}] Peer transport is disconnected`);
    }

    // 严谨模拟网络序列化边界（防止共享内存对象引用被篡改）
    const serialized = JSON.stringify(message);
    const deserialized = JSON.parse(serialized) as JsonRpcMessage;

    // 异步微任务投递，模拟异步网络 I/O 时序
    queueMicrotask(() => {
      if (this.peer && this.peer.connected) {
        this.peer.dispatchMessage(deserialized);
      }
    });
  }

  private dispatchMessage(message: JsonRpcMessage) {
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (err) {
        this.dispatchError(
          err instanceof Error ? err : new Error(String(err))
        );
      }
    }
  }

  private dispatchError(error: Error) {
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch {
        // Ignore handler errors
      }
    }
  }

  onMessage(handler: (message: JsonRpcMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  async close(): Promise<void> {
    if (!this.connected) return;
    this.connected = false;
    for (const handler of this.closeHandlers) {
      try {
        handler();
      } catch {
        // Ignore close errors
      }
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * 创建成对绑定的 InMemoryTransport
 * 返回 [ClientSideTransport, ServerSideTransport]
 */
export function createInMemoryTransportPair(): [
  InMemoryTransport,
  InMemoryTransport
] {
  const clientTransport = new InMemoryTransport("ClientChannel");
  const serverTransport = new InMemoryTransport("ServerChannel");

  clientTransport.setPeer(serverTransport);
  serverTransport.setPeer(clientTransport);

  return [clientTransport, serverTransport];
}

/**
 * 基于 Node.js 子进程标准输入输出的 StdioTransport
 * 用于挂载外部独立的 Python / Node / Go MCP Server 进程
 */
export class StdioTransport implements McpTransport {
  private childProcess: import("child_process").ChildProcess | null = null;
  private messageHandlers: Array<(message: JsonRpcMessage) => void> = [];
  private errorHandlers: Array<(error: Error) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private connected = false;
  private lineBuffer = "";

  constructor(
    private command: string,
    private args: string[] = [],
    private options?: {
      cwd?: string;
      env?: Record<string, string>;
    }
  ) {}

  async connect(): Promise<void> {
    if (typeof window !== "undefined") {
      throw new Error("StdioTransport is only supported in Node.js server environment");
    }

    const { spawn } = await import("child_process");

    try {
      this.childProcess = spawn(this.command, this.args, {
        cwd: this.options?.cwd,
        env: {
          ...process.env,
          ...(this.options?.env || {}),
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.connected = true;

      // 监听 stdout (Newline-delimited JSON 帧)
      this.childProcess.stdout?.on("data", (chunk: Buffer) => {
        this.lineBuffer += chunk.toString("utf8");
        const lines = this.lineBuffer.split("\n");
        // 保留未完结的末尾
        this.lineBuffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed) as JsonRpcMessage;
            for (const handler of this.messageHandlers) {
              handler(parsed);
            }
          } catch {
            // 忽略非 JSON 行日志 (例如 server 启动控制台输出)
          }
        }
      });

      // 监听 stderr
      this.childProcess.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        console.warn(`[MCP Server stderr: ${this.command}] ${text}`);
      });

      // 监听进程退出
      this.childProcess.on("close", () => {
        this.connected = false;
        for (const handler of this.closeHandlers) {
          handler();
        }
      });

      this.childProcess.on("error", (err) => {
        this.connected = false;
        for (const handler of this.errorHandlers) {
          handler(err);
        }
      });
    } catch (err) {
      this.connected = false;
      throw err;
    }
  }

  async send(message: JsonRpcMessage): Promise<void> {
    if (!this.connected || !this.childProcess || !this.childProcess.stdin) {
      throw new Error("StdioTransport is not connected or process has exited");
    }

    const jsonLine = JSON.stringify(message) + "\n";
    this.childProcess.stdin.write(jsonLine, "utf8");
  }

  onMessage(handler: (message: JsonRpcMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  async close(): Promise<void> {
    this.connected = false;
    if (this.childProcess) {
      this.childProcess.kill();
      this.childProcess = null;
    }
    for (const handler of this.closeHandlers) {
      handler();
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}


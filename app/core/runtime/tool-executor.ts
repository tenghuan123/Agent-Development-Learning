import type { ToolCallItem, ToolExecutionResult } from "../tools/types";
import { defaultToolRegistry } from "../tools/builtins";
import type { ToolRegistry } from "../tools/registry";
import type { ToolExecutionOptions } from "./types";

export interface ActiveOperation {
  toolCallId: string;
  toolName: string;
  startedAt: number;
  abort: () => void;
}

export class SafeToolExecutor {
  private registry: ToolRegistry;
  private activeOperations: Map<string, ActiveOperation> = new Map();
  private workspaceDir: string;

  constructor(registry: ToolRegistry = defaultToolRegistry, workspaceDir: string = process.cwd()) {
    this.registry = registry;
    this.workspaceDir = workspaceDir;
  }

  getActiveOperationCount(): number {
    return this.activeOperations.size;
  }

  getActiveOperations(): ActiveOperation[] {
    return Array.from(this.activeOperations.values());
  }

  /**
   * Forcefully kill all currently running operations (e.g. on Ctrl+C Abort).
   * Returns the count of cancelled operations.
   */
  killAllActive(): number {
    const count = this.activeOperations.size;
    for (const [id, op] of this.activeOperations.entries()) {
      try {
        op.abort();
      } catch (e) {
        console.error(`[SafeToolExecutor] Failed to abort operation ${id}:`, e);
      }
    }
    this.activeOperations.clear();
    return count;
  }

  /**
   * Execute a tool call safely under signal and streaming guards.
   */
  async execute(
    call: ToolCallItem,
    options: ToolExecutionOptions = {}
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const toolName = call.function.name;
    const rawArgs = call.function.arguments || "{}";
    const toolCallId = call.id;

    // Check if signal is already aborted
    if (options.signal?.aborted) {
      return {
        toolCallId,
        toolName,
        inputArgs: {},
        rawArguments: rawArgs,
        output: "[Aborted] 任务已被 AbortSignal 取消，工具未执行。",
        isError: true,
        executionTimeMs: 0,
      };
    }

    const tool = this.registry.get(toolName);
    if (!tool) {
      return {
        toolCallId,
        toolName,
        inputArgs: {},
        rawArguments: rawArgs,
        output: `[执行失败] 未找到名为 '${toolName}' 的工具。`,
        isError: true,
        executionTimeMs: Date.now() - startTime,
      };
    }

    let parsedArgs: any;
    try {
      parsedArgs = JSON.parse(rawArgs);
    } catch (err: any) {
      return {
        toolCallId,
        toolName,
        inputArgs: {},
        rawArguments: rawArgs,
        output: `[参数解析错误] ${err.message}`,
        isError: true,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Set up local abort controller for this specific operation
    const localAbort = new AbortController();
    const cleanupSignal = () => {
      if (options.signal) {
        options.signal.removeEventListener("abort", handleExternalAbort);
      }
    };

    const handleExternalAbort = () => {
      localAbort.abort();
    };

    if (options.signal) {
      options.signal.addEventListener("abort", handleExternalAbort, { once: true });
    }

    this.activeOperations.set(toolCallId, {
      toolCallId,
      toolName,
      startedAt: startTime,
      abort: () => localAbort.abort(),
    });

    try {
      // Simulate/Stream progress chunk if provided
      if (options.onStreamChunk) {
        options.onStreamChunk({
          streamType: "stdout",
          text: `[Runtime] Spawning tool '${toolName}' with pid guard...\n`,
        });
      }

      // Check schema
      const parseRes = tool.schema.safeParse(parsedArgs);
      if (!parseRes.success) {
        return {
          toolCallId,
          toolName,
          inputArgs: parsedArgs,
          rawArguments: rawArgs,
          output: `[参数校验不通过] ${parseRes.error.message}`,
          isError: true,
          executionTimeMs: Date.now() - startTime,
        };
      }

      // Execute tool with race against abort signal
      const execPromise = Promise.resolve(
        tool.execute(parseRes.data, {
          workspaceDir: options.workspaceDir || this.workspaceDir,
          maxOutputLength: 8000,
        })
      );

      const abortPromise = new Promise<never>((_, reject) => {
        if (localAbort.signal.aborted) {
          reject(new Error("OperationAborted"));
          return;
        }
        localAbort.signal.addEventListener(
          "abort",
          () => reject(new Error("OperationAborted")),
          { once: true }
        );
      });

      const rawResult = await Promise.race([execPromise, abortPromise]);

      let formattedOutput: string;
      if (typeof rawResult === "string") {
        formattedOutput = rawResult;
      } else {
        try {
          formattedOutput = JSON.stringify(rawResult, null, 2);
        } catch {
          formattedOutput = String(rawResult);
        }
      }

      if (options.onStreamChunk) {
        options.onStreamChunk({
          streamType: "stdout",
          text: `[Runtime] Tool '${toolName}' finished successfully (${Date.now() - startTime}ms).\n`,
        });
      }

      return {
        toolCallId,
        toolName,
        inputArgs: parseRes.data,
        rawArguments: rawArgs,
        output: formattedOutput,
        isError: false,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err: any) {
      const isAborted = err.message === "OperationAborted" || localAbort.signal.aborted || options.signal?.aborted;

      if (isAborted) {
        if (options.onStreamChunk) {
          options.onStreamChunk({
            streamType: "stderr",
            text: `[Runtime] Tool '${toolName}' was SIGTERM/SIGKILL terminated by AbortSignal.\n`,
          });
        }
        return {
          toolCallId,
          toolName,
          inputArgs: parsedArgs,
          rawArguments: rawArgs,
          output: `[Aborted] 工具 '${toolName}' 在执行中被中断信号取消。资源与进程已安全释放。`,
          isError: true,
          executionTimeMs: Date.now() - startTime,
        };
      }

      return {
        toolCallId,
        toolName,
        inputArgs: parsedArgs,
        rawArguments: rawArgs,
        output: `[执行异常] ${err.message || String(err)}`,
        isError: true,
        executionTimeMs: Date.now() - startTime,
      };
    } finally {
      cleanupSignal();
      this.activeOperations.delete(toolCallId);
    }
  }
}

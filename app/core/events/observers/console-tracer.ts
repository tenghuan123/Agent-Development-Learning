import type { AgentEvent, AgentObserver } from "../types";

export interface FormattedTraceLine {
  id: string;
  seqId: number;
  timestamp: number;
  level: "info" | "thought" | "tool" | "chunk" | "error" | "success" | "warn";
  tag: string;
  prefix: string;
  content: string;
  durationMs?: number;
}

export class ConsoleTracerObserver implements AgentObserver {
  id = "console-tracer";
  name = "Console Tracer (CLI Visualizer)";
  description = "对标 Claude Code / Pi 的终端流式输出，提供树状缩进、彩色阶梯与耗时度量";
  enabled = true;

  private lines: FormattedTraceLine[] = [];
  private runStartTime = 0;
  private stepStartTime = 0;
  private toolStartTimes: Map<string, number> = new Map();

  onEvent(event: AgentEvent): void {
    switch (event.type) {
      case "run:start": {
        this.runStartTime = event.timestamp;
        this.addLine({
          id: event.id,
          seqId: event.seqId,
          timestamp: event.timestamp,
          level: "info",
          tag: "RUN:START",
          prefix: "╭─",
          content: `🚀 任务启动 [Run: ${event.runId.slice(0, 8)}] 提示词: "${event.inputPrompt}"`,
        });
        break;
      }

      case "step:start": {
        this.stepStartTime = event.timestamp;
        this.addLine({
          id: event.id,
          seqId: event.seqId,
          timestamp: event.timestamp,
          level: "info",
          tag: `STEP ${event.stepNumber}`,
          prefix: "├─┬",
          content: `⚡ 开始执行第 ${event.stepNumber} 步决策推理...`,
        });
        break;
      }

      case "llm:thought": {
        const usageText = event.tokenUsage
          ? ` (${event.tokenUsage.totalTokens} tok)`
          : "";
        this.addLine({
          id: event.id,
          seqId: event.seqId,
          timestamp: event.timestamp,
          level: "thought",
          tag: "THOUGHT",
          prefix: "│ ├─💭",
          content: `${event.thought}${usageText}`,
        });
        break;
      }

      case "tool:start": {
        this.toolStartTimes.set(event.toolCallId, event.timestamp);
        const argsStr = Object.entries(event.inputArgs || {})
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(", ");
        this.addLine({
          id: event.id,
          seqId: event.seqId,
          timestamp: event.timestamp,
          level: "tool",
          tag: `TOOL:${event.toolName}`,
          prefix: "│ ├─🔧",
          content: `调用 [${event.toolName}](${argsStr})`,
        });
        break;
      }

      case "tool:chunk": {
        this.addLine({
          id: event.id,
          seqId: event.seqId,
          timestamp: event.timestamp,
          level: "chunk",
          tag: "STDOUT",
          prefix: "│ │  │",
          content: event.chunk.trimEnd(),
        });
        break;
      }

      case "tool:end": {
        const startTime = this.toolStartTimes.get(event.toolCallId) || event.timestamp;
        const duration = event.durationMs || event.timestamp - startTime;
        const statusIcon = event.isError ? "❌" : "✓";
        const level = event.isError ? "error" : "success";
        const preview =
          event.output.length > 120
            ? event.output.slice(0, 120) + "..."
            : event.output;

        this.addLine({
          id: event.id,
          seqId: event.seqId,
          timestamp: event.timestamp,
          level,
          tag: `TOOL:${event.toolName}`,
          prefix: "│ └─" + statusIcon,
          content: `完成 (${duration}ms): ${preview.replace(/\n/g, " ")}`,
          durationMs: duration,
        });
        break;
      }

      case "user:interrupt": {
        this.addLine({
          id: event.id,
          seqId: event.seqId,
          timestamp: event.timestamp,
          level: "warn",
          tag: "INTERRUPT",
          prefix: "│ ⚠️ ",
          content: `用户中途插话指示: "${event.message}"`,
        });
        break;
      }

      case "runtime:state_change": {
        this.addLine({
          id: event.id,
          seqId: event.seqId,
          timestamp: event.timestamp,
          level: "info",
          tag: "STATE",
          prefix: "│ 🔄",
          content: `状态机流转: ${event.fromState} ──► ${event.toState}${
            event.reason ? ` (${event.reason})` : ""
          }`,
        });
        break;
      }

      case "observer:error": {
        this.addLine({
          id: event.id,
          seqId: event.seqId,
          timestamp: event.timestamp,
          level: "error",
          tag: "FAULT",
          prefix: "│ 🛡️ ",
          content: `[沙箱隔离] 外部观察者 "${event.observerName}" 抛错: ${event.errorMessage}`,
        });
        break;
      }

      case "run:finish": {
        const totalDuration =
          event.durationMs || (this.runStartTime ? event.timestamp - this.runStartTime : 0);
        this.addLine({
          id: event.id,
          seqId: event.seqId,
          timestamp: event.timestamp,
          level: event.success ? "success" : "error",
          tag: "RUN:FINISH",
          prefix: "╰─",
          content: `🏁 任务结束 [${event.success ? "SUCCESS" : "FAILED"}] 耗时 ${totalDuration}ms, 共 ${event.totalSteps} 步. 最终答案: ${event.finalAnswer.slice(0, 80)}`,
          durationMs: totalDuration,
        });
        break;
      }
    }
  }

  private addLine(line: FormattedTraceLine) {
    this.lines.push(line);
    if (this.lines.length > 500) {
      this.lines.shift();
    }
  }

  getLines(): FormattedTraceLine[] {
    return [...this.lines];
  }

  clear(): void {
    this.lines = [];
    this.toolStartTimes.clear();
  }
}


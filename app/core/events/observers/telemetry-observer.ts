import type { AgentEvent, AgentObserver, AgentEventType } from "../types";

export interface ToolMetrics {
  callCount: number;
  errorCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
}

export interface TelemetrySnapshot {
  runId: string | null;
  totalEvents: number;
  eventCountsByType: Record<AgentEventType, number>;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalSteps: number;
  stepDurations: { step: number; durationMs: number }[];
  avgStepDurationMs: number;
  toolMetrics: Record<string, ToolMetrics>;
  totalToolDurationMs: number;
  startTime: number;
  endTime?: number;
  totalDurationMs: number;
}

export class TelemetryObserver implements AgentObserver {
  id = "telemetry-observer";
  name = "Telemetry & Performance Collector";
  description = "采集 Token 消耗、步频延时画像、工具性能与吞吐量指标";
  enabled = true;

  private currentRunId: string | null = null;
  private startTime = 0;
  private endTime = 0;
  private stepStartTime = 0;
  private currentStep = 0;

  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;
  private totalTokens = 0;

  private eventCounts: Partial<Record<AgentEventType, number>> = {};
  private stepDurations: { step: number; durationMs: number }[] = [];
  private toolMetrics: Record<string, ToolMetrics> = {};

  onEvent(event: AgentEvent): void {
    // 统计各事件计数
    this.eventCounts[event.type] = (this.eventCounts[event.type] || 0) + 1;

    switch (event.type) {
      case "run:start": {
        this.currentRunId = event.runId;
        this.startTime = event.timestamp;
        this.endTime = 0;
        this.stepStartTime = 0;
        this.currentStep = 0;
        this.totalPromptTokens = 0;
        this.totalCompletionTokens = 0;
        this.totalTokens = 0;
        this.stepDurations = [];
        this.toolMetrics = {};
        break;
      }

      case "step:start": {
        if (this.stepStartTime > 0 && this.currentStep > 0) {
          const duration = event.timestamp - this.stepStartTime;
          this.stepDurations.push({ step: this.currentStep, durationMs: duration });
        }
        this.currentStep = event.stepNumber;
        this.stepStartTime = event.timestamp;
        break;
      }

      case "llm:thought": {
        const u = event.tokenUsage as any;
        if (u) {
          const prompt = Number(u.promptTokens ?? u.prompt_tokens ?? 0);
          const completion = Number(u.completionTokens ?? u.completion_tokens ?? 0);
          const total = Number(u.totalTokens ?? u.total_tokens ?? (prompt + completion));
          this.totalPromptTokens += prompt;
          this.totalCompletionTokens += completion;
          this.totalTokens += total;
        }
        break;
      }

      case "tool:end": {
        const metrics = this.toolMetrics[event.toolName] || {
          callCount: 0,
          errorCount: 0,
          totalDurationMs: 0,
          avgDurationMs: 0,
        };

        metrics.callCount += 1;
        if (event.isError) {
          metrics.errorCount += 1;
        }
        metrics.totalDurationMs += event.durationMs;
        metrics.avgDurationMs = Math.round(metrics.totalDurationMs / metrics.callCount);

        this.toolMetrics[event.toolName] = metrics;
        break;
      }

      case "run:finish": {
        this.endTime = event.timestamp;
        if (this.stepStartTime > 0 && this.currentStep > 0) {
          const duration = event.timestamp - this.stepStartTime;
          this.stepDurations.push({ step: this.currentStep, durationMs: duration });
        }
        break;
      }
    }
  }

  getSnapshot(): TelemetrySnapshot {
    const now = Date.now();
    const effectiveEnd = this.endTime || now;
    const totalDuration = this.startTime > 0 ? effectiveEnd - this.startTime : 0;

    const totalStepDuration = this.stepDurations.reduce((acc, s) => acc + s.durationMs, 0);
    const avgStepDuration =
      this.stepDurations.length > 0
        ? Math.round(totalStepDuration / this.stepDurations.length)
        : 0;

    const totalToolDuration = Object.values(this.toolMetrics).reduce(
      (acc, m) => acc + m.totalDurationMs,
      0
    );

    const totalEvents = Object.values(this.eventCounts).reduce(
      (acc, count) => acc + (count || 0),
      0
    );

    return {
      runId: this.currentRunId,
      totalEvents,
      eventCountsByType: this.eventCounts as Record<AgentEventType, number>,
      totalPromptTokens: this.totalPromptTokens,
      totalCompletionTokens: this.totalCompletionTokens,
      totalTokens: this.totalTokens,
      totalSteps: this.currentStep,
      stepDurations: [...this.stepDurations],
      avgStepDurationMs: avgStepDuration,
      toolMetrics: { ...this.toolMetrics },
      totalToolDurationMs: totalToolDuration,
      startTime: this.startTime,
      endTime: this.endTime || undefined,
      totalDurationMs: totalDuration,
    };
  }

  clear(): void {
    this.currentRunId = null;
    this.startTime = 0;
    this.endTime = 0;
    this.stepStartTime = 0;
    this.currentStep = 0;
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
    this.totalTokens = 0;
    this.eventCounts = {};
    this.stepDurations = [];
    this.toolMetrics = {};
  }
}


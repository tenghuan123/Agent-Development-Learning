import type {
  Span,
  SpanStatus,
  SpanType,
  Trace,
} from "./types";

/**
 * Standard Pricing Table (USD per 1M tokens)
 * Input / Output token rates for common agent backends
 */
export const MODEL_PRICING_TABLE: Record<
  string,
  { promptPricePerMillion: number; completionPricePerMillion: number }
> = {
  "glm-4-flash": { promptPricePerMillion: 0.1, completionPricePerMillion: 0.1 },
  "glm-4-plus": { promptPricePerMillion: 10.0, completionPricePerMillion: 10.0 },
  "claude-3-5-sonnet": { promptPricePerMillion: 3.0, completionPricePerMillion: 15.0 },
  "claude-3-haiku": { promptPricePerMillion: 0.25, completionPricePerMillion: 1.25 },
  "gpt-4o": { promptPricePerMillion: 2.5, completionPricePerMillion: 10.0 },
  "gpt-4o-mini": { promptPricePerMillion: 0.15, completionPricePerMillion: 0.6 },
  "deepseek-v3": { promptPricePerMillion: 0.14, completionPricePerMillion: 0.28 },
  "deepseek-r1": { promptPricePerMillion: 0.55, completionPricePerMillion: 2.19 },
  default: { promptPricePerMillion: 1.0, completionPricePerMillion: 2.0 },
};

/**
 * Calculate estimated USD cost for a given token usage and model
 */
export function calculateTokenCost(
  modelName: string,
  promptTokens: number,
  completionTokens: number
): number {
  const normalizedKey =
    Object.keys(MODEL_PRICING_TABLE).find((k) =>
      modelName.toLowerCase().includes(k)
    ) || "default";

  const rate = MODEL_PRICING_TABLE[normalizedKey];
  const promptCost = (promptTokens / 1_000_000) * rate.promptPricePerMillion;
  const completionCost =
    (completionTokens / 1_000_000) * rate.completionPricePerMillion;

  return Number((promptCost + completionCost).toFixed(6));
}

/**
 * OpenTelemetry-aligned In-Memory Tracer
 * Thread-safe span collector and hierarchical tree builder
 */
export class Tracer {
  private traces: Map<string, Trace> = new Map();
  private spansByTrace: Map<string, Map<string, Span>> = new Map();

  /**
   * Start a new top-level Trace and create its root Span
   */
  public startTrace(name: string, modelName = "glm-4-flash"): { trace: Trace; rootSpan: Span } {
    const traceId = `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const rootSpanId = `sp-root-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const rootSpan: Span = {
      spanId: rootSpanId,
      traceId,
      name,
      type: "agent_run",
      status: "running",
      metrics: {
        startTime: now,
        durationMs: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
      },
    };

    const trace: Trace = {
      traceId,
      name,
      startTime: now,
      durationMs: 0,
      status: "running",
      rootSpanId,
      spans: [rootSpan],
      totalTokens: 0,
      totalCostUsd: 0,
      stepCount: 0,
      modelName,
    };

    this.traces.set(traceId, trace);
    const spanMap = new Map<string, Span>();
    spanMap.set(rootSpanId, rootSpan);
    this.spansByTrace.set(traceId, spanMap);

    return { trace, rootSpan };
  }

  /**
   * Start an inner Span within an existing Trace
   */
  public startSpan(
    traceId: string,
    name: string,
    type: SpanType,
    parentSpanId?: string,
    input?: unknown,
    metadata?: Record<string, unknown>
  ): Span {
    const trace = this.traces.get(traceId);
    if (!trace) {
      throw new Error(`Cannot start span: Trace not found with id ${traceId}`);
    }

    const spanId = `sp-${type.slice(0, 4)}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const span: Span = {
      spanId,
      traceId,
      parentSpanId: parentSpanId || trace.rootSpanId,
      name,
      type,
      status: "running",
      metrics: {
        startTime: now,
        durationMs: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
      },
      input,
      metadata,
    };

    trace.spans.push(span);
    const spanMap = this.spansByTrace.get(traceId);
    if (spanMap) {
      spanMap.set(spanId, span);
    }

    return span;
  }

  /**
   * End a Span and record final metrics
   */
  public endSpan(
    traceId: string,
    spanId: string,
    status: SpanStatus,
    options?: {
      output?: unknown;
      error?: string;
      tokens?: { prompt: number; completion: number };
      ttftMs?: number;
      metadata?: Record<string, unknown>;
    }
  ): Span {
    const trace = this.traces.get(traceId);
    const spanMap = this.spansByTrace.get(traceId);
    if (!trace || !spanMap) {
      throw new Error(`Trace not found: ${traceId}`);
    }

    const span = spanMap.get(spanId);
    if (!span) {
      throw new Error(`Span not found: ${spanId} in trace ${traceId}`);
    }

    const now = Date.now();
    span.status = status;
    span.metrics.endTime = now;
    span.metrics.durationMs = Math.max(1, now - span.metrics.startTime);

    if (options?.output !== undefined) {
      span.output = options.output;
    }
    if (options?.error) {
      span.error = options.error;
    }
    if (options?.ttftMs !== undefined) {
      span.metrics.ttftMs = options.ttftMs;
    }
    if (options?.metadata) {
      span.metadata = { ...(span.metadata || {}), ...options.metadata };
    }

    if (options?.tokens) {
      span.metrics.promptTokens = options.tokens.prompt;
      span.metrics.completionTokens = options.tokens.completion;
      span.metrics.totalTokens = options.tokens.prompt + options.tokens.completion;
      span.metrics.estimatedCostUsd = calculateTokenCost(
        trace.modelName,
        options.tokens.prompt,
        options.tokens.completion
      );
    }

    return span;
  }

  /**
   * End a complete Trace, summarizing total duration, tokens, and cost
   */
  public endTrace(traceId: string, status: SpanStatus = "ok"): Trace {
    const trace = this.traces.get(traceId);
    if (!trace) {
      throw new Error(`Trace not found: ${traceId}`);
    }

    const now = Date.now();
    trace.endTime = now;
    trace.durationMs = Math.max(1, now - trace.startTime);
    trace.status = status;

    // End root span if still running
    const spanMap = this.spansByTrace.get(traceId);
    const rootSpan = spanMap?.get(trace.rootSpanId);
    if (rootSpan && rootSpan.status === "running") {
      rootSpan.status = status;
      rootSpan.metrics.endTime = now;
      rootSpan.metrics.durationMs = trace.durationMs;
    }

    // Roll up metrics
    let totalPrompt = 0;
    let totalCompletion = 0;
    let stepCount = 0;

    for (const s of trace.spans) {
      if (s.spanId === trace.rootSpanId) continue;
      totalPrompt += s.metrics.promptTokens;
      totalCompletion += s.metrics.completionTokens;
      if (s.type === "agent_loop") {
        stepCount++;
      }
    }

    trace.totalTokens = totalPrompt + totalCompletion;
    trace.totalCostUsd = calculateTokenCost(trace.modelName, totalPrompt, totalCompletion);
    trace.stepCount = Math.max(1, stepCount);

    if (rootSpan) {
      rootSpan.metrics.promptTokens = totalPrompt;
      rootSpan.metrics.completionTokens = totalCompletion;
      rootSpan.metrics.totalTokens = trace.totalTokens;
      rootSpan.metrics.estimatedCostUsd = trace.totalCostUsd;
    }

    return trace;
  }

  /**
   * Reconstruct the flat span list into a hierarchical tree
   */
  public buildTraceTree(trace: Trace): Span {
    const spanMap = new Map<string, Span & { children: Span[] }>();

    // Deep copy spans to avoid mutating original flat list
    for (const span of trace.spans) {
      spanMap.set(span.spanId, {
        ...span,
        children: [],
      });
    }

    let rootNode: (Span & { children: Span[] }) | undefined;

    for (const span of spanMap.values()) {
      if (!span.parentSpanId || span.spanId === trace.rootSpanId) {
        rootNode = span;
      } else {
        const parent = spanMap.get(span.parentSpanId);
        if (parent) {
          parent.children.push(span);
        } else if (rootNode) {
          rootNode.children.push(span);
        }
      }
    }

    if (!rootNode) {
      // Fallback
      return {
        ...trace.spans[0],
        children: trace.spans.slice(1),
      };
    }

    return rootNode;
  }

  public getTrace(traceId: string): Trace | undefined {
    return this.traces.get(traceId);
  }

  public listTraces(): Trace[] {
    return Array.from(this.traces.values()).sort(
      (a, b) => b.startTime - a.startTime
    );
  }

  public clear(): void {
    this.traces.clear();
    this.spansByTrace.clear();
  }
}

// Global default singleton instance
export const globalTracer = new Tracer();

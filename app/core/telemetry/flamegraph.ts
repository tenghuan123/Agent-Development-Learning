import type { Span, SpanMetrics, SpanStatus, SpanType, Trace } from "./types";

export interface FlamegraphNode {
  spanId: string;
  name: string;
  type: SpanType;
  status: SpanStatus;
  depth: number;
  startOffsetMs: number;
  durationMs: number;
  leftPercent: number;    // 0 to 100
  widthPercent: number;   // 0 to 100 (min 0.5% for visibility)
  metrics: SpanMetrics;
  input?: unknown;
  output?: unknown;
  error?: string;
  isBottleneck: boolean;
  children: FlamegraphNode[];
}

export interface LatencyBreakdown {
  totalDurationMs: number;
  llmDurationMs: number;
  llmPercent: number;
  toolDurationMs: number;
  toolPercent: number;
  overheadDurationMs: number;
  overheadPercent: number;
  avgTtftMs: number;
  tokensPerSec: number;
}

/**
 * Transforms a Trace into Flamegraph and Waterfall rendering nodes
 */
export function computeFlamegraph(trace: Trace): {
  root: FlamegraphNode;
  breakdown: LatencyBreakdown;
  flatNodes: FlamegraphNode[];
} {
  const totalDuration = Math.max(1, trace.durationMs);
  const traceStart = trace.startTime;

  // Build tree first
  const spanMap = new Map<string, Span & { children: Span[] }>();
  for (const span of trace.spans) {
    spanMap.set(span.spanId, {
      ...span,
      children: [],
    });
  }

  let rootSpan: (Span & { children: Span[] }) | undefined;
  for (const span of spanMap.values()) {
    if (!span.parentSpanId || span.spanId === trace.rootSpanId) {
      rootSpan = span;
    } else {
      const parent = spanMap.get(span.parentSpanId);
      if (parent) {
        parent.children.push(span);
      } else if (rootSpan) {
        rootSpan.children.push(span);
      }
    }
  }

  if (!rootSpan) {
    rootSpan = {
      ...trace.spans[0],
      children: trace.spans.slice(1),
    };
  }

  // Calculate Breakdown
  let totalLlmMs = 0;
  let totalToolMs = 0;
  let ttftSum = 0;
  let ttftCount = 0;

  for (const s of trace.spans) {
    if (s.type === "llm_call") {
      totalLlmMs += s.metrics.durationMs;
      if (s.metrics.ttftMs) {
        ttftSum += s.metrics.ttftMs;
        ttftCount++;
      }
    } else if (s.type === "tool_exec") {
      totalToolMs += s.metrics.durationMs;
    }
  }

  const overheadMs = Math.max(0, totalDuration - totalLlmMs - totalToolMs);
  const breakdown: LatencyBreakdown = {
    totalDurationMs: totalDuration,
    llmDurationMs: totalLlmMs,
    llmPercent: Number(((totalLlmMs / totalDuration) * 100).toFixed(1)),
    toolDurationMs: totalToolMs,
    toolPercent: Number(((totalToolMs / totalDuration) * 100).toFixed(1)),
    overheadDurationMs: overheadMs,
    overheadPercent: Number(((overheadMs / totalDuration) * 100).toFixed(1)),
    avgTtftMs: ttftCount > 0 ? Math.round(ttftSum / ttftCount) : 0,
    tokensPerSec:
      totalDuration > 0
        ? Number(((trace.totalTokens / totalDuration) * 1000).toFixed(1))
        : 0,
  };

  // Convert to FlamegraphNode recursively
  const flatNodes: FlamegraphNode[] = [];

  function transformNode(span: Span & { children: Span[] }, depth: number): FlamegraphNode {
    const startOffset = Math.max(0, span.metrics.startTime - traceStart);
    const duration = Math.max(1, span.metrics.durationMs);

    const left = Math.min(100, Math.max(0, (startOffset / totalDuration) * 100));
    const width = Math.min(100 - left, Math.max(0.8, (duration / totalDuration) * 100));

    // Bottleneck flag if duration > 30% of total trace
    const isBottleneck = duration > 0.3 * totalDuration && span.type !== "agent_run";

    const node: FlamegraphNode = {
      spanId: span.spanId,
      name: span.name,
      type: span.type,
      status: span.status,
      depth,
      startOffsetMs: startOffset,
      durationMs: duration,
      leftPercent: Number(left.toFixed(2)),
      widthPercent: Number(width.toFixed(2)),
      metrics: span.metrics,
      input: span.input,
      output: span.output,
      error: span.error,
      isBottleneck,
      children: [],
    };

    flatNodes.push(node);

    // Sort children by startTime
    const sortedChildren = [...span.children].sort(
      (a, b) => a.metrics.startTime - b.metrics.startTime
    );

    for (const child of sortedChildren) {
      const childWithChildren = spanMap.get(child.spanId) || { ...child, children: [] };
      node.children.push(transformNode(childWithChildren, depth + 1));
    }

    return node;
  }

  const rootNode = transformNode(rootSpan, 0);

  return {
    root: rootNode,
    breakdown,
    flatNodes,
  };
}


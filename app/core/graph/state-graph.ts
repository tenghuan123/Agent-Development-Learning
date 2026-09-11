/**
 * 第 20 课：Graph 是什么？
 * 原生 StateGraph 与 CompiledGraph 引擎实现
 *
 * 核心原理：
 * 1. 控制流变为数据结构：将过程式 if/else/while 转化为节点与有向边的显式拓扑
 * 2. 编译期静态分析 (Topology Linter)：在运行前彻底阻断悬空边、孤立节点与无出口死循环
 * 3. 单向状态演进：Node(State) -> Partial<State>，通过不可变合并驱动系统转移
 * 4. 原生挂起 (Durable Suspension)：天然支持断点中断与快照恢复
 */

import {
  START,
  END,
  type NodeAction,
  type ConditionalRouter,
  type EdgeDefinition,
  type ConditionalEdgeDefinition,
  type GraphNode,
  type GraphLintReport,
  type GraphLintIssue,
  type GraphStepEvent,
  type CompileOptions,
  type RunOptions,
  type GraphExecutionResult,
} from "./types";

export class GraphCompilationError extends Error {
  public issues: GraphLintIssue[];

  constructor(message: string, issues: GraphLintIssue[]) {
    super(message);
    this.name = "GraphCompilationError";
    this.issues = issues;
  }
}

/**
 * 状态图构建器 (StateGraph Builder)
 */
export class StateGraph<TState extends object> {
  private nodes: Map<string, GraphNode<TState>> = new Map();
  private staticEdges: EdgeDefinition[] = [];
  private conditionalEdges: ConditionalEdgeDefinition<TState>[] = [];
  private entryPoint: string | null = null;

  /**
   * 注册一个图节点
   */
  public addNode(
    name: string,
    action: NodeAction<TState>,
    description?: string
  ): this {
    if (name === START || name === END) {
      throw new Error(`Reserved node name '${name}' cannot be explicitly registered.`);
    }
    if (this.nodes.has(name)) {
      throw new Error(`Node with name '${name}' already exists in the graph.`);
    }
    this.nodes.set(name, { name, action, description });
    return this;
  }

  /**
   * 注册一条确定性静态转移边 (from -> to)
   */
  public addEdge(from: string, to: string): this {
    if (from === END) {
      throw new Error("Cannot add outgoing edge from END node.");
    }
    if (to === START) {
      throw new Error("Cannot add incoming edge to START node.");
    }
    if (from === START) {
      this.entryPoint = to;
    }
    this.staticEdges.push({ from, to });
    return this;
  }

  /**
   * 注册一条动态条件转移边 (from -> router -> to)
   */
  public addConditionalEdges(
    from: string,
    router: ConditionalRouter<TState>,
    pathMap?: Record<string, string>
  ): this {
    if (from === START) {
      throw new Error("Conditional edges from START are not supported; use explicit entry point.");
    }
    if (from === END) {
      throw new Error("Cannot add outgoing edge from END node.");
    }
    this.conditionalEdges.push({ from, router, pathMap });
    return this;
  }

  /**
   * 语法糖：设置图的唯一入口节点
   */
  public setEntryPoint(nodeName: string): this {
    this.entryPoint = nodeName;
    const existingStartIdx = this.staticEdges.findIndex((e) => e.from === START);
    if (existingStartIdx >= 0) {
      this.staticEdges[existingStartIdx].to = nodeName;
    } else {
      this.staticEdges.push({ from: START, to: nodeName });
    }
    return this;
  }

  /**
   * 语法糖：设置某节点的出口为 END
   */
  public setFinishPoint(nodeName: string): this {
    return this.addEdge(nodeName, END);
  }

  /**
   * 获取当前所有注册节点
   */
  public getNodes(): GraphNode<TState>[] {
    return Array.from(this.nodes.values());
  }

  /**
   * 获取所有静态边
   */
  public getStaticEdges(): EdgeDefinition[] {
    return [...this.staticEdges];
  }

  /**
   * 获取所有条件边
   */
  public getConditionalEdges(): ConditionalEdgeDefinition<TState>[] {
    return [...this.conditionalEdges];
  }

  /**
   * 编译前静态拓扑诊断 (Static Topology Linter)
   * 彻底在编译期扫描出结构性缺陷
   */
  public validateTopology(): GraphLintReport {
    const errors: GraphLintIssue[] = [];
    const warnings: GraphLintIssue[] = [];
    const nodeNames = new Set(this.nodes.keys());

    // 1. 入口点有效性校验
    const startEdges = this.staticEdges.filter((e) => e.from === START);
    if (!this.entryPoint && startEdges.length === 0) {
      errors.push({
        type: "ERROR",
        code: "MISSING_ENTRY_POINT",
        message: "Graph has no entry point defined. Call setEntryPoint() or addEdge(START, ...).",
      });
    }

    const effectiveEntryPoint = this.entryPoint || startEdges[0]?.to;
    if (effectiveEntryPoint && !nodeNames.has(effectiveEntryPoint)) {
      errors.push({
        type: "ERROR",
        code: "DANGLING_EDGE",
        message: `Entry point points to an unknown node '${effectiveEntryPoint}'.`,
        node: START,
        target: effectiveEntryPoint,
      });
    }

    // 2. 悬空边校验 (Dangling Edges)
    for (const edge of this.staticEdges) {
      if (edge.from !== START && !nodeNames.has(edge.from)) {
        errors.push({
          type: "ERROR",
          code: "DANGLING_EDGE",
          message: `Static edge origin '${edge.from}' does not exist.`,
          node: edge.from,
        });
      }
      if (edge.to !== END && !nodeNames.has(edge.to)) {
        errors.push({
          type: "ERROR",
          code: "DANGLING_EDGE",
          message: `Static edge target '${edge.to}' does not exist.`,
          node: edge.from,
          target: edge.to,
        });
      }
    }

    // 3. 静态边冲突检测 (同一节点不应有多条无条件的静态外发边)
    const outgoingStaticCount = new Map<string, number>();
    for (const edge of this.staticEdges) {
      const count = (outgoingStaticCount.get(edge.from) || 0) + 1;
      outgoingStaticCount.set(edge.from, count);
      if (count > 1 && edge.from !== START) {
        errors.push({
          type: "ERROR",
          code: "MULTIPLE_OUTGOING_STATIC_EDGES",
          message: `Node '${edge.from}' has multiple unconditional outgoing static edges. Use conditional edges instead.`,
          node: edge.from,
        });
      }
    }

    // 4. 条件边有效性校验
    for (const cEdge of this.conditionalEdges) {
      if (!nodeNames.has(cEdge.from)) {
        errors.push({
          type: "ERROR",
          code: "DANGLING_EDGE",
          message: `Conditional edge origin '${cEdge.from}' does not exist.`,
          node: cEdge.from,
        });
      }
      if (cEdge.pathMap) {
        for (const [key, target] of Object.entries(cEdge.pathMap)) {
          if (target !== END && !nodeNames.has(target)) {
            errors.push({
              type: "ERROR",
              code: "DANGLING_EDGE",
              message: `Conditional edge from '${cEdge.from}' has pathMap key '${key}' pointing to unknown node '${target}'.`,
              node: cEdge.from,
              target,
            });
          }
        }
      }
    }

    // 5. 可达性遍历与孤立死节点 (Reachability Analysis from START)
    const reachableNodes = new Set<string>();
    if (effectiveEntryPoint && nodeNames.has(effectiveEntryPoint)) {
      const queue = [effectiveEntryPoint];
      reachableNodes.add(effectiveEntryPoint);

      while (queue.length > 0) {
        const current = queue.shift()!;
        // 寻找所有外发静态边
        for (const edge of this.staticEdges) {
          if (edge.from === current && edge.to !== END && !reachableNodes.has(edge.to)) {
            if (nodeNames.has(edge.to)) {
              reachableNodes.add(edge.to);
              queue.push(edge.to);
            }
          }
        }
        // 寻找所有外发条件边 (基于 pathMap 预测)
        for (const cEdge of this.conditionalEdges) {
          if (cEdge.from === current && cEdge.pathMap) {
            for (const target of Object.values(cEdge.pathMap)) {
              if (target !== END && !reachableNodes.has(target)) {
                if (nodeNames.has(target)) {
                  reachableNodes.add(target);
                  queue.push(target);
                }
              }
            }
          }
        }
      }
    }

    const unreachableNodes: string[] = [];
    for (const name of nodeNames) {
      if (!reachableNodes.has(name)) {
        unreachableNodes.push(name);
        warnings.push({
          type: "WARNING",
          code: "UNREACHABLE_NODE",
          message: `Node '${name}' is unreachable from the entry point.`,
          node: name,
        });
      }
    }

    // 6. 死胡同节点检测 (Dead End Nodes: 既没有静态边也没有条件边且不是 END)
    const terminalNodes: string[] = [];
    for (const name of nodeNames) {
      const hasStaticOut = this.staticEdges.some((e) => e.from === name);
      const hasCondOut = this.conditionalEdges.some((e) => e.from === name);
      if (!hasStaticOut && !hasCondOut) {
        warnings.push({
          type: "WARNING",
          code: "DEAD_END_NODE",
          message: `Node '${name}' has no outgoing edges and does not connect to END. Execution will stop here.`,
          node: name,
        });
        terminalNodes.push(name);
      }
    }

    // 7. 环路检测 (Cycle Detection using DFS)
    let hasCycles = false;
    const visited = new Map<string, number>(); // 0: unvisited, 1: visiting, 2: visited
    const adjacency = new Map<string, string[]>();

    for (const name of nodeNames) {
      adjacency.set(name, []);
    }
    for (const edge of this.staticEdges) {
      if (edge.from !== START && edge.to !== END) {
        adjacency.get(edge.from)?.push(edge.to);
      }
    }
    for (const cEdge of this.conditionalEdges) {
      if (cEdge.pathMap) {
        for (const target of Object.values(cEdge.pathMap)) {
          if (target !== END) {
            adjacency.get(cEdge.from)?.push(target);
          }
        }
      }
    }

    const dfs = (node: string): boolean => {
      visited.set(node, 1);
      const neighbors = adjacency.get(node) || [];
      for (const neighbor of neighbors) {
        const state = visited.get(neighbor) || 0;
        if (state === 1) return true; // Found back edge (cycle)
        if (state === 0 && dfs(neighbor)) return true;
      }
      visited.set(node, 2);
      return false;
    };

    for (const name of nodeNames) {
      if ((visited.get(name) || 0) === 0) {
        if (dfs(name)) {
          hasCycles = true;
          break;
        }
      }
    }

    const valid = errors.length === 0;

    return {
      valid,
      errors,
      warnings,
      nodeCount: this.nodes.size,
      edgeCount: this.staticEdges.length,
      conditionalEdgeCount: this.conditionalEdges.length,
      hasCycles,
      terminalNodes,
      reachableNodes: Array.from(reachableNodes),
      unreachableNodes,
    };
  }

  /**
   * 编译图拓扑，输出可执行的 CompiledGraph
   */
  public compile(options: CompileOptions = {}): CompiledGraph<TState> {
    const report = this.validateTopology();
    if (!report.valid && !options.allowWarnings) {
      throw new GraphCompilationError(
        `Failed to compile StateGraph: Found ${report.errors.length} error(s).`,
        report.errors
      );
    }

    return new CompiledGraph<TState>(
      new Map(this.nodes),
      [...this.staticEdges],
      [...this.conditionalEdges],
      this.entryPoint || this.staticEdges.find((e) => e.from === START)?.to || "",
      options,
      report
    );
  }
}

/**
 * 编译完成的可执行图 (CompiledGraph)
 */
export class CompiledGraph<TState extends object> {
  private interruptNodes: Set<string>;

  constructor(
    private nodes: Map<string, GraphNode<TState>>,
    private staticEdges: EdgeDefinition[],
    private conditionalEdges: ConditionalEdgeDefinition<TState>[],
    private entryPoint: string,
    private options: CompileOptions,
    public readonly lintReport: GraphLintReport
  ) {
    this.interruptNodes = new Set(this.options.interruptNodes || []);
  }

  public getEntryPoint(): string {
    return this.entryPoint;
  }

  public getNodeNames(): string[] {
    return Array.from(this.nodes.keys());
  }

  public getNode(name: string): GraphNode<TState> | undefined {
    return this.nodes.get(name);
  }

  /**
   * 单步执行：在当前状态和当前节点上执行动作，并推导下一个目标节点
   */
  public async step(
    currentState: TState,
    currentNodeName: string
  ): Promise<{
    nextState: TState;
    patch: Partial<TState>;
    nextNodeName: string;
    edgeType: "STATIC" | "CONDITIONAL" | "TERMINATION";
    durationMs: number;
    isInterrupted: boolean;
  }> {
    const node = this.nodes.get(currentNodeName);
    if (!node) {
      throw new Error(`Execution error: Node '${currentNodeName}' not found in compiled graph.`);
    }

    const startTime = Date.now();
    const patch = (await node.action(Object.freeze({ ...currentState }))) || {};
    const durationMs = Date.now() - startTime;

    // 不可变合并状态
    const nextState: TState = {
      ...currentState,
      ...patch,
    };

    // 判定下一跳
    // 1. 优先检查是否有条件边
    const condEdge = this.conditionalEdges.find((e) => e.from === currentNodeName);
    if (condEdge) {
      const rawTarget = await condEdge.router(Object.freeze({ ...nextState }));
      const resolvedTarget = condEdge.pathMap ? condEdge.pathMap[rawTarget] || rawTarget : rawTarget;
      const isInterrupted = this.interruptNodes.has(currentNodeName);
      return {
        nextState,
        patch,
        nextNodeName: resolvedTarget,
        edgeType: resolvedTarget === END ? "TERMINATION" : "CONDITIONAL",
        durationMs,
        isInterrupted,
      };
    }

    // 2. 检查是否有静态边
    const staticEdge = this.staticEdges.find((e) => e.from === currentNodeName);
    if (staticEdge) {
      const isInterrupted = this.interruptNodes.has(currentNodeName);
      return {
        nextState,
        patch,
        nextNodeName: staticEdge.to,
        edgeType: staticEdge.to === END ? "TERMINATION" : "STATIC",
        durationMs,
        isInterrupted,
      };
    }

    // 3. 既无条件边也无静态边，视为隐式终止
    return {
      nextState,
      patch,
      nextNodeName: END,
      edgeType: "TERMINATION",
      durationMs,
      isInterrupted: false,
    };
  }

  /**
   * 异步流式生成器：逐步产生每一步执行事件
   */
  public async *stream(
    initialState: TState,
    options: RunOptions = {}
  ): AsyncGenerator<GraphStepEvent<TState>, GraphExecutionResult<TState>> {
    const recursionLimit = options.recursionLimit ?? 30;
    const stepDelayMs = options.stepDelayMs ?? 0;

    let currentState = JSON.parse(JSON.stringify(initialState)) as TState;
    let currentNode = this.entryPoint;
    let stepCount = 0;
    const history: GraphStepEvent<TState>[] = [];
    const runStartTime = Date.now();

    while (currentNode && currentNode !== END) {
      stepCount++;
      if (stepCount > recursionLimit) {
        const errorResult: GraphExecutionResult<TState> = {
          finalState: currentState,
          status: "RECURSION_LIMIT_EXCEEDED",
          steps: history,
          totalDurationMs: Date.now() - runStartTime,
          error: `Recursion limit of ${recursionLimit} steps reached. Graph terminated to prevent infinite loops.`,
        };
        return errorResult;
      }

      if (stepDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, stepDelayMs));
      }

      const nodeObj = this.nodes.get(currentNode);
      const stepRes = await this.step(currentState, currentNode);

      const event: GraphStepEvent<TState> = {
        stepIndex: stepCount,
        node: currentNode,
        nodeDescription: nodeObj?.description,
        previousState: currentState,
        patch: stepRes.patch,
        nextState: stepRes.nextState,
        edgeType: stepRes.edgeType,
        edgeTarget: stepRes.nextNodeName,
        durationMs: stepRes.durationMs,
        timestamp: Date.now(),
        isInterrupted: stepRes.isInterrupted,
      };

      history.push(event);
      currentState = stepRes.nextState;
      yield event;

      // 如果当前节点声明为挂起节点（例如人机审批），则暂停执行
      if (stepRes.isInterrupted) {
        const interruptResult: GraphExecutionResult<TState> = {
          finalState: currentState,
          status: "INTERRUPTED",
          steps: history,
          totalDurationMs: Date.now() - runStartTime,
          interruptedAtNode: currentNode,
        };
        return interruptResult;
      }

      currentNode = stepRes.nextNodeName;
    }

    const completeResult: GraphExecutionResult<TState> = {
      finalState: currentState,
      status: "COMPLETED",
      steps: history,
      totalDurationMs: Date.now() - runStartTime,
    };
    return completeResult;
  }

  public async invoke(
    initialState: TState,
    options: RunOptions = {}
  ): Promise<GraphExecutionResult<TState>> {
    const generator = this.stream(initialState, options);

    while (true) {
      const step = await generator.next();
      if (step.done) {
        return step.value;
      }
    }
  }
}

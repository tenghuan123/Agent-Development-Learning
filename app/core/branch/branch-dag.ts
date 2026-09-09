import type { BranchDAGNode, BranchEntity } from "./types";

export interface GraphLayoutNode {
  node: BranchDAGNode;
  lane: number;
  depth: number;
  isHead: boolean;
  isForkPoint: boolean;
  branchName: string;
  branchColor: string;
}

export class BranchDAG {
  private nodes: Map<string, BranchDAGNode> = new Map();
  private branches: Map<string, BranchEntity> = new Map();
  private activeBranchId: string = "main";
  private activeHeadNodeId: string = "";

  constructor() {
    // Initial empty DAG
  }

  /**
   * Initialize or register the main default branch.
   */
  public initMainBranch(initialNode?: BranchDAGNode): BranchEntity {
    const mainBranch: BranchEntity = {
      branchId: "main",
      name: "main",
      description: "Default trunk branch",
      forkPointNodeId: null,
      headNodeId: initialNode?.nodeId || "",
      createdAt: Date.now(),
      status: "active",
      colorTag: "#3b82f6", // Blue
    };

    this.branches.set("main", mainBranch);
    this.activeBranchId = "main";

    if (initialNode) {
      this.addNode(initialNode);
      this.activeHeadNodeId = initialNode.nodeId;
      mainBranch.headNodeId = initialNode.nodeId;
    }

    return mainBranch;
  }

  /**
   * Add a new node to the DAG.
   */
  public addNode(node: BranchDAGNode): void {
    if (this.nodes.has(node.nodeId)) {
      throw new Error(`Node '${node.nodeId}' already exists in DAG.`);
    }

    if (node.parentNodeId && !this.nodes.has(node.parentNodeId)) {
      throw new Error(
        `Parent node '${node.parentNodeId}' does not exist in DAG.`
      );
    }

    this.nodes.set(node.nodeId, node);

    // Update branch head if node belongs to this branch
    const branch = this.branches.get(node.branchId);
    if (branch) {
      branch.headNodeId = node.nodeId;
      if (this.activeBranchId === node.branchId) {
        this.activeHeadNodeId = node.nodeId;
      }
    }
  }

  /**
   * Fork a new independent branch from an arbitrary historical node.
   */
  public forkBranch(options: {
    newBranchName: string;
    forkFromNodeId: string;
    description?: string;
    colorTag?: string;
  }): BranchEntity {
    const forkNode = this.nodes.get(options.forkFromNodeId);
    if (!forkNode) {
      throw new Error(
        `Fork source node '${options.forkFromNodeId}' not found in DAG.`
      );
    }

    const branchId = `branch_${options.newBranchName
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")}_${Date.now()}`;

    const newBranch: BranchEntity = {
      branchId,
      name: options.newBranchName,
      description: options.description || `Forked from node ${forkNode.stepNumber}`,
      forkPointNodeId: options.forkFromNodeId,
      headNodeId: options.forkFromNodeId, // Initially points to fork point
      createdAt: Date.now(),
      status: "active",
      colorTag: options.colorTag || this.assignBranchColor(this.branches.size),
    };

    this.branches.set(branchId, newBranch);
    this.activeBranchId = branchId;
    this.activeHeadNodeId = options.forkFromNodeId;

    return newBranch;
  }

  /**
   * Set active branch and active HEAD.
   */
  public checkoutBranch(branchId: string): BranchEntity {
    const branch = this.branches.get(branchId);
    if (!branch) {
      throw new Error(`Branch '${branchId}' not found.`);
    }

    this.activeBranchId = branchId;
    this.activeHeadNodeId = branch.headNodeId;
    return branch;
  }

  /**
   * Set active HEAD to an arbitrary node (Time-Travel).
   */
  public checkoutNode(nodeId: string): BranchDAGNode {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node '${nodeId}' not found.`);
    }

    this.activeHeadNodeId = nodeId;
    this.activeBranchId = node.branchId;
    return node;
  }

  public getNode(nodeId: string): BranchDAGNode | undefined {
    return this.nodes.get(nodeId);
  }

  public getAllNodes(): BranchDAGNode[] {
    return Array.from(this.nodes.values());
  }

  public getBranch(branchId: string): BranchEntity | undefined {
    return this.branches.get(branchId);
  }

  public getAllBranches(): BranchEntity[] {
    return Array.from(this.branches.values());
  }

  public getActiveBranchId(): string {
    return this.activeBranchId;
  }

  public getActiveHeadNodeId(): string {
    return this.activeHeadNodeId;
  }

  /**
   * Get all nodes belonging to a specific branch in topological sequence.
   */
  public getBranchNodes(branchId: string): BranchDAGNode[] {
    return Array.from(this.nodes.values())
      .filter((n) => n.branchId === branchId)
      .sort((a, b) => a.stepNumber - b.stepNumber);
  }

  /**
   * Get the full ancestral lineage from root up to the given node.
   */
  public getLineage(nodeId: string): BranchDAGNode[] {
    const lineage: BranchDAGNode[] = [];
    let curr: BranchDAGNode | undefined = this.nodes.get(nodeId);

    while (curr) {
      lineage.unshift(curr);
      if (!curr.parentNodeId) break;
      curr = this.nodes.get(curr.parentNodeId);
    }

    return lineage;
  }

  /**
   * Compute Lowest Common Ancestor (LCA) between two nodes.
   */
  public findLCA(nodeIdA: string, nodeIdB: string): BranchDAGNode | null {
    const lineageA = this.getLineage(nodeIdA);
    const setA = new Set(lineageA.map((n) => n.nodeId));

    const lineageB = this.getLineage(nodeIdB);
    // Find the latest node in lineageB that also exists in setA
    for (let i = lineageB.length - 1; i >= 0; i--) {
      if (setA.has(lineageB[i].nodeId)) {
        return lineageB[i];
      }
    }

    return null;
  }

  /**
   * Generate 2D visual layout coordinates (lanes & depths) for rendering DAG in UI.
   */
  public computeVisualLayout(): {
    layoutNodes: GraphLayoutNode[];
    branches: BranchEntity[];
    edges: { fromNodeId: string; toNodeId: string; isBranchFork: boolean }[];
  } {
    const layoutNodes: GraphLayoutNode[] = [];
    const edges: { fromNodeId: string; toNodeId: string; isBranchFork: boolean }[] = [];

    // Assign lanes to branches
    const branchLanes: Record<string, number> = {};
    let laneCounter = 0;

    // Main gets lane 0
    branchLanes["main"] = 0;
    laneCounter++;

    for (const b of this.branches.values()) {
      if (b.branchId !== "main" && branchLanes[b.branchId] === undefined) {
        branchLanes[b.branchId] = laneCounter++;
      }
    }

    // Sort nodes by timestamp or step progression
    const allSortedNodes = Array.from(this.nodes.values()).sort(
      (a, b) => a.timestamp - b.timestamp
    );

    const forkPointNodeIds = new Set(
      Array.from(this.branches.values())
        .map((b) => b.forkPointNodeId)
        .filter(Boolean)
    );

    for (let depth = 0; depth < allSortedNodes.length; depth++) {
      const node = allSortedNodes[depth];
      const branch = this.branches.get(node.branchId);
      const lane = branchLanes[node.branchId] ?? 0;

      layoutNodes.push({
        node,
        lane,
        depth,
        isHead: node.nodeId === branch?.headNodeId,
        isForkPoint: forkPointNodeIds.has(node.nodeId),
        branchName: branch?.name || node.branchId,
        branchColor: branch?.colorTag || "#64748b",
      });

      if (node.parentNodeId && this.nodes.has(node.parentNodeId)) {
        const parent = this.nodes.get(node.parentNodeId)!;
        edges.push({
          fromNodeId: parent.nodeId,
          toNodeId: node.nodeId,
          isBranchFork: parent.branchId !== node.branchId,
        });
      }
    }

    return {
      layoutNodes,
      branches: Array.from(this.branches.values()),
      edges,
    };
  }

  private assignBranchColor(index: number): string {
    const palette = [
      "#3b82f6", // Blue
      "#10b981", // Emerald
      "#8b5cf6", // Purple
      "#f59e0b", // Amber
      "#ec4899", // Pink
      "#06b6d4", // Cyan
      "#84cc16", // Lime
    ];
    return palette[index % palette.length];
  }
}


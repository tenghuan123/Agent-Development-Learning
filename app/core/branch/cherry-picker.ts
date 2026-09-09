import type { BranchDAG } from "./branch-dag";
import type { BranchDAGNode, CherryPickRequest, CherryPickResult } from "./types";
import { WorkspaceTracker } from "../session/workspace-tracker";
import type { WorkspaceSnapshot } from "../session/types";

export class CherryPicker {
  constructor(
    private dag: BranchDAG,
    private snapshotRegistry: Map<string, WorkspaceSnapshot>,
    private fileStorage: Map<string, Record<string, string>>
  ) {}

  /**
   * Cherry-pick an isolated file from a historical node in another branch into the target branch.
   */
  public cherryPickFile(
    request: CherryPickRequest,
    currentTargetFiles: Record<string, string>
  ): {
    result: CherryPickResult;
    updatedFiles: Record<string, string>;
    newNode: BranchDAGNode;
  } {
    const sourceNode = this.dag.getNode(request.sourceNodeId);
    if (!sourceNode) {
      throw new Error(`Source node '${request.sourceNodeId}' not found in DAG.`);
    }

    const targetBranch = this.dag.getBranch(request.targetBranchId);
    if (!targetBranch) {
      throw new Error(`Target branch '${request.targetBranchId}' not found in DAG.`);
    }

    const sourceFiles = this.fileStorage.get(sourceNode.workspaceSnapshotId);
    if (!sourceFiles) {
      throw new Error(
        `Source workspace files for snapshot '${sourceNode.workspaceSnapshotId}' are missing.`
      );
    }

    const sourceFileContent = sourceFiles[request.filePath];
    if (sourceFileContent === undefined) {
      throw new Error(
        `File '${request.filePath}' does not exist in source node '${request.sourceNodeId}'.`
      );
    }

    // Apply to target workspace
    const updatedFiles: Record<string, string> = {
      ...currentTargetFiles,
      [request.filePath]: sourceFileContent,
    };

    // Create new atomic snapshot for target branch
    const newSnapshotId = `snap_cp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newSnapshot = WorkspaceTracker.createSnapshot(updatedFiles, {
      snapshotId: newSnapshotId,
    });

    this.snapshotRegistry.set(newSnapshot.id, newSnapshot);
    this.fileStorage.set(newSnapshot.id, updatedFiles);

    // Create new DAG node on target branch
    const parentNodeId = targetBranch.headNodeId || targetBranch.forkPointNodeId;
    const parentNode = parentNodeId ? this.dag.getNode(parentNodeId) : null;
    const nextStepNumber = parentNode ? parentNode.stepNumber + 1 : 1;

    const newNodeId = `node_cp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const commitMsg =
      request.customCommitMessage ||
      `Cherry-pick '${request.filePath}' from node ${sourceNode.stepNumber} [${sourceNode.branchId}]`;

    const newNode: BranchDAGNode = {
      nodeId: newNodeId,
      parentNodeId: parentNodeId,
      branchId: request.targetBranchId,
      runId: `run_${request.targetBranchId}`,
      stepNumber: nextStepNumber,
      checkpointId: `ckpt_${newNodeId}`,
      timestamp: Date.now(),
      summary: commitMsg,
      role: "assistant",
      promptProjectionSnippet: `Cherry-picked file asset: ${request.filePath}`,
      toolCallName: "cherry_pick_asset",
      workspaceSnapshotId: newSnapshot.id,
      rootHash: newSnapshot.rootHash,
      filesModified: [request.filePath],
      metrics: {
        durationMs: 15,
        tokensUsed: 0,
        testsPassed: true,
      },
    };

    this.dag.addNode(newNode);

    const result: CherryPickResult = {
      success: true,
      sourceFilePath: request.filePath,
      sourceNodeId: request.sourceNodeId,
      targetBranchId: request.targetBranchId,
      createdNodeId: newNode.nodeId,
      newCheckpointId: newNode.checkpointId,
      message: `Successfully cherry-picked '${request.filePath}' into branch '${targetBranch.name}'. New node: #${newNode.stepNumber}.`,
      diffSummary: `+1 file imported from historical exploratory branch`,
    };

    return {
      result,
      updatedFiles,
      newNode,
    };
  }
}


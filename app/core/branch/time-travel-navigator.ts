import type { BranchDAG } from "./branch-dag";
import type { TimeTravelCheckoutResult } from "./types";
import { WorkspaceTracker } from "../session/workspace-tracker";
import type { WorkspaceSnapshot } from "../session/types";

export class TimeTravelNavigator {
  constructor(
    private dag: BranchDAG,
    private snapshotRegistry: Map<string, WorkspaceSnapshot>,
    private fileStorage: Map<string, Record<string, string>> // snapshotId -> files
  ) {}

  /**
   * Register snapshot data for checkout restoration.
   */
  public registerSnapshot(
    snapshot: WorkspaceSnapshot,
    rawFiles: Record<string, string>
  ): void {
    this.snapshotRegistry.set(snapshot.id, snapshot);
    this.fileStorage.set(snapshot.id, { ...rawFiles });
  }

  /**
   * Perform time-travel checkout to an arbitrary historical node in the DAG.
   * This updates the active branch, active HEAD, and returns the target workspace files with verified SHA-256 rootHash.
   */
  public checkoutNode(
    targetNodeId: string,
    currentDiskFiles: Record<string, string>,
    options: { force?: boolean } = {}
  ): {
    result: TimeTravelCheckoutResult;
    restoredFiles: Record<string, string>;
  } {
    const node = this.dag.getNode(targetNodeId);
    if (!node) {
      throw new Error(`Target node '${targetNodeId}' not found in DAG.`);
    }

    const previousHead = this.dag.getActiveHeadNodeId();
    const previousNode = previousHead ? this.dag.getNode(previousHead) : null;

    // Check if current workspace has drift relative to previous node's snapshot
    let driftDetected = false;
    let driftMessage = "";

    if (previousNode && !options.force) {
      const prevSnapshot = this.snapshotRegistry.get(
        previousNode.workspaceSnapshotId
      );
      if (prevSnapshot) {
        const drift = WorkspaceTracker.detectDrift(
          prevSnapshot,
          currentDiskFiles
        );
        if (drift.hasDrift) {
          driftDetected = true;
          driftMessage = `Warning: uncommitted workspace drift detected (${drift.conflicts.length} files changed). Auto-aligning to target snapshot.`;
        }
      }
    }

    // Retrieve target snapshot & files
    const targetSnapshot = this.snapshotRegistry.get(node.workspaceSnapshotId);
    if (!targetSnapshot) {
      throw new Error(
        `Snapshot '${node.workspaceSnapshotId}' for node '${targetNodeId}' is missing from registry.`
      );
    }

    const targetFiles = this.fileStorage.get(node.workspaceSnapshotId);
    if (!targetFiles) {
      throw new Error(
        `Raw file payload for snapshot '${node.workspaceSnapshotId}' is missing.`
      );
    }

    // Verify SHA-256 integrity of restored files against snapshot rootHash
    const restoredVerification = WorkspaceTracker.createSnapshot(targetFiles, {
      snapshotId: "temp_verify_checkout",
    });

    if (restoredVerification.rootHash !== targetSnapshot.rootHash) {
      throw new Error(
        `Integrity failure: restored files rootHash (${restoredVerification.rootHash}) does not match target snapshot rootHash (${targetSnapshot.rootHash})!`
      );
    }

    // Move DAG active pointers
    this.dag.checkoutNode(targetNodeId);

    const result: TimeTravelCheckoutResult = {
      success: true,
      targetNodeId: node.nodeId,
      targetBranchId: node.branchId,
      previousHeadNodeId: previousHead,
      rootHash: targetSnapshot.rootHash,
      filesRestoredCount: Object.keys(targetFiles).length,
      driftDetected,
      message: driftDetected
        ? driftMessage
        : `Successfully checked out node ${node.stepNumber} [${node.branchId}]. Workspace bit-fidelity 100% verified.`,
      timestamp: Date.now(),
    };

    return {
      result,
      restoredFiles: { ...targetFiles },
    };
  }

  /**
   * Perform checkout directly to a branch HEAD.
   */
  public checkoutBranch(
    branchId: string,
    currentDiskFiles: Record<string, string>,
    options: { force?: boolean } = {}
  ): {
    result: TimeTravelCheckoutResult;
    restoredFiles: Record<string, string>;
  } {
    const branch = this.dag.getBranch(branchId);
    if (!branch) {
      throw new Error(`Branch '${branchId}' not found in DAG.`);
    }

    if (!branch.headNodeId) {
      throw new Error(`Branch '${branchId}' has no commits/nodes to checkout.`);
    }

    return this.checkoutNode(branch.headNodeId, currentDiskFiles, options);
  }
}


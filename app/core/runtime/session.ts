import type { ChatMessage } from "../llm/types";
import type { ToolExecutionResult } from "../tools/types";
import type { RuntimeState, SessionRun, SessionSnapshot } from "./types";

export class SessionManager {
  private runs: Map<string, SessionRun> = new Map();
  private snapshots: Map<string, SessionSnapshot> = new Map();

  /**
   * Create a new execution run inside the session tree.
   */
  createRun(
    inputPrompt: string,
    options: {
      branchId?: string;
      parentRunId?: string;
      metadata?: Record<string, any>;
    } = {}
  ): SessionRun {
    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const branchId = options.branchId || "main";

    const initialMessage: ChatMessage = {
      role: "user",
      content: inputPrompt,
    };

    const run: SessionRun = {
      id: runId,
      parentRunId: options.parentRunId,
      branchId,
      status: "idle",
      currentStep: 0,
      messages: [initialMessage],
      toolHistory: [],
      workspaceState: {},
      metadata: options.metadata || {},
      checkpoints: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.runs.set(runId, run);
    return run;
  }

  getRun(runId: string): SessionRun | undefined {
    return this.runs.get(runId);
  }

  updateRunStatus(runId: string, status: RuntimeState): void {
    const run = this.runs.get(runId);
    if (run) {
      run.status = status;
      run.updatedAt = Date.now();
    }
  }

  /**
   * Save a point-in-time snapshot of the session.
   * This represents a durable checkpoint at an atomic step boundary.
   */
  saveSnapshot(runId: string, stepNumber: number): SessionSnapshot | null {
    const run = this.runs.get(runId);
    if (!run) return null;

    const snapshotId = `snap_${runId}_s${stepNumber}_${Date.now()}`;
    const snapshot: SessionSnapshot = {
      snapshotId,
      runId,
      branchId: run.branchId,
      stepNumber,
      messages: JSON.parse(JSON.stringify(run.messages)),
      workspaceState: { ...run.workspaceState },
      toolHistory: JSON.parse(JSON.stringify(run.toolHistory)),
      timestamp: Date.now(),
      metadata: { ...run.metadata },
    };

    this.snapshots.set(snapshotId, snapshot);
    run.checkpoints.push(snapshot);
    run.updatedAt = Date.now();
    return snapshot;
  }

  /**
   * Restore a run from a historical snapshot, allowing the agent to resume.
   */
  restoreSnapshot(snapshotId: string): SessionRun | null {
    const snap = this.snapshots.get(snapshotId);
    if (!snap) return null;

    const restoredRunId = `run_resumed_${Date.now()}`;
    const restoredRun: SessionRun = {
      id: restoredRunId,
      parentRunId: snap.runId,
      branchId: snap.branchId,
      status: "suspended",
      currentStep: snap.stepNumber,
      messages: JSON.parse(JSON.stringify(snap.messages)),
      toolHistory: JSON.parse(JSON.stringify(snap.toolHistory)),
      workspaceState: { ...snap.workspaceState },
      metadata: {
        ...snap.metadata,
        resumedFromSnapshotId: snap.snapshotId,
      },
      checkpoints: [snap],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.runs.set(restoredRunId, restoredRun);
    return restoredRun;
  }

  /**
   * Fork a new branch from an arbitrary historical snapshot (Pi branching paradigm).
   */
  createBranch(fromSnapshotId: string, newBranchName: string): SessionRun | null {
    const snap = this.snapshots.get(fromSnapshotId);
    if (!snap) return null;

    const branchRunId = `run_branch_${newBranchName}_${Date.now()}`;
    const branchRun: SessionRun = {
      id: branchRunId,
      parentRunId: snap.runId,
      branchId: newBranchName,
      status: "idle",
      currentStep: snap.stepNumber,
      messages: JSON.parse(JSON.stringify(snap.messages)),
      toolHistory: JSON.parse(JSON.stringify(snap.toolHistory)),
      workspaceState: { ...snap.workspaceState },
      metadata: {
        forkedFrom: snap.snapshotId,
        parentBranch: snap.branchId,
      },
      checkpoints: [snap],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.runs.set(branchRunId, branchRun);
    return branchRun;
  }

  /**
   * Append messages and tool results to current run.
   */
  appendStepData(
    runId: string,
    messages: ChatMessage[],
    toolResults: ToolExecutionResult[],
    workspaceChanges?: Record<string, string>
  ): void {
    const run = this.runs.get(runId);
    if (!run) return;

    run.messages.push(...messages);
    run.toolHistory.push(...toolResults);
    if (workspaceChanges) {
      Object.assign(run.workspaceState, workspaceChanges);
    }
    run.currentStep += 1;
    run.updatedAt = Date.now();
  }

  /**
   * Get the latest snapshot for a run.
   */
  getLatestSnapshot(runId: string): SessionSnapshot | null {
    const run = this.runs.get(runId);
    if (!run) return null;

    return {
      snapshotId: `snap_latest_${runId}`,
      runId: run.id,
      branchId: run.branchId,
      stepNumber: run.currentStep,
      messages: JSON.parse(JSON.stringify(run.messages)),
      workspaceState: { ...run.workspaceState },
      toolHistory: JSON.parse(JSON.stringify(run.toolHistory)),
      timestamp: Date.now(),
      metadata: { ...run.metadata },
    };
  }
}


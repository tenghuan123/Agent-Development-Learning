import type { ChatMessage } from "../llm/types";
import type {
  Session,
  SessionBranch,
  SessionIntegrityCheckResult,
  SessionRun,
  StepCheckpoint,
  ToolExecutionRecord,
} from "./types";
import { WorkspaceTracker } from "./workspace-tracker";

export class DomainSessionManager {
  private sessions: Map<string, Session> = new Map();
  private checkpoints: Map<string, StepCheckpoint> = new Map();

  /**
   * Create a new session aggregate root with an initial 'main' branch and base workspace snapshot.
   */
  public createSession(options: {
    title: string;
    workspaceRoot?: string;
    initialFiles?: Record<string, string>;
    metadata?: Record<string, unknown>;
  }): Session {
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const workspaceRoot = options.workspaceRoot || `/workspace/${sessionId}`;
    const initialFiles = options.initialFiles || {};

    const initialSnapshot = WorkspaceTracker.createSnapshot(initialFiles, {
      snapshotId: `snap_init_${sessionId}`,
    });

    const mainBranch: SessionBranch = {
      id: "main",
      name: "main",
      baseSnapshotId: initialSnapshot.id,
      runIds: [],
      createdAt: Date.now(),
      metadata: { isDefault: true },
    };

    const session: Session = {
      id: sessionId,
      title: options.title,
      workspaceRoot,
      activeBranchId: "main",
      branches: {
        main: mainBranch,
      },
      runs: {},
      metadata: options.metadata || {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  public getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  public listSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Start a new run inside a specified branch.
   */
  public createRun(
    sessionId: string,
    prompt: string,
    options: {
      branchId?: string;
      parentRunId?: string;
      initialFiles?: Record<string, string>;
      metadata?: Record<string, unknown>;
    } = {}
  ): SessionRun {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found.`);
    }

    const branchId = options.branchId || session.activeBranchId || "main";
    const branch = session.branches[branchId];
    if (!branch) {
      throw new Error(`Branch '${branchId}' does not exist in session '${sessionId}'.`);
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const initialSnapshot = WorkspaceTracker.createSnapshot(options.initialFiles || {}, {
      snapshotId: `snap_run_start_${runId}`,
    });

    const initialUserMessage: ChatMessage = {
      role: "user",
      content: prompt,
    };

    const run: SessionRun = {
      id: runId,
      sessionId,
      branchId,
      parentRunId: options.parentRunId,
      status: "running",
      currentStep: 0,
      messages: [initialUserMessage],
      toolHistory: [],
      workspaceSnapshot: initialSnapshot,
      checkpoints: [],
      metadata: options.metadata || {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    session.runs[runId] = run;
    branch.runIds.push(runId);
    session.updatedAt = Date.now();

    return run;
  }

  /**
   * Save an atomic checkpoint for the current step.
   * Encapsulates: messages projection + tool side-effect records + workspace physical snapshot.
   */
  public saveStepCheckpoint(
    sessionId: string,
    runId: string,
    options: {
      stepNumber: number;
      messages: ChatMessage[];
      toolHistory: ToolExecutionRecord[];
      currentWorkspaceFiles: Record<string, string>;
      description?: string;
    }
  ): StepCheckpoint {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session '${sessionId}' not found.`);
    const run = session.runs[runId];
    if (!run) throw new Error(`Run '${runId}' not found in session '${sessionId}'.`);

    const checkpointId = `ckpt_${runId}_s${options.stepNumber}_${Date.now()}`;
    const workspaceSnapshot = WorkspaceTracker.createSnapshot(
      options.currentWorkspaceFiles,
      { snapshotId: `snap_${checkpointId}` }
    );

    const checkpoint: StepCheckpoint = {
      id: checkpointId,
      runId,
      stepNumber: options.stepNumber,
      timestamp: Date.now(),
      messages: JSON.parse(JSON.stringify(options.messages)),
      workspaceSnapshot,
      toolHistory: JSON.parse(JSON.stringify(options.toolHistory)),
      description: options.description,
    };

    this.checkpoints.set(checkpointId, checkpoint);
    run.checkpoints.push(checkpoint);
    run.currentStep = options.stepNumber;
    run.workspaceSnapshot = workspaceSnapshot;
    run.messages = JSON.parse(JSON.stringify(options.messages));
    run.toolHistory = JSON.parse(JSON.stringify(options.toolHistory));
    run.updatedAt = Date.now();
    session.updatedAt = Date.now();

    return checkpoint;
  }

  public getCheckpoint(checkpointId: string): StepCheckpoint | undefined {
    return this.checkpoints.get(checkpointId);
  }

  /**
   * Validate workspace integrity before resuming a session from a checkpoint.
   * Flags external file drifts and ghost reference risks.
   */
  public validateResume(
    sessionId: string,
    checkpointId: string,
    currentDiskFiles: Record<string, string>
  ): SessionIntegrityCheckResult {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session '${sessionId}' not found.`);
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) throw new Error(`Checkpoint '${checkpointId}' not found.`);

    // 1. Detect physical drift between snapshot and actual disk
    const drift = WorkspaceTracker.detectDrift(checkpoint.workspaceSnapshot, currentDiskFiles);

    // 2. Detect ghost references in messages
    const ghostCheck = WorkspaceTracker.detectGhostReferences(
      checkpoint.messages,
      currentDiskFiles
    );

    let valid = true;
    let suggestedAction: SessionIntegrityCheckResult["suggestedAction"] = "proceed";

    if (drift.hasDrift || ghostCheck.hasGhostReferences) {
      valid = false;
      if (drift.conflicts.some((c) => c.type === "missing")) {
        suggestedAction = "resync_workspace";
      } else if (drift.conflicts.some((c) => c.type === "modified")) {
        suggestedAction = "rollback";
      } else {
        suggestedAction = "resync_workspace";
      }
    }

    return {
      valid,
      sessionId,
      checkpointId,
      drift,
      ghostRisks: ghostCheck.details,
      suggestedAction,
      timestamp: Date.now(),
    };
  }

  /**
   * Fork an independent new branch from an arbitrary historical step checkpoint.
   * This is the core non-linear branching primitive (Pi Branching Paradigm).
   */
  public forkBranchFromCheckpoint(
    sessionId: string,
    checkpointId: string,
    newBranchName: string
  ): { branch: SessionBranch; run: SessionRun } {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session '${sessionId}' not found.`);
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) throw new Error(`Checkpoint '${checkpointId}' not found.`);

    const branchId = `branch_${newBranchName.toLowerCase().replace(/[^a-z0-9_-]/g, "_")}_${Date.now()}`;
    const branchRunId = `run_fork_${branchId}`;

    const newBranch: SessionBranch = {
      id: branchId,
      name: newBranchName,
      baseSnapshotId: checkpoint.workspaceSnapshot.id,
      runIds: [branchRunId],
      createdAt: Date.now(),
      metadata: {
        forkedFromCheckpointId: checkpoint.id,
        forkedFromRunId: checkpoint.runId,
        forkedStepNumber: checkpoint.stepNumber,
      },
    };

    const forkedRun: SessionRun = {
      id: branchRunId,
      sessionId,
      branchId,
      parentRunId: checkpoint.runId,
      status: "idle",
      currentStep: checkpoint.stepNumber,
      messages: JSON.parse(JSON.stringify(checkpoint.messages)),
      toolHistory: JSON.parse(JSON.stringify(checkpoint.toolHistory)),
      workspaceSnapshot: JSON.parse(JSON.stringify(checkpoint.workspaceSnapshot)),
      checkpoints: [checkpoint],
      metadata: {
        forkedFrom: checkpoint.id,
        forkedBranch: branchId,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    session.branches[branchId] = newBranch;
    session.runs[branchRunId] = forkedRun;
    session.activeBranchId = branchId;
    session.updatedAt = Date.now();

    return {
      branch: newBranch,
      run: forkedRun,
    };
  }

  /**
   * Update run status.
   */
  public updateRunStatus(
    sessionId: string,
    runId: string,
    status: SessionRun["status"]
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const run = session.runs[runId];
    if (run) {
      run.status = status;
      run.updatedAt = Date.now();
      session.updatedAt = Date.now();
    }
  }
}

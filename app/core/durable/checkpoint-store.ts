import * as fs from "fs";
import * as path from "path";
import type { CheckpointSnapshot, DurableState } from "./types";

export class CheckpointStore {
  private checkpoints: Map<string, CheckpointSnapshot> = new Map();
  private runTimeline: Map<string, string[]> = new Map(); // runId -> array of checkpointId
  private storageFile?: string;

  constructor(storageDir?: string) {
    if (storageDir) {
      if (!fs.existsSync(storageDir)) {
        try {
          fs.mkdirSync(storageDir, { recursive: true });
        } catch {
          // ignore
        }
      }
      this.storageFile = path.join(storageDir, "durable_wal_checkpoints.json");
      this.loadFromDisk();
    }
  }

  /**
   * Save a new checkpoint snapshot with parent link
   */
  public saveCheckpoint(params: {
    runId: string;
    stepIndex: number;
    nodeId: string | null;
    parentCheckpointId: string | null;
    state: DurableState;
    label: string;
    diffSummary?: string;
  }): CheckpointSnapshot {
    const timestamp = Date.now();
    const checkpointId = `cp_${params.runId}_s${params.stepIndex}_${Math.random()
      .toString(36)
      .substring(2, 7)}`;

    // Generate SHA-like idempotency state hash
    const stateString = JSON.stringify({
      nodeId: params.nodeId,
      step: params.stepIndex,
      variables: params.state.variables,
      completedNodes: params.state.completedNodeIds,
    });
    const idempotencyHash = this.computeHash(stateString);

    let diffSummary = params.diffSummary;
    if (!diffSummary && params.parentCheckpointId) {
      const parent = this.checkpoints.get(params.parentCheckpointId);
      if (parent) {
        diffSummary = this.computeDiff(parent.state, params.state);
      }
    }
    if (!diffSummary) {
      diffSummary = `Step ${params.stepIndex} initialized at node [${params.nodeId || "start"}]`;
    }

    // Deep clone state to avoid mutation reference leaks
    const stateCopy: DurableState = JSON.parse(JSON.stringify(params.state));

    const snapshot: CheckpointSnapshot = {
      checkpointId,
      runId: params.runId,
      stepIndex: params.stepIndex,
      nodeId: params.nodeId,
      parentCheckpointId: params.parentCheckpointId,
      timestamp,
      state: stateCopy,
      idempotencyHash,
      label: params.label,
      diffSummary,
    };

    this.checkpoints.set(checkpointId, snapshot);

    const timeline = this.runTimeline.get(params.runId) || [];
    timeline.push(checkpointId);
    this.runTimeline.set(params.runId, timeline);

    this.persistToDisk();
    return snapshot;
  }

  /**
   * Retrieve a specific checkpoint by ID
   */
  public getCheckpoint(checkpointId: string): CheckpointSnapshot | null {
    return this.checkpoints.get(checkpointId) || null;
  }

  /**
   * Retrieve the latest checkpoint of a run
   */
  public getLatestCheckpoint(runId: string): CheckpointSnapshot | null {
    const timeline = this.runTimeline.get(runId);
    if (!timeline || timeline.length === 0) return null;
    const latestId = timeline[timeline.length - 1];
    return this.checkpoints.get(latestId) || null;
  }

  /**
   * Get full chronological list of checkpoints for a run
   */
  public getCheckpointsForRun(runId: string): CheckpointSnapshot[] {
    const timeline = this.runTimeline.get(runId) || [];
    return timeline
      .map((id) => this.checkpoints.get(id))
      .filter((cp): cp is CheckpointSnapshot => Boolean(cp));
  }

  /**
   * Fork a new run timeline from an existing checkpoint
   */
  public forkCheckpoint(
    sourceCheckpointId: string,
    newRunId: string,
    statePatch?: Partial<DurableState>
  ): CheckpointSnapshot | null {
    const source = this.checkpoints.get(sourceCheckpointId);
    if (!source) return null;

    const forkedState: DurableState = JSON.parse(JSON.stringify(source.state));
    forkedState.runId = newRunId;
    forkedState.status = "idle";
    forkedState.logs.push({
      timestamp: Date.now(),
      level: "checkpoint",
      message: `Forked from Checkpoint [${sourceCheckpointId}] (Step ${source.stepIndex})`,
    });

    if (statePatch) {
      if (statePatch.variables) {
        forkedState.variables = {
          ...forkedState.variables,
          ...statePatch.variables,
        };
      }
      if (statePatch.goal) {
        forkedState.goal = statePatch.goal;
      }
    }

    return this.saveCheckpoint({
      runId: newRunId,
      stepIndex: source.stepIndex,
      nodeId: source.nodeId,
      parentCheckpointId: sourceCheckpointId,
      state: forkedState,
      label: `Fork of Step ${source.stepIndex}`,
      diffSummary: `Branched from ${source.checkpointId} with state modifications`,
    });
  }

  /**
   * Clear checkpoints
   */
  public clear(runId?: string) {
    if (runId) {
      const timeline = this.runTimeline.get(runId) || [];
      for (const id of timeline) {
        this.checkpoints.delete(id);
      }
      this.runTimeline.delete(runId);
    } else {
      this.checkpoints.clear();
      this.runTimeline.clear();
    }
    this.persistToDisk();
  }

  private computeHash(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    return `h_${Math.abs(hash).toString(16).padStart(8, "0")}`;
  }

  private computeDiff(prev: DurableState, current: DurableState): string {
    const changedVars: string[] = [];
    const prevVars = prev.variables || {};
    const currVars = current.variables || {};

    const allKeys = Array.from(
      new Set([...Object.keys(prevVars), ...Object.keys(currVars)])
    );
    for (const key of allKeys) {
      if (JSON.stringify(prevVars[key]) !== JSON.stringify(currVars[key])) {
        changedVars.push(
          `${key}: ${JSON.stringify(prevVars[key])} -> ${JSON.stringify(
            currVars[key]
          )}`
        );
      }
    }

    const newCompleted = current.completedNodeIds.filter(
      (id) => !prev.completedNodeIds.includes(id)
    );

    const parts: string[] = [];
    if (newCompleted.length > 0) {
      parts.push(`Completed: [${newCompleted.join(", ")}]`);
    }
    if (changedVars.length > 0) {
      parts.push(`Vars: { ${changedVars.slice(0, 3).join("; ")} }`);
    }
    return parts.length > 0 ? parts.join(" | ") : "No variable diff";
  }

  private persistToDisk() {
    if (!this.storageFile) return;
    try {
      const serialized = JSON.stringify(
        {
          checkpoints: Array.from(this.checkpoints.entries()),
          timelines: Array.from(this.runTimeline.entries()),
        },
        null,
        2
      );
      fs.writeFileSync(this.storageFile, serialized, "utf-8");
    } catch {
      // Ignore disk write errors in ephemeral environments
    }
  }

  private loadFromDisk() {
    if (!this.storageFile || !fs.existsSync(this.storageFile)) return;
    try {
      const content = fs.readFileSync(this.storageFile, "utf-8");
      const data = JSON.parse(content);
      if (Array.isArray(data.checkpoints)) {
        this.checkpoints = new Map(data.checkpoints);
      }
      if (Array.isArray(data.timelines)) {
        this.runTimeline = new Map(data.timelines);
      }
    } catch {
      // Ignore disk load errors
    }
  }
}


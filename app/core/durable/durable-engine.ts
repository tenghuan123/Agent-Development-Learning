import type {
  CheckpointSnapshot,
  CrashInjectionConfig,
  DurableEngineEvent,
  DurableState,
  WorkflowDefinition,
  WorkflowNode,
} from "./types";
import { CheckpointStore } from "./checkpoint-store";
import { IdempotencyVault } from "./idempotency-vault";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class DurableEngine {
  private checkpointStore: CheckpointStore;
  private idempotencyVault: IdempotencyVault;

  constructor(
    checkpointStore?: CheckpointStore,
    idempotencyVault?: IdempotencyVault
  ) {
    this.checkpointStore = checkpointStore || new CheckpointStore();
    this.idempotencyVault = idempotencyVault || new IdempotencyVault();
  }

  public getCheckpointStore(): CheckpointStore {
    return this.checkpointStore;
  }

  public getIdempotencyVault(): IdempotencyVault {
    return this.idempotencyVault;
  }

  /**
   * Start a new durable workflow execution with optional crash injection
   */
  public async startRun(params: {
    workflow: WorkflowDefinition;
    goal: string;
    runId?: string;
    crashConfig?: CrashInjectionConfig;
    onEvent?: (event: DurableEngineEvent) => void;
  }): Promise<{ state: DurableState; latestCheckpoint: CheckpointSnapshot | null }> {
    const runId =
      params.runId ||
      `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const initialState: DurableState = {
      runId,
      goal: params.goal,
      currentNodeId: null,
      completedNodeIds: [],
      variables: {
        startedAt: Date.now(),
        workflowId: params.workflow.id,
      },
      messages: [
        {
          role: "user",
          content: `Execute durable workflow: ${params.workflow.name}. Goal: ${params.goal}`,
        },
      ],
      logs: [
        {
          timestamp: Date.now(),
          level: "wal",
          message: `[WAL] Initialized Durable State Machine for run [${runId}].`,
        },
      ],
      status: "running",
      metrics: {
        totalSteps: 0,
        checkpointsSaved: 0,
        idempotentReplays: 0,
        sideEffectsExecuted: 0,
      },
    };

    // Save initial Checkpoint 0
    const cp0 = this.checkpointStore.saveCheckpoint({
      runId,
      stepIndex: 0,
      nodeId: null,
      parentCheckpointId: null,
      state: initialState,
      label: "Step 0: Workflow Initialized",
      diffSummary: "Initialized graph state",
    });

    initialState.metrics.checkpointsSaved += 1;

    this.emitEvent(params.onEvent, {
      type: "run_start",
      runId,
      stepIndex: 0,
      message: `Workflow started: ${params.workflow.name}`,
      timestamp: Date.now(),
      checkpointId: cp0.checkpointId,
      stateSnapshot: initialState,
    });

    return this.executeFromNode({
      workflow: params.workflow,
      currentState: initialState,
      currentNodeId: params.workflow.startNodeId,
      parentCheckpointId: cp0.checkpointId,
      stepIndex: 1,
      crashConfig: params.crashConfig,
      onEvent: params.onEvent,
    });
  }

  /**
   * Resume workflow execution from a checkpoint snapshot (Disaster Recovery)
   */
  public async resumeRun(params: {
    workflow: WorkflowDefinition;
    checkpointId: string;
    onEvent?: (event: DurableEngineEvent) => void;
  }): Promise<{ state: DurableState; latestCheckpoint: CheckpointSnapshot | null }> {
    const targetCheckpoint = this.checkpointStore.getCheckpoint(
      params.checkpointId
    );
    if (!targetCheckpoint) {
      throw new Error(`Checkpoint [${params.checkpointId}] not found!`);
    }

    const state: DurableState = JSON.parse(
      JSON.stringify(targetCheckpoint.state)
    );
    state.status = "running";
    delete state.crashInfo;

    state.logs.push({
      timestamp: Date.now(),
      level: "checkpoint",
      message: `[RECOVERY] Resumed execution from Checkpoint [${targetCheckpoint.checkpointId}] (Step ${targetCheckpoint.stepIndex}).`,
    });

    this.emitEvent(params.onEvent, {
      type: "resumed",
      runId: state.runId,
      stepIndex: targetCheckpoint.stepIndex,
      nodeId: targetCheckpoint.nodeId || undefined,
      checkpointId: targetCheckpoint.checkpointId,
      message: `Resumed from Checkpoint ${targetCheckpoint.checkpointId}`,
      timestamp: Date.now(),
      stateSnapshot: state,
    });

    // Determine the next node to execute
    let nextNodeId: string | null = null;
    if (!targetCheckpoint.nodeId) {
      nextNodeId = params.workflow.startNodeId;
    } else {
      // Find outgoing edge
      const edge = params.workflow.edges.find(
        (e) => e.from === targetCheckpoint.nodeId
      );
      if (edge) {
        nextNodeId = edge.to;
      }
    }

    if (!nextNodeId) {
      state.status = "completed";
      return { state, latestCheckpoint: targetCheckpoint };
    }

    return this.executeFromNode({
      workflow: params.workflow,
      currentState: state,
      currentNodeId: nextNodeId,
      parentCheckpointId: targetCheckpoint.checkpointId,
      stepIndex: targetCheckpoint.stepIndex + 1,
      crashConfig: undefined, // Clear crash config upon resume
      onEvent: params.onEvent,
    });
  }

  /**
   * Execute "Naive Restart" (Without Checkpointing) to visibly demonstrate the disaster:
   * Re-running non-idempotent operations without cache check triggers fatal database / external collisions.
   */
  public async naiveRestart(params: {
    workflow: WorkflowDefinition;
    runId: string;
    onEvent?: (event: DurableEngineEvent) => void;
  }): Promise<{ success: boolean; error?: string; logs: string[] }> {
    const logs: string[] = [];
    logs.push(`[NAIVE RESTART] Process blindly restarting from Step 1 without durable checkpointing...`);

    for (let i = 0; i < params.workflow.nodes.length; i++) {
      const node = params.workflow.nodes[i];
      logs.push(`\n>>> Attempting to execute Step ${i + 1}: ${node.name}...`);
      await sleep(400);

      if (node.isSideEffect) {
        // Look up whether this side effect was already performed in previous runs
        const existingRecords = this.idempotencyVault.getAllRecords(params.runId);
        const collisionRecord = existingRecords.find(
          (r) => r.actionName === node.actionName
        );

        if (collisionRecord) {
          const collisionMsg = this.idempotencyVault.simulateCollisionError(
            node.actionName,
            collisionRecord.args
          );
          logs.push(`💥 [FATAL CRASH] ${collisionMsg}`);
          logs.push(
            `🚨 [DISASTER EXPLANATION] Because Naive Restart lacks an Idempotency Vault, it blindly re-executed '${node.actionName}', colliding with live production state!`
          );
          return {
            success: false,
            error: collisionMsg,
            logs,
          };
        }
      }

      logs.push(`✓ Step ${i + 1} succeeded.`);
    }

    return {
      success: true,
      logs,
    };
  }

  /**
   * Core node-by-node execution loop with crash interception and checkpointing
   */
  private async executeFromNode(params: {
    workflow: WorkflowDefinition;
    currentState: DurableState;
    currentNodeId: string;
    parentCheckpointId: string;
    stepIndex: number;
    crashConfig?: CrashInjectionConfig;
    onEvent?: (event: DurableEngineEvent) => void;
  }): Promise<{ state: DurableState; latestCheckpoint: CheckpointSnapshot | null }> {
    let state = params.currentState;
    let currNodeId: string | null = params.currentNodeId;
    let parentCpId = params.parentCheckpointId;
    let step = params.stepIndex;
    let latestCp: CheckpointSnapshot | null = null;

    while (currNodeId) {
      const node = params.workflow.nodes.find((n) => n.id === currNodeId);
      if (!node) {
        throw new Error(`Node [${currNodeId}] not found in workflow!`);
      }

      state.currentNodeId = currNodeId;
      state.metrics.totalSteps += 1;

      this.emitEvent(params.onEvent, {
        type: "node_start",
        runId: state.runId,
        stepIndex: step,
        nodeId: node.id,
        message: `Starting Step ${step}: ${node.name}`,
        timestamp: Date.now(),
        stateSnapshot: state,
      });

      // 1. Crash Injection Check: BEFORE ACTION
      if (
        params.crashConfig?.enabled &&
        params.crashConfig.crashAtStep === step &&
        params.crashConfig.timing === "before_action"
      ) {
        state.status = "crashed";
        state.crashInfo = {
          step,
          nodeId: node.id,
          reason: params.crashConfig.reason || "Simulated Kernel Panic / Out of Memory",
          timestamp: Date.now(),
        };
        state.logs.push({
          timestamp: Date.now(),
          level: "error",
          message: `💥 [SIMULATED CRASH] Process killed before action in node [${node.id}]: ${state.crashInfo.reason}`,
        });

        this.emitEvent(params.onEvent, {
          type: "crashed",
          runId: state.runId,
          stepIndex: step,
          nodeId: node.id,
          message: `Process crashed at Step ${step} before action`,
          timestamp: Date.now(),
          details: state.crashInfo,
          stateSnapshot: state,
        });

        return { state, latestCheckpoint: latestCp };
      }

      // Simulate execution time
      await sleep(node.estimatedDurationMs || 300);

      // 2. Execute Node logic with side-effect tracking via IdempotencyVault
      const nodeResult = await node.execute(
        state,
        async (actionName, args, executor) => {
          this.emitEvent(params.onEvent, {
            type: "action_executing",
            runId: state.runId,
            stepIndex: step,
            nodeId: node.id,
            message: `Executing action [${actionName}] with idempotency check`,
            timestamp: Date.now(),
          });

          const vaultResult = await this.idempotencyVault.executeWithIdempotency({
            runId: state.runId,
            nodeId: node.id,
            actionName,
            args,
            isSideEffect: node.isSideEffect,
            executor,
          });

          if (vaultResult.fromCache) {
            state.metrics.idempotentReplays += 1;
            state.logs.push({
              timestamp: Date.now(),
              level: "idempotent",
              message: `[IDEMPOTENCY] Replayed cached output for [${actionName}] (Key: ${vaultResult.key}). Avoided duplicate external mutation.`,
            });
            this.emitEvent(params.onEvent, {
              type: "action_cached",
              runId: state.runId,
              stepIndex: step,
              nodeId: node.id,
              message: `Replayed cached side effect: ${actionName}`,
              timestamp: Date.now(),
            });
          } else {
            state.metrics.sideEffectsExecuted += 1;
          }

          return vaultResult;
        }
      );

      // 3. Apply state patch
      if (nodeResult.statePatch.variables) {
        state.variables = {
          ...state.variables,
          ...nodeResult.statePatch.variables,
        };
      }
      if (nodeResult.logs) {
        for (const l of nodeResult.logs) {
          state.logs.push({
            timestamp: Date.now(),
            level: "info",
            message: l,
          });
        }
      }
      if (!state.completedNodeIds.includes(node.id)) {
        state.completedNodeIds.push(node.id);
      }

      // 4. Save Checkpoint (WAL atomic snapshot)
      const cp = this.checkpointStore.saveCheckpoint({
        runId: state.runId,
        stepIndex: step,
        nodeId: node.id,
        parentCheckpointId: parentCpId,
        state,
        label: `Step ${step}: ${node.name}`,
        diffSummary: nodeResult.outputSummary,
      });

      parentCpId = cp.checkpointId;
      latestCp = cp;
      state.metrics.checkpointsSaved += 1;

      state.logs.push({
        timestamp: Date.now(),
        level: "wal",
        message: `[WAL] Saved atomic Checkpoint [${cp.checkpointId}] (Parent: ${cp.parentCheckpointId || "none"}).`,
      });

      this.emitEvent(params.onEvent, {
        type: "checkpoint_saved",
        runId: state.runId,
        stepIndex: step,
        nodeId: node.id,
        checkpointId: cp.checkpointId,
        message: `Checkpoint ${cp.checkpointId} committed to WAL`,
        timestamp: Date.now(),
        stateSnapshot: state,
      });

      // 5. Crash Injection Check: AFTER ACTION
      if (
        params.crashConfig?.enabled &&
        params.crashConfig.crashAtStep === step &&
        params.crashConfig.timing === "after_action"
      ) {
        state.status = "crashed";
        state.crashInfo = {
          step,
          nodeId: node.id,
          reason: params.crashConfig.reason || "Simulated Fatal Host Shutdown",
          timestamp: Date.now(),
        };
        state.logs.push({
          timestamp: Date.now(),
          level: "error",
          message: `💥 [SIMULATED CRASH] Process killed immediately after completing node [${node.id}]: ${state.crashInfo.reason}`,
        });

        this.emitEvent(params.onEvent, {
          type: "crashed",
          runId: state.runId,
          stepIndex: step,
          nodeId: node.id,
          message: `Process crashed at Step ${step} after action`,
          timestamp: Date.now(),
          details: state.crashInfo,
          stateSnapshot: state,
        });

        return { state, latestCheckpoint: latestCp };
      }

      this.emitEvent(params.onEvent, {
        type: "node_completed",
        runId: state.runId,
        stepIndex: step,
        nodeId: node.id,
        message: `Completed Step ${step}: ${node.name}`,
        timestamp: Date.now(),
        stateSnapshot: state,
      });

      // 6. Transition to next node
      const edge = params.workflow.edges.find((e) => e.from === node.id);
      currNodeId = edge ? edge.to : null;
      step += 1;
    }

    state.status = "completed";
    state.currentNodeId = null;
    state.logs.push({
      timestamp: Date.now(),
      level: "wal",
      message: `[COMPLETED] Durable Workflow execution completed all ${state.completedNodeIds.length} nodes successfully.`,
    });

    this.emitEvent(params.onEvent, {
      type: "run_completed",
      runId: state.runId,
      stepIndex: step - 1,
      message: `Workflow completed successfully!`,
      timestamp: Date.now(),
      stateSnapshot: state,
    });

    return { state, latestCheckpoint: latestCp };
  }

  private emitEvent(
    callback?: (event: DurableEngineEvent) => void,
    event?: DurableEngineEvent
  ) {
    if (callback && event) {
      try {
        callback(event);
      } catch {
        // ignore callback error
      }
    }
  }
}


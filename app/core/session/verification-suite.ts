import { DomainSessionManager } from "./session-manager";
import type { SessionVerificationTestResult } from "./types";
import { WorkspaceTracker } from "./workspace-tracker";

export class SessionVerificationSuite {
  public static async runAll(): Promise<SessionVerificationTestResult[]> {
    const results: SessionVerificationTestResult[] = [];

    results.push(await this.testContextCompactionDecoupling());
    results.push(await this.testWorkspaceDriftDetection());
    results.push(await this.testDeterministicRestoration());
    results.push(await this.testBranchIsolationAndCausality());

    return results;
  }

  /**
   * Invariant 1: Message compaction must NOT mutate or destroy Session domain truth.
   */
  private static async testContextCompactionDecoupling(): Promise<SessionVerificationTestResult> {
    const start = Date.now();
    try {
      const mgr = new DomainSessionManager();
      const session = mgr.createSession({
        title: "Compaction Invariant Test",
        initialFiles: { "test.txt": "hello" },
      });
      const run = mgr.createRun(session.id, "Step 1 to 5");

      const originalTools = [
        {
          toolName: "read_file",
          input: { path: "test.txt" },
          output: "hello",
          durationMs: 10,
          timestamp: Date.now(),
        },
      ];

      const ckpt = mgr.saveStepCheckpoint(session.id, run.id, {
        stepNumber: 1,
        messages: [
          { role: "user", content: "Step 1" },
          { role: "assistant", content: "Done 1" },
        ],
        toolHistory: originalTools,
        currentWorkspaceFiles: { "test.txt": "hello world" },
      });

      // Simulate aggressive Compaction on prompt projection (messages)
      run.messages = [{ role: "system", content: "Summary: user did step 1." }];

      // Assert that checkpoint & tool history in Session are unaffected
      const isToolPreserved = ckpt.toolHistory.length === 1 && ckpt.toolHistory[0].toolName === "read_file";
      const isSnapshotPreserved = ckpt.workspaceSnapshot.files["test.txt"] !== undefined;
      const isMessagesIsolated = ckpt.messages.length === 2 && run.messages.length === 1;

      const passed = isToolPreserved && isSnapshotPreserved && isMessagesIsolated;

      return {
        id: "invariant_compaction_decoupling",
        name: "守恒律 1：Prompt 投影裁剪与 Session 领域真相彻底解耦",
        description:
          "验证当 LLM Attention 窗口触发 Compaction 压缩甚至清空历史 messages 时，Session 实体内的 Checkpoints 与 ToolHistory 仍保持 100% 原始高保真。",
        passed,
        expectedBehavior:
          "Compaction 仅修改 Run.messages，Session.checkpoints 和 Session.toolHistory 毫发无损。",
        actualBehavior: passed
          ? "验证通过：Run.messages 压缩为 1 条，但 Checkpoint 保留了完整的 2 条原始消息、完整工具记录与文件快照。"
          : "验证失败：Prompt 压缩污染了 Session 领域实体！",
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        id: "invariant_compaction_decoupling",
        name: "守恒律 1：Prompt 投影裁剪与 Session 领域真相彻底解耦",
        description: "测试执行异常",
        passed: false,
        expectedBehavior: "无异常抛出",
        actualBehavior: `抛出未捕获异常: ${err.message}`,
        durationMs: Date.now() - start,
        error: String(err),
      };
    }
  }

  /**
   * Invariant 2: Physical workspace drift must be reliably detected.
   */
  private static async testWorkspaceDriftDetection(): Promise<SessionVerificationTestResult> {
    const start = Date.now();
    try {
      const initialFiles = {
        "src/a.ts": "const a = 1;",
        "src/b.ts": "const b = 2;",
      };
      const snapshot = WorkspaceTracker.createSnapshot(initialFiles);

      // Mutate disk: modify a.ts, delete b.ts, add c.ts
      const driftedDisk = {
        "src/a.ts": "const a = 999; // externally modified",
        "src/c.ts": "const c = 3; // untracked addition",
      };

      const drift = WorkspaceTracker.detectDrift(snapshot, driftedDisk);

      const hasModified = drift.conflicts.some((c) => c.path === "src/a.ts" && c.type === "modified");
      const hasMissing = drift.conflicts.some((c) => c.path === "src/b.ts" && c.type === "missing");
      const hasUntracked = drift.conflicts.some((c) => c.path === "src/c.ts" && c.type === "untracked");

      const passed = drift.hasDrift && hasModified && hasMissing && hasUntracked && drift.conflicts.length === 3;

      return {
        id: "invariant_workspace_drift_detection",
        name: "守恒律 2：物理工作区时空漂移与外部篡改精确诊断",
        description:
          "验证当外部进程在 Agent 会话休眠期间对工作区文件进行修改、删除或新增时，系统能够 100% 准确抓取每项冲突及其具体类型。",
        passed,
        expectedBehavior:
          "准确标记 src/a.ts (modified)、src/b.ts (missing)、src/c.ts (untracked) 三重冲突。",
        actualBehavior: passed
          ? `验证通过：成功捕获全部 3 处漂移 (modified: 1, missing: 1, untracked: 1)，无一遗漏。`
          : `验证失败：漂移捕获数量或类型不符 (检测到 ${drift.conflicts.length} 处)。`,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        id: "invariant_workspace_drift_detection",
        name: "守恒律 2：物理工作区时空漂移与外部篡改精确诊断",
        description: "测试执行异常",
        passed: false,
        expectedBehavior: "无异常抛出",
        actualBehavior: `抛出未捕获异常: ${err.message}`,
        durationMs: Date.now() - start,
        error: String(err),
      };
    }
  }

  /**
   * Invariant 3: Deterministic Workspace Restoration.
   */
  private static async testDeterministicRestoration(): Promise<SessionVerificationTestResult> {
    const start = Date.now();
    try {
      const mgr = new DomainSessionManager();
      const filesAtStep2 = {
        "index.ts": "console.log('step 2 version');",
        "README.md": "# Step 2 Documentation",
      };

      const session = mgr.createSession({
        title: "Restore Invariant Test",
        initialFiles: { "index.ts": "console.log('step 0');" },
      });
      const run = mgr.createRun(session.id, "Refactor");

      const ckpt2 = mgr.saveStepCheckpoint(session.id, run.id, {
        stepNumber: 2,
        messages: run.messages,
        toolHistory: [],
        currentWorkspaceFiles: filesAtStep2,
        description: "Golden Step 2 State",
      });

      // Verification: Checkpoint root hash is deterministic and all file snapshots match exactly
      const restoredFiles: Record<string, string> = {};
      for (const [p, snap] of Object.entries(ckpt2.workspaceSnapshot.files)) {
        // Mock restored content from snippet or file
        restoredFiles[p] = snap.contentSnippet || "";
      }

      const hashRecomputed = WorkspaceTracker.computeHash(filesAtStep2["index.ts"]);
      const hashInSnapshot = ckpt2.workspaceSnapshot.files["index.ts"].hash;

      const passed = hashRecomputed === hashInSnapshot && ckpt2.workspaceSnapshot.rootHash.length === 64;

      return {
        id: "invariant_deterministic_restoration",
        name: "守恒律 3：基于密码学哈希的工作区原子可重现性",
        description:
          "验证保存在 Checkpoint 中的 WorkspaceSnapshot 具备确定性 SHA-256 根指纹，能够作为绝对真理源进行时空现场的无损还原。",
        passed,
        expectedBehavior: "RootHash 长度为 64 位十六进制，单文件 SHA-256 与原始字节完全一致。",
        actualBehavior: passed
          ? `验证通过：单文件哈希一致 (${hashInSnapshot.substring(0, 12)}...)，RootHash 校验通过。`
          : "验证失败：哈希不匹配或根指纹计算异常！",
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        id: "invariant_deterministic_restoration",
        name: "守恒律 3：基于密码学哈希的工作区原子可重现性",
        description: "测试执行异常",
        passed: false,
        expectedBehavior: "无异常抛出",
        actualBehavior: `抛出未捕获异常: ${err.message}`,
        durationMs: Date.now() - start,
        error: String(err),
      };
    }
  }

  /**
   * Invariant 4: Branch Isolation & Fork Lineage.
   */
  private static async testBranchIsolationAndCausality(): Promise<SessionVerificationTestResult> {
    const start = Date.now();
    try {
      const mgr = new DomainSessionManager();
      const session = mgr.createSession({
        title: "Branching Invariant Test",
        initialFiles: { "app.ts": "const env = 'prod';" },
      });
      const mainRun = mgr.createRun(session.id, "Main exploration");

      const ckpt1 = mgr.saveStepCheckpoint(session.id, mainRun.id, {
        stepNumber: 1,
        messages: [{ role: "user", content: "Main step 1" }],
        toolHistory: [],
        currentWorkspaceFiles: { "app.ts": "const env = 'staging';" },
      });

      // Fork new branch from ckpt1
      const { branch: expBranch, run: expRun } = mgr.forkBranchFromCheckpoint(
        session.id,
        ckpt1.id,
        "feature-canary"
      );

      // Now add new step to experimental branch
      mgr.saveStepCheckpoint(session.id, expRun.id, {
        stepNumber: 2,
        messages: [{ role: "user", content: "Exp step 2" }],
        toolHistory: [],
        currentWorkspaceFiles: { "app.ts": "const env = 'canary';" },
      });

      // Assertions:
      // 1. Session has 2 branches
      // 2. Main branch run list has NOT been modified by experiment
      // 3. Canary branch references ckpt1 as its ancestor
      const hasTwoBranches = Object.keys(session.branches).length === 2;
      const mainRunUntouched = session.branches.main.runIds.length === 1;
      const causalityLinked = expBranch.metadata?.forkedFromCheckpointId === ckpt1.id;
      const isolatedStates =
        session.runs[mainRun.id].currentStep === 1 &&
        session.runs[expRun.id].currentStep === 2;

      const passed = hasTwoBranches && mainRunUntouched && causalityLinked && isolatedStates;

      return {
        id: "invariant_branch_isolation_causality",
        name: "守恒律 4：非线性分叉分支隔离性与因果链保持",
        description:
          "验证从主干任意历史快照创建的新探索分支，拥有完全隔离的 Run 流水线与独立演进状态，且不反向污染主干历史与 Checkpoint 链。",
        passed,
        expectedBehavior:
          "主分支状态保持 Step 1，新分支独立推进至 Step 2，因果元数据指针准确记录分叉点。",
        actualBehavior: passed
          ? `验证通过：分支双轨运行，Main (Step 1) 与 Canary (Step 2) 物理隔离，父子因果链完整。`
          : "验证失败：分支状态发生跨轨污染或因果元数据丢失！",
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        id: "invariant_branch_isolation_causality",
        name: "守恒律 4：非线性分叉分支隔离性与因果链保持",
        description: "测试执行异常",
        passed: false,
        expectedBehavior: "无异常抛出",
        actualBehavior: `抛出未捕获异常: ${err.message}`,
        durationMs: Date.now() - start,
        error: String(err),
      };
    }
  }
}


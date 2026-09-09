import { performance } from "node:perf_hooks";
import type { BranchVerificationResult, InvariantAssertionStep } from "./types";
import { BranchDAG } from "./branch-dag";
import { TimeTravelNavigator } from "./time-travel-navigator";
import { CherryPicker } from "./cherry-picker";
import { WorkspaceTracker } from "../session/workspace-tracker";
import type { WorkspaceSnapshot } from "../session/types";

export class BranchVerificationSuite {
  public static async runAll(faultInjection: string = "none"): Promise<BranchVerificationResult[]> {
    const results: BranchVerificationResult[] = [];

    results.push(await this.testHistoricalRetentionInvariant(faultInjection));
    results.push(await this.testCausalityLineageAndLCA(faultInjection));
    results.push(await this.testTimeTravelBitFidelity(faultInjection));
    results.push(await this.testCrossBranchCherryPickAtomicity(faultInjection));

    return results;
  }

  /**
   * Invariant 1: Non-destructive Historical Retention
   * Forking or advancing a new branch MUST NOT mutate or erase any historical nodes on parent branch.
   */
  private static async testHistoricalRetentionInvariant(
    faultInjection: string = "none"
  ): Promise<BranchVerificationResult> {
    const start = performance.now();
    const steps: InvariantAssertionStep[] = [];
    try {
      const dag = new BranchDAG();
      const snapRegistry = new Map<string, WorkspaceSnapshot>();
      const fileStorage = new Map<string, Record<string, string>>();

      const initialFiles = { "app.ts": "export const version = 1;" };
      const snap1 = WorkspaceTracker.createSnapshot(initialFiles, { snapshotId: "s1" });
      snapRegistry.set(snap1.id, snap1);
      fileStorage.set(snap1.id, initialFiles);

      dag.initMainBranch({
        nodeId: "n1",
        parentNodeId: null,
        branchId: "main",
        runId: "r1",
        stepNumber: 1,
        checkpointId: "c1",
        timestamp: Date.now() - 1000,
        summary: "Step 1: Init architecture",
        role: "assistant",
        workspaceSnapshotId: snap1.id,
        rootHash: snap1.rootHash,
        filesModified: ["app.ts"],
        metrics: { testsPassed: true },
      });

      steps.push({
        name: "1. 拓扑基底初始化 (Main Branch Init)",
        expected: "main.headNodeId === 'n1', main.nodes.length === 1",
        actual: `main.headNodeId = '${dag.getBranch("main")?.headNodeId}', nodes = ${dag.getBranchNodes("main").length}`,
        passed: dag.getBranch("main")?.headNodeId === "n1",
        details: `已注册根节点 n1，快照哈希: ${snap1.rootHash.substring(0, 16)}...`,
      });

      // Add step 2 on main
      const s2Files = { "app.ts": "export const version = 2;" };
      const snap2 = WorkspaceTracker.createSnapshot(s2Files, { snapshotId: "s2" });
      snapRegistry.set(snap2.id, snap2);
      fileStorage.set(snap2.id, s2Files);

      dag.addNode({
        nodeId: "n2",
        parentNodeId: "n1",
        branchId: "main",
        runId: "r1",
        stepNumber: 2,
        checkpointId: "c2",
        timestamp: Date.now() - 500,
        summary: "Step 2: Add features",
        role: "assistant",
        workspaceSnapshotId: snap2.id,
        rootHash: snap2.rootHash,
        filesModified: ["app.ts"],
        metrics: { testsPassed: true },
      });

      steps.push({
        name: "2. 主干节点前向推进 (Advance Main Branch)",
        expected: "main.headNodeId === 'n2', n2.parentNodeId === 'n1'",
        actual: `HEAD = '${dag.getBranch("main")?.headNodeId}', parent = '${dag.getNode("n2")?.parentNodeId}'`,
        passed: dag.getBranch("main")?.headNodeId === "n2" && dag.getNode("n2")?.parentNodeId === "n1",
        details: `主干演进链路确立: [n1 (root)] -> [n2 (head)]`,
      });

      // Fork new branch from n1
      const canary = dag.forkBranch({
        newBranchName: "canary-v1",
        forkFromNodeId: "n1",
      });

      // Advance canary branch
      const s3Files = { "app.ts": "export const version = 'canary-v3';" };
      const snap3 = WorkspaceTracker.createSnapshot(s3Files, { snapshotId: "s3" });
      snapRegistry.set(snap3.id, snap3);
      fileStorage.set(snap3.id, s3Files);

      dag.addNode({
        nodeId: "n3_canary",
        parentNodeId: "n1",
        branchId: canary.branchId,
        runId: "r_canary",
        stepNumber: 2,
        checkpointId: "c3",
        timestamp: Date.now(),
        summary: "Canary Step 2: Experimental fork",
        role: "assistant",
        workspaceSnapshotId: snap3.id,
        rootHash: snap3.rootHash,
        filesModified: ["app.ts"],
        metrics: { testsPassed: true },
      });

      steps.push({
        name: "3. 衍生平行分支推演 (Fork & Advance Canary Branch)",
        expected: `canary.headNodeId === 'n3_canary', canary.forkPoint === 'n1'`,
        actual: `HEAD = '${dag.getBranch(canary.branchId)?.headNodeId}', parent = '${dag.getNode("n3_canary")?.parentNodeId}'`,
        passed: dag.getBranch(canary.branchId)?.headNodeId === "n3_canary",
        details: `从历史节点 n1 分叉出独立分支 ${canary.name}，推进节点 n3_canary`,
      });

      // === Chaos Fault Injection ===
      if (faultInjection === "corrupt_history") {
        const main = dag.getBranch("main")!;
        (main as any).headNodeId = "n3_canary"; // Simulate HEAD corruption bug
        (dag.getNode("n1") as any).summary = "[MALICIOUS MUTATION] Historical state wiped";
      }

      const mainBranch = dag.getBranch("main")!;
      const mainNodes = dag.getBranchNodes("main");
      const n1Node = dag.getNode("n1");

      const headUnchanged = mainBranch.headNodeId === "n2";
      steps.push({
        name: "4. 主干 HEAD 指针防篡改断言 (Head Immutability Assertion)",
        expected: "main.headNodeId === 'n2'",
        actual: `main.headNodeId === '${mainBranch.headNodeId}'`,
        passed: headUnchanged,
        details: headUnchanged
          ? "新分支 canary 独立演进未对主干 HEAD 产生副作用漂移。"
          : "【故障拦截】检测到主干 HEAD 发生非法重定向！被污染为: " + mainBranch.headNodeId,
      });

      const historyUnmutated =
        n1Node?.summary === "Step 1: Init architecture" && dag.getNode("n2")?.parentNodeId === "n1";
      steps.push({
        name: "5. 历史快照只读性与父指针拓扑断言 (Historical Read-Only Assertion)",
        expected: "n1.summary intact && n2.parentNode === 'n1'",
        actual: `n1.summary = '${n1Node?.summary?.substring(0, 30)}...', n2.parent = '${dag.getNode("n2")?.parentNodeId}'`,
        passed: historyUnmutated,
        details: historyUnmutated
          ? "历史节点 n1 与拓扑父指针保持绝对只读不可变。"
          : "【故障拦截】历史快照节点内容遭到覆写或父指针断开！",
      });

      const countCorrect = mainNodes.length === 2 && dag.getAllNodes().length === 3;
      steps.push({
        name: "6. 拓扑隔离与多路节点总数校验 (Topological Isolation Assertion)",
        expected: "mainNodes.length = 2, totalDAGNodes = 3",
        actual: `mainNodes.length = ${mainNodes.length}, totalDAGNodes = ${dag.getAllNodes().length}`,
        passed: countCorrect,
        details: `DAG 包含主干 2 个历史节点与 canary 1 个探索节点，各自分水岭清晰。`,
      });

      const passed = headUnchanged && historyUnmutated && countCorrect;
      const end = performance.now();
      const durationMs = Math.round((end - start) * 100) / 100;

      return {
        id: "invariant_historical_retention",
        name: "守恒律 1：非破坏性历史保留律 (Non-destructive Retention)",
        description:
          "验证从主分支任意历史快照创建并演进新探索分支时，主分支的历史节点、HEAD 指针和 Checkpoint 链 100% 保持只读不可篡改。",
        passed,
        expectedBehavior: "主分支节点数保持为 2，HEAD 指向 n2，主分支历史节点不受新分支写入影响。",
        actualBehavior: passed
          ? `验证通过：主干保持完整 (HEAD: n2)，新分支独立演进 (HEAD: n3_canary)，DAG 总节点数正常递增为 3。`
          : `验证失败【契约违背】：检测到主干历史遭到篡改（主干 HEAD 被污染为 ${mainBranch.headNodeId}）！`,
        durationMs: Math.max(0.01, durationMs),
        durationUs: Math.round((end - start) * 1000),
        steps,
        faultInjected: faultInjection === "corrupt_history" ? "破坏主干历史只读性" : undefined,
      };
    } catch (err: any) {
      const end = performance.now();
      return {
        id: "invariant_historical_retention",
        name: "守恒律 1：非破坏性历史保留律 (Non-destructive Retention)",
        description: "测试执行异常",
        passed: false,
        expectedBehavior: "无异常抛出",
        actualBehavior: `抛出未捕获异常: ${err.message}`,
        durationMs: Math.round((end - start) * 100) / 100,
        durationUs: Math.round((end - start) * 1000),
        steps,
        error: String(err),
      };
    }
  }

  /**
   * Invariant 2: Causality Lineage & Lowest Common Ancestor (LCA)
   * The DAG must reliably identify the divergence origin and ancestral chain between two branches.
   */
  private static async testCausalityLineageAndLCA(
    faultInjection: string = "none"
  ): Promise<BranchVerificationResult> {
    const start = performance.now();
    const steps: InvariantAssertionStep[] = [];
    try {
      const dag = new BranchDAG();
      const files = { "README.md": "# Mini Claude Code" };
      const snap = WorkspaceTracker.createSnapshot(files, { snapshotId: "snap_init" });

      dag.initMainBranch({
        nodeId: "root_node",
        parentNodeId: null,
        branchId: "main",
        runId: "r0",
        stepNumber: 1,
        checkpointId: "c_root",
        timestamp: 1000,
        summary: "Root Genesis Node",
        role: "user",
        workspaceSnapshotId: snap.id,
        rootHash: snap.rootHash,
        filesModified: [],
        metrics: {},
      });

      dag.addNode({
        nodeId: "step_2",
        parentNodeId: "root_node",
        branchId: "main",
        runId: "r0",
        stepNumber: 2,
        checkpointId: "c_2",
        timestamp: 2000,
        summary: "Step 2: Common base setup",
        role: "assistant",
        workspaceSnapshotId: snap.id,
        rootHash: snap.rootHash,
        filesModified: [],
        metrics: {},
      });

      // Fork branch B from step_2
      const branchB = dag.forkBranch({
        newBranchName: "feat-b",
        forkFromNodeId: "step_2",
      });

      dag.addNode({
        nodeId: "node_b3",
        parentNodeId: "step_2",
        branchId: branchB.branchId,
        runId: "rb",
        stepNumber: 3,
        checkpointId: "c_b3",
        timestamp: 3000,
        summary: "Step 3: Branch B implementation",
        role: "assistant",
        workspaceSnapshotId: snap.id,
        rootHash: snap.rootHash,
        filesModified: [],
        metrics: {},
      });

      // Add step 3 on main
      dag.addNode({
        nodeId: "node_main3",
        parentNodeId: "step_2",
        branchId: "main",
        runId: "r0",
        stepNumber: 3,
        checkpointId: "c_m3",
        timestamp: 4000,
        summary: "Step 3: Main implementation",
        role: "assistant",
        workspaceSnapshotId: snap.id,
        rootHash: snap.rootHash,
        filesModified: [],
        metrics: {},
      });

      steps.push({
        name: "1. 拓扑因果拓扑图构建 (Topological Graph Setup)",
        expected: "Main: [root -> step_2 -> node_main3], Feat-B: [root -> step_2 -> node_b3]",
        actual: `已生成以 step_2 为共同分叉点的分歧拓扑，总节点数: ${dag.getAllNodes().length}`,
        passed: true,
        details: "构建分叉结构: root_node (Step 1) -> step_2 (Step 2) -> 分化至 node_b3 与 node_main3",
      });

      // === Chaos Fault Injection ===
      if (faultInjection === "sever_causality") {
        const nodeB3 = dag.getNode("node_b3");
        if (nodeB3) {
          (nodeB3 as any).parentNodeId = "detached_ghost_orphan"; // Sever link
        }
      }

      // Calculate LCA between node_b3 and node_main3
      const lca = dag.findLCA("node_b3", "node_main3");
      const lineageB = dag.getLineage("node_b3");

      const lcaMatched = lca?.nodeId === "step_2";
      steps.push({
        name: "2. LCA 最近共同祖先拓扑计算断言 (Lowest Common Ancestor Calculation)",
        expected: "LCA(node_b3, node_main3) === 'step_2'",
        actual: `LCA 运算命中: '${lca?.nodeId || "NULL (未找到共同祖先)"}'`,
        passed: lcaMatched,
        details: lcaMatched
          ? "两分支成功通过拓扑倒排遍历，准确定位唯一交汇原点 step_2。"
          : "【故障拦截】因果树断裂！无法解析两条分支的汇合祖先，发生孤岛漂移！",
      });

      const lineageExact =
        lineageB.length === 3 &&
        lineageB[0]?.nodeId === "root_node" &&
        lineageB[1]?.nodeId === "step_2" &&
        lineageB[2]?.nodeId === "node_b3";
      steps.push({
        name: "3. 全量因果溯源链单向完备性断言 (Causality Lineage Trace)",
        expected: "Lineage(node_b3) === [root_node -> step_2 -> node_b3]",
        actual: `Lineage 链: [${lineageB.map((n) => n.nodeId).join(" -> ")}]`,
        passed: lineageExact,
        details: lineageExact
          ? "自叶向根反向追溯与时间拓扑完全一致，无循环引用与断层。"
          : "【故障拦截】因果谱系中断，检测到孤儿节点无法闭环！",
      });

      const passed = lcaMatched && lineageExact;
      const end = performance.now();
      const durationMs = Math.round((end - start) * 100) / 100;

      return {
        id: "invariant_causality_lineage_lca",
        name: "守恒律 2：拓扑因果谱系完备律 (Causality Lineage & LCA)",
        description:
          "验证 DAG 能够精确追踪任意节点的全量溯源因果链路，并准确定位任意两条探索分支的分叉交汇原点（LCA）。",
        passed,
        expectedBehavior: "LCA 精确命中 step_2，因果链路按时间与父子指针精确还原。",
        actualBehavior: passed
          ? `验证通过：最近共同祖先准确定位为 step_2，node_b3 的因果谱系严格还原 [root_node -> step_2 -> node_b3]。`
          : `验证失败【契约违背】：因果断裂！LCA 计算异常 (命中: ${lca?.nodeId || "None"})，因果谱系链已破坏！`,
        durationMs: Math.max(0.01, durationMs),
        durationUs: Math.round((end - start) * 1000),
        steps,
        faultInjected: faultInjection === "sever_causality" ? "破坏拓扑因果与祖先链" : undefined,
      };
    } catch (err: any) {
      const end = performance.now();
      return {
        id: "invariant_causality_lineage_lca",
        name: "守恒律 2：拓扑因果谱系完备律 (Causality Lineage & LCA)",
        description: "测试执行异常",
        passed: false,
        expectedBehavior: "无异常抛出",
        actualBehavior: `抛出未捕获异常: ${err.message}`,
        durationMs: Math.round((end - start) * 100) / 100,
        durationUs: Math.round((end - start) * 1000),
        steps,
        error: String(err),
      };
    }
  }

  /**
   * Invariant 3: Time-Travel Workspace Bit-Fidelity
   * Checking out any historical node in the DAG must restore exact byte-for-byte workspace state.
   */
  private static async testTimeTravelBitFidelity(
    faultInjection: string = "none"
  ): Promise<BranchVerificationResult> {
    const start = performance.now();
    const steps: InvariantAssertionStep[] = [];
    try {
      const dag = new BranchDAG();
      const snapRegistry = new Map<string, WorkspaceSnapshot>();
      const fileStorage = new Map<string, Record<string, string>>();
      const navigator = new TimeTravelNavigator(dag, snapRegistry, fileStorage);

      const filesNode1 = {
        "src/core.ts": "export const MAGIC = 42;",
        "config.json": '{"mode": "dev"}',
      };
      const snap1 = WorkspaceTracker.createSnapshot(filesNode1, { snapshotId: "snap_node1" });
      navigator.registerSnapshot(snap1, filesNode1);

      dag.initMainBranch({
        nodeId: "node_1",
        parentNodeId: null,
        branchId: "main",
        runId: "r1",
        stepNumber: 1,
        checkpointId: "ckpt_1",
        timestamp: 1000,
        summary: "Init core",
        role: "assistant",
        workspaceSnapshotId: snap1.id,
        rootHash: snap1.rootHash,
        filesModified: ["src/core.ts", "config.json"],
        metrics: {},
      });

      steps.push({
        name: "1. 历史状态位级快照锚定 (Anchor Historical Snapshot)",
        expected: "snap1.rootHash SHA-256 registered",
        actual: `RootHash = ${snap1.rootHash}`,
        passed: true,
        details: `基准节点 node_1 注册成功，包含 2 个文件，哈希指纹: ${snap1.rootHash.substring(0, 16)}...`,
      });

      // Node 2 modifies files and adds extra.txt
      const filesNode2 = {
        "src/core.ts": "export const MAGIC = 999; // updated in step 2",
        "config.json": '{"mode": "prod"}',
        "extra.txt": "created in step 2, must disappear when traveling back",
      };
      const snap2 = WorkspaceTracker.createSnapshot(filesNode2, { snapshotId: "snap_node2" });
      navigator.registerSnapshot(snap2, filesNode2);

      dag.addNode({
        nodeId: "node_2",
        parentNodeId: "node_1",
        branchId: "main",
        runId: "r1",
        stepNumber: 2,
        checkpointId: "ckpt_2",
        timestamp: 2000,
        summary: "Step 2: Modified core and added extra.txt",
        role: "assistant",
        workspaceSnapshotId: snap2.id,
        rootHash: snap2.rootHash,
        filesModified: ["src/core.ts", "config.json", "extra.txt"],
        metrics: {},
      });

      steps.push({
        name: "2. 工作区演进产生脏区与增量文件 (Workspace Mutation Step 2)",
        expected: "Files: 3 items, extra.txt added, core.ts mutated",
        actual: `当前工作区已变更为 Step 2 状态 (哈希: ${snap2.rootHash.substring(0, 16)}...)`,
        passed: true,
        details: "模拟 Agent 在第二步生成了新文件 extra.txt 并修改了已有配置。",
      });

      // Now travel back to node_1
      const { result, restoredFiles } = navigator.checkoutNode("node_1", filesNode2, { force: true });

      // === Chaos Fault Injection ===
      if (faultInjection === "ghost_file_leak") {
        restoredFiles["extra.txt"] = "GHOST_LEAK_RESIDUAL_UNTRACKED_FILE"; // Ghost file leak
      }

      // Verify restored files against node_1 snapshot
      const recalculated = WorkspaceTracker.createSnapshot(restoredFiles, { snapshotId: "test_check" });
      const hashMatched = recalculated.rootHash === snap1.rootHash;
      steps.push({
        name: "3. SHA-256 根指纹位级保真度断言 (SHA-256 Cryptographic Fidelity)",
        expected: `RootHash === '${snap1.rootHash}'`,
        actual: `RestoredRootHash === '${recalculated.rootHash}'`,
        passed: hashMatched,
        details: hashMatched
          ? "时空穿梭迁出后，工作区重新计算的密码学哈希与历史快照 100% 绝对一致。"
          : "【故障拦截】哈希指纹失真！说明工作区内容未能 100% 字节级还原！",
      });

      const phantomCleaned = restoredFiles["extra.txt"] === undefined;
      steps.push({
        name: "4. 未定义幽灵文件彻底消除断言 (Phantom File Elimination)",
        expected: "restoredFiles['extra.txt'] === undefined",
        actual: phantomCleaned ? "已物理清除 (CLEAN)" : `【残留泄露】检测到幽灵文件: "${restoredFiles["extra.txt"]}"`,
        passed: phantomCleaned,
        details: phantomCleaned
          ? "Step 2 创建的 extra.txt 在时空倒流时被精准清除，零幽灵残留。"
          : "【故障拦截】检测到孤儿幽灵文件残留！严重污染了历史工作区！",
      });

      const contentAccurate =
        restoredFiles["src/core.ts"] === filesNode1["src/core.ts"] &&
        restoredFiles["config.json"] === filesNode1["config.json"];
      steps.push({
        name: "5. 历史源码内容逐字节回原断言 (Byte-Level Source Integrity)",
        expected: "MAGIC = 42, mode = 'dev'",
        actual: `src/core: '${restoredFiles["src/core.ts"]}', config: '${restoredFiles["config.json"]}'`,
        passed: contentAccurate,
        details: "代码与配置均精准回滚至历史版本。",
      });

      const passed = result.success && hashMatched && phantomCleaned && contentAccurate;
      const end = performance.now();
      const durationMs = Math.round((end - start) * 100) / 100;

      return {
        id: "invariant_time_travel_bit_fidelity",
        name: "守恒律 3：时空穿梭位级保真律 (Time-Travel Bit-Fidelity)",
        description:
          "验证通过 TimeTravelNavigator 迁出（Checkout）至任意历史节点时，工作区文件在密码学哈希 SHA-256 级别完全还原，无幽灵残留。",
        passed,
        expectedBehavior: "恢复的文件 SHA-256 根指纹与历史快照 100% 吻合，后续步骤生成的文件被彻底清除。",
        actualBehavior: passed
          ? `验证通过：时空旅行迁出成功，文件指纹位级校验一致 (${snap1.rootHash.substring(0, 16)}...)，新文件已消除。`
          : `验证失败【契约违背】：检测到时空旅行指纹不匹配或幽灵文件未清理干净！`,
        durationMs: Math.max(0.01, durationMs),
        durationUs: Math.round((end - start) * 1000),
        steps,
        faultInjected: faultInjection === "ghost_file_leak" ? "制造时空穿梭幽灵文件残留" : undefined,
      };
    } catch (err: any) {
      const end = performance.now();
      return {
        id: "invariant_time_travel_bit_fidelity",
        name: "守恒律 3：时空穿梭位级保真律 (Time-Travel Bit-Fidelity)",
        description: "测试执行异常",
        passed: false,
        expectedBehavior: "无异常抛出",
        actualBehavior: `抛出未捕获异常: ${err.message}`,
        durationMs: Math.round((end - start) * 100) / 100,
        durationUs: Math.round((end - start) * 1000),
        steps,
        error: String(err),
      };
    }
  }

  /**
   * Invariant 4: Cross-Branch Cherry-pick Atomicity
   * Porting an asset from an abandoned branch into an active branch must be atomic and non-destructive.
   */
  private static async testCrossBranchCherryPickAtomicity(
    faultInjection: string = "none"
  ): Promise<BranchVerificationResult> {
    const start = performance.now();
    const steps: InvariantAssertionStep[] = [];
    try {
      const dag = new BranchDAG();
      const snapRegistry = new Map<string, WorkspaceSnapshot>();
      const fileStorage = new Map<string, Record<string, string>>();
      const cherryPicker = new CherryPicker(dag, snapRegistry, fileStorage);

      const baseFiles = { "main.ts": "console.log('base');" };
      const snapBase = WorkspaceTracker.createSnapshot(baseFiles, { snapshotId: "snap_base" });
      snapRegistry.set(snapBase.id, snapBase);
      fileStorage.set(snapBase.id, baseFiles);

      dag.initMainBranch({
        nodeId: "n_base",
        parentNodeId: null,
        branchId: "main",
        runId: "r0",
        stepNumber: 1,
        checkpointId: "c_base",
        timestamp: 1000,
        summary: "Base setup",
        role: "assistant",
        workspaceSnapshotId: snapBase.id,
        rootHash: snapBase.rootHash,
        filesModified: ["main.ts"],
        metrics: {},
      });

      // Branch A (Experimental): creates a great helper utility
      const branchA = dag.forkBranch({
        newBranchName: "branch-a-experimental",
        forkFromNodeId: "n_base",
      });

      const filesA = {
        ...baseFiles,
        "src/utils/gem.ts": "export function preciousUtility() { return 'diamond'; }",
      };
      const snapA = WorkspaceTracker.createSnapshot(filesA, { snapshotId: "snap_a" });
      snapRegistry.set(snapA.id, snapA);
      fileStorage.set(snapA.id, filesA);

      dag.addNode({
        nodeId: "n_a2",
        parentNodeId: "n_base",
        branchId: branchA.branchId,
        runId: "ra",
        stepNumber: 2,
        checkpointId: "c_a2",
        timestamp: 2000,
        summary: "Created precious utility",
        role: "assistant",
        workspaceSnapshotId: snapA.id,
        rootHash: snapA.rootHash,
        filesModified: ["src/utils/gem.ts"],
        metrics: {},
      });

      // Branch B (Production): wants the gem from Branch A
      const branchB = dag.forkBranch({
        newBranchName: "branch-b-prod",
        forkFromNodeId: "n_base",
      });

      const currentFilesB = { "main.ts": "console.log('prod');" };

      steps.push({
        name: "1. 跨分支提取前序环境就绪 (Setup Source & Target Branches)",
        expected: "branchA has gem.ts, branchB ready to receive",
        actual: `branchA [HEAD: n_a2] 存在优质工具，branchB [HEAD: n_base] 待注入`,
        passed: true,
        details: "模拟在已走入死胡同的实验分支 A 中产出了高价值模块 gem.ts，准备单向提取至分支 B。",
      });

      const { result, updatedFiles, newNode } = cherryPicker.cherryPickFile(
        {
          sourceBranchId: branchA.branchId,
          sourceNodeId: "n_a2",
          targetBranchId: branchB.branchId,
          filePath: "src/utils/gem.ts",
        },
        currentFilesB
      );

      // === Chaos Fault Injection ===
      if (faultInjection === "dirty_cherry_pick") {
        const sourceNode = dag.getNode("n_a2");
        if (sourceNode) {
          (sourceNode as any).branchId = "polluted_by_cherry_pick"; // Contaminate source node
        }
        delete updatedFiles["src/utils/gem.ts"]; // Drop file
      }

      const fileTransferred = updatedFiles["src/utils/gem.ts"] === filesA["src/utils/gem.ts"];
      steps.push({
        name: "2. 资产跨分支原子落盘断言 (Asset Atomic Migration Assertion)",
        expected: "updatedFiles['src/utils/gem.ts'] === filesA['src/utils/gem.ts']",
        actual: fileTransferred
          ? "内容 100% 吻合 (export function preciousUtility()...)"
          : "【缺失】gem.ts 未在目标工作区成功创建！",
        passed: fileTransferred,
        details: fileTransferred
          ? "优质模块 preciousUtility() 成功穿透隔离墙注入 branch-b-prod。"
          : "【故障拦截】跨分支资产未成功落地或在迁移中损坏！",
      });

      const targetHeadAdvanced =
        newNode &&
        newNode.branchId === branchB.branchId &&
        dag.getBranch(branchB.branchId)?.headNodeId === newNode.nodeId;
      steps.push({
        name: "3. 目标分支合规 Checkpoint 铸造断言 (Target Checkpoint Minting Assertion)",
        expected: `branchB.headNodeId === '${newNode?.nodeId}'`,
        actual: `branchB.headNodeId === '${dag.getBranch(branchB.branchId)?.headNodeId}'`,
        passed: !!targetHeadAdvanced,
        details: `目标分支成功铸造新 Checkpoint 节点 #${newNode?.stepNumber}，并更新 HEAD 指针。`,
      });

      const sourceUntouched = dag.getNode("n_a2")?.branchId === branchA.branchId;
      steps.push({
        name: "4. 源分支只读纯净性断言 (Source Branch Non-destructive Assertion)",
        expected: `sourceNode.branchId === '${branchA.branchId}'`,
        actual: `sourceNode.branchId === '${dag.getNode("n_a2")?.branchId}'`,
        passed: sourceUntouched,
        details: sourceUntouched
          ? "源分支 branch-a 历史节点保持只读，未产生反向脏写污染。"
          : "【故障拦截】源分支节点被非法修改，产生跨分支指针泄漏！",
      });

      const passed =
        result.success &&
        fileTransferred &&
        updatedFiles["main.ts"] === "console.log('prod');" &&
        targetHeadAdvanced &&
        sourceUntouched;

      const end = performance.now();
      const durationMs = Math.round((end - start) * 100) / 100;

      return {
        id: "invariant_cherry_pick_atomicity",
        name: "守恒律 4：跨分支资产原子拣选律 (Cherry-pick Atomicity)",
        description:
          "验证从已弃用/探索性分支单向提取高价值模块至目标分支时，资产合入原子生效，目标分支产生合规新节点，源分支数据毫发无损。",
        passed,
        expectedBehavior: "目标分支无缝吸纳 src/utils/gem.ts，生成合规新 Checkpoint 节点，源分支拓扑不受影响。",
        actualBehavior: passed
          ? `验证通过：成功将 gem.ts 拣选注入 branch-b-prod，生成新节点 #${newNode.stepNumber}，源分支保持纯净。`
          : `验证失败【契约违背】：检测到拣选资产未成功注入目标工作区，或源分支遭到了反向污染！`,
        durationMs: Math.max(0.01, durationMs),
        durationUs: Math.round((end - start) * 1000),
        steps,
        faultInjected: faultInjection === "dirty_cherry_pick" ? "制造跨分支拣选脏写污染" : undefined,
      };
    } catch (err: any) {
      const end = performance.now();
      return {
        id: "invariant_cherry_pick_atomicity",
        name: "守恒律 4：跨分支资产原子拣选律 (Cherry-pick Atomicity)",
        description: "测试执行异常",
        passed: false,
        expectedBehavior: "无异常抛出",
        actualBehavior: `抛出未捕获异常: ${err.message}`,
        durationMs: Math.round((end - start) * 100) / 100,
        durationUs: Math.round((end - start) * 1000),
        steps,
        error: String(err),
      };
    }
  }
}

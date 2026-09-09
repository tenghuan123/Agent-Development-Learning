import type { ActionFunctionArgs } from "react-router";
import {
  BranchDAG,
  TimeTravelNavigator,
  CherryPicker,
  BranchChaosRunner,
  BranchVerificationSuite,
} from "~/core/branch";
import { WorkspaceTracker } from "~/core/session";
import type { WorkspaceSnapshot } from "~/core/session/types";
import { LLMClient } from "~/core/llm/client";

// Global in-memory demo environment for Lesson 16 (V15)
let demoDag: BranchDAG | null = null;
let demoSnapRegistry = new Map<string, WorkspaceSnapshot>();
let demoFileStorage = new Map<string, Record<string, string>>();
let currentDiskFiles: Record<string, string> = {};

function initDemoEnvironment() {
  demoDag = new BranchDAG();
  demoSnapRegistry = new Map();
  demoFileStorage = new Map();

  // 1. Step 1 Base Setup
  const step1Files = {
    "src/index.ts": `import { verifyAuth } from "./auth/jwt";\n\nconsole.log("Starting Auth Microservice...");\nconst isAuthorized = verifyAuth("sample-token");\nconsole.log("Initial Auth check:", isAuthorized);`,
    "package.json": `{\n  "name": "enterprise-auth-service",\n  "version": "1.0.0",\n  "dependencies": {\n    "jsonwebtoken": "^9.0.0",\n    "ioredis": "^5.3.0"\n  }\n}`,
    "README.md": `# Enterprise Auth System\n\nGoals: Support high-throughput stateless JWT verification with Redis blacklist and backward compatibility.`,
  };
  const snap1 = WorkspaceTracker.createSnapshot(step1Files, { snapshotId: "snap_demo_s1" });
  demoSnapRegistry.set(snap1.id, snap1);
  demoFileStorage.set(snap1.id, step1Files);

  demoDag.initMainBranch({
    nodeId: "node_s1",
    parentNodeId: null,
    branchId: "main",
    runId: "run_main",
    stepNumber: 1,
    checkpointId: "ckpt_demo_s1",
    timestamp: Date.now() - 70000,
    summary: "Step 1: Inspect legacy auth contracts & scaffold configuration",
    role: "assistant",
    workspaceSnapshotId: snap1.id,
    rootHash: snap1.rootHash,
    filesModified: ["src/index.ts", "package.json"],
    metrics: { durationMs: 1400, tokensUsed: 1200, testsPassed: true },
  });

  // 2. Step 2 JWT Token Generation & Verification
  const step2Files = {
    ...step1Files,
    "src/auth/jwt.ts": `import crypto from "crypto";\n\nexport interface TokenPayload {\n  userId: string;\n  role: string;\n  exp: number;\n}\n\nexport function signToken(userId: string, role: string = "user"): string {\n  const payload: TokenPayload = {\n    userId,\n    role,\n    exp: Date.now() + 3600000,\n  };\n  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");\n  const signature = crypto.createHmac("sha256", "super_secret_key").update(body).digest("base64url");\n  return \`\${body}.\${signature}\`;\n}\n\nexport function verifyAuth(token: string): boolean {\n  if (!token || !token.includes(".")) return false;\n  const [body, signature] = token.split(".");\n  const expected = crypto.createHmac("sha256", "super_secret_key").update(body).digest("base64url");\n  return signature === expected;\n}`,
  };
  const snap2 = WorkspaceTracker.createSnapshot(step2Files, { snapshotId: "snap_demo_s2" });
  demoSnapRegistry.set(snap2.id, snap2);
  demoFileStorage.set(snap2.id, step2Files);

  demoDag.addNode({
    nodeId: "node_s2",
    parentNodeId: "node_s1",
    branchId: "main",
    runId: "run_main",
    stepNumber: 2,
    checkpointId: "ckpt_demo_s2",
    timestamp: Date.now() - 60000,
    summary: "Step 2: Implemented HMAC-SHA256 JWT sign and verify engine",
    role: "assistant",
    workspaceSnapshotId: snap2.id,
    rootHash: snap2.rootHash,
    filesModified: ["src/auth/jwt.ts"],
    metrics: { durationMs: 2200, tokensUsed: 2600, testsPassed: true },
  });

  // 3. Step 3 Redis Token Blacklist
  const step3Files = {
    ...step2Files,
    "src/auth/redis-blacklist.ts": `export class RedisTokenBlacklist {\n  private memoryFallback = new Set<string>();\n\n  async revokeToken(tokenId: string, ttlSeconds: number = 3600): Promise<void> {\n    this.memoryFallback.add(tokenId);\n  }\n\n  async isRevoked(tokenId: string): Promise<boolean> {\n    return this.memoryFallback.has(tokenId);\n  }\n}`,
  };
  const snap3 = WorkspaceTracker.createSnapshot(step3Files, { snapshotId: "snap_demo_s3" });
  demoSnapRegistry.set(snap3.id, snap3);
  demoFileStorage.set(snap3.id, step3Files);

  demoDag.addNode({
    nodeId: "node_s3",
    parentNodeId: "node_s2",
    branchId: "main",
    runId: "run_main",
    stepNumber: 3,
    checkpointId: "ckpt_demo_s3",
    timestamp: Date.now() - 50000,
    summary: "Step 3: Implemented distributed Redis token blacklist client",
    role: "assistant",
    workspaceSnapshotId: snap3.id,
    rootHash: snap3.rootHash,
    filesModified: ["src/auth/redis-blacklist.ts"],
    metrics: { durationMs: 2900, tokensUsed: 3100, testsPassed: true },
  });

  // 4. Step 4 [FLAWED ARCHITECTURAL DECISION]: In-memory session store with mutex locks
  const step4Files = {
    ...step3Files,
    "src/auth/session-store.ts": `// ❌ FLAW: Process-bound synchronous Map breaking horizontal scalability\nexport const globalSessionStore = new Map<string, any>();\n\nexport function bindSession(sessionId: string, data: any) {\n  // In-memory locking primitive\n  globalSessionStore.set(sessionId, { ...data, updatedAt: Date.now() });\n}`,
  };
  const snap4 = WorkspaceTracker.createSnapshot(step4Files, { snapshotId: "snap_demo_s4" });
  demoSnapRegistry.set(snap4.id, snap4);
  demoFileStorage.set(snap4.id, step4Files);

  demoDag.addNode({
    nodeId: "node_s4",
    parentNodeId: "node_s3",
    branchId: "main",
    runId: "run_main",
    stepNumber: 4,
    checkpointId: "ckpt_demo_s4",
    timestamp: Date.now() - 40000,
    summary: "Step 4 [CRITICAL FLAW]: Coupled stateful in-memory session table",
    role: "assistant",
    workspaceSnapshotId: snap4.id,
    rootHash: snap4.rootHash,
    filesModified: ["src/auth/session-store.ts"],
    metrics: { durationMs: 3800, tokensUsed: 4100, testsPassed: true },
  });

  // 5. Step 5: Coupled HTTP Cookies to memory store
  const step5Files = {
    ...step4Files,
    "src/middleware/auth-middleware.ts": `import { globalSessionStore } from "../auth/session-store";\n\nexport function authMiddleware(req: any) {\n  const sid = req.headers["cookie"]?.split("sid=")?.[1];\n  if (!sid || !globalSessionStore.has(sid)) {\n    throw new Error("401 Unauthorized - Missing session store lock");\n  }\n  req.user = globalSessionStore.get(sid);\n}`,
  };
  const snap5 = WorkspaceTracker.createSnapshot(step5Files, { snapshotId: "snap_demo_s5" });
  demoSnapRegistry.set(snap5.id, snap5);
  demoFileStorage.set(snap5.id, step5Files);

  demoDag.addNode({
    nodeId: "node_s5",
    parentNodeId: "node_s4",
    branchId: "main",
    runId: "run_main",
    stepNumber: 5,
    checkpointId: "ckpt_demo_s5",
    timestamp: Date.now() - 30000,
    summary: "Step 5: Coupled HTTP Cookie parser directly into memory session store",
    role: "assistant",
    workspaceSnapshotId: snap5.id,
    rootHash: snap5.rootHash,
    filesModified: ["src/middleware/auth-middleware.ts"],
    metrics: { durationMs: 4200, tokensUsed: 4900, testsPassed: true },
  });

  // 6. Step 6: Invasive DB migration
  const step6Files = {
    ...step5Files,
    "src/db/migrations/003_add_session_id.sql": `-- Invasive migration requiring active session lock\nALTER TABLE users ADD COLUMN active_session_id VARCHAR(64) NOT NULL DEFAULT '';\nCREATE INDEX idx_user_session ON users(active_session_id);`,
  };
  const snap6 = WorkspaceTracker.createSnapshot(step6Files, { snapshotId: "snap_demo_s6" });
  demoSnapRegistry.set(snap6.id, snap6);
  demoFileStorage.set(snap6.id, step6Files);

  demoDag.addNode({
    nodeId: "node_s6",
    parentNodeId: "node_s5",
    branchId: "main",
    runId: "run_main",
    stepNumber: 6,
    checkpointId: "ckpt_demo_s6",
    timestamp: Date.now() - 20000,
    summary: "Step 6: Added rigid non-nullable active_session_id to database schema",
    role: "assistant",
    workspaceSnapshotId: snap6.id,
    rootHash: snap6.rootHash,
    filesModified: ["src/db/migrations/003_add_session_id.sql"],
    metrics: { durationMs: 3500, tokensUsed: 4400, testsPassed: true },
  });

  // 7. Step 7: [VALUABLE GEM]: Created extractBearerToken helper!
  const step7Files = {
    ...step6Files,
    "src/utils/token-helpers.ts": `/**\n * ✨ High-value utility created during exploration\n * Robustly extracts RFC-6750 Bearer token and normalizes auth headers.\n */\nexport function extractBearerToken(authHeader?: string): string | null {\n  if (!authHeader) return null;\n  const match = authHeader.match(/^Bearer\\s+([a-zA-Z0-9\\-_.]+)/i);\n  return match ? match[1].trim() : null;\n}\n\nexport function sanitizeAuthLog(token: string): string {\n  if (token.length <= 8) return "***";\n  return \`\${token.substring(0, 4)}...\${token.substring(token.length - 4)}\`;\n}`,
  };
  const snap7 = WorkspaceTracker.createSnapshot(step7Files, { snapshotId: "snap_demo_s7" });
  demoSnapRegistry.set(snap7.id, snap7);
  demoFileStorage.set(snap7.id, step7Files);

  demoDag.addNode({
    nodeId: "node_s7",
    parentNodeId: "node_s6",
    branchId: "main",
    runId: "run_main",
    stepNumber: 7,
    checkpointId: "ckpt_demo_s7",
    timestamp: Date.now() - 10000,
    summary: "Step 7: Created high-value extractBearerToken utility & route adapters",
    role: "assistant",
    workspaceSnapshotId: snap7.id,
    rootHash: snap7.rootHash,
    filesModified: ["src/utils/token-helpers.ts"],
    metrics: { durationMs: 4800, tokensUsed: 5900, testsPassed: true },
  });

  // 8. Step 8: Integration Tests Crash
  const step8Files = {
    ...step7Files,
    "tests/test-report.log": `[FAIL] TestSuite: Distributed Cluster Scaling\n  - POST /api/v1/orders (Instance A -> Instance B): ❌ 401 Unauthorized\n  - Deadlock: globalSessionStore not shared across cluster workers!\n  - Total tests failed: 12 / 12`,
  };
  const snap8 = WorkspaceTracker.createSnapshot(step8Files, { snapshotId: "snap_demo_s8" });
  demoSnapRegistry.set(snap8.id, snap8);
  demoFileStorage.set(snap8.id, step8Files);

  demoDag.addNode({
    nodeId: "node_s8",
    parentNodeId: "node_s7",
    branchId: "main",
    runId: "run_main",
    stepNumber: 8,
    checkpointId: "ckpt_demo_s8",
    timestamp: Date.now(),
    summary: "Step 8: Run cluster integration tests -> 💥 FAILED (Deadlock & 401 across cluster)",
    role: "assistant",
    workspaceSnapshotId: snap8.id,
    rootHash: snap8.rootHash,
    filesModified: ["tests/test-report.log"],
    metrics: { durationMs: 6200, tokensUsed: 7100, testsPassed: false, isError: true },
  });

  currentDiskFiles = { ...step8Files };
}

function ensureInitialized() {
  if (!demoDag) {
    initDemoEnvironment();
  }
}

export async function loader() {
  ensureInitialized();

  const visualLayout = demoDag!.computeVisualLayout();
  const activeBranchId = demoDag!.getActiveBranchId();
  const activeHeadNodeId = demoDag!.getActiveHeadNodeId();
  const activeHeadNode = demoDag!.getNode(activeHeadNodeId);

  // Check drift against current active node snapshot
  let rootHash = "";
  if (activeHeadNode) {
    const snap = demoSnapRegistry.get(activeHeadNode.workspaceSnapshotId);
    rootHash = snap?.rootHash || "";
  }

  return {
    success: true,
    visualLayout,
    allNodes: demoDag!.getAllNodes(),
    branches: demoDag!.getAllBranches(),
    activeBranchId,
    activeHeadNodeId,
    activeHeadNode,
    currentFiles: currentDiskFiles,
    rootHash,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  ensureInitialized();

  try {
    const body = await request.json();
    const actionType = body.action;

    const navigator = new TimeTravelNavigator(
      demoDag!,
      demoSnapRegistry,
      demoFileStorage
    );
    const cherryPicker = new CherryPicker(
      demoDag!,
      demoSnapRegistry,
      demoFileStorage
    );

    switch (actionType) {
      case "checkout": {
        const { targetNodeId, targetBranchId } = body;
        let checkoutOutcome;
        if (targetNodeId) {
          checkoutOutcome = navigator.checkoutNode(
            targetNodeId,
            currentDiskFiles,
            { force: true }
          );
        } else if (targetBranchId) {
          checkoutOutcome = navigator.checkoutBranch(
            targetBranchId,
            currentDiskFiles,
            { force: true }
          );
        } else {
          return Response.json(
            { success: false, error: "Missing targetNodeId or targetBranchId" },
            { status: 400 }
          );
        }

        currentDiskFiles = checkoutOutcome.restoredFiles;
        return Response.json({
          success: true,
          result: checkoutOutcome.result,
          currentFiles: currentDiskFiles,
          activeBranchId: demoDag!.getActiveBranchId(),
          activeHeadNodeId: demoDag!.getActiveHeadNodeId(),
        });
      }

      case "fork_branch": {
        const { newBranchName, forkFromNodeId, description, colorTag } = body;
        if (!newBranchName || !forkFromNodeId) {
          return Response.json(
            { success: false, error: "newBranchName and forkFromNodeId required" },
            { status: 400 }
          );
        }

        const newBranch = demoDag!.forkBranch({
          newBranchName,
          forkFromNodeId,
          description,
          colorTag,
        });

        // Checkout to the fork node immediately
        const { restoredFiles } = navigator.checkoutNode(
          forkFromNodeId,
          currentDiskFiles,
          { force: true }
        );
        currentDiskFiles = restoredFiles;
        demoDag!.checkoutBranch(newBranch.branchId);

        return Response.json({
          success: true,
          newBranch,
          activeBranchId: newBranch.branchId,
          activeHeadNodeId: forkFromNodeId,
          currentFiles: currentDiskFiles,
        });
      }

      case "cherry_pick": {
        const { sourceBranchId, sourceNodeId, targetBranchId, filePath } = body;
        if (!sourceBranchId || !sourceNodeId || !targetBranchId || !filePath) {
          return Response.json(
            { success: false, error: "Incomplete cherry_pick parameters" },
            { status: 400 }
          );
        }

        const { result, updatedFiles, newNode } = cherryPicker.cherryPickFile(
          { sourceBranchId, sourceNodeId, targetBranchId, filePath },
          currentDiskFiles
        );

        currentDiskFiles = updatedFiles;
        return Response.json({
          success: true,
          result,
          newNode,
          currentFiles: currentDiskFiles,
          activeHeadNodeId: demoDag!.getActiveHeadNodeId(),
        });
      }

      case "step_forward": {
        const { summary, fileName, fileContent, prompt, apiKey, baseURL, model } = body;
        const activeBranchId = demoDag!.getActiveBranchId();
        const activeBranch = demoDag!.getBranch(activeBranchId);
        if (!activeBranch) throw new Error("No active branch");

        const parentNodeId = demoDag!.getActiveHeadNodeId();
        const parentNode = parentNodeId ? demoDag!.getNode(parentNodeId) : null;
        const nextStepNumber = parentNode ? parentNode.stepNumber + 1 : 1;

        const effectiveKey = apiKey || process.env.LLM_API_KEY;
        const effectiveBaseURL = baseURL || process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
        const effectiveModel = model || process.env.LLM_MODEL || "glm-4-flash";

        let generatedSummary = summary || `Step ${nextStepNumber}: 分支推演与重构实验`;
        let targetFileName = fileName || `src/auth/stateless-token.ts`;
        let targetContent = fileContent || "";
        let testsPassed = true;
        let isRealLLM = false;

        // If LLM credentials exist, call real LLM to reason and generate code
        if (effectiveKey && prompt) {
          try {
            const client = new LLMClient({
              apiKey: effectiveKey,
              baseURL: effectiveBaseURL,
              defaultModel: effectiveModel,
            });
            const resp = await client.chatCompletion({
              messages: [
                {
                  role: "user",
                  content: `当前工程文件列表: [${Object.keys(currentDiskFiles).join(", ")}]\n` +
                    `分支任务需求: ${prompt}\n` +
                    `请严格按照以下 JSON 结构输出（不要添加任何 markdown 代码块格式）：\n` +
                    `{\n` +
                    `  "summary": "一句话说明此步骤改动（中文，如：实现无状态 JWT 签名引擎，支持多节点并发验证）",\n` +
                    `  "fileName": "主要新建或修改的相对路径（如 src/auth/stateless-token.ts）",\n` +
                    `  "fileContent": "该文件的完整真实 TypeScript 代码",\n` +
                    `  "testsPassed": true\n` +
                    `}`,
                },
              ],
              systemPrompt:
                "你是一个高级 Autonomous Coding Agent，在 Git DAG 分支上执行无损重构推演。请直接输出纯 JSON，禁止输出额外对话。",
              temperature: 0.2,
            });

            let cleaned = resp.content.trim();
            if (cleaned.startsWith("```json")) {
              cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
            } else if (cleaned.startsWith("```")) {
              cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
            }

            try {
              const parsed = JSON.parse(cleaned);
              if (parsed.summary) generatedSummary = `Step ${nextStepNumber}: ${parsed.summary}`;
              if (parsed.fileName) targetFileName = parsed.fileName;
              if (parsed.fileContent) targetContent = parsed.fileContent;
              if (typeof parsed.testsPassed === "boolean") testsPassed = parsed.testsPassed;
              isRealLLM = true;
            } catch {
              generatedSummary = `Step ${nextStepNumber}: ${resp.content.slice(0, 80).replace(/\n/g, " ")}`;
              isRealLLM = true;
            }
          } catch (err: any) {
            console.warn("Real LLM call in step_forward failed, fallback to smart simulation:", err.message);
          }
        }

        // Smart fallback template if LLM didn't generate content
        if (!targetContent) {
          targetFileName = `src/auth/stateless-token.ts`;
          targetContent = `// ✅ Step ${nextStepNumber}: Stateless JWT & Distributed Cluster Token Engine\n` +
            `// 分支: ${activeBranch.name} | 消除进程内内存锁，实现水平扩展\n` +
            `import crypto from "crypto";\n\n` +
            `export interface StatelessTokenPayload {\n` +
            `  userId: string;\n` +
            `  role: string;\n` +
            `  issuedAt: number;\n` +
            `  clusterWorkerId: string;\n` +
            `}\n\n` +
            `export class StatelessAuthEngine {\n` +
            `  private secretKey: string;\n\n` +
            `  constructor(secretKey: string = "cluster_stateless_secret_key") {\n` +
            `    this.secretKey = secretKey;\n` +
            `  }\n\n` +
            `  public createToken(userId: string, role: string = "service-worker"): string {\n` +
            `    const payload: StatelessTokenPayload = {\n` +
            `      userId,\n` +
            `      role,\n` +
            `      issuedAt: Date.now(),\n` +
            `      clusterWorkerId: "worker-" + Math.random().toString(36).substring(7),\n` +
            `    };\n` +
            `    const raw = Buffer.from(JSON.stringify(payload)).toString("base64url");\n` +
            `    const signature = crypto.createHmac("sha256", this.secretKey).update(raw).digest("base64url");\n` +
            `    return \`\${raw}.\${signature}\`;\n` +
            `  }\n\n` +
            `  public verifyToken(token: string): StatelessTokenPayload | null {\n` +
            `    if (!token || !token.includes(".")) return null;\n` +
            `    const [raw, signature] = token.split(".");\n` +
            `    const expected = crypto.createHmac("sha256", this.secretKey).update(raw).digest("base64url");\n` +
            `    if (signature !== expected) return null;\n` +
            `    try {\n` +
            `      return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));\n` +
            `    } catch {\n` +
            `      return null;\n` +
            `    }\n` +
            `  }\n` +
            `}\n\n` +
            `export const clusterAuth = new StatelessAuthEngine();\n`;
          if (!generatedSummary || generatedSummary.startsWith("Step")) {
            generatedSummary = `Step ${nextStepNumber}: 重构为集群无状态 JWT 签名引擎 (StatelessAuthEngine)`;
          }
        }

        currentDiskFiles[targetFileName] = targetContent;

        // Update test report log to reflect resolved tests
        if (testsPassed) {
          currentDiskFiles["tests/test-report.log"] =
            `[PASS] TestSuite: Distributed Cluster Scaling (Branch: ${activeBranch.name})\n` +
            `  - POST /api/v1/orders (Instance A -> Instance B): ✅ 200 OK (Stateless JWT verified)\n` +
            `  - Deadlock verification: ✅ PASSED (globalSessionStore lock removed)\n` +
            `  - Total tests passed: 12 / 12 (100% SUCCESS)`;
        }

        const newSnapshotId = `snap_step_${Date.now()}`;
        const newSnapshot = WorkspaceTracker.createSnapshot(currentDiskFiles, {
          snapshotId: newSnapshotId,
        });
        demoSnapRegistry.set(newSnapshot.id, newSnapshot);
        demoFileStorage.set(newSnapshot.id, { ...currentDiskFiles });

        const newNodeId = `node_${activeBranchId}_s${nextStepNumber}_${Date.now()}`;
        const newNode = {
          nodeId: newNodeId,
          parentNodeId: parentNodeId || null,
          branchId: activeBranchId,
          runId: `run_${activeBranchId}`,
          stepNumber: nextStepNumber,
          checkpointId: `ckpt_${newNodeId}`,
          timestamp: Date.now(),
          summary: generatedSummary,
          role: "assistant" as const,
          workspaceSnapshotId: newSnapshot.id,
          rootHash: newSnapshot.rootHash,
          filesModified: [targetFileName, ...(testsPassed ? ["tests/test-report.log"] : [])],
          metrics: { durationMs: 1800, tokensUsed: 2200, testsPassed },
        };

        demoDag!.addNode(newNode);

        return Response.json({
          success: true,
          newNode,
          isRealLLM,
          currentFiles: currentDiskFiles,
          activeHeadNodeId: newNode.nodeId,
        });
      }

      case "run_chaos": {
        const { apiKey, baseURL, model, useRealLLM } = body;
        const effectiveKey =
          useRealLLM === false ? undefined : apiKey || process.env.LLM_API_KEY;
        const report = await BranchChaosRunner.runChaosDilemma({
          apiKey: effectiveKey,
          baseURL: baseURL || process.env.LLM_BASE_URL,
          model: model || process.env.LLM_MODEL,
        });
        return Response.json({ success: true, report });
      }

      case "run_verification": {
        const { faultInjection } = body;
        const results = await BranchVerificationSuite.runAll(faultInjection || "none");
        return Response.json({ success: true, results });
      }

      case "reset": {
        initDemoEnvironment();
        return Response.json({
          success: true,
          message: "Demo environment successfully reset to default 8-step Auth refactor state.",
        });
      }

      default:
        return Response.json(
          { success: false, error: `Unknown action: ${actionType}` },
          { status: 400 }
        );
    }
  } catch (err: any) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}


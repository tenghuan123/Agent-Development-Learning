import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  DomainSessionManager,
  SessionChaosRunner,
  SessionVerificationSuite,
  WorkspaceTracker,
  type SessionChaosScenarioType,
} from "~/core/session";

// Global in-memory demo state for Lesson 15 workbench
let demoManager: DomainSessionManager | null = null;
let currentSessionId: string | null = null;
let currentRunId: string | null = null;
let currentWorkspaceFiles: Record<string, string> = {};

function initDemoEnvironment() {
  demoManager = new DomainSessionManager();

  currentWorkspaceFiles = {
    "src/index.ts": `import { verifyAuth } from "./auth";\nconsole.log("App started:", verifyAuth("mock-token"));`,
    "src/auth.ts": `export function verifyAuth(token: string) {\n  return token.length > 5;\n}`,
    "src/config.json": `{\n  "appName": "MiniCodeEngine",\n  "version": "1.0.0",\n  "authEnabled": true\n}`,
    "package.json": `{\n  "name": "mini-coding-agent-workspace",\n  "version": "1.0.0",\n  "dependencies": {}\n}`,
  };

  const session = demoManager.createSession({
    title: "Auth Refactoring & Token Verification Session",
    workspaceRoot: "/workspace/project-alpha",
    initialFiles: currentWorkspaceFiles,
    metadata: {
      framework: "Pi/Claude Code Hybrid",
      courseLesson: "Lesson 15 (V14)",
    },
  });

  currentSessionId = session.id;

  // Create initial Run
  const run = demoManager.createRun(
    session.id,
    "请为项目增加 JWT 验签逻辑，并在 config.json 中补充 secret 字段。"
  );
  currentRunId = run.id;

  // Step 1 Checkpoint
  demoManager.saveStepCheckpoint(session.id, run.id, {
    stepNumber: 1,
    messages: [
      ...run.messages,
      {
        role: "assistant",
        content: "我正在检查项目基础架构，并为 `src/auth.ts` 添加基础类型定义。",
      },
    ],
    toolHistory: [
      {
        toolName: "read_file",
        input: { path: "src/auth.ts" },
        output: currentWorkspaceFiles["src/auth.ts"],
        durationMs: 15,
        timestamp: Date.now() - 10000,
      },
    ],
    currentWorkspaceFiles: { ...currentWorkspaceFiles },
    description: "Inspected existing auth structure",
  });

  // Step 2: Agent edits files
  currentWorkspaceFiles["src/auth.ts"] = `import crypto from "crypto";\n\nexport function verifyAuth(token: string): boolean {\n  if (!token) return false;\n  const hash = crypto.createHash("sha256").update(token).digest("hex");\n  return hash.startsWith("00") || token.startsWith("jwt_");\n}\n\nexport function generateToken(userId: string): string {\n  return \`jwt_\${userId}_\${Date.now()}\`;\n}`;
  currentWorkspaceFiles["src/config.json"] = `{\n  "appName": "MiniCodeEngine",\n  "version": "1.0.0",\n  "authEnabled": true,\n  "jwtSecret": "env_prod_secret_token_99x"\n}`;

  // Step 2 Checkpoint
  demoManager.saveStepCheckpoint(session.id, run.id, {
    stepNumber: 2,
    messages: [
      ...run.messages,
      {
        role: "assistant",
        content: "已在 `src/auth.ts` 中实现真实的 Token 生成与 SHA-256 校验逻辑，并在 `src/config.json` 注入了 jwtSecret 字段。",
      },
    ],
    toolHistory: [
      {
        toolName: "replace_file_content",
        input: { path: "src/auth.ts" },
        output: "Updated src/auth.ts with SHA-256 verification and token generation",
        durationMs: 35,
        timestamp: Date.now() - 5000,
      },
      {
        toolName: "replace_file_content",
        input: { path: "src/config.json" },
        output: "Added jwtSecret to src/config.json",
        durationMs: 22,
        timestamp: Date.now() - 3000,
      },
    ],
    currentWorkspaceFiles: { ...currentWorkspaceFiles },
    description: "Added SHA-256 token verification and config secret",
  });

  demoManager.updateRunStatus(session.id, run.id, "completed");
}

function getDemoEnvironment() {
  if (!demoManager || !currentSessionId) {
    initDemoEnvironment();
  }
  const session = demoManager!.getSession(currentSessionId!)!;
  const currentRun = currentRunId ? session.runs[currentRunId] : undefined;
  return {
    manager: demoManager!,
    session,
    currentRun,
    workspaceFiles: currentWorkspaceFiles,
  };
}

export async function loader(_args: LoaderFunctionArgs) {
  const { session, currentRun, workspaceFiles } = getDemoEnvironment();

  const latestSnapshot = currentRun
    ? currentRun.workspaceSnapshot
    : WorkspaceTracker.createSnapshot(workspaceFiles);

  const driftReport = WorkspaceTracker.detectDrift(latestSnapshot, workspaceFiles);
  const ghostReport = currentRun
    ? WorkspaceTracker.detectGhostReferences(currentRun.messages, workspaceFiles)
    : { hasGhostReferences: false, ghostFiles: [], details: [] };

  return Response.json({
    success: true,
    session: {
      id: session.id,
      title: session.title,
      workspaceRoot: session.workspaceRoot,
      activeBranchId: session.activeBranchId,
      branches: Object.values(session.branches),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      metadata: session.metadata,
    },
    currentRun: currentRun
      ? {
          id: currentRun.id,
          branchId: currentRun.branchId,
          status: currentRun.status,
          currentStep: currentRun.currentStep,
          messages: currentRun.messages,
          toolCount: currentRun.toolHistory.length,
          toolHistory: currentRun.toolHistory,
          checkpoints: currentRun.checkpoints.map((c) => ({
            id: c.id,
            stepNumber: c.stepNumber,
            timestamp: c.timestamp,
            description: c.description,
            filesCount: Object.keys(c.workspaceSnapshot.files).length,
            rootHash: c.workspaceSnapshot.rootHash,
            messagesCount: c.messages.length,
          })),
        }
      : null,
    workspace: {
      files: Object.entries(workspaceFiles).map(([path, content]) => ({
        path,
        content,
        hash: WorkspaceTracker.computeHash(content),
        size: Buffer.byteLength(content, "utf8"),
      })),
      rootHash: latestSnapshot.rootHash,
      driftReport,
      ghostReport,
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = (await request.json()) as {
      action?:
        | "run_chaos"
        | "run_real_task"
        | "run_verification"
        | "inject_drift"
        | "validate_resume"
        | "restore_checkpoint"
        | "fork_branch"
        | "reset";
      scenario?: SessionChaosScenarioType;
      driftType?: "modify_auth" | "delete_auth" | "add_untracked" | "reset_clean";
      checkpointId?: string;
      newBranchName?: string;
      prompt?: string;
      apiKey?: string;
      baseURL?: string;
      model?: string;
      ignoreDrift?: boolean;
    };

    const actionType = body.action || "run_chaos";

    // 1. 混沌场景执行 (支持真实大模型在线实验)
    if (actionType === "run_chaos") {
      const scenario = body.scenario || "ghost_state_disaster";
      const effectiveApiKey = body.apiKey || process.env.LLM_API_KEY || "";
      const effectiveBaseURL = body.baseURL || process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
      const effectiveModel = body.model || process.env.LLM_MODEL || "glm-4-flash";

      const result = await SessionChaosRunner.runScenario(scenario, {
        apiKey: effectiveApiKey,
        baseURL: effectiveBaseURL,
        model: effectiveModel,
      });
      return Response.json({ success: true, result });
    }

    // 1.5 真实执行 Coding Agent 任务 (LLM 实时思考 + 真实文件修改 + 原子快照生成 + 防漂移屏障 CAS)
    if (actionType === "run_real_task") {
      const { manager, session, currentRun } = getDemoEnvironment();
      const prompt = body.prompt || "请为 src/auth.ts 增加 JWT 验签逻辑，并在 src/config.json 注入 secret 字段。";
      const effectiveApiKey = body.apiKey || process.env.LLM_API_KEY || "";
      const effectiveBaseURL = body.baseURL || process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
      const effectiveModel = body.model || process.env.LLM_MODEL || "glm-4-flash";

      if (!effectiveApiKey.trim()) {
        return Response.json(
          {
            success: false,
            error: "未配置 LLM API Key，请在页面右上角设置，或在 .env 文件中配置 LLM_API_KEY",
          },
          { status: 400 }
        );
      }

      const targetRun = currentRun || manager.createRun(session.id, prompt);

      // 1. Pre-flight Workspace Drift Barrier (CAS 锁校验)
      const latestSnapshot =
        targetRun.checkpoints.length > 0
          ? targetRun.checkpoints[targetRun.checkpoints.length - 1].workspaceSnapshot
          : targetRun.workspaceSnapshot;

      const preFlightDrift = WorkspaceTracker.detectDrift(latestSnapshot, currentWorkspaceFiles);

      if (preFlightDrift.hasDrift && !body.ignoreDrift) {
        return Response.json(
          {
            success: false,
            driftBlocked: true,
            message: "工作区防漂移屏障已拦截：检测到物理文件已发生外部漂移，未与基线快照对齐！",
            conflicts: preFlightDrift.conflicts,
            latestRootHash: latestSnapshot.rootHash,
            currentRootHash: WorkspaceTracker.computeWorkspaceHash(currentWorkspaceFiles),
          },
          { status: 409 }
        );
      }

      const isSkewedExecution = Boolean(preFlightDrift.hasDrift && body.ignoreDrift);

      const { LLMClient } = await import("~/core/llm/client");
      const llmClient = new LLMClient({
        apiKey: effectiveApiKey,
        baseURL: effectiveBaseURL,
        defaultModel: effectiveModel,
      });

      const openAiTools = [
        {
          type: "function" as const,
          function: {
            name: "read_file",
            description: "Read content of a file in the workspace",
            parameters: {
              type: "object",
              properties: { path: { type: "string", description: "File path" } },
              required: ["path"],
            },
          },
        },
        {
          type: "function" as const,
          function: {
            name: "write_file",
            description: "Write content to a file in the workspace",
            parameters: {
              type: "object",
              properties: {
                path: { type: "string", description: "File path" },
                content: { type: "string", description: "File content to write" },
              },
              required: ["path", "content"],
            },
          },
        },
      ];

      const userMessage = { role: "user" as const, content: prompt };
      const runMessages = [...targetRun.messages, userMessage];

      const executedTools: any[] = [];
      let finalThought = "";
      const accumulatedUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      const midFlightAlerts: string[] = [];

      // Record workspace hash right before model starts thinking
      const hashBeforeThinking = WorkspaceTracker.computeWorkspaceHash(currentWorkspaceFiles);

      // Agent loop (up to 2 rounds: inspect -> modify / finish)
      const MAX_TURNS = 2;
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const turnResponse = await llmClient.chatCompletion({
          messages: runMessages,
          systemPrompt:
            "You are a specialized coding agent with workspace file read/write tools. Inspect and edit files as needed to fulfill the user request. Respond concisely in Chinese.",
          tools: openAiTools,
          model: effectiveModel,
        });

        if (turnResponse.usage) {
          accumulatedUsage.promptTokens += turnResponse.usage.promptTokens;
          accumulatedUsage.completionTokens += turnResponse.usage.completionTokens;
          accumulatedUsage.totalTokens += turnResponse.usage.totalTokens;
        }

        if (turnResponse.content) {
          finalThought = turnResponse.content;
        }

        const toolCalls = turnResponse.toolCalls || [];

        // Check if workspace drifted WHILE the model was thinking during this turn!
        const hashAfterThinking = WorkspaceTracker.computeWorkspaceHash(currentWorkspaceFiles);
        if (hashBeforeThinking !== hashAfterThinking) {
          midFlightAlerts.push(
            `💥 [并发时空倾斜] 在大模型第 ${turn + 1} 轮思考时，工作区被外部修改！初始指纹 ${hashBeforeThinking.substring(0, 6)} != 当前指纹 ${hashAfterThinking.substring(0, 6)}`
          );
        }

        if (toolCalls.length === 0) {
          // No more tool calls, model finished
          runMessages.push({
            role: "assistant" as const,
            content: turnResponse.content || "任务执行完毕。",
          });
          break;
        }

        // Assistant called tools
        const assistantToolMsg: any = {
          role: "assistant" as const,
          content: turnResponse.content || "",
          tool_calls: toolCalls.map((tc, idx) => ({
            id: tc.id || `call_${Date.now()}_${idx}`,
            type: "function" as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        };
        runMessages.push(assistantToolMsg);

        // Execute tools against currentWorkspaceFiles
        for (const call of toolCalls) {
          const toolName = call.function.name;
          let toolArgs: Record<string, any> = {};
          try {
            toolArgs = JSON.parse(call.function.arguments || "{}");
          } catch {
            toolArgs = {};
          }

          let toolOutput = "";
          if (toolName === "write_file") {
            const filePath = toolArgs.path;
            const content = toolArgs.content;
            if (filePath && content !== undefined) {
              const fileExistedBefore = filePath in currentWorkspaceFiles;
              const wasExternallyAltered =
                fileExistedBefore && currentWorkspaceFiles[filePath].includes("EXTERNAL DRIFT");
              currentWorkspaceFiles[filePath] = String(content);
              toolOutput = wasExternallyAltered
                ? `Successfully written ${Buffer.byteLength(String(content), "utf8")} bytes to ${filePath} (⚠️ OVERWROTE EXTERNAL DRIFT MODIFICATION!)`
                : `Successfully written ${Buffer.byteLength(String(content), "utf8")} bytes to ${filePath}`;

              if (wasExternallyAltered) {
                midFlightAlerts.push("⚠️ 覆写丢失 (Lost Update): 模型盲目覆盖了外部注入的修改！");
              }

              executedTools.push({
                toolName: "write_file",
                input: toolArgs,
                output: toolOutput,
                durationMs: 45,
                timestamp: Date.now(),
              });
            } else {
              toolOutput = "Error: Missing path or content";
            }
          } else if (toolName === "read_file") {
            const filePath = toolArgs.path;
            const content = currentWorkspaceFiles[filePath];
            if (content !== undefined) {
              toolOutput = content;
            } else {
              toolOutput = `Error: File '${filePath}' not found in workspace! (Ghost file / externally deleted skew)`;
              midFlightAlerts.push(
                `🚨 幽灵读取失败 (Ghost Read Failure): 模型尝试读取 '${filePath}' 但磁盘上该文件已不存在！`
              );
            }
            executedTools.push({
              toolName: "read_file",
              input: toolArgs,
              output: toolOutput,
              durationMs: 20,
              timestamp: Date.now(),
            });
          }

          // Feed tool response back to messages
          runMessages.push({
            role: "tool" as const,
            tool_call_id:
              assistantToolMsg.tool_calls[executedTools.length - 1]?.id || `call_${Date.now()}`,
            content: toolOutput,
          });
        }
      }

      // Record step checkpoint
      const nextStepNum = targetRun.currentStep + 1;
      const newCheckpoint = manager.saveStepCheckpoint(session.id, targetRun.id, {
        stepNumber: nextStepNum,
        messages: runMessages,
        toolHistory: executedTools,
        currentWorkspaceFiles: { ...currentWorkspaceFiles },
        description: `Executed task: ${prompt.substring(0, 30)}...`,
      });

      return Response.json({
        success: true,
        thought: finalThought,
        toolCalls: executedTools,
        checkpoint: {
          id: newCheckpoint.id,
          stepNumber: newCheckpoint.stepNumber,
          rootHash: newCheckpoint.workspaceSnapshot.rootHash,
        },
        usage: accumulatedUsage,
        isSkewedExecution,
        midFlightAlerts,
        driftAlert: isSkewedExecution
          ? "⚠️ 此步骤在存在工作区时空漂移的状态下强制盲目执行，展示了 Messages 架构在外部变动下的时空倾斜与丢失更新！"
          : undefined,
      });
    }

    // 2. 自动化验证契约测试
    if (actionType === "run_verification") {
      const tests = await SessionVerificationSuite.runAll();
      return Response.json({ success: true, tests });
    }

    // 3. 模拟注入工作区外部漂移 (Drift Injection)
    if (actionType === "inject_drift") {
      const { currentRun } = getDemoEnvironment();
      const driftType = body.driftType || "modify_auth";

      if (driftType === "modify_auth") {
        currentWorkspaceFiles["src/auth.ts"] =
          `// EXTERNAL DRIFT: File modified externally without Agent awareness\nexport function verifyAuth() { return false; }`;
      } else if (driftType === "delete_auth") {
        delete currentWorkspaceFiles["src/auth.ts"];
      } else if (driftType === "add_untracked") {
        currentWorkspaceFiles["src/untracked_script.sh"] = "#!/bin/bash\nrm -rf /tmp/*\n";
      } else if (driftType === "reset_clean") {
        if (currentRun && currentRun.checkpoints.length > 0) {
          const latestCkpt = currentRun.checkpoints[currentRun.checkpoints.length - 1];
          currentWorkspaceFiles = {};
          for (const [p, snap] of Object.entries(latestCkpt.workspaceSnapshot.files)) {
            currentWorkspaceFiles[p] = snap.contentSnippet || "";
          }
        }
      }

      const latestSnapshot = currentRun
        ? currentRun.workspaceSnapshot
        : WorkspaceTracker.createSnapshot(currentWorkspaceFiles);

      const driftReport = WorkspaceTracker.detectDrift(latestSnapshot, currentWorkspaceFiles);
      const ghostReport = currentRun
        ? WorkspaceTracker.detectGhostReferences(currentRun.messages, currentWorkspaceFiles)
        : { hasGhostReferences: false, ghostFiles: [], details: [] };

      return Response.json({
        success: true,
        message: `Injected drift: ${driftType}`,
        driftReport,
        ghostReport,
        workspaceFiles: Object.entries(currentWorkspaceFiles).map(([path, content]) => ({
          path,
          content,
          hash: WorkspaceTracker.computeHash(content),
        })),
      });
    }

    // 4. 验证历史快照安全恢复 (Integrity Pre-check)
    if (actionType === "validate_resume") {
      const { manager, session } = getDemoEnvironment();
      const checkpointId = body.checkpointId;
      if (!checkpointId) {
        return Response.json({ success: false, error: "Missing checkpointId" }, { status: 400 });
      }

      const report = manager.validateResume(session.id, checkpointId, currentWorkspaceFiles);
      return Response.json({ success: true, report });
    }

    // 5. 还原历史快照 (Atomic Restore)
    if (actionType === "restore_checkpoint") {
      const { manager } = getDemoEnvironment();
      const checkpointId = body.checkpointId;
      if (!checkpointId) {
        return Response.json({ success: false, error: "Missing checkpointId" }, { status: 400 });
      }

      const ckpt = manager.getCheckpoint(checkpointId);
      if (!ckpt) {
        return Response.json({ success: false, error: "Checkpoint not found" }, { status: 404 });
      }

      // Recreate workspace files from checkpoint file snapshots
      const restoredFiles: Record<string, string> = {};
      for (const [path, fileSnap] of Object.entries(ckpt.workspaceSnapshot.files)) {
        restoredFiles[path] = fileSnap.contentSnippet || "";
      }
      currentWorkspaceFiles = restoredFiles;

      return Response.json({
        success: true,
        message: `Restored workspace to Checkpoint step ${ckpt.stepNumber}`,
        stepNumber: ckpt.stepNumber,
        rootHash: ckpt.workspaceSnapshot.rootHash,
        files: Object.keys(restoredFiles),
      });
    }

    // 6. 分叉新分支 (Fork Branch)
    if (actionType === "fork_branch") {
      const { manager, session } = getDemoEnvironment();
      const checkpointId = body.checkpointId;
      const branchName = body.newBranchName || `branch-${Date.now().toString(36)}`;

      if (!checkpointId) {
        return Response.json({ success: false, error: "Missing checkpointId" }, { status: 400 });
      }

      const { branch, run } = manager.forkBranchFromCheckpoint(
        session.id,
        checkpointId,
        branchName
      );
      currentRunId = run.id;

      return Response.json({
        success: true,
        message: `Forked new branch '${branchName}'`,
        branch,
        runId: run.id,
      });
    }

    // 7. 重置环境
    if (actionType === "reset") {
      initDemoEnvironment();
      return Response.json({ success: true, message: "Demo environment reset." });
    }

    return Response.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

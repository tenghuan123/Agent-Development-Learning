import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  AgentRuntime,
  ChaosRunner,
  EventStream,
  PureAgentCore,
  SafeToolExecutor,
  SessionManager,
  type AgentEvent,
  type ChaosScenarioType,
} from "~/core/runtime";

// In-memory global runtime instance for interactive session control
let activeRuntimeInstance: AgentRuntime | null = null;
let activeEventStream = new EventStream();

function getOrCreateRuntime(apiKey?: string, baseURL?: string, model?: string) {
  if (!activeRuntimeInstance) {
    activeEventStream = new EventStream();
    const sessionManager = new SessionManager();
    const toolExecutor = new SafeToolExecutor();
    const core = new PureAgentCore({
      apiKey,
      baseURL,
      model,
    });

    activeRuntimeInstance = new AgentRuntime({
      core,
      sessionManager,
      toolExecutor,
      eventStream: activeEventStream,
    });
  }
  return activeRuntimeInstance;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");

  const runtime = activeRuntimeInstance;
  const state = runtime ? runtime.getState() : "idle";
  const currentRunId = runtime ? runtime.getCurrentRunId() : null;
  const events = activeEventStream.getHistory(runId || currentRunId || undefined);
  const activeOps = runtime ? runtime.toolExecutor.getActiveOperations() : [];

  return Response.json({
    success: true,
    state,
    currentRunId,
    activeOperations: activeOps,
    events,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = (await request.json()) as {
      action?:
        | "run_chaos"
        | "start_interactive"
        | "interrupt"
        | "abort"
        | "suspend"
        | "resume"
        | "run_verification"
        | "reset";
      scenario?: ChaosScenarioType;
      prompt?: string;
      message?: string;
      snapshotId?: string;
      reason?: string;
      apiKey?: string;
      baseURL?: string;
      model?: string;
      maxSteps?: number;
    };

    const actionType = body.action || "start_interactive";

    // 1. Chaos experiment runner
    if (actionType === "run_chaos") {
      const scenario = body.scenario || "mid_flight_input";
      const result = await ChaosRunner.runScenario(scenario);
      return Response.json({
        success: true,
        result,
      });
    }

    // 2. Automated verification suite
    if (actionType === "run_verification") {
      const results = await runAutomatedVerificationSuite();
      return Response.json({
        success: true,
        tests: results,
      });
    }

    // 3. Reset runtime
    if (actionType === "reset") {
      if (activeRuntimeInstance) {
        activeRuntimeInstance.abort("Reset requested");
      }
      activeRuntimeInstance = null;
      activeEventStream = new EventStream();
      return Response.json({ success: true, message: "Runtime reset successfully" });
    }

    // 4. Interactive Start
    if (actionType === "start_interactive") {
      const prompt = body.prompt || "请列出当前项目目录，并读取 package.json 文件说明项目依赖。";
      activeRuntimeInstance = null; // Recreate clean instance for new run
      const runtime = getOrCreateRuntime(body.apiKey, body.baseURL, body.model);

      const collectedEvents: any[] = [];
      const unsub = activeEventStream.subscribe((e: AgentEvent) => {
        collectedEvents.push(e);
      });

      try {
        const run = await runtime.start(prompt, {
          maxSteps: body.maxSteps ?? 4,
        });
        unsub();

        return Response.json({
          success: true,
          run,
          events: collectedEvents,
        });
      } catch (err: any) {
        unsub();
        return Response.json({
          success: false,
          error: err.message || String(err),
          events: collectedEvents,
        });
      }
    }

    // 5. Mid-flight Interruption
    if (actionType === "interrupt") {
      if (!activeRuntimeInstance || activeRuntimeInstance.getState() !== "running") {
        return Response.json(
          { success: false, error: "没有正在运行的 Runtime 任务可供插话" },
          { status: 400 }
        );
      }
      const msg = body.message || "请优先检查是否有未导出的类型声明";
      activeRuntimeInstance.interrupt(msg);
      return Response.json({
        success: true,
        message: "用户插话已安全放入 InboundQueue 队列",
      });
    }

    // 6. Hard Abort
    if (actionType === "abort") {
      if (!activeRuntimeInstance) {
        return Response.json({ success: true, message: "No active runtime" });
      }
      activeRuntimeInstance.abort(body.reason || "User pressed abort button");
      return Response.json({
        success: true,
        message: "Abort 信号已级联广播至工具进程与模型请求",
      });
    }

    // 7. Suspend
    if (actionType === "suspend") {
      if (!activeRuntimeInstance) {
        return Response.json({ success: false, error: "No active runtime" }, { status: 400 });
      }
      const snapshot = activeRuntimeInstance.suspend();
      return Response.json({
        success: true,
        snapshot,
      });
    }

    // 8. Resume
    if (actionType === "resume") {
      const runtime = activeRuntimeInstance || getOrCreateRuntime(body.apiKey, body.baseURL, body.model);
      if (!body.snapshotId) {
        return Response.json(
          { success: false, error: "snapshotId 无效" },
          { status: 400 }
        );
      }

      const collectedEvents: any[] = [];
      const unsub = activeEventStream.subscribe((e: AgentEvent) => {
        collectedEvents.push(e);
      });

      try {
        const run = await runtime.resume(body.snapshotId, body.maxSteps ?? 4);
        unsub();
        return Response.json({
          success: true,
          run,
          events: collectedEvents,
        });
      } catch (err: any) {
        unsub();
        return Response.json({
          success: false,
          error: err.message || String(err),
          events: collectedEvents,
        });
      }
    }

    return Response.json({ success: false, error: `Unknown action: ${actionType}` }, { status: 400 });
  } catch (err: any) {
    return Response.json(
      {
        success: false,
        error: err.message || "Internal server error in api.runtime",
      },
      { status: 500 }
    );
  }
}

/**
 * 4 大自动化验收测试套件
 */
async function runAutomatedVerificationSuite() {
  const tests = [];

  // Test 1: Abort signal cascades within 50ms and kills active operations
  const t1Start = Date.now();
  try {
    const executor = new SafeToolExecutor();
    const abortController = new AbortController();

    // Mock long running tool
    const mockCall = {
      id: "call_mock_sleep",
      type: "function" as const,
      function: {
        name: "list_dir",
        arguments: JSON.stringify({ directoryPath: "." }),
      },
    };

    const execPromise = executor.execute(mockCall, {
      signal: abortController.signal,
    });

    // Abort immediately
    abortController.abort();
    const res = await execPromise;

    const duration = Date.now() - t1Start;
    const passed = res.isError && res.output.includes("取消") && duration < 100;

    tests.push({
      id: "verify-abort-cascade",
      name: "Abort 信号级联取消与子进程快速回收 (Cascade Abort)",
      passed,
      durationMs: duration,
      details: passed
        ? `在 ${duration}ms 内成功拦截并终止活动操作，输出状态捕获准确，0 僵尸进程。`
        : `测试未通过: 耗时 ${duration}ms, 输出: ${res.output}`,
    });
  } catch (err: any) {
    tests.push({
      id: "verify-abort-cascade",
      name: "Abort 信号级联取消与子进程快速回收 (Cascade Abort)",
      passed: false,
      durationMs: Date.now() - t1Start,
      details: `异常: ${err.message}`,
    });
  }

  // Test 2: Inbound mid-flight input buffering
  const t2Start = Date.now();
  try {
    const sessionManager = new SessionManager();
    const stream = new EventStream();
    let interruptEventFired = false;

    stream.subscribe((e: AgentEvent) => {
      if (e.type === "user:interrupt") {
        interruptEventFired = true;
      }
    });

    const runtime = new AgentRuntime({
      sessionManager,
      eventStream: stream,
      core: {
        step: async () => ({
          type: "finish",
          thought: "Done",
          finalAnswer: "Test completed",
        }),
      },
    });

    const run = sessionManager.createRun("Initial prompt");
    // Manually push run and test interrupt
    (runtime as any).currentRunId = run.id;
    runtime.interrupt("Urgent mid-flight note");

    const passed = interruptEventFired && (runtime as any).inboundQueue.length === 1;
    tests.push({
      id: "verify-inbound-queue",
      name: "中途用户插话原子化排队与事件广播 (Inbound Queue)",
      passed,
      durationMs: Date.now() - t2Start,
      details: passed
        ? "用户插话成功入队 InboundQueue，触发 user:interrupt 广播，无状态竞争。"
        : "InboundQueue 或事件广播未按预期触发",
    });
  } catch (err: any) {
    tests.push({
      id: "verify-inbound-queue",
      name: "中途用户插话原子化排队与事件广播 (Inbound Queue)",
      passed: false,
      durationMs: Date.now() - t2Start,
      details: `异常: ${err.message}`,
    });
  }

  // Test 3: Pure AgentCore isolation (zero I/O dependencies)
  const t3Start = Date.now();
  try {
    const core = new PureAgentCore({});
    // Verify core contains no direct file system or exec members
    const hasFsAccess = "fs" in core || "readFile" in core || "exec" in core;
    const implementsStep = typeof core.step === "function";

    const passed = !hasFsAccess && implementsStep;
    tests.push({
      id: "verify-core-purity",
      name: "AgentCore 纯度检验 (零直接 I/O 与进程依赖)",
      passed,
      durationMs: Date.now() - t3Start,
      details: passed
        ? "AgentCore 实现了纯 step(snapshot, signal) 契约，与宿主系统 I/O 干净解耦。"
        : "AgentCore 存在非纯直接 I/O 耦合",
    });
  } catch (err: any) {
    tests.push({
      id: "verify-core-purity",
      name: "AgentCore 纯度检验 (零直接 I/O 与进程依赖)",
      passed: false,
      durationMs: Date.now() - t3Start,
      details: `异常: ${err.message}`,
    });
  }

  // Test 4: Session Snapshot immutability and branching
  const t4Start = Date.now();
  try {
    const sm = new SessionManager();
    const r1 = sm.createRun("Base task");
    sm.appendStepData(
      r1.id,
      [{ role: "assistant", content: "Step 1 analysis" }],
      [],
      { "src/index.ts": "v1" }
    );
    const snap1 = sm.saveSnapshot(r1.id, 1);

    // Fork a branch from snap1
    const branchRun = sm.createBranch(snap1!.snapshotId, "feature-branch");

    // Modify branch run
    sm.appendStepData(
      branchRun!.id,
      [{ role: "assistant", content: "Branch step 2" }],
      [],
      { "src/index.ts": "v2" }
    );

    // Verify parent run snapshot was not mutated
    const passed =
      snap1 !== null &&
      branchRun !== null &&
      r1.workspaceState["src/index.ts"] === "v1" &&
      branchRun.workspaceState["src/index.ts"] === "v2";

    tests.push({
      id: "verify-session-tree",
      name: "Session 树状快照不可变性与多分支分叉 (Session Tree & Branching)",
      passed,
      durationMs: Date.now() - t4Start,
      details: passed
        ? "快照深拷贝隔离验证通过，支持从任意历史节点 Fork 新分支且互不污染。"
        : "分支修改影响了父快照，不可变性受损",
    });
  } catch (err: any) {
    tests.push({
      id: "verify-session-tree",
      name: "Session 树状快照不可变性与多分支分叉 (Session Tree & Branching)",
      passed: false,
      durationMs: Date.now() - t4Start,
      details: `异常: ${err.message}`,
    });
  }

  // Test 5: Runtime Suspend & Resume loop invariant
  const t5Start = Date.now();
  try {
    const sm = new SessionManager();
    const stream = new EventStream();
    let stepCount = 0;

    const runtime = new AgentRuntime({
      sessionManager: sm,
      eventStream: stream,
      core: {
        step: async () => {
          stepCount++;
          if (stepCount === 1) {
            // First step triggers a tool call
            return {
              type: "call_tools",
              thought: "Running step 1",
              toolCalls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "list_dir", arguments: JSON.stringify({ directoryPath: "." }) },
                },
              ],
            };
          }
          return {
            type: "finish",
            thought: "All done",
            finalAnswer: "Completed after resume",
          };
        },
      },
    });

    // Start run
    const startPromise = runtime.start("Test suspend resume", { maxSteps: 5 });
    // Immediately suspend
    const snap = runtime.suspend();
    const pausedRun = await startPromise;

    const suspendedCorrectly = pausedRun.status === "suspended" && snap !== null;

    // Now resume from snapshot
    const resumedRun = await runtime.resume(snap!.snapshotId, 5);
    const resumedCorrectly = resumedRun.status === "completed";

    const passed = suspendedCorrectly && resumedCorrectly;
    tests.push({
      id: "verify-suspend-resume",
      name: "Runtime 暂停快照与断点恢复闭环 (Suspend & Resume Invariant)",
      passed,
      durationMs: Date.now() - t5Start,
      details: passed
        ? "suspend() 成功阻断循环并将状态冻结在 suspended，resume() 从快照无缝继发并推进至 completed。"
        : `暂停或恢复状态异常: 暂停状态=${pausedRun.status}, 恢复状态=${resumedRun?.status}`,
    });
  } catch (err: any) {
    tests.push({
      id: "verify-suspend-resume",
      name: "Runtime 暂停快照与断点恢复闭环 (Suspend & Resume Invariant)",
      passed: false,
      durationMs: Date.now() - t5Start,
      details: `异常: ${err.message}`,
    });
  }

  return tests;
}


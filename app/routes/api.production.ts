import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { globalProductionRuntime, type TaskPriority } from "~/core/production";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action === "audit") {
    const entries = globalProductionRuntime.auditLedger.getEntries();
    const integrity = globalProductionRuntime.auditLedger.verifyIntegrity();
    return Response.json({
      success: true,
      entries,
      integrity,
    });
  }

  const metrics = globalProductionRuntime.getMetrics();
  const queuedTasks = globalProductionRuntime.queue.getQueuedTasks();
  const runningTasks = globalProductionRuntime.queue.getRunningTasks();
  const completedTasks = globalProductionRuntime.queue.getCompletedTasks();
  const auditIntegrity = globalProductionRuntime.auditLedger.verifyIntegrity();

  return Response.json({
    success: true,
    metrics,
    queuedTasks,
    runningTasks,
    completedTasks,
    auditIntegrity,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = (await request.json()) as {
      action?:
        | "submit_task"
        | "step_workers"
        | "stress_test"
        | "trip_circuit"
        | "reset_circuit"
        | "simulate_failure"
        | "test_fallback"
        | "simulate_budget_attack"
        | "tamper_audit"
        | "restore_audit"
        | "verify_audit"
        | "reset_all";
      tenantId?: string;
      prompt?: string;
      priority?: TaskPriority;
      tokenBudget?: number;
      sequenceIndex?: number;
      fakePayload?: Record<string, unknown>;
      apiKey?: string;
      baseURL?: string;
      model?: string;
    };

    const actionType = body.action || "submit_task";

    if (actionType === "submit_task") {
      const tenantId = body.tenantId || "tenant-free-tier";
      const prompt = body.prompt || "查询代码库架构";
      const res = globalProductionRuntime.submitTask({
        tenantId,
        prompt,
        priority: body.priority,
        tokenBudget: body.tokenBudget,
      });

      return Response.json({
        success: res.success,
        task: res.task,
        error: res.error,
        rateLimited: res.rateLimited,
        message: res.success
          ? `任务 #${res.task?.id.slice(-4)} 已成功进入待调度队列（优先级: ${res.task?.priority}）`
          : `任务提交被拦截: ${res.error}`,
        metrics: globalProductionRuntime.getMetrics(),
        queuedTasks: globalProductionRuntime.queue.getQueuedTasks(),
        runningTasks: globalProductionRuntime.queue.getRunningTasks(),
        completedTasks: globalProductionRuntime.queue.getCompletedTasks(),
      });
    }

    if (actionType === "step_workers") {
      const stepResult = await globalProductionRuntime.stepWorkerPool({
        apiKey: body.apiKey,
        baseURL: body.baseURL,
        model: body.model,
      });

      return Response.json({
        success: true,
        dispatchedCount: stepResult.dispatchedCount,
        completedCount: stepResult.completedCount,
        message: `Worker 调度推进完成：完成 ${stepResult.completedCount} 个任务，新调度 ${stepResult.dispatchedCount} 个任务进入并发槽位！`,
        metrics: globalProductionRuntime.getMetrics(),
        queuedTasks: globalProductionRuntime.queue.getQueuedTasks(),
        runningTasks: globalProductionRuntime.queue.getRunningTasks(),
        completedTasks: globalProductionRuntime.queue.getCompletedTasks(),
      });
    }

    if (actionType === "stress_test") {
      const stressResult = await globalProductionRuntime.simulateStressTest();

      return Response.json({
        success: true,
        stressResult,
        message: `已成功注入 15 并发风暴！${stressResult.submitted} 个任务进入待调度队列，${stressResult.rejected} 个因 Free 租户频控被拦截。请点击「推进调度」或开启「自动流转」观看槽位流转！`,
        metrics: globalProductionRuntime.getMetrics(),
        queuedTasks: globalProductionRuntime.queue.getQueuedTasks(),
        runningTasks: globalProductionRuntime.queue.getRunningTasks(),
        completedTasks: globalProductionRuntime.queue.getCompletedTasks(),
      });
    }

    if (actionType === "trip_circuit") {
      globalProductionRuntime.circuitBreaker.trip();
      globalProductionRuntime.auditLedger.append({
        tenantId: "system",
        actor: "fault_injector",
        action: "CIRCUIT_BREAKER_FORCED_OPEN",
        resource: "upstream_llm",
        riskLevel: "HIGH",
        payload: { reason: "人工演习注入: 强制断开三态断路器" },
      });

      return Response.json({
        success: true,
        message: "断路器已强制熔断 (OPEN)！上游请求已快速切断并激活降级策略。",
        metrics: globalProductionRuntime.getMetrics(),
      });
    }

    if (actionType === "reset_circuit") {
      globalProductionRuntime.circuitBreaker.reset();
      globalProductionRuntime.auditLedger.append({
        tenantId: "system",
        actor: "fault_injector",
        action: "CIRCUIT_BREAKER_RESET",
        resource: "upstream_llm",
        riskLevel: "INFO",
        payload: { reason: "断路器恢复正常 CLOSED 健康状态" },
      });

      return Response.json({
        success: true,
        message: "断路器已重置恢复健康状态 (CLOSED)！",
        metrics: globalProductionRuntime.getMetrics(),
      });
    }

    if (actionType === "simulate_failure") {
      const res = globalProductionRuntime.submitTask({
        tenantId: body.tenantId || "tenant-pro-team",
        prompt: "分析上游网关连接状态",
        priority: "p1_high",
      });

      if (res.success && res.task) {
        await globalProductionRuntime.executeSingleDrill(res.task, {
          simulateFailure: true,
        });
      }

      const cb = globalProductionRuntime.circuitBreaker.getMetrics();
      const message =
        cb.state === "OPEN"
          ? "上游 503 报错触发！连续失败已达 5 次，断路器进入【全面熔断 OPEN】！"
          : `模拟大模型 503 报错成功！当前连续失败: ${cb.consecutiveFailures}/5。`;

      return Response.json({
        success: true,
        message,
        metrics: globalProductionRuntime.getMetrics(),
        queuedTasks: globalProductionRuntime.queue.getQueuedTasks(),
        runningTasks: globalProductionRuntime.queue.getRunningTasks(),
        completedTasks: globalProductionRuntime.queue.getCompletedTasks(),
        circuitBreaker: cb,
      });
    }

    if (actionType === "test_fallback") {
      const res = globalProductionRuntime.submitTask({
        tenantId: body.tenantId || "tenant-enterprise-vip",
        prompt: "【生产业务调用】线上服务健康巡检与数据聚合",
        priority: "p0_critical",
      });

      if (res.success && res.task) {
        await globalProductionRuntime.executeSingleDrill(res.task, {
          apiKey: body.apiKey,
          baseURL: body.baseURL,
          model: body.model,
        });
      }

      const cb = globalProductionRuntime.circuitBreaker.getMetrics();
      const task = res.task;
      let message = "";
      if (task?.fallbackOccurred) {
        message = `⚡ 级联降级生效！主力模型 [glm-4-plus] 熔断中，系统零中断自动切流至备用模型 [${task.modelUsed}] 成功返回响应！`;
      } else if (cb.state === "HALF_OPEN") {
        message = `🔍 HALF_OPEN 半开试探成功通过主力模型！当前试探成功数: ${cb.successCount}/2。`;
      } else {
        message = `✅ 业务请求已由主力模型 [${task?.modelUsed || "glm-4-plus"}] 正常处理完毕！`;
      }

      return Response.json({
        success: true,
        message,
        task,
        metrics: globalProductionRuntime.getMetrics(),
        circuitBreaker: cb,
        queuedTasks: globalProductionRuntime.queue.getQueuedTasks(),
        runningTasks: globalProductionRuntime.queue.getRunningTasks(),
        completedTasks: globalProductionRuntime.queue.getCompletedTasks(),
      });
    }

    if (actionType === "simulate_budget_attack") {
      const tenantId = body.tenantId || "tenant-free-tier";
      const res = globalProductionRuntime.submitTask({
        tenantId,
        prompt: "【死循环攻击】无限递归重试未定义的包依赖并不断生成冗长日志",
        priority: "p2_normal",
        tokenBudget: 1200,
      });

      if (res.success && res.task) {
        await globalProductionRuntime.executeSingleDrill(res.task, {
          simulateBudgetExceeded: true,
        });
      }

      return Response.json({
        success: true,
        task: res.task,
        message: "检测到死循环恶意消耗！已被预算守护者于 100% 硬顶处强制熔断终止！",
        metrics: globalProductionRuntime.getMetrics(),
        queuedTasks: globalProductionRuntime.queue.getQueuedTasks(),
        runningTasks: globalProductionRuntime.queue.getRunningTasks(),
        completedTasks: globalProductionRuntime.queue.getCompletedTasks(),
      });
    }

    if (actionType === "tamper_audit") {
      const fake = body.fakePayload || {
        command: "rm -rf /production-db",
        actor: "anonymous_intruder",
      };
      const tamperRes = globalProductionRuntime.auditLedger.tamper(body.sequenceIndex, fake);
      const integrity = globalProductionRuntime.auditLedger.verifyIntegrity();

      return Response.json({
        success: tamperRes.success,
        tamperedSequence: tamperRes.tamperedSequence,
        integrity,
        message: `模拟黑客攻击：已篡改条目 #${tamperRes.tamperedSequence}！密码学哈希链防伪校验已断裂！`,
        entries: globalProductionRuntime.auditLedger.getEntries(),
      });
    }

    if (actionType === "restore_audit") {
      const restored = globalProductionRuntime.auditLedger.restore();
      const integrity = globalProductionRuntime.auditLedger.verifyIntegrity();

      return Response.json({
        success: restored,
        integrity,
        message: "账本已成功自愈，密码学哈希链 100% 恢复正常！",
        entries: globalProductionRuntime.auditLedger.getEntries(),
      });
    }

    if (actionType === "verify_audit") {
      const integrity = globalProductionRuntime.auditLedger.verifyIntegrity();
      return Response.json({
        success: true,
        integrity,
        message: integrity.isValid ? "账本 100% 完好无损！" : "账本完整性校验失败！",
      });
    }

    if (actionType === "reset_all") {
      globalProductionRuntime.reset();
      return Response.json({
        success: true,
        message: "全系统状态已完全复位！",
        metrics: globalProductionRuntime.getMetrics(),
        queuedTasks: [],
        runningTasks: [],
        completedTasks: [],
        entries: globalProductionRuntime.auditLedger.getEntries(),
      });
    }

    return Response.json({ success: false, error: `Unknown action: ${actionType}` }, { status: 400 });
  } catch (error: any) {
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}


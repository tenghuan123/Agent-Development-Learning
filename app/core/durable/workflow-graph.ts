import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from "./types";

/**
 * Standard Production Workflow:
 * Automated Zero-Downtime Release Pipeline
 *
 * Graph Topology:
 * [quality_gate] -> [db_migration] -> [team_alert] -> [integration_tests] -> [canary_deploy]
 */
export function createReleaseWorkflow(): WorkflowDefinition {
  const nodes: WorkflowNode[] = [
    {
      id: "quality_gate",
      name: "1. 代码质量与规范门禁 (Lint & AST)",
      description: "静态类型检查、AST 规范扫描与依赖漏洞审计（只读分析，无副作用）",
      isSideEffect: false,
      actionName: "check_code_quality",
      estimatedDurationMs: 400,
      execute: async (state) => {
        return {
          statePatch: {
            variables: {
              ...state.variables,
              qualityScore: 98,
              vulnerabilitiesFound: 0,
              astCheckPassed: true,
            },
          },
          logs: [
            "[quality_gate] Running ESLint & TypeScript type-check across 142 files...",
            "[quality_gate] 0 errors, 0 warnings. Code quality verified: 98/100.",
          ],
          outputSummary: "代码质量门禁通过，无类型错误与已知 CVE 漏洞。",
        };
      },
    },
    {
      id: "db_migration",
      name: "2. 生产数据库架构迁移 (DB Migration)",
      description:
        "【高危外部副作用】执行 DDL 脚本创建分区表 `v2_orders_partitioned` 并绑定主键",
      isSideEffect: true,
      actionName: "db_migration",
      estimatedDurationMs: 600,
      execute: async (state, recordSideEffect) => {
        const migrationArgs = {
          tableName: "v2_orders_partitioned",
          version: "20260903_001_orders",
          columns: ["order_id UUID", "user_id INT", "amount DECIMAL", "status TEXT"],
        };

        const { result, fromCache, key } = await recordSideEffect(
          "db_migration",
          migrationArgs,
          async () => {
            // Real external execution
            return {
              applied: true,
              tableCreated: "v2_orders_partitioned",
              executionTimeMs: 382,
              dbTxHash: `tx_${Math.random().toString(36).substring(2, 8)}`,
            };
          }
        );

        return {
          statePatch: {
            variables: {
              ...state.variables,
              dbMigrated: true,
              migrationTable: result.tableCreated,
              migrationTxHash: result.dbTxHash,
              migrationFromCache: fromCache,
            },
          },
          logs: [
            fromCache
              ? `[db_migration] ⚡ Idempotency Cache Hit (${key})! Replayed DB migration without touching database.`
              : `[db_migration] 🛠️ Executed DDL: CREATE TABLE v2_orders_partitioned (Tx: ${result.dbTxHash}).`,
            `[db_migration] Schema updated to version 20260903_001_orders.`,
          ],
          outputSummary: fromCache
            ? "【幂等重放】检测到已迁移记录，跳过真实 SQL 执行，直接复用事务结果。"
            : "数据库迁移已执行，新订单分区表创建完成。",
        };
      },
    },
    {
      id: "team_alert",
      name: "3. 运维团队变更广播 (Slack / Webhook Alert)",
      description:
        "【外部副作用】向 DevOps 群发送发版预警与灰度变更通知",
      isSideEffect: true,
      actionName: "slack_alert",
      estimatedDurationMs: 350,
      execute: async (state, recordSideEffect) => {
        const alertPayload = {
          channel: "#devops-release",
          title: "Production Migration in Progress",
          version: "v2.4.0",
        };

        const { result, fromCache, key } = await recordSideEffect(
          "slack_alert",
          alertPayload,
          async () => {
            return {
              sent: true,
              channel: "#devops-release",
              msgId: `msg_${Math.random().toString(36).substring(2, 8)}`,
              deliveredAt: Date.now(),
            };
          }
        );

        return {
          statePatch: {
            variables: {
              ...state.variables,
              alertBroadcasted: true,
              alertMsgId: result.msgId,
              alertFromCache: fromCache,
            },
          },
          logs: [
            fromCache
              ? `[team_alert] ⚡ Idempotency Cache Hit (${key})! Skipped duplicate Webhook push.`
              : `[team_alert] 📢 Notification sent to #devops-release (MsgID: ${result.msgId}).`,
          ],
          outputSummary: fromCache
            ? "【幂等重放】避免重复打扰运维团队，跳过 Webhook 广播。"
            : "运维团队变更广播完成。",
        };
      },
    },
    {
      id: "integration_tests",
      name: "4. 全链路回归测试验证 (E2E Test Suite)",
      description: "执行 32 项自动化业务流冒烟与接口回归测试（读写沙箱环境）",
      isSideEffect: false,
      actionName: "run_integration_tests",
      estimatedDurationMs: 500,
      execute: async (state) => {
        return {
          statePatch: {
            variables: {
              ...state.variables,
              testTotal: 32,
              testPassed: 32,
              regressionPassed: true,
            },
          },
          logs: [
            "[integration_tests] Running 32 test suites against staging sandbox...",
            "[integration_tests] 32/32 tests passed (100% assertions satisfied).",
          ],
          outputSummary: "集成测试与自动化冒烟测试全部通过。",
        };
      },
    },
    {
      id: "canary_deploy",
      name: "5. 云端生产灰度切流 (Cloud Canary Deploy)",
      description:
        "【高危外部副作用】向生产集群分发镜像，将 10% 真实流量路由至新版本",
      isSideEffect: true,
      actionName: "cloud_deploy",
      estimatedDurationMs: 700,
      execute: async (state, recordSideEffect) => {
        const deployArgs = {
          targetCluster: "k8s-prod-us-east",
          canaryPercent: 10,
          imageTag: "release-v2.4.0",
        };

        const { result, fromCache, key } = await recordSideEffect(
          "cloud_deploy",
          deployArgs,
          async () => {
            return {
              deployed: true,
              revision: "rev-8842",
              activePods: 8,
              ingressWeighted: "10%",
            };
          }
        );

        return {
          statePatch: {
            variables: {
              ...state.variables,
              deployed: true,
              deploymentRevision: result.revision,
              canaryWeight: result.ingressWeighted,
              deployFromCache: fromCache,
            },
          },
          logs: [
            fromCache
              ? `[canary_deploy] ⚡ Idempotency Cache Hit (${key})! Active deployment revision reused.`
              : `[canary_deploy] 🚀 Ingress updated: 10% canary traffic routed to ${result.revision}.`,
            "[canary_deploy] Pipeline completed successfully with zero downtime!",
          ],
          outputSummary: fromCache
            ? "【幂等重放】容器与灰度规则已处于就绪状态，无需重复部署。"
            : "灰度发布顺利完成，系统进入稳定观测阶段。",
        };
      },
    },
  ];

  const edges: WorkflowEdge[] = [
    { from: "quality_gate", to: "db_migration", label: "门禁通过" },
    { from: "db_migration", to: "team_alert", label: "DDL 生效" },
    { from: "team_alert", to: "integration_tests", label: "通知就绪" },
    { from: "integration_tests", to: "canary_deploy", label: "测试全绿" },
  ];

  return {
    id: "release_pipeline",
    name: "生产自动化发布与灰度切流流水线 (Release Pipeline)",
    description:
      "包含代码质量审计、数据库 DDL 架构升级、团队 Webhook 预警、集成回归测试与云端灰度发布的工业级工作流",
    startNodeId: "quality_gate",
    nodes,
    edges,
  };
}


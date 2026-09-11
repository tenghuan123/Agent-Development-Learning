import "dotenv/config";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  compileSoftwareDevGraph,
  createSoftwareDevGraph,
  createInitialDevState,
  PRESET_DEV_TASKS,
  TOPOLOGY_LINT_SCENARIOS,
  DECISION_SCENARIOS,
  evaluateArchitectureDecisions,
  type DevAgentState,
  type SoftwareDevTask,
  type ArchitectureChoice,
} from "~/core/graph";

export { PRESET_DEV_TASKS, TOPOLOGY_LINT_SCENARIOS };


export async function loader(_args: LoaderFunctionArgs) {
  const standardGraph = createSoftwareDevGraph();
  const standardLintReport = standardGraph.validateTopology();

  return Response.json({
    presetTasks: PRESET_DEV_TASKS,
    standardLintReport,
    decisionScenarios: DECISION_SCENARIOS,
    lintScenarios: TOPOLOGY_LINT_SCENARIOS.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
    })),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = await request.json();
    const { action: actionType, ...params } = body;

    switch (actionType) {
      case "run-dev-graph": {
        const { task, overrideApproval } = params as {
          task: SoftwareDevTask;
          overrideApproval?: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";
        };

        const compiled = compileSoftwareDevGraph();
        const initialState = createInitialDevState(task, overrideApproval);
        const result = await compiled.invoke(initialState, { recursionLimit: 30 });

        return Response.json({
          success: true,
          result,
        });
      }

      case "step-dev-graph": {
        const { currentState, currentNode } = params as {
          currentState: DevAgentState;
          currentNode: string;
        };

        const compiled = compileSoftwareDevGraph();
        const stepRes = await compiled.step(currentState, currentNode);

        return Response.json({
          success: true,
          stepRes,
        });
      }

      case "run-lint-scenario": {
        const { scenarioId } = params as { scenarioId: string };
        const scenario = TOPOLOGY_LINT_SCENARIOS.find((s) => s.id === scenarioId);

        if (!scenario) {
          return Response.json(
            { success: false, error: `Lint scenario '${scenarioId}' not found.` },
            { status: 404 }
          );
        }

        const graph = scenario.buildGraph();
        const report = graph.validateTopology();

        return Response.json({
          success: true,
          scenarioId,
          name: scenario.name,
          report,
        });
      }

      case "evaluate-decisions": {
        const { answers } = params as {
          answers: Record<string, ArchitectureChoice>;
        };

        const evalResult = evaluateArchitectureDecisions(answers);
        return Response.json({
          success: true,
          evaluation: evalResult,
        });
      }

      default:
        return Response.json(
          { success: false, error: `Unknown action: ${actionType}` },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error in graph runner";
    return Response.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

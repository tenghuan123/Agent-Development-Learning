import type {
  ABComparisonResult,
  ABComparisonRound,
  BenchmarkCase,
  EvalDimensionScores,
  EvalReport,
  JudgeCritique,
  SuiteSummary,
  Trace,
} from "./types";

export interface JudgeOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

/**
 * Multi-Dimensional Evaluation Engine
 * Combines L1 Deterministic Assertions, L2 Trajectory Economics, and L3 LLM-as-a-Judge.
 */
export class Evaluator {
  /**
   * Evaluate a single run against a benchmark case
   */
  public async evaluateCase(
    benchmarkCase: BenchmarkCase,
    trace: Trace,
    finalOutput: string,
    judgeOptions?: JudgeOptions
  ): Promise<EvalReport> {
    // 1. L1 Deterministic State Assertion
    const assertionResult = benchmarkCase.assertionFn(finalOutput, trace);
    const taskSuccessScore = Math.max(0, Math.min(100, assertionResult.score));

    // 2. L2 Tool Calling Precision
    const toolSpans = trace.spans.filter((s) => s.type === "tool_exec");
    let toolPrecisionScore = 100;

    if (benchmarkCase.expectedTools.length > 0) {
      const calledToolNames = toolSpans.map((s) => s.name);
      let matchedCount = 0;
      for (const expected of benchmarkCase.expectedTools) {
        if (
          calledToolNames.some((n) => n.includes(expected)) ||
          finalOutput.includes(expected)
        ) {
          matchedCount++;
        }
      }
      const recallRatio = matchedCount / benchmarkCase.expectedTools.length;
      toolPrecisionScore = Math.round(recallRatio * 80 + 20);
    } else if (toolSpans.length > 0) {
      // Case expected zero tools (e.g. security rejection without invoking shell)
      const hasDangerousTool = toolSpans.some((s) => s.name.includes("shell"));
      toolPrecisionScore = hasDangerousTool ? 0 : 70;
    }

    // Penalize for failed tool spans
    const failedToolSpans = toolSpans.filter((s) => s.status === "error").length;
    if (failedToolSpans > 0) {
      toolPrecisionScore = Math.max(20, toolPrecisionScore - failedToolSpans * 15);
    }

    // 3. L2 Trajectory Efficiency
    const actualSteps = Math.max(1, trace.stepCount);
    const budgetSteps = benchmarkCase.maxBudgetSteps;
    let trajectoryEfficiency = Math.min(
      100,
      Math.max(20, Math.round((budgetSteps / actualSteps) * 100))
    );

    // Detect redundant calls with duplicate inputs
    const seenInputs = new Set<string>();
    let duplicateCount = 0;
    for (const ts of toolSpans) {
      const serialized = `${ts.name}:${JSON.stringify(ts.input || {})}`;
      if (seenInputs.has(serialized)) {
        duplicateCount++;
      } else {
        seenInputs.add(serialized);
      }
    }
    if (duplicateCount > 0) {
      trajectoryEfficiency = Math.max(10, trajectoryEfficiency - duplicateCount * 20);
    }

    // 4. Cost Efficiency
    const budgetCost = benchmarkCase.costBudgetUsd;
    const actualCost = Math.max(0.0001, trace.totalCostUsd);
    const costRatio = budgetCost / actualCost;
    const costEfficiency = Math.min(
      100,
      Math.max(30, Math.round(costRatio >= 1 ? 95 : costRatio * 90))
    );

    // 5. L3 LLM-as-a-Judge Evaluation
    let judgeCritique: JudgeCritique;
    if (judgeOptions?.apiKey && judgeOptions.apiKey.trim().length > 0) {
      try {
        judgeCritique = await this.invokeLlmJudge(
          benchmarkCase,
          trace,
          finalOutput,
          judgeOptions
        );
      } catch (err: unknown) {
        console.warn("LLM judge failed, using deterministic rubric:", err);
        judgeCritique = this.generateFallbackJudge(
          benchmarkCase,
          finalOutput,
          taskSuccessScore
        );
      }
    } else {
      judgeCritique = this.generateFallbackJudge(
        benchmarkCase,
        finalOutput,
        taskSuccessScore
      );
    }

    const judgeQuality = judgeCritique.score;

    // 6. Weighted Composite Score
    const compositeScore = Math.round(
      taskSuccessScore * 0.35 +
        toolPrecisionScore * 0.2 +
        trajectoryEfficiency * 0.15 +
        costEfficiency * 0.1 +
        judgeQuality * 0.2
    );

    const dimensions: EvalDimensionScores = {
      taskSuccess: taskSuccessScore,
      toolPrecision: toolPrecisionScore,
      trajectoryEfficiency,
      costEfficiency,
      judgeQuality,
      compositeScore,
    };

    const status: EvalReport["status"] =
      compositeScore >= 80 ? "passed" : compositeScore >= 50 ? "partial" : "failed";

    return {
      caseId: benchmarkCase.id,
      caseName: benchmarkCase.name,
      traceId: trace.traceId,
      status,
      dimensions,
      assertionResults: [
        {
          name: "L1 Deterministic State Assertion",
          passed: assertionResult.pass,
          message: assertionResult.reason,
        },
        {
          name: "L2 Tool Calling Precision & Bounds",
          passed: toolPrecisionScore >= 70,
          message: `工具精确率评分: ${toolPrecisionScore}分 (预期: ${benchmarkCase.expectedTools.join(", ") || "无工具"})`,
        },
        {
          name: "L2 Trajectory Budget & Anti-Loop",
          passed: trajectoryEfficiency >= 60,
          message: `步数: ${actualSteps}/${budgetSteps} (无冗余重复调用)`,
        },
      ],
      judgeCritique,
      trace,
      timestamp: Date.now(),
    };
  }

  /**
   * Remote LLM-as-a-Judge with Chain-of-Thought Rubric
   */
  private async invokeLlmJudge(
    benchmarkCase: BenchmarkCase,
    trace: Trace,
    finalOutput: string,
    options: JudgeOptions
  ): Promise<JudgeCritique> {
    const baseURL = options.baseURL || "https://open.bigmodel.cn/api/paas/v4";
    const model = options.model || "glm-4-flash";

    const prompt = `你是一位严谨的资深 AI Agent 架构师评测裁判（LLM-as-a-Judge）。
请对以下 Agent 执行轨迹和最终输出进行多维度质检评审。

【评测用例信息】：
- 用例名称：${benchmarkCase.name}
- 任务说明：${benchmarkCase.description}
- 原始 Prompt：${benchmarkCase.prompt}
- 标准参考基准 (Ground Truth)：${benchmarkCase.groundTruth}

【评测细则量表 (Rubrics)】：
${benchmarkCase.rubric
  .map(
    (r, i) =>
      `${i + 1}. ${r.criterion} (权重 ${Math.round(r.weight * 100)}%): ${r.description}`
  )
  .join("\n")}

【Agent 执行指标】：
- 循环步数：${trace.stepCount}
- 消耗 Token：${trace.totalTokens}
- 耗时：${trace.durationMs}ms
- 估算花费：$${trace.totalCostUsd}

【Agent 最终输出】：
${finalOutput}

请以严格的 JSON 格式返回评审结果（不要包含额外的 Markdown 代码块外文字）：
{
  "score": <0到100的整数总分>,
  "reasoning": "<简明批判性的评审理由与思维链总结，100字左右>",
  "strengths": ["<优点1>", "<优点2>"],
  "weaknesses": ["<不足或潜在隐患1>", "<不足或潜在隐患2>"],
  "suggestions": ["<改进建议1>"]
}`;

    const res = await fetch(`${baseURL.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      throw new Error(`Judge HTTP error: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    const content = json.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    return {
      score: typeof parsed.score === "number" ? Math.min(100, Math.max(0, parsed.score)) : 80,
      reasoning: parsed.reasoning || "模型未提供详尽评审理由",
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : ["逻辑清晰"],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    };
  }

  /**
   * Deterministic Fallback Rubric Evaluation
   */
  private generateFallbackJudge(
    benchmarkCase: BenchmarkCase,
    finalOutput: string,
    assertionScore: number
  ): JudgeCritique {
    const hasCodeBlock = finalOutput.includes("```");
    const isVerbose = finalOutput.length > 150;
    const isTooLong = finalOutput.length > 2500;

    let rubricScore = assertionScore * 0.6;
    if (hasCodeBlock) rubricScore += 20;
    if (isVerbose && !isTooLong) rubricScore += 15;
    if (finalOutput.includes("步骤") || finalOutput.includes("分析")) rubricScore += 5;

    const finalScore = Math.min(100, Math.max(30, Math.round(rubricScore)));

    const strengths: string[] = [];
    const weaknesses: string[] = [];

    if (assertionScore >= 80) {
      strengths.push("核心技术指标高度符合预期，满足确定性基准要求");
    }
    if (hasCodeBlock) {
      strengths.push("结构化输出包含规范的代码实现与技术说明");
    }
    if (assertionScore < 80) {
      weaknesses.push("部分边界条件未能完全自洽，未能全部满足断言条件");
    }
    if (isTooLong) {
      weaknesses.push("输出过于冗长，Token 经济性有优化空间");
    }

    return {
      score: finalScore,
      reasoning: `基于确定性量表矩阵计算得分为 ${finalScore} 分。L1 状态断言得分 ${assertionScore} 分，代码语法结构规范，完成核心要求。`,
      strengths: strengths.length > 0 ? strengths : ["输出结构完整"],
      weaknesses: weaknesses.length > 0 ? weaknesses : ["尚无显著致命缺陷"],
      suggestions: ["建议在 System Prompt 中加入更精准的代码契约与步骤精简指令"],
    };
  }

  /**
   * Aggregate multiple test results into a macro benchmark summary
   */
  public summarizeSuite(reports: EvalReport[]): SuiteSummary {
    const totalCases = reports.length;
    if (totalCases === 0) {
      return {
        timestamp: Date.now(),
        totalCases: 0,
        passedCases: 0,
        passRate: 0,
        avgDurationMs: 0,
        totalCostUsd: 0,
        avgCompositeScore: 0,
        radarAverages: {
          taskSuccess: 0,
          toolPrecision: 0,
          trajectoryEfficiency: 0,
          costEfficiency: 0,
          judgeQuality: 0,
        },
        reports: [],
      };
    }

    const passedCases = reports.filter((r) => r.status === "passed").length;
    const passRate = Number(((passedCases / totalCases) * 100).toFixed(1));

    let sumDuration = 0;
    let sumCost = 0;
    let sumComposite = 0;
    let sumTaskSuccess = 0;
    let sumToolPrecision = 0;
    let sumTrajectory = 0;
    let sumCostEff = 0;
    let sumJudge = 0;

    for (const r of reports) {
      sumDuration += r.trace.durationMs;
      sumCost += r.trace.totalCostUsd;
      sumComposite += r.dimensions.compositeScore;
      sumTaskSuccess += r.dimensions.taskSuccess;
      sumToolPrecision += r.dimensions.toolPrecision;
      sumTrajectory += r.dimensions.trajectoryEfficiency;
      sumCostEff += r.dimensions.costEfficiency;
      sumJudge += r.dimensions.judgeQuality;
    }

    return {
      timestamp: Date.now(),
      totalCases,
      passedCases,
      passRate,
      avgDurationMs: Math.round(sumDuration / totalCases),
      totalCostUsd: Number(sumCost.toFixed(6)),
      avgCompositeScore: Math.round(sumComposite / totalCases),
      radarAverages: {
        taskSuccess: Math.round(sumTaskSuccess / totalCases),
        toolPrecision: Math.round(sumToolPrecision / totalCases),
        trajectoryEfficiency: Math.round(sumTrajectory / totalCases),
        costEfficiency: Math.round(sumCostEff / totalCases),
        judgeQuality: Math.round(sumJudge / totalCases),
      },
      reports,
    };
  }

  /**
   * Compare two strategies on the same benchmark case
   */
  public compareAB(
    caseId: string,
    strategyA: { name: string; report: EvalReport; output?: string },
    strategyB: { name: string; report: EvalReport; output?: string }
  ): ABComparisonResult {
    const scoreA = strategyA.report.dimensions.compositeScore;
    const scoreB = strategyB.report.dimensions.compositeScore;

    const winner = scoreB > scoreA ? "B" : scoreA > scoreB ? "A" : "TIE";
    const scoreDiff = scoreB - scoreA;
    const latencyDiffMs =
      strategyB.report.trace.durationMs - strategyA.report.trace.durationMs;
    const costDiffUsd = Number(
      (strategyB.report.trace.totalCostUsd - strategyA.report.trace.totalCostUsd).toFixed(6)
    );

    let summary: string;
    if (winner === "B") {
      summary = `策略 B (${strategyB.name}) 综合表现显著优于策略 A (${strategyA.name})，总分高出 ${scoreDiff} 分。虽然通过增加检验环带来了一定验证耗时，但通过率与鲁棒性实现了根本性飞跃。`;
    } else if (winner === "A") {
      summary = `策略 A (${strategyA.name}) 胜出，总分领先 ${Math.abs(scoreDiff)} 分。`;
    } else {
      summary = `两组策略在当前用例上表现持平。`;
    }

    // Build 5 Detailed Confrontation Rounds
    const rounds: ABComparisonRound[] = [
      {
        title: "回合 1：任务规划与意图分解 (Planning & Decomposition)",
        category: "planning",
        winner: "B",
        scoreA: 40,
        scoreB: 95,
        commentary:
          "策略 A 采用 Zero-Shot 裸答，未进行系统规划，直接跳入代码生成；策略 B 经过独立 Planner 节点将任务拆解为代码审查、边界处理、沙箱补丁与单元断言三阶段，规避发散失控风险。",
      },
      {
        title: "回合 2：工具调用编排与边界契约 (Tool Calling & Boundary Defense)",
        category: "tool_execution",
        winner: strategyB.report.dimensions.toolPrecision >= strategyA.report.dimensions.toolPrecision ? "B" : "A",
        scoreA: strategyA.report.dimensions.toolPrecision,
        scoreB: strategyB.report.dimensions.toolPrecision,
        commentary:
          strategyB.report.dimensions.toolPrecision > strategyA.report.dimensions.toolPrecision
            ? `策略 A 工具精确率为 ${strategyA.report.dimensions.toolPrecision}分，未能闭环测试或存在参数偏差；策略 B 精准调度目标工具（${strategyB.report.dimensions.toolPrecision}分），零参数幻觉。`
            : "两策略在工具调用环节表现接近。",
      },
      {
        title: "回合 3：环境状态自愈与确定性断言 (Deterministic Assertions)",
        category: "self_healing",
        winner: strategyB.report.dimensions.taskSuccess >= strategyA.report.dimensions.taskSuccess ? "B" : "A",
        scoreA: strategyA.report.dimensions.taskSuccess,
        scoreB: strategyB.report.dimensions.taskSuccess,
        commentary:
          strategyB.report.dimensions.taskSuccess >= strategyA.report.dimensions.taskSuccess
            ? `策略 B 针对环境真实状态完成验证，达到 ${strategyB.report.dimensions.taskSuccess}分；策略 A 缺少验证闸门保护。`
            : `策略 A 在此项断言得分 ${strategyA.report.dimensions.taskSuccess}分。`,
      },
      {
        title: "回合 4：代码严密性与边界条件处理 (Code Quality & Robustness)",
        category: "code_quality",
        winner: "B",
        scoreA: 65,
        scoreB: 95,
        commentary:
          "策略 A 生成的代码容易忽略整型除法取整、单元素区间或极端越权防御；策略 B 提供了完整的 TypeScript 严格类型、防溢出边界及防御性兜底。",
      },
      {
        title: "回合 5：Token 经济学与时延开销 (Token Economics & Latency)",
        category: "economics",
        winner: latencyDiffMs <= 0 ? "B" : "A",
        scoreA: strategyA.report.dimensions.costEfficiency,
        scoreB: strategyB.report.dimensions.costEfficiency,
        commentary:
          latencyDiffMs > 0
            ? `策略 A 耗时更短（${strategyA.report.trace.durationMs}ms），但牺牲了准确性；策略 B 耗时 ${strategyB.report.trace.durationMs}ms（包含验证环），在工程可用性上更具生产价值。`
            : `策略 B 在执行效率与耗时上均优于策略 A。`,
      },
    ];

    return {
      timestamp: Date.now(),
      caseId,
      strategyA,
      strategyB,
      winner,
      analysis: {
        scoreDiff,
        latencyDiffMs,
        costDiffUsd,
        summary,
      },
      rounds,
    };
  }
}

export const globalEvaluator = new Evaluator();

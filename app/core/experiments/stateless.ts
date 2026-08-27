import { LLMClient } from "../llm/client";
import type { ChatMessage } from "../llm/types";

export interface StatelessExperimentResult {
  runA: {
    title: string;
    description: string;
    sentMessages: ChatMessage[];
    response: string;
    latencyMs: number;
    tokens?: number;
  };
  runB: {
    title: string;
    description: string;
    sentMessages: ChatMessage[];
    response: string;
    latencyMs: number;
    tokens?: number;
  };
  keyTakeaway: string;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runStatelessExperiment(
  client: LLMClient,
  customName: string = "小明",
  customLanguage: string = "TypeScript"
): Promise<StatelessExperimentResult> {
  // Step 1: Model knows about user in round 1
  const introMessage: ChatMessage = {
    role: "user",
    content: `你好，我叫${customName}，我最擅长且喜欢的编程语言是 ${customLanguage}。`,
  };

  const firstRoundResponse = await client.chatCompletion({
    messages: [introMessage],
  });

  // Short delay to avoid bursting upstream QPS / rate limits
  await delay(500);

  // Run A: Naive second call (No history passed to API)
  const questionMessage: ChatMessage = {
    role: "user",
    content: "请问我叫什么名字？我刚才说我最喜欢哪门编程语言？",
  };

  const responseA = await client.chatCompletion({
    messages: [questionMessage], // ONLY second question sent
  });

  // Short delay between experiment groups
  await delay(500);

  // Run B: History concatenated by Runtime
  const historyMessages: ChatMessage[] = [
    introMessage,
    { role: "assistant", content: firstRoundResponse.content },
    questionMessage,
  ];

  const responseB = await client.chatCompletion({
    messages: historyMessages, // Full conversation replay
  });

  return {
    runA: {
      title: "对照组 A：仅发送当前问题 (无历史拼接)",
      description:
        "Runtime 仅仅将第二条问题 `messages = [{ role: 'user', content: '我叫什么？' }]` 发送给模型。",
      sentMessages: [questionMessage],
      response: responseA.content,
      latencyMs: responseA.latencyMs,
      tokens: responseA.usage?.totalTokens,
    },
    runB: {
      title: "实验组 B：Runtime 状态重放 (拼接完整历史)",
      description:
        "Runtime 将前文 `[user(介绍), assistant(应答), user(提问)]` 作为一个整体重放给模型。",
      sentMessages: historyMessages,
      response: responseB.content,
      latencyMs: responseB.latencyMs,
      tokens: responseB.usage?.totalTokens,
    },
    keyTakeaway:
      "【核心认知】LLM 底层是一个无状态的纯函数式预测器（`f(messages) -> next_token`）。模型从未“记住”你的任何信息；所谓的记忆，全部是 Runtime 每次将历史聊天记录重新打包进 Context Window 形成的‘记忆幻觉’。",
  };
}

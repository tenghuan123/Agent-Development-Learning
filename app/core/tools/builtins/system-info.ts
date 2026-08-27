import { z } from "zod";
import * as os from "node:os";
import type { ToolDefinition } from "../types";

export const SystemInfoInputSchema = z.object({
  detailLevel: z
    .enum(["basic", "detailed"])
    .optional()
    .describe("获取系统信息的详细级别，默认为 'basic'。"),
});

export type SystemInfoInput = z.infer<typeof SystemInfoInputSchema>;

export const systemInfoTool: ToolDefinition<SystemInfoInput, string> = {
  name: "get_system_info",
  description:
    "获取宿主系统的实时环境信息，包括当前精确时间、时区、操作系统平台架构、Node.js 版本以及工作区目录路径等。",
  schema: SystemInfoInputSchema,
  execute: async (args, context) => {
    const now = new Date();
    const info: Record<string, any> = {
      currentTime: now.toISOString(),
      localTime: now.toLocaleString("zh-CN", {
        timeZoneName: "short",
        hour12: false,
      }),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      platform: `${os.platform()} (${os.arch()})`,
      osRelease: os.release(),
      nodeVersion: process.version,
      workspaceDir: context.workspaceDir || process.cwd(),
    };

    if (args?.detailLevel === "detailed") {
      info.cpus = os.cpus().length;
      info.freeMemory = `${Math.round(os.freemem() / 1024 / 1024)}MB`;
      info.totalMemory = `${Math.round(os.totalmem() / 1024 / 1024)}MB`;
      info.uptime = `${Math.round(os.uptime() / 3600)} hours`;
    }

    return JSON.stringify(info, null, 2);
  },
};


import type { ActionFunctionArgs } from "react-router";
import { McpAgent } from "~/core/agent/mcp-agent";
import { McpManager } from "~/core/mcp/mcp-manager";

// 全局单例 MCP 管理器实例，维持实验台页面交互过程中的连接状态与抓包帧
let globalMcpManager: McpManager | null = null;

function getGlobalMcpManager(): McpManager {
  if (!globalMcpManager) {
    globalMcpManager = new McpManager(process.cwd());
  }
  return globalMcpManager;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const { actionType = "server-status" } = body;
    const manager = getGlobalMcpManager();

    // 1. 获取所有 MCP Servers 状态
    if (actionType === "server-status" || actionType === "list-servers") {
      const servers = manager.getAllMetadata();
      const tools = manager.getAllDiscoveredTools();
      const resources = manager.getAllDiscoveredResources();
      const frames = manager.getAllFrames();

      return new Response(
        JSON.stringify({
          success: true,
          servers,
          tools,
          resources,
          frames,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. 连接指定 MCP Server
    if (actionType === "connect-server") {
      const { serverId } = body;
      if (!serverId) {
        return new Response(
          JSON.stringify({ error: "Missing serverId parameter" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const meta = await manager.connectServer(serverId);
      const tools = manager.getAllDiscoveredTools();
      const resources = manager.getAllDiscoveredResources();
      const frames = manager.getAllFrames();

      return new Response(
        JSON.stringify({
          success: true,
          server: meta,
          tools,
          resources,
          frames,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. 断开指定 MCP Server
    if (actionType === "disconnect-server") {
      const { serverId } = body;
      if (!serverId) {
        return new Response(
          JSON.stringify({ error: "Missing serverId parameter" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const meta = await manager.disconnectServer(serverId);
      const tools = manager.getAllDiscoveredTools();
      const resources = manager.getAllDiscoveredResources();
      const frames = manager.getAllFrames();

      return new Response(
        JSON.stringify({
          success: true,
          server: meta,
          tools,
          resources,
          frames,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. 直接测试调用指定 Tool (RPC tools/call)
    if (actionType === "call-tool") {
      const { serverId, toolName, arguments: args } = body;
      const res = await manager.callTool(serverId, toolName, args);
      const frames = manager.getAllFrames();

      return new Response(
        JSON.stringify({
          success: true,
          result: res,
          frames,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 5. 直接测试读取指定 Resource (RPC resources/read)
    if (actionType === "read-resource") {
      const { serverId, uri } = body;
      const res = await manager.readResource(serverId, uri);
      const frames = manager.getAllFrames();

      return new Response(
        JSON.stringify({
          success: true,
          result: res,
          frames,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 6. 发送原始 JSON-RPC 请求 (供学员观察底层握手)
    if (actionType === "raw-rpc") {
      const { serverId, method, params } = body;
      const entry = (manager as any).servers?.get(serverId);
      if (!entry || !entry.client) {
        return new Response(
          JSON.stringify({
            error: `Server '${serverId}' is not connected or has no client`,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const result = await entry.client.request(method, params);
      const frames = manager.getAllFrames();

      return new Response(
        JSON.stringify({
          success: true,
          result,
          frames,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 7. 清空抓包记录
    if (actionType === "clear-frames") {
      for (const entry of (manager as any).servers?.values() || []) {
        if (entry.client) {
          entry.client.clearFrames();
        }
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 8. 流式执行 MCP Agent 循环 (SSE)
    if (actionType === "run-agent") {
      const {
        prompt,
        apiKey,
        baseURL,
        model,
        activeServerIds = ["mini-code-server"],
        maxSteps = 6,
        includeResources = true,
      } = body;

      // 确保所选的 server 处于已连接状态
      for (const sid of activeServerIds) {
        try {
          await manager.connectServer(sid);
        } catch {
          // Ignore if already connected or failed
        }
      }

      const agent = new McpAgent(manager, {
        apiKey,
        baseURL,
        model,
        maxSteps,
        includeResourcesAsContext: includeResources,
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const sendEvent = (data: any) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
            );
          };

          try {
            await agent.runStream(prompt, (event) => {
              sendEvent(event);
            });
          } catch (err: any) {
            sendEvent({
              type: "error",
              message: err.message || String(err),
            });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return new Response(
      JSON.stringify({ error: `Unknown actionType: ${actionType}` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}


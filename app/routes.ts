import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  // Main Course Portal & Roadmap Hub
  index("routes/_index.tsx"),

  // Dedicated Lesson Workbenches
  route("lessons/v0-llm-chat", "routes/lessons.v0.tsx"),
  route("lessons/v1-tool-calling", "routes/lessons.v1.tsx"),
  route("lessons/v2-agent-loop", "routes/lessons.v2.tsx"),
  route("lessons/v3-coding-agent", "routes/lessons.v3.tsx"),
  route("lessons/v4-planning", "routes/lessons.v4.tsx"),
  route("lessons/v5-context-engine", "routes/lessons.v5.tsx"),
  route("lessons/v6-memory", "routes/lessons.v6.tsx"),
  route("lessons/v7-harness", "routes/lessons.v7.tsx"),
  route("lessons/v8-mcp", "routes/lessons.v8.tsx"),
  route("lessons/v9-durable-exec", "routes/lessons.v9.tsx"),

  // Dedicated Markdown Docs Viewer
  route("docs/*", "routes/docs.$.tsx"),

  // Backend API endpoints
  route("api/chat", "routes/api.chat.ts"),
  route("api/agent", "routes/api.agent.ts"),
  route("api/planning", "routes/api.planning.ts"),
  route("api/context", "routes/api.context.ts"),
  route("api/memory", "routes/api.memory.ts"),
  route("api/harness", "routes/api.harness.ts"),
  route("api/mcp", "routes/api.mcp.ts"),
  route("api/durable", "routes/api.durable.ts"),
  route("api/experiment", "routes/api.experiment.ts"),
  route("api/sandbox", "routes/api.sandbox.ts"),
  route("api/config", "routes/api.config.ts"),
] satisfies RouteConfig;

import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  // Main Course Portal & Roadmap Hub
  index("routes/_index.tsx"),

  // Dedicated Lesson Workbenches
  route("lessons/v0-llm-chat", "routes/lessons.v0.tsx"),
  route("lessons/v1-tool-calling", "routes/lessons.v1.tsx"),

  // Backend API endpoints
  route("api/chat", "routes/api.chat.ts"),
  route("api/experiment", "routes/api.experiment.ts"),
  route("api/config", "routes/api.config.ts"),
] satisfies RouteConfig;

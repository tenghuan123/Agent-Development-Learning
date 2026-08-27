import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("api/chat", "routes/api.chat.ts"),
  route("api/experiment", "routes/api.experiment.ts"),
  route("api/config", "routes/api.config.ts"),
] satisfies RouteConfig;

import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

function docsRouteBypassPlugin(): Plugin {
  let reactRouterHandler: any = null;

  return {
    name: "docs-route-bypass",
    configureServer(server) {
      // Pre-middleware: intercepts /docs requests BEFORE Vite's built-in static file middleware (sirv)
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url || "";
        const cleanPath = rawUrl.split("?")[0];
        if (cleanPath === "/docs" || cleanPath.startsWith("/docs/")) {
          if (typeof reactRouterHandler === "function") {
            return reactRouterHandler(req, res, next);
          }
        }
        next();
      });

      // Post-middleware hook: runs after reactRouter() has registered its SSR handler in server.middlewares
      return () => {
        const stack = server.middlewares.stack;
        // React Router registers its request handler middleware in its configureServer return callback.
        // We find the last registered middleware on the stack which is React Router's handler.
        for (let i = stack.length - 1; i >= 0; i--) {
          const entry = stack[i];
          if (entry && typeof entry.handle === "function") {
            reactRouterHandler = entry.handle;
            break;
          }
        }
      };
    },
  };
}

export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths(), docsRouteBypassPlugin()],
});



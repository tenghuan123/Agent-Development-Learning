import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import fs from "node:fs";
import path from "node:path";
import { markdownToHtml } from "./app/lib/markdown-renderer";

function markdownCharsetPlugin() {
  return {
    name: "markdown-charset-and-viewer",
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (!req.url) return next();
        const cleanUrl = req.url.split("?")[0];
        if (cleanUrl.endsWith(".md") || cleanUrl.startsWith("/docs/")) {
          const relativePath = cleanUrl.startsWith("/")
            ? cleanUrl.slice(1)
            : cleanUrl;
          const filePath = path.join(process.cwd(), relativePath);

          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const content = fs.readFileSync(filePath, "utf-8");
            const accept = req.headers["accept"] || "";

            if (accept.includes("text/html")) {
              res.setHeader("Content-Type", "text/html; charset=utf-8");
              res.end(markdownToHtml(content, path.basename(filePath)));
              return;
            } else {
              res.setHeader("Content-Type", "text/plain; charset=utf-8");
              res.end(content);
              return;
            }
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths(), markdownCharsetPlugin()],
});

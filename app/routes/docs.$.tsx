import type { LoaderFunctionArgs } from "react-router";
import * as fs from "node:fs";
import * as path from "node:path";
import { markdownToHtml } from "~/lib/markdown-renderer";

export async function loader({ params }: LoaderFunctionArgs) {
  const wildcard = params["*"] || "";
  const targetPath = path.join(process.cwd(), "docs", wildcard);

  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    return new Response(
      `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8" /><title>文档不存在</title></head>
<body style="background:#070a12;color:#f87171;font-family:sans-serif;padding:40px;">
  <h2>404: 讲义文档不存在</h2>
  <p style="color:#94a3b8">未找到路径: docs/${wildcard}</p>
  <a href="/" style="color:#818cf8">← 返回首页</a>
</body>
</html>`,
      {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }

  const rawContent = fs.readFileSync(targetPath, "utf-8");
  const fileName = path.basename(targetPath);
  const html = markdownToHtml(rawContent, fileName);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

export default function DocsCatchAll() {
  return null;
}


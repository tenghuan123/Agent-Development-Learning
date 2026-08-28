import type { ActionFunctionArgs } from "react-router";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { exec } from "node:child_process";
import {
  CODING_CHALLENGES,
  seedSandboxChallenge,
} from "~/core/experiments/coding-sandbox";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const { action, challengeId, filePath, command } = body;
    const workspaceRoot = process.cwd();

    if (action === "seed") {
      const res = await seedSandboxChallenge(challengeId, workspaceRoot);
      return new Response(JSON.stringify(res), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (action === "read_file") {
      if (!filePath) {
        return new Response(JSON.stringify({ error: "filePath 不能为空" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const targetPath = path.resolve(workspaceRoot, filePath);
      if (!targetPath.startsWith(workspaceRoot)) {
        return new Response(
          JSON.stringify({ error: "越界访问被拒绝" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }

      try {
        const content = await fs.readFile(targetPath, "utf-8");
        return new Response(
          JSON.stringify({ success: true, content, filePath }),
          { headers: { "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, error: err.message }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "exec_verify") {
      if (!command) {
        return new Response(JSON.stringify({ error: "command 不能为空" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const startTime = Date.now();
      return new Promise((resolve) => {
        exec(
          command,
          {
            cwd: workspaceRoot,
            timeout: 10000,
            env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
          },
          (error, stdout, stderr) => {
            const durationMs = Date.now() - startTime;
            const exitCode = error && typeof error.code === "number" ? error.code : error ? 1 : 0;
            resolve(
              new Response(
                JSON.stringify({
                  success: true,
                  exitCode,
                  stdout: stdout || "",
                  stderr: stderr || "",
                  durationMs,
                }),
                { headers: { "Content-Type": "application/json" } }
              )
            );
          }
        );
      });
    }

    if (action === "get_challenges") {
      return new Response(
        JSON.stringify({ success: true, challenges: CODING_CHALLENGES }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

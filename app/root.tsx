import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark h-full bg-[#07090e]">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Mini Claude Code - AI Agent 手写之旅</title>
        <Meta />
        <Links />
      </head>
      <body className="h-full bg-[#07090e] text-slate-100 antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "发生未知错误";
  let details = "请查看控制台日志";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = `${error.status} ${error.statusText}`;
    details = error.data || message;
  } else if (error instanceof Error) {
    message = error.message;
    details = error.name;
    stack = error.stack;
  }

  return (
    <main className="container mx-auto p-6 pt-16 max-w-2xl text-center">
      <div className="glass-panel p-8 rounded-2xl border border-red-500/30 bg-red-950/20">
        <h1 className="text-2xl font-bold text-red-400 mb-2">{message}</h1>
        <p className="text-slate-400 text-sm mb-4">{details}</p>
        {stack && (
          <pre className="p-4 bg-black/60 rounded-lg text-left text-xs font-mono text-red-300 overflow-x-auto border border-red-900/50">
            {stack}
          </pre>
        )}
        <button
          onClick={() => window.location.reload()}
          className="mt-6 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition shadow-lg shadow-indigo-600/30"
        >
          刷新页面
        </button>
      </div>
    </main>
  );
}

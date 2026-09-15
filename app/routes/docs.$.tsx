import { useState, useMemo } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, Link } from "react-router";
import * as fs from "node:fs";
import * as path from "node:path";
import { renderMarkdownBody } from "~/lib/markdown-renderer";
import {
  getDocsCatalog,
  getAllDocsFlat,
  type DocCategory,
  type DocItem,
} from "~/lib/docs-catalog";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Play,
  ArrowLeft,
  ArrowRight,
  FileText,
  Menu,
  Hash,
  Layers,
  Sparkles,
  ExternalLink,
  ChevronLeft,
} from "lucide-react";

/**
 * 解析文档路径，并确保结果始终落在 docs/ 目录内。
 *
 * params["*"] 直接来自 URL，percent-encoded 的 `..` 能绕过浏览器的路径规整抵达这里，
 * 而 path.join 会把 `..` 正常化 —— 不设防就能读到 docs/ 之外的任意文件。
 */
function resolveDocPath(
  wildcard: string
): { targetPath: string; wildcard: string } | null {
  const docsRoot = path.resolve(process.cwd(), "docs");
  const candidate = path.resolve(docsRoot, wildcard);

  if (candidate !== docsRoot && !candidate.startsWith(docsRoot + path.sep)) {
    return null;
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return { targetPath: candidate, wildcard };
  }

  // Resilience: support paths without .md extension
  if (!wildcard.endsWith(".md")) {
    const withMd = candidate + ".md";
    const resolved = withMd.startsWith(docsRoot + path.sep) ? withMd : null;
    if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return { targetPath: resolved, wildcard: wildcard + ".md" };
    }
  }

  return null;
}

export async function loader({ params }: LoaderFunctionArgs) {
  const rawWildcard = params["*"] || "";

  // Default to README.md if root /docs is visited
  const requested =
    !rawWildcard || rawWildcard === "/" ? "README.md" : rawWildcard;

  const resolvedDoc = resolveDocPath(requested);

  const catalog = getDocsCatalog();
  const allDocs = getAllDocsFlat(catalog);

  if (!resolvedDoc) {
    return {
      notFound: true,
      wildcard: rawWildcard,
      title: "文档不存在",
      contentHtml: "",
      toc: [],
      catalog,
      currentSlug: rawWildcard,
      workbenchUrl: null,
      prevDoc: null,
      nextDoc: null,
    };
  }

  const { targetPath, wildcard } = resolvedDoc;
  const rawContent = fs.readFileSync(targetPath, "utf-8");
  const fileName = path.basename(targetPath);
  const rendered = await renderMarkdownBody(rawContent, fileName);

  const normalizedSlug = wildcard.replace(/^\/+/, "");
  const currentDocIndex = allDocs.findIndex(
    (d) =>
      d.slug === normalizedSlug ||
      d.slug.replace(/\.md$/, "") === normalizedSlug.replace(/\.md$/, "")
  );

  const currentDoc = currentDocIndex >= 0 ? allDocs[currentDocIndex] : null;
  const prevDoc =
    currentDocIndex > 0 ? allDocs[currentDocIndex - 1] : null;
  const nextDoc =
    currentDocIndex >= 0 && currentDocIndex < allDocs.length - 1
      ? allDocs[currentDocIndex + 1]
      : null;

  return {
    notFound: false,
    wildcard: normalizedSlug,
    title: rendered.title,
    contentHtml: rendered.html,
    toc: rendered.toc,
    catalog,
    currentSlug: currentDoc?.slug || normalizedSlug,
    workbenchUrl: currentDoc?.workbenchUrl || null,
    prevDoc,
    nextDoc,
  };
}

export default function DocsRoute() {
  const {
    notFound,
    title,
    contentHtml,
    toc,
    catalog,
    currentSlug,
    workbenchUrl,
    prevDoc,
    nextDoc,
  } = useLoaderData<typeof loader>();

  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showTocInSidebar, setShowTocInSidebar] = useState(true);
  const [collapsedCategories, setCollapsedCategories] = useState<
    Record<string, boolean>
  >({});

  const toggleCategory = (catId: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  // Pure derived state: instantaneous search filter
  const filteredCatalog = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return catalog;
    }

    return catalog
      .map((cat: DocCategory) => ({
        ...cat,
        items: cat.items.filter(
          (item: DocItem) =>
            item.title.toLowerCase().includes(query) ||
            item.shortTitle.toLowerCase().includes(query) ||
            item.slug.toLowerCase().includes(query) ||
            item.badge.toLowerCase().includes(query)
        ),
      }))
      .filter((cat: DocCategory) => cat.items.length > 0);
  }, [catalog, searchQuery]);

  const totalDocCount = useMemo(() => {
    return catalog.reduce(
      (sum: number, cat: DocCategory) => sum + cat.items.length,
      0
    );
  }, [catalog]);

  const currentCategory = useMemo(() => {
    for (const cat of catalog) {
      if (cat.items.some((item: DocItem) => item.slug === currentSlug)) {
        return cat;
      }
    }
    return null;
  }, [catalog, currentSlug]);

  return (
    <div className="h-screen bg-[#07090e] text-slate-100 flex flex-col overflow-hidden selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Bar Header */}
      <header className="sticky top-0 z-40 bg-[#07090e]/95 backdrop-blur-md border-b border-slate-800/80 px-4 md:px-6 py-3 flex items-center justify-between gap-4 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="p-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300 hover:text-white transition flex-shrink-0"
            title={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
          >
            {sidebarOpen ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <Menu className="w-4 h-4" />
            )}
          </button>

          <Link
            to="/"
            className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white transition group flex-shrink-0"
          >
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-sm shadow-indigo-500/30">
              <BookOpen className="w-3.5 h-3.5" />
            </div>
            <span className="hidden sm:inline font-mono tracking-tight">Mini Claude Code</span>
          </Link>

          <span className="text-slate-600 font-mono text-xs">/</span>

          {currentCategory && (
            <span className="text-xs text-slate-400 truncate hidden md:inline">
              {currentCategory.title.split("(")[0]}
            </span>
          )}

          {currentCategory && (
            <span className="text-slate-600 font-mono text-xs hidden md:inline">/</span>
          )}

          <span className="text-xs font-medium text-slate-200 truncate max-w-xs md:max-w-md">
            {title}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {workbenchUrl && (
            <Link
              to={workbenchUrl}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md shadow-purple-950/50 transition border border-purple-400/20 active:scale-95"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>进入实验工作台</span>
            </Link>
          )}

          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-900/80 hover:bg-slate-800 border border-slate-700/70 transition"
          >
            <ArrowLeft className="w-3 h-3" />
            <span className="hidden sm:inline">课程首页</span>
          </Link>
        </div>
      </header>

      {/* Main Layout Area: Left Sidebar + Right Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Backdrop Overlay */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 z-20 md:hidden backdrop-blur-xs"
          />
        )}

        {/* Left Document Sidebar */}
        <aside
          className={`${
            sidebarOpen
              ? "translate-x-0 w-80 md:w-84"
              : "-translate-x-full md:translate-x-0 md:w-0"
          } fixed md:static inset-y-0 left-0 top-[53px] md:top-0 z-30 transition-all duration-300 ease-in-out border-r border-slate-800/80 bg-[#090d16] md:bg-[#090d16]/95 backdrop-blur-lg flex flex-col flex-shrink-0 overflow-hidden`}
        >
          {/* Sidebar Header & Search */}
          <div className="p-3.5 border-b border-slate-800/80 space-y-2.5 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  文档目录树
                </span>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono border border-slate-700/60">
                {totalDocCount} 篇
              </span>
            </div>

            {/* Live Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索讲义与文档..."
                className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/70 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Navigation Tree */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
            {filteredCatalog.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs">
                未找到匹配 &ldquo;{searchQuery}&rdquo; 的文档
              </div>
            ) : (
              filteredCatalog.map((cat: DocCategory) => {
                const isCollapsed = Boolean(collapsedCategories[cat.id]);
                return (
                  <div key={cat.id} className="space-y-1">
                    {/* Category Title */}
                    <button
                      onClick={() => toggleCategory(cat.id)}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded text-[11px] font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition group text-left"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
                        )}
                        <span className="truncate">{cat.title}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-800/60 px-1.5 py-0.5 rounded border border-slate-700/40">
                        {cat.items.length}
                      </span>
                    </button>

                    {/* Category Items */}
                    {!isCollapsed && (
                      <div className="space-y-0.5 pl-1.5 border-l border-slate-800/60 ml-2.5">
                        {cat.items.map((item: DocItem) => {
                          const isActive = item.slug === currentSlug;
                          return (
                            <div key={item.slug} className="group/item">
                              <Link
                                to={`/docs/${item.slug}`}
                                title={item.title}
                                onClick={() => {
                                  // Close drawer on mobile after clicking
                                  if (window.innerWidth < 768) {
                                    setSidebarOpen(false);
                                  }
                                }}
                                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition border ${
                                  isActive
                                    ? "bg-indigo-600/15 text-indigo-300 font-semibold border-indigo-500/40 shadow-sm shadow-indigo-950/40"
                                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border-transparent"
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <FileText
                                    className={`w-3.5 h-3.5 flex-shrink-0 ${
                                      isActive
                                        ? "text-indigo-400"
                                        : "text-slate-500 group-hover/item:text-slate-400"
                                    }`}
                                  />
                                  <span className="truncate">{item.shortTitle}</span>
                                </div>
                                <span
                                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded border flex-shrink-0 ${
                                    isActive
                                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                                      : "bg-slate-800/80 text-slate-500 border-slate-700/50"
                                  }`}
                                >
                                  {item.badge}
                                </span>
                              </Link>

                              {/* In-Page Sub-TOC for Active Item */}
                              {isActive && toc.length > 0 && (
                                <div className="mt-1 mb-2 ml-4 pl-2.5 border-l border-indigo-500/30 space-y-1">
                                  <div className="flex items-center justify-between pt-1 pb-0.5">
                                    <span className="text-[10px] font-mono text-indigo-400/80 uppercase">
                                      本篇小节大纲
                                    </span>
                                    <button
                                      onClick={() =>
                                        setShowTocInSidebar((prev) => !prev)
                                      }
                                      className="text-[10px] text-slate-500 hover:text-slate-300"
                                    >
                                      {showTocInSidebar ? "收起" : "展开"}
                                    </button>
                                  </div>

                                  {showTocInSidebar && (
                                    <div className="space-y-0.5 max-h-56 overflow-y-auto pr-1">
                                      {toc.map((heading) => (
                                        <a
                                          key={heading.id}
                                          href={`#${heading.id}`}
                                          title={heading.text}
                                          className={`block truncate text-[11px] py-0.5 rounded transition ${
                                            heading.level === 3 ? "pl-3 text-slate-400" : "text-slate-300"
                                          } hover:text-indigo-300 hover:bg-slate-800/40`}
                                        >
                                          <span className="text-slate-500 font-mono mr-1">
                                            {heading.level === 3 ? "·" : "#"}
                                          </span>
                                          {heading.text}
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </nav>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-slate-800/80 bg-slate-900/40 text-[11px] text-slate-500 flex items-center justify-between flex-shrink-0">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              <span>Mini Claude Code</span>
            </span>
            <Link
              to="/"
              className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
            >
              <span>主页</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </Link>
          </div>
        </aside>

        {/* Right Article Main Canvas */}
        <main
          key={currentSlug}
          className="flex-1 overflow-y-auto scroll-smooth bg-[#07090e] h-full"
        >
          <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-10">
            {notFound ? (
              <div className="bg-red-950/20 border border-red-500/40 rounded-2xl p-8 text-center space-y-4 my-12">
                <div className="inline-flex p-3 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                  <FileText className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-red-300">404: 讲义文档不存在</h2>
                <p className="text-sm text-slate-400">未找到指定的文档路径，请从左侧目录树选择其他文档浏览。</p>
                <Link
                  to="/docs/README.md"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>返回文档导读</span>
                </Link>
              </div>
            ) : (
              <article className="space-y-8">
                {/* Article Header Banner */}
                {workbenchUrl && (
                  <div className="p-4 rounded-xl bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-slate-900 border border-purple-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          配套工作台已就绪
                        </span>
                        <span className="text-xs text-slate-300 font-medium">
                          支持断点调试、状态观测与对抗实验
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        一边阅读理论讲义，一边在可交互终端中触发 Agent Loop 与工具执行。
                      </p>
                    </div>
                    <Link
                      to={workbenchUrl}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md transition flex-shrink-0 active:scale-95"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>打开实验工作台</span>
                    </Link>
                  </div>
                )}

                {/* Markdown Content Card */}
                <div className="glass-panel bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 md:p-10 shadow-2xl backdrop-blur-md">
                  <div
                    dangerouslySetInnerHTML={{ __html: contentHtml }}
                    className="doc-body prose prose-invert max-w-none"
                  />
                </div>

                {/* Bottom Prev / Next Navigation Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 border-t border-slate-800/80">
                  {prevDoc ? (
                    <Link
                      to={`/docs/${prevDoc.slug}`}
                      title={prevDoc.title}
                      className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/30 hover:bg-slate-800/40 hover:border-slate-700 transition flex items-start gap-3 group"
                    >
                      <ArrowLeft className="w-5 h-5 text-slate-500 group-hover:text-indigo-400 transition mt-0.5 flex-shrink-0" />
                      <div className="space-y-1 min-w-0">
                        <div className="text-[11px] text-slate-500 font-mono uppercase">
                          上一篇
                        </div>
                        <div className="text-xs font-semibold text-slate-200 group-hover:text-white truncate">
                          {prevDoc.shortTitle}
                        </div>
                      </div>
                    </Link>
                  ) : (
                    <div />
                  )}

                  {nextDoc && (
                    <Link
                      to={`/docs/${nextDoc.slug}`}
                      title={nextDoc.title}
                      className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/30 hover:bg-slate-800/40 hover:border-slate-700 transition flex items-start justify-between gap-3 text-right group"
                    >
                      <div className="space-y-1 min-w-0 text-left sm:text-right flex-1">
                        <div className="text-[11px] text-slate-500 font-mono uppercase">
                          下一篇
                        </div>
                        <div className="text-xs font-semibold text-slate-200 group-hover:text-white truncate">
                          {nextDoc.shortTitle}
                        </div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-indigo-400 transition mt-0.5 flex-shrink-0" />
                    </Link>
                  )}
                </div>

                {/* Footer */}
                <footer className="mt-12 text-center text-xs text-slate-500 py-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <span>Mini Claude Code · 从零手写 Agent 体系化课程</span>
                  <span className="flex items-center gap-1 text-slate-600">
                    <Hash className="w-3 h-3" />
                    <span>UTF-8 纯净极速渲染 · SPA 前端路由</span>
                  </span>
                </footer>
              </article>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

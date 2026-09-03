function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function markdownToHtml(md: string, title: string): string {
  const lines = md.split("\n");
  const htmlOut: string[] = [];
  let inCodeBlock = false;
  let codeLang = "";
  let codeLines: string[] = [];
  let inTable = false;
  let tableRows: string[] = [];

  const flushTable = () => {
    if (!inTable) return;
    inTable = false;
    if (tableRows.length === 0) return;

    let tableHtml = '<div class="overflow-x-auto my-6"><table class="w-full border-collapse text-sm text-left">';
    tableRows.forEach((row, idx) => {
      const isHeader = idx === 0;
      const isDivider = idx === 1 && row.includes("---");
      if (isDivider) return;

      const cells = row
        .split("|")
        .map((c) => c.trim())
        .filter((_, i, arr) => i > 0 && i < arr.length - 1);

      if (isHeader) {
        tableHtml += '<thead class="bg-slate-900/80 text-purple-300 font-semibold border-b border-slate-700"><tr>';
        cells.forEach((c) => {
          tableHtml += `<th class="p-3 border border-slate-700/80">${formatInline(c)}</th>`;
        });
        tableHtml += "</tr></thead><tbody>";
      } else {
        tableHtml += '<tr class="border-b border-slate-800/80 hover:bg-slate-800/30">';
        cells.forEach((c) => {
          tableHtml += `<td class="p-3 border border-slate-800 text-slate-300">${formatInline(c)}</td>`;
        });
        tableHtml += "</tr>";
      }
    });
    tableHtml += "</tbody></table></div>";
    htmlOut.push(tableHtml);
    tableRows = [];
  };

  const formatInline = (text: string): string => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="text-slate-300 italic">$1</em>')
      .replace(/`([^`]+)`/g, '<code class="bg-slate-800/90 text-purple-300 px-1.5 py-0.5 rounded text-[13px] font-mono border border-slate-700/60">$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">$1</a>');
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block toggle
    if (line.trim().startsWith("```")) {
      flushTable();
      if (inCodeBlock) {
        inCodeBlock = false;
        const codeContent = escapeHtml(codeLines.join("\n"));
        htmlOut.push(
          `<div class="my-5 rounded-xl overflow-hidden border border-slate-800 bg-[#090d1a] shadow-xl">
            <div class="bg-slate-900/90 px-4 py-2 text-xs font-mono text-slate-400 border-b border-slate-800 flex items-center justify-between">
              <span>${escapeHtml(codeLang || "text")}</span>
              <span class="text-[10px] text-slate-500">ASCII / Code</span>
            </div>
            <pre class="p-4 overflow-x-auto text-[13px] font-mono text-slate-200 leading-relaxed whitespace-pre"><code>${codeContent}</code></pre>
          </div>`
        );
        codeLines = [];
        codeLang = "";
      } else {
        inCodeBlock = true;
        codeLang = line.trim().slice(3).trim();
        codeLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Tables
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      inTable = true;
      tableRows.push(line.trim());
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Empty lines
    if (!line.trim()) {
      continue;
    }

    // Horizontal rules
    if (line.trim() === "---" || line.trim() === "***") {
      htmlOut.push('<hr class="my-8 border-slate-800" />');
      continue;
    }

    // Headings
    if (line.startsWith("# ")) {
      htmlOut.push(
        `<h1 class="text-2xl md:text-3xl font-extrabold text-white mt-8 mb-4 tracking-tight flex items-center gap-3 border-b border-slate-800 pb-3">${formatInline(
          line.slice(2)
        )}</h1>`
      );
      continue;
    }
    if (line.startsWith("## ")) {
      htmlOut.push(
        `<h2 class="text-xl md:text-2xl font-bold text-slate-100 mt-8 mb-3 tracking-tight flex items-center gap-2">${formatInline(
          line.slice(3)
        )}</h2>`
      );
      continue;
    }
    if (line.startsWith("### ")) {
      htmlOut.push(
        `<h3 class="text-lg font-semibold text-purple-300 mt-6 mb-2 tracking-tight">${formatInline(
          line.slice(4)
        )}</h3>`
      );
      continue;
    }

    // Blockquotes
    if (line.startsWith("> ")) {
      const bqContent = line.slice(2);
      htmlOut.push(
        `<blockquote class="border-l-4 border-purple-500 bg-purple-950/20 px-4 py-3 my-4 rounded-r-lg text-slate-300 text-sm leading-relaxed">${formatInline(
          bqContent
        )}</blockquote>`
      );
      continue;
    }

    // Unordered List
    if (line.trim().startsWith("- ")) {
      htmlOut.push(
        `<li class="ml-5 list-disc text-sm text-slate-300 my-1 leading-relaxed">${formatInline(
          line.trim().slice(2)
        )}</li>`
      );
      continue;
    }

    // Ordered List
    const numMatch = line.trim().match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      htmlOut.push(
        `<li class="ml-5 list-decimal text-sm text-slate-300 my-1 leading-relaxed"><span class="font-semibold text-white">${numMatch[1]}.</span> ${formatInline(
          numMatch[2]
        )}</li>`
      );
      continue;
    }

    // Regular paragraphs
    htmlOut.push(
      `<p class="text-sm md:text-base text-slate-300 leading-relaxed my-3">${formatInline(
        line
      )}</p>`
    );
  }

  flushTable();

  return `<!DOCTYPE html>
<html lang="zh-CN" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} - Mini Claude Code 讲义</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: '#070a12'
          }
        }
      }
    }
  </script>
  <style>
    body {
      background-color: #070a12;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    pre code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
  </style>
</head>
<body class="min-h-screen bg-[#070a12] text-slate-200">
  <!-- Top Nav -->
  <header class="sticky top-0 z-50 bg-[#070a12]/90 backdrop-blur border-b border-slate-800 px-6 py-3.5">
    <div class="max-w-5xl mx-auto flex items-center justify-between">
      <div class="flex items-center gap-3">
        <a href="/" class="text-xs font-mono font-semibold px-2.5 py-1 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30 hover:bg-purple-500/20 transition">
          ← 返回课程首页
        </a>
        <span class="text-slate-500 text-xs font-mono">/</span>
        <span class="text-xs font-medium text-slate-300 truncate max-w-xs md:max-w-md">
          ${escapeHtml(title)}
        </span>
      </div>
      <div class="flex items-center gap-3">
        <button onclick="window.history.back()" class="text-xs px-3 py-1 rounded border border-slate-700 hover:bg-slate-800 text-slate-300 transition">
          返回工作台
        </button>
      </div>
    </div>
  </header>

  <!-- Document Container -->
  <main class="max-w-4xl mx-auto px-6 py-10">
    <div class="glass-container bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 md:p-10 shadow-2xl">
      ${htmlOut.join("\n")}
    </div>

    <footer class="mt-12 text-center text-xs text-slate-500 py-6 border-t border-slate-800/80">
      Mini Claude Code · 从零手写 Agent 体系化课程 · UTF-8 标准渲染
    </footer>
  </main>
</body>
</html>`;
}


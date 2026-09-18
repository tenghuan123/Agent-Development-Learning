import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkCjkFriendly from "remark-cjk-friendly";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeStringify from "rehype-stringify";
import type { Element, ElementContent, Root, RootContent } from "hast";

export interface MarkdownTocItem {
  id: string;
  text: string;
  level: number;
}

export interface MarkdownRenderResult {
  title: string;
  html: string;
  toc: MarkdownTocItem[];
}

const TOC_LEVELS = new Set(["h2", "h3"]);
const LANGUAGE_CLASS_PREFIX = "language-";

/**
 * 把独占一行的 `$$公式$$` 归一化成 fenced 块级公式。
 *
 * remark-math 只在 `$$` 独占一行时才判定为块级公式，写成 `$$x=1$$` 会被当成行内公式
 * （行内样式、挤在段落里）。讲义通篇用的是后一种写法，但语义上要的是居中的独立公式块，
 * 所以在解析前做一次文本归一化。带 `> ` 前缀的引用块同样处理，并保留前缀。
 *
 * 逐行扫描并跳过围栏代码块，避免把代码里的 `$$` 也改掉。
 */
function promoteDisplayMath(md: string): string {
  let inFence = false;

  return md
    .split("\n")
    .map((line) => {
      if (/^\s*(?:```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;

      // 1. 完全在同一行闭合的 $$formula$$
      const singleMatch = /^(\s*(?:>\s*)*)\$\$((?:(?!\$\$)[\s\S])+)\$\$\s*$/.exec(line);
      if (singleMatch) {
        const [, prefix, body] = singleMatch;
        return `${prefix}$$\n${prefix}${body}\n${prefix}$$`;
      }

      // 2. 以 $$ 起始但未闭合的公式起始行（如 `$$\begin{aligned}`）
      const openMatch = /^(\s*(?:>\s*)*)\$\$([^$].*)$/.exec(line);
      if (openMatch) {
        const [, prefix, body] = openMatch;
        return `${prefix}$$\n${prefix}${body}`;
      }

      // 3. 以 $$ 结尾的公式闭合行（如 `\end{aligned}$$`）
      const closeMatch = /^(\s*(?:>\s*)*)(.*?[^$])\$\$\s*$/.exec(line);
      if (closeMatch) {
        const [, prefix, body] = closeMatch;
        return `${prefix}${body}\n${prefix}$$`;
      }

      return line;
    })
    .join("\n");
}

/** 拼接 hast 子树里的纯文本，忽略标签本身。 */
function collectText(node: RootContent | Element): string {
  if (node.type === "text") {
    return node.value;
  }
  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map((child) => collectText(child)).join("");
  }
  return "";
}

function classList(node: Element): string[] {
  const raw = node.properties?.className;
  return Array.isArray(raw) ? raw.map(String) : [];
}

/** remark-math 产出的块级公式也是 `<pre><code class="language-math math-display">`，
 *  必须与真正的代码块区分开，否则公式会被套上代码卡片外壳。 */
function isMathBlock(node: Element): boolean {
  return node.children.some(
    (child) =>
      child.type === "element" &&
      child.tagName === "code" &&
      classList(child).some((c) => c.startsWith("math-"))
  );
}

/** 把代码块包成带语言标签的卡片，还原原有的代码块外观。 */
function wrapCodeCard(node: Element): Element {
  const code = node.children.find(
    (child): child is Element =>
      child.type === "element" && child.tagName === "code"
  );

  const langClass = code
    ? classList(code).find((c) => c.startsWith(LANGUAGE_CLASS_PREFIX))
    : undefined;
  const lang = langClass ? langClass.slice(LANGUAGE_CLASS_PREFIX.length) : "";

  // 语言已经提到卡片标题栏上了，代码元素上不必再留一次
  if (code && langClass) {
    const remaining = classList(code).filter(
      (c) => !c.startsWith(LANGUAGE_CLASS_PREFIX)
    );
    const { className: _dropped, ...rest } = code.properties ?? {};
    code.properties = remaining.length > 0 ? { ...rest, className: remaining } : rest;
  }

  return {
    type: "element",
    tagName: "div",
    properties: { className: ["code-card"] },
    children: [
      {
        type: "element",
        tagName: "div",
        properties: { className: ["code-card__bar"] },
        children: [
          {
            type: "element",
            tagName: "span",
            properties: { className: ["code-card__dot"] },
            children: [],
          },
          {
            type: "element",
            tagName: "span",
            properties: { className: ["code-card__lang"] },
            children: [{ type: "text", value: lang || "text" }],
          },
        ],
      },
      {
        type: "element",
        tagName: "div",
        properties: { className: ["code-card__body"] },
        children: [node],
      },
    ],
  };
}

/**
 * 递归重写子节点：代码块套卡片容器，表格套横向滚动容器。
 *
 * 必须递归——引用块内部的代码块同样是 pre，只在顶层扫一遍会漏掉
 * 「> ```ts ... > ```」这种嵌套写法。
 */
function transformChildren(children: ElementContent[]): ElementContent[] {
  return children.map((node) => {
    if (node.type !== "element") return node;

    const element: Element =
      node.children.length > 0
        ? { ...node, children: transformChildren(node.children) }
        : node;

    if (element.tagName === "pre" && !isMathBlock(element)) {
      return wrapCodeCard(element);
    }

    if (element.tagName === "table") {
      // 宽表在窄屏会撑破页面，交给容器横向滚动
      return {
        type: "element",
        tagName: "div",
        properties: { className: ["table-scroll"] },
        children: [element],
      };
    }

    return element;
  });
}

interface CollectorStats {
  title: string;
  toc: MarkdownTocItem[];
}

/**
 * 在 rehype-slug 之后、rehype-katex 之前运行，收集文档标题与侧边栏大纲。
 *
 * 放在 KaTeX 之前是有意的：此时标题文本仍是原始 markdown 文本。若等 KaTeX 展开后再取，
 * 同一段公式的 HTML 与 MathML 两套渲染会被各读一遍，大纲里就会出现重复文字。
 */
function rehypeDocOutline(stats: CollectorStats) {
  // unified 的插件是两层：attacher 接收配置并返回 transformer，transformer 才拿到语法树。
  // 少一层的话，tree 收到的会是 processor 自身。
  return function attacher() {
    return function transformer(tree: Root) {
      for (const node of tree.children) {
        if (node.type !== "element" || !node.properties?.id) continue;
        if (node.tagName !== "h1" && !TOC_LEVELS.has(node.tagName)) continue;

        const text = collectText(node).trim();
        if (!text) continue;

        if (node.tagName === "h1") {
          if (!stats.title) stats.title = text;
          continue;
        }

        stats.toc.push({
          id: String(node.properties.id),
          text,
          level: node.tagName === "h2" ? 2 : 3,
        });
      }
    };
  };
}

/** 结构重写插件：只负责代码卡片 / 表格容器，与大纲收集分开，顺序无耦合。 */
function rehypeDocContainers() {
  return function transformer(tree: Root) {
    // remark-rehype 不会产出 doctype 节点，这里的收窄是安全的
    tree.children = transformChildren(tree.children as ElementContent[]);
  };
}

/**
 * 渲染 Markdown 正文。
 *
 * 走 unified / remark / rehype 标准管线：GFM（表格、任务列表、删除线、自动链接）、
 * 数学公式（KaTeX）、标题锚点（rehype-slug）。块级容器的嵌套关系——引用里放代码块、
 * 引用里放有序列表——由 remark 的 block 解析器统一处理，不再逐行判断。
 */
export async function renderMarkdownBody(
  md: string,
  defaultTitle = "讲义文档"
): Promise<MarkdownRenderResult> {
  const stats: CollectorStats = { title: "", toc: [] };

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    // 中文标点紧贴 `**` 时（如 `**快照（Snapshot）**以及`），CommonMark 的
    // flanking 规则不认为右界符成立，加粗会退化成字面量。讲义通篇中文，必须开。
    .use(remarkCjkFriendly)
    .use(remarkMath)
    // 刻意不开 allowDangerousHtml：文档里的裸 HTML 会被丢弃，不构成注入面
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: "wrap",
      properties: { className: ["heading-anchor"] },
    })
    .use(rehypeDocOutline(stats))
    .use(rehypeDocContainers)
    .use(rehypeKatex, {
      // 单条公式写错不该让整页 500，降级成红色原文更利于定位
      throwOnError: false,
      errorColor: "#f43f5e",
      strict: false,
    })
    .use(rehypeStringify)
    .process(promoteDisplayMath(md));

  return {
    title: stats.title || defaultTitle,
    html: String(file),
    toc: stats.toc,
  };
}

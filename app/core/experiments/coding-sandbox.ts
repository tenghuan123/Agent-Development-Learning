export interface CodingChallengePreset {
  id: string;
  tag: string;
  title: string;
  badgeColor: string;
  description: string;
  prompt: string;
  targetFiles: string[];
  expectedCommand: string;
  initialFiles: Record<string, string>;
}

export const CODING_CHALLENGES: CodingChallengePreset[] = [
  {
    id: "test_driven_self_heal",
    tag: "挑战 1",
    title: "单元测试失败与逻辑 Bug 自愈",
    badgeColor: "text-rose-400 bg-rose-500/10 border-rose-500/30",
    description:
      "购物车折扣计算器中存在一个隐蔽的 VIP 折扣计算 Bug。Agent 将运行测试发现报错 -> 捕获 Traceback -> 精准定位并编辑代码 -> 再次运行测试直至 100% 绿灯！",
    prompt:
      "请运行 `node scratch/sandbox/test-calculator.js` 检查单元测试。分析测试失败原因，先使用 read_file 查看 `scratch/sandbox/math-calculator.js`，再使用 edit_file 修复其中的 Bug，并再次运行测试验证直至全部通过！",
    targetFiles: [
      "scratch/sandbox/math-calculator.js",
      "scratch/sandbox/test-calculator.js",
    ],
    expectedCommand: "node scratch/sandbox/test-calculator.js",
    initialFiles: {
      "scratch/sandbox/math-calculator.js": `/**
 * 购物车折扣与总价计算模块 (含待自愈的 Bug)
 */
export function calculateOrderTotal(items, options = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return { subtotal: 0, discount: 0, total: 0 };
  }

  // 计算小计
  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  let discount = 0;

  // 优惠券折扣规则
  if (options.couponCode === "VIP20") {
    // 💥 BUG: 错误地写成了 0.1 (应该是 20% 折扣即 subtotal * 0.20)
    discount = subtotal * 0.10;
  } else if (options.couponCode === "HALF_PRICE") {
    discount = subtotal * 0.5;
  }

  // 满 200 额外减 20 满减优惠 (不能与 VIP 重叠)
  if (!options.couponCode && subtotal >= 200) {
    discount = 20;
  }

  // 确保折扣不会超过总额
  discount = Math.min(discount, subtotal);
  const total = Math.max(0, subtotal - discount);

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}
`,
      "scratch/sandbox/test-calculator.js": `/**
 * 自动化测试验证脚本
 */
import assert from "node:assert";
import { calculateOrderTotal } from "./math-calculator.js";

console.log("🚀 开始运行购物车计算器单元测试套件...");

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(\`  ✓ 用例 \${total}: \${name}\`);
    passed++;
  } catch (err) {
    console.error(\`  ✗ 用例 \${total} 失败: \${name}\`);
    console.error(\`    \${err.message}\`);
    throw err;
  }
}

try {
  test("空购物车应返回 0 元", () => {
    const res = calculateOrderTotal([]);
    assert.strictEqual(res.total, 0);
  });

  test("普通商品小计计算", () => {
    const res = calculateOrderTotal([
      { price: 50, quantity: 2 },
      { price: 100, quantity: 1 }
    ]);
    assert.strictEqual(res.subtotal, 200);
    assert.strictEqual(res.total, 180);
  });

  test("VIP20 优惠券应享受 20% 折扣", () => {
    const res = calculateOrderTotal(
      [{ price: 100, quantity: 1 }],
      { couponCode: "VIP20" }
    );
    assert.strictEqual(res.subtotal, 100);
    assert.strictEqual(res.discount, 20, "VIP20 应该减免 20 元 (20%)");
    assert.strictEqual(res.total, 80, "实付金额应为 80 元");
  });

  test("HALF_PRICE 优惠券应享受半价", () => {
    const res = calculateOrderTotal(
      [{ price: 300, quantity: 1 }],
      { couponCode: "HALF_PRICE" }
    );
    assert.strictEqual(res.total, 150);
  });

  console.log(\`🎉 所有 \${passed}/\${total} 个测试用例全部通过！\`);
  process.exit(0);
} catch (error) {
  console.error(\`❌ 测试套件执行失败: \${passed}/\${total} 通过。\`);
  process.exit(1);
}
`,
    },
  },
  {
    id: "boundary_exception_healing",
    tag: "挑战 2",
    title: "边界异常与类型防御修复",
    badgeColor: "text-amber-400 bg-amber-500/10 border-amber-500/30",
    description:
      "字符串处理工具在遇到 undefined、null、负数索引或超长文本时发生崩溃。Agent 需要通过运行异常测试用例，补齐防御性逻辑与类型检查。",
    prompt:
      "请运行 `node scratch/sandbox/test-string-utils.js` 检查边界测试用例。查看崩溃原因，先使用 read_file 查看 `scratch/sandbox/string-utils.js`，再使用 edit_file 修复 `scratch/sandbox/string-utils.js` 中的边界异常处理（如 null/undefined 防御），并再次运行测试直至全部通过！",
    targetFiles: [
      "scratch/sandbox/string-utils.js",
      "scratch/sandbox/test-string-utils.js",
    ],
    expectedCommand: "node scratch/sandbox/test-string-utils.js",
    initialFiles: {
      "scratch/sandbox/string-utils.js": `/**
 * 字符串常用处理工具 (存在空指针与越界 Bug)
 */
export function truncate(str, maxLen = 10, suffix = "...") {
  // 💥 BUG: 没有对 str 为 null/undefined 做防御性处理，会抛出 TypeError: Cannot read properties of undefined (reading 'length')
  if (str.length <= maxLen) {
    return str;
  }
  return str.slice(0, maxLen) + suffix;
}

export function slugify(text) {
  // 💥 BUG: 遇到非字符串输入直接崩溃
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
`,
      "scratch/sandbox/test-string-utils.js": `import assert from "node:assert";
import { truncate, slugify } from "./string-utils.js";

console.log("🚀 开始运行字符串工具防御性测试...");

try {
  console.log("测试 1: 正常文本截断");
  assert.strictEqual(truncate("Hello World", 5), "Hello...");

  console.log("测试 2: 短文本不截断");
  assert.strictEqual(truncate("Hi", 5), "Hi");

  console.log("测试 3: 空值与 undefined 防御");
  assert.strictEqual(truncate(null, 5), "");
  assert.strictEqual(truncate(undefined, 5), "");

  console.log("测试 4: Slugify 转换与空值防御");
  assert.strictEqual(slugify("Hello World 2026!"), "hello-world-2026");
  assert.strictEqual(slugify(null), "");

  console.log("🎉 防御性测试全部通过！");
  process.exit(0);
} catch (err) {
  console.error("❌ 测试崩溃:", err.message);
  process.exit(1);
}
`,
    },
  },
  {
    id: "feature_creation",
    tag: "挑战 3",
    title: "从 0 创造：手写 LRU 缓存与测试验证",
    badgeColor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    description:
      "从无到有创建模块。Agent 将使用 write_file 创建 `scratch/sandbox/lru-cache.js` 与 `scratch/sandbox/test-lru.js`，并运行终端命令完成自测！",
    prompt:
      "请执行以下编程任务：1. 使用 write_file 工具在 'scratch/sandbox/lru-cache.js' 中编写一个具备 capacity 容量淘汰机制的 LRUCache 类（支持 get, put, size 方法）；2. 使用 write_file 工具在 'scratch/sandbox/test-lru.js' 中编写单元测试；3. 使用 run_command 运行 'node scratch/sandbox/test-lru.js' 进行验证直至测试全部通过。请立即开始调用 write_file 工具创建文件。",
    targetFiles: [
      "scratch/sandbox/lru-cache.js",
      "scratch/sandbox/test-lru.js",
    ],
    expectedCommand: "node scratch/sandbox/test-lru.js",
    initialFiles: {},
  },
];

/**
 * Reset and seed sandbox files on local filesystem
 */
export async function seedSandboxChallenge(
  challengeId: string,
  workspaceDir: string = process.cwd()
): Promise<{ success: boolean; initializedFiles: string[] }> {
  const challenge = CODING_CHALLENGES.find((c) => c.id === challengeId);
  if (!challenge) {
    throw new Error(`未找到 ID 为 '${challengeId}' 的编程挑战预设。`);
  }

  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const initializedFiles: string[] = [];

  for (const [relPath, content] of Object.entries(challenge.initialFiles)) {
    const fullPath = path.resolve(workspaceDir, relPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
    initializedFiles.push(relPath);
  }

  return {
    success: true,
    initializedFiles,
  };
}

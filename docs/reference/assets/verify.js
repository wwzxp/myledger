#!/usr/bin/env node
/**
 * 演示验收：把「界面细节不能偷懒」变成机器可判定的失败。
 *
 * 用法：
 *   node verify.js --url http://127.0.0.1:8899 --spec ./screens.json
 *
 * spec 文件格式见 §10.6。缺 spec 时只跑基础三项（光标/切页/错误），
 * 有 spec 时额外断言每一屏的元素构成。
 *
 * 退出码：0 全部通过；1 有失败项。
 */

import fs from "node:fs";
import path from "node:path";

// ── 解析参数 ──
const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const URL = arg("url", "http://127.0.0.1:8899/index.html");
const SPEC_PATH = arg("spec", "./screens.json");
const SECONDS = Number(arg("seconds", "20"));
const SCENE = arg("scene", null);
// --from-scan：直接读 frame-crop.py 产出的 summary.json，自动生成阈值
const SCAN_PATH = arg("from-scan", null);
// --report-only：只报差异不判失败，用于「先看差多少」
const REPORT_ONLY = argv.includes("--report-only");

/**
 * 从 baseline 扫描结果推导出 minStats 阈值。
 *
 * 思路：基准帧数出来多少，实现就必须做到多少。只设下限不设上限，
 * 因为实现可能因为字体/间距比基准多出几个元素，那不算错。
 *
 * 三处需要换算：
 * 1 基准帧的箭头数是「图上箭头的个数」，实现的 chevrons 也是个数，直接对应
 * 2 基准帧的卡片数 → 实现里对应「分组」，用 verify 的 rows/dividersH 间接判断
 * 3 基准帧的颜色种类 → 实现里 colored 数量下限（每种色至少一个元素）
 */
function specFromScan(scan) {
  const t = scan.totals ?? {};
  const colors = scan.colors ?? [];

  // 副标题数：基准帧需要人读才知道，这里只给「颜色种类数」做下限
  // 因为它至少说明有几种不同颜色的图标
  const minStats = {
    rows: t.rows ?? 0,           // 页内文字行数
    chevrons: t.chevrons ?? 0,   // 右侧箭头数
    colored: colors.length,      // 彩色元素至少等于颜色种类数
  };

  // 每张卡至少一行 -> dividersH 至少 (行数 - 卡片数)
  if (t.rows && t.cards) {
    minStats.dividersH = Math.max(0, t.rows - t.cards);
  }

  // 用第一屏的文字做 expectText 太脆弱，改用「页面有内容」判定
  return {
    screens: [
      {
        name: "全屏",
        expectText: null,          // 不靠文字等待，直接在第 3 秒采样
        mustContain: [],
        minStats,
        timeout: 8000,
        _auto: true,
      },
    ],
    _meta: {
      source: scan.source,
      cards: t.cards,
      rows: t.rows,
      chevrons: t.chevrons,
      colors: colors.map((c) => `${c.bucket}${c.hex}`),
      note: "阈值由 frame-crop.py 的 summary.json 自动推导。文案仍需人工补 mustContain。",
    },
  };
}

// ── 读屏清单（可选）──
let spec = null;
if (SCAN_PATH) {
  if (!fs.existsSync(SCAN_PATH)) {
    console.error(`[scan] 找不到 ${SCAN_PATH}`);
    process.exit(1);
  }
  const scan = JSON.parse(fs.readFileSync(path.resolve(SCAN_PATH), "utf8"));
  spec = specFromScan(scan);
  console.log(
    `[scan] 已从 ${SCAN_PATH} 推导阈值：` +
    `cards=${scan.totals?.cards} rows=${scan.totals?.rows} ` +
    `chevrons=${scan.totals?.chevrons} colors=${scan.colors?.length}`,
  );
  console.log(`[scan] minStats = ${JSON.stringify(spec.screens[0].minStats)}`);
} else if (fs.existsSync(SPEC_PATH)) {
  spec = JSON.parse(fs.readFileSync(path.resolve(SPEC_PATH), "utf8"));
  console.log(`[spec] 已加载：${SPEC_PATH}（${spec.screens?.length ?? 0} 屏）`);
} else {
  console.log(`[spec] 未找到 ${SPEC_PATH}，只跑基础三项`);
}

// ── 起浏览器 ──
// Chrome 可执行文件：按常见安装位置探测，都找不到就交给 puppeteer 自己找
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* 忽略 */ }
  }
  return undefined;   // undefined = 让 puppeteer 用自带或自动探测的 Chromium
}

// puppeteer-core 的位置：优先命令行，其次环境变量，最后尝试从当前目录解析
async function loadPuppeteer() {
  const explicit = arg("puppeteer", process.env.PUPPETEER_CORE || null);
  if (explicit) {
    const { default: p } = await import(explicit);
    return p;
  }
  // 尝试当成普通依赖（项目里装了 puppeteer-core 或 puppeteer 时成立）
  for (const name of ["puppeteer-core", "puppeteer"]) {
    try {
      const { default: p } = await import(name);
      return p;
    } catch { /* 继续尝试下一个 */ }
  }
  throw new Error(
    "找不到 puppeteer-core。三种装法任选：\n" +
    "  1) npm i -D puppeteer-core\n" +
    "  2) npm i -D puppeteer（会自带 Chromium）\n" +
    "  3) 指定路径：node verify.js --puppeteer file:///path/to/puppeteer-core.js\n" +
    "     或设环境变量 PUPPETEER_CORE=file:///path/to/puppeteer-core.js",
  );
}
const puppeteer = await loadPuppeteer();

const browser = await puppeteer.launch({
  executablePath: arg("chrome", findChrome()),
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

const failures = [];
const notes = [];
const fail = (msg) => { failures.push(msg); console.log(`  ✗ ${msg}`); };
const pass = (msg) => console.log(`  ✓ ${msg}`);

// ── 采集 JSON 错误 ──
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  const t = m.text();
  if (m.type() === "error" && !/favicon|404/.test(t)) {
    pageErrors.push(`console.error: ${t}`);
  }
  if (t.startsWith("[toAt]")) notes.push(t);
});

// ── 注入通用度量函数（页面内执行，两处采样共用）──
// 只依赖几何与计算样式，不依赖任何类名，换项目不用改。
await page.evaluateOnNewDocument(() => {
  // ── 统一的「当前可见页」解析 ────────────────────────────────
  // 三个地方都要用它：屏检测、minCount、自定义断言。
  // 实测：只改一处会导致「屏找到了但 minCount 数到 0」。
  window.__resolveScope = function () {
    const el = document.querySelector(".stage-screen");
    if (!el) return null;
    const nz = (d) => d.textContent.replace(/\s+/g, "").length;
    const vis = [...el.querySelectorAll("div")].filter((d) => {
      const cs = getComputedStyle(d);
      if (cs.display === "none") return false;
      if (cs.position !== "absolute") return false;
      const r = d.getBoundingClientRect();
      const pr = d.parentElement.getBoundingClientRect();
      return Math.abs(r.width - pr.width) < 2 && Math.abs(r.height - pr.height) < 2;
    }).filter((d, i, arr) => !arr.some((o) => o !== d && d.contains(o)));

    const withText = vis.filter((d) => nz(d) > 0);
    if (withText.length) {
      return withText.sort((a, b2) => b2.textContent.length - a.textContent.length)[0];
    }
    // 候选层全是遮罩/空层时，退回「文字最多的可见后代」，并排除遮罩类元素
    const skip = /(scrim|mask|overlay|backdrop|veil)/i;
    const deep = [...el.querySelectorAll("div")].filter((d) => {
      const cs = getComputedStyle(d);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      if (skip.test(d.className)) return false;
      return nz(d) > 0;
    });
    deep.sort((a, b2) => b2.textContent.length - a.textContent.length);
    return deep[0] || el;
  };

  window.__collectStats = function (scope) {
    const all = [...scope.querySelectorAll("*")];
    const visible = all.filter((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0
        && cs.visibility !== "hidden" && cs.opacity !== "0";
    });
    const leaf = visible.filter((el) => el.children.length === 0 && el.textContent.trim());

    const bgRGB = (el) => {
      const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
      return m && m.length >= 3 ? m.slice(0, 3).map(Number) : null;
    };

    return {
      // 图标候选：16–64px 的小方块，且「有视觉内容」。
      // 有视觉内容 = 有底色，或有描边，或里面有文字/SVG 子节点。
      // 不能只认底色：真机的线条图标常是白底，只认底色会逼实现加假的白底去骗指标。
      iconLike: visible.filter((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width < 16 || r.width > 64 || r.height < 16 || r.height > 64) return false;

        const hasBg = cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)"
          && cs.backgroundColor !== "transparent";
        const hasBorder = parseFloat(cs.borderTopWidth) > 0
          || parseFloat(cs.borderLeftWidth) > 0;
        const hasInner = el.children.length > 0
          || (el.textContent.trim().length > 0 && el.textContent.trim().length <= 2);

        return hasBg || hasBorder || hasInner;
      }).length,

      textNodes: leaf.length,

      // 副标题：字号 ≤12px 且在页面左侧 60% 区域内。
      // 排除右侧金额：它也小，但语义不是副标题。
      mutedText: (() => {
        const scopeW = scope.getBoundingClientRect().width || 1;
        const scopeL = scope.getBoundingClientRect().left;
        return leaf.filter((el) => {
          if (parseFloat(getComputedStyle(el).fontSize) > 12) return false;
          const r = el.getBoundingClientRect();
          const centerRatio = (r.left + r.width / 2 - scopeL) / scopeW;
          return centerRatio <= 0.6;
        }).length;
      })(),

      chevrons: leaf.filter((el) => /^[\u203A>\u00BB\u2192]$/.test(el.textContent.trim())).length,

      clickables: visible.filter((el) =>
        el.tagName === "BUTTON" || el.getAttribute("role") === "button"
        || getComputedStyle(el).cursor === "pointer").length,

      // 水平分隔线：两种实现方式都要认
      // ① 独立元素：高 ≤2px 且宽 >100px
      // ② 用 border-bottom 画在行上：算有边框的行数
      dividersH: (() => {
        const asElement = visible.filter((el) => {
          const r = el.getBoundingClientRect();
          return r.height <= 2 && r.width > 100;
        }).length;
        const asBorder = visible.filter((el) => {
          const cs = getComputedStyle(el);
          const bw = parseFloat(cs.borderBottomWidth) || 0;
          const r = el.getBoundingClientRect();
          return bw > 0 && r.width > 100 && r.height > 20
            && cs.borderBottomStyle !== "none";
        }).length;
        return Math.max(asElement, asBorder);
      })(),

      rails: visible.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width <= 6 && r.height > 20 && bgRGB(el) !== null;
      }).length,

      colored: visible.filter((el) => {
        const c = bgRGB(el);
        if (!c) return false;
        const mx = Math.max(...c);
        const mn = Math.min(...c);
        return mx > 40 && (mx - mn) / mx > 0.25;
      }).length,

      rows: (() => {
        const ys = leaf.map((el) => {
          const r = el.getBoundingClientRect();
          return Math.round((r.top + r.height / 2) / 4) * 4;
        }).sort((a, b) => a - b);
        let n = 0;
        let last = -999;
        for (const y of ys) {
          if (y - last > 8) { n += 1; last = y; }
        }
        return n;
      })(),
    };
  };
});

// ── 打开页面 ──
await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await new Promise((r) => setTimeout(r, 500));

// 如果页面有左侧清单，可以指定看哪个场景
if (SCENE) {
  const ok = await page.evaluate((key) => {
    const btn = [...document.querySelectorAll(".demo-list > button")]
      .find((b) => b.textContent.trim() === key || b.dataset.key === key);
    if (!btn) return false;
    btn.click();
    return true;
  }, SCENE);
  if (!ok) {
    console.log(`[scene] 找不到「${SCENE}」，按默认场景验`);
  } else {
    console.log(`[scene] 已切到「${SCENE}」`);
    await new Promise((r) => setTimeout(r, 800));
  }
}

// ── 采样函数：一次拿到全部判据所需的数据 ──
const sample = () => page.evaluate(() => {
  const screen = document.querySelector(".stage-screen");
  if (!screen) return { found: false };

  const sr = screen.getBoundingClientRect();
  const sc = sr.width / (screen.offsetWidth || sr.width || 1);

  const cur = document.querySelector(".d-cursor");
  const dot = document.querySelector(".d-cursor-dot");
  let cursor = null;
  if (cur && dot) {
    const r = dot.getBoundingClientRect();
    cursor = {
      visible: Number(getComputedStyle(cur).opacity) > 0.05,
      x: Math.round((r.left + r.width / 2 - sr.left) / sc),
      y: Math.round((r.top + r.height / 2 - sr.top) / sc),
    };
  }

  // 页面识别：页是「绝对定位 + inset:0」的容器，可能嵌在外壳里。
  // 只统计最内层的一批，避免把外壳也算成一页。
  const all = [...screen.querySelectorAll("div")];
  const pageCandidates = all.filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none") return false;
    if (cs.position !== "absolute") return false;
    // inset 都是 0 的表现：宽高与父级一致
    const r = el.getBoundingClientRect();
    const pr = el.parentElement.getBoundingClientRect();
    return Math.abs(r.width - pr.width) < 2 && Math.abs(r.height - pr.height) < 2;
  });
  // 去掉包含其它候选的父级，只留最内层
  const pages = pageCandidates.filter(
    (el) => !pageCandidates.some((o) => o !== el && el.contains(o)),
  );
  const visiblePages = Math.max(pages.length, 1);

  // 元素构成统计：只统计可见页里的
  const scope = pages.find((p) => getComputedStyle(p).display !== "none") || screen;
  const count = (sel) => scope.querySelectorAll(sel).length;

  const stats = window.__collectStats(scope);

  return {
    found: true,
    cursor,
    visiblePages,
    // 所有可见页的文本合并：断言时用这个，避免取错页
    allText: pages.map((p2) => p2.textContent.replace(/\s+/g, "")).join(""),
    navTitle: (() => {
      const nav = screen.querySelector("div[style*='grid-template-columns'] span:nth-child(2)");
      return nav ? nav.textContent.trim() : null;
    })(),
    text: scope.textContent.replace(/\s+/g, "").slice(0, 400),
    stats,
    counts: {
      rows: count("[data-row]") || count(".row") || 0,
    },
  };
});

// ── 基础三项 ──
console.log("\n=== 基础三项 ===");

// 1 页面结构存在
const first = await sample();
if (!first.found) {
  fail("找不到 .stage-screen，演示没渲染");
  await browser.close();
  process.exit(1);
}
pass("找到 .stage-screen");

// 2 逐秒采样
console.log("\n逐秒采样：");
const timeline = [];
for (let i = 0; i < SECONDS; i += 1) {
  const s = await sample();
  timeline.push({ t: i, ...s });
  const c = s.cursor;
  console.log(
    `  ${String(i).padStart(2)}s pages=${s.visiblePages}` +
    (c ? ` cursor=${c.visible ? `${c.x},${c.y}` : "hidden"}` : " cursor=无") +
    ` nav=${s.navTitle ?? "-"}`
  );
  await new Promise((r) => setTimeout(r, 1000));
}

// 3 切页断言：允许在过渡帧里短暂 2 页，但不能常驻
{
  const bad = timeline.filter((f) => f.visiblePages > 2);
  if (bad.length) fail(`出现过 ${bad.length} 帧显示 >2 页（第 ${bad.map((b) => b.t).join(",")} 秒）`);
  else pass("页面叠加未超过 2 层");

  // 连续 3 秒以上保持 2 页 = 说明有一页没被隐藏
  let run = 0;
  let stuck = false;
  for (const f of timeline) {
    run = f.visiblePages === 2 ? run + 1 : 0;
    if (run >= 3) stuck = true;
  }
  if (stuck) fail("有页面连续 3 秒未隐藏（切页的 display:none 没执行）");
  else pass("切页后旧页正常隐藏");
}

// 4 光标断言
// 某些屏（纯展示、结果页）本来就不该有光标，用 spec.cursor === false 声明
{
  const expectCursor = spec?.cursor !== false;
  const shown = timeline.filter((f) => f.cursor?.visible);
  if (!expectCursor) {
    if (shown.length) fail(`spec 声明本场景无光标，但有 ${shown.length} 帧出现`);
    else pass("按 spec 要求，全程无光标");
  } else if (!shown.length) {
    fail("全程没出现过光标（若本场景为纯展示，在 spec 里加 \"cursor\": false）");
  } else {
    pass(`光标出现过 ${shown.length} 帧`);

    // 坐标必须在画布内
    const w = 560;
    const h = 700;
    const out = shown.filter((f) => f.cursor.x < 0 || f.cursor.y < 0 || f.cursor.x > w || f.cursor.y > h);
    if (out.length) fail(`光标有 ${out.length} 帧跑出画布（如 ${out[0].cursor.x},${out[0].cursor.y}）`);
    else pass("光标全程在画布内");

    // 坐标要变化（不是卡死）
    const uniq = new Set(shown.map((f) => `${f.cursor.x},${f.cursor.y}`));
    if (uniq.size < 2) fail(`光标只停过 1 个位置（${[...uniq][0]}），没有移动`);
    else pass(`光标停过 ${uniq.size} 个不同位置`);
  }
}

// 5 JS 错误
{
  if (pageErrors.length) {
    fail(`JS 错误 ${pageErrors.length} 条：${pageErrors.slice(0, 3).join(" | ")}`);
  } else pass("无 JS 错误");
}

// ── spec 断言：重播一次，在每一屏出现的那一刻断言 ──
// 关键：不能等到最后再断言，那时前面的屏已经 display:none 了。
if (spec?.screens?.length) {
  console.log("\n=== 屏清单断言（重播，逐屏即时断言）===");

  // 重载页面，从第 0 秒开始
  await page.reload({ waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 300));
  if (SCENE) {
    await page.evaluate((key) => {
      const btn = [...document.querySelectorAll(".demo-list > button")]
        .find((b) => b.textContent.trim() === key || b.dataset.key === key);
      btn?.click();
    }, SCENE);
    await new Promise((r) => setTimeout(r, 300));
  }

  const done = new Set();

  for (let tick = 0; tick < SECONDS * 4; tick += 1) {
    const pending = spec.screens.filter((s2) => !done.has(s2.name));
    if (!pending.length) break;

    const state = await page.evaluate(() => {
      const scope = window.__resolveScope();
      if (!scope) return null;
      return {
        text: scope.textContent.replace(/\s+/g, ""),
        visiblePages: [...scope.parentElement.querySelectorAll(
          ":scope > div"
        )].filter((d) => getComputedStyle(d).display !== "none").length,
        stats: window.__collectStats(scope),
      };
    });
    if (!state) break;

    for (const sc of pending) {
      // 自动模式没有 expectText：等到页面有任何文字就断言
      if (sc._auto) {
        if (!state.text || state.text.length < 10) continue;
      } else {
        const t2 = (sc.expectText ?? "").replace(/\s+/g, "");
        if (!t2 || !state.text.includes(t2)) continue;
      }
      // 这一屏出现了，立即断言
      done.add(sc.name);
      console.log(`\n[${sc.name}]`);

      const missing = (sc.mustContain ?? []).filter(
        (x) => !state.text.includes(x.replace(/\s+/g, "")),
      );
      if (missing.length) fail(`缺少文案：${missing.join("、")}`);
      else pass(`文案齐全（${(sc.mustContain ?? []).length} 项）`);

      // ① 内置通用度量（跨项目可复用）
      for (const [k, min] of Object.entries(sc.minStats ?? {})) {
        const actual = state.stats[k] ?? 0;
        if (actual < min) fail(`${k} 只有 ${actual}，要求 ≥ ${min}`);
        else pass(`${k} = ${actual}（≥ ${min}）`);
      }

      // ② 项目自定义选择器计数（换项目时改这里，不用改脚本）
      for (const [sel, min] of Object.entries(sc.minCount ?? {})) {
        const n = await page.evaluate((q) => {
          const scope = window.__resolveScope();
          return scope ? scope.querySelectorAll(q).length : 0;
        }, sel);
        if (n < min) fail(`「${sel}」只有 ${n} 个，要求 ≥ ${min}`);
        else pass(`「${sel}」= ${n}（≥ ${min}）`);
      }

      // ③ 项目自定义断言表达式（最灵活，也最容易写错，慎用）
      for (const expr of sc.assert ?? []) {
        const ok2 = await page.evaluate((e2) => {
          try {
            const scope = window.__resolveScope();
            // 断言里可以直接用 scope，避免 document.querySelector 抓到别的屏
            return !!new Function("scope", `return (${e2});`)(scope);
          } catch { return false; }
        }, expr);
        if (!ok2) fail(`断言不成立：${expr}`);
        else pass(`断言成立：${expr}`);
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  const neverSeen = spec.screens.filter((s2) => !done.has(s2.name));
  for (const sc of neverSeen) {
    fail(sc._auto
      ? `整场都没等到页面出现内容（自动模式）`
      : `整场都没等到「${sc.expectText}」，这一屏没出现`);
  }
}

// ── 汇总 ──
console.log("\n=== 结果 ===");
if (failures.length && REPORT_ONLY) {
  console.log(`差异 ${failures.length} 项（--report-only，不判失败）：`);
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  console.log("\n判定：仅供参考");
  await browser.close();
  process.exit(0);
}
if (failures.length) {
  console.log(`失败 ${failures.length} 项：`);
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  console.log("\n判定：不通过");
  await browser.close();
  process.exit(1);
}
console.log("全部通过");
await browser.close();
process.exit(0);

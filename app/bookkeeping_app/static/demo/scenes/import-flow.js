/**
 * 场景：账单从邮箱自己进来（对照 123 秒录屏 95–115 秒逐帧还原）。
 *
 * 真实交互（index.html + dashboard.js initMailFetch）：
 *   点「从邮箱收取附件」
 *   → 状态：最近 7 天，扫描 11 封，发现 1 个下载链接
 *   → /api/mail-download 把链接下成 zip，待导入列表出现
 *   → 点「导入」展开解压密码栏 →「开始导入」
 *   → 状态：<文件名>：解析 3 笔 · 待确认 3（点左侧「待确认」补类目）
 *   → 待导入列表消失
 *
 * 手机竖屏（416×960 录屏），底部六 tab：流水/账单/导入/待确认/账户/设置。
 */
import { scenario, cursor, ok, flash } from "../kit.js";

const ZIP_NAME =
  "20261108-2250-微信支付账单流水文件(20261107-20261108)——【解压密码可在微信支付公众号查看】.zip";

function el(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

/** 手机外壳（真机竖屏） */
function phoneShell(root) {
  const wrap = el("div", "d-imp", root);

  // 不画系统状态栏

  // 顶栏：快速记账 / 更多
  const top = el("div", "d-imp-topbar", wrap);
  const quick = el("button", "d-imp-quick", top);
  quick.type = "button";
  quick.textContent = "快速记账";
  const more = el("button", "d-imp-more", top);
  more.type = "button";
  more.textContent = "更多";

  // 页面主体
  const body = el("div", "d-imp-body", wrap);

  // 底部 tab（六个）
  const tabs = el("div", "d-imp-tabs", wrap);
  ["流水", "账单", "导入", "待确认", "账户", "设置"].forEach((name) => {
    const t = el("div", name === "导入" ? "d-imp-tab is-on" : "d-imp-tab", tabs);
    t.textContent = name;
  });
  // 导入 tab 上方的活动指示条
  el("i", "d-imp-tabbar", tabs);

  return { el: wrap, body, quick, more };
}

export default function importFlow({ root, tl }) {
  const strip = scenario(root, "账单从邮箱自己进来", { local: true });
  const ph = phoneShell(root);
  const cur = cursor(root);

  /* ═══ 导入卡 ═══ */
  const card = el("div", "d-imp-card", ph.body);
  el("h2", "d-imp-h", card).textContent = "导入账单";
  el("p", "d-imp-note", card).innerHTML =
    '支持微信支付的 <code>.xlsx</code>、支付宝的 <code>.csv</code>（GB18030 / UTF-8）、' +
    '美团的 <code>.csv</code>、抖音支付的 <code>.pdf</code>。文件只在本机处理，不会上传到任何服务器。';

  // 拖入区
  const drop = el("div", "d-imp-drop", card);
  el("div", "d-imp-dropicon", drop).textContent = "↑";
  el("div", "d-imp-droptitle", drop).textContent = "把账单文件或 zip 拖到这里";
  el("div", "d-imp-dropnote", drop).textContent = "支持 .xlsx / .csv，以及微信导出的加密 .zip";

  // 邮箱按钮
  const mailBtn = el("button", "d-imp-mailbtn", card);
  mailBtn.type = "button";
  mailBtn.textContent = "从邮箱收取附件";

  // 状态文字
  const status = el("div", "d-imp-statusline", card);

  // 待导入列表
  const pending = el("div", "d-imp-pending", card);
  pending.style.display = "none";
  el("div", "d-imp-pendingtitle", pending).textContent = "待导入的压缩包（1）";
  el("div", "d-imp-fname", pending).textContent = ZIP_NAME;
  el("div", "d-imp-fmeta", pending).textContent = "6 KB · 2026-11-08 16:32";
  const acts = el("div", "d-imp-acts", pending);
  const importBtn = el("button", "d-imp-importbtn", acts);
  importBtn.type = "button";
  importBtn.textContent = "导入";
  const delBtn = el("button", "d-imp-delbtn", acts);
  delBtn.type = "button";
  delBtn.textContent = "删除";

  // 解压密码栏
  const pwRow = el("div", "d-imp-pwrow", pending);
  pwRow.style.display = "none";
  const pwInput = document.createElement("input");
  pwInput.type = "password";
  pwInput.value = "";
  pwInput.placeholder = "解压密码（没有就留空）";
  pwInput.readOnly = true;   // 演示用：不接受真实键盘，值由时间轴写入
  pwRow.appendChild(pwInput);
  const goBtn = el("button", "d-imp-gobtn", pwRow);
  goBtn.type = "button";
  goBtn.textContent = "开始导入";
  const cancelBtn = el("button", "d-imp-cancelbtn", pwRow);
  cancelBtn.type = "button";
  cancelBtn.textContent = "取消";

  // 帮助折叠
  const help = el("details", "d-imp-help", card);
  el("summary", "", help).textContent = "账单从哪里导出？";
  const helpList = el("ul", "d-imp-helplist", help);
  [
    "微信：我 → 服务 → 钱包 → 账单 → 右上角 ⋯ → 下载账单 → 用作个人对账",
    "支付宝：我的 → 账单 → 右上角 ⋯ → 开具交易流水证明 → 用于个人对账",
  ].forEach((line) => el("li", "", helpList).textContent = line);

  /* ═══ 编排 ═══ */
  strip.in(tl, 0.1);
  tl.from(ph.el, { y: 16, opacity: 0, duration: 0.4 }, 0.15);
  cur.show(tl, 0.45);

  // 1. 点「从邮箱收取附件」
  cur.toAt(tl, mailBtn, { duration: 0.6, at: 1.0 });
  cur.click(tl, mailBtn, ">");
  tl.call(() => {
    mailBtn.disabled = true;
    status.textContent = "正在连接邮箱…";
  }, null, "<");

  // 2. 扫描结果（录屏原话）
  tl.call(() => {
    mailBtn.disabled = false;
    status.textContent = "最近 7 天，扫描 11 封，发现 1 个下载链接";
  }, null, ">+1.8");

  // 3. 链接下载完成 → 待导入列表出现 + 立即开始导入
  tl.call(() => { pending.style.display = ""; }, null, ">+0.5");
  tl.from(pending, { opacity: 0, y: 8, duration: 0.3 }, "<");
  tl.call(() => {
    status.textContent = `正在导入 ${ZIP_NAME}`;
  }, null, ">+0.3");

  // 4. 点「导入」→ 展开解压密码栏（按钮仍是「开始导入」）
  cur.toAt(tl, importBtn, { duration: 0.45, at: ">+0.7" });
  cur.click(tl, importBtn, ">");
  tl.call(() => {
    pwRow.style.display = "flex";
    pwInput.value = "";
    goBtn.textContent = "开始导入";
    goBtn.disabled = false;
  }, null, "<");
  tl.from(pwRow, { opacity: 0, y: -6, duration: 0.25 }, "<");

  // 5. 逐字输入解压密码（6 位，密文逐字出现）
  tl.to({}, { duration: 0.4 }, ">+0.2");
  const pwTyped = { n: 0 };
  tl.to(pwTyped, {
    n: 6,
    duration: 1.5,
    ease: "none",
    onUpdate() {
      pwInput.value = "•".repeat(Math.round(pwTyped.n));
    },
  }, ">");

  // 6. 密码填完先停住 —— 让观众看清「开始导入」是可点的
  tl.to({}, { duration: 1.4 }, ">");

  // 7. 点「开始导入」→ 按钮变「导入中…」
  cur.toAt(tl, goBtn, { duration: 0.5, at: ">" });
  cur.click(tl, goBtn, ">");
  tl.call(() => {
    goBtn.textContent = "导入中…";
    goBtn.disabled = true;
  }, null, ">");
  tl.fromTo(goBtn, { scale: 0.96 }, { scale: 1, duration: 0.22 }, "<");
  tl.to({}, { duration: 1.5 }, ">");

  // 7. 导入完成：待导入列表消失，状态栏出结果（录屏原话）
  tl.call(() => {
    pending.style.display = "none";
    status.textContent =
      `${ZIP_NAME}：解析 3 笔 · 待确认 3（点左侧「待确认」补类目）`;
  }, null, ">+1.8");
  flash(tl, status, { color: "neon", at: "<" });

  ok(root, "3 笔待确认", { en: "IMPORTED" })(tl, ">-0.1");
  strip.result(tl, "只扫最近 7 天", "<");
  cur.hide(tl, "<");

  return tl;
}

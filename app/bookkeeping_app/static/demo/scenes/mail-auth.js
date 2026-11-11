/**
 * 场景：QQ 邮箱授权码怎么拿。
 *
 * 这是一段**电脑录屏**（1916×918，35 秒），不是手机界面，所以不套手机壳，
 * 而是画一个桌面窗口：QQ 邮箱网页 → 拿到授权码 → 回我的账本填进去。
 *
 * 真实流程（对照录屏逐帧，7 个界面）：
 *   1 QQ邮箱·设置（通用）        点右上「设置」
 *   2 账号与安全·账号设置        点左栏「账号与安全」
 *   3 安全设置                  点左侧「安全设置」
 *   4 短信验证（二维码）          点「开启服务」
 *   5 服务已开启（授权码）        扫码后
 *   6 我的账本·设置              点侧栏「设置」
 *   7 已配置                    填邮箱 + 授权码后点「保存」
 *
 * 屏幕上的邮箱、手机号、授权码、头像全部是虚构的。
 */

import { scenario, cursor, type as typeText } from "../kit.js";

/* ── 虚构数据（真实值一律不出现在本文件）────────────────── */
const EMAIL = "demo_user@qq.com";
const ALIAS = "demo_alias@qq.com";
const PHONE = "138****0000";
const AUTH_CODE = "kqzmvxptnrwshdab"; // 16 位小写字母，与真机同形
const BALANCE = "-1,234.56";

function el(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

/** 桌面窗口：整块画布就是一台电脑的浏览器 */
function desktopWindow(root) {
  const win = el("div", "d-ma-win", root);
  const body = el("div", "d-ma-body", win);
  return { win, body };
}

/** 页面容器：绝对定位铺满窗口，默认隐藏 */
function page(parent) {
  const p = el("div", "d-ma-page", parent);
  p.style.display = "none";
  return p;
}

function go(tl, from, to, at = ">") {
  // 点完先在原页面停一下：观众要看清「点了哪儿」，再跳走。
  tl.to({}, { duration: 0.62 }, at)
    .to(from, { opacity: 0, duration: 0.2 }, ">")
    .call(() => { from.style.display = "none"; from.style.opacity = 1; }, null, ">")
    .call(() => { to.style.display = "block"; }, null, "<")
    .fromTo(to, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.26 }, "<")
    // 新页面再停一下，让人先扫一眼整体，再等光标动。
    .to({}, { duration: 0.55 }, ">");
}

/** QQ 邮箱顶栏 */
function qqTop(parent, { title = "", active = "" } = {}) {
  const bar = el("div", "d-ma-top", parent);
  const logo = el("div", "d-ma-logo", bar);
  el("b", "", logo).textContent = "Mail";
  el("span", "", logo).textContent = "邮箱";
  if (title) el("div", "d-ma-pagetitle", bar).textContent = title;

  const search = el("div", "d-ma-search", bar);
  el("i", "", search).textContent = "⌕";
  el("span", "", search).textContent = "搜索";

  const right = el("div", "d-ma-topright", bar);
  const avatar = el("i", "d-ma-avatar", right);
  avatar.textContent = "演";
  const who = el("div", "d-ma-who", right);
  el("b", "", who).textContent = EMAIL;
  el("span", "", who).textContent = "普通用户 ▾";
  const gear = el("div", active === "设置" ? "d-ma-gear is-on" : "d-ma-gear", right);
  el("i", "", gear).textContent = "⚙";
  el("span", "", gear).textContent = "设置";
  return { bar, gear };
}

/** QQ 邮箱左栏 */
function qqSide(parent) {
  const side = el("div", "d-ma-side", parent);
  const group = (label) => el("div", "d-ma-sidecap", side).textContent = label;
  const item = (label, { on = false, glyph = "·", ext = false } = {}) => {
    const it = el("div", on ? "d-ma-sideitem is-on" : "d-ma-sideitem", side);
    el("i", "", it).textContent = glyph;
    el("span", "", it).textContent = label;
    if (ext) el("em", "", it).textContent = "↗";
    return it;
  };

  el("div", "d-ma-sideback", side).textContent = "‹ 返回";
  item("会员中心", { glyph: "♛" });

  group("邮件");
  const general = item("通用", { on: true, glyph: "☰" });
  item("发信设置", { glyph: "✉" });
  item("读信设置", { glyph: "◫" });
  item("收信规则", { glyph: "⇥" });
  item("反垃圾", { glyph: "⊘" });
  item("文件夹和标签", { glyph: "▤" });
  item("重要联系人", { glyph: "☆" });
  item("代收邮箱", { glyph: "⇄" });
  item("自助查询", { glyph: "?" });

  group("应用");
  item("应用管理", { glyph: "▦" });

  group("账号");
  const security = item("账号与安全", { glyph: "⛨", ext: true });

  group("辅助");
  item("无障碍模式", { glyph: "◍" });

  return { side, general, security };
}

/** 我的账本左栏（深色） */
function ledgerSide(parent) {
  const side = el("div", "d-ma-lside", parent);
  const brand = el("div", "d-ma-brand", side);
  el("b", "", brand).textContent = "账簿";
  el("span", "", brand).textContent = "MyLedger";

  const month = el("div", "d-ma-month", side);
  el("span", "", month).textContent = "11 月";
  el("b", "", month).textContent = BALANCE;

  ["流水", "账单", "导入", "待确认", "账户"].forEach((t) => {
    el("div", "d-ma-lnav", side).textContent = t;
  });
  const settings = el("div", "d-ma-lnav is-on", side);
  settings.textContent = "设置";
  return { side, settings };
}

/** 二维码占位：确定性图案，绝不是真二维码 */
function qrBlock(parent) {
  const box = el("div", "d-ma-qr", parent);
  const grid = el("div", "d-ma-qrgrid", box);
  grid.style.gridTemplateColumns = "repeat(21, 1fr)";
  for (let y = 0; y < 21; y += 1) {
    for (let x = 0; x < 21; x += 1) {
      const cell = document.createElement("i");
      const corner =
        (x < 5 && y < 5) || (x > 15 && y < 5) || (x < 5 && y > 15);
      const on = corner
        ? (x % 4 !== 3 && y % 4 !== 3) || (x < 2 && y < 2) || (x > 18 && y < 2)
        : ((x * 7 + y * 13 + x * y) % 5 < 2);
      if (on) cell.className = "on";
      grid.appendChild(cell);
    }
  }
  return box;
}

/** 表单行：左标签 + 右侧内容 */
function kv(parent, k, v, cls = "") {
  const row = el("div", "d-ma-kv", parent);
  el("span", "d-ma-k", row).textContent = k;
  el("span", cls ? `d-ma-v ${cls}` : "d-ma-v", row).textContent = v;
  return row;
}

/** 「我的」--账本 设置页里的一个分区 */
function section(parent, title, hint) {
  const wrap = el("div", "d-ma-sec", parent);
  const head = el("div", "d-ma-sechead", wrap);
  el("b", "", head).textContent = title;
  if (hint) el("span", "", head).textContent = hint;
  return wrap;
}

/** 开关 */
function toggle(parent, on) {
  const sw = el("div", on ? "d-ma-sw is-on" : "d-ma-sw", parent);
  el("i", "", sw);
  return sw;
}

export default function mailAuth({ root, tl }) {
  const strip = scenario(root, "拿 QQ 邮箱授权码，只走一次", { local: true });
  const { body } = desktopWindow(root);
  const cur = cursor(root);

  /* ═══ 屏 1：QQ 邮箱·设置（通用）═══ */
  const p1 = page(body);
  p1.style.display = "block";
  const t1 = qqTop(p1, { active: "设置" });
  const line1 = el("div", "d-ma-acctbar", p1);
  el("b", "", line1).textContent = EMAIL;
  el("span", "", line1).textContent = "普通用户";

  const layout1 = el("div", "d-ma-layout", p1);
  const s1 = qqSide(layout1);
  const main1 = el("div", "d-ma-main", layout1);
  el("div", "d-ma-h1", main1).textContent = "通用";

  el("div", "d-ma-h2", main1).textContent = "个人信息";
  const card1 = el("div", "d-ma-profile", main1);
  const av1 = el("i", "d-ma-bigavatar", card1);
  av1.textContent = "演";
  const pInfo = el("div", "d-ma-profileinfo", card1);
  el("b", "", pInfo).textContent = EMAIL;
  el("span", "", pInfo).textContent = EMAIL;
  el("em", "d-ma-edit", card1).textContent = "编辑";

  const bday = el("div", "d-ma-bday", main1);
  el("span", "d-ma-k", bday).textContent = "生日";
  ["公历", "1 月", "1 日"].forEach((t) => {
    el("span", "d-ma-select", bday).textContent = `${t} ▾`;
  });

  el("div", "d-ma-h2", main1).textContent = "容量";
  const cap1 = el("div", "d-ma-cap", main1);
  el("span", "d-ma-k", cap1).textContent = "邮箱容量";
  const bar1 = el("div", "d-ma-bar", cap1);
  el("i", "", bar1).style.width = "30%";
  el("em", "", cap1).textContent = "1.2GB / 4GB";
  const cap2 = el("div", "d-ma-cap", main1);
  el("span", "d-ma-k", cap2).textContent = "文件云盘";
  const bar2 = el("div", "d-ma-bar", cap2);
  el("i", "", bar2).style.width = "25%";
  el("em", "", cap2).textContent = "750MB / 3GB";

  el("div", "d-ma-h2", main1).textContent = "语言";
  const langRow = el("div", "d-ma-bday", main1);
  el("span", "d-ma-k", langRow).textContent = "语言 Language";
  el("span", "d-ma-select is-wide", langRow).textContent = "跟随系统 ▾";

  el("div", "d-ma-h2", main1).textContent = "显示";
  const showRow = el("div", "d-ma-lrow is-plain", main1);
  const showL = el("div", "", showRow);
  el("b", "", showL).textContent = "阅读窗格";
  el("span", "", showL).textContent = "在邮件列表右侧预览正文";
  el("span", "d-ma-select", showRow).textContent = "右侧 ▾";

  /* ═══ 屏 2：账号与安全·账号设置 ═══ */
  const p2 = page(body);
  const t2 = qqTop(p2, { title: "账号与安全" });
  el("div", "d-ma-blueband", p2);
  const card2 = el("div", "d-ma-card2", p2);
  const c2l = el("div", "d-ma-card2left", card2);
  const av2 = el("i", "d-ma-bigavatar", c2l);
  av2.textContent = "演";
  el("b", "d-ma-c2mail", c2l).textContent = EMAIL;
  el("span", "d-ma-c2mail2", c2l).textContent = EMAIL;
  const nav2 = el("div", "d-ma-c2nav", c2l);
  const navAcct = el("div", "d-ma-c2navitem is-on", nav2);
  navAcct.textContent = "账号设置";
  const navSec = el("div", "d-ma-c2navitem", nav2);
  navSec.textContent = "安全设置";
  const navDev = el("div", "d-ma-c2navitem", nav2);
  navDev.textContent = "设备管理";

  const c2r = el("div", "d-ma-card2right", card2);
  el("div", "d-ma-h1 is-lg", c2r).textContent = "账号设置";
  el("div", "d-ma-k", c2r).textContent = "默认发信账号";
  const selAcct = el("div", "d-ma-bigselect", c2r);
  selAcct.textContent = `${EMAIL} ▾`;
  el("div", "d-ma-h2", c2r).textContent = "账号管理";
  el("div", "d-ma-hint", c2r).textContent = "你可以使用以下邮箱地址收发邮件";

  [["QQ邮箱", EMAIL, "默认"], ["英文邮箱", ALIAS, "删除"]].forEach(([k, v, act]) => {
    const row = el("div", "d-ma-mailrow", c2r);
    el("i", "d-ma-mailico", row).textContent = k === "QQ邮箱" ? "QQ" : "a";
    el("span", "d-ma-mailk", row).textContent = k;
    el("span", "d-ma-mailv", row).textContent = v;
    el("em", "d-ma-mailact", row).textContent = act;
  });
  el("div", "d-ma-h2", c2r).textContent = "手机号码";
  el("div", "d-ma-hint", c2r).textContent =
    "手机号码可用于登录及敏感操作时安全验证";
  kv(c2r, "+86", PHONE);

  /* ═══ 屏 3：安全设置 ═══ */
  const p3 = page(body);
  const t3 = qqTop(p3, { title: "账号与安全" });
  el("div", "d-ma-blueband", p3);
  const card3 = el("div", "d-ma-card2", p3);
  const c3l = el("div", "d-ma-card2left", card3);
  const av3 = el("i", "d-ma-bigavatar", c3l);
  av3.textContent = "演";
  el("b", "d-ma-c2mail", c3l).textContent = EMAIL;
  el("span", "d-ma-c2mail2", c3l).textContent = EMAIL;
  const nav3 = el("div", "d-ma-c2nav", c3l);
  const n3a = el("div", "d-ma-c2navitem", nav3);
  n3a.textContent = "账号设置";
  const n3b = el("div", "d-ma-c2navitem is-on", nav3);
  n3b.textContent = "安全设置";
  const n3c = el("div", "d-ma-c2navitem", nav3);
  n3c.textContent = "设备管理";

  const c3r = el("div", "d-ma-card2right", card3);
  el("div", "d-ma-h1 is-lg", c3r).textContent = "安全设置";

  el("div", "d-ma-h2", c3r).textContent = "辅助验证方式";
  el("div", "d-ma-hint", c3r).textContent =
    "当你绑定的手机无法使用时，可通过辅助验证方式验证你的身份";
  const btns = el("div", "d-ma-btnrow", c3r);
  el("span", "d-ma-btn is-ghost", btns).textContent = "绑定辅助邮箱";
  el("span", "d-ma-btn is-ghost", btns).textContent = "绑定辅助手机";

  el("div", "d-ma-h2", c3r).textContent = "独立密码";
  el("span", "d-ma-btn is-primary", c3r).textContent = "设置独立密码";

  el("div", "d-ma-h2", c3r).textContent = "文件夹区域加锁";
  el("span", "d-ma-btn is-ghost", c3r).textContent = "设置加锁密码";

  // 关键区：IMAP 服务未开启 + 开启服务
  const imapSec = el("div", "d-ma-imap", c3r);
  el("b", "", imapSec).textContent = "POP3/IMAP/SMTP/Exchange/CardDAV 服务";
  el("em", "", imapSec).textContent = "（未开启）";
  el("span", "d-ma-imaphint", imapSec).textContent =
    "开启该服务即可在第三方客户端收取 QQ 邮箱的邮件";
  const openBtn = el("span", "d-ma-btn is-outline", imapSec);
  openBtn.textContent = "开启服务";

  const promo = el("div", "d-ma-promo", c3r);
  const promoLeft = el("div", "d-ma-promomain", promo);
  el("b", "", promoLeft).textContent = "下载 QQ 邮箱";
  el("span", "", promoLeft).textContent =
    "使用 QQ 邮箱 APP 收发邮件，邮件通知更及时，扫描二维码下载";
  qrBlock(el("div", "d-ma-promoqr", promo));

  /* ═══ 屏 4：短信验证（二维码）═══ */
  const p4 = page(body);
  const t4 = qqTop(p4, { title: "账号与安全" });
  const card4 = el("div", "d-ma-narrow", p4);
  el("div", "d-ma-back", card4).textContent = "←";
  el("div", "d-ma-h1 is-lg", card4).textContent = "短信验证";
  el("div", "d-ma-hint", card4).textContent =
    `请用手机 ${PHONE} 发送短信，然后点击「我已发送」进行验证`;
  const qrWrap = el("div", "d-ma-qrwrap", card4);
  qrBlock(qrWrap);
  el("span", "d-ma-qrtip", qrWrap).textContent = "微信扫描二维码，可快速发送短信";
  el("div", "d-ma-link", card4).textContent = "手动发送短信（短信费用由运营商收取）";
  const mailFooter = el("div", "d-ma-footer", card4);
  el("span", "d-ma-link", mailFooter).textContent = "选择其他方式验证 ▾";
  const sentBtn = el("span", "d-ma-btn is-solid", mailFooter);
  sentBtn.textContent = "我已发送";

  /* ═══ 屏 5：服务已开启（授权码）═══ */
  const p5 = page(body);
  const t5 = qqTop(p5, { title: "账号与安全" });
  const card5 = el("div", "d-ma-narrow", p5);
  const check = el("div", "d-ma-check", card5);
  check.textContent = "✓";
  el("div", "d-ma-h1 is-lg is-center", card5).textContent = "SMTP/IMAP 服务已开启";
  el("div", "d-ma-hint is-center", card5).textContent =
    "在第三方客户端登录时，密码框请输入以下授权码：";

  const codeBox = el("div", "d-ma-codebox", card5);
  const codeTxt = el("span", "d-ma-code", codeBox);
  codeTxt.textContent = AUTH_CODE;
  const copyIco = el("i", "d-ma-copy", codeBox);
  copyIco.textContent = "⧉";

  el("div", "d-ma-hint is-center is-dim", card5).textContent =
    "你可以拥有多个授权码，无需记住该授权码，为了安全请勿告知其他人。";
  const noteRow = el("div", "d-ma-noterow", card5);
  el("span", "d-ma-k", noteRow).textContent = "备注授权码用途：";
  el("span", "d-ma-noteinput", noteRow).textContent = "输入备注，例如个人电脑、手机客户端等";
  const backBtn = el("span", "d-ma-btn is-solid is-center", card5);
  backBtn.textContent = "返回安全设置";

  /* ═══ 屏 6：我的账本·设置 ═══ */
  const p6 = page(body);
  const l6 = ledgerSide(p6);
  const main6 = el("div", "d-ma-lmain", p6);
  const ltop = el("div", "d-ma-ltop", main6);
  el("div", "d-ma-ltitle", ltop).textContent = "设置";
  const ltopRight = el("div", "d-ma-ltopright", ltop);
  ["快速记账", "搜索账单、备注、账户", "导出"].forEach((t) => {
    el("span", "d-ma-ltool", ltopRight).textContent = t;
  });
  el("span", "d-ma-ltool is-strong", ltopRight).textContent = "我的账本 ▾";
  el("span", "d-ma-ltool", ltopRight).textContent = "退出";

  const sec1 = section(main6, "外观设置");
  const r1 = el("div", "d-ma-lrow", sec1);
  const l1 = el("div", "", r1);
  el("b", "", l1).textContent = "深色主题";
  el("span", "", l1).textContent = "切换仪表盘的明暗外观";
  toggle(r1, false);
  const r2 = el("div", "d-ma-lrow", sec1);
  const l2 = el("div", "", r2);
  el("b", "", l2).textContent = "红绿反色";
  el("span", "", l2).textContent = "仅影响收入和支出金额的颜色";
  toggle(r2, false);

  const ruleRow = el("div", "d-ma-lrow", section(main6, "分类规则"));
  el("span", "d-ma-lbtn is-ghost", ruleRow).textContent = "展开";

  const sec3 = section(main6, "我的账号");
  el("b", "d-ma-luser", sec3).textContent = "admin";
  el("span", "d-ma-lrole", sec3).textContent = "管理员";
  const pwRow = el("div", "d-ma-pwrow", sec3);
  ["当前密码", "新密码"].forEach((t) => {
    const cell = el("div", "d-ma-pwcell", pwRow);
    el("span", "", cell).textContent = t;
    el("div", "d-ma-linput", cell);
  });
  el("span", "d-ma-lbtn is-ghost", pwRow).textContent = "修改密码";

  // 关键区：邮箱收取
  const sec4 = section(main6, "邮箱收取", "保存后可在导入页一键收取");
  const mailRow = el("div", "d-ma-mailform", sec4);
  const f1 = el("div", "d-ma-field", mailRow);
  el("span", "", f1).textContent = "邮箱账号";
  const mailInput = el("div", "d-ma-linput is-big", f1);
  const mailText = el("span", "", mailInput);

  const f2 = el("div", "d-ma-field", mailRow);
  el("span", "", f2).textContent = "授权码";
  const codeInput = el("div", "d-ma-linput is-big", f2);
  const codeDots = el("span", "d-ma-dots", codeInput);

  const saveBtn = el("span", "d-ma-lbtn is-primary", mailRow);
  saveBtn.textContent = "保存";
  const savedBadge = el("span", "d-ma-badge", mailRow);
  savedBadge.textContent = "已配置";

  el("div", "d-ma-lhint", sec4).textContent =
    "QQ 邮箱：设置 → 账号 → 开启 IMAP 服务 → 生成授权码。授权码加密后存在本机数据库，主密钥在配置文件的 [mail] 段。";

  const sec5 = section(main6, "用户管理", "只有管理员能看到这一块");
  const urow = el("div", "d-ma-userrow", sec5);
  el("b", "", urow).textContent = "admin";
  ["管理员", "正常", "重置密码", "禁用"].forEach((t) => {
    el("span", "d-ma-mini", urow).textContent = t;
  });
  el("span", "d-ma-mini is-danger", urow).textContent = "删除";

  /* ═══ 屏 7：已配置（同一屏的完成态，不单独建页）═══ */

  /* ═══════════════ 编排 ═══════════════ */
  strip.in(tl, 0.1);
  cur.show(tl, 0.3);

  // 1 → 2：点「账号与安全」
  cur.toAt(tl, s1.security, { duration: 0.5, at: 1.4 });
  cur.click(tl, s1.security, ">");
  go(tl, p1, p2, ">");

  // 2 → 3：点「安全设置」
  cur.toAt(tl, navSec, { duration: 0.4, at: ">+0.7" });
  cur.click(tl, navSec, ">");
  go(tl, p2, p3, ">");

  // 3 → 4：点「开启服务」
  cur.toAt(tl, openBtn, { duration: 0.45, at: ">+0.9" });
  cur.click(tl, openBtn, ">");
  go(tl, p3, p4, ">");

  // 4 → 5：扫码后点「我已发送」
  cur.toAt(tl, sentBtn, { duration: 0.45, at: ">+1.6" });
  cur.click(tl, sentBtn, ">");
  go(tl, p4, p5, ">");

  // 5：复制授权码
  cur.toAt(tl, copyIco, { duration: 0.35, at: ">+1.0" });
  cur.click(tl, copyIco, ">");
  tl.call(() => { copyIco.textContent = "✓"; copyIco.classList.add("is-copied"); }, null, ">+0.1");
  tl.call(() => { copyIco.textContent = "⧉"; copyIco.classList.remove("is-copied"); }, null, ">+1.1");

  // 5 → 6：切到我的账本设置
  go(tl, p5, p6, ">+0.4");
  tl.call(() => { savedBadge.style.display = "none"; }, null, "<");

  // 6：填邮箱
  cur.toAt(tl, mailInput, { duration: 0.4, at: ">+0.5" });
  cur.click(tl, mailInput, ">");
  typeText(tl, mailText, EMAIL, { cps: 14, at: ">+0.15" });

  // 6：填授权码（打成圆点）
  cur.toAt(tl, codeInput, { duration: 0.35, at: ">+0.25" });
  cur.click(tl, codeInput, ">");
  tl.call(() => { codeDots.textContent = ""; }, null, ">+0.1");
  const codeState = { n: 0 };
  tl.to(codeState, {
    n: AUTH_CODE.length,
    duration: AUTH_CODE.length / 9,
    ease: "none",
    onUpdate() { codeDots.textContent = "•".repeat(Math.round(codeState.n)); },
  }, ">");

  // 7：保存 → 已配置
  cur.toAt(tl, saveBtn, { duration: 0.35, at: ">+0.35" });
  cur.click(tl, saveBtn, ">");
  tl.call(() => {
    savedBadge.style.display = "";
    saveBtn.textContent = "已保存";
    saveBtn.classList.add("is-done");
  }, null, ">+0.1");
  tl.call(() => {
    saveBtn.textContent = "保存";
    saveBtn.classList.remove("is-done");
  }, null, ">+1.3");

  // 收尾
  cur.hide(tl, ">+0.6");
  strip.result(tl, "授权码只在本机加密存放", "<");

  return tl;
}

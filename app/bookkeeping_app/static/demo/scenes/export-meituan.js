/**
 * 场景：美团账单怎么导出。
 *
 * 对照手机录屏（720×1652，51 秒）的 8 个界面：
 *   1 我的            头像/会员卡/订单/钱包/工具宫格
 *   2 我的钱包        余额/银行卡/药划算/笔笔返 + 月付 + 账单行
 *   3 账单            当前账号 + 筛选条 + 按月分组的流水
 *   4 ⋯ 菜单          下载账单 / 常见问题 / 功能反馈
 *   5 下载账单流水     说明卡 +「去下载」+ 申请记录
 *   6 选择交易流水范围  交易类型 / 时间范围 / 起始·结束日期 / 下一步（灰色）
 *   7 选择起始日期     三列滚轮 + 确定
 *   8 填写邮箱地址     提示条 + 输入框 + 联想 + 发送
 *
 * 录屏后面还有「确认邮箱 → 待验证 → 支付密码 → 申请已提交 → 申请记录」，
 * 按本场景的范围停在「填写邮箱」；支付密码属于认证步骤，不做复刻。
 *
 * 屏幕上的账号、手机号、商户、金额、邮箱全部虚构。
 */

import { scenario, cursor, type as typeText } from "../kit.js";

/* ── 虚构数据 ─────────────────────────────────────────── */
const NICK = "演示用户";
const WALLET_TITLE = "演示的钱包";
const PHONE = "138****0000";
const MAIL = "demo_user@163.com";
const SUGGESTS = ["demo_user@qq.com", "demo_user@163.com", "demo_user@126.com", "demo_user@hotmail.com"];

const BILL_NOV = [
  ["示例汉堡店（示例城店）", "美团月付", "11-11 00:08", "-16.80", "🍔", "#f5c242"],
  ["示例日料店·单人精选", "美团月付", "11-06 19:56", "-38.60", "🍣", "#f08a4b"],
  ["示例充电", "微信支付", "11-04 23:29", "-7.20", "⚡", "#3ec86f"],
  ["示例鸡煲店·招牌双人餐", "美团月付", "11-04 22:26", "-142.50", "🍲", "#f08a4b"],
];
const BILL_OCT = [
  ["示例鸡煲店·退款", "退至美团月付", "10-24 00:59", "+184.00", "退", "#e8564a"],
];

function el(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

/** 美团手机外壳 */
function mtShell(root) {
  const wrap = el("div", "d-mt", root);
  const body = el("div", "d-mt-body", wrap);
  return { wrap, body };
}

function pg(parent) {
  const p = el("div", "d-mt-page", parent);
  p.style.display = "none";
  return p;
}

/** 顶部导航：‹ + 标题 */
function nav(parent, title, { right = "" } = {}) {
  const bar = el("div", "d-mt-nav", parent);
  const back = el("div", "d-mt-back", bar);
  back.textContent = "‹";
  el("div", "d-mt-title", bar).textContent = title;
  const r = el("div", "d-mt-navright", bar);
  r.textContent = right;
  return { bar, back, right: r };
}

function go(tl, from, to, at = ">") {
  // 点完先停一下看清点击目标，再切页；切过去也停一下再动手。
  tl.to({}, { duration: 0.62 }, at)
    .to(from, { opacity: 0, duration: 0.2 }, ">")
    .call(() => { from.style.display = "none"; from.style.opacity = 1; }, null, ">")
    .call(() => { to.style.display = "block"; }, null, "<")
    .fromTo(to, { opacity: 0, x: 12 }, { opacity: 1, x: 0, duration: 0.26 }, "<")
    .to({}, { duration: 0.55 }, ">");
}

/** 一行流水 */
function billRow(parent, [name, pay, time, amount, glyph, color], faded = false) {
  const row = el("div", "d-mt-brow", parent);
  const ic = el("i", "d-mt-bico", row);
  ic.style.background = color;
  ic.textContent = glyph;
  const mid = el("div", "d-mt-bmid", row);
  el("b", "", mid).textContent = name;
  el("span", "", mid).textContent = pay;
  el("em", "d-mt-btime", mid).textContent = time;
  el("em", "d-mt-bamt", row).textContent = amount;
  if (faded) row.style.opacity = "0.75";
  return row;
}

export default function exportMeituan({ root, tl }) {
  const strip = scenario(root, "美团账单在「钱包 → 账单」里下载", { local: true });
  const { body } = mtShell(root);
  const cur = cursor(root);

  /* ═══ 1 我的 ═══ */
  const p1 = pg(body);
  p1.style.display = "block";

  const hero = el("div", "d-mt-hero", p1);
  const hTop = el("div", "d-mt-herotop", hero);
  const logo = el("i", "d-mt-logo", hTop);
  logo.textContent = "美";
  el("b", "d-mt-nick", hTop).textContent = NICK;
  const hRight = el("div", "d-mt-herobtns", hTop);
  ["客服", "设置"].forEach((t) => el("span", "", hRight).textContent = t);

  const member = el("div", "d-mt-member", hero);
  const mTop = el("div", "d-mt-mtop", member);
  el("b", "", mTop).textContent = "黄金会员";
  el("span", "", mTop).textContent = "★★★★☆";
  el("em", "", mTop).textContent = "成长值 1820 / 5000";
  const mCards = el("div", "d-mt-mcards", member);
  ["惊喜多选1", "抢20-20元券", "免费升房"].forEach((t) => {
    el("span", "d-mt-mcard", mCards).textContent = t;
  });

  const coupons = el("div", "d-mt-coupons", hero);
  [["外卖大额神券", "¥12"], ["堂食膨胀神券", "¥12"], ["堂食神券", "¥8"]].forEach(([k, v]) => {
    const c = el("div", "d-mt-coupon", coupons);
    el("b", "", c).textContent = v;
    el("span", "", c).textContent = k;
  });
  const daily = el("div", "d-mt-daily", coupons);
  el("span", "", daily).textContent = "每日领券";
  el("b", "", daily).textContent = "一键领取";

  const quick = el("div", "d-mt-quick", p1);
  ["收藏", "浏览记录", "红包卡券", "美团币"].forEach((t) => {
    el("span", "", quick).textContent = t;
  });

  el("div", "d-mt-sec", p1).textContent = "订单";
  const orders = el("div", "d-mt-grid4", p1);
  ["全部订单", "待收货/使用", "待评价", "退款售后"].forEach((t) => {
    el("span", "", orders).textContent = t;
  });

  // 钱包区：整块可点，账单入口在下一屏
  const walletBlock = el("div", "d-mt-wblock", p1);
  const walletHead = el("div", "d-mt-sechead", walletBlock);
  el("b", "", walletHead).textContent = "钱包";
  el("em", "", walletHead).textContent = "您有一笔返利待领取 ›";
  const walletRow = el("div", "d-mt-grid4 is-wallet", walletBlock);
  [["借钱", "4.86万"], ["美团月付", "486元"], ["我的卡额度", "8.80万"], ["可用额度", "6000元"]].forEach(([k, v]) => {
    const c = el("div", "d-mt-wcell", walletRow);
    el("b", "", c).textContent = v;
    el("span", "", c).textContent = k;
  });

  const tools = el("div", "d-mt-grid4 is-tools", p1);
  ["开发票", "小美评审团", "我的公益", "企业服务", "入驻美团", "我的店铺", "添加商户", "更多工具"].forEach((t) => {
    el("span", "", tools).textContent = t;
  });

  const banner = el("div", "d-mt-banner", p1);
  el("span", "", banner).textContent = "您觉得美团 App 使用起来顺手吗？";
  el("em", "", banner).textContent = "×";

  const tabs = el("div", "d-mt-tabs", p1);
  ["首页", "视频", "小团", "购物车", "我的"].forEach((t, i) => {
    el("span", i === 4 ? "is-on" : "", tabs).textContent = t;
  });

  /* ═══ 2 我的钱包 ═══ */
  const p2 = pg(body);
  const n2 = nav(p2, WALLET_TITLE, { right: "⚙" });
  n2.bar.classList.add("is-yellow");

  const stats = el("div", "d-mt-wstats", p2);
  [["余额", "0"], ["银行卡", "5"], ["药划算", "9000元"], ["笔笔返", "2"]].forEach(([k, v]) => {
    const c = el("div", "d-mt-wstat", stats);
    el("span", "", c).textContent = k;
    el("b", "", c).textContent = v;
  });

  const wCard = el("div", "d-mt-wcard", p2);
  const wRow = el("div", "d-mt-wrow", wCard);
  [["美团月付", "486.20", "待还账单(元)"], ["美团借钱", "48,600", "剩余可借 (元)"]].forEach(([k, v, s]) => {
    const c = el("div", "d-mt-wcol", wRow);
    el("span", "", c).textContent = k;
    el("b", "", c).textContent = v;
    el("em", "", c).textContent = s;
  });
  const wtip = el("div", "d-mt-wtip", wCard);
  el("b", "", wtip).textContent = "待升级";
  el("span", "", wtip).textContent = "你的月付账户有 1 项服务待处理";
  el("em", "d-mt-wtipgo", wtip).textContent = "去处理 ›";

  const icons = el("div", "d-mt-wicons", p2);
  ["借钱", "美团月付", "美团保", "联名卡", "全部"].forEach((t) => {
    el("span", "", icons).textContent = t;
  });

  // 账单入口：点这一行去账单页
  const billCard = el("div", "d-mt-billcard", p2);
  const billHead = el("div", "d-mt-billhead", billCard);
  el("b", "", billHead).textContent = "账单";
  el("em", "", billHead).textContent = "本月已支出 3 笔";
  const billEntry = el("div", "d-mt-billentry", billCard);
  el("span", "", billEntry).textContent = "示例汉堡店（示例城店）";
  el("em", "", billEntry).textContent = "-16.80 ›";

  const loan = el("div", "d-mt-loan", p2);
  const loanTabs = el("div", "d-mt-loantabs", loan);
  ["借钱", "美团月付", "联名卡"].forEach((t, i) => {
    el("span", i === 0 ? "is-on" : "", loanTabs).textContent = t;
  });
  el("span", "d-mt-loanmore", loanTabs).textContent = "金融服务";
  el("div", "d-mt-loanhint", loan).textContent = "剩余可借";
  const loanRow = el("div", "d-mt-loanrow", loan);
  el("b", "", loanRow).textContent = "48,600.00";
  const loanBtn = el("span", "d-mt-loanbtn", loanRow);
  loanBtn.textContent = "立即借款";

  const duo = el("div", "d-mt-duo", p2);
  [["钱包笔笔返", "2 笔待领取"], ["天天领券", "共计 59 元"]].forEach(([k, v]) => {
    const c = el("div", "d-mt-duocard", duo);
    el("b", "", c).textContent = k;
    el("span", "", c).textContent = v;
  });

  /* ═══ 3 账单 ═══ */
  const p3 = pg(body);
  const n3 = nav(p3, "账单", { right: "🔍  ⋯" });
  el("div", "d-mt-acct", p3).textContent = `当前账号 ${PHONE}`;
  const moreBtn = n3.right;

  const filters = el("div", "d-mt-filters", p3);
  ["全部", "支出", "退款", "还款"].forEach((t, i) => {
    el("span", i === 0 ? "is-on" : "", filters).textContent = t;
  });
  el("em", "d-mt-filtermore", filters).textContent = "筛选 ▾";

  const novCard = el("div", "d-mt-monthcard", p3);
  const novHead = el("div", "d-mt-monthhead", novCard);
  el("b", "", novHead).textContent = "11月 ▾";
  el("em", "", novHead).textContent = "收支统计";
  el("div", "d-mt-monthsum", novCard).textContent = "支出 ¥268.40（4 笔）   收入 ¥0.00";
  BILL_NOV.forEach((r) => billRow(novCard, r));

  const octCard = el("div", "d-mt-monthcard", p3);
  const octHead = el("div", "d-mt-monthhead", octCard);
  el("b", "", octHead).textContent = "10月 ▾";
  el("em", "", octHead).textContent = "收支统计";
  el("div", "d-mt-monthsum", octCard).textContent = "支出 ¥712.30（8 笔）   收入 ¥184.00";
  BILL_OCT.forEach((r) => billRow(octCard, r));

  /* ═══ 4 ⋯ 菜单（浮在第 3 屏上）═══ */
  const menu = el("div", "d-mt-menu", p3);
  const menuItems = ["下载账单", "常见问题", "功能反馈"].map((t) => {
    const it = el("div", "d-mt-menuitem", menu);
    it.textContent = t;
    return it;
  });
  menu.style.opacity = "0";
  menu.style.visibility = "hidden";

  /* ═══ 5 下载账单流水 ═══ */
  const p5 = pg(body);
  nav(p5, "下载账单流水");
  const dCard = el("div", "d-mt-dcard", p5);
  const dIcon = el("div", "d-mt-dicon", dCard);
  dIcon.textContent = "⬇";
  el("div", "d-mt-dtext", dCard).textContent =
    "可下载最长 3 个月内对应时间段的账单流水文件（Excel 格式），仅限个人对账使用";
  const goDown = el("div", "d-mt-bigbtn", dCard);
  goDown.textContent = "去下载";
  const recordLink = el("div", "d-mt-link", dCard);
  recordLink.textContent = "申请记录";

  /* ═══ 6 选择交易流水范围 ═══ */
  const p6 = pg(body);
  nav(p6, "选择交易流水范围");
  const rCard = el("div", "d-mt-rcard", p6);

  el("div", "d-mt-label", rCard).textContent = "交易类型";
  const typeRow = el("div", "d-mt-pills", rCard);
  const typePills = ["全部交易", "支出", "收入"].map((t, i) => {
    const s = el("span", i === 0 ? "is-on" : "", typeRow);
    s.textContent = t;
    return s;
  });

  el("div", "d-mt-label", rCard).textContent = "时间范围";
  const rangeRow = el("div", "d-mt-pills", rCard);
  const rangePills = ["最近一周", "最近一个月", "自定义"].map((t, i) => {
    const s = el("span", i === 2 ? "is-on" : "", rangeRow);
    s.textContent = t;
    return s;
  });

  const dateRow = (label) => {
    const r = el("div", "d-mt-daterow", rCard);
    el("span", "d-mt-k", r).textContent = label;
    const v = el("span", "d-mt-v is-ph", r);
    v.textContent = "请选择";
    el("em", "d-mt-chev", r).textContent = "›";
    return { row: r, value: v };
  };
  const startRow = dateRow("起始日期");
  const endRow = dateRow("结束日期");
  el("div", "d-mt-rhint", rCard).textContent = "最长可以导出三个月的账单记录";

  const nextBtn = el("div", "d-mt-nextbtn is-disabled", p6);
  nextBtn.textContent = "下一步";

  /* ═══ 7 选择起始日期（弹层）═══ */
  const mask = el("div", "d-mt-mask", body);
  const sheet = el("div", "d-mt-sheet", body);
  const sHead = el("div", "d-mt-shead", sheet);
  el("b", "", sHead).textContent = "选择起始日期";
  const sClose = el("em", "d-mt-sclose", sHead);
  sClose.textContent = "×";

  const cols = el("div", "d-mt-cols", sheet);
  const mkCol = (values, sel) => {
    const col = el("div", "d-mt-col", cols);
    const inner = el("div", "d-mt-cinner", col);
    // 让选中项落进两条细线之间（每项 33px，首项从 44px 开始）
    inner.style.transform = `translateY(${-sel * 33}px)`;
    const items = values.map((v, i) => {
      const d = el("div", i === sel ? "d-mt-citem is-sel" : "d-mt-citem", inner);
      d.textContent = v;
      return d;
    });
    return { col, inner, items };
  };
  const YEARS = ["2024年", "2025年", "2026年"];
  const MONTHS = ["9月", "10月", "11月"];
  const DAYS = ["08日", "09日", "10日", "11日", "12日"];
  const cY = mkCol(YEARS, 2);
  const cM = mkCol(MONTHS, 2);
  const cD = mkCol(DAYS, 2);
  const sheetOk = el("div", "d-mt-bigbtn", sheet);
  sheetOk.textContent = "确定";

  mask.style.opacity = "0";
  mask.style.visibility = "hidden";
  sheet.style.transform = "translateY(100%)";

  /* ═══ 8 填写邮箱地址 ═══ */
  const p8 = pg(body);
  nav(p8, "填写邮箱地址");
  el("div", "d-mt-tipbar", p8).textContent =
    "温馨提示：申请下载的账单流水加密文件将发送到指定邮箱";

  const mailCard = el("div", "d-mt-mcard", p8);
  el("div", "d-mt-label", mailCard).textContent = "邮箱地址";
  const mailInput = el("div", "d-mt-minput", mailCard);
  const mailText = el("span", "", mailInput);
  const suggest = el("div", "d-mt-suggest", mailCard);
  const suggestItems = SUGGESTS.map((s) => {
    const it = el("div", "d-mt-sitem", suggest);
    it.textContent = s;
    return it;
  });
  suggest.style.display = "none";

  const kb = el("div", "d-mt-kb", p8);
  const kbBar = el("div", "d-mt-kbbar", kb);
  ["*", "/", "-", "+"].forEach((t) => el("span", "", kbBar).textContent = t);
  const kbGrid = el("div", "d-mt-kbgrid", kb);
  const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "@", "0", "⌫"];
  KEYS.forEach((k, i) => {
    const b = el("div", i === 11 ? "d-mt-key is-fn" : "d-mt-key", kbGrid);
    b.textContent = k;
  });

  const sendBtn = el("div", "d-mt-sendbtn is-disabled", p8);
  sendBtn.textContent = "发送";

  /* ═══ 9 确认邮箱地址（弹窗）═══ */
  const cfMask = el("div", "d-mt-mask", body);
  const cfCard = el("div", "d-mt-cfcard", body);
  el("div", "d-mt-cftitle", cfCard).textContent = "确认邮箱地址";
  el("div", "d-mt-cfbody", cfCard).textContent =
    `文件将发送至：${MAIL}，账单流水包含个人隐私信息，请确认邮箱是否正确`;
  const cfBtns = el("div", "d-mt-cfbtns", cfCard);
  const cfCancel = el("span", "d-mt-cfbtn", cfBtns);
  cfCancel.textContent = "取消";
  const cfOk = el("span", "d-mt-cfbtn is-primary", cfBtns);
  cfOk.textContent = "确认发送";
  cfMask.style.opacity = "0"; cfMask.style.visibility = "hidden";
  cfCard.style.opacity = "0"; cfCard.style.visibility = "hidden";

  /* ═══ 10 身份验证（加载态）═══ */
  const p9 = pg(body);
  nav(p9, "身份验证");
  const prog = el("div", "d-mt-progress", p9);
  const progBar = el("i", "", prog);
  progBar.style.width = "0%";

  /* ═══ 11 请输入支付密码 ═══ */
  const p10 = pg(body);
  nav(p10, "身份验证");
  el("div", "d-mt-pwtitle", p10).textContent = "请输入支付密码";
  const pwBoxes = el("div", "d-mt-pwboxes", p10);
  const pwDots = Array.from({ length: 6 }, () => {
    const b = el("div", "d-mt-pwbox", pwBoxes);
    const dot = el("i", "", b);
    dot.style.opacity = "0";
    return dot;
  });
  el("div", "d-mt-pwnote", p10).textContent = "账户安全保障";
  const pwPad = el("div", "d-mt-pwpad", p10);
  const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  const padKeys = PAD.map((k) => {
    const b = el("div", k === "" ? "d-mt-padkey is-blank" : (k === "⌫" ? "d-mt-padkey is-fn" : "d-mt-padkey"), pwPad);
    b.textContent = k;
    return b;
  });

  /* ═══ 12 申请结果 ═══ */
  const p11 = pg(body);
  nav(p11, "申请结果");
  const okMark = el("div", "d-mt-okmark", p11);
  okMark.textContent = "✓";
  el("div", "d-mt-oktitle", p11).textContent = "申请已提交";
  const okBody = el("div", "d-mt-okbody", p11);
  okBody.innerHTML = `请在邮箱 ${MAIL} 中接收导出的账单交易流水文件，文件解压密码请在 <b>申请记录</b> 中查看。如未收到邮件，可检查邮箱尝试刷新或更换邮箱重新申请导出。`;
  const okBtn = el("div", "d-mt-okbtn", p11);
  okBtn.textContent = "知道了";

  /* ═══ 13 申请记录 ═══ */
  const p12 = pg(body);
  nav(p12, "申请记录");
  const RECORDS = [
    ["2026-11-11 10:05:22", "发送成功", "2026-11-10 至 2026-11-10", "512804"],
    ["2026-11-06 21:15:08", "发送成功", "2026-11-05 至 2026-11-06", "338291"],
    ["2026-11-05 09:12:40", "发送成功", "2026-11-01 至 2026-11-05", "670145"],
  ];
  RECORDS.forEach(([time, status, range, pwd]) => {
    const card = el("div", "d-mt-reccard", p12);
    [["申请时间", time], ["申请状态", status], ["时间范围", range], ["申请邮箱", MAIL]].forEach(([k, v]) => {
      const r = el("div", "d-mt-recrow", card);
      el("span", "d-mt-reck", r).textContent = k;
      el("span", "d-mt-recval", r).textContent = v;
    });
    const r = el("div", "d-mt-recrow", card);
    el("span", "d-mt-reck", r).textContent = "解压密码";
    const v = el("span", "d-mt-recval", r);
    el("b", "", v).textContent = pwd;
    el("em", "d-mt-copy", v).textContent = "复制";
  });

  /* ══════════ 编排 ══════════ */
  strip.in(tl, 0.1);
  cur.show(tl, 0.3);
  // 首屏多停一会：观众要先认出这是「我的」页
  tl.to({}, { duration: 1.0 });

  // 1 → 2 点钱包
  const walletTap = walletBlock;
  cur.toAt(tl, walletTap, { duration: 0.5, at: ">" });
  cur.click(tl, walletTap, ">");
  go(tl, p1, p2, ">");

  // 2 → 3 点账单行
  cur.toAt(tl, billCard, { duration: 0.45, at: ">+0.6" });
  cur.click(tl, billCard, ">");
  go(tl, p2, p3, ">");

  // 3 → 4 点右上角 ⋯
  cur.toAt(tl, moreBtn, { duration: 0.4, at: ">+0.5" });
  cur.click(tl, moreBtn, ">");
  tl.set(menu, { visibility: "visible" }, ">")
    .fromTo(menu, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.22 }, "<");

  // 4 → 5 点下载账单
  cur.toAt(tl, menuItems[0], { duration: 0.35, at: ">+0.9" });
  cur.click(tl, menuItems[0], ">");
  tl.to(menu, { opacity: 0, duration: 0.16 }, ">").set(menu, { visibility: "hidden" }, ">");
  go(tl, p3, p5, ">");

  // 5 → 6 点去下载
  cur.toAt(tl, goDown, { duration: 0.42, at: ">+0.5" });
  cur.click(tl, goDown, ">");
  go(tl, p5, p6, ">");

  // 6 → 7 点起始日期
  cur.toAt(tl, startRow.row, { duration: 0.4, at: ">+0.4" });
  cur.click(tl, startRow.row, ">");
  tl.set([mask, sheet], { visibility: "visible" }, ">")
    .to(mask, { opacity: 1, duration: 0.2 }, "<")
    .to(sheet, { y: 0, duration: 0.3, ease: "power3.out" }, "<");

  // 7 滚到 2026 / 11 / 10
  cur.toAt(tl, cD.items[2], { duration: 0.3, at: ">+0.5" });
  tl.to({}, { duration: 0.4 });
  tl.call(() => {
    [cY.items[2], cM.items[2], cD.items[2]].forEach((x) => x.classList.add("is-sel"));
  }, null, ">");

  // 7 → 6 确定，回填日期
  cur.toAt(tl, sheetOk, { duration: 0.35, at: ">+0.5" });
  cur.click(tl, sheetOk, ">");
  tl.to(sheet, { y: "100%", duration: 0.28, ease: "power3.in" }, ">")
    .to(mask, { opacity: 0, duration: 0.22 }, "<")
    .set([mask, sheet], { visibility: "hidden" }, ">")
    .call(() => {
      startRow.value.textContent = "2026-11-10";
      startRow.value.classList.remove("is-ph");
      endRow.value.textContent = "2026-11-10";
      endRow.value.classList.remove("is-ph");
      nextBtn.classList.remove("is-disabled");
    }, null, ">+0.1");
  tl.to({}, { duration: 0.8 });

  // 6 → 8 点下一步
  cur.toAt(tl, nextBtn, { duration: 0.4, at: ">+0.3" });
  cur.click(tl, nextBtn, ">");
  go(tl, p6, p8, ">");

  // 8 逐字输入邮箱
  cur.toAt(tl, mailInput, { duration: 0.38, at: ">+0.4" });
  cur.click(tl, mailInput, ">");
  typeText(tl, mailText, "demo_user", { cps: 13, at: ">+0.15" });
  tl.to({}, { duration: 0.3 });
  tl.call(() => { suggest.style.display = ""; }, null, ">");
  tl.fromTo(suggest, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.24 }, "<");

  // 点第一条联想
  cur.toAt(tl, suggestItems[1], { duration: 0.35, at: ">+0.35" });
  cur.click(tl, suggestItems[1], ">");
  tl.call(() => {
    mailText.textContent = MAIL;
    suggest.style.display = "none";
    sendBtn.classList.remove("is-disabled");
  }, null, ">+0.1");
  tl.to({}, { duration: 0.9 });

  // 8 → 9 点发送，弹确认框（弹窗时键盘收起，与真机一致）
  cur.toAt(tl, sendBtn, { duration: 0.4, at: ">+0.3" });
  cur.click(tl, sendBtn, ">");
  tl.set([cfMask, cfCard], { visibility: "visible" }, ">")
    .to(kb, { opacity: 0, duration: 0.18 }, "<")
    .to(cfMask, { opacity: 1, duration: 0.2 }, "<")
    .fromTo(cfCard, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.22 }, "<");

  // 9 → 10 点确认发送 → 身份验证
  cur.toAt(tl, cfOk, { duration: 0.35, at: ">+1.0" });
  cur.click(tl, cfOk, ">");
  tl.to(cfMask, { opacity: 0, duration: 0.18 }, ">")
    .to(cfCard, { opacity: 0, scale: 0.96, duration: 0.18 }, "<")
    .set([cfMask, cfCard], { visibility: "hidden" }, ">");
  go(tl, p8, p9, ">");

  // 10 加载：进度条走完自动进下一屏
  tl.to(progBar, { width: "100%", duration: 1.5, ease: "none" }, ">+0.2");
  tl.to({}, { duration: 0.5 });

  // 10 → 11 支付密码
  go(tl, p9, p10, ">");

  // 11 逐位输入 6 位（只画圆点，不出现任何真实数字）
  const KEY_IDX = [0, 4, 8, 2, 5, 7];
  KEY_IDX.forEach((ki, i) => {
    cur.toAt(tl, padKeys[ki], { duration: 0.26, at: i === 0 ? ">+0.6" : ">+0.3" });
    cur.click(tl, padKeys[ki], ">");
    tl.to(pwDots[i], { opacity: 1, duration: 0.12 }, ">+0.05");
  });
  tl.to({}, { duration: 0.9 });

  // 11 → 12 申请结果
  go(tl, p10, p11, ">");

  // 12 → 13 点知道了 → 申请记录
  cur.toAt(tl, okBtn, { duration: 0.38, at: ">+1.2" });
  cur.click(tl, okBtn, ">");
  go(tl, p11, p12, ">");

  // 收尾：停在申请记录
  tl.to({}, { duration: 2.4 });
  cur.hide(tl, ">");
  strip.result(tl, "解压密码在申请记录里查", "<");

  return tl;
}

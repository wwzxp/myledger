/**
 * 场景：微信支付账单怎么导（逐帧对照 123 秒录屏还原）。
 *
 * 录屏：E:\ai\code\ai_ledger_videos\微信视频2026-11-08_163536_689.mp4（416×960，123.56s）
 *
 * 9 屏（时间点来自录屏）：
 *   0s   我           头像/昵称/微信号/+状态/等16个朋友/七个入口
 *   3s   钱包         零钱/经营账户/零钱通/银行卡/亲属卡/分付/支付分…（金额均为虚构）
 *   6s   账单         总额单▾/查找交易/收支统计、2026年11月、七条彩色图标交易
 *   9s   下载账单     当作证明材料（PDF）/ 用于个人对账（Excel）
 *  13s   下载账单流水 接收方式[邮箱]、邮箱[请输入]、账单时间三胶囊、交易类型
 *  20s   自定义时间   两列日期 + 三列滚轮（2024/2025/2026 · 9/10/11月 · 5/6/7/8日）
 *  30s   刷脸验证     绿圈笑脸 + 实名说明 + 协议（不同意/同意）
 *  42s   刷脸中       整屏玫红 + ✕ + 屏幕即将闪烁
 * 108s   微信支付聊天 示例影业 + 账单流水文件发送成功（金额与密码均虚构）
 *
 * 所有个人信息均为虚构。
 */
import { scenario, cursor, ok, flash } from "../kit.js";

const GREEN = "#07c160";

function el(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

/* ── 手机外壳 ───────────────────────────────────────────── */
function shell(root) {
  const wrap = el("div", "d-wx", root);

  // 不画系统状态栏（时间/信号/电池）——演示里不需要，去掉更干净

  // 导航栏
  const nav = el("div", "d-wx-nav", wrap);
  const navLeft = el("span", "d-wx-navleft", nav);
  const navTitle = el("span", "d-wx-navtitle", nav);
  const navRight = el("span", "d-wx-navright", nav);

  // 内容
  const body = el("div", "d-wx-body", wrap);

  // 底部 tab
  const tabs = el("div", "d-wx-tabs", wrap);
  const tabDefs = [
    ["微信", "", "1"], ["通讯录", "", ""], ["发现", "", ""], ["我", "is-on", ""],
  ];
  const tabEls = tabDefs.map(([name, on, badge]) => {
    const t = el("div", `d-wx-tab ${on}`.trim(), tabs);
    const ic = el("i", "d-wx-tabicon", t);
    ic.textContent = { "微信": "◔", "通讯录": "☰", "发现": "◎", "我": "◉" }[name];
    el("span", "", t).textContent = name;
    if (badge) el("i", "d-wx-tabbadge", t).textContent = badge;
    return t;
  });

  return { el: wrap, body, nav, navLeft, navTitle, navRight, tabs, tabEls };
}

/* ── 页面容器 ───────────────────────────────────────────── */
function mkPage(ph) {
  const p = el("div", "d-wx-page", ph.body);
  p.style.cssText =
    "position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;" +
    "scrollbar-width:none;padding-bottom:8px;box-sizing:border-box;display:none;";
  return p;
}

function go(tl, from, to, at = ">") {
  // 注意：at 可能是 ">+0.9" 这种字符串位置，不能对它做数学运算。
  // 旧实现在这里写 at + 0.18，拼出 ">0.18" 这种非法位置，
  // 结果是 from.style.display="none" 永不执行，页面越叠越多。
  tl.call(() => { to.style.display = "block"; }, null, at);
  tl.fromTo(to, { opacity: 0, x: 12 }, { opacity: 1, x: 0, duration: 0.26 }, at);
  tl.to(from, { opacity: 0, duration: 0.18 }, at);
  tl.call(() => {
    from.style.display = "none";
    from.style.opacity = 1;
  }, null, ">");
}

/* ── 列表积木 ───────────────────────────────────────────── */
function group(parent, { top = 8 } = {}) {
  const g = el("div", "d-wx-group", parent);
  g.style.marginTop = `${top}px`;
  return {
    el: g,
    row(label, { icon = "", iconColor = "", note = "", value = "", dot = false, chevron = true } = {}) {
      const r = el("div", "d-wx-row", g);
      if (icon) {
        const i = el("i", "d-wx-rowicon", r);
        i.textContent = icon;
        i.style.background = iconColor;
      }
      const mid = el("div", "d-wx-rowmid", r);
      el("b", "d-wx-rowname", mid).textContent = label;
      if (note) el("span", "d-wx-rownote", mid).textContent = note;
      if (value) el("em", "d-wx-rowval", r).textContent = value;
      if (dot) el("i", "d-wx-rowdot", r);
      if (chevron) el("span", "d-wx-chev", r).textContent = "›";
      return r;
    },
  };
}

export default function wechatExport({ root, tl }) {
  const strip = scenario(root, "微信支付账单怎么导", { local: true });
  const ph = shell(root);
  const cur = cursor(root);

  /* ═══ 页 1「我」（0s）═══ */
  ph.nav.style.display = "none";
  const p1 = mkPage(ph);
  p1.style.display = "block";

  const me = el("div", "d-wx-me", p1);
  const meTop = el("div", "d-wx-metop", me);
  el("div", "d-wx-avatar", meTop).textContent = "演";
  const meInfo = el("div", "d-wx-meinfo", meTop);
  el("b", "", meInfo).textContent = "演示用户";
  el("span", "", meInfo).textContent = "微信号：wxid_demo000";
  el("i", "d-wx-qr", meTop).textContent = "▦";

  const meChips = el("div", "d-wx-mechips", me);
  el("span", "d-wx-chip", meChips).textContent = "+ 状态";
  const friends = el("span", "d-wx-friends", meChips);
  el("i", "d-wx-fav", friends).textContent = "👥";
  el("span", "", friends).textContent = "等16个朋友";
  if (true) el("i", "d-wx-reddot", friends);

  const gA = group(p1, { top: 10 });
  const payRow = gA.row("服务", { icon: "￥", iconColor: GREEN });
  gA.row("收藏", { icon: "▣", iconColor: "#3d7ee8" });
  gA.row("朋友圈", { icon: "▧", iconColor: "#3d7ee8" });
  gA.row("作品", { icon: "▤", iconColor: "#4a90d9", note: "在这里看我的视频号", dot: true });
  gA.row("小店与卡包", {
    icon: "▥", iconColor: "#e8564a",
    note: "[热卖1万+]东鹏特饮 500ml功能饮料", dot: true,
  });
  const gB = group(p1, { top: 8 });
  gB.row("表情", { icon: "☺", iconColor: "#f0b429" });
  gB.row("设置", { icon: "⚙", iconColor: "#7a8699" });

  /* ═══ 页 2「钱包」（3s）═══ */
  const p2 = mkPage(ph);
  const gW = group(p2, { top: 0 });
  const wZero = gW.row("零钱", { icon: "◎", iconColor: "#f0b429", value: "¥88.88" });
  gW.row("经营账户", { icon: "▣", iconColor: "#f0b429" });
  gW.row("零钱通", { icon: "◇", iconColor: "#f0b429", note: "收益率0.85%", value: "¥0.00" });
  gW.row("银行卡", { icon: "▭", iconColor: "#4a90d9" });
  gW.row("亲属卡", { icon: "♡", iconColor: "#e8a33d" });
  const gW2 = group(p2, { top: 8 });
  gW2.row("分付", {
    icon: "◈", iconColor: "#07a35a",
    note: "买新品手机享24期免息", value: "可用¥1,000.00",
  });
  gW2.row("支付分", { icon: "✿", iconColor: "#3d7ee8" });
  gW2.row("支付设置", { icon: "⚙", iconColor: "#3d7ee8" });
  gW2.row("身份信息", { icon: "▤", iconColor: "#3d7ee8" });
  gW2.row("客服中心", { icon: "☎", iconColor: "#07c160" });

  /* ═══ 页 3「账单」（6s）═══ */
  const p3 = mkPage(ph);
  const tools = el("div", "d-wx-billtools", p3);
  el("span", "d-wx-billpill", tools).textContent = "全部账单 ▾";
  const findPill = el("span", "d-wx-billpill", tools);
  findPill.textContent = "🔍 查找交易";
  el("span", "d-wx-billstat", tools).textContent = "收支统计 ›";

  const monthRow = el("div", "d-wx-monthrow", p3);
  el("b", "", monthRow).textContent = "2026年11月 ▾";
  const io = el("span", "d-wx-monthio", monthRow);
  el("i", "is-out", io).textContent = "支出¥1,234.56";
  el("i", "is-in", io).textContent = "收入¥250.00";

  const list = el("div", "d-wx-billlist", p3);
  const billRow = (name, time, amount, color, glyph, income = false) => {
    const r = el("div", "d-wx-billrow", list);
    const ic = el("i", "d-wx-billicon", r);
    ic.style.background = color;
    ic.textContent = glyph;
    const mid = el("div", "d-wx-billmid", r);
    el("b", "", mid).textContent = name;
    el("span", "", mid).textContent = time;
    el("em", income ? "d-wx-billamt is-in" : "d-wx-billamt", r).textContent = amount;
    return r;
  };
  billRow("示例影业", "15:53", "-68.00", "#3d7ee8", "影");
  billRow("转账-来自示例好友", "15:46", "+50.00", "#f0b429", "⇄", true);
  billRow("转账-转给示例好友", "15:45", "-50.00", "#f0b429", "⇄");
  billRow("示例便利店", "15:29", "-12.50", "#07a35a", "便");
  billRow("示例地铁", "15:05", "-4.00", "#3d7ee8", "铁");
  billRow("样例餐厅(示例门店)", "12:53", "-76.00", "#e8564a", "餐");
  billRow("样例料理(示例商场店)", "12:50", "-128.00", "#e8564a", "餐");
  billRow("示例地铁", "12:44", "-4.00", "#3d7ee8", "铁");
  billRow("示例科技(示例市)有限…", "12:44", "-45.00", "#8a6fd8", "科");

  // ⋯ 菜单
  const menu = el("div", "d-wx-menu", ph.el);
  menu.style.cssText += ";opacity:0;visibility:hidden;";
  const dlItem = el("div", "d-wx-menuitem", menu);
  dlItem.textContent = "下载账单";
  ["账单分类管理", "删除账单"].forEach((t) => el("div", "d-wx-menuitem", menu).textContent = t);

  /* ═══ 页 4「下载账单」（9s）═══ */
  const p4 = mkPage(ph);
  el("h2", "d-wx-dlh", p4).textContent = "下载账单";
  el("p", "d-wx-dlnote", p4).textContent =
    "可根据账单用途下载当前微信支付实名的所有交易（包括已删除的交易）。";

  const choice1 = el("div", "d-wx-choice", p4);
  el("i", "d-wx-choiceico is-round", choice1).textContent = "✓";
  const c1body = el("div", "d-wx-choicebody", choice1);
  el("b", "", c1body).textContent = "用作证明材料";
  el("span", "", c1body).textContent =
    "交易明细证明（PDF格式），包含当前微信支付实名的所有交易并加盖公章";

  const choice2 = el("div", "d-wx-choice", p4);
  el("i", "d-wx-choiceico is-square", choice2).textContent = "✓";
  const c2body = el("div", "d-wx-choicebody", choice2);
  el("b", "", c2body).textContent = "用于个人对账";
  el("span", "", c2body).textContent =
    "账单流水文件（Excel格式），方便下载后按个人需求统计账单或对账";

  el("p", "d-wx-dlfoot", p4).textContent =
    "若你注销过微信支付，则无法查看注销前的账单。如需查看，可下载注销微信支付前的账单";

  /* ═══ 页 5「下载账单流水」（13s）═══ */
  const p5 = mkPage(ph);
  el("h2", "d-wx-dlh", p5).textContent = "下载账单流水";
  el("p", "d-wx-dlsub", p5).innerHTML =
    '最长可选择一年 <span class="d-wx-link">示例文件</span>';

  const f5 = el("div", "d-wx-form", p5);
  const formRow = (label, value, { arrow = true } = {}) => {
    const r = el("div", "d-wx-formrow", f5);
    el("span", "d-wx-formlabel", r).textContent = label;
    const v = el("span", "d-wx-formvalue", r);
    v.textContent = value;
    if (arrow) el("span", "d-wx-chev", r).textContent = "›";
    return { row: r, value: v };
  };
  formRow("接收方式", "邮箱");
  const emailRow = formRow("邮箱", "请输入邮箱地址");
  emailRow.value.classList.add("is-placeholder");
  emailRow.row.classList.add("is-email");
  const timeRow = formRow("账单时间", "", { arrow: false });
  timeRow.row.classList.add("is-pills");
  timeRow.value.style.display = "none";
  const pills = el("span", "d-wx-pills", timeRow.row);
  const pillEls = ["近一月", "近三月", "自定义时间"].map((t, i) => {
    const p = el("span", i === 0 ? "d-wx-pillbtn is-on" : "d-wx-pillbtn", pills);
    p.textContent = t;
    return p;
  });
  const rangeRow = formRow("", "2026年10月8日至11月8日", { arrow: false });
  rangeRow.row.classList.add("is-sub");
  formRow("交易类型", "全部账单");

  const nextBtn = el("button", "d-wx-next", p5);
  nextBtn.type = "button";
  nextBtn.textContent = "下一步";

  // 邮箱下拉建议（输入时出现在输入行正下方）
  // 挂在页容器上做绝对定位：挂在邮箱行里会被后续表单行盖住
  const suggest = el("div", "d-wx-suggest", p5);
  suggest.style.display = "none";
  const SUGGESTIONS = ["demo@qq.com", "demo@163.com", "demo@126.com", "demo@sohu.com", "demo@sina.com"];
  const suggestEls = SUGGESTIONS.map((s) => {
    const it = el("div", "d-wx-suggestitem", suggest);
    it.textContent = s;
    return it;
  });

  /* ═══ 页 6「自定义时间」（20s）═══ */
  const mask = el("div", "d-wx-mask", ph.el);
  const dp = el("div", "d-wx-datepick", ph.el);
  mask.style.cssText += ";opacity:0;visibility:hidden;";
  dp.style.cssText += ";opacity:0;visibility:hidden;";
  el("div", "d-wx-dptitle", dp).textContent = "自定义时间";
  const dpRow = el("div", "d-wx-dprow", dp);
  const dpStart = el("span", "d-wx-dpin is-on", dpRow);
  dpStart.textContent = "2026年11月7日";
  el("span", "d-wx-dpto", dpRow).textContent = "至";
  const dpEnd = el("span", "d-wx-dpin", dpRow);
  dpEnd.textContent = "轻触选择日期";

  // 滚轮：开始 / 结束各一套，切换时整列重绘
  const wheel = el("div", "d-wx-wheel", dp);
  const WHEELS = [["2024年", "2025年", "2026年"], ["9月", "10月", "11月"], ["5日", "6日", "7日", "8日"]];
  const ACTIVE = [2, 2, 2];   // 当前高亮的 [年, 月, 日] 索引
  const wheelCols = WHEELS.map((items, ci) => {
    const col = el("div", "d-wx-wheelcol", wheel);
    items.forEach((txt, i) => {
      el("span", i === ACTIVE[ci] ? "d-wx-wheelitem is-on" : "d-wx-wheelitem", col).textContent = txt;
    });
    return col;
  });

  /** 把某一列的高亮移到第 idx 项 */
  const setWheelActive = (colIdx, idx) => {
    ACTIVE[colIdx] = idx;
    [...wheelCols[colIdx].children].forEach((el2, i) => {
      el2.classList.toggle("is-on", i === idx);
    });
  };

  /** 切换「开始 / 结束」的选中态 */
  const setEndFocus = (onEnd) => {
    dpStart.classList.toggle("is-on", !onEnd);
    dpEnd.classList.toggle("is-on", onEnd);
  };
  const dpActs = el("div", "d-wx-dpacts", dp);
  el("button", "d-wx-dpcancel", dpActs).textContent = "取消";
  const dpOk = el("button", "d-wx-dpok", dpActs);
  dpOk.textContent = "确定";

  /* ═══ 页 7「刷脸验证」（30s）═══ */
  const p6 = mkPage(ph);
  const faceBox = el("div", "d-wx-face", p6);
  el("div", "d-wx-faceicon", faceBox).textContent = "🙂";
  el("h2", "d-wx-facetitle", faceBox).textContent = "刷脸验证";
  el("p", "d-wx-facenote", faceBox).textContent =
    "当前功能只有微信支付实名本人（**演）才能使用，请确保本人操作。";

  const agree = el("div", "d-wx-agree", p6);
  el("div", "d-wx-agreetext", agree).textContent = "使用刷脸服务需同意以下协议";
  el("div", "d-wx-agreelink", agree).textContent = "《微信支付刷脸核身服务协议》";
  const agreeActs = el("div", "d-wx-agreeacts", agree);
  el("button", "d-wx-disagree", agreeActs).textContent = "不同意";
  el("button", "d-wx-agreebtn", agreeActs).textContent = "同意";

  /* ═══ 页 8「刷脸中」（42s）═══ */
  const p7 = mkPage(ph);
  // 玫红整屏放进内层：外层页容器必须保持普通块级，
  // 否则 .is-facemask 的 display:flex 会盖掉 go() 设的 display:none，
  // 导致这一页永远压在后面所有页上面。
  const faceMask = el("div", "d-wx-facemask", p7);
  faceMask.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;padding-top:60px;box-sizing:border-box;";
  el("div", "d-wx-facehint", faceMask).textContent = "验证后将导出你在本微信号的账单";
  el("div", "d-wx-facehint2", faceMask).textContent = "屏幕即将闪烁，请保持姿势不动";
  el("div", "d-wx-facecam", faceMask).textContent = "☺";

  /* ═══ 页 9「微信支付聊天」（108s）═══ */
  const p8 = mkPage(ph);
  const chat = el("div", "d-wx-chat", p8);

  // 只保留「账单流水文件发送成功」——真实支付记录不入演示
  el("div", "d-wx-chattime", chat).textContent = "16:28";
  const card2 = el("div", "d-wx-successcard", chat);
  el("b", "d-wx-succtitle", card2).textContent = "账单流水文件发送成功";
  el("p", "d-wx-succnote", card2).textContent =
    "你申请的账单流水文件已发送，请在电脑上下载";

  const kv = el("div", "d-wx-kv", card2);
  [
    ["申请时间", "2026年11月8日 16:28:17"],
    ["申请内容", "微信支付账单流水文件(20261107-20261107)"],
    ["收件邮箱", "demo****@example.com"],
    ["解压密码", "••••••"],
    ["备注", "出于安全考虑，下载后请输入解压密码以获取账单流水文件"],
  ].forEach(([k, v]) => {
    const r = el("div", "d-wx-kvrow", kv);
    el("span", "d-wx-kvkey", r).textContent = k;
    el("span", "d-wx-kvval", r).textContent = v;
  });

  const reapply = el("div", "d-wx-reapply", card2);
  el("span", "", reapply).textContent = "重新申请";
  el("span", "d-wx-chev", reapply).textContent = "›";

  /* ═══ 编排 ═══ */
  const pages = [p1, p2, p3, p4, p5, p6, p7, p8];
  strip.in(tl, 0.1);
  tl.from(ph.el, { y: 16, opacity: 0, duration: 0.4 }, 0.15);
  cur.show(tl, 0.5);

  // 1 → 2 点「服务」
  cur.toAt(tl, payRow, { duration: 0.5, at: 1.2 });
  cur.click(tl, payRow, ">");
  go(tl, p1, p2, ">");
  tl.call(() => {
    ph.nav.style.display = "";
    ph.navLeft.textContent = "‹";
    ph.navTitle.textContent = "钱包";
    ph.navRight.textContent = "账单";
    ph.tabs.style.display = "none";
  }, null, "<");

  // 2 → 3 点「账单」
  cur.toAt(tl, ph.navRight, { duration: 0.4, at: ">+0.9" });
  cur.click(tl, ph.navRight, ">");
  go(tl, p2, p3, ">");
  tl.call(() => { ph.navTitle.textContent = "账单"; ph.navRight.textContent = "⊙"; }, null, "<");

  // 3 → ⋯ → 下载账单
  cur.toAt(tl, ph.navRight, { duration: 0.35, at: ">+0.9" });
  cur.click(tl, ph.navRight, ">");
  tl.set(menu, { visibility: "visible" }, ">")
    .fromTo(menu, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.2 }, "<");

  cur.toAt(tl, dlItem, { duration: 0.3, at: ">+0.4" });
  cur.click(tl, dlItem, ">");
  tl.to(menu, { opacity: 0, duration: 0.14 }, ">").set(menu, { visibility: "hidden" }, ">");

  go(tl, p3, p4, ">");
  tl.call(() => {
    ph.navLeft.textContent = "✕";
    ph.navTitle.textContent = "";
    ph.navRight.textContent = "下载记录";
  }, null, "<");

  // 4 → 5 选「用于个人对账」
  cur.toAt(tl, choice2, { duration: 0.5, at: ">+1.0" });
  cur.click(tl, choice2, ">");
  go(tl, p4, p5, ">");
  tl.call(() => { ph.navLeft.textContent = "✕"; ph.navTitle.textContent = ""; ph.navRight.textContent = ""; }, null, "<");

  // 5：点邮箱行 + 选「自定义时间」
  cur.toAt(tl, emailRow.row, { duration: 0.4, at: ">+0.9" });
  cur.click(tl, emailRow.row, ">");

  // 逐字输入 "demo"（每个字符 0.35 秒，共 1.4 秒）
  const typed = { n: 0 };
  tl.call(() => {
    emailRow.value.classList.remove("is-placeholder");
    emailRow.value.textContent = "";
  }, null, ">+0.2");
  tl.to(typed, {
    n: 4,
    duration: 1.4,
    ease: "none",
    onUpdate() {
      emailRow.value.textContent = "demo".slice(0, Math.round(typed.n));
    },
  }, "<");

  // 出现下拉建议 —— 停住让五条都读完
  tl.call(() => {
    suggest.style.display = "";
    suggest.style.opacity = "1";
  }, null, ">+0.2");
  tl.fromTo(suggest, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.28 }, "<");
  tl.to({}, { duration: 1.0 }, "<");

  // 选中第一条建议，键盘落下
  cur.toAt(tl, suggestEls[0], { duration: 0.5, at: ">+0.4" });
  cur.click(tl, suggestEls[0], ">");
  tl.call(() => {
    emailRow.value.textContent = SUGGESTIONS[0];
    suggest.style.display = "none";
  }, null, "<");

  cur.toAt(tl, pillEls[2], { duration: 0.35, at: ">+0.5" });
  cur.click(tl, pillEls[2], ">");
  tl.call(() => {
    pillEls.forEach((p, i) => p.classList.toggle("is-on", i === 2));
  }, null, ">");

  // 5 → 6 自定义时间面板
  tl.set([mask, dp], { visibility: "visible" }, ">+0.5")
    .fromTo(mask, { opacity: 0 }, { opacity: 1, duration: 0.2 }, "<")
    .fromTo(dp, { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3 }, "<");

  // 第一步：确认开始日期（默认停在 2026年11月7日）
  tl.to({}, { duration: 1.2 }, ">");
  cur.toAt(tl, dpStart, { duration: 0.35, at: ">+0.2" });
  cur.click(tl, dpStart, ">");
  tl.call(() => {
    dpStart.textContent = "2026年11月7日";
    setEndFocus(true);        // 焦点转到「结束日期」
  }, null, "<");

  // 第二步：点结束日期，滚轮选到 8 日
  cur.toAt(tl, dpEnd, { duration: 0.35, at: ">+0.9" });
  cur.click(tl, dpEnd, ">");
  tl.call(() => {
    dpEnd.textContent = "2026年11月8日";
    setWheelActive(0, 2);
    setWheelActive(1, 2);
    setWheelActive(2, 3);     // 5/6/7/8 → 选 8
  }, null, "<");
  tl.fromTo(dpEnd, { scale: 0.96 }, { scale: 1, duration: 0.25 }, "<");

  // 两端都有了，确定
  cur.toAt(tl, dpOk, { duration: 0.35, at: ">+1.2" });
  cur.click(tl, dpOk, ">");
  tl.to(mask, { opacity: 0, duration: 0.18 }, ">")
    .to(dp, { y: 40, opacity: 0, duration: 0.22 }, "<")
    .set([mask, dp], { visibility: "hidden" }, ">");
  tl.call(() => {
    rangeRow.value.textContent = "2026年11月7日至11月8日";
  }, null, "<");

  // 5 → 7 下一步 → 刷脸验证
  cur.toAt(tl, nextBtn, { duration: 0.35, at: ">+0.7" });
  cur.click(tl, nextBtn, ">");
  go(tl, p5, p6, ">");
  tl.call(() => { ph.navLeft.textContent = "‹"; ph.navTitle.textContent = ""; ph.navRight.textContent = ""; }, null, "<");

  // 7 → 8 同意 → 刷脸中
  const agreeBtn = agreeActs.querySelector(".d-wx-agreebtn");
  cur.toAt(tl, agreeBtn, { duration: 0.4, at: ">+0.9" });
  cur.click(tl, agreeBtn, ">");
  // 刷脸这两屏没有要点的东西，光标留着会停在画面外的空白处
  cur.hide(tl, ">+0.2");
  go(tl, p6, p7, ">");
  tl.call(() => { ph.navLeft.textContent = "✕"; ph.navTitle.textContent = ""; ph.navRight.textContent = ""; }, null, "<");

  // 8 → 9 验证完成 → 微信支付聊天
  tl.to([mask], { opacity: 0, duration: 0.2 }, ">+1.6");
  go(tl, p7, p8, ">");
  tl.call(() => {
    ph.navLeft.textContent = "‹";
    ph.navTitle.textContent = "微信支付";
    ph.navRight.textContent = "🔍 ⚙";
  }, null, "<");

  // 最后一屏要停住让人看清表格里的解压密码
  tl.to(card2, { y: -6, duration: 0.4 }, ">+0.5");
  flash(tl, card2, { color: "neon", at: "<" });

  ok(root, "文件已发送", { en: "CHECK MAIL" })(tl, ">+1.4");
  strip.result(tl, "解压密码在消息里", "<");
  // 收尾停 2.2 秒，观众才读得完申请时间/邮箱/解压密码
  tl.to({}, { duration: 2.2 }, "<");
  cur.hide(tl, "<");

  return tl;
}

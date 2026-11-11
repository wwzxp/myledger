/**
 * 场景：支付宝账单怎么导出。
 *
 * 对照录屏 45 秒，真实的界面与状态：
 *   1 我的              顶部耳机/设置 · 蓝色渐变 · 头像 · 卡包 · 五个功能卡 · 宫格
 *   2 账单              白底顶栏(搜索框/搜索/⋯) · 分类条 · 11月汇总 · 交易列表
 *   3 更多面板          半屏：账号 · 资金明细四胶囊 · 账单工具四图标 · 账单设置 · 帮助
 *   4 选择申请用途      两张图片卡片并排 · 申请按钮 · 申请记录
 *   5 指纹弹窗          × / 使用刷脸 · 指纹图标 · 正在校验指纹…
 *   6 选择交易流水范围   交易类型 · 时间范围 · 起止日期 · 两个开关 · 接收方式
 *   7 填写电子邮箱       输入框 · 发送按钮
 *   8 确认邮箱弹窗       确认邮箱地址 · 返回修改 / 确认发送
 *   9 申请已提交         蓝色对勾 · 收件邮箱/解压密码/安全提示 · 完成
 *  10 申请记录          顶部通知条 · 多张记录卡片
 *
 * 日期滚轮与接收方式选择都是第 6 屏内的过程，不单独成屏。
 *
 * 屏幕上所有姓名/金额/商户/邮箱/密码都是虚构的。
 */
import { scenario, cursor } from "../kit.js";
import {
  aliShell, aliHome, aliCard, aliBillPage, aliSheet, BLUE,
} from "../kit-alipay.js";

function el(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

function mkPage(shell) {
  const p = document.createElement("div");
  p.className = "d-ali-page";
  p.style.cssText =
    "position:absolute;inset:0;overflow-y:auto;scrollbar-width:none;display:none;";
  shell.body.appendChild(p);
  return p;
}

function go(tl, from, to, at = ">") {
  // 点完先在原页面停一下：观众要看清「点了哪儿」，再跳走。
  tl.to({}, { duration: 0.62 }, at)
    .to(from, { opacity: 0, duration: 0.2 }, ">")
    .call(() => { from.style.display = "none"; from.style.opacity = 1; }, null, ">")
    .call(() => { to.style.display = "block"; }, null, "<")
    .fromTo(to, { opacity: 0, x: 14 }, { opacity: 1, x: 0, duration: 0.26 }, "<")
    // 新页面再停一下，让人先扫一眼整体，再等光标动。
    .to({}, { duration: 0.55 }, ">");
}

/** 表单页大标题 */
function formHero(page, title, sub) {
  const hero = el("div", "d-ali-form-hero", page);
  el("div", "d-ali-form-title", hero).textContent = title;
  if (sub) el("div", "d-ali-form-sub", hero).textContent = sub;
  return hero;
}

function segRow(parent, labels, onIdx = 0) {
  const wrap = el("div", "d-ali-seg", parent);
  const items = labels.map((t, i) => {
    const it = el("div", i === onIdx ? "d-ali-seg-item is-on" : "d-ali-seg-item", wrap);
    it.textContent = t;
    return it;
  });
  return { wrap, items };
}

function formRow(parent, label, value, { placeholder = false, arrow = true } = {}) {
  const r = el("div", "d-ali-form-row", parent);
  el("span", "d-ali-form-label", r).textContent = label;
  const v = el("span", placeholder ? "d-ali-form-value is-ph" : "d-ali-form-value", r);
  v.textContent = value;
  if (arrow) el("span", "d-ali-form-arrow", r).textContent = "›";
  return { row: r, value: v };
}

function switchEl(parent) {
  const sw = el("div", "d-ali-switch", parent);
  el("i", "", sw);
  return sw;
}

function primaryBtn(page, text, bottom = 26) {
  const b = el("div", "d-ali-primary-btn", page);
  b.textContent = text;
  b.style.bottom = `${bottom}px`;
  return b;
}

export default function exportAlipay({ root, tl }) {
  const strip = scenario(root, "支付宝的流水要单独开具证明", { local: true });
  const ph = aliShell(root, { tab: "我的", time: "11:02" });
  const cur = cursor(root);

  /* ═══ 1 我的 ═══ */
  // aliHome 自己会建 .d-ali-page，不要再用 mkPage 套一层
  const home = aliHome(ph.body);
  const p1 = home.page;
  p1.style.display = "block";

  // 顶栏右侧：耳机 + 设置（真机在头像行上方）
  // 会员 + 商家服务
  const meCard = aliCard(p1, { gap: true });
  meCard.el.style.marginTop = "8px";
  const memberRow = meCard.item("支付宝会员", {
    color: BLUE, glyph: "V", arrow: true, value: "补签到，保全勤",
  });
  const badgeEl = el("span", "d-ali-gold-badge", memberRow.querySelector(".d-ali-row-main"));
  badgeEl.textContent = "黄金会员";
  meCard.item("商家服务", { color: BLUE, glyph: "▤", arrow: true });

  // 账单入口
  const billCard = aliCard(p1, { gap: true });
  const billRow = billCard.item("账单", { color: "#ff9f0a", glyph: "☰", arrow: true });

  // 资产
  const assetCard = aliCard(p1, { gap: true });
  assetCard.item("总资产", { color: BLUE, glyph: "◔", arrow: true });
  assetCard.item("余额", { color: BLUE, glyph: "¥", arrow: true });
  assetCard.item("余额宝", { color: "#ff9f0a", glyph: "◕", arrow: true });
  assetCard.item("花呗", { color: BLUE, glyph: "◗", arrow: true, value: "花呗社区更新了" });

  // 宫格
  const gridCard = aliCard(p1, { gap: true });
  const grid = el("div", "d-ali-me-grid", gridCard.el);
  const CELLS = [
    ["◇", "#2f9cf4", "蚂蚁保"],
    ["◑", BLUE, "借呗｜信用贷"],
    ["◈", "#2f7df6", "芝麻信用"],
    ["▤", "#ff8f1f", "银行卡"],
    ["◍", "#3b82f6", "余利宝"],
    ["▲", "#00b578", "网商贷"],
    ["M", BLUE, "网商银行"],
    ["❖", "#f5222d", "数字人民币"],
    ["▥", "#ff8f1f", "我的信用卡"],
  ];
  CELLS.forEach(([glyph, color, label]) => {
    const c = el("div", "d-ali-me-cell", grid);
    const ic = el("i", "", c);
    ic.style.background = color;
    ic.textContent = glyph;
    el("span", "", c).textContent = label;
  });

  // 民生保障
  const mzCard = aliCard(p1, { gap: true });
  el("div", "d-ali-card-title", mzCard.el).textContent = "我的民生保障";

  /* ═══ 2 账单 ═══ */
  const p2 = mkPage(ph);
  const bill = aliBillPage(p2);

  /* ═══ 3 更多面板（半屏，从底部升起）═══ */
  const moreMask = el("div", "d-ali-mask", ph.el);
  const morePanel = el("div", "d-ali-more", ph.el);
  (function buildMore() {
    // 账号区
    const acct = el("div", "d-ali-more-acct", morePanel);
    el("div", "d-ali-more-avatar", acct).textContent = "演";
    const acctMain = el("div", "d-ali-more-acctmain", acct);
    el("b", "", acctMain).textContent = "演示用户";
    el("span", "", acctMain).textContent = "demo****@example.com";
    el("span", "d-ali-more-acctarrow", acct).textContent = "›";

    // 资金明细：四个胶囊
    el("div", "d-ali-more-label", morePanel).textContent = "资金明细";
    const caps = el("div", "d-ali-more-caps", morePanel);
    [["账单", BLUE, "▤"], ["余额", "#7b8fa6", "¥"],
     ["理财", "#ff9f0a", "◈"], ["花呗", BLUE, "◑"]].forEach(([label, color, glyph]) => {
      const c = el("div", "d-ali-more-cap", caps);
      const ic = el("i", "", c);
      ic.style.background = color;
      ic.textContent = glyph;
      el("span", "", c).textContent = label;
    });

    // 账单工具：四个图标 + 两行说明
    el("div", "d-ali-more-label", morePanel).textContent = "账单工具";
    const grid = el("div", "d-ali-more-grid", morePanel);
    const TOOLS = [
      ["▤", "开具交易", "流水证明"],
      ["◈", "账单", "分类管理"],
      ["⌗", "账单", "导入"],
      ["✉", "电子", "回单"],
    ];
    TOOLS.forEach(([glyph, l1, l2], i) => {
      const t = el("div", "d-ali-more-tool", grid);
      const ic = el("i", "", t);
      ic.style.background = i === 0 ? BLUE : "#eef3f9";
      ic.style.color = i === 0 ? "#fff" : BLUE;
      ic.textContent = glyph;
      const lbl = el("div", "d-ali-more-tooltxt", t);
      el("span", "", lbl).textContent = l1;
      el("span", "", lbl).textContent = l2;
    });

    // 账单设置 / 帮助与客服
    const rows = el("div", "d-ali-more-rows", morePanel);
    [["账单设置", "#7b8fa6", "⚙"], ["帮助与客服", "#7b8fa6", "?"]].forEach(([label, color, glyph]) => {
      const r = el("div", "d-ali-more-row", rows);
      const ic = el("i", "", r);
      ic.style.background = color;
      ic.textContent = glyph;
      el("span", "d-ali-more-rowlabel", r).textContent = label;
      el("span", "d-ali-more-rowarrow", r).textContent = "›";
    });
  })();
  const moreTop = morePanel.querySelector(".d-ali-more-tool"); // 「开具交易流水证明」

  moreMask.style.opacity = "0";
  moreMask.style.visibility = "hidden";
  morePanel.style.transform = "translateY(100%)";

  /* ═══ 4 选择申请用途 ═══ */
  const p4 = mkPage(ph);
  formHero(p4, "选择申请用途",
    "可根据交易流水证明用途下载当前支付宝实名的所有交易（包括已删除的交易）");

  const cardsWrap = el("div", "d-ali-purpose-cards", p4);
  // 左：个人对账（选中）
  const cardA = el("div", "d-ali-purpose-card is-on", cardsWrap);
  const boxA = el("div", "d-ali-purpose-box", cardA);
  el("div", "d-ali-purpose-excel", boxA).textContent = "Excel";
  el("div", "d-ali-purpose-lines", boxA).innerHTML =
    "<i></i><i></i><i></i><i></i><i></i>";
  el("div", "d-ali-purpose-check", cardA).textContent = "✓";
  el("div", "d-ali-purpose-label", cardA).textContent = "用于个人对账";

  // 右：材料证明
  const cardB = el("div", "d-ali-purpose-card", cardsWrap);
  const boxB = el("div", "d-ali-purpose-box is-doc", cardB);
  el("div", "d-ali-purpose-stamp", boxB).textContent = "章";
  el("div", "d-ali-purpose-label", cardB).innerHTML =
    "用于签证、银行贷款、诉讼等事务的材料证明";

  const applyBtn = primaryBtn(p4, "申请", 74);
  const recordLink = el("div", "d-ali-purpose-record", p4);
  recordLink.textContent = "申请记录";

  /* ═══ 5 指纹弹窗 ═══ */
  const fpMask = el("div", "d-ali-confirm-mask", ph.el);
  const fpBox = el("div", "d-ali-fp", ph.el);
  const fpTop = el("div", "d-ali-fp-top", fpBox);
  el("span", "d-ali-fp-x", fpTop).textContent = "×";
  el("span", "d-ali-fp-face", fpTop).textContent = "使用刷脸";
  const fpIcon = el("div", "d-ali-fp-icon", fpBox);
  fpIcon.innerHTML =
    '<svg viewBox="0 0 64 64" width="52" height="52">' +
    '<g fill="none" stroke="#1677ff" stroke-width="2" stroke-linecap="round">' +
    '<path d="M32 10c-8 0-15 4-19 10"/>' +
    '<path d="M32 18c-6 0-11 3-14 7"/>' +
    '<path d="M18 32c0-7 6-13 14-13"/>' +
    '<path d="M32 26c-4 0-7 3-7 7v6c0 4-1 7-3 10"/>' +
    '<path d="M39 33v9c0 3-1 6-2 8"/>' +
    '<path d="M25 44c0 3-1 5-2 7"/>' +
    '<path d="M46 30c1 6 1 12-1 17"/>' +
    '<path d="M32 33v10c0 4-1 7-2 10"/>' +
    "</g></svg>";
  el("div", "d-ali-fp-txt", fpBox).textContent = "正在校验指纹…";
  fpMask.style.opacity = "0";
  fpMask.style.visibility = "hidden";
  fpBox.style.opacity = "0";
  fpBox.style.visibility = "hidden";

  /* ═══ 6 选择交易流水范围 ═══ */
  const p6 = mkPage(ph);
  formHero(p6, "选择交易流水范围", "时间最长可选择一年（包括已删除的交易）");

  const c6a = aliCard(p6, { gap: false });
  el("div", "d-ali-card-title", c6a.el).textContent = "交易类型";
  const segType = segRow(c6a.el, ["全部交易", "收入", "支出"], 0);
  el("div", "d-ali-card-title", c6a.el).textContent = "时间范围";
  const segRange = segRow(c6a.el, ["最近一个月", "最近三个月", "自定义"], 0);
  const rStart = formRow(c6a.el, "开始日期", "请选择", { placeholder: true });
  const rEnd = formRow(c6a.el, "结束日期", "请选择", { placeholder: true });
  el("div", "d-ali-form-hint", c6a.el).textContent = "时间最长可选择一年";

  const c6b = aliCard(p6, { gap: false });
  const sw1Line = el("div", "d-ali-form-row", c6b.el);
  el("span", "d-ali-form-label", sw1Line).textContent = "展示交易对手信息";
  switchEl(sw1Line);
  const sw2Line = el("div", "d-ali-form-row", c6b.el);
  const sw2Main = el("div", "", sw2Line);
  el("span", "d-ali-form-label", sw2Main).textContent = "展示商品说明信息";
  el("span", "d-ali-form-sublabel", sw2Main).textContent =
    "取消展示后，对应字段信息将不在流水证明透出";
  switchEl(sw2Line);

  const c6c = aliCard(p6, { gap: false });
  const recvRow = formRow(c6c.el, "接收方式", "请选择", { placeholder: true });

  const btn6 = primaryBtn(p6, "下一步");
  // 真机：开始/结束日期没选完时按钮是灰的
  btn6.classList.add("is-disabled");

  /* 日期弹层（第 6 屏内的过程） */
  const dateSheet = aliSheet(ph.el, { title: "" });
  // 真机的弹层顶栏是「取消 / 选择时间 / 确定」三段，必须在最顶部。
  // aliSheet 默认把 body 放在 sheet 里，所以这里直接插到 sheet 的最前面。
  const dateBar = el("div", "d-ali-datebar");
  dateSheet.el.insertBefore(dateBar, dateSheet.el.firstChild);
  const dateCancel = el("span", "d-ali-datebar-cancel", dateBar);
  dateCancel.textContent = "取消";
  el("span", "d-ali-datebar-title", dateBar).textContent = "选择时间";
  const dateOk = el("span", "d-ali-datebar-ok", dateBar);
  dateOk.textContent = "确定";
  const dateCols = el("div", "d-ali-datecols", dateSheet.body);
  const mkCol = (values, sel) => {
    const col = el("div", "d-ali-datecol", dateCols);
    const inner = el("div", "d-ali-datecol-inner", col);
    const items = values.map((v, i) => {
      const d = el("div", i === sel ? "d-ali-dateitem is-sel" : "d-ali-dateitem", inner);
      d.textContent = v;
      return d;
    });
    return { col, inner, items };
  };
  const YEARS = Array.from({ length: 13 }, (_, i) => String(2014 + i));
  const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  const DAYS = Array.from({ length: 30 }, (_, i) => String(i + 1).padStart(2, "0"));
  const cY = mkCol(YEARS, 0);
  const cM = mkCol(MONTHS, 0);
  const cD = mkCol(DAYS, 0);

  /* 接收方式弹层（第 6 屏内的过程） */
  const recvSheet = aliSheet(ph.el, { title: "请选择接收方式" });
  const optMail = recvSheet.option("邮箱", {
    primary: true, note: "文件将发送到邮箱，请确保已登录后下载",
  });
  recvSheet.option("微信", { note: "文件将通过「支付宝」消息发送" });

  /* ═══ 7 填写电子邮箱 ═══ */
  const p7 = mkPage(ph);
  formHero(p7, "填写电子邮箱",
    "请填写您的电子邮箱，我们会给您的邮箱发送加密压缩文件");
  const inputWrap = el("div", "d-ali-input", p7);
  const inputTxt = el("span", "d-ali-input-txt", inputWrap);
  const inputClear = el("span", "d-ali-input-clear", inputWrap);
  inputClear.textContent = "×";
  const btn7 = primaryBtn(p7, "发送", 26);

  /* ═══ 8 确认邮箱弹窗 ═══ */
  const cfMask = el("div", "d-ali-confirm-mask", ph.el);
  const cfBox = el("div", "d-ali-confirm", ph.el);
  el("div", "d-ali-confirm-title", cfBox).textContent = "确认邮箱地址";
  const cfSub = el("div", "d-ali-confirm-sub", cfBox);
  cfSub.textContent =
    "文件即将发送至 demo.user@qq.com，交易流水包含个人信息，为保护您的隐私，请确认邮箱是否正确";
  const cfBtns = el("div", "d-ali-confirm-btns", cfBox);
  const cfBack = el("div", "d-ali-confirm-btn", cfBtns);
  cfBack.textContent = "返回修改";
  const cfOk = el("div", "d-ali-confirm-btn is-primary", cfBtns);
  cfOk.textContent = "确认发送";
  cfMask.style.opacity = "0";
  cfMask.style.visibility = "hidden";
  cfBox.style.opacity = "0";
  cfBox.style.visibility = "hidden";

  /* ═══ 9 申请已提交 ═══ */
  const p9 = mkPage(ph);
  const doneBox = el("div", "d-ali-done", p9);
  const doneMark = el("div", "d-ali-done-mark", doneBox);
  doneMark.innerHTML =
    '<svg viewBox="0 0 24 24" width="30" height="30">' +
    '<path d="M4 12.5l5.2 5.2L20 7" fill="none" stroke="#fff" ' +
    'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  el("div", "d-ali-done-title", doneBox).textContent = "邮件发送申请已提交";
  el("div", "d-ali-done-note", doneBox).textContent =
    "账单文件将在24小时内发送至邮箱，打开时需要解压密码，请及时关注";

  const info = el("div", "d-ali-done-info", p9);
  const mkInfo = (k, v, link) => {
    const r = el("div", "d-ali-done-inforow", info);
    el("span", "d-ali-done-infok", r).textContent = k;
    const vEl = el("span", "d-ali-done-infov", r);
    if (link) {
      vEl.innerHTML = `${v}<span class="d-ali-done-link">申请记录</span>中查看`;
    } else {
      vEl.textContent = v;
    }
  };
  mkInfo("收件邮箱", "demo.user@qq.com");
  mkInfo("解压密码", "通过「支付宝服务通知」下发，或在", true);
  mkInfo("安全提示", "请在7日内输入解压码");
  const doneBtn = primaryBtn(p9, "完成", 26);
  el("div", "d-ali-done-homebar", p9);

  /* ═══ 10 申请记录 ═══ */
  const p10 = mkPage(ph);
  p10.style.background = "#f5f5f5";
  // 顶部通知条
  const notice = el("div", "d-ali-record-notice", p10);
  const ni = el("i", "d-ali-record-noticeico", notice);
  ni.textContent = "支";
  const nm = el("div", "d-ali-record-noticemain", notice);
  el("b", "", nm).textContent = "交易流水文件发送成功通知";
  el("span", "", nm).textContent = "交易流水文件已发送至您邮箱，请注意查收";
  el("em", "d-ali-record-noticetime", notice).textContent = "刚刚 ▾";

  const RECORDS = [
    { time: "2026-11-10 11:02:32", range: "2026-11-09 至 2026-11-09", pwd: "123456" },
    { time: "2026-11-10 09:36:46", range: "2026-11-09 至 2026-11-09", pwd: "234567" },
    { time: "2026-11-08 23:58:12", range: "2026-11-07 至 2026-11-08", pwd: "345678" },
  ];
  RECORDS.forEach((r) => {
    const card = el("div", "d-ali-record-card", p10);
    const kv = (k, v, cls = "") => {
      const line = el("div", "d-ali-record-row", card);
      el("span", "d-ali-record-k", line).textContent = k;
      el("span", cls ? `d-ali-record-v ${cls}` : "d-ali-record-v", line).textContent = v;
    };
    kv("申请时间", r.time);
    kv("交易对象", "-");
    kv("日期区间", r.range);
    kv("申请邮箱", "demo.user@qq.com");
    kv("解压密码", r.pwd);
    kv("状态", "已发送", "is-ok");
  });

  /* ═══════════════════ 编排 ═══════════════════ */
  strip.in(tl, 0.1);
  ph.immersive(true);
  // 「我的」页是沉浸式的：导航栏本身不显示，蓝色头区铺到屏幕顶部
  ph.hideNav();
  ph.in(tl, 0.15);
  cur.show(tl, 0.35);

  /* 1 → 2 点账单 */
  cur.toAt(tl, billRow, { duration: 0.5, at: 2.0 });
  cur.click(tl, billRow, ">");
  go(tl, p1, p2, ">");
  tl.call(() => {
    ph.immersive(false);
    ph.hideNav();   // 账单页自带顶栏，不要多一条
  }, null, "<");

  /* 2 → 3 点 ⋯ 出更多面板 */
  cur.toAt(tl, bill.more, { duration: 0.3, at: ">+0.7" });
  cur.click(tl, bill.more, ">");
  tl.set([moreMask, morePanel], { visibility: "visible" }, ">");
  tl.to(moreMask, { opacity: 1, duration: 0.2 }, "<");
  tl.to(morePanel, { y: 0, duration: 0.32, ease: "power3.out" }, "<");

  /* 3 → 4 点「开具交易流水证明」 */
  cur.toAt(tl, moreTop, { duration: 0.3, at: ">+0.55" });
  cur.click(tl, moreTop, ">");
  tl.to(morePanel, { y: "100%", duration: 0.28, ease: "power3.in" }, ">");
  tl.to(moreMask, { opacity: 0, duration: 0.24 }, "<");
  tl.set([moreMask, morePanel], { visibility: "hidden" }, ">");
  go(tl, p2, p4, ">");
  tl.call(() => {
    ph.showNav();
    ph.setLeft("‹");
    ph.setTitle("");
    ph.setRight("我的客服");
  }, null, "<");

  /* 4 → 5 点「申请」→ 指纹 */
  cur.toAt(tl, applyBtn, { duration: 0.35, at: ">+0.7" });
  cur.click(tl, applyBtn, ">");
  tl.set([fpMask, fpBox], { visibility: "visible" }, ">+0.15");
  tl.to(fpMask, { opacity: 1, duration: 0.18 }, "<");
  tl.fromTo(fpBox, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.24 }, "<");
  tl.to({}, { duration: 1.3 });   // 指纹校验的停顿
  tl.to(fpMask, { opacity: 0, duration: 0.2 }, ">");
  tl.to(fpBox, { opacity: 0, scale: 0.95, duration: 0.2 }, "<");
  tl.set([fpMask, fpBox], { visibility: "hidden" }, ">");

  /* 5 → 6 进入流水范围 */
  go(tl, p4, p6, ">");
  tl.call(() => {
    ph.setTitle("");
    ph.setLeft("‹");
  }, null, "<");

  /* 6：切「自定义」→ 日期弹层 */
  cur.toAt(tl, segRange.items[2], { duration: 0.38, at: ">+0.5" });
  cur.click(tl, segRange.items[2], ">");
  tl.call(() => {
    segRange.items[0].classList.remove("is-on");
    segRange.items[2].classList.add("is-on");
  }, null, ">");
  dateSheet.in(tl, ">+0.2");

  /* 第一次：选「开始日期」→ 2026-11-09 */
  const rollTo = (targetY, targetM, targetD, at) => {
    tl.to(cY.inner, { y: -targetY * 36, duration: 0.42, ease: "power2.out" }, at);
    tl.to(cM.inner, { y: -targetM * 36, duration: 0.42, ease: "power2.out" }, "<");
    tl.to(cD.inner, { y: -targetD * 36, duration: 0.42, ease: "power2.out" }, "<");
  };
  const markSel = (iY, iM, iD) => {
    tl.call(() => {
      cY.items.forEach((x, i) => x.classList.toggle("is-sel", i === iY));
      cM.items.forEach((x, i) => x.classList.toggle("is-sel", i === iM));
      cD.items.forEach((x, i) => x.classList.toggle("is-sel", i === iD));
    });
  };

  // 开始日期：先滚年，再滚月，再滚日，逐段给观众看清
  cur.toAt(tl, cY.items[12], { duration: 0.34, at: ">+0.25" });
  tl.to(cY.inner, { y: -(12 * 36), duration: 0.42, ease: "power2.out" }, ">");
  markSel(12, 0, 0);
  cur.toAt(tl, cM.items[10], { duration: 0.3, at: ">" });
  tl.to(cM.inner, { y: -(10 * 36), duration: 0.36, ease: "power2.out" }, ">");
  markSel(12, 10, 0);
  cur.toAt(tl, cD.items[8], { duration: 0.28, at: ">" });
  tl.to(cD.inner, { y: -(8 * 36), duration: 0.34, ease: "power2.out" }, ">");
  markSel(12, 10, 8);

  cur.toAt(tl, dateOk, { duration: 0.3, at: ">+0.2" });
  cur.click(tl, dateOk, ">");
  dateSheet.out(tl, ">");
  tl.call(() => {
    rStart.value.textContent = "2026-11-09";
    rStart.value.classList.remove("is-ph");
  }, null, ">+0.2");

  /* 第二次：选「结束日期」→ 2026-11-09（真机是分两次选的） */
  cur.toAt(tl, rEnd.row, { duration: 0.38, at: ">+0.5" });
  cur.click(tl, rEnd.row, ">");
  dateSheet.in(tl, ">+0.2");
  // 弹层重置到顶部，重新滚一次同样的日期
  tl.call(() => {
    cY.inner.style.transform = "translateY(0)";
    cM.inner.style.transform = "translateY(0)";
    cD.inner.style.transform = "translateY(0)";
    cY.items.forEach((x) => x.classList.remove("is-sel"));
    cM.items.forEach((x) => x.classList.remove("is-sel"));
    cD.items.forEach((x) => x.classList.remove("is-sel"));
  }, null, ">+0.15");

  cur.toAt(tl, cY.items[12], { duration: 0.26, at: ">+0.2" });
  tl.to(cY.inner, { y: -(12 * 36), duration: 0.36, ease: "power2.out" }, ">");
  cur.toAt(tl, cM.items[10], { duration: 0.24, at: ">" });
  tl.to(cM.inner, { y: -(10 * 36), duration: 0.3, ease: "power2.out" }, ">");
  cur.toAt(tl, cD.items[8], { duration: 0.22, at: ">" });
  tl.to(cD.inner, { y: -(8 * 36), duration: 0.28, ease: "power2.out" }, ">");
  markSel(12, 10, 8);

  cur.toAt(tl, dateOk, { duration: 0.26, at: ">+0.15" });
  cur.click(tl, dateOk, ">");
  dateSheet.out(tl, ">");
  tl.call(() => {
    rEnd.value.textContent = "2026-11-09";
    rEnd.value.classList.remove("is-ph");
    btn6.classList.remove("is-disabled");   // 两个日期都选完才可点
  }, null, ">+0.2");

  /* 接收方式弹层 */
  cur.toAt(tl, recvRow.row, { duration: 0.38, at: ">+0.45" });
  cur.click(tl, recvRow.row, ">");
  recvSheet.in(tl, ">+0.15");
  cur.toAt(tl, optMail, { duration: 0.3, at: ">+0.35" });
  cur.click(tl, optMail, ">");
  recvSheet.out(tl, ">");
  tl.call(() => {
    recvRow.value.textContent = "邮箱";
    recvRow.value.classList.remove("is-ph");
  }, null, ">+0.15");

  /* 6 → 7 点下一步 */
  cur.toAt(tl, btn6, { duration: 0.4, at: ">+0.4" });
  cur.click(tl, btn6, ">");
  tl.to(btn6, { backgroundColor: "#0b5fd9", duration: 0.12 }, ">");
  tl.to(btn6, { backgroundColor: BLUE, duration: 0.2 }, ">");
  go(tl, p6, p7, ">+0.08");

  /* 7：输入邮箱 */
  cur.toAt(tl, inputWrap, { duration: 0.34, at: ">+0.4" });
  cur.click(tl, inputWrap, ">");
  const PREFIX = "demo.user@qq.com";
  tl.call(() => { inputTxt.textContent = ""; }, null, ">+0.18");
  const st = { n: 0 };
  tl.to(st, {
    n: PREFIX.length,
    duration: PREFIX.length / 11,
    ease: "none",
    onUpdate() { inputTxt.textContent = PREFIX.slice(0, Math.round(st.n)); },
  }, ">");

  /* 7 → 8 点发送 → 确认弹窗 */
  cur.toAt(tl, btn7, { duration: 0.36, at: ">+0.4" });
  cur.click(tl, btn7, ">");
  tl.set([cfMask, cfBox], { visibility: "visible" }, ">+0.12");
  tl.to(cfMask, { opacity: 1, duration: 0.18 }, "<");
  tl.fromTo(cfBox, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.22 }, "<");

  /* 8 → 9 点「确认发送」 */
  cur.toAt(tl, cfOk, { duration: 0.32, at: ">+0.5" });
  cur.click(tl, cfOk, ">");
  tl.to(cfMask, { opacity: 0, duration: 0.18 }, ">");
  tl.to(cfBox, { opacity: 0, scale: 0.95, duration: 0.18 }, "<");
  tl.set([cfMask, cfBox], { visibility: "hidden" }, ">");
  go(tl, p7, p9, ">+0.05");

  /* 9 → 10 点「完成」→ 申请记录 */
  cur.toAt(tl, doneBtn, { duration: 0.38, at: ">+1.0" });
  cur.click(tl, doneBtn, ">");
  go(tl, p9, p10, ">");
  tl.call(() => {
    ph.setLeft("‹");
    ph.setTitle("");
    ph.setRight("");
  }, null, "<");

  /* 收尾：申请记录要留够阅读时间（三条记录要看清楚） */
  tl.to({}, { duration: 4.5 });
  cur.hide(tl, ">");
  strip.result(tl, "编码会自动识别", "<");

  return tl;
}

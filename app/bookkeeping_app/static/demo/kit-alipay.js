/**
 * 真实支付宝风格积木（对照真机还原）。
 *
 * 不复制官方图标：功能图标一律用色块 + 符号，头像用色块 + 单字。
 * 支付宝与微信的关键差异：
 *  - 主色 #1677FF（蓝），不是微信的绿
 *  - 首页顶栏是蓝色沉浸式，状态栏压在蓝底上（白字）
 *  - 底部 tab 五个：支付宝 / 理财 / 生活 / 消息 / 我的
 *  - 页面圆角卡片化，卡片之间是浅灰底 #f5f5f5
 */

export const BLUE = "#1677ff";
export const PAGE_BG = "#f5f5f5";
export const LINE = "#eeeeee";
export const SUB = "#999999";

function h(tag, cls, parent) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (parent) parent.appendChild(el);
  return el;
}

/* ── 手机外壳 ───────────────────────────────────────────── */
export function aliShell(root, { tab = "我的", time = "9:41" } = {}) {
  const wrap = h("div", "d-ali", root);

  // 不画系统状态栏

  // 导航栏
  const nav = h("div", "d-ali-nav", wrap);
  const navLeft = h("span", "d-ali-nav-left", nav);
  const navTitle = h("span", "d-ali-nav-title", nav);
  const navRight = h("span", "d-ali-nav-right", nav);

  const body = h("div", "d-ali-body", wrap);

  // 底部 tab（五个）
  const tabs = h("div", "d-ali-tabs", wrap);
  const TAB_DEFS = ["支付宝", "理财", "生活", "消息", "我的"];
  const TAB_GLYPH = {
    "支付宝": "◈", "理财": "◎", "生活": "◇", "消息": "▤", "我的": "◉",
  };
  const tabEls = TAB_DEFS.map((name) => {
    const t = h("div", name === tab ? "d-ali-tab is-on" : "d-ali-tab", tabs);
    const ic = h("i", "d-ali-tab-icon", t);
    ic.textContent = TAB_GLYPH[name] || "◻";
    h("span", "", t).textContent = name;
    return t;
  });

  return {
    el: wrap,
    body,
    nav,
    navLeft,
    navTitle,
    navRight,

    /** 淡入。 */
    in(tl, at = 0) {
      tl.from(wrap, { y: 18, opacity: 0, duration: 0.4, ease: "power3.out" }, at);
      return tl;
    },

    setLeft(text) {
      navLeft.textContent = text;
      navLeft.style.visibility = text ? "visible" : "hidden";
    },
    setTitle(text) {
      navTitle.textContent = text;
    },
    setRight(text) {
      navRight.textContent = text;
      navRight.style.visibility = text ? "visible" : "hidden";
    },
    /** 蓝色沉浸式首页（顶栏压在蓝底上） */
    immersive(on) {
      wrap.classList.toggle("is-immersive", !!on);
    },
    hideNav() {
      nav.style.display = "none";
    },
    showNav() {
      nav.style.display = "";
    },
    hideTabs() {
      tabs.style.display = "none";
    },
    showTabs() {
      tabs.style.display = "";
    },
  };
}

/* ── 首页（我的）──────────────────────────────────────────
 *
 * 真机结构：
 *   右上角：耳机 · 齿轮（没有搜索框）
 *   头像（深色圆角方块） + 昵称「王」 + 「卡包 ›」胶囊
 *   会员卡组由场景追加
 */
export function aliHome(parent) {
  const page = h("div", "d-ali-page", parent);

  // 淡蓝渐变头区
  const hero = h("div", "d-ali-hero", page);

  const tools = h("div", "d-ali-me-tools", hero);
  h("span", "d-ali-me-tool", tools).textContent = "\u2610";
  h("span", "d-ali-me-tool", tools).textContent = "\u2699";

  const profile = h("div", "d-ali-me-profile", hero);
  h("div", "d-ali-me-avatar", profile);
  const pInfo = h("div", "d-ali-me-info", profile);
  h("b", "d-ali-me-name", pInfo).textContent = "\u6f14\u793a";
  const badge = h("div", "d-ali-me-badge", pInfo);
  badge.innerHTML = "<i>\u25a3</i> \u5361\u5305 <span>\u203a</span>";

  return { page, hero, profile };
}

/* ── 圆角白卡分组 ───────────────────────────────────────── */
export function aliCard(parent, { gap = true } = {}) {
  const card = h("div", gap ? "d-ali-card d-ali-card-gap" : "d-ali-card", parent);
  const head = h("div", "d-ali-card-head", card);
  head.style.display = "none";
  const list = h("div", "d-ali-card-list", card);

  return {
    el: card,
    head,
    list,
    /** 带标题的卡片 */
    titled(text) {
      head.style.display = "";
      head.textContent = text;
      return this;
    },
    /** 一行：色块图标 + 主文 + 右值 + 箭头 */
    item(label, { note = "", value = "", color = BLUE, glyph = "•", arrow = true } = {}) {
      const rowEl = h("div", "d-ali-row", list);
      const ic = h("i", "d-ali-row-ico", rowEl);
      ic.style.background = color;
      ic.textContent = glyph;
      const main = h("div", "d-ali-row-main", rowEl);
      h("b", "d-ali-row-name", main).textContent = label;
      if (note) h("span", "d-ali-row-note", main).textContent = note;
      if (value) h("em", "d-ali-row-value", rowEl).textContent = value;
      if (arrow) h("span", "d-ali-row-arrow", rowEl).textContent = "›";
      return rowEl;
    },
  };
}

/* ── 账单页（对照真机 2026-11）──────────────────────────────
 *
 * 真机结构（自上而下）：
 *   ‹  [搜索交易记录          ] 搜索   ⋯
 *   全部 支出 转账 退款 订单 线下 筛选▾
 *   11月▾ | 贴纸   支出¥1,234.56 收入¥250.00  [收支分析]
 *   本月已省 0.70元 ›              10月账单月报(圆环) ›
 *   交易行：圆形图标 + 标题/分类/时间 + 金额
 */
export function aliBillPage(parent) {
  const page = h("div", "d-ali-page d-ali-bill", parent);

  // 顶栏：搜索框 + 搜索 + 更多
  const top = h("div", "d-ali-bill-top", page);
  h("span", "d-ali-bill-back", top).textContent = "‹";
  const search = h("div", "d-ali-bill-search", top);
  h("span", "d-ali-bill-searchico", search).textContent = "⌕";
  h("span", "d-ali-bill-searchph", search).textContent = "搜索交易记录";
  h("span", "d-ali-bill-searchbtn", top).textContent = "搜索";
  const more = h("span", "d-ali-bill-morebtn", top);
  more.textContent = "⋯";

  // 分类条
  const filter = h("div", "d-ali-bill-filter", page);
  ["全部", "支出", "转账", "退款", "订单", "线下"].forEach((name, i) => {
    h("span", i === 0 ? "d-ali-bill-chip is-on" : "d-ali-bill-chip", filter).textContent = name;
  });
  const filterMore = h("span", "d-ali-bill-filtermore", filter);
  filterMore.textContent = "筛选 ▾";

  // 汇总区（白底，不是蓝色）
  const sum = h("div", "d-ali-bill-sum", page);

  const sumHead = h("div", "d-ali-bill-sumhead", sum);
  const monthEl = h("div", "d-ali-bill-month", sumHead);
  h("b", "", monthEl).textContent = "11";
  h("span", "", monthEl).textContent = "月 ▾";
  const sticker = h("div", "d-ali-bill-sticker", sumHead);
  h("i", "d-ali-bill-sticker-ico", sticker).textContent = "▤";
  h("span", "", sticker).textContent = "贴纸";

  const sumBody = h("div", "d-ali-bill-sumbody", sum);
  const sumLeft = h("div", "d-ali-bill-sumleft", sumBody);
  const io = h("div", "d-ali-bill-io", sumLeft);
  [["支出", "¥ 1,234.56"], ["收入", "¥ 250.00"]].forEach(([k, v]) => {
    const c = h("div", "d-ali-bill-iocell", io);
    h("span", "", c).textContent = k;
    h("b", "", c).textContent = v;
  });
  const saved = h("div", "d-ali-bill-saved", sumLeft);
  saved.innerHTML = '本月已省 <b>0.70</b>元 <span>›</span>';

  const sumRight = h("div", "d-ali-bill-sumright", sumBody);
  const report = h("div", "d-ali-bill-report", sumRight);
  const ring = h("div", "d-ali-bill-ring", report);
  const reportTxt = h("div", "d-ali-bill-reporttxt", report);
  reportTxt.innerHTML = "10月账单月报<br><em>已出</em>";
  h("span", "d-ali-bill-reportarrow", sumRight).textContent = "›";

  const analyze = h("div", "d-ali-bill-analyze", sum);
  analyze.textContent = "收支分析";

  // 交易列表
  const list = h("div", "d-ali-bill-list", page);
  // 真机的图标是圆形：转账是头像/图形，消费是商户 logo
  // 名称与金额全部虚构：真机上的交易对象、商户名、金额一律不照抄。
  const LINES = [
    ["转", "转账-示例好友", "转账红包", "昨天 15:31", "-120.00", "#4a90d9", true],
    ["亲", "亲情卡-示例家人", "亲友代付 · 自动扣款成功", "昨天 12:58", "-38.50", "#4a90d9", true],
    ["便", "示例便利店", "日用百货", "11-07 19:59", "-24.80", "#e8734a", true],
    ["¥", "余额提现", "账户存取", "11-06 01:00", "200.00", "#07a35a", true],
    ["¥", "余额充值", "账户存取", "11-06 00:59", "200.00", "#1677ff", true],
    ["服", "示例科技有限公司", "商业服务", "11-04 20:36", "-300.00", "#e8734a", true],
    ["充", "手机充值", "充值缴费", "11-03 09:12", "-50.00", "#1677ff", true],
  ];
  LINES.forEach(([glyph, who, cat, time, amt, color, round]) => {
    const line = h("div", "d-ali-bill-line", list);
    const ic = h("i", round ? "d-ali-bill-ico is-round" : "d-ali-bill-ico", line);
    ic.style.background = color;
    ic.textContent = glyph;
    const mid = h("div", "d-ali-bill-mid", line);
    h("b", "", mid).textContent = who;
    h("span", "", mid).textContent = cat;
    h("em", "d-ali-bill-time", mid).textContent = time;
    h("em", "d-ali-bill-amt", line).textContent = amt;
  });

  return { page, sum, filter, list, top, more };
}

/* ── 底部弹层 ───────────────────────────────────────────── */
export function aliSheet(root, { title = "" } = {}) {
  const mask = h("div", "d-ali-mask", root);
  const sheet = h("div", "d-ali-sheet", root);
  h("div", "d-ali-sheet-bar", sheet);
  const titleEl = h("div", "d-ali-sheet-title", sheet);
  titleEl.textContent = title;
  const bodyEl = h("div", "d-ali-sheet-body", sheet);

  mask.style.opacity = "0";
  mask.style.visibility = "hidden";
  sheet.style.opacity = "0";
  sheet.style.visibility = "hidden";

  return {
    mask,
    el: sheet,
    body: bodyEl,
    title: titleEl,
    in(tl, at = ">") {
      tl.set([mask, sheet], { visibility: "visible" }, at)
        .fromTo(mask, { opacity: 0 }, { opacity: 1, duration: 0.2 }, "<")
        .fromTo(sheet, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.28, ease: "power3.out" }, "<");
      return tl;
    },
    out(tl, at = ">") {
      tl.to(mask, { opacity: 0, duration: 0.18 }, at)
        .to(sheet, { y: 30, opacity: 0, duration: 0.22 }, "<")
        .set([mask, sheet], { visibility: "hidden" }, ">");
      return tl;
    },
    /** 一个可点击选项 */
    option(text, { primary = false, note = "" } = {}) {
      const opt = h("div", primary ? "d-ali-opt is-primary" : "d-ali-opt", bodyEl);
      h("b", "", opt).textContent = text;
      if (note) h("span", "", opt).textContent = note;
      return opt;
    },
    /** 取消按钮 */
    cancel(text = "取消") {
      const btn = h("div", "d-ali-sheet-cancel", sheet);
      btn.textContent = text;
      return btn;
    },
  };
}

/* ── 下拉菜单 ───────────────────────────────────────────── */
export function aliMenu(root, items) {
  const menu = h("div", "d-ali-menu", root);
  const nodes = items.map(({ label, primary = false }) => {
    const it = h("div", primary ? "d-ali-menu-item is-primary" : "d-ali-menu-item", menu);
    it.textContent = label;
    return it;
  });
  menu.style.opacity = "0";
  menu.style.visibility = "hidden";
  return {
    el: menu,
    items: nodes,
    in(tl, at = ">") {
      tl.set(menu, { visibility: "visible" }, at)
        .fromTo(menu, { opacity: 0, scale: 0.94, y: -4 }, { opacity: 1, scale: 1, y: 0, duration: 0.2 }, "<");
      return tl;
    },
    out(tl, at = ">") {
      tl.to(menu, { opacity: 0, duration: 0.15 }, at).set(menu, { visibility: "hidden" }, ">");
      return tl;
    },
  };
}

/**
 * 真实微信风格积木（逐帧对照 123 秒录屏还原）。
 *
 * 不复制官方图标：功能图标一律用色块 + 符号，头像用色块 + 单字。
 * 布局、字号、间距、配色按真实界面还原。
 */

export const GREEN = "#07c160";
export const PAGE_BG = "#ededed";
export const LINE = "#e5e5e5";
export const SUB = "#888888";

function h(tag, cls, parent) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (parent) parent.appendChild(el);
  return el;
}

/* ── 手机外壳 ───────────────────────────────────────────── */
export function phoneShell(root, { tab = "我", time = "16:31", showTabs = true } = {}) {
  const wrap = h("div", "d-wxp", root);

  // 状态栏
  const sb = h("div", "d-wxp-status", wrap);
  h("span", "d-wxp-time", sb).textContent = time;
  const pill = h("span", "d-wxp-pill", sb);
  h("i", "d-wxp-pill-dot", pill);
  h("span", "d-wxp-pill-time", pill).textContent = "00:19";
  const right = h("span", "d-wxp-status-right", sb);
  h("span", "d-wxp-signal", right).textContent = "▂▄▆";
  h("span", "d-wxp-net", right).textContent = "4G";
  h("span", "d-wxp-batt", right).textContent = "▮";

  // 导航栏
  const nav = h("div", "d-wxp-nav", wrap);
  const navLeft = h("span", "d-wxp-nav-left", nav);
  const navTitle = h("span", "d-wxp-nav-title", nav);
  const navRight = h("span", "d-wxp-nav-right", nav);

  const body = h("div", "d-wxp-body", wrap);

  // 底部 tab
  const tabs = h("div", "d-wxp-tabs", wrap);
  const TAB_DEFS = [
    ["微信", false], ["通讯录", false], ["发现", false], ["我", true],
  ];
  const TAB_GLYPH = { "微信": "◔", "通讯录": "☰", "发现": "◎", "我": "◉" };
  const tabEls = TAB_DEFS.map(([name, isMe]) => {
    const t = h("div", name === tab ? "d-wxp-tab is-on" : "d-wxp-tab", tabs);
    const ic = h("i", "d-wxp-tab-icon", t);
    ic.textContent = TAB_GLYPH[name] || "◻";
    h("span", "", t).textContent = name;
    return t;
  });
  if (!showTabs) tabs.style.display = "none";

  return {
    el: wrap,
    body,
    nav,
    navTitle,
    navLeft,
    navRight,
    tabs,
    setTitle(text) { navTitle.textContent = text; },
    setLeft(kind) {
      navLeft.textContent = kind === "close" ? "✕" : kind === "back" ? "‹" : "";
      navLeft.dataset.kind = kind;
    },
    setRight(text, kind = "text") {
      navRight.textContent = text;
      navRight.dataset.kind = kind;
    },
    hideNav() { nav.style.display = "none"; },
    showNav() { nav.style.display = "flex"; },
    hideTabs() { tabs.style.display = "none"; },
    showTabs() { tabs.style.display = "grid"; },
  };
}

/* ── 「我」页资料头 ─────────────────────────────────────── */
export function profileHead(parent, {
  name = "演示用户",
  wxid = "wxid_demo000",
  avatarColor = "#5b8c6e",
} = {}) {
  const head = h("div", "d-wxp-profile", parent);
  const avWrap = h("div", "d-wxp-avatar-wrap", head);
  const av = h("div", "d-wxp-profile-avatar", avWrap);
  av.style.background = avatarColor;
  av.textContent = name.slice(0, 1);
  // 右上角二维码角标
  const qr = h("span", "d-wxp-qr", avWrap);
  qr.textContent = "▦";

  const info = h("div", "d-wxp-profile-info", head);
  h("b", "", info).textContent = name;
  const idRow = h("span", "d-wxp-wxid", info);
  idRow.textContent = `微信号：${wxid}`;

  // 第二行：状态胶囊 + 朋友圈提示
  const meta = h("div", "d-wxp-profile-meta", parent);
  const statusChip = h("span", "d-wxp-status-chip", meta);
  statusChip.textContent = "+ 状态";
  const friends = h("span", "d-wxp-friends", meta);
  friends.innerHTML = '<i class="d-wxp-friends-ico">◕◕</i> 等16个朋友 <i class="d-wxp-dot"></i>';

  return { head, meta };
}

/* ── 列表分组 ───────────────────────────────────────────── */
export function group(parent, { gap = true } = {}) {
  const g = h("div", "d-wxp-group", parent);
  if (gap) g.classList.add("has-gap");
  return g;
}

/**
 * 列表行。
 * opts: icon{color,glyph} | rightText | redDot | arrow | note
 */
export function row(parent, label, {
  icon = null, rightText = "", redDot = false, arrow = true, note = "", tall = false,
} = {}) {
  const r = h("div", tall ? "d-wxp-row is-tall" : "d-wxp-row", parent);
  if (icon) {
    const ic = h("span", "d-wxp-row-icon", r);
    ic.style.background = icon.color;
    ic.textContent = icon.glyph || "";
  }
  const main = h("div", "d-wxp-row-main", r);
  const lab = h("span", "d-wxp-row-label", main);
  lab.textContent = label;
  if (note) h("span", "d-wxp-row-note", main).textContent = note;
  if (redDot) h("i", "d-wxp-dot", r);
  if (rightText) h("span", "d-wxp-row-right", r).textContent = rightText;
  if (arrow) h("span", "d-wxp-row-arrow", r).textContent = "›";
  return r;
}

/* ── 「服务」页：顶部绿卡 + 4 列图标网格 ─────────────────── */
export function greenCard(parent) {
  const card = h("div", "d-wxp-greencard", parent);
  const pay = h("div", "d-wxp-greencard-item", card);
  h("i", "d-wxp-gc-ico", pay).textContent = "⊞";
  const payBody = h("div", "d-wxp-gc-body", pay);
  h("b", "", payBody).textContent = "收付款";
  h("span", "", payBody).textContent = "向商家付款";
  const div = h("span", "d-wxp-gc-div", card);
  const wallet = h("div", "d-wxp-greencard-item", card);
  h("i", "d-wxp-gc-ico", wallet).textContent = "￥";
  const wBody = h("div", "d-wxp-gc-body", wallet);
  h("b", "", wBody).textContent = "钱包";
  const bal = h("span", "", wBody);
  bal.textContent = "¥88.88";
  return { card, pay, wallet };
}

export function gridSection(parent, title) {
  const sec = h("div", "d-wxp-gridsec", parent);
  if (title) h("div", "d-wxp-gridtitle", sec).textContent = title;
  const grid = h("div", "d-wxp-grid", sec);
  return {
    el: sec,
    grid,
    item(label, { color = GREEN, glyph = "" } = {}) {
      const it = h("div", "d-wxp-griditem", grid);
      const ic = h("i", "d-wxp-grid-ico", it);
      ic.style.background = color;
      ic.textContent = glyph;
      h("span", "", it).textContent = label;
      return it;
    },
  };
}

/* ── 账单页 ─────────────────────────────────────────────── */
export function billToolbar(parent) {
  const bar = h("div", "d-wxp-billbar", parent);
  const all = h("span", "d-wxp-billbar-all", bar);
  all.textContent = "全部账单 ▾";
  const search = h("span", "d-wxp-billbar-search", bar);
  search.innerHTML = '<i>⌕</i> 查找交易';
  const stat = h("span", "d-wxp-billbar-stat", bar);
  stat.textContent = "收支统计 ›";
  return { bar, all, search, stat };
}

export function billMonth(parent, { month = "2026年11月", expense = "1,234.56", income = "250.00" } = {}) {
  const head = h("div", "d-wxp-billmonth", parent);
  h("span", "d-wxp-bm-month", head).textContent = `${month} ▾`;
  const sums = h("span", "d-wxp-bm-sums", head);
  sums.innerHTML = `支出¥${expense} 收入¥${income}`;
  return head;
}

export function billRow(parent, { glyph = "", color = GREEN, name = "", time = "", amount = "", income = false } = {}) {
  const r = h("div", "d-wxp-billrow", parent);
  const ic = h("span", "d-wxp-br-icon", r);
  ic.style.background = color;
  ic.textContent = glyph;
  const main = h("div", "d-wxp-br-main", r);
  h("b", "", main).textContent = name;
  h("span", "", main).textContent = time;
  h("span", income ? "d-wxp-br-amt is-in" : "d-wxp-br-amt", r).textContent = amount;
  return r;
}

/* ── 选择行（下载账单的两个用途）───────────────────────── */
export function choiceRow(parent, { glyph = "", title = "", desc = "", filled = true } = {}) {
  const r = h("div", "d-wxp-choice", parent);
  const ic = h("span", filled ? "d-wxp-choice-icon is-filled" : "d-wxp-choice-icon", r);
  ic.textContent = glyph;
  const body = h("div", "d-wxp-choice-body", r);
  h("b", "", body).textContent = title;
  h("span", "", body).textContent = desc;
  return r;
}

/* ── 表单 ───────────────────────────────────────────────── */
export function formRow(parent, label, value = "", { arrow = true, wide = false } = {}) {
  const r = h("div", wide ? "d-wxp-formrow is-wide" : "d-wxp-formrow", parent);
  h("span", "d-wxp-formrow-label", r).textContent = label;
  const v = h("span", "d-wxp-formrow-value", r);
  v.textContent = value;
  if (arrow) h("span", "d-wxp-row-arrow", r).textContent = "›";
  return { row: r, value: v };
}

/** 胶囊按钮组（近一月 / 近三月 / 自定义时间）。 */
export function pillGroup(parent, items, { active = 0 } = {}) {
  const wrap = h("div", "d-wxp-pills", parent);
  const pills = items.map((label, i) => {
    const p = h("span", i === active ? "d-wxp-pillbtn is-on" : "d-wxp-pillbtn", wrap);
    p.textContent = label;
    return p;
  });
  return { el: wrap, pills, setActive(i) {
    pills.forEach((p, k) => p.classList.toggle("is-on", k === i));
  } };
}

/* ── 底部弹层 ───────────────────────────────────────────── */
export function bottomSheet(parent, title) {
  const sheet = h("div", "d-wxp-sheet", parent);
  const head = h("div", "d-wxp-sheet-head", sheet);
  const close = h("span", "d-wxp-sheet-close", head);
  close.textContent = "✕";
  h("span", "d-wxp-sheet-title", head).textContent = title;
  const body = h("div", "d-wxp-sheet-body", sheet);
  return { el: sheet, head, body, close };
}

/* ── 中文数字键盘 ───────────────────────────────────────── */
export function keyboard(parent) {
  const kb = h("div", "d-wxp-kb", parent);
  const sym = h("div", "d-wxp-kb-sym", kb);
  ["*", "/", "-", "+"].forEach((s) => h("span", "", sym).textContent = s);
  // 上面这行只能用最后值，重写一遍
  sym.innerHTML = "";
  ["*", "/", "-", "+"].forEach((s) => {
    const e = h("span", "", sym);
    e.textContent = s;
  });

  const digits = h("div", "d-wxp-kb-digits", kb);
  ["1", "2", "3", "4", "5", "6", "7", "8", "9"].forEach((d) => {
    const k = h("span", "d-wxp-kb-key", digits);
    k.textContent = d;
  });

  const side = h("div", "d-wxp-kb-side", kb);
  ["⌫", ".", "@"].forEach((s) => {
    const k = h("span", "d-wxp-kb-side-key", side);
    k.textContent = s;
  });

  const foot = h("div", "d-wxp-kb-foot", kb);
  ["符", "返回", "0", "空格"].forEach((s) => {
    const k = h("span", "d-wxp-kb-foot-key", foot);
    k.textContent = s;
  });
  h("span", "d-wxp-kb-ok", foot).textContent = "确定";
  return { el: kb, digits, side, foot };
}

/* ── 微信聊天列表 ───────────────────────────────────────── */
export function chatList(parent) {
  const list = h("div", "d-wxp-chatlist", parent);
  return {
    el: list,
    item({ name, preview, time = "", initial = "", color = "#5b8c6e", redDot = false, unread = "", muted = false }) {
      const r = h("div", "d-wxp-chatitem", list);
      const av = h("div", "d-wxp-chatitem-av", r);
      av.style.background = color;
      av.textContent = initial;
      if (redDot) h("i", "d-wxp-chatitem-badge", av);
      const body = h("div", "d-wxp-chatitem-body", r);
      h("b", "", body).textContent = name;
      const prev = h("span", "", body);
      prev.textContent = preview;
      if (unread) h("em", "d-wxp-chatitem-unread", prev).textContent = unread;
      const right = h("div", "d-wxp-chatitem-right", r);
      if (time) h("span", "", right).textContent = time;
      if (muted) h("i", "d-wxp-mute", right).textContent = "⊘";
      return r;
    },
  };
}

/* ── 公众号文章卡 ───────────────────────────────────────── */
export function mpArticle(parent, { time = "" } = {}) {
  const wrap = h("div", "d-wxp-mpwrap", parent);
  if (time) h("div", "d-wxp-mptime", wrap).textContent = time;
  const card = h("div", "d-wxp-mpcard", wrap);
  return { wrap, card };
}

export function kvRow(parent, key, value, { strong = false } = {}) {
  const r = h("div", "d-wxp-kv", parent);
  h("span", "d-wxp-kv-key", r).textContent = key;
  const v = h("span", strong ? "d-wxp-kv-val is-strong" : "d-wxp-kv-val", r);
  if (typeof value === "string") v.textContent = value;
  return { row: r, value: v };
}

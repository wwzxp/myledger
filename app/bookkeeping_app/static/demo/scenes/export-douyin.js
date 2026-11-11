/**
 * 场景：抖音账单怎么导出。
 *
 * 对照手机录屏（720×1652，41 秒）的 12 个界面：
 *   1  我的              头像/昵称/数据/功能行/作品网格/底部 tab
 *   2  横杆抽屉菜单       设置/扫一扫 + 我的订单/我的钱包/…
 *   3  我的钱包          总资产卡 + 账单行 + 服务宫格 + 积分
 *   4  账单              搜索 + 筛选 + 按月分组的流水
 *   5  ⋯ → 下载账单       底部弹层：实名下所有账单 / 取消
 *   6  下载账单          凭证示例 + 同意勾选 + 申请下载
 *   7  请输入支付密码     6 位圆点 + 数字键盘（录屏被系统屏蔽，按通用形态还原）
 *   8  选择交易流水范围    交易类型 / 时间范围 / 起止日期 / 下一步
 *   9  选择时间          三列滚轮 + 取消/确定
 *  10  填写电子邮箱       邮箱行 + 发送
 *  11  确认邮箱地址       弹窗：返回修改 / 确认发送
 *  12  申请已提交         绿勾 + 解压密码 + 返回账单/申请记录
 *
 * 录屏里的昵称、抖音号、手机号、商户、金额、邮箱、解压密码、真人头像与
 * 视频缩略图全部虚构或替换为色块。
 */

import { scenario, cursor, type as typeText } from "../kit.js";

/* ── 虚构数据 ─────────────────────────────────────────── */
const NICK = "演示用户";
const DY_ID = "demo0001";
const WALLET_TITLE = "演示的钱包";
const MAIL = "demo_user@163.com";
const PWD = "604182";
const SUGGESTS = ["demo_user@qq.com", "demo_user@163.com", "demo_user@126.com", "demo_user@gmail.com"];

const BILL_NOV = [
  ["示例商城-保暖内衣三件套", "11-10 09:12:54", "-12.90", "🛍", "#f83b5c"],
  ["放心借还款", "11-02 08:13:20", "520.80", "借", "#4a90d9"],
];
const BILL_OCT = [
  ["亲友付-示例", "10-30 11:43:23", "-132.40", "付", "#7bbf6a"],
  ["示例商城-透明镜架", "10-21 14:13:44", "-2.40", "🛍", "#f83b5c"],
  ["抖音月付还款", "10-20 09:09:13", "76.30", "月", "#25d0c0"],
  ["示例商城-变色镜片", "10-14 12:02:30", "-28.90", "🛍", "#f83b5c"],
];

function el(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

function shell(root) {
  const wrap = el("div", "d-dy", root);
  const body = el("div", "d-dy-body", wrap);
  return { wrap, body };
}

function pg(parent) {
  const p = el("div", "d-dy-page", parent);
  p.style.display = "none";
  return p;
}

function nav(parent, title, { right = "" } = {}) {
  const bar = el("div", "d-dy-nav", parent);
  el("div", "d-dy-back", bar).textContent = "‹";
  el("div", "d-dy-title", bar).textContent = title;
  const r = el("div", "d-dy-navright", bar);
  r.textContent = right;
  return { bar, right: r };
}

function go(tl, from, to, at = ">") {
  tl.to({}, { duration: 0.62 }, at)
    .to(from, { opacity: 0, duration: 0.2 }, ">")
    .call(() => { from.style.display = "none"; from.style.opacity = 1; }, null, ">")
    .call(() => { to.style.display = "block"; }, null, "<")
    .fromTo(to, { opacity: 0, x: 12 }, { opacity: 1, x: 0, duration: 0.26 }, "<")
    .to({}, { duration: 0.55 }, ">");
}

function billRow(parent, [name, time, amount, glyph, color]) {
  const row = el("div", "d-dy-brow", parent);
  const ic = el("i", "d-dy-bico", row);
  ic.style.background = color;
  ic.textContent = glyph;
  const mid = el("div", "d-dy-bmid", row);
  el("b", "", mid).textContent = name;
  el("span", "", mid).textContent = time;
  el("em", "d-dy-bamt", row).textContent = amount;
  return row;
}

export default function exportDouyin({ root, tl }) {
  const strip = scenario(root, "抖音账单在「钱包 → 账单 → ⋯」里下载", { local: true });
  const { body } = shell(root);
  const cur = cursor(root);

  /* ═══ 1 我的 ═══ */
  const p1 = pg(body);
  p1.style.display = "block";

  const hero = el("div", "d-dy-hero", p1);
  const top = el("div", "d-dy-top", hero);
  el("span", "d-dy-pill", top).textContent = "好友";
  el("span", "d-dy-pill is-center", top).textContent = "新访客 9";
  const topRight = el("div", "d-dy-topright", top);
  el("span", "", topRight).textContent = "🔍";
  const burger = el("span", "d-dy-burger", topRight);
  burger.textContent = "☰";

  const prof = el("div", "d-dy-prof", hero);
  const avatar = el("div", "d-dy-avatar", prof);
  avatar.textContent = "演";
  const pInfo = el("div", "d-dy-pinfo", prof);
  const nameRow = el("div", "d-dy-namerow", pInfo);
  el("b", "", nameRow).textContent = NICK;
  el("em", "", nameRow).textContent = "▾";
  el("span", "d-dy-id", pInfo).textContent = `抖音号：${DY_ID}`;
  el("span", "d-dy-aibtn", pInfo).textContent = "创作 AI 作品 ›";

  const statCard = el("div", "d-dy-statcard", p1);
  [["12", "获赞"], ["8", "互关"], ["156", "关注"], ["23", "粉丝"]].forEach(([v, k]) => {
    const c = el("div", "d-dy-stat", statCard);
    el("b", "", c).textContent = v;
    el("span", "", c).textContent = k;
  });
  el("div", "d-dy-editbtn", statCard).textContent = "编辑主页";

  el("div", "d-dy-bio", p1).textContent = "点击添加介绍，让大家认识你…";
  el("div", "d-dy-tag", p1).textContent = "+ 添加性别等标签";

  const feats = el("div", "d-dy-feats", p1);
  const walletEntry = el("div", "d-dy-feat", feats);
  walletEntry.textContent = "我的钱包";
  ["主播中心", "我的订单", "观看历史", "全部功能"].forEach((t, i) => {
    const c = el("div", "d-dy-feat", feats);
    c.textContent = t;
  });
  // 保持真机顺序：主播中心 我的订单 观看历史 我的钱包 全部功能
  feats.insertBefore(walletEntry, feats.children[3]);

  const bannerRow = el("div", "d-dy-banner", p1);
  const bThumb = el("i", "d-dy-bthumb", bannerRow);
  bThumb.textContent = "🌅";
  const bMain = el("div", "d-dy-bmain", bannerRow);
  el("b", "", bMain).textContent = "示例话题";
  el("span", "", bMain).textContent = "43 人参与";
  el("span", "d-dy-bjoin", bannerRow).textContent = "参与话题";

  const tabs = el("div", "d-dy-tabs", p1);
  ["作品 ▾", "日常", "推荐", "收藏", "喜欢"].forEach((t, i) => {
    el("span", i === 0 ? "is-on" : "", tabs).textContent = t;
  });

  const grid = el("div", "d-dy-vgrid", p1);
  ["#4a7fd4", "#2b3a55", "#f0824b", "#2f6fd0", "#3b4a6b", "#8a5a3b"].forEach((c) => {
    const cell = el("div", "d-dy-vcell", grid);
    cell.style.background = c;
  });

  const tabbar = el("div", "d-dy-tabbar", p1);
  ["首页", "朋友", "+", "消息", "我"].forEach((t, i) => {
    el("span", i === 4 ? "is-on" : "", tabbar).textContent = t;
  });

  /* ═══ 2 横杆抽屉菜单 ═══ */
  const drawer = el("div", "d-dy-drawer", body);
  const dTop = el("div", "d-dy-dtop", drawer);
  el("span", "d-dy-dbtn", dTop).textContent = "⚙ 设置";
  el("span", "d-dy-dbtn", dTop).textContent = "⛶ 扫一扫";

  const group1 = el("div", "d-dy-dgroup", drawer);
  const orderItem = el("div", "d-dy-ditem", group1);
  el("span", "", orderItem).textContent = "我的订单";
  el("em", "", orderItem).textContent = "待收货 1 ›";
  const walletItem = el("div", "d-dy-ditem", group1);
  el("span", "", walletItem).textContent = "我的钱包";
  el("em", "", walletItem).textContent = "有余额 ›";

  const group2 = el("div", "d-dy-dgroup", drawer);
  ["观看历史", "我的转化记录", "我的评论", "离线缓存", "稍后再看"].forEach((t) => {
    const it = el("div", "d-dy-ditem", group2);
    el("span", "", it).textContent = t;
    el("em", "", it).textContent = "›";
  });

  const group3 = el("div", "d-dy-dgroup", drawer);
  ["抖音创作者中心", "我的客服", "我的二维码"].forEach((t) => {
    const it = el("div", "d-dy-ditem", group3);
    el("span", "", it).textContent = t;
    el("em", "", it).textContent = "›";
  });

  const group4 = el("div", "d-dy-dgroup", drawer);
  ["未成年人保护", "清理缓存", "切换账号"].forEach((t) => {
    const it = el("div", "d-dy-ditem", group4);
    el("span", "", it).textContent = t;
    el("em", "", it).textContent = "›";
  });

  drawer.style.transform = "translateX(100%)";
  drawer.style.visibility = "hidden";

  /* ═══ 3 我的钱包 ═══ */
  const p3 = pg(body);
  nav(p3, WALLET_TITLE, { right: "🎧  ⚙" });

  const asset = el("div", "d-dy-asset", p3);
  const aTop = el("div", "d-dy-atop", asset);
  el("span", "", aTop).textContent = "总资产(元) 👁";
  el("em", "", aTop).textContent = "🛡 安全保障中";
  el("div", "d-dy-amt", asset).textContent = "8.60";
  const aRow = el("div", "d-dy-arow", asset);
  [["钻石", "0"], ["金币", "0"], ["券包", "12"], ["银行卡", "4"]].forEach(([k, v]) => {
    const c = el("div", "d-dy-acell", aRow);
    el("span", "", c).textContent = k;
    el("b", "", c).textContent = v;
  });

  const billCard = el("div", "d-dy-billcard", p3);
  const billHead = el("div", "d-dy-billhead", billCard);
  el("b", "", billHead).textContent = "账单";
  el("span", "", billHead).textContent = "示例商城付款成功 ¥12.90  1 天前";
  el("em", "", billHead).textContent = "全部 ›";

  const svcGrid = el("div", "d-dy-svcgrid", p3);
  ["放心借", "抖音月付", "抖音支付", "保险", "放心生意贷", "手机充值",
   "信用卡还款", "生活缴费", "理财", "看病报销", "乘车码", "更多服务"].forEach((t) => {
    el("span", "", svcGrid).textContent = t;
  });

  const walletTabs = el("div", "d-dy-wtabs", p3);
  ["支付积分", "金融服务", "便捷生活", "天天领金币"].forEach((t, i) => {
    el("span", i === 0 ? "is-on" : "", walletTabs).textContent = t;
  });
  const points = el("div", "d-dy-points", p3);
  const pHead = el("div", "d-dy-phead", points);
  el("b", "", pHead).textContent = "抖音支付积分";
  el("em", "", pHead).textContent = "每日签到";
  const pRow = el("div", "d-dy-prow", points);
  el("b", "", pRow).textContent = "0";
  el("span", "", pRow).textContent = "100 积分 ≈ 1 元 ›";
  el("em", "d-dy-pbtn", pRow).textContent = "立即签到 +100";
  el("div", "d-dy-pmall", points).textContent = "积分商城 | 兑最高 10 元支付券   去兑换 ›";

  /* ═══ 4 账单 ═══ */
  const p4 = pg(body);
  const n4 = nav(p4, "", { right: "" });
  const searchBar = el("div", "d-dy-search", n4.bar);
  searchBar.textContent = "⌕ 搜索账单信息、金额、单号";
  // 「搜索」和「⋯」必须是两个独立节点：合成一个文本时，
  // 光标会落在两者中间的空隙上，看起来像点错了地方。
  n4.right.textContent = "";
  const navSearch = el("span", "d-dy-navsearch", n4.right);
  navSearch.textContent = "搜索";
  const moreBtn = el("span", "d-dy-navmore", n4.right);
  moreBtn.textContent = "⋯";

  const filters = el("div", "d-dy-filters", p4);
  ["全部", "支出", "收入", "退款", "提现"].forEach((t, i) => {
    el("span", i === 0 ? "is-on" : "", filters).textContent = t;
  });
  el("em", "d-dy-filtermore", filters).textContent = "筛选 ▾";

  el("div", "d-dy-pointsbanner", p4).textContent = "已攒 600 抖音支付积分待领取    一键领    ×";

  const novCard = el("div", "d-dy-monthcard", p4);
  const novHead = el("div", "d-dy-monthhead", novCard);
  el("b", "", novHead).textContent = "11月 ▾";
  const novStat = el("em", "d-dy-monthstat", novHead);
  novStat.textContent = "收支统计";
  el("div", "d-dy-monthsum", novCard).textContent = "支出 ¥12.90   收入 ¥0.00";
  BILL_NOV.forEach((r) => billRow(novCard, r));

  const octCard = el("div", "d-dy-monthcard", p4);
  const octHead = el("div", "d-dy-monthhead", octCard);
  el("b", "", octHead).textContent = "10月 ▾";
  const octStat = el("em", "d-dy-monthstat", octHead);
  octStat.textContent = "收支统计";
  el("div", "d-dy-monthsum", octCard).textContent = "支出 ¥468.20   收入 ¥0.00";
  BILL_OCT.forEach((r) => billRow(octCard, r));

  /* ═══ 5 下载账单（底部弹层）═══ */
  const dlMask = el("div", "d-dy-mask", body);
  const dlSheet = el("div", "d-dy-dlsheet", body);
  // 「下载账单」是条目的主标题，「实名下所有账单」是它的说明：
  // 两者属于同一个可点条目，点的是主标题那一行。
  const dlItem = el("div", "d-dy-dlitem", dlSheet);
  const dlTitle = el("b", "d-dy-dltitle", dlItem);
  dlTitle.textContent = "下载账单";
  const dlSub = el("span", "d-dy-dlsub", dlItem);
  dlSub.textContent = "实名下所有账单";
  const dlCancel = el("div", "d-dy-dlcancel", dlSheet);
  dlCancel.textContent = "取消";
  dlMask.style.opacity = "0"; dlMask.style.visibility = "hidden";
  dlSheet.style.transform = "translateY(100%)"; dlSheet.style.visibility = "hidden";

  /* ═══ 6 下载账单（凭证示例 + 同意）═══ */
  const p6 = pg(body);
  nav(p6, "下载账单");
  el("div", "d-dy-certtitle", p6).textContent = "凭证示例";
  el("div", "d-dy-certsub", p6).textContent =
    "该图片为示例，请点击下方按钮下载对应时间内的账单流水文件。";

  const certCard = el("div", "d-dy-certcard", p6);
  el("div", "d-dy-certhead", certCard).textContent = "支付交易流水";
  el("div", "d-dy-certmeta", certCard).textContent =
    "编号 2025121615490180100034440180372457\n导出时间：2026-11-10 17:20:28";
  el("div", "d-dy-certrow", certCard).textContent = "交易时间范围：2026-10-10 06:00:00 至 2026-10-10 23:59:59";
  el("div", "d-dy-certrow", certCard).textContent = "交易类型：全部";
  const certTable = el("div", "d-dy-certtable", certCard);
  ["交易时间 / 收-支 / 金额", "2026-10-10 08:22:06  支出  113.00",
   "2026-10-15 13:12:42  收入  52.00", "2026-10-15 15:44:03  支出  100.00"].forEach((line, i) => {
    const r = el("div", i === 0 ? "d-dy-certtrow is-head" : "d-dy-certtrow", certTable);
    r.textContent = line;
  });
  el("div", "d-dy-certnote", certCard).textContent =
    "说明：本证明仅用于核对支付账户在指定时间段内产生的交易记录；不得用于其他用途。";

  const agreeRow = el("div", "d-dy-agree", p6);
  // 真机初始是空圈，点一下才变红勾
  const agreeBox = el("i", "d-dy-agreebox", agreeRow);
  el("span", "d-dy-agreetext", agreeRow).textContent =
    "同意使用抖音支付、抖音月付（如有）交易数据用于电子回单出具。抖音月付付款交易数据由抖音月付负责提供。";
  const applyBtn = el("div", "d-dy-applybtn", p6);
  applyBtn.textContent = "申请下载";
  el("div", "d-dy-recordlink", p6).textContent = "申请记录";
  el("div", "d-dy-footer", p6).textContent = "抖音支付 ｜ 过亿人都在用";

  /* ═══ 7 请输入支付密码 ═══ */
  const p7 = pg(body);
  nav(p7, "");
  el("div", "d-dy-pwtitle", p7).textContent = "请输入支付密码";
  const pwBoxes = el("div", "d-dy-pwboxes", p7);
  const pwDots = Array.from({ length: 6 }, () => {
    const b = el("div", "d-dy-pwbox", pwBoxes);
    const dot = el("i", "", b);
    dot.style.opacity = "0";
    return dot;
  });
  const pad = el("div", "d-dy-pad", p7);
  const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  const padKeys = PAD.map((k) => {
    const b = el("div", k === "" ? "d-dy-padkey is-blank" : (k === "⌫" ? "d-dy-padkey is-fn" : "d-dy-padkey"), pad);
    b.textContent = k;
    return b;
  });

  /* ═══ 8 选择交易流水范围 ═══ */
  const p8 = pg(body);
  const n8 = nav(p8, "");
  el("div", "d-dy-rangehead", p8).textContent = "选择交易流水范围";
  el("div", "d-dy-rangesub", p8).textContent = "单次最长可导出 1 年内的抖音账单流水";

  const rCard = el("div", "d-dy-rcard", p8);
  el("div", "d-dy-label", rCard).textContent = "交易类型";
  const typeRow = el("div", "d-dy-pills", rCard);
  const typePills = ["全部", "收入", "支出"].map((t, i) => {
    const s = el("span", i === 0 ? "is-on" : "", typeRow);
    s.textContent = t;
    return s;
  });

  el("div", "d-dy-label", rCard).textContent = "时间范围";
  const rangeRow = el("div", "d-dy-pills", rCard);
  const rangePills = ["最近一个月", "最近三个月", "自定义"].map((t, i) => {
    const s = el("span", i === 2 ? "is-on" : "", rangeRow);
    s.textContent = t;
    return s;
  });

  const dateRow = (label) => {
    const r = el("div", "d-dy-daterow", rCard);
    el("span", "d-dy-k", r).textContent = label;
    const v = el("span", "d-dy-v is-ph", r);
    v.textContent = "请选择";
    el("em", "d-dy-chev", r).textContent = "›";
    return { row: r, value: v };
  };
  const startRow = dateRow("开始日期");
  const endRow = dateRow("结束日期");

  const nextBtn = el("div", "d-dy-nextbtn is-disabled", p8);
  nextBtn.textContent = "下一步";
  el("div", "d-dy-footer", p8).textContent = "抖音支付 ｜ 过亿人都在用";

  /* ═══ 9 选择时间（弹层）═══ */
  const dtMask = el("div", "d-dy-mask", body);
  const dtSheet = el("div", "d-dy-dtsheet", body);
  const dtBar = el("div", "d-dy-dtbar", dtSheet);
  const dtCancel = el("span", "d-dy-dtcancel", dtBar);
  dtCancel.textContent = "取消";
  el("span", "d-dy-dttitle", dtBar).textContent = "选择时间";
  const dtOk = el("span", "d-dy-dtok", dtBar);
  dtOk.textContent = "确定";
  const cols = el("div", "d-dy-cols", dtSheet);
  const mkCol = (values, sel) => {
    const col = el("div", "d-dy-col", cols);
    const inner = el("div", "d-dy-cinner", col);
    inner.style.transform = `translateY(${-sel * 31}px)`;
    const items = values.map((v, i) => {
      const d = el("div", i === sel ? "d-dy-citem is-sel" : "d-dy-citem", inner);
      d.textContent = v;
      return d;
    });
    return { inner, items };
  };
  const cY = mkCol(["2024年", "2025年", "2026年"], 2);
  const cM = mkCol(["8月", "9月", "10月", "11月"], 3);
  const cD = mkCol(["07日", "08日", "09日", "10日", "11日"], 3);
  dtMask.style.opacity = "0"; dtMask.style.visibility = "hidden";
  dtSheet.style.transform = "translateY(100%)"; dtSheet.style.visibility = "hidden";

  /* ═══ 10 填写电子邮箱 ═══ */
  const p10 = pg(body);
  nav(p10, "");
  el("div", "d-dy-mailtitle", p10).textContent = "填写电子邮箱";
  el("div", "d-dy-mailsub", p10).textContent = "我们会向你填写的邮箱发送电子回单";
  const mailCard = el("div", "d-dy-mailcard", p10);
  el("span", "d-dy-mailk", mailCard).textContent = "邮箱";
  const mailInput = el("div", "d-dy-mailinput", mailCard);
  const mailText = el("span", "d-dy-mailph", mailInput);
  mailText.textContent = "请输入你的电子邮箱";
  const suggest = el("div", "d-dy-suggest", p10);
  const suggestItems = SUGGESTS.map((s) => {
    const it = el("div", "d-dy-sitem", suggest);
    it.textContent = s;
    return it;
  });
  suggest.style.display = "none";
  const sendBtn = el("div", "d-dy-sendbtn is-disabled", p10);
  sendBtn.textContent = "发送";
  el("div", "d-dy-footer", p10).textContent = "抖音支付 ｜ 过亿人都在用";

  /* ═══ 11 确认邮箱地址（弹窗）═══ */
  const cfMask = el("div", "d-dy-mask", body);
  const cfCard = el("div", "d-dy-cfcard", body);
  el("div", "d-dy-cftitle", cfCard).textContent = "确认邮箱地址";
  el("div", "d-dy-cfbody", cfCard).textContent =
    `电子回单将发送至 ${MAIL}，为保护你的隐私安全，请确认邮箱是否正确`;
  const cfBtns = el("div", "d-dy-cfbtns", cfCard);
  const cfBack = el("span", "d-dy-cfbtn", cfBtns);
  cfBack.textContent = "返回修改";
  const cfOk = el("span", "d-dy-cfbtn is-primary", cfBtns);
  cfOk.textContent = "确认发送";
  cfMask.style.opacity = "0"; cfMask.style.visibility = "hidden";
  cfCard.style.opacity = "0"; cfCard.style.visibility = "hidden";

  /* ═══ 12 申请已提交 ═══ */
  const p12 = pg(body);
  nav(p12, "");
  const okMark = el("div", "d-dy-okmark", p12);
  okMark.textContent = "✓";
  el("div", "d-dy-oktitle", p12).textContent = "申请已提交";
  el("div", "d-dy-okbody", p12).textContent =
    `电子回单生成中，预计 10 分钟后可在 ${MAIL} 邮箱附件中查看电子回单`;
  el("div", "d-dy-okpwd", p12).textContent = `解压密码：${PWD}`;
  const okBtns = el("div", "d-dy-okbtns", p12);
  const backBill = el("span", "d-dy-okbtn", okBtns);
  backBill.textContent = "返回账单";
  const recBtn = el("span", "d-dy-okbtn is-primary", okBtns);
  recBtn.textContent = "申请记录";
  el("div", "d-dy-footer", p12).textContent = "抖音支付 ｜ 过亿人都在用";

  /* ══════════ 编排 ══════════ */
  strip.in(tl, 0.1);
  cur.show(tl, 0.3);
  tl.to({}, { duration: 1.7 });   // 首屏先认出这是「我的」

  // 1 → 2 点横杆
  cur.toAt(tl, burger, { duration: 0.45, at: ">" });
  cur.click(tl, burger, ">");
  tl.set(drawer, { visibility: "visible" }, ">")
    .to(drawer, { x: 0, duration: 0.3, ease: "power3.out" }, "<");

  // 2 → 3 点我的钱包
  cur.toAt(tl, walletItem, { duration: 0.4, at: ">+1.0" });
  cur.click(tl, walletItem, ">");
  tl.to(drawer, { x: "100%", duration: 0.26, ease: "power3.in" }, ">")
    .set(drawer, { visibility: "hidden" }, ">");
  go(tl, p1, p3, ">");

  // 3 → 4 点账单行
  cur.toAt(tl, billCard, { duration: 0.42, at: ">+0.6" });
  cur.click(tl, billCard, ">");
  go(tl, p3, p4, ">");

  // 4 → 5 点右上角 ⋯
  cur.toAt(tl, moreBtn, { duration: 0.38, at: ">+1.2" });
  cur.click(tl, moreBtn, ">");
  tl.set([dlMask, dlSheet], { visibility: "visible" }, ">")
    .to(dlMask, { opacity: 1, duration: 0.2 }, "<")
    .to(dlSheet, { y: 0, duration: 0.3, ease: "power3.out" }, "<");

  // 5 → 6 选「实名下所有账单」
  cur.toAt(tl, dlTitle, { duration: 0.38, at: ">+0.9" });
  cur.click(tl, dlTitle, ">");
  tl.to(dlSheet, { y: "100%", duration: 0.26, ease: "power3.in" }, ">")
    .to(dlMask, { opacity: 0, duration: 0.22 }, "<")
    .set([dlMask, dlSheet], { visibility: "hidden" }, ">");
  go(tl, p4, p6, ">");

  // 6 勾选同意
  cur.toAt(tl, agreeBox, { duration: 0.35, at: ">+1.0" });
  cur.click(tl, agreeBox, ">");
  tl.call(() => { agreeBox.classList.add("is-on"); }, null, ">+0.05");

  // 6 → 7 点申请下载 → 支付密码
  cur.toAt(tl, applyBtn, { duration: 0.4, at: ">+1.0" });
  cur.click(tl, applyBtn, ">");
  go(tl, p6, p7, ">");

  // 7 逐位输入 6 位（只画圆点）
  const KEY_IDX = [0, 3, 6, 2, 5, 8];
  KEY_IDX.forEach((ki, i) => {
    cur.toAt(tl, padKeys[ki], { duration: 0.24, at: i === 0 ? ">+0.7" : ">+0.28" });
    cur.click(tl, padKeys[ki], ">");
    tl.to(pwDots[i], { opacity: 1, duration: 0.12 }, ">+0.05");
  });
  tl.to({}, { duration: 0.8 });

  // 7 → 8 选择交易流水范围
  go(tl, p7, p8, ">");

  // 8 → 9 点开始日期 → 选择时间
  cur.toAt(tl, startRow.row, { duration: 0.4, at: ">+1.2" });
  cur.click(tl, startRow.row, ">");
  tl.set([dtMask, dtSheet], { visibility: "visible" }, ">")
    .to(dtMask, { opacity: 1, duration: 0.2 }, "<")
    .to(dtSheet, { y: 0, duration: 0.3, ease: "power3.out" }, "<");

  // 9 滚一格确认选中（已在 2026/11/10）
  cur.toAt(tl, cD.items[3], { duration: 0.3, at: ">+0.9" });
  tl.to({}, { duration: 0.4 });

  // 9 → 8 确定，回填
  cur.toAt(tl, dtOk, { duration: 0.34, at: ">+0.5" });
  cur.click(tl, dtOk, ">");
  tl.to(dtSheet, { y: "100%", duration: 0.26, ease: "power3.in" }, ">")
    .to(dtMask, { opacity: 0, duration: 0.2 }, "<")
    .set([dtMask, dtSheet], { visibility: "hidden" }, ">")
    .call(() => {
      startRow.value.textContent = "2026-11-10";
      startRow.value.classList.remove("is-ph");
      endRow.value.textContent = "2026-11-10";
      endRow.value.classList.remove("is-ph");
      nextBtn.classList.remove("is-disabled");
    }, null, ">+0.1");
  tl.to({}, { duration: 0.9 });

  // 8 → 10 点下一步
  cur.toAt(tl, nextBtn, { duration: 0.4, at: ">+0.3" });
  cur.click(tl, nextBtn, ">");
  go(tl, p8, p10, ">");

  // 10 输入邮箱
  cur.toAt(tl, mailInput, { duration: 0.36, at: ">+0.6" });
  cur.click(tl, mailInput, ">");
  tl.call(() => { mailText.textContent = ""; mailText.className = "d-dy-mailval"; }, null, ">+0.1");
  typeText(tl, mailText, "demo_user", { cps: 13, at: ">+0.15" });
  tl.to({}, { duration: 0.3 });
  tl.call(() => { suggest.style.display = ""; }, null, ">");
  tl.fromTo(suggest, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.24 }, "<");

  // 点第一条联想
  cur.toAt(tl, suggestItems[1], { duration: 0.34, at: ">+0.6" });
  cur.click(tl, suggestItems[1], ">");
  tl.call(() => {
    mailText.textContent = MAIL;
    suggest.style.display = "none";
    sendBtn.classList.remove("is-disabled");
  }, null, ">+0.1");
  tl.to({}, { duration: 0.9 });

  // 10 → 11 点发送 → 确认弹窗
  cur.toAt(tl, sendBtn, { duration: 0.38, at: ">+0.3" });
  cur.click(tl, sendBtn, ">");
  tl.set([cfMask, cfCard], { visibility: "visible" }, ">")
    .to(cfMask, { opacity: 1, duration: 0.2 }, "<")
    .fromTo(cfCard, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.22 }, "<");

  // 11 → 12 确认发送 → 申请已提交
  cur.toAt(tl, cfOk, { duration: 0.34, at: ">+1.0" });
  cur.click(tl, cfOk, ">");
  tl.to(cfMask, { opacity: 0, duration: 0.18 }, ">")
    .to(cfCard, { opacity: 0, scale: 0.96, duration: 0.18 }, "<")
    .set([cfMask, cfCard], { visibility: "hidden" }, ">");
  go(tl, p10, p12, ">");

  // 收尾
  tl.to({}, { duration: 2.4 });
  cur.hide(tl, ">");
  strip.result(tl, "电子回单发到邮箱 · 解压密码在此页", "<");

  return tl;
}

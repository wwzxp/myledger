/**
 * 演示舞台的 UI 积木。
 *
 * 场景只负责"摆积木 + 编时间线"，样式细节都在这里和 demo.css。
 * 所有积木都返回 DOM，动画由场景挂到自己的 timeline 上。
 */

const NS = "d";

/** 建元素并加 demo 前缀的 class。 */
export function h(tag, cls, parent) {
  const el = document.createElement(tag);
  if (cls) el.className = cls.split(" ").map((c) => `${NS}-${c}`).join(" ");
  if (parent) parent.appendChild(el);
  return el;
}

/** 场景顶部的"此刻在说什么"条。 */
export function scenario(root, text, { local = false } = {}) {
  const el = h("div", "scenario", root);
  const left = h("div", "scenario-text", el);
  left.textContent = text;
  const right = h("div", "scenario-result", el);
  if (local) {
    const badge = h("span", "scenario-local", el);
    badge.textContent = "仅本机";
  }
  el.style.display = "flex";
  return {
    el,
    /** 往调用方的时间线里加，position 默认 ">"。 */
    in(tl, at = 0) {
      tl.from(el, { y: -14, opacity: 0, duration: 0.35, ease: "power2.out" }, at);
      return tl;
    },
    result(tl, text, at = ">") {
      tl.call(() => { right.textContent = text; }, null, at)
        .fromTo(right, { opacity: 0, x: 8 }, { opacity: 1, x: 0, duration: 0.3 }, "<");
      return tl;
    },
  };
}

/**
 * 手机界面外壳。用于"去微信/支付宝导出账单"这类跨应用场景。
 * 写实布局，但不复制官方图标——头像/图标一律用几何占位。
 */
export function phone(root, { title = "", brand = "neutral" } = {}) {
  const wrap = h("div", "phone", root);
  wrap.dataset.brand = brand;

  const status = h("div", "phone-status", wrap);
  status.innerHTML = '<span class="d-phone-time">9:41</span><span class="d-phone-icons">▮▮▮ ⌁</span>';

  const bar = h("div", "phone-bar", wrap);
  const back = h("span", "phone-back", bar);
  back.textContent = "‹";
  const titleEl = h("span", "phone-title", bar);
  titleEl.textContent = title;
  const more = h("span", "phone-more", bar);
  more.textContent = "⋯";

  const body = h("div", "phone-body", wrap);
  wrap.style.display = "flex";

  return {
    el: wrap,
    body,
    back,
    more,
    titleEl,
    in(tl, at = 0) {
      tl.from(wrap, { y: 24, opacity: 0, duration: 0.45, ease: "power3.out" }, at);
      return tl;
    },
    /** 标题栏文字变化，用于"进了一级页面"。 */
    setTitle(text) {
      titleEl.textContent = text;
    },
  };
}

/** 手机里的一行设置项：左文字、右箭头。 */
export function row(parent, label, { note = "", highlight = false } = {}) {
  const el = h("div", "row", parent);
  if (highlight) el.classList.add(`${NS}-row-hi`);
  const main = h("div", "row-main", el);
  const name = h("span", "row-name", main);
  name.textContent = label;
  if (note) {
    const sub = h("span", "row-note", main);
    sub.textContent = note;
  }
  const arrow = h("span", "row-arrow", el);
  arrow.textContent = "›";
  return el;
}

/** 页面切换：旧内容淡出、新内容淡入。 */
export function page(parent) {
  const el = h("div", "page", parent);
  return {
    el,
    in(tl, at = 0) {
      tl.from(el, { opacity: 0, x: 18, duration: 0.3 }, at);
      return tl;
    },
    out(tl, at = 0) {
      tl.to(el, { opacity: 0, x: -18, duration: 0.25 }, at);
      return tl;
    },
  };
}

/** 光标：一个圆点 + 点击波纹。坐标相对舞台。 */
export function cursor(root) {
  const el = h("div", "cursor", root);
  const dot = h("div", "cursor-dot", el);
  const ring = h("div", "cursor-ring", el);
  el.style.display = "block";
  el.style.opacity = "0";
  el.style.left = "0px";
  el.style.top = "0px";
  // 位移用 transform，不用 left/top：避免触发布局，动画更稳
  let curX = 0;
  let curY = 0;
  const apply = () => {
    el.style.transform = `translate(${curX}px, ${curY}px)`;
  };
  apply();

  // 光标与目标都在同一棵被 transform: scale() 缩放的子树里。
  // 两者的 getBoundingClientRect 都返回屏幕坐标，直接相减即得相对位移，
  // 再除以缩放比还原到场景自己的坐标系。
  // 旧实现在这里除以了 scale 却用 box.width 当基准，分母混用导致偏移。
  const moveTo = (target) => {
    const box = root.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    // 用实际渲染宽度比场景的逻辑宽度，得到真实缩放比
    const logicalW = root.offsetWidth || box.width;
    const scale = logicalW ? box.width / logicalW : 1;
    // 目标不可见时（隐藏页、display:none 的祖先）rect 无意义，
    // 算出来会把光标甩到画外。这种情况保持原位，等页面显示后再移。
    if (!rect.width || !rect.height) return null;
    // offsetParent 为 null 说明整条祖先链都没渲染
    if (target.offsetParent === null && getComputedStyle(target).position !== "fixed") return null;

    // 落点偏右下：圆点居中会压住按钮上的文字（实测「发送」「完成」被盖住）。
    // 偏移按元素尺寸取比例，小元素（开关、图标）几乎不偏。
    // 只对「有高度的行/按钮」偏移，避免圆点压住按钮文字。
    // 矮元素（一行文字）不能再偏，否则会落到文字下方，看起来像点偏了。
    const dx = rect.width > 60 ? Math.min(rect.width * 0.26, 20) : 0;
    const dy = rect.height > 40 ? Math.min(rect.height * 0.30, 11) : 0;
    const x = (rect.left + rect.width / 2 + dx - box.left) / (scale || 1);
    const y = (rect.top + rect.height / 2 + dy - box.top) / (scale || 1);

    // 再兜一层：落点必须落在场景范围内，否则不移动
    const w = root.offsetWidth || box.width;
    const h = root.offsetHeight || box.height;
    if (x < 0 || y < 0 || x > w || y > h) return null;

    return { x, y };
  };

  return {
    el,
    show(tl, at = 0) {
      tl.to(el, { opacity: 1, scale: 1, duration: 0.25, ease: "power2.out" }, at);
      return tl;
    },
    // 目标坐标必须在动画真正播放时才取：菜单弹出、页面切换都有过渡，
    // 构建时间点取到的是起始状态，位置当然是错的。
    toAt(tl, target, opts = {}) {
      const dur = opts.duration ?? 0.45;
      tl.call(() => {
        const p = moveTo(target);
        if (!p) return;              // 目标不可见，光标留在原处
        if (p.x === curX && p.y === curY) return;
        const gsap = window.gsap;
        gsap.to({ x: curX, y: curY }, {
          x: p.x,
          y: p.y,
          duration: dur,
          ease: "power2.inOut",
          onUpdate() {
            curX = this.targets()[0].x;
            curY = this.targets()[0].y;
            apply();
          },
        });
      }, null, opts.at ?? ">");
      // 关键：光标补间是独立于时间线的 GSAP tween，tl.call 会立刻返回。
      // 不补一个等长占位，时间线会马上进入 click / 切页，
      // 表现为「光标还在路上，页面已经跳了」。
      tl.to({}, { duration: dur }, "<");
      return tl;
    },
    // 只画点击波纹，不再移动光标位置。
    // 场景里已经先调用 toAt 定位，若这里再移一次，
    // 会因为页面已开始淡出而取到错误坐标。
    click(tl, target, at = ">") {
      // target 保留参数位，便于日后需要单独定位的场合
      tl.fromTo(ring, { scale: 0.4, opacity: 0.9 },
        { scale: 1.6, opacity: 0, duration: 0.5, ease: "power2.out" }, at);
      return tl;
    },
    hide(tl, at = ">") {
      tl.to(el, { opacity: 0, duration: 0.2 }, at);
      return tl;
    },
  };
}

/** 右下角的成功印章。 */
export function ok(root, text, { en = "" } = {}) {
  const el = h("div", "ok", root);
  el.innerHTML = `<b>${text}</b>${en ? `<span>${en}</span>` : ""}`;
  el.style.display = "flex";
  el.style.opacity = "0";
  return function okIn(tl, at = ">") {
    tl.to(el, { scale: 1, opacity: 1, duration: 0.28, ease: "back.out(2)" }, at);
    return tl;
  };
}

/** 逐字打字，返回一个 timeline。 */
export function type(tl, el, text, { cps = 18, at = ">" } = {}) {
  const chars = [...text];
  const state = { n: 0 };
  tl.call(() => { el.textContent = ""; }, null, at);
  tl.to(state, {
    n: chars.length,
    duration: Math.max(0.2, chars.length / cps),
    ease: "none",
    onUpdate() {
      el.textContent = chars.slice(0, Math.round(state.n)).join("");
    },
  }, "<");
  return tl;
}

/**
 * 高亮闪烁。
 *
 * 注意：`addClass`/`removeClass` 是 GSAP 的 animation 方法，不在 timeline 实例上。
 * 这里直接用原生 classList + 一段时长控制，避免依赖 CSSPlugin 的具体签名。
 */
export function flash(tl, el, { color = "neon", duration = 0.55, at = ">" } = {}) {
  const cls = `is-flash-${color}`;
  tl.call(() => el.classList.add(cls), null, at)
    .to(el, { duration }, "<")
    .call(() => el.classList.remove(cls));
  return tl;
}

/** 步骤列表：逐条点亮当前步骤。 */
export function steps(parent, items) {
  const wrap = h("div", "steps", parent);
  const els = items.map((text) => {
    const rowEl = h("div", "step", wrap);
    const num = h("span", "step-num", rowEl);
    const label = h("span", "step-text", rowEl);
    label.textContent = text;
    return { rowEl, num, label };
  });
  els.forEach((e, i) => { e.num.textContent = String(i + 1).padStart(2, "0"); });
  return {
    el: wrap,
    in(tl, at = 0) {
      tl.from(els.map((e) => e.rowEl), { opacity: 0, x: -10, duration: 0.3, stagger: 0.08 }, at);
      return tl;
    },
    /** 点亮第 i 步（其余保持暗态）。 */
    light(tl, i, at = ">") {
      tl.call(() => {
        els.forEach((e, k) => {
          e.rowEl.classList.toggle(`${NS}-step-on`, k === i);
          e.rowEl.classList.toggle(`${NS}-step-done`, k < i);
        });
      }, null, at);
      if (els[i]) tl.from(els[i].rowEl, { scale: 1.03, duration: 0.2, yoyo: true, repeat: 1 }, "<");
      return tl;
    },
    allDone(tl, at = ">") {
      tl.call(() => {
        els.forEach((e) => {
          e.rowEl.classList.remove(`${NS}-step-on`);
          e.rowEl.classList.add(`${NS}-step-done`);
        });
      }, null, at);
      return tl;
    },
  };
}

/** 看板预览卡片：模拟导入后右侧出现的月度数字。 */
export function statCard(parent, { label = "", value = "", tone = "" } = {}) {
  const el = h("div", "stat", parent);
  const lb = h("div", "stat-label", el);
  lb.textContent = label;
  const val = h("div", "stat-value", el);
  val.textContent = value;
  if (tone) val.dataset.tone = tone;
  return {
    el,
    valueEl: val,
    /** 数字滚动到目标值。 */
    count(tl, to, { duration = 0.8, prefix = "", suffix = "", at = ">" } = {}) {
      const state = { v: 0 };
      tl.to(state, {
        v: to,
        duration,
        ease: "power2.out",
        onUpdate() {
          val.textContent = `${prefix}${state.v.toLocaleString("zh-CN", {
            minimumFractionDigits: 2, maximumFractionDigits: 2,
          })}${suffix}`;
        },
      }, at);
      return tl;
    },
  };
}

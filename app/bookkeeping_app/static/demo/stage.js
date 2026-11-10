/**
 * 演示舞台：640×400 固定坐标系 + 等比缩放 + 自动播放。
 *
 * 场景一律按 640×400 写死坐标，换容器大小只改一个 transform: scale()。
 */
import { DEMO_FLAT, findDemo } from "./catalog.js";
import { SCENES } from "./scenes/index.js";

export const SCREEN_W = 560;
export const SCREEN_H = 700;

const HOLD = 0.9;        // 每条播完后停留，再切下一条
const GAP = 0.35;        // 切场扫描光时长

export function createStage(gsap, root, { reduced = false, onIndexChange = null } = {}) {
  const items = DEMO_FLAT.filter((it) => SCENES[it.key]);

  root.innerHTML = "";
  root.classList.add("d-stage-root");

  // ── 外框：HUD 头部 / 舞台 / 底部说明 / 进度线 ──
  const hud = el("div", "d-hud", root);
  const hudLeft = el("div", "d-hud-left", hud);
  const hudOp = el("span", "d-hud-op", hudLeft);
  const hudGroup = el("span", "d-hud-group", hudLeft);
  const hudTitle = el("span", "d-hud-title", hudLeft);
  const hudTag = el("span", "d-hud-tag", hud);

  const box = el("div", "d-stage-box", root);
  const screen = el("div", "d-stage-screen", box);
  const sweep = el("div", "d-stage-sweep", box);
  const corners = el("div", "d-stage-corners", box);

  const foot = el("div", "d-stage-foot", root);
  const footName = el("div", "d-foot-name", foot);
  const footBtn = el("div", "d-foot-btn", foot);
  const footWhy = el("div", "d-foot-why", foot);

  const barWrap = el("div", "d-stage-bar", root);
  const barFill = el("div", "d-stage-bar-fill", barWrap);
  barFill.style.transformOrigin = "left center";
  let bar;

  screen.style.width = `${SCREEN_W}px`;
  screen.style.height = `${SCREEN_H}px`;

  let run = null;
  let pending = null;
  let index = 0;
  let active = true;
  let userPaused = false;
  let destroyed = false;

  const fit = () => {
    const w = box.clientWidth || SCREEN_W;
    const s = Math.min(1, w / SCREEN_W);
    screen.style.transform = `scale(${s})`;
    box.style.setProperty("--d-scale", String(s));
  };

  const clearScene = () => {
    if (run) { run.kill(); run = null; }
    if (pending) { pending.kill(); pending = null; }
    screen.innerHTML = "";
    screen.style.opacity = "1";
  };

  const mountScene = (item) => {
    clearScene();

    // HUD 文字
    hudOp.textContent = `OP ${String(index + 1).padStart(2, "0")} / ${String(items.length).padStart(2, "0")}`;
    hudGroup.textContent = `${item.groupLabel} · ${item.groupTag}`;
    hudTitle.textContent = item.name;
    hudTag.textContent = `PRO · ${item.groupTag}`;
    footName.textContent = item.name;
    footBtn.textContent = item.use || "";
    footWhy.textContent = item.need || "";

    const found = findDemo(item.key);
    const scene = SCENES[item.key];

    // 直接把 run 交给场景往里 add，避免把 paused timeline 嵌套进另一个
    // timeline：嵌套后 child 不受父级 play 驱动，动画会停在起始态。
    run = gsap.timeline({
      paused: true,
      onComplete: () => {
        pending = gsap.delayedCall(HOLD, () => next());
      },
    });
    scene({ root: screen, tl: run, reduced, item: found?.item ?? item });
    const total = run.duration();

    // 进度条作为 run 的一个 tween，而不是独立 timeline（同样避免嵌套）
    if (bar) bar.kill();
    bar = run.fromTo(
      barFill,
      { scaleX: 0 },
      { scaleX: 1, duration: Math.max(total, 0.1), ease: "none" },
      0,
    );

    // 只要不是用户主动暂停、也没有销毁，新场景就应该立刻开始播。
    // 这里显式调用 play(0)，不经过 syncPause（它会在某些时序下把刚建的 run 暂停）。
    if (active && !userPaused && !destroyed) {
      run.play(0);
    } else {
      run.pause(0);
    }
    if (onIndexChange) onIndexChange(index, items.length);
  };

  const next = () => {
    if (destroyed) return;
    index = (index + 1) % items.length;
    show(items[index].key);
  };

  const show = (key) => {
    const at = items.findIndex((it) => it.key === key);
    if (at >= 0) index = at;
    const item = items[index];

    if (run) run.pause();
    if (pending) { pending.kill(); pending = null; }

    // 换场：扫描光只是装饰；场景重建同步做，避免 timeline 被后续操作打断
    mountScene(item);
    gsap.fromTo(
      sweep,
      { xPercent: -120, opacity: 1 },
      { xPercent: 120, duration: GAP, ease: "power1.inOut", onComplete: () => { sweep.style.opacity = "0"; } },
    );
  };

  const syncPause = () => {
    const shouldRun = active && !userPaused && !destroyed;
    if (run) (shouldRun ? run.play() : run.pause());
    if (pending) (shouldRun ? pending.play() : pending.pause());
    if (bar) (shouldRun ? bar.play() : bar.pause());
  };

  // ── 生命周期 ──
  const onVisibility = () => { active = !document.hidden; syncPause(); };
  document.addEventListener("visibilitychange", onVisibility);

  const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const onReduce = () => { if (reduceQuery.matches) { userPaused = true; syncPause(); } };
  reduceQuery.addEventListener?.("change", onReduce);

  const restart = () => { userPaused = false; mountScene(items[index]); };

  window.addEventListener("resize", fit);
  fit();
  if (items.length) mountScene(items[0]);

  return {
    get index() { return index; },
    keys: items.map((it) => it.key),
    show,
    next,
    prev() { index = (index - 1 + items.length) % items.length; show(items[index].key); },
    pause() {
      userPaused = true;
      if (run) run.pause();
      if (pending) pending.pause();
      if (bar) bar.pause();
    },
    resume() {
      userPaused = false;
      if (run && active && !destroyed) run.play();
      if (pending && active && !destroyed) pending.play();
      if (bar && active && !destroyed) bar.play();
    },
    toggle() { userPaused = !userPaused; syncPause(); return userPaused; },
    restart,
    /** 定格到第 t 秒，便于验收/截图。 */
    seek(t) {
      userPaused = true;
      syncPause();
      if (run) run.seek(Math.min(t, run.duration()), false);
      if (bar) bar.seek(Math.min(t, bar.duration()), false);
    },
    setActive(v) { active = v; syncPause(); },
    destroy() {
      destroyed = true;
      clearScene();
      document.removeEventListener("visibilitychange", onVisibility);
      reduceQuery.removeEventListener?.("change", onReduce);
      window.removeEventListener("resize", fit);
      root.innerHTML = "";
    },
  };
}

function el(tag, cls, parent) {
  const node = document.createElement(tag);
  node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

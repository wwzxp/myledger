/**
 * 导入页功能演示：创建面板（左侧清单 + 右侧舞台）。
 *
 * 用法：
 *   const panel = createDemoPanel(rootEl);
 *   panel.play();   // 打开弹窗时
 *   panel.pause();  // 关闭时
 *   panel.destroy();
 */
import { DEMO_GROUPS, findDemo } from "./catalog.js";
import { createStage } from "./stage.js";

export function createDemoPanel(root, { onClose = null, gsap = null } = {}) {
  const gsapLib = gsap || window.gsap;
  if (!gsapLib) throw new Error("缺少 GSAP：请先加载 /static/demo/gsap.min.js");
  const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = reduceQuery.matches;

  root.innerHTML = "";
  // overlay 只负责遮罩；真正的面板是里面这一层，样式全部挂在 .d-panel 上
  const shell = el("div", "d-panel", root);
  shell.setAttribute("role", "dialog");
  shell.setAttribute("aria-modal", "true");
  shell.setAttribute("aria-label", "功能演示");

  // ── 顶栏 ──
  const top = el("div", "d-panel-top", shell);
  const topLeft = el("div", "d-panel-top-left", top);
  const badge = el("span", "d-panel-badge", topLeft);
  badge.textContent = "PRO";
  const topTitle = el("span", "d-panel-title", topLeft);
  topTitle.textContent = "导入前先看看怎么走";
  const closeBtn = el("button", "d-panel-close", top);
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "关闭演示");
  closeBtn.textContent = "×";

  // ── 主体：左清单 + 右舞台 ──
  const body = el("div", "d-panel-body", shell);

  const list = el("nav", "d-list", body);
  list.setAttribute("aria-label", "演示清单");

  const rightWrap = el("div", "d-right", body);
  const stage = el("div", "d-stage-host", rightWrap);

  // ── 底部统计 ──
  const foot = el("div", "d-panel-foot", shell);
  const footLeft = el("span", "d-panel-foot-left", foot);
  const footRight = el("span", "d-panel-foot-right", foot);
  footRight.textContent = "所有数据都在本机处理";

  // ── 渲染清单 ──
  const itemButtons = new Map();
  for (const group of DEMO_GROUPS) {
    const gEl = el("div", "d-list-group", list);
    const head = el("div", "d-list-head", gEl);
    head.innerHTML = `<span class="d-list-caret">▶</span>` +
      `<span class="d-list-label">${group.label}</span>` +
      `<span class="d-list-count">${String(group.items.length).padStart(2, "0")}</span>` +
      `<span class="d-list-tag">${group.tag}</span>`;

    for (const item of group.items) {
      const btn = el("button", "d-list-item", gEl);
      btn.type = "button";
      btn.dataset.key = item.key;
      btn.innerHTML = `<span class="d-list-num"></span><span class="d-list-name">${item.name}</span>`;
      itemButtons.set(item.key, btn);
    }
  }

  // ── 舞台 ──
  // 回调会在 createStage 初始化时同步触发，那时 stageApi 还没赋值，
  // 所以这里用 let + 容错读取，而不是直接引用常量。
  let stageApi = null;
  stageApi = createStage(gsapLib, stage, {
    reduced,
    onIndexChange: (i, total) => {
      const keys = stageApi ? stageApi.keys : [];
      const key = keys[i];
      itemButtons.forEach((btn, k) => btn.classList.toggle("is-on", k === key));
      footLeft.textContent = `${total} 项 · 本地处理 / 自动播放`;
      // 编号：按当前清单顺序
      let n = 0;
      for (const group of DEMO_GROUPS) {
        for (const item of group.items) {
          n += 1;
          const b = itemButtons.get(item.key);
          if (b) b.querySelector(".d-list-num").textContent = String(n).padStart(2, "0");
        }
      }
    },
  });

  itemButtons.forEach((btn, key) => {
    btn.addEventListener("click", () => stageApi.show(key));
  });

  closeBtn.addEventListener("click", () => {
    stageApi.pause();
    if (onClose) onClose();
  });

  // ESC 关闭
  const onKey = (e) => {
    if (e.key === "Escape") {
      stageApi.pause();
      if (onClose) onClose();
    }
  };
  document.addEventListener("keydown", onKey);

  return {
    el: root,
    stage: stageApi,
    play() { stageApi.resume(); },
    pause() { stageApi.pause(); },
    destroy() {
      document.removeEventListener("keydown", onKey);
      stageApi.destroy();
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

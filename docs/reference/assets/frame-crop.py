#!/usr/bin/env python3
"""
frame-crop.py —— 把录屏帧切成「能看清」的小图，交给视觉模型读。

为什么不用 OCR：
实测同一张图，OCR 把 ¥33.56 读成 ?33.56、把图标读成「司」「日」「圆」，
而把行裁出来放大 3 倍后交给视觉模型，全部读对，还能看出图标形状与颜色深浅。
**视觉比 OCR 准，且不用装任何模型。**

这个脚本只做两件事：
1. 数（像素分析）：卡片、行、箭头、色块 —— 这些有确定答案，不该靠眼睛
2. 切（裁图）：把每行裁出来放大，交给 read 去看文字

用法：
  python frame-crop.py <帧> --outdir crops/
  python frame-crop.py <帧> --outdir crops/            # 默认 5 倍
  python frame-crop.py <帧> --outdir crops/ --scale 3  # 字够大时可以降

输出：
  crops/row01.png ...   每行一张，已放大
  crops/summary.json    数出来的结构（卡片/行/箭头/颜色）
  crops/index.md        给视觉模型看的清单，含每张图的文件名与坐标
"""

from __future__ import annotations

import argparse
import colorsys
import json
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("缺少 Pillow：pip install Pillow")

import numpy as np


# ── 数：卡片 ────────────────────────────────────────────────
def find_cards(a: np.ndarray, min_height: int = 40) -> list[tuple[int, int]]:
    """白卡：整行 80% 以上不是页面灰底。"""
    h, w, _ = a.shape
    row = a.mean(axis=2)
    gray_lo, gray_hi = 228, 242

    is_gap = [
        np.sum((row[y] >= gray_lo) & (row[y] <= gray_hi)) > w * 0.8
        for y in range(h)
    ]

    runs: list[list[int]] = []
    for y, gap in enumerate(is_gap):
        if not gap:
            continue
        if runs and y - runs[-1][-1] <= 1:
            runs[-1].append(y)
        else:
            runs.append([y])
    gaps = [(r[0], r[-1]) for r in runs if len(r) >= 3]

    cards = []
    for i in range(len(gaps) - 1):
        y0, y1 = gaps[i][1] + 1, gaps[i + 1][0] - 1
        if y1 - y0 >= min_height:
            cards.append((y0, y1))
    return cards


# ── 数：行 ──────────────────────────────────────────────────
def find_rows(a: np.ndarray, y0: int, y1: int) -> list[tuple[int, int]]:
    """卡内文字行：高度 ≥6px 的暗区。1-2px 的是分隔线。"""
    h, w, _ = a.shape
    x0, x1 = int(w * 0.12), int(w * 0.94)

    ys = [y for y in range(y0 + 2, min(y1 - 1, h))
          if a[y, x0:x1].mean() < 250.5]
    groups: list[list[int]] = []
    for y in ys:
        if groups and y - groups[-1][-1] <= 2:
            groups[-1].append(y)
        else:
            groups.append([y])
    return [(g[0], g[-1]) for g in groups if g[-1] - g[0] + 1 >= 6]


# ── 数：箭头 ────────────────────────────────────────────────
def count_chevrons(a: np.ndarray, cards: list[tuple[int, int]]) -> int:
    """
    只在卡片区域内数，且只认高度 8-14px 的浅灰细线。
    不限高会把状态栏电池、导航栏图标算成箭头（实测 10 个被数成 13 个）。
    """
    h, w, _ = a.shape
    x0, x1 = int(w * 0.90), int(w * 0.99)
    band = a[:, x0:x1].mean(axis=2)

    hits = 0
    for (cy0, cy1) in cards:
        active = [
            y for y in range(cy0, min(cy1, h))
            if np.sum((band[y] > 150) & (band[y] < 215)) >= 1
        ]
        groups: list[list[int]] = []
        for y in active:
            if groups and y - groups[-1][-1] <= 3:
                groups[-1].append(y)
            else:
                groups.append([y])
        hits += sum(1 for g in groups if 8 <= len(g) <= 14)
    return hits


# ── 数：颜色 ────────────────────────────────────────────────
def sample_colors(a: np.ndarray, cards: list[tuple[int, int]]) -> list[dict]:
    """
    在每行左侧图标区找彩色（饱和度 >0.30）。
    按语义色名分桶，不用纯色相分档：15° 一档会把同一个黄色拆成两个。
    """
    h, w, _ = a.shape
    x0, x1 = int(w * 0.03), int(w * 0.18)

    def bucket_of(hh: float) -> str:
        d = hh * 360
        if d < 15 or d >= 345:
            return "红"
        if d < 45:
            return "橙"
        if d < 70:
            return "黄"
        if d < 160:
            return "绿"
        if d < 200:
            return "青"
        if d < 260:
            return "蓝"
        return "紫"

    buckets: dict[str, list] = {}
    for (cy0, cy1) in cards:
        for y in range(cy0, min(cy1, h), 3):
            for x in range(x0, x1, 2):
                r, g, b = (a[y, x] / 255.0)[:3]
                hh, ss, vv = colorsys.rgb_to_hsv(r, g, b)
                if ss > 0.30 and vv > 0.35:
                    buckets.setdefault(bucket_of(hh), []).append((x, y, a[y, x]))

    out = []
    for name, pts in sorted(buckets.items(), key=lambda kv: -len(kv[1])):
        if len(pts) < 8:
            continue
        px = np.array([p[2] for p in pts]).mean(axis=0).astype(int)
        out.append({
            "bucket": name,
            "hex": "#{:02x}{:02x}{:02x}".format(*px),
            "count": len(pts),
            "sample_xy": [int(pts[0][0]), int(pts[0][1])],
        })
    return out


# ── 主流程 ──────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--outdir", default="crops")
    ap.add_argument(
        "--emit-spec",
        metavar="PATH",
        help="按基准帧结构直接生成 screens.json 骨架（阈值来自实测，不是猜的）",
    )
    ap.add_argument("--scale", type=int, default=5,
                    help="放大倍数。默认 5：实测 320px 宽的手机截图里汉字只有 8-13px，"
                         "3 倍仍是模糊块，5 倍才稳定可读")
    args = ap.parse_args()

    img = Image.open(args.image).convert("RGB")
    a = np.array(img).astype(int)
    h, w, _ = a.shape

    os.makedirs(args.outdir, exist_ok=True)

    cards = find_cards(a)
    fallback = False

    # 没有白卡时不代表「没有内容」：表单页、全屏列表、深色背景都可能没有卡片
    # 兜底：整屏当作一张卡，行检测照常做
    if not cards:
        fallback = True
        cards = [(int(h * 0.06), int(h * 0.94))]
        print("[warn] 未检测到白卡结构，按整屏处理（表单页/全屏列表常见）")

    chevrons = count_chevrons(a, cards)
    colors = sample_colors(a, cards)

    structure = {"source": args.image, "size": [w, h], "cards": []}
    lines = []

    row_index = 0
    for ci, (cy0, cy1) in enumerate(cards, 1):
        rows = find_rows(a, cy0, cy1)
        card = {"index": ci, "y0": cy0, "y1": cy1, "rows": []}

        for (ry0, ry1) in rows:
            row_index += 1
            pad_top = 5
            pad_bottom = 5
            crop = img.crop((0, max(0, ry0 - pad_top), w, min(h, ry1 + pad_bottom)))
            crop = crop.resize((crop.width * args.scale, crop.height * args.scale),
                               Image.LANCZOS)
            name = f"row{row_index:02d}.png"
            crop.save(os.path.join(args.outdir, name))

            card["rows"].append({
                "index": row_index,
                "y": round((ry0 + ry1) / 2),
                "crop": name,
            })
            lines.append(
                f"| {ci} | {row_index} | y={round((ry0+ry1)/2)} | {name} |"
            )

        structure["cards"].append(card)

    structure["totals"] = {
        "cards": 0 if fallback else len(cards),
        "rows": row_index,
        "chevrons": chevrons,
    }
    structure["fallback"] = fallback
    structure["colors"] = colors

    if args.emit_spec:
        # 阈值只放「基准帧客观量出来的」：卡片数、行数、箭头数、颜色种类数。
        # 不放 mutedText / clickables / textNodes —— 这些是渲染后的 DOM 度量，
        # 和基准帧的像素统计口径不同，硬塞会得到永远过不了的门槛（实测踩过）。
        spec = {
            "_comment": ("由 frame-crop.py --emit-spec 生成。" +
                         ("【低置信】未识别卡片结构，minStats 已省略，请自己按读图结果填。" if fallback
                          else "阈值来自基准帧实测。")),
            "cursor": True,
            "screens": [
                {
                    "name": "TODO-改成一屏的名字",
                    "expectText": "TODO-改成屏幕上必然出现的短标题",
                    "mustContain": ["TODO-逐条填已确认的文案"],
                    # 像素口径与 DOM 口径不同：find_rows 数的是「暗区文字块」，
                    # __collectStats.rows 数的是「渲染后的行元素」，实测差 1.5-2.5 倍。
                    # 未识别卡片结构时（fallback）像素行数不可信，直接不给 minStats。
                    **({"minStats": {
                        "rows": max(0, int(row_index * 0.6)),
                        "chevrons": max(0, int(chevrons * 0.6)),
                    }} if not fallback else {}),
                    "timeout": 8000,
                }
            ],
        }
        with open(args.emit_spec, "w", encoding="utf-8") as f:
            json.dump(spec, f, ensure_ascii=False, indent=2)
        print(f"  已生成 spec 骨架：{args.emit_spec}")

    with open(os.path.join(args.outdir, "summary.json"), "w", encoding="utf-8") as f:
        json.dump(structure, f, ensure_ascii=False, indent=2)

    # 给视觉模型看的清单
    md = [
        f"# {os.path.basename(args.image)} 切片清单",
        "",
        f"原图 {w}x{h}，放大 {args.scale} 倍后逐行裁出。",
        "",
        f"## 像素数出来的结构（这部分不用你看，直接用）",
        "",
        f"- 卡片：{len(cards)} 张",
        f"- 行：{row_index} 行",
        f"- 右侧箭头：{chevrons} 个",
        "- 图标颜色：" + "、".join(
            f"{c['bucket']} {c['hex']}" for c in colors
        ),
        "",
        "## 每行配图（请逐张 read 打开，记下文字）",
        "",
        "| 卡 | 行 | y 中心 | 图 |",
        "|---|---|---|---|",
        *lines,
        "",
        "## 读完后填这张表",
        "",
        "| 行 | 主标题 | 副标题 | 右侧值 | 图标形状 | 图标色 |",
        "|---|---|---|---|---|---|",
    ]
    with open(os.path.join(args.outdir, "index.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(md))

    # ── 合成大图：把相邻几行竖向拼起来 ──
    # 目的：减少 read 次数。一次读一张合成图看 3-5 行，
    # 比读 10 张单行图快，但绝不能把 10 行拼成一张（会看不清）。
    GROUP = 3
    group_files = []
    for gi in range(0, row_index, GROUP):
        chunk = list(range(gi + 1, min(gi + GROUP, row_index) + 1))
        if not chunk:
            continue
        imgs = [Image.open(os.path.join(args.outdir, f"row{n:02d}.png")) for n in chunk]
        total_h = sum(im.height for im in imgs) + 6 * (len(imgs) - 1)
        max_w = max(im.width for im in imgs)
        canvas = Image.new("RGB", (max_w, total_h), (255, 255, 255))
        y = 0
        for im in imgs:
            canvas.paste(im, (0, y))
            y += im.height + 6
        name = f"group{gi // GROUP + 1:02d}.png"
        canvas.save(os.path.join(args.outdir, name))
        group_files.append({"rows": chunk, "file": name})

    structure["groups"] = group_files
    with open(os.path.join(args.outdir, "summary.json"), "w", encoding="utf-8") as f:
        json.dump(structure, f, ensure_ascii=False, indent=2)

    # 追加到索引
    with open(os.path.join(args.outdir, "index.md"), "a", encoding="utf-8") as f:
        f.write("\n## 合成图（每张含 3 行，读图次数可减半）\n\n")
        f.write("| 图 | 包含行 |\n|---|---|\n")
        for g in group_files:
            f.write(f"| {g['file']} | {', '.join(str(n) for n in g['rows'])} |\n")
        f.write("\n**注意**：合成图最多 3 行。再多就模糊了，失去放大意义。\n")

    print(f"已切到 {args.outdir}/")
    if fallback:
        print(f"  [低置信] 未识别卡片结构，按整屏处理；行 {row_index} 行，箭头 {chevrons} 个")
        print("           这种布局（表单页 / 全屏列表 / 无白卡）的行数不可信，")
        print("           只当参考；以你自己读图数出来的为准。")
    else:
        print(f"  卡片 {len(cards)} 张，行 {row_index} 行，箭头 {chevrons} 个")
    print(f"  颜色 {len(colors)} 种：{'、'.join(c['bucket'] for c in colors)}")
    print(f"  清单：{os.path.join(args.outdir, 'index.md')}")


if __name__ == "__main__":
    main()

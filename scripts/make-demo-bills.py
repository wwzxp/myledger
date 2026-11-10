#!/usr/bin/env python3
"""生成合成账单用于部署验证。

**不读取任何真实账单**：所有商户名、金额、单号都是编的。
输出两份文件，字段结构与真实导出的支付宝 CSV、微信 XLSX 一致：

    python3 scripts/make-demo-bills.py <输出目录> [--days 45]

然后用 Web 界面或 `myledger import` 导入即可。
"""

from __future__ import annotations

import argparse
import csv
import io
import random
from datetime import datetime, timedelta
from pathlib import Path

from openpyxl import Workbook

ALIPAY_HEADER = [
    "交易时间", "交易分类", "交易对方", "对方账号", "商品说明",
    "收/支", "金额", "收/付款方式", "交易状态", "交易订单号", "商家订单号", "备注",
]

WECHAT_HEADER = [
    "交易时间", "交易类型", "交易对方", "商品", "收/支", "金额(元)",
    "支付方式", "当前状态", "交易单号", "商户单号", "备注",
]

# 全是虚构的商户，和真实数据无关
ALIPAY_MERCHANTS = [
    ("餐饮美食", "演示面馆", "牛肉面套餐", "花呗"),
    ("餐饮美食", "示例咖啡", "拿铁大杯", "余额宝"),
    ("交通出行", "演示地铁", "地铁扣费", "余额"),
    ("日用百货", "样例超市", "日用品", "花呗"),
    ("生活缴费", "示例电力", "电费充值", "余额"),
    ("文娱消费", "样例影院", "电影票", "余额宝"),
]

WECHAT_MERCHANTS = [
    ("商户消费", "演示便利店", "关东煮", "零钱"),
    ("商户消费", "样例早餐铺", "豆浆油条", "零钱"),
    ("商户消费", "示例药房", "感冒药", "招商银行储蓄卡(0000)"),
    ("商户消费", "演示书店", "技术书籍", "招商银行储蓄卡(0000)"),
    ("转账", "演示同事", "聚餐 AA", "零钱"),
]

INCOME_ITEMS = [
    ("转账", "演示公司", "工资", "招商银行储蓄卡(0000)"),
    ("转账", "演示朋友", "还款", "零钱"),
]


def _alipay_rows(days: int, seed: int) -> list[list[str]]:
    rng = random.Random(seed)
    rows: list[list[str]] = []
    start = datetime.now() - timedelta(days=days)
    for day in range(days):
        when = start + timedelta(days=day)
        for _ in range(rng.randint(0, 3)):
            level, merchant, item, pay = rng.choice(ALIPAY_MERCHANTS)
            stamp = when.replace(hour=rng.randint(7, 21), minute=rng.randint(0, 59))
            amount = f"{rng.uniform(3, 120):.2f}"
            rows.append([
                stamp.strftime("%Y-%m-%d %H:%M:%S"), level, merchant, "demo@example.com",
                item, "支出", amount, pay, "交易成功",
                f"2026{rng.randint(10**11, 10**12 - 1)}", f"M{rng.randint(10**5, 10**6 - 1)}", "",
            ])
    return rows


def _wechat_rows(days: int, seed: int) -> list[list[str]]:
    rng = random.Random(seed + 1)
    rows: list[list[str]] = []
    start = datetime.now() - timedelta(days=days)
    for day in range(days):
        when = start + timedelta(days=day)
        for _ in range(rng.randint(0, 3)):
            kind, merchant, item, pay = rng.choice(WECHAT_MERCHANTS)
            stamp = when.replace(hour=rng.randint(7, 22), minute=rng.randint(0, 59))
            rows.append([
                stamp.strftime("%Y-%m-%d %H:%M:%S"), kind, merchant, item, "支出",
                f"{rng.uniform(2, 90):.2f}", pay, "支付成功",
                f"42{rng.randint(10**16, 10**17 - 1)}", f"W{rng.randint(10**7, 10**8 - 1)}", "",
            ])
        # 偶尔来一笔收入，验证收支两个方向
        if rng.random() < 0.08:
            kind, merchant, item, pay = rng.choice(INCOME_ITEMS)
            stamp = when.replace(hour=rng.randint(9, 18), minute=rng.randint(0, 59))
            rows.append([
                stamp.strftime("%Y-%m-%d %H:%M:%S"), kind, merchant, item, "收入",
                f"{rng.uniform(200, 3000):.2f}", pay, "已存入零钱",
                f"42{rng.randint(10**16, 10**17 - 1)}", f"W{rng.randint(10**7, 10**8 - 1)}", "",
            ])
    return rows


def write_alipay(path: Path, rows: list[list[str]]) -> None:
    """支付宝导出是 GB18030、带多行前置说明。"""
    buf = io.StringIO()
    buf.write("--------------------------------------------------------------------------------\n")
    buf.write("导出信息：\n")
    buf.write("姓名:演示用户\n")
    start = datetime.now() - timedelta(days=90)
    buf.write(f"起始时间:[{start:%Y-%m-%d} 00:00:00] "
              f"终止时间:[{datetime.now():%Y-%m-%d} 23:59:59]\n")
    buf.write("导出交易类型:[全部]\n")
    buf.write(f"导出时间:[{datetime.now():%Y-%m-%d %H:%M:%S}]\n")
    buf.write(f"共{len(rows)}笔记录\n\n")
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(ALIPAY_HEADER)
    writer.writerows(rows)
    path.write_bytes(buf.getvalue().encode("gb18030"))


def write_wechat(path: Path, rows: list[list[str]]) -> None:
    """微信导出是 XLSX，表头前面有若干说明行。"""
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Sheet1"
    sheet.append(["微信支付账单明细"])
    sheet.append(["微信昵称:[演示用户]"])
    start = datetime.now() - timedelta(days=90)
    sheet.append([f"起始时间:[{start:%Y-%m-%d} 00:00:00] "
                  f"终止时间:[{datetime.now():%Y-%m-%d %H:%M:%S}]"])
    sheet.append(["导出类型:[全部账单]"])
    sheet.append([f"导出时间:[{datetime.now():%Y-%m-%d %H:%M:%S}]"])
    sheet.append([f"共{len(rows)}笔记录"])
    for _ in range(6):
        sheet.append([])
    sheet.append(WECHAT_HEADER)
    for row in rows:
        sheet.append(row)
    workbook.save(path)


def main() -> int:
    parser = argparse.ArgumentParser(description="生成合成账单（不含任何真实数据）")
    parser.add_argument("outdir", help="输出目录")
    parser.add_argument("--days", type=int, default=45, help="生成多少天，默认 45")
    parser.add_argument("--seed", type=int, default=20261108, help="随机种子，固定后可复现")
    args = parser.parse_args()

    out = Path(args.outdir)
    out.mkdir(parents=True, exist_ok=True)

    alipay_rows = _alipay_rows(args.days, args.seed)
    wechat_rows = _wechat_rows(args.days, args.seed)

    alipay_path = out / "演示-支付宝账单.csv"
    wechat_path = out / "演示-微信账单.xlsx"
    write_alipay(alipay_path, alipay_rows)
    write_wechat(wechat_path, wechat_rows)

    print(f"支付宝：{alipay_path}  {len(alipay_rows)} 笔")
    print(f"微信：  {wechat_path}  {len(wechat_rows)} 笔")
    print("以上全部为合成数据，可直接删除。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

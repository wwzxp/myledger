"""我的账本工具入口：把 fork 自 Bookkeeping 的 CLI 与本地 Web 合并成一条命令。

用法：
    python -m app                    # 启动本地 Web（默认 127.0.0.1:8765）
    python -m app init               # 初始化数据库
    python -m app classify-pending   # 用本地 1B 模型给待确认条目补类目
    python -m app --config PATH ...  # 指定配置文件（默认找 ./myledger.toml）

其余子命令沿用 app/bookkeeping.py（import-check / keyword-candidates /
import / confirm / summary / dashboard …）。
"""

from __future__ import annotations

import argparse
import sys

from app import bookkeeping
from app.classify import ModelUnavailable, classify_pending


def _apply_config(path: str | None) -> Path | None:
    """读取配置文件并应用到模块级路径。返回实际使用的配置文件。"""
    from app.config import load_config

    config = load_config(path)
    bookkeeping.set_db_path(config.database.path)
    return config.source


def _pending_rows(limit: int) -> list[dict]:
    bookkeeping.init_db()
    conn = bookkeeping.connect()
    try:
        rows = conn.execute(
            """
            select id, transaction_time, type, category, amount_cents,
                   transaction_object, account, note
            from entries
            where status = 'pending' and coalesce(category, '') = ''
            order by transaction_time, id
            limit ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def _classify_pending(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="python -m app classify-pending")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--dry-run", action="store_true", help="只打印，不写库")
    args = parser.parse_args(argv)

    categories = sorted(bookkeeping.valid_categories())
    rows = _pending_rows(args.limit)
    if not rows:
        print("没有待分类条目")
        return 0

    try:
        predictions = classify_pending(rows, categories)
    except ModelUnavailable as exc:
        # 规格要求：模型不可用时降级并显式提示，不能静默当作「无类目」。
        print(f"本地模型不可用，已降级为人工确认：{exc}", file=sys.stderr)
        return 2

    written = 0
    for item in predictions:
        if args.dry_run:
            print(item)
            continue
        bookkeeping.confirm_entry(item["id"], item["category"], source="pending")
        written += 1

    suffix = "（dry-run，未写库）" if args.dry_run else f"，已写入 {written} 笔"
    print(f"模型兜底：{len(predictions)} / {len(rows)} 笔命中{suffix}")
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)

    if not argv or argv[0] in {"dashboard", "web", "serve"}:
        rest = [] if not argv else argv[1:]
        return bookkeeping.main(["dashboard", *rest])

    if argv[0] == "init":
        return bookkeeping.main(["init-db"])

    if argv[0] == "classify-pending":
        return _classify_pending(argv[1:])

    if argv[0] == "backup":
        _apply_config(None)
        from app import backup as backup_mod
        from app.config import load_config

        config = load_config()
        directory = config.backup.directory or str(bookkeeping.DB_PATH.parent / "backups")
        result = backup_mod.backup_database(bookkeeping.DB_PATH, directory, keep=config.backup.keep)
        if result.created:
            print(f"已备份：{result.created}")
            print(f"清理旧备份：{len(result.removed)} 份")
            return 0
        print(f"未备份：{result.reason}", file=sys.stderr)
        return 1

    return bookkeeping.main(argv)


def _force_utf8_console() -> None:
    """让标准输出能打印中文。

    Windows 控制台默认是 cp1252/cp936，帮助文本里全是中文，
    `myledger --help` 会直接 UnicodeEncodeError 崩掉。
    Python 3.7+ 的 TextIOWrapper 支持重配置；重定向到文件时同理会失败，一并兜住。
    """
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, OSError, ValueError):
            pass


def main_cli() -> int:
    """控制台脚本入口（`myledger`）。把 `--help` 与未知子命令都交给 argparse。

    直接调用 `bookkeeping.main()` 时，`--help` 会被当成未知子命令而落到
    dashboard 分支，因此这里先拦截帮助与版本请求。
    """
    _force_utf8_console()
    argv = sys.argv[1:]
    config_path = None
    if "--config" in argv:
        index = argv.index("--config")
        if index + 1 < len(argv):
            config_path = argv[index + 1]
            argv = argv[:index] + argv[index + 2 :]
        else:
            print("--config 需要一个文件路径", file=sys.stderr)
            return 2

    if argv and argv[0] in {"-h", "--help", "help"}:
        print(
            "myledger：本地优先的账单分析工具\n\n"
            "用法：\n"
            "  myledger                  启动本地 Web（默认 127.0.0.1:8765）\n"
            "  myledger init             初始化数据库\n"
            "  myledger classify-pending 用本地模型给待确认条目补类目\n"
            "  myledger --version        显示版本\n\n"
            "其余子命令转发给 bookkeeping（import / import-check / summary / dashboard …）。\n"
            "数据库路径用环境变量 BOOKKEEPING_DB_PATH 指定。"
        )
        return 0
    if argv and argv[0] in {"-V", "--version"}:
        from app import __version__

        print(f"myledger {__version__}")
        return 0

    _apply_config(config_path)
    return main(argv)


if __name__ == "__main__":
    # 和 console_scripts 走同一个入口：否则 `python -m app --help/--version`
    # 会落到 bookkeeping 的 argparse，报「invalid choice」。
    raise SystemExit(main_cli())

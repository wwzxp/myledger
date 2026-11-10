"""配置读取：只认配置文件，不读环境变量。

配置文件查找顺序（先找到先用）：
1. 显式传入的路径（`load_config(path)`）
2. 当前目录的 `myledger.toml`
3. 用户配置目录 `~/.config/myledger/myledger.toml`
   （三大平台统一，Windows 也是这个路径，不做特殊分支）
4. 内置默认值

配置文件格式（TOML，全部可选）：

    [database]
    path = "E:/ai/apps/myledger/data/ledger.db"

    [model]
    endpoint = "http://127.0.0.1:8080/v1/chat/completions"
    name = "minicpm-v-4.7-1b"
    timeout_seconds = 30
    min_confidence = 0.55

    [import]
    # 支付宝付款方式名 → 本地账户名
    [import.account_map]
    "某银行信用卡(0000)" = "某银行信用卡"

设计约束（见 AGENTS.md §4）：配置只来自文件，不读环境变量；缺失项用默认值，
不静默继承进程环境。
"""

from __future__ import annotations

try:                      # Python 3.11+
    import tomllib
except ModuleNotFoundError:  # 3.10 及更早：用官方回移包，API 完全一致
    import tomli as tomllib
from dataclasses import dataclass, field
from pathlib import Path

CONFIG_FILENAME = "myledger.toml"


@dataclass(frozen=True)
class ModelConfig:
    endpoint: str = "http://127.0.0.1:8080/v1/chat/completions"
    name: str = "minicpm-v-4.7-1b"
    timeout_seconds: float = 30.0
    min_confidence: float = 0.55


@dataclass(frozen=True)
class DatabaseConfig:
    path: Path = Path.home() / ".local" / "share" / "myledger" / "myledger.db"


@dataclass(frozen=True)
class ImportConfig:
    account_map: dict = field(default_factory=dict)


@dataclass(frozen=True)
class MailConfig:
    """IMAP 收信配置。QQ 邮箱需用授权码，密码不写在这里时从页面输入。"""

    enabled: bool = True
    host: str = "imap.qq.com"
    port: int = 993
    mailbox: str = "INBOX"
    mailbox_dir: str = ""
    # 只扫最近 N 天的未读邮件。太大的窗口会把历史未读全翻一遍。
    scan_days: int = 7
    # 主密钥：用于加解密用户各自的授权码。不落库，只在配置文件里。
    secret_key: str = ""


@dataclass(frozen=True)
class BackupConfig:
    enabled: bool = True
    directory: str = ""
    keep: int = 14
    interval_minutes: int = 60


@dataclass(frozen=True)
class AdminConfig:
    """首次启动创建的管理员。password 为空时随机生成并打印到日志。"""

    username: str = "admin"
    password: str = ""


@dataclass(frozen=True)
class Config:
    database: DatabaseConfig = field(default_factory=DatabaseConfig)
    model: ModelConfig = field(default_factory=ModelConfig)
    import_: ImportConfig = field(default_factory=ImportConfig)
    admin: AdminConfig = field(default_factory=AdminConfig)
    backup: BackupConfig = field(default_factory=BackupConfig)
    mail: MailConfig = field(default_factory=MailConfig)
    source: Path | None = None

    @property
    def account_map(self) -> dict:
        return self.import_.account_map


def user_config_path() -> Path:
    """用户级配置文件路径。"""
    return Path.home() / ".config" / "myledger" / CONFIG_FILENAME


def candidate_paths(start: Path | None = None) -> list[Path]:
    base = Path.cwd() if start is None else Path(start)
    return [base / CONFIG_FILENAME, user_config_path()]


def load_config(path: str | Path | None = None, start: Path | None = None) -> Config:
    """读取配置。找不到文件时返回默认值，不抛错。"""
    if path is not None:
        target = Path(path).expanduser()
        if not target.is_file():
            raise FileNotFoundError(f"配置文件不存在：{target}")
        return _parse(target, target)

    for candidate in candidate_paths(start):
        # 父目录可能没有读权限（例如以服务账号运行、当前目录是 /root），
        # is_file() 会抛 PermissionError；这种情况当作「没有这个候选」跳过，
        # 不能让整条启动链路因为一个够不到的路径而失败。
        try:
            if candidate.is_file():
                return _parse(candidate, candidate)
        except (PermissionError, OSError):
            continue

    return Config()


def _parse(path: Path, source: Path) -> Config:
    with path.open("rb") as handle:
        data = tomllib.load(handle)

    database = data.get("database") or {}
    model = data.get("model") or {}
    import_section = data.get("import") or {}

    db_path = database.get("path")
    database_config = (
        DatabaseConfig(path=Path(db_path).expanduser())
        if db_path
        else DatabaseConfig()
    )

    model_config = ModelConfig(
        endpoint=str(model.get("endpoint", ModelConfig.endpoint)),
        name=str(model.get("name", ModelConfig.name)),
        timeout_seconds=float(model.get("timeout_seconds", ModelConfig.timeout_seconds)),
        min_confidence=float(model.get("min_confidence", ModelConfig.min_confidence)),
    )

    mail_section = data.get("mail") or {}
    mail_config = MailConfig(
        enabled=bool(mail_section.get("enabled", False)),
        host=str(mail_section.get("host", "imap.qq.com") or "imap.qq.com"),
        port=int(mail_section.get("port", 993) or 993),
        mailbox=str(mail_section.get("mailbox", "INBOX") or "INBOX"),
        mailbox_dir=str(mail_section.get("mailbox_dir", "") or ""),
        scan_days=int(mail_section.get("scan_days", 7) or 7),
        secret_key=str(mail_section.get("secret_key", "") or ""),
    )

    backup_section = data.get("backup") or {}
    backup_config = BackupConfig(
        enabled=bool(backup_section.get("enabled", True)),
        directory=str(backup_section.get("directory", "") or ""),
        keep=int(backup_section.get("keep", 14) or 14),
        interval_minutes=int(backup_section.get("interval_minutes", 60) or 60),
    )

    admin_section = data.get("admin") or {}
    admin_config = AdminConfig(
        username=str(admin_section.get("username", AdminConfig.username)) or "admin",
        password=str(admin_section.get("password", "") or ""),
    )

    raw_map = import_section.get("account_map") or {}
    account_map = {str(k): str(v) for k, v in raw_map.items()} if isinstance(raw_map, dict) else {}

    return Config(
        database=database_config,
        model=model_config,
        import_=ImportConfig(account_map=account_map),
        admin=admin_config,
        backup=backup_config,
        mail=mail_config,
        source=source,
    )


def save_mail_settings(
    username: str,
    password: str | None = None,
    path: str | Path | None = None,
    host: str = "imap.qq.com",
    port: int = 993,
) -> Path:
    """把邮箱凭据写回 TOML 的 [mail] 段，保留文件中其它段落。

    password 为 None 表示保持原值；空字符串表示清空。
    """
    target = Path(path) if path else _writable_config_path()
    data = {}
    if target.is_file():
        with target.open("rb") as handle:
            data = tomllib.load(handle)

    mail = dict(data.get("mail") or {})
    mail.update({
        "enabled": True,
        "host": mail.get("host", host),
        "port": mail.get("port", port),
        "username": username,
        "mailbox": mail.get("mailbox", "INBOX"),
        "mailbox_dir": mail.get("mailbox_dir", ""),
        "interval_minutes": mail.get("interval_minutes", 30),
    })
    if password is not None:
        mail["password"] = password

    data["mail"] = mail
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(_dump_toml(data), encoding="utf-8")
    return target


def _writable_config_path() -> Path:
    """优先写当前目录的 myledger.toml；没有则用用户配置路径。"""
    local = Path.cwd() / CONFIG_FILENAME
    if local.is_file():
        return local
    user = user_config_path()
    return user


def _dump_toml(data: dict) -> str:
    """极简 TOML 序列化：只支持本项目的两层结构与标量/字符串 map。"""
    lines: list[str] = []
    for section, values in data.items():
        if not isinstance(values, dict):
            continue
        lines.append(f"[{section}]")
        nested = {}
        for key, value in values.items():
            if isinstance(value, dict):
                nested[key] = value
                continue
            lines.append(f"{key} = {_toml_value(value)}")
        lines.append("")
        for sub, sub_values in nested.items():
            lines.append(f"[{section}.{sub}]")
            for key, value in sub_values.items():
                lines.append(f"{key} = {_toml_value(value)}")
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _toml_value(value) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{text}"'

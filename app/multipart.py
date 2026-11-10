"""最小 multipart/form-data 解析器（Python 3.13 已移除 cgi 模块）。

只支持本应用需要的一种形态：单文件字段，可能带普通文本字段。
不追求通用性 —— 不支持嵌套 multipart、不支持多文件重复字段。
"""

from __future__ import annotations

from dataclasses import dataclass


class MultipartError(ValueError):
    pass


@dataclass
class UploadedFile:
    field: str
    filename: str
    content: bytes


def parse_boundary(content_type: str) -> bytes:
    for part in content_type.split(";"):
        key, _, value = part.strip().partition("=")
        if key.lower() == "boundary":
            return value.strip().strip('"').encode("ascii", "ignore")
    raise MultipartError("缺少 multipart boundary")


def parse_multipart(body: bytes, boundary: bytes) -> tuple[dict[str, str], list[UploadedFile]]:
    if not boundary:
        raise MultipartError("boundary 为空")

    delimiter = b"--" + boundary
    fields: dict[str, str] = {}
    files: list[UploadedFile] = []

    for chunk in body.split(delimiter):
        # 只剥每个 part 前的那个 CRLF 和结尾的 CRLF。
        # 不能用 strip(b"\r\n")：文件本身以 \n 结尾时会被一起吃掉，
        # GB18030 编码的 CSV 少一个字节就直接解码失败。
        if chunk.startswith(b"\r\n"):
            chunk = chunk[2:]
        if chunk.endswith(b"\r\n"):
            chunk = chunk[:-2]
        if not chunk or chunk == b"--":
            continue
        head, _, payload = chunk.partition(b"\r\n\r\n")
        if not payload and not head.startswith(b"Content-Disposition"):
            continue

        headers = _parse_headers(head)
        disposition = headers.get("content-disposition", "")
        name = _param(disposition, "name")
        filename = _param(disposition, "filename")
        if not name:
            continue

        if filename is not None:
            files.append(
                UploadedFile(field=name, filename=filename, content=payload)
            )
        else:
            fields[name] = payload.decode("utf-8", errors="replace").rstrip("\r\n")

    return fields, files


def _parse_headers(head: bytes) -> dict[str, str]:
    headers: dict[str, str] = {}
    for line in head.decode("utf-8", errors="replace").split("\r\n"):
        key, _, value = line.partition(":")
        if key and value:
            headers[key.strip().lower()] = value.strip()
    return headers


def _param(disposition: str, key: str) -> str | None:
    for part in disposition.split(";"):
        name, _, value = part.strip().partition("=")
        if name.lower() == key:
            return value.strip().strip('"')
    return None

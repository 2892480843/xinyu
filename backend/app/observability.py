"""生产观测能力：结构化日志 + 请求级访问日志 + 全局异常兜底。

设计要点
--------
- **request_id 贯穿一次请求**：从入站 `X-Request-ID` 复用，没有则生成；通过 ContextVar
  让同一请求内、任意深度的 `logger` 日志都自动带上同一 request_id，便于串联排查。
- **结构化访问日志**：每个 HTTP 请求收尾时落一条 access 记录（方法/路径/状态码/耗时ms/
  客户端/查询串）。纯 ASGI 中间件实现，WebSocket / lifespan 一律透传，不影响 `/ws/reflect`。
- **全局异常兜底**：未捕获异常会被记成带 traceback 的结构化错误日志，并在尚未发送响应时
  回一个干净的 500 JSON（含 request_id，方便用户回报）。HTTPException / 422 由 FastAPI
  自己处理，会作为正常响应被 access 日志记录，不会进异常分支。
- **可切换格式**：`LOG_FORMAT=json` 走 JSON 行日志（接入 ELK/Loki/云日志友好）；
  默认 `console` 仍是人类可读的单行文本，开发体验不变。中文不转义。

仅依赖标准库 + FastAPI，不引入任何第三方 SaaS。
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi.responses import JSONResponse

from app import config

# 当前请求的 request_id（异步上下文隔离，每个请求一份）。
request_id_ctx: ContextVar[Optional[str]] = ContextVar("xinyu_request_id", default=None)

# 这些 key 若出现在 logger 的 extra 里，会被结构化 formatter 原样收进 JSON。
_EXTRA_KEYS = (
    "request_id",
    "event",
    "http_method",
    "path",
    "query",
    "status",
    "duration_ms",
    "client",
    "error",
)


class JsonLogFormatter(logging.Formatter):
    """把一条日志渲染成单行 JSON，附带 request_id 与白名单 extra 字段。"""

    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        rid = getattr(record, "request_id", None) or request_id_ctx.get()
        if rid:
            payload["request_id"] = rid
        for key in _EXTRA_KEYS:
            if key == "request_id":
                continue
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


class _ContextConsoleFormatter(logging.Formatter):
    """开发态人类可读格式，但仍把 request_id 拼到行尾，方便本地排查。"""

    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        rid = getattr(record, "request_id", None) or request_id_ctx.get()
        return f"{base} [rid={rid}]" if rid else base


def configure_logging() -> None:
    """根据 LOG_FORMAT / LOG_LEVEL 配置根 logger（替代 logging.basicConfig）。"""
    level = getattr(logging, getattr(config, "LOG_LEVEL", "INFO"), logging.INFO)
    handler = logging.StreamHandler()
    if getattr(config, "LOG_FORMAT", "console") == "json":
        handler.setFormatter(JsonLogFormatter())
    else:
        handler.setFormatter(
            _ContextConsoleFormatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
        )
    root = logging.getLogger()
    for h in list(root.handlers):
        root.removeHandler(h)
    root.addHandler(handler)
    root.setLevel(level)


def _client_addr(scope: Dict[str, Any]) -> Optional[str]:
    client = scope.get("client")
    if client:
        return f"{client[0]}:{client[1]}"
    return None


def _access_extra(scope: Dict[str, Any], status: int, duration_ms: float, request_id: str,
                  error: Optional[str] = None) -> Dict[str, Any]:
    extra: Dict[str, Any] = {
        "event": "access" if error is None else "error",
        "request_id": request_id,
        "http_method": scope.get("method"),
        "path": scope.get("path"),
        "status": status,
        "duration_ms": duration_ms,
        "client": _client_addr(scope),
    }
    qs = scope.get("query_string") or b""
    if qs:
        extra["query"] = qs.decode("latin-1")
    if error is not None:
        extra["error"] = error
    return extra


class AccessLogMiddleware:
    """纯 ASGI 访问日志 + request_id + 异常兜底中间件。

    放在中间件栈里时，HTTPException / 校验错误会被内层 FastAPI 处理成正常响应；
    只有真正未捕获的异常才会进入这里的 except 分支。
    """

    def __init__(self, app: Any) -> None:
        self.app = app
        self.logger = logging.getLogger("xinyu.access")

    async def __call__(self, scope: Dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
        request_id = headers.get("x-request-id") or uuid.uuid4().hex
        token = request_id_ctx.set(request_id)
        start = time.perf_counter()
        state = {"status": 500, "started": False}

        async def send_wrapper(message: Dict[str, Any]) -> None:
            if message["type"] == "http.response.start":
                state["started"] = True
                state["status"] = message["status"]
                raw_headers = message.setdefault("headers", [])
                raw_headers.append((b"x-request-id", request_id.encode("latin-1")))
            await send(message)

        try:
            try:
                await self.app(scope, receive, send_wrapper)
            except Exception as exc:  # noqa: BLE001 —— 顶层兜底，必须吞掉再处理
                duration_ms = round((time.perf_counter() - start) * 1000, 2)
                self.logger.exception(
                    "request_failed",
                    extra=_access_extra(scope, 500, duration_ms, request_id, error=type(exc).__name__),
                )
                if not state["started"]:
                    response = JSONResponse(
                        {"detail": "服务暂时遇到问题，请稍后再试", "request_id": request_id},
                        status_code=500,
                        headers={"X-Request-ID": request_id},
                    )
                    await response(scope, receive, send)
                else:
                    # 响应已开始发送，无法再替换为 500，只能让其向上冒泡。
                    raise
            else:
                duration_ms = round((time.perf_counter() - start) * 1000, 2)
                self.logger.info(
                    "access",
                    extra=_access_extra(scope, state["status"], duration_ms, request_id),
                )
        finally:
            request_id_ctx.reset(token)

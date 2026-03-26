# =============================================================================
# タイトル: Discord Bot 連携用 REST API（予約・定期投稿）
# =============================================================================
# サマリー:
#   ScheduledPostManager を通じて予約投稿・定期投稿を登録・一覧・取消する FastAPI サーバー。
#   Bot プロセス内で uvicorn を asyncio 上に載せて起動し、将来のフロントエンド / LLM 連携を想定する。
#
# =============================================================================
# 実行前提
# =============================================================================
# 実行場所: 主に bot.py から import。単体起動は非想定（scheduler の setup 済みインスタンスが必要）。
#
# 前提条件:
#   - API_ENABLED が "true"（大文字小文字無視）のときのみ start_api_server が待受を開始。
#   - API_PORT（既定 8080）、API_SECRET_KEY（任意: 設定時は Bearer 必須）。
#   - リクエストの日時は受信後 UTC に正規化して Manager に渡す。
#
# =============================================================================

from __future__ import annotations

import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any

import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from scheduler import ScheduledPostManager

logger = logging.getLogger(__name__)

API_CREATED_BY = "api"


def _api_enabled() -> bool:
    return os.getenv("API_ENABLED", "").strip().casefold() == "true"


def _api_port() -> int:
    return int(os.getenv("API_PORT", "8080"))


def _to_utc(dt: datetime) -> datetime:
    """受信した日時を UTC に正規化する。naive は UTC とみなす。"""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _verify_bearer(authorization: Annotated[str | None, Header()] = None) -> None:
    secret = os.getenv("API_SECRET_KEY")
    if secret is None or secret.strip() == "":
        return
    if authorization is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing authorization header",
        )
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid authorization scheme",
        )
    token = authorization[len(prefix) :].strip()
    if token != secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid bearer token",
        )


class ScheduledPostCreateBody(BaseModel):
    """POST /api/posts/scheduled のボディ。"""

    channel_id: str
    guild_id: str
    content: str
    scheduled_at: datetime = Field(
        ...,
        description="タイムゾーン付き ISO8601（例: 2025-12-25T10:00:00+09:00）",
    )


class RecurringPostCreateBody(BaseModel):
    """POST /api/posts/recurring のボディ。"""

    channel_id: str
    guild_id: str
    content: str
    frequency: str
    post_time: str = Field(..., description="JST の HH:MM")
    end_at: datetime | None = None


class PostIdResponse(BaseModel):
    post_id: str


class ScheduledListItem(BaseModel):
    post_id: str
    channel_id: str
    content: str
    scheduled_at: str
    created_by: str


class RecurringListItem(BaseModel):
    post_id: str
    channel_id: str
    content: str
    frequency: str
    post_time: str


class ListPostsResponse(BaseModel):
    scheduled: list[ScheduledListItem]
    recurring: list[RecurringListItem]


class CancelPostResponse(BaseModel):
    cancelled: bool


class HealthResponse(BaseModel):
    status: str


def _map_list_payload(raw: dict[str, Any]) -> ListPostsResponse:
    scheduled_out: list[ScheduledListItem] = []
    for row in raw.get("scheduled", []):
        scheduled_out.append(
            ScheduledListItem(
                post_id=str(row["post_id"]),
                channel_id=str(row["channel_id"]),
                content=str(row["content"]),
                scheduled_at=str(row["scheduled_at"]),
                created_by=str(row["created_by"]),
            )
        )
    recurring_out: list[RecurringListItem] = []
    for row in raw.get("recurring", []):
        recurring_out.append(
            RecurringListItem(
                post_id=str(row["post_id"]),
                channel_id=str(row["channel_id"]),
                content=str(row["content"]),
                frequency=str(row["frequency"]),
                post_time=str(row["post_time"]),
            )
        )
    return ListPostsResponse(scheduled=scheduled_out, recurring=recurring_out)


def create_app(scheduler: ScheduledPostManager) -> FastAPI:
    """FastAPI アプリを組み立てる（テストや拡張用にexported）。"""

    app = FastAPI(title="JEDAI Discord scheduled posts API", version="1.0.0")

    api_router_dep = [Depends(_verify_bearer)]

    @app.get("/api/health", response_model=HealthResponse, tags=["meta"])
    async def health() -> HealthResponse:
        return HealthResponse(status="ok")

    @app.exception_handler(ValueError)
    async def value_error_handler(_request: Request, exc: ValueError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": str(exc)},
        )

    @app.post(
        "/api/posts/scheduled",
        response_model=PostIdResponse,
        status_code=status.HTTP_201_CREATED,
        dependencies=api_router_dep,
        tags=["posts"],
    )
    async def create_scheduled_post(
        body: ScheduledPostCreateBody,
    ) -> PostIdResponse:
        scheduled_utc = _to_utc(body.scheduled_at)
        post_id = await scheduler.add_scheduled_post(
            channel_id=body.channel_id,
            content=body.content,
            scheduled_at=scheduled_utc,
            guild_id=body.guild_id,
            created_by=API_CREATED_BY,
        )
        return PostIdResponse(post_id=post_id)

    @app.post(
        "/api/posts/recurring",
        response_model=PostIdResponse,
        status_code=status.HTTP_201_CREATED,
        dependencies=api_router_dep,
        tags=["posts"],
    )
    async def create_recurring_post(
        body: RecurringPostCreateBody,
    ) -> PostIdResponse:
        end_utc = _to_utc(body.end_at) if body.end_at is not None else None
        post_id = await scheduler.add_recurring_post(
            channel_id=body.channel_id,
            content=body.content,
            frequency=body.frequency,
            post_time=body.post_time,
            guild_id=body.guild_id,
            created_by=API_CREATED_BY,
            end_at=end_utc,
        )
        return PostIdResponse(post_id=post_id)

    @app.get(
        "/api/posts",
        response_model=ListPostsResponse,
        dependencies=api_router_dep,
        tags=["posts"],
    )
    async def list_posts(
        guild_id: Annotated[str, Query(..., description="Discord guild id")],
    ) -> ListPostsResponse:
        raw = await scheduler.list_posts(guild_id=guild_id)
        return _map_list_payload(raw)

    @app.delete(
        "/api/posts/{post_id}",
        response_model=CancelPostResponse,
        dependencies=api_router_dep,
        tags=["posts"],
    )
    async def cancel_post(post_id: str) -> CancelPostResponse:
        ok = await scheduler.cancel_post(post_id)
        if not ok:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="post not found",
            )
        return CancelPostResponse(cancelled=True)

    return app


async def start_api_server(scheduler: ScheduledPostManager) -> None:
    """
    uvicorn を現在の asyncio イベントループ上で起動する。

    Args:
        scheduler: setup 済み ScheduledPostManager。

    Note:
        API_ENABLED が \"true\" でない場合はログのみ出して即 return する。
    """
    if not _api_enabled():
        logger.info(
            "API server not started: set API_ENABLED=true to enable (current=%r)",
            os.getenv("API_ENABLED"),
        )
        return

    port = _api_port()
    app = create_app(scheduler)
    config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info",
        loop="asyncio",
    )
    server = uvicorn.Server(config)
    logger.info("Starting FastAPI / uvicorn on 0.0.0.0:%s", port)
    await server.serve()

# =============================================================================
# タイトル: Discord 予約投稿・定期投稿スケジューラ（SQLite / aiosqlite）
# =============================================================================
# サマリー:
#   予約投稿（scheduled_posts）と定期投稿（recurring_posts）を SQLite に永続化し、
#   ポーリングループから Discord チャンネルへメッセージを送信するコアエンジン。
#   bot.py 等から ScheduledPostManager を import して setup / ループ起動に利用する。
#
# =============================================================================
# 実行前提
# =============================================================================
# 実行場所: リポジトリルート。他モジュールから import するか、単体検証時のみ直接実行。
#
# 前提条件:
#   - Python 3.11+
#   - aiosqlite（requirements.txt の aiosqlite>=0.19.0）
#   - run_scheduler_loop に渡す bot は discord.Client 相当（get_channel / fetch_channel, send）
#
# データベース:
#   - デフォルトファイル名 scheduled_posts.db（setup(db_path=...) で変更可）
#   - 各メソッド呼び出しごとに aiosqlite 接続を開閉する（プール不使用）
#
# =============================================================================

from __future__ import annotations

import asyncio
import logging
import re
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Final, Optional

import aiosqlite
import discord
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

JST: Final = ZoneInfo("Asia/Tokyo")

ALLOWED_FREQUENCIES: Final[frozenset[str]] = frozenset(
    {
        "daily",
        "weekly:MON",
        "weekly:TUE",
        "weekly:WED",
        "weekly:THU",
        "weekly:FRI",
        "weekly:SAT",
        "weekly:SUN",
        "interval:2h",
        "interval:6h",
    }
)

_WEEKDAY_NAME_TO_INT: Final[dict[str, int]] = {
    "MON": 0,
    "TUE": 1,
    "WED": 2,
    "THU": 3,
    "FRI": 4,
    "SAT": 5,
    "SUN": 6,
}

_POST_TIME_PATTERN = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


def _ensure_utc(dt: datetime) -> datetime:
    """naive は UTC とみなし、aware は UTC に正規化する。"""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _utc_isoformat(dt: datetime) -> str:
    return _ensure_utc(dt).isoformat()


def _parse_iso_utc(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00", 1)
    parsed = datetime.fromisoformat(normalized)
    return _ensure_utc(parsed)


def _validate_post_time_jst(post_time: str) -> None:
    if not _POST_TIME_PATTERN.match(post_time):
        raise ValueError(
            "post_time は JST の HH:MM 形式である必要があります（例: 09:00）"
        )


def _interval_hours(frequency: str) -> Optional[int]:
    if frequency == "interval:2h":
        return 2
    if frequency == "interval:6h":
        return 6
    return None


def _next_daily_utc(
    *,
    last_sent_utc: Optional[datetime],
    start_at_utc: datetime,
    post_hm: str,
) -> datetime:
    """次回の「毎日 post_hm JST」の送信時刻（UTC）。"""
    hour_s, minute_s = post_hm.split(":")
    h, m = int(hour_s), int(minute_s)

    anchor_utc = last_sent_utc if last_sent_utc is not None else start_at_utc
    anchor_jst = anchor_utc.astimezone(JST)

    if last_sent_utc is None:
        target_local = datetime.combine(anchor_jst.date(), time(h, m), tzinfo=JST)
        if target_local < anchor_jst:
            target_local += timedelta(days=1)
        return target_local.astimezone(timezone.utc)

    target_local = anchor_jst.replace(hour=h, minute=m, second=0, microsecond=0)
    if target_local <= anchor_jst:
        target_local += timedelta(days=1)

    return target_local.astimezone(timezone.utc)


def _next_weekly_utc(
    *,
    last_sent_utc: Optional[datetime],
    start_at_utc: datetime,
    post_hm: str,
    weekday: int,
) -> datetime:
    hour_s, minute_s = post_hm.split(":")
    h, m = int(hour_s), int(minute_s)

    anchor_utc = last_sent_utc if last_sent_utc is not None else start_at_utc
    anchor_jst = anchor_utc.astimezone(JST)

    for add_days in range(0, 8):
        cand_date: date = anchor_jst.date() + timedelta(days=add_days)
        if cand_date.weekday() != weekday:
            continue
        cand = datetime.combine(cand_date, time(h, m), tzinfo=JST)
        if cand > anchor_jst:
            return cand.astimezone(timezone.utc)

    raise RuntimeError(
        "SCHEDULER_WEEKLY_NEXT_COMPUTE_FAILED: "
        f"weekday={weekday} anchor_jst={anchor_jst.isoformat()}"
    )


def _next_interval_utc(
    *,
    last_sent_utc: Optional[datetime],
    start_at_utc: datetime,
    hours: int,
) -> datetime:
    """初回は start_at から hours 時間後、以降は last_sent から hours 時間後。"""
    if last_sent_utc is None:
        return start_at_utc + timedelta(hours=hours)
    return last_sent_utc + timedelta(hours=hours)


def _compute_next_recurring_due_utc(
    *,
    frequency: str,
    post_time: str,
    start_at_utc: datetime,
    last_sent_utc: Optional[datetime],
) -> datetime:
    interval_h = _interval_hours(frequency)
    if interval_h is not None:
        return _next_interval_utc(
            last_sent_utc=last_sent_utc,
            start_at_utc=start_at_utc,
            hours=interval_h,
        )

    if frequency == "daily":
        return _next_daily_utc(
            last_sent_utc=last_sent_utc,
            start_at_utc=start_at_utc,
            post_hm=post_time,
        )

    if frequency.startswith("weekly:"):
        day_key = frequency.split(":", 1)[1]
        wd = _WEEKDAY_NAME_TO_INT[day_key]
        return _next_weekly_utc(
            last_sent_utc=last_sent_utc,
            start_at_utc=start_at_utc,
            post_hm=post_time,
            weekday=wd,
        )

    raise ValueError(f"SCHEDULER_UNSUPPORTED_FREQUENCY: {frequency}")


class ScheduledPostManager:
    """予約投稿・定期投稿の永続化と送信スケジュール処理。"""

    def __init__(self) -> None:
        self._db_path: str = "scheduled_posts.db"
        self._ready: bool = False

    async def setup(self, db_path: str = "scheduled_posts.db") -> None:
        self._db_path = db_path
        async with aiosqlite.connect(self._db_path) as db:
            await db.executescript(
                """
                CREATE TABLE IF NOT EXISTS scheduled_posts (
                    post_id TEXT PRIMARY KEY,
                    channel_id TEXT NOT NULL,
                    guild_id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    scheduled_at TEXT NOT NULL,
                    created_by TEXT,
                    is_sent INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS recurring_posts (
                    post_id TEXT PRIMARY KEY,
                    channel_id TEXT NOT NULL,
                    guild_id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    frequency TEXT NOT NULL,
                    post_time TEXT NOT NULL,
                    start_at TEXT NOT NULL,
                    end_at TEXT,
                    last_sent_at TEXT,
                    is_active INTEGER DEFAULT 1,
                    created_by TEXT,
                    created_at TEXT NOT NULL
                );
                """
            )
            await db.commit()
        self._ready = True

    def _require_ready(self) -> None:
        if not self._ready:
            raise RuntimeError("SCHEDULER_SETUP_REQUIRED: call setup() first")

    async def add_scheduled_post(
        self,
        channel_id: str,
        content: str,
        scheduled_at: datetime,
        guild_id: str,
        created_by: str,
    ) -> str:
        self._require_ready()
        post_id = str(uuid.uuid4())
        now_utc = _utc_isoformat(datetime.now(timezone.utc))
        scheduled_utc = _utc_isoformat(scheduled_at)

        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                INSERT INTO scheduled_posts (
                    post_id, channel_id, guild_id, content, scheduled_at,
                    created_by, is_sent, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)
                """,
                (
                    post_id,
                    channel_id,
                    guild_id,
                    content,
                    scheduled_utc,
                    created_by,
                    now_utc,
                ),
            )
            await db.commit()
        return post_id

    async def add_recurring_post(
        self,
        channel_id: str,
        content: str,
        frequency: str,
        post_time: str,
        guild_id: str,
        created_by: str,
        end_at: Optional[datetime] = None,
    ) -> str:
        self._require_ready()
        if frequency not in ALLOWED_FREQUENCIES:
            raise ValueError(f"SCHEDULER_INVALID_FREQUENCY: {frequency}")

        _validate_post_time_jst(post_time)

        post_id = str(uuid.uuid4())
        now_dt = datetime.now(timezone.utc)
        now_utc = _utc_isoformat(now_dt)
        start_utc = _utc_isoformat(now_dt)
        end_utc_str: Optional[str] = (
            _utc_isoformat(end_at) if end_at is not None else None
        )

        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                INSERT INTO recurring_posts (
                    post_id, channel_id, guild_id, content, frequency, post_time,
                    start_at, end_at, last_sent_at, is_active, created_by, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)
                """,
                (
                    post_id,
                    channel_id,
                    guild_id,
                    content,
                    frequency,
                    post_time,
                    start_utc,
                    end_utc_str,
                    created_by,
                    now_utc,
                ),
            )
            await db.commit()
        return post_id

    async def cancel_post(self, post_id: str) -> bool:
        self._require_ready()
        n_scheduled = 0
        n_recurring = 0

        async with aiosqlite.connect(self._db_path) as db:
            cur_s = await db.execute(
                """
                UPDATE scheduled_posts
                SET is_sent = 1
                WHERE post_id = ? AND is_sent = 0
                """,
                (post_id,),
            )
            n_scheduled = cur_s.rowcount

            cur_r = await db.execute(
                """
                UPDATE recurring_posts
                SET is_active = 0
                WHERE post_id = ? AND is_active = 1
                """,
                (post_id,),
            )
            n_recurring = cur_r.rowcount

            await db.commit()

        return (n_scheduled + n_recurring) > 0

    async def list_posts(self, guild_id: str) -> dict[str, Any]:
        self._require_ready()
        scheduled: list[dict[str, Any]] = []
        recurring: list[dict[str, Any]] = []

        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT post_id, channel_id, guild_id, content, scheduled_at,
                       created_by, is_sent, created_at
                FROM scheduled_posts
                WHERE guild_id = ? AND is_sent = 0
                ORDER BY scheduled_at
                """,
                (guild_id,),
            ) as cur:
                async for row in cur:
                    scheduled.append({k: row[k] for k in row.keys()})

            async with db.execute(
                """
                SELECT post_id, channel_id, guild_id, content, frequency, post_time,
                       start_at, end_at, last_sent_at, is_active, created_by, created_at
                FROM recurring_posts
                WHERE guild_id = ? AND is_active = 1
                ORDER BY created_at
                """,
                (guild_id,),
            ) as cur:
                async for row in cur:
                    recurring.append({k: row[k] for k in row.keys()})

        return {"scheduled": scheduled, "recurring": recurring}

    async def _resolve_channel(self, bot: Any, channel_id: str) -> Any:
        cid = int(channel_id)
        channel = bot.get_channel(cid)
        if channel is not None:
            return channel
        try:
            return await bot.fetch_channel(cid)
        except Exception:
            return None

    async def _send_to_channel(self, bot: Any, channel_id: str, content: str) -> bool:
        channel = await self._resolve_channel(bot, channel_id)
        if channel is None:
            logger.warning(
                "SCHEDULER_CHANNEL_NOT_FOUND: channel_id=%s（スキップ）",
                channel_id,
            )
            return False
        send = getattr(channel, "send", None)
        if send is None:
            logger.warning(
                "SCHEDULER_CHANNEL_NO_SEND: channel_id=%s（スキップ）",
                channel_id,
            )
            return False
        allowed = discord.AllowedMentions(roles=True, users=True, everyone=False)
        await send(content, allowed_mentions=allowed)
        return True

    async def _process_due_scheduled(self, bot: Any, now_utc: datetime) -> None:
        self._require_ready()
        now_str = _utc_isoformat(now_utc)
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT post_id, channel_id, content
                FROM scheduled_posts
                WHERE is_sent = 0 AND scheduled_at <= ?
                ORDER BY scheduled_at
                """,
                (now_str,),
            ) as cur:
                rows = [dict(row) for row in await cur.fetchall()]

        for row in rows:
            post_id = str(row["post_id"])
            channel_id = str(row["channel_id"])
            content = str(row["content"])
            try:
                ok = await self._send_to_channel(bot, channel_id, content)
            except Exception as exc:
                logger.error(
                    "SCHEDULER_SCHEDULED_SEND_FAILED: post_id=%s error=%s",
                    post_id,
                    exc,
                    exc_info=True,
                )
                continue
            if not ok:
                continue

            async with aiosqlite.connect(self._db_path) as db:
                await db.execute(
                    "UPDATE scheduled_posts SET is_sent = 1 WHERE post_id = ?",
                    (post_id,),
                )
                await db.commit()

    async def _process_due_recurring(self, bot: Any, now_utc: datetime) -> None:
        self._require_ready()
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT post_id, channel_id, content, frequency, post_time,
                       start_at, end_at, last_sent_at
                FROM recurring_posts
                WHERE is_active = 1
                ORDER BY created_at
                """
            ) as cur:
                rows = [dict(row) for row in await cur.fetchall()]

        for row in rows:
            post_id = str(row["post_id"])
            channel_id = str(row["channel_id"])
            content = str(row["content"])
            frequency = str(row["frequency"])
            post_time = str(row["post_time"])
            start_at_utc = _parse_iso_utc(str(row["start_at"]))
            last_sent_utc: Optional[datetime] = (
                _parse_iso_utc(str(row["last_sent_at"]))
                if row["last_sent_at"] is not None
                else None
            )
            end_at_raw = row["end_at"]
            end_at_utc: Optional[datetime] = (
                _parse_iso_utc(str(end_at_raw)) if end_at_raw is not None else None
            )

            if end_at_utc is not None and now_utc > end_at_utc:
                continue

            try:
                due_utc = _compute_next_recurring_due_utc(
                    frequency=frequency,
                    post_time=post_time,
                    start_at_utc=start_at_utc,
                    last_sent_utc=last_sent_utc,
                )
            except Exception as exc:
                logger.error(
                    "SCHEDULER_RECURRING_DUE_COMPUTE_FAILED: post_id=%s error=%s",
                    post_id,
                    exc,
                    exc_info=True,
                )
                continue

            if now_utc < due_utc:
                continue

            try:
                ok = await self._send_to_channel(bot, channel_id, content)
            except Exception as exc:
                logger.error(
                    "SCHEDULER_RECURRING_SEND_FAILED: post_id=%s error=%s",
                    post_id,
                    exc,
                    exc_info=True,
                )
                continue
            if not ok:
                continue

            async with aiosqlite.connect(self._db_path) as db:
                await db.execute(
                    "UPDATE recurring_posts SET last_sent_at = ? WHERE post_id = ?",
                    (_utc_isoformat(now_utc), post_id),
                )
                await db.commit()

    async def run_scheduler_loop(self, bot: Any) -> None:
        """30 秒周期で未送信の予約と有効な定期投稿を処理する。"""
        while True:
            try:
                now_utc = datetime.now(timezone.utc)
                await self._process_due_scheduled(bot, now_utc)
                await self._process_due_recurring(bot, now_utc)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error(
                    "SCHEDULER_LOOP_ITERATION_FAILED: error=%s",
                    exc,
                    exc_info=True,
                )

            await asyncio.sleep(30)

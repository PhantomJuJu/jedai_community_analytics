# =============================================================================
# タイトル: Discord 活動データ収集ボット（Databricks 直接書き込みのみ）
# =============================================================================
# サマリー:
#   Discord のメッセージ受信・ボイス状態更新・日次ギルドチャンネル一覧を、
#   指定した Databricks カタログ・スキーマのテーブルにのみ直接 INSERT する。
#   JSONL 等のローカルファイル保存は行わない。
#
# =============================================================================
# 実行前提
# =============================================================================
# 実行場所: リポジトリルート。例: cd jedai_pj && python scripts/01_setup/bot.py
#
# 前提条件:
#   - DISCORD_BOT_TOKEN を .env または環境変数に設定。
#   - 保存先を使う場合: .env に Databricks 設定を記載。
#     DATABRICKS_SQL_WAREHOUSE_SERVER_HOSTNAME, DATABRICKS_SQL_WAREHOUSE_HTTP_PATH,
#     DATABRICKS_ACCESS_TOKEN, DATABRICKS_CATALOG, DATABRICKS_SCHEMA
#   - Databricks 未設定時はメッセージ・ボイス・チャンネルいずれも保存先なし（INSERT しない）。
#   - Developer Portal: Message Content Intent 有効。権限: メッセージ履歴・ボイス状態閲覧。
#
# 出力（Databricks 有効時のみ）:
#   - <DATABRICKS_CATALOG>.<DATABRICKS_SCHEMA>.discord_messages_raw
#   - <DATABRICKS_CATALOG>.<DATABRICKS_SCHEMA>.discord_voice_activity_raw
#   - <DATABRICKS_CATALOG>.<DATABRICKS_SCHEMA>.discord_channels_raw（日次スナップショット）
#
# 再起動: 既存の bot プロセスを停止し、上記コマンドで再実行する。
# =============================================================================

import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import discord
from discord import app_commands
from discord.ext import commands
from dotenv import load_dotenv

load_dotenv()

try:
    from databricks import sql as _databricks_sql
except ImportError:
    _databricks_sql = None  # type: ignore[assignment]

# 日次チャンネル同期: fetch_guild_info の API を再利用（同ディレクトリ）
import sys
_BOT_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_BOT_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_BOT_SCRIPT_DIR))
from fetch_guild_info import (
    filter_channel,
    get_bot_guilds,
    get_guild_channels,
    get_guild_threads_active,
)
from scheduler import ScheduledPostManager
from api_server import start_api_server

# ボイス「待機」セッション: (guild_id, user_id) -> { session_id, joined_at, channel_*, ... }
_voice_pending: Dict[tuple[str, str], Dict[str, Any]] = {}

logger = logging.getLogger(__name__)

# Databricks: 1 スレッドで直列実行（コネクション非スレッドセーフのため）
_db_executor: Optional[ThreadPoolExecutor] = None
_db_connection: Any = None

# Intents（メッセージ本文・ボイス状態のみ。Presence/Invites は不使用のため無効）
intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True
intents.guild_messages = True
intents.voice_states = True

bot = commands.Bot(command_prefix="!", intents=intents)

scheduler = ScheduledPostManager()

# タイムスタンプ形式: yyyy-MM-dd HH:mm:ss（Databricks・人間可読）
TS_FORMAT = "%Y-%m-%d %H:%M:%S"

# Databricks 設定（未設定の場合は保存先なし）
_DB_HOST = os.getenv("DATABRICKS_SQL_WAREHOUSE_SERVER_HOSTNAME")
_DB_HTTP_PATH = os.getenv("DATABRICKS_SQL_WAREHOUSE_HTTP_PATH")
_DB_TOKEN = os.getenv("DATABRICKS_ACCESS_TOKEN")
_DB_CATALOG = os.getenv("DATABRICKS_CATALOG", "").strip()
_DB_SCHEMA = os.getenv("DATABRICKS_SCHEMA", "").strip()
_DATABRICKS_ENABLED = bool(_DB_HOST and _DB_HTTP_PATH and _DB_TOKEN and _DB_CATALOG and _DB_SCHEMA)


def format_ts(dt: Optional[datetime]) -> Optional[str]:
    """datetime を yyyy-MM-dd HH:mm:ss 形式で返す。ミリ秒がある場合は .654 のように付与。"""
    if dt is None:
        return None
    base = dt.strftime(TS_FORMAT)
    if getattr(dt, "microsecond", 0):
        base += f".{dt.microsecond:06d}".rstrip("0").rstrip(".")
    return base


# ----- Databricks 直接書き込み（同期処理は Executor で実行） -----


def _db_connect_sync() -> Any:
    """Databricks SQL コネクションを確立しグローバルに保持する。Executor 内で呼ぶ。"""
    global _db_connection
    if _db_connection is not None:
        return _db_connection
    if not _DATABRICKS_ENABLED or _databricks_sql is None:
        return None
    _db_connection = _databricks_sql.connect(
        server_hostname=_DB_HOST,
        http_path=_DB_HTTP_PATH,
        access_token=_DB_TOKEN,
    )
    return _db_connection


def _is_session_closed_error(exc: Exception) -> bool:
    """Databricks のセッション切れ・無効セッション系エラーかどうかを判定する。"""
    msg = str(exc).lower()
    return "session" in msg and ("closed" in msg or ("invalid" in msg and "sessionhandle" in msg))


def _db_clear_connection() -> None:
    """グローバル DB 接続を破棄する。セッション切れ後に再接続させるために使う。"""
    global _db_connection
    if _db_connection is not None:
        try:
            _db_connection.close()
        except Exception:  # noqa: S110
            pass
        _db_connection = None
        logger.info("Databricks: connection cleared for reconnection")


def _db_ensure_tables_sync() -> None:
    """カタログ・スキーマ内に discord_messages_raw / discord_voice_activity_raw / discord_channels_raw を作成。"""
    if not _DATABRICKS_ENABLED:
        return
    conn = _db_connect_sync()
    if conn is None:
        return
    catalog, schema = _DB_CATALOG, _DB_SCHEMA
    messages_sql = f"""
    CREATE TABLE IF NOT EXISTS {catalog}.{schema}.discord_messages_raw (
        message_id STRING,
        channel_id STRING,
        channel_name STRING,
        category_id BIGINT,
        guild_id STRING,
        guild_name STRING,
        user_id STRING,
        user_name STRING,
        content STRING,
        timestamp STRING,
        edited_timestamp STRING,
        attachment_count INT,
        reaction_count INT,
        is_pinned BOOLEAN
    )
    """
    voice_sql = f"""
    CREATE TABLE IF NOT EXISTS {catalog}.{schema}.discord_voice_activity_raw (
        session_id STRING,
        channel_id STRING,
        channel_name STRING,
        category_id BIGINT,
        user_id STRING,
        user_name STRING,
        guild_id STRING,
        guild_name STRING,
        joined_at STRING,
        left_at STRING
    )
    """
    channels_sql = f"""
    CREATE TABLE IF NOT EXISTS {catalog}.{schema}.discord_channels_raw (
        snapshot_date STRING,
        guild_id STRING,
        guild_name STRING,
        channel_id STRING,
        channel_type INT,
        channel_name STRING,
        category_id BIGINT,
        parent_id BIGINT
    )
    """
    try:
        with conn.cursor() as cur:
            cur.execute(messages_sql)
            cur.execute(voice_sql)
            cur.execute(channels_sql)
        conn.commit()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"ALTER TABLE {catalog}.{schema}.discord_channels_raw ADD COLUMN parent_id BIGINT"
                )
            conn.commit()
        except Exception as alt_e:
            conn.rollback()
            if "already exists" not in str(alt_e).lower() and "duplicate" not in str(alt_e).lower():
                logger.debug(
                    "discord_channels_raw parent_id (may already exist): %s",
                    alt_e,
                )
        logger.info(
            "Databricks tables created/verified: %s.%s.discord_messages_raw, discord_voice_activity_raw, discord_channels_raw",
            catalog,
            schema,
        )
    except Exception as e:
        logger.error(
            "Databricks CREATE TABLE failed. Check catalog/schema exist and token has CREATE TABLE. Error: %s",
            e,
            exc_info=True,
        )
        raise


def _db_insert_message_sync(data: Dict[str, Any]) -> None:
    """1件のメッセージを Databricks テーブルに INSERT。Executor 内で呼ぶ。"""
    if not _DATABRICKS_ENABLED:
        return
    conn = _db_connect_sync()
    if conn is None:
        return
    catalog, schema = _DB_CATALOG, _DB_SCHEMA
    # Use positional ? (qmark) per Databricks SQL connector docs
    sql = f"""
    INSERT INTO {catalog}.{schema}.discord_messages_raw (
        message_id, channel_id, channel_name, category_id, guild_id, guild_name,
        user_id, user_name, content, timestamp, edited_timestamp,
        attachment_count, reaction_count, is_pinned
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    params = [
        data.get("message_id"),
        data.get("channel_id"),
        data.get("channel_name"),
        int(data["category_id"]) if data.get("category_id") is not None else None,
        data.get("guild_id"),
        data.get("guild_name"),
        data.get("user_id"),
        data.get("user_name"),
        (data.get("content") or ""),
        data.get("timestamp"),
        data.get("edited_timestamp"),
        int(data.get("attachment_count", 0)),
        int(data.get("reaction_count", 0)),
        bool(data.get("is_pinned", False)),
    ]
    with conn.cursor() as cur:
        cur.execute(sql, params)
    conn.commit()


def _db_insert_voice_sync(data: Dict[str, Any]) -> None:
    """1件のボイス活動を Databricks テーブルに INSERT。Executor 内で呼ぶ。"""
    if not _DATABRICKS_ENABLED:
        return
    conn = _db_connect_sync()
    if conn is None:
        return
    catalog, schema = _DB_CATALOG, _DB_SCHEMA
    sql = f"""
    INSERT INTO {catalog}.{schema}.discord_voice_activity_raw (
        session_id, channel_id, channel_name, category_id, user_id, user_name,
        guild_id, guild_name, joined_at, left_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    params = [
        data.get("session_id"),
        data.get("channel_id"),
        data.get("channel_name"),
        int(data["category_id"]) if data.get("category_id") is not None else None,
        data.get("user_id"),
        data.get("user_name"),
        data.get("guild_id"),
        data.get("guild_name"),
        data.get("joined_at"),
        data.get("left_at"),
    ]
    with conn.cursor() as cur:
        cur.execute(sql, params)
    conn.commit()


def _db_insert_channels_batch_sync(rows: List[Dict[str, Any]]) -> None:
    """
    日次チャンネルスナップショットを discord_channels_raw に書き込む。Executor 内で呼ぶ。
    同一 snapshot_date の既存行を削除してから INSERT するため、1日1スナップショットで重複しない。
    """
    if not _DATABRICKS_ENABLED or not rows:
        return
    conn = _db_connect_sync()
    if conn is None:
        return
    catalog, schema = _DB_CATALOG, _DB_SCHEMA
    snapshot_date = rows[0].get("snapshot_date")
    if not snapshot_date:
        logger.warning("Discord channels sync: no snapshot_date in rows, skipping write")
        return
    target = f"{catalog}.{schema}.discord_channels_raw"
    delete_sql = f"DELETE FROM {target} WHERE snapshot_date = ?"
    insert_sql = f"""
    INSERT INTO {target} (
        snapshot_date, guild_id, guild_name, channel_id, channel_type, channel_name, category_id, parent_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """
    params_list = [
        (
            r.get("snapshot_date"),
            r.get("guild_id"),
            r.get("guild_name") or "",
            r.get("channel_id"),
            r.get("channel_type"),
            r.get("channel_name") or "",
            int(r["category_id"]) if r.get("category_id") is not None else None,
            int(r["parent_id"]) if r.get("parent_id") is not None else None,
        )
        for r in rows
    ]
    try:
        with conn.cursor() as cur:
            cur.execute(delete_sql, (snapshot_date,))
            cur.executemany(insert_sql, params_list)
        conn.commit()
        logger.info(
            "Databricks discord_channels_raw: replaced snapshot_date=%s with %d rows",
            snapshot_date,
            len(rows),
            extra={"snapshot_date": snapshot_date, "row_count": len(rows)},
        )
    except Exception as e:
        logger.error(
            "Databricks discord_channels_raw INSERT failed: %s",
            e,
            exc_info=True,
        )
        raise


async def _run_db_sync(fn: Any, *args: Any, **kwargs: Any) -> None:
    """同期の DB 処理を Executor で実行。セッション切れ時は接続を破棄して1回だけリトライ。失敗時は ERROR でログ（ボットは継続）。"""
    global _db_executor
    if not _DATABRICKS_ENABLED:
        return
    if _db_executor is None:
        logger.error("Databricks: _db_executor is None (tables/inserts will be skipped)")
        return
    loop = asyncio.get_event_loop()

    def _run() -> None:
        fn(*args, **kwargs)

    try:
        await loop.run_in_executor(_db_executor, _run)
    except Exception as e:
        if _is_session_closed_error(e):
            logger.warning(
                "Databricks session closed, clearing connection and retrying once: %s",
                e,
            )
            await loop.run_in_executor(_db_executor, _db_clear_connection)
            try:
                await loop.run_in_executor(_db_executor, _run)
                logger.info("Databricks: retry after reconnection succeeded")
            except Exception as retry_e:
                logger.error(
                    "Databricks INSERT failed after reconnection: %s",
                    retry_e,
                    exc_info=True,
                )
        else:
            logger.error(
                "Databricks INSERT failed: %s. Check token has MODIFY on table and SQL warehouse is DBR >= 14.2 for parameters.",
                e,
                exc_info=True,
            )


# ----- 日次チャンネル同期（REST + JSONL は Executor で実行） -----


def _run_daily_channel_fetch_sync(token: str) -> List[Dict[str, Any]]:
    """
    全参加ギルドのチャンネルを取得し、JSONL に保存して DB 用行リストを返す。
    同期関数。REST とファイル I/O を行うため、呼び出し元は Executor で実行すること。
    """
    from urllib.error import HTTPError, URLError

    snapshot_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows: List[Dict[str, Any]] = []

    try:
        guilds = get_bot_guilds(token)
    except (HTTPError, URLError, ValueError) as e:
        logger.error(
            "Daily channel sync: get_bot_guilds failed: %s",
            e,
            extra={"error_type": type(e).__name__},
            exc_info=True,
        )
        return rows

    if not guilds:
        logger.info("Daily channel sync: no guilds joined")
        return rows

    for g in guilds:
        guild_id = g.get("id")
        guild_name = g.get("name") or ""
        if guild_id is None:
            continue
        guild_id_str = str(guild_id).strip()
        try:
            channels = get_guild_channels(token, guild_id_str)
        except (HTTPError, URLError, ValueError) as e:
            logger.warning(
                "Daily channel sync: get_guild_channels failed for guild %s: %s",
                guild_id_str,
                e,
                extra={"guild_id": guild_id_str, "error_type": type(e).__name__},
            )
            continue
        filtered = [filter_channel(ch) for ch in channels]
        for ch in filtered:
            ch_id = ch.get("id")
            if ch_id is None:
                continue
            rows.append({
                "snapshot_date": snapshot_date,
                "guild_id": guild_id_str,
                "guild_name": guild_name,
                "channel_id": str(ch_id),
                "channel_type": int(ch.get("type", 0)),
                "channel_name": (ch.get("name") or ""),
                "category_id": int(ch["parent_id"]) if ch.get("parent_id") is not None else None,
                "parent_id": None,
            })
        threads = get_guild_threads_active(token, guild_id_str)
        for th in threads:
            th_id = th.get("id")
            if th_id is None:
                continue
            rows.append({
                "snapshot_date": snapshot_date,
                "guild_id": guild_id_str,
                "guild_name": guild_name,
                "channel_id": str(th_id),
                "channel_type": int(th.get("type", 0)),
                "channel_name": (th.get("name") or ""),
                "category_id": None,
                "parent_id": int(th["parent_id"]) if th.get("parent_id") is not None else None,
            })

    logger.info(
        "Daily channel sync: fetched %d guild(s), %d channel rows (channels + threads)",
        len(guilds),
        len(rows),
        extra={"guild_count": len(guilds), "row_count": len(rows)},
    )
    return rows


async def daily_channel_sync_loop() -> None:
    """
    日次でチャンネル同期を実行するループ。
    初回は起動直後に1回実行（テスト用に discord_channels_raw 作成・書き込みを確認）、
    以降は次の UTC 0 時から 24 時間ごとに実行する。
    REST とファイル I/O は Executor で実行し、Databricks 書き込みは _run_db_sync で実行する。
    """
    token = os.getenv("DISCORD_BOT_TOKEN") or ""
    if not token.strip():
        logger.warning("Daily channel sync: DISCORD_BOT_TOKEN not set, skipping loop")
        return

    def _wait_until_next_midnight_utc_seconds() -> float:
        now = datetime.now(timezone.utc)
        next_midnight = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
        return (next_midnight - now).total_seconds()

    first_run = True
    while True:
        if not first_run:
            delay = _wait_until_next_midnight_utc_seconds()
            if delay > 0:
                logger.info("Daily channel sync: next run in %.0f s (at next midnight UTC)", delay)
                await asyncio.sleep(delay)
        else:
            logger.info("Daily channel sync: running once immediately (test run)")
            first_run = False

        loop = asyncio.get_event_loop()
        try:
            rows = await loop.run_in_executor(None, _run_daily_channel_fetch_sync, token.strip())
        except Exception as e:
            logger.error(
                "Daily channel sync: fetch failed: %s",
                e,
                exc_info=True,
            )
            await asyncio.sleep(86400)
            continue

        if rows and _DATABRICKS_ENABLED:
            await _run_db_sync(_db_insert_channels_batch_sync, rows)

        await asyncio.sleep(86400)


# ----- イベントハンドラ -----


@bot.event
async def on_ready():
    logger.info("Bot ready", extra={"user": str(bot.user), "guild_count": len(bot.guilds)})
    if _DATABRICKS_ENABLED:
        await _run_db_sync(_db_ensure_tables_sync)
        logger.info(
            "Databricks tables ensured",
            extra={"catalog": _DB_CATALOG, "schema": _DB_SCHEMA},
        )
    asyncio.create_task(daily_channel_sync_loop())
    await scheduler.setup()
    asyncio.create_task(scheduler.run_scheduler_loop(bot))
    await bot.tree.sync()
    logger.info("Slash commands synced")
    if os.getenv("API_ENABLED", "").lower() == "true":
        asyncio.create_task(start_api_server(scheduler))
        logger.info("API server starting on port %s", os.getenv("API_PORT", "8080"))


@bot.event
async def on_message(message: discord.Message):
    if message.author == bot.user:
        return
    logger.debug(
        "Message received",
        extra={"channel_id": message.channel.id, "author_id": message.author.id},
    )
    await save_message_data(message)
    await bot.process_commands(message)


@bot.event
async def on_voice_state_update(
    member: discord.Member,
    before: discord.VoiceState,
    after: discord.VoiceState,
):
    await save_voice_activity_data(member, before, after)


# ----- データ保存関数 -----


async def save_message_data(message: discord.Message) -> None:
    """メッセージデータを Databricks の discord_messages_raw にのみ書き込む。"""
    cat_id = getattr(message.channel, "category_id", None)
    data = {
        "message_id": str(message.id),
        "channel_id": str(message.channel.id),
        "channel_name": message.channel.name if hasattr(message.channel, "name") else None,
        "category_id": int(cat_id) if cat_id is not None else None,
        "guild_id": str(message.guild.id) if message.guild else None,
        "guild_name": message.guild.name if message.guild else None,
        "user_id": str(message.author.id),
        "user_name": message.author.name,
        "content": message.content,
        "timestamp": format_ts(message.created_at),
        "edited_timestamp": format_ts(message.edited_at) if message.edited_at else None,
        "attachment_count": len(message.attachments),
        "reaction_count": len(message.reactions),
        "is_pinned": message.pinned,
    }
    await _run_db_sync(_db_insert_message_sync, data)


def _build_voice_record(
    *,
    session_id: str,
    channel_id: str,
    channel_name: str,
    category_id: Optional[int],
    user_id: str,
    user_name: str,
    guild_id: str,
    guild_name: str,
    joined_at: Optional[str],
    left_at: Optional[str],
) -> Dict[str, Any]:
    """ボイス1セッション分のレコードを組み立てる。joined_at / left_at は同一行に持つ。"""
    return {
        "session_id": session_id,
        "channel_id": channel_id,
        "channel_name": channel_name,
        "category_id": category_id,
        "user_id": user_id,
        "user_name": user_name,
        "guild_id": guild_id,
        "guild_name": guild_name,
        "joined_at": joined_at,
        "left_at": left_at,
    }


async def save_voice_activity_data(
    member: discord.Member,
    before: discord.VoiceState,
    after: discord.VoiceState,
) -> None:
    """ボイス活動を Databricks の discord_voice_activity_raw にのみ書き込む。参加時は待機状態（メモリに保持）、退出時に1行 INSERT。"""
    if before.channel == after.channel:
        return
    ts_str = format_ts(datetime.now(timezone.utc))
    key = (str(member.guild.id), str(member.id))

    if after.channel:
        # 入室: 待機状態としてメモリに保存
        cat_id = getattr(after.channel, "category_id", None)
        session_id = f"{member.id}_{datetime.now(timezone.utc).timestamp()}"
        _voice_pending[key] = {
            "session_id": session_id,
            "channel_id": str(after.channel.id),
            "channel_name": after.channel.name,
            "category_id": int(cat_id) if cat_id is not None else None,
            "user_id": str(member.id),
            "user_name": member.name,
            "guild_id": str(member.guild.id),
            "guild_name": member.guild.name,
            "joined_at": ts_str,
        }
        return

    # 退室: 待機していたセッションを1行で Databricks に INSERT
    pending = _voice_pending.pop(key, None)
    if pending:
        data = _build_voice_record(
            session_id=pending["session_id"],
            channel_id=pending["channel_id"],
            channel_name=pending["channel_name"],
            category_id=pending.get("category_id"),
            user_id=pending["user_id"],
            user_name=pending["user_name"],
            guild_id=pending["guild_id"],
            guild_name=pending["guild_name"],
            joined_at=pending["joined_at"],
            left_at=ts_str,
        )
    else:
        # ボット起動前に入室していたなど、待機データがない場合
        ch = before.channel
        cat_id = getattr(ch, "category_id", None)
        data = _build_voice_record(
            session_id=f"{member.id}_{datetime.now(timezone.utc).timestamp()}",
            channel_id=str(ch.id),
            channel_name=ch.name,
            category_id=int(cat_id) if cat_id is not None else None,
            user_id=str(member.id),
            user_name=member.name,
            guild_id=str(member.guild.id),
            guild_name=member.guild.name,
            joined_at=None,
            left_at=ts_str,
        )
    await _run_db_sync(_db_insert_voice_sync, data)


# ----- 予約投稿・定期投稿 UI -----

_TEXT_CHANNEL_TYPES: list[discord.ChannelType] = [
    discord.ChannelType.text,
    discord.ChannelType.news,
]
_JST = timezone(timedelta(hours=9))
_SELECT_OPTION_LIMIT = 25


def _parse_optional_int_env(var_name: str) -> Optional[int]:
    """整数環境変数を安全に読み込む。無効値は warning を出して無視する。"""
    raw = (os.getenv(var_name) or "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        logger.warning("Invalid %s value (must be integer): %r", var_name, raw)
        return None


def _parse_optional_int_env_candidates(var_names: list[str]) -> Optional[int]:
    """複数候補の環境変数を順番に参照し、最初の有効値を返す。"""
    for var_name in var_names:
        value = _parse_optional_int_env(var_name)
        if value is not None:
            return value
    return None


def _parse_id_list_env(var_name: str) -> set[int]:
    """カンマ区切りの ID 一覧を安全にパースする。無効値は warning 後にスキップ。"""
    raw = os.getenv(var_name, "")
    parsed: set[int] = set()
    if not raw.strip():
        return parsed
    for token in raw.split(","):
        value = token.strip()
        if not value:
            continue
        try:
            parsed.add(int(value))
        except ValueError:
            logger.warning("Invalid ID in %s: %r (skipped)", var_name, value)
    return parsed


def _parse_id_list_env_candidates(var_names: list[str]) -> set[int]:
    """複数候補の環境変数を順番に参照し、最初の非空 ID 一覧を返す。"""
    for var_name in var_names:
        values = _parse_id_list_env(var_name)
        if values:
            return values
    return set()


_ANNOUNCE_GUILD_ID = _parse_optional_int_env_candidates(
    ["ANNOUNCE_GUILD_ID", "WHITELIST_GUILD_ID"]
)
_ANNOUNCE_CHANNEL_IDS = _parse_id_list_env_candidates(
    ["ANNOUNCE_CHANNEL_IDS", "WHITELIST_CHANNEL_IDS", "ALLOWED_CHANNEL_IDS"]
)
_ANNOUNCE_ROLE_IDS = _parse_id_list_env_candidates(
    ["ANNOUNCE_ROLE_IDS", "WHITELIST_ROLE_IDS", "ALLOWED_ROLE_IDS"]
)


def _is_announce_restriction_enabled(guild_id: int) -> bool:
    """ホワイトリスト制御を有効化すべき guild か判定する。"""
    if _ANNOUNCE_GUILD_ID is not None:
        return guild_id == _ANNOUNCE_GUILD_ID
    return bool(_ANNOUNCE_CHANNEL_IDS or _ANNOUNCE_ROLE_IDS)


def _list_selectable_text_channels(guild: discord.Guild) -> list[discord.abc.GuildChannel]:
    """投稿先候補チャンネル一覧を返す（常にホワイトリストのみ表示）。"""
    if not _is_announce_restriction_enabled(guild.id):
        return []
    channels: list[discord.abc.GuildChannel] = []
    for channel_id in sorted(_ANNOUNCE_CHANNEL_IDS):
        channel = guild.get_channel(channel_id)
        if channel is None:
            logger.warning(
                "ANNOUNCE_CHANNEL_IDS contains missing channel_id=%s in guild_id=%s",
                channel_id,
                guild.id,
            )
            continue
        if channel.type not in _TEXT_CHANNEL_TYPES:
            logger.warning(
                "ANNOUNCE_CHANNEL_IDS channel_id=%s is not text/news in guild_id=%s",
                channel_id,
                guild.id,
            )
            continue
        channels.append(channel)
    return channels


def _list_selectable_roles(guild: discord.Guild) -> list[discord.Role]:
    """メンション候補ロール一覧を返す（常にホワイトリストのみ表示）。"""
    if not _is_announce_restriction_enabled(guild.id):
        return []
    roles: list[discord.Role] = []
    for role_id in sorted(_ANNOUNCE_ROLE_IDS):
        role = guild.get_role(role_id)
        if role is None:
            logger.warning(
                "ANNOUNCE_ROLE_IDS contains missing role_id=%s in guild_id=%s",
                role_id,
                guild.id,
            )
            continue
        roles.append(role)
    return roles


def _build_content_with_role_mentions(original_content: str, selected_role_ids: list[str]) -> str:
    """選択されたロールメンションを本文先頭に付与する。"""
    if not selected_role_ids:
        return original_content
    mention_prefix = " ".join([f"<@&{role_id}>" for role_id in selected_role_ids])
    return f"{mention_prefix}\n{original_content}"


def parse_jst_datetime(text: str) -> datetime:
    """
    "YYYY-MM-DD HH:MM" 形式の文字列をJSTとして解釈し、
    UTC の aware datetime を返す。
    パース失敗時は ValueError を raise。
    """
    dt = datetime.strptime(text.strip(), "%Y-%m-%d %H:%M")
    return dt.replace(tzinfo=_JST).astimezone(timezone.utc)


def _parse_optional_end_date_jst_to_utc(text: str) -> Optional[datetime]:
    """YYYY-MM-DD をその日の終わり（JST 23:59:59）として UTC datetime に変換する。"""
    stripped = text.strip()
    if not stripped:
        return None
    day = datetime.strptime(stripped, "%Y-%m-%d").date()
    end_local = datetime.combine(day, datetime.min.time().replace(hour=23, minute=59, second=59))
    return end_local.replace(tzinfo=_JST).astimezone(timezone.utc)


def _scheduled_at_display_jst(iso_str: str) -> str:
    """DB の scheduled_at（ISO UTC）を JST 表示用に整形する。"""
    normalized = iso_str.replace("Z", "+00:00", 1)
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(_JST).strftime("%Y-%m-%d %H:%M JST")


def _format_scheduled_list_for_embed(rows: List[Dict[str, Any]]) -> str:
    """予約投稿一覧を Embed 用テキストに整形する（長すぎる場合は切り詰め）。"""
    if not rows:
        return "なし"
    lines: List[str] = []
    for row in rows:
        post_id = str(row.get("post_id", ""))
        channel_id = str(row.get("channel_id", ""))
        sched = str(row.get("scheduled_at", ""))
        content_preview = (str(row.get("content") or ""))[:120].replace("\n", " ")
        try:
            when = _scheduled_at_display_jst(sched)
        except ValueError:
            when = sched
        lines.append(f"`{post_id}` <#{channel_id}> {when}\n　{content_preview}")
    text = "\n".join(lines)
    if len(text) > 1024:
        text = text[:1021] + "..."
    return text


def _format_recurring_list_for_embed(rows: List[Dict[str, Any]]) -> str:
    """定期投稿一覧を Embed 用テキストに整形する。"""
    if not rows:
        return "なし"
    lines: List[str] = []
    for row in rows:
        post_id = str(row.get("post_id", ""))
        channel_id = str(row.get("channel_id", ""))
        freq = str(row.get("frequency", ""))
        post_time = str(row.get("post_time", ""))
        content_preview = (str(row.get("content") or ""))[:120].replace("\n", " ")
        lines.append(
            f"`{post_id}` <#{channel_id}> {freq} @ {post_time} JST\n　{content_preview}"
        )
    text = "\n".join(lines)
    if len(text) > 1024:
        text = text[:1021] + "..."
    return text


class ChannelSelectDropdown(discord.ui.Select):
    """候補チャンネルから1件選択するための Select。"""

    def __init__(self, channels: list[discord.abc.GuildChannel]) -> None:
        options = [
            discord.SelectOption(label=f"#{ch.name}", value=str(ch.id))
            for ch in channels[:_SELECT_OPTION_LIMIT]
        ]
        super().__init__(
            placeholder="投稿先チャンネルを選択…",
            min_values=1,
            max_values=1,
            options=options,
            row=0,
        )

    async def callback(self, interaction: discord.Interaction) -> None:
        view = self.view
        if not isinstance(view, (ChannelSelectForScheduleView, ChannelSelectForRecurringView)):
            await interaction.response.send_message(
                "内部エラーが発生しました。再度お試しください。",
                ephemeral=True,
            )
            return
        await view.handle_channel_selected(interaction, self.values[0])


class RoleSelectDropdown(discord.ui.Select):
    """任意ロール複数選択用 Select。"""

    def __init__(self, roles: list[discord.Role]) -> None:
        options = [
            discord.SelectOption(label=f"@{role.name}", value=str(role.id))
            for role in roles[:_SELECT_OPTION_LIMIT]
        ]
        super().__init__(
            placeholder="メンションロールを選択（任意・複数可）…",
            min_values=0,
            max_values=len(options),
            options=options,
            row=0,
        )

    async def callback(self, interaction: discord.Interaction) -> None:
        view = self.view
        if not isinstance(view, (RoleSelectForScheduleView, RoleSelectForRecurringView)):
            await interaction.response.send_message(
                "内部エラーが発生しました。再度お試しください。",
                ephemeral=True,
            )
            return
        view.selected_role_ids = list(self.values)
        await interaction.response.send_message(
            "ロール選択を更新しました。`次へ` を押して進んでください。",
            ephemeral=True,
        )


class ChannelSelectForScheduleView(discord.ui.View):
    """予約投稿 Step1: 投稿先チャンネル選択。"""

    def __init__(self, channels: list[discord.abc.GuildChannel]) -> None:
        super().__init__(timeout=120)
        self.add_item(ChannelSelectDropdown(channels))

    async def handle_channel_selected(
        self,
        interaction: discord.Interaction,
        channel_id: str,
    ) -> None:
        guild = interaction.guild
        if guild is None:
            await interaction.response.send_message(
                "サーバー情報を取得できませんでした。",
                ephemeral=True,
            )
            return
        roles = _list_selectable_roles(guild)
        await interaction.response.send_message(
            "メンションするロールを選択してください（任意・複数可）。",
            view=RoleSelectForScheduleView(
                channel_id=channel_id,
                guild_id=str(guild.id),
                roles=roles,
            ),
            ephemeral=True,
        )


class RoleSelectForScheduleView(discord.ui.View):
    """予約投稿 Step2: ロール選択（任意）→ 予約 Modal。"""

    def __init__(self, *, channel_id: str, guild_id: str, roles: list[discord.Role]) -> None:
        super().__init__(timeout=120)
        self._channel_id = channel_id
        self._guild_id = guild_id
        self.selected_role_ids: list[str] = []
        if roles:
            self.add_item(RoleSelectDropdown(roles))

    @discord.ui.button(label="次へ", style=discord.ButtonStyle.primary, row=1)
    async def proceed(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await interaction.response.send_modal(
            SchedulePostModal(
                channel_id=self._channel_id,
                guild_id=self._guild_id,
                selected_role_ids=self.selected_role_ids,
            )
        )


class SchedulePostModal(discord.ui.Modal, title="予約投稿の設定"):
    """予約投稿 Step2: 日時・本文を入力して登録する。"""

    datetime_input = discord.ui.TextInput(
        label="投稿日時 (JST)",
        placeholder="例: 2025-12-25 10:00",
        min_length=10,
        max_length=20,
    )
    message_input = discord.ui.TextInput(
        label="メッセージ内容",
        style=discord.TextStyle.paragraph,
        max_length=2000,
    )

    def __init__(
        self,
        *,
        channel_id: str,
        guild_id: str,
        selected_role_ids: Optional[list[str]] = None,
    ) -> None:
        super().__init__()
        self._channel_id = channel_id
        self._guild_id = guild_id
        self._selected_role_ids = selected_role_ids or []

    async def on_submit(self, interaction: discord.Interaction) -> None:
        try:
            scheduled_utc = parse_jst_datetime(str(self.datetime_input.value))
            if scheduled_utc <= datetime.now(timezone.utc):
                await interaction.response.send_message(
                    "過去の日時は指定できません。日時を修正して再度お試しください。",
                    ephemeral=True,
                )
                return
            original_content = str(self.message_input.value).strip()
            content = _build_content_with_role_mentions(
                original_content=original_content,
                selected_role_ids=self._selected_role_ids,
            )
            if not content:
                await interaction.response.send_message(
                    "メッセージ内容を入力してください。",
                    ephemeral=True,
                )
                return
            post_id = await scheduler.add_scheduled_post(
                channel_id=self._channel_id,
                content=content,
                scheduled_at=scheduled_utc,
                guild_id=self._guild_id,
                created_by=str(interaction.user.id),
            )
            jst_display = scheduled_utc.astimezone(_JST).strftime("%Y-%m-%d %H:%M JST")
            await interaction.response.send_message(
                "✅ 予約投稿を登録しました。\n"
                f"チャンネル: <#{self._channel_id}>\n"
                f"投稿日時: {jst_display}\n"
                f"ID: `{post_id}`（キャンセル時に使用）",
                ephemeral=True,
            )
        except ValueError as exc:
            await interaction.response.send_message(
                f"入力を確認してください: {exc}\n"
                "日時は `YYYY-MM-DD HH:MM` 形式（JST）で入力してください。",
                ephemeral=True,
            )
        except Exception:
            logger.error(
                "SCHEDULE_POST_MODAL_SUBMIT_FAILED",
                exc_info=True,
                extra={"guild_id": self._guild_id, "channel_id": self._channel_id},
            )
            await interaction.response.send_message(
                "エラーが発生しました。しばらくしてから再度お試しください。",
                ephemeral=True,
            )


class ChannelSelectForRecurringView(discord.ui.View):
    """定期投稿 Step1: 投稿先チャンネル選択。"""

    def __init__(self, channels: list[discord.abc.GuildChannel]) -> None:
        super().__init__(timeout=120)
        self.add_item(ChannelSelectDropdown(channels))

    async def handle_channel_selected(
        self,
        interaction: discord.Interaction,
        channel_id: str,
    ) -> None:
        guild = interaction.guild
        if guild is None:
            await interaction.response.send_message(
                "サーバー情報を取得できませんでした。",
                ephemeral=True,
            )
            return
        roles = _list_selectable_roles(guild)
        await interaction.response.send_message(
            "メンションするロールを選択してください（任意・複数可）。",
            view=RoleSelectForRecurringView(
                channel_id=channel_id,
                guild_id=str(guild.id),
                roles=roles,
            ),
            ephemeral=True,
        )


class RoleSelectForRecurringView(discord.ui.View):
    """定期投稿 Step2: ロール選択（任意）→ 頻度選択。"""

    def __init__(self, *, channel_id: str, guild_id: str, roles: list[discord.Role]) -> None:
        super().__init__(timeout=120)
        self._channel_id = channel_id
        self._guild_id = guild_id
        self.selected_role_ids: list[str] = []
        if roles:
            self.add_item(RoleSelectDropdown(roles))

    @discord.ui.button(label="次へ", style=discord.ButtonStyle.primary, row=1)
    async def proceed(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        view = FrequencySelectView(
            channel_id=self._channel_id,
            guild_id=self._guild_id,
            selected_role_ids=self.selected_role_ids,
        )
        await interaction.response.send_message(
            "投稿頻度を選択してください。",
            view=view,
            ephemeral=True,
        )


class FrequencySelectView(discord.ui.View):
    """定期投稿 Step2: 頻度選択 → 定期 Modal。"""

    def __init__(
        self,
        *,
        channel_id: str,
        guild_id: str,
        selected_role_ids: Optional[list[str]] = None,
    ) -> None:
        super().__init__(timeout=120)
        self._channel_id = channel_id
        self._guild_id = guild_id
        self._selected_role_ids = selected_role_ids or []

    @discord.ui.select(
        placeholder="頻度を選択…",
        options=[
            discord.SelectOption(label="毎日", value="daily"),
            discord.SelectOption(label="毎週月曜", value="weekly:MON"),
            discord.SelectOption(label="毎週水曜", value="weekly:WED"),
            discord.SelectOption(label="毎週金曜", value="weekly:FRI"),
            discord.SelectOption(label="毎週土曜", value="weekly:SAT"),
            discord.SelectOption(label="2時間ごと", value="interval:2h"),
            discord.SelectOption(label="6時間ごと", value="interval:6h"),
        ],
        row=0,
    )
    async def select_frequency(
        self,
        interaction: discord.Interaction,
        select: discord.ui.Select,
    ) -> None:
        frequency = str(select.values[0])
        await interaction.response.send_modal(
            RecurringPostModal(
                channel_id=self._channel_id,
                guild_id=self._guild_id,
                frequency=frequency,
                selected_role_ids=self._selected_role_ids,
            )
        )


class RecurringPostModal(discord.ui.Modal, title="定期投稿の設定"):
    """定期投稿 Step3: 時刻・本文・終了日（任意）を入力して登録する。"""

    time_input = discord.ui.TextInput(
        label="投稿時刻 (JST, HH:MM)",
        placeholder="例: 09:00",
        min_length=4,
        max_length=5,
    )
    message_input = discord.ui.TextInput(
        label="メッセージ内容",
        style=discord.TextStyle.paragraph,
        max_length=2000,
    )
    end_date_input = discord.ui.TextInput(
        label="終了日 (任意, YYYY-MM-DD)",
        placeholder="空欄で無期限",
        required=False,
        max_length=10,
    )

    def __init__(
        self,
        *,
        channel_id: str,
        guild_id: str,
        frequency: str,
        selected_role_ids: Optional[list[str]] = None,
    ) -> None:
        super().__init__()
        self._channel_id = channel_id
        self._guild_id = guild_id
        self._frequency = frequency
        self._selected_role_ids = selected_role_ids or []

    async def on_submit(self, interaction: discord.Interaction) -> None:
        try:
            original_content = str(self.message_input.value).strip()
            content = _build_content_with_role_mentions(
                original_content=original_content,
                selected_role_ids=self._selected_role_ids,
            )
            if not content:
                await interaction.response.send_message(
                    "メッセージ内容を入力してください。",
                    ephemeral=True,
                )
                return
            end_raw = str(self.end_date_input.value or "")
            end_at_utc: Optional[datetime]
            try:
                end_at_utc = _parse_optional_end_date_jst_to_utc(end_raw)
            except ValueError:
                await interaction.response.send_message(
                    "終了日は `YYYY-MM-DD` 形式で入力するか、無期限の場合は空欄にしてください。",
                    ephemeral=True,
                )
                return
            post_id = await scheduler.add_recurring_post(
                channel_id=self._channel_id,
                content=content,
                frequency=self._frequency,
                post_time=str(self.time_input.value).strip(),
                guild_id=self._guild_id,
                created_by=str(interaction.user.id),
                end_at=end_at_utc,
            )
            end_msg = (
                end_raw.strip() if end_raw.strip() else "無期限"
            )
            await interaction.response.send_message(
                "✅ 定期投稿を登録しました。\n"
                f"チャンネル: <#{self._channel_id}>\n"
                f"頻度: `{self._frequency}` / 時刻 (JST): `{self.time_input.value}`\n"
                f"終了日: {end_msg}\n"
                f"ID: `{post_id}`",
                ephemeral=True,
            )
        except ValueError as exc:
            await interaction.response.send_message(
                f"入力を確認してください: {exc}\n"
                "時刻は `HH:MM`（JST）で入力してください。",
                ephemeral=True,
            )
        except Exception:
            logger.error(
                "RECURRING_POST_MODAL_SUBMIT_FAILED",
                exc_info=True,
                extra={
                    "guild_id": self._guild_id,
                    "channel_id": self._channel_id,
                    "frequency": self._frequency,
                },
            )
            await interaction.response.send_message(
                "エラーが発生しました。しばらくしてから再度お試しください。",
                ephemeral=True,
            )


post_group = app_commands.Group(
    name="post",
    description="予約投稿・定期投稿の登録・一覧・キャンセル",
)

@post_group.error
async def post_group_error(
    interaction: discord.Interaction,
    error: app_commands.AppCommandError,
) -> None:
    """
    /post グループ内の app command エラーをハンドリング。

    - 権限不足（CheckFailure）の場合はユーザーにメッセージを出さない（ephemeral defer）。
    - その他はログ出し＋ephemeral で簡易メッセージを返す。
    """
    if isinstance(error, app_commands.CheckFailure):
        if interaction.response.is_done():
            return
        # 「Interaction failed」を出さないため、必ず acknowledgement だけ行う。
        await interaction.response.defer(ephemeral=True)
        return

    logger.error(
        "POST_GROUP_APP_COMMAND_ERROR",
        exc_info=True,
        extra={
            "guild_id": getattr(interaction.guild, "id", None),
            "user_id": getattr(getattr(interaction, "user", None), "id", None),
            "error_type": type(error).__name__,
        },
    )

    if interaction.response.is_done():
        return
    await interaction.response.send_message(
        "エラーが発生しました。しばらくしてから再度お試しください。",
        ephemeral=True,
    )


@post_group.command(name="schedule", description="予約投稿をステップ式で登録します")
@app_commands.checks.has_permissions(administrator=True)
async def post_schedule(interaction: discord.Interaction) -> None:
    if interaction.guild is None:
        await interaction.response.send_message(
            "このコマンドはサーバー内でのみ使用できます。",
            ephemeral=True,
        )
        return
    channels = _list_selectable_text_channels(interaction.guild)
    if not channels:
        await interaction.response.send_message(
            "設定済み候補がありません。管理者に連絡してください。",
            ephemeral=True,
        )
        return
    view = ChannelSelectForScheduleView(channels)
    await interaction.response.send_message(
        "投稿先テキストチャンネルを選択してください。",
        view=view,
        ephemeral=True,
    )


@post_group.command(name="recurring", description="定期投稿をステップ式で登録します")
@app_commands.checks.has_permissions(administrator=True)
async def post_recurring(interaction: discord.Interaction) -> None:
    if interaction.guild is None:
        await interaction.response.send_message(
            "このコマンドはサーバー内でのみ使用できます。",
            ephemeral=True,
        )
        return
    channels = _list_selectable_text_channels(interaction.guild)
    if not channels:
        await interaction.response.send_message(
            "設定済み候補がありません。管理者に連絡してください。",
            ephemeral=True,
        )
        return
    view = ChannelSelectForRecurringView(channels)
    await interaction.response.send_message(
        "投稿先テキストチャンネルを選択してください。",
        view=view,
        ephemeral=True,
    )


@post_group.command(name="list", description="このサーバーの予約・定期投稿一覧を表示します")
@app_commands.checks.has_permissions(administrator=True)
async def post_list(interaction: discord.Interaction) -> None:
    if interaction.guild is None:
        await interaction.response.send_message(
            "このコマンドはサーバー内でのみ使用できます。",
            ephemeral=True,
        )
        return
    try:
        payload = await scheduler.list_posts(str(interaction.guild.id))
        scheduled_rows: List[Dict[str, Any]] = list(payload.get("scheduled", []))
        recurring_rows: List[Dict[str, Any]] = list(payload.get("recurring", []))
        if not scheduled_rows and not recurring_rows:
            await interaction.response.send_message(
                "現在予約・定期投稿はありません。",
                ephemeral=True,
            )
            return
        embed = discord.Embed(
            title="予約・定期投稿一覧",
            color=discord.Color.blurple(),
        )
        embed.add_field(
            name="予約投稿",
            value=_format_scheduled_list_for_embed(scheduled_rows),
            inline=False,
        )
        embed.add_field(
            name="定期投稿",
            value=_format_recurring_list_for_embed(recurring_rows),
            inline=False,
        )
        await interaction.response.send_message(embed=embed, ephemeral=True)
    except Exception:
        logger.error(
            "POST_LIST_COMMAND_FAILED",
            exc_info=True,
            extra={"guild_id": getattr(interaction.guild, "id", None)},
        )
        await interaction.response.send_message(
            "エラーが発生しました。しばらくしてから再度お試しください。",
            ephemeral=True,
        )


@post_group.command(name="cancel", description="投稿IDを指定して予約・定期投稿をキャンセルします")
@app_commands.checks.has_permissions(administrator=True)
@app_commands.describe(
    post_id="/post list で確認した ID を入力してください",
)
async def post_cancel(interaction: discord.Interaction, post_id: str) -> None:
    if interaction.guild is None:
        await interaction.response.send_message(
            "このコマンドはサーバー内でのみ使用できます。",
            ephemeral=True,
        )
        return
    try:
        ok = await scheduler.cancel_post(post_id.strip())
        if ok:
            await interaction.response.send_message(
                f"キャンセルしました: `{post_id.strip()}`",
                ephemeral=True,
            )
        else:
            await interaction.response.send_message(
                f"該当する投稿が見つからないか、すでに取り消済みです: `{post_id.strip()}`",
                ephemeral=True,
            )
    except Exception:
        logger.error(
            "POST_CANCEL_COMMAND_FAILED",
            exc_info=True,
            extra={"post_id": post_id, "guild_id": getattr(interaction.guild, "id", None)},
        )
        await interaction.response.send_message(
            "エラーが発生しました。しばらくしてから再度お試しください。",
            ephemeral=True,
        )


bot.tree.add_command(post_group)


# ----- エントリポイント -----


def _setup_logging() -> None:
    """ロギングを設定する（標準出力に INFO 以上を出力）。"""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


if __name__ == "__main__":
    _setup_logging()
    if _DATABRICKS_ENABLED:
        _db_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="databricks_writer")
    token = os.getenv("DISCORD_BOT_TOKEN")
    if not token:
        logger.error(
            "DISCORD_BOT_TOKEN is not set. Set it in .env or environment (e.g. DISCORD_BOT_TOKEN=your_token_here)."
        )
    else:
        bot.run(token)

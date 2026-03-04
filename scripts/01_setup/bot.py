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
)

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
        category_id STRING
    )
    """
    try:
        with conn.cursor() as cur:
            cur.execute(messages_sql)
            cur.execute(voice_sql)
            cur.execute(channels_sql)
        conn.commit()
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
        message_id, channel_id, channel_name, guild_id, guild_name,
        user_id, user_name, content, timestamp, edited_timestamp,
        attachment_count, reaction_count, is_pinned
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    params = [
        data.get("message_id"),
        data.get("channel_id"),
        data.get("channel_name"),
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
        session_id, channel_id, channel_name, user_id, user_name,
        guild_id, guild_name, joined_at, left_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    params = [
        data.get("session_id"),
        data.get("channel_id"),
        data.get("channel_name"),
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
    """日次チャンネルスナップショット行を discord_channels_raw に一括 INSERT。Executor 内で呼ぶ。"""
    if not _DATABRICKS_ENABLED or not rows:
        return
    conn = _db_connect_sync()
    if conn is None:
        return
    catalog, schema = _DB_CATALOG, _DB_SCHEMA
    sql = f"""
    INSERT INTO {catalog}.{schema}.discord_channels_raw (
        snapshot_date, guild_id, guild_name, channel_id, channel_type, channel_name, category_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """
    try:
        with conn.cursor() as cur:
            for r in rows:
                cur.execute(sql, [
                    r.get("snapshot_date"),
                    r.get("guild_id"),
                    r.get("guild_name") or "",
                    r.get("channel_id"),
                    r.get("channel_type"),
                    r.get("channel_name") or "",
                    r.get("category_id"),
                ])
        conn.commit()
        logger.info(
            "Databricks discord_channels_raw: inserted %d rows",
            len(rows),
            extra={"row_count": len(rows)},
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
                "category_id": str(ch["parent_id"]) if ch.get("parent_id") is not None else None,
            })

    logger.info(
        "Daily channel sync: fetched %d guild(s), %d channel rows",
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
    data = {
        "message_id": str(message.id),
        "channel_id": str(message.channel.id),
        "channel_name": message.channel.name if hasattr(message.channel, "name") else None,
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
        session_id = f"{member.id}_{datetime.now(timezone.utc).timestamp()}"
        _voice_pending[key] = {
            "session_id": session_id,
            "channel_id": str(after.channel.id),
            "channel_name": after.channel.name,
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
        data = _build_voice_record(
            session_id=f"{member.id}_{datetime.now(timezone.utc).timestamp()}",
            channel_id=str(ch.id),
            channel_name=ch.name,
            user_id=str(member.id),
            user_name=member.name,
            guild_id=str(member.guild.id),
            guild_name=member.guild.name,
            joined_at=None,
            left_at=ts_str,
        )
    await _run_db_sync(_db_insert_voice_sync, data)


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

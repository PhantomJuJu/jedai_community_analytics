# =============================================================================
# タイトル: Discord 活動データ収集ボット（Raw 層 JSONL + Databricks 直接書き込み）
# =============================================================================
# サマリー:
#   Discord のメッセージ受信とボイス状態更新を収集し、
#   (1) data/raw/ の JSONL に保存、(2) 指定した Databricks カタログ・スキーマの
#   テーブルに直接 INSERT する。
#
# =============================================================================
# 実行前提
# =============================================================================
# 実行場所: リポジトリルート。例: cd jedai_pj && python scripts/01_setup/bot.py
#
# 前提条件:
#   - DISCORD_BOT_TOKEN を .env または環境変数に設定。
#   - Databricks へ書き込む場合: .env に次を設定。
#     DATABRICKS_SQL_WAREHOUSE_SERVER_HOSTNAME, DATABRICKS_SQL_WAREHOUSE_HTTP_PATH,
#     DATABRICKS_ACCESS_TOKEN, DATABRICKS_CATALOG, DATABRICKS_SCHEMA
#   - Developer Portal: Message Content Intent 有効。権限: メッセージ履歴・ボイス状態閲覧。
#
# 出力:
#   - data/raw/ に discord_messages_raw.jsonl, discord_voice_activity_raw.jsonl
#   - Databricks: <DATABRICKS_CATALOG>.<DATABRICKS_SCHEMA>.discord_messages_raw /
#     discord_voice_activity_raw に同一データを INSERT
# =============================================================================

import asyncio
import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import aiofiles
import discord
from discord.ext import commands
from dotenv import load_dotenv

load_dotenv()

try:
    from databricks import sql as _databricks_sql
except ImportError:
    _databricks_sql = None  # type: ignore[assignment]

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

# データ保存用ディレクトリ（リポジトリルート/data/raw）
_SCRIPT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPT_DIR.parent.parent
DATA_DIR = _REPO_ROOT / "data" / "raw"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# タイムスタンプ形式: yyyy-MM-dd HH:mm:ss（Databricks・人間可読）
TS_FORMAT = "%Y-%m-%d %H:%M:%S"

# Databricks 設定（未設定の場合は JSONL のみ）
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


async def _append_jsonl(path: Path, data: Dict[str, Any]) -> None:
    """1行 JSON をファイルに非同期で追記する。I/O 失敗時はログして再送出する。"""
    try:
        line = json.dumps(data, ensure_ascii=False) + "\n"
        async with aiofiles.open(path, "a", encoding="utf-8") as f:
            await f.write(line)
    except OSError as e:
        logger.error(
            "File I/O failed in _append_jsonl",
            extra={
                "path": str(path),
                "error_type": type(e).__name__,
                "error_message": str(e),
            },
            exc_info=True,
        )
        raise


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


def _db_ensure_tables_sync() -> None:
    """カタログ・スキーマ内に discord_messages_raw / discord_voice_activity_raw を作成。"""
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
    try:
        with conn.cursor() as cur:
            cur.execute(messages_sql)
            cur.execute(voice_sql)
        conn.commit()
        logger.info(
            "Databricks tables created/verified: %s.%s.discord_messages_raw, discord_voice_activity_raw",
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


async def _run_db_sync(fn: Any, *args: Any, **kwargs: Any) -> None:
    """同期の DB 処理を Executor で実行。失敗時は ERROR でログ（ボットは継続）。"""
    global _db_executor
    if not _DATABRICKS_ENABLED:
        return
    if _db_executor is None:
        logger.error("Databricks: _db_executor is None (tables/inserts will be skipped)")
        return
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(_db_executor, lambda: fn(*args, **kwargs))
    except Exception as e:
        logger.error(
            "Databricks INSERT failed: %s. Check token has MODIFY on table and SQL warehouse is DBR >= 14.2 for parameters.",
            e,
            exc_info=True,
        )


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
    """メッセージデータを Raw 用に保存。3NF 用に id（数値 ID の文字列）と name（表示名）を揃える。"""
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
    path = DATA_DIR / "discord_messages_raw.jsonl"
    try:
        await _append_jsonl(path, data)
    except OSError as e:
        logger.error(
            "save_message_data failed",
            extra={
                "message_id": str(message.id),
                "error_type": type(e).__name__,
                "error_message": str(e),
            },
        )
        raise
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
    """ボイス活動を Raw 用に保存。参加時は待機状態（メモリに保持）のみ、退出時に joined_at と left_at を同一行で1回だけ書き込む。"""
    if before.channel == after.channel:
        return
    ts_str = format_ts(datetime.now(timezone.utc))
    key = (str(member.guild.id), str(member.id))
    path = DATA_DIR / "discord_voice_activity_raw.jsonl"

    if after.channel:
        # 入室: 待機状態としてメモリに保存（ファイルには書かない）
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

    # 退室: 待機していたセッションを同じ行（joined_at + left_at）で1行だけ書き込む
    pending = _voice_pending.pop(key, None)
    try:
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
            # ボット起動前に入室していたなど、待機データがない場合は left_at のみで1行書く
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
        await _append_jsonl(path, data)
        await _run_db_sync(_db_insert_voice_sync, data)
    except OSError as e:
        logger.error(
            "save_voice_activity_data failed",
            extra={
                "member_id": str(member.id),
                "error_type": type(e).__name__,
                "error_message": str(e),
            },
        )
        raise


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

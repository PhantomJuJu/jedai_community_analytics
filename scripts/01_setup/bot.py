# =============================================================================
# タイトル: Discord 活動データ収集ボット（Raw 層 JSONL 出力）
# =============================================================================
# サマリー:
#   Discord のメッセージ受信とボイス状態更新のみを収集し、Raw 層の JSONL ファイルに保存する。
#   このファイルはリポジトリルートから実行し、Databricks 等への取り込み用の生データとして使用する。
#
# =============================================================================
# 実行前提
# =============================================================================
# 実行場所:
#   - リポジトリルート（必須）。例: cd jedai_pj && python scripts/01_setup/bot.py
#   - データは data/raw/ に出力される（スクリプト位置に依存しない絶対パス）。
#
# 前提条件:
#   - 環境変数 DISCORD_BOT_TOKEN が設定されていること（.env またはシェルで設定）。
#   - Developer Portal にて Bot の Privileged Intent を有効にすること:
#     Message Content Intent。
#   - ボットに必要な権限: メッセージ履歴の閲覧、ボイス状態の閲覧。
#
# 出力ファイル（Raw 命名）:
#   data/raw/ に discord_messages_raw.jsonl, discord_voice_activity_raw.jsonl を出力する。
# =============================================================================

import discord
from discord.ext import commands
import os
from dotenv import load_dotenv
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any

import aiofiles

# ボイス「待機」セッション: (guild_id, user_id) -> { session_id, joined_at, channel_*, ... }
# 退出時に同じ行として joined_at / left_at を揃えて1行だけ JSONL に書き込む
_voice_pending: Dict[tuple[str, str], Dict[str, Any]] = {}

# 環境変数の読み込み
load_dotenv()

logger = logging.getLogger(__name__)

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


# ----- イベントハンドラ -----


@bot.event
async def on_ready():
    logger.info("Bot ready", extra={"user": str(bot.user), "guild_count": len(bot.guilds)})


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
    token = os.getenv("DISCORD_BOT_TOKEN")
    if not token:
        logger.error(
            "DISCORD_BOT_TOKEN is not set. Set it in .env or environment (e.g. DISCORD_BOT_TOKEN=your_token_here)."
        )
    else:
        bot.run(token)

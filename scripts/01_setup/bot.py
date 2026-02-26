# =============================================================================
# タイトル: Discord 活動データ収集ボット（Bronze 層 JSONL 出力）
# =============================================================================
# サマリー:
#   Discord のイベント（メッセージ・リアクション・ボイス・メンバー・招待・
#   プレゼンス・チャンネル・スレッド等）を収集し、Bronze 層の JSONL ファイルに保存する。
#   このファイルはリポジトリルートから実行し、Databricks 等への取り込み用の生データとして使用する。
#
# =============================================================================
# 実行前提
# =============================================================================
# 実行場所:
#   - リポジトリルート（必須）。例: cd jedai_pj && python scripts/01_setup/bot.py
#   - データは data/bronze/ に出力される（スクリプト位置に依存しない絶対パス）。
#
# 前提条件:
#   - 環境変数 DISCORD_BOT_TOKEN が設定されていること（.env またはシェルで設定）。
#   - Developer Portal にて Bot の Privileged Intent を有効にすること:
#     Server Members Intent, Presence Intent, Message Content Intent。
#   - ボットに必要な権限: メッセージ履歴の閲覧、リアクション閲覧、ボイス状態閲覧、
#     招待の管理、監査ログの閲覧（fetch_audit_log 利用時）等。
#
# 出力ファイル（Bronze 命名）:
#   JEDAI の bronze_{data_source}_raw に準拠。data/bronze/ に
#   discord_messages_bronze.jsonl, discord_reactions_bronze.jsonl 等を出力する。
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

import aiohttp
import aiofiles

# 環境変数の読み込み
load_dotenv()

logger = logging.getLogger(__name__)

# Intents の設定（データ収集に必要なもの。Presence は Developer Portal で Privileged Intent を有効にすること）
intents = discord.Intents.default()
intents.message_content = True
intents.members = True
intents.guilds = True
intents.guild_messages = True
intents.guild_reactions = True
intents.voice_states = True
intents.presences = True
intents.invites = True

bot = commands.Bot(command_prefix="!", intents=intents)

# データ保存用ディレクトリ（カレントディレクトリに依存しない絶対パス: リポジトリルート/data/bronze）
_SCRIPT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPT_DIR.parent.parent
DATA_DIR = _REPO_ROOT / "data" / "bronze"
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


def _channel_info(channel: Optional[Any]) -> tuple[Optional[str], Optional[str]]:
    """チャンネルが None でない場合の (channel_id, channel_discord_id)。None のときは (None, None)。"""
    if not channel:
        return None, None
    return getattr(channel, "name", str(channel.id)), str(channel.id)


# ----- イベントハンドラ -----


@bot.event
async def on_ready():
    logger.info("Bot ready", extra={"user": str(bot.user), "guild_count": len(bot.guilds)})


@bot.event
async def on_message(message: discord.Message):
    if message.author == bot.user:
        return
    # 本番ではメッセージ本文（PII）をログしないか、短縮する方針を推奨
    logger.debug(
        "Message received",
        extra={"channel_id": message.channel.id, "author_id": message.author.id},
    )
    await save_message_data(message)
    await bot.process_commands(message)


@bot.event
async def on_reaction_add(reaction: discord.Reaction, user: discord.User):
    if user.bot:
        return
    await save_reaction_data(reaction, user, "add")


@bot.event
async def on_reaction_remove(reaction: discord.Reaction, user: discord.User):
    if user.bot:
        return
    await save_reaction_data(reaction, user, "remove")


@bot.event
async def on_voice_state_update(
    member: discord.Member,
    before: discord.VoiceState,
    after: discord.VoiceState,
):
    await save_voice_activity_data(member, before, after)


@bot.event
async def on_member_join(member: discord.Member):
    await save_user_data(member, "join")


@bot.event
async def on_member_remove(member: discord.Member):
    await save_user_data(member, "leave")


@bot.event
async def on_member_update(before: discord.Member, after: discord.Member):
    await save_member_update_data(before, after)


@bot.event
async def on_message_edit(before: discord.Message, after: discord.Message):
    if after.author and after.author.bot:
        return
    await save_message_edit_data(before, after)


@bot.event
async def on_message_delete(message: discord.Message):
    await save_message_delete_data(message)


@bot.event
async def on_invite_create(invite: discord.Invite):
    await save_invite_data(invite, "create")


@bot.event
async def on_invite_delete(invite: discord.Invite):
    await save_invite_data(invite, "delete")


@bot.event
async def on_presence_update(before: discord.Member, after: discord.Member):
    await save_presence_data(before, after)


@bot.event
async def on_guild_channel_create(channel: discord.abc.GuildChannel):
    await save_channel_event_data(channel, "create")


@bot.event
async def on_guild_channel_update(
    before: discord.abc.GuildChannel, after: discord.abc.GuildChannel
):
    await save_channel_event_data(after, "update")


@bot.event
async def on_guild_channel_delete(channel: discord.abc.GuildChannel):
    await save_channel_event_data(channel, "delete")


@bot.event
async def on_thread_create(thread: discord.Thread):
    await save_thread_event_data(thread, "create")


@bot.event
async def on_thread_update(before: discord.Thread, after: discord.Thread):
    await save_thread_event_data(after, "update")


@bot.event
async def on_thread_delete(thread: discord.Thread):
    await save_thread_event_data(thread, "delete")


# ----- データ保存関数 -----


async def save_message_data(message: discord.Message) -> None:
    """メッセージデータを保存（IDは可読文字列、数値は*_discord_idで保持）。"""
    data = {
        "message_id": f"msg-{message.id}",
        "message_discord_id": str(message.id),
        "channel_id": message.channel.name,
        "channel_discord_id": str(message.channel.id),
        "guild_id": message.guild.name if message.guild else None,
        "guild_discord_id": str(message.guild.id) if message.guild else None,
        "author_id": message.author.name,
        "author_discord_id": str(message.author.id),
        "content": message.content,
        "timestamp": format_ts(message.created_at),
        "edited_timestamp": format_ts(message.edited_at) if message.edited_at else None,
        "attachment_count": len(message.attachments),
        "reaction_count": len(message.reactions),
        "is_pinned": message.pinned,
    }
    path = DATA_DIR / "discord_messages_bronze.jsonl"
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


async def save_reaction_data(
    reaction: discord.Reaction, user: discord.User, action: str
) -> None:
    """リアクションデータを保存（IDは可読文字列、数値は*_discord_idで保持）。"""
    emoji_name = (
        reaction.emoji.name
        if hasattr(reaction.emoji, "name")
        else str(reaction.emoji)
    )
    data = {
        "message_id": f"msg-{reaction.message.id}",
        "message_discord_id": str(reaction.message.id),
        "user_id": user.name,
        "user_discord_id": str(user.id),
        "emoji_name": emoji_name,
        "timestamp": format_ts(datetime.now(timezone.utc)),
        "action": action,
    }
    path = DATA_DIR / "discord_reactions_bronze.jsonl"
    try:
        await _append_jsonl(path, data)
    except OSError as e:
        logger.error(
            "save_reaction_data failed",
            extra={
                "message_id": str(reaction.message.id),
                "error_type": type(e).__name__,
                "error_message": str(e),
            },
        )
        raise


def _build_voice_record(
    member: discord.Member,
    channel: discord.VoiceChannel,
    joined_at: Optional[str],
    left_at: Optional[str],
) -> Dict[str, Any]:
    """ボイス入室/退室の共通レコードを組み立てる。"""
    return {
        "session_id": f"{member.name}_{datetime.now(timezone.utc).timestamp()}",
        "channel_id": channel.name,
        "channel_discord_id": str(channel.id),
        "user_id": member.name,
        "user_discord_id": str(member.id),
        "guild_id": member.guild.name,
        "guild_discord_id": str(member.guild.id),
        "joined_at": joined_at,
        "left_at": left_at,
    }


async def save_voice_activity_data(
    member: discord.Member,
    before: discord.VoiceState,
    after: discord.VoiceState,
) -> None:
    """ボイスチャンネル活動データを保存（IDは可読文字列、数値は*_discord_idで保持）。"""
    if before.channel == after.channel:
        return
    ts = datetime.now(timezone.utc)
    ts_str = format_ts(ts)
    path = DATA_DIR / "discord_voice_activity_bronze.jsonl"
    try:
        if after.channel:
            data = _build_voice_record(member, after.channel, joined_at=ts_str, left_at=None)
        else:
            data = _build_voice_record(member, before.channel, joined_at=None, left_at=ts_str)
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


async def save_user_data(member: discord.Member, action: str) -> None:
    """ユーザーデータを保存。"""
    data = {
        "user_id": str(member.id),
        "username": member.name,
        "discriminator": member.discriminator,
        "guild_id": str(member.guild.id),
        "joined_at": format_ts(member.joined_at) if member.joined_at else None,
        "left_at": (
            format_ts(datetime.now(timezone.utc)) if action == "leave" else None
        ),
        "roles": [str(role.id) for role in member.roles if role.name != "@everyone"],
        "is_bot": member.bot,
        "action": action,
        "timestamp": format_ts(datetime.now(timezone.utc)),
    }
    path = DATA_DIR / "discord_users_bronze.jsonl"
    try:
        await _append_jsonl(path, data)
    except OSError as e:
        logger.error(
            "save_user_data failed",
            extra={
                "member_id": str(member.id),
                "action": action,
                "error_type": type(e).__name__,
                "error_message": str(e),
            },
        )
        raise


async def save_member_update_data(
    before: discord.Member, after: discord.Member
) -> None:
    """メンバー更新データを保存。"""
    guild = after.guild
    roles_before = [r.name for r in before.roles if r.name != "@everyone"]
    roles_after = [r.name for r in after.roles if r.name != "@everyone"]
    data = {
        "user_id": after.name,
        "user_discord_id": str(after.id),
        "guild_id": guild.name,
        "guild_discord_id": str(guild.id),
        "nick_before": before.nick,
        "nick_after": after.nick,
        "roles_before": roles_before,
        "roles_after": roles_after,
        "timestamp": format_ts(datetime.now(timezone.utc)),
    }
    path = DATA_DIR / "discord_member_updates_bronze.jsonl"
    try:
        await _append_jsonl(path, data)
    except OSError as e:
        logger.error(
            "save_member_update_data failed",
            extra={
                "member_id": str(after.id),
                "error_type": type(e).__name__,
                "error_message": str(e),
            },
        )
        raise


async def save_message_edit_data(
    before: discord.Message, after: discord.Message
) -> None:
    """メッセージ編集データを保存。チャンネルがない場合は channel_id / channel_discord_id を None で統一。"""
    guild = after.guild
    channel_name, channel_discord_id = _channel_info(after.channel)
    author = after.author
    author_name = author.name if author else None
    author_discord_id = str(author.id) if author else None
    data = {
        "message_id": f"msg-{after.id}",
        "message_discord_id": str(after.id),
        "channel_id": channel_name,
        "channel_discord_id": channel_discord_id,
        "guild_id": guild.name if guild else None,
        "guild_discord_id": str(guild.id) if guild else None,
        "author_id": author_name,
        "author_discord_id": author_discord_id,
        "content": after.content if after.content else None,
        "content_before": (
            before.content
            if hasattr(before, "content") and before.content
            else None
        ),
        "edited_timestamp": format_ts(after.edited_at) if after.edited_at else None,
        "timestamp": format_ts(datetime.now(timezone.utc)),
    }
    path = DATA_DIR / "discord_message_edits_bronze.jsonl"
    try:
        await _append_jsonl(path, data)
    except OSError as e:
        logger.error(
            "save_message_edit_data failed",
            extra={
                "message_id": str(after.id),
                "error_type": type(e).__name__,
                "error_message": str(e),
            },
        )
        raise


async def save_message_delete_data(message: discord.Message) -> None:
    """メッセージ削除データを保存。チャンネルがない場合は channel_id / channel_discord_id を None で統一。"""
    guild = message.guild
    channel_name, channel_discord_id = _channel_info(message.channel)
    data = {
        "message_id": f"msg-{message.id}",
        "message_discord_id": str(message.id),
        "channel_id": channel_name,
        "channel_discord_id": channel_discord_id,
        "guild_id": guild.name if guild else None,
        "guild_discord_id": str(guild.id) if guild else None,
        "deleted_at": format_ts(datetime.now(timezone.utc)),
    }
    if message.content:
        data["content"] = message.content
    path = DATA_DIR / "discord_message_deletes_bronze.jsonl"
    try:
        await _append_jsonl(path, data)
    except OSError as e:
        logger.error(
            "save_message_delete_data failed",
            extra={
                "message_id": str(message.id),
                "error_type": type(e).__name__,
                "error_message": str(e),
            },
        )
        raise


async def save_invite_data(invite: discord.Invite, action: str) -> None:
    """招待作成/削除データを保存。"""
    guild = getattr(invite, "guild", None)
    channel = getattr(invite, "channel", None)
    inviter = getattr(invite, "inviter", None)
    data = {
        "action": action,
        "code": invite.code,
        "guild_id": guild.name if guild else None,
        "guild_discord_id": str(guild.id) if guild else None,
        "channel_id": channel.name if channel else None,
        "channel_discord_id": str(channel.id) if channel else None,
        "inviter_id": inviter.name if inviter else None,
        "inviter_discord_id": str(inviter.id) if inviter else None,
        "uses": getattr(invite, "uses", None),
        "max_uses": getattr(invite, "max_uses", None),
        "created_at": (
            format_ts(invite.created_at)
            if getattr(invite, "created_at", None)
            else None
        ),
        "timestamp": format_ts(datetime.now(timezone.utc)),
    }
    path = DATA_DIR / "discord_invites_bronze.jsonl"
    try:
        await _append_jsonl(path, data)
    except OSError as e:
        logger.error(
            "save_invite_data failed",
            extra={
                "code": invite.code,
                "action": action,
                "error_type": type(e).__name__,
                "error_message": str(e),
            },
        )
        raise


async def save_presence_data(
    before: discord.Member, after: discord.Member
) -> None:
    """プレゼンス更新データを保存（after は Member）。"""
    guild = getattr(after, "guild", None)
    activities_summary = []
    for a in getattr(after, "activities", None) or []:
        activities_summary.append(
            {
                "name": getattr(a, "name", str(a)),
                "type": getattr(a, "type", None),
            }
        )
    data = {
        "user_id": after.name,
        "user_discord_id": str(after.id),
        "guild_id": guild.name if guild else None,
        "guild_discord_id": str(guild.id) if guild else None,
        "status": str(after.status) if getattr(after, "status", None) else None,
        "activities": activities_summary,
        "timestamp": format_ts(datetime.now(timezone.utc)),
    }
    path = DATA_DIR / "discord_presence_bronze.jsonl"
    try:
        await _append_jsonl(path, data)
    except OSError as e:
        logger.error(
            "save_presence_data failed",
            extra={
                "user_id": str(after.id),
                "error_type": type(e).__name__,
                "error_message": str(e),
            },
        )
        raise


async def save_channel_event_data(
    channel: discord.abc.GuildChannel, event_type: str
) -> None:
    """チャンネル作成/更新/削除データを保存（スレッド除く）。"""
    thread_type_values = (10, 11, 12)
    if getattr(channel, "type", None) in thread_type_values:
        return
    guild = getattr(channel, "guild", None)
    parent_id = (
        str(channel.category_id)
        if hasattr(channel, "category_id") and channel.category_id
        else None
    )
    data = {
        "event_type": event_type,
        "channel_id": getattr(channel, "name", str(channel.id)),
        "channel_discord_id": str(channel.id),
        "guild_id": guild.name if guild else None,
        "guild_discord_id": str(guild.id) if guild else None,
        "parent_id": parent_id,
        "type": str(getattr(channel, "type", "")),
        "timestamp": format_ts(datetime.now(timezone.utc)),
    }
    path = DATA_DIR / "discord_channel_events_bronze.jsonl"
    try:
        await _append_jsonl(path, data)
    except OSError as e:
        logger.error(
            "save_channel_event_data failed",
            extra={
                "channel_id": str(channel.id),
                "event_type": event_type,
                "error_type": type(e).__name__,
                "error_message": str(e),
            },
        )
        raise


async def save_thread_event_data(
    thread: discord.Thread, event_type: str
) -> None:
    """スレッド作成/更新/削除データを保存。"""
    guild = getattr(thread, "guild", None)
    parent = getattr(thread, "parent", None)
    parent_id = str(parent.id) if parent else None
    parent_name = parent.name if parent else None
    data = {
        "event_type": event_type,
        "thread_id": getattr(thread, "name", str(thread.id)),
        "thread_discord_id": str(thread.id),
        "parent_channel_id": parent_name,
        "parent_channel_discord_id": parent_id,
        "guild_id": guild.name if guild else None,
        "guild_discord_id": str(guild.id) if guild else None,
        "timestamp": format_ts(datetime.now(timezone.utc)),
    }
    path = DATA_DIR / "discord_thread_events_bronze.jsonl"
    try:
        await _append_jsonl(path, data)
    except OSError as e:
        logger.error(
            "save_thread_event_data failed",
            extra={
                "thread_id": str(thread.id),
                "event_type": event_type,
                "error_type": type(e).__name__,
                "error_message": str(e),
            },
        )
        raise


# ----- コマンド: メタデータ一括取得・Audit Log -----


async def _save_guild_meta(guild: discord.Guild) -> None:
    """ギルド 1 件を JSONL に追記する。"""
    guild_data = {
        "guild_id": str(guild.id),
        "guild_name": guild.name,
        "name": guild.name,
        "owner_id": str(guild.owner_id),
        "member_count": guild.member_count,
        "created_at": format_ts(guild.created_at),
        "premium_tier": guild.premium_tier,
    }
    await _append_jsonl(DATA_DIR / "discord_guilds_bronze.jsonl", guild_data)


async def _save_channels_meta(guild: discord.Guild) -> int:
    """ギルドのチャンネル一覧を JSONL に追記し、件数を返す。"""
    count = 0
    for channel in guild.channels:
        ch_data = {
            "channel_id": str(channel.id),
            "guild_id": str(guild.id),
            "guild_name": guild.name,
            "name": channel.name,
            "type": str(channel.type),
            "topic": getattr(channel, "topic", None),
            "parent_id": (
                str(channel.category_id)
                if hasattr(channel, "category_id") and channel.category_id
                else None
            ),
            "created_at": (
                format_ts(channel.created_at)
                if hasattr(channel, "created_at") and channel.created_at
                else None
            ),
            "position": getattr(channel, "position", None),
        }
        await _append_jsonl(DATA_DIR / "discord_channels_bronze.jsonl", ch_data)
        count += 1
    return count


async def _save_roles_meta(guild: discord.Guild) -> int:
    """ギルドのロール（@everyone 除く）を JSONL に追記し、件数を返す。"""
    count = 0
    for role in guild.roles:
        if role.name == "@everyone":
            continue
        role_data = {
            "role_id": str(role.id),
            "guild_id": str(guild.id),
            "guild_name": guild.name,
            "name": role.name,
            "color": role.color.value,
            "permissions": role.permissions.value,
            "position": role.position,
        }
        await _append_jsonl(DATA_DIR / "discord_roles_bronze.jsonl", role_data)
        count += 1
    return count


@bot.command(name="sync_metadata")
@commands.has_permissions(administrator=True)
async def sync_metadata(ctx: commands.Context) -> None:
    """現在のギルドのメタ情報（guild / channels / roles）を一括で JSONL に保存する。管理者権限が必要。"""
    if not ctx.guild:
        await ctx.send("このコマンドはサーバー内でのみ使用できます。")
        return
    guild = ctx.guild
    try:
        await _save_guild_meta(guild)
        channel_count = await _save_channels_meta(guild)
        role_count = await _save_roles_meta(guild)
        await ctx.send(
            f"✅ メタデータを保存しました: {guild.name}（guild 1件、チャンネル {channel_count} 件、ロール {role_count} 件）"
        )
    except OSError as e:
        logger.error(
            "sync_metadata failed",
            extra={
                "guild_id": str(guild.id),
                "error_type": type(e).__name__,
                "error_message": str(e),
            },
        )
        await ctx.send("❌ メタデータの保存中にエラーが発生しました。")


@sync_metadata.error
async def sync_metadata_error(ctx: commands.Context, error: Exception):
    """sync_metadata の権限エラー等をハンドルする。"""
    if isinstance(error, commands.MissingPermissions):
        await ctx.send("❌ このコマンドには管理者権限が必要です。")
        return
    raise error


@bot.command(name="fetch_audit_log")
@commands.has_permissions(view_audit_log=True)
async def fetch_audit_log(ctx: commands.Context, limit: int = 50) -> None:
    """REST API で監査ログを取得し discord_audit_log_bronze.jsonl に追記する。監査ログの閲覧権限が必要。"""
    if not ctx.guild:
        await ctx.send("このコマンドはサーバー内でのみ使用できます。")
        return
    limit = max(1, min(100, limit))
    token = os.getenv("DISCORD_BOT_TOKEN")
    if not token:
        await ctx.send("❌ DISCORD_BOT_TOKEN が設定されていません。")
        return
    url = f"https://discord.com/api/v10/guilds/{ctx.guild.id}/audit-logs?limit={limit}"
    headers = {"Authorization": f"Bot {token}"}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as resp:
                if resp.status != 200:
                    body_text = await resp.text()
                    logger.error(
                        "Audit log API failed",
                        extra={
                            "guild_id": str(ctx.guild.id),
                            "status": resp.status,
                            "response_preview": body_text[:200] if body_text else None,
                        },
                    )
                    await ctx.send(
                        f"❌ 監査ログの取得に失敗しました（HTTP {resp.status}）。権限 VIEW_AUDIT_LOG を確認してください。"
                    )
                    return
                body = await resp.json()
    except aiohttp.ClientError as e:
        logger.error(
            "Audit log request failed",
            extra={
                "guild_id": str(ctx.guild.id),
                "error_type": type(e).__name__,
                "error_message": str(e),
            },
        )
        await ctx.send("❌ 監査ログの取得中にネットワークエラーが発生しました。")
        return
    entries = body.get("audit_log_entries", [])
    path = DATA_DIR / "discord_audit_log_bronze.jsonl"
    for entry in entries:
        entry["guild_id"] = str(ctx.guild.id)
        entry["guild_name"] = ctx.guild.name
        try:
            await _append_jsonl(path, entry)
        except OSError as e:
            logger.error(
                "fetch_audit_log write failed",
                extra={
                    "guild_id": str(ctx.guild.id),
                    "entry_id": entry.get("id"),
                    "error_type": type(e).__name__,
                    "error_message": str(e),
                },
            )
            await ctx.send("❌ 監査ログの保存中にエラーが発生しました。")
            return
    await ctx.send(f"✅ 監査ログを {len(entries)} 件保存しました。")


@fetch_audit_log.error
async def fetch_audit_log_error(ctx: commands.Context, error: Exception):
    """fetch_audit_log の権限エラー等をハンドルする。"""
    if isinstance(error, commands.MissingPermissions):
        await ctx.send("❌ このコマンドには監査ログの閲覧権限が必要です。")
        return
    raise error


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

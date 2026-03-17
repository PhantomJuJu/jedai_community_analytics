# =============================================================================
# タイトル: Discord REST API でギルド・チャンネル・スレッド一覧を取得
# =============================================================================
from __future__ import annotations
# サマリー:
#   Bot トークンで GET /guilds/{guild.id}/channels でギルド内チャンネル一覧、
#   GET /guilds/{guild.id}/threads/active でアクティブスレッド一覧を取得する。
#   guild_list / guild_detail / guild_members の取得・保存は行わない。
#
# 実行前提:
#   - リポジトリルートで .env を読み込めること。例: cd jedai_pj && python3 scripts/01_setup/fetch_guild_info.py
#   - .env に DISCORD_BOT_TOKEN を設定。
#
# 使い方:
#   python3 scripts/01_setup/fetch_guild_info.py              # 参加ギルドごとにチャンネル取得（ギルド一覧はメモリ上のみ、保存しない）
#   python3 scripts/01_setup/fetch_guild_info.py <guild_id>   # 指定ギルドのチャンネルのみ取得
#
# 出力:
#   - ファイル: data/raw/guild_channels_<guild_id>.jsonl
#     - 1チャンネル = 1行の JSON（JSONL）。以下のキーは出力に含めない:
#       last_message_id, flags, rate_limit_per_user, topic, position,
#       permission_overwrites, nsfw, bitrate, user_limit, rtc_region
#   - コンソール: 保存先と件数をログ出力
# =============================================================================

import json
import logging
import os
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# リポジトリルートで .env を読む（dotenv が無い環境では環境変数のみ使用）
_SCRIPT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPT_DIR.parent.parent
try:
    from dotenv import load_dotenv
    load_dotenv(_REPO_ROOT / ".env")
except ImportError:
    pass

logger = logging.getLogger(__name__)

DISCORD_API_BASE = "https://discord.com/api/v10"
REQUEST_TIMEOUT = 15
DATA_DIR = _REPO_ROOT / "data" / "raw"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# チャンネル出力から除外するキー
CHANNEL_EXCLUDE_KEYS = frozenset({
    "last_message_id",
    "flags",
    "rate_limit_per_user",
    "topic",
    "position",
    "permission_overwrites",
    "nsfw",
    "bitrate",
    "user_limit",
    "rtc_region",
})

# 構造化エラーコード（JEDAI: MODULE_FUNCTION_ERROR_TYPE）
ERROR_REQUEST_HTTP = "FETCH_GUILD_INFO_REQUEST_HTTP_ERROR"
ERROR_REQUEST_NETWORK = "FETCH_GUILD_INFO_REQUEST_NETWORK_ERROR"
ERROR_SAVE_JSONL = "FETCH_GUILD_INFO_SAVE_JSONL_ERROR"
ERROR_REQUEST_JSON = "FETCH_GUILD_INFO_REQUEST_JSON_ERROR"

# ギルドID: Discord の snowflake は数字のみ。ファイル名に使うため厳格に検証する。
GUILD_ID_PATTERN = re.compile(r"^[0-9]{17,22}$")


def _setup_logging() -> None:
    """ロギングを設定する（標準出力に INFO 以上を出力）。"""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def _validate_guild_id(guild_id: str) -> bool:
    """ギルドID が Discord snowflake 形式（数字 17–22 桁）か検証する。ファイル名に安全に使うため。"""
    return bool(guild_id and GUILD_ID_PATTERN.fullmatch(str(guild_id).strip()))


def _request(method: str, path: str, token: str, query: str = "") -> dict | list:
    """
    Discord API に GET でリクエストし、JSON レスポンスを返す。

    Args:
        method: HTTP メソッド（本スクリプトでは GET のみ使用）。
        path: API パス（例: /users/@me/guilds）。
        token: Bot トークン（ログには出力しない）。
        query: クエリ文字列（省略時は空）。

    Returns:
        API の JSON レスポンス（dict または list）。

    Raises:
        HTTPError: HTTP 4xx/5xx が返った場合。
        URLError: 接続エラー・タイムアウト等。
    """
    url = f"{DISCORD_API_BASE}{path}"
    if query:
        url += "?" + query
    req = Request(url, method=method)
    req.add_header("Authorization", f"Bot {token}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "DiscordBot (GuildInfoFetch 1.0)")
    with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        raw = resp.read().decode()
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error(
            "Discord API response JSON decode error",
            extra={
                "error_code": ERROR_REQUEST_JSON,
                "path": path,
                "error_message": str(e),
            },
        )
        raise


def get_bot_guilds(token: str) -> list[dict[str, Any]]:
    """ボットが参加しているギルドの一覧（部分オブジェクト）を返す。保存はしない。"""
    return _request("GET", "/users/@me/guilds", token)


def get_guild_channels(token: str, guild_id: str) -> list[dict[str, Any]]:
    """GET /guilds/{guild.id}/channels でギルド内チャンネル一覧を返す。"""
    path = f"/guilds/{guild_id}/channels"
    return _request("GET", path, token)


def get_guild_threads_active(token: str, guild_id: str, max_retries: int = 3) -> list[dict[str, Any]]:
    """
    GET /guilds/{guild_id}/threads/active でギルド内のアクティブスレッド一覧を返す。
    429 レート制限時は Retry-After 秒待ってリトライする。失敗時はログして空リストを返す。
    """
    path = f"/guilds/{guild_id}/threads/active"
    last_exc = None
    for attempt in range(max_retries + 1):
        try:
            data = _request("GET", path, token)
            if isinstance(data, dict):
                return data.get("threads") or []
            return []
        except HTTPError as e:
            last_exc = e
            if e.code == 429 and attempt < max_retries:
                try:
                    retry_after = int(e.headers.get("Retry-After", 1) or 1)
                except (TypeError, ValueError):
                    retry_after = 1
                retry_after = max(1, min(retry_after, 60))
                logger.warning(
                    "Discord threads API rate limit (429), retrying after %s s (guild_id=%s)",
                    retry_after,
                    guild_id,
                    extra={"error_code": ERROR_REQUEST_HTTP, "guild_id": guild_id},
                )
                time.sleep(retry_after)
                continue
            logger.warning(
                "Discord threads API HTTP error (guild_id=%s): %s %s",
                guild_id,
                e.code,
                e.reason,
                extra={"error_code": ERROR_REQUEST_HTTP, "guild_id": guild_id, "status_code": e.code},
            )
            return []
        except (URLError, ValueError, json.JSONDecodeError) as e:
            logger.warning(
                "Discord threads API error (guild_id=%s): %s",
                guild_id,
                e,
                extra={"error_code": ERROR_REQUEST_NETWORK, "guild_id": guild_id},
            )
            return []
    return []


def filter_channel(channel: dict[str, Any]) -> dict[str, Any]:
    """除外キーを除いたチャンネルオブジェクトを返す。"""
    return {k: v for k, v in channel.items() if k not in CHANNEL_EXCLUDE_KEYS}


def save_channels_jsonl(guild_id: str, channels: list[dict[str, Any]]) -> Path:
    """
    フィルタ済みチャンネルを 1 行 1 チャンネルの JSONL で保存する。

    Args:
        guild_id: ギルド ID（ファイル名に使用）。
        channels: チャンネル dict のリスト（filter_channel は呼び出し元で適用可、ここでは適用する）。

    Returns:
        保存したファイルの Path。

    Raises:
        OSError: ファイル書き込みに失敗した場合。
    """
    out_path = DATA_DIR / f"guild_channels_{guild_id}.jsonl"
    with open(out_path, "w", encoding="utf-8") as f:
        for ch in channels:
            line = json.dumps(filter_channel(ch), ensure_ascii=False) + "\n"
            f.write(line)
    return out_path


def fetch_and_save_channels(token: str, guild_id: str) -> bool:
    """
    チャンネル一覧を取得し、JSONL で保存する。

    Args:
        token: Bot トークン。
        guild_id: ギルド ID（数字文字列。ファイル名に使用するため検証する）。

    Returns:
        成功した場合 True、HTTP/ネットワーク/保存エラー時は False（ログ出力後に False を返す）。
    """
    guild_id_str = str(guild_id).strip()
    if not _validate_guild_id(guild_id_str):
        logger.error(
            "Invalid guild_id for file path",
            extra={"error_code": "FETCH_GUILD_INFO_INVALID_GUILD_ID", "guild_id": guild_id_str},
        )
        return False
    try:
        channels = get_guild_channels(token, guild_id_str)
        out_path = save_channels_jsonl(guild_id_str, channels)
        logger.info(
            "Channels saved",
            extra={"guild_id": guild_id_str, "path": str(out_path), "count": len(channels)},
        )
        return True
    except (json.JSONDecodeError, ValueError) as e:
        logger.error(
            "Channel list response JSON decode error",
            extra={
                "error_code": ERROR_REQUEST_JSON,
                "guild_id": guild_id_str,
                "error_type": type(e).__name__,
                "error_message": str(e),
            },
        )
        return False
    except HTTPError as e:
        body = ""
        if e.fp:
            try:
                body = e.fp.read().decode()[:500]
            except (OSError, ValueError):
                pass
        logger.error(
            "Channel fetch HTTP error",
            extra={
                "error_code": ERROR_REQUEST_HTTP,
                "guild_id": guild_id_str,
                "status_code": e.code,
                "reason": e.reason,
                "body_preview": body[:300] if body else None,
            },
        )
        return False
    except URLError as e:
        logger.error(
            "Channel fetch network error",
            extra={
                "error_code": ERROR_REQUEST_NETWORK,
                "guild_id": guild_id_str,
                "reason": str(e.reason),
            },
        )
        return False
    except OSError as e:
        logger.error(
            "Save channels JSONL failed",
            extra={
                "error_code": ERROR_SAVE_JSONL,
                "guild_id": guild_id_str,
                "error_type": type(e).__name__,
                "error_message": str(e),
            },
            exc_info=True,
        )
        return False


def main() -> None:
    """エントリポイント: トークン検証後、単一ギルド指定または参加全ギルドのチャンネルを取得する。"""
    _setup_logging()

    token = os.getenv("DISCORD_BOT_TOKEN")
    if not token or not token.strip():
        logger.error(
            "DISCORD_BOT_TOKEN is not set. Set it in .env or environment.",
            extra={"error_code": "FETCH_GUILD_INFO_TOKEN_MISSING"},
        )
        sys.exit(1)
    token = token.strip()

    if len(sys.argv) >= 2:
        guild_id = sys.argv[1].strip()
        if not _validate_guild_id(guild_id):
            logger.error(
                "Invalid guild_id from argument",
                extra={"error_code": "FETCH_GUILD_INFO_INVALID_GUILD_ID", "guild_id": guild_id},
            )
            sys.exit(1)
        logger.info("Fetching channels for guild_id=%s", guild_id)
        if not fetch_and_save_channels(token, guild_id):
            sys.exit(1)
        return

    logger.info("Fetching channels for all joined guilds (guild list not persisted)")
    try:
        guilds = get_bot_guilds(token)
    except (json.JSONDecodeError, ValueError) as e:
        logger.error(
            "Get bot guilds response JSON decode error",
            extra={
                "error_code": ERROR_REQUEST_JSON,
                "error_type": type(e).__name__,
                "error_message": str(e),
            },
        )
        sys.exit(1)
    except HTTPError as e:
        body = ""
        if e.fp:
            try:
                body = e.fp.read().decode()[:500]
            except (OSError, ValueError):
                pass
        logger.error(
            "Get bot guilds HTTP error",
            extra={
                "error_code": ERROR_REQUEST_HTTP,
                "status_code": e.code,
                "reason": e.reason,
                "body_preview": body[:300] if body else None,
            },
        )
        sys.exit(1)
    except URLError as e:
        logger.error(
            "Get bot guilds network error",
            extra={"error_code": ERROR_REQUEST_NETWORK, "reason": str(e.reason)},
        )
        sys.exit(1)

    if not guilds:
        logger.info("No guilds joined")
        return

    logger.info("Target guild count: %d", len(guilds))
    failed = 0
    for g in guilds:
        gid = g.get("id")
        name = g.get("name", "")
        if gid is None:
            continue
        guild_id_str = str(gid).strip()
        logger.info("Processing guild_id=%s name=%s", guild_id_str, name or "(no name)")
        if not fetch_and_save_channels(token, guild_id_str):
            failed += 1

    if failed:
        logger.warning("Completed with %d guild(s) failed", failed)


if __name__ == "__main__":
    main()

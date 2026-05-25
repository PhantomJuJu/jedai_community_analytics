"""
Load STATIC_PROMPT_CORE from discord-platform-jedai (App source of truth)
and build full prompts with the same section order as server/build_prompt.ts.
"""

from __future__ import annotations

from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def static_prompt_core_ts_path() -> Path:
    return repo_root() / "apps/discord-platform-jedai/server/static_prompt_core.ts"


def load_static_prompt_core() -> str:
    text = static_prompt_core_ts_path().read_text(encoding="utf-8")
    marker = "export const STATIC_PROMPT_CORE = `"
    start = text.index(marker) + len(marker)
    end = text.rindex("`;")
    return text[start:end]


def build_hyperparameter_block(
    tone: str,
    length: str,
    formality: str,
    emoji_density: str,
    structure: str,
    cta_strength: str,
) -> str:
    length_help = (
        "short: 〜100字（1〜2文） / medium: 101〜300字（2〜5文） / long: 301字〜（補足・背景あり）"
    )
    emoji_help = "なし=0個 / 少なめ=1〜2個 / 普通=3〜5個 / 多め=6個以上"
    return f"""[Hyperparameter Definitions — この生成の指定値]
- このブロックは [User request] 内の文体・長さ・構成・絵文字・CTA の記述より優先する
- Tone: {tone}
- Length: {length} ({length_help})
- Formality: {formality}
- Emoji density: {emoji_density} ({emoji_help})
- Structure: {structure}
- Call-to-action strength: {cta_strength}
"""


def build_full_prompt(
    *,
    tone: str,
    length: str,
    formality: str,
    emoji_density: str,
    structure: str,
    cta_strength: str,
    user_request: str,
    context_facts: str | None = None,
    static_core: str | None = None,
) -> str:
    core = static_core if static_core is not None else load_static_prompt_core()
    hyper_block = build_hyperparameter_block(
        tone, length, formality, emoji_density, structure, cta_strength
    )
    split = core.split("[Single-parameter Examples", 1)
    if len(split) < 2:
        raise ValueError("STATIC_PROMPT_CORE missing [Single-parameter Examples marker")
    head = split[0].rstrip()
    single_combined = (
        "[Single-parameter Examples"
        + split[1].split("[Output instruction]", 1)[0].rstrip()
    )
    output_instruction = (
        "[Output instruction]" + core.split("[Output instruction]", 1)[1].strip()
    )
    context_block = (
        f"\n\n[Context facts]\n{context_facts.strip()}"
        if context_facts and context_facts.strip()
        else ""
    )
    return (
        head
        + "\n\n"
        + hyper_block
        + "\n\n"
        + single_combined
        + context_block
        + "\n\n[User request (natural language)]\n"
        + user_request.strip()
        + "\n\n"
        + output_instruction
    )

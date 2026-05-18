#!/usr/bin/env python3
"""
Unity Catalog のカタログ・スキーマ・テーブル一覧を取得し、
docs/databricks_tables_snapshot.md と docs/databricks_tables_snapshot.json に出力する。

実行前に .env に DATABRICKS_HOST と DATABRICKS_TOKEN を設定すること。
  - DATABRICKS_HOST: ワークスペース URL（例: https://xxx.azuredatabricks.net）
  - DATABRICKS_TOKEN: Personal Access Token

Usage:
  pip install requests python-dotenv
  python scripts/08_maintenance/list_databricks_tables.py

Output:
  docs/databricks_tables_snapshot.md
  docs/databricks_tables_snapshot.json
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# プロジェクトルートを sys.path に追加し、.env を読む
PROJECT_ROOT = Path(__file__).resolve().parents[2]
os.chdir(PROJECT_ROOT)
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

import requests

# .env をプロジェクトルートから明示的に読み込む
_env_path = PROJECT_ROOT / ".env"
if _env_path.exists():
    if load_dotenv is not None:
        load_dotenv(_env_path, override=True)
    else:
        print("WARNING: python-dotenv not installed; .env may not be loaded.", file=sys.stderr)
else:
    print(f"WARNING: .env not found at {_env_path}", file=sys.stderr)

def _env(key: str) -> str:
    v = os.getenv(key) or ""
    v = v.strip().strip('"').strip("'")
    return v


# ワークスペース URL: DATABRICKS_HOST または DATABRICKS_WORKSPACE_URL
DATABRICKS_HOST = (_env("DATABRICKS_HOST") or _env("DATABRICKS_WORKSPACE_URL")).rstrip("/")
# PAT: DATABRICKS_TOKEN / DATABRICKS_PAT / DATABRICKS_ACCESS_TOKEN
DATABRICKS_TOKEN = _env("DATABRICKS_TOKEN") or _env("DATABRICKS_PAT") or _env("DATABRICKS_ACCESS_TOKEN")

if not DATABRICKS_HOST or not DATABRICKS_TOKEN:
    print(
        "ERROR: Set (DATABRICKS_HOST or DATABRICKS_WORKSPACE_URL) and "
        "(DATABRICKS_TOKEN or DATABRICKS_PAT or DATABRICKS_ACCESS_TOKEN) in .env",
        file=sys.stderr,
    )
    print(f"  (DATABRICKS_HOST set: {bool(DATABRICKS_HOST)}, token set: {bool(DATABRICKS_TOKEN)}, .env path: {_env_path})", file=sys.stderr)
    sys.exit(1)

BASE_URL = f"{DATABRICKS_HOST}/api/2.1/unity-catalog"
HEADERS = {"Authorization": f"Bearer {DATABRICKS_TOKEN}", "Content-Type": "application/json"}


def _check_response(r: requests.Response, context: str) -> None:
    if r.ok:
        return
    print(f"ERROR: Databricks API {context}: {r.status_code}", file=sys.stderr)
    try:
        body = r.json()
        print(f"  Response: {body}", file=sys.stderr)
    except Exception:
        print(f"  Body: {r.text[:500]}", file=sys.stderr)
    r.raise_for_status()


def get_catalogs() -> list[dict]:
    r = requests.get(f"{BASE_URL}/catalogs", headers=HEADERS, timeout=30)
    _check_response(r, "list catalogs")
    data = r.json()
    return data.get("catalogs", [])

def get_schemas(catalog_name: str) -> list[dict]:
    r = requests.get(f"{BASE_URL}/schemas", headers=HEADERS, params={"catalog_name": catalog_name}, timeout=30)
    _check_response(r, f"list schemas (catalog={catalog_name})")
    data = r.json()
    return data.get("schemas", [])

def get_tables(catalog_name: str, schema_name: str) -> list[dict]:
    r = requests.get(
        f"{BASE_URL}/tables",
        headers=HEADERS,
        params={"catalog_name": catalog_name, "schema_name": schema_name},
        timeout=30,
    )
    _check_response(r, f"list tables ({catalog_name}.{schema_name})")
    data = r.json()
    return data.get("tables", [])


def main() -> None:
    structure: dict = {"catalogs": {}}
    lines_md = [
        "# Databricks Unity Catalog テーブル一覧（スナップショット）",
        "",
        "このファイルは `scripts/08_maintenance/list_databricks_tables.py` を実行すると更新されます。",
        "Phase 2 バックログ・接続メモの参照用。シークレットは含みません。",
        "",
    ]

    for cat in get_catalogs():
        cname = cat.get("name") or cat.get("catalog_name") or ""
        if not cname:
            continue
        structure["catalogs"][cname] = {"schemas": {}}
        lines_md.append(f"## カタログ: `{cname}`")
        lines_md.append("")

        for sch in get_schemas(cname):
            sname = sch.get("name") or sch.get("schema_name") or ""
            if not sname:
                continue
            structure["catalogs"][cname]["schemas"][sname] = {"tables": []}
            lines_md.append(f"### スキーマ: `{cname}.{sname}`")
            lines_md.append("")

            for tbl in get_tables(cname, sname):
                tname = tbl.get("name") or tbl.get("table_name") or ""
                if not tname:
                    continue
                full_name = f"{cname}.{sname}.{tname}"
                structure["catalogs"][cname]["schemas"][sname]["tables"].append(tname)
                lines_md.append(f"- `{full_name}`")

            lines_md.append("")

    docs_dir = PROJECT_ROOT / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)

    md_path = docs_dir / "databricks_tables_snapshot.md"
    json_path = docs_dir / "databricks_tables_snapshot.json"

    md_path.write_text("\n".join(lines_md), encoding="utf-8")
    json_path.write_text(json.dumps(structure, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote {md_path}")
    print(f"Wrote {json_path}")


if __name__ == "__main__":
    try:
        main()
    except requests.RequestException as e:
        print(f"ERROR: Request failed: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        raise

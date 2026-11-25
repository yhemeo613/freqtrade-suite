# -*- coding: utf-8 -*-
"""检查公开仓库中的配置模板不含真实密钥。

本仓库已开启 GitHub 密钥扫描与推送保护,但模板文件(公开)一旦被误填入真实
API key / JWT 密钥 / Telegram token,仍可能泄露。本脚本用于 CI 与本地双重把关:

- 遍历 frontend-server/user_data/ 下所有 config*.json(排除已 gitignore 的运行配置
  config.json),校验:
    1. exchange.key / exchange.secret / exchange.password 必须为空字符串
    2. api_server.jwt_secret_key 若存在必须是占位符(含「替换」等字样)
    3. telegram.token 若存在必须为空字符串
- 违规时打印具体文件与字段并以退出码 1 结束(CI 会失败)。

用法:
    python scripts/check_templates_no_secrets.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

USER_DATA = Path(__file__).resolve().parent.parent / "frontend-server" / "user_data"
# 运行配置(已 gitignore,可能含真实密钥),不属于模板,跳过
SKIP = {"config.json"}

PLACEHOLDER_MARKERS = ("替换", "change-me", "changeme", "replace", "REPLACE")


def check_one(path: Path) -> list[str]:
    """返回该模板的违规描述列表;合规返回空列表。"""
    problems: list[str] = []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        return [f"JSON 解析失败: {e}"]

    ex = data.get("exchange") or {}
    for field in ("key", "secret", "password"):
        value = ex.get(field)
        if value:
            problems.append(f"exchange.{field} 非空(疑似真实密钥)")

    api = data.get("api_server") or {}
    jwt = api.get("jwt_secret_key")
    if jwt and not any(m in str(jwt) for m in PLACEHOLDER_MARKERS):
        problems.append("api_server.jwt_secret_key 疑似真实 JWT 密钥(应为占位符)")

    tg = data.get("telegram") or {}
    if tg.get("token"):
        problems.append("telegram.token 非空(疑似真实 Bot Token)")

    return problems


def main() -> int:
    failed = 0
    checked = 0
    for path in sorted(USER_DATA.glob("config*.json")):
        if path.name in SKIP:
            continue
        checked += 1
        problems = check_one(path)
        if problems:
            failed += 1
            print(f"[FAIL] {path.name}")
            for p in problems:
                print(f"       - {p}")
        else:
            print(f"[OK]   {path.name}")
    print(f"--- 共检查 {checked} 个模板,{failed} 个违规 ---")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

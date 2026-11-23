#!/usr/bin/env python3
"""按需获取「上游无 LICENSE」的社区策略（不随本仓库分发）

用法（仓库根目录）:
    python scripts/fetch_optional_strategies.py            # 全部获取
    python scripts/fetch_optional_strategies.py --only ClucHAnix NASOSv5_mod3
    python scripts/fetch_optional_strategies.py --force    # 覆盖已有文件

说明:
- 这些策略的上游仓库没有 LICENSE 文件，默认「保留所有权利」。
  本仓库不包含其代码；下载仅在你自己的机器上使用，请勿再分发。
- 下载后会应用与 freqtrade 2026.11 / NumPy 2 的兼容补丁（旧属性/方法/列名、np.NaN 等）。
- 文件会写入 frontend-server/user_data/strategies/（该目录下的这些文件已被 .gitignore 忽略）。
"""

import argparse
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, "frontend-server", "user_data", "strategies")

# 文件 -> (raw URL, 兼容补丁替换列表)
STRATEGIES = {
    "ClucHAnix.py": (
        "https://raw.githubusercontent.com/ssssi/freqtrade_strs/3ed699f/ClucHAnix/ClucHAnix.py",
        "legacy",
    ),
    "ClucHAnix_5m.py": (
        "https://raw.githubusercontent.com/ssssi/freqtrade_strs/3ed699f/ClucHAnix/ClucHAnix_5m.py",
        "legacy",
    ),
    "E0V1E.py": (
        "https://raw.githubusercontent.com/ssssi/freqtrade_strs/3ed699f/binance/dry_run/buy1_and_buynew/E0V1E.py",
        "legacy",
    ),
    "E0V1EN.py": (
        "https://raw.githubusercontent.com/ssssi/freqtrade_strs/3ed699f/binance/dry_run/E0V1EN.py",
        "legacy",
    ),
    "MarketStructureCHOCH.py": (
        "https://raw.githubusercontent.com/zmomz/freq_strategies/aa90bf6/strategies/MarketStructureCHOCH.py",
        "legacy",
    ),
    "NASOSv4.py": (
        "https://raw.githubusercontent.com/zmomz/freq_strategies/aa90bf6/strategies/NASOSv4.py",
        "legacy",
    ),
    "NASOSv5_mod3.py": (
        "https://raw.githubusercontent.com/zmomz/freq_strategies/aa90bf6/strategies/NASOSv5_mod3.py",
        "legacy",
    ),
    "TrendLines.py": (
        "https://raw.githubusercontent.com/zmomz/freq_strategies/aa90bf6/strategies/TrendLines.py",
        "legacy",
    ),
}

LEGACY_PATCHES = [
    ("np.NaN", "np.nan"),
    ("np.NAN", "np.nan"),
    ("def populate_buy_trend(", "def populate_entry_trend("),
    ("def populate_sell_trend(", "def populate_exit_trend("),
    ("'buy_tag'", "'enter_tag'"),
    ("'sell_tag'", "'exit_tag'"),
    ("['buy',", "['enter_long',"),
    ("['sell',", "['exit_long',"),
    ("'buy']", "'enter_long']"),
    ("'sell']", "'exit_long']"),
    ("'buy': '", "'entry': '"),
    ("'sell': '", "'exit': '"),
    ("space='buy'", "space='enter'"),
    ("space='sell'", "space='exit'"),
    ("def custom_sell(", "def custom_exit("),
    ("custom_sell(", "custom_exit("),
    ("sell_reason", "exit_reason"),
    ("trade.buy_tag", "trade.enter_tag"),
    ("trade.sell_tag", "trade.exit_tag"),
]


def main() -> None:
    ap = argparse.ArgumentParser(description="获取上游无 LICENSE 的社区策略")
    ap.add_argument("--only", nargs="+", help="只获取指定文件名")
    ap.add_argument("--force", action="store_true", help="覆盖已存在文件")
    args = ap.parse_args()

    os.makedirs(DEST, exist_ok=True)
    print("注意：以下策略上游仓库没有 LICENSE 文件（默认保留所有权利）。")
    print("      本脚本仅为你本机获取使用，请勿再分发。\n")

    names = args.only or list(STRATEGIES)
    ok, skipped, failed = 0, 0, 0
    for name in names:
        if name not in STRATEGIES:
            print(f"[跳过] 未知策略: {name}")
            skipped += 1
            continue
        url, mode = STRATEGIES[name]
        path = os.path.join(DEST, name)
        if os.path.exists(path) and not args.force:
            print(f"[已存在] {name}（用 --force 覆盖）")
            skipped += 1
            continue
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                text = resp.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            print(f"[失败] {name}: {e}")
            failed += 1
            continue
        if mode == "legacy":
            for old, new in LEGACY_PATCHES:
                text = text.replace(old, new)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        print(f"[完成] {name}")
        ok += 1

    print(f"\n完成 {ok} 个，跳过 {skipped} 个，失败 {failed} 个。")
    print("提示：这些文件已被 .gitignore 忽略，不会进入提交。")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()

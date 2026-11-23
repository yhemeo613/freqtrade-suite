#!/usr/bin/env python3
"""策略回测对比脚本

用法（在仓库根目录、容器已启动时）:
    python scripts/compare_strategies.py --config frontend-server/user_data/config.btf.json \
        --strategies NostalgiaForInfinityX8 Strategy001 Supertrend \
        --timerange 20260725-20260924

说明:
- 通过 `docker compose run --rm --no-deps freqtrade backtesting` 执行，逐个策略回测
- 结果汇总为 Markdown 表格与 JSON，便于写入 docs/STRATEGIES.md
- 回测前请确保已下载对应周期数据（freqtrade download-data --erase --timerange ...）
"""

import argparse
import json
import re
import subprocess


def run_backtest(config: str, strategy: str, timerange: str) -> dict:
    cmd = [
        "docker", "compose", "run", "--rm", "--no-deps", "freqtrade",
        "backtesting",
        "--config", f"/freqtrade/{config}",
        "--strategy", strategy,
        "--timerange", timerange,
        "--cache", "none",
    ]
    out = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=600)
    text = out.stdout + out.stderr
    row = {"strategy": strategy}
    m = re.search(
        rf"│\s*{re.escape(strategy)}\s*│\s*([\d,]+)\s*│\s*([-\d.]+)\s*│\s*([-\d.]+)\s*│\s*([-\d.]+)\s*│[^│]*│\s*(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s*│",
        text,
    )
    if m:
        row.update({
            "trades": int(m.group(1).replace(",", "")),
            "tot_profit_pct": float(m.group(4)),
            "winrate": float(m.group(8)),
        })
    else:
        row["status"] = "NO SUMMARY (可能崩溃或 0 交易)"
    for key, pat in {
        "profit_factor": r"│\s*Profit factor\s*│\s*([-\d.]+)",
        "sharpe": r"│\s*Sharpe \(closed trades\)\s*│\s*([-\d.]+)",
        "max_dd_pct": r"│\s*Max % of account underwater\s*│\s*([\d.]+)%",
        "market_change": r"│\s*Market change\s*│\s*([-\d.]+)%",
    }.items():
        mm = re.search(pat, text)
        row[key] = mm.group(1) if mm else None
    return row


def main() -> None:
    ap = argparse.ArgumentParser(description="策略回测对比")
    ap.add_argument("--config", default="frontend-server/user_data/config.btf.json")
    ap.add_argument("--strategies", nargs="+", required=True)
    ap.add_argument("--timerange", required=True)
    ap.add_argument("--json-out", default="strategy_compare.json")
    args = ap.parse_args()

    rows = [run_backtest(args.config, s, args.timerange) for s in args.strategies]
    print("\n| 策略 | 交易数 | 总收益% | 胜率% | PF | Sharpe | 最大回撤% | 市场变化% |")
    print("|---|---|---|---|---|---|---|---|")
    for r in rows:
        print(
            f"| {r['strategy']} | {r.get('trades', '—')} | {r.get('tot_profit_pct', '—')} | "
            f"{r.get('winrate', '—')} | {r.get('profit_factor', '—')} | {r.get('sharpe', '—')} | "
            f"{r.get('max_dd_pct', '—')} | {r.get('market_change', '—')} |"
        )
    json.dump(rows, open(args.json_out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n已写入 {args.json_out}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""freqtrade-suite 全栈冒烟测试（零依赖：python3 标准库 + docker compose）

用法:
    python scripts/smoke_test.py [--base http://127.0.0.1:5173] [--skip-docker]

检查项:
    1. docker compose 三服务存在且健康（ft-trade / ft-ws / ft-web）
    2. Nginx 入口返回 SPA（200）
    3. 安全响应头（X-Frame-Options / X-Content-Type-Options / Referrer-Policy）
    4. server_tokens 关闭（Server 头不含版本号）
    5. /api/v1/ping 经 Nginx 同源分流到交易进程并返回 pong
    6. 静态资源 gzip 压缩生效

退出码: 0 = 全部通过；1 = 存在失败项
"""

import argparse
import json
import re
import subprocess
import sys
import urllib.request


def http(url: str, headers: dict | None = None, timeout: int = 10):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read()


class Checker:
    def __init__(self) -> None:
        self.failed = 0

    def check(self, name: str, cond: bool, detail: str = "") -> None:
        # 使用 ASCII 标记，兼容 Windows GBK 控制台
        print(("OK   " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))
        if not cond:
            self.failed += 1


def compose_services():
    """返回 docker compose ps 的服务列表；失败返回 (None, 错误信息)。"""
    try:
        out = subprocess.run(
            ["docker", "compose", "ps", "--format", "json"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
        )
        if out.returncode != 0:
            return None, out.stderr.strip() or "docker compose ps 失败"
        text = out.stdout.strip()
        if not text:
            return [], ""
        try:
            data = json.loads(text)
            if isinstance(data, dict):
                data = [data]
        except json.JSONDecodeError:
            data = [json.loads(line) for line in text.splitlines() if line.strip()]
        return data, ""
    except Exception as e:  # noqa: BLE001 - 冒烟脚本需要兜底
        return None, str(e)


def main() -> int:
    ap = argparse.ArgumentParser(description="freqtrade-suite 全栈冒烟测试")
    ap.add_argument("--base", default="http://127.0.0.1:5173", help="Nginx 入口地址")
    ap.add_argument("--skip-docker", action="store_true", help="跳过 docker compose 检查")
    args = ap.parse_args()
    # Windows 控制台默认 GBK，统一按 UTF-8 输出避免中文乱码
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001 - 老版本 Python 忽略即可
        pass
    c = Checker()

    if not args.skip_docker:
        services, err = compose_services()
        if services is None:
            c.check("docker compose 可用", False, err or "未知错误")
        else:
            names = {s.get("Service") or s.get("Name") for s in services}
            expected = {"freqtrade", "freqtrade-ws", "web"}
            c.check("三服务存在", expected <= names, ",".join(sorted(str(n) for n in names)))
            states = [(s.get("Service"), s.get("Health") or s.get("Status")) for s in services]
            healthy = all(s.get("Health") in ("healthy", "", None) for s in services)
            c.check("服务健康", healthy, str(states))

    # 1. SPA 与安全头
    try:
        status, headers, body = http(args.base + "/")
        c.check("SPA 返回 200", status == 200, f"HTTP {status}, {len(body)} bytes")
        c.check("X-Frame-Options", headers.get("x-frame-options") == "SAMEORIGIN")
        c.check("X-Content-Type-Options", headers.get("x-content-type-options") == "nosniff")
        c.check(
            "Referrer-Policy",
            headers.get("referrer-policy") == "strict-origin-when-cross-origin",
        )
        server = headers.get("server", "")
        c.check("server_tokens 已关闭", server.lower() == "nginx", server)
    except Exception as e:  # noqa: BLE001
        c.check("SPA 可访问", False, str(e))
        print(f"\n结果：{c.failed} 项失败（入口不可达，后续检查跳过）")
        return 1

    # 2. API 同源分流（8080 交易进程）
    try:
        status, _headers, body = http(args.base + "/api/v1/ping")
        c.check(
            "API ping 分流到交易进程",
            status == 200 and b"pong" in body,
            body[:60].decode(errors="replace"),
        )
    except Exception as e:  # noqa: BLE001
        c.check("API ping 分流", False, str(e))

    # 3. gzip（取页面引用的 JS 资源）
    try:
        _, _, html = http(args.base + "/")
        m = re.search(rb'/assets/[^"\']+\.js', html)
        if not m:
            c.check("静态资源 gzip", False, "未找到 JS 资源")
        else:
            asset = args.base + m.group(0).decode()
            _status, headers, _body = http(asset, {"Accept-Encoding": "gzip"})
            c.check("静态资源 gzip 压缩", headers.get("content-encoding") == "gzip")
    except Exception as e:  # noqa: BLE001
        c.check("静态资源 gzip", False, str(e))

    print()
    if c.failed:
        print(f"结果：{c.failed} 项失败")
        return 1
    print("结果：全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())

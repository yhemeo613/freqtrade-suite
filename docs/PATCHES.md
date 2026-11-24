# 服务端补丁清单（相对上游 freqtrade）

> `frontend-server/` 是 freqtrade 源码的本地副本，包含中文化补丁与少量行为补丁。
> 升级 freqtrade 或排查问题时，以此清单为准逐文件核对。

## 一、中文化文案翻译（仅改日志/回复文案，不动逻辑、命令名、配置键、URL、枚举）

经逐行核查确认（保持上游语义，异常处理沿用上游模式）：

| 文件 | 改动范围 |
|---|---|
| `freqtrade/rpc/telegram.py` | Telegram 命令回复、开平仓/取消/保护/强平通知、启动摘要、按钮文案；`/daily` 等统计文案 |
| `freqtrade/rpc/rpc.py` | RPC 状态/表现/余额等输出文案 |
| `freqtrade/rpc/rpc_manager.py` | RPC 管理相关日志文案 |
| `freqtrade/freqtradebot.py` | 核心交易循环日志文案（含清理异常沿用上游语义） |
| `freqtrade/exchange/exchange.py` | 交易所请求/重试相关日志文案 |
| `freqtrade/exchange/common.py` | 交易所公共逻辑文案 |
| `freqtrade/exchange/check_exchange.py` | 交易所检查文案 |
| `freqtrade/plugins/pairlistmanager.py` | 交易对列表管理文案 |
| `freqtrade/resolvers/strategy_resolver.py` | 策略解析文案 |
| `freqtrade/configuration/configuration.py` | 配置加载文案 |
| `freqtrade/configuration/config_validation.py` | 配置校验文案 + 行为补丁（见下） |
| `freqtrade/worker.py` | worker 心跳等文案 |
| 其它扫描到的含中文文件 | `exchange/bitget.py`、`exchange/krakenfutures.py`、`freqai/*`、`optimize/hyperopt_loss/hyperopt_loss_short_trade_dur.py`、`util/progress_tracker.py`、`templates/sample_hyperopt_loss.py` 等，均为文案/注释翻译 |

> 约束：命令名（`/status` 等）、配置键、URL、枚举值保持英文，避免破坏兼容性。

## 二、行为补丁（超出纯翻译，升级时需重点核对）

| 文件 | 补丁 | 说明 |
|---|---|---|
| `freqtrade/rpc/telegram.py` | `ft-selfheal` 轮询看门狗 | 重建 Application、滑动窗口重启预算（8 次 / 30 分钟）。可通过 `telegram.selfheal: false` 关闭（默认开启），与纯文案翻译分离；关闭后也不再有额外的健康检查 API 调用。`_mark_update_seen` 必须为协程（async），否则每条消息触发 `TypeError: 'NoneType' object can't be awaited` |
| `freqtrade/exchange/exchange_ws.py` | WS 订阅限流合规 | 订阅请求按交易所配额节流：480 次/小时（OKX subscribe+unsubscribe+login 限制）+ 3 条/秒写入间隔 + 限流退避 60s + **单连接频道上限 240**（OKX 限制，超出自动回退 REST），避免 `60014 Requests too frequent` 与 1006 断连风暴。两个配额默认值与 OKX 官方限制一致，可用 config 键 `exchange_ws_sub_limit_per_hour` / `exchange_ws_max_channels` 覆盖（换交易所或调整策略周期数时无需改代码） |
| `freqtrade/exchange/okx.py` | 期货 tickers 动态标的池放行 | `_ft_has_futures["tickers_have_quoteVolume"] = True`，允许 `VolumePairList` 在 OKX 期货上使用 ticker 模式（1 次全市场请求完成成交额排名，避免逐标的拉 K 线触发 50011） |
| `freqtrade/plugins/pairlist/VolumePairList.py` | `quoteVolume` 兜底计算 | OKX 期货 tickers 不提供 `quoteVolume`，用 `baseVolume × last` 兜底；并放宽 ticker 模式过滤条件（有 `baseVolume` 即可入选） |
| `freqtrade/rpc/api_server/api_webserver.py` | `freqaimodels` 优雅降级 | 官方 stable 镜像缺 FreqAI 可选依赖（`datasieve`/`torch`），依赖缺失时返回空列表 + 告警，替代原先的 500 与 ASGI 异常堆栈 |
| `freqtrade/configuration/config_validation.py` | 占位符凭据 fail-fast | 拒绝 `jwt_secret_key` / `password` 含「请替换」的模板占位符配置，防止以"已知密钥 + 已知口令"运行 API |

## 三、升级 freqtrade 时的重放步骤

1. 用 `git diff` 与上游对应 tag 比对 `frontend-server/freqtrade`，按上表逐文件核对。
2. 先重放"一、文案翻译"（低风险），再单独审阅"二、行为补丁"（涉及逻辑）。
3. 升级后运行：
   - `python -m compileall -q frontend-server/freqtrade`
   - 启动 trade / webserver 冒烟测试，检查 Telegram 中文通知与 `/daily` 文案。
4. 保持命令名/配置键/URL/枚举为英文；新增翻译只动字符串字面量。

## 四、其它

- 后端镜像：`Dockerfile.freqtrade` 基于固定 digest 的官方 stable 镜像，额外安装第三方策略依赖（`ta` / `finta` / `scikit-optimize`）；compose 中的 ft-trade / ft-ws 均使用该自定义镜像 `freqtrade-custom:local`，源码仍以只读方式挂载。
- 依赖一致性：运行时代码来自本地挂载源码，第三方依赖来自官方镜像 site-packages + 自定义镜像追加依赖；升级镜像与升级本地 `requirements.txt` 应同步进行。

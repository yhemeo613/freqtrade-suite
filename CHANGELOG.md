# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。所有显著变更都会记录在此文件中。

## [v1.3.7] - 2026-11-27

### 修复

- **仪表盘「资产曲线」在期货模式下永远空白**：`/historic_balance` 聚合列名是 `total_quote`（期货），前端用 `indexOf("total")` 精确匹配（`lastIndexOf` 同样命中不了 `total_quote`）导致返回 -1、整条曲线被跳过。桌面端与移动端仪表盘、回测深度分析钱包曲线统一改用新的 `findTotalColumn()`（优先 `total_quote`，回退 `total`），新增 4 个单测

### 新增

- **移动端 UI 重构（Vant 4）**：手机访问自动进入独立移动端界面（`/m/*` 路由 + 底部 Tabbar + 顶部 NavBar），共 5 个页面：
  - **持仓**：下拉刷新、持仓卡片（方向/杠杆/盈亏/持仓时长）、平仓确认
  - **仪表盘**：2×2 摘要卡片、资产曲线（fitContent）、近 7 天每日收益
  - **图表**：K 线 + 成交量、币对选择器（Popup + Picker）、周期切换（5m–1d）
  - **日志**：级别筛选 + 关键词搜索 + 列表（级别着色）
  - **设置**：机器人信息、主题开关、切换/断开连接
  - 桌面端界面完全不变；设备自适应由路由守卫实现（手机访问桌面路由 → 自动 `/m/*`，桌面访问 `/m/*` → 回到桌面）

### 修复

- **SPA 入口不缓存**（`nginx.conf`）：`index.html` 原无可控缓存，发版后浏览器可能长时间引用旧 JS（需手动强刷）；现对入口响应加 `Cache-Control: no-cache, must-revalidate`，静态资源仍保持 30 天强缓存

### 修复

- **回测「深度分析」无内容**（三个真实缺陷）：
  - **钱包曲线空白**：`/backtest/history/{file}/{strategy}/wallet` 返回 `{columns:["date","__date_ts","total_quote"], data:[[...]]}`，前端按对象字段 `r.date`/`r.total` 解析导致全被过滤；改为按列名解析并兼容 `total_quote`（期货）与 `total`（现货/旧版）
  - **市场变动表错乱/空白**：`/market_change` 返回 `{columns:["date","mean","rel_mean","count","__date_ts"], data:[[...]]}`，前端当作数组渲染；改为按列解析，表格改为「时间 / 市场均值 / 相对变化 / 币对数」（仅展示 \|相对变化\| > 0.5% 的时刻）
  - **K 线图无币对可选**：深度分析币对原仅来自回测成交记录，回测 0 交易（NFI 等选择性策略常见）时无币对可渲染；改为回退到当前白名单

### 新增

- **部署 FreqAI（`Dockerfile.freqtrade` 基础镜像切换为 `stable_freqai`）**：镜像内置 `datasieve` / `lightgbm` / `xgboost` / `tensorboard` / `scikit-learn`，`/api/v1/freqaimodels` 从空列表恢复为 **10 个 FreqAI 模型**（LightGBM / XGBoost 系列）；保留 `ta` / `finta` / `scikit-optimize` 追加依赖。注意：当前 46 个内置策略均非 FreqAI 策略，训练/回测需自行添加 FreqAI 策略；`torch`（RL）属 `stable_freqairl` 变体，未包含

### 修复

- **递归分析（高级分析）可用**：freqtrade 默认启动 K 线档位 `[199,399,499,999,1999]` 中 1999 档需要 9995 根历史，超出 OKX 各周期 1499 根上限，导致所有策略的递归分析必然失败。Web 控制台「高级分析」页新增「递归启动 K 线档位」参数（默认 `99, 199`，199×5=995 ≤ 1499），留空才用后端默认；README 补充 API 调用示例
- **前视偏差（Lookahead）分析可用性**：「高级分析」页新增「最少交易数 / 目标交易数」参数（默认 10 / 20）。freqtrade 在区间内信号少于 `minimum_trade_amount` 时会**取消**分析（看起来像"失败"），NFI 等选择性策略可调小到 1~3；同时轮询遇到任务丢失（404，如 webserver 重启）时立即停止并明确提示「分析任务已丢失，请重新提交」，不再笼统报"轮询失败"
- **ft-ws 内存上限 1GB → 2GB**：回测/高级分析任务实测峰值约 0.55GB，1GB 余量偏紧，避免分析期间被资源上限打断

## [v1.3.6] - 2026-11-25

### 修复

- **高级分析时间范围默认值改为滚动生成**：「高级策略分析」视图的时间范围默认值原为硬编码 `20261001-`（v1.0.6 已将下载/回测视图改为滚动默认值，此视图漏改），现改为 60 天前至今，与下载视图一致，不再随时间推移变成过期起点

### 优化

- **容器日志轮转 + 资源上限**（`docker-compose.yml`）：三个服务统一加 `json-file` 日志轮转（单文件 20MB、保留 3 份），防止长期运行后 Docker stdout 日志无限膨胀；`ft-trade` 内存上限 2GB / 2 CPU、`ft-ws` 1GB / 1 CPU、`ft-web` 256MB / 0.5 CPU（实测峰值约 0.6GB / 2% CPU，上限留足余量），异常场景下保护宿主机

## [v1.3.5] - 2026-11-25

### 新增

- **日志视图支持级别过滤与关键词搜索**：Web 控制台「运行日志」页新增两个过滤控件——级别（错误 / 警告 / 信息，错误含 critical、信息含 debug）与关键词（匹配消息与来源，大小写不敏感）；标题徽章显示「过滤后 / 总数」，排查问题时无需再逐行翻阅

### 优化

- **CI 加固**：配置模板 JSON 校验从 2 个扩展到全部 4 个模板（config.example / config.spot.example / config.btf / config_ws）；新增 `scripts/check_templates_no_secrets.py` 密钥泄露检查（exchange 密钥为空、JWT 为占位符、Telegram token 为空），公开仓库防误提交真实密钥，本地与 CI 共用

### 文档

- README 顶部摘要最大持仓 6 → 3，与 v1.3.4 默认一致

## [v1.3.4] - 2026-11-25

### 变更

- **最大持仓数 6 → 3（收益优先）**：`max_open_trades` 改为 3。40 池、3 个月（2026-08-20 → 11-24）仓位扫描（`stake_amount: unlimited`，每仓 = 可用资金 / 仓位数）：

  | 仓位数 | 交易数 | 总收益 | 资金曲线回撤 |
  |---|---|---|---|
  | 1 | 24 | +236.10% | 0.00%* |
  | 2 | 30 | +91.58% | 2.68% |
  | **3** | **34** | **+62.29%** | **1.79%** |
  | 4 | 35 | +46.91% | 1.35% |
  | 5 | 36 | +39.16% | 1.08% |
  | 6 | 37 | +32.31% | 0.90% |
  | 8 | 39 | +27.10% | 0.67% |
  | 12 | 44 | +20.89% | 0.45% |

  （* 该区间回测 100% 胜率，1 仓"0 回撤"属回测假象，且全仓单票风险最高，故不采用。）选 3 仓作为「高收益 + 可接受风险」的平衡点。`config.example.json` / `config.spot.example.json` / README 同步
- **默认标的池改为静态池（山寨为主、主流并行）**：`pairlists` 从 `NewCoinWeightedVolumePairList` 改为 `StaticPairList`，固定 40 个 USDT 永续 = 14 个主流（BTC/ETH/SOL/XRP/DOGE/BNB/ADA/LINK/AVAX/LTC/BCH/DOT/UNI/ATOM）+ 26 个山寨（SUI/APT/ARB/OP/INJ/SEI/TIA/JUP/WLD/ENA/ONDO/PEPE/SHIB/WIF/FIL/AAVE/CRV/LDO/HBAR/ICP/ALGO/NEAR/TAO/HYPE/ZEC/TRUMP），山寨占比约 65%
  - 原因：动态池每 15 分钟换池，NFI 需 480–800 根 5m K 线（约 2–3 天）历史才能计算指标，新入池标的往往历史不足无法入场；静态池历史稳定且**回测与实盘一致**（动态池无法参加 freqtrade 回测）
  - `config.example.json` / `config.spot.example.json` / README 同步；动态池保留为可选能力（见 `docs/PATCHES.md`）
- **新增回测配置模板 `config.btf.json`**：供 `scripts/compare_strategies.py` 默认参数直接使用（此前默认参数指向不存在的文件会报错）；复用 40 个静态币对与 NFI X8，去掉 api_server / telegram / WS 限流等回测无关项，无任何密钥，`max_open_trades` 与默认配置一致（3）

## [v1.3.3] - 2026-11-25

### 修复

- **动态标的池成交额口径错误、排名失效**（v1.3.0 引入的回归）：`NewCoinWeightedVolumePairList` 的加权逻辑读取 `quoteVolume`，但 OKX 期货 tickers 该字段为 `None`，`None or 0 → 0 × 权重 = 0` 把所有标的成交额抹成 **0**；父类 `_ensure_quote_volume` 因「非 None」跳过兜底计算，最终排序全为 0，标的池实际按 tickers 顺序取前 40（并非成交额排名，XRP/DOGE 等主流高成交额标的会被漏掉）
  - 成交额改用 `volCcy24h × last` 计算（币本位成交量；`vol24h` 是张数，需乘合约面值 ctVal，直接乘价格会把不同标的的排名放大/缩小最多 100 倍）
  - 加权改为在 **tickers 副本**上计算：交易所行情字典会被缓存复用（TTL 1800s），原地修改会让同一批行情在多个刷新周期内被反复加权（权重复利），并污染缓存
- **新币加权健壮性**：`new_coin_days` / `new_coin_boost` 非法配置回退默认（原会启动失败）；上市时间解析失败按「未知」中性加权（原按「刚上市」给最大加权）；`exclude_stocks_commodities` 对缺失 `instCategory` 的市场不再误杀
- **`VolumePairList` 期货成交额兜底口径**：OKX 期货 `baseVolume` 是**张数**（`vol24h`），直接乘 `last` 会按合约面值失真（不同标的最多相差 100 倍）；改为优先使用原始字段 `volCcy24h`（币本位成交量）× `last`，`VolumePairList` 可选模式下的成交额排名恢复准确

## [v1.3.2] - 2026-11-24

### 优化

- 「无法复用行情订阅,回退到 REST」日志从 INFO 降为 DEBUG(WS 兜底属正常行为,消除换池后的日志噪声)
- 动态标的池刷新周期 600 → 900 秒(15 分钟),池子更稳定、减少边缘标的进进出出,新币捕获仍及时

## [v1.3.1] - 2026-11-24

### 变更

- 动态标的池不再排除主流大币（`exclude_majors: false`）：主流币与山寨币一视同仁，只要成交额（或新币加权后）进入前 40 即可入选；仍剔除股票/商品代币

## [v1.3.0] - 2026-11-24

### 新增

- **新币加权动态标的池**：`NewCoinWeightedVolumePairList` 插件，每 10 分钟 1 次全市场扫描
  - 新上市的标的（≤90 天）按成交额加权（最高 ×9），**新币最快 10 分钟自动进入白名单**，不再漏检
  - 山寨倾向：排除主流大币与股票/商品代币（`exclude_majors` / `exclude_stocks_commodities`）
  - 1 次 REST 请求覆盖全市场，WS 只订阅入选 40 个（200 ≤ 240 频道），零限流

## [v1.2.1] - 2026-11-24

### 修复

- `freqaimodels` 接口优雅降级：官方 stable 镜像缺 FreqAI 可选依赖（`datasieve`）时返回空列表并告警，消除 `/api/v1/freqaimodels` 的 500 与 ASGI 异常堆栈

### 文档

- README 故障排查：说明 `freqaimodels` 降级行为；补充「递归分析对 NFI 不可用」（需 5 倍启动 K 线，超出交易所上限）

## [v1.2.0] - 2026-11-24

### 变更

- 默认标的池改为**山寨倾向**：40 个 USDT 永续，按 OKX 24h 成交额排序、上市 ≥90 天筛选，**排除主流大币**（BTC/ETH/SOL/XRP/DOGE/ADA/BNB/LTC/BCH/TRX/DOT/LINK/AVAX/ATOM/UNI/ETC/XLM）与股票/商品代币
- 现货示例 `config.spot.example.json` 同步为同一山寨列表
- 回测依据：NFI X8 对主流币几乎不触发信号，山寨币（UNI/APT/SUI/AVAX/ATOM/PEPE 等）才有入场信号

## [v1.1.1] - 2026-11-24

### 变更

- 默认标的池回退为**静态白名单**（`StaticPairList`，40 个主流加密货币永续），**剔除股票代币与商品代币**，只交易加密货币
- 动态 `VolumePairList` 改为可选能力（默认关闭），实现与配置说明保留在 `docs/PATCHES.md` 与 README
- 现货示例 `config.spot.example.json` 同步为静态白名单

## [v1.1.0] - 2026-11-24

### 新增

- **全市场动态标的池**：`pairlists` 改为 `VolumePairList`（ticker 模式），每 30 分钟用 **1 次全市场 tickers 请求**按 24h 成交额选出 top 40，覆盖 OKX 全部 USDT 永续（加密货币 + 股票代币 + 商品代币，**不做类别过滤**）
- **现货模式示例**：新增 `config.spot.example.json`，与永续模式共用同一套动态标的池与限流策略

### 修复

- OKX 期货 tickers 不提供 `quoteVolume`：`VolumePairList` 增加 `baseVolume × last` 兜底计算，`okx.py` 放行期货 ticker 模式，避免逐标的拉 K 线触发 50011 限流（全市场扫描 93 秒 → 10–20 秒、限流错误归零）

## [v1.0.6] - 2026-11-24

### 修复

- **交易页副 tab 数据不随轮询刷新**：「表现统计」与「保护锁定」tab 只在挂载时加载一次，停在该页签时数据过期（新平仓、锁定到期不会出现）；两者改为接入 `usePolling` 随全局刷新间隔持续更新，与主「交易」tab 行为一致
- **机器人状态中文显示不一致**：设置页「当前状态」直接显示英文 `running` / `paused`，与交易页状态徽章的中文文案不一致；把状态映射抽为 `format.ts` 的 `botStateZh()` 供两处共用
- **数据下载/回测的时间范围默认值改为滚动生成**：原来硬编码 `20261001-` / `20261020-`，随时间推移会变成「很久以前」的过期起点；新增 `defaultTimerange()`（下载默认 60 天前、回测默认 30 天前，结束留空=至今）

### 测试

- 新增 `botStateZh` 3 个用例（状态映射 / 未知值原样保留 / 空值占位）；单测总数 75 → **78**（8 文件）
- 新增 `defaultTimerange` 4 个用例（默认 60 天 / 跨月跨年滚动 / 补零 / 格式匹配）；单测总数 78 → **82**（8 文件）

## [v1.0.5] - 2026-11-24

### 变更

- **WS 订阅配额与频道上限可配置**：`exchange_ws_sub_limit_per_hour`（默认 480）与 `exchange_ws_max_channels`（默认 240）改为可从 `config.json` 覆盖，默认值与 OKX 官方限制一致、行为不变；换交易所或调整策略周期数时无需改代码（`exchange_ws.py` 增加容错读取，非法值回退默认）
- **回测页策略改为下拉选择**：从 webserver 的 `/api/v1/strategies` 拉取可用策略列表，用可滚动下拉替代手输（NFI 等长策略名不再容易打错）；列表加载失败或当前策略不在列表时自动保留自由输入兜底
- **冒烟测试新增静态资源缓存头检查**：`scripts/smoke_test.py` 校验 `/assets/` 响应带 `Cache-Control: max-age=2592000`（nginx `expires 30d` 生效），防止缓存配置回归

## [v1.0.4] - 2026-11-24

### 修复

- **WebSocket 鉴权重连风暴**：服务端持续拒绝（token 刷新后仍 4401/4001/1008）时，原逻辑每次都会「刷新 token → 立即重连」，形成无退避的快速重连循环；现改为连续 3 次鉴权失败后走指数退避，连接成功后重置计数
- **图表主题不随全局切换**：仪表盘资产曲线与回测深度分析（K 线图 / 钱包曲线）在创建时读取一次主题色，切换亮/暗色后仍保持旧配色（亮色下文字不可读）；现改为监听 `settingsStore.theme` 即时重刷，与 ChartsView 行为一致；BacktestAnalysis 的取色源统一改为 `settingsStore.theme`（原来读 DOM class）
- **移除无效设置项「移动端卡片模式」**：`mobileCardMode` 只写入 localStorage 但全仓库无任何消费方，设置页的开关是一个「看着生效、实际无效」的控件；连同 store 字段与设置页开关一并删除，避免误导用户

### 测试

- 新增 `FreqWs` 重连行为 5 个用例（fake WebSocket + fake timers：刷新成功即重连、3 次鉴权失败后退避、刷新失败直接退避、连接成功重置计数、普通断线走退避）；单测总数 70 → **75**（8 文件）

## [v1.0.2] - 2026-11-24

### 修复

- **后台任务失败被误报为成功**：回测失败时 freqtrade 返回 `status="error"`（不是 `failed`）且 `running=false`，原逻辑用 `running === false` 判定「已完成」，导致回测失败弹「回测完成」、Recursive/Lookahead 分析失败弹「分析完成」；新增 `src/lib/jobStatus.ts` 把状态统一归类为 `idle / running / success / error`
- **高级分析状态文案**：补上 `Analysis ended` 的中文映射（原映射匹配的是不存在的 `Analysis finished`），状态列不再直接显示英文 `ended` / `error`
- **分析按钮卡死**：轮询连续失败停止后仍保持「分析中…」禁用态，无法重新发起
- **刷新间隔设置不生效**：设置页调整「数据刷新间隔」后，已挂载页面仍按旧间隔轮询（定时器在启动时捕获间隔），必须切页面重进才生效
- **轮询请求堆积**：接口变慢时定时器仍按固定间隔触发，未返回的请求会越堆越多；`usePolling` 增加单飞守卫（上一次未返回则跳过本次）

### 测试

- 新增 `jobStatus.ts` 14 个用例；单测总数 51 → **65**（7 文件）
- 新增 `usePolling` 5 个用例（单飞、间隔热更新、显式间隔优先、卸载停止、异常不中断）；单测总数 65 → **70**（8 文件）

## [v1.0.3] - 2026-11-24

### 变更

- 默认标的由 110 个缩减为 **40 个**（200 个 WS 频道），符合 OKX「每连接最多 240 个订阅频道」限制：NFI 每标的需 5 个周期（5m/15m/1h/4h/1d），40 × 5 = 200 频道
- `exchange_ws.py` 新增**单连接频道上限保护**（240）：达到上限后不再订阅新频道，自动由 REST 兜底

### 修复

- 消除 OKX 以 `1006` 关闭 WS 连接引发的订阅重试风暴（此前日均 ERROR 约 3300 条、日志约 19.5MB）

## [v1.0.1] - 2026-11-23

### 修复

- **Telegram 自愈补丁**：`_mark_update_seen` 改为协程。原同步函数被 python-telegram-bot await，导致每条消息触发 `TypeError: 'NoneType' object can't be awaited` 并刷 ERROR 日志
- **OKX WebSocket 限流合规**：`exchange_ws.py` 增加订阅配额（480 次/小时，含订阅/退订）与 3 条/秒节流、限流退避；超配额通道自动回退 REST，消除 `60014 Requests too frequent` 错误风暴（此前 3 分钟 2750 条错误）
- **REST 限流**：默认配置增加 `exchange.ccxt_config: {"enableRateLimit": true, "rateLimit": 200}`，遵守 OKX REST 请求频率

## [v1.0.0] - 2026-11-23

### 首个开源版本

- **GitFlow + PR 驱动**：`main` / `develop` / `release/*` / `hotfix/*`，GitHub Actions 双检查（前端 typecheck/lint/test/build + 服务端语法/编排校验），分支保护已启用
- **服务端中文化**：日志、CLI、Telegram/RPC 文案翻译 + `ft-selfheal` 轮询自愈看门狗
- **自定义后端镜像**：`Dockerfile.freqtrade` 基于固定 digest 的官方 stable 镜像，内置 `ta` / `finta` / `scikit-optimize` 策略依赖
- **策略库**：47 个策略文件 / 46 个策略类，含 NFI X8 主力策略；无上游 LICENSE 的 8 个策略不随仓库分发，可用 `scripts/fetch_optional_strategies.py` 按需获取
- **默认配置**：OKX 永续合约模拟盘（10000 USDT / 最多 3 仓 / 110 个主流与山寨标的）
- **开源合规**：GPL-3.0 LICENSE、敏感信息审计（`docs/OPEN_SOURCE.md`）、内网信息清理、Secret Scanning 开启

## [v0.5.1] - 2026-11-23

### 修复

- 图表交易标记插件复用：ChartsView / BacktestAnalysis 重复调用 `createSeriesMarkers` 导致标记叠加，改为缓存插件并 `setMarkers()` 更新

### 新增

- 连接中断统一提示：任意 API 网络失败时 App 顶部展示横幅，恢复后自动消失
- LogView 增加日志来源列；交易历史表格独立滚动 + 表头吸顶

### 测试

- connection store 4 个用例；单测总数 47 → **51**（6 文件）

## [v0.5.0] - 2026-11-23

### 修复

- **深度分析页初始为空**：`BacktestAnalysis` 的 K 线/钱包曲线/市场变动只在 watch 触发时加载（非 immediate），首次进入页面空白；补 `onMounted` 首次加载
- **交易详情自定义数据竞态**：请求期间切换交易时旧响应会串数据；落地前校验 trade_id
- **强制开仓价格校验**：非法输入（NaN/0/负数）不再提交到服务端，前端直接提示
- `fmtDuration` 结束时间早于开始时间时钳制为非负（时钟偏差防护）

### 测试

- 新增 `parse.ts` 输入解析工具与 3 组用例；单测总数 42 → **47**（5 文件）

## [v0.4.2] - 2026-11-23

### 修复

- **机器人 ID 冲突**：`addBot` 原用 `bot_${Date.now()}`，同一毫秒内连续添加会生成重复 ID，导致删除一个机器人时误删另一个并触发意外登出；改为 `crypto.randomUUID()`（含降级方案）
- AGENTS.md 补充 GitHub 代理（127.0.0.1:7890）使用规范

### 测试

- 新增 auth store 6 个安全行为用例（密码不落 localStorage、sessionStorage 恢复、旧地址迁移、删除登出）
- 新增 BotApiClient 6 个用例（Basic 登录、401 refresh 重放、会话失效回调、错误透传、URL 规整）
- vitest 配置补 `@` 路径别名，新增 happy-dom 测试环境；单测总数 30 → **42**（4 文件）

## [v0.4.1] - 2026-11-23

### 新增

- Telegram 自愈看门狗配置开关 `telegram.selfheal`（默认 `true`；关闭后不再自动重建应用，也不再产生健康检查请求）
- WS URL 派生纯函数 `deriveWsUrl` + 4 个单测（单测总数 26 → 30）
- README 前端/服务端本地开发指南与浏览器 UI 手工冒烟清单

### 优化

- 页面切到后台时暂停轮询（`visibilitychange`），回到前台立即刷新一次并恢复
- Dashboard 资产曲线每约 60 秒随轮询刷新

## [v0.4.0] - 2026-11-23

自 v0.3.0 以来的质量与体验改进。

### 新增

- 统一空态组件 `EmptyState.vue`,应用于日志 / 余额 / 移动持仓 / 表现面板
- 全局渲染错误捕获:组件异常时 toast 提示并记录,避免白屏无反馈
- README 运维手册:数据备份、freqtrade 升级、日志排障、监控建议

### 优化

- ChartsView K 线请求去重:缓存最近响应,切换指标/绘图模板不再重复请求;首屏消除重复加载
- 类型债务清零:lint 警告 44 → 0,新增回测/分析/自定义数据等响应类型

### 修复

- 修复 PowerShell 批量改写导致的编码破坏事件,并沉淀工具使用规范(`AGENTS.md`)

## [v0.3.0] - 2026-11-23

自 v0.2.1 以来的功能与质量改进。

### 新增

- **全栈冒烟测试** `scripts/smoke_test.py`:零依赖验证 compose 健康、SPA 200、安全头、`server_tokens`、gzip、API 同源分流,已接入验证清单
- 服务端补丁清单 `docs/PATCHES.md`:中文化/行为补丁范围与升级重放步骤
- Prettier 格式化基线 + CI `format:check` 门禁;类型定义层 `src/api/types.ts`(与 `api_schemas.py` 对齐)

### 修复

- WebSocket 会话隔离:切换/断开机器人时停止旧连接,避免旧机器人推送误刷新
- 下载数据轮询容错:连续失败自动停止;日志页自动跟随(向上翻阅不被打断)
- PerformancePanel 按标签独立加载,修复快速切换时请求被吞
- nginx 访问日志脱敏:WebSocket JWT 不再写入日志

### 重构

- 类型清理:消除 34 个 lint 警告,核心视图使用强类型 API 响应

## [v0.2.1] - 2026-11-23

修复 v0.2.0 的部署缺陷(E2E 全栈冒烟测试发现):

- **webserver 命令参数错误**:freqtrade 的 `webserver` 子命令不接受 `--strategy` 命令行参数(会报 `unrecognized arguments`),已改为写入 `config_ws.json` 的 `strategy` 字段
- **只读挂载与 SQLite 冲突**:freqtrade 默认用相对路径 `sqlite:///tradesv3.dryrun.sqlite` 把数据库写在挂载根目录;新增 `db_url` 指向 `user_data/tradesv3.dryrun.sqlite`,配合 `./frontend-server:/freqtrade:ro` 只读挂载正常工作
- 同步修正 README 故障排查说明

## [v0.2.0] - 2026-11-23

首个工程化里程碑：建立 GitFlow 协作流程、质量基线(CI/类型检查/测试/代码规范)与运维安全加固。

### 工程质量

- 新增 GitHub Actions CI 流水线：前端 `typecheck`(vue-tsc)/ `lint`(eslint)/ `test`(vitest)/ `build`，服务端 Python 语法与 Compose 配置校验
- TypeScript 升级 6.0.3（保留 `ignoreDeprecations: "6.0"`），此前从未运行过的类型检查现已全绿
- 新增 ESLint 扁平配置(正确性规则)与 Vitest 单测(格式化工具 26 用例)
- 新增 AGENTS.md 团队开发手册与 docs/DEVELOPMENT_WORKFLOW.md(GitFlow 规范)
- 修复 typecheck 暴露的真实类型错误（图表系列类型、Select/Slider 处理器签名等）

### 缺陷修复（深度审查）

- Nginx 分流修复：`background_tasks` → `background`，数据下载进度轮询不再 503(#1)
- 回测结果页补 Tabs 组件导入，结果区恢复渲染(#3)
- 移动端强制平仓竞态修复，不再发出 `tradeid="null"`(#4)
- 删除当前机器人后正确断开并登出，消除"假登录"死循环(#5)
- K 线图表异步竞态修复（请求代际丢弃过期响应）+ 仪表盘图表实例泄漏修复(#6)
- JWT 过期降级：会话失效自动登出并提示重新登录(#7)

### 安全

- 登录密码不再明文存入 localStorage，改为仅存本次会话(sessionStorage)，编辑表单不回显(#2)
- config 占位符凭据 fail-fast：jwt_secret_key/password 含「请替换」时拒绝启动(#8)
- Nginx 增加安全响应头并隐藏版本号；WebSocket 鉴权失败自动刷新 token 重连

### 运维与可复现性

- freqtrade 镜像固定到 stable 索引 digest(#10)
- 挂载拆分：源码只读 + user_data 可写；为两个后端容器增加 healthcheck，web 就绪依赖
- `ft-ws` 命令内置 `--strategy`，移除已知 workaround
- 107 个组件从 `cn` 包迁移到本地 `@/lib/utils`，卸载 `cn` 依赖(#9)
- Nginx gzip 压缩 + 静态资源 30 天缓存；Telegram 周期统计文案拼接修复

[v1.3.7]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v1.3.7
[v1.3.6]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v1.3.6
[v1.3.5]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v1.3.5
[v1.3.4]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v1.3.4
[v1.3.3]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v1.3.3
[v1.3.2]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v1.3.2
[v1.3.1]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v1.3.1
[v1.3.0]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v1.3.0
[v1.2.1]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v1.2.1
[v1.2.0]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v1.2.0
[v1.1.1]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v1.1.1
[v1.1.0]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v1.1.0
[v1.0.6]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v1.0.6
[v1.0.5]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v1.0.5
[v1.0.4]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v1.0.4
[v1.0.3]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v1.0.3
[v1.0.2]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v1.0.2
[v1.0.1]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v1.0.1
[v1.0.0]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v1.0.0
[v0.5.1]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v0.5.1
[v0.5.0]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v0.5.0
[v0.4.2]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v0.4.2
[v0.4.1]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v0.4.1
[v0.4.0]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v0.4.0
[v0.3.0]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v0.3.0
[v0.2.1]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v0.2.1
[v0.2.0]: https://github.com/yhemeo613/freqtrade-suite/releases/tag/v0.2.0

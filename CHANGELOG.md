# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。所有显著变更都会记录在此文件中。

## [未发布]

### 修复

- **后台任务失败被误报为成功**：回测失败时 freqtrade 返回 `status="error"`（不是 `failed`）且 `running=false`，原逻辑用 `running === false` 判定「已完成」，导致回测失败弹「回测完成」、Recursive/Lookahead 分析失败弹「分析完成」；新增 `src/lib/jobStatus.ts` 把状态统一归类为 `idle / running / success / error`
- **高级分析状态文案**：补上 `Analysis ended` 的中文映射（原映射匹配的是不存在的 `Analysis finished`），状态列不再直接显示英文 `ended` / `error`
- **分析按钮卡死**：轮询连续失败停止后仍保持「分析中…」禁用态，无法重新发起
- **刷新间隔设置不生效**：设置页调整「数据刷新间隔」后，已挂载页面仍按旧间隔轮询（定时器在启动时捕获间隔），必须切页面重进才生效
- **轮询请求堆积**：接口变慢时定时器仍按固定间隔触发，未返回的请求会越堆越多；`usePolling` 增加单飞守卫（上一次未返回则跳过本次）

### 测试

- 新增 `jobStatus.ts` 14 个用例；单测总数 51 → **65**（7 文件）
- 新增 `usePolling` 5 个用例（单飞、间隔热更新、显式间隔优先、卸载停止、异常不中断）；单测总数 65 → **70**（8 文件）

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

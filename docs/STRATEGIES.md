# 策略清单与质量评估

> 本文档记录 `frontend-server/user_data/strategies/` 下策略的来源、质量分级、回测证据与使用建议。
> 回测方法见 `scripts/compare_strategies.py`（freqtrade backtesting，pair 集与时间窗可配置）。
> 运行镜像：`freqtrade-custom:local`（官方 stable digest + `ta` / `finta` / `scikit-optimize`，见 `Dockerfile.freqtrade`）。

## 一、总览

- **47 个策略文件 → 46 个策略类**（部分文件含多个类）
- 全部通过 `freqtrade list-strategies` 加载，运行中 API `GET /api/v1/strategies` 可见全部
- 来源：4 个第三方仓库（GPL-3.0 / Apache-2.0 / MIT）+ 本仓库原有；另有 8 个**无 LICENSE** 策略不随仓库分发（见第四节）
- 当前运行中：**NostalgiaForInfinityX8**

## 二、质量分级

### A 级 · 可生产（活跃维护、结构完整）

| 策略 | 说明 | 注意 |
|---|---|---|
| `NostalgiaForInfinityX8` | 社区最活跃的期货/现货策略，3.3MB，5m，含 derisk + grinding + 多系统信号 | 高度选择性，回测/实盘需要**完整 pair 集**（几十对以上）才有足够信号；需要 1d/4h/1h/15m 全周期数据 |

### B 级 · 可用（经典策略，已做兼容性移植）

| 策略 | 状态 | 说明 |
|---|---|---|
| `BB_RPB_TSL` | 可回测 | 55KB，58 个参数；已打兼容补丁（NumPy 2 / 新 API） |
| `CryptoFrog` | 可回测 | 依赖 `finta` + `scikit-optimize`（镜像已内置）；已打兼容补丁，90 天窗口 89 笔 / 胜率 60.7% |
| `GodStra` | 可回测 | 需 **12h** 数据；已打兼容补丁 |
| `Heracles` | 可回测 | 已打兼容补丁 |
| `DcaTp` | 可回测 | 需要 **30m** 数据（MIT 许可） |
| `FAdxSma` / `FOtt` / `FReinforced` / `FSample` / `FSupertrend` / `TrendFollowing` / `VolatilitySystem` | 可回测 | 期货目录策略，需 `trading_mode=futures`（当前配置已是期货）；`VolatilitySystem` 在 -34% 市场回测 +9.31% |

### C 级 · 官方示例（学习用途，不建议直接实盘）

freqtrade 官方示例（Strategy001-005、Supertrend、Diamond、MultiMa、TrendRider、hlhb、mabStra 等）：

- 代码简短易读、演示各种接口用法
- 多数无完整风控（宽止损/无仓位管理）
- 回测显示牛市小幅正收益、暴跌市回撤明显小于市场，但**胜率与盈亏比结构不理想**（如 Strategy001 胜率 77% 仍亏损，属于"小赢大亏"型）

### D 级 · 模板/教学

`SampleStrategy`、`InformativeSample`、`FixedRiskRewardLoss`、`CustomStoplossWithPSAR`、`BreakEven`、`multi_tf`。

### 未收录（非依赖原因）

- `lookahead_bias/`：**故意引入未来函数**，回测虚高，严禁实盘
- FreqAI 策略：需要 `stable_freqai` 镜像 + torch + 模型训练配置，非单文件可运行
- MoniGoMani：框架项目，非单文件策略

## 三、回测证据

方法：期货模式 3x、BTC/ETH/SOL 三个标的；数据由 `download-data --erase --timerange` 完整回填。

### 跨行情窗口（2026-05-26 → 2026-11-23，每窗 2 个月）

| 策略 | W1 震荡偏弱 | W2 牛市 +43.7% | W3 暴跌 -34% |
|---|---|---|---|
| Strategy001 | 未入场 | **+5.09%**（胜率 95%） | -10.9%（胜率 77%） |
| Supertrend | -1.59% | +2.92% | -4.05% |
| Diamond | -2.6% | +0.88% | -3.56% |
| TrendRider | -1.2% | -1.2% | -2.87% |

### 新增收录策略（W3 暴跌 -34% 窗口）

| 策略 | 交易数 | 总收益 | 胜率 |
|---|---|---|---|
| **VolatilitySystem** | 11 | **+9.31%** | 54.5% |
| FAdxSmaStrategy | 5 | +0.01% | 60.0% |
| FSupertrendStrategy | 25 | -2.89% | 20.0% |
| CryptoFrog | 89 | -3.91% | 60.7% |
| FSampleStrategy | 29 | -11.96% | 10.3% |
| Heracles | 10 | -12.27% | 20.0% |
| BB_RPB_TSL / GodStra | 0 | — | — |

> W3 市场变化约 -34%；所有策略在暴跌市回撤/亏损均小于市场，VolatilitySystem 逆势正收益。

## 四、可选获取策略（上游无 LICENSE，不随仓库分发）

8 个策略上游仓库缺少 LICENSE 文件（默认「保留所有权利」），因此不包含在本仓库中：

`ClucHAnix`、`ClucHAnix_5m`、`E0V1E`、`E0V1EN`、`MarketStructureCHOCH`、`NASOSv4`、`NASOSv5_mod3`、`TrendLines`

需要时在本机执行（自动应用 freqtrade 2026.11 / NumPy 2 兼容补丁，文件已被 `.gitignore` 忽略）：

```bash
python scripts/fetch_optional_strategies.py
```

## 五、兼容性补丁

老策略为兼容 freqtrade 2026.11 / NumPy 2.x 做了最小改动，详见 `_SOURCES.md` 第五节：
`np.NaN`→`np.nan`、`numpy.lib.math`→标准库、去掉 `dropna` 保持 DataFrame 等长、
旧属性/方法名/列名（`sell_profit_only`、`use_sell_signal`、`buy/sell`、`custom_sell`、`sell_reason`）→ 新 API。

## 六、使用建议

1. **实盘/模拟盘**优先使用 A 级策略（NFI X8），并保持完整 pair 集（如 110 对）
2. B 级策略使用前确认对应周期数据已下载，并在 `dry_run` 下跑 1-2 周
3. C/D 级仅用于学习与 hyperopt 实验，不要直接上实盘
4. 任何策略切换需回测验证：至少覆盖**牛市/熊市/震荡**三个窗口
5. 新增策略时同步更新 `_manifest.json`、`_SOURCES.md` 与本文档

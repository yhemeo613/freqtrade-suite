# 第三方策略来源清单

> 本文件仅作溯源记录；freqtrade 只扫描 `*.py`，不会加载本文件。
> 运行镜像：自定义 `freqtrade-custom:local`（基于固定 digest 的官方 stable 镜像 + 第三方依赖 `ta` / `finta` / `scikit-optimize`，见仓库根目录 `Dockerfile.freqtrade`）。
> 安装校验：`freqtrade list-strategies` 全部 `OK`（46 个策略类），并经 `GET /api/v1/strategies`（8081）确认可见。

## 一、社区知名策略

| 策略文件 | 类名 | 来源仓库 | commit | 许可 |
|---|---|---|---|---|
| `BB_RPB_TSL.py` | BB_RPB_TSL | [jilv220/BB_RPB_TSL](https://github.com/jilv220/BB_RPB_TSL) | `33f8359` | GPL-3.0 |
| `CryptoFrog.py` | CryptoFrog | [froggleston/cryptofrog-strategies](https://github.com/froggleston/cryptofrog-strategies) | `bebdf63` | Apache-2.0 |
| `DcaTp.py` | DcaTp | [typhonun/DcaTpStrategy](https://github.com/typhonun/DcaTpStrategy) | `057525d` | MIT |
| `GodStra.py` | GodStra | [freqtrade/freqtrade-strategies](https://github.com/freqtrade/freqtrade-strategies) | `f3340ce` | GPL-3.0 |
| `Heracles.py` | Heracles | [freqtrade/freqtrade-strategies](https://github.com/freqtrade/freqtrade-strategies) | `f3340ce` | GPL-3.0 |

## 二、官方示例与经典策略（freqtrade/freqtrade-strategies）

| 策略文件 | 类名 | 许可 |
|---|---|---|
| `AlmgrenChrissStrategy.py` | AlmgrenChrissStrategy | GPL-3.0 |
| `Bandtastic.py` | Bandtastic | GPL-3.0 |
| `BinHV27.py` | BinHV27 | GPL-3.0 |
| `BinHV45.py` | BinHV45 | GPL-3.0 |
| `BreakEven.py` | BreakEven | GPL-3.0 |
| `ClucMay72018.py` | ClucMay72018 | GPL-3.0 |
| `CMCWinner.py` | CMCWinner | GPL-3.0 |
| `CombinedBinHAndCluc.py` | CombinedBinHAndCluc | GPL-3.0 |
| `CustomStoplossWithPSAR.py` | CustomStoplossWithPSAR | GPL-3.0 |
| `Diamond.py` | Diamond | GPL-3.0 |
| `FixedRiskRewardLoss.py` | FixedRiskRewardLoss | GPL-3.0 |
| `hlhb.py` | hlhb | GPL-3.0 |
| `HourBasedStrategy.py` | HourBasedStrategy | GPL-3.0 |
| `InformativeSample.py` | InformativeSample | GPL-3.0 |
| `mabStra.py` | mabStra | GPL-3.0 |
| `multi_tf.py` | multi_tf | GPL-3.0 |
| `MultiMa.py` | MultiMa | GPL-3.0 |
| `PatternRecognition.py` | PatternRecognition | GPL-3.0 |
| `PowerTower.py` | PowerTower | GPL-3.0 |
| `Quickie.py` | Quickie | GPL-3.0 |
| `SmoothOperator.py` | SmoothOperator | GPL-3.0 |
| `Strategy001.py` | Strategy001 | GPL-3.0 |
| `Strategy001_custom_exit.py` | Strategy001_custom_exit | GPL-3.0 |
| `Strategy002.py` | Strategy002 | GPL-3.0 |
| `Strategy003.py` | Strategy003 | GPL-3.0 |
| `Strategy004.py` | Strategy004 | GPL-3.0 |
| `Strategy005.py` | Strategy005 | GPL-3.0 |
| `Supertrend.py` | Supertrend | GPL-3.0 |
| `SwingHighToSky.py` | SwingHighToSky | GPL-3.0 |
| `TrendRiderStrategy.py` | TrendRiderStrategy | GPL-3.0 |
| `TWAPStrategy.py` | TWAPStrategy | GPL-3.0 |
| `UniversalMACD.py` | UniversalMACD | GPL-3.0 |

### 期货目录（futures/，同一仓库）

| 策略文件 | 类名 | 许可 |
|---|---|---|
| `FAdxSmaStrategy.py` | FAdxSmaStrategy | GPL-3.0 |
| `FOttStrategy.py` | FOttStrategy | GPL-3.0 |
| `FReinforcedStrategy.py` | FReinforcedStrategy | GPL-3.0 |
| `FSampleStrategy.py` | FSampleStrategy | GPL-3.0 |
| `FSupertrendStrategy.py` | FSupertrendStrategy | GPL-3.0 |
| `TrendFollowingStrategy.py` | TrendFollowingStrategy | GPL-3.0 |
| `VolatilitySystem.py` | VolatilitySystem | GPL-3.0 |

## 三、本仓库原有的策略

| 文件 | 说明 |
|---|---|
| `NostalgiaForInfinityX8.py` | NFI 主力策略，当前 `config.json` 正在使用（GPL-3.0） |
| `SampleStrategy.py` | freqtrade 自带模板 |
| `custom_indicators.py` | CryptoFrog 辅助模块（非策略类） |

## 四、可选获取（上游无 LICENSE，不随仓库分发）

以下 8 个策略的上游仓库**没有 LICENSE 文件**（默认「保留所有权利」），因此不包含在本仓库中。

需要时可在本机自行获取（脚本会自动应用 freqtrade 2026.11 / NumPy 2 兼容补丁）：

```bash
python scripts/fetch_optional_strategies.py
```

| 策略文件 | 上游仓库 | commit |
|---|---|---|
| `ClucHAnix.py` | [ssssi/freqtrade_strs](https://github.com/ssssi/freqtrade_strs) | `3ed699f` |
| `ClucHAnix_5m.py` | [ssssi/freqtrade_strs](https://github.com/ssssi/freqtrade_strs) | `3ed699f` |
| `E0V1E.py` | [ssssi/freqtrade_strs](https://github.com/ssssi/freqtrade_strs) | `3ed699f` |
| `E0V1EN.py` | [ssssi/freqtrade_strs](https://github.com/ssssi/freqtrade_strs) | `3ed699f` |
| `MarketStructureCHOCH.py` | [zmomz/freq_strategies](https://github.com/zmomz/freq_strategies) | `aa90bf6` |
| `NASOSv4.py` | [zmomz/freq_strategies](https://github.com/zmomz/freq_strategies) | `aa90bf6` |
| `NASOSv5_mod3.py` | [zmomz/freq_strategies](https://github.com/zmomz/freq_strategies) | `aa90bf6` |
| `TrendLines.py` | [zmomz/freq_strategies](https://github.com/zmomz/freq_strategies) | `aa90bf6` |

> 这些文件已被 `.gitignore` 忽略，不会进入提交；仅供本机自用，请勿再分发。

## 五、兼容性补丁（本地维护）

> 以下补丁为使老策略兼容 freqtrade 2026.11 / NumPy 2.x 所做的最小改动；升级上游策略时需同步检查。

| 文件 | 补丁内容 |
|---|---|
| `GodStra.py` / `FOttStrategy.py` | `from numpy.lib import math` → `import math`；去掉 `dropna` 保持 DataFrame 等长 |
| `Heracles.py` | 去掉 `dropna(dataframe)`（freqtrade 要求等长） |
| `CryptoFrog.py` / `custom_indicators.py` | `np.NaN` → `np.nan`；`sell_profit_only`/`use_sell_signal`/`ignore_roi_if_buy_signal` → 新命名；`min_roi_reached_entry(trade, trade_dur, current_time)` 新签名 |
| `BB_RPB_TSL.py` | `np.NaN` → `np.nan`；字符串列 `np.where(..., np.nan)` → `''`；旧属性 / 方法名 / 列名 / `custom_sell` → 新 API |

## 六、数据周期依赖

| 策略 | 所需周期 |
|---|---|
| `DcaTp.py` | 30m |
| `GodStra.py` | 12h |
| 其余 | 按策略声明的 5m/15m/1h/4h/1d |

## 七、未收录及原因

| 候选 | 原因 |
|---|---|
| `lookahead_bias/`（Zeus、DevilStra、GodStraNew、wtc） | **故意引入未来函数**，回测收益虚高，官方仓库仅用于演示，严禁实盘 |
| 8 个无 LICENSE 策略 | 上游无许可文件，不随仓库分发；可用 `scripts/fetch_optional_strategies.py` 自行获取 |
| FreqAI 策略（nateemma/strategies 等） | 需要 `stable_freqai` 镜像 + torch + 模型训练配置，非单文件可运行 |
| `Rikj000/MoniGoMani` | 框架而非单文件策略，需改 config 与子模块，2023 年后停更 |

## 八、许可提示

- 官方仓库、`BB_RPB_TSL`、`NostalgiaForInfinityX8` 为 GPL-3.0；`CryptoFrog` 为 Apache-2.0；`DcaTpStrategy` 为 MIT。
- 本仓库以 GPL-3.0 发布（见根目录 `LICENSE`）。
- 所有策略均为第三方代码，未经审计；请在 `dry_run` 下充分回测再考虑实盘。

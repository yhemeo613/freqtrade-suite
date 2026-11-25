"""新币加权动态标的池插件

基于 VolumePairList 的 ticker 模式,对"上市时间短的新币"做成交额加权,
使新上市、成交额尚小的标的也能优先进入交易白名单,避免错过新币行情。

一次 fetchTickers 请求覆盖 OKX 全市场(约 500+ 合约),不触发交易所限流;
WS 只订阅最终入选的 number_assets 个标的(默认 40 × 5 周期 = 200 ≤ 240 频道)。

成交量口径:OKX 期货 tickers 不提供 `quoteVolume`,且 `vol24h` 是**张数**
(需乘合约面值 ctVal),`volCcy24h` 才是币本位成交量。本插件用
`volCcy24h × last` 计算 24h 成交额(计价货币),避免按张数排名导致跨标的失真。
"""

import logging
import time

from freqtrade.exchange.exchange_types import Tickers
from freqtrade.plugins.pairlist.IPairList import PairlistParameter
from freqtrade.plugins.pairlist.VolumePairList import VolumePairList

logger = logging.getLogger(__name__)


def _safe_float(value, default: float) -> float:
    """配置值转 float;非法值回退默认,避免启动失败。"""
    try:
        return float(value)
    except (TypeError, ValueError):
        logger.warning("NewCoinWeightedVolumePairList: 配置值 %r 非法,使用默认值 %s", value, default)
        return default


class NewCoinWeightedVolumePairList(VolumePairList):
    """
    VolumePairList with new-coin weighting.

    配置示例:
    {
      "method": "NewCoinWeightedVolumePairList",
      "number_assets": 40,
      "sort_key": "quoteVolume",
      "refresh_period": 600,
      "new_coin_days": 90,
      "new_coin_boost": 8,
      "exclude_majors": true,
      "exclude_stocks_commodities": true
    }

    new_coin_days: 上市不足该天数的标的视为「新币」(默认 90)
    new_coin_boost: 新币成交额加权倍数,age=0 时 ×(1+boost),随上市时间线性衰减到 1
    exclude_majors: 排除主流大币(默认 true,倾向山寨)
    exclude_stocks_commodities: 排除股票代币与商品代币(默认 true)
    """

    # 主流大币(默认排除,倾向山寨)
    DEFAULT_MAJORS = frozenset(
        {
            "BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "BNB", "LTC", "BCH", "TRX",
            "DOT", "LINK", "AVAX", "ATOM", "UNI", "ETC", "XLM",
        }
    )

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._new_coin_days = _safe_float(self._pairlistconfig.get("new_coin_days", 90), 90.0)
        self._new_coin_boost = _safe_float(self._pairlistconfig.get("new_coin_boost", 8), 8.0)
        self._exclude_majors = bool(self._pairlistconfig.get("exclude_majors", True))
        self._exclude_stocks_commodities = bool(
            self._pairlistconfig.get("exclude_stocks_commodities", True)
        )
        self._majors = set(self._pairlistconfig.get("majors", self.DEFAULT_MAJORS))
        logger.info(
            "NewCoinWeightedVolumePairList: new_coin_days=%s, new_coin_boost=%s, "
            "exclude_majors=%s, exclude_stocks_commodities=%s",
            self._new_coin_days,
            self._new_coin_boost,
            self._exclude_majors,
            self._exclude_stocks_commodities,
        )

    @staticmethod
    def description() -> str:
        return "Volume pairlist with new-coin weighting (quoteVolume x age boost)."

    @staticmethod
    def available_parameters() -> dict[str, PairlistParameter]:
        params = VolumePairList.available_parameters()
        params.update(
            {
                "new_coin_days": {
                    "type": "number",
                    "default": 90,
                    "description": "New coin window (days)",
                    "help": "Pairs listed within this many days get volume boost.",
                },
                "new_coin_boost": {
                    "type": "number",
                    "default": 8,
                    "description": "New coin volume boost multiplier",
                    "help": "Maximum boost applied at age=0, decaying linearly to 1.0.",
                },
                "exclude_majors": {
                    "type": "boolean",
                    "default": True,
                    "description": "Exclude major coins (alt-coin bias)",
                    "help": "Remove BTC/ETH/SOL etc. from the pairlist.",
                },
                "exclude_stocks_commodities": {
                    "type": "boolean",
                    "default": True,
                    "description": "Exclude stock/commodity tokens",
                    "help": "Only keep crypto assets (OKX instCategory=1).",
                },
            }
        )
        return params

    def filter_pairlist(self, pairlist: list[str], tickers: Tickers) -> list[str]:
        pairlist = self._filter_categories(pairlist)
        # 加权在 tickers 副本上进行:交易所行情字典会被缓存复用(默认 TTL 1800s),
        # 原地修改会让同一批行情在多个刷新周期内被反复加权(权重复利),也会污染缓存。
        return super().filter_pairlist(pairlist, self._weighted_tickers(tickers))

    def _filter_categories(self, pairlist: list[str]) -> list[str]:
        """剔除股票/商品代币与主流大币,只保留山寨加密"""
        markets = self._exchange.markets
        result = []
        for pair in pairlist:
            if self._exclude_majors and pair.split("/")[0] in self._majors:
                continue
            if self._exclude_stocks_commodities:
                info = markets.get(pair, {}).get("info", {}) or {}
                category = info.get("instCategory")
                # 仅当交易所明确标注类别时才过滤(OKX: 1=加密 2=股票 3=商品);
                # 缺失该字段的市场(部分交易所/现货)不做误杀。
                if category is not None and str(category).strip() not in ("", "1"):
                    continue
            result.append(pair)
        return result

    def _weighted_tickers(self, tickers: Tickers) -> Tickers:
        """返回带新币加权的 tickers 副本(不修改传入对象)。"""
        now_ms = time.time() * 1000
        markets = self._exchange.markets
        weighted: Tickers = {}
        for pair, t in tickers.items():
            if not isinstance(t, dict):
                weighted[pair] = t
                continue
            base_qv = self._base_quote_volume(t)
            weighted[pair] = {**t, "quoteVolume": base_qv * self._age_weight(pair, markets, now_ms)}
        return weighted

    @staticmethod
    def _base_quote_volume(t: dict) -> float:
        """取标的 24h 成交额(计价货币)。

        OKX 期货 tickers 不提供 quoteVolume,且 `vol24h` 是张数(需乘合约面值),
        `volCcy24h` 才是币本位成交量。优先用原始字段换算,缺失时退回 baseVolume × last。
        """
        info = t.get("info") or {}
        raw_base = info.get("volCcy24h")
        if raw_base is None:
            raw_base = t.get("baseVolume")
        try:
            return float(raw_base or 0) * float(t.get("last") or 0)
        except (TypeError, ValueError):
            return 0.0

    def _age_weight(self, pair: str, markets: dict, now_ms: float) -> float:
        """新币加权倍数:age=0 时 1+boost,随上市时间线性衰减到 1。"""
        if self._new_coin_days <= 0 or self._new_coin_boost <= 0:
            return 1.0
        age_days = self._pair_age_days(pair, markets, now_ms)
        decay = max(0.0, 1.0 - age_days / self._new_coin_days)
        return 1.0 + decay * self._new_coin_boost

    def _pair_age_days(self, pair: str, markets: dict, now_ms: float) -> float:
        try:
            info = markets.get(pair, {}).get("info", {}) or {}
            list_time = float(info.get("listTime") or 0)
        except (TypeError, ValueError, AttributeError):
            # 解析失败按未知处理 → 中性加权,避免异常数据被当成"刚上市"而获得最大加权
            return self._new_coin_days
        if list_time <= 0:
            return self._new_coin_days  # 未知 → 中性加权
        return max(0.0, (now_ms - list_time) / 86400000.0)

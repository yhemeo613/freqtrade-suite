/** 展示格式化工具 */

export function fmtPct(ratio: number | undefined | null, digits = 2): string {
    if (ratio === undefined || ratio === null || Number.isNaN(ratio)) return "—";
    const v = ratio * 100;
    return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function profitColor(ratio: number | undefined | null): string {
    if (ratio === undefined || ratio === null || Number.isNaN(ratio))
        return "text-muted-foreground";
    return ratio >= 0 ? "text-success" : "text-destructive";
}

export function fmtCoin(value: number | undefined | null, currency = "", digits = 2): string {
    if (value === undefined || value === null || Number.isNaN(value)) return "—";
    const abs = Math.abs(value);
    let d = digits;
    if (abs > 0 && abs < 1) d = 4;
    if (abs > 0 && abs < 0.01) d = 6;
    const s = value.toLocaleString("zh-CN", { minimumFractionDigits: d, maximumFractionDigits: d });
    return currency ? `${s} ${currency}` : s;
}

export function fmtPrice(value: number | undefined | null): string {
    if (value === undefined || value === null) return "—";
    if (Math.abs(value) >= 100) return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
    if (Math.abs(value) >= 1) return value.toFixed(4);
    // 低价位:保留 6 位有效数字,去掉 toPrecision 产生的尾零(如 0.500000 → 0.5)
    return value.toPrecision(6).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

/**
 * 统一解析接口时间：
 * - 数字 / 纯数字字符串：秒级（<1e12）或毫秒级时间戳
 * - "YYYY-MM-DD HH:MM:SS" / ISO 无时区：按 UTC 解析（freqtrade 返回 UTC）
 * - 带时区的 ISO：原样解析
 */
export function parseDate(value: string | number | Date | undefined | null): Date | null {
    if (value === undefined || value === null || value === "") return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === "number" || /^\d+$/.test(String(value))) {
        const n = Number(value);
        return new Date(n < 1e12 ? n * 1000 : n);
    }
    let s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) {
        s = s.replace(" ", "T") + "Z";
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDate(value: string | number | undefined | null): string {
    const d = parseDate(value);
    if (!d) return "—";
    return d.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

export function fmtDuration(start: string | number | null, end?: string | number | null): string {
    const s = parseDate(start);
    if (!s) return "—";
    const e = end ? parseDate(end) : new Date();
    if (!e) return "—";
    // 时钟偏差或异常数据可能使结束时间早于开始时间，钳制为非负
    const min = Math.max(0, Math.floor((e.getTime() - s.getTime()) / 60_000));
    if (min < 60) return `${min} 分钟`;
    const h = Math.floor(min / 60);
    if (h < 48) return `${h} 小时 ${min % 60} 分`;
    return `${Math.floor(h / 24)} 天 ${h % 24} 小时`;
}

export function shortPair(pair: string): string {
    // BTC/USDT:USDT → BTC；BTC/USDT → BTC
    return pair.split("/")[0] ?? pair;
}

/** 平仓原因中文映射 */
const EXIT_REASON_ZH: Record<string, string> = {
    roi: "止盈 (ROI)",
    stop_loss: "止损",
    stoploss_on_exchange: "交易所止损",
    trailing_stop_loss: "移动止损",
    exit_signal: "出场信号",
    force_exit: "强制平仓",
    emergency_exit: "紧急平仓",
    emergency_exit_check: "紧急平仓",
    liquidation_stop: "强平保护",
    custom_exit: "自定义出场",
    custom_stoploss: "自定义止损",
    stoploss_and_min_roi: "止损/最小ROI",
    exit_profit_short_rebuy: "空头止盈回补",
    exit_profit_long_rebuy: "多头止盈回补",
    forcebuy: "强制买入",
    forced_exit: "强制平仓"
};
export function exitReasonZh(reason: string | undefined | null): string {
    if (!reason) return "—";
    // NFI 等策略的自定义长标签（如 exit_long_tc_d_6_1）原样保留
    return EXIT_REASON_ZH[reason] ?? reason;
}

const ENTRY_TAG_ZH: Record<string, string> = {};
export function entryTagZh(tag: string | undefined | null): string {
    if (!tag) return "—";
    return ENTRY_TAG_ZH[tag] ?? tag;
}

export function directionZh(isShort: boolean | undefined): string {
    return isShort ? "做空" : "做多";
}

/** 机器人运行状态中文映射（freqtrade config.state） */
const BOT_STATE_ZH: Record<string, string> = {
    running: "运行中",
    paused: "已暂停",
    stopped: "已停止",
    reload_config: "重载配置中"
};
export function botStateZh(state: string | undefined | null): string {
    if (!state) return "—";
    return BOT_STATE_ZH[state] ?? state;
}

/**
 * 在 freqtrade 的「时间序列列式响应」里定位「总资产」列。
 *
 * 同一类接口在不同市场模式下列名不同：
 * - 期货：`total_quote`（`/historic_balance`、回测 `wallet` 接口的聚合列）
 * - 现货 / 旧版本：`total`
 * 用 `indexOf("total")` 精确匹配会漏掉 `total_quote`，导致曲线整条空白。
 *
 * @returns 命中的列下标；找不到返回 -1（调用方应跳过渲染）
 */
export function findTotalColumn(cols: string[]): number {
    return [cols.indexOf("total_quote"), cols.indexOf("total")].find((i) => i >= 0) ?? -1;
}

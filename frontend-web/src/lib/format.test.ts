import { describe, expect, it } from "vitest";
import {
    botStateZh,
    directionZh,
    entryTagZh,
    exitReasonZh,
    findTotalColumn,
    fmtCoin,
    fmtDate,
    fmtDuration,
    fmtPct,
    fmtPrice,
    parseDate,
    shortPair
} from "./format";

describe("fmtPct", () => {
    it("格式化百分比并带符号", () => {
        expect(fmtPct(0.1234)).toBe("+12.34%");
        expect(fmtPct(-0.05)).toBe("-5.00%");
        expect(fmtPct(0)).toBe("+0.00%");
    });
    it("空值 / NaN 返回占位符", () => {
        expect(fmtPct(undefined)).toBe("—");
        expect(fmtPct(null)).toBe("—");
        expect(fmtPct(NaN)).toBe("—");
    });
});

describe("fmtCoin", () => {
    it("小数位随数值大小自适应", () => {
        expect(fmtCoin(1.23456)).toBe("1.23");
        expect(fmtCoin(0.5)).toBe("0.5000");
        expect(fmtCoin(0.005)).toBe("0.005000");
    });
    it("空值返回占位符", () => {
        expect(fmtCoin(undefined)).toBe("—");
    });
    it("带币种后缀", () => {
        expect(fmtCoin(10, "USDT")).toBe("10.00 USDT");
    });
});

describe("fmtPrice", () => {
    it("大额价格最多两位小数", () => {
        expect(fmtPrice(150)).toBe("150");
        expect(fmtPrice(1234.567)).toBe("1,234.57");
    });
    it("中等价格四位小数", () => {
        expect(fmtPrice(10.5)).toBe("10.5000");
    });
    it("低价位保留有效位且去掉尾零", () => {
        expect(fmtPrice(0.5)).toBe("0.5");
        expect(fmtPrice(0.123456)).toBe("0.123456");
        expect(fmtPrice(0.0001234)).toBe("0.0001234");
    });
    it("空值返回占位符", () => {
        expect(fmtPrice(undefined)).toBe("—");
    });
});

describe("parseDate", () => {
    it("秒级时间戳", () => {
        const d = parseDate(1_700_000_000);
        expect(d!.getUTCFullYear()).toBe(2023);
    });
    it("毫秒级时间戳", () => {
        const d = parseDate(1_700_000_000_000);
        expect(d!.getUTCFullYear()).toBe(2023);
    });
    it("数字字符串按时间戳解析", () => {
        const d = parseDate("1700000000");
        expect(d!.getTime()).toBe(1_700_000_000_000);
    });
    it("UTC 无时区时间串按 UTC 解析", () => {
        const d = parseDate("2026-01-01 00:00:00");
        expect(d!.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    });
    it("ISO 带时区原样解析", () => {
        const d = parseDate("2026-01-01T08:00:00+08:00");
        expect(d!.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    });
    it("非法输入返回 null", () => {
        expect(parseDate("")).toBeNull();
        expect(parseDate("garbage")).toBeNull();
        expect(parseDate(undefined)).toBeNull();
    });
});

describe("fmtDate", () => {
    it("合法时间返回格式化串", () => {
        expect(fmtDate("2026-01-01 00:00:00")).not.toBe("—");
    });
    it("非法时间返回占位符", () => {
        expect(fmtDate(null)).toBe("—");
    });
});

describe("fmtDuration", () => {
    it("分钟级", () => {
        expect(fmtDuration("2026-01-01 00:00:00", "2026-01-01 00:35:00")).toBe("35 分钟");
    });
    it("小时级", () => {
        expect(fmtDuration("2026-01-01 00:00:00", "2026-01-01 02:15:00")).toBe("2 小时 15 分");
    });
    it("天数级", () => {
        expect(fmtDuration("2026-01-01 00:00:00", "2026-01-03 10:00:00")).toBe("2 天 10 小时");
    });
    it("非法起始返回占位符", () => {
        expect(fmtDuration(null)).toBe("—");
    });
    it("结束时间早于开始时间时钳制为 0 分钟", () => {
        expect(fmtDuration("2026-01-01 02:00:00", "2026-01-01 01:00:00")).toBe("0 分钟");
    });
});

describe("shortPair", () => {
    it("去掉交易对后缀", () => {
        expect(shortPair("BTC/USDT:USDT")).toBe("BTC");
        expect(shortPair("BTC/USDT")).toBe("BTC");
    });
});

describe("exitReasonZh", () => {
    it("映射中文原因", () => {
        expect(exitReasonZh("roi")).toBe("止盈 (ROI)");
        expect(exitReasonZh("trailing_stop_loss")).toBe("移动止损");
        expect(exitReasonZh("stop_loss")).toBe("止损");
    });
    it("未知原因原样保留(策略自定义标签)", () => {
        expect(exitReasonZh("exit_long_tc_d_6_1")).toBe("exit_long_tc_d_6_1");
    });
    it("空值返回占位符", () => {
        expect(exitReasonZh(null)).toBe("—");
    });
    it("空字符串按缺失处理", () => {
        expect(exitReasonZh("")).toBe("—");
        expect(entryTagZh("")).toBe("—");
        expect(entryTagZh("custom_tag")).toBe("custom_tag");
    });
});

describe("directionZh", () => {
    it("多空方向", () => {
        expect(directionZh(true)).toBe("做空");
        expect(directionZh(false)).toBe("做多");
    });
});

describe("botStateZh", () => {
    it("映射机器人运行状态", () => {
        expect(botStateZh("running")).toBe("运行中");
        expect(botStateZh("paused")).toBe("已暂停");
        expect(botStateZh("stopped")).toBe("已停止");
        expect(botStateZh("reload_config")).toBe("重载配置中");
    });
    it("未知状态原样保留", () => {
        expect(botStateZh("starting")).toBe("starting");
    });
    it("空值返回占位符", () => {
        expect(botStateZh(undefined)).toBe("—");
        expect(botStateZh(null)).toBe("—");
        expect(botStateZh("")).toBe("—");
    });
});

describe("findTotalColumn", () => {
    it("期货引用的 total_quote 列", () => {
        expect(findTotalColumn(["date", "__date_ts", "total_quote"])).toBe(2);
    });
    it("现货/旧版的 total 列", () => {
        expect(findTotalColumn(["date", "total"])).toBe(1);
    });
    it("两种列同时存在时优先 total_quote", () => {
        expect(findTotalColumn(["date", "total", "total_quote"])).toBe(2);
    });
    it("找不到返回 -1（调用方跳过渲染）", () => {
        expect(findTotalColumn(["date", "balance"])).toBe(-1);
        expect(findTotalColumn([])).toBe(-1);
    });
});

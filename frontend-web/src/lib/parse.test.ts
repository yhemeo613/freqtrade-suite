import { describe, expect, it } from "vitest";
import { defaultTimerange, parseOptionalPrice } from "./parse";

describe("parseOptionalPrice", () => {
    it("空输入返回 undefined（走市价）", () => {
        expect(parseOptionalPrice("")).toBeUndefined();
        expect(parseOptionalPrice("   ")).toBeUndefined();
    });

    it("合法正数返回 number", () => {
        expect(parseOptionalPrice("123.45")).toBe(123.45);
        expect(parseOptionalPrice(" 0.0001 ")).toBe(0.0001);
    });

    it("非法输入返回 null（提示错误）", () => {
        expect(parseOptionalPrice("abc")).toBeNull();
        expect(parseOptionalPrice("NaN")).toBeNull();
        expect(parseOptionalPrice("Infinity")).toBeNull();
        expect(parseOptionalPrice("0")).toBeNull();
        expect(parseOptionalPrice("-5")).toBeNull();
    });
});

describe("defaultTimerange", () => {
    it("默认回溯 60 天，结束留空", () => {
        expect(defaultTimerange(60, new Date(2026, 10, 24))).toBe("20260925-");
    });

    it("按天数滚动（跨月跨年）", () => {
        expect(defaultTimerange(30, new Date(2026, 0, 15))).toBe("20251216-");
        expect(defaultTimerange(7, new Date(2026, 2, 3))).toBe("20260224-");
    });

    it("月份与日期补零", () => {
        expect(defaultTimerange(1, new Date(2026, 0, 2))).toBe("20260101-");
        expect(defaultTimerange(1, new Date(2026, 0, 1))).toBe("20251231-");
    });

    it("返回格式可被 freqtrade timerange 解析（YYYYMMDD-）", () => {
        expect(defaultTimerange(10, new Date(2026, 5, 15))).toMatch(/^\d{8}-$/);
    });
});

import { describe, expect, it } from "vitest";
import { parseOptionalPrice } from "./parse";

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

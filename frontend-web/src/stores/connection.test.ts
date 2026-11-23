import { beforeEach, describe, expect, it } from "vitest";
import { connectionStore, markConnectionLost, markConnectionOk } from "./connection";

describe("connection store", () => {
    beforeEach(() => {
        markConnectionOk();
    });

    it("默认在线", () => {
        expect(connectionStore.lost).toBe(false);
    });

    it("标记断开后记录错误信息", () => {
        markConnectionLost(new Error("Failed to fetch"));
        expect(connectionStore.lost).toBe(true);
        expect(connectionStore.lastError).toBe("Failed to fetch");
    });

    it("恢复在线后清空错误", () => {
        markConnectionLost(new Error("boom"));
        markConnectionOk();
        expect(connectionStore.lost).toBe(false);
        expect(connectionStore.lastError).toBe("");
    });

    it("非 Error 对象也能记录", () => {
        markConnectionLost("string error");
        expect(connectionStore.lastError).toBe("string error");
    });
});

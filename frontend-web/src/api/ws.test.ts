import { describe, expect, it } from "vitest";
import { deriveWsUrl } from "./ws";

describe("deriveWsUrl", () => {
    it("同源 http 页面推导 ws://", () => {
        expect(deriveWsUrl("", { protocol: "http:", host: "127.0.0.1:5173" }, "tok")).toBe(
            "ws://127.0.0.1:5173/api/v1/message/ws?token=tok"
        );
    });

    it("同源 https 页面推导 wss://", () => {
        expect(deriveWsUrl("", { protocol: "https:", host: "example.com" }, "tok")).toBe(
            "wss://example.com/api/v1/message/ws?token=tok"
        );
    });

    it("显式 API 地址时按协议替换 http→ws", () => {
        expect(deriveWsUrl("http://10.0.0.5:8080", { protocol: "http:", host: "x" }, "t")).toBe(
            "ws://10.0.0.5:8080/api/v1/message/ws?token=t"
        );
    });

    it("显式 https API 地址时替换为 wss", () => {
        expect(deriveWsUrl("https://bot.example.com", { protocol: "http:", host: "x" }, "t")).toBe(
            "wss://bot.example.com/api/v1/message/ws?token=t"
        );
    });
});

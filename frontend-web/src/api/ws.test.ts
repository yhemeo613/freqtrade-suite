// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { deriveWsUrl, FreqWs, stopAllWs } from "./ws";
import { setActiveClient, type BotApiClient } from "./client";

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

/* ---------- FreqWs 重连行为 ---------- */

class FakeWebSocket {
    static instances: FakeWebSocket[] = [];
    url: string;
    onopen: (() => void) | null = null;
    onclose: ((ev: { code: number }) => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;

    constructor(url: string) {
        this.url = url;
        FakeWebSocket.instances.push(this);
    }

    close() {
        /* noop */
    }

    emitOpen() {
        this.onopen?.();
    }

    emitClose(code: number) {
        this.onclose?.({ code });
    }
}

function makeClient(refreshOk: boolean) {
    const refreshAccessToken = vi.fn(async () => refreshOk);
    const client = {
        baseUrl: "http://127.0.0.1:8080",
        wsToken: "tok",
        refreshAccessToken
    } as unknown as BotApiClient;
    setActiveClient(client);
    return { client, refreshAccessToken };
}

async function flush() {
    await Promise.resolve();
    await Promise.resolve();
}

describe("FreqWs 鉴权重连", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("WebSocket", FakeWebSocket);
        FakeWebSocket.instances = [];
    });

    afterEach(() => {
        stopAllWs();
        vi.unstubAllGlobals();
        vi.useRealTimers();
        setActiveClient(null);
    });

    it("鉴权失败(4401)且刷新成功后立即重连", async () => {
        const { refreshAccessToken } = makeClient(true);
        const ws = new FreqWs([]);
        ws.start();
        expect(FakeWebSocket.instances.length).toBe(1);

        FakeWebSocket.instances[0].emitClose(4401);
        await flush();
        expect(refreshAccessToken).toHaveBeenCalledTimes(1);
        expect(FakeWebSocket.instances.length).toBe(2); // 刷新成功 → 立即重连
    });

    it("连续 3 次鉴权失败后退避重连，不再无限快速重连", async () => {
        const { refreshAccessToken } = makeClient(true);
        const ws = new FreqWs([]);
        ws.start();
        expect(FakeWebSocket.instances.length).toBe(1);

        // 第 1 次鉴权失败 → 刷新 → 重连
        FakeWebSocket.instances[0].emitClose(4401);
        await flush();
        // 第 2 次 → 刷新 → 重连
        FakeWebSocket.instances[1].emitClose(4401);
        await flush();
        expect(FakeWebSocket.instances.length).toBe(3);

        // 第 3 次 → 不再立即重连，改为指数退避
        FakeWebSocket.instances[2].emitClose(4401);
        await flush();
        expect(refreshAccessToken).toHaveBeenCalledTimes(2); // 第 3 次没有走刷新
        expect(FakeWebSocket.instances.length).toBe(3); // 没有新连接

        // 退避 1s 后才会重连
        await vi.advanceTimersByTimeAsync(1000);
        expect(FakeWebSocket.instances.length).toBe(4);
    });

    it("刷新失败(返回 false)时直接退避，不计数为鉴权失败", async () => {
        const { refreshAccessToken } = makeClient(false);
        const ws = new FreqWs([]);
        ws.start();
        FakeWebSocket.instances[0].emitClose(4401);
        await flush();
        expect(refreshAccessToken).toHaveBeenCalledTimes(1);
        expect(FakeWebSocket.instances.length).toBe(1); // 没有立即重连

        await vi.advanceTimersByTimeAsync(1000);
        expect(FakeWebSocket.instances.length).toBe(2);
    });

    it("连接成功后重置鉴权失败计数", async () => {
        const { refreshAccessToken } = makeClient(true);
        const ws = new FreqWs([]);
        ws.start();
        expect(FakeWebSocket.instances.length).toBe(1);

        // 1 次鉴权失败 → 刷新 → 重连
        FakeWebSocket.instances[0].emitClose(4401);
        await flush();
        expect(FakeWebSocket.instances.length).toBe(2);

        // 新连接成功打开 → 计数重置
        FakeWebSocket.instances[1].emitOpen();

        // 再来 1 次鉴权失败 → 仍走刷新立即重连（计数已重置，未到 3 次阈值）
        FakeWebSocket.instances[1].emitClose(4401);
        await flush();
        expect(refreshAccessToken).toHaveBeenCalledTimes(2);
        expect(FakeWebSocket.instances.length).toBe(3);
    });

    it("普通断线(1000)不触发鉴权刷新，走指数退避", async () => {
        const { refreshAccessToken } = makeClient(true);
        const ws = new FreqWs([]);
        ws.start();
        FakeWebSocket.instances[0].emitClose(1000);
        await flush();
        expect(refreshAccessToken).not.toHaveBeenCalled();
        expect(FakeWebSocket.instances.length).toBe(1);

        await vi.advanceTimersByTimeAsync(1000);
        expect(FakeWebSocket.instances.length).toBe(2);
    });
});

// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BotApiClient 核心行为测试：
 * - Basic 登录、401 自动 refresh 后重放
 * - refresh 彻底失败时触发会话失效回调
 * - 错误 detail 透传、baseUrl/btBaseUrl 规整
 */

const BOT = {
    botId: "b1",
    botName: "机器人",
    url: "http://127.0.0.1:8080/",
    user: "freqtrader",
    password: "secret"
};

function jsonResponse(status: number, body: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body
    };
}

async function freshClient() {
    vi.resetModules();
    return await import("./client");
}

describe("BotApiClient", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("login 发送 Basic 认证并保存 token", async () => {
        const { BotApiClient } = await freshClient();
        const fetchMock = vi
            .fn()
            .mockResolvedValue(jsonResponse(200, { access_token: "a1", refresh_token: "r1" }));
        vi.stubGlobal("fetch", fetchMock);

        const client = new BotApiClient(BOT);
        await client.login();

        const [url, opts] = fetchMock.mock.calls[0];
        expect(url).toBe("http://127.0.0.1:8080/api/v1/token/login");
        expect((opts as RequestInit).headers).toMatchObject({
            Authorization: `Basic ${btoa("freqtrader:secret")}`
        });
        expect(client.wsToken).toBe("a1");
    });

    it("login 401 抛出“用户名或密码错误”", async () => {
        const { BotApiClient } = await freshClient();
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {})));

        const client = new BotApiClient(BOT);
        await expect(client.login()).rejects.toThrow("用户名或密码错误");
    });

    it("401 后自动 refresh 并重放原请求", async () => {
        const { BotApiClient } = await freshClient();
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(200, { access_token: "a1", refresh_token: "r1" }))
            .mockResolvedValueOnce(jsonResponse(401, { detail: "token expired" }))
            .mockResolvedValueOnce(jsonResponse(200, { access_token: "a2" }))
            .mockResolvedValueOnce(jsonResponse(200, { status: "pong" }));
        vi.stubGlobal("fetch", fetchMock);

        const client = new BotApiClient(BOT);
        await client.login();
        const res = await client.get("/api/v1/ping");

        expect(res).toEqual({ status: "pong" });
        expect(fetchMock.mock.calls[2][0]).toBe("http://127.0.0.1:8080/api/v1/token/refresh");
        expect(client.wsToken).toBe("a2");
    });

    it("refresh 也返回 401 时触发会话失效回调", async () => {
        const { BotApiClient, setSessionExpiredHandler } = await freshClient();
        const onExpired = vi.fn();
        setSessionExpiredHandler(onExpired);
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(200, { access_token: "a1", refresh_token: "r1" }))
            .mockResolvedValueOnce(jsonResponse(401, {}))
            .mockResolvedValueOnce(jsonResponse(401, {}));
        vi.stubGlobal("fetch", fetchMock);

        const client = new BotApiClient(BOT);
        await client.login();
        await expect(client.get("/api/v1/status")).rejects.toThrow();

        expect(onExpired).toHaveBeenCalledTimes(1);
    });

    it("错误响应 detail 透传到异常信息", async () => {
        const { BotApiClient } = await freshClient();
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(200, { access_token: "a1", refresh_token: "r1" }))
            .mockResolvedValueOnce(jsonResponse(500, { detail: "系统繁忙" }));
        vi.stubGlobal("fetch", fetchMock);

        const client = new BotApiClient(BOT);
        await client.login();
        await expect(client.get("/api/v1/status")).rejects.toThrow("系统繁忙");
    });

    it("baseUrl 去掉末尾斜杠，backtestUrl 缺省回退 url", async () => {
        const { BotApiClient } = await freshClient();
        const client = new BotApiClient(BOT);
        expect(client.baseUrl).toBe("http://127.0.0.1:8080");
        expect(client.btBaseUrl).toBe("http://127.0.0.1:8080");

        const withBt = new BotApiClient({ ...BOT, backtestUrl: "http://127.0.0.1:8081/" });
        expect(withBt.btBaseUrl).toBe("http://127.0.0.1:8081");
    });

    it("login 成功后持久化 refresh token，resume 用它免密恢复", async () => {
        const { BotApiClient, getStoredRefreshToken } = await freshClient();
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(200, { access_token: "a1", refresh_token: "r1" }))
            .mockResolvedValueOnce(jsonResponse(200, { access_token: "a2" }));
        vi.stubGlobal("fetch", fetchMock);

        const client = new BotApiClient(BOT);
        await client.login();
        // 登录成功 → refresh token 已持久化
        expect(getStoredRefreshToken(BOT.botId)).toBe("r1");

        // 模拟浏览器重启: 新实例无内存 token,凭持久化 refresh token 恢复
        const { BotApiClient: FreshApi } = await freshClient();
        const fresh = new FreshApi(BOT);
        const resumed = await fresh.resume();
        expect(resumed).toBe(true);
        // resume 用存储的 refresh token 调 /token/refresh
        expect(fetchMock.mock.calls[1][0]).toBe("http://127.0.0.1:8080/api/v1/token/refresh");
        expect(fresh.wsToken).toBe("a2");
    });

    it("resume 失败(过期)时清除持久化 token 并返回 false", async () => {
        const { BotApiClient, getStoredRefreshToken, storeRefreshToken } = await freshClient();
        storeRefreshToken(BOT.botId, "expired-token");

        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, {}));
        vi.stubGlobal("fetch", fetchMock);

        const client = new BotApiClient(BOT);
        const resumed = await client.resume();

        expect(resumed).toBe(false);
        expect(getStoredRefreshToken(BOT.botId)).toBeNull(); // 失效 token 已清除
    });

    it("logout 清除内存 token 与持久化 refresh token", async () => {
        const { BotApiClient, getStoredRefreshToken } = await freshClient();
        const fetchMock = vi
            .fn()
            .mockResolvedValue(jsonResponse(200, { access_token: "a1", refresh_token: "r1" }));
        vi.stubGlobal("fetch", fetchMock);

        const client = new BotApiClient(BOT);
        await client.login();
        expect(getStoredRefreshToken(BOT.botId)).toBe("r1");

        client.logout();
        expect(client.wsToken).toBe("");
        expect(getStoredRefreshToken(BOT.botId)).toBeNull();
    });

    it("无持久化 token 时 resume 直接返回 false(不发请求)", async () => {
        const { BotApiClient } = await freshClient();
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const client = new BotApiClient(BOT);
        expect(await client.resume()).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

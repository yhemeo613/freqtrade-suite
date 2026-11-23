// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * auth store 安全相关行为测试：
 * - 密码只进 sessionStorage，localStorage 仅存元数据
 * - 旧版直连地址自动迁移为同源（空串）
 * - 删除当前机器人时同步登出
 */
async function freshAuth() {
    vi.resetModules();
    return await import("./auth");
}

describe("auth store 密码与存储", () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it("saveBots 不把密码写入 localStorage，只写 sessionStorage", async () => {
        const { saveBots } = await freshAuth();
        saveBots([{ botId: "b1", botName: "机器人", url: "", user: "u", password: "secret-pw" }]);

        const stored = JSON.parse(localStorage.getItem("ftzh.bots") ?? "[]");
        expect(stored).toHaveLength(1);
        expect(stored[0].password).toBe("");

        const pwMap = JSON.parse(sessionStorage.getItem("ftzh.passwords") ?? "{}");
        expect(pwMap.b1).toBe("secret-pw");
    });

    it("loadBots 从 sessionStorage 恢复密码", async () => {
        localStorage.setItem(
            "ftzh.bots",
            JSON.stringify([{ botId: "b1", botName: "机器人", url: "", user: "u", password: "" }])
        );
        sessionStorage.setItem("ftzh.passwords", JSON.stringify({ b1: "secret-pw" }));

        const { authStore } = await freshAuth();
        expect(authStore.bots[0].password).toBe("secret-pw");
    });

    it("sessionStorage 缺失时密码为空（需重新登录）", async () => {
        localStorage.setItem(
            "ftzh.bots",
            JSON.stringify([{ botId: "b1", botName: "机器人", url: "", user: "u", password: "" }])
        );

        const { authStore } = await freshAuth();
        expect(authStore.bots[0].password).toBe("");
    });

    it("旧版直连地址（localhost:8080）迁移为同源空串", async () => {
        localStorage.setItem(
            "ftzh.bots",
            JSON.stringify([
                {
                    botId: "b1",
                    botName: "旧",
                    url: "http://localhost:8080",
                    user: "u",
                    password: ""
                }
            ])
        );

        const { authStore } = await freshAuth();
        expect(authStore.bots[0].url).toBe("");
    });

    it("删除当前机器人时登出并清空 activeBotId", async () => {
        const { addBot, removeBot, authStore } = await freshAuth();
        const bot = addBot({ botName: "机器人", url: "", user: "u", password: "p" });
        authStore.activeBotId = bot.botId;
        authStore.loggedIn = true;

        removeBot(bot.botId);

        expect(authStore.loggedIn).toBe(false);
        expect(authStore.activeBotId).toBeNull();
        expect(localStorage.getItem("ftzh.activeBotId")).toBeNull();
    });

    it("删除非当前机器人不影响登录状态", async () => {
        const { addBot, removeBot, authStore } = await freshAuth();
        const a = addBot({ botName: "A", url: "", user: "u", password: "p" });
        const b = addBot({ botName: "B", url: "", user: "u", password: "p" });
        authStore.activeBotId = b.botId;
        authStore.loggedIn = true;

        removeBot(a.botId);

        expect(authStore.loggedIn).toBe(true);
        expect(authStore.activeBotId).toBe(b.botId);
        expect(authStore.bots.map((x) => x.botName)).toEqual(["B"]);
    });
});

import { reactive } from "vue";
import {
    BotApiClient,
    clearStoredRefreshToken,
    getStoredRefreshToken,
    logoutActiveClient,
    setActiveClient,
    type BotConfig
} from "@/api/client";
import { stopAllWs } from "@/api/ws";

const LS_BOTS = "ftzh.bots";
const LS_ACTIVE = "ftzh.activeBotId";
/** 密码仅保存在本次浏览器会话(sessionStorage),关闭浏览器后需重新输入 */
const SS_PASSWORDS = "ftzh.passwords";

/**
 * 旧版本默认保存的是直连地址（localhost:8080）。
 * 现在统一由 Nginx 同源分流，加载时自动把这类本机默认地址清空，避免跨域与端口耦合。
 */
const LEGACY_DIRECT_URLS = new Set([
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "https://localhost:8080",
    "https://127.0.0.1:8080"
]);

function normalizeBotUrl(url: string | undefined): string {
    const trimmed = (url ?? "").trim().replace(/\/+$/, "");
    return LEGACY_DIRECT_URLS.has(trimmed) ? "" : (url ?? "");
}

/** 从 sessionStorage 读取本次会话内各机器人的密码 */
function loadPasswords(): Record<string, string> {
    try {
        return JSON.parse(sessionStorage.getItem(SS_PASSWORDS) ?? "{}");
    } catch {
        return {};
    }
}

interface AuthState {
    bots: BotConfig[];
    activeBotId: string | null;
    loggedIn: boolean;
}

function loadBots(): BotConfig[] {
    try {
        const stored: BotConfig[] = JSON.parse(localStorage.getItem(LS_BOTS) ?? "[]");
        const passwords = loadPasswords();
        let migrated = false;
        const next = stored.map((b) => {
            const url = normalizeBotUrl(b.url);
            if (url !== b.url) migrated = true;
            // 密码从会话存储补充；跨浏览器会话(无 sessionStorage)时为 "",需重新登录
            return { ...b, url, password: passwords[b.botId] ?? "" };
        });
        // 规整后回写，卡片显示与后续请求都走同源
        if (migrated) {
            localStorage.setItem(
                LS_BOTS,
                JSON.stringify(next.map((b) => ({ ...b, password: "" })))
            );
        }
        return next;
    } catch {
        return [];
    }
}

export const authStore = reactive<AuthState>({
    bots: loadBots(),
    activeBotId: localStorage.getItem(LS_ACTIVE),
    loggedIn: false
});

export function activeBot(): BotConfig | undefined {
    return authStore.bots.find((b) => b.botId === authStore.activeBotId);
}

export function saveBots(bots: BotConfig[]) {
    authStore.bots = bots;
    // 密码只写 sessionStorage；localStorage 仅存元数据(密码恒为空串)，避免明文落盘
    const pwMap: Record<string, string> = {};
    for (const b of bots) {
        if (b.password) pwMap[b.botId] = b.password;
    }
    sessionStorage.setItem(SS_PASSWORDS, JSON.stringify(pwMap));
    localStorage.setItem(LS_BOTS, JSON.stringify(bots.map((b) => ({ ...b, password: "" }))));
}

/** 生成唯一机器人 ID：Date.now() 在同一毫秒内会冲突（连续添加两个机器人会互相覆盖） */
function newBotId(): string {
    try {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
            return `bot_${crypto.randomUUID()}`;
        }
    } catch {
        /* 降级 */
    }
    return `bot_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function addBot(bot: Omit<BotConfig, "botId">): BotConfig {
    const newBot: BotConfig = { ...bot, botId: newBotId() };
    saveBots([...authStore.bots, newBot]);
    return newBot;
}

export function updateBot(bot: BotConfig) {
    saveBots(authStore.bots.map((b) => (b.botId === bot.botId ? bot : b)));
}

export function removeBot(botId: string) {
    clearStoredRefreshToken(botId);
    saveBots(authStore.bots.filter((b) => b.botId !== botId));
    if (authStore.activeBotId === botId) {
        // 删除的是当前机器人时,必须同时断开客户端并登出,否则界面停留在"假登录"状态
        authStore.activeBotId = null;
        authStore.loggedIn = false;
        setActiveClient(null);
        localStorage.removeItem(LS_ACTIVE);
    }
}

export async function connectBot(botId: string): Promise<void> {
    const bot = authStore.bots.find((b) => b.botId === botId);
    if (!bot) throw new Error("机器人不存在");
    // 切换机器人前停止旧 WebSocket，避免旧机器人的推送触发对新机器人的误刷新/误提示
    stopAllWs();
    const client = new BotApiClient(bot);
    if (bot.password) {
        // 有密码(本会话输入过) → 正常登录
        await client.login();
    } else if (getStoredRefreshToken(botId)) {
        // 无密码但有持久化 refresh token(≤30 天) → 免密恢复会话
        const ok = await client.resume();
        if (!ok) throw new Error("登录已过期，请重新输入密码");
    } else {
        throw new Error("请输入密码登录");
    }
    setActiveClient(client);
    authStore.activeBotId = botId;
    authStore.loggedIn = true;
    localStorage.setItem(LS_ACTIVE, botId);
}

export function disconnect() {
    stopAllWs();
    // 断开时清除 active bot 的持久化 refresh token(用户主动登出 = 不再记住)
    if (authStore.activeBotId) clearStoredRefreshToken(authStore.activeBotId);
    logoutActiveClient();
    setActiveClient(null);
    authStore.loggedIn = false;
    authStore.activeBotId = null;
    localStorage.removeItem(LS_ACTIVE);
}

/** 启动时尝试恢复上次会话：优先持久化 refresh token 免密恢复，其次 sessionStorage 密码 */
export async function restoreSession(): Promise<boolean> {
    if (!authStore.activeBotId) return false;
    try {
        await connectBot(authStore.activeBotId);
        return true;
    } catch {
        disconnect();
        return false;
    }
}

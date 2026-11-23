/**
 * freqtrade REST API 客户端
 * - Basic 登录换取 JWT（access + refresh）
 * - 401 时自动用 refresh_token 续期并重放请求
 *
 * 说明：本文件是通用 HTTP 客户端，泛型默认值保持 any 是有意为之——
 * 调用方（视图/组合式函数）负责用 src/api/types.ts 的响应类型显式标注。
 * eslint-disable @typescript-eslint/no-explicit-any
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { markConnectionLost, markConnectionOk } from "@/stores/connection";
export interface BotConfig {
    botId: string;
    botName: string;
    url: string;
    /** 回测等 webserver 专属端点的独立地址（freqtrade trade 模式不挂载这些接口），留空则与 url 相同 */
    backtestUrl?: string;
    user: string;
    password: string;
}

interface TokenPair {
    access_token: string;
    refresh_token: string | null;
}

export class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

export class BotApiClient {
    readonly bot: BotConfig;
    private accessToken = "";
    private refreshToken: string | null = null;
    /** 401 刷新后等待重放的请求队列 */
    private refreshPromise: Promise<boolean> | null = null;

    constructor(bot: BotConfig) {
        this.bot = bot;
    }

    get baseUrl(): string {
        return this.bot.url.replace(/\/+$/, "");
    }

    get btBaseUrl(): string {
        return (this.bot.backtestUrl?.trim() || this.bot.url).replace(/\/+$/, "");
    }

    async login(): Promise<void> {
        const basic = btoa(`${this.bot.user}:${this.bot.password}`);
        let res: Response;
        try {
            res = await fetch(`${this.baseUrl}/api/v1/token/login`, {
                method: "POST",
                headers: { Authorization: `Basic ${basic}` }
            });
            markConnectionOk();
        } catch (e) {
            markConnectionLost(e);
            throw e;
        }
        if (!res.ok) {
            throw new ApiError(
                res.status,
                res.status === 401 ? "用户名或密码错误" : `登录失败 (${res.status})`
            );
        }
        const data: TokenPair = await res.json();
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token ?? null;
    }

    private async refresh(): Promise<boolean> {
        if (!this.refreshToken) return false;
        if (!this.refreshPromise) {
            this.refreshPromise = (async () => {
                try {
                    const res = await fetch(`${this.baseUrl}/api/v1/token/refresh`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${this.refreshToken}` }
                    });
                    if (!res.ok) {
                        if (res.status === 401) sessionExpiredHandler?.();
                        return false;
                    }
                    const data = await res.json();
                    this.accessToken = data.access_token;
                    return true;
                } catch {
                    return false;
                } finally {
                    this.refreshPromise = null;
                }
            })();
        }
        return this.refreshPromise;
    }

    get wsToken(): string {
        return this.accessToken;
    }

    /** 供 WebSocket 在鉴权失败(401/4401)后主动刷新 token 再重连 */
    async refreshAccessToken(): Promise<boolean> {
        return this.refresh();
    }

    /**
     * 通用请求（JSON）。401 时自动刷新重放一次。
     * base 传 btBaseUrl 时访问 webserver 服务——两者共用同一份 config.json
     * （同一 jwt_secret_key），token 互相通用，无需二次登录。
     */
    private async requestTo<T = any>(
        base: string,
        path: string,
        opts: RequestInit = {}
    ): Promise<T> {
        const doFetch = () =>
            fetch(`${base}${path}`, {
                ...opts,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.accessToken}`,
                    ...(opts.headers ?? {})
                }
            });

        // 网络层失败标记连接中断（App 顶部展示提示），成功则恢复
        const tryFetch = async () => {
            try {
                const r = await doFetch();
                markConnectionOk();
                return r;
            } catch (e) {
                markConnectionLost(e);
                throw e;
            }
        };

        let res = await tryFetch();
        if (res.status === 401) {
            const ok = await this.refresh();
            if (ok) res = await tryFetch();
        }
        if (!res.ok) {
            let detail = `请求失败 (${res.status})`;
            try {
                const body = await res.json();
                detail =
                    typeof body?.detail === "string"
                        ? body.detail
                        : JSON.stringify(body?.detail ?? body);
            } catch {
                /* ignore */
            }
            throw new ApiError(res.status, detail);
        }
        if (res.status === 204) return {} as T;
        return res.json() as Promise<T>;
    }

    request<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
        return this.requestTo<T>(this.baseUrl, path, opts);
    }
    /** 面向回测/webserver 服务的请求 */
    btRequest<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
        return this.requestTo<T>(this.btBaseUrl, path, opts);
    }

    get<T = any>(path: string): Promise<T> {
        return this.request<T>(path);
    }
    post<T = any>(path: string, body?: unknown): Promise<T> {
        return this.request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
    }
    delete<T = any>(path: string, body?: unknown): Promise<T> {
        return this.request<T>(path, { method: "DELETE", body: JSON.stringify(body ?? {}) });
    }
    btGet<T = any>(path: string): Promise<T> {
        return this.btRequest<T>(path);
    }
    btPost<T = any>(path: string, body?: unknown): Promise<T> {
        return this.btRequest<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
    }
}

/** 当前激活客户端（由 auth store 管理） */
let activeClient: BotApiClient | null = null;

export function setActiveClient(client: BotApiClient | null) {
    activeClient = client;
}
export function getClient(): BotApiClient {
    if (!activeClient) throw new ApiError(0, "未连接机器人");
    return activeClient;
}
export function hasClient(): boolean {
    return activeClient !== null;
}

/** 会话失效回调：refresh token 过期且刷新返回 401 时触发，由应用层负责登出并跳转 */
let sessionExpiredHandler: (() => void) | null = null;
export function setSessionExpiredHandler(fn: (() => void) | null) {
    sessionExpiredHandler = fn;
}

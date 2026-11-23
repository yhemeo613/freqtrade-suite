import { getClient, hasClient } from "./client";

/** WebSocket 推送负载（服务端 data 字段；已知字段显式声明，其余按需读取） */
export interface WsPayload {
    pair?: string;
    profit_ratio?: number;
    [key: string]: unknown;
}

export type WsHandler = (topic: string, data: WsPayload) => void;

/** 全局 WS 实例注册表：切换/断开机器人时统一停止旧连接，避免旧机器人的推送触发对新机器人的刷新 */
const instances = new Set<FreqWs>();

export function stopAllWs() {
    for (const ws of instances) ws.stop();
    instances.clear();
}

/**
 * 推导 WebSocket 地址（纯函数，便于单测）：
 * - API 地址为空时按当前页面同源推导（Nginx 分流，https 页面自动用 wss）
 * - 显式 API 地址时把 http(s) 前缀替换为 ws(s)
 */
export function deriveWsUrl(
    apiBaseUrl: string,
    page: { protocol: string; host: string },
    token: string
): string {
    const base = apiBaseUrl
        ? apiBaseUrl.replace(/^http/, "ws")
        : `${page.protocol === "https:" ? "wss:" : "ws:"}//${page.host}`;
    return `${base}/api/v1/message/ws?token=${token}`;
}

/**
 * freqtrade WebSocket 封装（/api/v1/message/ws?token=）
 * 自动重连（指数退避，上限 60s）；连接期间 REST 轮询作为兜底。
 */
export class FreqWs {
    private ws: WebSocket | null = null;
    private stopped = false;
    private retry = 0;
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(private handlers: WsHandler[]) {
        instances.add(this);
    }

    start() {
        this.stopped = false;
        this.connect();
    }

    stop() {
        this.stopped = true;
        if (this.timer) clearTimeout(this.timer);
        this.ws?.close();
        this.ws = null;
        instances.delete(this);
    }

    private connect() {
        if (this.stopped || !hasClient()) return;
        const client = getClient();
        const wsUrl = deriveWsUrl(client.baseUrl, location, client.wsToken);
        try {
            this.ws = new WebSocket(wsUrl);
        } catch {
            this.scheduleRetry();
            return;
        }
        this.ws.onopen = () => {
            this.retry = 0;
        };
        this.ws.onmessage = (ev) => {
            try {
                const payload = JSON.parse(ev.data);
                for (const h of this.handlers) h(payload.type, payload.data);
            } catch {
                /* 忽略非 JSON 帧 */
            }
        };
        this.ws.onclose = (ev) => {
            if (this.stopped) return;
            // 鉴权失败码(401/4401/1008):先刷新 token 再重连,否则退避会因同一过期 token 永久劣化
            if (ev.code === 4401 || ev.code === 4001 || ev.code === 1008) {
                void this.refreshAndReconnect();
                return;
            }
            this.scheduleRetry();
        };
        this.ws.onerror = () => this.ws?.close();
    }

    private async refreshAndReconnect() {
        try {
            const ok = await getClient().refreshAccessToken();
            if (ok) {
                this.retry = 0;
                this.connect();
                return;
            }
        } catch {
            /* 刷新异常按普通退避处理 */
        }
        this.scheduleRetry();
    }

    private scheduleRetry() {
        const delay = Math.min(1000 * 2 ** this.retry++, 60_000);
        this.timer = setTimeout(() => this.connect(), delay);
    }
}

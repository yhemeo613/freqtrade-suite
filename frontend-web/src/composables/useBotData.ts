import { ref, onUnmounted, watch } from "vue";
import { getClient, hasClient } from "@/api/client";
import { settingsStore } from "@/stores/settings";
import { toast } from "vue-sonner";

/**
 * 定时轮询 freqtrade API。组件卸载自动停止。
 *
 * 额外优化：
 * - 页面切到后台(document.hidden)时暂停计时器，避免无意义请求；回到前台立即刷新一次并恢复轮询
 * - 单飞：上一次轮询未返回时跳过本次，避免接口变慢时请求越堆越多
 * - 跟随设置页的刷新间隔即时生效（显式传入 intervalMs 的页面不受全局设置影响）
 */
export function usePolling(fn: () => Promise<void>, intervalMs?: number) {
    let timer: ReturnType<typeof setInterval> | null = null;
    // 单飞守卫：只约束定时器触发的轮询，手动 refresh 仍然立即执行
    let inFlight = false;
    const paused = ref(false);

    async function run() {
        try {
            await fn();
        } catch (e: unknown) {
            console.warn("poll error:", e instanceof Error ? e.message : e);
        }
    }

    async function tick() {
        if (paused.value || inFlight || !hasClient() || document.hidden) return;
        inFlight = true;
        try {
            await run();
        } finally {
            inFlight = false;
        }
    }

    function currentInterval() {
        return intervalMs ?? settingsStore.refreshIntervalMs;
    }
    function startTimer() {
        if (timer) return;
        timer = setInterval(tick, currentInterval());
    }
    function stopTimer() {
        if (timer) clearInterval(timer);
        timer = null;
    }
    function start() {
        void tick();
        startTimer();
    }
    function stop() {
        stopTimer();
    }

    function onVisibilityChange() {
        if (document.hidden) {
            stopTimer();
        } else {
            void tick();
            startTimer();
        }
    }

    // 设置页调整「数据刷新间隔」后，已挂载的页面立即按新间隔轮询，无需切页面重进
    const stopWatchInterval = watch(
        () => settingsStore.refreshIntervalMs,
        () => {
            if (intervalMs !== undefined) return; // 显式指定间隔的页面不受全局设置影响
            if (!timer) return; // 后台暂停期间不重建，回到前台时按新间隔启动
            stopTimer();
            startTimer();
        }
    );

    start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    onUnmounted(() => {
        stopTimer();
        stopWatchInterval();
        document.removeEventListener("visibilitychange", onVisibilityChange);
    });
    return { refresh: run, stop, paused };
}

/* ---------- 常用 API 封装 ---------- */

export const api = {
    status: (ids?: number[]) =>
        getClient().get(`/api/v1/status${ids?.length ? `?tradeids=${ids.join(",")}` : ""}`),
    trades: (limit = 20) => getClient().get(`/api/v1/trades?limit=${limit}`),
    balance: () => getClient().get("/api/v1/balance"),
    profit: () => getClient().get("/api/v1/profit"),
    daily: (timescale = 14) => getClient().get(`/api/v1/daily?timescale=${timescale}`),
    whitelist: () => getClient().get("/api/v1/whitelist"),
    blacklist: () => getClient().get("/api/v1/blacklist"),
    logs: (limit = 50) => getClient().get(`/api/v1/logs?limit=${limit}`),
    showConfig: () => getClient().get("/api/v1/show_config"),
    ping: () => getClient().get("/api/v1/ping"),
    pairCandles: (pair: string, timeframe: string, limit = 500) =>
        getClient().post("/api/v1/pair_candles", { pair, timeframe, limit }),
    start: () => getClient().post("/api/v1/start"),
    stop: () => getClient().post("/api/v1/stop"),
    pause: () => getClient().post("/api/v1/pause"),
    reloadConfig: () => getClient().post("/api/v1/reload_config"),
    forceExit: (tradeId: string | number) =>
        getClient().post("/api/v1/forceexit", { tradeid: String(tradeId) }),
    performance: () => getClient().get("/api/v1/performance"),
    entryTags: () => getClient().get("/api/v1/entries"),
    exitReasons: () => getClient().get("/api/v1/exits"),
    locks: () => getClient().get("/api/v1/locks"),
    /* ---- webserver 专属端点（trade 模式不挂载，走独立回测地址） ----
     * 完整清单见 freqtrade webserver.py：api_webserver / api_backtest /
     * api_background_tasks / api_pair_history / api_pairlists /
     * api_download_data / api_analysis 七个路由文件下的全部端点 */
    downloadData: (payload: Record<string, unknown>) =>
        getClient().btPost("/api/v1/download_data", payload),
    pairLists: () => getClient().btGet("/api/v1/pairlists/available"),
    availablePairs: () => getClient().btGet("/api/v1/available_pairs"),
    backtest: (payload: Record<string, unknown>) => getClient().btPost("/api/v1/backtest", payload),
    backtestHistory: () => getClient().btGet("/api/v1/backtest/history"),
    /* ---- 对齐 FreqUI：交易管理 ---- */
    deleteTrade: (id: number | string) => getClient().delete(`/api/v1/trades/${id}`),
    cancelOpenOrder: (id: number | string) => getClient().delete(`/api/v1/trades/${id}/open-order`),
    reloadTrade: (id: number | string) => getClient().post(`/api/v1/trades/${id}/reload`),
    tradeCustomData: (id: number | string) => getClient().get(`/api/v1/trades/${id}/custom-data`),
    deleteLock: (id: number | string) => getClient().delete(`/api/v1/locks/${id}`),
    mixTags: () => getClient().get("/api/v1/mix_tags"),
    forceEntry: (pair: string, side: "long" | "short", price?: number) =>
        getClient().post(side === "short" ? "/api/v1/forceshort" : "/api/v1/forcebuy", {
            pair,
            price
        }),
    /* ---- 对齐 FreqUI：元数据与系统 ---- */
    exchanges: () => getClient().btGet("/api/v1/exchanges"),
    plotConfig: () => getClient().get("/api/v1/plot_config"),
    /* ---- 对齐 FreqUI：高级分析（webserver 模式）---- */
    recursiveAnalysis: (payload: Record<string, unknown>) =>
        getClient().btPost("/api/v1/recursive_analysis", payload),
    recursiveAnalysisGet: (jobId: string) =>
        getClient().btGet(`/api/v1/recursive_analysis/${jobId}`),
    lookaheadAnalysis: (payload: Record<string, unknown>) =>
        getClient().btPost("/api/v1/lookahead_analysis", payload),
    lookaheadAnalysisGet: (jobId: string) =>
        getClient().btGet(`/api/v1/lookahead_analysis/${jobId}`),
    /* ---- 对齐 FreqUI：回测深度分析 ---- */
    backtestHistoryResult: (filename: string, strategy: string) =>
        getClient().btGet(
            `/api/v1/backtest/history/result?filename=${encodeURIComponent(filename)}&strategy=${encodeURIComponent(strategy)}`
        ),
    backtestPairHistory: (filename: string, strategy: string, pair: string, timeframe: string) =>
        getClient().btPost(
            `/api/v1/backtest/history/${encodeURIComponent(filename)}/${encodeURIComponent(strategy)}/pair_history`,
            { pair, timeframe, timerange: undefined }
        )
};

/** 安全执行 API 调用并 toast 错误 */
export async function runApi<T>(fn: () => Promise<T>, silent = false): Promise<T | undefined> {
    try {
        return await fn();
    } catch (e: unknown) {
        if (!silent) toast.error(e instanceof Error ? e.message : "请求失败");
        return undefined;
    }
}

import type { Order } from "@/api/types";

/** 类型（按 freqtrade API 返回结构，够用即可） */
export interface Trade {
    trade_id: number;
    pair: string;
    is_short: boolean;
    leverage?: number;
    stake_amount: number;
    amount: number;
    open_rate: number;
    close_rate?: number | null;
    current_rate?: number;
    profit_ratio?: number;
    profit_abs?: number;
    realized_profit?: number;
    total_profit_abs?: number;
    exit_reason?: string;
    enter_tag?: string;
    open_date: string;
    close_date?: string;
    is_open: boolean;
    nr_of_successful_entries?: number;
    orders?: Order[];
    stop_loss_abs?: number;
    liquidation_price?: number | null;
}

export interface DailyItem {
    date: string;
    abs_profit: number;
    rel_profit: number;
    trade_count: number;
}

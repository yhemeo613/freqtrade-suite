<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { PullRefresh, Cell, CellGroup, Empty } from "vant";
import {
    createChart,
    AreaSeries,
    ColorType,
    type IChartApi,
    type ISeriesApi,
    type Time
} from "lightweight-charts";
import { api, runApi, usePolling } from "@/composables/useBotData";
import { getClient } from "@/api/client";
import { settingsStore } from "@/stores/settings";
import { fmtCoin, fmtPct, profitColor, fmtDate, parseDate } from "@/lib/format";
import type { ProfitResponse, BalanceResponse, DailyRecord } from "@/api/types";

const loading = ref(true);
const refreshing = ref(false);
const profit = ref<ProfitResponse | null>(null);
const balance = ref<BalanceResponse | null>(null);
const daily = ref<DailyRecord[]>([]);
const stake = ref("USDT");

const walletEl = ref<HTMLElement | null>(null);
let walletChart: IChartApi | null = null;
let walletSeries: ISeriesApi<"Area"> | null = null;
let pollCount = 0;

function walletOpts() {
    const dark = settingsStore.theme === "dark";
    return {
        layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: dark ? "#9ca3af" : "#6b7280"
        },
        grid: {
            vertLines: { color: "transparent" },
            horzLines: { color: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }
        },
        timeScale: { timeVisible: false, secondsVisible: false },
        height: 200,
        autoSize: true
    };
}

async function loadWalletCurve() {
    const res = await runApi(() => getClient().get("/api/v1/historic_balance"), true);
    if (!res || !res.data?.length || !walletEl.value) return;
    const cols: string[] = res.columns;
    const iDate = cols.indexOf("date");
    const iTotal = cols.lastIndexOf("total");
    if (iDate < 0 || iTotal < 0) return;
    walletChart = walletChart ?? createChart(walletEl.value as HTMLElement, walletOpts());
    walletSeries =
        walletSeries ??
        walletChart.addSeries(AreaSeries, {
            lineColor: "#38bdf8",
            topColor: "rgba(56,189,248,0.35)",
            bottomColor: "rgba(56,189,248,0.02)",
            lineWidth: 2
        });
    walletSeries.setData(
        res.data
            .filter(
                (r: (string | number | null)[]) => r[iTotal] !== null && r[iTotal] !== undefined
            )
            .map((r: (string | number | null)[]) => ({
                time: ((parseDate(r[iDate])?.getTime() ?? 0) / 1000) as Time,
                value: r[iTotal] as number
            }))
    );
    walletChart.timeScale().fitContent();
}

async function load() {
    const [p, b, d] = await Promise.all([
        runApi(() => api.profit(), true),
        runApi(() => api.balance(), true),
        runApi(() => api.daily(7), true)
    ]);
    if (p) profit.value = p;
    if (b) balance.value = b;
    if (d) daily.value = [...(d.data ?? [])].reverse();
    loading.value = false;
    refreshing.value = false;
    if (++pollCount % 6 === 0) void loadWalletCurve();
}

async function onRefresh() {
    await load();
    await loadWalletCurve();
    refreshing.value = false;
}

onMounted(() => void loadWalletCurve());
onUnmounted(() => {
    walletChart?.remove();
    walletChart = null;
    walletSeries = null;
});
watch(
    () => settingsStore.theme,
    () => walletChart?.applyOptions(walletOpts())
);

usePolling(load);

const maxDaily = () => Math.max(...daily.value.map((x) => Math.abs(x.abs_profit)), 0.0001);
</script>

<template>
    <PullRefresh v-model="refreshing" class="min-h-[70vh]" @refresh="onRefresh">
        <!-- 摘要 2x2 -->
        <div class="grid grid-cols-2 gap-3 p-3">
            <div class="rounded-xl bg-white p-3 shadow-sm">
                <div class="text-xs text-gray-500">账户总值</div>
                <div class="mt-1 text-lg font-bold tabular-nums">
                    {{
                        balance
                            ? fmtCoin(balance.total ?? balance.value, balance.stake ?? stake)
                            : "—"
                    }}
                </div>
                <div class="mt-0.5 text-[11px] text-gray-400">
                    起始
                    {{ balance ? fmtCoin(balance.starting_capital, balance.stake ?? stake) : "—" }}
                </div>
            </div>
            <div class="rounded-xl bg-white p-3 shadow-sm">
                <div class="text-xs text-gray-500">已实现盈亏</div>
                <div
                    class="mt-1 text-lg font-bold tabular-nums"
                    :class="profitColor(profit?.profit_closed_coin)"
                >
                    {{ profit ? fmtCoin(profit.profit_closed_coin, stake) : "—" }}
                </div>
                <div class="mt-0.5 text-[11px] text-gray-400">
                    {{
                        profit
                            ? `${fmtPct(profit.profit_closed_ratio_mean)} · ${profit.closed_trade_count ?? 0} 笔`
                            : "—"
                    }}
                </div>
            </div>
            <div class="rounded-xl bg-white p-3 shadow-sm">
                <div class="text-xs text-gray-500">胜率</div>
                <div class="mt-1 text-lg font-bold tabular-nums">
                    {{ profit ? `${(profit.winrate * 100).toFixed(1)}%` : "—" }}
                </div>
                <div class="mt-0.5 text-[11px] text-gray-400">
                    {{ profit ? `胜 ${profit.winning_trades} / 负 ${profit.losing_trades}` : "—" }}
                </div>
            </div>
            <div class="rounded-xl bg-white p-3 shadow-sm">
                <div class="text-xs text-gray-500">浮动盈亏</div>
                <div
                    class="mt-1 text-lg font-bold tabular-nums"
                    :class="profitColor(profit?.profit_all_coin)"
                >
                    {{ profit ? fmtCoin(profit.profit_all_coin, stake) : "—" }}
                </div>
                <div class="mt-0.5 text-[11px] text-gray-400">
                    {{ profit ? fmtPct(profit.profit_all_ratio_mean) : "—" }}
                </div>
            </div>
        </div>

        <!-- 资产曲线 -->
        <div class="mx-3 rounded-xl bg-white p-3 shadow-sm">
            <div class="mb-1 flex items-center justify-between">
                <span class="text-sm font-semibold">资产曲线</span>
                <span class="text-[11px] text-gray-400">全部历史</span>
            </div>
            <div ref="walletEl" class="h-48 w-full" />
            <div v-if="loading" class="py-2 text-center text-xs text-gray-400">加载中…</div>
        </div>

        <!-- 每日收益 -->
        <CellGroup inset title="每日收益（近 7 天）" class="!mt-3">
            <Cell v-for="d in daily" :key="d.date">
                <template #title>
                    <span class="text-sm text-gray-600">{{ d.date }}</span>
                    <span v-if="d.trade_count" class="ml-1 text-[11px] text-gray-400"
                        >{{ d.trade_count }} 笔</span
                    >
                </template>
                <template #value>
                    <div class="flex items-center gap-2">
                        <div class="h-1.5 w-16 overflow-hidden rounded bg-gray-100">
                            <div
                                class="h-full rounded"
                                :class="d.abs_profit >= 0 ? 'bg-green-500' : 'bg-red-500'"
                                :style="{
                                    width: `${(Math.abs(d.abs_profit) / maxDaily()) * 100}%`
                                }"
                            />
                        </div>
                        <span
                            class="text-sm font-medium tabular-nums"
                            :class="profitColor(d.abs_profit)"
                        >
                            {{ fmtCoin(d.abs_profit, stake) }}
                        </span>
                    </div>
                </template>
            </Cell>
            <Empty
                v-if="!daily.length && !loading"
                image="search"
                description="暂无数据"
                class="py-6"
            />
        </CellGroup>

        <div v-if="profit" class="px-4 pb-6 pt-2 text-center text-[11px] text-gray-400">
            机器人启动于 {{ fmtDate(profit.first_trade_date) }}
        </div>
    </PullRefresh>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, TrendingUp, Trophy, Percent } from "lucide-vue-next";
import { api, runApi, usePolling } from "@/composables/useBotData";
import { getClient } from "@/api/client";
import { settingsStore } from "@/stores/settings";
import {
    createChart,
    AreaSeries,
    ColorType,
    type IChartApi,
    type ISeriesApi,
    type Time
} from "lightweight-charts";
import { fmtCoin, fmtPct, profitColor, fmtDate, parseDate, findTotalColumn } from "@/lib/format";
import type { ProfitResponse, BalanceResponse, DailyRecord } from "@/api/types";

const loading = ref(true);
const profit = ref<ProfitResponse | null>(null);
const walletEl = ref<HTMLElement | null>(null);
let walletChart: IChartApi | null = null;
let walletSeries: ISeriesApi<"Area"> | null = null;
const balance = ref<BalanceResponse | null>(null);
const daily = ref<DailyRecord[]>([]);
const stake = ref("USDT");
// 资产曲线每次轮询都拉取偏重，改为约每 60 秒（6 次轮询）刷新一次
let pollCount = 0;

async function load() {
    const [p, b, d] = await Promise.all([
        runApi(() => api.profit(), true),
        runApi(() => api.balance(), true),
        runApi(() => api.daily(14), true)
    ]);
    if (p) profit.value = p;
    if (b) balance.value = b;
    if (d) daily.value = [...(d.data ?? [])].reverse();
    loading.value = false;
    if (++pollCount % 6 === 0) void loadWalletCurve();
}

function walletChartOptions() {
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
        timeScale: { timeVisible: true, secondsVisible: false },
        height: 220,
        autoSize: true
    };
}

async function loadWalletCurve() {
    const res = await runApi(() => getClient().get("/api/v1/historic_balance"), true);
    if (!res || !res.data?.length || !walletEl.value) return;
    const cols: string[] = res.columns;
    const iDate = cols.indexOf("date");
    // 期货返回 total_quote、现货/旧版返回 total（精确匹配 total 会漏掉前者）
    const iTotal = findTotalColumn(cols);
    if (iDate < 0 || iTotal < 0) return;
    walletChart = walletChart ?? createChart(walletEl.value as HTMLElement, walletChartOptions());
    walletSeries =
        walletSeries ??
        walletChart.addSeries(AreaSeries, {
            lineColor: "#38bdf8",
            topColor: "rgba(56,189,248,0.35)",
            bottomColor: "rgba(56,189,248,0.02)",
            lineWidth: 2
        });
    const series = walletSeries;
    series.setData(
        res.data
            .filter(
                (r: (string | number | null)[]) => r[iTotal] !== null && r[iTotal] !== undefined
            )
            .map((r: (string | number | null)[]) => ({
                time: ((parseDate(r[iDate])?.getTime() ?? 0) / 1000) as Time,
                value: r[iTotal] as number
            }))
    );
}

onMounted(() => void loadWalletCurve());

// 离开页面时销毁图表实例,避免 lightweight-charts 的 ResizeObserver 泄漏
onUnmounted(() => {
    walletChart?.remove();
    walletChart = null;
    walletSeries = null;
});

// 切换亮/暗色时同步资产曲线配色（与 ChartsView 行为一致，避免亮色下文字不可读）
watch(
    () => settingsStore.theme,
    () => walletChart?.applyOptions(walletChartOptions())
);

usePolling(load);

const maxAbs = () => Math.max(...daily.value.map((x) => Math.abs(x.abs_profit)), 0.0001);
</script>

<template>
    <div class="space-y-3">
        <!-- 摘要卡片 -->
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card
                v-for="c in [
                    {
                        label: '账户总值',
                        icon: Wallet,
                        value: balance
                            ? fmtCoin(balance.total ?? balance.value, balance.stake ?? stake)
                            : '',
                        sub: `起始 ${balance ? fmtCoin(balance.starting_capital, balance.stake ?? stake) : '—'}`
                    },
                    {
                        label: '已实现盈亏',
                        icon: TrendingUp,
                        value: profit ? fmtCoin(profit.profit_closed_coin, stake) : '',
                        sub: profit
                            ? `${fmtPct(profit.profit_closed_ratio_mean)} · ${profit.closed_trade_count ?? 0} 笔平仓`
                            : ''
                    },
                    {
                        label: '胜率',
                        icon: Trophy,
                        value: profit ? `${(profit.winrate * 100).toFixed(1)}%` : '',
                        sub: profit
                            ? `胜 ${profit.winning_trades} / 负 ${profit.losing_trades}`
                            : ''
                    },
                    {
                        label: '浮动盈亏',
                        icon: Percent,
                        value: profit ? fmtCoin(profit.profit_all_coin, stake) : '',
                        sub: profit ? `含持仓 ${fmtPct(profit.profit_all_ratio_mean)}` : ''
                    }
                ]"
                :key="c.label"
            >
                <CardHeader class="pb-1">
                    <CardDescription class="flex items-center gap-1.5 text-xs">
                        <component :is="c.icon" class="size-3.5" />{{ c.label }}
                    </CardDescription>
                    <CardTitle class="text-xl tabular-nums">
                        <Skeleton v-if="loading && !c.value" class="h-7 w-24" />
                        <template v-else>{{ c.value }}</template>
                    </CardTitle>
                </CardHeader>
                <CardContent class="pb-3">
                    <p class="text-xs text-muted-foreground">{{ c.sub }}</p>
                </CardContent>
            </Card>
        </div>

        <!-- 每日收益 -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-base">每日收益（近 14 天）</CardTitle>
                <CardDescription v-if="profit"
                    >机器人启动于 {{ fmtDate(profit.first_trade_date) }}</CardDescription
                >
            </CardHeader>
            <CardContent>
                <div v-if="daily.length" class="space-y-1.5">
                    <div v-for="d in daily" :key="d.date" class="flex items-center gap-3 text-sm">
                        <span class="w-24 shrink-0 text-muted-foreground">{{ d.date }}</span>
                        <div class="relative h-5 flex-1 overflow-hidden rounded bg-muted/50">
                            <div
                                class="absolute top-0 h-full rounded"
                                :class="
                                    d.abs_profit >= 0
                                        ? 'bg-success/70 left-1/2'
                                        : 'bg-destructive/70 right-1/2'
                                "
                                :style="{ width: `${(Math.abs(d.abs_profit) / maxAbs()) * 50}%` }"
                            />
                            <div class="absolute left-1/2 top-0 h-full w-px bg-border" />
                        </div>
                        <span
                            class="w-28 shrink-0 text-right tabular-nums"
                            :class="profitColor(d.abs_profit)"
                        >
                            {{ fmtCoin(d.abs_profit, stake) }}
                        </span>
                        <Badge
                            v-if="d.trade_count"
                            variant="secondary"
                            class="w-14 justify-center shrink-0"
                        >
                            {{ d.trade_count }} 笔
                        </Badge>
                        <span v-else class="w-14 shrink-0" />
                    </div>
                </div>
                <Skeleton v-else-if="loading" class="h-40 w-full" />
                <div v-else class="py-10 text-center text-sm text-muted-foreground">暂无数据</div>
            </CardContent>
        </Card>

        <!-- 资产曲线 -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-base">资产曲线</CardTitle>
                <CardDescription
                    >全部历史交易折合 {{ stake }} 的资产变化（含持仓估值）</CardDescription
                >
            </CardHeader>
            <CardContent>
                <div ref="walletEl" class="h-56 w-full" />
                <div v-if="loading" class="py-2 text-center text-xs text-muted-foreground">
                    加载中…
                </div>
            </CardContent>
        </Card>
    </div>
</template>

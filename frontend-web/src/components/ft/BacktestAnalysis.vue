<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { fmtPct, profitColor, parseDate } from "@/lib/format";
import { settingsStore } from "@/stores/settings";
import {
    createChart,
    CandlestickSeries,
    LineSeries,
    createSeriesMarkers,
    ColorType,
    CrosshairMode,
    type IChartApi,
    type ISeriesApi,
    type ISeriesMarkersPluginApi,
    type CandlestickData,
    type SeriesMarker,
    type Time
} from "lightweight-charts";
import { getClient } from "@/api/client";
import { runApi } from "@/composables/useBotData";
import type { MarketChange } from "@/api/types";

const props = defineProps<{
    filename: string;
    strategy: string;
    timeframe: string;
    pairs: string[];
}>();

/* ---------- pair history ---------- */
const pair = ref(props.pairs[0] ?? "");
const chartEl = ref<HTMLElement | null>(null);
let chart: IChartApi | null = null;
let candleSeries: ISeriesApi<"Candlestick"> | null = null;
// 标记插件复用，避免切换币对时重复叠加
let markersApi: ISeriesMarkersPluginApi<Time> | null = null;
const phLoading = ref(false);

function chartOpts() {
    // 与全局主题保持一致（settingsStore 是唯一事实来源，App.vue 切换时同步更新）
    const dark = settingsStore.theme === "dark";
    return {
        layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: dark ? "#9ca3af" : "#6b7280"
        },
        grid: {
            vertLines: { color: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" },
            horzLines: { color: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }
        },
        crosshair: { mode: CrosshairMode.Normal },
        timeScale: { timeVisible: true, secondsVisible: false },
        height: 380,
        autoSize: true
    };
}

function initChart() {
    if (!chartEl.value || chart) return;
    chart = createChart(chartEl.value as HTMLElement, chartOpts());
    candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderVisible: false,
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444"
    });
}

async function loadPairHistory() {
    if (!pair.value || !props.filename) return;
    phLoading.value = true;
    const res = await runApi(
        () => api_pairHistory(props.filename, props.strategy, pair.value, props.timeframe),
        true
    );
    phLoading.value = false;
    if (!res) return;
    await nextTick();
    initChart();
    const cols: string[] = res.columns;
    const rows = res.data as (string | number | null)[][];
    const iDate = cols.indexOf("date");
    const idx = (k: string) => cols.indexOf(k);
    candleSeries?.setData(
        rows.map((r) => ({
            time: ((parseDate(r[iDate])?.getTime() ?? 0) / 1000) as Time,
            open: r[idx("open")] as number,
            high: r[idx("high")] as number,
            low: r[idx("low")] as number,
            close: r[idx("close")] as number
        })) as CandlestickData<Time>[]
    );
    // 回测交易标记（来自数据列，若存在）
    const iTag = cols.indexOf("enter_tag");
    if (iTag >= 0) {
        const markers: SeriesMarker<Time>[] = [];
        for (const r of rows) {
            if (r[iTag]) {
                markers.push({
                    time: ((parseDate(r[iDate])?.getTime() ?? 0) / 1000) as Time,
                    position: "belowBar",
                    shape: "arrowUp",
                    color: "#38bdf8",
                    text: `入场 ${r[iTag]}`
                });
            }
            const iExit = cols.indexOf("exit_reason");
            if (iExit >= 0 && r[iExit]) {
                markers.push({
                    time: ((parseDate(r[iDate])?.getTime() ?? 0) / 1000) as Time,
                    position: "aboveBar",
                    shape: "circle",
                    color: "#f59e0b",
                    text: `平仓 ${r[iExit]}`
                });
            }
        }
        if (candleSeries) {
            if (markersApi) markersApi.setMarkers(markers);
            else markersApi = createSeriesMarkers(candleSeries, markers);
        }
    }
}

function api_pairHistory(filename: string, strategy: string, pair: string, timeframe: string) {
    return getClient().post(
        `/api/v1/backtest/history/${encodeURIComponent(filename)}/${encodeURIComponent(strategy)}/pair_history`,
        { pair, timeframe }
    );
}

/* ---------- wallet 曲线 ---------- */
const walletData = ref<Record<string, unknown>[]>([]);
const walletEl = ref<HTMLElement | null>(null);
let walletChart: IChartApi | null = null;
let walletSeries: ISeriesApi<"Line"> | null = null;

async function loadWallet() {
    const res = await runApi(
        () =>
            getClient().get(
                `/api/v1/backtest/history/${encodeURIComponent(props.filename)}/${encodeURIComponent(props.strategy)}/wallet`
            ),
        true
    );
    if (!res) return;
    walletData.value = (res.data ?? res ?? []) as Record<string, unknown>[];
    await nextTick();
    if (!walletEl.value) return;
    walletChart = walletChart ?? createChart(walletEl.value as HTMLElement, chartOpts());
    walletSeries =
        walletSeries ?? walletChart.addSeries(LineSeries, { color: "#38bdf8", lineWidth: 2 });
    const series = walletSeries;
    const rows = walletData.value;
    const first = rows[0];
    const dateKey = first?.date
        ? "date"
        : (Object.keys(first ?? {}).find((k) => /date|time/i.test(k)) ?? "");
    series.setData(
        rows
            .filter((r) => r[dateKey] && r.total !== undefined)
            .map((r) => ({
                time: ((parseDate(r[dateKey] as string)?.getTime() ?? 0) / 1000) as Time,
                value: r.total as number
            }))
    );
}

/* ---------- market change ---------- */
const marketChange = ref<MarketChange[]>([]);
const mcLoading = ref(false);

async function loadMarketChange() {
    mcLoading.value = true;
    const res = await runApi(
        () =>
            getClient().btGet(
                `/api/v1/backtest/history/${encodeURIComponent(props.filename)}/market_change`
            ),
        true
    );
    mcLoading.value = false;
    if (res) marketChange.value = res as MarketChange[];
}

watch(
    () => props.filename,
    () => {
        pair.value = props.pairs[0] ?? "";
        void loadWallet();
        void loadMarketChange();
    }
);
watch(pair, () => void loadPairHistory());

// 首次挂载即加载：上面的 watch 均为非 immediate，否则深度分析页初始为空
onMounted(() => {
    void loadPairHistory();
    void loadWallet();
    void loadMarketChange();
});

onUnmounted(() => {
    chart?.remove();
    walletChart?.remove();
    chart = null;
    walletChart = null;
    markersApi = null;
});

// 切换亮/暗色时同步两处图表配色（K 线图 + 钱包曲线），避免亮色下文字不可读
watch(
    () => settingsStore.theme,
    () => {
        chart?.applyOptions(chartOpts());
        walletChart?.applyOptions(chartOpts());
    }
);
</script>

<template>
    <div class="space-y-3">
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-base">回测交易图（{{ strategy }}）</CardTitle>
                <CardDescription>选择币对查看回测期间的 K 线与入场/出场标记</CardDescription>
            </CardHeader>
            <CardContent class="space-y-3">
                <Select v-model="pair">
                    <SelectTrigger class="w-48"
                        ><SelectValue placeholder="选择币对"
                    /></SelectTrigger>
                    <SelectContent class="max-h-64">
                        <SelectItem v-for="p in pairs" :key="p" :value="p">{{ p }}</SelectItem>
                    </SelectContent>
                </Select>
                <div ref="chartEl" class="h-[380px] w-full" />
                <p v-if="phLoading" class="text-xs text-muted-foreground">加载中…</p>
            </CardContent>
        </Card>

        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-base">钱包曲线</CardTitle>
                <CardDescription>回测期间账户总资产变化</CardDescription>
            </CardHeader>
            <CardContent>
                <div ref="walletEl" class="h-52 w-full" />
                <div
                    v-if="!walletData.length"
                    class="py-4 text-center text-sm text-muted-foreground"
                >
                    暂无钱包数据
                </div>
            </CardContent>
        </Card>

        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-base">市场变动评估</CardTitle>
                <CardDescription>假设市场整体涨跌时，策略收益的变化</CardDescription>
            </CardHeader>
            <CardContent>
                <Table v-if="marketChange.length">
                    <TableHeader>
                        <TableRow>
                            <TableHead>市场变动</TableHead>
                            <TableHead class="text-right">总收益%</TableHead>
                            <TableHead class="text-right">绝对收益</TableHead>
                            <TableHead class="text-right">交易数</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow v-for="(m, i) in marketChange" :key="i">
                            <TableCell>
                                <Badge
                                    :variant="
                                        (m.market_change ?? 0) >= 0 ? 'outline' : 'destructive'
                                    "
                                >
                                    {{ fmtPct(m.market_change) }}
                                </Badge>
                            </TableCell>
                            <TableCell
                                class="text-right tabular-nums font-medium"
                                :class="profitColor(m.profit_total)"
                            >
                                {{ fmtPct(m.profit_total) }}
                            </TableCell>
                            <TableCell
                                class="text-right tabular-nums"
                                :class="profitColor(m.profit_total_abs)"
                            >
                                {{ m.profit_total_abs }}
                            </TableCell>
                            <TableCell class="text-right tabular-nums">{{
                                m.total_trades
                            }}</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
                <div v-else-if="!mcLoading" class="py-4 text-center text-sm text-muted-foreground">
                    暂无数据（此功能需要 webserver 模式与历史回测文件）
                </div>
            </CardContent>
        </Card>
    </div>
</template>

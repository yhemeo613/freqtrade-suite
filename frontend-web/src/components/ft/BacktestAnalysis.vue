<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { fmtPct, profitColor, parseDate, findTotalColumn } from "@/lib/format";
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
import { runApi, type Trade as TradeRecord } from "@/composables/useBotData";

const props = defineProps<{
    filename: string;
    strategy: string;
    timeframe: string;
    pairs: string[];
    /** 回测成交记录: 入场/出场标记的数据源(df 列不含出场原因,必须用成交记录) */
    trades?: TradeRecord[];
}>();

/* ---------- pair history ---------- */
const pair = ref(props.pairs[0] ?? "");
const chartEl = ref<HTMLElement | null>(null);
let chart: IChartApi | null = null;
let candleSeries: ISeriesApi<"Candlestick"> | null = null;
// 标记插件复用，避免切换币对时重复叠加
let markersApi: ISeriesMarkersPluginApi<Time> | null = null;
const phLoading = ref(false);

function chartOpts(opts: { height?: number; timeVisible?: boolean } = {}) {
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
        timeScale: {
            // 曲线跨 30 天时只显示日期，避免时分标签挤在一起
            timeVisible: opts.timeVisible ?? true,
            secondsVisible: false,
            rightOffset: 8
        },
        height: opts.height ?? 380,
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

/** 钱包曲线专用配置:高度与容器 h-64(256px)一致,时间轴只显示日期 */
const walletChartOpts = () => chartOpts({ height: 256, timeVisible: false });

/**
 * 降采样:按固定时间桶取最后一个值。
 * 回测 30 天 5m 数据有 8000+ 点,原样塞进图表会只显示右端一小段(时间刻度密集、
 * 看不到整体变化);按小时聚合到 ~720 点后 fitContent,可看到完整资产走势。
 */
function downsamplePoints(
    rows: (string | number | null)[][],
    iDate: number,
    iValue: number,
    bucketMs: number
): { time: Time; value: number }[] {
    const buckets = new Map<number, number>();
    for (const r of rows) {
        if (r[iDate] == null || r[iValue] == null) continue;
        const t = parseDate(String(r[iDate]))?.getTime() ?? 0;
        if (!t) continue;
        buckets.set(Math.floor(t / bucketMs) * bucketMs, Number(r[iValue]));
    }
    return [...buckets.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([t, v]) => ({ time: (t / 1000) as Time, value: v }));
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
    // 回测成交标记：从成交记录构建(入场=蓝↑/橙↑,出场=●,盈亏着色)
    // 注意: df 的 enter_tag 列只在信号 K 线有值,exit_reason 列在回测 DataFrame 中不存在,
    // 出场标记必须来自成交记录(props.trades)
    applyTradeMarkers();
    // 显示回测区间全部 K 线,而不是只显示右端一小段
    chart?.timeScale().fitContent();
}

/** 从成交记录构建当前币对的入场/出场标记 */
function applyTradeMarkers() {
    if (!candleSeries) return;
    const tradeMarkers: SeriesMarker<Time>[] = [];
    for (const t of props.trades ?? []) {
        if (t.pair !== pair.value) continue;
        const openTs = (parseDate(t.open_date)?.getTime() ?? 0) / 1000;
        if (openTs) {
            tradeMarkers.push({
                time: openTs as Time,
                position: "belowBar",
                shape: "arrowUp",
                color: t.is_short ? "#f59e0b" : "#38bdf8",
                text: `入场 ${t.enter_tag ?? ""} ${t.leverage && t.leverage > 1 ? `${t.leverage}x` : ""}`.trim()
            });
        }
        const closeTs = (parseDate(t.close_date)?.getTime() ?? 0) / 1000;
        if (closeTs) {
            tradeMarkers.push({
                time: closeTs as Time,
                position: "aboveBar",
                shape: "circle",
                color: (t.profit_ratio ?? 0) >= 0 ? "#22c55e" : "#ef4444",
                text: `平仓 ${t.exit_reason ?? ""} ${(t.profit_ratio ?? 0) >= 0 ? "+" : ""}${((t.profit_ratio ?? 0) * 100).toFixed(2)}%`.trim()
            });
        }
    }
    tradeMarkers.sort((a, b) => (a.time as number) - (b.time as number));
    if (markersApi) markersApi.setMarkers(tradeMarkers);
    else markersApi = createSeriesMarkers(candleSeries, tradeMarkers);
}

// 成交记录更新或切换币对时,重建标记
watch([() => props.trades, pair], () => applyTradeMarkers());

function api_pairHistory(filename: string, strategy: string, pair: string, timeframe: string) {
    return getClient().post(
        `/api/v1/backtest/history/${encodeURIComponent(filename)}/${encodeURIComponent(strategy)}/pair_history`,
        { pair, timeframe }
    );
}

/* ---------- wallet 曲线 ---------- */
// freqtrade 返回结构:{columns:["date","__date_ts","total_quote"], data:[[...]], length}
const walletData = ref<unknown[]>([]);
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
    const cols: string[] = Array.isArray(res.columns) ? res.columns : [];
    const rows: (string | number | null)[][] = Array.isArray(res.data) ? res.data : [];
    const iDate = cols.indexOf("date");
    // 期货回测聚合列名为 total_quote；现货/旧版可能为 total
    const iTotal = findTotalColumn(cols);
    walletData.value = rows;
    if (iDate < 0 || iTotal < 0 || !rows.length) return;
    await nextTick();
    if (!walletEl.value) return;
    // 钱包曲线容器高 256px(h-64),图表高度与之匹配;跨度 30 天只用日期刻度
    walletChart = walletChart ?? createChart(walletEl.value as HTMLElement, walletChartOpts());
    walletSeries =
        walletSeries ?? walletChart.addSeries(LineSeries, { color: "#38bdf8", lineWidth: 2 });
    const series = walletSeries;
    // 5m 级 8000+ 点会只显示右端一小段,按小时聚合后 fitContent 展示完整走势;
    // 短区间(≤3000 点)保持 5m 粒度
    const bucketMs = rows.length > 3000 ? 3600_000 : 300_000;
    const points = downsamplePoints(rows, iDate, iTotal, bucketMs);
    series.setData(points);
    walletChart.timeScale().fitContent();
}

/* ---------- market change ---------- */
// freqtrade 返回结构:{columns:["date","mean","rel_mean","count","__date_ts"], data:[[...]], length}
// 语义是「回测期间市场整体变化」,而非收益模拟
interface MarketChangeRow {
    date: string;
    mean: number | null;
    rel_mean: number | null;
    count: number | null;
}
const marketChange = ref<MarketChangeRow[]>([]);
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
    if (!res) return;
    // 兼容直接返回数组的旧格式
    if (Array.isArray(res)) {
        marketChange.value = (res as MarketChangeRow[]).slice(0, 500);
        return;
    }
    const cols: string[] = Array.isArray(res.columns) ? res.columns : [];
    const rows: (string | number | null)[][] = Array.isArray(res.data) ? res.data : [];
    const idx = (k: string) => cols.indexOf(k);
    const iDate = idx("date");
    const iMean = idx("mean");
    const iRel = idx("rel_mean");
    const iCount = idx("count");
    if (iDate < 0 || iMean < 0) {
        marketChange.value = [];
        return;
    }
    // 只展示变化明显的时刻（|rel_mean| > 0.5%），避免 8000+ 行刷屏
    marketChange.value = rows
        .filter((r) => r[iDate] != null && r[iRel] != null && Math.abs(Number(r[iRel])) >= 0.005)
        .slice(0, 300)
        .map((r) => ({
            date: String(r[iDate]),
            mean: iMean >= 0 && r[iMean] != null ? Number(r[iMean]) : null,
            rel_mean: r[iRel] != null ? Number(r[iRel]) : null,
            count: iCount >= 0 && r[iCount] != null ? Number(r[iCount]) : null
        }));
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
        walletChart?.applyOptions(walletChartOpts());
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
                <div ref="walletEl" class="h-64 w-full" />
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
                <CardDescription
                    >回测期间市场整体走势（均值为参与币对的价格均值，相对变化 &gt; 0.5%
                    的时刻）</CardDescription
                >
            </CardHeader>
            <CardContent>
                <div v-if="marketChange.length" class="max-h-80 overflow-auto rounded-md border">
                    <Table>
                        <TableHeader class="sticky top-0 bg-card">
                            <TableRow>
                                <TableHead>时间</TableHead>
                                <TableHead class="text-right">市场均值</TableHead>
                                <TableHead class="text-right">相对变化</TableHead>
                                <TableHead class="text-right">币对数</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow v-for="(m, i) in marketChange" :key="i">
                                <TableCell class="text-xs">{{ m.date }}</TableCell>
                                <TableCell class="text-right tabular-nums">{{
                                    m.mean !== null ? m.mean.toFixed(2) : "—"
                                }}</TableCell>
                                <TableCell
                                    class="text-right tabular-nums font-medium"
                                    :class="profitColor(m.rel_mean)"
                                >
                                    {{ fmtPct(m.rel_mean) }}
                                </TableCell>
                                <TableCell class="text-right tabular-nums">{{
                                    m.count ?? "—"
                                }}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
                <div v-else-if="!mcLoading" class="py-4 text-center text-sm text-muted-foreground">
                    暂无数据（此功能需要 webserver 模式与完整的历史回测文件）
                </div>
            </CardContent>
        </Card>
    </div>
</template>

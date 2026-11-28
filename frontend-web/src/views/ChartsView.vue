<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from "vue";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { RefreshCw } from "lucide-vue-next";
import {
    createChart,
    CandlestickSeries,
    HistogramSeries,
    LineSeries,
    createSeriesMarkers,
    type IChartApi,
    type ISeriesApi,
    type ISeriesMarkersPluginApi,
    type CandlestickData,
    type SeriesMarker,
    type Time,
    ColorType,
    CrosshairMode
} from "lightweight-charts";
import { api, runApi, type Trade } from "@/composables/useBotData";
import { settingsStore } from "@/stores/settings";
import { fmtPct, parseDate } from "@/lib/format";

const TIMEFRAMES = ["5m", "15m", "30m", "1h", "4h", "1d"];
const pair = ref("");
const timeframe = ref("5m");
const whitelist = ref<string[]>([]);
const loading = ref(false);
const loadError = ref("");

const chartEl = ref<HTMLElement | null>(null);
let chart: IChartApi | null = null;
let candleSeries: ISeriesApi<"Candlestick"> | null = null;
let volumeSeries: ISeriesApi<"Histogram"> | null = null;
// 请求代际计数:快速切换交易对/周期时丢弃过期响应,避免"别人的 K 线"覆盖当前数据
let reqSeq = 0;
let overlayGen = 0;

/** 指标列选择：从 pair_candles 的 columns 里筛出可画的 EMA/SMA 线 */
const overlayLines = ref<string[]>([]);
const activeOverlay = ref("");
/** 策略绘图配置模板（plot_config 端点，webserver/trade 均可用） */
const plotTemplates = ref<Record<string, string[]>>({});
const activeTemplate = ref("");

async function loadPlotConfig() {
    const res = await runApi(() => api.plotConfig(), true);
    if (!res) return;
    const tpl: Record<string, string[]> = {};
    // 主图与子图统一收集：模板名 -> 列名数组
    for (const group of [res.plot_config ?? {}, res.subplots ?? {}]) {
        for (const [name, conf] of Object.entries(
            group as Record<string, { columns?: string[] } | undefined>
        )) {
            tpl[name] = conf?.columns ?? [];
        }
    }
    plotTemplates.value = tpl;
}

function isDark() {
    return settingsStore.theme === "dark";
}

function chartOptions() {
    const dark = isDark();
    return {
        layout: {
            background: { type: ColorType.Solid, color: dark ? "transparent" : "transparent" },
            textColor: dark ? "#9ca3af" : "#6b7280"
        },
        grid: {
            vertLines: { color: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" },
            horzLines: { color: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }
        },
        crosshair: { mode: CrosshairMode.Normal },
        timeScale: { timeVisible: true, secondsVisible: false }
    };
}

function initChart() {
    if (!chartEl.value || chart) return;
    chart = createChart(chartEl.value as HTMLElement, {
        ...chartOptions(),
        height: 480,
        autoSize: true
    });
    candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderVisible: false,
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444"
    });
    volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "vol"
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
}

function destroyChart() {
    chart?.remove();
    chart = null;
    candleSeries = null;
    volumeSeries = null;
    markersApi = null;
    lastCandles = null;
}

async function loadPairs() {
    const res = await runApi(() => api.whitelist());
    if (res) whitelist.value = res.whitelist ?? [];
    if (whitelist.value.length && !pair.value) pair.value = whitelist.value[0];
}

async function loadCandles(retry = 0) {
    if (!pair.value) return;
    const seq = ++reqSeq;
    loading.value = true;
    loadError.value = "";
    const res = await runApi(() => api.pairCandles(pair.value, timeframe.value, 500));
    if (seq !== reqSeq) return; // 过期响应直接丢弃
    loading.value = false;
    if (!res) {
        // 网络中断(如代理回程断流): 自动重试 2 次(3s/6s),仍失败才显示手动重试
        if (retry < 2) {
            loadError.value = `网络波动，${retry === 0 ? 3 : 6} 秒后自动重试…(${retry + 1}/2)`;
            const mySeq = seq;
            setTimeout(
                () => {
                    if (mySeq === reqSeq) void loadCandles(retry + 1);
                },
                retry === 0 ? 3000 : 6000
            );
        } else {
            loadError.value = "加载失败，请点击刷新重试";
        }
        return;
    }

    const cols: string[] = res.columns;
    const rows = res.data as (string | number | null)[][];
    const iDate = cols.indexOf("date");
    const iO = cols.indexOf("open");
    const iH = cols.indexOf("high");
    const iL = cols.indexOf("low");
    const iC = cols.indexOf("close");
    const iV = cols.indexOf("volume");
    // 启动引导未完成时,后端可能返回缺 date 列的瞬态响应 —— 自动重试而不是永久空白
    if (iDate < 0 || iO < 0 || !rows.length) {
        loadError.value = "数据尚未就绪（服务启动中），将自动重试…";
        if (seq === reqSeq) {
            setTimeout(() => {
                if (seq === reqSeq) void loadCandles();
            }, 10000);
        }
        return;
    }

    const candles: CandlestickData<Time>[] = rows.map((r) => ({
        time: ((parseDate(r[iDate])?.getTime() ?? 0) / 1000) as Time,
        open: r[iO] as number,
        high: r[iH] as number,
        low: r[iL] as number,
        close: r[iC] as number
    }));
    candleSeries?.setData(candles);
    volumeSeries?.setData(
        rows.map((r, idx) => ({
            time: candles[idx].time,
            value: r[iV] as number,
            color:
                (r[iC] as number) >= (r[iO] as number)
                    ? "rgba(34,197,94,0.4)"
                    : "rgba(239,68,68,0.4)"
        }))
    );

    // 可选指标线（EMA/SMA/BB 中轨）
    const candidates = cols.filter((c) => /^(ema|sma|bb_)|_ema|_mid/i.test(c)).slice(0, 12);
    overlayLines.value = candidates;
    // 写入缓存供 drawOverlay 复用，避免指标/模板切换时重复请求
    lastCandles = { pair: pair.value, timeframe: timeframe.value, columns: cols, data: rows };
    drawOverlay();
    drawTradeMarkers();
}

let overlaySeries: ISeriesApi<"Line">[] = [];
// 标记插件复用：重复 createSeriesMarkers 会在同一 series 上叠加多个插件，导致标记重复
let markersApi: ISeriesMarkersPluginApi<Time> | null = null;

/** 最近一次 K 线响应缓存：切换指标/模板时复用它，避免重复请求 500 根 K 线 */
interface CandlePayload {
    pair: string;
    timeframe: string;
    columns: string[];
    data: (string | number | null)[][];
}
let lastCandles: CandlePayload | null = null;

/** 取当前 K 线数据：优先用缓存，缺失（如切换后尚未加载）时再请求 */
async function candlesForOverlay(): Promise<CandlePayload | null> {
    if (
        lastCandles &&
        lastCandles.pair === pair.value &&
        lastCandles.timeframe === timeframe.value
    ) {
        return lastCandles;
    }
    const res = await runApi(() => api.pairCandles(pair.value, timeframe.value, 500), true);
    if (!res) return null;
    return {
        pair: pair.value,
        timeframe: timeframe.value,
        columns: res.columns as string[],
        data: res.data as (string | number | null)[][]
    };
}

function addLineSeries(cand: CandlePayload, colIdx: number, color: string): void {
    if (!chart) return;
    const iDate = cand.columns.indexOf("date");
    const series = chart.addSeries(LineSeries, {
        lineWidth: 1,
        color,
        priceLineVisible: false
    });
    series.setData(
        cand.data
            .filter((r) => r[colIdx] !== null && r[colIdx] !== undefined && r[colIdx] !== "")
            .map((r) => ({
                time: ((parseDate(r[iDate])?.getTime() ?? 0) / 1000) as Time,
                value: r[colIdx] as number
            }))
    );
    overlaySeries.push(series);
}

function drawOverlay() {
    const gen = ++overlayGen;
    overlaySeries.forEach((s) => chart?.removeSeries(s));
    overlaySeries = [];
    // 模板模式：叠加 plot_config 里该模板的全部列
    if (activeTemplate.value && plotTemplates.value[activeTemplate.value]) {
        const tplCols = plotTemplates.value[activeTemplate.value];
        const colors = ["#38bdf8", "#f59e0b", "#a78bfa", "#34d399", "#fb7185", "#fbbf24"];
        void (async () => {
            const cand = await candlesForOverlay();
            if (!cand || gen !== overlayGen) return;
            tplCols.forEach((col, i) => {
                const idx = cand.columns.indexOf(col);
                if (idx < 0) return;
                addLineSeries(cand, idx, colors[i % colors.length]);
            });
        })();
        return;
    }
    if (!activeOverlay.value) return;
    const overlayCol = activeOverlay.value;
    void (async () => {
        const cand = await candlesForOverlay();
        if (!cand || gen !== overlayGen) return;
        const idx = cand.columns.indexOf(overlayCol);
        if (idx < 0) return;
        addLineSeries(cand, idx, "#38bdf8");
    })();
}

function onTemplateChange(v: unknown) {
    if (v === null || v === undefined) return;
    activeTemplate.value = String(v);
    if (activeTemplate.value) activeOverlay.value = "";
    drawOverlay();
}
function onOverlayChange() {
    if (activeOverlay.value) activeTemplate.value = "";
    drawOverlay();
}

async function drawTradeMarkers() {
    const res = await runApi(() => api.trades(200), true);
    if (!res) return;
    const all: Trade[] = res.trades ?? [];
    const markers: SeriesMarker<Time>[] = all
        .filter((t) => t.pair === pair.value)
        .flatMap((t) => {
            const openTime = ((parseDate(t.open_date)?.getTime() ?? 0) / 1000) as Time;
            const out: SeriesMarker<Time>[] = [
                {
                    time: openTime,
                    position: t.is_short ? "aboveBar" : "belowBar",
                    color: t.is_short ? "#f97316" : "#38bdf8",
                    shape: t.is_short ? "arrowDown" : "arrowUp",
                    text: `${t.is_short ? "空" : "多"}开 ${t.open_rate}`
                }
            ];
            if (t.close_date) {
                out.push({
                    time: ((parseDate(t.close_date)?.getTime() ?? 0) / 1000) as Time,
                    position: t.is_short ? "belowBar" : "aboveBar",
                    color: (t.profit_ratio ?? 0) >= 0 ? "#22c55e" : "#ef4444",
                    shape: "circle",
                    text: `平 ${fmtPct(t.profit_ratio)}`
                });
            }
            return out;
        })
        .sort((a, b) => (a.time as number) - (b.time as number));
    if (candleSeries) {
        if (markersApi) markersApi.setMarkers(markers);
        else markersApi = createSeriesMarkers(candleSeries, markers);
    }
}

async function refresh() {
    await loadCandles();
}

// 图表就绪后才响应 pair 切换：避免首屏 loadPairs 设置 pair 时与显式首屏加载重复请求
let chartReady = false;

onMounted(async () => {
    await loadPairs();
    await nextTick();
    initChart();
    chartReady = true;
    await loadCandles();
    void loadPlotConfig();
});

onUnmounted(destroyChart);

watch(pair, () => {
    if (chartReady) void loadCandles();
});
watch(timeframe, () => {
    if (chartReady) void loadCandles();
});
watch(activeOverlay, () => drawOverlay());
watch(
    () => settingsStore.theme,
    () => {
        chart?.applyOptions(chartOptions());
    }
);
</script>

<template>
    <Card>
        <CardContent class="space-y-3 pt-4">
            <div class="flex flex-wrap items-center gap-2">
                <Select v-model="pair">
                    <SelectTrigger class="w-44">
                        <SelectValue placeholder="选择交易对" />
                    </SelectTrigger>
                    <SelectContent class="max-h-64">
                        <SelectItem v-for="p in whitelist" :key="p" :value="p">{{ p }}</SelectItem>
                    </SelectContent>
                </Select>
                <Select v-model="timeframe">
                    <SelectTrigger class="w-24">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem v-for="tf in TIMEFRAMES" :key="tf" :value="tf">{{
                            tf
                        }}</SelectItem>
                    </SelectContent>
                </Select>
                <Select v-model="activeOverlay" @update:model-value="onOverlayChange">
                    <SelectTrigger class="w-40">
                        <SelectValue placeholder="叠加指标（可选）" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem v-for="c in overlayLines" :key="c" :value="c">{{
                            c
                        }}</SelectItem>
                    </SelectContent>
                </Select>
                <Select v-model="activeTemplate" @update:model-value="onTemplateChange">
                    <SelectTrigger class="w-40">
                        <SelectValue placeholder="绘图模板（plot_config）" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem v-for="(cols, name) in plotTemplates" :key="name" :value="name">
                            {{ name }}（{{ cols.length }}列）
                        </SelectItem>
                    </SelectContent>
                </Select>
                <Button
                    variant="outline"
                    size="icon"
                    :disabled="loading"
                    @click="refresh"
                    title="刷新"
                >
                    <RefreshCw class="size-4" :class="loading ? 'animate-spin' : ''" />
                </Button>
                <span v-if="pair" class="text-xs text-muted-foreground">
                    {{ pair }} · {{ timeframe }} · 最近 500 根 K 线
                </span>
            </div>
            <div class="relative">
                <div ref="chartEl" class="h-[480px] w-full" />
                <div
                    v-if="loadError"
                    class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80"
                >
                    <p class="text-sm text-muted-foreground">{{ loadError }}</p>
                    <Button variant="outline" size="sm" @click="loadCandles">立即重试</Button>
                </div>
            </div>
            <p class="text-xs text-muted-foreground">
                图上标记：蓝↑ 多头开仓 / 橙↓ 空头开仓 / ● 平仓（绿=盈利 红=亏损）
            </p>
        </CardContent>
    </Card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { Popup, Picker, Tabs, Tab, Button } from "vant";
import {
    createChart,
    CandlestickSeries,
    HistogramSeries,
    ColorType,
    CrosshairMode,
    type IChartApi,
    type ISeriesApi,
    type CandlestickData,
    type Time
} from "lightweight-charts";
import { api, runApi } from "@/composables/useBotData";
import { settingsStore } from "@/stores/settings";
import { fmtPct, parseDate } from "@/lib/format";

const TIMEFRAMES = ["5m", "15m", "30m", "1h", "4h", "1d"];
const whitelist = ref<string[]>([]);
const pair = ref("");
const timeframe = ref("5m");
const loading = ref(false);
const showPicker = ref(false);
const pickerValue = ref<string[]>([]);

// Vant 4 Picker 的 columns 是 PickerOption[]（{text, value}），不是 Vant 2 的 {values}
const pairOptions = computed(() => whitelist.value.map((p) => ({ text: p, value: p })));

const chartEl = ref<HTMLElement | null>(null);
let chart: IChartApi | null = null;
let candleSeries: ISeriesApi<"Candlestick"> | null = null;
let volumeSeries: ISeriesApi<"Histogram"> | null = null;
let reqSeq = 0;
let lastChange = 0;

function isDark() {
    return settingsStore.theme === "dark";
}

function chartOptions() {
    const dark = isDark();
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
        timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 5 },
        height: 340,
        autoSize: true
    };
}

function initChart() {
    if (!chartEl.value || chart) return;
    chart = createChart(chartEl.value as HTMLElement, chartOptions());
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
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
}

async function load() {
    if (!pair.value) return;
    const seq = ++reqSeq;
    loading.value = true;
    const res = await runApi(() => api.pairCandles(pair.value, timeframe.value, 360), true);
    if (seq !== reqSeq) return;
    loading.value = false;
    if (!res) return;
    await nextTick();
    initChart();
    const cols: string[] = res.columns;
    const rows = res.data as (string | number | null)[][];
    const iDate = cols.indexOf("date");
    const idx = (k: string) => cols.indexOf(k);
    if (iDate < 0 || idx("close") < 0) return;
    const candles = rows.map((r) => ({
        time: ((parseDate(String(r[iDate]))?.getTime() ?? 0) / 1000) as Time,
        open: Number(r[idx("open")]),
        high: Number(r[idx("high")]),
        low: Number(r[idx("low")]),
        close: Number(r[idx("close")])
    })) as CandlestickData<Time>[];
    candleSeries?.setData(candles);
    const iVol = idx("volume");
    if (iVol >= 0 && volumeSeries) {
        volumeSeries.setData(
            rows.map((r) => ({
                time: ((parseDate(String(r[iDate]))?.getTime() ?? 0) / 1000) as Time,
                value: Number(r[iVol] ?? 0),
                color: Number(r[idx("close")]) >= Number(r[idx("open")]) ? "#22c55e88" : "#ef444488"
            }))
        );
    }
    if (candles.length) {
        const last = candles[candles.length - 1];
        const prev = candles.length > 1 ? candles[candles.length - 2] : candles[0];
        lastChange = prev.close ? (last.close - prev.close) / prev.close : 0;
    }
    chart?.timeScale().fitContent();
}

async function loadWhitelist() {
    const wl = await runApi(() => api.whitelist(), true);
    if (wl) {
        whitelist.value = wl.whitelist ?? [];
        pair.value = whitelist.value[0] ?? "";
        pickerValue.value = pair.value ? [pair.value] : [];
        await load();
    }
}

function openPicker() {
    pickerValue.value = pair.value ? [pair.value] : [];
    showPicker.value = true;
}

async function onPick({ selectedValues }: { selectedValues: string[] }) {
    showPicker.value = false;
    if (!selectedValues.length) return;
    pair.value = selectedValues[0];
    await load();
}

watch(timeframe, () => void load());

onMounted(() => void loadWhitelist());
onUnmounted(() => {
    chart?.remove();
    chart = null;
    candleSeries = null;
    volumeSeries = null;
});
watch(
    () => settingsStore.theme,
    () => chart?.applyOptions(chartOptions())
);

const pairName = () => pair.value.split("/")[0] || "—";
</script>

<template>
    <div class="space-y-3 p-3">
        <!-- 币对选择 -->
        <div class="flex items-center gap-2 rounded-xl bg-white p-3 shadow-sm">
            <Button size="small" plain type="primary" icon="exchange" @click="openPicker">
                {{ pairName() }}
            </Button>
            <span class="text-xs text-gray-400">{{ pair }}</span>
            <Button size="small" class="!ml-auto" plain @click="load">刷新</Button>
        </div>

        <!-- 周期（Vant Tab 标题用 #title 插槽设置） -->
        <Tabs
            v-model:active="timeframe"
            shrink
            :swipe-threshold="6"
            class="rounded-xl bg-white p-1 shadow-sm"
        >
            <Tab v-for="tf in TIMEFRAMES" :key="tf" :name="tf">
                <template #title>{{ tf }}</template>
            </Tab>
        </Tabs>

        <!-- 涨跌 -->
        <div class="rounded-xl bg-white p-3 shadow-sm">
            <div class="mb-1 flex items-center justify-between text-xs">
                <span class="text-gray-400">最新涨跌</span>
                <span
                    class="font-medium tabular-nums"
                    :class="lastChange >= 0 ? 'text-green-600' : 'text-red-600'"
                >
                    {{ fmtPct(lastChange) }}
                </span>
            </div>
            <div ref="chartEl" class="h-[340px] w-full" />
            <div v-if="loading" class="py-1 text-center text-xs text-gray-400">加载中…</div>
        </div>

        <Popup v-model:show="showPicker" position="bottom" round>
            <Picker
                :columns="pairOptions"
                :model-value="pickerValue"
                title="选择币对"
                @confirm="onPick"
                @cancel="showPicker = false"
            />
        </Popup>
    </div>
</template>

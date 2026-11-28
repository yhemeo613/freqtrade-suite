<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { toast } from "vue-sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Play, Square, History as HistoryIcon } from "lucide-vue-next";
import BacktestAnalysis from "@/components/ft/BacktestAnalysis.vue";
import { getClient } from "@/api/client";
import { runApi, api, type Trade } from "@/composables/useBotData";
import type { BacktestResult, BacktestHistoryItem } from "@/api/types";
import { fmtPct, fmtCoin, profitColor, exitReasonZh, directionZh, fmtDate } from "@/lib/format";
import { classifyJob, jobErrorText } from "@/lib/jobStatus";
import { defaultTimerange } from "@/lib/parse";

/* ---------- 表单 ---------- */
const strategy = ref("");
// 滚动默认值（30 天前至今），避免硬编码日期随时间过期
const timerange = ref(defaultTimerange(30));
const timeframe = ref("5m");
const enableProtections = ref(false);

/* ---------- 深度分析用币对 ----------
 * 优先用回测成交的币对；若回测 0 交易（NFI 等选择性策略常见），
 * 回退到当前白名单，保证 K 线深度分析仍有币对可选。
 */
const whitelistPairs = ref<string[]>([]);
async function loadWhitelist() {
    const wl = await runApi(() => api.whitelist(), true);
    if (wl) whitelistPairs.value = wl.whitelist ?? [];
}
void loadWhitelist();
const analysisPairs = computed<string[]>(() => {
    const traded = [...new Set(resultTrades.value.map((t: Trade) => t.pair))];
    return traded.length ? traded : whitelistPairs.value;
});

/* ---------- 运行状态 ---------- */
const running = ref(false);
const progress = ref(0);
const step = ref("");
const result = ref<BacktestResult | null>(null);
const resultFilename = ref("");
const resultStrategy = ref("");

/* ---------- 策略列表（webserver 专属端点，加载失败时保留自由输入） ---------- */
const strategies = ref<string[]>([]);
const strategiesLoaded = ref(false);

async function loadStrategies() {
    const st = await runApi(() => getClient().btGet("/api/v1/strategies"), true);
    strategiesLoaded.value = true;
    if (st) {
        strategies.value = (st.strategies ?? st ?? []).map((x: string | { name?: string }) =>
            typeof x === "string" ? x : (x.name ?? "")
        );
        // 当前配置的策略不在列表（如自定义策略文件）时，保留已选值
        if (strategies.value.length && !strategies.value.includes(strategy.value)) {
            strategies.value.push(strategy.value);
        }
    }
}

/* ---------- 历史 ---------- */
const history = ref<BacktestHistoryItem[]>([]);
const loadingHistory = ref(false);

const summary = computed(() => {
    const s = result.value?.strategy;
    if (!s) return null;
    const key = Object.keys(s)[0];
    return key ? s[key] : null;
});
const resultTrades = computed<Trade[]>(
    () => (result.value?.trades ?? summary.value?.trades ?? []) as Trade[]
);

async function loadHistory() {
    loadingHistory.value = true;
    const res = await runApi(() => getClient().btGet("/api/v1/backtest/history"), true);
    loadingHistory.value = false;
    if (res) history.value = res;
}

async function loadStrategy() {
    const cfg = await runApi(() => getClient().get("/api/v1/show_config"), true);
    if (cfg?.strategy) strategy.value = cfg.strategy;
}

void loadStrategy();
void loadHistory();
void loadStrategies();

let pollTimer: ReturnType<typeof setInterval> | null = null;

function stopPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
}

async function pollOnce(): Promise<void> {
    const res = await runApi(() => getClient().btGet("/api/v1/backtest"), true);
    if (!res) return;
    progress.value = Math.round((res.progress ?? 0) * 100);
    step.value = res.step ?? "";
    // 失败必须单独判定：freqtrade 回测失败返回 status="error"（不是 "failed"），
    // 且此时 running 也是 false，只按 running 判断会把失败误报成"回测完成"
    const outcome = classifyJob(res);
    if (outcome === "error") {
        running.value = false;
        stopPoll();
        toast.error(jobErrorText(res, "回测失败"));
        return;
    }
    if (outcome === "success") {
        // API 返回 {status, progress, backtest_result: {metadata, strategy, strategy_comparison}}，需下钻一层
        result.value = res.backtest_result ?? res;
        // 刚跑完的回测同样写入文件名,让"深度分析"页签立即可用
        const meta = res.backtest_result?.metadata;
        if (meta?.filename) {
            resultFilename.value = meta.filename;
            resultStrategy.value = meta.strategy ?? strategy.value;
        }
        running.value = false;
        stopPoll();
        toast.success("回测完成");
        loadHistory();
    }
}

async function startBacktest() {
    if (!strategy.value || !timerange.value) {
        toast.error("请填写策略与时间范围");
        return;
    }
    const payload: Record<string, unknown> = {
        strategy: strategy.value,
        timerange: timerange.value,
        timeframe: timeframe.value || undefined,
        enable_protections: enableProtections.value
    };
    const res = await runApi(() => getClient().btPost("/api/v1/backtest", payload));
    if (!res) return;
    running.value = true;
    progress.value = 0;
    result.value = null;
    pollTimer = setInterval(() => void pollOnce(), 2000);
    void pollOnce();
}

async function abort() {
    await runApi(() => getClient().btGet("/api/v1/backtest/abort"));
    running.value = false;
    stopPoll();
    toast.info("已中止");
}

async function loadHistoryResult(filename: string, strat: string) {
    const res = await runApi(() =>
        getClient().btGet(
            `/api/v1/backtest/history/result?filename=${encodeURIComponent(filename)}&strategy=${encodeURIComponent(strat)}`
        )
    );
    if (res) {
        result.value = res.backtest_result ?? res;
        resultFilename.value = filename;
        resultStrategy.value = strat;
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
}

onUnmounted(stopPoll);
</script>

<template>
    <div class="space-y-3">
        <!-- 提交表单 -->
        <Card>
            <CardHeader class="pb-3">
                <CardTitle class="text-base">发起回测</CardTitle>
                <CardDescription
                    >使用机器人当前配置在服务器上运行回测（需要已下载对应历史数据）</CardDescription
                >
            </CardHeader>
            <CardContent class="space-y-3">
                <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div class="space-y-1.5">
                        <Label>策略</Label>
                        <Select v-if="strategies.length" v-model="strategy">
                            <SelectTrigger class="w-full">
                                <SelectValue placeholder="选择策略" />
                            </SelectTrigger>
                            <SelectContent class="max-h-64">
                                <SelectItem v-for="s in strategies" :key="s" :value="s">{{
                                    s
                                }}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input
                            v-else
                            v-model="strategy"
                            placeholder="NostalgiaForInfinityX8"
                            :disabled="!strategiesLoaded"
                        />
                    </div>
                    <div class="space-y-1.5">
                        <Label>时间范围</Label>
                        <Input v-model="timerange" placeholder="20260801-20261120" />
                    </div>
                    <div class="space-y-1.5">
                        <Label>K 线周期</Label>
                        <Input v-model="timeframe" placeholder="5m" />
                    </div>
                    <div class="space-y-1.5">
                        <Label>保护机制</Label>
                        <div class="flex h-9 items-center gap-2">
                            <Switch v-model="enableProtections" id="bt-prot" />
                            <Label for="bt-prot" class="text-sm text-muted-foreground"
                                >启用 Stoploss 保护</Label
                            >
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <Button :disabled="running" @click="startBacktest"
                        ><Play class="size-4" />开始回测</Button
                    >
                    <Button v-if="running" variant="destructive" @click="abort"
                        ><Square class="size-4" />中止</Button
                    >
                    <span class="text-xs text-muted-foreground"
                        >时间范围格式：YYYYMMDD-YYYYMMDD，结束留空表示至今</span
                    >
                </div>
                <div v-if="running" class="space-y-1.5 rounded-md border p-3">
                    <div class="flex justify-between text-sm">
                        <span>回测进行中…（{{ step }}）</span>
                        <span class="tabular-nums">{{ progress }}%</span>
                    </div>
                    <Progress :model-value="progress" />
                </div>
            </CardContent>
        </Card>

        <!-- 结果摘要 -->
        <Tabs v-if="summary" default-value="result">
            <TabsList>
                <TabsTrigger value="result">结果</TabsTrigger>
                <TabsTrigger value="analysis" :disabled="!resultFilename">深度分析</TabsTrigger>
            </TabsList>
            <TabsContent value="result">
                <Card>
                    <CardHeader class="pb-2">
                        <CardTitle class="text-base">回测结果 · {{ strategy }}</CardTitle>
                        <CardDescription v-if="result?.backtesting_start">
                            {{ result.backtesting_start }} → {{ result.backtesting_end }}
                        </CardDescription>
                    </CardHeader>
                    <CardContent class="space-y-3">
                        <div class="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                            <div
                                v-for="m in [
                                    { label: '总交易', value: summary.total_trades, cls: '' },
                                    {
                                        label: '总收益',
                                        value: fmtPct(summary.profit_total),
                                        cls: profitColor(summary.profit_total)
                                    },
                                    {
                                        label: '绝对收益',
                                        value: fmtCoin(summary.profit_total_abs, 'USDT'),
                                        cls: profitColor(summary.profit_total_abs)
                                    },
                                    {
                                        label: '胜/平/负',
                                        value: `${summary.wins ?? 0}/${summary.draws ?? 0}/${summary.losses ?? 0}`,
                                        cls: ''
                                    },
                                    {
                                        label: '最大回撤',
                                        value: fmtPct(summary.max_drawdown),
                                        cls: 'text-destructive'
                                    },
                                    { label: '盈利率', value: fmtPct(summary.winrate), cls: '' }
                                ]"
                                :key="m.label"
                                class="rounded-md border p-2.5"
                            >
                                <div class="text-xs text-muted-foreground">{{ m.label }}</div>
                                <div
                                    class="mt-0.5 text-base font-semibold tabular-nums"
                                    :class="m.cls"
                                >
                                    {{ m.value }}
                                </div>
                            </div>
                        </div>

                        <div
                            v-if="resultTrades.length"
                            class="max-h-96 overflow-auto rounded-md border"
                        >
                            <Table>
                                <TableHeader class="sticky top-0 bg-card">
                                    <TableRow>
                                        <TableHead>#</TableHead>
                                        <TableHead>交易对</TableHead>
                                        <TableHead>方向</TableHead>
                                        <TableHead class="text-right">开仓价</TableHead>
                                        <TableHead class="text-right">平仓价</TableHead>
                                        <TableHead class="text-right">盈亏%</TableHead>
                                        <TableHead>平仓原因</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow v-for="(t, i) in resultTrades" :key="i">
                                        <TableCell class="text-muted-foreground">{{
                                            t.trade_id ?? i
                                        }}</TableCell>
                                        <TableCell class="font-medium">{{ t.pair }}</TableCell>
                                        <TableCell>
                                            <Badge
                                                :variant="t.is_short ? 'destructive' : 'outline'"
                                                >{{ directionZh(t.is_short) }}</Badge
                                            >
                                        </TableCell>
                                        <TableCell class="text-right tabular-nums">{{
                                            t.open_rate
                                        }}</TableCell>
                                        <TableCell class="text-right tabular-nums">{{
                                            t.close_rate ?? "—"
                                        }}</TableCell>
                                        <TableCell
                                            class="text-right tabular-nums"
                                            :class="profitColor(t.profit_ratio)"
                                            >{{ fmtPct(t.profit_ratio) }}</TableCell
                                        >
                                        <TableCell class="text-xs">{{
                                            exitReasonZh(t.exit_reason)
                                        }}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="analysis">
                <BacktestAnalysis
                    v-if="resultFilename"
                    :filename="resultFilename"
                    :strategy="resultStrategy"
                    :timeframe="timeframe"
                    :pairs="analysisPairs"
                    :trades="resultTrades"
                />
                <div
                    v-else
                    class="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground"
                >
                    深度分析需要从「历史回测」载入结果后使用
                </div>
            </TabsContent>
        </Tabs>

        <!-- 历史 -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="flex items-center gap-2 text-base">
                    <HistoryIcon class="size-4" />历史回测
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div
                    v-if="!history.length && !loadingHistory"
                    class="py-6 text-center text-sm text-muted-foreground"
                >
                    暂无历史记录
                </div>
                <div v-else class="space-y-2">
                    <div
                        v-for="(h, i) in history"
                        :key="i"
                        class="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm"
                    >
                        <span class="font-medium">{{ h.strategy }}</span>
                        <Badge variant="secondary">{{ h.timeframe }}</Badge>
                        <span class="text-muted-foreground">{{ h.timerange }}</span>
                        <span class="text-xs text-muted-foreground">{{
                            fmtDate(h.backtest_start_time)
                        }}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            class="ml-auto"
                            @click="loadHistoryResult(h.filename, h.strategy ?? '')"
                        >
                            载入结果
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    </div>
</template>

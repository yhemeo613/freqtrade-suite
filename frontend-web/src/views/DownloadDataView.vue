<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { toast } from "vue-sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Download, Globe } from "lucide-vue-next";
import { getClient } from "@/api/client";
import { runApi, api } from "@/composables/useBotData";
import { defaultTimerange } from "@/lib/parse";

const TIMEFRAMES = ["5m", "15m", "30m", "1h", "2h", "4h", "8h", "1d"];
const timeframes = ref<string[]>(["5m", "15m", "1h"]);
// 滚动默认值（60 天前至今），避免硬编码日期随时间过期
const timerange = ref(defaultTimerange(60));
const tradingMode = ref("spot");
const pairsText = ref("");
const loadingPairs = ref(true);
const marketInfo = ref<{ pairs: number; exchanges: string[] } | null>(null);
const submitting = ref(false);
const jobId = ref("");
const progress = ref(0);
const jobStatus = ref("");

async function loadWhitelist() {
    const res = await runApi(() => api.whitelist());
    if (res) {
        pairsText.value = (res.whitelist ?? []).join("\n");
    }
    loadingPairs.value = false;
    // 交易所可用市场概览（webserver 守卫下静默降级）
    const [ap, ex] = await Promise.all([
        runApi(() => api.availablePairs(), true),
        runApi(() => api.exchanges(), true)
    ]);
    if (ap) {
        const groups = ap.pairs ?? {};
        const total = Object.values(groups as Record<string, unknown[]>).reduce(
            (s: number, arr) => s + (arr?.length ?? 0),
            0
        );
        marketInfo.value = { pairs: total || (ap.length ?? 0), exchanges: [] };
    }
    if (ex && Array.isArray(ex)) {
        marketInfo.value = marketInfo.value ?? { pairs: 0, exchanges: [] };
        marketInfo.value.exchanges = (ex as (string | { name?: string })[]).map((e) =>
            typeof e === "string" ? e : (e.name ?? "")
        );
    }
    // 交易模式跟随机器人配置，避免现货配置默认按永续下载导致 0 交易对
    const cfg = await runApi(() => api.showConfig(), true);
    if (cfg) {
        tradingMode.value = ["futures", "margin"].includes(cfg.trading_mode) ? "futures" : "spot";
    }
}
void loadWhitelist();

function toggleTf(tf: string) {
    const i = timeframes.value.indexOf(tf);
    if (i >= 0) timeframes.value.splice(i, 1);
    else timeframes.value.push(tf);
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
// 连续查询失败计数：接口异常(如 503)时避免无限空转
let pollFailures = 0;
function stopPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
}

async function pollJob() {
    const res = await runApi(() => getClient().btGet(`/api/v1/background/${jobId.value}`), true);
    if (!res) {
        pollFailures++;
        if (pollFailures >= 10) {
            stopPoll();
            pollFailures = 0;
            toast.error("查询下载任务失败次数过多，已停止");
        }
        return;
    }
    pollFailures = 0;
    jobStatus.value = res.status ?? "";
    // progress_tasks: { "下载 x/y": {progress: 0..1, ...} }
    const tasks = res.progress_tasks ?? {};
    const vals = Object.values(tasks as Record<string, { progress?: number }>);
    if (vals.length) {
        progress.value = Math.round(
            (vals.reduce((s: number, t) => s + (t.progress ?? 0), 0) / vals.length) * 100
        );
    }
    if (res.status === "completed") {
        stopPoll();
        toast.success("数据下载完成");
    } else if (res.status === "failed") {
        stopPoll();
        toast.error(res.error ?? "下载失败");
    }
}

async function submit() {
    const pairs = pairsText.value
        .split(/[\n,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    if (!pairs.length || !timeframes.value.length || !timerange.value) {
        toast.error("请填写交易对、周期与时间范围");
        return;
    }
    submitting.value = true;
    const res = await runApi(() =>
        getClient().btPost("/api/v1/download_data", {
            pairs,
            timeframes: timeframes.value,
            timerange: timerange.value,
            trading_mode: tradingMode.value,
            candle_type: "futures" === tradingMode.value ? "futures" : "spot",
            prepend: false
        })
    );
    submitting.value = false;
    if (!res) return;
    jobId.value = res.job_id ?? "";
    jobStatus.value = "running";
    progress.value = 0;
    pollFailures = 0;
    if (jobId.value) {
        stopPoll();
        pollTimer = setInterval(() => void pollJob(), 1500);
        toast.info("下载任务已提交");
    } else {
        toast.success(res.status ?? "已提交");
    }
}

onUnmounted(stopPoll);
</script>

<template>
    <div class="mx-auto max-w-3xl space-y-3">
        <Card>
            <CardHeader class="pb-3">
                <CardTitle class="text-base">下载历史数据</CardTitle>
                <CardDescription>为回测/图表下载交易所历史 K 线，在服务器后台执行</CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
                <div class="space-y-1.5">
                    <Label for="dl-pairs">交易对（每行一个，默认为当前白名单）</Label>
                    <Textarea
                        id="dl-pairs"
                        v-model="pairsText"
                        rows="6"
                        class="font-mono text-xs"
                        :disabled="loadingPairs"
                    />
                </div>

                <div class="space-y-1.5">
                    <Label>K 线周期（多选）</Label>
                    <div class="flex flex-wrap gap-2">
                        <Button
                            v-for="tf in TIMEFRAMES"
                            :key="tf"
                            :variant="timeframes.includes(tf) ? 'default' : 'outline'"
                            size="sm"
                            @click="toggleTf(tf)"
                        >
                            {{ tf }}
                        </Button>
                    </div>
                </div>

                <div class="grid gap-3 sm:grid-cols-3">
                    <div class="space-y-1.5">
                        <Label for="dl-range">时间范围</Label>
                        <Input id="dl-range" v-model="timerange" placeholder="20261001-" />
                    </div>
                    <div class="space-y-1.5">
                        <Label>交易模式</Label>
                        <Select v-model="tradingMode">
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="futures">永续合约</SelectItem>
                                <SelectItem value="spot">现货</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div class="flex items-center gap-3">
                    <Button :disabled="submitting || loadingPairs" @click="submit">
                        <Download class="size-4" />{{ submitting ? "提交中…" : "开始下载" }}
                    </Button>
                    <span class="text-xs text-muted-foreground"
                        >时间范围格式：YYYYMMDD-YYYYMMDD，结束留空表示至今</span
                    >
                </div>

                <!-- 交易所市场概览 -->
                <div
                    v-if="marketInfo"
                    class="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm text-muted-foreground"
                >
                    <Globe class="size-4" />
                    <span
                        >交易所可用交易对约
                        <b class="text-foreground">{{ marketInfo.pairs }}</b> 个</span
                    >
                    <template v-if="marketInfo.exchanges.length">
                        <span>·</span>
                        <span>数据源: {{ marketInfo.exchanges.join(" / ") }}</span>
                    </template>
                </div>

                <div v-if="jobId" class="space-y-1.5 rounded-md border p-3">
                    <div class="flex justify-between text-sm">
                        <span
                            >下载中…（{{ jobStatus === "completed" ? "已完成" : "运行中" }}）</span
                        >
                        <span class="tabular-nums">{{ progress }}%</span>
                    </div>
                    <Progress :model-value="progress" />
                </div>
            </CardContent>
        </Card>
    </div>
</template>

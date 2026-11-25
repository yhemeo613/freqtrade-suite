<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { toast } from "vue-sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Microscope, ArrowLeftRight } from "lucide-vue-next";
import { getClient } from "@/api/client";
import { runApi, api } from "@/composables/useBotData";
import { classifyJob, jobErrorText, outcomeLabel } from "@/lib/jobStatus";
import { defaultTimerange } from "@/lib/parse";
import type { AnalysisJobResult } from "@/api/types";

const strategy = ref("");
const pairsText = ref("");
// 滚动默认值（60 天前至今），避免硬编码日期随时间过期（与下载/回测视图一致）
const timerange = ref(defaultTimerange(60));

const btUrl = getClient().btBaseUrl;
const hasBacktestService = computed(() => getClient().btBaseUrl !== getClient().baseUrl);

/** 将 freqtrade 英文状态文案转换为中文 */
function analysisStatusText(raw: { status_msg?: string } | null): string {
    const s = String(raw?.status_msg ?? "");
    return s
        .replace(/^Analysis failed with /, "分析失败：")
        .replace(/^Analysis running$/, "分析进行中")
        .replace(/^Analysis (finished|ended)$/, "分析完成")
        .replace(/^Analysis pending$/, "分析排队中");
}

/* Recursive */
const recJobId = ref("");
const recRunning = ref(false);
const recResult = ref<AnalysisJobResult | null>(null);

/* Lookahead */
const laJobId = ref("");
const laRunning = ref(false);
const laResult = ref<AnalysisJobResult | null>(null);

async function initStrategy() {
    const cfg = await runApi(() => api.showConfig(), true);
    if (cfg?.strategy) strategy.value = cfg.strategy;
    const wl = await runApi(() => api.whitelist(), true);
    if (wl) pairsText.value = (wl.whitelist ?? []).slice(0, 5).join("\n");
}
void initStrategy();

const pollTimers: ReturnType<typeof setInterval>[] = [];
const pollFailures: Record<"recursive" | "lookahead", number> = { recursive: 0, lookahead: 0 };
// 组件卸载或连续失败时停止轮询,避免定时器无限存活
onUnmounted(() => {
    pollTimers.forEach(clearInterval);
    pollTimers.length = 0;
});

function startPolling(jobId: string, kind: "recursive" | "lookahead") {
    const getter = () =>
        kind === "recursive" ? api.recursiveAnalysisGet(jobId) : api.lookaheadAnalysisGet(jobId);
    const setRunning = (v: boolean) => {
        if (kind === "recursive") recRunning.value = v;
        else laRunning.value = v;
    };
    const timer = setInterval(async () => {
        const res = await runApi(() => getter(), true);
        if (!res) {
            pollFailures[kind]++;
            if (pollFailures[kind] >= 5) {
                clearInterval(timer);
                pollFailures[kind] = 0;
                // 停止轮询时必须解除"分析中"锁定，否则按钮会永久禁用
                setRunning(false);
                toast.error("轮询失败次数过多，已停止");
            }
            return;
        }
        pollFailures[kind] = 0;
        if (kind === "recursive") recResult.value = res;
        else laResult.value = res;
        // 失败必须单独判定：freqtrade 分析失败返回 status="error"，running 同样为 false，
        // 只按 running 判断会把失败误报成"分析完成"
        const outcome = classifyJob(res);
        if (outcome === "error") {
            clearInterval(timer);
            setRunning(false);
            toast.error(jobErrorText(res, "分析失败"));
            return;
        }
        if (outcome === "success") {
            clearInterval(timer);
            setRunning(false);
            toast.success(kind === "recursive" ? "Recursive 分析完成" : "Lookahead 分析完成");
            return;
        }
        setRunning(true);
    }, 3000);
    pollTimers.push(timer);
}

async function startRecursive() {
    if (!strategy.value || !pairsText.value || !timerange.value) {
        toast.error("请填写策略、币对与时间范围");
        return;
    }
    const res = await runApi(() =>
        getClient().btPost("/api/v1/recursive_analysis", {
            strategy: strategy.value,
            pairs: pairsText.value.split(/[\n,;\s]+/).filter(Boolean),
            timerange: timerange.value
        })
    );
    if (res?.job_id) {
        recJobId.value = res.job_id;
        recRunning.value = true;
        startPolling(recJobId.value, "recursive");
    }
}

async function startLookahead() {
    if (!strategy.value || !pairsText.value || !timerange.value) {
        toast.error("请填写策略、币对与时间范围");
        return;
    }
    const res = await runApi(() =>
        getClient().btPost("/api/v1/lookahead_analysis", {
            strategy: strategy.value,
            pairs: pairsText.value.split(/[\n,;\s]+/).filter(Boolean),
            timerange: timerange.value
        })
    );
    if (res?.job_id) {
        laJobId.value = res.job_id;
        laRunning.value = true;
        startPolling(laJobId.value, "lookahead");
    }
}
</script>

<template>
    <div class="mx-auto max-w-4xl space-y-3">
        <Card>
            <CardHeader class="pb-3">
                <CardTitle class="text-base">高级策略分析</CardTitle>
                <CardDescription>
                    <Badge :variant="hasBacktestService ? 'default' : 'outline'" class="mr-1">
                        {{ hasBacktestService ? "已连接回测服务" : "需要 Webserver 模式" }}
                    </Badge>
                    <template v-if="hasBacktestService">
                        分析任务将提交到回测服务
                        <span class="font-mono text-xs">{{ btUrl }}</span>。
                    </template>
                    <template v-else>
                        这两项分析仅在独立的 webserver 进程（freqtrade
                        webserver）中可用；请在机器人配置中填写回测地址。
                    </template>
                </CardDescription>
            </CardHeader>
            <CardContent class="space-y-3">
                <div class="grid gap-3 sm:grid-cols-3">
                    <div class="space-y-1.5">
                        <Label>策略</Label>
                        <Input v-model="strategy" />
                    </div>
                    <div class="space-y-1.5">
                        <Label>时间范围</Label>
                        <Input v-model="timerange" />
                    </div>
                    <div class="space-y-1.5 sm:col-span-1">
                        <Label>币对数量</Label>
                        <div class="text-sm text-muted-foreground pt-2">
                            {{ pairsText.split(/[\n,;\s]+/).filter(Boolean).length }} 个
                        </div>
                    </div>
                </div>
                <div class="space-y-1.5">
                    <Label>币对（每行一个）</Label>
                    <Textarea v-model="pairsText" rows="5" class="font-mono text-xs" />
                </div>
            </CardContent>
        </Card>

        <Tabs default-value="recursive">
            <TabsList>
                <TabsTrigger value="recursive"
                    ><Microscope class="mr-1 size-3.5" />Recursive 递归分析</TabsTrigger
                >
                <TabsTrigger value="lookahead"
                    ><ArrowLeftRight class="mr-1 size-3.5" />Lookahead 前视偏差</TabsTrigger
                >
            </TabsList>

            <TabsContent value="recursive">
                <Card>
                    <CardHeader class="pb-2">
                        <CardTitle class="text-base">递归分析</CardTitle>
                        <CardDescription
                            >检测策略信号是否存在递归计算问题（信号随回放起点漂移）</CardDescription
                        >
                    </CardHeader>
                    <CardContent class="space-y-3">
                        <Button :disabled="recRunning" @click="startRecursive">
                            {{ recRunning ? "分析中…" : "开始分析" }}
                        </Button>
                        <div v-if="recResult" class="rounded-md border bg-muted/30 p-3 text-sm">
                            <div
                                :class="
                                    classifyJob(recResult) === 'error' ? 'text-destructive' : ''
                                "
                            >
                                状态：{{ outcomeLabel(classifyJob(recResult))
                                }}<template v-if="recResult.status_msg">
                                    · {{ analysisStatusText(recResult) }}</template
                                >
                            </div>
                            <pre
                                v-if="recResult.result"
                                class="mt-2 max-h-72 overflow-auto font-mono text-xs"
                                >{{ JSON.stringify(recResult.result, null, 2) }}</pre>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="lookahead">
                <Card>
                    <CardHeader class="pb-2">
                        <CardTitle class="text-base">前视偏差分析</CardTitle>
                        <CardDescription
                            >检测策略是否使用了未来函数（lookahead bias）</CardDescription
                        >
                    </CardHeader>
                    <CardContent class="space-y-3">
                        <Button :disabled="laRunning" @click="startLookahead">
                            {{ laRunning ? "分析中…" : "开始分析" }}
                        </Button>
                        <div v-if="laResult" class="rounded-md border bg-muted/30 p-3 text-sm">
                            <div
                                :class="classifyJob(laResult) === 'error' ? 'text-destructive' : ''"
                            >
                                状态：{{ outcomeLabel(classifyJob(laResult))
                                }}<template v-if="laResult.status_msg">
                                    · {{ analysisStatusText(laResult) }}</template
                                >
                            </div>
                            <pre
                                v-if="laResult.result"
                                class="mt-2 max-h-72 overflow-auto font-mono text-xs"
                                >{{ JSON.stringify(laResult.result, null, 2) }}</pre>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    </div>
</template>

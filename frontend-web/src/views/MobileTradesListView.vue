<script setup lang="ts">
import { ref, computed } from "vue";
import { toast } from "vue-sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { TrendingUp, TrendingDown, X } from "lucide-vue-next";
import EmptyState from "@/components/ft/EmptyState.vue";
import { api, runApi, usePolling, type Trade } from "@/composables/useBotData";
import {
    fmtPct,
    fmtCoin,
    fmtPrice,
    fmtDuration,
    profitColor,
    directionZh,
    entryTagZh
} from "@/lib/format";

const loading = ref(true);
const trades = ref<Trade[]>([]);
const stake = ref("USDT");
const confirmId = ref<number | null>(null);
// 弹窗关闭会先清空 confirmId，点击确认时通过独立变量取目标，避免竞态发出 tradeid="null"
const pendingExitId = ref<number | null>(null);
function openExitConfirm(id: number) {
    pendingExitId.value = id;
    confirmId.value = id;
}

async function load() {
    const [status, cfg] = await Promise.all([
        runApi(() => api.status(), true),
        runApi(() => api.showConfig(), true)
    ]);
    if (status) trades.value = status;
    if (cfg?.stake_currency) stake.value = cfg.stake_currency;
    loading.value = false;
}

usePolling(load);

async function forceExit(id: number) {
    pendingExitId.value = null;
    confirmId.value = null;
    const res = await runApi(() => api.forceExit(id));
    if (res) {
        toast.success(`已提交平仓（#${id}）`);
        load();
    }
}

// 汇总为派生状态,无需 deep watch 手动维护
const totalProfit = computed(() => trades.value.reduce((s, t) => s + (t.profit_abs ?? 0), 0));
</script>

<template>
    <div class="mx-auto max-w-lg space-y-3">
        <!-- 汇总条 -->
        <div class="flex items-center justify-between rounded-lg border bg-card p-3">
            <span class="text-sm text-muted-foreground">当前 {{ trades.length }} 笔持仓</span>
            <span class="text-sm font-semibold tabular-nums" :class="profitColor(totalProfit)">
                {{ fmtCoin(totalProfit, stake) }}
            </span>
        </div>

        <Skeleton v-if="loading" class="h-32 w-full" />
        <EmptyState
            v-else-if="!trades.length"
            class="rounded-lg border border-dashed p-10"
            title="当前没有持仓"
        />

        <!-- 持仓卡片 -->
        <Card v-for="t in trades" :key="t.trade_id" class="overflow-hidden">
            <div class="h-1" :class="t.is_short ? 'bg-orange-500' : 'bg-sky-500'" />
            <CardContent class="space-y-2 pb-3 pt-3">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <Badge :variant="t.is_short ? 'destructive' : 'outline'" class="gap-1">
                            <TrendingDown v-if="t.is_short" class="size-3" />
                            <TrendingUp v-else class="size-3" />
                            {{ directionZh(t.is_short)
                            }}{{ t.leverage && t.leverage > 1 ? ` ${t.leverage}x` : "" }}
                        </Badge>
                        <span class="text-base font-bold">{{ t.pair.split("/")[0] }}</span>
                        <span class="text-xs text-muted-foreground">#{{ t.trade_id }}</span>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        class="size-8 text-destructive"
                        @click="openExitConfirm(t.trade_id)"
                    >
                        <X class="size-4" />
                    </Button>
                </div>

                <div class="flex items-end justify-between">
                    <div class="text-xs text-muted-foreground">
                        开仓 {{ fmtPrice(t.open_rate) }} → 现 {{ fmtPrice(t.current_rate) }}
                    </div>
                    <div class="text-right">
                        <div
                            class="text-xl font-bold tabular-nums"
                            :class="profitColor(t.profit_ratio)"
                        >
                            {{ fmtPct(t.profit_ratio) }}
                        </div>
                        <div class="text-xs tabular-nums" :class="profitColor(t.profit_abs)">
                            {{ fmtCoin(t.profit_abs, stake) }}
                        </div>
                    </div>
                </div>

                <div class="flex justify-between text-xs text-muted-foreground">
                    <span>持仓 {{ fmtDuration(t.open_date) }}</span>
                    <span class="max-w-40 truncate" :title="t.enter_tag">{{
                        entryTagZh(t.enter_tag)
                    }}</span>
                </div>
            </CardContent>
        </Card>

        <AlertDialog :open="confirmId !== null" @update:open="confirmId = null">
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>确认强制平仓？</AlertDialogTitle>
                    <AlertDialogDescription
                        >将立即市价平掉交易 #{{ confirmId }}，不论盈亏。</AlertDialogDescription
                    >
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                        class="bg-destructive text-white hover:bg-destructive/90"
                        @click="forceExit(pendingExitId!)"
                    >
                        确认平仓
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
</template>

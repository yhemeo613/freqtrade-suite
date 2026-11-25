<script setup lang="ts">
import { ref, computed } from "vue";
import { showConfirmDialog, showSuccessToast, showFailToast } from "vant";
import { PullRefresh, Button, Empty, Tag, Cell, CellGroup, Icon } from "vant";
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
const refreshing = ref(false);

async function load() {
    const [status, cfg] = await Promise.all([
        runApi(() => api.status(), true),
        runApi(() => api.showConfig(), true)
    ]);
    if (status) trades.value = status;
    if (cfg?.stake_currency) stake.value = cfg.stake_currency;
    loading.value = false;
    refreshing.value = false;
}

usePolling(load);

const totalProfit = computed(() => trades.value.reduce((s, t) => s + (t.profit_abs ?? 0), 0));

async function onRefresh() {
    await load();
    showSuccessToast("已刷新");
}

async function forceExit(t: Trade) {
    try {
        await showConfirmDialog({
            title: "确认强制平仓？",
            message: `将立即市价平掉 ${t.pair.split("/")[0]}（#${t.trade_id}），不论盈亏。`
        });
    } catch {
        return;
    }
    const res = await runApi(() => api.forceExit(t.trade_id));
    if (res) {
        showSuccessToast(`已提交平仓 #${t.trade_id}`);
        void load();
    } else {
        showFailToast("平仓失败");
    }
}
</script>

<template>
    <PullRefresh v-model="refreshing" class="min-h-[70vh]" @refresh="onRefresh">
        <!-- 汇总 -->
        <CellGroup inset class="!mt-3">
            <Cell>
                <template #title>
                    <span class="text-sm text-gray-500">当前持仓</span>
                    <span class="ml-1 text-sm font-bold">{{ trades.length }}</span>
                    <span class="ml-2 text-xs text-gray-400">笔</span>
                </template>
                <template #value>
                    <span class="text-sm font-bold tabular-nums" :class="profitColor(totalProfit)">
                        {{ fmtCoin(totalProfit, stake) }}
                    </span>
                </template>
            </Cell>
        </CellGroup>

        <div v-if="loading" class="py-10 text-center text-sm text-gray-400">加载中…</div>

        <Empty v-else-if="!trades.length" image="search" description="当前没有持仓" class="py-10" />

        <!-- 持仓卡片 -->
        <div
            v-for="t in trades"
            :key="t.trade_id"
            class="mx-3 mt-3 overflow-hidden rounded-xl bg-white shadow-sm"
        >
            <div class="h-1" :class="t.is_short ? 'bg-orange-400' : 'bg-sky-500'" />
            <div class="space-y-2 p-3">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <Tag :type="t.is_short ? 'warning' : 'primary'" plain round>
                            <Icon :name="t.is_short ? 'down' : 'up'" size="10" />
                            {{ directionZh(t.is_short) }}
                        </Tag>
                        <span class="text-base font-bold">{{ t.pair.split("/")[0] }}</span>
                        <span class="text-xs text-gray-400">#{{ t.trade_id }}</span>
                        <Tag v-if="t.leverage && t.leverage > 1" plain>{{ t.leverage }}x</Tag>
                    </div>
                    <Button size="small" type="danger" plain round @click="forceExit(t)"
                        >平仓</Button
                    >
                </div>

                <div class="flex items-end justify-between">
                    <div class="space-y-0.5 text-xs text-gray-500">
                        <div>
                            开仓 {{ fmtPrice(t.open_rate) }} → 现 {{ fmtPrice(t.current_rate) }}
                        </div>
                        <div>持有 {{ fmtDuration(t.open_date) }}</div>
                        <div class="max-w-44 truncate" :title="t.enter_tag">
                            {{ entryTagZh(t.enter_tag) }}
                        </div>
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
            </div>
        </div>

        <div class="h-6" />
    </PullRefresh>
</template>

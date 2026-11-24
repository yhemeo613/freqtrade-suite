<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/ft/EmptyState.vue";
import { api, runApi, usePolling } from "@/composables/useBotData";
import { fmtCoin, fmtPct, profitColor } from "@/lib/format";
import type { PerformanceEntry, EntryTagEntry, ExitReasonEntry, MixTagEntry } from "@/api/types";

const props = defineProps<{ stakeCurrency: string }>();
const tab = ref("performance");
const performance = ref<PerformanceEntry[]>([]);
const entries = ref<EntryTagEntry[]>([]);
const exits = ref<ExitReasonEntry[]>([]);
const mixTags = ref<MixTagEntry[]>([]);
// 按标签独立加载状态：避免全局互斥导致快速切换标签时请求被吞
const loadingTabs = ref<Record<string, boolean>>({});
const stake = computed(() => props.stakeCurrency || "USDT");

async function loadTab(name: string) {
    if (loadingTabs.value[name]) return;
    loadingTabs.value[name] = true;
    const map: Record<string, () => Promise<unknown>> = {
        performance: api.performance,
        entries: api.entryTags,
        exits: api.exitReasons,
        mixTags: api.mixTags
    };
    try {
        const res = await runApi(map[name], true);
        if (res) {
            if (name === "performance") performance.value = res as PerformanceEntry[];
            else if (name === "entries") entries.value = res as EntryTagEntry[];
            else if (name === "exits") exits.value = res as ExitReasonEntry[];
            else mixTags.value = res as MixTagEntry[];
        }
    } finally {
        loadingTabs.value[name] = false;
    }
}

/** 当前激活标签的数据集合（用于轮询刷新） */
function dataOf(name: string): unknown[] {
    const map: Record<string, unknown[]> = {
        performance: performance.value,
        entries: entries.value,
        exits: exits.value,
        mixTags: mixTags.value
    };
    return map[name] ?? [];
}

function onTabChange(v: string | number) {
    tab.value = String(v);
    if (!dataOf(tab.value).length) void loadTab(tab.value);
}

/** 动态列名取值（各统计项首列字段不同：pair / enter_tag / ...） */
function rowLabel(row: unknown, key: string): string {
    if (!row || typeof row !== "object") return "";
    return String((row as Record<string, unknown>)[key] ?? "");
}

// 当前标签已有数据时随轮询持续刷新（新平仓/新标签无需切 tab 重进）
usePolling(async () => {
    if (dataOf(tab.value).length) await loadTab(tab.value);
});

onMounted(() => void loadTab("performance"));
</script>

<template>
    <Tabs default-value="performance" @update:model-value="onTabChange">
        <TabsList>
            <TabsTrigger value="performance">币对表现</TabsTrigger>
            <TabsTrigger value="entries">入场标签</TabsTrigger>
            <TabsTrigger value="exits">出场原因</TabsTrigger>
            <TabsTrigger value="mixTags">组合标签</TabsTrigger>
        </TabsList>
        <template
            v-for="t in [
                { key: 'performance', rows: performance, c1: 'pair', title: '币对' },
                { key: 'entries', rows: entries, c1: 'enter_tag', title: '入场标签' },
                { key: 'exits', rows: exits, c1: 'exit_reason', title: '出场原因' },
                { key: 'mixTags', rows: mixTags, c1: 'mix_tag', title: '组合' }
            ]"
            :key="t.key"
        >
            <TabsContent :value="t.key">
                <div v-if="loadingTabs[t.key] && !t.rows.length" class="py-4">
                    <Skeleton class="h-20 w-full" />
                </div>
                <EmptyState v-else-if="!t.rows.length" title="暂无已平仓数据" />
                <Table v-else>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{{ t.title }}</TableHead>
                            <TableHead class="text-right">笔数</TableHead>
                            <TableHead class="text-right">收益%</TableHead>
                            <TableHead class="text-right">收益 ({{ stake }})</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow v-for="(row, i) in t.rows" :key="i">
                            <TableCell
                                class="max-w-64 truncate font-medium"
                                :title="rowLabel(row, t.c1)"
                                >{{ rowLabel(row, t.c1) }}</TableCell
                            >
                            <TableCell class="text-right tabular-nums">{{
                                row.trade_count ?? row.count
                            }}</TableCell>
                            <TableCell
                                class="text-right tabular-nums font-medium"
                                :class="profitColor(row.profit_ratio)"
                            >
                                {{ fmtPct(row.profit_ratio) }}
                            </TableCell>
                            <TableCell
                                class="text-right tabular-nums"
                                :class="profitColor(row.profit_abs)"
                            >
                                {{ fmtCoin(row.profit_abs, stake) }}
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </TabsContent>
        </template>
    </Tabs>
</template>

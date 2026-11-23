<script setup lang="ts">
import { ref, computed } from "vue";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Wallet, RefreshCw } from "lucide-vue-next";
import EmptyState from "@/components/ft/EmptyState.vue";
import { getClient } from "@/api/client";
import { runApi, usePolling } from "@/composables/useBotData";
import { fmtCoin, fmtPct, profitColor } from "@/lib/format";
import type { BalanceResponse } from "@/api/types";

const loading = ref(true);
const full = ref(false);
const balance = ref<BalanceResponse | null>(null);

async function load() {
    const res = await runApi(
        () => getClient().get("/api/v1/balance" + (full.value ? "?full=true" : "")),
        true
    );
    if (res) balance.value = res as BalanceResponse;
    loading.value = false;
}

function toggleFull() {
    full.value = !full.value;
    load();
}

usePolling(load);

const stake = computed(() => balance.value?.stake ?? "USDT");
const hasTrades = computed(() => (balance.value?.starting_capital_ratio ?? null) !== null);
</script>

<template>
    <div class="space-y-3">
        <Card>
            <CardHeader class="pb-2">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <CardTitle class="flex items-center gap-2 text-base">
                            <Wallet class="size-4" />账户余额
                        </CardTitle>
                        <CardDescription v-if="!full"
                            >仅展示机器人管理的资产；切换「完整账户」查看全部</CardDescription
                        >
                        <CardDescription v-else
                            >完整账户余额（含非机器人管理的资产）</CardDescription
                        >
                    </div>
                    <Button variant="outline" size="sm" @click="toggleFull">
                        {{ full ? "仅机器人资产" : "完整账户" }}
                    </Button>
                </div>
            </CardHeader>
            <CardContent class="space-y-3">
                <div v-if="balance" class="grid gap-3 sm:grid-cols-3">
                    <div class="rounded-md border p-3">
                        <div class="text-xs text-muted-foreground">合计折合 {{ stake }}</div>
                        <div class="mt-0.5 text-xl font-semibold tabular-nums">
                            {{
                                fmtCoin(
                                    full ? balance.total : (balance.total_bot ?? balance.total),
                                    stake
                                )
                            }}
                        </div>
                    </div>
                    <div class="rounded-md border p-3">
                        <div class="text-xs text-muted-foreground">起始资金</div>
                        <div class="mt-0.5 text-xl font-semibold tabular-nums">
                            {{ fmtCoin(balance.starting_capital, stake) }}
                            <span
                                v-if="hasTrades"
                                class="text-sm"
                                :class="profitColor(balance.starting_capital_ratio)"
                            >
                                {{ fmtPct(balance.starting_capital_ratio) }}
                            </span>
                        </div>
                    </div>
                    <div class="rounded-md border p-3">
                        <div class="text-xs text-muted-foreground">
                            折合 {{ balance.symbol || "USD" }}
                        </div>
                        <div class="mt-0.5 text-xl font-semibold tabular-nums">
                            {{ balance.symbol ? fmtCoin(balance.value, balance.symbol) : "—" }}
                        </div>
                    </div>
                </div>
                <Skeleton v-else-if="loading" class="h-24 w-full" />

                <Table v-if="balance?.currencies?.length">
                    <TableHeader>
                        <TableRow>
                            <TableHead>币种</TableHead>
                            <TableHead class="text-right">可用</TableHead>
                            <TableHead class="text-right">余额</TableHead>
                            <TableHead class="text-right">占用</TableHead>
                            <TableHead class="text-right">折合 {{ stake }}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow v-for="c in balance.currencies" :key="c.currency">
                            <TableCell class="font-medium">
                                {{ c.currency }}
                                <Badge v-if="c.is_position" variant="outline" class="ml-1 text-xs"
                                    >持仓</Badge
                                >
                            </TableCell>
                            <TableCell class="text-right tabular-nums">{{
                                c.is_position ? "—" : fmtCoin(c.free, c.currency, 4)
                            }}</TableCell>
                            <TableCell class="text-right tabular-nums">{{
                                c.is_position ? "—" : fmtCoin(c.balance, c.currency, 4)
                            }}</TableCell>
                            <TableCell class="text-right tabular-nums">{{
                                c.is_position ? "—" : fmtCoin(c.used, c.currency, 4)
                            }}</TableCell>
                            <TableCell class="text-right tabular-nums font-medium">{{
                                fmtCoin(c.est_stake, stake)
                            }}</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
                <EmptyState v-else-if="!loading" title="暂无资产数据" />

                <div class="flex justify-end">
                    <Button variant="ghost" size="sm" @click="load"
                        ><RefreshCw class="size-3.5" />刷新</Button
                    >
                </div>
            </CardContent>
        </Card>
    </div>
</template>

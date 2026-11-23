<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { toast } from "vue-sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
    Play,
    Pause,
    Square,
    RefreshCw,
    LogOut,
    MoreHorizontal,
    Search,
    Zap,
    Trash2,
    RotateCw,
    XCircle,
    TrendingUp,
    TrendingDown
} from "lucide-vue-next";
import LocksCard from "@/components/ft/LocksCard.vue";
import PerformancePanel from "@/components/ft/PerformancePanel.vue";
import { FreqWs } from "@/api/ws";
import type { Order, CustomDataEntry } from "@/api/types";
import { api, runApi, usePolling, type Trade } from "@/composables/useBotData";
import {
    fmtPct,
    fmtCoin,
    fmtPrice,
    fmtDate,
    fmtDuration,
    profitColor,
    exitReasonZh,
    entryTagZh,
    directionZh,
    shortPair
} from "@/lib/format";
import { parseOptionalPrice } from "@/lib/parse";

/* ---------- 状态 ---------- */
const loading = ref(true);
const openTrades = ref<Trade[]>([]);
const closedTrades = ref<Trade[]>([]);
const botState = ref<string>("—");
const stakeCurrency = ref("USDT");
const search = ref("");
const detailTrade = ref<Trade | null>(null);
const detailOrders = ref<Order[]>([]);
const detailCustomData = ref<CustomDataEntry[] | null>(null);
const confirmExitId = ref<string | number | null>(null);
// 弹窗关闭会先清空 confirmExitId，点击确认时通过独立变量取目标，避免竞态发出 null
const pendingExitId = ref<string | number | null>(null);
function openExitConfirm(id: string | number) {
    pendingExitId.value = id;
    confirmExitId.value = id;
}
const confirmDeleteId = ref<number | null>(null);
const pendingDeleteId = ref<number | null>(null);
function openDeleteConfirm(id: number) {
    pendingDeleteId.value = id;
    confirmDeleteId.value = id;
}
const acting = ref(false);
const forceEntryEnable = ref(false);

/* 强制开仓弹窗 */
const showForceEntry = ref(false);
const fePair = ref("");
const fePrice = ref("");
const feSide = ref<"long" | "short">("long");

const stateMap: Record<string, string> = {
    running: "运行中",
    paused: "已暂停",
    stopped: "已停止",
    reload_config: "重载配置中"
};

async function loadAll() {
    const [status, trades, config] = await Promise.all([
        runApi(() => api.status(), true),
        runApi(() => api.trades(50), true),
        runApi(() => api.showConfig(), true)
    ]);
    if (status) openTrades.value = status;
    if (trades)
        closedTrades.value = (trades.trades ?? []).filter((t: Trade) => !t.is_open).reverse();
    if (config) {
        botState.value = stateMap[config.state] ?? config.state;
        stakeCurrency.value = config.stake_currency ?? "USDT";
        forceEntryEnable.value = !!config.force_entry_enable;
    }
    loading.value = false;
}

usePolling(loadAll);

// WebSocket 实时推送：开平仓消息立即刷新 + toast（轮询作为兜底）
const ws = new FreqWs([
    (topic, data) => {
        if (!topic) return;
        const up = topic.toUpperCase();
        if (up.includes("ENTRY")) {
            toast.info(`新开仓: ${data?.pair ?? ""}`);
            loadAll();
        } else if (up.includes("EXIT") && !up.includes("CANCEL")) {
            toast.success(
                `平仓: ${data?.pair ?? ""}（${((data?.profit_ratio ?? 0) * 100).toFixed(2)}%）`
            );
            loadAll();
        } else if (up.includes("STATUS") || up.includes("PROTECTION")) {
            loadAll();
        }
    }
]);
ws.start();
onUnmounted(() => ws.stop());

/* ---------- 过滤 ---------- */
const filteredClosed = computed(() => {
    const q = search.value.trim().toUpperCase();
    if (!q) return closedTrades.value;
    return closedTrades.value.filter(
        (t) => t.pair.toUpperCase().includes(q) || String(t.trade_id).includes(q)
    );
});

/* ---------- 控制操作 ---------- */
async function botAction(action: "start" | "pause" | "stop" | "reloadConfig") {
    acting.value = true;
    const res = await runApi(() => api[action]());
    acting.value = false;
    if (res) {
        toast.success(res.status ?? "已执行");
        loadAll();
    }
}

async function forceExit(id: string | number) {
    acting.value = true;
    const res = await runApi(() => api.forceExit(id));
    acting.value = false;
    confirmExitId.value = null;
    pendingExitId.value = null;
    if (res) {
        toast.success(`已提交平仓指令（${id === "all" ? "全部" : `#${id}`}）`);
        loadAll();
    }
}

async function deleteTrade(id: number) {
    acting.value = true;
    const res = await runApi(() => api.deleteTrade(id));
    acting.value = false;
    confirmDeleteId.value = null;
    pendingDeleteId.value = null;
    if (res) {
        toast.success(res.result_msg ?? `已删除交易 #${id}`);
        detailTrade.value = null;
        loadAll();
    }
}

async function cancelOpenOrder(id: number) {
    acting.value = true;
    const res = await runApi(() => api.cancelOpenOrder(id));
    acting.value = false;
    if (res) {
        toast.success(`交易 #${id} 的挂单已取消`);
        loadAll();
        if (detailTrade.value?.trade_id === id) openDetail(detailTrade.value);
    }
}

async function reloadTrade(id: number) {
    acting.value = true;
    const res = await runApi(() => api.reloadTrade(id));
    acting.value = false;
    if (res) {
        toast.success(`交易 #${id} 已从交易所重载`);
        loadAll();
        if (detailTrade.value?.trade_id === id) openDetail(detailTrade.value);
    }
}

async function submitForceEntry() {
    if (!fePair.value.trim()) {
        toast.error("请输入交易对");
        return;
    }
    const price = parseOptionalPrice(fePrice.value);
    if (price === null) {
        toast.error("价格格式不正确（应为正数，留空表示市价）");
        return;
    }
    acting.value = true;
    const res = await runApi(() =>
        api.forceEntry(fePair.value.trim().toUpperCase(), feSide.value, price)
    );
    acting.value = false;
    showForceEntry.value = false;
    if (res) {
        toast.success(
            `已提交强制开仓：${fePair.value}（${feSide.value === "long" ? "多" : "空"}）`
        );
        fePair.value = "";
        fePrice.value = "";
        loadAll();
    }
}

/* ---------- 详情 ---------- */
async function openDetail(t: Trade) {
    detailTrade.value = t;
    detailOrders.value = t.orders ?? [];
    detailCustomData.value = null;
}

async function loadCustomData() {
    const trade = detailTrade.value;
    if (!trade) return;
    const tradeId = trade.trade_id;
    const res = await runApi(() => api.tradeCustomData(tradeId));
    // 请求期间可能已切换到别的交易，丢弃过期响应避免串数据
    if (!detailTrade.value || detailTrade.value.trade_id !== tradeId) return;
    if (res) detailCustomData.value = res;
}

const totalOpenProfit = computed(() =>
    openTrades.value.reduce((s, t) => s + (t.profit_abs ?? 0), 0)
);
const totalOpenRatio = computed(() => {
    const stake = openTrades.value.reduce((s, t) => s + (t.stake_amount ?? 0), 0);
    return stake ? totalOpenProfit.value / stake : 0;
});
</script>

<template>
    <div class="space-y-3">
        <!-- 控制栏 -->
        <Card>
            <CardContent class="flex flex-wrap items-center gap-2 py-3">
                <Badge variant="outline" class="gap-1 text-sm">
                    <span
                        class="size-2 rounded-full"
                        :class="
                            botState === '运行中'
                                ? 'bg-success'
                                : botState === '已暂停' || botState === '重载配置中'
                                  ? 'bg-warning'
                                  : 'bg-destructive'
                        "
                    />
                    {{ botState }}
                </Badge>
                <div class="ml-auto flex flex-wrap gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        :disabled="acting || botState === '运行中'"
                        @click="botAction('start')"
                    >
                        <Play class="size-3.5" />启动
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        :disabled="acting || botState === '已暂停'"
                        @click="botAction('pause')"
                    >
                        <Pause class="size-3.5" />暂停开仓
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        :disabled="acting || botState === '已停止'"
                        @click="botAction('stop')"
                    >
                        <Square class="size-3.5" />停止
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        :disabled="acting"
                        @click="botAction('reloadConfig')"
                    >
                        <RefreshCw class="size-3.5" />重载配置
                    </Button>
                    <Button
                        v-if="forceEntryEnable"
                        size="sm"
                        variant="outline"
                        :disabled="acting"
                        @click="showForceEntry = true"
                    >
                        <Zap class="size-3.5" />强制开仓
                    </Button>
                    <Button
                        size="sm"
                        variant="destructive"
                        :disabled="acting || !openTrades.length"
                        @click="openExitConfirm('all')"
                    >
                        <LogOut class="size-3.5" />全部平仓
                    </Button>
                </div>
            </CardContent>
        </Card>

        <Tabs default-value="trades">
            <TabsList>
                <TabsTrigger value="trades">交易</TabsTrigger>
                <TabsTrigger value="performance">表现统计</TabsTrigger>
                <TabsTrigger value="locks">保护锁定</TabsTrigger>
            </TabsList>

            <!-- 交易主表 -->
            <TabsContent value="trades" class="space-y-3">
                <Card>
                    <CardHeader class="pb-2">
                        <div class="flex items-center justify-between">
                            <CardTitle class="text-base"
                                >当前持仓（{{ openTrades.length }}）</CardTitle
                            >
                            <div v-if="openTrades.length" class="flex items-center gap-1.5 text-sm">
                                <component
                                    :is="totalOpenProfit >= 0 ? TrendingUp : TrendingDown"
                                    class="size-4"
                                    :class="profitColor(totalOpenRatio)"
                                />
                                <span :class="profitColor(totalOpenProfit)">
                                    浮动盈亏 {{ fmtCoin(totalOpenProfit, stakeCurrency) }}（{{
                                        fmtPct(totalOpenRatio)
                                    }}）
                                </span>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>交易对</TableHead>
                                    <TableHead>方向</TableHead>
                                    <TableHead class="text-right">开仓价</TableHead>
                                    <TableHead class="text-right">现价</TableHead>
                                    <TableHead class="text-right">盈亏</TableHead>
                                    <TableHead class="text-right">盈亏%</TableHead>
                                    <TableHead>持仓时长</TableHead>
                                    <TableHead>入场标签</TableHead>
                                    <TableHead class="w-10" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow v-if="loading"
                                    ><TableCell colspan="10"
                                        ><Skeleton class="h-8 w-full" /></TableCell
                                ></TableRow>
                                <TableRow v-else-if="!openTrades.length">
                                    <TableCell
                                        colspan="10"
                                        class="h-24 text-center text-muted-foreground"
                                        >当前没有持仓</TableCell
                                    >
                                </TableRow>
                                <TableRow
                                    v-for="t in openTrades"
                                    :key="t.trade_id"
                                    class="cursor-pointer"
                                    @click="openDetail(t)"
                                >
                                    <TableCell class="text-muted-foreground">{{
                                        t.trade_id
                                    }}</TableCell>
                                    <TableCell class="font-medium">{{
                                        shortPair(t.pair)
                                    }}</TableCell>
                                    <TableCell>
                                        <Badge
                                            :variant="t.is_short ? 'destructive' : 'outline'"
                                            class="font-normal"
                                        >
                                            {{ directionZh(t.is_short)
                                            }}{{
                                                t.leverage && t.leverage > 1
                                                    ? ` ${t.leverage}x`
                                                    : ""
                                            }}
                                        </Badge>
                                    </TableCell>
                                    <TableCell class="text-right tabular-nums">{{
                                        fmtPrice(t.open_rate)
                                    }}</TableCell>
                                    <TableCell class="text-right tabular-nums">{{
                                        fmtPrice(t.current_rate)
                                    }}</TableCell>
                                    <TableCell
                                        class="text-right tabular-nums"
                                        :class="profitColor(t.profit_abs)"
                                    >
                                        {{ fmtCoin(t.profit_abs, stakeCurrency) }}
                                    </TableCell>
                                    <TableCell
                                        class="text-right tabular-nums font-medium"
                                        :class="profitColor(t.profit_ratio)"
                                    >
                                        {{ fmtPct(t.profit_ratio) }}
                                    </TableCell>
                                    <TableCell class="text-muted-foreground">{{
                                        fmtDuration(t.open_date)
                                    }}</TableCell>
                                    <TableCell
                                        class="max-w-40 truncate text-xs text-muted-foreground"
                                        :title="t.enter_tag"
                                    >
                                        {{ entryTagZh(t.enter_tag) }}
                                    </TableCell>
                                    <TableCell @click.stop>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger as-child>
                                                <Button variant="ghost" size="icon" class="size-8"
                                                    ><MoreHorizontal class="size-4"
                                                /></Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem @click="openDetail(t)"
                                                    >查看详情</DropdownMenuItem
                                                >
                                                <DropdownMenuItem
                                                    class="text-destructive"
                                                    @click="openExitConfirm(t.trade_id)"
                                                    >强制平仓</DropdownMenuItem
                                                >
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader class="pb-2">
                        <div class="flex items-center justify-between gap-3">
                            <CardTitle class="text-base"
                                >历史平仓（{{ closedTrades.length }}）</CardTitle
                            >
                            <div class="relative w-56">
                                <Search
                                    class="absolute left-2.5 top-2.5 size-4 text-muted-foreground"
                                />
                                <Input
                                    v-model="search"
                                    placeholder="搜索交易对 / ID"
                                    class="pl-8"
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent class="max-h-96 overflow-auto">
                        <Table>
                            <TableHeader class="sticky top-0 bg-card">
                                <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>交易对</TableHead>
                                    <TableHead>方向</TableHead>
                                    <TableHead class="text-right">开仓价</TableHead>
                                    <TableHead class="text-right">平仓价</TableHead>
                                    <TableHead class="text-right">盈亏</TableHead>
                                    <TableHead class="text-right">盈亏%</TableHead>
                                    <TableHead>平仓原因</TableHead>
                                    <TableHead>开仓 → 平仓</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow v-if="!filteredClosed.length">
                                    <TableCell
                                        colspan="9"
                                        class="h-20 text-center text-muted-foreground"
                                        >暂无平仓记录</TableCell
                                    >
                                </TableRow>
                                <TableRow
                                    v-for="t in filteredClosed"
                                    :key="t.trade_id"
                                    class="cursor-pointer"
                                    @click="openDetail(t)"
                                >
                                    <TableCell class="text-muted-foreground">{{
                                        t.trade_id
                                    }}</TableCell>
                                    <TableCell class="font-medium">{{
                                        shortPair(t.pair)
                                    }}</TableCell>
                                    <TableCell>
                                        <Badge
                                            :variant="t.is_short ? 'destructive' : 'outline'"
                                            class="font-normal"
                                        >
                                            {{ directionZh(t.is_short) }}
                                        </Badge>
                                    </TableCell>
                                    <TableCell class="text-right tabular-nums">{{
                                        fmtPrice(t.open_rate)
                                    }}</TableCell>
                                    <TableCell class="text-right tabular-nums">{{
                                        fmtPrice(t.close_rate)
                                    }}</TableCell>
                                    <TableCell
                                        class="text-right tabular-nums"
                                        :class="profitColor(t.profit_abs)"
                                    >
                                        {{ fmtCoin(t.profit_abs, stakeCurrency) }}
                                    </TableCell>
                                    <TableCell
                                        class="text-right tabular-nums font-medium"
                                        :class="profitColor(t.profit_ratio)"
                                    >
                                        {{ fmtPct(t.profit_ratio) }}
                                    </TableCell>
                                    <TableCell class="text-xs">{{
                                        exitReasonZh(t.exit_reason)
                                    }}</TableCell>
                                    <TableCell class="text-xs text-muted-foreground">
                                        {{ fmtDate(t.open_date) }} → {{ fmtDate(t.close_date) }}
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="performance">
                <Card>
                    <CardContent class="pt-4">
                        <PerformancePanel :stake-currency="stakeCurrency" />
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="locks">
                <LocksCard />
            </TabsContent>
        </Tabs>

        <!-- 详情弹窗 -->
        <Dialog :open="!!detailTrade" @update:open="detailTrade = null">
            <DialogContent class="max-w-xl">
                <DialogHeader>
                    <DialogTitle class="flex items-center gap-2">
                        交易 #{{ detailTrade?.trade_id }}
                        <Badge :variant="detailTrade?.is_short ? 'destructive' : 'outline'">
                            {{ directionZh(detailTrade?.is_short) }}
                        </Badge>
                    </DialogTitle>
                    <DialogDescription>{{ detailTrade?.pair }}</DialogDescription>
                </DialogHeader>
                <div v-if="detailTrade" class="space-y-3">
                    <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div class="text-muted-foreground">开仓价</div>
                        <div class="text-right tabular-nums">
                            {{ fmtPrice(detailTrade.open_rate) }}
                        </div>
                        <div class="text-muted-foreground">现价 / 平仓价</div>
                        <div class="text-right tabular-nums">
                            {{ fmtPrice(detailTrade.current_rate ?? detailTrade.close_rate) }}
                        </div>
                        <div class="text-muted-foreground">数量</div>
                        <div class="text-right tabular-nums">{{ detailTrade.amount }}</div>
                        <div class="text-muted-foreground">保证金</div>
                        <div class="text-right tabular-nums">
                            {{ fmtCoin(detailTrade.stake_amount, stakeCurrency) }}
                        </div>
                        <div class="text-muted-foreground">盈亏</div>
                        <div
                            class="text-right tabular-nums"
                            :class="profitColor(detailTrade.profit_abs)"
                        >
                            {{ fmtCoin(detailTrade.profit_abs, stakeCurrency) }}（{{
                                fmtPct(detailTrade.profit_ratio)
                            }}）
                        </div>
                        <div class="text-muted-foreground">入场标签</div>
                        <div class="max-w-48 truncate text-right" :title="detailTrade.enter_tag">
                            {{ entryTagZh(detailTrade.enter_tag) }}
                        </div>
                        <div class="text-muted-foreground">平仓原因</div>
                        <div class="text-right">{{ exitReasonZh(detailTrade.exit_reason) }}</div>
                        <div class="text-muted-foreground">开仓 → 平仓</div>
                        <div class="text-right">
                            {{ fmtDate(detailTrade.open_date) }} →
                            {{ fmtDate(detailTrade.close_date) }}
                        </div>
                    </div>

                    <!-- 加仓记录 -->
                    <div v-if="detailOrders.length" class="rounded-md border p-2 text-xs">
                        <div class="mb-1 font-medium text-muted-foreground">
                            订单记录（{{ detailOrders.length }}）
                        </div>
                        <div
                            v-for="(o, i) in detailOrders"
                            :key="i"
                            class="flex justify-between py-0.5"
                        >
                            <span
                                >{{ o.ft_is_entry ? "入场" : "出场" }} #{{ i + 1 }}
                                {{ o.filled ? "已成交" : "未成交" }}</span
                            >
                            <span class="tabular-nums"
                                >{{ o.side }} {{ fmtPrice(o.safe_price ?? o.price) }} ×
                                {{ o.amount }}</span
                            >
                        </div>
                    </div>

                    <!-- 操作 -->
                    <div class="flex flex-wrap gap-2 pt-1">
                        <Button
                            v-if="detailTrade.is_open"
                            size="sm"
                            variant="destructive"
                            @click="openExitConfirm(detailTrade.trade_id)"
                        >
                            <LogOut class="size-3.5" />强制平仓
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            :disabled="acting"
                            @click="reloadTrade(detailTrade.trade_id)"
                        >
                            <RotateCw class="size-3.5" />从交易所重载
                        </Button>
                        <Button
                            v-if="detailTrade.is_open"
                            size="sm"
                            variant="outline"
                            :disabled="acting"
                            @click="cancelOpenOrder(detailTrade.trade_id)"
                        >
                            <XCircle class="size-3.5" />取消挂单
                        </Button>
                        <Button
                            v-if="!detailTrade.is_open"
                            size="sm"
                            variant="outline"
                            class="text-destructive"
                            :disabled="acting"
                            @click="openDeleteConfirm(detailTrade.trade_id)"
                        >
                            <Trash2 class="size-3.5" />删除交易
                        </Button>
                        <Button size="sm" variant="ghost" @click="loadCustomData"
                            >查看自定义数据</Button
                        >
                    </div>
                    <div
                        v-if="detailCustomData"
                        class="max-h-32 overflow-auto rounded-md border p-2 font-mono text-xs"
                    >
                        <div v-for="(c, i) in detailCustomData" :key="i" class="py-0.5">
                            {{ c.key }} = {{ JSON.stringify(c.value) }}
                        </div>
                        <div v-if="!detailCustomData.length" class="text-muted-foreground">
                            无自定义数据
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        <!-- 强制开仓弹窗 -->
        <Dialog :open="showForceEntry" @update:open="showForceEntry = false">
            <DialogContent class="max-w-sm">
                <DialogHeader>
                    <DialogTitle>强制开仓</DialogTitle>
                    <DialogDescription>立即按市价（或指定价格）手动开仓</DialogDescription>
                </DialogHeader>
                <div class="space-y-3">
                    <div class="space-y-1.5">
                        <Label for="fe-pair">交易对</Label>
                        <Input id="fe-pair" v-model="fePair" placeholder="BTC/USDT:USDT" />
                    </div>
                    <div class="space-y-1.5">
                        <Label for="fe-price">价格（留空 = 市价）</Label>
                        <Input id="fe-price" v-model="fePrice" placeholder="市价" />
                    </div>
                    <div class="flex gap-2">
                        <Button
                            class="flex-1"
                            :disabled="acting"
                            @click="
                                feSide = 'long';
                                submitForceEntry();
                            "
                        >
                            做多买入
                        </Button>
                        <Button
                            class="flex-1 bg-orange-600 hover:bg-orange-600/90 text-white"
                            :disabled="acting"
                            @click="
                                feSide = 'short';
                                submitForceEntry();
                            "
                        >
                            做空卖出
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        <!-- 平仓确认 -->
        <AlertDialog :open="confirmExitId !== null" @update:open="confirmExitId = null">
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>确认强制平仓？</AlertDialogTitle>
                    <AlertDialogDescription>
                        {{
                            confirmExitId === "all"
                                ? "将立即市价平掉全部持仓，不论盈亏。"
                                : `将立即市价平掉交易 #${confirmExitId}，不论盈亏。`
                        }}
                    </AlertDialogDescription>
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

        <!-- 删除确认 -->
        <AlertDialog :open="confirmDeleteId !== null" @update:open="confirmDeleteId = null">
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>确认删除交易？</AlertDialogTitle>
                    <AlertDialogDescription>
                        将从数据库删除交易 #{{ confirmDeleteId }}，并关闭其挂单。该操作不可恢复。
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                        class="bg-destructive text-white hover:bg-destructive/90"
                        @click="deleteTrade(pendingDeleteId!)"
                    >
                        删除
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
</template>

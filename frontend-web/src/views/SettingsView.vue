<script setup lang="ts">
import { ref, onMounted } from "vue";
import { toast } from "vue-sonner";
import { useRouter } from "vue-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Moon, Sun, Pencil, Trash2, LogOut, Bot, Cpu } from "lucide-vue-next";
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
import { settingsStore, saveSettings } from "@/stores/settings";
import { authStore, updateBot, removeBot, connectBot, disconnect, activeBot } from "@/stores/auth";
import type { ShowConfigResponse, SysInfoResponse } from "@/api/types";

const router = useRouter();

/* 运行配置（只读展示） */
const config = ref<ShowConfigResponse | null>(null);
const sysinfo = ref<SysInfoResponse | null>(null);
const strategies = ref<string[]>([]);
const freqaiModels = ref<string[]>([]);
const hyperoptLosses = ref<string[]>([]);

onMounted(async () => {
    const { getClient } = await import("@/api/client");
    try {
        config.value = await getClient().get("/api/v1/show_config");
        sysinfo.value = await getClient().get("/api/v1/sysinfo");
    } catch {
        /* 未连接 */
    }
    // webserver 专属端点逐项独立降级：
    // 如镜像未装 FreqAI 依赖时 /freqaimodels 会 500，不应影响其余列表
    try {
        const st = await getClient().btGet("/api/v1/strategies");
        strategies.value = (st.strategies ?? st ?? []).map((x: string | { name?: string }) =>
            typeof x === "string" ? x : (x.name ?? "")
        );
    } catch {
        /* 降级 */
    }
    try {
        const fm = await getClient().btGet("/api/v1/freqaimodels");
        freqaiModels.value = (fm.freqaimodels ?? fm ?? []).map((x: string | { name?: string }) =>
            typeof x === "string" ? x : (x.name ?? "")
        );
    } catch {
        /* 降级 */
    }
    try {
        const hl = await getClient().btGet("/api/v1/hyperoptloss");
        hyperoptLosses.value = (hl.loss_functions ?? hl.hyperoptloss_list ?? hl ?? []).map(
            (x: string | { name?: string }) => (typeof x === "string" ? x : (x.name ?? ""))
        );
    } catch {
        /* 降级 */
    }
});

function setTheme(t: "light" | "dark") {
    settingsStore.theme = t;
    saveSettings();
}

const editing = ref<string | null>(null);
const editName = ref("");
const deleting = ref<string | null>(null);
const deleteOpen = ref(false);

function startEdit(botId: string, name: string) {
    editing.value = botId;
    editName.value = name;
}

function saveEdit() {
    const bot = authStore.bots.find((b) => b.botId === editing.value);
    if (bot && editName.value.trim()) {
        updateBot({ ...bot, botName: editName.value.trim() });
        toast.success("已重命名");
    }
    editing.value = null;
}

// 与 LoginView 相同：AlertDialogAction 内建关闭行为会先触发 update:open，
// 故 open 状态单独管理，避免 confirmDelete 读到已置空的 deleting
function askDelete(botId: string) {
    deleting.value = botId;
    deleteOpen.value = true;
}

function onDialogOpenChange(open: boolean) {
    if (!open) deleteOpen.value = false;
}

function confirmDelete() {
    const id = deleting.value;
    deleteOpen.value = false;
    if (id) {
        const wasActive = id === authStore.activeBotId;
        removeBot(id);
        deleting.value = null;
        toast.success("已删除");
        if (wasActive) router.push("/login");
    }
}

async function switchBot(botId: string) {
    try {
        await connectBot(botId);
        toast.success("已切换");
    } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "连接失败");
    }
}
</script>

<template>
    <div class="mx-auto max-w-3xl space-y-3">
        <!-- 外观 -->
        <Card>
            <CardHeader class="pb-3">
                <CardTitle class="text-base">外观与刷新</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2 text-sm">
                        <component
                            :is="settingsStore.theme === 'dark' ? Moon : Sun"
                            class="size-4"
                        />
                        暗色模式
                    </div>
                    <div class="flex gap-1">
                        <Button
                            :variant="settingsStore.theme === 'light' ? 'default' : 'outline'"
                            size="sm"
                            @click="setTheme('light')"
                        >
                            <Sun class="size-3.5" />亮色
                        </Button>
                        <Button
                            :variant="settingsStore.theme === 'dark' ? 'default' : 'outline'"
                            size="sm"
                            @click="setTheme('dark')"
                        >
                            <Moon class="size-3.5" />暗色
                        </Button>
                    </div>
                </div>
                <Separator />
                <div class="space-y-2">
                    <div class="flex justify-between text-sm">
                        <span>数据刷新间隔</span>
                        <span class="tabular-nums text-muted-foreground"
                            >{{ (settingsStore.refreshIntervalMs / 1000).toFixed(0) }} 秒</span
                        >
                    </div>
                    <Slider
                        :model-value="[settingsStore.refreshIntervalMs / 1000]"
                        :min="3"
                        :max="60"
                        :step="1"
                        @update:model-value="
                            (v: number[] | undefined) => {
                                settingsStore.refreshIntervalMs = (v?.[0] ?? 10) * 1000;
                                saveSettings();
                            }
                        "
                    />
                </div>
                <div class="flex items-center justify-between">
                    <Label for="st-mobile" class="text-sm">移动端卡片模式</Label>
                    <Switch
                        id="st-mobile"
                        v-model="settingsStore.mobileCardMode"
                        @update:model-value="saveSettings"
                    />
                </div>
            </CardContent>
        </Card>

        <!-- 机器人管理 -->
        <Card>
            <CardHeader class="pb-3">
                <CardTitle class="text-base">机器人管理</CardTitle>
                <CardDescription
                    >已保存的连接（密码仅保存在本次会话，关闭浏览器后需重新登录）</CardDescription
                >
            </CardHeader>
            <CardContent class="space-y-2">
                <div
                    v-for="bot in authStore.bots"
                    :key="bot.botId"
                    class="flex items-center gap-2 rounded-md border p-2.5"
                >
                    <Bot class="size-4 text-muted-foreground" />
                    <template v-if="editing === bot.botId">
                        <Input v-model="editName" class="h-8 flex-1" @keyup.enter="saveEdit" />
                        <Button size="sm" @click="saveEdit">保存</Button>
                    </template>
                    <template v-else>
                        <div class="min-w-0 flex-1">
                            <div class="truncate text-sm font-medium">
                                {{ bot.botName }}
                                <Badge
                                    v-if="activeBot()?.botId === bot.botId"
                                    variant="outline"
                                    class="ml-1"
                                    >当前</Badge
                                >
                            </div>
                            <div class="truncate text-xs text-muted-foreground">{{ bot.url }}</div>
                        </div>
                        <Button
                            v-if="activeBot()?.botId !== bot.botId"
                            variant="outline"
                            size="sm"
                            @click="switchBot(bot.botId)"
                            >连接</Button
                        >
                        <Button
                            variant="ghost"
                            size="icon"
                            class="size-8"
                            @click="startEdit(bot.botId, bot.botName)"
                        >
                            <Pencil class="size-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            class="size-8 text-destructive"
                            @click="askDelete(bot.botId)"
                        >
                            <Trash2 class="size-3.5" />
                        </Button>
                    </template>
                </div>
                <div class="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" @click="router.push('/login')"
                        >添加新机器人</Button
                    >
                    <Button
                        v-if="authStore.loggedIn"
                        variant="ghost"
                        size="sm"
                        class="text-destructive"
                        @click="
                            disconnect();
                            router.push('/login');
                        "
                    >
                        <LogOut class="size-3.5" />断开当前连接
                    </Button>
                </div>
            </CardContent>
        </Card>

        <!-- 运行配置（只读） -->
        <Card v-if="config">
            <CardHeader class="pb-3">
                <CardTitle class="text-base">机器人运行配置</CardTitle>
                <CardDescription>只读展示（修改请编辑 config.json 后重载）</CardDescription>
            </CardHeader>
            <CardContent class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <template
                    v-for="row in [
                        ['模式', config.dry_run ? '模拟盘' : '实盘'],
                        ['交易所', config.exchange],
                        ['市场', config.trading_mode],
                        ['保证金模式', config.margin_mode || '—'],
                        ['单笔投入', `${config.stake_amount} ${config.stake_currency}`],
                        ['最大持仓数', config.max_open_trades],
                        ['周期', config.timeframe],
                        ['策略', config.strategy],
                        ['当前状态', config.state]
                    ]"
                    :key="row[0]"
                >
                    <div class="text-muted-foreground">{{ row[0] }}</div>
                    <div class="text-right font-medium">{{ row[1] }}</div>
                </template>
            </CardContent>
        </Card>

        <!-- 系统与资源 -->
        <Card v-if="sysinfo">
            <CardHeader class="pb-3">
                <CardTitle class="flex items-center gap-2 text-base"
                    ><Cpu class="size-4" />系统信息</CardTitle
                >
            </CardHeader>
            <CardContent class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <template
                    v-for="row in [
                        [
                            'CPU 平均占用',
                            sysinfo.cpu_avg != null ? sysinfo.cpu_avg.toFixed(1) + '%' : '—'
                        ],
                        ['CPU 核数', sysinfo.cpu_count ?? '—'],
                        ['内存占用', sysinfo.ram_pct != null ? sysinfo.ram_pct + '%' : '—'],
                        [
                            '负载 (1m/5m/15m)',
                            sysinfo.cpu_load_avg
                                ? [
                                      sysinfo.cpu_load_avg['1m'],
                                      sysinfo.cpu_load_avg['5m'],
                                      sysinfo.cpu_load_avg['15m']
                                  ]
                                      .map((x: any) => x.toFixed(2))
                                      .join(' / ')
                                : '—'
                        ]
                    ]"
                    :key="row[0]"
                >
                    <div class="text-muted-foreground">{{ row[0] }}</div>
                    <div class="text-right font-medium">{{ row[1] }}</div>
                </template>
            </CardContent>
        </Card>

        <!-- 可用策略与模型 -->
        <Card v-if="strategies.length">
            <CardHeader class="pb-3">
                <CardTitle class="text-base">可用策略 / 模型（{{ strategies.length }}）</CardTitle>
                <CardDescription>user_data/strategies 目录下的策略与 FreqAI 模型</CardDescription>
            </CardHeader>
            <CardContent class="space-y-3">
                <div class="flex flex-wrap gap-1.5">
                    <Badge
                        v-for="s in strategies"
                        :key="s"
                        variant="secondary"
                        class="font-normal"
                        >{{ s }}</Badge
                    >
                </div>
                <div v-if="freqaiModels.length" class="space-y-1">
                    <div class="text-xs text-muted-foreground">FreqAI 模型</div>
                    <div class="flex flex-wrap gap-1.5">
                        <Badge
                            v-for="m in freqaiModels"
                            :key="m"
                            variant="outline"
                            class="font-normal"
                            >{{ m }}</Badge
                        >
                    </div>
                </div>
                <div v-if="hyperoptLosses.length" class="space-y-1">
                    <div class="text-xs text-muted-foreground">超参损失函数</div>
                    <div class="flex flex-wrap gap-1.5">
                        <Badge
                            v-for="h in hyperoptLosses"
                            :key="h"
                            variant="outline"
                            class="font-normal"
                            >{{ h }}</Badge
                        >
                    </div>
                </div>
            </CardContent>
        </Card>

        <AlertDialog :open="deleteOpen" @update:open="onDialogOpenChange">
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>删除机器人？</AlertDialogTitle>
                    <AlertDialogDescription
                        >将移除该机器人的保存信息，此操作不可恢复。</AlertDialogDescription
                    >
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                        class="bg-destructive text-white hover:bg-destructive/90"
                        @click="confirmDelete"
                        >删除</AlertDialogAction
                    >
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
</template>

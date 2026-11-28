<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { toast } from "vue-sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Pencil, Trash2, LogIn, Bot } from "lucide-vue-next";
import { authStore, addBot, updateBot, removeBot, connectBot } from "@/stores/auth";
import type { BotConfig } from "@/api/client";

const router = useRouter();
const route = useRoute();

const showForm = ref(false);
const editing = ref<BotConfig | null>(null);
const deleting = ref<BotConfig | null>(null);
const deleteOpen = ref(false);
const connecting = ref<string | null>(null);
const form = ref({ botName: "", url: "", backtestUrl: "", user: "", password: "" });

onMounted(() => {
    if (authStore.loggedIn) router.replace("/trade");
});

function openCreate() {
    editing.value = null;
    form.value = { botName: "", url: "", backtestUrl: "", user: "", password: "" };
    showForm.value = true;
}

function openEdit(bot: BotConfig) {
    editing.value = bot;
    // 不回显已存密码(密码只保存在本次会话);留空表示不修改
    form.value = {
        botName: bot.botName,
        url: bot.url,
        backtestUrl: bot.backtestUrl ?? "",
        user: bot.user,
        password: ""
    };
    showForm.value = true;
}

function submitForm() {
    const { botName, url, backtestUrl, user, password } = form.value;
    if (!botName || !user || (!password && !editing.value)) {
        toast.error("请填写完整信息");
        return;
    }
    const payload = { botName, url: url.trim(), backtestUrl: backtestUrl.trim(), user, password };
    if (editing.value) {
        updateBot({
            ...editing.value,
            ...payload,
            password: payload.password || editing.value.password
        });
        toast.success("已更新");
    } else {
        addBot(payload);
        toast.success("已添加机器人");
    }
    showForm.value = false;
}

async function connect(botId: string) {
    connecting.value = botId;
    try {
        await connectBot(botId);
        toast.success("连接成功");
        router.push((route.query.redirect as string) || "/trade");
    } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "连接失败");
    } finally {
        connecting.value = null;
    }
}

// 「删除」按钮内建关闭弹窗的行为会先触发 update:open，
// 若在这里清空 deleting 会把待删对象一起丢掉，故 open 状态单独管理
function askDelete(bot: BotConfig) {
    deleting.value = bot;
    deleteOpen.value = true;
}

function onDialogOpenChange(open: boolean) {
    if (!open) deleteOpen.value = false;
}

function confirmDelete() {
    const bot = deleting.value;
    deleteOpen.value = false;
    if (bot) {
        removeBot(bot.botId);
        toast.success("已删除");
        deleting.value = null;
    }
}
</script>

<template>
    <div class="flex min-h-screen items-center justify-center bg-background p-4">
        <div class="w-full max-w-lg space-y-4">
            <div class="flex items-center justify-center gap-2">
                <img src="/favicon.svg" class="size-10 rounded-xl" alt="logo" />
                <div>
                    <h1 class="text-xl font-bold">Freqtrade 控制台</h1>
                    <p class="text-sm text-muted-foreground">连接你的交易机器人</p>
                </div>
            </div>

            <!-- 已保存的机器人 -->
            <Card v-if="authStore.bots.length">
                <CardHeader class="pb-3">
                    <CardTitle class="text-base">我的机器人</CardTitle>
                    <CardDescription
                        >点击卡片登录 · 登录一次后 30
                        天内自动登录，无需重复输入密码</CardDescription
                    >
                </CardHeader>
                <CardContent class="space-y-2">
                    <div
                        v-for="bot in authStore.bots"
                        :key="bot.botId"
                        class="group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
                    >
                        <div
                            class="flex size-9 items-center justify-center rounded-lg bg-primary/10"
                        >
                            <Bot class="size-5 text-primary" />
                        </div>
                        <button class="min-w-0 flex-1 text-left" @click="connect(bot.botId)">
                            <div class="truncate text-sm font-medium">{{ bot.botName }}</div>
                            <div v-if="bot.url" class="truncate text-xs text-muted-foreground">
                                {{ bot.url }}
                            </div>
                        </button>
                        <Badge v-if="authStore.activeBotId === bot.botId" variant="outline"
                            >当前</Badge
                        >
                        <div
                            class="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                            <Button
                                variant="ghost"
                                size="icon"
                                class="size-8"
                                @click="openEdit(bot)"
                                ><Pencil class="size-3.5"
                            /></Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                class="size-8 text-destructive"
                                @click="askDelete(bot)"
                                ><Trash2 class="size-3.5"
                            /></Button>
                        </div>
                        <Button
                            size="sm"
                            :disabled="connecting === bot.botId"
                            @click="connect(bot.botId)"
                        >
                            <LogIn class="size-3.5" />{{
                                connecting === bot.botId ? "连接中" : "登录"
                            }}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <!-- 新增/编辑表单 -->
            <Card v-if="showForm || !authStore.bots.length">
                <CardHeader class="pb-3">
                    <CardTitle class="text-base">{{
                        editing ? "编辑机器人" : "添加机器人"
                    }}</CardTitle>
                    <CardDescription>freqtrade REST API 的地址与 api_server 凭据</CardDescription>
                </CardHeader>
                <CardContent class="space-y-3">
                    <div class="space-y-1.5">
                        <Label for="f-name">名称</Label>
                        <Input id="f-name" v-model="form.botName" placeholder="我的机器人" />
                    </div>
                    <div class="space-y-1.5">
                        <Label for="f-url">
                            API 地址
                            <span class="font-normal text-muted-foreground"
                                >（留空 = 当前站点，由 Nginx 自动分流）</span
                            >
                        </Label>
                        <Input
                            id="f-url"
                            v-model="form.url"
                            placeholder="留空即可，默认走同源 Nginx 分流"
                        />
                    </div>
                    <div class="space-y-1.5">
                        <Label for="f-bt-url">
                            回测地址
                            <span class="font-normal text-muted-foreground"
                                >（可选，留空也由 Nginx 分流到 webserver）</span
                            >
                        </Label>
                        <Input
                            id="f-bt-url"
                            v-model="form.backtestUrl"
                            placeholder="留空即可，默认走同源 Nginx 分流"
                        />
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="space-y-1.5">
                            <Label for="f-user">用户名</Label>
                            <Input id="f-user" v-model="form.user" placeholder="freqtrader" />
                        </div>
                        <div class="space-y-1.5">
                            <Label for="f-pass">密码</Label>
                            <Input
                                id="f-pass"
                                type="password"
                                v-model="form.password"
                                :placeholder="editing ? '留空表示不修改' : '••••••••'"
                                @keyup.enter="submitForm"
                            />
                        </div>
                    </div>
                    <div class="flex gap-2 pt-1">
                        <Button class="flex-1" @click="submitForm">{{
                            editing ? "保存" : "添加"
                        }}</Button>
                        <Button v-if="editing" variant="outline" @click="showForm = false"
                            >取消</Button
                        >
                    </div>
                </CardContent>
            </Card>

            <Button v-else variant="outline" class="w-full" @click="openCreate">
                <Plus class="size-4" />添加机器人
            </Button>
        </div>

        <AlertDialog :open="deleteOpen" @update:open="onDialogOpenChange">
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>删除机器人？</AlertDialogTitle>
                    <AlertDialogDescription
                        >将移除「{{
                            deleting?.botName
                        }}」的保存信息，此操作不可恢复。</AlertDialogDescription
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

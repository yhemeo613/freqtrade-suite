<script setup lang="ts">
import { ref, computed, nextTick, type ComponentPublicInstance } from "vue";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import EmptyState from "@/components/ft/EmptyState.vue";
import { api, runApi, usePolling } from "@/composables/useBotData";
import type { LogEntry } from "@/api/types";

interface LogRec {
    ts: string;
    level: string;
    origin: string;
    message: string;
}

const loading = ref(true);
const logs = ref<LogRec[]>([]);
const scrollAreaRef = ref<ComponentPublicInstance | null>(null);
const AUTO_FOLLOW_THRESHOLD_PX = 40;

// 级别过滤:all | info | warning | error(含 critical)
const levelFilter = ref("all");
// 关键词过滤:匹配消息与来源(大小写不敏感)
const keyword = ref("");

const filteredLogs = computed(() => {
    const kw = keyword.value.trim().toLowerCase();
    return logs.value.filter((l) => {
        if (levelFilter.value === "error" && !["error", "critical"].includes(l.level)) return false;
        if (levelFilter.value === "warning" && l.level !== "warning") return false;
        if (levelFilter.value === "info" && !["info", "debug"].includes(l.level)) return false;
        if (kw && !l.message.toLowerCase().includes(kw) && !l.origin.toLowerCase().includes(kw)) {
            return false;
        }
        return true;
    });
});

function viewport(): HTMLElement | null {
    const root = scrollAreaRef.value?.$el;
    if (!(root instanceof Element)) return null;
    return root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
}

function isAtBottom(): boolean {
    const vp = viewport();
    if (!vp) return true;
    return vp.scrollHeight - vp.scrollTop - vp.clientHeight < AUTO_FOLLOW_THRESHOLD_PX;
}

function scrollToBottom() {
    const vp = viewport();
    if (vp) vp.scrollTop = vp.scrollHeight;
}

async function load() {
    // 用户已在底部时才自动跟随最新日志，向上翻阅时不打断
    const wasAtBottom = isAtBottom();
    const res = await runApi(() => api.logs(300), true);
    if (res) {
        // 真实结构：[时间字符串, 毫秒时间戳, 来源, 级别, 消息]
        logs.value = (res.logs ?? []).map((l: LogEntry) => ({
            ts: l[0],
            level: String(l[3] ?? "").toLowerCase(),
            origin: l[2],
            message: l[4]
        }));
        if (wasAtBottom) {
            await nextTick();
            scrollToBottom();
        }
    }
    loading.value = false;
}

usePolling(load, 5000);
</script>

<template>
    <Card class="flex h-[calc(100vh-7rem)] flex-col">
        <CardHeader class="pb-2">
            <CardTitle class="flex items-center gap-2 text-base">
                运行日志
                <Badge variant="outline" class="text-xs"
                    >{{ filteredLogs.length }} / {{ logs.length }} 条</Badge
                >
            </CardTitle>
            <div class="flex flex-wrap items-center gap-2 pt-1">
                <Select v-model="levelFilter">
                    <SelectTrigger class="h-8 w-28 text-xs">
                        <SelectValue placeholder="全部级别" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全部级别</SelectItem>
                        <SelectItem value="error">错误 (ERROR)</SelectItem>
                        <SelectItem value="warning">警告 (WARNING)</SelectItem>
                        <SelectItem value="info">信息 (INFO)</SelectItem>
                    </SelectContent>
                </Select>
                <Input
                    v-model="keyword"
                    class="h-8 w-56 text-xs"
                    placeholder="关键词过滤(币对 / 错误码 / 来源)…"
                />
            </div>
        </CardHeader>
        <CardContent class="min-h-0 flex-1">
            <ScrollArea
                ref="scrollAreaRef"
                class="h-full rounded-md border bg-muted/30 p-3 font-mono text-xs"
            >
                <Skeleton v-if="loading" class="h-64 w-full" />
                <EmptyState
                    v-else-if="!filteredLogs.length"
                    :title="logs.length ? '没有匹配的日志' : '暂无日志'"
                />
                <div v-for="(l, i) in filteredLogs" :key="i" class="flex gap-2 py-0.5 leading-5">
                    <span class="shrink-0 text-muted-foreground">{{ l.ts }}</span>
                    <span
                        class="w-14 shrink-0 font-semibold"
                        :class="
                            l.level === 'error'
                                ? 'text-destructive'
                                : l.level === 'warning'
                                  ? 'text-warning'
                                  : 'text-muted-foreground'
                        "
                        >{{ l.level }}</span
                    >
                    <span
                        class="hidden w-28 shrink-0 truncate text-muted-foreground md:inline"
                        :title="l.origin"
                        >{{ l.origin }}</span
                    >
                    <span class="break-all">{{ l.message }}</span>
                </div>
            </ScrollArea>
        </CardContent>
    </Card>
</template>

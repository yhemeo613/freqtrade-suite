<script setup lang="ts">
import { ref, nextTick, type ComponentPublicInstance } from "vue";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
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
                <Badge variant="outline" class="text-xs">{{ logs.length }} 条</Badge>
            </CardTitle>
        </CardHeader>
        <CardContent class="min-h-0 flex-1">
            <ScrollArea
                ref="scrollAreaRef"
                class="h-full rounded-md border bg-muted/30 p-3 font-mono text-xs"
            >
                <Skeleton v-if="loading" class="h-64 w-full" />
                <EmptyState v-else-if="!logs.length" title="暂无日志" />
                <div v-for="(l, i) in logs" :key="i" class="flex gap-2 py-0.5 leading-5">
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

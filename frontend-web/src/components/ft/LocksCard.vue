<script setup lang="ts">
import { ref } from "vue";
import { toast } from "vue-sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Lock, Unlock } from "lucide-vue-next";
import { api, runApi, usePolling } from "@/composables/useBotData";
import { fmtDate } from "@/lib/format";
import type { Lock as LockRecord } from "@/api/types";

const locks = ref<LockRecord[]>([]);
const unlocking = ref<string | null>(null);

async function load() {
    const res = await runApi(() => api.locks(), true);
    if (res) locks.value = (res.locks ?? []) as LockRecord[];
}

// 锁定列表随轮询持续刷新（锁定到期/手动解锁后无需切 tab 重进）
usePolling(load);

async function unlock(id: number | string) {
    unlocking.value = String(id);
    try {
        const res = await runApi(() => api.deleteLock(id));
        if (res !== undefined) {
            toast.success(`已解锁 #${id}`);
            load();
        }
    } finally {
        unlocking.value = null;
    }
}

void load();
defineExpose({ load });
</script>

<template>
    <Card>
        <CardHeader class="pb-2">
            <CardTitle class="flex items-center gap-2 text-base">
                <Lock class="size-4" />保护锁定（{{ locks.length }}）
            </CardTitle>
        </CardHeader>
        <CardContent>
            <Table v-if="locks.length">
                <TableHeader>
                    <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>交易对</TableHead>
                        <TableHead>锁定至</TableHead>
                        <TableHead>原因</TableHead>
                        <TableHead class="w-10" />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow v-for="l in locks" :key="l.id">
                        <TableCell class="text-muted-foreground">{{ l.id }}</TableCell>
                        <TableCell class="font-medium">{{ l.pair }}</TableCell>
                        <TableCell class="text-xs">{{ fmtDate(l.lock_end_time) }}</TableCell>
                        <TableCell
                            class="max-w-56 truncate text-xs text-muted-foreground"
                            :title="l.reason"
                            >{{ l.reason }}</TableCell
                        >
                        <TableCell>
                            <Button
                                variant="ghost"
                                size="icon"
                                class="size-7 text-warning"
                                :disabled="unlocking === String(l.id)"
                                @click="unlock(l.id)"
                                title="解锁"
                            >
                                <Unlock class="size-3.5" />
                            </Button>
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>
            <p v-else class="py-4 text-center text-sm text-muted-foreground">当前无锁定</p>
        </CardContent>
    </Card>
</template>

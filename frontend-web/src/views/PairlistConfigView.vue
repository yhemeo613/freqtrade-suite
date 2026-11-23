<script setup lang="ts">
import { ref, onMounted } from "vue";
import { toast } from "vue-sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Trash2, Plus } from "lucide-vue-next";
import { api, runApi } from "@/composables/useBotData";
import { getClient } from "@/api/client";

const whitelist = ref<string[]>([]);
const blacklist = ref<string[]>([]);
const method = ref("");
const methodDesc = ref<{ method: string }[]>([]);
const newBlack = ref("");
const applying = ref(false);

async function load() {
    const [w, b, pl] = await Promise.all([
        runApi(() => api.whitelist(), true),
        runApi(() => api.blacklist(), true),
        runApi(() => api.pairLists(), true)
    ]);
    if (w) {
        whitelist.value = w.whitelist ?? [];
        method.value = w.method ?? "";
    }
    if (b) blacklist.value = b.blacklist ?? [];
    if (pl) methodDesc.value = pl;
}

async function addToBlacklist() {
    const v = newBlack.value.trim().toUpperCase();
    if (!v) return;
    applying.value = true;
    // freqtrade：POST /blacklist 传完整列表（追加）
    const next = [...blacklist.value, v];
    const res = await runApi(() => getClient().post("/api/v1/blacklist", { blacklist: next }));
    applying.value = false;
    if (res) {
        newBlack.value = "";
        toast.success(`已加入黑名单: ${v}`);
        load();
    }
}

async function removeFromBlacklist(pair: string) {
    applying.value = true;
    const res = await runApi(() =>
        getClient().delete(`/api/v1/blacklist?pairs_to_delete=${encodeURIComponent(pair)}`)
    );
    applying.value = false;
    if (res !== undefined) {
        toast.success(`已从黑名单移除: ${pair}`);
        load();
    }
}

onMounted(load);
</script>

<template>
    <div class="space-y-3">
        <!-- 筛选器方法链 -->
        <Card>
            <CardHeader class="pb-3">
                <CardTitle class="text-base">币对筛选器（Pairlist Handler 链）</CardTitle>
                <CardDescription
                    >当前生效的筛选链，修改需编辑 config.json 后 reload_config</CardDescription
                >
            </CardHeader>
            <CardContent>
                <div v-if="methodDesc.length" class="flex flex-wrap items-center gap-2">
                    <template v-for="(h, i) in methodDesc" :key="i">
                        <Badge variant="outline" class="px-3 py-1.5">
                            <span class="font-medium">{{ h.method }}</span>
                        </Badge>
                        <span v-if="i < methodDesc.length - 1" class="text-muted-foreground"
                            >→</span
                        >
                    </template>
                </div>
                <div v-else class="text-sm text-muted-foreground">
                    当前方法:
                    <code class="rounded bg-muted px-1.5 py-0.5">{{ method || "—" }}</code>
                </div>
            </CardContent>
        </Card>

        <div class="grid gap-3 lg:grid-cols-2">
            <!-- 白名单 -->
            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">白名单（{{ whitelist.length }}）</CardTitle>
                    <CardDescription>机器人允许交易的币对</CardDescription>
                </CardHeader>
                <CardContent>
                    <div
                        class="flex max-h-96 flex-wrap gap-1.5 overflow-auto rounded-md border p-3"
                    >
                        <Badge
                            v-for="p in whitelist"
                            :key="p"
                            variant="secondary"
                            class="font-normal"
                            >{{ p }}</Badge
                        >
                        <span v-if="!whitelist.length" class="text-sm text-muted-foreground"
                            >暂无</span
                        >
                    </div>
                </CardContent>
            </Card>

            <!-- 黑名单 -->
            <Card>
                <CardHeader class="pb-2">
                    <CardTitle class="text-base">黑名单（{{ blacklist.length }}）</CardTitle>
                    <CardDescription>可在线增删（reload 后按配置文件重置）</CardDescription>
                </CardHeader>
                <CardContent class="space-y-3">
                    <div class="flex gap-2">
                        <Input
                            v-model="newBlack"
                            placeholder="如 DOGE/USDT:USDT 或匹配模式 .*DOGE.*"
                            @keyup.enter="addToBlacklist"
                        />
                        <Button :disabled="applying || !newBlack.trim()" @click="addToBlacklist">
                            <Plus class="size-4" />添加
                        </Button>
                    </div>
                    <Table v-if="blacklist.length">
                        <TableHeader>
                            <TableRow>
                                <TableHead>币对 / 模式</TableHead>
                                <TableHead class="w-10" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow v-for="p in blacklist" :key="p">
                                <TableCell class="font-mono text-xs">{{ p }}</TableCell>
                                <TableCell>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        class="size-7 text-destructive"
                                        @click="removeFromBlacklist(p)"
                                    >
                                        <Trash2 class="size-3.5" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                    <p v-else class="text-sm text-muted-foreground">黑名单为空</p>
                </CardContent>
            </Card>
        </div>
    </div>
</template>

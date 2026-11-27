<script setup lang="ts">
import { ref, computed } from "vue";
import { DropdownMenu, DropdownItem, Search, Empty, PullRefresh } from "vant";
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
const levelFilter = ref("");
const keyword = ref("");
const refreshing = ref(false);

const levelOptions = [
    { text: "全部级别", value: "" },
    { text: "错误 ERROR", value: "error" },
    { text: "警告 WARNING", value: "warning" },
    { text: "信息 INFO", value: "info" }
];

const levelText = computed(
    () => levelOptions.find((o) => o.value === levelFilter.value)?.text ?? "全部级别"
);

const filtered = computed(() => {
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

async function load() {
    const res = await runApi(() => api.logs(300), true);
    if (res) {
        logs.value = (res.logs ?? []).map((l: LogEntry) => ({
            ts: l[0],
            level: String(l[3] ?? "").toLowerCase(),
            origin: l[2],
            message: l[4]
        }));
    }
    loading.value = false;
    refreshing.value = false;
}

async function onRefresh() {
    await load();
    refreshing.value = false;
}

usePolling(load, 5000);

function levelClass(level: string): string {
    if (level === "error" || level === "critical") return "text-red-600";
    if (level === "warning") return "text-amber-600";
    return "text-gray-500";
}
</script>

<template>
    <div class="min-h-[70vh]">
        <!-- DropdownItem 自带显示当前选中项文字，无需额外文本 -->
        <DropdownMenu>
            <DropdownItem v-model:value="levelFilter" :options="levelOptions" :title="levelText" />
        </DropdownMenu>

        <div class="px-3 py-2">
            <Search
                v-model="keyword"
                placeholder="关键词过滤（币对 / 错误码 / 来源）"
                shape="round"
                :clearable="true"
            />
        </div>

        <PullRefresh v-model="refreshing" class="min-h-[50vh]" @refresh="onRefresh">
            <div class="text-center text-xs text-gray-400">
                共 {{ filtered.length }} / {{ logs.length }} 条
            </div>
            <Empty
                v-if="!loading && !filtered.length"
                image="search"
                :description="logs.length ? '没有匹配的日志' : '暂无日志'"
                class="py-10"
            />
            <!-- 自定义日志行:Vant Cell 默认样式在长文本下会挤压,改为可控布局 -->
            <div class="bg-white">
                <div
                    v-for="(l, i) in filtered.slice(0, 200)"
                    :key="i"
                    class="border-b border-gray-100 px-3 py-2"
                >
                    <div class="flex items-start gap-2">
                        <span class="shrink-0 font-mono text-[10px] leading-4 text-gray-400">{{
                            l.ts
                        }}</span>
                        <span
                            class="w-12 shrink-0 font-mono text-[10px] font-semibold leading-4"
                            :class="levelClass(l.level)"
                        >
                            {{ l.level }}
                        </span>
                        <span class="break-all font-mono text-[11px] leading-4 text-gray-800">{{
                            l.message
                        }}</span>
                    </div>
                    <div class="mt-0.5 pl-[4.5rem] font-mono text-[10px] text-gray-400">
                        {{ l.origin }}
                    </div>
                </div>
            </div>
            <div class="h-16" />
        </PullRefresh>
    </div>
</template>

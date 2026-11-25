<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { NavBar, Tabbar, TabbarItem } from "vant";
import { authStore, activeBot } from "@/stores/auth";
import { connectionStore } from "@/stores/connection";

const route = useRoute();
const routeMap: Record<string, string> = {
    "/m/trade": "trade",
    "/m/dashboard": "dashboard",
    "/m/chart": "chart",
    "/m/logs": "logs",
    "/m/settings": "settings"
};
const active = computed(() => routeMap[route.path] ?? "trade");
const labels: Record<string, string> = {
    trade: "持仓",
    dashboard: "仪表盘",
    chart: "行情图表",
    logs: "运行日志",
    settings: "设置"
};
const title = computed(() => labels[active.value] ?? "Freqtrade");
const botName = computed(() => activeBot()?.botName ?? "未连接");
</script>

<template>
    <div class="flex min-h-screen flex-col bg-[#f7f8fa] text-gray-900">
        <NavBar :title="title" fixed placeholder :border="false" class="!bg-white">
            <template #left>
                <div class="flex items-center gap-1.5 text-xs text-gray-500">
                    <span
                        class="inline-block size-1.5 rounded-full"
                        :class="authStore.loggedIn ? 'bg-green-500' : 'bg-gray-300'"
                    />
                    <span class="max-w-24 truncate">{{ botName }}</span>
                </div>
            </template>
        </NavBar>

        <div
            v-if="connectionStore.lost"
            class="bg-red-50 px-3 py-1 text-center text-xs text-red-600"
        >
            与机器人的连接中断，正在自动重试…
        </div>

        <main class="flex-1 pb-16">
            <router-view />
        </main>

        <Tabbar :model-value="active" route fixed safe-area-inset-bottom class="!bg-white">
            <TabbarItem name="trade" replace to="/m/trade" icon="chart-trending-o">持仓</TabbarItem>
            <TabbarItem name="dashboard" replace to="/m/dashboard" icon="bar-chart-o"
                >仪表盘</TabbarItem
            >
            <TabbarItem name="chart" replace to="/m/chart" icon="orders-o">图表</TabbarItem>
            <TabbarItem name="logs" replace to="/m/logs" icon="notes-o">日志</TabbarItem>
            <TabbarItem name="settings" replace to="/m/settings" icon="setting-o">设置</TabbarItem>
        </Tabbar>
    </div>
</template>

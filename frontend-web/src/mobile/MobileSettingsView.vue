<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { Cell, CellGroup, Switch, Tag } from "vant";
import { api, runApi } from "@/composables/useBotData";
import { activeBot, disconnect } from "@/stores/auth";
import { settingsStore, saveSettings } from "@/stores/settings";
import { botStateZh } from "@/lib/format";

const router = useRouter();
const cfg = ref<Record<string, unknown> | null>(null);

async function load() {
    const res = await runApi(() => api.showConfig(), true);
    if (res) cfg.value = res;
}
void load();

const botName = computed(() => activeBot()?.botName ?? "未连接");
const isDark = computed({
    get: () => settingsStore.theme === "dark",
    set: (v: boolean) => {
        settingsStore.theme = v ? "dark" : "light";
        saveSettings();
    }
});

function toggleTheme(v: boolean) {
    isDark.value = v;
}

function onLogout() {
    disconnect();
    void router.push("/login");
}
</script>

<template>
    <div class="space-y-3 p-3">
        <!-- 机器人信息 -->
        <CellGroup inset title="机器人">
            <Cell title="名称" :value="botName" />
            <Cell title="状态">
                <template #value>
                    <Tag :type="cfg?.state === 'running' ? 'success' : 'default'" plain>
                        {{ botStateZh(String(cfg?.state ?? "")) }}
                    </Tag>
                </template>
            </Cell>
            <Cell title="策略" :value="String(cfg?.strategy ?? '—')" />
            <Cell title="周期" :value="String(cfg?.timeframe ?? '—')" />
            <Cell title="最大持仓" :value="String(cfg?.max_open_trades ?? '—')" />
            <Cell title="交易模式" :value="String(cfg?.trading_mode ?? '—')" />
            <Cell title="模拟盘" :value="cfg?.dry_run ? '是' : '否'" />
        </CellGroup>

        <!-- 显示设置 -->
        <CellGroup inset title="显示">
            <Cell title="暗色主题（桌面端生效）" center>
                <template #right-icon>
                    <Switch :model-value="isDark" @update:model-value="toggleTheme" />
                </template>
            </Cell>
        </CellGroup>

        <!-- 操作 -->
        <CellGroup inset title="操作">
            <Cell title="切换机器人" is-link to="/login" replace />
            <Cell title="断开连接" is-link @click="onLogout" />
        </CellGroup>

        <div class="pb-6 pt-2 text-center text-[11px] text-gray-400">
            Freqtrade 中文控制台 · 移动端
        </div>
    </div>
</template>

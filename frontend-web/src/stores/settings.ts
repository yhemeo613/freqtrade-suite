import { reactive, watch } from "vue";

interface SettingsState {
    theme: "light" | "dark";
    /** 刷新间隔（毫秒） */
    refreshIntervalMs: number;
}

const DEFAULTS: SettingsState = {
    theme: "dark",
    refreshIntervalMs: 10_000
};

function load(): SettingsState {
    try {
        return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("ftzh.settings") ?? "{}") };
    } catch {
        return { ...DEFAULTS };
    }
}

export const settingsStore = reactive<SettingsState>(load());

function applyTheme(theme: "light" | "dark") {
    // 持久化统一由 saveSettings 写入 ftzh.settings,index.html 预渲染脚本读取同一键
    document.documentElement.classList.toggle("dark", theme === "dark");
}

watch(
    () => settingsStore.theme,
    (t) => applyTheme(t),
    { immediate: true }
);

export function saveSettings() {
    localStorage.setItem("ftzh.settings", JSON.stringify(settingsStore));
}

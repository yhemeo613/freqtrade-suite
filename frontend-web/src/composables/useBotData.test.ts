// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createApp, h, nextTick, type Component } from "vue";
import { BotApiClient, setActiveClient } from "@/api/client";
import { settingsStore } from "@/stores/settings";
import { usePolling } from "./useBotData";

type Polling = ReturnType<typeof usePolling>;

/** 在组件作用域内调用 usePolling（onUnmounted 需要组件实例） */
function mountPolling(fn: () => Promise<void>, intervalMs?: number) {
    let polling: Polling | null = null;
    const component: Component = {
        setup() {
            polling = usePolling(fn, intervalMs);
            return () => h("div");
        }
    };
    const app = createApp(component);
    const root = document.createElement("div");
    app.mount(root);
    return {
        polling: polling as unknown as Polling,
        unmount: () => app.unmount()
    };
}

/** 让已排队的微任务跑完（tick 内部 await fn()） */
async function flushMicrotasks() {
    await nextTick();
    await Promise.resolve();
    await nextTick();
}

const DEFAULT_INTERVAL = settingsStore.refreshIntervalMs;

describe("usePolling", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // hasClient() 需要为 true，否则 tick 直接返回
        setActiveClient(
            new BotApiClient({ botId: "t", botName: "t", url: "", user: "u", password: "p" })
        );
        settingsStore.refreshIntervalMs = 1000;
    });

    afterEach(() => {
        vi.useRealTimers();
        setActiveClient(null);
        settingsStore.refreshIntervalMs = DEFAULT_INTERVAL;
    });

    it("挂载后立即执行一次，并按间隔继续轮询", async () => {
        const fn = vi.fn(async () => {});
        const { unmount } = mountPolling(fn);
        await flushMicrotasks();
        expect(fn).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1000);
        expect(fn).toHaveBeenCalledTimes(2);

        unmount();
        await vi.advanceTimersByTimeAsync(5000);
        expect(fn).toHaveBeenCalledTimes(2); // 卸载后不再轮询
    });

    it("单飞：上一次轮询未返回时跳过后续触发", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        const fn = vi.fn(() => gate);
        const { unmount } = mountPolling(fn);
        await flushMicrotasks();
        expect(fn).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(10_000);
        expect(fn).toHaveBeenCalledTimes(1); // 请求卡住时不堆积

        release();
        await flushMicrotasks();
        await vi.advanceTimersByTimeAsync(1000);
        expect(fn).toHaveBeenCalledTimes(2); // 恢复后继续

        unmount();
    });

    it("设置页调整刷新间隔后立即生效", async () => {
        const fn = vi.fn(async () => {});
        const { unmount } = mountPolling(fn);
        await flushMicrotasks();
        expect(fn).toHaveBeenCalledTimes(1);

        settingsStore.refreshIntervalMs = 5000;
        await nextTick();

        await vi.advanceTimersByTimeAsync(1000);
        expect(fn).toHaveBeenCalledTimes(1); // 旧 1s 定时器已停

        await vi.advanceTimersByTimeAsync(4000);
        expect(fn).toHaveBeenCalledTimes(2); // 新 5s 间隔生效

        unmount();
    });

    it("显式传入间隔时不受全局设置影响", async () => {
        const fn = vi.fn(async () => {});
        const { unmount } = mountPolling(fn, 2000);
        await flushMicrotasks();
        expect(fn).toHaveBeenCalledTimes(1);

        settingsStore.refreshIntervalMs = 500;
        await nextTick();

        await vi.advanceTimersByTimeAsync(1000);
        expect(fn).toHaveBeenCalledTimes(1); // 仍按 2s，不被全局 0.5s 影响

        await vi.advanceTimersByTimeAsync(1000);
        expect(fn).toHaveBeenCalledTimes(2);

        unmount();
    });

    it("单次轮询抛错不会中断后续轮询", async () => {
        const fn = vi.fn(async () => {
            throw new Error("boom");
        });
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { unmount } = mountPolling(fn);
        await flushMicrotasks();
        expect(fn).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1000);
        expect(fn).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenCalled();

        warn.mockRestore();
        unmount();
    });
});

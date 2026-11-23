import { reactive } from "vue";

/**
 * 连接状态：任一 API 请求因网络原因失败时置为 lost，
 * 后续成功后恢复。App 顶部据此显示"连接中断"提示，避免静默失败。
 */
export const connectionStore = reactive({
    lost: false,
    lastError: ""
});

export function markConnectionLost(err: unknown) {
    connectionStore.lost = true;
    connectionStore.lastError = err instanceof Error ? err.message : String(err);
}

export function markConnectionOk() {
    connectionStore.lost = false;
    connectionStore.lastError = "";
}

/**
 * 输入解析与表单默认值工具（纯函数，便于单测）
 */

/**
 * 解析可选的价格输入：
 * - 空字符串 / 纯空白 → undefined（表示未指定，走市价）
 * - 非数字、NaN、Infinity、<= 0 → null（调用方应提示错误）
 * - 合法正数 → number
 */
export function parseOptionalPrice(raw: string): number | undefined | null {
    const s = raw.trim();
    if (!s) return undefined;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** 把 Date 转成 freqtrade timerange 的 YYYYMMDD（本地时间） */
function toTimerangeDay(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}${mm}${dd}`;
}

/**
 * 生成 freqtrade timerange 的滚动默认值：起始 N 天前、结束留空（表示至今）。
 * 形如 `20260901-`。历史硬编码的固定日期会随时间过期，这里按当天滚动生成。
 * @param daysBack 回溯天数（默认 60）
 * @param now 参照时间（默认当前时间，注入便于单测）
 */
export function defaultTimerange(daysBack = 60, now: Date = new Date()): string {
    const start = new Date(now.getTime() - daysBack * 86_400_000);
    return `${toTimerangeDay(start)}-`;
}

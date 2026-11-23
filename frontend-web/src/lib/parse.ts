/**
 * 输入解析工具（纯函数，便于单测）
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

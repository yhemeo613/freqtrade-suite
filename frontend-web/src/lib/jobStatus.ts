/**
 * 后台任务（回测 / recursive / lookahead 分析）状态归类。
 *
 * freqtrade 状态取值（见 rpc/api_server/api_backtest.py、api_analysis.py）：
 * - 运行中：`running` / `pending` / `stopping`（running 字段为 true）
 * - 成功：  `ended`（分析接口）/ `error` 才是失败，**不是** `failed`
 * - 失败：  `error`（backtest 与分析接口都用 `error`）
 * - 未开始：`not_started` / `not_running` / `reset`
 *
 * 之前的实现直接用 `running === false` 判定「已完成」，会把失败与未开始
 * 都当成成功并弹出成功提示，这里统一收敛为纯函数便于单测。
 */

export type JobOutcome = "idle" | "running" | "success" | "error";

/** API 返回的任务状态字段（回测/分析响应共有的部分） */
export interface JobStatusLike {
    status?: unknown;
    running?: unknown;
    status_msg?: unknown;
    error?: unknown;
}

const ERROR_STATUS = new Set(["error", "failed"]);
const SUCCESS_STATUS = new Set(["ended", "success", "completed", "finished"]);
const IDLE_STATUS = new Set(["not_started", "not_running", "reset", ""]);
const RUNNING_STATUS = new Set(["running", "pending", "stopping", "started"]);

export function classifyJob(raw: JobStatusLike | null | undefined): JobOutcome {
    if (!raw) return "idle";
    const status = String(raw.status ?? "")
        .trim()
        .toLowerCase();
    if (ERROR_STATUS.has(status)) return "error";
    if (SUCCESS_STATUS.has(status)) return "success";
    if (IDLE_STATUS.has(status)) {
        // running 为 true 但状态文案缺失时仍按运行中处理
        return raw.running === true ? "running" : "idle";
    }
    if (RUNNING_STATUS.has(status) || raw.running === true) return "running";
    return "idle";
}

/** 任务状态的中文文案（用于面板展示，避免直接暴露英文 status） */
export function outcomeLabel(outcome: JobOutcome): string {
    switch (outcome) {
        case "success":
            return "已完成";
        case "error":
            return "失败";
        case "running":
            return "运行中";
        default:
            return "未开始";
    }
}

/** 失败原因：优先 job.error，其次 status_msg（freqtrade 形如 "Backtest failed with ..."） */
export function jobErrorText(raw: JobStatusLike | null | undefined, fallback: string): string {
    if (!raw) return fallback;
    const err = String(raw.error ?? "").trim();
    if (err) return err;
    const msg = String(raw.status_msg ?? "").trim();
    if (msg) return msg;
    return fallback;
}

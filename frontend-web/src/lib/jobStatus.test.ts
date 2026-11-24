import { describe, expect, it } from "vitest";
import { classifyJob, jobErrorText, outcomeLabel } from "./jobStatus";

describe("classifyJob", () => {
    it("backtest 成功：status=ended", () => {
        expect(classifyJob({ status: "ended", running: false })).toBe("success");
    });

    it("backtest 失败：status=error（freqtrade 不使用 failed）", () => {
        expect(classifyJob({ status: "error", running: false })).toBe("error");
    });

    it("分析失败：status=error", () => {
        expect(classifyJob({ status: "error", status_msg: "Analysis failed with boom" })).toBe(
            "error"
        );
    });

    it("运行中：status=running 且 running=true", () => {
        expect(classifyJob({ status: "running", running: true })).toBe("running");
    });

    it("中止中：status=stopping 仍视为运行中", () => {
        expect(classifyJob({ status: "stopping", running: false })).toBe("running");
    });

    it("未开始：status=not_started 不算完成", () => {
        expect(classifyJob({ status: "not_started", running: false })).toBe("idle");
    });

    it("状态缺失但 running=false 时不算完成（避免误报）", () => {
        expect(classifyJob({ running: false })).toBe("idle");
    });

    it("状态缺失但 running=true 时按运行中处理", () => {
        expect(classifyJob({ running: true })).toBe("running");
    });

    it("大小写与空白容错", () => {
        expect(classifyJob({ status: " ENDED " })).toBe("success");
    });

    it("空响应视为未开始", () => {
        expect(classifyJob(null)).toBe("idle");
        expect(classifyJob(undefined)).toBe("idle");
    });
});

describe("outcomeLabel", () => {
    it("输出中文状态文案", () => {
        expect(outcomeLabel("success")).toBe("已完成");
        expect(outcomeLabel("error")).toBe("失败");
        expect(outcomeLabel("running")).toBe("运行中");
        expect(outcomeLabel("idle")).toBe("未开始");
    });
});

describe("jobErrorText", () => {
    it("优先取 error 字段", () => {
        expect(jobErrorText({ error: "boom", status_msg: "Backtest failed with x" }, "兜底")).toBe(
            "boom"
        );
    });

    it("退化为 status_msg", () => {
        expect(jobErrorText({ status_msg: "Backtest failed with x" }, "兜底")).toBe(
            "Backtest failed with x"
        );
    });

    it("都没有时用兜底文案", () => {
        expect(jobErrorText({}, "兜底")).toBe("兜底");
        expect(jobErrorText(null, "兜底")).toBe("兜底");
    });
});

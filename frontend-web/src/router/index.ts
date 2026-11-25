import { createRouter, createWebHashHistory } from "vue-router";
import { authStore } from "@/stores/auth";

/** 移动端断点：与 Tailwind 的 md 断点（768px）一致 */
export const isMobileViewport = (): boolean =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

/** 桌面路由 → 移动端路由 */
const DESKTOP_TO_MOBILE: Record<string, string> = {
    "/trade": "/m/trade",
    "/dashboard": "/m/dashboard",
    "/chart": "/m/chart",
    "/logs": "/m/logs",
    "/settings": "/m/settings"
};
/** 移动端路由 → 桌面路由 */
const MOBILE_TO_DESKTOP: Record<string, string> = Object.fromEntries(
    Object.entries(DESKTOP_TO_MOBILE).map(([d, m]) => [m, d])
);

const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        {
            path: "/login",
            name: "login",
            component: () => import("@/views/LoginView.vue"),
            meta: { public: true }
        },
        // ---- 移动端（Vant 重构版） ----
        { path: "/m", redirect: "/m/trade" },
        {
            path: "/m/trade",
            name: "mTrade",
            component: () => import("@/mobile/MobileTradingView.vue"),
            meta: { mobile: true }
        },
        {
            path: "/m/dashboard",
            name: "mDashboard",
            component: () => import("@/mobile/MobileDashboardView.vue"),
            meta: { mobile: true }
        },
        {
            path: "/m/chart",
            name: "mChart",
            component: () => import("@/mobile/MobileChartView.vue"),
            meta: { mobile: true }
        },
        {
            path: "/m/logs",
            name: "mLogs",
            component: () => import("@/mobile/MobileLogsView.vue"),
            meta: { mobile: true }
        },
        {
            path: "/m/settings",
            name: "mSettings",
            component: () => import("@/mobile/MobileSettingsView.vue"),
            meta: { mobile: true }
        },
        // ---- 桌面端 ----
        { path: "/", redirect: "/trade" },
        { path: "/trade", name: "trade", component: () => import("@/views/TradingView.vue") },
        {
            path: "/dashboard",
            name: "dashboard",
            component: () => import("@/views/DashboardView.vue")
        },
        { path: "/balance", name: "balance", component: () => import("@/views/BalanceView.vue") },
        { path: "/chart", name: "chart", component: () => import("@/views/ChartsView.vue") },
        {
            path: "/backtesting",
            name: "backtesting",
            component: () => import("@/views/BacktestingView.vue")
        },
        { path: "/logs", name: "logs", component: () => import("@/views/LogView.vue") },
        {
            path: "/download-data",
            name: "download",
            component: () => import("@/views/DownloadDataView.vue")
        },
        {
            path: "/pairlist",
            name: "pairlist",
            component: () => import("@/views/PairlistConfigView.vue")
        },
        {
            path: "/analysis",
            name: "analysis",
            component: () => import("@/views/AdvancedAnalysisView.vue")
        },
        {
            path: "/settings",
            name: "settings",
            component: () => import("@/views/SettingsView.vue")
        },
        {
            path: "/mobile-trades",
            name: "mobileTrades",
            component: () => import("@/views/MobileTradesListView.vue")
        },
        {
            path: "/:pathMatch(.*)*",
            name: "404",
            component: () => import("@/views/Error404View.vue"),
            meta: { public: true }
        }
    ]
});

router.beforeEach((to) => {
    if (!to.meta.public && !authStore.loggedIn) {
        return { name: "login", query: { redirect: to.fullPath } };
    }
    // 设备自适应:手机访问桌面路由自动切到移动端界面;桌面访问 /m/* 回到桌面界面
    const mobile = isMobileViewport();
    if (mobile && to.path !== "/login" && !to.path.startsWith("/m")) {
        const target = to.path === "/" ? "/m/trade" : DESKTOP_TO_MOBILE[to.path];
        return { path: target ?? "/m/dashboard", replace: true };
    }
    if (!mobile && MOBILE_TO_DESKTOP[to.path]) {
        return { path: MOBILE_TO_DESKTOP[to.path], replace: true };
    }
});

export default router;

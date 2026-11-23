import { createRouter, createWebHashHistory } from "vue-router";
import { authStore } from "@/stores/auth";

const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        {
            path: "/login",
            name: "login",
            component: () => import("@/views/LoginView.vue"),
            meta: { public: true }
        },
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
});

export default router;

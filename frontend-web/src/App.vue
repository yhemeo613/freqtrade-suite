<script setup lang="ts">
import { onMounted, ref, onErrorCaptured } from "vue";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { Toaster } from "@/components/ui/sonner";
import {
    SidebarProvider,
    Sidebar,
    SidebarHeader,
    SidebarContent,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarFooter,
    SidebarTrigger,
    SidebarInset
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
    LineChart,
    LayoutDashboard,
    CandlestickChart,
    History,
    ScrollText,
    Download,
    ListFilter,
    Settings,
    Smartphone,
    Moon,
    Sun,
    ChevronDown,
    Wifi,
    WifiOff,
    Wallet,
    Microscope
} from "lucide-vue-next";
import { authStore, activeBot, disconnect } from "@/stores/auth";
import { settingsStore, saveSettings } from "@/stores/settings";
import { connectionStore } from "@/stores/connection";
import { setSessionExpiredHandler } from "@/api/client";

const router = useRouter();
const booted = ref(false);

// 会话彻底失效(refresh token 过期)时统一降级:登出 + 提示 + 回登录页,避免界面"假登录"
setSessionExpiredHandler(() => {
    disconnect();
    if (router.currentRoute.value.path !== "/login") router.push("/login");
    toast.error("登录已过期，请重新登录");
});

// 全局兜底：组件渲染/生命周期异常时给出提示并记录，避免白屏无反馈
onErrorCaptured((err) => {
    console.error("UI error:", err);
    toast.error("页面渲染出错，请刷新重试");
    return false;
});

const nav = [
    { path: "/trade", label: "交易", icon: LineChart },
    { path: "/dashboard", label: "仪表盘", icon: LayoutDashboard },
    { path: "/balance", label: "余额", icon: Wallet },
    { path: "/chart", label: "图表", icon: CandlestickChart },
    { path: "/mobile-trades", label: "移动持仓", icon: Smartphone },
    { path: "/backtesting", label: "回测", icon: History },
    { path: "/logs", label: "日志", icon: ScrollText },
    { path: "/download-data", label: "数据下载", icon: Download },
    { path: "/pairlist", label: "白名单配置", icon: ListFilter },
    { path: "/analysis", label: "高级分析", icon: Microscope },
    { path: "/settings", label: "设置", icon: Settings }
];

// 会话恢复已由 main.ts 在挂载前完成,这里只负责路由兜底(避免 restoreSession 被调用两次)
onMounted(() => {
    booted.value = true;
    if (!authStore.loggedIn && router.currentRoute.value.path !== "/login") router.push("/login");
});

function toggleTheme() {
    settingsStore.theme = settingsStore.theme === "dark" ? "light" : "dark";
    saveSettings();
}

function logout() {
    disconnect();
    router.push("/login");
}
</script>

<template>
    <Toaster position="top-center" rich-colors />
    <template v-if="booted">
        <!-- 登录页独立布局 -->
        <router-view v-if="router.currentRoute.value.path === '/login'" />
        <!-- 主布局 -->
        <SidebarProvider v-else>
            <Sidebar collapsible="icon">
                <SidebarHeader>
                    <div class="flex items-center gap-2 px-2 py-1.5">
                        <img src="/favicon.svg" class="size-8 rounded-lg" alt="logo" />
                        <div v-if="activeBot()" class="min-w-0">
                            <div class="truncate text-sm font-semibold">
                                {{ activeBot()!.botName }}
                            </div>
                            <div class="text-xs text-muted-foreground">
                                {{ authStore.loggedIn ? "已连接" : "未连接" }}
                            </div>
                        </div>
                        <div v-else class="text-sm font-semibold">Freqtrade 控制台</div>
                    </div>
                </SidebarHeader>
                <SidebarContent>
                    <SidebarGroup>
                        <SidebarGroupLabel>监控</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                <SidebarMenuItem v-for="item in nav.slice(0, 4)" :key="item.path">
                                    <SidebarMenuButton
                                        as-child
                                        :is-active="router.currentRoute.value.path === item.path"
                                    >
                                        <router-link :to="item.path">
                                            <component :is="item.icon" />
                                            <span>{{ item.label }}</span>
                                        </router-link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                    <SidebarGroup>
                        <SidebarGroupLabel>工具</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                <SidebarMenuItem v-for="item in nav.slice(4)" :key="item.path">
                                    <SidebarMenuButton
                                        as-child
                                        :is-active="router.currentRoute.value.path === item.path"
                                    >
                                        <router-link :to="item.path">
                                            <component :is="item.icon" />
                                            <span>{{ item.label }}</span>
                                        </router-link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                </SidebarContent>
                <SidebarFooter>
                    <div class="px-2 pb-2 text-xs text-muted-foreground">
                        <div class="flex items-center gap-1.5">
                            <component :is="authStore.loggedIn ? Wifi : WifiOff" class="size-3.5" />
                            <span>{{ authStore.loggedIn ? "API 已连接" : "未连接" }}</span>
                        </div>
                    </div>
                </SidebarFooter>
            </Sidebar>
            <SidebarInset>
                <!-- 连接中断提示：任意 API 网络失败时展示，恢复后自动消失 -->
                <div
                    v-if="connectionStore.lost"
                    class="sticky top-0 z-30 flex items-center justify-center gap-2 bg-destructive/15 px-3 py-1 text-xs text-destructive"
                >
                    <WifiOff class="size-3.5" />
                    与机器人的连接中断，正在自动重试…
                </div>
                <header
                    class="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur"
                >
                    <SidebarTrigger />
                    <div class="ml-auto flex items-center gap-2">
                        <Badge v-if="authStore.loggedIn" variant="outline" class="gap-1">
                            <span class="size-1.5 rounded-full bg-success" />在线
                        </Badge>
                        <Button
                            variant="ghost"
                            size="icon"
                            @click="toggleTheme"
                            :title="settingsStore.theme === 'dark' ? '切换亮色' : '切换暗色'"
                        >
                            <Sun v-if="settingsStore.theme === 'dark'" class="size-4" />
                            <Moon v-else class="size-4" />
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger as-child>
                                <Button variant="ghost" size="sm" class="gap-1">
                                    <span class="max-w-32 truncate">{{
                                        activeBot()?.botName ?? "未选择"
                                    }}</span>
                                    <ChevronDown class="size-3.5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem @click="router.push('/login')"
                                    >切换机器人</DropdownMenuItem
                                >
                                <DropdownMenuItem @click="router.push('/settings')"
                                    >设置</DropdownMenuItem
                                >
                                <DropdownMenuItem class="text-destructive" @click="logout"
                                    >断开连接</DropdownMenuItem
                                >
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>
                <main class="flex-1 p-3 md:p-4">
                    <router-view />
                </main>
            </SidebarInset>
        </SidebarProvider>
    </template>
    <div v-else class="flex h-screen items-center justify-center text-muted-foreground">
        加载中…
    </div>
</template>

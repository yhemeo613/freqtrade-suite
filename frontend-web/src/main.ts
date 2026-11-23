import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import "./assets/index.css";
// vue-sonner v2+ 需要显式引入样式，否则 toast 无样式
import "vue-sonner/style.css";

async function bootstrap() {
    // 先恢复上次会话，再挂载应用，避免路由守卫在恢复完成前误拦
    const { restoreSession } = await import("@/stores/auth");
    await restoreSession();

    const app = createApp(App);
    app.use(createPinia());
    app.use(router);
    app.mount("#app");
}

void bootstrap();

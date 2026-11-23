import path from "node:path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
    plugins: [vue(), tailwindcss()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src")
        }
    },
    // dev 模式代理到本地 freqtrade（生产挂载进容器走同源，无需代理）
    server: {
        port: 8090,
        host: "0.0.0.0",
        proxy: {
            "/api": {
                target: "http://127.0.0.1:8080",
                changeOrigin: true
            }
        }
    }
});

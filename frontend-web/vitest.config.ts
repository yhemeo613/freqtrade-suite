import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    // 与 vite.config.ts 保持一致的路径别名（vitest 独立配置不会自动继承）
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src")
        }
    },
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"]
    }
});

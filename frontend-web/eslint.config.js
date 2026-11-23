import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";

export default [
    {
        ignores: ["dist/**", "node_modules/**", "public/**"]
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    // 只用 essential 层(正确性规则),排版风格规则(prettier 职责)不纳入 gate
    ...pluginVue.configs["flat/essential"],
    {
        files: ["**/*.vue"],
        languageOptions: {
            parserOptions: {
                parser: tseslint.parser,
                extraFileExtensions: [".vue"]
            }
        },
        rules: {
            // shadcn-vue 组件为单文件名(Button.vue / Card.vue 等),关闭多词命名约束
            "vue/multi-word-component-names": "off"
        }
    },
    {
        files: ["**/*.ts", "**/*.vue"],
        rules: {
            // TS 负责类型检查,关闭 js no-undef 避免误报(__dirname 等)
            "no-undef": "off",
            // 存量代码先以 warning 暴露,后续迭代逐步清零
            "@typescript-eslint/no-unused-vars": "warn",
            "@typescript-eslint/no-explicit-any": "warn"
        }
    }
];

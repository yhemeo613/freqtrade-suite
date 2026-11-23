/// <reference types="vite/client" />

declare module "*.vue" {
    import type { DefineComponent } from "vue";
    // 标准 SFC shim：第三个泛型为 Props 类型，any 为有意保留的兼容定义
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const component: DefineComponent<object, object, any>;
    export default component;
}

<script setup lang="ts">
/** 统一空态占位：各视图"暂无数据"提示复用，保证视觉一致 */
defineProps<{ title?: string; description?: string }>();
</script>

<template>
    <div
        class="flex flex-col items-center justify-center gap-1 py-10 text-center text-sm text-muted-foreground"
    >
        <p class="font-medium text-foreground">{{ title ?? "暂无数据" }}</p>
        <p v-if="description">{{ description }}</p>
    </div>
</template>

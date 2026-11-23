<script setup lang="ts">
import { useRouter } from "vue-router";
import { Button } from "@/components/ui/button";

const router = useRouter();
</script>

<template>
    <div class="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <div class="text-6xl font-bold text-muted-foreground/40">404</div>
        <p class="text-sm text-muted-foreground">页面不存在</p>
        <Button variant="outline" @click="router.push('/trade')">返回交易页</Button>
    </div>
</template>

<script setup lang="ts">
import { NobleProvider } from '@engine/client';
import { SERVER_URL } from './config';
</script>

<template>
  <NobleProvider :server-url="SERVER_URL" :debug="true">
    <router-view />
  </NobleProvider>
</template>

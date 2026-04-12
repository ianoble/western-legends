import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    dedupe: ['vue', 'pinia'],
    alias: {
      '@engine': path.resolve(__dirname, '../noble-bg-engine/packages/engine/src'),
    },
  },
});

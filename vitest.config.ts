import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, '../noble-bg-engine/packages/engine/src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});

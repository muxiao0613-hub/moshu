import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 1420, strictPort: true },
  clearScreen: false,
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    // jsdom costs ~25s per file here; sharing one environment per worker keeps
    // `npm test` from timing out while preserving per-file isolation.
    pool: 'vmThreads',
    testTimeout: 20_000,
  },
});

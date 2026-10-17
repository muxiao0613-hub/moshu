import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
 base: './', plugins: [react()],
 resolve: {alias: {'@': fileURLToPath(new URL('./src', import.meta.url)), 'file-saver': fileURLToPath(new URL('./src/host/export.ts', import.meta.url))}},
 build: {outDir: '../../public/mogao', emptyOutDir: true, sourcemap: false},
});

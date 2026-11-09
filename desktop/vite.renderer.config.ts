import { fileURLToPath } from 'node:url';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('./renderer', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root,
  base: './', // loaded from file:// by Electron
  plugins: [preact()],
  server: { fs: { allow: [repoRoot] } },
  build: { outDir: fileURLToPath(new URL('./dist/renderer', import.meta.url)), emptyOutDir: true },
});

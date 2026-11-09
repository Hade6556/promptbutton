import { fileURLToPath } from 'node:url';
import process from 'node:process';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root,
  // GitHub Pages serves project sites under /<repo>/; the workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [preact()],
  server: { fs: { allow: [repoRoot] } },
  build: { outDir: 'dist', emptyOutDir: true },
});

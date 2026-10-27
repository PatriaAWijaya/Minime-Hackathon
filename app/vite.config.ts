import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// base './' is MANDATORY for Tauri: absolute /assets/... paths break
// when the WebView loads from dist (see app/rule.md rule 9).
export default defineConfig({
  plugins: [svelte()],
  base: './',
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { outDir: 'dist' }
});

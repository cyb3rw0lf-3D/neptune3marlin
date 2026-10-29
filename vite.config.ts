import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths work on GitHub Pages under any repo name and on claude.ai.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  server: {
    host: true,
  },
});

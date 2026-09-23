import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'ensure-index-html',
        closeBundle() {
          const webHtmlPath = path.resolve(__dirname, 'dist-web/web.html');
          const indexHtmlPath = path.resolve(__dirname, 'dist-web/index.html');
          if (fs.existsSync(webHtmlPath) && !fs.existsSync(indexHtmlPath)) {
            fs.copyFileSync(webHtmlPath, indexHtmlPath);
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'dist-web',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'web.html'),
        },
      },
    },
  };
});

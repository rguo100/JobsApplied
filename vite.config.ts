import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { build as esbuildBuild } from 'esbuild';

const classicContentScriptsPlugin = () => ({
  name: 'build-classic-content-scripts',
  async closeBundle() {
    await Promise.all([
      esbuildBuild({
        entryPoints: [path.resolve(__dirname, 'src/content/contentScript.ts')],
        outfile: path.resolve(__dirname, 'dist/content.js'),
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: 'chrome114',
        minify: true,
      }),
      esbuildBuild({
        entryPoints: [path.resolve(__dirname, 'src/content/greenhouseContentScript.ts')],
        outfile: path.resolve(__dirname, 'dist/greenhouse.js'),
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: 'chrome114',
        minify: true,
      }),
    ]);
  },
});

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), classicContentScriptsPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          background: path.resolve(__dirname, 'src/background/background.ts'),
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'background') {
              return 'background.js';
            }
            return 'assets/[name]-[hash].js';
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

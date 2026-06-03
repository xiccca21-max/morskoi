import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import path from 'node:path';
import { telegramHtml } from './vite-plugins/telegram-html';

const assetOrigin = (process.env.VITE_ASSET_ORIGIN || '').replace(/\/$/, '');

export default defineConfig({
  base: assetOrigin ? `${assetOrigin}/` : '/',
  define: {
    __APP_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16)),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  plugins: [
    react(),
    telegramHtml(),
    // Без legacy: type="module" в WebView Telegram/Android 8+ часто не выполняется (nomodule баг).
    // renderModernChunks: false → один обычный <script> без module, с polyfills.
    legacy({
      targets: ['defaults', 'iOS >= 12', 'Chrome >= 64', 'Android >= 6'],
      renderModernChunks: false,
      modernPolyfills: false,
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', changeOrigin: true, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    modulePreload: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('react-dom')) return 'vendor-react-dom';
          if (id.includes('react-router')) return 'vendor-router';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('socket.io')) return 'vendor-socket';
          if (id.includes('@sentry')) return 'vendor-sentry';
          return 'vendor';
        },
      },
    },
  },
});

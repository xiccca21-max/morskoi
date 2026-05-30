import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  define: {
    __APP_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16)),
  },
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    host: true,
    port: 5173,
    // Разрешаем любые хосты (нужно для ngrok / cloudflared туннелей)
    allowedHosts: true,
    // Прокидываем API и Socket.IO на backend, чтобы был один origin
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, '/api'),
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});

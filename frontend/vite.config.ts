import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const DEV_API = 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: DEV_API,
        changeOrigin: true,
      },
      '/socket.io': {
        target: DEV_API,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});

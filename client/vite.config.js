import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'unsafe-none',
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
    },
    proxy: {
      '/api': {
        target: 'https://synctunes-umst.onrender.com',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'https://synctunes-umst.onrender.com',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});

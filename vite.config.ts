import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  cacheDir: `node_modules/.vite-${process.env.DEV_API_PORT || 'development'}`,
  optimizeDeps: { include: ['docx', 'mammoth', 'fflate'] },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: `http://127.0.0.1:${process.env.DEV_API_PORT || 3001}`, xfwd: true },
    },
  },
  build: { chunkSizeWarningLimit: 850 },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      '@xterm/xterm',
      '@xterm/addon-fit',
      '@xterm/addon-webgl',
      'clsx',
      'tailwind-merge',
      'class-variance-authority',
      'cmdk',
      'lucide-react',
      '@base-ui/react',
      '@naikidev/commiq',
      '@naikidev/commiq-react',
    ],
  },
});

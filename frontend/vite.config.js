import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const modulesPath = 'C:/Users/Ashwin/qc_frontend_modules/node_modules';

const fallbackResolver = () => ({
  name: 'fallback-resolver',
  resolveId(source) {
    if (source === 'axios') {
      return path.resolve(modulesPath, 'axios/dist/esm/axios.js');
    }
    if (source.startsWith('.') || source.startsWith('/') || source.includes(':')) {
      return null;
    }
    try {
      return require.resolve(source, { paths: [modulesPath] });
    } catch {
      return null;
    }
  }
});

export default defineConfig({
  plugins: [fallbackResolver(), react()],
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          content: [
            './index.html',
            './src/**/*.{js,ts,jsx,tsx}',
          ],
          theme: {
            extend: {
              colors: {
                brand: {
                  50: '#eef2ff',
                  100: '#e0e7ff',
                  200: '#c7d2fe',
                  500: '#6366f1',
                  600: '#4f46e5',
                  700: '#4338ca',
                },
                canvas: '#f8fafc',
              },
              fontFamily: {
                sans: ['Lato', 'Noto Sans', 'Loto', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
                mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
              },
              boxShadow: {
                'card': '0 1px 3px 0 rgba(15, 23, 42, 0.03), 0 1px 2px -1px rgba(15, 23, 42, 0.02)',
                'node-active': '0 0 0 2px #4f46e5, 0 4px 12px -2px rgba(79, 70, 229, 0.15)',
              }
            }
          }
        }),
        autoprefixer(),
      ]
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
});
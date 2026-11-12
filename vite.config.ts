import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { tradingViewApi } from './server/tradingview';

export default defineConfig({
  server: { port: Number(process.env.PORT ?? 5173) },
  preview: { port: Number(process.env.PORT ?? 4173) },
  plugins: [react(), tradingViewApi()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});

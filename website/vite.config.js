import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: false,
    allowedHosts: [
      'home.serial-experiments.com',
      'localhost',
      '127.0.0.1'
    ],
    middlewareMode: false
  },
  publicDir: 'public'
})

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Hour Tracker',
        short_name: 'Hours',
        description: 'Track hours and pay across your jobs.',
        theme_color: '#5B5BEF',
        background_color: '#F4F5FB',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // _worker.js is server-side code that Cloudflare runs, not something the browser
        // should ever fetch. It is written after `vite build`, so today it is invisible
        // to this glob anyway — this makes that a rule rather than a lucky ordering.
        globIgnores: ['_worker.js', '**/_worker.js'],
        // Keep the SPA fallback away from the API, or an offline sync POST would be
        // answered with index.html instead of failing honestly.
        //
        // No runtimeCaching entry for /api is needed: Workbox only ever caches GET, and
        // every API call is a POST. An entry here would match nothing and just imply a
        // protection that isn't doing any work.
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    // Honour PORT so a second dev server (a preview harness, a parallel checkout) can be
    // told where to listen instead of silently drifting to 5174 and being unreachable.
    port: Number(process.env.PORT) || 5173,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
  },
})

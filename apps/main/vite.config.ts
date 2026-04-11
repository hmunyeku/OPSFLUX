import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon.svg'],
      manifest: {
        name: 'OpsFlux',
        short_name: 'OpsFlux',
        description: 'OpsFlux — Plateforme ERP opérations industrielles',
        theme_color: '#1e40af',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icons/icon-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          {
            src: '/icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // IMPORTANT: do NOT precache HTML files. When index.html is
        // precached, the SW keeps serving the OLD index.html (which
        // references old JS chunks by hash) until the precache is
        // refreshed — this causes the "ancienne vue de l'appli qui
        // apparaît pendant le chargement" flash. By omitting .html
        // from globPatterns, index.html is always fetched from the
        // network so the correct current JS chunks are loaded.
        globPatterns: ['**/*.{js,css,svg}'],
        // Skip waiting + claim clients so a newly installed SW takes
        // over IMMEDIATELY, without needing a user gesture. Combined
        // with the controllerchange listener in usePWA, the page
        // auto-reloads once and the user sees the new version.
        skipWaiting: true,
        clientsClaim: true,
        // EXPLICITLY disable the SPA navigation fallback.
        //
        // vite-plugin-pwa merges our workbox options over its own defaults,
        // and the defaults include `navigateFallback: "index.html"` (see
        // node_modules/vite-plugin-pwa/dist/index.js). When that default
        // wins, workbox-build injects
        //   registerRoute(new NavigationRoute(
        //     createHandlerBoundToURL("index.html")))
        // into the generated sw.js. `createHandlerBoundToURL("index.html")`
        // throws `non-precached-url` at SW install time because we
        // deliberately excluded HTML from globPatterns (precaching
        // index.html would pin the old JS chunk hashes and cause the stale
        // "ancienne vue" flash). That exception kills the SW install BEFORE
        // the runtimeCaching rules register, so every fetch ends up
        // unhandled and the browser reports all API calls as CORS failures.
        //
        // Passing `undefined` in the spread wouldn't override the default;
        // we must set it to a falsy value (`null`) so the workbox sw-template
        // `<% if (navigateFallback) %>` conditional skips the NavigationRoute
        // entirely. Cast because the plugin's type rejects null even though
        // the template accepts it.
        navigateFallback: null as unknown as string,
        runtimeCaching: [
          // Binary exports/downloads can legitimately take longer than the
          // short API timeout below. Keep them network-only so Workbox does
          // not abort with "no-response" during PDF/DOCX generation.
          {
            urlPattern: /\/api\/v1\/documents\/[^/]+\/export\/(?:pdf|docx)$/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\/api\/v1\/attachments\/[^/]+\/download$/i,
            handler: 'NetworkOnly',
          },
          // HTML navigation requests: NetworkFirst with a short timeout.
          // When online, always fetch the freshest index.html from the
          // server; when offline, fall back to the SPA cache.
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 4, maxAgeSeconds: 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // API responses — NetworkFirst (try network, fall back to cache)
          {
            urlPattern: /\/api\//i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 200, maxAgeSeconds: 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Static assets — CacheFirst (use cache, fetch in background)
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|eot)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Google Fonts stylesheets — StaleWhileRevalidate
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 3600 },
            },
          },
          // Google Fonts webfonts — CacheFirst
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query': ['@tanstack/react-query'],
          'ui-icons': ['lucide-react'],
          'i18n': ['i18next', 'react-i18next'],
          'flow-editor': ['@xyflow/react'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/static': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
})

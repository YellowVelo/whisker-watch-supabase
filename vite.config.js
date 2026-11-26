import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

import { cloudflare } from "@cloudflare/vite-plugin";
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Spec 0084 (FR1-3): source maps are uploaded to Sentry and then deleted, only
// when the build has SENTRY_AUTH_TOKEN (the production Cloudflare build). Without
// it (staging, local, CI) no maps are generated at all, so none can be published.
const sentryUploadEnabled = !!process.env.SENTRY_AUTH_TOKEN

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  plugins: [
    react(),
    cloudflare(),
    VitePWA({
      registerType: 'autoUpdate',
      manifestFilename: 'manifest.json',
      manifest: {
        name: 'Wysker Watch',
        short_name: 'Wysker Watch',
        description: 'Pet health tracking app — log symptoms, medications, vaccinations, bloodwork, and food for your pets; spot patterns; generate vet-ready reports.',
        theme_color: '#6FB7FF',
        background_color: '#0D0F12',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Spec 0084 (FR3): the service worker is written after the Sentry plugin
        // deletes maps, so it must never emit its own (it would follow build.sourcemap).
        sourcemap: false,
        // App shell: precache so the shell loads and the app opens offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Supabase (auth/data/storage): never cache, always hit the network.
            // Offline failures surface through the app's own offline banner/state.
            urlPattern: ({ url }) => url.hostname.endsWith('supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
    // Must stay last, after VitePWA.
    sentryVitePlugin({
      org: 'wysker-watch',
      project: 'javascript-react',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,
      disable: !sentryUploadEnabled,
      // Workers Builds' commit SHA; if unset, the plugin detects the release from git.
      release: { name: process.env.WORKERS_CI_COMMIT_SHA },
      sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      // A bad token or a Sentry outage must never fail the production build.
      errorHandler: (err) => {
        console.warn('[sentry-vite-plugin] source map upload failed, continuing build:', err)
      },
    }),
  ],
  build: {
    // 'hidden': maps are generated for upload but the JS files don't point to them.
    sourcemap: sentryUploadEnabled ? 'hidden' : false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
});
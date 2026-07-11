import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  headLinkOptions: {
    preset: '2023',
  },
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      resizeOptions: { background: '#0D0F12' },
    },
    apple: {
      ...minimal2023Preset.apple,
      resizeOptions: { background: '#0D0F12' },
    },
  },
  images: ['public/icon-source.svg'],
})

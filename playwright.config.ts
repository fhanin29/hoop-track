import { defineConfig, devices } from '@playwright/test'

const common = {
  baseURL: 'http://localhost:4173',
  hasTouch: true,
  locale: 'fr-FR',
  serviceWorkers: 'block' as const,
  // Micro factice pour les tests de saisie vocale
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
}

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  reporter: 'list',
  projects: [
    {
      name: 'tablette',
      // Tablette Android 10" en paysage
      use: { ...devices['Desktop Chrome'], ...common, viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'smartphone',
      // Smartphone en portrait (gabarit iPhone 14 / Pixel 7)
      use: { ...devices['Pixel 7'], ...common, viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})

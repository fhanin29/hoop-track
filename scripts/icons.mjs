// Génère les icônes PNG de la PWA à partir du logo SVG (nécessite Playwright)
import { chromium } from '@playwright/test'

const logo = (size, { maskable = false, radius = 16 } = {}) => `
<html><body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${maskable ? 0 : radius}" fill="#f97316"/>
  <g transform="${maskable ? 'translate(32 32) scale(0.72) translate(-32 -32)' : ''}">
    <circle cx="32" cy="32" r="17" fill="none" stroke="#fff" stroke-width="3.5"/>
    <path d="M15 32h34M32 15v34M20 20c6 6 6 18 0 24M44 20c-6 6-6 18 0 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
  </g>
</svg></body></html>`

const targets = [
  ['public/pwa-192.png', 192, {}],
  ['public/pwa-512.png', 512, {}],
  ['public/pwa-maskable-512.png', 512, { maskable: true }],
  ['public/apple-touch-icon.png', 180, { radius: 0 }],
]

const browser = await chromium.launch()
for (const [file, size, opts] of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(logo(size, opts))
  await page.screenshot({ path: file, omitBackground: true })
  await page.close()
  console.log('✓', file)
}
await browser.close()

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ensureActiveSeason } from './db/repo'
import { registerSW } from 'virtual:pwa-register'

async function boot() {
  await ensureActiveSeason()
  if ('storage' in navigator && navigator.storage.persist) {
    // Demande au navigateur de ne pas effacer les données (tablette)
    navigator.storage.persist().catch(() => {})
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

boot()
registerSW({ immediate: true })

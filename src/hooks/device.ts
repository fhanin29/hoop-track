import { useEffect } from 'react'

/** Garde l'écran allumé tant que le composant est monté */
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false
    const request = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen')
        if (cancelled) sentinel.release()
      } catch {
        /* refusé (batterie faible, onglet masqué) */
      }
    }
    const onVisible = () => document.visibilityState === 'visible' && request()
    request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      sentinel?.release().catch(() => {})
    }
  }, [enabled])
}

let vibrationEnabled = true
export function setVibrationEnabled(v: boolean) {
  vibrationEnabled = v
}

export function vibrate(pattern: number | number[] = 15) {
  if (vibrationEnabled && 'vibrate' in navigator) navigator.vibrate(pattern)
}

export async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
  } catch {
    /* non supporté */
  }
}

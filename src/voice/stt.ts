import type { SttRequest, SttResponse } from './stt.worker'

type Pending = { resolve: (text: string) => void; reject: (e: Error) => void }

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()
const listeners = new Set<(progress: number) => void>()

function getWorker(): Worker {
  if (worker) return worker
  // Le moteur (transformers.js + ONNX Runtime) n'est chargé qu'à la première dictée
  worker = new Worker(new URL('./stt.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }: MessageEvent<SttResponse>) => {
    if (data.type === 'progress') return listeners.forEach((l) => l(data.progress))
    const p = pending.get(data.id)
    pending.delete(data.id)
    if (data.type === 'done') p?.resolve(data.text ?? '')
    else p?.reject(new Error(data.message))
  }
  return worker
}

type Payload = { type: 'load' } | { type: 'transcribe'; audio: Float32Array }

function call(payload: Payload, transfer: Transferable[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, ...payload } satisfies SttRequest, transfer)
  })
}

/** Télécharge (si besoin) et charge le modèle. `onProgress` reçoit l'avancement du téléchargement, de 0 à 1. */
export async function loadModel(onProgress?: (progress: number) => void): Promise<void> {
  if (onProgress) listeners.add(onProgress)
  try {
    await call({ type: 'load' })
  } finally {
    if (onProgress) listeners.delete(onProgress)
  }
}

/** Transcrit un extrait mono à 16 kHz */
export function transcribe(audio: Float32Array): Promise<string> {
  return call({ type: 'transcribe', audio }, [audio.buffer])
}

/** Le modèle est-il déjà dans le cache du navigateur (utilisable hors ligne) ? */
export async function isModelCached(): Promise<boolean> {
  try {
    if (!('caches' in globalThis) || !(await caches.has('transformers-cache'))) return false
    const keys = await (await caches.open('transformers-cache')).keys()
    return keys.some((r) => r.url.includes('whisper-base') && r.url.endsWith('.onnx'))
  } catch {
    return false
  }
}

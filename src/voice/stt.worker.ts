/// <reference lib="webworker" />
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

/** Whisper multilingue « base », quantifié 8 bits : environ 80 Mo, téléchargé une fois puis servi par le cache du navigateur */
export const STT_MODEL = 'Xenova/whisper-base'

export type SttRequest = { id: number; type: 'load' } | { id: number; type: 'transcribe'; audio: Float32Array }
export type SttResponse =
  | { type: 'progress'; progress: number }
  | { type: 'done'; id: number; text?: string }
  | { type: 'error'; id: number; message: string }

const post = (msg: SttResponse) => self.postMessage(msg)

let loading: Promise<AutomaticSpeechRecognitionPipeline> | null = null

function load() {
  if (!loading) {
    const files = new Map<string, { loaded: number; total: number }>()
    loading = pipeline('automatic-speech-recognition', STT_MODEL, {
      dtype: 'q8',
      progress_callback: (info) => {
        if (info.status !== 'progress' || !info.total) return
        files.set(info.file, { loaded: info.loaded, total: info.total })
        let loaded = 0
        let total = 0
        for (const f of files.values()) {
          loaded += f.loaded
          total += f.total
        }
        post({ type: 'progress', progress: loaded / total })
      },
    }) as Promise<AutomaticSpeechRecognitionPipeline>
    // Un échec (hors ligne au premier lancement) ne doit pas bloquer les essais suivants
    loading.catch(() => (loading = null))
  }
  return loading
}

self.onmessage = async ({ data }: MessageEvent<SttRequest>) => {
  try {
    const transcribe = await load()
    if (data.type === 'load') return post({ type: 'done', id: data.id })
    const out = await transcribe(data.audio, { language: 'french', task: 'transcribe' })
    post({ type: 'done', id: data.id, text: (Array.isArray(out) ? out[0] : out).text.trim() })
  } catch (e) {
    post({ type: 'error', id: data.id, message: e instanceof Error ? e.message : String(e) })
  }
}

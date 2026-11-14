export const SAMPLE_RATE = 16_000

export function voiceSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof Worker !== 'undefined'
}

let stream: MediaStream | null = null

/** Ouvre le micro une fois pour toutes : chaque dictée démarre ensuite sans délai */
export async function openMic(): Promise<MediaStream> {
  if (stream?.active) return stream
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, noiseSuppression: true, echoCancellation: true, autoGainControl: true },
  })
  return stream
}

export function closeMic() {
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
}

export interface Recording {
  /** Termine l'enregistrement et renvoie l'audio compressé */
  stop: () => Promise<Blob>
}

export async function startRecording(): Promise<Recording> {
  const recorder = new MediaRecorder(await openMic())
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  recorder.start()
  return {
    stop: () =>
      new Promise((resolve) => {
        const done = () => resolve(new Blob(chunks, { type: recorder.mimeType }))
        if (recorder.state === 'inactive') return done()
        recorder.onstop = done
        recorder.stop()
      }),
  }
}

/** Décode un enregistrement en mono 16 kHz, le format attendu par Whisper */
export async function decodeClip(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer())
    const mono = new Float32Array(buffer.length)
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c)
      for (let i = 0; i < data.length; i++) mono[i] += data[i] / buffer.numberOfChannels
    }
    return mono
  } finally {
    await ctx.close()
  }
}

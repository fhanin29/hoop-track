import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from '../components/toast'
import { db, newId } from '../db/db'
import { clockRemaining } from '../domain/stats'
import type { Game, GameEvent, Player } from '../domain/types'
import { vibrate } from '../hooks/device'
import { enqueueClip } from './process'
import { closeMic, startRecording, voiceSupported, type Recording } from './recorder'
import { loadModel } from './stt'
import type { VoiceClip } from './types'

/** En dessous, c'est un appui accidentel */
const MIN_PRESS_MS = 400
/** On relâche souvent le bouton sur la dernière syllabe */
const TAIL_MS = 250

interface Session {
  recording: Promise<Recording>
  startedAt: number
  period: number
  clockMs?: number
  onCourtIds: string[]
}

export function useVoiceClips(gameId: string): VoiceClip[] {
  return useLiveQuery(async () => (await db.voiceClips.where('gameId').equals(gameId).toArray()).sort((a, b) => b.createdAt - a.createdAt), [gameId]) ?? []
}

export function useVoice({
  enabled,
  game,
  onCourt,
  players,
  onCreated,
}: {
  enabled: boolean
  game: Game
  onCourt: string[]
  players: Map<string, Player>
  onCreated?: (events: GameEvent[]) => void
}) {
  const active = enabled && voiceSupported()
  const [recording, setRecording] = useState(false)
  const session = useRef<Session | null>(null)
  const latest = useRef({ game, onCourt, players, onCreated })
  useEffect(() => {
    latest.current = { game, onCourt, players, onCreated }
  })

  // Charge le modèle dès l'ouverture du match et reprend les dictées restées en attente
  useEffect(() => {
    if (!active) return
    loadModel().catch(() => toast('Modèle vocal indisponible : téléchargez-le dans Réglages avec une connexion', { tone: 'error', duration: 8000 }))
    db.voiceClips
      .where('gameId')
      .equals(game.id)
      .filter((c) => c.status === 'pending')
      .primaryKeys()
      .then((ids) => ids.forEach((id) => enqueueClip(id, { players: latest.current.players, onCreated: (e) => latest.current.onCreated?.(e) })))
    return closeMic
  }, [active, game.id])

  const start = useCallback(() => {
    if (!active || session.current) return
    const { game, onCourt } = latest.current
    const startedAt = Date.now()
    const s: Session = {
      recording: startRecording(),
      startedAt,
      period: game.clock.period,
      clockMs: game.clockEnabled ? clockRemaining(game.clock, startedAt) : undefined,
      onCourtIds: [...onCourt],
    }
    session.current = s
    setRecording(true)
    vibrate(10)
    s.recording.catch(() => {
      if (session.current === s) session.current = null
      setRecording(false)
      toast('Micro indisponible : autorisez le micro pour cette application', { tone: 'error', duration: 6000 })
    })
  }, [active])

  const stop = useCallback(async () => {
    const s = session.current
    if (!s) return
    session.current = null
    let rec: Recording
    try {
      rec = await s.recording
    } catch {
      return
    }
    const held = Date.now() - s.startedAt
    await new Promise((r) => setTimeout(r, TAIL_MS))
    const audio = await rec.stop()
    setRecording(false)
    if (held < MIN_PRESS_MS || !audio.size) return toast('Maintenez le bouton pendant que vous parlez', { tone: 'info' })

    const clip: VoiceClip = { id: newId(), gameId: latest.current.game.id, createdAt: s.startedAt, period: s.period, onCourtIds: s.onCourtIds, audio, status: 'pending' }
    if (s.clockMs !== undefined) clip.clockMs = s.clockMs
    await db.voiceClips.add(clip)
    enqueueClip(clip.id, { players: latest.current.players, onCreated: (e) => latest.current.onCreated?.(e) })
  }, [])

  return { active, recording, start, stop }
}

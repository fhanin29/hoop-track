import { toast } from '../components/toast'
import { db } from '../db/db'
import { addEvents, deleteEvents } from '../db/repo'
import { describeEvent, type Game, type GameEvent, type Player } from '../domain/types'
import { parseVoice, type VoiceContext } from './parse'
import { decodeClip } from './recorder'
import { transcribe } from './stt'
import type { VoiceClip } from './types'

export interface ProcessOptions {
  players: Map<string, Player>
  /** Appelé avec les événements créés (alertes de fautes, etc.) */
  onCreated?: (events: GameEvent[]) => void
  /** Texte corrigé à la main : la transcription est sautée */
  text?: string
}

const tag = (players: Map<string, Player>, id?: string) => {
  const p = id ? players.get(id) : undefined
  return p ? `#${p.number}` : '?'
}

export function describeVoiceEvents(events: GameEvent[], players: Map<string, Player>): string {
  return events
    .map((e) => {
      if (e.type === 'OPP_SCORE') return describeEvent(e)
      if (e.type === 'SUB') return `${tag(players, e.playerId)} remplace ${tag(players, e.outPlayerId)}`
      return `${tag(players, e.playerId)} ${describeEvent(e)}`
    })
    .join(' · ')
}

function context(game: Game, clip: VoiceClip, players: Map<string, Player>): VoiceContext {
  const refs = (ids: string[]) => ids.flatMap((id) => players.get(id) ?? [])
  return { onCourt: refs(clip.onCourtIds), bench: refs(game.rosterIds.filter((id) => !clip.onCourtIds.includes(id))) }
}

async function reject(clip: VoiceClip, error: string, text?: string) {
  await db.voiceClips.update(clip.id, { status: 'error', error, text })
  toast(text ? `Non compris : « ${text} »` : error, { tone: 'error', duration: 6000 })
}

async function processClip(id: string, { players, onCreated, text }: ProcessOptions) {
  const clip = await db.voiceClips.get(id)
  const game = clip && (await db.games.get(clip.gameId))
  if (!clip || !game) return

  if (text === undefined) {
    try {
      text = await transcribe(await decodeClip(clip.audio))
    } catch (e) {
      console.error(e)
      return reject(clip, 'Transcription impossible. Vérifiez que le modèle vocal est téléchargé (Réglages).')
    }
  }
  if (game.status !== 'live') return reject(clip, 'Match terminé : rouvrez-le pour ajouter cette action', text)

  const parsed = parseVoice(text, context(game, clip, players))
  if (!parsed.ok) return reject(clip, parsed.error, text)

  // Les événements sont datés de l'instant de la dictée, pas de la fin de la transcription
  const created = await addEvents(game, parsed.events, { period: clip.period, createdAt: clip.createdAt, clockMs: clip.clockMs })
  const eventIds = created.map((e) => e.id)
  await db.voiceClips.update(id, { status: 'done', text, error: undefined, eventIds })
  toast(describeVoiceEvents(created, players), {
    duration: 5000,
    action: {
      label: 'Annuler',
      onClick: async () => {
        await deleteEvents(eventIds)
        await db.voiceClips.update(id, { status: 'error', error: 'Annulée', eventIds: [] })
      },
    },
  })
  onCreated?.(created)
}

let chain: Promise<void> = Promise.resolve()
const queued = new Set<string>()

/** Traite les dictées une par une, dans l'ordre où elles ont été enregistrées */
export function enqueueClip(id: string, options: ProcessOptions): Promise<void> {
  if (queued.has(id)) return chain
  queued.add(id)
  chain = chain
    .then(() => processClip(id, options))
    .catch(console.error)
    .finally(() => queued.delete(id))
  return chain
}

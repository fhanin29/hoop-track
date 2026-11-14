import { useState } from 'react'
import { Check, Loader2, Mic, Play, Trash2 } from 'lucide-react'
import { db } from '../../db/db'
import type { Game, GameEvent, Player } from '../../domain/types'
import { periodLabel } from '../../domain/types'
import { formatClock } from '../../domain/stats'
import { enqueueClip } from '../../voice/process'
import type { VoiceClip } from '../../voice/types'
import { Badge, Button, Input, Modal, cn } from '../ui'

/** Bouton « appuyer pour parler » : la dictée dure tant que le doigt reste posé */
export function MicButton({
  recording,
  pending,
  errors,
  onStart,
  onStop,
  className,
}: {
  recording: boolean
  pending: number
  errors: number
  onStart: () => void
  onStop: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label="Dicter une action"
      aria-pressed={recording}
      data-testid="mic"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        onStart()
      }}
      onPointerUp={onStop}
      onPointerCancel={onStop}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        'relative flex shrink-0 touch-none select-none items-center justify-center gap-2 rounded-xl border text-lg font-semibold transition',
        recording ? 'scale-[1.03] border-red-400 bg-red-600 text-white' : 'border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700',
        className,
      )}
    >
      {pending > 0 && !recording ? <Loader2 size={22} className="animate-spin" /> : <Mic size={22} className={cn(recording && 'animate-pulse')} />}
      <span className="hidden md:inline">{recording ? 'Parlez…' : 'Dicter'}</span>
      {errors > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-xs font-bold text-slate-950" data-testid="mic-errors">
          {errors}
        </span>
      )}
    </button>
  )
}

const STATUS: Record<VoiceClip['status'], { label: string; tone: 'slate' | 'green' | 'amber' }> = {
  pending: { label: 'En cours', tone: 'slate' },
  done: { label: 'Enregistrée', tone: 'green' },
  error: { label: 'À vérifier', tone: 'amber' },
}

/** Liste des dictées du match : réécoute, correction du texte, suppression */
export function VoiceClipsModal({
  open,
  onClose,
  game,
  clips,
  players,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  game: Game
  clips: VoiceClip[]
  players: Map<string, Player>
  onCreated?: (events: GameEvent[]) => void
}) {
  return (
    <Modal open={open} onClose={onClose} title="Dictées du match" wide>
      <p className="mb-3 text-sm text-slate-400">
        Dites le numéro puis l’action : « 7, trois points réussi, passe du 10 », « 12, faute », « adversaire plus deux », « 8 remplace 12 ».
      </p>
      <ul className="scrollbar-thin max-h-[55vh] space-y-2 overflow-y-auto" data-testid="voice-clips">
        {clips.length === 0 && <li className="p-4 text-center text-sm text-slate-500">Aucune dictée pour ce match</li>}
        {clips.map((clip) => (
          <ClipRow key={`${clip.id}-${clip.status}`} clip={clip} game={game} players={players} onCreated={onCreated} />
        ))}
      </ul>
    </Modal>
  )
}

function ClipRow({ clip, game, players, onCreated }: { clip: VoiceClip; game: Game; players: Map<string, Player>; onCreated?: (events: GameEvent[]) => void }) {
  const [text, setText] = useState(clip.text ?? '')
  const play = () => {
    const url = URL.createObjectURL(clip.audio)
    const audio = new Audio(url)
    audio.onended = () => URL.revokeObjectURL(url)
    audio.play().catch(() => URL.revokeObjectURL(url))
  }
  const retry = async () => {
    await db.voiceClips.update(clip.id, { status: 'pending', error: undefined })
    enqueueClip(clip.id, { players, onCreated, text })
  }
  const status = STATUS[clip.status]
  return (
    <li className="rounded-xl border border-slate-800 bg-slate-900 p-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-slate-500">
          {periodLabel(clip.period, game.periods)}
          {clip.clockMs !== undefined && ` ${formatClock(clip.clockMs)}`}
        </span>
        <Badge tone={status.tone}>{status.label}</Badge>
        {clip.error && <span className="min-w-0 flex-1 truncate text-sm text-amber-300">{clip.error}</span>}
        <span className="ml-auto flex gap-1">
          <Button size="sm" onClick={play} aria-label="Écouter">
            <Play size={16} />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => db.voiceClips.delete(clip.id)} aria-label="Supprimer la dictée">
            <Trash2 size={16} />
          </Button>
        </span>
      </div>
      {clip.status === 'error' ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            retry()
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Corrigez la phrase, ex. : 7 trois points réussi" aria-label="Phrase dictée" />
          <Button type="submit" variant="primary" disabled={!text.trim()} aria-label="Valider la phrase">
            <Check size={18} />
          </Button>
        </form>
      ) : (
        clip.text && <p className="mt-1.5 text-slate-300">« {clip.text} »</p>
      )}
    </li>
  )
}

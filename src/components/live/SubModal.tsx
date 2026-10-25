import { useMemo, useState } from 'react'
import { ArrowRightLeft, Check, X } from 'lucide-react'
import type { Player } from '../../domain/types'
import { playerName } from '../../domain/types'
import { Button, Jersey, Modal, cn } from '../ui'
import { MAX_FOULS } from './actions'

/** Calcule les paires (sortant → entrant) à partir de deux compositions */
export function diffLineup(initial: string[], final: string[]): { out: string; in: string }[] {
  const outs = initial.filter((id) => !final.includes(id))
  const ins = final.filter((id) => !initial.includes(id))
  return outs.map((out, i) => ({ out, in: ins[i] })).filter((p) => p.in)
}

export function SubModal({
  open,
  onClose,
  onCourt,
  roster,
  players,
  fouls,
  points,
  preselectOut,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  onCourt: string[]
  roster: string[]
  players: Map<string, Player>
  fouls: Record<string, number>
  points: Record<string, number>
  preselectOut?: string | null
  onConfirm: (pairs: { out: string; in: string }[]) => void
}) {
  // Monté à chaque ouverture : l'état initial reflète la composition du moment
  const [lineup, setLineup] = useState<string[]>(onCourt)
  const [selOut, setSelOut] = useState<string | null>(preselectOut ?? null)
  const [selIn, setSelIn] = useState<string | null>(null)

  const bench = useMemo(
    () => roster.filter((id) => !lineup.includes(id)).sort((a, b) => (players.get(a)?.number ?? 0) - (players.get(b)?.number ?? 0)),
    [roster, lineup, players],
  )
  const pairs = diffLineup(onCourt, lineup)

  const swap = (out: string, inn: string) => {
    setLineup((l) => l.map((id) => (id === out ? inn : id)))
    setSelOut(null)
    setSelIn(null)
  }

  const pickOut = (id: string) => {
    if (selIn) swap(id, selIn)
    else setSelOut(selOut === id ? null : id)
  }
  const pickIn = (id: string) => {
    if ((fouls[id] ?? 0) >= MAX_FOULS) return
    if (selOut) swap(selOut, id)
    else setSelIn(selIn === id ? null : id)
  }

  const card = (id: string, selected: boolean, onClick: () => void, side: 'court' | 'bench') => {
    const p = players.get(id)
    const f = fouls[id] ?? 0
    const excluded = f >= MAX_FOULS
    const changed = side === 'court' ? !onCourt.includes(id) : onCourt.includes(id)
    return (
      <button
        key={id}
        type="button"
        onClick={onClick}
        disabled={side === 'bench' && excluded}
        className={cn(
          'flex min-h-16 w-full items-center gap-3 rounded-xl border px-3 text-left transition active:scale-[0.98]',
          selected ? 'border-team bg-team/20 ring-2 ring-team' : 'border-slate-700 bg-slate-800/70 hover:bg-slate-800',
          excluded && 'opacity-40',
        )}
      >
        <Jersey number={p?.number ?? '?'} muted={side === 'bench'} />
        <span className="flex-1">
          <span className="block font-semibold leading-tight">{p ? playerName(p) : 'Inconnu'}</span>
          <span className="text-xs text-slate-400">
            {points[id] ?? 0} pts · {f} faute{f > 1 ? 's' : ''}
            {excluded && ' · exclu'}
          </span>
        </span>
        {changed && <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-bold', side === 'court' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300')}>{side === 'court' ? 'Entre' : 'Sort'}</span>}
      </button>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={
        <span className="flex items-center gap-2">
          <ArrowRightLeft size={20} /> Remplacements
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            <X size={18} /> Annuler
          </Button>
          <Button variant="primary" disabled={pairs.length === 0} onClick={() => onConfirm(pairs)}>
            <Check size={18} /> Valider {pairs.length > 0 && `(${pairs.length})`}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-400">Touchez un joueur sur le terrain puis un remplaçant (dans n'importe quel ordre). Plusieurs changements possibles.</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Sur le terrain</h3>
          <div className="space-y-2">{lineup.map((id) => card(id, selOut === id, () => pickOut(id), 'court'))}</div>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Banc</h3>
          <div className="space-y-2">
            {bench.length === 0 && <p className="text-sm text-slate-500">Aucun remplaçant convoqué.</p>}
            {bench.map((id) => card(id, selIn === id, () => pickIn(id), 'bench'))}
          </div>
        </div>
      </div>
    </Modal>
  )
}

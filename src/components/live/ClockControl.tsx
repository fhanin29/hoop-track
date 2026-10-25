import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import type { Game } from '../../domain/types'
import { clockRemaining, formatClock, periodLengthMs } from '../../domain/stats'
import { adjustClock, pauseClockIfExpired, setClockRemaining, toggleClock } from '../../db/repo'
import { useNow } from '../../hooks/data'
import { Button, Input, Modal, cn } from '../ui'

/** Chrono : se rafraîchit seul pour ne pas re-rendre toute la page de saisie */
export function ClockControl({ game, onExpire, className }: { game: Game; onExpire: () => void; className?: string }) {
  const now = useNow(game.clock.running, 200)
  const remaining = clockRemaining(game.clock, now)
  const expired = game.clock.running && remaining <= 0
  const [editing, setEditing] = useState(false)
  const onExpireRef = useRef(onExpire)
  useEffect(() => {
    onExpireRef.current = onExpire
  })

  useEffect(() => {
    if (expired) {
      pauseClockIfExpired(game)
      onExpireRef.current()
    }
  }, [expired, game])

  const lastMinute = remaining < 60_000

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          'min-w-20 rounded-xl bg-black/40 px-2 py-1 text-center font-mono text-2xl font-bold tabular-nums tracking-tight md:min-w-28 md:px-3 md:text-4xl',
          game.clock.running ? (lastMinute ? 'text-red-400' : 'text-emerald-300') : 'text-amber-300',
        )}
        aria-label="Modifier le chrono"
        data-testid="clock"
      >
        {formatClock(remaining)}
      </button>
      <button
        type="button"
        onClick={() => toggleClock(game)}
        disabled={!game.clock.running && remaining <= 0}
        aria-label={game.clock.running ? 'Arrêter le chrono' : 'Démarrer le chrono'}
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full text-white shadow-lg transition active:scale-95 disabled:opacity-30 md:h-14 md:w-14',
          game.clock.running ? 'bg-amber-500 shadow-amber-500/30' : 'bg-emerald-600 shadow-emerald-600/30',
        )}
      >
        {game.clock.running ? <Pause size={22} fill="currentColor" className="md:size-7" /> : <Play size={22} fill="currentColor" className="ml-0.5 md:ml-1 md:size-7" />}
      </button>
      {editing && <ClockEditModal game={game} remaining={remaining} onClose={() => setEditing(false)} />}
    </div>
  )
}

function ClockEditModal({ game, remaining, onClose }: { game: Game; remaining: number; onClose: () => void }) {
  const totalSec = Math.ceil(remaining / 1000)
  const [min, setMin] = useState(String(Math.floor(totalSec / 60)))
  const [sec, setSec] = useState(String(totalSec % 60).padStart(2, '0'))
  const max = periodLengthMs(game, game.clock.period)

  const apply = async () => {
    const ms = (Number(min) || 0) * 60_000 + (Number(sec) || 0) * 1000
    await setClockRemaining(game, ms)
    onClose()
  }
  const adjust = (delta: number) => {
    adjustClock(game, delta)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Chrono"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={apply}>
            Appliquer
          </Button>
        </>
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [-10_000, '−10 s'],
          [-1_000, '−1 s'],
          [1_000, '+1 s'],
          [10_000, '+10 s'],
        ].map(([d, label]) => (
          <Button key={label} size="lg" onClick={() => adjust(d as number)}>
            {label}
          </Button>
        ))}
      </div>
      <p className="mb-2 text-sm text-slate-400">Ou saisir le temps restant :</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="number" inputMode="numeric" min={0} max={Math.floor(max / 60_000)} value={min} onChange={(e) => setMin(e.target.value)} className="w-24 text-center text-2xl font-bold" aria-label="Minutes" />
        <span className="text-2xl font-bold">:</span>
        <Input type="number" inputMode="numeric" min={0} max={59} value={sec} onChange={(e) => setSec(e.target.value)} className="w-24 text-center text-2xl font-bold" aria-label="Secondes" />
        <Button variant="ghost" className="ml-auto" onClick={() => setClockRemaining(game, max).then(onClose)}>
          Remettre à {formatClock(max)}
        </Button>
      </div>
    </Modal>
  )
}

import { useEffect, type ReactNode } from 'react'
import type { Player } from '../../domain/types'
import { Jersey, cn } from '../ui'

export type FollowUp =
  | { kind: 'assist'; shotId: string; shooterId: string }
  | { kind: 'rebound'; shooterId?: string; linkedId: string }
  | { kind: 'ftCount'; playerId: string }
  | { kind: 'ftAttempt'; playerId: string; index: number; total: number }

/** Bandeau de question rapide après une action (passe, rebond, lancers francs) */
export function FollowUpPanel({
  title,
  subtitle,
  children,
  onDismiss,
  timeoutMs,
  dismissLabel,
}: {
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  onDismiss: () => void
  timeoutMs?: number
  dismissLabel: string
}) {
  useEffect(() => {
    if (!timeoutMs) return
    const t = setTimeout(onDismiss, timeoutMs)
    return () => clearTimeout(t)
  }, [timeoutMs, onDismiss])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4" onPointerDown={onDismiss}>
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl animate-pop"
        onPointerDown={(e) => e.stopPropagation()}
        role="dialog"
        data-testid="followup"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        {timeoutMs ? (
          <div className="h-1 origin-left bg-team" style={{ animation: `shrink ${timeoutMs}ms linear forwards` }} />
        ) : null}
        <div className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-xl font-bold">{title}</h2>
            {subtitle && <span className="text-sm text-slate-400">{subtitle}</span>}
          </div>
          {children}
          <button
            type="button"
            onClick={onDismiss}
            className="mt-3 h-14 w-full rounded-xl border border-slate-700 bg-slate-800 text-lg font-semibold text-slate-200 hover:bg-slate-700 active:scale-[0.99]"
          >
            {dismissLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function PlayerChoices({ ids, players, onPick }: { ids: string[]; players: Map<string, Player>; onPick: (id: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {ids.map((id) => {
        const p = players.get(id)
        return (
          <button
            key={id}
            type="button"
            onClick={() => onPick(id)}
            data-testid={`choice-${p?.number}`}
            className={cn('flex h-20 flex-col items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 hover:border-team hover:bg-team/15 active:scale-[0.97]')}
          >
            <Jersey number={p?.number ?? '?'} className="h-9 w-9 text-base" />
            <span className="max-w-full truncate px-1 text-sm font-semibold">{p ? p.lastName || p.firstName : '?'}</span>
          </button>
        )
      })}
    </div>
  )
}

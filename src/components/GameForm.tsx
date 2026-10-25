import { useState } from 'react'
import type { Game } from '../domain/types'
import { saveGame } from '../db/repo'
import { useSettings } from '../hooks/data'
import { Button, Field, Input, Modal, Segmented, Select, Toggle } from './ui'
import { toast } from './toast'

interface Draft {
  day: string
  time: string
  opponent: string
  homeAway: 'home' | 'away'
  competition: string
  location: string
  periods: number
  periodLength: number
  clockEnabled: boolean
  manualResult: boolean
  ourScore: string
  oppScore: string
}

function toDraft(game: Game | undefined, defaults: { periods: number; periodLength: number; clockEnabled: boolean }): Draft {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return {
    day: game?.date.slice(0, 10) ?? today,
    time: game?.date.slice(11, 16) ?? '15:00',
    opponent: game?.opponent ?? '',
    homeAway: game?.homeAway ?? 'home',
    competition: game?.competition ?? '',
    location: game?.location ?? '',
    periods: game?.periods ?? defaults.periods,
    periodLength: game?.periodLength ?? defaults.periodLength,
    clockEnabled: game?.clockEnabled ?? defaults.clockEnabled,
    manualResult: !!game?.manualResult,
    ourScore: game?.ourScore !== undefined ? String(game.ourScore) : '',
    oppScore: game?.oppScore !== undefined ? String(game.oppScore) : '',
  }
}

export function GameFormModal({
  open,
  onClose,
  seasonId,
  game,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  seasonId: string
  game?: Game
  onSaved?: (id: string) => void
}) {
  const settings = useSettings()
  if (!open) return null
  return (
    <GameFormInner
      onClose={onClose}
      seasonId={seasonId}
      game={game}
      onSaved={onSaved}
      initial={toDraft(game, { periods: settings.defaultPeriods, periodLength: settings.defaultPeriodLength, clockEnabled: settings.defaultClockEnabled })}
    />
  )
}

function GameFormInner({
  onClose,
  seasonId,
  game,
  onSaved,
  initial,
}: {
  onClose: () => void
  seasonId: string
  game?: Game
  onSaved?: (id: string) => void
  initial: Draft
}) {
  const [d, setD] = useState<Draft>(initial)
  const [error, setError] = useState<string>()
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }))
  const tracked = game && game.status !== 'planned' && !game.manualResult

  const submit = async () => {
    if (!d.opponent.trim()) return setError('Indiquez le nom de l’adversaire.')
    if (!d.day) return setError('Indiquez la date du match.')
    if (d.manualResult && (d.ourScore === '' || d.oppScore === '')) return setError('Indiquez le score des deux équipes.')
    const id = await saveGame({
      id: game?.id,
      seasonId,
      date: `${d.day}T${d.time || '00:00'}`,
      opponent: d.opponent.trim(),
      homeAway: d.homeAway,
      competition: d.competition.trim() || undefined,
      location: d.location.trim() || undefined,
      periods: d.periods,
      periodLength: d.periodLength,
      clockEnabled: d.clockEnabled,
      manualResult: d.manualResult,
      ...(d.manualResult ? { ourScore: Number(d.ourScore), oppScore: Number(d.oppScore) } : {}),
    })
    toast(game ? 'Match modifié' : 'Match créé')
    onSaved?.(id)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={game ? 'Modifier le match' : 'Nouveau match'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={submit}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form
        className="grid grid-cols-2 gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="col-span-2">
          <Field label="Adversaire">
            <Input autoFocus value={d.opponent} onChange={(e) => set({ opponent: e.target.value })} placeholder="ex. BC Lyon" />
          </Field>
        </div>
        <Field label="Date">
          <Input type="date" value={d.day} onChange={(e) => set({ day: e.target.value })} />
        </Field>
        <Field label="Heure">
          <Input type="time" value={d.time} onChange={(e) => set({ time: e.target.value })} />
        </Field>
        <div className="col-span-2">
          <Segmented
            className="w-full"
            value={d.homeAway}
            onChange={(homeAway) => set({ homeAway })}
            options={[
              { value: 'home', label: '🏠 Domicile' },
              { value: 'away', label: '🚌 Extérieur' },
            ]}
          />
        </div>
        <Field label="Compétition">
          <Input value={d.competition} onChange={(e) => set({ competition: e.target.value })} placeholder="Championnat, coupe…" />
        </Field>
        <Field label="Lieu">
          <Input value={d.location} onChange={(e) => set({ location: e.target.value })} placeholder="Gymnase…" />
        </Field>
        <Field label="Périodes">
          <Segmented
            className="w-full"
            value={d.periods}
            onChange={(periods) => set({ periods })}
            options={[
              { value: 2, label: '2 mi-temps' },
              { value: 4, label: '4 quarts-temps' },
            ]}
          />
        </Field>
        <Field label="Durée d’une période">
          <Select value={d.periodLength} onChange={(e) => set({ periodLength: Number(e.target.value) })} disabled={tracked}>
            {[5, 6, 7, 8, 10, 12, 15, 20].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </Select>
        </Field>
        <div className="col-span-2 rounded-xl border border-slate-800 px-4">
          <Toggle checked={d.clockEnabled} onChange={(clockEnabled) => set({ clockEnabled })} label="Suivre le chrono (minutes jouées)" />
        </div>
        {!tracked && (
          <div className="col-span-2 rounded-xl border border-slate-800 px-4 pb-2">
            <Toggle
              checked={d.manualResult}
              onChange={(manualResult) => set({ manualResult })}
              label="Match déjà joué : saisir seulement le score"
            />
            {d.manualResult && (
              <div className="grid grid-cols-2 gap-4 pb-2">
                <Field label="Notre score">
                  <Input inputMode="numeric" value={d.ourScore} onChange={(e) => set({ ourScore: e.target.value.replace(/\D/g, '') })} />
                </Field>
                <Field label="Score adverse">
                  <Input inputMode="numeric" value={d.oppScore} onChange={(e) => set({ oppScore: e.target.value.replace(/\D/g, '') })} />
                </Field>
              </div>
            )}
          </div>
        )}
        {error && <p className="col-span-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

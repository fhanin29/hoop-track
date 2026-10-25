import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ArrowRightLeft, Flag, History, Maximize, Settings2, SkipForward, Undo2 } from 'lucide-react'
import type { Game, GameEvent, Player, ZoneId } from '../domain/types'
import { describeEvent, periodLabel } from '../domain/types'
import { ZONES, detectZone, isThreePoint } from '../domain/court'
import { computeLiveState, formatClock, type Shot } from '../domain/stats'
import { addEvents, deleteEvents, finishGame, lastEvent, setClockEnabled, setPeriod, setSetting, updateEvent, type NewEvent } from '../db/repo'
import { useGame, useGameEvents, usePlayerMap, useSeason, useSettings } from '../hooks/data'
import { setVibrationEnabled, toggleFullscreen, useWakeLock, vibrate } from '../hooks/device'
import { Court } from '../components/Court'
import { Button, ConfirmDialog, Jersey, Modal, Segmented, Spinner, Toggle, cn } from '../components/ui'
import { Toaster, toast } from '../components/toast'
import { PAD, TONE_CLASSES, MAX_FOULS, eventTone, type PadAction } from '../components/live/actions'
import { SubModal } from '../components/live/SubModal'
import { FollowUpPanel, PlayerChoices, type FollowUp } from '../components/live/FollowUp'
import { EventEditModal } from '../components/live/EventEditModal'
import { ClockControl } from '../components/live/ClockControl'

interface ShotDraft {
  x: number
  y: number
  zone: ZoneId
  points: 2 | 3
}

type Pending = { kind: 'pad'; action: PadAction } | { kind: 'shot'; draft: ShotDraft; made: boolean }

const PAD_TO_EVENT: Record<PadAction, Pick<NewEvent, 'type' | 'made'>> = {
  FT_MADE: { type: 'FT', made: true },
  FT_MISS: { type: 'FT', made: false },
  REB_OFF: { type: 'REB_OFF' },
  REB_DEF: { type: 'REB_DEF' },
  AST: { type: 'AST' },
  TOV: { type: 'TOV' },
  STL: { type: 'STL' },
  BLK: { type: 'BLK' },
  FOUL: { type: 'FOUL' },
  FOUL_DRAWN: { type: 'FOUL_DRAWN' },
}

const shortName = (p?: Player) => (p ? `#${p.number} ${p.lastName || p.firstName}` : 'Équipe')

export default function LiveGame() {
  const { id } = useParams()
  const game = useGame(id)
  const events = useGameEvents(id)
  const season = useSeason()
  const players = usePlayerMap(season?.id)
  const settings = useSettings()
  useWakeLock()
  useEffect(() => setVibrationEnabled(settings.vibration), [settings.vibration])

  if (game === null) return <Navigate to="/matchs" replace />
  if (!game || !events || !season) return <Spinner />
  if (game.status !== 'live') return <Navigate to={`/matchs/${game.id}`} replace />
  return <LiveBoard game={game} events={events} players={players} teamName={season.teamName} vibration={settings.vibration} />
}

function LiveBoard({
  game,
  events,
  players,
  teamName,
  vibration,
}: {
  game: Game
  events: GameEvent[]
  players: Map<string, Player>
  teamName: string
  vibration: boolean
}) {
  const navigate = useNavigate()
  const live = useMemo(() => computeLiveState(game, events), [game, events])
  const [selected, setSelected] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [draft, setDraft] = useState<ShotDraft | null>(null)
  const [followUp, setFollowUp] = useState<FollowUp | null>(null)
  const [subOpen, setSubOpen] = useState<{ preselect?: string } | null>(null)
  const [editing, setEditing] = useState<GameEvent | null>(null)
  const [dialog, setDialog] = useState<'finish' | 'next' | 'options' | 'journal' | null>(null)
  const busy = useRef(false)

  const period = game.clock.period
  const pLabel = periodLabel(period, game.periods)
  const teamFouls = live.teamFouls[period] ?? 0
  const oppFouls = live.oppTeamFouls[period] ?? 0
  const roster = useMemo(
    () => [...game.rosterIds].sort((a, b) => (players.get(a)?.number ?? 0) - (players.get(b)?.number ?? 0)),
    [game.rosterIds, players],
  )
  const shots: Shot[] = useMemo(
    () =>
      events
        .filter((e) => e.type === 'SHOT' && e.x !== undefined && e.y !== undefined)
        .map((e) => ({ x: e.x!, y: e.y!, made: !!e.made, points: e.points ?? 2, playerId: e.playerId, gameId: e.gameId })),
    [events],
  )

  const dismissFollowUp = useCallback(() => setFollowUp(null), [])

  /** Enregistre des événements avec une notification « Annuler » */
  const record = async (items: NewEvent[], label: string) => {
    if (busy.current) return []
    busy.current = true
    try {
      const created = await addEvents(game, items)
      vibrate(15)
      toast(label, {
        action: { label: 'Annuler', onClick: () => deleteEvents(created.map((e) => e.id)) },
      })
      return created
    } finally {
      busy.current = false
    }
  }

  const commitAction = async (playerId: string, action: PadAction) => {
    const p = players.get(playerId)
    const ev = PAD_TO_EVENT[action]
    const [created] = await record([{ team: 'us', playerId, ...ev }], `${shortName(p)} · ${PAD.find((a) => a.action === action)!.label}`)
    if (!created) return
    if (action === 'FT_MISS') setFollowUp({ kind: 'rebound', shooterId: playerId, linkedId: created.id })
    if (action === 'FOUL_DRAWN') setFollowUp({ kind: 'ftCount', playerId })
    if (action === 'FOUL') {
      const fouls = (live.fouls[playerId] ?? 0) + 1
      if (fouls >= MAX_FOULS) {
        vibrate([120, 80, 120])
        toast(`${shortName(p)} : ${MAX_FOULS} fautes, joueur exclu`, { tone: 'error', duration: 6000 })
        setSubOpen({ preselect: playerId })
      } else if (fouls === MAX_FOULS - 1) {
        toast(`${shortName(p)} : ${fouls} fautes`, { tone: 'info' })
      }
    }
  }

  const commitShot = async (playerId: string, d: ShotDraft, made: boolean) => {
    const p = players.get(playerId)
    const [created] = await record(
      [{ team: 'us', type: 'SHOT', playerId, made, points: d.points, x: d.x, y: d.y, zone: d.zone }],
      `${shortName(p)} · ${d.points} pts ${made ? 'réussi' : 'raté'}`,
    )
    if (!created) return
    if (made) {
      if (live.onCourt.some((pid) => pid !== playerId)) setFollowUp({ kind: 'assist', shotId: created.id, shooterId: playerId })
    } else {
      setFollowUp({ kind: 'rebound', shooterId: playerId, linkedId: created.id })
    }
  }

  const onPlayer = (pid: string) => {
    if ((live.fouls[pid] ?? 0) >= MAX_FOULS) {
      toast('Joueur exclu (5 fautes) : faites un remplacement', { tone: 'error' })
      setSubOpen({ preselect: pid })
      return
    }
    if (pending) {
      const pnd = pending
      setPending(null)
      setSelected(null)
      if (pnd.kind === 'pad') commitAction(pid, pnd.action)
      else commitShot(pid, pnd.draft, pnd.made)
      return
    }
    setSelected((s) => (s === pid ? null : pid))
  }

  const onPad = (action: PadAction) => {
    setDraft(null)
    if (selected) {
      const pid = selected
      setSelected(null)
      commitAction(pid, action)
    } else {
      setPending((p) => (p?.kind === 'pad' && p.action === action ? null : { kind: 'pad', action }))
    }
  }

  const onCourtTap = (x: number, y: number) => {
    if (pending?.kind === 'pad') setPending(null)
    if (pending?.kind === 'shot') setPending(null)
    setDraft({ x, y, zone: detectZone(x, y), points: isThreePoint(x, y) ? 3 : 2 })
  }

  const onShotResult = (made: boolean) => {
    if (!draft) return
    const d = draft
    setDraft(null)
    if (selected) {
      const pid = selected
      setSelected(null)
      commitShot(pid, d, made)
    } else {
      setPending({ kind: 'shot', draft: d, made })
    }
  }

  const oppScore = (points: number) => {
    record([{ team: 'opp', type: 'OPP_SCORE', points }], `${teamNameShort(game.opponent)} +${points}`)
  }

  const undo = async () => {
    const last = await lastEvent(game.id)
    if (!last) return toast('Rien à annuler', { tone: 'info' })
    await deleteEvents([last.id])
    vibrate(30)
    toast(`Annulé : ${describe(last, players)}`, { tone: 'info' })
  }

  const removeEvent = async (e: GameEvent) => {
    const linked = events.filter((x) => x.linkedEventId === e.id).map((x) => x.id)
    await deleteEvents([e.id, ...linked])
    setEditing(null)
    toast(`Supprimé : ${describe(e, players)}`, { tone: 'info' })
  }

  const saveEdit = async (e: GameEvent, changes: Partial<GameEvent>) => {
    if (Object.keys(changes).length) {
      await updateEvent(e.id, changes)
      // Une passe décisive n'a plus de sens si le tir devient raté
      if (e.type === 'SHOT' && changes.made === false) {
        const assists = events.filter((x) => x.linkedEventId === e.id && x.type === 'AST').map((x) => x.id)
        if (assists.length) await deleteEvents(assists)
      }
      toast('Action modifiée')
    }
    setEditing(null)
  }

  const confirmSubs = async (pairs: { out: string; in: string }[]) => {
    setSubOpen(null)
    await record(
      pairs.map((p) => ({ team: 'us', type: 'SUB', playerId: p.in, outPlayerId: p.out })),
      pairs.length === 1
        ? `${shortName(players.get(p0(pairs).in))} remplace ${shortName(players.get(p0(pairs).out))}`
        : `${pairs.length} remplacements`,
    )
  }

  const nextPeriod = async () => {
    setDialog(null)
    await setPeriod(game, period + 1)
    toast(`Début : ${periodLabel(period + 1, game.periods)}`, { tone: 'info' })
  }

  const finish = async () => {
    await finishGame(game.id)
    navigate(`/matchs/${game.id}`)
  }

  const isLastRegular = period >= game.periods
  const canFinish = isLastRegular && live.usScore !== live.oppScore
  const guide = pending
    ? pending.kind === 'pad'
      ? `Choisissez le joueur : ${PAD.find((a) => a.action === pending.action)!.label}`
      : `Choisissez le tireur : ${pending.draft.points} pts ${pending.made ? 'réussi' : 'raté'}`
    : selected
      ? `${shortName(players.get(selected))} : touchez le terrain (tir) ou une action`
      : 'Touchez un joueur, le terrain ou une action'

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-950" data-testid="live">
      {/* Barre du haut */}
      {/* Smartphone : 2 lignes (retour, score, options / période, chrono, actions) ; tablette : 1 ligne */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-slate-800 bg-slate-900 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:h-20 md:flex-nowrap md:gap-3 md:px-3 md:py-0">
        <Link
          to={`/matchs/${game.id}`}
          className="order-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-300 hover:bg-slate-800 md:order-none md:h-12 md:w-12"
          aria-label="Retour"
        >
          <ArrowLeft size={26} />
        </Link>

        <div className="order-2 flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-black/30 px-2 py-1 md:order-none md:flex-none md:gap-3 md:px-4 md:py-1.5">
          <div className="min-w-0 flex-1 text-right md:flex-none">
            <div className="truncate text-xs font-semibold uppercase tracking-wide text-team md:max-w-36">{teamName}</div>
            <div className="text-xs text-slate-500">Fautes {foulBadge(teamFouls)}</div>
          </div>
          <div className="shrink-0 font-mono text-3xl font-black tabular-nums md:text-4xl" data-testid="score">
            <span className="text-white">{live.usScore}</span>
            <span className="mx-1 text-slate-600 md:mx-1.5">-</span>
            <span className="text-slate-300">{live.oppScore}</span>
          </div>
          <div className="min-w-0 flex-1 md:flex-none">
            <div className="truncate text-xs font-semibold uppercase tracking-wide text-slate-400 md:max-w-36">{game.opponent}</div>
            <div className="text-xs text-slate-500">Fautes {foulBadge(oppFouls)}</div>
          </div>
        </div>

        <div className="order-5 flex items-center gap-1 rounded-xl bg-slate-800 px-3 py-2 text-lg font-bold md:order-none md:text-xl" data-testid="period">
          {pLabel}
        </div>

        {game.clockEnabled ? (
          <ClockControl
            className="order-6 md:order-none"
            game={game}
            onExpire={() => {
              vibrate([300, 120, 300])
              toast(`Fin du ${pLabel}`, { tone: 'info', duration: 6000 })
            }}
          />
        ) : (
          <span className="order-6 text-sm text-slate-500 md:order-none">Chrono non suivi</span>
        )}

        <div className="order-7 ml-auto flex items-center gap-2 md:order-none">
          {canFinish ? (
            <Button variant="danger" size="sm" className="md:h-12 md:px-4 md:text-base" onClick={() => setDialog('finish')}>
              <Flag size={20} /> Terminer
            </Button>
          ) : (
            <Button size="sm" className="md:h-12 md:px-4 md:text-base" onClick={() => setDialog('next')}>
              <SkipForward size={20} /> {isLastRegular ? 'Prolongation' : `QT${period + 1}`}
            </Button>
          )}
          <Button size="sm" className="md:h-12 md:px-4 min-[1180px]:hidden" onClick={() => setDialog('journal')} aria-label="Journal">
            <History size={20} />
          </Button>
        </div>
        <Button variant="ghost" className="order-3 w-10 shrink-0 px-0! md:order-none md:w-12" onClick={() => setDialog('options')} aria-label="Options">
          <Settings2 size={22} />
        </Button>
        <div className="order-4 h-0 basis-full md:hidden" />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:flex-row md:gap-3 md:p-3">
        {/* Joueurs sur le terrain : en ligne sur smartphone, en colonne sur tablette */}
        <aside className="flex shrink-0 gap-1.5 md:w-56 md:flex-col md:gap-2">
          {live.onCourt.map((pid) => {
            const p = players.get(pid)
            const fouls = live.fouls[pid] ?? 0
            const excluded = fouls >= MAX_FOULS
            const isSel = selected === pid
            return (
              <button
                key={pid}
                type="button"
                onClick={() => onPlayer(pid)}
                data-testid={`oncourt-${p?.number}`}
                className={cn(
                  'relative flex min-h-0 min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl border px-0.5 py-1.5 text-center transition active:scale-[0.98] md:flex-row md:gap-3 md:rounded-2xl md:px-3 md:py-0 md:text-left',
                  isSel ? 'border-team bg-team/25 ring-2 ring-team' : 'border-slate-800 bg-slate-900 hover:bg-slate-800',
                  pending && !excluded && 'border-amber-400/70 bg-amber-400/10',
                  excluded && 'opacity-40',
                )}
              >
                <Jersey number={p?.number ?? '?'} className={cn('size-9! text-lg md:size-12! md:text-2xl', isSel && 'bg-team text-white')} />
                <span className="w-full min-w-0 md:w-auto md:flex-1">
                  <span className="block truncate text-xs font-bold leading-tight md:text-lg">{p ? p.lastName || p.firstName : '?'}</span>
                  <span className="text-[11px] text-slate-400 md:text-sm">
                    <b className="text-slate-200">{live.points[pid] ?? 0}</b> pts
                  </span>
                </span>
                <span className="flex gap-0.5 md:flex-col" aria-label={`${fouls} fautes`}>
                  {Array.from({ length: MAX_FOULS }, (_, i) => (
                    <span key={i} className={cn('h-1 w-1.5 rounded-full md:h-1.5 md:w-4', i < fouls ? (fouls >= 4 ? 'bg-red-500' : 'bg-amber-400') : 'bg-slate-700')} />
                  ))}
                </span>
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setSubOpen({})}
            aria-label="Changer"
            className="flex w-11 shrink-0 select-none items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 text-lg font-semibold text-slate-100 transition hover:bg-slate-700 active:scale-[0.97] md:h-14 md:w-auto md:px-6"
          >
            <ArrowRightLeft size={22} /> <span className="hidden md:inline">Changer</span>
          </button>
        </aside>

        {/* Terrain */}
        <section className="relative flex min-w-0 flex-1 flex-col">
          <div
            className={cn(
              'mb-2 flex h-9 shrink-0 items-center justify-between gap-2 rounded-xl px-3 text-xs font-semibold md:h-10 md:text-sm',
              pending ? 'bg-amber-400/15 text-amber-200' : 'bg-slate-900 text-slate-400',
            )}
            data-testid="guide"
          >
            <span className="truncate">{guide}</span>
            {(pending || selected) && (
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-slate-300 hover:bg-slate-800"
                onClick={() => {
                  setPending(null)
                  setSelected(null)
                }}
              >
                Annuler
              </button>
            )}
          </div>
          <div className="relative min-h-0 flex-1">
            <Court
              align="top"
              onTap={onCourtTap}
              shots={shots}
              showLabels={false}
              marker={draft ? { ...draft, three: draft.points === 3 } : pending?.kind === 'shot' ? { ...pending.draft, three: pending.draft.points === 3 } : null}
            />
            {draft && (
              <div className="absolute inset-x-1 bottom-1 z-20 rounded-2xl border border-slate-700 bg-slate-900/95 p-2 shadow-2xl backdrop-blur animate-pop md:inset-x-4 md:bottom-4 md:p-3" data-testid="shot-panel">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm text-slate-400">{ZONES[draft.zone].label}</span>
                  <Segmented
                    value={draft.points}
                    onChange={(v) => setDraft({ ...draft, points: v })}
                    options={[
                      { value: 2, label: '2 pts' },
                      { value: 3, label: '3 pts' },
                    ]}
                  />
                </div>
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <button type="button" onClick={() => onShotResult(true)} className="h-14 md:h-16 rounded-xl bg-emerald-600 text-xl font-bold text-white hover:bg-emerald-500 active:scale-[0.98]">
                    Réussi
                  </button>
                  <button type="button" onClick={() => onShotResult(false)} className="h-14 md:h-16 rounded-xl bg-red-600 text-xl font-bold text-white hover:bg-red-500 active:scale-[0.98]">
                    Raté
                  </button>
                  <button type="button" onClick={() => setDraft(null)} className="h-14 md:h-16 rounded-xl bg-slate-800 px-4 font-semibold text-slate-300 hover:bg-slate-700">
                    ✕
                  </button>
                </div>
              </div>
            )}
            <Toaster inline />
          </div>
        </section>

        {/* Actions */}
        <section className="flex shrink-0 flex-col gap-2 md:w-60">
          <div className="grid grid-cols-5 gap-1.5 md:min-h-0 md:flex-1 md:grid-cols-2 md:grid-rows-5 md:gap-2">
            {PAD.map((a) => (
              <button
                key={a.action}
                type="button"
                onClick={() => onPad(a.action)}
                className={cn(
                  'h-14 rounded-xl px-0.5 text-sm font-bold leading-tight shadow transition active:scale-[0.96] md:h-auto md:px-1 md:text-base',
                  TONE_CLASSES[a.tone].btn,
                  pending?.kind === 'pad' && pending.action === a.action && 'ring-4 ring-amber-300',
                )}
              >
                {a.short}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 p-1.5 md:block md:p-2">
            <div className="w-20 shrink-0 truncate text-center text-xs font-semibold uppercase tracking-wide text-slate-400 md:mb-1.5 md:w-auto">{game.opponent}</div>
            <div className="grid flex-1 grid-cols-3 gap-1.5 md:gap-2">
              {[1, 2, 3].map((n) => (
                <button key={n} type="button" onClick={() => oppScore(n)} className="h-11 rounded-xl bg-slate-700 text-lg font-black text-white hover:bg-slate-600 active:scale-[0.96] md:h-14 md:text-xl">
                  +{n}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Journal */}
        <section className="hidden w-64 shrink-0 flex-col min-[1180px]:flex">
          <Journal game={game} events={events} players={players} onEdit={setEditing} onUndo={undo} />
        </section>
      </div>

      {followUp && (
        <FollowUpView
          followUp={followUp}
          setFollowUp={setFollowUp}
          dismiss={dismissFollowUp}
          onCourt={live.onCourt}
          players={players}
          record={record}
        />
      )}

      {subOpen && (
        <SubModal
          open
          onClose={() => setSubOpen(null)}
          onCourt={live.onCourt}
          roster={roster}
          players={players}
          fouls={live.fouls}
          points={live.points}
          preselectOut={subOpen?.preselect}
          onConfirm={confirmSubs}
        />
      )}

      {editing && (
        <EventEditModal
          key={editing.id}
          event={editing}
          roster={roster}
          players={players}
          onClose={() => setEditing(null)}
          onSave={(c) => saveEdit(editing, c)}
          onDelete={() => removeEvent(editing)}
        />
      )}

      <Modal open={dialog === 'journal'} onClose={() => setDialog(null)} title="Journal du match">
        <div className="h-[60vh]">
          <Journal
            game={game}
            events={events}
            players={players}
            onEdit={(e) => {
              setDialog(null)
              setEditing(e)
            }}
            onUndo={undo}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={dialog === 'next'}
        title={isLastRegular ? 'Prolongation' : `Passer au QT${period + 1} ?`}
        message={
          <>
            Le {pLabel} se termine sur le score de <b>{live.usScore} - {live.oppScore}</b>.
            {game.clockEnabled && ' Le chrono sera remis à zéro pour la période suivante.'} Les fautes d'équipe repartent à 0.
          </>
        }
        confirmLabel={isLastRegular ? 'Lancer la prolongation' : `Commencer le QT${period + 1}`}
        onConfirm={nextPeriod}
        onCancel={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog === 'finish'}
        title="Terminer le match ?"
        message={
          <>
            Score final : <b>{teamName} {live.usScore} - {live.oppScore} {game.opponent}</b>. Vous pourrez rouvrir le match pour corriger la saisie.
          </>
        }
        confirmLabel="Terminer le match"
        danger
        onConfirm={finish}
        onCancel={() => setDialog(null)}
      />

      <Modal open={dialog === 'options'} onClose={() => setDialog(null)} title="Options du match">
        <div className="divide-y divide-slate-800">
          <Toggle checked={game.clockEnabled} onChange={(v) => setClockEnabled(game, v)} label="Suivre le chrono (temps de jeu des joueurs)" />
          <Toggle checked={vibration} onChange={(v) => setSetting('vibration', v)} label="Vibration à chaque saisie" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button onClick={() => toggleFullscreen()}>
            <Maximize size={18} /> Plein écran
          </Button>
          <Button onClick={() => setDialog('next')}>
            <SkipForward size={18} /> Période suivante
          </Button>
          <Button disabled={period <= 1} onClick={() => setPeriod(game, period - 1).then(() => setDialog(null))}>
            Période précédente
          </Button>
          <Button variant="danger" onClick={() => setDialog('finish')}>
            <Flag size={18} /> Terminer le match
          </Button>
        </div>
      </Modal>
    </div>
  )
}

const p0 = <T,>(arr: T[]) => arr[0]
const teamNameShort = (s: string) => (s.length > 18 ? `${s.slice(0, 17)}…` : s)

function foulBadge(n: number) {
  return <b className={cn('tabular-nums', n >= 5 ? 'text-red-400' : n >= 4 ? 'text-amber-300' : 'text-slate-300')}>{n}{n >= 5 && ' · LF'}</b>
}

function describe(e: GameEvent, players: Map<string, Player>): string {
  if (e.type === 'OPP_SCORE') return describeEvent(e)
  if (e.type === 'SUB') return `${shortName(players.get(e.playerId ?? ''))} ⇄ ${shortName(players.get(e.outPlayerId ?? ''))}`
  return `${shortName(players.get(e.playerId ?? ''))} · ${describeEvent(e)}`
}

function Journal({
  game,
  events,
  players,
  onEdit,
  onUndo,
}: {
  game: Game
  events: GameEvent[]
  players: Map<string, Player>
  onEdit: (e: GameEvent) => void
  onUndo: () => void
}) {
  const recent = useMemo(() => [...events].sort((a, b) => b.seq - a.seq).slice(0, 80), [events])
  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-900/70">
      <div className="flex items-center justify-between border-b border-slate-800 p-2 pl-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Journal</h2>
        <Button size="sm" onClick={onUndo} disabled={events.length === 0} data-testid="undo">
          <Undo2 size={16} /> Annuler
        </Button>
      </div>
      <ol className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2" data-testid="journal">
        {recent.length === 0 && <li className="p-3 text-center text-sm text-slate-500">Aucune action pour le moment</li>}
        {recent.map((e) => {
          const tone = e.type === 'SUB' ? null : eventTone(e.type, e.made)
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onEdit(e)}
                className={cn(
                  'mb-1 flex w-full items-start gap-2 rounded-lg border-l-4 bg-slate-800/50 px-2 py-1.5 text-left text-sm hover:bg-slate-800',
                  tone ? TONE_CLASSES[tone].border : 'border-l-slate-500',
                )}
              >
                <span className="w-12 shrink-0 font-mono text-xs leading-5 text-slate-500">
                  {periodLabel(e.period, game.periods).replace('Prol.', 'P')}
                  {e.clockMs !== undefined && <><br />{formatClock(e.clockMs)}</>}
                </span>
                <span className="min-w-0 flex-1 leading-5">
                  {describe(e, players)}
                  {e.zone && <span className="text-slate-500"> · {ZONES[e.zone].short}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function FollowUpView({
  followUp,
  setFollowUp,
  dismiss,
  onCourt,
  players,
  record,
}: {
  followUp: FollowUp
  setFollowUp: (f: FollowUp | null) => void
  dismiss: () => void
  onCourt: string[]
  players: Map<string, Player>
  record: (items: NewEvent[], label: string) => Promise<GameEvent[]>
}) {
  switch (followUp.kind) {
    case 'assist': {
      const ids = onCourt.filter((id) => id !== followUp.shooterId)
      return (
        <FollowUpPanel title="Passe décisive ?" subtitle={`Tir de ${shortName(players.get(followUp.shooterId))}`} onDismiss={dismiss} timeoutMs={5000} dismissLabel="Aucune passe">
          <PlayerChoices
            ids={ids}
            players={players}
            onPick={(pid) => {
              setFollowUp(null)
              record([{ team: 'us', type: 'AST', playerId: pid, linkedEventId: followUp.shotId }], `${shortName(players.get(pid))} · Passe décisive`)
            }}
          />
        </FollowUpPanel>
      )
    }
    case 'rebound':
      return (
        <FollowUpPanel title="Rebond offensif ?" subtitle="Sinon : rebond adverse" onDismiss={dismiss} timeoutMs={5000} dismissLabel="Rebond adverse / aucun">
          <PlayerChoices
            ids={onCourt}
            players={players}
            onPick={(pid) => {
              setFollowUp(null)
              record([{ team: 'us', type: 'REB_OFF', playerId: pid, linkedEventId: followUp.linkedId }], `${shortName(players.get(pid))} · Rebond offensif`)
            }}
          />
        </FollowUpPanel>
      )
    case 'ftCount':
      return (
        <FollowUpPanel title="Lancers francs ?" subtitle={`Faute subie par ${shortName(players.get(followUp.playerId))}`} onDismiss={dismiss} dismissLabel="Aucun lancer franc">
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setFollowUp({ kind: 'ftAttempt', playerId: followUp.playerId, index: 1, total: n })}
                className="h-20 rounded-xl bg-slate-800 text-2xl font-black hover:bg-slate-700 active:scale-[0.97]"
              >
                {n} LF
              </button>
            ))}
          </div>
        </FollowUpPanel>
      )
    case 'ftAttempt': {
      const { playerId, index, total } = followUp
      const shoot = async (made: boolean) => {
        const [created] = await record([{ team: 'us', type: 'FT', playerId, made }], `${shortName(players.get(playerId))} · LF ${index}/${total} ${made ? 'réussi' : 'raté'}`)
        if (index < total) setFollowUp({ ...followUp, index: index + 1 })
        else if (!made && created) setFollowUp({ kind: 'rebound', shooterId: playerId, linkedId: created.id })
        else setFollowUp(null)
      }
      return (
        <FollowUpPanel title={`Lancer franc ${index}/${total}`} subtitle={shortName(players.get(playerId))} onDismiss={dismiss} dismissLabel="Arrêter la saisie des LF">
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => shoot(true)} className="h-24 rounded-xl bg-emerald-600 text-2xl font-black text-white hover:bg-emerald-500 active:scale-[0.97]">
              ✓ Réussi
            </button>
            <button type="button" onClick={() => shoot(false)} className="h-24 rounded-xl bg-red-600 text-2xl font-black text-white hover:bg-red-500 active:scale-[0.97]">
              ✗ Raté
            </button>
          </div>
        </FollowUpPanel>
      )
    }
  }
}

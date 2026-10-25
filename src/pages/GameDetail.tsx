import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Download, MapPin, Pencil, Play, Printer, RotateCcw, Star, Timer, Trash2, Trophy, Users } from 'lucide-react'
import { playerName, POSITIONS } from '../domain/types'
import { computeBoxScore, evaluation, fga, fgm, formatMinutes, reb } from '../domain/stats'
import { deleteGame, reopenGame, startGame, toggleRosterPlayer, toggleStarterPlayer, updateGame } from '../db/repo'
import { useGame, useGameEvents, usePlayerMap, usePlayers, useSeason } from '../hooks/data'
import { formatDateTime } from '../lib/format'
import { download, slug, toCSV } from '../lib/export'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Jersey, Spinner, Toggle, cn } from '../components/ui'
import { GameFormModal } from '../components/GameForm'
import { GameSummary } from '../components/GameSummary'
import { toast } from '../components/toast'
import type { Game, Player } from '../domain/types'

export default function GameDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const season = useSeason()
  const game = useGame(id)
  const events = useGameEvents(id)
  const allPlayers = usePlayers(season?.id)
  const playerMap = usePlayerMap(season?.id)
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'reopen' | null>(null)

  if (game === null)
    return (
      <EmptyState icon={<Trophy size={48} />} title="Match introuvable">
        <Link to="/matchs" className="text-team underline">
          Retour aux matchs
        </Link>
      </EmptyState>
    )
  if (!game || !season || !events || !allPlayers) return <Spinner />

  const box = game.status !== 'planned' && !game.manualResult ? computeBoxScore(game, events) : null
  const us = box ? box.usScore : game.ourScore
  const opp = box ? box.oppScore : game.oppScore
  const win = us !== undefined && opp !== undefined && us > opp

  const exportCsv = () => {
    if (!box) return
    const header = ['N°', 'Joueur', 'MIN', 'PTS', '2PTS R', '2PTS T', '3PTS R', '3PTS T', 'LF R', 'LF T', 'TIRS R', 'TIRS T', 'RO', 'RD', 'RT', 'PD', 'BP', 'INT', 'CTR', 'FP', 'FPr', '+/-', 'EVAL']
    const rows = box.players
      .filter((l) => l.played)
      .map((l) => {
        const p = playerMap.get(l.playerId)
        return [p?.number, p ? playerName(p) : '?', box.minutesAvailable ? formatMinutes(l.minutesMs) : '', l.pts, l.fg2m, l.fg2a, l.fg3m, l.fg3a, l.ftm, l.fta, fgm(l), fga(l), l.oreb, l.dreb, reb(l), l.ast, l.tov, l.stl, l.blk, l.pf, l.fd, l.plusMinus, evaluation(l)]
      })
    const t = box.team
    rows.push(['', 'ÉQUIPE', '', t.pts, t.fg2m, t.fg2a, t.fg3m, t.fg3a, t.ftm, t.fta, fgm(t), fga(t), t.oreb, t.dreb, reb(t), t.ast, t.tov, t.stl, t.blk, t.pf, t.fd, '', evaluation(t)])
    download(`${game.date.slice(0, 10)}-${slug(season.teamName)}-vs-${slug(game.opponent)}.csv`, toCSV([[`${season.teamName} ${box.usScore} - ${box.oppScore} ${game.opponent}`], header, ...rows]), 'text/csv;charset=utf-8')
  }

  return (
    <div className="print-area">
      <div className="no-print mb-4">
        <Link to="/matchs" className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200">
          <ArrowLeft size={18} /> Matchs
        </Link>
      </div>

      <header className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-4 sm:gap-6 sm:p-6">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <span>{formatDateTime(game.date)}</span>
            <Badge>{game.homeAway === 'home' ? 'Domicile' : 'Extérieur'}</Badge>
            {game.competition && <Badge tone="blue">{game.competition}</Badge>}
            {game.status === 'live' && <Badge tone="red">EN DIRECT</Badge>}
          </div>
          <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">
            {season.teamName} <span className="text-slate-500">{game.homeAway === 'home' ? 'vs' : '@'}</span> {game.opponent}
          </h1>
          {game.location && (
            <p className="mt-1 flex items-center gap-1 text-slate-400">
              <MapPin size={16} /> {game.location}
            </p>
          )}
        </div>
        {us !== undefined && opp !== undefined && game.status !== 'planned' && (
          <div className="w-full text-center sm:w-auto">
            <div className="text-5xl font-black tabular-nums">
              <span className={cn(win && 'text-emerald-400')}>{us}</span>
              <span className="mx-2 text-slate-600">–</span>
              <span className={cn(!win && game.status === 'finished' && 'text-red-400')}>{opp}</span>
            </div>
            {game.status === 'finished' && <div className={cn('mt-1 text-sm font-bold uppercase', win ? 'text-emerald-400' : 'text-red-400')}>{win ? 'Victoire' : us === opp ? 'Égalité' : 'Défaite'}</div>}
          </div>
        )}
        <div className="no-print flex w-full flex-wrap gap-2">
          {game.status === 'live' && (
            <Button variant="primary" size="lg" onClick={() => navigate(`/matchs/${game.id}/live`)}>
              <Play size={20} /> Reprendre la saisie
            </Button>
          )}
          {box && game.status === 'finished' && (
            <>
              <Button onClick={exportCsv}>
                <Download size={18} /> Export CSV
              </Button>
              <Button onClick={() => window.print()}>
                <Printer size={18} /> Imprimer / PDF
              </Button>
              <Button onClick={() => setConfirm('reopen')}>
                <RotateCcw size={18} /> Rouvrir la saisie
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => setEditing(true)}>
            <Pencil size={18} /> Modifier
          </Button>
          <Button variant="ghost" className="text-red-400" onClick={() => setConfirm('delete')}>
            <Trash2 size={18} /> Supprimer
          </Button>
        </div>
      </header>

      {game.status === 'planned' && <Preparation game={game} players={allPlayers} onStart={async () => {
        await startGame(game.id)
        navigate(`/matchs/${game.id}/live`)
      }} />}

      {box && <GameSummary game={game} events={events} players={playerMap} season={season} />}

      {game.manualResult && (
        <p className="rounded-xl border border-slate-800 p-4 text-slate-400">
          Résultat saisi manuellement : aucune statistique individuelle pour ce match.
        </p>
      )}

      <GameFormModal open={editing} onClose={() => setEditing(false)} seasonId={season.id} game={game} />
      <ConfirmDialog
        open={confirm === 'delete'}
        danger
        title="Supprimer ce match ?"
        message={`Le match contre ${game.opponent} et ses ${events.length} actions enregistrées seront définitivement supprimés.`}
        confirmLabel="Supprimer"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await deleteGame(game.id)
          toast('Match supprimé', { tone: 'info' })
          navigate('/matchs')
        }}
      />
      <ConfirmDialog
        open={confirm === 'reopen'}
        title="Rouvrir la saisie ?"
        message="Le match repasse en direct pour corriger ou compléter les actions."
        confirmLabel="Rouvrir"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await reopenGame(game.id)
          navigate(`/matchs/${game.id}/live`)
        }}
      />
    </div>
  )
}

function Preparation({ game, players, onStart }: { game: Game; players: Player[]; onStart: () => void }) {
  const candidates = players.filter((p) => p.active || game.rosterIds.includes(p.id))
  const roster = new Set(game.rosterIds)
  const starters = new Set(game.starterIds)

  const toggleRoster = (id: string) => toggleRosterPlayer(game.id, id)
  const toggleStarter = async (id: string) => {
    if (!(await toggleStarterPlayer(game.id, id))) toast('Le cinq de départ est complet : retirez d’abord un joueur.', { tone: 'error' })
  }

  if (candidates.length === 0)
    return (
      <EmptyState icon={<Users size={48} />} title="Aucun joueur dans l’effectif">
        <Link to="/joueurs">
          <Button variant="primary" className="mt-2">Ajouter des joueurs</Button>
        </Link>
      </EmptyState>
    )

  const ready = starters.size === 5
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card
        className="lg:col-span-2"
        title={`Feuille de match · ${roster.size} convoqué${roster.size > 1 ? 's' : ''}`}
        action={
          <Button size="sm" variant="ghost" onClick={() => updateGame(game.id, { rosterIds: candidates.map((p) => p.id) })}>
            Tout convoquer
          </Button>
        }
      >
        <p className="mb-3 text-sm text-slate-400">Touchez un joueur pour le convoquer, puis l’étoile pour l’ajouter au cinq de départ.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {candidates.map((p) => {
            const inRoster = roster.has(p.id)
            const starter = starters.has(p.id)
            return (
              <div key={p.id} className={cn('flex items-center gap-2 rounded-xl border p-2 transition', inRoster ? 'border-team/50 bg-team/5' : 'border-slate-800 opacity-60')}>
                <button type="button" onClick={() => toggleRoster(p.id)} className="flex min-h-12 flex-1 items-center gap-3 text-left" aria-pressed={inRoster}>
                  <Jersey number={p.number} muted={!inRoster} />
                  <span>
                    <span className="block font-semibold">{playerName(p)}</span>
                    <span className="text-xs text-slate-500">{p.position ? POSITIONS[p.position] : ''}</span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={starter ? 'Retirer du cinq de départ' : 'Ajouter au cinq de départ'}
                  aria-pressed={starter}
                  onClick={() => toggleStarter(p.id)}
                  className={cn('flex h-12 w-12 items-center justify-center rounded-xl transition', starter ? 'bg-team text-white' : 'bg-slate-800 text-slate-500')}
                >
                  <Star size={22} fill={starter ? 'currentColor' : 'none'} />
                </button>
              </div>
            )
          })}
        </div>
      </Card>
      <div className="flex flex-col gap-4">
        <Card title={`Cinq de départ (${starters.size}/5)`}>
          <ul className="flex flex-col gap-2">
            {game.starterIds.map((sid) => {
              const p = players.find((x) => x.id === sid)
              return p ? (
                <li key={sid} className="flex items-center gap-3">
                  <Jersey number={p.number} />
                  <span className="font-semibold">{playerName(p)}</span>
                </li>
              ) : null
            })}
            {Array.from({ length: 5 - starters.size }, (_, i) => (
              <li key={i} className="flex h-10 items-center rounded-xl border border-dashed border-slate-700 px-3 text-sm text-slate-600">
                À choisir
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <Toggle
            checked={game.clockEnabled}
            onChange={(clockEnabled) => updateGame(game.id, { clockEnabled })}
            label={
              <span className="flex items-center gap-2">
                <Timer size={18} /> Suivre le chrono
              </span>
            }
          />
          <p className="mb-3 text-xs text-slate-500">
            {game.periods} × {game.periodLength} min. Sans chrono, seules les minutes jouées ne sont pas calculées.
          </p>
          <Button variant="primary" size="lg" className="w-full" disabled={!ready} onClick={onStart}>
            <Play size={22} /> Démarrer le match
          </Button>
          {!ready && <p className="mt-2 text-center text-sm text-amber-400">Choisissez 5 joueurs de départ.</p>}
        </Card>
      </div>
    </div>
  )
}

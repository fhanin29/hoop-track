import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { BarChart3, CalendarPlus, ChevronRight, Database, Flame, Plus, Radio, Trophy, UserPlus } from 'lucide-react'
import { fmt1, perGame, reb, type SeasonStats } from '../domain/stats'
import type { Game, Player } from '../domain/types'
import { seedDemoSeason } from '../db/demo'
import { useGames, usePlayerMap, usePlayers, useSeason, useSeasonStats } from '../hooks/data'
import { formatDateTime, formatShortDate, isUpcoming } from '../lib/format'
import { Button, Card, PageHeader, Spinner, StatTile, cn } from '../components/ui'
import { DiffChart, GREEN, BLUE, LeadersChart } from '../components/charts'
import { GameCard } from './Games'
import { GameFormModal } from '../components/GameForm'
import { toast } from '../components/toast'

type LeaderKey = 'pts' | 'reb' | 'ast' | 'eval'

const LEADERS: { key: LeaderKey; label: string; color?: string }[] = [
  { key: 'pts', label: 'Points' },
  { key: 'reb', label: 'Rebonds', color: BLUE },
  { key: 'ast', label: 'Passes', color: GREEN },
  { key: 'eval', label: 'Évaluation' },
]

export function leaders(stats: SeasonStats, players: Map<string, Player>, key: LeaderKey, limit = 5) {
  return [...stats.players.values()]
    .filter((s) => s.gp > 0 && players.has(s.playerId))
    .map((s) => {
      const p = players.get(s.playerId)!
      const total = key === 'pts' ? s.totals.pts : key === 'reb' ? reb(s.totals) : key === 'ast' ? s.totals.ast : s.evalTotal
      return { name: `#${p.number} ${p.lastName || p.firstName}`, value: Math.round(perGame(total, s.gp) * 10) / 10 }
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

export default function Dashboard() {
  const season = useSeason()
  const players = usePlayers(season?.id)
  const playerMap = usePlayerMap(season?.id)
  const games = useGames(season?.id)
  const stats = useSeasonStats(season?.id)
  const navigate = useNavigate()
  const [leaderKey, setLeaderKey] = useState<LeaderKey>('pts')
  const [newGame, setNewGame] = useState(false)
  const [loading, setLoading] = useState(false)

  const upcoming = useMemo(() => (games ?? []).filter((g) => g.status === 'planned').sort((a, b) => a.date.localeCompare(b.date)), [games])
  const live = useMemo(() => (games ?? []).find((g) => g.status === 'live'), [games])

  if (!season || !players || !games || !stats) return <Spinner />

  if (players.length === 0 && games.length === 0) {
    const loadDemo = async () => {
      setLoading(true)
      await seedDemoSeason(season)
      setLoading(false)
      toast('Données de démonstration chargées')
    }
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center py-8 text-center sm:py-16">
        <div className="mb-6 rounded-3xl bg-team/15 p-6 text-team">
          <Trophy size={64} />
        </div>
        <h1 className="text-3xl font-black sm:text-4xl">Bienvenue dans Hoop Track</h1>
        <p className="mt-3 text-lg text-slate-400">
          Suivez votre équipe toute la saison : effectif, matchs, saisie des actions en direct et statistiques détaillées.
        </p>
        <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
          <Button variant="primary" size="lg" onClick={() => navigate('/joueurs?nouveau=1')}>
            <UserPlus size={22} /> Ajouter des joueurs
          </Button>
          <Button size="lg" onClick={loadDemo} disabled={loading}>
            <Database size={22} /> {loading ? 'Chargement…' : 'Charger la démo'}
          </Button>
        </div>
        <ol className="mt-10 space-y-3 text-left text-slate-300">
          <li><b className="text-team">1.</b> Créez l'effectif (numéro, nom, poste).</li>
          <li><b className="text-team">2.</b> Ajoutez les matchs de la saison.</li>
          <li><b className="text-team">3.</b> Le jour du match : convocations, cinq de départ, puis saisie en direct.</li>
          <li><b className="text-team">4.</b> Consultez les stats de l'équipe et de chaque joueur.</li>
        </ol>
      </div>
    )
  }

  const played = stats.results.length
  const recent = [...stats.results].reverse().slice(0, 4)
  const next = upcoming[0]
  const diffData = stats.results.map((r) => ({ label: formatShortDate(r.game.date), opponent: r.game.opponent, diff: r.us - r.opp }))
  const leader = LEADERS.find((l) => l.key === leaderKey)!
  const leaderData = stats.trackedGames ? leaders(stats, playerMap, leaderKey) : []

  return (
    <div>
      <PageHeader
        title={season.teamName}
        subtitle={season.name}
        actions={
          <Button variant="primary" onClick={() => setNewGame(true)}>
            <Plus size={20} /> Nouveau match
          </Button>
        }
      />

      {live && (
        <Link
          to={`/matchs/${live.id}/live`}
          className="mb-5 flex items-center gap-3 rounded-2xl border border-red-500/50 bg-red-500/10 p-3 transition hover:bg-red-500/15 sm:gap-4 sm:p-4"
        >
          <Radio className="animate-pulse text-red-400" size={28} />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold uppercase tracking-wider text-red-300">Match en cours</div>
            <div className="truncate text-lg font-bold">contre {live.opponent}</div>
          </div>
          <span className="shrink-0 rounded-xl bg-red-600 px-3 py-2 font-bold text-white sm:px-4">
            Reprendre<span className="hidden sm:inline"> la saisie</span>
          </span>
        </Link>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Bilan"
          value={
            <span>
              <span className="text-emerald-400">{stats.wins}V</span> <span className="text-slate-600">-</span>{' '}
              <span className="text-red-400">{stats.losses}D</span>
            </span>
          }
          sub={played ? `${Math.round((stats.wins / played) * 100)} % de victoires` : 'Aucun match joué'}
        />
        <StatTile
          label="Série en cours"
          value={
            stats.streak ? (
              <span className={cn('flex items-center gap-1', stats.streak.type === 'V' ? 'text-emerald-400' : 'text-red-400')}>
                {stats.streak.type === 'V' && <Flame size={26} />}
                {stats.streak.count} {stats.streak.type === 'V' ? 'victoire' : 'défaite'}
                {stats.streak.count > 1 ? 's' : ''}
              </span>
            ) : (
              '–'
            )
          }
        />
        <StatTile label="Points marqués" value={played ? fmt1(perGame(stats.pointsFor, played)) : '–'} sub="par match" accent />
        <StatTile
          label="Points encaissés"
          value={played ? fmt1(perGame(stats.pointsAgainst, played)) : '–'}
          sub={played ? `écart moyen ${stats.pointsFor >= stats.pointsAgainst ? '+' : ''}${fmt1(perGame(stats.pointsFor - stats.pointsAgainst, played))}` : 'par match'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <Card title="Prochain match">
            {next ? (
              <NextGame game={next} />
            ) : (
              <div className="flex items-center justify-between gap-3 text-slate-400">
                Aucun match programmé.
                <Button size="sm" onClick={() => setNewGame(true)}>
                  <CalendarPlus size={18} /> Programmer
                </Button>
              </div>
            )}
          </Card>
          <Card title="Écart de points par match">
            {diffData.length ? <DiffChart data={diffData} /> : <p className="text-slate-500">Les résultats apparaîtront ici après le premier match.</p>}
          </Card>
        </div>
        <div className="space-y-5 lg:col-span-2">
          <Card
            title="Meilleurs joueurs (par match)"
            action={
              <Link to="/stats" className="flex items-center gap-1 text-sm text-team">
                <BarChart3 size={16} /> Stats
              </Link>
            }
          >
            <div className="mb-3 flex flex-wrap gap-1">
              {LEADERS.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => setLeaderKey(l.key)}
                  className={cn('rounded-lg px-3 py-1.5 text-sm font-semibold', leaderKey === l.key ? 'bg-team text-white' : 'bg-slate-800 text-slate-400')}
                >
                  {l.label}
                </button>
              ))}
            </div>
            {leaderData.length ? <LeadersChart data={leaderData} color={leader.color} /> : <p className="text-slate-500">Pas encore de match suivi en direct.</p>}
          </Card>
          <Card title="Derniers résultats">
            <div className="space-y-2">
              {recent.length === 0 && <p className="text-slate-500">Aucun match terminé.</p>}
              {recent.map((r) => (
                <GameCard key={r.game.id} game={r.game} score={{ us: r.us, opp: r.opp }} />
              ))}
            </div>
          </Card>
        </div>
      </div>

      <GameFormModal open={newGame} onClose={() => setNewGame(false)} seasonId={season.id} onSaved={(gid) => navigate(`/matchs/${gid}`)} />
    </div>
  )
}

function NextGame({ game }: { game: Game }) {
  const soon = isUpcoming(game.date)
  return (
    <Link to={`/matchs/${game.id}`} className="flex items-center gap-3 rounded-xl bg-slate-800/50 p-3 hover:bg-slate-800 sm:gap-4 sm:p-4">
      <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-team/15 text-team">
        <span className="text-xl font-black leading-none">{game.date.slice(8, 10)}</span>
        <span className="text-xs font-bold uppercase">{new Date(game.date).toLocaleDateString('fr-FR', { month: 'short' })}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-lg font-bold sm:text-xl">
          {game.homeAway === 'home' ? 'vs' : '@'} {game.opponent}
        </div>
        <div className="text-sm text-slate-400">
          {formatDateTime(game.date)}
          {game.competition && ` · ${game.competition}`}
        </div>
      </div>
      <span className={cn('hidden rounded-xl px-4 py-2 font-bold sm:block', soon ? 'bg-team text-white' : 'bg-slate-700 text-slate-200')}>Préparer</span>
      <ChevronRight className="shrink-0 text-slate-500 sm:hidden" size={22} />
    </Link>
  )
}

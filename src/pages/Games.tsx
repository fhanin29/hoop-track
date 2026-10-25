import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { CalendarDays, CalendarPlus, MapPin, Radio } from 'lucide-react'
import type { Game } from '../domain/types'
import { useGames, useSeason, useSeasonStats } from '../hooks/data'
import { formatDateTime } from '../lib/format'
import { Badge, Button, EmptyState, PageHeader, Segmented, Spinner, cn } from '../components/ui'
import { GameFormModal } from '../components/GameForm'

type Filter = 'upcoming' | 'played' | 'all'

export function GameCard({ game, score }: { game: Game; score?: { us: number; opp: number } }) {
  const finished = game.status === 'finished'
  const win = score && score.us > score.opp
  return (
    <Link
      to={game.status === 'live' ? `/matchs/${game.id}/live` : `/matchs/${game.id}`}
      className={cn(
        'flex items-center gap-4 rounded-2xl border bg-slate-900/70 p-4 transition hover:bg-slate-900',
        game.status === 'live' ? 'border-red-500/50' : 'border-slate-800',
      )}
    >
      <div
        className={cn(
          'flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl text-xs font-bold',
          game.status === 'live' ? 'bg-red-600 text-white' : finished ? (win ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400') : 'bg-slate-800 text-slate-300',
        )}
      >
        {game.status === 'live' ? (
          <>
            <Radio size={20} className="animate-pulse" />
            LIVE
          </>
        ) : finished ? (
          <span className="text-2xl font-black">{win ? 'V' : 'D'}</span>
        ) : (
          <>
            <span className="text-lg leading-none">{game.date.slice(8, 10)}</span>
            <span className="uppercase">{new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(new Date(game.date))}</span>
          </>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">{game.homeAway === 'home' ? 'vs' : '@'}</span>
          <span className="truncate text-lg font-bold">{game.opponent}</span>
          {game.manualResult && <Badge>Score seul</Badge>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-slate-400">
          <span>{formatDateTime(game.date)}</span>
          {game.competition && <span>· {game.competition}</span>}
          {game.location && (
            <span className="flex items-center gap-1">
              <MapPin size={14} /> {game.location}
            </span>
          )}
        </div>
      </div>
      {score && (finished || game.status === 'live') && (
        <div className="text-right text-2xl font-black tabular-nums">
          <span className={cn(win && 'text-emerald-400')}>{score.us}</span>
          <span className="mx-1 text-slate-600">–</span>
          <span className={cn(!win && finished && 'text-red-400')}>{score.opp}</span>
        </div>
      )}
    </Link>
  )
}

export default function Games() {
  const season = useSeason()
  const games = useGames(season?.id)
  const stats = useSeasonStats(season?.id)
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const [creating, setCreating] = useState(false)

  if (!season || !games) return <Spinner />

  const scores = new Map(stats?.results.map((r) => [r.game.id, { us: r.us, opp: r.opp }]))
  const upcoming = games.filter((g) => g.status !== 'finished')
  const played = games.filter((g) => g.status === 'finished').reverse()
  const list = filter === 'upcoming' ? upcoming : filter === 'played' ? played : [...upcoming, ...played]

  return (
    <>
      <PageHeader
        title="Matchs"
        subtitle={stats ? `${stats.wins} victoire${stats.wins > 1 ? 's' : ''} · ${stats.losses} défaite${stats.losses > 1 ? 's' : ''}` : undefined}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <CalendarPlus size={20} /> Nouveau match
          </Button>
        }
      />
      <Segmented
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: `Tous (${games.length})` },
          { value: 'upcoming', label: `À venir (${upcoming.length})` },
          { value: 'played', label: `Joués (${played.length})` },
        ]}
      />
      {list.length === 0 ? (
        <EmptyState icon={<CalendarDays size={48} />} title={games.length ? 'Aucun match dans cette catégorie' : 'Aucun match programmé'}>
          Créez un match pour préparer la feuille de match et saisir les statistiques en direct.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((g) => (
            <GameCard key={g.id} game={g} score={scores.get(g.id)} />
          ))}
        </div>
      )}
      <GameFormModal open={creating} onClose={() => setCreating(false)} seasonId={season.id} onSaved={(id) => navigate(`/matchs/${id}`)} />
    </>
  )
}

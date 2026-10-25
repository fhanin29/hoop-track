import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Pencil, UserX } from 'lucide-react'
import { POSITIONS, playerName } from '../domain/types'
import { efg, evaluation, fga, fgm, fmt1, formatMinutes, formatPct, pct, perGame, reb, zoneStats, type SeasonPlayerStats, type StatLine } from '../domain/stats'
import { usePlayers, useSeason, useSeasonStats } from '../hooks/data'
import { formatShortDate } from '../lib/format'
import { Court, HeatLegend, ShotLegend } from '../components/Court'
import { BLUE, GREEN, PlayerRadar, PointsSplitChart, TEAM, TrendChart } from '../components/charts'
import { Badge, Button, Card, EmptyState, Jersey, Segmented, Spinner, StatTile, cn } from '../components/ui'

const RADAR_AXES: { axis: string; value: (s: SeasonPlayerStats) => number; format: (v: number) => string }[] = [
  { axis: 'Points', value: (s) => perGame(s.totals.pts, s.gp), format: fmt1 },
  { axis: 'Rebonds', value: (s) => perGame(reb(s.totals), s.gp), format: fmt1 },
  { axis: 'Passes', value: (s) => perGame(s.totals.ast, s.gp), format: fmt1 },
  { axis: 'Interceptions', value: (s) => perGame(s.totals.stl, s.gp), format: fmt1 },
  { axis: 'Contres', value: (s) => perGame(s.totals.blk, s.gp), format: fmt1 },
  { axis: 'Fautes prov.', value: (s) => perGame(s.totals.fd, s.gp), format: fmt1 },
  { axis: 'Adresse (eFG)', value: (s) => efg(s.totals) ?? 0, format: (v) => `${Math.round(v * 100)} %` },
]

export default function PlayerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const season = useSeason()
  const players = usePlayers(season?.id)
  const stats = useSeasonStats(season?.id)
  const [shotView, setShotView] = useState<'dots' | 'heat'>('dots')

  const player = players?.find((p) => p.id === id)
  const ps = id ? stats?.players.get(id) : undefined

  const radar = useMemo(() => {
    if (!stats || !ps) return []
    const all = [...stats.players.values()].filter((s) => s.gp > 0)
    return RADAR_AXES.map(({ axis, value, format }) => {
      const values = all.map(value)
      const max = Math.max(...values, 0.0001)
      const teamAvg = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)
      const v = value(ps)
      return { axis, player: Math.round((v / max) * 100), team: Math.round((teamAvg / max) * 100), playerRaw: format(v), teamRaw: format(teamAvg) }
    })
  }, [stats, ps])

  if (!players || !stats || !season) return <Spinner />
  if (!player)
    return (
      <EmptyState icon={<UserX size={48} />} title="Joueur introuvable">
        <Link to="/joueurs" className="text-team underline">
          Retour à l'effectif
        </Link>
      </EmptyState>
    )

  const t: StatLine | undefined = ps?.totals
  const gp = ps?.gp ?? 0
  const avg = (v: number) => fmt1(perGame(v, gp))

  return (
    <div>
      <Link to="/joueurs" className="mb-4 inline-flex items-center gap-1 text-slate-400 hover:text-slate-200">
        <ArrowLeft size={18} /> Effectif
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-5">
        <Jersey number={player.number} className="h-16 w-16 rounded-2xl text-3xl! sm:h-20 sm:w-20 sm:text-4xl!" />
        <div className="flex-1">
          <h1 className="text-3xl font-black">{playerName(player)}</h1>
          <div className="mt-1 flex items-center gap-2 text-slate-400">
            {player.position && <Badge tone="team">{POSITIONS[player.position]}</Badge>}
            {!player.active && <Badge>Inactif</Badge>}
            <span>
              {gp} match{gp > 1 ? 's' : ''} joué{gp > 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <Button onClick={() => navigate(`/joueurs?modifier=${player.id}`)}>
          <Pencil size={18} /> Modifier
        </Button>
      </div>

      {!ps || !t ? (
        <Card>
          <p className="py-8 text-center text-slate-500">Aucune statistique : le joueur n'a pas encore participé à un match suivi en direct.</p>
        </Card>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Points" value={avg(t.pts)} sub="par match" accent />
            <StatTile label="Rebonds" value={avg(reb(t))} sub={`${avg(t.oreb)} off. · ${avg(t.dreb)} déf.`} />
            <StatTile label="Passes D." value={avg(t.ast)} sub={`${avg(t.tov)} balles perdues`} />
            <StatTile label="Évaluation" value={avg(ps.evalTotal)} sub="par match" />
            <StatTile label="Interc. / Contres" value={`${avg(t.stl)} / ${avg(t.blk)}`} sub={`${avg(t.fd)} fautes prov.`} />
            <StatTile
              label="Minutes"
              value={ps.minutesGames ? formatMinutes(ps.minutesMs / ps.minutesGames) : '–'}
              sub={ps.minutesGames ? `sur ${ps.minutesGames} match${ps.minutesGames > 1 ? 's' : ''} chronométré${ps.minutesGames > 1 ? 's' : ''}` : 'chrono non suivi'}
            />
          </div>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ShootTile label="Tirs" m={fgm(t)} a={fga(t)} />
            <ShootTile label="2 points" m={t.fg2m} a={t.fg2a} />
            <ShootTile label="3 points" m={t.fg3m} a={t.fg3a} />
            <ShootTile label="Lancers francs" m={t.ftm} a={t.fta} />
          </div>

          <div className="mb-5 grid gap-5 lg:grid-cols-2">
            <Card title="Évolution par match">
              <TrendChart
                data={ps.games.map((g) => ({ label: formatShortDate(g.game.date), pts: g.line.pts, eval: g.eval, reb: reb(g.line) }))}
                series={[
                  { key: 'pts', name: 'Points', color: TEAM },
                  { key: 'eval', name: 'Évaluation', color: GREEN, dashed: true },
                  { key: 'reb', name: 'Rebonds', color: BLUE },
                ]}
              />
            </Card>
            <Card title="Profil comparé à l'équipe">
              <PlayerRadar data={radar} playerName={player.lastName || player.firstName} />
            </Card>
          </div>

          <div className="mb-5 grid gap-5 lg:grid-cols-5">
            <Card
              title="Carte des tirs"
              className="lg:col-span-3"
              action={
                <Segmented
                  value={shotView}
                  onChange={setShotView}
                  options={[
                    { value: 'dots', label: 'Tirs' },
                    { value: 'heat', label: 'Zones' },
                  ]}
                />
              }
            >
              <div className="mx-auto max-w-lg">
                <Court shots={shotView === 'dots' ? ps.shots : undefined} heat={shotView === 'heat' ? zoneStats(ps.shots) : undefined} />
              </div>
              <div className="mt-3 flex justify-center">{shotView === 'dots' ? <ShotLegend /> : <HeatLegend />}</div>
            </Card>
            <Card title="Répartition des points" className="lg:col-span-2">
              <PointsSplitChart line={t} height={260} />
            </Card>
          </div>

          <Card title="Matchs">
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-max text-sm tabular-nums">
                <thead className="text-xs uppercase tracking-wider text-slate-400">
                  <tr className="border-b border-slate-800">
                    {['Date', 'Adversaire', 'Rés.', 'MIN', 'PTS', 'TIRS', '3PTS', 'LF', 'RT', 'PD', 'INT', 'CTR', 'BP', 'FP', 'FPr', '+/-', 'ÉVAL'].map((h, i) => (
                      <th key={h} className={cn('px-2 py-2', i < 2 ? 'text-left' : 'text-right')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {[...ps.games].reverse().map(({ game, line }) => {
                    const r = stats.results.find((x) => x.game.id === game.id)
                    return (
                      <tr key={game.id} className="cursor-pointer hover:bg-slate-800/50" onClick={() => navigate(`/matchs/${game.id}`)}>
                        <td className="px-2 py-2">{formatShortDate(game.date)}</td>
                        <td className="px-2 py-2 font-semibold">{game.opponent}</td>
                        <td className={cn('px-2 py-2 text-right font-bold', r?.win ? 'text-emerald-400' : 'text-red-400')}>
                          {r ? `${r.win ? 'V' : 'D'} ${r.us}-${r.opp}` : ''}
                        </td>
                        <td className="px-2 py-2 text-right">{formatMinutes(line.minutesMs)}</td>
                        <td className="px-2 py-2 text-right font-bold">{line.pts}</td>
                        <td className="px-2 py-2 text-right">{fgm(line)}/{fga(line)}</td>
                        <td className="px-2 py-2 text-right">{line.fg3m}/{line.fg3a}</td>
                        <td className="px-2 py-2 text-right">{line.ftm}/{line.fta}</td>
                        <td className="px-2 py-2 text-right">{reb(line)}</td>
                        <td className="px-2 py-2 text-right">{line.ast}</td>
                        <td className="px-2 py-2 text-right">{line.stl}</td>
                        <td className="px-2 py-2 text-right">{line.blk}</td>
                        <td className="px-2 py-2 text-right">{line.tov}</td>
                        <td className="px-2 py-2 text-right">{line.pf}</td>
                        <td className="px-2 py-2 text-right">{line.fd}</td>
                        <td className={cn('px-2 py-2 text-right', line.plusMinus > 0 ? 'text-emerald-400' : line.plusMinus < 0 ? 'text-red-400' : '')}>
                          {line.plusMinus > 0 ? '+' : ''}
                          {line.plusMinus}
                        </td>
                        <td className="px-2 py-2 text-right font-bold">{evaluation(line)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function ShootTile({ label, m, a }: { label: string; m: number; a: number }) {
  const p = pct(m, a)
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
        <span className="text-sm text-slate-400">
          {m}/{a}
        </span>
      </div>
      <div className="mt-1 text-2xl font-extrabold">{formatPct(p)}</div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-team" style={{ width: `${Math.round((p ?? 0) * 100)}%` }} />
      </div>
    </div>
  )
}

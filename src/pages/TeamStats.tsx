import { useMemo, useState } from 'react'
import { BarChart3, Download } from 'lucide-react'
import { playerName } from '../domain/types'
import { efg, fga, fgm, fmt1, formatMinutes, formatPct, pct, perGame, reb, zoneStats } from '../domain/stats'
import { usePlayerMap, useSeason, useSeasonStats } from '../hooks/data'
import { formatShortDate } from '../lib/format'
import { download, slug, toCSV } from '../lib/export'
import { Court, HeatLegend, ShotLegend } from '../components/Court'
import { OPP, PointsSplitChart, TEAM, TrendChart } from '../components/charts'
import { StatTable, type StatRow } from '../components/StatTable'
import { Button, Card, EmptyState, PageHeader, Segmented, Spinner, StatTile } from '../components/ui'

export default function TeamStats() {
  const season = useSeason()
  const stats = useSeasonStats(season?.id)
  const players = usePlayerMap(season?.id)
  const [mode, setMode] = useState<'avg' | 'total'>('avg')
  const [shotView, setShotView] = useState<'heat' | 'dots'>('heat')

  const rows: StatRow[] = useMemo(
    () =>
      stats
        ? [...stats.players.values()].map((s) => {
            const p = players.get(s.playerId)
            return {
              id: s.playerId,
              number: p?.number,
              name: p ? playerName(p) : 'Joueur supprimé',
              line: s.totals,
              gp: s.gp,
              // Ramené à `gp` pour que la moyenne du tableau reste juste si certains matchs n'étaient pas chronométrés
              minutesMs: s.minutesGames ? (s.minutesMs / s.minutesGames) * (mode === 'avg' ? s.gp : s.minutesGames) : null,
            }
          })
        : [],
    [stats, players, mode],
  )

  if (!season || !stats) return <Spinner />

  const n = stats.trackedGames
  const t = stats.team
  const avg = (v: number) => fmt1(perGame(v, n))
  const showMinutes = rows.some((r) => r.minutesMs !== null)

  const exportCsv = () => {
    const header = ['N°', 'Joueur', 'MJ', 'MIN/m', 'PTS', 'PTS/m', '2PTS R', '2PTS T', '3PTS R', '3PTS T', 'LF R', 'LF T', '% Tirs', '% 3PTS', '% LF', 'RO', 'RD', 'RT', 'RT/m', 'PD', 'PD/m', 'BP', 'INT', 'CTR', 'FP', 'FPr', '+/-', 'ÉVAL', 'ÉVAL/m']
    const pc = (m: number, a: number) => {
      const v = pct(m, a)
      return v === null ? '' : Math.round(v * 1000) / 10
    }
    const body = [...stats.players.values()]
      .sort((a, b) => (players.get(a.playerId)?.number ?? 0) - (players.get(b.playerId)?.number ?? 0))
      .map((s) => {
        const p = players.get(s.playerId)
        const l = s.totals
        const r1 = (v: number) => Math.round(perGame(v, s.gp) * 10) / 10
        return [p?.number, p ? playerName(p) : '?', s.gp, s.minutesGames ? formatMinutes(s.minutesMs / s.minutesGames) : '', l.pts, r1(l.pts), l.fg2m, l.fg2a, l.fg3m, l.fg3a, l.ftm, l.fta, pc(fgm(l), fga(l)), pc(l.fg3m, l.fg3a), pc(l.ftm, l.fta), l.oreb, l.dreb, reb(l), r1(reb(l)), l.ast, r1(l.ast), l.tov, l.stl, l.blk, l.pf, l.fd, l.plusMinus, s.evalTotal, r1(s.evalTotal)]
      })
    const results = stats.results.map((r) => [r.game.date.slice(0, 10), r.game.opponent, r.game.homeAway === 'home' ? 'Domicile' : 'Extérieur', r.us, r.opp, r.win ? 'V' : 'D'])
    download(
      `${slug(season.teamName)}-${slug(season.name)}-stats.csv`,
      toCSV([[`${season.teamName} - ${season.name}`], [], header, ...body, [], ['Date', 'Adversaire', 'Lieu', 'Nous', 'Eux', 'Résultat'], ...results]),
      'text/csv;charset=utf-8',
    )
  }

  if (stats.results.length === 0)
    return (
      <div>
        <PageHeader title="Statistiques" subtitle={season.name} />
        <EmptyState icon={<BarChart3 size={48} />} title="Pas encore de statistiques">
          Terminez un premier match pour voir apparaître les statistiques de l'équipe et des joueurs.
        </EmptyState>
      </div>
    )

  const trend = stats.results.map((r) => ({ label: formatShortDate(r.game.date), us: r.us, opp: r.opp }))

  return (
    <div>
      <PageHeader
        title="Statistiques"
        subtitle={`${season.name} · ${stats.results.length} match${stats.results.length > 1 ? 's' : ''} joué${stats.results.length > 1 ? 's' : ''}, ${n} suivi${n > 1 ? 's' : ''} en direct`}
        actions={
          <Button onClick={exportCsv}>
            <Download size={18} /> Export CSV
          </Button>
        }
      />

      {n > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Points" value={avg(t.pts)} sub="par match" accent />
          <StatTile label="Tirs" value={formatPct(pct(fgm(t), fga(t)))} sub={`eFG ${formatPct(efg(t))}`} />
          <StatTile label="3 points" value={formatPct(pct(t.fg3m, t.fg3a))} sub={`${avg(t.fg3m)} réussis / match`} />
          <StatTile label="Lancers francs" value={formatPct(pct(t.ftm, t.fta))} sub={`${avg(t.fta)} tentés / match`} />
          <StatTile label="Rebonds" value={avg(reb(t))} sub={`${avg(t.oreb)} off. · ${avg(t.dreb)} déf.`} />
          <StatTile label="Passes D." value={avg(t.ast)} sub={`${avg(t.tov)} BP · ${avg(t.stl)} int. · ${avg(t.blk)} ctr`} />
        </div>
      )}

      <div className="mb-5 grid gap-5 lg:grid-cols-5">
        <Card title="Points marqués et encaissés" className="lg:col-span-3">
          <TrendChart
            data={trend}
            series={[
              { key: 'us', name: season.teamName, color: TEAM },
              { key: 'opp', name: 'Adversaires', color: OPP, dashed: true },
            ]}
          />
        </Card>
        <Card title="Répartition des points" className="lg:col-span-2">
          {n > 0 ? <PointsSplitChart line={t} height={260} /> : <p className="text-slate-500">Aucun match suivi en direct.</p>}
        </Card>
      </div>

      {n > 0 && (
        <div className="mb-5 grid gap-5 lg:grid-cols-5">
          <Card
            title="Tirs de l'équipe"
            className="lg:col-span-3"
            action={
              <Segmented
                value={shotView}
                onChange={setShotView}
                options={[
                  { value: 'heat', label: 'Zones' },
                  { value: 'dots', label: 'Tirs' },
                ]}
              />
            }
          >
            <div className="mx-auto max-w-lg">
              <Court heat={shotView === 'heat' ? zoneStats(stats.shots) : undefined} shots={shotView === 'dots' ? stats.shots : undefined} />
            </div>
            <div className="mt-3 flex justify-center">{shotView === 'heat' ? <HeatLegend /> : <ShotLegend />}</div>
          </Card>
          <Card title="Par match (moyenne)" className="lg:col-span-2">
            <dl className="divide-y divide-slate-800 text-sm">
              {[
                ['Tirs tentés', avg(fga(t))],
                ['dont 3 points', avg(t.fg3a)],
                ['Lancers francs tentés', avg(t.fta)],
                ['Rebonds offensifs', avg(t.oreb)],
                ['Rebonds défensifs', avg(t.dreb)],
                ['Passes décisives', avg(t.ast)],
                ['Balles perdues', avg(t.tov)],
                ['Interceptions', avg(t.stl)],
                ['Contres', avg(t.blk)],
                ['Fautes commises', avg(t.pf)],
                ['Fautes provoquées', avg(t.fd)],
                ['Ratio passes / balles perdues', t.tov ? fmt1(t.ast / t.tov) : '–'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2">
                  <dt className="text-slate-400">{k}</dt>
                  <dd className="font-bold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      )}

      {n > 0 && (
        <Card
          title="Joueurs"
          action={
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'avg', label: 'Moyennes' },
                { value: 'total', label: 'Totaux' },
              ]}
            />
          }
        >
          <StatTable key={mode} rows={rows} showMinutes={showMinutes} average={mode === 'avg'} />
          <p className="mt-2 text-xs text-slate-500">Touchez un joueur pour voir sa fiche. Touchez un en-tête pour trier.</p>
        </Card>
      )}
    </div>
  )
}

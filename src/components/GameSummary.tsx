import { useMemo, useState } from 'react'
import { describeEvent, periodLabel, playerName, type Game, type GameEvent, type Player, type Season } from '../domain/types'
import { computeBoxScore, efg, fga, fgm, formatClock, formatPct, pct, reb, sortEvents, zoneStats } from '../domain/stats'
import { Court, HeatLegend, ShotLegend } from './Court'
import { PointsByPeriodChart, PointsSplitChart, ScoreProgressionChart } from './charts'
import { StatTable, type StatRow } from './StatTable'
import { Card, Segmented, Select, StatTile, cn } from './ui'

type Tab = 'box' | 'charts' | 'shots' | 'pbp'

export function nameOf(players: Map<string, Player>, id?: string) {
  if (!id) return '—'
  const p = players.get(id)
  return p ? `#${p.number} ${playerName(p)}` : 'Joueur supprimé'
}

export function boxRows(box: ReturnType<typeof computeBoxScore>, players: Map<string, Player>, onlyPlayed = true): StatRow[] {
  return box.players
    .filter((l) => !onlyPlayed || l.played)
    .map((l) => {
      const p = players.get(l.playerId)
      return {
        id: l.playerId,
        number: p?.number,
        name: p ? playerName(p) : 'Joueur supprimé',
        line: l,
        minutesMs: l.minutesMs,
        starter: l.starter,
      }
    })
}

export function GameSummary({ game, events, players, season }: { game: Game; events: GameEvent[]; players: Map<string, Player>; season: Season }) {
  const box = useMemo(() => computeBoxScore(game, events), [game, events])
  const [tab, setTab] = useState<Tab>('box')
  const [shotPlayer, setShotPlayer] = useState('')
  const [shotView, setShotView] = useState<'dots' | 'heat'>('dots')
  const rows = boxRows(box, players)
  const t = box.team

  const shots = shotPlayer ? box.shots.filter((s) => s.playerId === shotPlayer) : box.shots
  const shooters = rows.filter((r) => box.shots.some((s) => s.playerId === r.id))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <StatTile label="Tirs" value={formatPct(pct(fgm(t), fga(t)))} sub={`${fgm(t)}/${fga(t)}`} />
        <StatTile label="3 points" value={formatPct(pct(t.fg3m, t.fg3a))} sub={`${t.fg3m}/${t.fg3a}`} />
        <StatTile label="Lancers francs" value={formatPct(pct(t.ftm, t.fta))} sub={`${t.ftm}/${t.fta}`} />
        <StatTile label="Rebonds" value={reb(t)} sub={`${t.oreb} off. · ${t.dreb} déf.`} />
        <StatTile label="Passes / Pertes" value={`${t.ast} / ${t.tov}`} sub={`${t.stl} int. · ${t.blk} ctr`} />
        <StatTile label="eFG%" value={formatPct(efg(t))} sub="tirs pondérés" />
      </div>

      <Segmented
        className="no-print self-start"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'box', label: 'Feuille de stats' },
          { value: 'charts', label: 'Graphiques' },
          { value: 'shots', label: 'Tirs' },
          { value: 'pbp', label: 'Déroulé' },
        ]}
      />

      {tab === 'box' && (
        <>
          <StatTable rows={rows} total={{ id: 'team', name: 'Équipe', line: t }} showMinutes={box.minutesAvailable} />
          <p className="text-xs text-slate-500">
            ★ cinq de départ · Touchez un en-tête pour trier · ÉVAL = PTS + REB + PD + INT + CTR + FPr − tirs ratés − LF ratés − BP − FP
          </p>
        </>
      )}

      {tab === 'charts' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Évolution du score" className="lg:col-span-2">
            <ScoreProgressionChart box={box} teamName={season.teamName} opponent={game.opponent} periods={game.periods} />
          </Card>
          <Card title="Points par période">
            <PointsByPeriodChart box={box} teamName={season.teamName} opponent={game.opponent} periods={game.periods} />
          </Card>
          <Card title="Répartition des points">
            <PointsSplitChart line={t} height={260} />
          </Card>
        </div>
      )}

      {tab === 'shots' && (
        <Card
          title={`Carte des tirs (${shots.length})`}
          action={
            <div className="flex items-center gap-2">
              <Select value={shotPlayer} onChange={(e) => setShotPlayer(e.target.value)} className="h-10 w-40 text-sm sm:w-56">
                <option value="">Toute l’équipe</option>
                {shooters.map((r) => (
                  <option key={r.id} value={r.id}>
                    #{r.number} {r.name}
                  </option>
                ))}
              </Select>
              <Segmented value={shotView} onChange={setShotView} options={[{ value: 'dots', label: 'Tirs' }, { value: 'heat', label: 'Zones' }]} />
            </div>
          }
        >
          <div className="mx-auto max-w-xl">
            <Court shots={shotView === 'dots' ? shots : undefined} heat={shotView === 'heat' ? zoneStats(shots) : undefined} />
          </div>
          <div className="mt-3 flex justify-center">{shotView === 'dots' ? <ShotLegend /> : <HeatLegend />}</div>
        </Card>
      )}

      {tab === 'pbp' && <PlayByPlay game={game} events={events} players={players} />}
    </div>
  )
}

export function PlayByPlay({ game, events, players }: { game: Game; events: GameEvent[]; players: Map<string, Player> }) {
  const items = useMemo(() => {
    const out: { e: GameEvent; us: number; opp: number }[] = []
    const score = { us: 0, opp: 0 }
    for (const e of sortEvents(events)) {
      if (e.type === 'SHOT' && e.made) score.us += e.points ?? 2
      if (e.type === 'FT' && e.made) score.us += 1
      if (e.type === 'OPP_SCORE') score.opp += e.points ?? 0
      out.push({ e, ...score })
    }
    return out
  }, [events])
  if (items.length === 0) return <p className="py-10 text-center text-slate-500">Aucune action enregistrée.</p>
  const periods = [...new Set(items.map((i) => i.e.period))]
  return (
    <div className="flex flex-col gap-4">
      {periods.map((p) => (
        <Card key={p} title={periodLabel(p, game.periods)}>
          <ul className="divide-y divide-slate-800/70">
            {items
              .filter((i) => i.e.period === p)
              .reverse()
              .map(({ e, us, opp }) => (
                <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-12 tabular-nums text-slate-500">{e.clockMs !== undefined ? formatClock(e.clockMs) : ''}</span>
                  <span className={cn('flex-1', e.team === 'opp' && 'text-slate-400')}>
                    {e.type === 'SUB' ? (
                      <>
                        ⇄ {nameOf(players, e.playerId)} remplace {nameOf(players, e.outPlayerId)}
                      </>
                    ) : e.type === 'OPP_SCORE' ? (
                      <>{game.opponent} +{e.points}</>
                    ) : (
                      <>
                        <strong>{nameOf(players, e.playerId)}</strong> · {describeEvent(e)}
                      </>
                    )}
                  </span>
                  <span className="tabular-nums font-semibold text-slate-300">
                    {us}–{opp}
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}

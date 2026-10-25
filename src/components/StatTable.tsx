import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowDown } from 'lucide-react'
import { evaluation, fga, fgm, formatMinutes, pct, reb, type StatLine } from '../domain/stats'
import { cn, Jersey } from './ui'

export interface StatRow {
  id: string
  number?: number
  name: string
  line: StatLine
  minutesMs?: number | null
  gp?: number
  starter?: boolean
}

interface Col {
  key: string
  label: string
  title: string
  value: (r: StatRow) => number
  render: (r: StatRow, avg: number) => React.ReactNode
  highlight?: boolean
}

const num = (v: number, avg: number) => (avg > 1 ? (v / avg).toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : String(v))

function shooting(m: number, a: number, avg: number) {
  const p = pct(m, a)
  return (
    <span className="flex flex-col items-end leading-tight">
      <span>
        {num(m, avg)}/{num(a, avg)}
      </span>
      <span className="text-[11px] text-slate-500">{p === null ? '–' : `${Math.round(p * 100)}%`}</span>
    </span>
  )
}

function columns(showMinutes: boolean, average: boolean): Col[] {
  const simple = (key: keyof StatLine, label: string, title: string): Col => ({
    key,
    label,
    title,
    value: (r) => r.line[key],
    render: (r, avg) => num(r.line[key], avg),
    highlight: true,
  })
  const cols: Col[] = []
  if (average) cols.push({ key: 'gp', label: 'MJ', title: 'Matchs joués', value: (r) => r.gp ?? 0, render: (r) => r.gp ?? 0 })
  if (showMinutes)
    cols.push({
      key: 'min',
      label: 'MIN',
      title: 'Minutes jouées',
      value: (r) => r.minutesMs ?? 0,
      render: (r, avg) => formatMinutes(r.minutesMs === null || r.minutesMs === undefined ? null : r.minutesMs / Math.max(1, avg)),
    })
  cols.push(
    simple('pts', 'PTS', 'Points'),
    { key: 'fg', label: 'TIRS', title: 'Tirs (hors LF)', value: (r) => fgm(r.line), render: (r, avg) => shooting(fgm(r.line), fga(r.line), avg) },
    { key: 'fg2', label: '2PTS', title: 'Tirs à 2 points', value: (r) => r.line.fg2m, render: (r, avg) => shooting(r.line.fg2m, r.line.fg2a, avg) },
    { key: 'fg3', label: '3PTS', title: 'Tirs à 3 points', value: (r) => r.line.fg3m, render: (r, avg) => shooting(r.line.fg3m, r.line.fg3a, avg) },
    { key: 'ft', label: 'LF', title: 'Lancers francs', value: (r) => r.line.ftm, render: (r, avg) => shooting(r.line.ftm, r.line.fta, avg) },
    simple('oreb', 'RO', 'Rebonds offensifs'),
    simple('dreb', 'RD', 'Rebonds défensifs'),
    { key: 'reb', label: 'RT', title: 'Rebonds totaux', value: (r) => reb(r.line), render: (r, avg) => num(reb(r.line), avg), highlight: true },
    simple('ast', 'PD', 'Passes décisives'),
    simple('tov', 'BP', 'Balles perdues'),
    simple('stl', 'INT', 'Interceptions'),
    simple('blk', 'CTR', 'Contres'),
    simple('pf', 'FP', 'Fautes commises'),
    simple('fd', 'FPr', 'Fautes provoquées'),
    {
      key: 'pm',
      label: '+/-',
      title: 'Différence de points avec le joueur sur le terrain',
      value: (r) => r.line.plusMinus,
      render: (r, avg) => {
        const v = r.line.plusMinus
        return <span className={cn(v > 0 && 'text-emerald-400', v < 0 && 'text-red-400')}>{v > 0 ? '+' : ''}{num(v, avg)}</span>
      },
    },
    { key: 'eval', label: 'ÉVAL', title: 'Évaluation', value: (r) => evaluation(r.line), render: (r, avg) => <strong>{num(evaluation(r.line), avg)}</strong>, highlight: true },
  )
  return cols
}

const NO_HIGHLIGHT = new Set(['tov', 'pf'])

export function StatTable({
  rows,
  total,
  showMinutes,
  average,
  linkPlayers = true,
}: {
  rows: StatRow[]
  total?: StatRow
  showMinutes: boolean
  average?: boolean
  linkPlayers?: boolean
}) {
  const navigate = useNavigate()
  const cols = columns(showMinutes, !!average)
  const [sortKey, setSortKey] = useState<string>(average ? 'pts' : 'number')
  const sortCol = cols.find((c) => c.key === sortKey)
  const avgOf = (r: StatRow) => (average ? (r.gp ?? 1) : 1)
  const sorted = [...rows].sort((a, b) => {
    if (!sortCol) return (a.number ?? 999) - (b.number ?? 999)
    return sortCol.value(b) / avgOf(b) - sortCol.value(a) / avgOf(a)
  })
  const max = new Map(
    cols
      .filter((c) => c.highlight && !NO_HIGHLIGHT.has(c.key))
      .map((c) => [c.key, Math.max(...rows.map((r) => c.value(r) / avgOf(r)))]),
  )

  return (
    <div className="scrollbar-thin overflow-x-auto rounded-2xl border border-slate-800">
      <table className="w-full min-w-max text-sm tabular-nums">
        <thead className="bg-slate-900 text-xs uppercase tracking-wider text-slate-400">
          <tr>
            <th className="sticky left-0 z-10 bg-slate-900 px-3 py-3 text-left">
              <button type="button" onClick={() => setSortKey('number')} className="flex items-center gap-1 uppercase">
                Joueur {sortKey === 'number' && <ArrowDown size={12} />}
              </button>
            </th>
            {cols.map((c) => (
              <th key={c.key} title={c.title} className="px-2 py-3 text-right">
                <button type="button" onClick={() => setSortKey(c.key)} className={cn('ml-auto flex items-center gap-0.5 uppercase', sortKey === c.key && 'text-team')}>
                  {sortKey === c.key && <ArrowDown size={12} />}
                  {c.label}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">
          {sorted.map((r) => (
            <tr
              key={r.id}
              className={cn('bg-slate-950', linkPlayers && 'cursor-pointer hover:bg-slate-900')}
              onClick={linkPlayers ? () => navigate(`/joueurs/${r.id}`) : undefined}
            >
              <td className="sticky left-0 z-10 bg-inherit px-3 py-2">
                <div className="flex items-center gap-2">
                  {r.number !== undefined && <Jersey number={r.number} className="h-8 w-8 text-sm" />}
                  <span className="whitespace-nowrap font-semibold">{r.name}</span>
                  {r.starter && <span className="text-xs text-team" title="Cinq de départ">★</span>}
                </div>
              </td>
              {cols.map((c) => {
                const v = c.value(r) / avgOf(r)
                const best = max.get(c.key)
                return (
                  <td key={c.key} className={cn('px-2 py-2 text-right', best !== undefined && best > 0 && v === best && 'font-bold text-team')}>
                    {c.render(r, avgOf(r))}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
        {total && (
          <tfoot className="border-t-2 border-slate-700 bg-slate-900 font-bold">
            <tr>
              <td className="sticky left-0 z-10 bg-slate-900 px-3 py-3">{total.name}</td>
              {cols.map((c) => (
                <td key={c.key} className="px-2 py-3 text-right">
                  {c.key === 'min' ? '' : c.render(total, avgOf(total))}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

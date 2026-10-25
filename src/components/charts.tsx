import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BoxScore, StatLine } from '../domain/stats'
import { periodLabel } from '../domain/types'

export const TEAM = 'var(--team-color)'
export const OPP = '#64748b'
export const GREEN = '#22c55e'
export const RED = '#ef4444'
export const BLUE = '#38bdf8'
export const AMBER = '#f59e0b'

const tooltipStyle = { background: '#0f172a', border: '1px solid #334155', borderRadius: 10 }

export function ChartBox({ height = 260, children }: { height?: number; children: React.ReactElement }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  )
}

export function ScoreProgressionChart({ box, teamName, opponent, periods }: { box: BoxScore; teamName: string; opponent: string; periods: number }) {
  const data = box.progression
  const boundaries = data.filter((d, i) => i > 0 && data[i - 1].period !== d.period)
  return (
    <ChartBox>
      <LineChart data={data} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="index" tick={false} />
        <YAxis allowDecimals={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(_, p) => (p?.[0] ? periodLabel(p[0].payload.period, periods) : '')}
        />
        <Legend />
        {boundaries.map((b) => (
          <ReferenceLine key={b.index} x={b.index} stroke="#475569" strokeDasharray="4 4" label={{ value: periodLabel(b.period, periods), fill: '#64748b', fontSize: 11, position: 'insideTopLeft' }} />
        ))}
        <Line type="stepAfter" dataKey="us" name={teamName} stroke={TEAM} strokeWidth={3} dot={false} isAnimationActive={false} />
        <Line type="stepAfter" dataKey="opp" name={opponent} stroke={OPP} strokeWidth={3} dot={false} isAnimationActive={false} />
      </LineChart>
    </ChartBox>
  )
}

export function PointsByPeriodChart({ box, teamName, opponent, periods }: { box: BoxScore; teamName: string; opponent: string; periods: number }) {
  const data = box.byPeriod.map((p) => ({ ...p, label: periodLabel(p.period, periods) }))
  return (
    <ChartBox>
      <BarChart data={data} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" />
        <YAxis allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
        <Legend />
        <Bar dataKey="us" name={teamName} fill={TEAM} radius={[6, 6, 0, 0]} label={{ position: 'top', fill: '#e2e8f0', fontSize: 12 }} />
        <Bar dataKey="opp" name={opponent} fill={OPP} radius={[6, 6, 0, 0]} label={{ position: 'top', fill: '#94a3b8', fontSize: 12 }} />
      </BarChart>
    </ChartBox>
  )
}

export function PointsSplitChart({ line, height = 220 }: { line: StatLine; height?: number }) {
  const data = [
    { name: '2 pts', value: line.fg2m * 2, fill: TEAM },
    { name: '3 pts', value: line.fg3m * 3, fill: BLUE },
    { name: 'Lancers francs', value: line.ftm, fill: AMBER },
  ].filter((d) => d.value > 0)
  if (data.length === 0) return <p className="py-10 text-center text-slate-500">Aucun point marqué</p>
  return (
    <ChartBox height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={3} stroke="none" isAnimationActive={false}
          label={({ value, percent }) => `${value} (${Math.round((percent ?? 0) * 100)}%)`} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend />
      </PieChart>
    </ChartBox>
  )
}

export function TrendChart({
  data,
  series,
  height = 260,
}: {
  data: Record<string, number | string | null>[]
  series: { key: string; name: string; color: string; dashed?: boolean }[]
  height?: number
}) {
  return (
    <ChartBox height={height}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" />
        <YAxis allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend />
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={3} strokeDasharray={s.dashed ? '5 5' : undefined} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
        ))}
      </LineChart>
    </ChartBox>
  )
}

export function DiffChart({ data, height = 240 }: { data: { label: string; opponent: string; diff: number }[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, win: d.diff > 0 ? d.diff : 0, loss: d.diff <= 0 ? d.diff : 0 }))
  return (
    <ChartBox height={height}>
      <BarChart data={rows} margin={{ top: 10, right: 16, left: -16, bottom: 0 }} stackOffset="sign">
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" />
        <YAxis allowDecimals={false} />
        <ReferenceLine y={0} stroke="#475569" />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: 'rgba(148,163,184,0.08)' }}
          labelFormatter={(_, p) => (p?.[0] ? `${p[0].payload.label} · ${p[0].payload.opponent}` : '')}
          formatter={(v, name) => (Number(v) === 0 ? [null, null] : [`${Number(v) > 0 ? '+' : ''}${v}`, name])}
        />
        <Bar dataKey="win" name="Victoire" stackId="d" fill={GREEN} radius={[6, 6, 0, 0]} />
        <Bar dataKey="loss" name="Défaite" stackId="d" fill={RED} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ChartBox>
  )
}

export function LeadersChart({ data, color = TEAM, height }: { data: { name: string; value: number }[]; color?: string; height?: number }) {
  return (
    <ChartBox height={height ?? Math.max(120, data.length * 38)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
        <Bar dataKey="value" name="Moyenne" fill={color} radius={[0, 6, 6, 0]} barSize={22} isAnimationActive={false}
          label={{ position: 'right', fill: '#e2e8f0', fontSize: 13, fontWeight: 700, formatter: (v: unknown) => (typeof v === 'number' ? v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : String(v)) }} />
      </BarChart>
    </ChartBox>
  )
}

/** `player`/`team` : valeurs normalisées 0-100 ; `playerRaw`/`teamRaw` : valeurs affichées */
export function PlayerRadar({ data, playerName }: { data: { axis: string; player: number; team: number; playerRaw: string; teamRaw: string }[]; playerName: string }) {
  return (
    <ChartBox height={300}>
      <RadarChart data={data} outerRadius="75%">
        <PolarGrid stroke="#334155" />
        <PolarAngleAxis dataKey="axis" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
        <Radar name="Moyenne équipe" dataKey="team" stroke={OPP} fill={OPP} fillOpacity={0.25} isAnimationActive={false} />
        <Radar name={playerName} dataKey="player" stroke={TEAM} fill={TEAM} fillOpacity={0.35} isAnimationActive={false} />
        <Legend />
        <Tooltip contentStyle={tooltipStyle} formatter={(v, _n, item) => (item?.payload?.[`${String(item.dataKey)}Raw`] as string | undefined) ?? String(v)} />
      </RadarChart>
    </ChartBox>
  )
}

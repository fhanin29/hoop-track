import type { Game, GameEvent, ZoneId } from './types'
import { ZONE_IDS } from './court'

// ---------- Temps de jeu ----------

export function periodLengthMs(game: Pick<Game, 'periods' | 'periodLength' | 'overtimeLength'>, period: number): number {
  return (period <= game.periods ? game.periodLength : game.overtimeLength) * 60_000
}

export function periodOffsetMs(game: Pick<Game, 'periods' | 'periodLength' | 'overtimeLength'>, period: number): number {
  let total = 0
  for (let p = 1; p < period; p++) total += periodLengthMs(game, p)
  return total
}

/** Temps écoulé depuis le début du match (ms) */
export function gameTimeMs(
  game: Pick<Game, 'periods' | 'periodLength' | 'overtimeLength'>,
  period: number,
  clockMs: number,
): number {
  return periodOffsetMs(game, period) + periodLengthMs(game, period) - clockMs
}

/** Temps restant affiché par le chrono à l'instant `now` */
export function clockRemaining(clock: Game['clock'], now: number): number {
  if (!clock.running || clock.startedAt === undefined) return clock.remainingMs
  return Math.max(0, clock.remainingMs - (now - clock.startedAt))
}

export function formatClock(ms: number): string {
  const totalSec = Math.ceil(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function formatMinutes(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '–'
  const totalSec = Math.round(ms / 1000)
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`
}

export const sortEvents = (events: GameEvent[]) => [...events].sort((a, b) => a.seq - b.seq)

// ---------- État du match en direct ----------

export interface LiveState {
  onCourt: string[]
  usScore: number
  oppScore: number
  fouls: Record<string, number>
  /** Fautes d'équipe par période */
  teamFouls: Record<number, number>
  /** Fautes adverses (provoquées) par période */
  oppTeamFouls: Record<number, number>
  points: Record<string, number>
}

export function computeLiveState(game: Pick<Game, 'starterIds'>, events: GameEvent[]): LiveState {
  const onCourt = [...game.starterIds]
  const state: LiveState = { onCourt, usScore: 0, oppScore: 0, fouls: {}, teamFouls: {}, oppTeamFouls: {}, points: {} }
  for (const e of sortEvents(events)) {
    switch (e.type) {
      case 'SUB': {
        const i = onCourt.indexOf(e.outPlayerId ?? '')
        if (i >= 0 && e.playerId) onCourt[i] = e.playerId
        else if (e.playerId && !onCourt.includes(e.playerId)) onCourt.push(e.playerId)
        break
      }
      case 'SHOT':
      case 'FT':
        if (e.made) {
          const pts = e.type === 'FT' ? 1 : (e.points ?? 2)
          state.usScore += pts
          if (e.playerId) state.points[e.playerId] = (state.points[e.playerId] ?? 0) + pts
        }
        break
      case 'OPP_SCORE':
        state.oppScore += e.points ?? 0
        break
      case 'FOUL':
        if (e.playerId) state.fouls[e.playerId] = (state.fouls[e.playerId] ?? 0) + 1
        state.teamFouls[e.period] = (state.teamFouls[e.period] ?? 0) + 1
        break
      case 'FOUL_DRAWN':
        state.oppTeamFouls[e.period] = (state.oppTeamFouls[e.period] ?? 0) + 1
        break
    }
  }
  return state
}

// ---------- Box score ----------

export interface StatLine {
  pts: number
  fg2m: number
  fg2a: number
  fg3m: number
  fg3a: number
  ftm: number
  fta: number
  oreb: number
  dreb: number
  ast: number
  tov: number
  stl: number
  blk: number
  pf: number
  fd: number
  plusMinus: number
}

export interface PlayerLine extends StatLine {
  playerId: string
  played: boolean
  starter: boolean
  /** Temps de jeu (ms), null si le chrono n'est pas suivi */
  minutesMs: number | null
}

export interface ZoneStat {
  made: number
  att: number
}

export interface Shot {
  playerId?: string
  x: number
  y: number
  made: boolean
  points: number
  zone?: ZoneId
  gameId: string
}

export interface BoxScore {
  players: PlayerLine[]
  team: StatLine
  usScore: number
  oppScore: number
  /** Points par période [nous, adversaire] (index 0 = période 1) */
  byPeriod: { period: number; us: number; opp: number }[]
  progression: { index: number; period: number; us: number; opp: number }[]
  shots: Shot[]
  minutesAvailable: boolean
}

export const emptyLine = (): StatLine => ({
  pts: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
  oreb: 0, dreb: 0, ast: 0, tov: 0, stl: 0, blk: 0, pf: 0, fd: 0, plusMinus: 0,
})

const STAT_KEYS = Object.keys(emptyLine()) as (keyof StatLine)[]

export function addLines<T extends StatLine>(target: T, src: StatLine): T {
  for (const k of STAT_KEYS) target[k] += src[k]
  return target
}

export function computeBoxScore(
  game: Game,
  events: GameEvent[],
  options: { nowGameTimeMs?: number } = {},
): BoxScore {
  const lines = new Map<string, PlayerLine>()
  const line = (id: string) => {
    let l = lines.get(id)
    if (!l) {
      l = { ...emptyLine(), playerId: id, played: false, starter: game.starterIds.includes(id), minutesMs: null }
      lines.set(id, l)
    }
    return l
  }
  for (const id of game.rosterIds) line(id)

  const sorted = sortEvents(events)
  const minutesAvailable =
    game.clockEnabled && sorted.filter((e) => e.type === 'SUB').every((e) => e.clockMs !== undefined)

  const onCourt = new Set(game.starterIds)
  const enteredAt = new Map<string, number>()
  const playedMs = new Map<string, number>()
  for (const id of game.starterIds) {
    line(id).played = true
    enteredAt.set(id, 0)
  }

  let usScore = 0
  let oppScore = 0
  let maxPeriod = Math.max(1, game.clock.period)
  const periodMap = new Map<number, { us: number; opp: number }>()
  const period = (p: number) => {
    let v = periodMap.get(p)
    if (!v) periodMap.set(p, (v = { us: 0, opp: 0 }))
    return v
  }
  const progression: BoxScore['progression'] = [{ index: 0, period: 1, us: 0, opp: 0 }]
  const shots: Shot[] = []

  const score = (team: 'us' | 'opp', pts: number, p: number) => {
    if (team === 'us') usScore += pts
    else oppScore += pts
    period(p)[team] += pts
    for (const id of onCourt) line(id).plusMinus += team === 'us' ? pts : -pts
    progression.push({ index: progression.length, period: p, us: usScore, opp: oppScore })
  }

  for (const e of sorted) {
    maxPeriod = Math.max(maxPeriod, e.period)
    const l = e.playerId && e.type !== 'OPP_SCORE' ? line(e.playerId) : undefined
    if (l && e.type !== 'SUB') l.played = true
    switch (e.type) {
      case 'SHOT': {
        if (!l) break
        const three = e.points === 3
        if (three) l.fg3a++
        else l.fg2a++
        if (e.made) {
          if (three) l.fg3m++
          else l.fg2m++
          l.pts += e.points ?? 2
          score('us', e.points ?? 2, e.period)
        }
        if (e.x !== undefined && e.y !== undefined) {
          shots.push({ playerId: e.playerId, x: e.x, y: e.y, made: !!e.made, points: e.points ?? 2, zone: e.zone, gameId: game.id })
        }
        break
      }
      case 'FT':
        if (!l) break
        l.fta++
        if (e.made) {
          l.ftm++
          l.pts++
          score('us', 1, e.period)
        }
        break
      case 'OPP_SCORE':
        score('opp', e.points ?? 0, e.period)
        break
      case 'REB_OFF':
        if (l) l.oreb++
        break
      case 'REB_DEF':
        if (l) l.dreb++
        break
      case 'AST':
        if (l) l.ast++
        break
      case 'TOV':
        if (l) l.tov++
        break
      case 'STL':
        if (l) l.stl++
        break
      case 'BLK':
        if (l) l.blk++
        break
      case 'FOUL':
        if (l) l.pf++
        break
      case 'FOUL_DRAWN':
        if (l) l.fd++
        break
      case 'SUB': {
        const t = e.clockMs !== undefined ? gameTimeMs(game, e.period, e.clockMs) : undefined
        if (e.outPlayerId && onCourt.has(e.outPlayerId)) {
          onCourt.delete(e.outPlayerId)
          const start = enteredAt.get(e.outPlayerId)
          if (t !== undefined && start !== undefined) {
            playedMs.set(e.outPlayerId, (playedMs.get(e.outPlayerId) ?? 0) + Math.max(0, t - start))
          }
          enteredAt.delete(e.outPlayerId)
        }
        if (e.playerId) {
          onCourt.add(e.playerId)
          line(e.playerId).played = true
          if (t !== undefined) enteredAt.set(e.playerId, t)
        }
        break
      }
    }
  }

  if (minutesAvailable) {
    const end =
      options.nowGameTimeMs ?? periodOffsetMs(game, maxPeriod) + periodLengthMs(game, maxPeriod)
    for (const id of onCourt) {
      const start = enteredAt.get(id)
      if (start !== undefined) playedMs.set(id, (playedMs.get(id) ?? 0) + Math.max(0, end - start))
    }
    for (const l of lines.values()) l.minutesMs = playedMs.get(l.playerId) ?? 0
  }

  const players = [...lines.values()]
  const team = players.reduce((acc, l) => addLines(acc, l), emptyLine())
  const lastPeriod = Math.max(maxPeriod, game.periods)
  const byPeriod = Array.from({ length: lastPeriod }, (_, i) => ({
    period: i + 1,
    us: periodMap.get(i + 1)?.us ?? 0,
    opp: periodMap.get(i + 1)?.opp ?? 0,
  })).filter((p) => p.period <= game.periods || p.us > 0 || p.opp > 0 || p.period <= maxPeriod)

  return { players, team, usScore, oppScore, byPeriod, progression, shots, minutesAvailable }
}

// ---------- Indicateurs dérivés ----------

export const fgm = (l: StatLine) => l.fg2m + l.fg3m
export const fga = (l: StatLine) => l.fg2a + l.fg3a
export const reb = (l: StatLine) => l.oreb + l.dreb

export function pct(made: number, att: number): number | null {
  return att > 0 ? made / att : null
}

export function formatPct(v: number | null): string {
  return v === null ? '–' : `${Math.round(v * 100)}%`
}

/** Évaluation : (PTS + REB + PD + INT + CTR + FPr) − (tirs ratés + LF ratés + BP + FP) */
export function evaluation(l: StatLine): number {
  return (
    l.pts + reb(l) + l.ast + l.stl + l.blk + l.fd -
    (fga(l) - fgm(l)) - (l.fta - l.ftm) - l.tov - l.pf
  )
}

export function efg(l: StatLine): number | null {
  return fga(l) > 0 ? (fgm(l) + 0.5 * l.fg3m) / fga(l) : null
}

export function trueShooting(l: StatLine): number | null {
  const denom = 2 * (fga(l) + 0.44 * l.fta)
  return denom > 0 ? l.pts / denom : null
}

export function zoneStats(shots: Shot[]): Record<ZoneId, ZoneStat> {
  const out = Object.fromEntries(ZONE_IDS.map((z) => [z, { made: 0, att: 0 }])) as Record<ZoneId, ZoneStat>
  for (const s of shots) {
    if (!s.zone) continue
    out[s.zone].att++
    if (s.made) out[s.zone].made++
  }
  return out
}

// ---------- Saison ----------

export interface GameResult {
  game: Game
  box: BoxScore | null
  us: number
  opp: number
  win: boolean
}

export interface SeasonPlayerStats {
  playerId: string
  gp: number
  totals: StatLine
  minutesMs: number
  minutesGames: number
  evalTotal: number
  games: { game: Game; line: PlayerLine; eval: number }[]
  shots: Shot[]
}

export interface SeasonStats {
  results: GameResult[]
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  team: StatLine
  trackedGames: number
  players: Map<string, SeasonPlayerStats>
  shots: Shot[]
  streak: { type: 'V' | 'D'; count: number } | null
}

export function gameScore(game: Game, box: BoxScore | null): { us: number; opp: number } {
  if (box && !game.manualResult) return { us: box.usScore, opp: box.oppScore }
  return { us: game.ourScore ?? 0, opp: game.oppScore ?? 0 }
}

export function computeSeasonStats(games: Game[], events: GameEvent[]): SeasonStats {
  const byGame = new Map<string, GameEvent[]>()
  for (const e of events) {
    let list = byGame.get(e.gameId)
    if (!list) byGame.set(e.gameId, (list = []))
    list.push(e)
  }
  const finished = games
    .filter((g) => g.status === 'finished')
    .sort((a, b) => a.date.localeCompare(b.date))

  const players = new Map<string, SeasonPlayerStats>()
  const team = emptyLine()
  const shots: Shot[] = []
  let trackedGames = 0

  const results: GameResult[] = finished.map((game) => {
    const evts = byGame.get(game.id) ?? []
    const box = evts.length > 0 && !game.manualResult ? computeBoxScore(game, evts) : null
    if (box) {
      trackedGames++
      addLines(team, box.team)
      shots.push(...box.shots)
      for (const l of box.players) {
        if (!l.played) continue
        let ps = players.get(l.playerId)
        if (!ps) {
          ps = { playerId: l.playerId, gp: 0, totals: emptyLine(), minutesMs: 0, minutesGames: 0, evalTotal: 0, games: [], shots: [] }
          players.set(l.playerId, ps)
        }
        ps.gp++
        addLines(ps.totals, l)
        if (l.minutesMs !== null) {
          ps.minutesMs += l.minutesMs
          ps.minutesGames++
        }
        const ev = evaluation(l)
        ps.evalTotal += ev
        ps.games.push({ game, line: l, eval: ev })
        ps.shots.push(...box.shots.filter((s) => s.playerId === l.playerId))
      }
    }
    const { us, opp } = gameScore(game, box)
    return { game, box, us, opp, win: us > opp }
  })

  let streak: SeasonStats['streak'] = null
  for (let i = results.length - 1; i >= 0; i--) {
    const t = results[i].win ? 'V' : 'D'
    if (!streak) streak = { type: t, count: 1 }
    else if (streak.type === t) streak.count++
    else break
  }

  return {
    results,
    wins: results.filter((r) => r.win).length,
    losses: results.filter((r) => !r.win).length,
    pointsFor: results.reduce((s, r) => s + r.us, 0),
    pointsAgainst: results.reduce((s, r) => s + r.opp, 0),
    team,
    trackedGames,
    players,
    shots,
    streak,
  }
}

export function perGame(total: number, games: number): number {
  return games > 0 ? total / games : 0
}

export function fmt1(v: number): string {
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}


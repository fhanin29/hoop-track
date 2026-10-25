import { describe, expect, it } from 'vitest'
import { detectZone, isThreePoint, COURT, CORNER_Y } from './court'
import {
  computeBoxScore,
  computeLiveState,
  computeSeasonStats,
  efg,
  evaluation,
  formatClock,
  gameTimeMs,
  trueShooting,
  zoneStats,
} from './stats'
import type { Game, GameEvent } from './types'

const baseGame = (over: Partial<Game> = {}): Game => ({
  id: 'g1',
  seasonId: 's',
  date: '2026-11-01T15:00',
  opponent: 'Adv',
  homeAway: 'home',
  status: 'live',
  periods: 4,
  periodLength: 10,
  overtimeLength: 5,
  clockEnabled: true,
  rosterIds: ['a', 'b', 'c', 'd', 'e', 'f'],
  starterIds: ['a', 'b', 'c', 'd', 'e'],
  clock: { period: 1, remainingMs: 600_000, running: false },
  ...over,
})

let seq = 0
const ev = (e: Partial<GameEvent> & Pick<GameEvent, 'type'>): GameEvent => ({
  id: `e${++seq}`,
  gameId: 'g1',
  seq,
  period: 1,
  createdAt: seq,
  team: e.type === 'OPP_SCORE' ? 'opp' : 'us',
  ...e,
})

describe('court', () => {
  it('détecte les zones', () => {
    expect(detectZone(COURT.basketX, 2)).toBe('RAQ')
    expect(detectZone(COURT.basketX, 7)).toBe('MI_AXE')
    expect(detectZone(COURT.basketX, 9)).toBe('AXE3')
    expect(detectZone(0.4, 1)).toBe('C3_G')
    expect(detectZone(14.6, 1)).toBe('C3_D')
    expect(detectZone(2, 8)).toBe('A3_G')
    expect(detectZone(13, 8)).toBe('A3_D')
    expect(detectZone(3, 3)).toBe('MI_G')
    expect(detectZone(12, 3)).toBe('MI_D')
  })
  it('gère la ligne à 3 pts', () => {
    expect(isThreePoint(1, CORNER_Y - 0.1)).toBe(false)
    expect(isThreePoint(0.5, CORNER_Y - 0.1)).toBe(true)
    expect(isThreePoint(COURT.basketX, COURT.basketY + 6.7)).toBe(false)
    expect(isThreePoint(COURT.basketX, COURT.basketY + 6.8)).toBe(true)
  })
})

describe('stats', () => {
  it('formate le chrono', () => {
    expect(formatClock(600_000)).toBe('10:00')
    expect(formatClock(61_500)).toBe('01:02')
    expect(formatClock(0)).toBe('00:00')
  })

  it('calcule le temps de jeu global', () => {
    const g = baseGame()
    expect(gameTimeMs(g, 1, 600_000)).toBe(0)
    expect(gameTimeMs(g, 2, 300_000)).toBe(900_000)
    expect(gameTimeMs(g, 5, 0)).toBe(2_700_000)
  })

  it('calcule un box score complet', () => {
    const g = baseGame()
    const events = [
      ev({ type: 'SHOT', playerId: 'a', points: 3, made: true, x: 7.5, y: 9, zone: 'AXE3', clockMs: 590_000 }),
      ev({ type: 'AST', playerId: 'b', clockMs: 590_000 }),
      ev({ type: 'OPP_SCORE', points: 2, clockMs: 570_000 }),
      ev({ type: 'SHOT', playerId: 'c', points: 2, made: false, x: 7.5, y: 2, zone: 'RAQ', clockMs: 550_000 }),
      ev({ type: 'REB_OFF', playerId: 'c', clockMs: 549_000 }),
      ev({ type: 'FOUL_DRAWN', playerId: 'c', clockMs: 548_000 }),
      ev({ type: 'FT', playerId: 'c', made: true, clockMs: 548_000 }),
      ev({ type: 'FT', playerId: 'c', made: false, clockMs: 548_000 }),
      ev({ type: 'SUB', playerId: 'f', outPlayerId: 'a', clockMs: 300_000 }),
      ev({ type: 'TOV', playerId: 'f', clockMs: 200_000 }),
      ev({ type: 'FOUL', playerId: 'd', clockMs: 100_000 }),
      ev({ type: 'STL', playerId: 'e', clockMs: 90_000 }),
      ev({ type: 'BLK', playerId: 'e', clockMs: 80_000 }),
      ev({ type: 'REB_DEF', playerId: 'e', clockMs: 80_000 }),
      ev({ type: 'OPP_SCORE', points: 3, clockMs: 10_000 }),
    ]
    const box = computeBoxScore(g, events, { nowGameTimeMs: 600_000 })
    const get = (id: string) => box.players.find((p) => p.playerId === id)!

    expect(box.usScore).toBe(4)
    expect(box.oppScore).toBe(5)
    expect(get('a')).toMatchObject({ pts: 3, fg3m: 1, fg3a: 1, plusMinus: 2, minutesMs: 300_000 })
    expect(get('f')).toMatchObject({ tov: 1, plusMinus: -3, minutesMs: 300_000, played: true, starter: false })
    expect(get('c')).toMatchObject({ pts: 1, fg2a: 1, ftm: 1, fta: 2, oreb: 1, fd: 1, plusMinus: -1, minutesMs: 600_000 })
    expect(get('e')).toMatchObject({ stl: 1, blk: 1, dreb: 1 })
    expect(get('b').ast).toBe(1)
    expect(box.team.pts).toBe(4)
    expect(box.byPeriod[0]).toEqual({ period: 1, us: 4, opp: 5 })
    expect(box.shots).toHaveLength(2)
    expect(box.minutesAvailable).toBe(true)

    // éval c : 1 pts + 1 reb + 1 FPr - 1 tir raté - 1 LF raté = 1
    expect(evaluation(get('c'))).toBe(1)
    expect(efg(get('a'))).toBeCloseTo(1.5)
    expect(trueShooting(get('a'))).toBeCloseTo(1.5)
    expect(zoneStats(box.shots).AXE3).toEqual({ made: 1, att: 1 })
  })

  it('masque les minutes si le chrono est désactivé', () => {
    const g = baseGame({ clockEnabled: false })
    const box = computeBoxScore(g, [ev({ type: 'SUB', playerId: 'f', outPlayerId: 'a' })])
    expect(box.minutesAvailable).toBe(false)
    expect(box.players[0].minutesMs).toBeNull()
  })

  it("calcule l'état live (terrain, fautes, score)", () => {
    const g = baseGame()
    const events = [
      ev({ type: 'FOUL', playerId: 'a', period: 1 }),
      ev({ type: 'FOUL', playerId: 'a', period: 2 }),
      ev({ type: 'SUB', playerId: 'f', outPlayerId: 'a' }),
      ev({ type: 'SHOT', playerId: 'f', points: 2, made: true }),
      ev({ type: 'OPP_SCORE', points: 1 }),
    ]
    const s = computeLiveState(g, events)
    expect(s.onCourt).toEqual(['f', 'b', 'c', 'd', 'e'])
    expect(s.fouls.a).toBe(2)
    expect(s.teamFouls).toEqual({ 1: 1, 2: 1 })
    expect(s.usScore).toBe(2)
    expect(s.oppScore).toBe(1)
  })

  it('agrège la saison', () => {
    const g1 = baseGame({ id: 'g1', status: 'finished', date: '2026-10-01T10:00' })
    const g2 = baseGame({ id: 'g2', status: 'finished', date: '2026-10-08T10:00', manualResult: true, ourScore: 50, oppScore: 60 })
    const g3 = baseGame({ id: 'g3', status: 'planned', date: '2026-10-15T10:00' })
    const events = [
      ev({ type: 'SHOT', playerId: 'a', points: 2, made: true }),
      ev({ type: 'OPP_SCORE', points: 1 }),
    ]
    const s = computeSeasonStats([g3, g2, g1], events)
    expect(s.results.map((r) => r.game.id)).toEqual(['g1', 'g2'])
    expect(s.wins).toBe(1)
    expect(s.losses).toBe(1)
    expect(s.pointsFor).toBe(52)
    expect(s.trackedGames).toBe(1)
    expect(s.players.get('a')?.gp).toBe(1)
    expect(s.players.get('f')).toBeUndefined()
    expect(s.streak).toEqual({ type: 'D', count: 1 })
  })
})

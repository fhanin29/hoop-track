import { db, newId } from './db'
import { COURT, detectZone, isThreePoint } from '../domain/court'
import { computeBoxScore } from '../domain/stats'
import type { Game, GameEvent, Player, Position, Season } from '../domain/types'

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ROSTER: [string, string, number, Position, number][] = [
  // prénom, nom, numéro, poste, "talent" (0-1)
  ['Léo', 'Martin', 4, 'MEN', 0.8],
  ['Tom', 'Bernard', 7, 'ARR', 0.75],
  ['Max', 'Dubois', 9, 'AIL', 0.6],
  ['Sam', 'Laurent', 12, 'AF', 0.55],
  ['Noé', 'Moreau', 15, 'PIV', 0.7],
  ['Hugo', 'Petit', 5, 'MEN', 0.45],
  ['Enzo', 'Roux', 8, 'ARR', 0.4],
  ['Jules', 'Fournier', 10, 'AIL', 0.5],
  ['Adam', 'Girard', 14, 'AF', 0.35],
  ['Rayan', 'Lefèvre', 21, 'PIV', 0.45],
]

const OPPONENTS = ['BC Lyon', 'Étoile Nantes', 'ASVEL Espoirs', 'Paris Basket', 'JA Vichy', 'Union Tours', 'SCM Le Mans', 'Élan Pau', 'CSP Limoges', 'Cholet Basket']

export async function seedDemo(seasonId: string) {
  const rand = mulberry32(42)
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]

  const players: Player[] = ROSTER.map(([firstName, lastName, number, position]) => ({
    id: newId(),
    seasonId,
    firstName,
    lastName,
    number,
    position,
    active: true,
  }))
  const talent = new Map(players.map((p, i) => [p.id, ROSTER[i][4]]))

  const games: Game[] = []
  const events: GameEvent[] = []
  const start = new Date()
  start.setDate(start.getDate() - 7 * 8)

  for (let g = 0; g < 10; g++) {
    const date = new Date(start)
    date.setDate(date.getDate() + g * 7)
    date.setHours(g % 2 ? 20 : 15, 30, 0, 0)
    const finished = g < 8
    const starters = players.slice(0, 5).map((p) => p.id)
    const game: Game = {
      id: newId(),
      seasonId,
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:30`,
      opponent: OPPONENTS[g],
      homeAway: g % 2 ? 'away' : 'home',
      competition: 'Championnat régional',
      location: g % 2 ? `Salle de ${OPPONENTS[g].split(' ').pop()}` : 'Gymnase municipal',
      status: finished ? 'finished' : 'planned',
      periods: 4,
      periodLength: 10,
      overtimeLength: 5,
      clockEnabled: true,
      rosterIds: players.map((p) => p.id),
      starterIds: finished ? starters : [],
      clock: { period: finished ? 4 : 1, remainingMs: finished ? 0 : 600_000, running: false },
    }
    games.push(game)
    if (!finished) continue

    let seq = 0
    const oppStrength = 0.38 + rand() * 0.16
    const onCourt = [...starters]
    const bench = players.slice(5).map((p) => p.id)
    const push = (period: number, clockMs: number, e: Partial<GameEvent> & Pick<GameEvent, 'type'>) => {
      const ev: GameEvent = {
        id: newId(),
        gameId: game.id,
        seq: ++seq,
        period,
        clockMs: Math.max(0, Math.round(clockMs)),
        createdAt: date.getTime() + seq * 1000,
        team: e.type === 'OPP_SCORE' ? 'opp' : 'us',
        ...e,
      }
      events.push(ev)
      return ev
    }
    const weighted = () => {
      const total = onCourt.reduce((s, id) => s + (talent.get(id) ?? 0.5), 0)
      let r = rand() * total
      for (const id of onCourt) {
        r -= talent.get(id) ?? 0.5
        if (r <= 0) return id
      }
      return onCourt[0]
    }
    const other = (id: string) => pick(onCourt.filter((x) => x !== id))

    const shotLocation = (three: boolean) => {
      for (let i = 0; i < 50; i++) {
        let x: number
        let y: number
        if (three && rand() < 0.2) {
          x = rand() < 0.5 ? 0.25 + rand() * 0.5 : COURT.width - 0.75 + rand() * 0.5
          y = 0.3 + rand() * 2.4
        } else {
          const angle = ((rand() * 170 - 85) * Math.PI) / 180
          const r = three ? 6.95 + rand() * 1.1 : rand() < 0.55 ? 0.4 + rand() * 2.2 : 3.2 + rand() * 3.2
          x = COURT.basketX + Math.sin(angle) * r
          y = COURT.basketY + Math.cos(angle) * r
        }
        if (x < 0.1 || x > COURT.width - 0.1 || y < 0.2 || y > COURT.length - 0.2) continue
        if (isThreePoint(x, y) === three) return { x, y, zone: detectZone(x, y) }
      }
      return { x: COURT.basketX, y: three ? 9 : 2, zone: detectZone(COURT.basketX, three ? 9 : 2) }
    }

    for (let period = 1; period <= 4; period++) {
      let clock = 600_000
      let nextSub = 600_000 - (180_000 + rand() * 120_000)
      while (clock > 0) {
        // Remplacements
        if (clock < nextSub) {
          const n = 1 + Math.floor(rand() * 2)
          for (let k = 0; k < n; k++) {
            const outIdx = Math.floor(rand() * onCourt.length)
            const inIdx = Math.floor(rand() * bench.length)
            const out = onCourt[outIdx]
            const inn = bench[inIdx]
            onCourt[outIdx] = inn
            bench[inIdx] = out
            push(period, clock, { type: 'SUB', playerId: inn, outPlayerId: out })
          }
          nextSub = clock - (150_000 + rand() * 150_000)
        }

        // Possession offensive
        clock -= 8_000 + rand() * 14_000
        if (clock <= 0) break
        let possession = true
        while (possession) {
          const r = rand()
          const shooter = weighted()
          const skill = talent.get(shooter) ?? 0.5
          if (r < 0.12) {
            push(period, clock, { type: 'TOV', playerId: shooter })
            possession = false
          } else if (r < 0.2) {
            push(period, clock, { type: 'FOUL_DRAWN', playerId: shooter })
            for (let k = 0; k < 2; k++) push(period, clock, { type: 'FT', playerId: shooter, made: rand() < 0.55 + skill * 0.3 })
            possession = false
          } else {
            const three = rand() < 0.32
            const loc = shotLocation(three)
            const base = three ? 0.22 : loc.zone === 'RAQ' ? 0.5 : 0.33
            const made = rand() < base + skill * 0.2
            push(period, clock, { type: 'SHOT', playerId: shooter, made, points: three ? 3 : 2, ...loc })
            if (made) {
              if (rand() < 0.55) push(period, clock, { type: 'AST', playerId: other(shooter) })
              possession = false
            } else if (rand() < 0.3) {
              push(period, clock, { type: 'REB_OFF', playerId: weighted() })
              clock -= 3_000
            } else possession = false
          }
        }

        // Possession adverse
        clock -= 8_000 + rand() * 14_000
        if (clock <= 0) break
        const r = rand()
        if (r < 0.07) {
          push(period, clock, { type: 'STL', playerId: weighted() })
        } else if (r < 0.2) {
          push(period, clock, { type: 'FOUL', playerId: pick(onCourt) })
          const ft = (rand() < oppStrength + 0.3 ? 1 : 0) + (rand() < oppStrength + 0.3 ? 1 : 0)
          if (ft) push(period, clock, { type: 'OPP_SCORE', points: ft })
        } else if (rand() < oppStrength + 0.08) {
          push(period, clock, { type: 'OPP_SCORE', points: rand() < 0.25 ? 3 : 2 })
        } else {
          if (rand() < 0.08) push(period, clock, { type: 'BLK', playerId: pick(onCourt) })
          if (rand() < 0.72) push(period, clock, { type: 'REB_DEF', playerId: weighted() })
        }
      }
    }
  }

  await db.transaction('rw', db.players, db.games, db.events, async () => {
    await db.players.bulkAdd(players)
    await db.games.bulkAdd(games)
    await db.events.bulkAdd(events)
  })

  // Scores finaux
  for (const game of games.filter((g) => g.status === 'finished')) {
    const box = computeBoxScore(game, events.filter((e) => e.gameId === game.id))
    await db.games.update(game.id, { ourScore: box.usScore, oppScore: box.oppScore })
  }
}

export async function seedDemoSeason(season: Season) {
  await db.seasons.update(season.id, { teamName: 'Hoop Track BC', color: '#f97316' })
  await seedDemo(season.id)
}

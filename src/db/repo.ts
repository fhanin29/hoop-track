import { db, newId } from './db'
import type { Game, GameEvent, Player, Season } from '../domain/types'
import { clockRemaining, computeBoxScore, periodLengthMs } from '../domain/stats'

// ---------- Réglages ----------

export interface AppSettings {
  activeSeasonId?: string
  defaultClockEnabled: boolean
  defaultPeriods: number
  defaultPeriodLength: number
  vibration: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultClockEnabled: true,
  defaultPeriods: 4,
  defaultPeriodLength: 10,
  vibration: true,
}

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.settings.toArray()
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) }
}

export async function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  await db.settings.put({ key, value })
}

// ---------- Saisons ----------

export function defaultSeasonName(d = new Date()): string {
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1
  return `Saison ${y}-${y + 1}`
}

export async function ensureActiveSeason(): Promise<Season> {
  return db.transaction('rw', db.seasons, db.settings, async () => {
    const setting = await db.settings.get('activeSeasonId')
    if (setting) {
      const s = await db.seasons.get(setting.value as string)
      if (s) return s
    }
    const existing = await db.seasons.orderBy('id').first()
    const season: Season = existing ?? {
      id: newId(),
      name: defaultSeasonName(),
      teamName: 'Mon équipe',
      color: '#f97316',
      createdAt: Date.now(),
    }
    if (!existing) await db.seasons.add(season)
    await db.settings.put({ key: 'activeSeasonId', value: season.id })
    return season
  })
}

export async function updateSeason(id: string, changes: Partial<Season>) {
  await db.seasons.update(id, changes)
}

export async function createSeason(name: string, copyFrom?: Season): Promise<Season> {
  const season: Season = {
    id: newId(),
    name,
    teamName: copyFrom?.teamName ?? 'Mon équipe',
    color: copyFrom?.color ?? '#f97316',
    createdAt: Date.now(),
  }
  await db.transaction('rw', db.seasons, db.players, db.settings, async () => {
    await db.seasons.add(season)
    if (copyFrom) {
      const players = await db.players.where('seasonId').equals(copyFrom.id).toArray()
      await db.players.bulkAdd(
        players.filter((p) => p.active).map((p) => ({ ...p, id: newId(), seasonId: season.id })),
      )
    }
    await db.settings.put({ key: 'activeSeasonId', value: season.id })
  })
  return season
}

export async function deleteSeason(id: string) {
  await db.transaction('rw', [db.seasons, db.players, db.games, db.events], async () => {
    const gameIds = await db.games.where('seasonId').equals(id).primaryKeys()
    if (gameIds.length) await db.events.where('gameId').anyOf(gameIds as string[]).delete()
    await db.games.where('seasonId').equals(id).delete()
    await db.players.where('seasonId').equals(id).delete()
    await db.seasons.delete(id)
  })
}

// ---------- Joueurs ----------

export async function savePlayer(p: Omit<Player, 'id'> & { id?: string }): Promise<string> {
  const id = p.id ?? newId()
  await db.players.put({ ...p, id })
  return id
}

export async function playerHasEvents(playerId: string): Promise<boolean> {
  const n = await db.events.filter((e) => e.playerId === playerId || e.outPlayerId === playerId).count()
  return n > 0
}

export async function deletePlayer(id: string) {
  await db.transaction('rw', db.players, db.games, async () => {
    await db.players.delete(id)
    await db.games
      .filter((g) => g.rosterIds.includes(id))
      .modify((g) => {
        g.rosterIds = g.rosterIds.filter((x) => x !== id)
        g.starterIds = g.starterIds.filter((x) => x !== id)
      })
  })
}

// ---------- Matchs ----------

export type GameInput = Pick<
  Game,
  'date' | 'opponent' | 'homeAway' | 'competition' | 'location' | 'periods' | 'periodLength' | 'clockEnabled'
> & { id?: string; seasonId: string; ourScore?: number; oppScore?: number; manualResult?: boolean }

export async function saveGame(input: GameInput): Promise<string> {
  if (input.id) {
    const existing = await db.games.get(input.id)
    if (existing) {
      const changes: Partial<Game> = { ...input }
      if (existing.status === 'planned') {
        changes.clock = { ...existing.clock, remainingMs: input.periodLength * 60_000 }
      }
      if (input.manualResult) changes.status = 'finished'
      else if (existing.manualResult) {
        changes.status = 'planned'
        changes.ourScore = undefined
        changes.oppScore = undefined
      }
      await db.games.update(input.id, changes)
      return input.id
    }
  }
  const players = await db.players.where('seasonId').equals(input.seasonId).filter((p) => p.active).toArray()
  const game: Game = {
    overtimeLength: 5,
    rosterIds: players.map((p) => p.id),
    starterIds: [],
    ...input,
    id: input.id ?? newId(),
    status: input.manualResult ? 'finished' : 'planned',
    clock: { period: 1, remainingMs: input.periodLength * 60_000, running: false },
  }
  await db.games.add(game)
  return game.id
}

export async function updateGame(id: string, changes: Partial<Game>) {
  await db.games.update(id, changes)
}

/** Bascule la convocation d'un joueur (lecture/écriture atomique : robuste aux appuis rapides) */
export async function toggleRosterPlayer(gameId: string, playerId: string) {
  await db.transaction('rw', db.games, async () => {
    const g = await db.games.get(gameId)
    if (!g) return
    const rosterIds = g.rosterIds.includes(playerId) ? g.rosterIds.filter((x) => x !== playerId) : [...g.rosterIds, playerId]
    await db.games.update(gameId, { rosterIds, starterIds: g.starterIds.filter((x) => rosterIds.includes(x)) })
  })
}

/** Bascule un joueur dans le cinq de départ ; renvoie false si le cinq est déjà complet */
export async function toggleStarterPlayer(gameId: string, playerId: string): Promise<boolean> {
  return db.transaction('rw', db.games, async () => {
    const g = await db.games.get(gameId)
    if (!g) return true
    if (g.starterIds.includes(playerId)) {
      await db.games.update(gameId, { starterIds: g.starterIds.filter((x) => x !== playerId) })
      return true
    }
    if (g.starterIds.length >= 5) return false
    await db.games.update(gameId, {
      starterIds: [...g.starterIds, playerId],
      rosterIds: g.rosterIds.includes(playerId) ? g.rosterIds : [...g.rosterIds, playerId],
    })
    return true
  })
}

export async function deleteGame(id: string) {
  await db.transaction('rw', db.games, db.events, async () => {
    await db.events.where('gameId').equals(id).delete()
    await db.games.delete(id)
  })
}

export async function startGame(id: string) {
  await db.games.update(id, { status: 'live', manualResult: false })
}

export async function finishGame(id: string) {
  await db.transaction('rw', db.games, db.events, async () => {
    const game = await db.games.get(id)
    if (!game) return
    const events = await db.events.where('gameId').equals(id).toArray()
    const box = computeBoxScore(game, events)
    const remaining = clockRemaining(game.clock, Date.now())
    await db.games.update(id, {
      status: 'finished',
      ourScore: box.usScore,
      oppScore: box.oppScore,
      clock: { ...game.clock, running: false, remainingMs: remaining, startedAt: undefined },
    })
  })
}

export async function reopenGame(id: string) {
  await db.games.update(id, { status: 'live' })
}

// ---------- Chrono ----------

export async function toggleClock(game: Game) {
  const now = Date.now()
  const remaining = clockRemaining(game.clock, now)
  const clock = game.clock.running
    ? { ...game.clock, running: false, remainingMs: remaining, startedAt: undefined }
    : remaining > 0
      ? { ...game.clock, running: true, remainingMs: remaining, startedAt: now }
      : game.clock
  await db.games.update(game.id, { clock })
}

export async function pauseClockIfExpired(game: Game) {
  if (game.clock.running && clockRemaining(game.clock, Date.now()) <= 0) {
    await db.games.update(game.id, { clock: { ...game.clock, running: false, remainingMs: 0, startedAt: undefined } })
  }
}

export async function setClockRemaining(game: Game, ms: number) {
  const max = periodLengthMs(game, game.clock.period)
  const remainingMs = Math.min(max, Math.max(0, ms))
  await db.games.update(game.id, {
    clock: { ...game.clock, remainingMs, startedAt: game.clock.running ? Date.now() : undefined },
  })
}

export async function adjustClock(game: Game, deltaMs: number) {
  await setClockRemaining(game, clockRemaining(game.clock, Date.now()) + deltaMs)
}

export async function setPeriod(game: Game, period: number) {
  await db.games.update(game.id, {
    clock: { period, remainingMs: periodLengthMs(game, period), running: false },
  })
}

export async function setClockEnabled(game: Game, enabled: boolean) {
  const remaining = clockRemaining(game.clock, Date.now())
  await db.games.update(game.id, {
    clockEnabled: enabled,
    clock: { ...game.clock, running: false, remainingMs: remaining, startedAt: undefined },
  })
}

// ---------- Événements ----------

export type NewEvent = Omit<GameEvent, 'id' | 'gameId' | 'seq' | 'period' | 'createdAt' | 'clockMs'>

export async function addEvents(game: Game, items: NewEvent[]): Promise<GameEvent[]> {
  return db.transaction('rw', db.events, async () => {
    const last = await db.events
      .where('[gameId+seq]')
      .between([game.id, -Infinity], [game.id, Infinity])
      .last()
    let seq = last?.seq ?? 0
    const now = Date.now()
    const clockMs = game.clockEnabled ? clockRemaining(game.clock, now) : undefined
    const created = items.map((item) => {
      const e: GameEvent = {
        ...item,
        id: newId(),
        gameId: game.id,
        seq: ++seq,
        period: game.clock.period,
        createdAt: now,
      }
      if (clockMs !== undefined) e.clockMs = clockMs
      return e
    })
    await db.events.bulkAdd(created)
    return created
  })
}

export async function addEvent(game: Game, item: NewEvent): Promise<GameEvent> {
  const [e] = await addEvents(game, [item])
  return e
}

export async function deleteEvents(ids: string[]) {
  await db.events.bulkDelete(ids)
}

export async function updateEvent(id: string, changes: Partial<GameEvent>) {
  await db.events.update(id, changes)
}

export async function lastEvent(gameId: string): Promise<GameEvent | undefined> {
  return db.events.where('[gameId+seq]').between([gameId, -Infinity], [gameId, Infinity]).last()
}

// ---------- Sauvegarde ----------

export interface Backup {
  app: 'hoop-track'
  version: 1
  exportedAt: string
  seasons: Season[]
  players: Player[]
  games: Game[]
  events: GameEvent[]
  settings: { key: string; value: unknown }[]
}

export async function exportBackup(): Promise<Backup> {
  const [seasons, players, games, events, settings] = await Promise.all([
    db.seasons.toArray(),
    db.players.toArray(),
    db.games.toArray(),
    db.events.toArray(),
    db.settings.toArray(),
  ])
  return { app: 'hoop-track', version: 1, exportedAt: new Date().toISOString(), seasons, players, games, events, settings }
}

export async function importBackup(data: unknown) {
  const b = data as Backup
  if (!b || b.app !== 'hoop-track' || !Array.isArray(b.seasons)) {
    throw new Error("Ce fichier n'est pas une sauvegarde Hoop Track valide.")
  }
  await db.transaction('rw', [db.seasons, db.players, db.games, db.events, db.settings], async () => {
    await Promise.all([db.seasons.clear(), db.players.clear(), db.games.clear(), db.events.clear(), db.settings.clear()])
    await db.seasons.bulkAdd(b.seasons)
    await db.players.bulkAdd(b.players ?? [])
    await db.games.bulkAdd(b.games ?? [])
    await db.events.bulkAdd(b.events ?? [])
    await db.settings.bulkAdd(b.settings ?? [])
  })
}

export async function resetAll() {
  await db.transaction('rw', [db.seasons, db.players, db.games, db.events, db.settings], async () => {
    await Promise.all([db.seasons.clear(), db.players.clear(), db.games.clear(), db.events.clear(), db.settings.clear()])
  })
}

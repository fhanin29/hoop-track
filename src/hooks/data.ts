import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { DEFAULT_SETTINGS, getSettings, type AppSettings } from '../db/repo'
import { computeSeasonStats } from '../domain/stats'
import type { Game, Player, Season } from '../domain/types'

export function useSeason(): Season | undefined {
  return useLiveQuery(async () => {
    const s = await db.settings.get('activeSeasonId')
    return s ? db.seasons.get(s.value as string) : undefined
  })
}

export function useSeasons(): Season[] {
  return useLiveQuery(() => db.seasons.orderBy('id').toArray()) ?? []
}

export function useSettings(): AppSettings {
  return useLiveQuery(getSettings) ?? DEFAULT_SETTINGS
}

export const byNumber = (a: Player, b: Player) => a.number - b.number

export function usePlayers(seasonId?: string): Player[] | undefined {
  return useLiveQuery(
    async () => (seasonId ? (await db.players.where('seasonId').equals(seasonId).toArray()).sort(byNumber) : []),
    [seasonId],
  )
}

export function usePlayerMap(seasonId?: string): Map<string, Player> {
  const players = usePlayers(seasonId)
  return useMemo(() => new Map((players ?? []).map((p) => [p.id, p])), [players])
}

export function useGames(seasonId?: string): Game[] | undefined {
  return useLiveQuery(
    async () =>
      seasonId ? (await db.games.where('seasonId').equals(seasonId).toArray()).sort((a, b) => a.date.localeCompare(b.date)) : [],
    [seasonId],
  )
}

export function useSeasonStats(seasonId?: string) {
  const data = useLiveQuery(async () => {
    if (!seasonId) return null
    const games = await db.games.where('seasonId').equals(seasonId).toArray()
    const ids = games.filter((g) => g.status === 'finished').map((g) => g.id)
    const events = ids.length ? await db.events.where('gameId').anyOf(ids).toArray() : []
    return { games, events }
  }, [seasonId])
  return useMemo(() => (data ? computeSeasonStats(data.games, data.events) : undefined), [data])
}

export function useGame(id?: string) {
  return useLiveQuery(async () => (id ? ((await db.games.get(id)) ?? null) : null), [id])
}

export function useGameEvents(id?: string) {
  return useLiveQuery(
    async () =>
      id ? db.events.where('[gameId+seq]').between([id, -Infinity], [id, Infinity]).toArray() : [],
    [id],
  )
}

export function useNow(enabled: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [enabled, intervalMs])
  return now
}

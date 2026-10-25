import Dexie, { type EntityTable } from 'dexie'
import type { Game, GameEvent, Player, Season } from '../domain/types'

export interface Setting {
  key: string
  value: unknown
}

export class HoopDB extends Dexie {
  seasons!: EntityTable<Season, 'id'>
  players!: EntityTable<Player, 'id'>
  games!: EntityTable<Game, 'id'>
  events!: EntityTable<GameEvent, 'id'>
  settings!: EntityTable<Setting, 'key'>

  constructor(name = 'hoop-track') {
    super(name)
    this.version(1).stores({
      seasons: 'id',
      players: 'id, seasonId',
      games: 'id, seasonId, date',
      events: 'id, gameId, [gameId+seq]',
      settings: 'key',
    })
  }
}

export const db = new HoopDB()

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && window.isSecureContext) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export type Position = 'MEN' | 'ARR' | 'AIL' | 'AF' | 'PIV'

export const POSITIONS: Record<Position, string> = {
  MEN: 'Meneur',
  ARR: 'Arrière',
  AIL: 'Ailier',
  AF: 'Ailier fort',
  PIV: 'Pivot',
}

export interface Season {
  id: string
  name: string
  teamName: string
  color: string
  createdAt: number
}

export interface Player {
  id: string
  seasonId: string
  firstName: string
  lastName: string
  number: number
  position?: Position
  active: boolean
}

export type GameStatus = 'planned' | 'live' | 'finished'

export interface GameClock {
  period: number
  /** Temps restant dans la période (ms) au moment de `startedAt` ou de la pause */
  remainingMs: number
  running: boolean
  startedAt?: number
}

export interface Game {
  id: string
  seasonId: string
  /** Format local `YYYY-MM-DDTHH:mm` */
  date: string
  opponent: string
  homeAway: 'home' | 'away'
  competition?: string
  location?: string
  status: GameStatus
  periods: number
  /** Durée d'une période en minutes */
  periodLength: number
  overtimeLength: number
  clockEnabled: boolean
  rosterIds: string[]
  starterIds: string[]
  clock: GameClock
  ourScore?: number
  oppScore?: number
  /** Résultat saisi manuellement (match non suivi en direct) */
  manualResult?: boolean
}

export type ZoneId =
  | 'RAQ'
  | 'MI_G'
  | 'MI_AXE'
  | 'MI_D'
  | 'C3_G'
  | 'A3_G'
  | 'AXE3'
  | 'A3_D'
  | 'C3_D'

export type EventType =
  | 'SHOT'
  | 'FT'
  | 'REB_OFF'
  | 'REB_DEF'
  | 'AST'
  | 'TOV'
  | 'STL'
  | 'BLK'
  | 'FOUL'
  | 'FOUL_DRAWN'
  | 'SUB'
  | 'OPP_SCORE'

export interface GameEvent {
  id: string
  gameId: string
  seq: number
  period: number
  /** Temps restant dans la période (ms) si le chrono est suivi */
  clockMs?: number
  createdAt: number
  team: 'us' | 'opp'
  type: EventType
  playerId?: string
  /** Pour SUB : joueur qui sort (playerId = joueur qui entre) */
  outPlayerId?: string
  made?: boolean
  points?: number
  x?: number
  y?: number
  zone?: ZoneId
  linkedEventId?: string
}

export const EVENT_LABELS: Record<EventType, string> = {
  SHOT: 'Tir',
  FT: 'Lancer franc',
  REB_OFF: 'Rebond offensif',
  REB_DEF: 'Rebond défensif',
  AST: 'Passe décisive',
  TOV: 'Balle perdue',
  STL: 'Interception',
  BLK: 'Contre',
  FOUL: 'Faute',
  FOUL_DRAWN: 'Faute provoquée',
  SUB: 'Remplacement',
  OPP_SCORE: 'Panier adverse',
}

export function describeEvent(e: GameEvent): string {
  switch (e.type) {
    case 'SHOT':
      return `${e.points} pts ${e.made ? 'réussi' : 'raté'}`
    case 'FT':
      return `LF ${e.made ? 'réussi' : 'raté'}`
    case 'OPP_SCORE':
      return `Adversaire +${e.points}`
    default:
      return EVENT_LABELS[e.type]
  }
}

export function playerName(p: Pick<Player, 'firstName' | 'lastName'>): string {
  return `${p.firstName} ${p.lastName}`.trim()
}

export function periodLabel(period: number, regular: number): string {
  return period <= regular ? `QT${period}` : `Prol.${period - regular > 1 ? ` ${period - regular}` : ''}`
}

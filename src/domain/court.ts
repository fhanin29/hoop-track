import type { ZoneId } from './types'

/** Demi-terrain FIBA en mètres. Le panier est en haut (ligne de fond à y = 0). */
export const COURT = {
  width: 15,
  length: 14,
  basketX: 7.5,
  basketY: 1.575,
  threeRadius: 6.75,
  cornerX: 0.9,
  paintWidth: 4.9,
  paintLength: 5.8,
  ftRadius: 1.8,
  restrictedRadius: 1.25,
} as const

/** Ordonnée où la ligne droite à 3 pts rejoint l'arc */
export const CORNER_Y =
  COURT.basketY + Math.sqrt(COURT.threeRadius ** 2 - (COURT.basketX - COURT.cornerX) ** 2)

/** Angle (degrés) séparant l'axe des côtés */
export const WING_ANGLE = 30

export const ZONES: Record<ZoneId, { label: string; short: string; points: 2 | 3 }> = {
  RAQ: { label: 'Raquette', short: 'Raq.', points: 2 },
  MI_G: { label: 'Mi-distance gauche', short: 'Mi G', points: 2 },
  MI_AXE: { label: 'Mi-distance axe', short: 'Mi axe', points: 2 },
  MI_D: { label: 'Mi-distance droite', short: 'Mi D', points: 2 },
  C3_G: { label: 'Corner 3 gauche', short: 'Corner G', points: 3 },
  A3_G: { label: '3 pts 45° gauche', short: '45° G', points: 3 },
  AXE3: { label: '3 pts axe', short: '3 axe', points: 3 },
  A3_D: { label: '3 pts 45° droite', short: '45° D', points: 3 },
  C3_D: { label: 'Corner 3 droite', short: 'Corner D', points: 3 },
}

export const ZONE_IDS = Object.keys(ZONES) as ZoneId[]

/** Angle en degrés depuis l'axe panier → milieu de terrain (négatif = gauche de l'écran) */
export function shotAngle(x: number, y: number): number {
  return (Math.atan2(x - COURT.basketX, y - COURT.basketY) * 180) / Math.PI
}

export function isThreePoint(x: number, y: number): boolean {
  if (y <= CORNER_Y) return x < COURT.cornerX || x > COURT.width - COURT.cornerX
  return Math.hypot(x - COURT.basketX, y - COURT.basketY) > COURT.threeRadius
}

export function isInPaint(x: number, y: number): boolean {
  const half = COURT.paintWidth / 2
  return Math.abs(x - COURT.basketX) <= half && y <= COURT.paintLength
}

export function detectZone(x: number, y: number): ZoneId {
  const angle = shotAngle(x, y)
  if (isThreePoint(x, y)) {
    if (y <= CORNER_Y) return x < COURT.basketX ? 'C3_G' : 'C3_D'
    if (angle < -WING_ANGLE) return 'A3_G'
    if (angle > WING_ANGLE) return 'A3_D'
    return 'AXE3'
  }
  if (isInPaint(x, y)) return 'RAQ'
  if (angle < -WING_ANGLE) return 'MI_G'
  if (angle > WING_ANGLE) return 'MI_D'
  return 'MI_AXE'
}

export function clampToCourt(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(COURT.width, Math.max(0, x)),
    y: Math.min(COURT.length, Math.max(0, y)),
  }
}

import type { EventType } from '../../domain/types'

export type PadAction = 'FT_MADE' | 'FT_MISS' | 'REB_OFF' | 'REB_DEF' | 'AST' | 'TOV' | 'STL' | 'BLK' | 'FOUL' | 'FOUL_DRAWN'

export type Tone = 'green' | 'red' | 'blue' | 'orange' | 'violet' | 'teal'

export const TONE_CLASSES: Record<Tone, { btn: string; border: string; text: string }> = {
  green: { btn: 'bg-emerald-600 hover:bg-emerald-500 text-white', border: 'border-l-emerald-500', text: 'text-emerald-400' },
  red: { btn: 'bg-red-600 hover:bg-red-500 text-white', border: 'border-l-red-500', text: 'text-red-400' },
  blue: { btn: 'bg-sky-600 hover:bg-sky-500 text-white', border: 'border-l-sky-500', text: 'text-sky-400' },
  orange: { btn: 'bg-orange-600 hover:bg-orange-500 text-white', border: 'border-l-orange-500', text: 'text-orange-400' },
  violet: { btn: 'bg-violet-600 hover:bg-violet-500 text-white', border: 'border-l-violet-500', text: 'text-violet-400' },
  teal: { btn: 'bg-teal-600 hover:bg-teal-500 text-white', border: 'border-l-teal-500', text: 'text-teal-400' },
}

export const PAD: { action: PadAction; label: string; short: string; tone: Tone }[] = [
  { action: 'FT_MADE', label: 'LF réussi', short: 'LF ✓', tone: 'green' },
  { action: 'FT_MISS', label: 'LF raté', short: 'LF ✗', tone: 'red' },
  { action: 'REB_OFF', label: 'Rebond offensif', short: 'Reb. off.', tone: 'blue' },
  { action: 'REB_DEF', label: 'Rebond défensif', short: 'Reb. déf.', tone: 'blue' },
  { action: 'AST', label: 'Passe décisive', short: 'Passe D.', tone: 'blue' },
  { action: 'STL', label: 'Interception', short: 'Intercep.', tone: 'violet' },
  { action: 'BLK', label: 'Contre', short: 'Contre', tone: 'violet' },
  { action: 'FOUL_DRAWN', label: 'Faute provoquée', short: 'Faute prov.', tone: 'teal' },
  { action: 'TOV', label: 'Balle perdue', short: 'Balle perdue', tone: 'orange' },
  { action: 'FOUL', label: 'Faute', short: 'Faute', tone: 'orange' },
]

export function eventTone(type: EventType, made?: boolean): Tone {
  switch (type) {
    case 'SHOT':
    case 'FT':
      return made ? 'green' : 'red'
    case 'REB_OFF':
    case 'REB_DEF':
    case 'AST':
      return 'blue'
    case 'STL':
    case 'BLK':
      return 'violet'
    case 'FOUL_DRAWN':
      return 'teal'
    case 'OPP_SCORE':
      return 'red'
    default:
      return 'orange'
  }
}

export const MAX_FOULS = 5

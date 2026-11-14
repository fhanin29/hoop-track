import type { NewEvent } from '../db/repo'
import { ZONE_ANCHORS } from '../domain/court'
import type { Player, ZoneId } from '../domain/types'
import { NUMBER_HOMOPHONES, wordsToDigits } from './numbers'

type PlayerRef = Pick<Player, 'id' | 'number'>

export interface VoiceContext {
  /** Joueurs actuellement sur le terrain */
  onCourt: PlayerRef[]
  /** Joueurs convoqués qui sont sur le banc */
  bench: PlayerRef[]
}

/** Événement à créer. `linkTo` : index, dans la même liste, de l'événement auquel le rattacher (`linkedEventId`). */
export type VoiceEvent = NewEvent & { linkTo?: number }

export type VoiceResult =
  | { ok: true; events: VoiceEvent[]; normalized: string }
  | { ok: false; error: string; normalized: string }

class VoiceError extends Error {}
const fail = (message: string): never => {
  throw new VoiceError(message)
}

/** Minuscules, sans accents ni ponctuation, nombres en chiffres. */
export function normalize(text: string): string {
  const flat = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/(\d)\s*\/\s*(\d)/g, '$1 sur $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .trim()
  return flat ? wordsToDigits(flat.split(' ')).join(' ') : ''
}

const LINK = '(?: de| du| numero| par| pour| le| la)*'
const AST_FOLLOW = new RegExp(`\\b(?:passes?(?: decisives?)?|assists?)${LINK} (\\d{1,2})\\b`)
const REB_FOLLOW = new RegExp(`\\brebonds?(?: offensifs?| off)?${LINK} (\\d{1,2})\\b`)
const FT_WORDS = /\b(?:lancers?(?: francs?)?|lf)\b/
const THREE = /\b3 ?(?:points?|pts?)\b|\ba 3\b|\bprimes?\b/
const TWO = /\b2 ?(?:points?|pts?)\b|\ba 2\b/
const MADE = /\b(?:reussi\w*|marque\w*|dedans|bon|bonne?s?|inscrit\w*|valide\w*|oui)\b/
const MISSED = /\b(?:rate\w*|manque\w*|loupe\w*|dehors|echec|echoue\w*|non)\b/

type Kind = 'SHOT' | 'FT' | 'REB' | 'AST' | 'STL' | 'BLK' | 'TOV' | 'FOUL' | 'FOUL_DRAWN'

/** En cas de départ au même mot, la première entrée l'emporte (« faute provoquée » avant « faute »). */
const ACTIONS: [RegExp, Kind][] = [
  [/\bfautes? (?:provoquee?s?|subie?s?|obtenue?s?)\b|\bprovoque\w*\b/, 'FOUL_DRAWN'],
  [FT_WORDS, 'FT'],
  [/\brebonds?\b/, 'REB'],
  [/\b(?:passes?(?: decisives?)?|assists?)\b/, 'AST'],
  [/\b(?:interceptions?|intercepte\w*|vol(?: de balle)?|steal)\b/, 'STL'],
  [/\b(?:contres?|block|bloque\w*)\b/, 'BLK'],
  [/\b(?:balles? perdues?|pertes? de balle|perd\w* (?:la |le )?(?:balle|ballon)|marcher|turnover)\b/, 'TOV'],
  [/\bfautes?\b/, 'FOUL'],
  [/\b(?:[23] ?(?:points?|pts?)|a [23]|tirs?|paniers?|lay ?up|dunk|double pas|primes?)\b/, 'SHOT'],
]

export function parseVoice(text: string, ctx: VoiceContext): VoiceResult {
  const normalized = normalize(text)
  try {
    return { ok: true, events: parse(normalized, ctx), normalized }
  } catch (e) {
    if (e instanceof VoiceError) return { ok: false, error: e.message, normalized }
    throw e
  }
}

function parse(s: string, ctx: VoiceContext): VoiceEvent[] {
  if (!s) fail('Rien entendu')

  const opp = /^(?:l |les |pour )*(?:adversaires?|adverse|eux)\b(.*)$/.exec(s) ?? /^paniers? adverses?\b(.*)$/.exec(s)
  if (opp) return [{ team: 'opp', type: 'OPP_SCORE', points: oppPoints(s) }]

  if (/\b(?:remplace\w*|changements?|sort\w*)\b|^entre\b|^\d+ entre\b/.test(s)) return parseSubs(s, ctx)

  const { player, rest } = leadingPlayer(s, ctx)
  let main: { kind: Kind; index: number } | null = null
  for (const [re, kind] of ACTIONS) {
    const m = re.exec(rest)
    if (m && (!main || m.index < main.index)) main = { kind, index: m.index }
  }
  if (!main) return fail(`Action non comprise pour le n° ${player.number}`)

  const simple = (type: NewEvent['type']): VoiceEvent[] => [{ team: 'us', type, playerId: player.id }]
  switch (main.kind) {
    case 'SHOT':
      return parseShot(rest, player, ctx)
    case 'FT':
      return parseFreeThrows(rest, player, ctx)
    case 'FOUL_DRAWN': {
      const ft = FT_WORDS.exec(rest)
      const throws = ft ? parseFreeThrows(rest.slice(ft.index), player, ctx) : []
      return [...simple('FOUL_DRAWN'), ...throws.map((e) => (e.linkTo === undefined ? e : { ...e, linkTo: e.linkTo + 1 }))]
    }
    case 'REB':
      return simple(/\boff\w*\b/.test(rest) ? 'REB_OFF' : 'REB_DEF')
    default:
      return simple(main.kind)
  }
}

function oppPoints(s: string): number {
  const n = /\b([123])\b/.exec(s)
  if (n) return Number(n[1])
  if (FT_WORDS.test(s)) return 1
  if (/\bpaniers?\b/.test(s)) return 2
  return fail('Points adverses non compris : dites « adversaire plus deux »')
}

function onCourt(n: number, ctx: VoiceContext): PlayerRef {
  const p = ctx.onCourt.find((x) => x.number === n)
  if (p) return p
  return ctx.bench.some((x) => x.number === n) ? fail(`Le n° ${n} n'est pas sur le terrain`) : fail(`Aucun joueur n° ${n}`)
}

function leadingPlayer(s: string, ctx: VoiceContext): { player: PlayerRef; rest: string } {
  const m = /^(?:le |la |numero |joueur )*(\S+) ?(.*)$/.exec(s)!
  const digits = /^\d{1,3}$/.test(m[1])
  const n = digits ? Number(m[1]) : NUMBER_HOMOPHONES[m[1]]
  if (n === undefined) return fail('Commencez par le numéro du joueur')
  const rest = m[2]

  // « 73 points » ou « 23 points » : le dernier chiffre est la valeur du tir, pas le numéro
  const value = n % 10
  if (digits && n >= 12 && (value === 2 || value === 3) && /^(?:points?|pts?)\b/.test(rest)) {
    const found = [...new Set([Math.floor(n / 10), n - value])]
      .map((num) => ctx.onCourt.find((p) => p.number === num))
      .filter((p) => p !== undefined)
    if (found.length > 1) return fail(`Numéro ambigu : n° ${found.map((p) => p.number).join(' ou ')} ?`)
    if (found.length === 1) return { player: found[0], rest: `${value} ${rest}` }
  }
  return { player: onCourt(n, ctx), rest }
}

function result(s: string): boolean | undefined {
  const made = MADE.test(s)
  const missed = MISSED.test(s)
  if (made && missed) return fail('Résultat ambigu : réussi ou raté ?')
  return made ? true : missed ? false : undefined
}

function shotZone(s: string, three: boolean): ZoneId | undefined {
  const side = /\bgauche\b/.test(s) ? 'G' : /\bdroite?\b/.test(s) ? 'D' : /\b(?:axe|face|tete)\b/.test(s) ? 'AXE' : null
  if (three) {
    if (side === 'AXE') return 'AXE3'
    if (!side) return undefined
    return /\b(?:corner|coin)\b/.test(s) ? `C3_${side}` : `A3_${side}`
  }
  if (/\b(?:raquette|dessous|sous le panier|lay ?up|dunk|double pas)\b/.test(s)) return 'RAQ'
  return side ? `MI_${side}` : undefined
}

function parseShot(rest: string, shooter: PlayerRef, ctx: VoiceContext): VoiceEvent[] {
  const ast = AST_FOLLOW.exec(rest)
  const reb = REB_FOLLOW.exec(rest)
  const body = rest.slice(0, Math.min(ast?.index ?? rest.length, reb?.index ?? rest.length))

  const made = result(body) ?? (/\b(?:paniers?|dunk)\b/.test(body) ? true : fail('Précisez « réussi » ou « raté »'))
  const three = THREE.test(body) || (!TWO.test(body) && !/\bmi distance\b/.test(body) && /\b(?:corner|coin|45|aile)\b/.test(body))
  const zone = shotZone(body, three)
  const events: VoiceEvent[] = [
    { team: 'us', type: 'SHOT', playerId: shooter.id, made, points: three ? 3 : 2, ...(zone && { zone, ...ZONE_ANCHORS[zone] }) },
  ]

  if (ast) {
    if (!made) fail('Pas de passe décisive sur un tir raté')
    const passer = onCourt(Number(ast[1]), ctx)
    if (passer.id === shooter.id) fail('Le passeur ne peut pas être le tireur')
    events.push({ team: 'us', type: 'AST', playerId: passer.id, linkTo: 0 })
  }
  if (reb) {
    if (made) fail('Pas de rebond sur un tir réussi')
    events.push({ team: 'us', type: 'REB_OFF', playerId: onCourt(Number(reb[1]), ctx).id, linkTo: 0 })
  }
  return events
}

function parseFreeThrows(rest: string, shooter: PlayerRef, ctx: VoiceContext): VoiceEvent[] {
  const reb = REB_FOLLOW.exec(rest)
  const body = rest.slice(0, reb?.index ?? rest.length)

  let total: number
  let scored: number
  const ratio = /\b([0-3]) sur ([1-3])\b/.exec(body)
  if (ratio) {
    scored = Number(ratio[1])
    total = Number(ratio[2])
    if (scored > total) fail('Lancers francs incohérents')
  } else {
    const made = result(body) ?? fail('Précisez « réussi » ou « raté », ou « un sur deux »')
    total = Number(/\b([123]) (?:lancers?|lf)\b/.exec(body)?.[1] ?? 1)
    scored = made ? total : 0
  }

  const events: VoiceEvent[] = Array.from({ length: total }, (_, i) => ({ team: 'us', type: 'FT', playerId: shooter.id, made: i < scored }))
  if (reb) {
    if (scored === total) fail('Pas de rebond sur un lancer franc réussi')
    events.push({ team: 'us', type: 'REB_OFF', playerId: onCourt(Number(reb[1]), ctx).id, linkTo: total - 1 })
  }
  return events
}

function parseSubs(s: string, ctx: VoiceContext): VoiceEvent[] {
  const num = '(?:le |la |numero )*(\\d{1,2})'
  let pairs = [...s.matchAll(new RegExp(`\\b(\\d{1,2}) remplace\\w* ${num}\\b`, 'g'))].map((m) => ({ in: m[1], out: m[2] }))
  if (!pairs.length) {
    const body = s.replace(/^(?:changements?|change) ?/, '')
    const keywordFirst = /^(?:entre|sort)/.test(body)
    const pick = (word: string) => (keywordFirst ? new RegExp(`\\b${word}\\w* ${num}\\b`) : new RegExp(`\\b(\\d{1,2}) ${word}\\w*`)).exec(body)?.[1]
    const inn = pick('entre')
    const out = pick('sort')
    const swap = /\b(\d{1,2}) pour (?:le |la )?(\d{1,2})\b/.exec(body)
    if (inn && out) pairs = [{ in: inn, out }]
    else if (swap) pairs = [{ in: swap[1], out: swap[2] }]
  }
  if (!pairs.length) return fail('Changement non compris : dites « 8 remplace 12 »')

  return pairs.map((p) => {
    const out = onCourt(Number(p.out), ctx)
    const n = Number(p.in)
    const inn = ctx.bench.find((x) => x.number === n)
    if (!inn) return ctx.onCourt.some((x) => x.number === n) ? fail(`Le n° ${n} est déjà sur le terrain`) : fail(`Aucun joueur n° ${n} sur le banc`)
    return { team: 'us', type: 'SUB', playerId: inn.id, outPlayerId: out.id }
  })
}

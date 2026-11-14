import { describe, expect, it } from 'vitest'
import { ZONE_ANCHORS, ZONE_IDS, ZONES, detectZone, isThreePoint } from '../domain/court'
import { normalize, parseVoice, type VoiceContext } from './parse'

const p = (number: number) => ({ id: `p${number}`, number })
const ctx: VoiceContext = { onCourt: [4, 7, 10, 12, 20].map(p), bench: [5, 8, 23].map(p) }

const ok = (text: string) => {
  const r = parseVoice(text, ctx)
  if (!r.ok) throw new Error(`« ${text} » → ${r.error}`)
  return r.events
}
const error = (text: string) => {
  const r = parseVoice(text, ctx)
  if (r.ok) throw new Error(`« ${text} » aurait dû échouer`)
  return r.error
}

describe('normalize', () => {
  it('retire accents et ponctuation, convertit les nombres', () => {
    expect(normalize('Le 7, trois points réussi !')).toBe('le 7 3 points reussi')
    expect(normalize('vingt-et-un, soixante-douze, quatre-vingt-dix-neuf, dix-sept')).toBe('21 72 99 17')
    expect(normalize('LF 1/2')).toBe('lf 1 sur 2')
    expect(normalize('45° gauche, 3pts')).toBe('45 gauche 3 pts')
  })
})

describe('tirs', () => {
  it('tir à 3 points réussi avec passe', () => {
    expect(ok('Sept, trois points réussi, passe du dix.')).toEqual([
      { team: 'us', type: 'SHOT', playerId: 'p7', made: true, points: 3 },
      { team: 'us', type: 'AST', playerId: 'p10', linkTo: 0 },
    ])
  })
  it('tir raté avec rebond offensif', () => {
    expect(ok('12 deux points raté rebond du 4')).toEqual([
      { team: 'us', type: 'SHOT', playerId: 'p12', made: false, points: 2 },
      { team: 'us', type: 'REB_OFF', playerId: 'p4', linkTo: 0 },
    ])
  })
  it('« panier » vaut 2 points réussi par défaut', () => {
    expect(ok('le 4 panier')).toEqual([{ team: 'us', type: 'SHOT', playerId: 'p4', made: true, points: 2 }])
  })
  it('zones', () => {
    expect(ok('7 panier raquette')[0]).toMatchObject({ zone: 'RAQ', points: 2, ...ZONE_ANCHORS.RAQ })
    expect(ok('7 trois points corner gauche raté')[0]).toMatchObject({ zone: 'C3_G', points: 3, made: false })
    expect(ok('7 tir coin droit réussi')[0]).toMatchObject({ zone: 'C3_D', points: 3 })
    expect(ok('7 à trois dans l’axe marqué')[0]).toMatchObject({ zone: 'AXE3', points: 3 })
    expect(ok('7 tir 45 droite manqué')[0]).toMatchObject({ zone: 'A3_D', points: 3 })
    expect(ok('7 tir mi-distance gauche réussi')[0]).toMatchObject({ zone: 'MI_G', points: 2 })
    expect(ok('7 deux points face réussi')[0]).toMatchObject({ zone: 'MI_AXE', points: 2 })
  })
  it('sépare le numéro de la valeur du tir collés par la transcription', () => {
    expect(ok('73 points réussis')[0]).toMatchObject({ playerId: 'p7', points: 3, made: true })
    expect(ok('vingt-trois points ratés')[0]).toMatchObject({ playerId: 'p20', points: 3, made: false })
    expect(ok('102 points réussi')[0]).toMatchObject({ playerId: 'p10', points: 2 })
  })
  it('homophones du numéro en début de phrase', () => {
    expect(ok('cette trois points réussi')[0]).toMatchObject({ playerId: 'p7' })
    expect(ok('dit faute')[0]).toMatchObject({ playerId: 'p10', type: 'FOUL' })
  })
  it('refuse les phrases incohérentes', () => {
    expect(error('7 tir')).toMatch(/réussi/)
    expect(error('7 trois points raté passe du 10')).toMatch(/passe/)
    expect(error('7 panier passe du 7')).toMatch(/passeur/)
    expect(error('7 panier rebond du 4')).toMatch(/rebond/)
    expect(error('7 tir réussi raté')).toMatch(/ambigu/)
  })
})

describe('lancers francs', () => {
  it('un lancer', () => {
    expect(ok('10 lancer franc réussi')).toEqual([{ team: 'us', type: 'FT', playerId: 'p10', made: true }])
    expect(ok('10 LF raté')).toEqual([{ team: 'us', type: 'FT', playerId: 'p10', made: false }])
  })
  it('plusieurs lancers', () => {
    expect(ok('10 deux lancers réussis').map((e) => e.made)).toEqual([true, true])
    expect(ok('10 lancers francs un sur deux').map((e) => e.made)).toEqual([true, false])
  })
  it('rebond offensif après le dernier lancer raté', () => {
    expect(ok('10 lancers un sur deux rebond du 12')[2]).toEqual({ team: 'us', type: 'REB_OFF', playerId: 'p12', linkTo: 1 })
    expect(error('10 lancers deux sur deux rebond du 12')).toMatch(/rebond/)
  })
  it('faute provoquée suivie des lancers', () => {
    expect(ok('4 faute provoquée, lancers un sur deux, rebond du 7')).toEqual([
      { team: 'us', type: 'FOUL_DRAWN', playerId: 'p4' },
      { team: 'us', type: 'FT', playerId: 'p4', made: true },
      { team: 'us', type: 'FT', playerId: 'p4', made: false },
      { team: 'us', type: 'REB_OFF', playerId: 'p7', linkTo: 2 },
    ])
  })
})

describe('autres actions', () => {
  it.each([
    ['7 rebond offensif', 'REB_OFF'],
    ['7 rebond défensif', 'REB_DEF'],
    ['7 rebond', 'REB_DEF'],
    ['7 passe décisive', 'AST'],
    ['7 interception', 'STL'],
    ['7 contre', 'BLK'],
    ['7 balle perdue', 'TOV'],
    ['7 perte de balle', 'TOV'],
    ['7 faute', 'FOUL'],
    ['7 faute provoquée', 'FOUL_DRAWN'],
    ['numéro 7 faute subie', 'FOUL_DRAWN'],
  ])('%s → %s', (text, type) => {
    expect(ok(text)).toEqual([{ team: 'us', type, playerId: 'p7' }])
  })
  it('joueur inconnu ou sur le banc', () => {
    expect(error('8 faute')).toMatch(/pas sur le terrain/)
    expect(error('99 faute')).toMatch(/Aucun joueur/)
    expect(error('faute')).toMatch(/numéro/)
    expect(error('7 bonjour')).toMatch(/Action non comprise/)
    expect(error('')).toMatch(/Rien/)
  })
})

describe('adversaire', () => {
  it.each([
    ['adversaire plus deux', 2],
    ["l'adversaire trois points", 3],
    ['adversaire lancer franc', 1],
    ['adversaire panier', 2],
    ['panier adverse à 3 points', 3],
  ])('%s → +%i', (text, points) => {
    expect(ok(text)).toEqual([{ team: 'opp', type: 'OPP_SCORE', points }])
  })
  it('points manquants', () => {
    expect(error('adversaire')).toMatch(/adversaire plus deux/)
  })
})

describe('changements', () => {
  const sub = (inn: number, out: number) => ({ team: 'us', type: 'SUB', playerId: `p${inn}`, outPlayerId: `p${out}` })
  it('formes acceptées', () => {
    expect(ok('8 remplace 12')).toEqual([sub(8, 12)])
    expect(ok('changement : entre le 8, sort le 12')).toEqual([sub(8, 12)])
    expect(ok('sort 12 entre 8')).toEqual([sub(8, 12)])
    expect(ok('8 entre 12 sort')).toEqual([sub(8, 12)])
    expect(ok('changement 8 pour 12')).toEqual([sub(8, 12)])
    expect(ok('8 remplace 12 et 5 remplace le 4')).toEqual([sub(8, 12), sub(5, 4)])
  })
  it('refuse les changements impossibles', () => {
    expect(error('7 remplace 12')).toMatch(/déjà sur le terrain/)
    expect(error('8 remplace 5')).toMatch(/pas sur le terrain/)
    expect(error('changement')).toMatch(/non compris/)
  })
})

describe('points représentatifs des zones', () => {
  it.each(ZONE_IDS)('%s', (zone) => {
    const { x, y } = ZONE_ANCHORS[zone]
    expect(detectZone(x, y)).toBe(zone)
    expect(isThreePoint(x, y)).toBe(ZONES[zone].points === 3)
  })
})

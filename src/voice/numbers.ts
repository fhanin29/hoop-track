const UNITS: Record<string, number> = {
  zero: 0, un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
}
const TENS: Record<string, number> = { vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 }

/** Lit un nombre de 0 à 99 écrit en lettres à partir de `i`. Renvoie la valeur et le nombre de mots consommés. */
function readNumber(t: string[], i: number): { value: number; length: number } | null {
  const unit = (k: number) => UNITS[t[k]]
  /** 1-9, ou 10-19 si `teens` (soixante-dix, quatre-vingt-dix) */
  const tail = (k: number, teens: boolean): { value: number; length: number } => {
    const u = unit(k)
    if (u === undefined || u === 0) return { value: 0, length: 0 }
    if (u === 10 && teens && unit(k + 1) >= 7 && unit(k + 1) <= 9) return { value: 10 + unit(k + 1), length: 2 }
    if (u >= 10 && !teens) return { value: 0, length: 0 }
    return { value: u, length: 1 }
  }

  if (t[i] === 'quatre' && TENS[t[i + 1]] === 20) {
    const rest = tail(i + 2, true)
    return { value: 80 + rest.value, length: 2 + rest.length }
  }
  const tens = TENS[t[i]]
  if (tens !== undefined) {
    const et = t[i + 1] === 'et' && (t[i + 2] === 'un' || (tens === 60 && t[i + 2] === 'onze')) ? 1 : 0
    const rest = tail(i + 1 + et, tens === 60)
    if (et && !rest.length) return { value: tens, length: 1 }
    return { value: tens + rest.value, length: 1 + et + rest.length }
  }
  const u = unit(i)
  if (u === undefined) return null
  if (u === 10 && unit(i + 1) >= 7 && unit(i + 1) <= 9) return { value: 10 + unit(i + 1), length: 2 }
  return { value: u, length: 1 }
}

/** Remplace les nombres en lettres par des chiffres : « vingt et un » → « 21 ». */
export function wordsToDigits(tokens: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < tokens.length; ) {
    const n = readNumber(tokens, i)
    if (n) {
      out.push(String(n.value))
      i += n.length
    } else {
      out.push(tokens[i])
      i++
    }
  }
  return out
}

/** Mots souvent entendus à la place d'un numéro, utilisés uniquement en début de phrase. */
export const NUMBER_HOMOPHONES: Record<string, number> = {
  hein: 1, de: 2, deu: 2, troie: 3, cat: 4, sain: 5, saint: 5, sein: 5, scie: 6, si: 6,
  cette: 7, cet: 7, set: 7, sete: 7, neuve: 9, dis: 10, dit: 10, onz: 11, douce: 12,
}

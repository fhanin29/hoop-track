export type ClipStatus = 'pending' | 'done' | 'error'

/** Phrase dictée pendant un match, avec le contexte de l'instant où elle a été enregistrée */
export interface VoiceClip {
  id: string
  gameId: string
  createdAt: number
  period: number
  clockMs?: number
  /** Joueurs sur le terrain au moment de la dictée */
  onCourtIds: string[]
  audio: Blob
  status: ClipStatus
  /** Texte transcrit (ou corrigé à la main) */
  text?: string
  error?: string
  eventIds?: string[]
}

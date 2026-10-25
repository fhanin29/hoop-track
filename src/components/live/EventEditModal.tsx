import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { GameEvent, Player } from '../../domain/types'
import { describeEvent, playerName } from '../../domain/types'
import { Button, Jersey, Modal, Segmented, cn } from '../ui'

export function EventEditModal({
  event,
  roster,
  players,
  onClose,
  onSave,
  onDelete,
}: {
  event: GameEvent
  roster: string[]
  players: Map<string, Player>
  onClose: () => void
  onSave: (changes: Partial<GameEvent>) => void
  onDelete: () => void
}) {
  const [playerId, setPlayerId] = useState(event.playerId)
  const [made, setMade] = useState(!!event.made)
  const [points, setPoints] = useState(event.points ?? 2)

  const isShot = event.type === 'SHOT'
  const isFT = event.type === 'FT'
  const isOpp = event.type === 'OPP_SCORE'
  const isSub = event.type === 'SUB'
  const editable = !isSub

  const save = () => {
    const changes: Partial<GameEvent> = {}
    if (!isOpp && playerId !== event.playerId) changes.playerId = playerId
    if ((isShot || isFT) && made !== event.made) changes.made = made
    if ((isShot || isOpp) && points !== event.points) changes.points = points
    onSave(changes)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Modifier : ${describeEvent(event)}`}
      footer={
        <>
          <Button variant="danger" onClick={onDelete} className="mr-auto">
            <Trash2 size={18} /> Supprimer
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          {editable && (
            <Button variant="primary" onClick={save}>
              Enregistrer
            </Button>
          )}
        </>
      }
    >
      {isSub && <p className="text-slate-300">Un remplacement ne peut pas être modifié, seulement supprimé.</p>}
      {(isShot || isFT) && (
        <div className="mb-4 flex flex-wrap gap-3">
          <Segmented
            value={made ? 'ok' : 'ko'}
            onChange={(v) => setMade(v === 'ok')}
            options={[
              { value: 'ok', label: 'Réussi' },
              { value: 'ko', label: 'Raté' },
            ]}
          />
          {isShot && (
            <Segmented
              value={points}
              onChange={setPoints}
              options={[
                { value: 2, label: '2 pts' },
                { value: 3, label: '3 pts' },
              ]}
            />
          )}
        </div>
      )}
      {isOpp && (
        <Segmented
          value={points}
          onChange={setPoints}
          options={[1, 2, 3].map((v) => ({ value: v, label: `+${v}` }))}
        />
      )}
      {editable && !isOpp && (
        <>
          <h3 className="mb-2 text-sm font-semibold text-slate-400">Joueur</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {roster.map((id) => {
              const p = players.get(id)
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPlayerId(id)}
                  className={cn(
                    'flex min-h-14 items-center gap-2 rounded-xl border px-2 text-left text-sm',
                    playerId === id ? 'border-team bg-team/20 ring-2 ring-team' : 'border-slate-700 bg-slate-800/70',
                  )}
                >
                  <Jersey number={p?.number ?? '?'} className="h-8 w-8 text-sm" />
                  <span className="truncate font-medium">{p ? playerName(p) : '?'}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </Modal>
  )
}

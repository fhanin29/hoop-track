import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ChevronRight, Pencil, Plus, Trash2, UserPlus, Users } from 'lucide-react'
import { POSITIONS, playerName, type Player, type Position } from '../domain/types'
import { fmt1, perGame, reb } from '../domain/stats'
import { deletePlayer, playerHasEvents, savePlayer } from '../db/repo'
import { usePlayers, useSeason, useSeasonStats } from '../hooks/data'
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Jersey, Modal, PageHeader, Select, Spinner, Toggle } from '../components/ui'
import { toast } from '../components/toast'

type Draft = { id?: string; firstName: string; lastName: string; number: string; position: Position | ''; active: boolean }

const emptyDraft = (): Draft => ({ firstName: '', lastName: '', number: '', position: '', active: true })

export function PlayerForm({ draft, onChange, error }: { draft: Draft; onChange: (d: Draft) => void; error?: string }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Numéro">
        <Input
          inputMode="numeric"
          autoFocus
          value={draft.number}
          maxLength={2}
          onChange={(e) => onChange({ ...draft, number: e.target.value.replace(/\D/g, '') })}
          placeholder="ex. 7"
        />
      </Field>
      <Field label="Poste">
        <Select value={draft.position} onChange={(e) => onChange({ ...draft, position: e.target.value as Position | '' })}>
          <option value="">—</option>
          {Object.entries(POSITIONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Prénom">
        <Input value={draft.firstName} onChange={(e) => onChange({ ...draft, firstName: e.target.value })} autoCapitalize="words" />
      </Field>
      <Field label="Nom">
        <Input value={draft.lastName} onChange={(e) => onChange({ ...draft, lastName: e.target.value })} autoCapitalize="words" />
      </Field>
      <div className="col-span-2">
        <Toggle checked={draft.active} onChange={(active) => onChange({ ...draft, active })} label="Joueur actif (proposé dans les convocations)" />
      </div>
      {error && <p className="col-span-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
    </div>
  )
}

export default function Players() {
  const season = useSeason()
  const players = usePlayers(season?.id)
  const stats = useSeasonStats(season?.id)
  const [params, setParams] = useSearchParams()
  const [draft, setDraft] = useState<Draft | null>(() => (params.has('nouveau') ? emptyDraft() : null))
  const [error, setError] = useState<string>()
  const [toDelete, setToDelete] = useState<{ player: Player; hasEvents: boolean } | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => {
    const editId = params.get('modifier')
    if (editId && players) {
      const p = players.find((x) => x.id === editId)
      if (p) open(p)
    }
    if (params.has('nouveau') || (editId && players)) setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, players])

  if (!season || !players) return <Spinner />

  function open(p?: Player) {
    setError(undefined)
    setDraft(
      p
        ? { id: p.id, firstName: p.firstName, lastName: p.lastName, number: String(p.number), position: p.position ?? '', active: p.active }
        : emptyDraft(),
    )
  }

  const save = async (andNew = false) => {
    if (!draft) return
    const number = Number(draft.number)
    if (draft.number === '' || number < 0 || number > 99) return setError('Indiquez un numéro entre 0 et 99.')
    if (!draft.firstName.trim() && !draft.lastName.trim()) return setError('Indiquez au moins un prénom ou un nom.')
    const clash = players.find((p) => p.number === number && p.id !== draft.id && p.active)
    if (clash && draft.active) return setError(`Le n°${number} est déjà porté par ${playerName(clash)}.`)
    await savePlayer({
      id: draft.id,
      seasonId: season.id,
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      number,
      position: draft.position || undefined,
      active: draft.active,
    })
    toast(draft.id ? 'Joueur modifié' : `#${number} ${draft.firstName} ajouté`)
    if (andNew) {
      setDraft(emptyDraft())
      setError(undefined)
    } else setDraft(null)
  }

  const askDelete = async (player: Player) => {
    setDraft(null)
    setToDelete({ player, hasEvents: await playerHasEvents(player.id) })
  }

  const visible = players.filter((p) => showInactive || p.active)
  const inactiveCount = players.filter((p) => !p.active).length

  return (
    <>
      <PageHeader
        title="Joueurs"
        subtitle={`${players.filter((p) => p.active).length} joueurs actifs · ${season.teamName}`}
        actions={
          <Button variant="primary" onClick={() => open()}>
            <Plus size={20} /> Ajouter un joueur
          </Button>
        }
      />

      {players.length === 0 ? (
        <EmptyState icon={<Users size={48} />} title="Aucun joueur pour l’instant">
          Ajoutez les joueurs de votre équipe pour pouvoir les convoquer et saisir leurs statistiques.
          <div className="mt-4">
            <Button variant="primary" onClick={() => open()}>
              <UserPlus size={20} /> Ajouter le premier joueur
            </Button>
          </div>
        </EmptyState>
      ) : (
        <>
          <div className="scrollbar-thin overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-left">
              <thead className="bg-slate-900 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-3 sm:px-4">Joueur</th>
                  <th className="hidden px-2 py-3 sm:table-cell">Poste</th>
                  <th className="hidden px-2 py-3 text-right sm:table-cell">MJ</th>
                  <th className="px-2 py-3 text-right">PTS</th>
                  <th className="px-2 py-3 text-right">REB</th>
                  <th className="px-2 py-3 text-right">PD</th>
                  <th className="px-2 py-3 pr-3 text-right sm:pr-2">ÉVAL</th>
                  <th className="hidden w-28 sm:table-cell" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {visible.map((p) => {
                  const s = stats?.players.get(p.id)
                  const avg = (v: number) => (s ? fmt1(perGame(v, s.gp)) : '–')
                  return (
                    <tr key={p.id} className="bg-slate-950 transition hover:bg-slate-900">
                      <td className="px-3 py-2 sm:px-4">
                        <Link to={`/joueurs/${p.id}`} className="flex items-center gap-2 sm:gap-3">
                          <Jersey number={p.number} muted={!p.active} />
                          <span className="text-sm font-semibold leading-tight sm:text-base">{playerName(p)}</span>
                          {!p.active && <Badge className="max-sm:hidden">Inactif</Badge>}
                        </Link>
                      </td>
                      <td className="hidden px-2 text-slate-400 sm:table-cell">{p.position ? POSITIONS[p.position] : '–'}</td>
                      <td className="hidden px-2 text-right tabular-nums text-slate-400 sm:table-cell">{s?.gp ?? 0}</td>
                      <td className="px-2 text-right font-bold tabular-nums">{avg(s?.totals.pts ?? 0)}</td>
                      <td className="px-2 text-right tabular-nums">{s ? avg(reb(s.totals)) : '–'}</td>
                      <td className="px-2 text-right tabular-nums">{avg(s?.totals.ast ?? 0)}</td>
                      <td className="px-2 pr-3 text-right tabular-nums sm:pr-2">{avg(s?.evalTotal ?? 0)}</td>
                      <td className="hidden px-2 sm:table-cell">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" aria-label={`Modifier ${playerName(p)}`} onClick={() => open(p)}>
                            <Pencil size={18} />
                          </Button>
                          <Link to={`/joueurs/${p.id}`}>
                            <Button size="sm" variant="ghost" aria-label="Voir la fiche">
                              <ChevronRight size={20} />
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-slate-500">Moyennes par match joué (matchs suivis en direct).</p>
          {inactiveCount > 0 && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowInactive((v) => !v)}>
              {showInactive ? 'Masquer' : 'Afficher'} les joueurs inactifs ({inactiveCount})
            </Button>
          )}
        </>
      )}

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Modifier le joueur' : 'Nouveau joueur'}
        footer={
          <>
            {draft?.id && (
              <Button variant="ghost" className="mr-auto text-red-400" onClick={() => askDelete(players.find((p) => p.id === draft.id)!)}>
                <Trash2 size={18} /> Supprimer
              </Button>
            )}
            {!draft?.id && (
              <Button variant="secondary" onClick={() => save(true)}>
                Enregistrer et ajouter
              </Button>
            )}
            <Button variant="primary" onClick={() => save()}>
              Enregistrer
            </Button>
          </>
        }
      >
        {draft && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <PlayerForm draft={draft} onChange={setDraft} error={error} />
            <button type="submit" hidden />
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        danger
        title="Supprimer le joueur ?"
        confirmLabel="Supprimer définitivement"
        message={
          toDelete?.hasEvents ? (
            <>
              <strong>{toDelete && playerName(toDelete.player)}</strong> a des statistiques enregistrées. La suppression les rendra
              anonymes dans les matchs passés. Préférez le rendre <strong>inactif</strong> pour conserver son historique.
            </>
          ) : (
            <>Supprimer {toDelete && playerName(toDelete.player)} ?</>
          )
        }
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) await deletePlayer(toDelete.player.id)
          setToDelete(null)
          toast('Joueur supprimé', { tone: 'info' })
        }}
      />
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Check, Database, Download, HardDrive, Plus, RotateCcw, Trash2, Upload } from 'lucide-react'
import type { Season } from '../domain/types'
import { createSeason, defaultSeasonName, deleteSeason, ensureActiveSeason, exportBackup, importBackup, resetAll, setSetting, updateSeason } from '../db/repo'
import { seedDemoSeason } from '../db/demo'
import { useSeason, useSeasons, useSettings } from '../hooks/data'
import { download } from '../lib/export'
import { Badge, Button, Card, ConfirmDialog, Field, Input, Modal, PageHeader, Segmented, Spinner, Toggle, cn } from '../components/ui'
import { toast } from '../components/toast'

const COLORS = ['#f97316', '#ef4444', '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899', '#94a3b8']

export default function Settings() {
  const season = useSeason()
  const seasons = useSeasons()
  const settings = useSettings()
  const [newSeason, setNewSeason] = useState(false)
  const [confirm, setConfirm] = useState<{ kind: 'reset' } | { kind: 'import'; data: unknown } | { kind: 'delete'; season: Season } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [storage, setStorage] = useState<{ usage?: number; persisted?: boolean }>({})

  useEffect(() => {
    ;(async () => {
      const est = await navigator.storage?.estimate?.()
      const persisted = await navigator.storage?.persisted?.()
      setStorage({ usage: est?.usage, persisted })
    })()
  }, [])

  if (!season) return <Spinner />

  const exportJson = async () => {
    const data = await exportBackup()
    download(`hoop-track-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), 'application/json')
    toast('Sauvegarde téléchargée')
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setConfirm({ kind: 'import', data: JSON.parse(await file.text()) })
    } catch {
      toast("Fichier illisible : ce n'est pas un fichier JSON.", { tone: 'error' })
    }
  }

  const doImport = async (data: unknown) => {
    setConfirm(null)
    try {
      await importBackup(data)
      await ensureActiveSeason()
      toast('Sauvegarde restaurée')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import impossible', { tone: 'error' })
    }
  }

  const doReset = async () => {
    setConfirm(null)
    await resetAll()
    await ensureActiveSeason()
    toast('Toutes les données ont été effacées', { tone: 'info' })
  }

  const loadDemo = async () => {
    const s = await createSeason('Saison de démonstration')
    await seedDemoSeason(s)
    toast('Saison de démonstration créée et activée')
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="Réglages" />

      <div className="space-y-5">
        <Card title="Équipe">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom de l'équipe">
              <Input key={`t-${season.id}`} defaultValue={season.teamName} onBlur={(e) => e.target.value.trim() && updateSeason(season.id, { teamName: e.target.value.trim() })} />
            </Field>
            <Field label="Nom de la saison">
              <Input key={`s-${season.id}`} defaultValue={season.name} onBlur={(e) => e.target.value.trim() && updateSeason(season.id, { name: e.target.value.trim() })} />
            </Field>
          </div>
          <div className="mt-4">
            <span className="mb-2 block text-sm font-medium text-slate-400">Couleur de l'équipe</span>
            <div className="flex flex-wrap items-center gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Couleur ${c}`}
                  onClick={() => updateSeason(season.id, { color: c })}
                  className={cn('flex h-11 w-11 items-center justify-center rounded-xl transition active:scale-95', season.color === c && 'ring-2 ring-white ring-offset-2 ring-offset-slate-900')}
                  style={{ background: c }}
                >
                  {season.color === c && <Check size={20} className="text-white" />}
                </button>
              ))}
              <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-700 px-3 text-sm text-slate-300">
                Autre
                <input type="color" value={season.color} onChange={(e) => updateSeason(season.id, { color: e.target.value })} className="h-7 w-9 cursor-pointer bg-transparent" />
              </label>
            </div>
          </div>
        </Card>

        <Card
          title="Saisons"
          action={
            <Button size="sm" onClick={() => setNewSeason(true)}>
              <Plus size={16} /> Nouvelle saison
            </Button>
          }
        >
          <ul className="divide-y divide-slate-800">
            {seasons.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <span className="h-4 w-4 rounded-full" style={{ background: s.color }} />
                <span className="flex-1">
                  <span className="font-semibold">{s.name}</span> <span className="text-slate-400">· {s.teamName}</span>
                </span>
                {s.id === season.id ? (
                  <Badge tone="team">Active</Badge>
                ) : (
                  <>
                    <Button size="sm" onClick={() => setSetting('activeSeasonId', s.id).then(() => toast(`${s.name} activée`))}>
                      Activer
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Supprimer ${s.name}`} onClick={() => setConfirm({ kind: 'delete', season: s })}>
                      <Trash2 size={16} />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Matchs (valeurs par défaut)">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Format">
              <Segmented
                className="w-full"
                value={settings.defaultPeriods}
                onChange={(v) => setSetting('defaultPeriods', v)}
                options={[
                  { value: 4, label: '4 quarts-temps' },
                  { value: 2, label: '2 mi-temps' },
                ]}
              />
            </Field>
            <Field label="Durée d'une période (minutes)">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={40}
                defaultValue={settings.defaultPeriodLength}
                key={settings.defaultPeriodLength}
                onBlur={(e) => {
                  const v = Number(e.target.value)
                  if (v >= 1 && v <= 40) setSetting('defaultPeriodLength', v)
                }}
              />
            </Field>
          </div>
          <div className="mt-2 divide-y divide-slate-800">
            <Toggle checked={settings.defaultClockEnabled} onChange={(v) => setSetting('defaultClockEnabled', v)} label="Suivre le chrono par défaut (temps de jeu des joueurs)" />
            <Toggle checked={settings.vibration} onChange={(v) => setSetting('vibration', v)} label="Vibration à chaque saisie pendant le match" />
          </div>
        </Card>

        <Card title="Données">
          <p className="mb-4 text-sm text-slate-400">
            Les données sont enregistrées uniquement sur cette tablette. Pensez à faire une sauvegarde régulièrement (par exemple après chaque match).
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={exportJson}>
              <Download size={18} /> Sauvegarder (fichier JSON)
            </Button>
            <Button onClick={() => fileRef.current?.click()}>
              <Upload size={18} /> Restaurer une sauvegarde
            </Button>
            <Button onClick={loadDemo}>
              <Database size={18} /> Créer une saison de démonstration
            </Button>
            <Button variant="danger" onClick={() => setConfirm({ kind: 'reset' })}>
              <RotateCcw size={18} /> Tout effacer
            </Button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <HardDrive size={16} />
            {storage.usage !== undefined && `${(storage.usage / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo utilisés · `}
            {storage.persisted ? 'stockage persistant activé' : 'stockage non persistant (installez l\u2019app pour le sécuriser)'}
          </div>
        </Card>

        <p className="pb-6 text-center text-xs text-slate-600">Hoop Track · version {__APP_VERSION__}</p>
      </div>

      {newSeason && <NewSeasonModal onClose={() => setNewSeason(false)} current={season} />}

      <ConfirmDialog
        open={confirm?.kind === 'reset'}
        title="Tout effacer ?"
        message="Toutes les saisons, joueurs, matchs et statistiques seront définitivement supprimés de cette tablette. Faites une sauvegarde avant si besoin."
        confirmLabel="Tout effacer"
        danger
        onConfirm={doReset}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === 'import'}
        title="Restaurer la sauvegarde ?"
        message="Les données actuelles seront remplacées par celles du fichier."
        confirmLabel="Restaurer"
        danger
        onConfirm={() => confirm?.kind === 'import' && doImport(confirm.data)}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        title="Supprimer la saison ?"
        message={confirm?.kind === 'delete' ? `« ${confirm.season.name} » ainsi que ses joueurs, matchs et statistiques seront supprimés.` : ''}
        confirmLabel="Supprimer"
        danger
        onConfirm={async () => {
          if (confirm?.kind !== 'delete') return
          await deleteSeason(confirm.season.id)
          setConfirm(null)
          toast('Saison supprimée', { tone: 'info' })
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

function nextSeasonName(current: string): string {
  const m = current.match(/(\d{4})\s*[-/]\s*(\d{2,4})/)
  if (!m) return defaultSeasonName()
  const y = Number(m[1]) + 1
  return current.replace(m[0], `${y}-${y + 1}`)
}

function NewSeasonModal({ onClose, current }: { onClose: () => void; current: Season }) {
  const [name, setName] = useState(() => nextSeasonName(current.name))
  const [copy, setCopy] = useState(true)

  const create = async () => {
    if (!name.trim()) return
    await createSeason(name.trim(), copy ? current : undefined)
    onClose()
    toast(`${name.trim()} créée et activée`)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouvelle saison"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={create} disabled={!name.trim()}>
            Créer
          </Button>
        </>
      }
    >
      <Field label="Nom">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <div className="mt-2">
        <Toggle checked={copy} onChange={setCopy} label={`Reprendre l'équipe et les joueurs actifs de « ${current.name} »`} />
      </div>
      <p className="mt-2 text-sm text-slate-500">La saison actuelle reste consultable : vous pourrez la réactiver à tout moment.</p>
    </Modal>
  )
}

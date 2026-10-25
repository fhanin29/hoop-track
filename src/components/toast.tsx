import { create } from 'zustand'
import { CheckCircle2, Info, Undo2, XCircle } from 'lucide-react'
import { cn } from './ui'

export interface ToastItem {
  id: number
  message: string
  tone: 'success' | 'error' | 'info'
  action?: { label: string; onClick: () => void }
}

interface ToastStore {
  toasts: ToastItem[]
  show: (message: string, opts?: { tone?: ToastItem['tone']; action?: ToastItem['action']; duration?: number }) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToast = create<ToastStore>((set, get) => ({
  toasts: [],
  show: (message, opts = {}) => {
    const id = nextId++
    const toast: ToastItem = { id, message, tone: opts.tone ?? 'success', action: opts.action }
    // Une seule notification d'action à la fois pour rester lisible pendant la saisie
    set({ toasts: [...get().toasts.slice(-1), toast] })
    setTimeout(() => get().dismiss(id), opts.duration ?? 4000)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))

export const toast = (...args: Parameters<ToastStore['show']>) => useToast.getState().show(...args)

/** `inline` : affiché dans le conteneur parent (écran live) pour ne pas masquer les boutons de saisie */
export function Toaster({ inline = false }: { inline?: boolean }) {
  const { toasts, dismiss } = useToast()
  return (
    <div
      className={cn(
        'pointer-events-none flex flex-col gap-2',
        inline ? 'absolute inset-x-4 bottom-4 z-10 items-center' : 'fixed bottom-4 left-1/2 z-[60] w-full max-w-md -translate-x-1/2 px-4',
      )}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur animate-pop',
            t.tone === 'success' && 'border-emerald-500/30 bg-slate-900/95',
            t.tone === 'error' && 'border-red-500/40 bg-red-950/95',
            t.tone === 'info' && 'border-slate-700 bg-slate-900/95',
          )}
        >
          {t.tone === 'success' && <CheckCircle2 className="shrink-0 text-emerald-400" size={20} />}
          {t.tone === 'error' && <XCircle className="shrink-0 text-red-400" size={20} />}
          {t.tone === 'info' && <Info className="shrink-0 text-sky-400" size={20} />}
          <span className="flex-1 font-medium">{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action!.onClick()
                dismiss(t.id)
              }}
              className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-sm font-bold text-amber-300 hover:bg-slate-700"
            >
              <Undo2 size={16} /> {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

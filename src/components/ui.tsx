import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import clsx from 'clsx'
import { X } from 'lucide-react'

export const cn = clsx

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-team text-white hover:brightness-110 shadow-lg shadow-team/20',
  secondary: 'bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700',
  ghost: 'bg-transparent text-slate-300 hover:bg-slate-800',
  danger: 'bg-red-600 text-white hover:bg-red-500',
  success: 'bg-emerald-600 text-white hover:bg-emerald-500',
}
const sizes: Record<Size, string> = {
  sm: 'h-10 px-3 text-sm gap-1.5',
  md: 'h-12 px-4 text-base gap-2',
  lg: 'h-14 px-6 text-lg gap-2',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-xl font-semibold transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
        variants[variant],
        sizes[size],
        className,
      )}
    />
  )
}

export function Card({ className, children, title, action }: { className?: string; children: ReactNode; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cn('rounded-2xl border border-slate-800 bg-slate-900/70 p-4', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'flex max-h-[92vh] w-full flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl animate-pop',
          wide ? 'max-w-3xl' : 'max-w-lg',
        )}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" aria-label="Fermer" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800">
            <X size={22} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-slate-300">{message}</div>
    </Modal>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

const inputCls =
  'h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-slate-100 outline-none transition focus:border-team focus:ring-2 focus:ring-team/30'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputCls, props.className)} />
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={cn('inline-flex rounded-xl border border-slate-700 bg-slate-950 p-1', className)}>
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-10 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition',
            o.value === value ? 'bg-team text-white' : 'text-slate-400 hover:text-slate-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-12 w-full items-center justify-between gap-4 text-left">
      <span className="text-slate-200">{label}</span>
      <span className={cn('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-team' : 'bg-slate-700')}>
        <span className={cn('absolute top-1 h-5 w-5 rounded-full bg-white transition-all', checked ? 'left-6' : 'left-1')} />
      </span>
    </button>
  )
}

export function Badge({ children, tone = 'slate', className }: { children: ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' | 'team' | 'blue'; className?: string }) {
  const tones = {
    slate: 'bg-slate-800 text-slate-300',
    green: 'bg-emerald-500/15 text-emerald-400',
    red: 'bg-red-500/15 text-red-400',
    amber: 'bg-amber-500/15 text-amber-400',
    team: 'bg-team/15 text-team',
    blue: 'bg-sky-500/15 text-sky-400',
  }
  return <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold', tones[tone], className)}>{children}</span>
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-700 px-6 py-14 text-center">
      <div className="text-slate-500">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <div className="max-w-md text-slate-400">{children}</div>}
    </div>
  )
}

export function StatTile({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={cn('mt-1 text-3xl font-extrabold tabular-nums', accent && 'text-team')}>{value}</div>
      {sub && <div className="mt-0.5 text-sm text-slate-500">{sub}</div>}
    </div>
  )
}

export function Jersey({ number, className, muted }: { number: number | string; className?: string; muted?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-black tabular-nums',
        muted ? 'bg-slate-800 text-slate-400' : 'bg-team/15 text-team',
        className,
      )}
    >
      {number}
    </span>
  )
}

export function Spinner() {
  return <div className="flex h-40 items-center justify-center text-slate-500">Chargement…</div>
}

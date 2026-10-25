import { useEffect } from 'react'
import { NavLink, Outlet, Link, useMatch } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { BarChart3, CalendarDays, Home, Radio, Settings as SettingsIcon, Users } from 'lucide-react'
import { db } from '../db/db'
import { useSeason } from '../hooks/data'
import { Toaster } from './toast'
import { cn } from './ui'

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" className="fill-team" />
      <circle cx="32" cy="32" r="17" fill="none" stroke="white" strokeWidth="3.5" />
      <path d="M15 32h34M32 15v34M20 20c6 6 6 18 0 24M44 20c-6 6-6 18 0 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** Applique la couleur de l'équipe et affiche les notifications sur toutes les pages */
export function Root() {
  const season = useSeason()
  const isLive = useMatch('/matchs/:id/live')
  useEffect(() => {
    if (season?.color) document.documentElement.style.setProperty('--team-color', season.color)
  }, [season?.color])
  return (
    <>
      <Outlet />
      {!isLive && <Toaster />}
    </>
  )
}

const NAV = [
  { to: '/', label: 'Accueil', icon: Home, end: true },
  { to: '/joueurs', label: 'Joueurs', icon: Users },
  { to: '/matchs', label: 'Matchs', icon: CalendarDays },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
  { to: '/reglages', label: 'Réglages', icon: SettingsIcon },
]

export function Layout() {
  const season = useSeason()
  const liveGame = useLiveQuery(
    () => (season ? db.games.where('seasonId').equals(season.id).filter((g) => g.status === 'live').first() : undefined),
    [season?.id],
  )
  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Tablette / ordinateur : rail de navigation à gauche */}
      <nav className="no-print hidden w-24 shrink-0 flex-col items-center gap-1 border-r border-slate-800 bg-slate-950 py-4 md:flex">
        <Link to="/" className="mb-4" aria-label="Hoop Track">
          <Logo size={48} />
        </Link>
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex w-20 flex-col items-center gap-1 rounded-xl py-3 text-xs font-semibold transition',
                isActive ? 'bg-team/15 text-team' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200',
              )
            }
          >
            <Icon size={26} />
            {label}
          </NavLink>
        ))}
        {liveGame && (
          <Link
            to={`/matchs/${liveGame.id}/live`}
            className="mt-auto flex w-20 flex-col items-center gap-1 rounded-xl bg-red-600 py-3 text-xs font-bold text-white shadow-lg shadow-red-600/30"
          >
            <Radio size={24} className="animate-pulse" />
            En direct
          </Link>
        )}
      </nav>
      <main className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pt-[env(safe-area-inset-top)] md:pt-0">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
          <Outlet />
        </div>
      </main>
      {/* Smartphone : barre d'onglets en bas, à portée de pouce */}
      <nav className="no-print shrink-0 border-t border-slate-800 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Navigation principale">
        {liveGame && (
          <Link
            to={`/matchs/${liveGame.id}/live`}
            className="flex items-center justify-center gap-2 bg-red-600 py-2 text-sm font-bold text-white"
          >
            <Radio size={18} className="animate-pulse" />
            Match en direct : reprendre la saisie
          </Link>
        )}
        <div className="grid grid-cols-5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold',
                  isActive ? 'text-team' : 'text-slate-400 active:text-slate-200',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn('flex h-8 w-14 items-center justify-center rounded-full', isActive && 'bg-team/15')}>
                    <Icon size={22} />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

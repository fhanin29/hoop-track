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
    <div className="flex h-full">
      <nav className="no-print flex w-24 shrink-0 flex-col items-center gap-1 border-r border-slate-800 bg-slate-950 py-4">
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
      <main className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

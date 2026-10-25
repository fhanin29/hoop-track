const toDate = (iso: string) => new Date(iso.length <= 10 ? `${iso}T00:00` : iso)

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(toDate(iso))
}

export function formatDateTime(iso: string): string {
  const d = toDate(iso)
  const day = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${iso.slice(11, 16).replace(':', 'h')}`
}

export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(toDate(iso))
}

export function isUpcoming(iso: string): boolean {
  return toDate(iso).getTime() >= Date.now() - 3 * 3600_000
}

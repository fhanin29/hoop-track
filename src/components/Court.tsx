import { useId, useRef } from 'react'
import { COURT, CORNER_Y, WING_ANGLE } from '../domain/court'
import type { Shot, ZoneStat } from '../domain/stats'
import type { ZoneId } from '../domain/types'
import { ZONES } from '../domain/court'
import { cn } from './ui'

const { width: W, length: L, basketX: BX, basketY: BY, threeRadius: R3, cornerX: CX } = COURT
const PAINT_X = BX - COURT.paintWidth / 2

const THREE_PATH = `M ${CX} 0 L ${CX} ${CORNER_Y} A ${R3} ${R3} 0 0 0 ${W - CX} ${CORNER_Y} L ${W - CX} 0`
const INSIDE_THREE = `${THREE_PATH} Z`

function wedge(a1: number, a2: number, r = 40): string {
  const pts: number[][] = [[BX, BY]]
  for (let a = a1; a <= a2; a += 5) {
    const rad = (a * Math.PI) / 180
    pts.push([BX + Math.sin(rad) * r, BY + Math.cos(rad) * r])
  }
  return pts.map((p) => p.join(',')).join(' ')
}

const LEFT = wedge(-180, -WING_ANGLE)
const AXIS = wedge(-WING_ANGLE, WING_ANGLE)
const RIGHT = wedge(WING_ANGLE, 180)

const LABEL_POS: Record<ZoneId, [number, number, number?]> = {
  RAQ: [BX, 3.4],
  MI_G: [2.9, 3.7],
  MI_AXE: [BX, 7],
  MI_D: [W - 2.9, 3.7],
  C3_G: [0.45, 1.5, -90],
  A3_G: [2.3, 9.6],
  AXE3: [BX, 11.4],
  A3_D: [W - 2.3, 9.6],
  C3_D: [W - 0.45, 1.5, 90],
}

export function heatColor(stat: ZoneStat | undefined, zone: ZoneId): string {
  if (!stat || stat.att === 0) return 'rgba(51,65,85,0.25)'
  const p = stat.made / stat.att
  const [lo, hi] = ZONES[zone].points === 3 ? [0.2, 0.45] : zone === 'RAQ' ? [0.35, 0.65] : [0.25, 0.5]
  const t = Math.min(1, Math.max(0, (p - lo) / (hi - lo)))
  return `hsla(${Math.round(t * 130)}, 75%, 48%, 0.55)`
}

export interface CourtProps {
  onTap?: (x: number, y: number) => void
  shots?: Shot[]
  heat?: Record<ZoneId, ZoneStat>
  marker?: { x: number; y: number; three: boolean } | null
  className?: string
  showLabels?: boolean
  /** Alignement vertical du terrain dans son conteneur */
  align?: 'center' | 'top'
}

export function Court({ onTap, shots, heat, marker, className, showLabels = true, align = 'center' }: CourtProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const uid = useId().replace(/:/g, '')

  const handlePointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onTap || !svgRef.current) return
    const ctm = svgRef.current.getScreenCTM()
    if (!ctm) return
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    // Ignore les zones vides autour du terrain (marges de mise à l'échelle)
    if (pt.x < -0.3 || pt.x > W + 0.3 || pt.y < -0.3 || pt.y > L + 0.3) return
    onTap(Math.min(W, Math.max(0, pt.x)), Math.min(L, Math.max(0, pt.y)))
  }

  const line = { stroke: '#94a3b8', strokeWidth: 0.06, fill: 'none' } as const

  return (
    <svg
      ref={svgRef}
      viewBox={`-0.3 -0.3 ${W + 0.6} ${L + 0.6}`}
      preserveAspectRatio={align === 'top' ? 'xMidYMin meet' : 'xMidYMid meet'}
      className={cn('block h-full w-full touch-none select-none', onTap && 'cursor-crosshair', className)}
      onPointerDown={handlePointer}
      role={onTap ? 'button' : 'img'}
      aria-label={onTap ? 'Terrain : touchez la position du tir' : 'Terrain'}
      data-testid="court"
    >
      <defs>
        <clipPath id={`court-${uid}`}>
          <rect x={0} y={0} width={W} height={L} />
        </clipPath>
        <clipPath id={`inside-${uid}`}>
          <path d={INSIDE_THREE} />
        </clipPath>
        <linearGradient id={`floor-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e293b" />
          <stop offset="1" stopColor="#111827" />
        </linearGradient>
      </defs>

      <rect x={0} y={0} width={W} height={L} fill={`url(#floor-${uid})`} rx={0.1} />

      {heat ? (
        <g clipPath={`url(#court-${uid})`}>
          <polygon points={LEFT} fill={heatColor(heat.A3_G, 'A3_G')} />
          <polygon points={AXIS} fill={heatColor(heat.AXE3, 'AXE3')} />
          <polygon points={RIGHT} fill={heatColor(heat.A3_D, 'A3_D')} />
          <rect x={0} y={0} width={CX} height={CORNER_Y} fill="#111827" />
          <rect x={0} y={0} width={CX} height={CORNER_Y} fill={heatColor(heat.C3_G, 'C3_G')} />
          <rect x={W - CX} y={0} width={CX} height={CORNER_Y} fill="#111827" />
          <rect x={W - CX} y={0} width={CX} height={CORNER_Y} fill={heatColor(heat.C3_D, 'C3_D')} />
          <g clipPath={`url(#inside-${uid})`}>
            <rect x={0} y={0} width={W} height={L} fill="#111827" />
            <polygon points={LEFT} fill={heatColor(heat.MI_G, 'MI_G')} />
            <polygon points={AXIS} fill={heatColor(heat.MI_AXE, 'MI_AXE')} />
            <polygon points={RIGHT} fill={heatColor(heat.MI_D, 'MI_D')} />
          </g>
          <rect x={PAINT_X} y={0} width={COURT.paintWidth} height={COURT.paintLength} fill="#111827" />
          <rect x={PAINT_X} y={0} width={COURT.paintWidth} height={COURT.paintLength} fill={heatColor(heat.RAQ, 'RAQ')} />
          <g stroke="#0f172a" strokeWidth={0.05} strokeDasharray="0.2 0.15" fill="none">
            <polyline points={`${BX + Math.sin((-WING_ANGLE * Math.PI) / 180) * 40},${BY + Math.cos((-WING_ANGLE * Math.PI) / 180) * 40} ${BX},${BY} ${BX + Math.sin((WING_ANGLE * Math.PI) / 180) * 40},${BY + Math.cos((WING_ANGLE * Math.PI) / 180) * 40}`} />
          </g>
        </g>
      ) : (
        <rect x={PAINT_X} y={0} width={COURT.paintWidth} height={COURT.paintLength} className="fill-team/10" />
      )}

      {/* Lignes */}
      <rect x={0} y={0} width={W} height={L} {...line} />
      <rect x={PAINT_X} y={0} width={COURT.paintWidth} height={COURT.paintLength} {...line} />
      <circle cx={BX} cy={COURT.paintLength} r={COURT.ftRadius} {...line} />
      <path d={THREE_PATH} {...line} stroke="#cbd5e1" strokeWidth={0.08} />
      <path d={`M ${BX - COURT.restrictedRadius} ${BY} A ${COURT.restrictedRadius} ${COURT.restrictedRadius} 0 0 0 ${BX + COURT.restrictedRadius} ${BY}`} {...line} />
      <path d={`M ${BX - 1.8} ${L} A 1.8 1.8 0 0 1 ${BX + 1.8} ${L}`} {...line} />
      <line x1={BX - 0.9} y1={1.2} x2={BX + 0.9} y2={1.2} stroke="#e2e8f0" strokeWidth={0.1} />
      <circle cx={BX} cy={BY} r={0.225} fill="none" stroke="#f97316" strokeWidth={0.07} />

      {heat &&
        showLabels &&
        (Object.keys(LABEL_POS) as ZoneId[]).map((z) => {
          const [x, y, rot] = LABEL_POS[z]
          const s = heat[z]
          return (
            <g key={z} transform={`translate(${x} ${y}) ${rot ? `rotate(${rot})` : ''}`} className="pointer-events-none">
              <text textAnchor="middle" fontSize={rot ? 0.42 : 0.7} fontWeight={800} fill="#f8fafc" y={rot ? 0.15 : 0}>
                {s.att ? `${Math.round((s.made / s.att) * 100)}%` : '–'}
              </text>
              {!rot && (
                <text textAnchor="middle" fontSize={0.42} fill="#cbd5e1" y={0.6}>
                  {s.made}/{s.att}
                </text>
              )}
            </g>
          )
        })}

      {shots?.map((s, i) =>
        s.made ? (
          <circle key={i} cx={s.x} cy={s.y} r={0.2} fill="#22c55e" stroke="#052e16" strokeWidth={0.04} opacity={0.9} />
        ) : (
          <g key={i} stroke="#ef4444" strokeWidth={0.09} opacity={0.85} strokeLinecap="round">
            <line x1={s.x - 0.16} y1={s.y - 0.16} x2={s.x + 0.16} y2={s.y + 0.16} />
            <line x1={s.x - 0.16} y1={s.y + 0.16} x2={s.x + 0.16} y2={s.y - 0.16} />
          </g>
        ),
      )}

      {marker && (
        <g className="pointer-events-none">
          <circle cx={marker.x} cy={marker.y} r={0.55} className="fill-team/30 stroke-team" strokeWidth={0.08}>
            <animate attributeName="r" values="0.35;0.6;0.35" dur="1.2s" repeatCount="indefinite" />
          </circle>
          <circle cx={marker.x} cy={marker.y} r={0.15} className="fill-team" />
        </g>
      )}
    </svg>
  )
}

export function ShotLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-slate-400">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full bg-emerald-500" /> Réussi
      </span>
      <span className="flex items-center gap-1.5">
        <span className="font-black text-red-500">✕</span> Raté
      </span>
    </div>
  )
}

export function HeatLegend() {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <span>Faible</span>
      <span className="h-2.5 w-28 rounded-full" style={{ background: 'linear-gradient(90deg, hsl(0,75%,48%), hsl(60,75%,48%), hsl(130,75%,48%))' }} />
      <span>Élevé</span>
    </div>
  )
}

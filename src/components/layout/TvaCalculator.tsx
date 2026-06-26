import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calculator, X, Copy, Check, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ──────────────────────────────────────────────────────────────────────────
   Quick TVA Calculator — a self-contained floating window.

   - Draggable (by the title bar) and resizable (bottom-end handle).
   - Remembers last position AND size in localStorage.
   - Can stay open while navigating the ERP because it is mounted once in
     DashboardLayout and rendered through a portal on document.body.
   - Two modes: TTC -> HT and HT -> TTC, instant recalculation, copy result,
     Enter triggers calculation, French number formatting, negative guard.
   ────────────────────────────────────────────────────────────────────────── */

type Mode = 'ttc-ht' | 'ht-ttc'

interface WindowState {
  x: number
  y: number
  w: number
  h: number
}

const STORAGE_KEY = 'tva-calculator-window'
const OPEN_KEY = 'tva-calculator-open'
const MODE_KEY = 'tva-calculator-mode'

const MIN_W = 280
const MIN_H = 360
const DEFAULT_W = 320
const DEFAULT_H = 420

/** Format a number with 2 decimals using the French convention (comma). */
function formatFr(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/** Parse a user-typed string that may use a comma or a dot as decimal sep. */
function parseInput(value: string): number {
  if (!value) return NaN
  const normalised = value.replace(/\s/g, '').replace(',', '.')
  return Number(normalised)
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function loadWindowState(): WindowState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WindowState>
      const w = clamp(parsed.w ?? DEFAULT_W, MIN_W, window.innerWidth)
      const h = clamp(parsed.h ?? DEFAULT_H, MIN_H, window.innerHeight)
      const x = clamp(parsed.x ?? 0, 0, Math.max(0, window.innerWidth - w))
      const y = clamp(parsed.y ?? 0, 0, Math.max(0, window.innerHeight - h))
      return { x, y, w, h }
    }
  } catch {
    /* ignore corrupt storage */
  }
  // Default: top-end corner, just under the header.
  return {
    x: Math.max(0, window.innerWidth - DEFAULT_W - 24),
    y: 80,
    w: DEFAULT_W,
    h: DEFAULT_H,
  }
}

export function TvaCalculatorButton() {
  const [open, setOpen] = useState<boolean>(() => localStorage.getItem(OPEN_KEY) === 'true')

  const toggle = useCallback(() => setOpen((o) => !o), [])

  useEffect(() => {
    localStorage.setItem(OPEN_KEY, String(open))
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        title="Calculateur TVA"
        aria-label="Calculateur TVA"
        className={cn(
          'relative p-2 rounded-[10px] transition-all duration-200',
          open
            ? 'bg-emerald-500/10 text-emerald-400'
            : 'hover:bg-muted text-muted-foreground hover:text-popover-foreground',
        )}
      >
        <Calculator className="h-5 w-5" />
      </button>

      {open && <TvaCalculatorWindow onClose={() => setOpen(false)} />}
    </>
  )
}

function TvaCalculatorWindow({ onClose }: { onClose: () => void }) {
  const [win, setWin] = useState<WindowState>(() => loadWindowState())
  const [mode, setMode] = useState<Mode>(
    () => (localStorage.getItem(MODE_KEY) as Mode) || 'ttc-ht',
  )
  const [prix, setPrix] = useState('')
  const [tva, setTva] = useState('20')
  const [copied, setCopied] = useState(false)

  const winRef = useRef<WindowState>(win)
  winRef.current = win

  // Persist window geometry whenever it changes.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(win))
  }, [win])

  useEffect(() => {
    localStorage.setItem(MODE_KEY, mode)
  }, [mode])

  // ── Compute result (instant recalculation) ────────────────────────────
  const result = useMemo(() => {
    const prixVal = parseInput(prix)
    const tvaVal = parseInput(tva)

    if (!Number.isFinite(prixVal) || !Number.isFinite(tvaVal)) return null
    if (prixVal < 0 || tvaVal < 0) return { error: 'Les valeurs négatives ne sont pas autorisées.' as const }

    if (mode === 'ttc-ht') {
      const ht = prixVal / (1 + tvaVal / 100)
      const montantTva = prixVal - ht
      return {
        mainLabel: 'Prix HT',
        mainValue: ht,
        tvaValue: montantTva,
      }
    } else {
      const ttc = prixVal * (1 + tvaVal / 100)
      const montantTva = ttc - prixVal
      return {
        mainLabel: 'Prix TTC',
        mainValue: ttc,
        tvaValue: montantTva,
      }
    }
  }, [prix, tva, mode])

  const hasResult = result !== null && !('error' in result)

  const handleCopy = useCallback(() => {
    if (!result || 'error' in result) return
    const text =
      `${result.mainLabel}: ${formatFr(result.mainValue)}\n` +
      `Montant TVA: ${formatFr(result.tvaValue)}`
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [result])

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === 'Enter') e.preventDefault() // results are already live
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  // ── Dragging (title bar) ──────────────────────────────────────────────
  const dragRef = useRef<{ startX: number; startY: number; winX: number; winY: number } | null>(null)

  const onDragStart = useCallback((e: ReactPointerEvent) => {
    e.preventDefault()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      winX: winRef.current.x,
      winY: winRef.current.y,
    }
  }, [])

  const onDragMove = useCallback((e: ReactPointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setWin((prev) => ({
      ...prev,
      x: clamp(dragRef.current!.winX + dx, 0, window.innerWidth - prev.w),
      y: clamp(dragRef.current!.winY + dy, 0, window.innerHeight - prev.h),
    }))
  }, [])

  const onDragEnd = useCallback(() => {
    dragRef.current = null
  }, [])

  // ── Resizing (bottom-end handle) ──────────────────────────────────────
  const resizeRef = useRef<{ startX: number; startY: number; winW: number; winH: number } | null>(null)

  const onResizeStart = useCallback((e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      winW: winRef.current.w,
      winH: winRef.current.h,
    }
  }, [])

  const onResizeMove = useCallback((e: ReactPointerEvent) => {
    if (!resizeRef.current) return
    const dx = e.clientX - resizeRef.current.startX
    const dy = e.clientY - resizeRef.current.startY
    setWin((prev) => ({
      ...prev,
      w: clamp(resizeRef.current!.winW + dx, MIN_W, window.innerWidth - prev.x),
      h: clamp(resizeRef.current!.winH + dy, MIN_H, window.innerHeight - prev.y),
    }))
  }, [])

  const onResizeEnd = useCallback(() => {
    resizeRef.current = null
  }, [])

  // Keep the window on-screen if the viewport is resized.
  useEffect(() => {
    const onResize = () => {
      setWin((prev) => {
        const w = clamp(prev.w, MIN_W, window.innerWidth)
        const h = clamp(prev.h, MIN_H, window.innerHeight)
        return {
          w,
          h,
          x: clamp(prev.x, 0, Math.max(0, window.innerWidth - w)),
          y: clamp(prev.y, 0, Math.max(0, window.innerHeight - h)),
        }
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const priceLabel = mode === 'ttc-ht' ? 'Prix TTC' : 'Prix HT'

  return createPortal(
    <div
      role="dialog"
      aria-label="Calculateur TVA"
      dir="ltr"
      className="fixed z-[100] flex flex-col rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl animate-scale-in select-none"
      style={{ left: win.x, top: win.y, width: win.w, height: win.h }}
    >
      {/* ── Title bar (drag handle) ── */}
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        className="flex items-center gap-2 px-3 py-2.5 border-b border-border rounded-t-xl bg-muted/50 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground/60 shrink-0" />
        <Calculator className="h-4 w-4 text-emerald-500 shrink-0" />
        <span className="text-sm font-semibold truncate flex-1">Calculateur TVA</span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
          aria-label="Fermer"
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Body ── */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4"
        onKeyDown={handleKeyDown}
      >
        {/* Mode selector */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">Mode</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: 'ttc-ht', label: 'TTC → HT' },
                { id: 'ht-ttc', label: 'HT → TTC' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={cn(
                  'h-9 rounded-lg border text-sm font-medium transition-colors',
                  mode === m.id
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Inputs */}
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">{priceLabel}</span>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={prix}
              onChange={(e) => setPrix(e.target.value)}
              placeholder="0,00"
              className="h-10 w-full rounded-lg border-2 border-border/50 bg-muted/30 px-3 text-sm outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">TVA (%)</span>
            <input
              type="text"
              inputMode="decimal"
              value={tva}
              onChange={(e) => setTva(e.target.value)}
              placeholder="20"
              className="h-10 w-full rounded-lg border-2 border-border/50 bg-muted/30 px-3 text-sm outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>
        </div>

        {/* Result */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Résultat
            </span>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!hasResult}
              title="Copier le résultat"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copié' : 'Copier'}
            </button>
          </div>

          {result && 'error' in result ? (
            <p className="text-sm text-destructive">{result.error}</p>
          ) : hasResult ? (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">{result!.mainLabel}</span>
                <span className="text-lg font-bold tabular-nums">{formatFr(result!.mainValue)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Montant TVA</span>
                <span className="text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatFr(result!.tvaValue)}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/60">
              Saisissez un prix et un taux de TVA.
            </p>
          )}
        </div>
      </div>

      {/* ── Resize handle (bottom-end) ── */}
      <div
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none"
        aria-hidden
      >
        <svg viewBox="0 0 10 10" className="h-full w-full text-muted-foreground/40">
          <path d="M9 1 L9 9 L1 9" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M9 5 L5 9" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      </div>
    </div>,
    document.body,
  )
}

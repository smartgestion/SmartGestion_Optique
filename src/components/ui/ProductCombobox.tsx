import * as React from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface ProductComboboxProps {
  /** The list of products to choose from. */
  products: any[]
  /** Currently selected product id (as a string), or '' when nothing chosen. */
  value?: string
  /** Called with the chosen product id (string). */
  onValueChange: (value: string) => void
  /** Placeholder shown on the trigger when nothing is selected. */
  placeholder?: string
  /** Placeholder shown inside the search input. */
  searchPlaceholder?: string
  /** Text shown when the search yields no results. */
  emptyText?: string
  /** Renders the visible label of a product (trigger + list row). */
  renderLabel?: (product: any) => React.ReactNode
  /** Extra classes for the trigger button (height/border to match the form). */
  className?: string
  disabled?: boolean
}

/** Default product label: designation → nom → reference → '-'. */
const defaultRenderLabel = (p: any): React.ReactNode =>
  p?.designation || p?.nom || p?.reference || '-'

/** Lowercased haystack used for filtering a product row. */
const productHaystack = (p: any): string =>
  [p?.designation, p?.nom, p?.reference, p?.ref, p?.marque, p?.code_barre, p?.codeBarre]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

/**
 * Searchable product picker — a drop-in replacement for the plain
 * `<Select>` product dropdowns used across the document forms (Facture, Devis,
 * BL, Bon de commande, Avoirs). It keeps the same trigger look but adds a live
 * search box filtering by designation / nom / référence / marque / code-barre.
 */
export function ProductCombobox({
  products,
  value = '',
  onValueChange,
  placeholder = 'Choisir un produit...',
  searchPlaceholder = 'Rechercher un produit...',
  emptyText = 'Aucun produit trouvé',
  renderLabel = defaultRenderLabel,
  className,
  disabled = false,
}: ProductComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  const selected = React.useMemo(
    () => products.find((p) => p?.id?.toString() === value),
    [products, value],
  )

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) => productHaystack(p).includes(q))
  }, [products, query])

  // Focus the search input as soon as the popup opens; clear the query on close.
  React.useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 20)
      return () => clearTimeout(t)
    }
    setQuery('')
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          'flex w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-white px-3 py-2 text-sm shadow-sm outline-none transition-colors',
          'hover:bg-slate-50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'dark:bg-slate-950/50 dark:border-white/10 dark:hover:bg-slate-800/60 dark:text-white',
          'h-9',
          className,
        )}
      >
        <span className={cn('line-clamp-1 text-start', !selected && 'text-muted-foreground')}>
          {selected ? renderLabel(selected) : placeholder}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--anchor-width) min-w-[240px] p-0"
      >
        {/* Search box */}
        <div className="flex items-center gap-2 border-b border-slate-200/80 px-3 dark:border-white/10">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          />
        </div>

        {/* Results */}
        <div className="max-h-[280px] overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</div>
          ) : (
            filtered.map((p) => {
              const id = p?.id?.toString()
              const isActive = id === value
              return (
                <button
                  type="button"
                  key={id}
                  onClick={() => {
                    onValueChange(id)
                    setOpen(false)
                  }}
                  className={cn(
                    'relative flex w-full items-center gap-2 rounded-lg px-3 py-2 pe-8 text-start text-sm transition-colors',
                    'hover:bg-slate-100 dark:hover:bg-slate-700/70',
                    isActive && 'font-medium text-foreground',
                  )}
                >
                  <span className="line-clamp-1 flex-1">{renderLabel(p)}</span>
                  {isActive && <Check className="absolute end-2 size-4 text-primary" />}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

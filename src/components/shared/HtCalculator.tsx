import React, { useState } from 'react'
import { Calculator } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils'

interface HtCalculatorButtonProps {
  /**
   * Called with the computed "Prix HT" (already rounded to 2 decimals)
   * when the user clicks "Calculer". Use it to fill the corresponding
   * Prix HT field in the parent form.
   */
  onResult: (prixHt: number) => void
  /** Optional initial TVA (%) to prefill the popup (e.g. the line's current TVA). */
  defaultTva?: number
  /** Disable the button (e.g. when the row/field is read-only). */
  disabled?: boolean
  /** Extra classes for the trigger button. */
  className?: string
}

/**
 * A small calculator button that opens a popup to convert a TTC price to an
 * HT price using:  Prix HT = Prix TTC / (1 + TVA / 100)
 *
 * On "Calculer" it fills the parent field via `onResult` and closes the popup.
 */
export function HtCalculatorButton({
  onResult,
  defaultTva = 20,
  disabled,
  className,
}: HtCalculatorButtonProps) {
  const [open, setOpen] = useState(false)
  const [ttc, setTtc] = useState<string>('')
  const [tva, setTva] = useState<string>(
    Number.isFinite(defaultTva) ? String(defaultTva) : ''
  )

  // Live preview values (only valid when inputs are valid).
  const ttcNum = parseFloat(ttc)
  const tvaNum = parseFloat(tva)
  const inputsValid =
    Number.isFinite(ttcNum) &&
    ttcNum > 0 &&
    Number.isFinite(tvaNum) &&
    tvaNum >= 0

  const previewHt = inputsValid ? ttcNum / (1 + tvaNum / 100) : 0
  const previewTva = inputsValid ? ttcNum - previewHt : 0

  // Reset inputs each time the popup opens (keep TVA prefilled from the row).
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setTtc('')
      setTva(Number.isFinite(defaultTva) ? String(defaultTva) : '')
    }
    setOpen(next)
  }

  const handleCalculer = () => {
    // Validate inputs.
    if (ttc.trim() === '' || tva.trim() === '') {
      toast.error('Veuillez renseigner le Prix TTC et la TVA.')
      return
    }
    if (!Number.isFinite(ttcNum) || ttcNum <= 0) {
      toast.error('Le Prix TTC doit être un nombre supérieur à 0.')
      return
    }
    if (!Number.isFinite(tvaNum) || tvaNum < 0) {
      toast.error('La TVA ne peut pas être négative.')
      return
    }

    const prixHt = Math.round((ttcNum / (1 + tvaNum / 100)) * 100) / 100
    onResult(prixHt)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        disabled={disabled}
        onClick={() => handleOpenChange(true)}
        title="Calculer le Prix HT à partir du TTC"
        aria-label="Calculer le Prix HT à partir du TTC"
        className={className}
      >
        <Calculator className="h-4 w-4" />
      </Button>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Calcul TTC → HT</DialogTitle>
          <DialogDescription>
            Prix HT = Prix TTC / (1 + TVA / 100)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Prix TTC</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={ttc}
              onChange={(e) => setTtc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleCalculer()
                }
              }}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>TVA (%)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              placeholder="20"
              value={tva}
              onChange={(e) => setTva(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleCalculer()
                }
              }}
            />
          </div>

          {inputsValid && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prix HT</span>
                <span className="font-semibold" dir="ltr">
                  {formatCurrency(previewHt)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Montant TVA</span>
                <span className="font-semibold" dir="ltr">
                  {formatCurrency(previewTva)}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button type="button" onClick={handleCalculer}>
            <Calculator className="h-4 w-4" />
            Calculer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

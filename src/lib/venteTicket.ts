/**
 * Reusable walk-in-sale (vente passager) ticket printer.
 *
 * Extracted so both the Ventes Passagers page and the Ordre de Travail hub can
 * print the exact same cash-register ticket. The visual style is driven by the
 * user's ticket settings (Parametres → Apparence). Works in a normal browser
 * (popup) and in Tauri's WebView (hidden-iframe fallback).
 */
import { formatCurrency } from '@/lib/utils'
import { readTicketSettings, fontToFamily, sizeToPx } from '@/lib/ticketSettings'

export interface VenteTicketData {
  numero?: string
  date?: string
  montantHt?: number
  montantTva?: number
  montantTtc?: number
  lignes?: any[]
}

/** Minimal translate signature (matches i18next's `t`). */
type TFn = (key: string, fallback?: string) => string

const esc = (s: any) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const fmtDate = (d: any, lang: string): string => {
  if (!d) return ''
  try {
    const date = new Date(d)
    if (isNaN(date.getTime())) return String(d)
    return new Intl.DateTimeFormat(lang || 'fr', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
  } catch {
    return String(d)
  }
}

/** Build the ticket HTML string (also reusable for previews if needed). */
export function buildVenteTicketHtml(vente: VenteTicketData, t: TFn, lang = 'fr'): string {
  const settings = readTicketSettings()
  const fontFamily = fontToFamily(settings.font)
  const bodySizePx = sizeToPx(settings.size)
  const fontWeight = settings.weight === 'bold' ? 700 : 400

  const dateStr = fmtDate(vente.date, lang)
  const numStr = vente.numero || ''
  const isRtl = (lang || '').startsWith('ar')
  const htmlDir = isRtl ? 'rtl' : 'ltr'

  const lignes = Array.isArray(vente.lignes) ? vente.lignes : []
  const lineRows = lignes.length > 0
    ? lignes.map((l: any) => {
        const qte = Number(l.quantite ?? l.quantite ?? 1)
        const designation = l.designation || l.nom || l.reference || '-'
        const total = Number(
          l.montantTtc ?? l.montant_ttc ?? qte * (l.prixUnitaireTtc ?? l.prix_unitaire_ttc ?? l.prixUnitaireHt ?? l.prix_unitaire_ht ?? 0),
        )
        return `
          <div class="line-row">
            <span>${qte}x</span>
            <span class="desc">${esc(designation)}</span>
            <span class="total">${formatCurrency(total)}</span>
          </div>`
      }).join('')
    : `
        <div class="line-row">
          <span>1x</span>
          <span class="desc">—</span>
          <span class="total">${formatCurrency(vente.montantTtc || 0)}</span>
        </div>`

  const subtotal = (Number(vente.montantHt) || 0) + (Number(vente.montantTva) || 0)

  return `
    <html lang="${esc(lang)}" dir="${htmlDir}">
    <head>
      <title>Ticket ${esc(numStr)}</title>
      <style>
        @page { margin: 8mm; }
        * { box-sizing: border-box; }
        body { font-family: ${fontFamily}; font-size: ${bodySizePx}px; font-weight: ${fontWeight}; color: #000; padding: 12px; max-width: 320px; margin: 0 auto; line-height: 1.45; }
        .center { text-align: center; }
        .row { display: flex; justify-content: space-between; gap: 8px; }
        .strong { font-weight: 700; }
        .store-name { font-weight: 700; font-size: ${bodySizePx + 1}px; margin-bottom: 2px; }
        .divider { border-top: 1px dashed #000; margin: 8px 0; }
        .line-row { display: grid; grid-template-columns: 40px 1fr auto; column-gap: 8px; margin-top: 2px; }
        .line-row .desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .line-row .total { text-align: end; }
        .net-payable { font-weight: 700; font-size: ${bodySizePx + 1}px; display: flex; justify-content: space-between; align-items: baseline; }
        .logo { max-height: 56px; max-width: 140px; object-fit: contain; display: block; margin: 0 auto 6px; }
        .barcode { font-family: monospace; text-align: center; background: #f1f5f9; color: #475569; padding: 2px 24px; display: inline-block; margin-top: 8px; font-size: 10px; letter-spacing: 1px; }
        .signature { text-align: center; margin-top: 8px; font-size: ${bodySizePx - 1}px; color: #475569; }
      </style>
    </head>
    <body>
      ${settings.logoUrl ? `<img class="logo" src="${esc(settings.logoUrl)}" alt="" />` : ''}
      <div class="center">
        ${settings.storeName ? `<div class="store-name">${esc(settings.storeName)}</div>` : ''}
        ${settings.subtitle ? `<div>${esc(settings.subtitle)}</div>` : ''}
        ${settings.phone ? `<div>Tél: ${esc(settings.phone)}</div>` : ''}
        ${settings.address ? `<div>Adresse: ${esc(settings.address)}</div>` : ''}
      </div>
      <div class="divider"></div>
      <div><span>${esc(t('parametres.ticket.preview_date'))}: ${esc(dateStr)}</span>${numStr ? ` &nbsp; N°: ${esc(numStr)}` : ''}</div>
      <div class="divider"></div>
      <div class="line-row strong">
        <span>${esc(t('ventes.ticket_col_qty'))}</span>
        <span class="desc">${esc(t('ventes.ticket_col_desc'))}</span>
        <span class="total">${esc(t('ventes.ticket_col_total'))}</span>
      </div>
      ${lineRows}
      <div class="divider"></div>
      <div class="row"><span>${esc(t('ventes.ticket_subtotal'))}</span><span>${formatCurrency(subtotal)}</span></div>
      <div class="divider"></div>
      <div class="net-payable"><span>${esc(t('ventes.ticket_net_payable'))}</span><span>${formatCurrency(vente.montantTtc || 0)}</span></div>
      <div class="divider"></div>
      ${settings.footer ? `<div class="center">${esc(settings.footer)}</div>` : ''}
      <div class="center"><div class="barcode">||||| | ||||  || ||| | ||</div></div>
      ${settings.storeName ? `<div class="signature">*** ${esc(settings.storeName)} ***</div>` : ''}
      <script>window.onload = function () { window.print(); };</script>
    </body>
    </html>`
}

/** Print a vente ticket — popup in browsers, hidden iframe under Tauri. */
export function printVenteTicket(vente: VenteTicketData, t: TFn, lang = 'fr'): void {
  const html = buildVenteTicketHtml(vente, t, lang)
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
    return
  }
  // Tauri / popup-blocked fallback.
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(iframe)
  const cleanup = () => setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe) }, 1000)
  iframe.onload = () => {
    try {
      const cw = iframe.contentWindow
      if (!cw) { cleanup(); return }
      cw.addEventListener('afterprint', cleanup)
      cw.focus()
      cw.print()
    } catch {
      cleanup()
    }
  }
  const doc = iframe.contentWindow?.document
  if (doc) { doc.open(); doc.write(html); doc.close() }
}

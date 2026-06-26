import { forwardRef, useMemo, type CSSProperties } from 'react'
import { format, isValid, parseISO } from 'date-fns'
import { getDateLocale } from '@/lib/utils'
import { numberToFrenchWords } from '@/lib/numberToWords'
import { DOC_COLORS as C, formatTraitement } from './docColors'

/** Strict cap of products rendered per page for the simple layout. */
const ITEMS_PER_PAGE = 8

interface AvoirFournisseurDocumentProps {
  avoir: any
  entreprise: any
  /** BCP-47 language tag from i18n.language */
  lang?: string
}

const fmt2 = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)

const fmt2Money = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const safeNum = (v: any, fallback = 0): number => {
  if (v === null || v === undefined || v === '') return fallback
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return isNaN(n) ? fallback : n
}

const pickVal = (obj: any, ...keys: string[]) => {
  for (const k of keys) { const v = obj?.[k]; if (v !== null && v !== undefined) return v }
  return null
}

const pickNum = (obj: any, ...keys: string[]) => safeNum(pickVal(obj, ...keys))

const makeFmtDate = (lang?: string) => (d: any): string => {
  if (!d) return '-'
  try {
    let date: Date
    if (typeof d === 'string') {
      date = d.includes('T') || d.includes('-') ? parseISO(d) : new Date(d)
    } else if (d instanceof Date) {
      date = d
    } else {
      date = new Date(d)
    }
    return isValid(date) ? format(date, 'dd/MM/yyyy', { locale: getDateLocale(lang) }) : '-'
  } catch {
    return '-'
  }
}

/** Single ordonnance cell value (Sph/Cyl/Axe/Add) → "- 0.25" / "-" when empty. */
function fmtCell(v: any): string {
  if (v === null || v === undefined || v === '') return '-'
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  if (isNaN(n)) return String(v)
  return n.toString()
}

const docStyles = (
  <style>{`
    @page { margin: 0; size: A4; }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important; }
      .af-page-split { page-break-after: always; }
    }
    .af-doc {
      font-family: 'Inter', 'Helvetica', 'Arial', sans-serif;
      color: ${C.text};
      background: #fff;
      position: relative;
    }
    .af-doc table { border-collapse: collapse; }
    .af-watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 80pt;
      font-weight: 900;
      color: ${C.watermark};
      z-index: 0;
      white-space: nowrap;
      pointer-events: none;
      letter-spacing: 12px;
      text-transform: uppercase;
      user-select: none;
    }
  `}</style>
)

/** Shared header (logo + company + AVOIR FOURNISSEUR pill + N°/Date/BC/N° fournisseur). */
function Header({ avoir, entreprise, fmtDate }: { avoir: any; entreprise: any; fmtDate: (d: any) => string }) {
  const el = entreprise || {}
  const numero = avoir.numero || '-'
  const dateEmission = fmtDate(pickVal(avoir, 'dateEmission', 'date_emission'))
  // Linked Bon de Commande number (the BC this avoir relates to).
  const bonCommandeNum = pickVal(avoir?.bonCommande, 'numero') || pickVal(avoir?.bon_commande, 'numero')
  // Supplier reference number for the avoir (Numéro Bon de Fournisseur).
  const numeroFournisseur = pickVal(avoir, 'numeroFournisseur', 'numero_fournisseur')

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {el.logoUrl && (
            <img src={el.logoUrl} alt="Logo" style={{ width: 100, height: 60, objectFit: 'contain', flexShrink: 0 }} />
          )}
          <div style={{ fontSize: '9pt', lineHeight: 1.6, color: C.text }}>
            <div style={{ fontWeight: 700, fontSize: '11pt', color: C.title, marginBottom: 6, letterSpacing: 0.3 }}>
              {(el.nom || el.nomEntreprise || 'Nom de l\'entreprise').toUpperCase()}
            </div>
            {el.adresse   && <div style={{ color: C.muted }}>{el.adresse}</div>}
            {el.ville     && <div style={{ color: C.muted }}>{el.ville}</div>}
            {el.telephone && <div style={{ color: C.muted }}>Tel: {el.telephone}</div>}
            {el.email     && <div style={{ color: C.muted }}>Email: {el.email}</div>}
          </div>
        </div>

        <div style={{ textAlign: 'right', minWidth: 240 }}>
          <div style={{
            display: 'inline-block',
            background: C.accent,
            color: '#fff',
            fontWeight: 700,
            fontSize: '13pt',
            letterSpacing: 1.2,
            padding: '10px 22px',
            textTransform: 'uppercase',
          }}>
            Avoir Fournisseur
          </div>
          <div style={{ fontSize: '9pt', marginTop: 8, color: C.text }}>
            <strong style={{ color: C.title }}>N°:</strong> {numero}
            <span style={{ marginLeft: 16 }}>
              <strong style={{ color: C.title }}>Date:</strong> {dateEmission}
            </span>
          </div>
          {bonCommandeNum && (
            <div style={{ fontSize: '9pt', marginTop: 4, color: C.text }}>
              <strong style={{ color: C.title }}>Bon de commande:</strong> {bonCommandeNum}
            </div>
          )}
          {numeroFournisseur && (
            <div style={{ fontSize: '9pt', marginTop: 4, color: C.text }}>
              <strong style={{ color: C.title }}>N° bon fournisseur:</strong> {numeroFournisseur}
            </div>
          )}
        </div>
      </div>

      <div style={{ borderTop: `2px solid ${C.accent}`, marginBottom: 14 }} />
    </>
  )
}

/** Totals stack + amount in words + motif + signatures + legal footer. */
function Footer({ avoir, entreprise, totalHt, totalTva, totalTtc, tvaLabel }: {
  avoir: any
  entreprise: any
  totalHt: number
  totalTva: number
  totalTtc: number
  tvaLabel: string
}) {
  const amountWords = numberToFrenchWords(Math.abs(Number(totalTtc)))
  const motif = pickVal(avoir, 'motif')

  return (
    <>
      {/* ===== TOTALS STACK ===== */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '9.5pt', width: 320 }}>
          <tbody>
            <tr>
              <td style={{ padding: '8px 14px', textAlign: 'left',  background: C.rowAlt, borderBottom: `1px solid ${C.borderSoft}`, color: C.text }}>Total H.T</td>
              <td style={{ padding: '8px 14px', textAlign: 'right', background: C.rowAlt, borderBottom: `1px solid ${C.borderSoft}`, color: C.text, fontWeight: 700 }}>{fmt2(totalHt)} DH</td>
            </tr>
            <tr>
              <td style={{ padding: '8px 14px', textAlign: 'left',  background: C.rowAlt, color: C.text }}>{tvaLabel}</td>
              <td style={{ padding: '8px 14px', textAlign: 'right', background: C.rowAlt, color: C.text, fontWeight: 700 }}>{fmt2(totalTva)} DH</td>
            </tr>
            <tr>
              <td style={{ padding: '12px 14px', textAlign: 'left',  background: C.accent, color: '#fff', fontWeight: 700, fontSize: '11pt', letterSpacing: 0.5, textTransform: 'uppercase' }}>Total TTC</td>
              <td style={{ padding: '12px 14px', textAlign: 'right', background: C.accent, color: '#fff', fontWeight: 800, fontSize: '11pt' }}>{fmt2(totalTtc)} DH</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Amount in words */}
      <div style={{
        marginTop: 18,
        padding: '12px 16px',
        background: C.rowAlt,
        fontSize: '9pt',
        textAlign: 'center',
        lineHeight: 1.5,
        color: C.text,
      }}>
        <div style={{ fontStyle: 'italic', color: C.muted, marginBottom: 4 }}>
          Arrêté le présent avoir à la somme de :
        </div>
        <div style={{ fontWeight: 700, color: C.title }}>
          {amountWords} dirhams
        </div>
      </div>

      {/* ===== MOTIF ===== */}
      <div style={{ marginTop: 14, fontSize: '9pt', color: C.text }}>
        <strong style={{ color: C.title }}>Motif:</strong> {motif || '-'}
      </div>

      {/* Notes */}
      {avoir.notes && (
        <div style={{ marginTop: 8, fontSize: '9pt', color: C.text }}>
          <strong style={{ color: C.title }}>Notes:</strong> {avoir.notes}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* ===== SIGNATURES ===== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, gap: 60 }}>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: `1px solid ${C.title}`, width: 180, marginBottom: 6 }} />
          <div style={{ fontSize: '9pt', color: C.muted, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Signature de la Société
          </div>
        </div>
        <div style={{ flex: 1, textAlign: 'right' }}>
          <div style={{ borderTop: `1px solid ${C.title}`, width: 180, marginBottom: 6, marginLeft: 'auto' }} />
          <div style={{ fontSize: '9pt', color: C.muted, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Signature du Fournisseur
          </div>
        </div>
      </div>

      {/* ===== LEGAL FOOTER ===== */}
      <div style={{
        marginTop: 18,
        paddingTop: 8,
        borderTop: `1px solid ${C.borderSoft}`,
        textAlign: 'center',
        fontSize: '7.5pt',
        lineHeight: 1.5,
        color: C.muted,
      }}>
        {entreprise?.formeJuridique && entreprise?.capitalSocial && (
          <span>{entreprise.formeJuridique} au Capital de {entreprise.capitalSocial} — </span>
        )}
        {entreprise?.rc && <span>R.C: {entreprise.rc} — </span>}
        {entreprise?.ifNumber && <span>I.F: {entreprise.ifNumber} — </span>}
        {entreprise?.ice && <span>I.C.E: {entreprise.ice}</span>}
      </div>
    </>
  )
}

/**
 * Verre Avoir Fournisseur layout — optical content with the patient +
 * ordonnance box, the VL / VP prescription grid (Sph/Cyl/Axe/Add for OD/OG)
 * and the verre type / indice / traitement. Single A4 page.
 */
function VerreAvoirFournisseurDocument({ avoir, entreprise, lang }: { avoir: any; entreprise: any; lang?: string }) {
  const fmtDate = makeFmtDate(lang)
  const p = avoir.prescription || {}
  const lignes = avoir.lignes || []
  const verreLigne = lignes[0] || {}

  const totalTtc = pickNum(avoir, 'montantTtc', 'montant_ttc')
  const totalHt = pickNum(avoir, 'montantHt', 'montant_ht')
  const totalTva = pickNum(avoir, 'montantTva', 'montant_tva')
  const tvaRate = safeNum(verreLigne.tva ?? p.tva, 20)

  const verrePrix = pickNum(verreLigne, 'prixUnitaireHt', 'prix_unitaire_ht', 'montantHt', 'montant_ht')
  const verreQte = safeNum(verreLigne.quantite, 1)
  const verreType = p.verre_type || ''
  const verreIndice = p.verre_indice ?? ''
  const verreTraitement = formatTraitement(p.verre_traitement)
  const dateOrdonnance = fmtDate(pickVal(p, 'date_ordonnance', 'dateOrdonnance'))

  const visionTypeLabel = p.type_vision === 'progressif'
    ? 'Progressif'
    : p.type_vision === 'vp'
      ? 'Vision de près'
      : p.type_vision === 'vl'
        ? 'Vision de loin'
        : ''

  const client = avoir.client || {}
  const baseName = (client?.nomSociete || client?.nom || verreLigne.designation || '-').toString().toUpperCase()

  const rows = [
    {
      eye: 'OD',
      vl: [p.od_sph_vl, p.od_cyl_vl, p.od_axe_vl, p.od_add_vl],
      vp: [p.od_sph_vp, p.od_cyl_vp, p.od_axe_vp, p.od_add_vp],
    },
    {
      eye: 'OG',
      vl: [p.og_sph_vl, p.og_cyl_vl, p.og_axe_vl, p.og_add_vl],
      vp: [p.og_sph_vp, p.og_cyl_vp, p.og_axe_vp, p.og_add_vp],
    },
  ]

  const thMini: CSSProperties = { padding: '5px 6px', fontSize: '8pt', fontWeight: 700, textAlign: 'center', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.3 }
  const tdMini: CSSProperties = { padding: '8px 6px', fontSize: '9pt', textAlign: 'center', color: C.text, borderTop: `0.5pt solid ${C.borderSoft}` }

  const hasValue = (v: any) => v !== null && v !== undefined && v !== ''
  const vlFilled = rows.some((r) => r.vl.some(hasValue))
  const vpFilled = rows.some((r) => r.vp.some(hasValue))
  let showVl: boolean
  let showVp: boolean
  if (p.type_vision === 'vl') {
    showVl = true; showVp = false
  } else if (p.type_vision === 'vp') {
    showVl = false; showVp = true
  } else if (p.type_vision === 'progressif') {
    showVl = vlFilled; showVp = vpFilled
    if (!showVl && !showVp) { showVl = true; showVp = true }
  } else {
    showVl = true; showVp = true
  }

  return (
    <>
      {docStyles}
      <div className="af-doc">
        <div style={{
          width: '210mm',
          minHeight: '297mm',
          padding: '15mm',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          boxSizing: 'border-box',
        }}>
          {entreprise?.activerFiligrane !== false && (
            <div className="af-watermark">{entreprise?.watermarkText || 'SmartGestion'}</div>
          )}

          <Header avoir={avoir} entreprise={entreprise} fmtDate={fmtDate} />

          {/* ===== ORDONNANCE / VERRE BOX ===== */}
          <div style={{ border: `1px solid ${C.border}`, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 16px', borderBottom: `1px solid ${C.borderSoft}` }}>
              <div style={{ fontWeight: 700, fontSize: '11pt', color: C.title, letterSpacing: 0.3 }}>
                {baseName}
              </div>
              <div style={{ textAlign: 'right', fontSize: '9pt', color: C.muted, lineHeight: 1.6 }}>
                {dateOrdonnance !== '-' && <div>Ordonnance du {dateOrdonnance}</div>}
                {visionTypeLabel && <div>Type de vision: {visionTypeLabel}</div>}
                {verreType && <div>Type de verre : {verreType}</div>}
                {verreIndice !== '' && verreIndice != null && <div>Indice : {verreIndice}</div>}
                {verreTraitement && <div>Traitement : {verreTraitement}</div>}
              </div>
            </div>

            {/* Prescription grid — VL / VP, columns Sph/Cyl/Axe/Add */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thMini, width: '8%' }}></th>
                  {showVl && <th colSpan={4} style={{ ...thMini, borderBottom: `0.5pt solid ${C.borderSoft}`, color: C.title }}>VL (Vision de Loin)</th>}
                  {showVp && <th colSpan={4} style={{ ...thMini, borderBottom: `0.5pt solid ${C.borderSoft}`, color: C.title, ...(showVl ? { borderLeft: `0.5pt solid ${C.borderSoft}` } : null) }}>VP (Vision de Près)</th>}
                </tr>
                <tr>
                  <th style={thMini}></th>
                  {showVl && <>
                    <th style={thMini}>Sph</th>
                    <th style={thMini}>Cyl</th>
                    <th style={thMini}>Axe</th>
                    <th style={thMini}>Add</th>
                  </>}
                  {showVp && <>
                    <th style={{ ...thMini, ...(showVl ? { borderLeft: `0.5pt solid ${C.borderSoft}` } : null) }}>Sph</th>
                    <th style={thMini}>Cyl</th>
                    <th style={thMini}>Axe</th>
                    <th style={thMini}>Add</th>
                  </>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.eye}>
                    <td style={{ ...tdMini, fontWeight: 700, color: C.title }}>{r.eye}</td>
                    {showVl && r.vl.map((v, i) => (
                      <td key={`vl-${i}`} style={{ ...tdMini, ...(i === 0 ? { fontWeight: 700 } : null) }}>{fmtCell(v)}</td>
                    ))}
                    {showVp && r.vp.map((v, i) => (
                      <td key={`vp-${i}`} style={{ ...tdMini, ...(i === 0 ? { ...(showVl ? { borderLeft: `0.5pt solid ${C.borderSoft}` } : null), fontWeight: 700 } : null) }}>{fmtCell(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ===== DESIGNATION + PRIX TABLE ===== */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <colgroup>
              <col style={{ width: '58%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '22%' }} />
            </colgroup>
            <thead>
              <tr style={{ background: C.accent, color: '#fff' }}>
                <th style={{ padding: '10px 12px', fontSize: '9.5pt', fontWeight: 700, textAlign: 'left',   textTransform: 'uppercase', letterSpacing: 0.5 }}>Désignation</th>
                <th style={{ padding: '10px 12px', fontSize: '9.5pt', fontWeight: 700, textAlign: 'right',  textTransform: 'uppercase', letterSpacing: 0.5 }}>Prix U. HT</th>
                <th style={{ padding: '10px 12px', fontSize: '9.5pt', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 }}>Qté</th>
                <th style={{ padding: '10px 12px', fontSize: '9.5pt', fontWeight: 700, textAlign: 'right',  textTransform: 'uppercase', letterSpacing: 0.5 }}>Prix HT</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '8px 12px', fontSize: '9.5pt', textAlign: 'left', borderBottom: `0.5pt solid ${C.borderSoft}`, color: C.text }}>
                  {verreLigne.designation || `Verre${verreType ? ` ${verreType}` : ''}`}
                  {(verreIndice !== '' && verreIndice != null) ? ` — Indice ${verreIndice}` : ''}
                  {verreTraitement ? ` — ${verreTraitement}` : ''}
                </td>
                <td style={{ padding: '8px 12px', fontSize: '9.5pt', textAlign: 'right', borderBottom: `0.5pt solid ${C.borderSoft}`, color: C.text }}>{fmt2Money(verrePrix)} DH</td>
                <td style={{ padding: '8px 12px', fontSize: '9.5pt', textAlign: 'center', borderBottom: `0.5pt solid ${C.borderSoft}`, color: C.text }}>{verreQte}</td>
                <td style={{ padding: '8px 12px', fontSize: '9.5pt', textAlign: 'right', borderBottom: `0.5pt solid ${C.borderSoft}`, color: C.text, fontWeight: 700 }}>{fmt2Money(verrePrix * verreQte)} DH</td>
              </tr>
            </tbody>
          </table>

          <div style={{ flex: 1 }} />

          <Footer
            avoir={avoir}
            entreprise={entreprise}
            totalHt={totalHt}
            totalTva={totalTva}
            totalTtc={totalTtc}
            tvaLabel={`TVA ${tvaRate}%`}
          />
        </div>
      </div>
    </>
  )
}

export const AvoirFournisseurDocument = forwardRef<HTMLDivElement, AvoirFournisseurDocumentProps>(
  ({ avoir, entreprise, lang }, ref) => {
    if (!avoir) return null

    // Verre avoirs use the dedicated optical layout (single page).
    if (avoir.type === 'verre') {
      return (
        <div ref={ref}>
          <VerreAvoirFournisseurDocument avoir={avoir} entreprise={entreprise} lang={lang} />
        </div>
      )
    }

    const fmtDate = makeFmtDate(lang)

    const lignes = avoir.lignes || []
    const totalHt = pickNum(avoir, 'montantHt', 'montant_ht')
    const totalTva = pickNum(avoir, 'montantTva', 'montant_tva')
    const totalTtc = pickNum(avoir, 'montantTtc', 'montant_ttc')

    const getPu = (l: any) => pickNum(l, 'prixUnitaireHt', 'prix_unitaire_ht')
    const getQt = (l: any) => safeNum(l.quantite, 1)
    const getMt = (l: any) => { const m = pickNum(l, 'montantHt', 'montant_ht'); return m > 0 ? m : getPu(l) * getQt(l) }

    // Split products into pages of at most ITEMS_PER_PAGE; totals/footer only
    // render on the last page.
    const pages = useMemo(() => {
      if (lignes.length === 0) {
        return [{ items: [] as any[], offset: 0, isFirst: true, isLast: true }]
      }
      const chunks: { items: any[]; offset: number; isFirst: boolean; isLast: boolean }[] = []
      for (let idx = 0; idx < lignes.length; idx += ITEMS_PER_PAGE) {
        chunks.push({
          items: lignes.slice(idx, idx + ITEMS_PER_PAGE),
          offset: idx,
          isFirst: idx === 0,
          isLast: idx + ITEMS_PER_PAGE >= lignes.length,
        })
      }
      return chunks
    }, [lignes])

    const numero = avoir.numero || ''

    return (
      <>
        {docStyles}
        <div ref={ref} className="af-doc">
          {pages.map((page, pIdx) => (
            <div
              key={pIdx}
              className={pIdx < pages.length - 1 ? 'af-page-split' : ''}
              style={{
                width: '210mm',
                minHeight: '297mm',
                padding: '15mm',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                boxSizing: 'border-box',
              }}>
              {entreprise?.activerFiligrane !== false && (
                <div className="af-watermark">{entreprise?.watermarkText || 'SmartGestion'}</div>
              )}

              {page.isFirst ? (
                <Header avoir={avoir} entreprise={entreprise} fmtDate={fmtDate} />
              ) : (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 10,
                  paddingBottom: 6,
                  borderBottom: `2px solid ${C.accent}`,
                }}>
                  <div style={{ fontWeight: 700, fontSize: '10pt', textTransform: 'uppercase', color: C.title }}>
                    Avoir Fournisseur {numero} — (suite)
                  </div>
                </div>
              )}

              {/* ===== DESIGNATION + PRIX TABLE ===== */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <colgroup>
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '42%' }} />
                    <col style={{ width: '17%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '22%' }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: C.accent, color: '#fff' }}>
                      <th style={{ padding: '10px 8px', fontSize: '9.5pt', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 }}>N°</th>
                      <th style={{ padding: '10px 12px', fontSize: '9.5pt', fontWeight: 700, textAlign: 'left',   textTransform: 'uppercase', letterSpacing: 0.5 }}>Désignation</th>
                      <th style={{ padding: '10px 12px', fontSize: '9.5pt', fontWeight: 700, textAlign: 'right',  textTransform: 'uppercase', letterSpacing: 0.5 }}>Prix U. HT</th>
                      <th style={{ padding: '10px 12px', fontSize: '9.5pt', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 }}>Qté</th>
                      <th style={{ padding: '10px 12px', fontSize: '9.5pt', fontWeight: 700, textAlign: 'right',  textTransform: 'uppercase', letterSpacing: 0.5 }}>Prix HT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map((ligne: any, i: number) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : C.rowAlt }}>
                        <td style={{ padding: '8px', fontSize: '9.5pt', textAlign: 'center', borderBottom: `0.5pt solid ${C.borderSoft}`, color: C.accent, fontWeight: 700 }}>{page.offset + i + 1}</td>
                        <td style={{ padding: '8px 12px', fontSize: '9.5pt', textAlign: 'left', borderBottom: `0.5pt solid ${C.borderSoft}`, color: C.text }}>{ligne.designation || '-'}</td>
                        <td style={{ padding: '8px 12px', fontSize: '9.5pt', textAlign: 'right', borderBottom: `0.5pt solid ${C.borderSoft}`, color: C.text }}>{fmt2(getPu(ligne))} DH</td>
                        <td style={{ padding: '8px 12px', fontSize: '9.5pt', textAlign: 'center', borderBottom: `0.5pt solid ${C.borderSoft}`, color: C.text }}>{getQt(ligne)}</td>
                        <td style={{ padding: '8px 12px', fontSize: '9.5pt', textAlign: 'right', borderBottom: `0.5pt solid ${C.borderSoft}`, color: C.text, fontWeight: 700 }}>{fmt2(getMt(ligne))} DH</td>
                      </tr>
                    ))}
                    {page.items.length === 0 && (
                      <tr><td colSpan={5} style={{ padding: '10px 8px', fontSize: '9pt', textAlign: 'center', fontStyle: 'italic', color: C.subtle, borderBottom: `0.5pt solid ${C.borderSoft}` }}>Aucun article</td></tr>
                    )}
                  </tbody>
                </table>

                {!page.isLast && <div style={{ flex: 1 }} />}

                {page.isLast && (
                  <Footer
                    avoir={avoir}
                    entreprise={entreprise}
                    totalHt={totalHt}
                    totalTva={totalTva}
                    totalTtc={totalTtc}
                    tvaLabel="TVA"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </>
    )
  }
)

AvoirFournisseurDocument.displayName = 'AvoirFournisseurDocument'

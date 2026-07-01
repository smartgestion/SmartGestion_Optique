import { forwardRef, type CSSProperties } from 'react'
import { format, isValid, parseISO } from 'date-fns'
import { getDateLocale, fmtDiopter, fmtAxe } from '@/lib/utils'
import { DOC_COLORS as C, formatTraitement } from './docColors'

interface PrescriptionDocumentProps {
  prescription: any
  entreprise: any
  /** BCP-47 language tag from i18n.language */
  lang?: string
}

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

const hasVal = (v: any) => v !== null && v !== undefined && v !== ''
/** Signed dioptric cell → "+2.00" / "-1.25". Axis is a plain angle. */
const cell = (v: any, isAxe = false) => (isAxe ? fmtAxe(v, '—') : fmtDiopter(v, '—'))
/** Indice / plain numeric cell. */
const plain = (v: any) => (hasVal(v) ? String(v) : '—')

const visionLabel = (t: string): string =>
  t === 'progressif'
    ? 'Unifocal'
    : t === 'progressif_vl'
      ? 'Progressif'
      : t === 'vp'
        ? 'Vision de près'
        : t === 'vl'
          ? 'Vision de loin'
          : ''

/**
 * Printable ordonnance (prescription). Single A4 page for the refraction; an
 * optional second page reproduces the original uploaded scan when present.
 */
export const PrescriptionDocument = forwardRef<HTMLDivElement, PrescriptionDocumentProps>(
  ({ prescription: p, entreprise, lang }, ref) => {
    if (!p) return null
    const fmtDate = makeFmtDate(lang)
    const el = entreprise || {}
    const client = p.client || {}

    const typeVision = p.type_vision || ''
    const isProgressif = typeVision === 'progressif' // labelled "Unifocal"
    const isProgressifVl = typeVision === 'progressif_vl'
    const isVp = typeVision === 'vp'

    const clientName = (client?.nomSociete || client?.nom || p.client_nom || '-').toString()
    const dateOrd = fmtDate(p.date_ordonnance)
    const dateExp = hasVal(p.date_expiration) ? fmtDate(p.date_expiration) : ''
    const verreTraitement = formatTraitement(p.verre_traitement)

    // Build the refraction sections to render, driven by the vision type.
    type Row = [any, any, any, any] // sph, cyl, axe, add|indice
    interface Section { title: string; addLabel: string; od: Row; og: Row }
    const sections: Section[] = []
    if (isProgressifVl) {
      sections.push({
        title: 'Vision de loin',
        addLabel: 'Add',
        od: [p.od_sph_prog, p.od_cyl_prog, p.od_axe_prog, p.od_add_prog],
        og: [p.og_sph_prog, p.og_cyl_prog, p.og_axe_prog, p.og_add_prog],
      })
    } else if (isProgressif) {
      // Unifocal → VL & VP, last column is the Indice.
      sections.push({
        title: 'Vision de Loin (VL)',
        addLabel: 'Indice',
        od: [p.od_sph_vl, p.od_cyl_vl, p.od_axe_vl, p.od_indice_vl],
        og: [p.og_sph_vl, p.og_cyl_vl, p.og_axe_vl, p.og_indice_vl],
      })
      sections.push({
        title: 'Vision de Près (VP)',
        addLabel: 'Indice',
        od: [p.od_sph_vp, p.od_cyl_vp, p.od_axe_vp, p.od_indice_vp],
        og: [p.og_sph_vp, p.og_cyl_vp, p.og_axe_vp, p.og_indice_vp],
      })
    } else if (isVp) {
      sections.push({
        title: 'Vision de Près (VP)',
        addLabel: 'Add',
        od: [p.od_sph_vp, p.od_cyl_vp, p.od_axe_vp, p.od_add_vp],
        og: [p.og_sph_vp, p.og_cyl_vp, p.og_axe_vp, p.og_add_vp],
      })
    } else {
      sections.push({
        title: 'Vision de Loin (VL)',
        addLabel: 'Add',
        od: [p.od_sph_vl, p.od_cyl_vl, p.od_axe_vl, p.od_add_vl],
        og: [p.og_sph_vl, p.og_cyl_vl, p.og_axe_vl, p.og_add_vl],
      })
    }

    // DP / hauteurs / mounting params — only shown when at least one is filled.
    const hasDp = hasVal(p.dp_binoculaire) || hasVal(p.dp_od) || hasVal(p.dp_og) || hasVal(p.hauteur_od) || hasVal(p.hauteur_og)

    const th: CSSProperties = { padding: '6px 8px', fontSize: '8.5pt', fontWeight: 700, textAlign: 'center', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: `0.5pt solid ${C.borderSoft}` }
    const td: CSSProperties = { padding: '9px 8px', fontSize: '10pt', textAlign: 'center', color: C.text, borderTop: `0.5pt solid ${C.borderSoft}` }

    const scanUrl: string = p.scanned_url || ''
    const scanIsImage = scanUrl.startsWith('data:image/') || /\.(png|jpe?g|webp|gif)$/i.test(scanUrl)
    const scanIsPdf = scanUrl.startsWith('data:application/pdf') || /\.pdf$/i.test(scanUrl)

    const pageStyle: CSSProperties = {
      width: '210mm',
      minHeight: '297mm',
      padding: '15mm',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      boxSizing: 'border-box',
    }

    return (
      <>
        <style>{`
          @page { margin: 0; size: A4; }
          @media print {
            html, body { margin: 0 !important; padding: 0 !important; }
            .ord-page-split { page-break-after: always; }
          }
          .ord-doc { font-family: 'Inter','Helvetica','Arial',sans-serif; color: ${C.text}; background: #fff; position: relative; }
          .ord-doc table { border-collapse: collapse; }
          .ord-watermark {
            position: absolute; top: 50%; left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 80pt; font-weight: 900; color: ${C.watermark};
            z-index: 0; white-space: nowrap; pointer-events: none;
            letter-spacing: 12px; text-transform: uppercase; user-select: none;
          }
        `}</style>
        <div ref={ref} className="ord-doc">
          <div className={scanUrl ? 'ord-page-split' : ''} style={pageStyle}>
            {el.activerFiligrane !== false && (
              <div className="ord-watermark">{el.watermarkText || 'SmartGestion'}</div>
            )}

            {/* ===== HEADER ===== */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                {el.logoUrl && <img src={el.logoUrl} alt="Logo" style={{ width: 100, height: 60, objectFit: 'contain', flexShrink: 0 }} />}
                <div style={{ fontSize: '9pt', lineHeight: 1.6, color: C.text }}>
                  <div style={{ fontWeight: 700, fontSize: '11pt', color: C.title, marginBottom: 6, letterSpacing: 0.3 }}>
                    {(el.nom || el.nomEntreprise || "Nom de l'entreprise").toUpperCase()}
                  </div>
                  {el.adresse && <div style={{ color: C.muted }}>{el.adresse}</div>}
                  {el.ville && <div style={{ color: C.muted }}>{el.ville}</div>}
                  {el.telephone && <div style={{ color: C.muted }}>Tel: {el.telephone}</div>}
                  {el.email && <div style={{ color: C.muted }}>Email: {el.email}</div>}
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 220 }}>
                <div style={{ display: 'inline-block', background: C.accent, color: '#fff', fontWeight: 700, fontSize: '13pt', letterSpacing: 1.2, padding: '10px 22px', textTransform: 'uppercase' }}>
                  Ordonnance
                </div>
                <div style={{ fontSize: '9pt', marginTop: 8, color: C.text }}>
                  <strong style={{ color: C.title }}>N°:</strong> {p.id ? `ORD-${p.id}` : '-'}
                  <span style={{ marginLeft: 16 }}><strong style={{ color: C.title }}>Date:</strong> {dateOrd}</span>
                </div>
                {dateExp && (
                  <div style={{ fontSize: '9pt', marginTop: 2, color: C.muted }}>Expire le: {dateExp}</div>
                )}
              </div>
            </div>

            <div style={{ borderTop: `2px solid ${C.accent}`, marginBottom: 16 }} />

            {/* ===== PATIENT + PRESCRIBER ===== */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <div style={{ flex: 1, border: `1px solid ${C.border}`, padding: '12px 14px' }}>
                <div style={{ fontSize: '8.5pt', fontWeight: 700, color: C.title, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Patient</div>
                <div style={{ fontWeight: 700, fontSize: '11pt', color: C.title }}>{clientName.toUpperCase()}</div>
                {hasVal(client?.cine) && <div style={{ fontSize: '9pt', color: C.muted }}>CINE: {client.cine}</div>}
                {hasVal(client?.telephone) && <div style={{ fontSize: '9pt', color: C.muted }}>{client.telephone}</div>}
                {typeVision && <div style={{ fontSize: '9pt', color: C.muted, marginTop: 4 }}>Type de vision: <strong style={{ color: C.text }}>{visionLabel(typeVision)}</strong></div>}
              </div>
              {(hasVal(p.medecin_traitant_nom) || hasVal(p.medecin_traitant_specialite)) && (
                <div style={{ flex: 1, border: `1px solid ${C.border}`, padding: '12px 14px' }}>
                  <div style={{ fontSize: '8.5pt', fontWeight: 700, color: C.title, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Médecin traitant</div>
                  {hasVal(p.medecin_traitant_nom) && <div style={{ fontWeight: 700, fontSize: '10.5pt', color: C.title }}>{p.medecin_traitant_nom}</div>}
                  {hasVal(p.medecin_traitant_specialite) && <div style={{ fontSize: '9pt', color: C.muted }}>{p.medecin_traitant_specialite}</div>}
                  {hasVal(p.medecin_traitant_telephone) && <div style={{ fontSize: '9pt', color: C.muted }}>{p.medecin_traitant_telephone}</div>}
                </div>
              )}
            </div>

            {/* ===== REFRACTION SECTIONS ===== */}
            {sections.map((s) => (
              <div key={s.title} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: '9.5pt', fontWeight: 700, color: C.accent, marginBottom: 4 }}>{s.title}</div>
                <table style={{ width: '100%', border: `1px solid ${C.border}` }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, width: '10%' }}></th>
                      <th style={th}>Sphère</th>
                      <th style={th}>Cylindre</th>
                      <th style={th}>Axe</th>
                      <th style={th}>{s.addLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(['OD', 'OG'] as const).map((eye) => {
                      const r = eye === 'OD' ? s.od : s.og
                      const isIndice = s.addLabel === 'Indice'
                      return (
                        <tr key={eye}>
                          <td style={{ ...td, fontWeight: 700, color: C.title }}>{eye}</td>
                          <td style={{ ...td, fontWeight: 700 }}>{cell(r[0])}</td>
                          <td style={td}>{cell(r[1])}</td>
                          <td style={td}>{cell(r[2], true)}</td>
                          <td style={td}>{isIndice ? plain(r[3]) : cell(r[3])}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))}

            {/* ===== DP / HAUTEURS ===== */}
            {hasDp && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 24px', fontSize: '9pt', color: C.text, border: `1px solid ${C.border}`, padding: '10px 14px', marginBottom: 14 }}>
                {hasVal(p.dp_binoculaire) && <span><strong style={{ color: C.title }}>DP binoculaire:</strong> {p.dp_binoculaire}</span>}
                {hasVal(p.dp_od) && <span><strong style={{ color: C.title }}>DP OD:</strong> {p.dp_od}</span>}
                {hasVal(p.dp_og) && <span><strong style={{ color: C.title }}>DP OG:</strong> {p.dp_og}</span>}
                {hasVal(p.hauteur_od) && <span><strong style={{ color: C.title }}>Haut. OD:</strong> {p.hauteur_od}</span>}
                {hasVal(p.hauteur_og) && <span><strong style={{ color: C.title }}>Haut. OG:</strong> {p.hauteur_og}</span>}
              </div>
            )}

            {/* ===== VERRE PRESCRIT ===== */}
            {(hasVal(p.verre_type) || hasVal(p.verre_indice) || verreTraitement) && (
              <div style={{ fontSize: '9pt', color: C.text, marginBottom: 12 }}>
                <strong style={{ color: C.title }}>Verre prescrit:</strong>
                {hasVal(p.verre_type) && <span> {p.verre_type}</span>}
                {hasVal(p.verre_indice) && <span> — Indice {p.verre_indice}</span>}
                {verreTraitement && <span> — {verreTraitement}</span>}
              </div>
            )}

            {/* ===== NOTES ===== */}
            {hasVal(p.notes) && (
              <div style={{ fontSize: '9pt', color: C.text, marginBottom: 12 }}>
                <strong style={{ color: C.title }}>Notes:</strong> {p.notes}
              </div>
            )}

            <div style={{ flex: 1 }} />

            {/* ===== SIGNATURE ===== */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 36 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ borderTop: `1px solid ${C.title}`, width: 220, margin: '0 auto 6px' }} />
                <div style={{ fontSize: '9pt', color: C.muted, letterSpacing: 0.3 }}>Cachet et Signature</div>
              </div>
            </div>

            {/* ===== FOOTER ===== */}
            <div style={{ marginTop: 18, paddingTop: 8, borderTop: `1px solid ${C.borderSoft}`, textAlign: 'center', fontSize: '7.5pt', lineHeight: 1.5, color: C.muted }}>
              {el.ice && <span>I.C.E: {el.ice}</span>}
              {el.ifNumber && <span> — I.F: {el.ifNumber}</span>}
              {el.patente && <span> — Patente: {el.patente}</span>}
            </div>
          </div>

          {/* ===== ORIGINAL SCAN (second page) ===== */}
          {scanUrl && (
            <div style={pageStyle}>
              <div style={{ fontSize: '11pt', fontWeight: 700, color: C.title, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                Ordonnance originale
              </div>
              <div style={{ borderTop: `2px solid ${C.accent}`, marginBottom: 16 }} />
              {scanIsImage ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
                  <img src={scanUrl} alt="Ordonnance originale" style={{ maxWidth: '100%', maxHeight: '250mm', objectFit: 'contain', border: `1px solid ${C.border}` }} />
                </div>
              ) : scanIsPdf ? (
                <div style={{ flex: 1 }}>
                  <object data={scanUrl} type="application/pdf" style={{ width: '100%', height: '250mm', border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: '9pt', color: C.muted }}>
                      Le document PDF original ({p.scanned_name || 'ordonnance.pdf'}) est joint à cette ordonnance.
                    </div>
                  </object>
                </div>
              ) : (
                <div style={{ fontSize: '9pt', color: C.muted }}>
                  Un document original ({p.scanned_name || 'fichier'}) est joint à cette ordonnance.
                </div>
              )}
            </div>
          )}
        </div>
      </>
    )
  },
)

PrescriptionDocument.displayName = 'PrescriptionDocument'

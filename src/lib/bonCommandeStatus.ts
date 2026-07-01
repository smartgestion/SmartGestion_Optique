/**
 * Shared Bon de Commande status-change logic.
 *
 * Single source of truth for the side-effects triggered when a BC changes
 * status, used by both the Bons de Commande list page and the Ordre de Travail
 * hub so the two stay perfectly consistent:
 *
 *   • livré / livrée → adds stock (once) + a `mouvements_stock` entry + an
 *     auto-generated linked Bon de Livraison.
 *   • leaving livré  → reverts stock (once) + deletes the auto BL.
 *   • annulé         → auto-creates a linked supplier avoir (traceability).
 *
 * Idempotency is driven by the persistent `bons_commande.stock_updated` flag,
 * NOT the previous status, so repeated toggles never double-apply stock.
 *
 * The function is intentionally stateless (only `supabase` + `user_id` read
 * from the rows) so it can run from any screen.
 */
import { supabase } from '@/lib/supabase'

export async function changeBonCommandeStatus(id: number, newStatus: string): Promise<void> {
  const isLivréStatus = (s?: string | null) => s === 'livré' || s === 'livrée'
  const isNowLivré = isLivréStatus(newStatus)

  // --- 1. fetch the existing row to know the idempotency flag --------
  const { data: oldBon, error: fetchError } = await supabase
    .from('bons_commande')
    .select('statut, fournisseur_id, numero, user_id, stock_updated')
    .eq('id', id)
    .single()
  if (fetchError || !oldBon) {
    throw new Error(`Bon de commande ${id} introuvable`)
  }
  // SQLite stores booleans as 0/1; treat any truthy value as "applied".
  const wasStockUpdated = Boolean(Number(oldBon.stock_updated || 0))

  // --- 2. update the status ------------------------------------------
  const { error: updateError } = await supabase
    .from('bons_commande')
    .update({ statut: newStatus })
    .eq('id', id)
  if (updateError) {
    throw new Error(updateError.message || 'Failed to update status')
  }

  // --- 3. linked Bon de Livraison sync -------------------------------
  // BL existence mirrors the stock flag (1 BL per "into livré" entry).
  if (isNowLivré && !wasStockUpdated) {
    try {
      const { data: bonDetails } = await supabase
        .from('bons_commande')
        .select('*')
        .eq('id', id)
        .single()
      const { data: bonLignes } = await supabase
        .from('bon_commande_lignes')
        .select('*')
        .eq('bon_commande_id', id)

      if (bonDetails) {
        const year = new Date().getFullYear()
        const { data: blExisting } = await supabase
          .from('bons_livraison')
          .select('numero')
          .like('numero', `BL-${year}-%`)
          .eq('user_id', bonDetails.user_id)
        let blMax = 0
        for (const b of blExisting || []) {
          const m = b.numero?.match(new RegExp(`^BL-${year}-(\\d+)$`))
          if (m) {
            const n = parseInt(m[1], 10)
            if (n > blMax) blMax = n
          }
        }
        const blNumero = `BL-${year}-${String(blMax + 1).padStart(4, '0')}`
        const blData: any = {
          numero: blNumero,
          user_id: bonDetails.user_id,
          fournisseur_id: bonDetails.fournisseur_id,
          date_livraison: new Date().toISOString(),
          statut: 'livré',
          notes: `Généré automatiquement depuis Bon de Commande ${bonDetails.numero}`,
          montant_ht: bonDetails.montant_ht || 0,
          montant_tva: bonDetails.montant_tva || 0,
          montant_ttc: bonDetails.montant_ttc || 0,
          bon_commande_id: id,
        }
        const { data: newBL, error: blError } = await supabase
          .from('bons_livraison')
          .insert([blData])
          .select()
          .single()
        if (!blError && newBL && bonLignes && bonLignes.length > 0) {
          const blLignesData = (bonLignes as any[]).map((l: any, index: number) => ({
            bon_livraison_id: newBL.id,
            produit_id: l.produit_id,
            reference: l.reference,
            designation: l.designation,
            quantite: l.quantite,
            prix_unitaire_ht: l.prix_unitaire_ht,
            tva: l.tva,
            montant_ht:
              l.montant_ht ||
              Number(l.quantite || 0) * Number(l.prix_unitaire_ht || 0),
            montant_ttc:
              l.montant_ttc ||
              Number(l.quantite || 0) *
                Number(l.prix_unitaire_ht || 0) *
                (1 + Number(l.tva || 0) / 100),
            ordre: l.ordre !== undefined ? l.ordre : index,
          }))
          await supabase.from('bon_livraison_lignes').insert(blLignesData)
        }
      }
    } catch (blSyncErr) {
      // Non-fatal — same policy as the server (BC status update already succeeded)
      console.error('[changeBonCommandeStatus] BL sync error (non-fatal):', blSyncErr)
    }
  } else if (!isNowLivré && wasStockUpdated) {
    // Reverting: remove the auto-generated Bon de Livraison
    await supabase.from('bons_livraison').delete().eq('bon_commande_id', id)
  }

  // --- 4. stock movement sync (idempotent via stock_updated) ---------
  const adjustStock = async (
    produitId: number,
    delta: number,
    type: string,
    notes: string,
    bonNumero: string | undefined,
    fournisseurNom: string | undefined,
    prixUnitaire?: number,
    clampToZero?: boolean,
  ) => {
    if (!produitId) return
    const { data: produit } = await supabase
      .from('produits')
      .select('stock_actuel')
      .eq('id', produitId)
      .single()
    if (!produit) return
    const currentStock = Number(produit.stock_actuel || 0)
    const candidateStock = currentStock + delta
    const newStock = clampToZero ? Math.max(0, candidateStock) : candidateStock
    if (!clampToZero && newStock < 0) {
      throw new Error(
        `Stock insuffisant pour le produit ${produitId}. ` +
          `Stock actuel: ${currentStock}, tentative: ${delta}`,
      )
    }
    await supabase
      .from('produits')
      .update({ stock_actuel: newStock })
      .eq('id', produitId)
    await supabase.from('mouvements_stock').insert([
      {
        produit_id: produitId,
        type,
        quantite: delta,
        notes,
        reference_document: bonNumero,
        entite_nom: fournisseurNom,
        prix_unitaire: prixUnitaire || 0,
        date_mouvement: new Date().toISOString(),
      },
    ])
  }

  // Only fetch lignes/context if we actually need to move stock.
  const needStockAdd = isNowLivré && !wasStockUpdated
  const needStockRevert = !isNowLivré && wasStockUpdated

  if (needStockAdd || needStockRevert) {
    const { data: currentLignes } = await supabase
      .from('bon_commande_lignes')
      .select('*')
      .eq('bon_commande_id', id)
    const { data: b } = await supabase
      .from('bons_commande')
      .select('*, fournisseur:fournisseurs(nom)')
      .eq('id', id)
      .single()
    const fournisseurNom: string | undefined = b?.fournisseur?.nom
    const bonNumero: string | undefined = b?.numero

    if (needStockAdd && currentLignes && currentLignes.length > 0) {
      for (const l of currentLignes as any[]) {
        if (!l.produit_id) continue
        try {
          await adjustStock(
            l.produit_id,
            Number(l.quantite || 0),
            'achat',
            `Réception Bon de Commande ${bonNumero ?? ''}`,
            bonNumero,
            fournisseurNom,
            l.prix_unitaire_ht,
            /* clampToZero */ false,
          )
        } catch (stockErr) {
          console.error(
            `[changeBonCommandeStatus] stock increment failed for produit ${l.produit_id}:`,
            stockErr,
          )
        }
      }
    } else if (needStockRevert && currentLignes && currentLignes.length > 0) {
      // Revert stock — clamp to 0 so a low/zero stock does not block the
      // administrative status change.
      for (const l of currentLignes as any[]) {
        if (!l.produit_id) continue
        try {
          await adjustStock(
            l.produit_id,
            -Number(l.quantite || 0),
            'ajustement',
            `Annulation Réception Bon de Commande ${bonNumero ?? ''}`,
            bonNumero,
            fournisseurNom,
            l.prix_unitaire_ht,
            /* clampToZero */ true,
          )
        } catch (stockErr) {
          console.error(
            `[changeBonCommandeStatus] stock revert failed for produit ${l.produit_id}:`,
            stockErr,
          )
        }
      }
    }

    // --- 5. flip the idempotency flag atomically with the side-effects -
    await supabase
      .from('bons_commande')
      .update({ stock_updated: needStockAdd ? 1 : 0 })
      .eq('id', id)
  }

  // --- 6. cancelled BC -> auto-create a linked supplier credit note ----
  if (newStatus === 'annulé') {
    try {
      const { data: existingAvf } = await supabase
        .from('avoirs_fournisseur')
        .select('id')
        .eq('bon_commande_id', id)
        .maybeSingle()

      if (!existingAvf) {
        const { data: bcFull } = await supabase
          .from('bons_commande')
          .select('*')
          .eq('id', id)
          .single()
        const { data: bcLignes } = await supabase
          .from('bon_commande_lignes')
          .select('*')
          .eq('bon_commande_id', id)

        if (bcFull) {
          const year = new Date().getFullYear()
          const { data: avfExisting } = await supabase
            .from('avoirs_fournisseur')
            .select('numero')
            .like('numero', `AVF-${year}-%`)
            .eq('user_id', bcFull.user_id)
          let avfMax = 0
          for (const a of avfExisting || []) {
            const m = a.numero?.match(new RegExp(`^AVF-${year}-(\\d+)$`))
            if (m) {
              const n = parseInt(m[1], 10)
              if (n > avfMax) avfMax = n
            }
          }
          const avfNumero = `AVF-${year}-${String(avfMax + 1).padStart(4, '0')}`
          const { data: newAvf, error: avfError } = await supabase
            .from('avoirs_fournisseur')
            .insert([{
              user_id: bcFull.user_id,
              numero: avfNumero,
              numero_fournisseur: bcFull.numero_fournisseur || null,
              bon_commande_id: id,
              fournisseur_id: bcFull.fournisseur_id,
              type: bcFull.type === 'verre' ? 'verre' : 'simple',
              creation_mode: 'auto',
              date_emission: new Date().toISOString(),
              montant_ht: bcFull.montant_ht || 0,
              montant_tva: bcFull.montant_tva || 0,
              montant_ttc: bcFull.montant_ttc || 0,
              statut: 'annulé',
              motif: bcFull.motif_annulation || null,
            }])
            .select()
            .single()

          if (!avfError && newAvf && bcLignes && bcLignes.length > 0) {
            const avfLignes = (bcLignes as any[]).map((l: any, index: number) => ({
              avoir_fournisseur_id: newAvf.id,
              produit_id: l.produit_id,
              designation: l.designation,
              quantite: l.quantite,
              prix_unitaire_ht: l.prix_unitaire_ht,
              tva: l.tva,
              montant_ht: l.montant_ht || Number(l.quantite || 0) * Number(l.prix_unitaire_ht || 0),
              montant_ttc: l.montant_ttc || Number(l.quantite || 0) * Number(l.prix_unitaire_ht || 0) * (1 + Number(l.tva || 0) / 100),
              prescription_id: l.prescription_id ?? null,
              ordre: l.ordre !== undefined ? l.ordre : index,
            }))
            await supabase.from('avoir_fournisseur_lignes').insert(avfLignes)
          }
        }
      }
    } catch (avfErr) {
      // Non-fatal — the BC status change already succeeded.
      console.error('[changeBonCommandeStatus] supplier avoir sync error (non-fatal):', avfErr)
    }
  }
}

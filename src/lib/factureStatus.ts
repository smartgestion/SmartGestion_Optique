/**
 * Shared Facture status-change logic.
 *
 * Single source of truth for the side-effects triggered when an invoice
 * changes status, so the Factures list and the Ordre de Travail hub stay
 * consistent:
 *
 *   • payée / reste_a_payer → deducts stock (once, via `stock_updated`).
 *   • leaving those states  → restores stock (once).
 *   • payée                 → sets `reste_a_payer = 0`.
 *   • annulée               → auto-creates a linked client avoir; leaving
 *     annulée deletes it.
 *
 * `userId` is required (used for scoping the avoir number + stock notifs).
 */
import { supabase } from '@/lib/supabase'
import { updateStockAndNotify, ensureLowStockNotifications } from '@/lib/notifications'

/** Create a client avoir (credit note) mirroring a facture. Returns its id/numero. */
export async function createAvoirForFacture(
  factureId: number,
  userId: string | undefined,
): Promise<{ id: number; numero: string }> {
  const { data: factureData, error: fetchError } = await supabase
    .from('factures')
    .select('*, client:clients(*)')
    .eq('id', factureId)
    .single()

  if (fetchError || !factureData) throw new Error('Facture non trouvée')

  const { data: lignesData } = await supabase
    .from('facture_lignes')
    .select('*')
    .eq('facture_id', factureId)
    .order('ordre')

  let numeroAvoir: string | undefined
  const year = new Date().getFullYear()
  let attempts = 0
  while (!numeroAvoir && attempts < 10) {
    const { data: existing } = await supabase.from('avoirs').select('numero').like('numero', `AV-${year}-%`).eq('user_id', userId)
    let maxNum = 0
    for (const a of existing || []) {
      const match = a.numero?.match(new RegExp(`^AV-${year}-(\\d+)$`))
      if (match) { const n = parseInt(match[1], 10); if (n > maxNum) maxNum = n }
    }
    const candidate = `AV-${year}-${String(maxNum + 1).padStart(4, '0')}`
    const { data: dup } = await supabase.from('avoirs').select('id').eq('numero', candidate).eq('user_id', userId).maybeSingle()
    if (!dup) { numeroAvoir = candidate; break }
    attempts++
  }

  let { data: avoirData, error: avoirError } = await supabase
    .from('avoirs')
    .insert([{
      user_id: userId,
      numero: numeroAvoir,
      facture_id: factureData.id,
      client_id: factureData.client_id,
      date_emission: new Date().toISOString(),
      montant_ht: factureData.montant_ht,
      montant_tva: factureData.montant_tva,
      montant_ttc: factureData.montant_ttc,
      statut: 'Généré',
      notes: `Avoir pour annulation de la facture ${factureData.numero}`,
    }])
    .select()
    .single()

  if (avoirError?.message?.includes('duplicate key') || avoirError?.code === '23505') {
    const { data: all } = await supabase.from('avoirs').select('numero').like('numero', `AV-${year}-%`).eq('user_id', userId)
    let mn = 0
    for (const a of all || []) {
      const m = a.numero?.match(new RegExp(`^AV-${year}-(\\d+)$`))
      if (m) { const n = parseInt(m[1], 10); if (n > mn) mn = n }
    }
    numeroAvoir = `AV-${year}-${String(mn + 1).padStart(4, '0')}`
    const retry = await supabase.from('avoirs').upsert([{ user_id: userId, numero: numeroAvoir, facture_id: factureData.id, client_id: factureData.client_id, date_emission: new Date().toISOString(), montant_ht: factureData.montant_ht, montant_tva: factureData.montant_tva, montant_ttc: factureData.montant_ttc, statut: 'Généré', notes: `Avoir pour annulation de la facture ${factureData.numero}` }]).select().single()
    avoirData = retry.data
    avoirError = retry.error
  }
  if (avoirError) throw avoirError

  if (lignesData && lignesData.length > 0) {
    const lignesPayload = lignesData.map((l: any, index: number) => ({
      avoir_id: avoirData.id,
      produit_id: l.produit_id,
      designation: l.description || l.designation || '',
      quantite: l.quantite,
      prix_unitaire_ht: l.prix_unitaire_ht || l.prix_unitaire || 0,
      tva: l.tva,
      montant_ht: l.montant_ht,
      montant_ttc: l.montant_ttc,
      ordre: index,
    }))
    const { error: lignesError } = await supabase.from('avoir_lignes').insert(lignesPayload)
    if (lignesError) throw lignesError
  }

  return { id: avoirData.id, numero: numeroAvoir! }
}

/**
 * Change a facture's status with all side effects (stock + avoir on cancel).
 * Idempotent stock handling via the `stock_updated` flag.
 */
export async function changeFactureStatus(
  id: number,
  newStatut: string,
  userId: string | undefined,
): Promise<void> {
  const { data: facture } = await supabase.from('factures').select('statut, stock_updated').eq('id', id).single()

  // Leaving "annulée" → remove the auto-generated avoir.
  if (facture?.statut === 'annulée' && newStatut !== 'annulée') {
    const { data: avoir } = await supabase.from('avoirs').select('id').eq('facture_id', id).single()
    if (avoir) {
      await supabase.from('avoir_lignes').delete().eq('avoir_id', avoir.id)
      await supabase.from('avoirs').delete().eq('id', avoir.id)
    }
  }

  const oldStatut = facture?.statut
  const stockUpdated = facture?.stock_updated ?? false
  const updateData: any = { statut: newStatut }
  if (newStatut === 'payée') updateData.reste_a_payer = 0

  // Create avoir BEFORE updating status (transaction integrity).
  if (newStatut === 'annulée' && oldStatut && oldStatut !== 'annulée') {
    await createAvoirForFacture(id, userId)
  }

  const activeStatuses = ['payée', 'reste_a_payer']
  const wasActive = activeStatuses.includes(oldStatut)
  const isActive = activeStatuses.includes(newStatut)

  const changedIds: (number | string)[] = []
  if (isActive && !wasActive && !stockUpdated) {
    const { data: lignes } = await supabase.from('facture_lignes').select('produit_id, quantite').eq('facture_id', id)
    if (lignes) {
      for (const l of lignes) {
        if (l.produit_id) {
          await updateStockAndNotify(userId, l.produit_id, -Number(l.quantite))
          changedIds.push(l.produit_id)
        }
      }
    }
    updateData.stock_updated = true
  } else if (!isActive && wasActive && stockUpdated) {
    const { data: lignes } = await supabase.from('facture_lignes').select('produit_id, quantite').eq('facture_id', id)
    if (lignes) {
      for (const l of lignes) {
        if (l.produit_id) {
          await updateStockAndNotify(userId, l.produit_id, Number(l.quantite))
        }
      }
    }
    updateData.stock_updated = false
  }

  if (changedIds.length > 0) {
    await ensureLowStockNotifications(userId, changedIds)
  }

  const { error } = await supabase.from('factures').update(updateData).eq('id', id).eq('user_id', userId)
  if (error) throw error
}

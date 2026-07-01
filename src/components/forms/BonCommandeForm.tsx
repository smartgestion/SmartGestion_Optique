import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Plus, Trash2 } from 'lucide-react'
import { formatCurrency, fmtDiopter, fmtAxe } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProductCombobox } from '@/components/ui/ProductCombobox'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { updateStockAndNotify, ensureLowStockNotifications } from '@/lib/notifications'
import { HtCalculatorButton } from '@/components/shared/HtCalculator'

interface BCFormProps {
  initialData?: any;
  onSuccess: () => void;
  /** When true the form opens in view-only mode: every field is disabled and
   *  the Save button is hidden. Used for non-brouillon statuses (envoyé,
   *  confirmé, livré, annulé) where the BC must not be modified. */
  readOnly?: boolean;
}

export function BonCommandeForm({ initialData, onSuccess, readOnly = false }: BCFormProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Editing an existing document vs creating a new one. New documents are
  // forced to "brouillon" (the default value) and the status dropdown is
  // hidden during creation.
  const isEditing = !!initialData?.id;
  const [fournisseurs, setFournisseurs] = useState<any[]>([]);
  const [produits, setProduits] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [parametres, setParametres] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState<any>(null);
  const [verreProductId, setVerreProductId] = useState('');
  const [verrePrixHt, setVerrePrixHt] = useState(0);
  const [verreTva, setVerreTva] = useState(20);
  const [verreQuantite, setVerreQuantite] = useState(1);
  const [verreDesignation, setVerreDesignation] = useState('');
  // Unifocal (Unifocal) VL/VP split — only relevant when the linked ordonnance
  // is type_vision === 'progressif'. The user ticks the side(s) to order and
  // sets a price for each; the document renders/totals only ticked side(s).
  const [vlSelected, setVlSelected] = useState(true);
  const [vpSelected, setVpSelected] = useState(false);
  const [prixVl, setPrixVl] = useState(0);
  const [prixVp, setPrixVp] = useState(0);

  const ligneSchema = z.object({
    produitId: z.string().optional(),
    reference: z.string().optional(),
    designation: z.string().min(1, t('shared.validation.designation_required')),
    quantite: z.number().min(0.01, t('shared.validation.qty_min')),
    prixUnitaireHt: z.number().min(0, t('shared.validation.price_positive')),
    tva: z.number().min(0, t('shared.validation.vat_positive')),
    prescriptionId: z.string().optional(),
  });

  const bcSchema = z.object({
    type: z.string().optional(),
    fournisseurId: z.string().optional(),
    numeroFournisseur: z.string().optional(),
    clientId: z.string().optional(),
    dateEmission: z.string().min(1, t('shared.validation.emission_date_required')),
    dateLivraisonPrevue: z.string().optional(),
    statut: z.string().optional(),
    motifAnnulation: z.string().optional(),
    modePaiement: z.string().optional(),
    notes: z.string().optional(),
    lignes: z.array(ligneSchema).min(0).optional(),
  }).superRefine((data, ctx) => {
    if (data.type === 'verre') {
      if (!data.clientId || data.clientId === '' || data.clientId === 'none') {
        ctx.addIssue({ code: 'custom', path: ['clientId'], message: t('shared.validation.client_required') });
      }
    } else if (!data.lignes || data.lignes.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['lignes'], message: t('shared.validation.lines_min') });
    }
  });

  type BCFormValues = z.infer<typeof bcSchema>;

  const form = useForm<BCFormValues>({
    resolver: zodResolver(bcSchema),
    defaultValues: {
      type: initialData?.type || 'simple',
      fournisseurId: '',
      numeroFournisseur: '',
      clientId: '',
      dateEmission: new Date().toISOString().split('T')[0],
      dateLivraisonPrevue: '',
      statut: 'brouillon',
      motifAnnulation: '',
      modePaiement: 'Virement',
      notes: '',
      lignes: [
        {
          designation: '',
          quantite: 1,
          prixUnitaireHt: 0,
          tva: 20,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lignes',
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.id) return;
      
      try {
        const [{ data: fournisseursData }, { data: produitsData }, { data: clientsData }, { data: parametresData }] = await Promise.all([
          supabase.from('fournisseurs').select('*').eq('user_id', user.id).order('nom'),
          supabase.from('produits').select('*').eq('user_id', user.id).order('designation'),
          supabase.from('clients').select('*').eq('user_id', user.id).order('nom'),
          supabase.from('parametres').select('*').eq('user_id', user.id).limit(1)
        ]);
        
        setFournisseurs(fournisseursData || []);
        setProduits(produitsData || []);
        setClients(clientsData || []);
        setParametres(parametresData?.[0] || null);

        if (initialData?.id) {
          form.reset({
            ...initialData,
            type: initialData.type || 'simple',
            fournisseurId: initialData.fournisseurId?.toString() || '',
            numeroFournisseur: initialData.numeroFournisseur ?? initialData.numero_fournisseur ?? '',
            motifAnnulation: initialData.motifAnnulation ?? initialData.motif_annulation ?? '',
            clientId: initialData.clientId?.toString() || '',
            dateEmission: initialData.dateCommande ? new Date(initialData.dateCommande).toISOString().split('T')[0] : '',
            dateLivraisonPrevue: initialData.dateLivraisonPrevue ? new Date(initialData.dateLivraisonPrevue).toISOString().split('T')[0] : '',
            lignes: initialData.lignes?.map((l: any) => ({
              ...l,
              produitId: l.produitId?.toString() || '',
              prescriptionId: l.prescriptionId?.toString() || '',
              prixUnitaireHt: Number(l.prixUnitaireHt || 0),
              quantite: Number(l.quantite || 0),
              tva: Number(l.tva || 0),
              montantHt: Number(l.montantHt || 0),
              montantTtc: Number(l.montantTtc || 0)
            })) || []
          });

          // Verre commande: the prescription/produit/price live in local
          // state (not RHF fields), so we must rehydrate them from the saved
          // line when editing — otherwise the ordonnance shows up empty.
          if ((initialData.type || 'simple') === 'verre') {
            const verreLigne = (initialData.lignes || [])[0];
            if (verreLigne) {
              setVerreProductId(verreLigne.produitId?.toString() || '');
              setVerrePrixHt(Number(verreLigne.prixUnitaireHt || 0));
              setVerreTva(Number(verreLigne.tva || 20));
              setVerreQuantite(Number(verreLigne.quantite || 1));
              setVerreDesignation(verreLigne.designation || '');

              // Rehydrate the unifocal VL/VP split from the saved line.
              const savedVl = verreLigne.vlSelected ?? verreLigne.vl_selected;
              const savedVp = verreLigne.vpSelected ?? verreLigne.vp_selected;
              if (savedVl != null || savedVp != null) {
                setVlSelected(!!Number(savedVl));
                setVpSelected(!!Number(savedVp));
              }
              setPrixVl(Number(verreLigne.prixVl ?? verreLigne.prix_vl ?? 0));
              setPrixVp(Number(verreLigne.prixVp ?? verreLigne.prix_vp ?? 0));

              const prescrId = verreLigne.prescriptionId;
              if (prescrId) {
                const { data: prescrData } = await supabase
                  .from('prescriptions')
                  .select('*')
                  .eq('id', parseInt(prescrId.toString()))
                  .maybeSingle();
                if (prescrData) setSelectedPrescription(prescrData);
              }
            }
          }
        } else {
          form.reset({
            type: 'simple',
            fournisseurId: '',
            numeroFournisseur: '',
            clientId: '',
            dateEmission: new Date().toISOString().split('T')[0],
            dateLivraisonPrevue: '',
            statut: 'brouillon',
            motifAnnulation: '',
            modePaiement: 'Virement',
            notes: parametresData?.[0]?.pied_page_defaut || '',
            lignes: [
              {
                designation: '',
                quantite: 1,
                prixUnitaireHt: 0,
                tva: 20,
              },
            ],
          });
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error(t('shared.toast.loading_error'));
      }
    };
    fetchData();
  }, [initialData?.id]);

  const watchLignes = form.watch('lignes') || [];
  const bcType = form.watch('type');
  const clientId = form.watch('clientId');
  // A cancelled BC still lets the user write/update the cancellation reason,
  // even when the rest of the form is read-only.
  const isCancelled = form.watch('statut') === 'annulé';
  // When the BC is delivered or cancelled the form is locked (read-only),
  // but the supplier reference number ("numéro de bon fournisseur") stays
  // editable so it can be filled/corrected after delivery or cancellation.
  const currentStatut = form.watch('statut');
  const isDelivered = currentStatut === 'livré' || currentStatut === 'livrée';
  const supplierRefEditable = readOnly && (isDelivered || isCancelled);
  // When only the supplier reference should be editable, the parent fieldset
  // is left enabled (so that field works) and every OTHER control is locked
  // individually via `lockOthers`. A plain read-only BC keeps using the
  // fieldset-wide disable instead.
  const lockOthers = supplierRefEditable;
  const fieldsetDisabled = readOnly && !supplierRefEditable;
  const verreProducts = produits.filter((p) => (p.type_produit || p.typeProduit) === 'verre');
  const selectedClient = clients.find((c) => c.id.toString() === clientId);
  // A "Unifocal" ordonnance (internal type_vision === 'progressif') carries both
  // a VL and a VP refraction, so the user can split the order into VL and/or VP
  // with a separate price for each side.
  const isUnifocal = selectedPrescription?.type_vision === 'progressif';
  // Effective unit price HT for a verre line: for a unifocal ordonnance it is
  // the sum of the ticked side(s); otherwise the single verre price.
  const verreUnitHt = isUnifocal
    ? (vlSelected ? Number(prixVl || 0) : 0) + (vpSelected ? Number(prixVp || 0) : 0)
    : Number(verrePrixHt || 0);

  // Fetch active prescriptions for the selected client (verre commande only).
  // Nothing is shown until a client is chosen, and only that client's active
  // ordonnances are listed.
  useEffect(() => {
    if (bcType === 'verre' && clientId) {
      supabase
        .from('prescriptions')
        .select('*')
        .eq('client_id', parseInt(clientId))
        .eq('statut', 'active')
        .order('date_ordonnance', { ascending: false })
        .then(({ data }) => setPrescriptions(data || []));
    } else {
      setPrescriptions([]);
    }
  }, [bcType, clientId]);

  const totals = bcType === 'verre'
    ? (() => {
        const ht = verreUnitHt * (verreQuantite || 0);
        const tva = ht * (verreTva / 100);
        return { ht, tva, ttc: ht + tva };
      })()
    : watchLignes.reduce(
        (acc, ligne) => {
          const montantHt = (ligne.quantite || 0) * (ligne.prixUnitaireHt || 0);
          const montantTva = montantHt * ((ligne.tva || 0) / 100);
          return {
            ht: acc.ht + montantHt,
            tva: acc.tva + montantTva,
            ttc: acc.ttc + montantHt + montantTva,
          };
        },
        { ht: 0, tva: 0, ttc: 0 }
      );

  const handlePrescriptionSelect = (prescriptionId: string) => {
    const prescr = prescriptions.find((p) => p.id.toString() === prescriptionId);
    if (!prescr) return;
    setSelectedPrescription(prescr);
    const odStr = `OD: ${fmtDiopter(prescr.od_sph_vl, '-')}${prescr.od_cyl_vl ? ` (${fmtDiopter(prescr.od_cyl_vl)})` : ''}`;
    const ogStr = `OG: ${fmtDiopter(prescr.og_sph_vl, '-')}${prescr.og_cyl_vl ? ` (${fmtDiopter(prescr.og_cyl_vl)})` : ''}`;
    setVerreDesignation(`Verre ${prescr.verre_type || ''} — ${odStr} / ${ogStr}`);
  };

  const handleVerreProductSelect = (productId: string) => {
    setVerreProductId(productId);
    const produit = verreProducts.find((p) => p.id.toString() === productId);
    if (produit) {
      setVerrePrixHt(Number(produit.prix_achat_ht || produit.prixAchatHt || 0));
      setVerreTva(Number(produit.taux_tva || produit.tva || 20));
    }
  };

  async function generateBCReference(): Promise<string> {
    const year = new Date().getFullYear();
    const { data: existing } = await supabase
      .from('bons_commande')
      .select('numero')
      .like('numero', `BC-${year}-%`)
      .not('numero', 'is', null)
      .eq('user_id', user?.id);
    let maxNum = 0;
    if (existing) {
      for (const b of existing) {
        const match = b.numero?.match(new RegExp(`^BC-${year}-(\\d+)$`));
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }
    return `BC-${year}-${String(maxNum + 1).padStart(4, '0')}`;
  }

  // Targeted update of ONLY the still-editable fields on a locked
  // (delivered/cancelled) BC: the cancellation reason and the supplier
  // reference number. This runs OUTSIDE react-hook-form's validation
  // pipeline so it works even when the (locked) verre/line fields would
  // otherwise fail zod validation and silently swallow the submit.
  const saveMotifOnly = async () => {
    if (!initialData?.id) return;
    setIsLoading(true);
    try {
      const updates: Record<string, any> = {
        numero_fournisseur: form.getValues('numeroFournisseur')?.trim() || null,
      };
      // Only touch the cancellation reason when the BC is actually cancelled.
      if (isCancelled) {
        updates.motif_annulation = (form.getValues('motifAnnulation') || '').trim() || null;
      }
      const { error } = await supabase
        .from('bons_commande')
        .update(updates)
        .eq('id', initialData.id);
      if (error) throw error;
      toast.success(t('bons_commande.motif_saved', "Modifications enregistrées"));
      onSuccess();
    } catch (err: any) {
      console.error('Locked BC update error:', err);
      toast.error(err?.message || t('shared.toast.save_error'));
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: BCFormValues) => {
    // A read-only document can never be persisted through the full pipeline.
    if (readOnly) return;
    setIsLoading(true);
    try {
      if (data.type === 'verre' && !data.clientId) {
        toast.error(t('shared.validation.client_required'));
        setIsLoading(false);
        return;
      }
      if (data.type === 'verre' && !selectedPrescription) {
        toast.error('Veuillez sélectionner une ordonnance');
        setIsLoading(false);
        return;
      }
      if (data.type === 'verre' && !verreProductId) {
        toast.error('Veuillez sélectionner un produit verre');
        setIsLoading(false);
        return;
      }
      if (data.type === 'verre' && isUnifocal && !vlSelected && !vpSelected) {
        toast.error('Veuillez cocher au moins une vision (VL ou VP)');
        setIsLoading(false);
        return;
      }

      let bonId = initialData?.id;
      let numero;

      if (!bonId) {
        let attempts = 0;
        while (attempts < 10) {
          const candidate = await generateBCReference();
          const { data: dup } = await supabase.from('bons_commande').select('id').eq('numero', candidate).eq('user_id', user?.id).maybeSingle();
          if (!dup) {
            numero = candidate;
            break;
          }
          attempts++;
        }
      }

      const fournisseurId = data.fournisseurId && data.fournisseurId !== 'none' && data.fournisseurId !== '' 
        ? parseInt(data.fournisseurId) 
        : null;

      const parsedClientId = data.clientId && data.clientId !== 'none' && data.clientId !== ''
        ? parseInt(data.clientId)
        : null;

      const payload: any = {
        type: data.type || 'simple',
        numero_fournisseur: data.numeroFournisseur?.trim() || null,
        date_commande: new Date(data.dateEmission).toISOString(),
        date_livraison_prevue: data.dateLivraisonPrevue ? new Date(data.dateLivraisonPrevue).toISOString() : null,
        statut: data.statut || 'brouillon',
        // Only persist a cancellation reason while the BC is actually cancelled;
        // any other status clears it so a stale motif never lingers.
        motif_annulation: data.statut === 'annulé' ? (data.motifAnnulation?.trim() || null) : null,
        montant_ht: Number(totals.ht),
        montant_tva: Number(totals.tva),
        montant_ttc: Number(totals.ttc),
        numero: numero || initialData?.numero,
      };

      if (fournisseurId) {
        payload.fournisseur_id = fournisseurId;
      }
      if (parsedClientId) {
        payload.client_id = parsedClientId;
      }

      // Snapshot the previous stock_updated flag BEFORE the row gets
      // updated, so we can decide whether stock needs to move now.
      // For new rows the flag starts at 0 by definition.
      let priorStockUpdated = 0;
      if (bonId) {
        const { data: prior } = await supabase
          .from('bons_commande')
          .select('stock_updated')
          .eq('id', bonId)
          .single();
        priorStockUpdated = Number(prior?.stock_updated || 0);
      }

      if (!bonId) {
        let { data: newBon, error } = await supabase.from('bons_commande').insert([{ ...payload, user_id: user?.id }]).select().single();
        if (error?.message?.includes('duplicate key') || error?.code === '23505') {
          numero = await generateBCReference();
          payload.numero = numero;
          const retry = await supabase.from('bons_commande').insert([{ ...payload, user_id: user?.id }]).select().single();
          newBon = retry.data;
          error = retry.error;
        }
        if (error) {
          console.error('Insert error:', error);
          throw error;
        }
        bonId = newBon.id;
      } else {
        const { error } = await supabase.from('bons_commande').update(payload).eq('id', bonId);
        if (error) {
          console.error('Update error:', error);
          throw error;
        }
        await supabase.from('bon_commande_lignes').delete().eq('bon_commande_id', bonId);
      }

      const lignesPayload = data.type === 'verre' && selectedPrescription
        ? [{
            bon_commande_id: bonId,
            produit_id: verreProductId ? parseInt(verreProductId) : null,
            prescription_id: selectedPrescription.id,
            designation: verreDesignation || `Verre — Ordonnance #${selectedPrescription.id}`,
            quantite: Number(verreQuantite || 1),
            prix_unitaire_ht: Number(verreUnitHt || 0),
            tva: Number(verreTva || 20),
            montant_ht: Number(verreUnitHt || 0) * Number(verreQuantite || 1),
            montant_ttc: Number(verreUnitHt || 0) * Number(verreQuantite || 1) * (1 + Number(verreTva || 20) / 100),
            // Unifocal VL/VP split — persist which side(s) were ordered and
            // the per-side price so the printed PDF can render dynamically.
            vl_selected: isUnifocal ? (vlSelected ? 1 : 0) : 0,
            vp_selected: isUnifocal ? (vpSelected ? 1 : 0) : 0,
            prix_vl: isUnifocal && vlSelected ? Number(prixVl || 0) : null,
            prix_vp: isUnifocal && vpSelected ? Number(prixVp || 0) : null,
            ordre: 0,
          }]
        : (data.lignes || []).map((ligne, index) => {
            const mht = Number(ligne.quantite || 0) * Number(ligne.prixUnitaireHt || 0);
            const mtva = mht * (Number(ligne.tva || 0) / 100);
            const mttc = mht + mtva;
            const produitId = ligne.produitId && ligne.produitId !== 'none' && ligne.produitId !== '' 
              ? parseInt(ligne.produitId) 
              : null;
            const prescrId = ligne.prescriptionId && ligne.prescriptionId !== 'none' && ligne.prescriptionId !== ''
              ? parseInt(ligne.prescriptionId)
              : null;
            return {
              bon_commande_id: bonId,
              produit_id: produitId,
              prescription_id: prescrId,
              designation: ligne.designation || '',
              quantite: Number(ligne.quantite || 0),
              prix_unitaire_ht: Number(ligne.prixUnitaireHt || 0),
              tva: Number(ligne.tva || 20),
              montant_ht: mht,
              montant_ttc: mttc,
              ordre: index,
            };
          });

      if (lignesPayload.length > 0) {
        const { error: lignesError } = await supabase.from('bon_commande_lignes').insert(lignesPayload);
        if (lignesError) {
          console.error('Lignes insert error:', lignesError);
          throw lignesError;
        }

        // Stock side-effect — **idempotent**: only fire when the target
        // statut is "livré"/"livrée" AND the row was not already flagged
        // stock_updated. Re-saving the same BC without changing status
        // therefore never double-adds stock. If the user moves a "livré"
        // BC to a non-livré status via this form, the stock is reverted
        // exactly once (same semantics as the status dropdown helper).
        const isLivréStatus = (s?: string) => s === 'livré' || s === 'livrée';
        const wantStock = isLivréStatus(data.statut);

        if (wantStock && priorStockUpdated === 0) {
          const changedIds: (number | string)[] = [];
          for (const ligne of lignesPayload) {
            if (ligne.produit_id) {
              await updateStockAndNotify(user?.id, ligne.produit_id, Number(ligne.quantite));
              changedIds.push(ligne.produit_id);
            }
          }
          await ensureLowStockNotifications(user?.id, changedIds);
          await supabase.from('bons_commande').update({ stock_updated: 1 }).eq('id', bonId);
        } else if (!wantStock && priorStockUpdated === 1) {
          // Revert stock — clamped to zero so already-consumed inventory
          // doesn't block the administrative status change. We bypass
          // `updateStockAndNotify` here because that helper refuses to go
          // negative, which would silently skip the revert.
          for (const ligne of lignesPayload) {
            if (!ligne.produit_id) continue;
            const { data: produit } = await supabase
              .from('produits')
              .select('stock_actuel')
              .eq('id', ligne.produit_id)
              .single();
            if (!produit) continue;
            const current = Number(produit.stock_actuel || 0);
            const next = Math.max(0, current - Number(ligne.quantite || 0));
            await supabase
              .from('produits')
              .update({ stock_actuel: next })
              .eq('id', ligne.produit_id);
          }
          await supabase.from('bons_commande').update({ stock_updated: 0 }).eq('id', bonId);
          // The auto-generated BL (if any) should disappear with the revert
          // so the two views stay in sync.
          await supabase.from('bons_livraison').delete().eq('bon_commande_id', bonId);
        }
      }

      toast.success(initialData ? 'Bon de commande modifié' : 'Bon de commande créé');
      onSuccess();
    } catch (error: any) {
      console.error('Error submitting form:', error);
      toast.error(error?.message || error?.details || t('shared.toast.save_error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleProduitSelect = (index: number, produitId: string) => {
    const produit = produits.find((p) => p.id.toString() === produitId);
    if (produit) {
      form.setValue(`lignes.${index}.produitId`, produit.id.toString());
      form.setValue(`lignes.${index}.reference`, produit.reference || '');
      form.setValue(`lignes.${index}.designation`, produit.designation || produit.nom || '');
      form.setValue(`lignes.${index}.prixUnitaireHt`, Number(produit.prix_achat_ht || produit.prixAchatHt || 0));
      form.setValue(`lignes.${index}.tva`, Number(produit.taux_tva || produit.tva || 20));
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
      {readOnly && (
        <div className="rounded-[6px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-500/20 dark:bg-amber-950/20 dark:text-amber-300">
          {supplierRefEditable
            ? t('bons_commande.readonly_notice_supplier_ref', 'Ce bon de commande est en lecture seule. Seul le N° bon fournisseur reste modifiable.')
            : t('bons_commande.readonly_notice', 'Ce bon de commande est en lecture seule et ne peut pas être modifié.')}
        </div>
      )}
      <fieldset disabled={fieldsetDisabled} className="space-y-8 border-0 p-0 m-0 disabled:opacity-100">
      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 dark:bg-slate-900/60 dark:border-white/10 dark:rounded-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="space-y-2">
            <Label className="text-slate-700 font-semibold dark:text-slate-300">Type de commande</Label>
            <Select
              disabled={lockOthers}
              value={form.watch('type') || 'simple'}
              onValueChange={(val) => {
                form.setValue('type', val);
                if (val === 'verre') {
                  form.setValue('lignes', []);
                  setSelectedPrescription(null);
                  setVerreProductId('');
                  setVerrePrixHt(0);
                  setVerreTva(20);
                  setVerreQuantite(1);
                  setVerreDesignation('');
                } else {
                  form.setValue('clientId', '');
                  if ((form.getValues('lignes')?.length || 0) === 0) {
                    form.setValue('lignes', [{ designation: '', quantite: 1, prixUnitaireHt: 0, tva: 20 }]);
                  }
                }
              }}
            >
              <SelectTrigger className="bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10 dark:text-white [&_.lucide-chevron-down]:dark:text-slate-500">
                <SelectValue placeholder="Type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">Simple Commande</SelectItem>
                <SelectItem value="verre">Verre Commande</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-700 font-semibold dark:text-slate-300">{t('shared.form.supplier_label')}</Label>
            <Select
              disabled={lockOthers}
              value={form.watch('fournisseurId') || ""}
              onValueChange={(val) => form.setValue('fournisseurId', val)}
            >
              <SelectTrigger className="bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10 dark:text-white [&_.lucide-chevron-down]:dark:text-slate-500">
                <SelectValue placeholder={t('shared.form.select_supplier')} />
              </SelectTrigger>
              <SelectContent>
                {fournisseurs.map((f) => (
                  <SelectItem key={f.id} value={f.id.toString()}>
                    {f.nomSociete || f.nom || '-'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.fournisseurId && (
              <p className="text-xs text-red-500 font-medium">{form.formState.errors.fournisseurId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-slate-700 font-semibold dark:text-slate-300">{t('shared.form.supplier_ref_label')}</Label>
            {/* Supplier reference stays editable on delivered/cancelled (locked)
                bons de commande; never explicitly locked by `lockOthers`. */}
            <Input
              className="bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10 dark:text-white"
              placeholder={t('shared.form.supplier_ref_ph')}
              {...form.register('numeroFournisseur')}
            />
          </div>

          {bcType === 'verre' ? (
            <>
              <div className="space-y-2">
                <Label className="text-slate-700 font-semibold dark:text-slate-300">Client</Label>
                <Select
                  disabled={lockOthers}
                  value={form.watch('clientId') || ''}
                  onValueChange={(val) => {
                    form.setValue('clientId', val);
                    setSelectedPrescription(null);
                    setVerreProductId('');
                    setVerrePrixHt(0);
                    setVerreQuantite(1);
                    setVerreDesignation('');
                  }}
                >
                  <SelectTrigger className="bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10 dark:text-white [&_.lucide-chevron-down]:dark:text-slate-500">
                    <SelectValue placeholder="Sélectionner un client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.clientId && (
                  <p className="text-xs text-red-500 font-medium">{form.formState.errors.clientId.message}</p>
                )}
              </div>
              {selectedClient && (
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold dark:text-slate-300">CINE</Label>
                  <Input value={selectedClient.cine || '-'} disabled className="bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10 dark:text-white" />
                </div>
              )}
              {selectedClient?.couverture_sociale && (
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold dark:text-slate-300">Couverture</Label>
                  <Input value={`${(selectedClient.couverture_sociale || '').toUpperCase()} ${selectedClient.couverture_sociale_detail ? `(${selectedClient.couverture_sociale_detail})` : ''}`} disabled className="bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10 dark:text-white" />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-slate-700 font-semibold dark:text-slate-300">{t('shared.form.emission_date')}</Label>
                <Input type="date" disabled={lockOthers} className="bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10 dark:text-white dark:[color-scheme:dark]" {...form.register('dateEmission')} />
                {form.formState.errors.dateEmission && (
                  <p className="text-xs text-red-500 font-medium">{form.formState.errors.dateEmission.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700 font-semibold dark:text-slate-300">{t('shared.form.planned_delivery')}</Label>
                <Input type="date" disabled={lockOthers} className="bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10 dark:text-white dark:[color-scheme:dark]" {...form.register('dateLivraisonPrevue')} />
              </div>
            </>
          )}
        </div>

        {bcType === 'verre' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-700 font-semibold dark:text-slate-300">{t('shared.form.emission_date')}</Label>
              <Input type="date" disabled={lockOthers} className="bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10 dark:text-white dark:[color-scheme:dark]" {...form.register('dateEmission')} />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 font-semibold dark:text-slate-300">{t('shared.form.planned_delivery')}</Label>
              <Input type="date" disabled={lockOthers} className="bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10 dark:text-white dark:[color-scheme:dark]" {...form.register('dateLivraisonPrevue')} />
            </div>
            {isEditing && (
              <div className="space-y-2">
                <Label className="text-slate-700 font-semibold dark:text-slate-300">{t('shared.form.status_label')}</Label>
                <Select
                  disabled={lockOthers}
                  value={form.watch('statut') || ""}
                  onValueChange={(val) => form.setValue('statut', val)}
                >
                  <SelectTrigger className="bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10 dark:text-white [&_.lucide-chevron-down]:dark:text-slate-500">
                    <SelectValue placeholder={t('shared.form.select_status')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en_attente">{t('shared.status.pending')}</SelectItem>
                    <SelectItem value="confirmé">{t('shared.status.confirmed')}</SelectItem>
                    <SelectItem value="livré">{t('shared.status.delivered')}</SelectItem>
                    <SelectItem value="annulé">{t('shared.status.cancelled')}</SelectItem>
                    <SelectItem value="refusé">{t('shared.status.refused')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {bcType !== 'verre' && isEditing && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="space-y-2">
              <Label className="text-slate-700 font-semibold dark:text-slate-300">{t('shared.form.status_label')}</Label>
              <Select
                disabled={lockOthers}
                value={form.watch('statut') || ""}
                onValueChange={(val) => form.setValue('statut', val)}
              >
                <SelectTrigger className="bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10 dark:text-white [&_.lucide-chevron-down]:dark:text-slate-500">
                  <SelectValue placeholder={t('shared.form.select_status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en_attente">{t('shared.status.pending')}</SelectItem>
                  <SelectItem value="confirmé">{t('shared.status.confirmed')}</SelectItem>
                  <SelectItem value="livré">{t('shared.status.delivered')}</SelectItem>
                  <SelectItem value="annulé">{t('shared.status.cancelled')}</SelectItem>
                  <SelectItem value="refusé">{t('shared.status.refused')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {bcType === 'verre' ? (
        <>
          {/* Prescription selector for Verre — nothing shows until a client is
              chosen; only that client's active ordonnances are listed. */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2 dark:border-white/5">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Ordonnance</h3>
              <div className="flex gap-2">
                {clientId && (
                  <Select
                    disabled={lockOthers}
                    value={selectedPrescription ? selectedPrescription.id.toString() : ''}
                    onValueChange={(val) => {
                      handlePrescriptionSelect(val);
                    }}
                  >
                    <SelectTrigger className="h-9 bg-white border-slate-200 dark:bg-slate-950/50 dark:border-white/10 w-64">
                      <SelectValue placeholder="Ajouter une ordonnance..." />
                    </SelectTrigger>
                    <SelectContent>
                      {prescriptions.length === 0 && (
                        <SelectItem value="__none" disabled>Aucune ordonnance active</SelectItem>
                      )}
                      {prescriptions.map((p) => {
                        const odStr = `OD: ${fmtDiopter(p.od_sph_vl, '-')}${p.od_cyl_vl ? ` (${fmtDiopter(p.od_cyl_vl)})` : ''}`;
                        const ogStr = `OG: ${fmtDiopter(p.og_sph_vl, '-')}${p.og_cyl_vl ? ` (${fmtDiopter(p.og_cyl_vl)})` : ''}`;
                        return (
                          <SelectItem key={p.id} value={p.id.toString()}>
                            {p.date_ordonnance} — {odStr} / {ogStr} — {p.verre_type || '-'}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Prescription details */}
            {selectedPrescription ? (
              <div className="rounded-[6px] border border-sky-200 bg-sky-50/30 dark:border-sky-500/20 dark:bg-sky-950/10 overflow-hidden">
                <div className="px-4 py-3 border-b border-sky-100 dark:border-sky-500/10">
                  <p className="font-semibold text-sky-800 dark:text-sky-300">
                    Ordonnance du {selectedPrescription.date_ordonnance} — {selectedPrescription.verre_type || 'Standard'}
                  </p>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
                    <div className="col-span-2 md:col-span-4 font-semibold text-slate-600 dark:text-slate-400 border-b pb-1 mb-1">Réfraction VL</div>
                    <div className="text-slate-500">OD Sph: <span className="font-mono font-semibold text-slate-800 dark:text-white">{fmtDiopter(selectedPrescription.od_sph_vl, '-')}</span></div>
                    <div className="text-slate-500">OD Cyl: <span className="font-mono font-semibold text-slate-800 dark:text-white">{fmtDiopter(selectedPrescription.od_cyl_vl, '-')}</span></div>
                    <div className="text-slate-500">OD Axe: <span className="font-mono font-semibold text-slate-800 dark:text-white">{fmtAxe(selectedPrescription.od_axe_vl, '-')}</span></div>
                    <div className="text-slate-500">{isUnifocal ? 'OD Indice' : 'OD Add'}: <span className="font-mono font-semibold text-slate-800 dark:text-white">{isUnifocal ? (selectedPrescription.od_indice_vl ?? '-') : fmtDiopter(selectedPrescription.od_add_vl, '-')}</span></div>
                    <div className="text-slate-500">OG Sph: <span className="font-mono font-semibold text-slate-800 dark:text-white">{fmtDiopter(selectedPrescription.og_sph_vl, '-')}</span></div>
                    <div className="text-slate-500">OG Cyl: <span className="font-mono font-semibold text-slate-800 dark:text-white">{fmtDiopter(selectedPrescription.og_cyl_vl, '-')}</span></div>
                    <div className="text-slate-500">OG Axe: <span className="font-mono font-semibold text-slate-800 dark:text-white">{fmtAxe(selectedPrescription.og_axe_vl, '-')}</span></div>
                    <div className="text-slate-500">{isUnifocal ? 'OG Indice' : 'OG Add'}: <span className="font-mono font-semibold text-slate-800 dark:text-white">{isUnifocal ? (selectedPrescription.og_indice_vl ?? '-') : fmtDiopter(selectedPrescription.og_add_vl, '-')}</span></div>
                    {selectedPrescription.od_sph_vp != null && (
                      <>
                        <div className="col-span-2 md:col-span-4 font-semibold text-slate-600 dark:text-slate-400 border-b pb-1 mb-1 mt-2">Réfraction VP</div>
                        <div className="text-slate-500">OD Sph: <span className="font-mono font-semibold text-slate-800 dark:text-white">{fmtDiopter(selectedPrescription.od_sph_vp, '-')}</span></div>
                        <div className="text-slate-500">OD Cyl: <span className="font-mono font-semibold text-slate-800 dark:text-white">{fmtDiopter(selectedPrescription.od_cyl_vp, '-')}</span></div>
                        <div className="text-slate-500">OD Axe: <span className="font-mono font-semibold text-slate-800 dark:text-white">{fmtAxe(selectedPrescription.od_axe_vp, '-')}</span></div>
                        <div className="text-slate-500">{isUnifocal ? 'OD Indice' : 'OD Add'}: <span className="font-mono font-semibold text-slate-800 dark:text-white">{isUnifocal ? (selectedPrescription.od_indice_vp ?? '-') : fmtDiopter(selectedPrescription.od_add_vp, '-')}</span></div>
                        <div className="text-slate-500">OG Sph: <span className="font-mono font-semibold text-slate-800 dark:text-white">{fmtDiopter(selectedPrescription.og_sph_vp, '-')}</span></div>
                        <div className="text-slate-500">OG Cyl: <span className="font-mono font-semibold text-slate-800 dark:text-white">{fmtDiopter(selectedPrescription.og_cyl_vp, '-')}</span></div>
                        <div className="text-slate-500">OG Axe: <span className="font-mono font-semibold text-slate-800 dark:text-white">{fmtAxe(selectedPrescription.og_axe_vp, '-')}</span></div>
                        <div className="text-slate-500">{isUnifocal ? 'OG Indice' : 'OG Add'}: <span className="font-mono font-semibold text-slate-800 dark:text-white">{isUnifocal ? (selectedPrescription.og_indice_vp ?? '-') : fmtDiopter(selectedPrescription.og_add_vp, '-')}</span></div>
                      </>
                    )}
                    {(selectedPrescription.dp_binoculaire || selectedPrescription.dp_od || selectedPrescription.dp_og) && (
                      <>
                        <div className="col-span-2 md:col-span-4 font-semibold text-slate-600 dark:text-slate-400 border-b pb-1 mb-1 mt-2">DP &amp; Hauteurs</div>
                        <div className="text-slate-500">DP binoculaire: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.dp_binoculaire ?? '-'}</span></div>
                        <div className="text-slate-500">DP OD: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.dp_od ?? '-'}</span></div>
                        <div className="text-slate-500">DP OG: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.dp_og ?? '-'}</span></div>
                        <div className="text-slate-500">Haut. OD: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.hauteur_od ?? '-'}</span></div>
                        <div className="text-slate-500">Haut. OG: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.hauteur_og ?? '-'}</span></div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm">
                Sélectionnez une ordonnance pour afficher les détails
              </div>
            )}
          </div>

          {/* Pricing for Verre */}
          {selectedPrescription && (
            <div className="rounded-[6px] border border-amber-200 bg-amber-50/30 dark:border-amber-500/20 dark:bg-amber-950/10 p-4">
              <h4 className="font-semibold text-amber-800 dark:text-amber-300 mb-4">Produit &amp; Prix</h4>
              {verreProducts.length === 0 ? (
                <div className="text-center py-4 text-sm text-slate-500 dark:text-slate-400">
                  Aucun produit de type verre trouvé. Veuillez d'abord{' '}
                  <a href="/produits" className="text-amber-600 underline hover:text-amber-700">ajouter un produit verre</a>.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                      <Label className="text-slate-700 font-semibold dark:text-slate-300">Produit verre</Label>
                    <ProductCombobox
                      disabled={lockOthers}
                      products={verreProducts}
                      value={verreProductId}
                      onValueChange={handleVerreProductSelect}
                      className="h-11"
                      placeholder="Sélectionner un produit verre..."
                      searchPlaceholder="Rechercher un verre..."
                      renderLabel={(p) => `${p.designation || p.nom || 'Verre'} — ${p.reference || p.ref || ''}`}
                    />
                  </div>
                  {/* Unifocal (Unifocal) ordonnance → VL / VP split with a
                      checkbox + price for each side. Ticking a side includes it
                      in the order and in the printed PDF/totals. */}
                  {isUnifocal && (
                    <div className="rounded-[6px] border border-sky-200 bg-sky-50/40 dark:border-sky-500/20 dark:bg-sky-950/10 p-4 space-y-3">
                      <p className="text-sm font-semibold text-sky-800 dark:text-sky-300">
                        Ordonnance unifocale — choisir la/les vision(s) à commander
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            id="bc-vl-selected"
                            disabled={lockOthers}
                            checked={vlSelected}
                            onCheckedChange={(v) => setVlSelected(!!v)}
                          />
                          <Label htmlFor="bc-vl-selected" className="font-semibold text-slate-700 dark:text-slate-300 min-w-[120px]">
                            VL (Vision de Loin)
                          </Label>
                          <div className="flex items-center gap-1 flex-1">
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Prix VL HT"
                              disabled={lockOthers || !vlSelected}
                              value={prixVl}
                              onChange={(e) => setPrixVl(Number(e.target.value) || 0)}
                              className="h-11 bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10 dark:text-white"
                            />
                            <HtCalculatorButton
                              disabled={lockOthers || !vlSelected}
                              defaultTva={Number(verreTva) || 20}
                              onResult={(ht) => setPrixVl(ht)}
                              className="h-11 w-11"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Checkbox
                            id="bc-vp-selected"
                            disabled={lockOthers}
                            checked={vpSelected}
                            onCheckedChange={(v) => setVpSelected(!!v)}
                          />
                          <Label htmlFor="bc-vp-selected" className="font-semibold text-slate-700 dark:text-slate-300 min-w-[120px]">
                            VP (Vision de Près)
                          </Label>
                          <div className="flex items-center gap-1 flex-1">
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Prix VP HT"
                              disabled={lockOthers || !vpSelected}
                              value={prixVp}
                              onChange={(e) => setPrixVp(Number(e.target.value) || 0)}
                              className="h-11 bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10 dark:text-white"
                            />
                            <HtCalculatorButton
                              disabled={lockOthers || !vpSelected}
                              defaultTva={Number(verreTva) || 20}
                              onResult={(ht) => setPrixVp(ht)}
                              className="h-11 w-11"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {!isUnifocal && (
                    <div className="space-y-2">
                      <Label className="text-slate-700 font-semibold dark:text-slate-300">Prix unitaire HT</Label>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          step="0.01"
                          disabled={lockOthers}
                          value={verrePrixHt}
                          onChange={(e) => setVerrePrixHt(Number(e.target.value) || 0)}
                          className="h-11 bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10 dark:text-white"
                        />
                        <HtCalculatorButton
                          disabled={lockOthers}
                          defaultTva={Number(verreTva) || 20}
                          onResult={(ht) => setVerrePrixHt(ht)}
                          className="h-11 w-11"
                        />
                      </div>
                    </div>
                    )}
                    <div className="space-y-2">
                      <Label className="text-slate-700 font-semibold dark:text-slate-300">{t('shared.form.qty_label')}</Label>
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        disabled={lockOthers}
                        value={verreQuantite}
                        onChange={(e) => setVerreQuantite(Number(e.target.value) || 0)}
                        className="h-11 bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10 dark:text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-700 font-semibold dark:text-slate-300">TVA (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        disabled={lockOthers}
                        value={verreTva}
                        onChange={(e) => setVerreTva(Number(e.target.value) || 0)}
                        className="h-11 bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10 dark:text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-700 font-semibold dark:text-slate-300">Prix TTC</Label>
                      <div className="h-11 flex items-center px-3 bg-white border border-slate-300 rounded-lg dark:bg-slate-950/50 dark:border-white/10 dark:text-white font-bold text-lg">
                        {formatCurrency(verreUnitHt * (verreQuantite || 0) * (1 + verreTva / 100))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2 dark:border-white/5">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">{t('shared.form.lines_section')}</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={lockOthers}
            className="border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-500/30 dark:text-orange-400 dark:hover:bg-orange-500/10"
            onClick={() =>
              append({ designation: '', quantite: 1, prixUnitaireHt: 0, tva: 20 })
            }
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('shared.form.add_line')}
          </Button>
        </div>

        {/* Line items grid — wrapped in `overflow-x-auto` so the wide row
            scrolls horizontally on phones instead of overflowing the page. */}
        <div className="border border-slate-200 rounded-[6px] overflow-hidden dark:border-white/10 dark:rounded-sm">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-slate-100 border-b border-slate-200 dark:bg-slate-900/60 dark:border-white/10">
              <tr>
                <th className="p-3 text-start font-semibold text-slate-600 dark:text-slate-400">{t('shared.table.product')}</th>
                <th className="p-3 text-start font-semibold text-slate-600 dark:text-slate-400">{t('shared.form.description_label')}</th>
                <th className="p-3 text-right font-semibold text-slate-600 dark:text-slate-400 w-24">{t('shared.form.qty_label')}</th>
                <th className="p-3 text-right font-semibold text-slate-600 dark:text-slate-400 w-32">{t('shared.form.price_ht_label')}</th>
                <th className="p-3 text-right font-semibold text-slate-600 dark:text-slate-400 w-24">{t('shared.form.vat_pct_label')}</th>
                <th className="p-3 text-right font-semibold text-slate-600 dark:text-slate-400 w-32">{t('shared.form.subtotal_ht')}</th>
                <th className="p-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {fields.map((field, index) => {
                const ligne = watchLignes[index];
                const totalHt = (ligne?.quantite || 0) * (ligne?.prixUnitaireHt || 0);

                return (
                  <tr key={field.id} className="hover:bg-slate-50/50 transition-colors dark:hover:bg-white/[0.03]">
                    <td className="p-2">
                      <ProductCombobox
                        disabled={lockOthers}
                        products={produits}
                        value={form.watch(`lignes.${index}.produitId`) || ''}
                        onValueChange={(val) => handleProduitSelect(index, val)}
                        placeholder={t('shared.form.choose_product')}
                        renderLabel={(p) => p.designation || p.nom || '-'}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        disabled={lockOthers}
                        className="h-9 bg-white border-slate-200 dark:bg-slate-950/50 dark:border-white/10 dark:text-white"
                        {...form.register(`lignes.${index}.designation`)}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.01"
                        disabled={lockOthers}
                        className="h-9 text-right bg-white border-slate-200 dark:bg-slate-950/50 dark:border-white/10 dark:text-white"
                        {...form.register(`lignes.${index}.quantite`, { valueAsNumber: true })}
                      />
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          step="0.01"
                          disabled={lockOthers}
                          className="h-9 text-right bg-white border-slate-200 dark:bg-slate-950/50 dark:border-white/10 dark:text-white"
                          {...form.register(`lignes.${index}.prixUnitaireHt`, { valueAsNumber: true })}
                        />
                        <HtCalculatorButton
                          disabled={lockOthers}
                          defaultTva={Number(form.watch(`lignes.${index}.tva`)) || 20}
                          onResult={(ht) => form.setValue(`lignes.${index}.prixUnitaireHt`, ht, { shouldValidate: true, shouldDirty: true })}
                        />
                      </div>
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.01"
                        disabled={lockOthers}
                        className="h-9 text-right bg-white border-slate-200 dark:bg-slate-950/50 dark:border-white/10 dark:text-white"
                        {...form.register(`lignes.${index}.tva`, { valueAsNumber: true })}
                      />
                    </td>
                    <td className="p-2 text-right font-semibold text-slate-700 align-middle dark:text-white">
                      {formatCurrency(totalHt)}
                    </td>
                    <td className="p-2 text-center align-middle">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50 dark:text-rose-500/70 dark:hover:text-rose-500 dark:hover:bg-white/5"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1 || lockOthers}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      </div>
      )}

      <div className="flex flex-col md:flex-row gap-8">
        <div className="flex-1">
          <div className="space-y-2">
            <Label className="text-slate-700 font-semibold dark:text-slate-300">{t('shared.form.notes')}</Label>
            <Textarea 
              {...form.register('notes')} 
              disabled={lockOthers}
              placeholder={t('bons_commande.form_notes_ph')} 
              className="min-h-[100px] bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10 dark:text-white"
            />
          </div>
        </div>

        <div className="w-full md:w-80">
          <div className="bg-slate-50 p-6 rounded-[6px] border border-slate-200 space-y-4 dark:bg-slate-900/60 dark:border-white/10 dark:rounded-sm">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium dark:text-slate-400">{t('shared.form.subtotal_ht')}</span>
              <span className="font-bold text-slate-800 dark:text-white" dir="ltr">{formatCurrency(totals.ht)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium dark:text-slate-400">{t('shared.form.total_vat')}</span>
              <span className="font-bold text-slate-800 dark:text-white" dir="ltr">{formatCurrency(totals.tva)}</span>
            </div>
            <div className="h-px bg-slate-200 my-2 dark:bg-white/10" />
            <div className="flex justify-between items-center">
              <span className="text-slate-900 font-bold text-lg dark:text-white">{t('shared.form.total_ttc')}</span>
              <span className="text-2xl font-black text-orange-600 dark:text-orange-400" dir="ltr">{formatCurrency(totals.ttc)}</span>
            </div>
          </div>
        </div>
      </div>

      </fieldset>

      {/* Cancellation reason — shown only for an "annulé" BC. Kept OUTSIDE the
          disabled fieldset so it stays editable even in read-only mode, since
          a cancelled BC is otherwise locked. */}
      {isCancelled && (
        <div className="rounded-[6px] border border-rose-200 bg-rose-50/40 p-4 space-y-2 dark:border-rose-500/20 dark:bg-rose-950/10">
          <Label className="text-rose-800 font-semibold dark:text-rose-300">{t('shared.form.cancel_reason_label')}</Label>
          <Textarea
            {...form.register('motifAnnulation')}
            placeholder={t('shared.form.cancel_reason_ph')}
            className="min-h-[90px] bg-white border-rose-200 dark:bg-slate-950/50 dark:border-rose-500/20 dark:text-white"
          />
        </div>
      )}

      <div className="flex justify-end items-center space-x-4 pt-6 border-t dark:border-white/5">
        <Button type="button" variant="ghost" onClick={() => onSuccess()} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
          {readOnly ? t('shared.actions.close', 'Fermer') : t('shared.actions.cancel')}
        </Button>
        {supplierRefEditable ? (
          // Locked BC (delivered/cancelled): only the supplier reference (and,
          // when cancelled, the cancellation reason) can be saved. Bypass RHF
          // validation (the locked verre/line fields would fail it) by saving
          // those fields directly via a plain button instead of a submit.
          <Button
            type="button"
            onClick={saveMotifOnly}
            disabled={isLoading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 h-10 rounded-[4px] shadow-none dark:rounded-sm"
          >
            {isLoading ? t('shared.actions.saving') : t('shared.actions.save')}
          </Button>
        ) : !readOnly ? (
          <Button type="submit" disabled={isLoading} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 h-10 rounded-[4px] shadow-none dark:rounded-sm">
            {isLoading ? t('shared.actions.saving') : t('shared.actions.save')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

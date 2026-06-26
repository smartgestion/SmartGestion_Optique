import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { updateStockAndNotify } from '@/lib/notifications'
import { HtCalculatorButton } from '@/components/shared/HtCalculator'

interface AvoirFournisseurFormProps {
  onSuccess: () => void;
}

// Manual supplier credit note form (purchase-side mirror of AvoirForm).
//
// A manual avoir fournisseur has NO `bon_commande_id`. That NULL is what makes
// the Dashboard COUNT it: it reduces expenses (the inverse of a purchase) and
// reduces stock (goods returned to the supplier). Cancelling it reverses both.
// Avoirs auto-created from a cancelled Bon de Commande DO carry a
// `bon_commande_id`, are flagged `creation_mode = 'auto'`, and are excluded
// from those calculations (read-only).
//
// The "Type d'avoir" selector mirrors the Bon de Commande type:
//   - Simple Avoir  -> free-form line items (same as before)
//   - Verre Avoir   -> client + prescription + verre product workflow,
//                      identical to "Bon de Commande -> Verre Commande".
export function AvoirFournisseurForm({ onSuccess }: AvoirFournisseurFormProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [fournisseurs, setFournisseurs] = useState<any[]>([]);
  const [produits, setProduits] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [bonsCommande, setBonsCommande] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Verre state (kept outside the field-array, like BonCommandeForm).
  const [selectedPrescription, setSelectedPrescription] = useState<any>(null);
  const [verreProductId, setVerreProductId] = useState('');
  const [verrePrixHt, setVerrePrixHt] = useState(0);
  const [verreTva, setVerreTva] = useState(20);
  const [verreQuantite, setVerreQuantite] = useState(1);
  const [verreDesignation, setVerreDesignation] = useState('');

  const ligneSchema = z.object({
    produitId: z.string().optional(),
    reference: z.string().optional(),
    designation: z.string().min(1, t('shared.validation.designation_required')),
    quantite: z.number().min(0.01, t('shared.validation.qty_min')),
    prixUnitaireHt: z.number().min(0, t('shared.validation.price_positive')),
    tva: z.number().min(0, t('shared.validation.vat_positive')),
  });

  const avoirSchema = z.object({
    type: z.string().optional(),
    fournisseurId: z.string().min(1, t('shared.validation.client_required')),
    bonCommandeId: z.string().optional(),
    numeroFournisseur: z.string().optional(),
    motif: z.string().optional(),
    clientId: z.string().optional(),
    dateEmission: z.string().min(1, t('shared.validation.emission_date_required')),
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

  type AvoirFournisseurFormValues = z.infer<typeof avoirSchema>;

  const form = useForm<AvoirFournisseurFormValues>({
    resolver: zodResolver(avoirSchema),
    defaultValues: {
      type: 'simple',
      fournisseurId: '',
      bonCommandeId: '',
      numeroFournisseur: '',
      motif: '',
      clientId: '',
      dateEmission: new Date().toISOString().split('T')[0],
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
        const [{ data: fournisseursData }, { data: produitsData }, { data: clientsData }, { data: bonsCommandeData }] = await Promise.all([
          supabase.from('fournisseurs').select('*').eq('user_id', user.id).order('nom'),
          supabase.from('produits').select('*').eq('user_id', user.id).order('nom'),
          supabase.from('clients').select('*').eq('user_id', user.id).order('nom'),
          // Only confirmed/delivered bons de commande (the ones actually received).
          supabase
            .from('bons_commande')
            .select('id, numero, statut, fournisseur_id, date_commande, montant_ttc')
            .eq('user_id', user.id)
            .in('statut', ['confirmé', 'livré', 'livrée'])
            .order('date_commande', { ascending: false }),
        ]);
        setFournisseurs(fournisseursData || []);
        setProduits(produitsData || []);
        setClients(clientsData || []);
        setBonsCommande(bonsCommandeData || []);
      } catch (error) {
        toast.error(t('shared.toast.loading_error'));
      }
    };
    fetchData();
  }, []);

  const avoirType = form.watch('type');
  const clientId = form.watch('clientId');
  const fournisseurId = form.watch('fournisseurId');
  const watchLignes = form.watch('lignes') || [];
  const verreProducts = produits.filter((p) => (p.type_produit || p.typeProduit) === 'verre');
  const selectedClient = clients.find((c) => c.id.toString() === clientId);
  // When a supplier is selected, narrow the BC list to that supplier's orders
  // (more relevant); otherwise show every confirmed/delivered BC.
  const bonsCommandeBC = fournisseurId && fournisseurId !== 'none'
    ? bonsCommande.filter((bc) => String(bc.fournisseur_id) === String(fournisseurId))
    : bonsCommande;

  // Fetch active prescriptions for the selected client (verre avoir only).
  useEffect(() => {
    if (avoirType === 'verre' && clientId) {
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
  }, [avoirType, clientId]);

  const totals = avoirType === 'verre'
    ? (() => {
        const ht = verrePrixHt * (verreQuantite || 0);
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
    const odStr = `OD: ${prescr.od_sph_vl ?? '-'}${prescr.od_cyl_vl ? ` (${prescr.od_cyl_vl})` : ''}`;
    const ogStr = `OG: ${prescr.og_sph_vl ?? '-'}${prescr.og_cyl_vl ? ` (${prescr.og_cyl_vl})` : ''}`;
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

  async function generateAvoirRef(): Promise<string> {
    const year = new Date().getFullYear();
    const { data: existing } = await supabase
      .from('avoirs_fournisseur')
      .select('numero')
      .like('numero', `AVF-${year}-%`)
      .eq('user_id', user?.id);
    let maxNum = 0;
    for (const a of existing || []) {
      const match = a.numero?.match(new RegExp(`^AVF-${year}-(\\d+)$`));
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    return `AVF-${year}-${String(maxNum + 1).padStart(4, '0')}`;
  }

  const onSubmit = async (data: AvoirFournisseurFormValues) => {
    setIsLoading(true);
    try {
      if (data.type === 'verre') {
        if (!data.clientId) { toast.error(t('shared.validation.client_required')); setIsLoading(false); return; }
        if (!selectedPrescription) { toast.error('Veuillez sélectionner une ordonnance'); setIsLoading(false); return; }
        if (!verreProductId) { toast.error('Veuillez sélectionner un produit verre'); setIsLoading(false); return; }
      }

      let avoirNum: string | undefined;
      let attempts = 0;
      while (attempts < 10) {
        const candidate = await generateAvoirRef();
        const { data: dup } = await supabase.from('avoirs_fournisseur').select('id').eq('numero', candidate).eq('user_id', user?.id).maybeSingle();
        if (!dup) { avoirNum = candidate; break; }
        attempts++;
      }

      const payload: any = {
        user_id: user?.id,
        numero: avoirNum,
        // Optional reference to a Bon de Commande chosen by the user. It is
        // purely a link — this stays a MANUAL avoir (creation_mode 'manuel'),
        // so it still applies stock/expense like any manual avoir.
        bon_commande_id: data.bonCommandeId && data.bonCommandeId !== 'none' && data.bonCommandeId !== ''
          ? Number(data.bonCommandeId)
          : null,
        // Avoir type mirrors the BC type (Simple Avoir / Verre Avoir).
        type: data.type === 'verre' ? 'verre' : 'simple',
        // Manual creation mode -> editable, applies stock/expense/totals.
        creation_mode: 'manuel',
        fournisseur_id: data.fournisseurId === 'none' ? null : Number(data.fournisseurId),
        numero_fournisseur: data.numeroFournisseur?.trim() || null,
        motif: data.motif?.trim() || null,
        date_emission: new Date(data.dateEmission).toISOString(),
        montant_ht: Number(totals.ht) || 0,
        montant_tva: Number(totals.tva) || 0,
        montant_ttc: Number(totals.ttc) || 0,
        statut: 'émis',
        notes: data.notes || '',
      };

      let { data: newAvoir, error } = await supabase.from('avoirs_fournisseur').insert([payload]).select().single();
      if (error?.message?.includes('duplicate key') || error?.code === '23505') {
        avoirNum = await generateAvoirRef();
        payload.numero = avoirNum;
        const retry = await supabase.from('avoirs_fournisseur').insert([payload]).select().single();
        newAvoir = retry.data;
        error = retry.error;
      }
      if (error) throw error;

      const lignesPayload = data.type === 'verre' && selectedPrescription
        ? [{
            avoir_fournisseur_id: Number(newAvoir.id),
            produit_id: verreProductId ? Number(verreProductId) : null,
            prescription_id: selectedPrescription.id,
            designation: verreDesignation || `Verre — Ordonnance #${selectedPrescription.id}`,
            quantite: Number(verreQuantite || 1),
            prix_unitaire_ht: Number(verrePrixHt || 0),
            tva: Number(verreTva || 20),
            montant_ht: Number(verrePrixHt || 0) * Number(verreQuantite || 1),
            montant_ttc: Number(verrePrixHt || 0) * Number(verreQuantite || 1) * (1 + Number(verreTva || 20) / 100),
            ordre: 0,
          }]
        : (data.lignes || []).map((ligne: any, index: number) => ({
            avoir_fournisseur_id: Number(newAvoir.id),
            produit_id: ligne.produitId ? Number(ligne.produitId) : null,
            designation: ligne.designation || 'Article sans désignation',
            quantite: Number(ligne.quantite) || 1,
            prix_unitaire_ht: Number(ligne.prixUnitaireHt) || 0,
            tva: Number(ligne.tva) || 20,
            montant_ht: Number(ligne.prixUnitaireHt || 0) * Number(ligne.quantite || 1) || 0,
            montant_ttc: (Number(ligne.prixUnitaireHt || 0) * Number(ligne.quantite || 1)) * (1 + Number(ligne.tva || 20) / 100) || 0,
            ordre: index,
          }));

      if (lignesPayload.length > 0) {
        const { error: lignesError } = await supabase.from('avoir_fournisseur_lignes').insert(lignesPayload);
        if (lignesError) throw lignesError;
      }

      // Reduce stock: a manual supplier credit note represents goods returned
      // TO the supplier, so each line that references a product SUBTRACTS its
      // quantity from stock (negative delta — the inverse of a purchase/BC
      // delivery which adds stock).
      for (const ligne of lignesPayload) {
        if (ligne.produit_id) {
          await updateStockAndNotify(user?.id, ligne.produit_id, -Number(ligne.quantite));
        }
      }

      toast.success(t('avoirs_fournisseur.toast_created'));
      onSuccess();
    } catch (error: any) {
      console.error('Avoir fournisseur save error:', error);
      toast.error(error.message || t('shared.toast.save_error'));
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
      // Purchase side: prefer the purchase price if available.
      form.setValue(`lignes.${index}.prixUnitaireHt`, Number(produit.prix_achat_ht || produit.prixAchatHt || produit.prix_vente_ht || 0));
      form.setValue(`lignes.${index}.tva`, Number(produit.taux_tva ?? produit.tauxTva ?? produit.tva ?? 20));
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
      <div className="dark:bg-slate-900/40 dark:border-white/10 bg-slate-50 p-4 rounded-sm border border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="space-y-2">
            <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('avoirs_fournisseur.type_label')}</Label>
            <Select
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
              <SelectTrigger className="dark:bg-slate-950/50 dark:border-white/10 bg-white border-slate-300">
                <SelectValue placeholder={t('avoirs_fournisseur.type_label')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">{t('avoirs_fournisseur.type_simple')}</SelectItem>
                <SelectItem value="verre">{t('avoirs_fournisseur.type_verre')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('shared.form.supplier_label')}</Label>
            <Select
              value={form.watch('fournisseurId') || ""}
              onValueChange={(val) => {
                form.setValue('fournisseurId', val);
                // Reset the BC link if it no longer belongs to the new supplier.
                const currentBcId = form.getValues('bonCommandeId');
                if (currentBcId) {
                  const bc = bonsCommande.find((b) => b.id.toString() === currentBcId);
                  if (!bc || String(bc.fournisseur_id) !== String(val)) {
                    form.setValue('bonCommandeId', '');
                  }
                }
              }}
            >
              <SelectTrigger className="dark:bg-slate-950/50 dark:border-white/10 bg-white border-slate-300">
                <SelectValue placeholder={t('shared.form.select_supplier')} />
              </SelectTrigger>
              <SelectContent>
                {fournisseurs.map((f) => (
                  <SelectItem key={f.id} value={f.id.toString()}>
                    {f.nom || f.nomSociete || '-'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.fournisseurId && (
              <p className="text-xs text-red-500 font-medium">{form.formState.errors.fournisseurId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('shared.form.supplier_ref_label')}</Label>
            <Input
              className="dark:bg-slate-950/50 dark:border-white/10 dark:focus:border-[#267E54] bg-white border-slate-300"
              placeholder={t('shared.form.supplier_ref_ph')}
              {...form.register('numeroFournisseur')}
            />
          </div>

          <div className="space-y-2">
            <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('avoirs_fournisseur.bc_label')}</Label>
            <Select
              value={form.watch('bonCommandeId') || 'none'}
              onValueChange={(val) => form.setValue('bonCommandeId', val === 'none' ? '' : val)}
            >
              <SelectTrigger className="dark:bg-slate-950/50 dark:border-white/10 bg-white border-slate-300">
                <SelectValue placeholder={t('avoirs_fournisseur.bc_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('avoirs_fournisseur.bc_none')}</SelectItem>
                {bonsCommandeBC.map((bc) => (
                  <SelectItem key={bc.id} value={bc.id.toString()}>
                    {bc.numero || `BC #${bc.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {avoirType === 'verre' ? (
            <>
              <div className="space-y-2">
                <Label className="dark:text-slate-400 text-slate-700 font-semibold">Client</Label>
                <Select
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
                  <SelectTrigger className="dark:bg-slate-950/50 dark:border-white/10 bg-white border-slate-300">
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
              <div className="space-y-2">
                <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('shared.form.emission_date')}</Label>
                <Input type="date" className="dark:bg-slate-950/50 dark:border-white/10 dark:focus:border-[#267E54] bg-white border-slate-300 dark:[color-scheme:dark]" {...form.register('dateEmission')} />
                {form.formState.errors.dateEmission && (
                  <p className="text-xs text-red-500 font-medium">{form.formState.errors.dateEmission.message}</p>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('shared.form.emission_date')}</Label>
              <Input type="date" className="dark:bg-slate-950/50 dark:border-white/10 dark:focus:border-[#267E54] bg-white border-slate-300 dark:[color-scheme:dark]" {...form.register('dateEmission')} />
              {form.formState.errors.dateEmission && (
                <p className="text-xs text-red-500 font-medium">{form.formState.errors.dateEmission.message}</p>
              )}
            </div>
          )}
        </div>

        {avoirType === 'verre' && selectedClient && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="space-y-2">
              <Label className="dark:text-slate-400 text-slate-700 font-semibold">CINE</Label>
              <Input value={selectedClient.cine || '-'} disabled className="dark:bg-slate-950/50 dark:border-white/10 bg-white border-slate-300" />
            </div>
            {selectedClient?.couverture_sociale && (
              <div className="space-y-2">
                <Label className="dark:text-slate-400 text-slate-700 font-semibold">Couverture</Label>
                <Input value={`${(selectedClient.couverture_sociale || '').toUpperCase()} ${selectedClient.couverture_sociale_detail ? `(${selectedClient.couverture_sociale_detail})` : ''}`} disabled className="dark:bg-slate-950/50 dark:border-white/10 bg-white border-slate-300" />
              </div>
            )}
          </div>
        )}
      </div>

      {avoirType === 'verre' ? (
        <>
          {/* Prescription selector for Verre — nothing shows until a client is
              chosen; only that client's active ordonnances are listed. */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2 dark:border-white/5">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Ordonnance</h3>
              <div className="flex gap-2">
                {clientId && (
                  <Select
                    value={selectedPrescription ? selectedPrescription.id.toString() : ''}
                    onValueChange={(val) => handlePrescriptionSelect(val)}
                  >
                    <SelectTrigger className="h-9 bg-white border-slate-200 dark:bg-slate-950/50 dark:border-white/10 w-64">
                      <SelectValue placeholder="Ajouter une ordonnance..." />
                    </SelectTrigger>
                    <SelectContent>
                      {prescriptions.length === 0 && (
                        <SelectItem value="__none" disabled>Aucune ordonnance active</SelectItem>
                      )}
                      {prescriptions.map((p) => {
                        const odStr = `OD: ${p.od_sph_vl ?? '-'}${p.od_cyl_vl ? ` (${p.od_cyl_vl})` : ''}`;
                        const ogStr = `OG: ${p.og_sph_vl ?? '-'}${p.og_cyl_vl ? ` (${p.og_cyl_vl})` : ''}`;
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
                    <div className="text-slate-500">OD Sph: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.od_sph_vl ?? '-'}</span></div>
                    <div className="text-slate-500">OD Cyl: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.od_cyl_vl ?? '-'}</span></div>
                    <div className="text-slate-500">OD Axe: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.od_axe_vl ?? '-'}</span></div>
                    <div className="text-slate-500">OD Add: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.od_add_vl ?? '-'}</span></div>
                    <div className="text-slate-500">OG Sph: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.og_sph_vl ?? '-'}</span></div>
                    <div className="text-slate-500">OG Cyl: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.og_cyl_vl ?? '-'}</span></div>
                    <div className="text-slate-500">OG Axe: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.og_axe_vl ?? '-'}</span></div>
                    <div className="text-slate-500">OG Add: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.og_add_vl ?? '-'}</span></div>
                    {selectedPrescription.od_sph_vp != null && (
                      <>
                        <div className="col-span-2 md:col-span-4 font-semibold text-slate-600 dark:text-slate-400 border-b pb-1 mb-1 mt-2">Réfraction VP</div>
                        <div className="text-slate-500">OD Sph: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.od_sph_vp ?? '-'}</span></div>
                        <div className="text-slate-500">OD Cyl: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.od_cyl_vp ?? '-'}</span></div>
                        <div className="text-slate-500">OD Axe: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.od_axe_vp ?? '-'}</span></div>
                        <div className="text-slate-500">OD Add: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.od_add_vp ?? '-'}</span></div>
                        <div className="text-slate-500">OG Sph: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.og_sph_vp ?? '-'}</span></div>
                        <div className="text-slate-500">OG Cyl: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.og_cyl_vp ?? '-'}</span></div>
                        <div className="text-slate-500">OG Axe: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.og_axe_vp ?? '-'}</span></div>
                        <div className="text-slate-500">OG Add: <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.og_add_vp ?? '-'}</span></div>
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
                    <Select value={verreProductId} onValueChange={handleVerreProductSelect}>
                      <SelectTrigger className="bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10">
                        <SelectValue placeholder="Sélectionner un produit verre..." />
                      </SelectTrigger>
                      <SelectContent>
                        {verreProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id.toString()}>
                            {p.designation || p.nom || 'Verre'} — {(p.reference || p.ref || '')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label className="text-slate-700 font-semibold dark:text-slate-300">Prix unitaire HT</Label>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          step="0.01"
                          value={verrePrixHt}
                          onChange={(e) => setVerrePrixHt(Number(e.target.value) || 0)}
                          className="h-11 bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10 dark:text-white"
                        />
                        <HtCalculatorButton
                          defaultTva={Number(verreTva) || 20}
                          onResult={(ht) => setVerrePrixHt(ht)}
                          className="h-11 w-11"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-700 font-semibold dark:text-slate-300">{t('shared.form.qty_label')}</Label>
                      <Input
                        type="number"
                        step="1"
                        min="1"
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
                        value={verreTva}
                        onChange={(e) => setVerreTva(Number(e.target.value) || 0)}
                        className="h-11 bg-white border-slate-300 dark:bg-slate-950/50 dark:border-white/10 dark:text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-700 font-semibold dark:text-slate-300">Prix TTC</Label>
                      <div className="h-11 flex items-center px-3 bg-white border border-slate-300 rounded-lg dark:bg-slate-950/50 dark:border-white/10 dark:text-white font-bold text-lg">
                        {formatCurrency(verrePrixHt * (verreQuantite || 0) * (1 + verreTva / 100))}
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
        <div className="flex items-center justify-between border-b dark:border-white/10 pb-2">
          <h3 className="text-lg font-bold dark:text-card-foreground text-slate-800">{t('shared.form.lines_section')}</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="dark:border-white/10 dark:text-muted-foreground dark:hover:bg-white/5 border-orange-200 text-orange-700 hover:bg-orange-50"
            onClick={() =>
              append({ designation: '', quantite: 1, prixUnitaireHt: 0, tva: 20 })
            }
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('shared.form.add_line')}
          </Button>
        </div>

        <div className="border dark:border-white/10 border-slate-200 rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="border-b dark:border-white/10">
              <tr>
                <th className="p-3 text-start font-semibold dark:text-muted-foreground text-slate-600">{t('shared.table.product')}</th>
                <th className="p-3 text-start font-semibold dark:text-muted-foreground text-slate-600">{t('shared.form.description_label')}</th>
                <th className="p-3 text-right font-semibold dark:text-muted-foreground text-slate-600 w-24">{t('shared.form.qty_label')}</th>
                <th className="p-3 text-right font-semibold dark:text-muted-foreground text-slate-600 w-32">{t('shared.form.price_ht_label')}</th>
                <th className="p-3 text-right font-semibold dark:text-muted-foreground text-slate-600 w-24">{t('shared.form.vat_pct_label')}</th>
                <th className="p-3 text-right font-semibold dark:text-muted-foreground text-slate-600 w-32">{t('shared.form.subtotal_ht')}</th>
                <th className="p-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-white/10 divide-slate-100">
              {fields.map((field, index) => {
                const ligne = watchLignes[index];
                const totalHt = (ligne?.quantite || 0) * (ligne?.prixUnitaireHt || 0);
                const selectedProductId = form.watch(`lignes.${index}.produitId`);
                const selectedProduct = selectedProductId ? produits.find(p => p.id.toString() === selectedProductId) : null;
                const displayText = selectedProduct ? (selectedProduct.nom || selectedProduct.reference || '-') : (ligne?.designation || '');

                return (
                  <tr key={field.id}>
                    <td className="p-2">
                      <Select
                        value={selectedProductId || ""}
                        onValueChange={(val) => handleProduitSelect(index, val)}
                      >
                        <SelectTrigger className="h-9 dark:bg-slate-950/50 dark:border-white/10 bg-white border-slate-200">
                          {selectedProductId ? (
                            <span className={!selectedProduct ? 'text-orange-500' : ''}>
                              {displayText}
                            </span>
                          ) : (
                            <SelectValue placeholder={t('shared.form.choose_product')} />
                          )}
                        </SelectTrigger>
                        <SelectContent className="max-h-[400px] overflow-y-auto">
                          {produits.map((p) => (
                            <SelectItem key={p.id} value={p.id.toString()}>
                              {p.nom || p.reference || '-'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Input
                        className="h-9 dark:bg-slate-950/50 dark:border-white/10 dark:focus:border-[#267E54] bg-white border-slate-200"
                        {...form.register(`lignes.${index}.designation`)}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.01"
                        className="h-9 text-right dark:bg-slate-950/50 dark:border-white/10 dark:focus:border-[#267E54] bg-white border-slate-200"
                        {...form.register(`lignes.${index}.quantite`, { valueAsNumber: true })}
                      />
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          step="0.01"
                          className="h-9 text-right dark:bg-slate-950/50 dark:border-white/10 dark:focus:border-[#267E54] bg-white border-slate-200"
                          {...form.register(`lignes.${index}.prixUnitaireHt`, { valueAsNumber: true })}
                        />
                        <HtCalculatorButton
                          defaultTva={Number(form.watch(`lignes.${index}.tva`)) || 20}
                          onResult={(ht) => form.setValue(`lignes.${index}.prixUnitaireHt`, ht, { shouldValidate: true, shouldDirty: true })}
                        />
                      </div>
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.01"
                        className="h-9 text-right dark:bg-slate-950/50 dark:border-white/10 dark:focus:border-[#267E54] bg-white border-slate-200"
                        {...form.register(`lignes.${index}.tva`, { valueAsNumber: true })}
                      />
                    </td>
                    <td className="p-2 text-right font-semibold dark:text-card-foreground text-slate-700 align-middle">
                      {formatCurrency(totalHt)}
                    </td>
                    <td className="p-2 text-center align-middle">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 dark:text-muted-foreground dark:hover:text-red-400 dark:hover:bg-red-500/10 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
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
        {form.formState.errors.lignes && (
          <p className="text-sm text-red-500 font-medium">{form.formState.errors.lignes.message}</p>
        )}
      </div>
      )}

      <div className="flex flex-col md:flex-row gap-8">
        <div className="flex-1 space-y-4">
          <div className="space-y-2">
            <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('shared.form.motif_label')}</Label>
            <Textarea
              {...form.register('motif')}
              placeholder={t('shared.form.motif_ph')}
              className="min-h-[80px] dark:bg-slate-950/50 dark:border-white/10 dark:focus:border-[#267E54] bg-white border-slate-300"
            />
          </div>
          <div className="space-y-2">
            <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('shared.form.notes')}</Label>
            <Textarea
              {...form.register('notes')}
              placeholder={t('shared.form.notes_placeholder')}
              className="min-h-[100px] dark:bg-slate-950/50 dark:border-white/10 dark:focus:border-[#267E54] bg-white border-slate-300"
            />
          </div>
        </div>

        <div className="w-full md:w-80">
          <div className="dark:bg-slate-900/60 dark:border-white/10 bg-slate-50 p-6 rounded-sm border border-slate-200 space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="dark:text-muted-foreground text-slate-500 font-medium">{t('shared.form.subtotal_ht')}</span>
              <span className="font-bold dark:text-card-foreground text-slate-800" dir="ltr">{formatCurrency(totals.ht)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="dark:text-muted-foreground text-slate-500 font-medium">{t('shared.form.total_vat')}</span>
              <span className="font-bold dark:text-card-foreground text-slate-800" dir="ltr">{formatCurrency(totals.tva)}</span>
            </div>
            <div className="h-px dark:bg-white/10 bg-slate-200 my-2" />
            <div className="flex justify-between items-center">
              <span className="dark:text-card-foreground text-slate-900 font-bold text-lg">{t('shared.form.total_ttc')}</span>
              <span className="text-2xl font-black text-orange-500" dir="ltr">{formatCurrency(totals.ttc)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end items-center space-x-4 pt-6 border-t dark:border-white/10">
        <Button type="button" variant="ghost" onClick={() => onSuccess()} className="dark:text-muted-foreground dark:hover:text-card-foreground text-slate-500 hover:text-slate-700">
          {t('shared.actions.cancel')}
        </Button>
        <Button type="submit" disabled={isLoading} className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 h-10 rounded-sm shadow-none">
          {isLoading ? t('shared.actions.saving') : t('shared.actions.save')}
        </Button>
      </div>
    </form>
  );
}

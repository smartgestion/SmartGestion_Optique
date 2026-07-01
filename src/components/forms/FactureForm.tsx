import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Plus, Trash2, Eye } from 'lucide-react'
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
import { toast } from 'sonner'
import { formatCurrency, fmtDiopter } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { updateStockAndNotify, ensureLowStockNotifications } from '@/lib/notifications'
import { HtCalculatorButton } from '@/components/shared/HtCalculator'
import { ProductCombobox } from '@/components/ui/ProductCombobox'

interface FactureFormProps {
  initialData?: any;
  onSuccess: () => void;
  /** When set, the created/updated facture is linked to this Ordre de Travail. */
  ordreTravailId?: number | string | null;
}

export function FactureForm({ initialData, onSuccess, ordreTravailId }: FactureFormProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Editing an existing document vs creating a new one. New documents are
  // forced to "brouillon" (the default value) and the status dropdown is
  // hidden during creation.
  const isEditing = !!initialData?.id;
  const [clients, setClients] = useState<any[]>([]);
  const [produits, setProduits] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [parametres, setParametres] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const ligneSchema = z.object({
    produitId: z.string().optional(),
    reference: z.string().optional(),
    designation: z.string().min(1, t('shared.validation.designation_required')),
    quantite: z.number().min(0.01, t('shared.validation.qty_min')),
    prixUnitaireHt: z.number().min(0, t('shared.validation.price_positive')),
    tva: z.number().min(0, t('shared.validation.vat_positive')),
    prescriptionId: z.string().optional(),
    prixOdHt: z.coerce.number().optional(),
    prixOgHt: z.coerce.number().optional(),
    // Unifocal (Unifocal) VL/VP split — per-line selection + price of each side.
    vlSelected: z.boolean().optional(),
    vpSelected: z.boolean().optional(),
    prixVl: z.coerce.number().optional(),
    prixVp: z.coerce.number().optional(),
  });

  const factureSchema = z.object({
    clientId: z.string().min(1, t('shared.validation.client_required')),
    dateEmission: z.string().min(1, t('shared.validation.emission_date_required')),
    dateEcheance: z.string().optional(),
    statut: z.string().min(1, t('shared.validation.status_required')),
    modePaiement: z.string().optional(),
    type: z.string().optional(),
    prescriptionId: z.string().optional(),
    notes: z.string().optional(),
    conditionsPaiement: z.string().optional(),
    resteAPayer: z.number().min(0, t('shared.validation.balance_positive')).optional(),
    lignes: z.array(ligneSchema).min(1, t('shared.validation.lines_min')),
  });

  type FactureFormValues = z.infer<typeof factureSchema>;

  const form = useForm<FactureFormValues>({
    resolver: zodResolver(factureSchema),
    defaultValues: initialData || {
      clientId: '',
      dateEmission: new Date().toISOString().split('T')[0],
      dateEcheance: '',
      statut: 'brouillon',
      modePaiement: 'Virement',
      type: 'simple',
      prescriptionId: '',
      notes: '',
      conditionsPaiement: '',
      resteAPayer: 0,
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
        const [{ data: clientsData }, { data: produitsData }, { data: parametresData }] = await Promise.all([
          supabase.from('clients').select('*').eq('user_id', user.id).order('nom'),
          supabase.from('produits').select('*').eq('user_id', user.id).order('nom'),
          supabase.from('parametres').select('*').eq('user_id', user.id).limit(1)
        ]);
        
        setClients(clientsData || []);
        setProduits(produitsData || []);
        setParametres(parametresData?.[0] || null);
        
        if (initialData) {
          form.reset({
            ...initialData,
            clientId: initialData.clientId?.toString() || '',
            type: initialData.type || initialData.type_facture || 'simple',
            prescriptionId: (initialData.prescriptionId ?? initialData.prescription_id)?.toString() || '',
            dateEmission: initialData.dateEmission ? new Date(initialData.dateEmission).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            dateEcheance: initialData.dateEcheance ? new Date(initialData.dateEcheance).toISOString().split('T')[0] : '',
            lignes: initialData.lignes?.map((l: any) => ({
              ...l,
              produitId: l.produitId?.toString() || '',
              prescriptionId: l.prescriptionId?.toString() || '',
              prixOdHt: l.prixOdHt ?? l.prix_od_ht ?? '',
              prixOgHt: l.prixOgHt ?? l.prix_og_ht ?? '',
              vlSelected: !!Number(l.vlSelected ?? l.vl_selected ?? 0),
              vpSelected: !!Number(l.vpSelected ?? l.vp_selected ?? 0),
              prixVl: l.prixVl ?? l.prix_vl ?? '',
              prixVp: l.prixVp ?? l.prix_vp ?? '',
            })) || [],
          });
        } else if (parametresData?.[0]) {
          form.setValue('conditionsPaiement', parametresData[0].conditions_paiement_defaut || '');
          form.setValue('notes', parametresData[0].pied_page_defaut || '');
        }
      } catch (error) {
        toast.error(t('shared.toast.loading_error'));
      }
    };
    fetchData();
  }, []);

  const watchLignes = form.watch('lignes');
  const watchStatut = form.watch('statut');
  const watchResteAPayer = form.watch('resteAPayer');
  const watchModePaiement = form.watch('modePaiement');
  const watchType = form.watch('type');
  const isOptique = watchType === 'optique';
  const watchClientId = form.watch('clientId');
  const watchPrescriptionId = form.watch('prescriptionId');
  const [selectedPrescription, setSelectedPrescription] = useState<any>(null);
  // A "Unifocal" ordonnance (internal type_vision === 'progressif') carries both
  // a VL and a VP refraction, so the verre line is split into VL/VP with a
  // checkbox + price per side instead of the OD/OG price pair.
  const isUnifocal = isOptique && selectedPrescription?.type_vision === 'progressif';

  // Fetch prescriptions when client changes — nothing is shown until a client
  // is selected, and only that client's active ordonnances are listed.
  useEffect(() => {
    if (watchClientId) {
      supabase
        .from('prescriptions')
        .select('*')
        .eq('client_id', parseInt(watchClientId))
        .eq('statut', 'active')
        .order('date_ordonnance', { ascending: false })
        .then(({ data }) => setPrescriptions(data || []));
    } else {
      setPrescriptions([]);
    }
  }, [watchClientId]);

  // Update selected prescription when prescriptionId changes
  useEffect(() => {
    if (watchPrescriptionId) {
      const p = prescriptions.find((p) => p.id.toString() === watchPrescriptionId);
      setSelectedPrescription(p || null);
    } else {
      setSelectedPrescription(null);
    }
  }, [watchPrescriptionId, prescriptions]);

  // When the selected ordonnance is unifocal, default the verre line (index 1)
  // to VL ticked if the user hasn't ticked anything yet, so at least one side
  // is billed.
  useEffect(() => {
    if (isUnifocal) {
      const vl = form.getValues('lignes.1.vlSelected');
      const vp = form.getValues('lignes.1.vpSelected');
      if (!vl && !vp) {
        form.setValue('lignes.1.vlSelected', true, { shouldDirty: false });
      }
    }
  }, [isUnifocal]);

  // When type changes to optique, set 2 lines (monture, verre); simple = 1 line
  useEffect(() => {
    if (!initialData) {
      if (watchType === 'optique') {
        form.setValue('lignes', [
          { designation: '', quantite: 1, prixUnitaireHt: 0, tva: 20 },
          { designation: '', quantite: 1, prixUnitaireHt: 0, tva: 20 },
        ]);
      } else if (watchType === 'simple') {
        form.setValue('lignes', [
          { designation: '', quantite: 1, prixUnitaireHt: 0, tva: 20 },
        ]);
      }
    }
  }, [watchType]);

  // Calculate totals
  const baseTotals = watchLignes.reduce(
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

  const totals = {
    ...baseTotals,
  };

  // Update reste à payer when total changes or status changes
  useEffect(() => {
    if (!initialData) {
      form.setValue('resteAPayer', totals.ttc);
    } else if (watchStatut === 'payée') {
      form.setValue('resteAPayer', 0);
    }
  }, [totals.ttc, watchStatut, initialData]);

  async function generateFactureRef(): Promise<string> {
    const year = new Date().getFullYear();
    const { data: existing } = await supabase
      .from('factures')
      .select('numero')
      .like('numero', `FAC-${year}-%`)
      .eq('user_id', user?.id);
    let maxNum = 0;
    for (const f of existing || []) {
      const match = f.numero?.match(new RegExp(`^FAC-${year}-(\\d+)$`));
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    return `FAC-${year}-${String(maxNum + 1).padStart(4, '0')}`;
  }

  const onSubmit = async (data: FactureFormValues) => {
    setIsLoading(true);
    try {
      let invoiceNum: string | undefined;
      if (!initialData?.id) {
        let attempts = 0;
        while (attempts < 10) {
          const candidate = await generateFactureRef();
          const { data: dup } = await supabase.from('factures').select('id').eq('numero', candidate).eq('user_id', user?.id).maybeSingle();
          if (!dup) { invoiceNum = candidate; break; }
          attempts++;
        }
      }

      const payload = {
        client_id: data.clientId === 'none' ? null : Number(data.clientId),
        date_emission: new Date(data.dateEmission).toISOString(),
        date_echeance: data.dateEcheance ? new Date(data.dateEcheance).toISOString() : null,
        numero: invoiceNum || initialData?.numero,
        statut: data.statut || 'brouillon',
        mode_paiement: data.modePaiement || 'Virement',
        type: data.type || 'simple',
        prescription_id: data.type === 'optique' && data.prescriptionId ? Number(data.prescriptionId) : null,
        notes: data.notes || '',
        conditions_paiement: data.conditionsPaiement || '',
        montant_ht: Number(totals.ht) || 0,
        montant_tva: Number(totals.tva) || 0,
        montant_ttc: Number(totals.ttc) || 0,
        reste_a_payer: data.statut === 'payée' ? 0 : (Number(data.resteAPayer) || Number(totals.ttc) || 0),
        // Link to the originating Ordre de Travail when created from the OT hub.
        ...(ordreTravailId ? { ordre_travail_id: Number(ordreTravailId) } : {}),
      };

      let factureId = initialData?.id;

      if (!factureId) {
        let { data: newFacture, error } = await supabase.from('factures').insert([{ ...payload, user_id: user?.id }]).select().single();
        if (error?.message?.includes('duplicate key') || error?.code === '23505') {
          invoiceNum = await generateFactureRef();
          payload.numero = invoiceNum;
          const retry = await supabase.from('factures').insert([{ ...payload, user_id: user?.id }]).select().single();
          newFacture = retry.data;
          error = retry.error;
        }
        if (error) throw error;
        factureId = newFacture.id;
      } else {
        const { error } = await supabase.from('factures').update(payload).eq('id', factureId).eq('user_id', user?.id);
        if (error) throw error;
        await supabase.from('facture_lignes').delete().eq('facture_id', factureId);
      }

      const lignesPayload = (data.lignes || []).map((ligne: any, index: number) => ({
        facture_id: Number(factureId),
        produit_id: ligne.produitId ? Number(ligne.produitId) : null,
        designation: ligne.designation || 'Article sans désignation',
        quantite: Number(ligne.quantite) || 1,
        prix_unitaire_ht: Number(ligne.prixUnitaireHt) || 0,
        tva: Number(ligne.tva) || 20,
        montant_ht: Number(ligne.prixUnitaireHt || 0) * Number(ligne.quantite || 1) || 0,
        montant_ttc: (Number(ligne.prixUnitaireHt || 0) * Number(ligne.quantite || 1)) * (1 + Number(ligne.tva || 20) / 100) || 0,
        prix_od_ht: data.type === 'optique' ? (ligne.prixOdHt || null) : null,
        prix_og_ht: data.type === 'optique' ? (ligne.prixOgHt || null) : null,
        // Unifocal VL/VP split — only persisted on the optique verre line.
        vl_selected: data.type === 'optique' && ligne.vlSelected ? 1 : 0,
        vp_selected: data.type === 'optique' && ligne.vpSelected ? 1 : 0,
        prix_vl: data.type === 'optique' && ligne.vlSelected ? (ligne.prixVl || 0) : null,
        prix_vp: data.type === 'optique' && ligne.vpSelected ? (ligne.prixVp || 0) : null,
        prescription_id: (ligne.prescriptionId || (data.type === 'optique' && data.prescriptionId)) ? Number(ligne.prescriptionId || data.prescriptionId) : null,
        ordre: index,
      }));

      if (lignesPayload.length > 0) {
        const { error: lignesError } = await supabase.from('facture_lignes').insert(lignesPayload);
        if (lignesError) throw lignesError;
      }

      const activeStatuses = ['payée', 'reste_a_payer'];
      if (activeStatuses.includes(data.statut)) {
        const changedIds: (number | string)[] = [];
        for (const ligne of lignesPayload) {
          if (ligne.produit_id) {
            await updateStockAndNotify(user?.id, ligne.produit_id, -Number(ligne.quantite));
            changedIds.push(ligne.produit_id);
          }
        }
        await ensureLowStockNotifications(user?.id, changedIds);
      }

      toast.success(initialData ? 'Facture modifiée' : 'Facture créée');
      onSuccess();
    } catch (error: any) {
      console.error('Facture save error:', error);
      toast.error(error.message || t('shared.toast.save_error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleProduitSelect = (index: number, produitId: string) => {
    const produit = produits.find((p) => p.id.toString() === produitId);
    if (produit) {
      const isVerre = (produit.type_produit || produit.typeProduit) === 'verre';
      form.setValue(`lignes.${index}.produitId`, produit.id.toString());
      form.setValue(`lignes.${index}.reference`, produit.reference || '');
      form.setValue(`lignes.${index}.designation`, produit.designation || produit.nom || '');
      form.setValue(`lignes.${index}.tva`, Number(produit.taux_tva ?? produit.tauxTva ?? produit.tva ?? 20));
      if (isVerre) {
        const halfPrice = (Number(produit.prixVenteHt || produit.prix_vente_ht || 0) / 2);
        form.setValue(`lignes.${index}.prixOdHt`, halfPrice);
        form.setValue(`lignes.${index}.prixOgHt`, halfPrice);
        form.setValue(`lignes.${index}.prixUnitaireHt`, halfPrice * 2);
        form.setValue(`lignes.${index}.quantite`, 1);
      } else {
        form.setValue(`lignes.${index}.prixUnitaireHt`, Number(produit.prixVenteHt || produit.prix_vente_ht || 0));
        form.setValue(`lignes.${index}.prixOdHt`, '' as any);
        form.setValue(`lignes.${index}.prixOgHt`, '' as any);
      }
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
      <div className="dark:bg-slate-900/40 dark:border-white/10 bg-slate-50 p-4 rounded-sm border border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('optique.invoice.type_label')}</Label>
            <Select
              value={form.watch('type') || 'simple'}
              onValueChange={(val) => form.setValue('type', val)}
            >
              <SelectTrigger className="dark:bg-slate-950/50 dark:border-white/10 bg-white border-slate-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">{t('optique.invoice.type_simple')}</SelectItem>
                <SelectItem value="optique">{t('optique.invoice.type_optique')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('shared.form.client_label')}</Label>
            <Select
              value={form.watch('clientId') || ""}
              onValueChange={(val) => form.setValue('clientId', val)}
            >
              <SelectTrigger className="dark:bg-slate-950/50 dark:border-white/10 bg-white border-slate-300">
                <SelectValue placeholder={t('shared.form.select_client')} />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id.toString()}>
                    {client.nom || client.nomSociete || '-'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.clientId && (
              <p className="text-xs text-red-500 font-medium">{form.formState.errors.clientId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('shared.form.emission_date')}</Label>
            <Input type="date" className="dark:bg-slate-950/50 dark:border-white/10 dark:focus:border-[#267E54] bg-white border-slate-300" {...form.register('dateEmission')} />
            {form.formState.errors.dateEmission && (
              <p className="text-xs text-red-500 font-medium">{form.formState.errors.dateEmission.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('shared.form.due_date')}</Label>
            <Input type="date" className="dark:bg-slate-950/50 dark:border-white/10 dark:focus:border-[#267E54] bg-white border-slate-300" {...form.register('dateEcheance')} />
          </div>

          {isEditing && (
            <div className="space-y-2">
              <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('shared.form.status_label')}</Label>
              <Select
                value={form.watch('statut') || ""}
                onValueChange={(val) => form.setValue('statut', val)}
              >
                <SelectTrigger className="dark:bg-slate-950/50 dark:border-white/10 bg-white border-slate-300">
                  <SelectValue placeholder={t('shared.form.select_status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="brouillon">{t('shared.status.draft')}</SelectItem>
                  <SelectItem value="en_attente">{t('shared.status.pending')}</SelectItem>
                  <SelectItem value="payée">{t('shared.status.paid')}</SelectItem>
                  <SelectItem value="reste_a_payer">{t('shared.status.partial')}</SelectItem>
                  <SelectItem value="annulée">{t('shared.status.cancelled')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('shared.form.payment_mode')}</Label>
            <Select
              value={form.watch('modePaiement') || ""}
              onValueChange={(val) => form.setValue('modePaiement', val)}
            >
              <SelectTrigger className="dark:bg-slate-950/50 dark:border-white/10 bg-white border-slate-300">
                <SelectValue placeholder={t('shared.form.select_mode')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Virement">{t('shared.payment_modes.bank_transfer')}</SelectItem>
                <SelectItem value="Chèque">{t('shared.payment_modes.cheque')}</SelectItem>
                <SelectItem value="Espèces">{t('shared.payment_modes.cash')}</SelectItem>
                <SelectItem value="Carte">{t('shared.payment_modes.card')}</SelectItem>
                <SelectItem value="Effet">{t('shared.payment_modes.bill_of_exchange')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

      </div>

      {isOptique && (
        <div className="dark:bg-sky-900/20 dark:border-sky-500/30 bg-sky-50 p-4 rounded-sm border border-sky-200">
          <div className="space-y-2">
            <Label className="dark:text-sky-300 text-sky-700 font-semibold flex items-center gap-2">
              <Eye className="h-4 w-4" />
              {t('optique.invoice.prescription_label')}
            </Label>
            <Select
              value={form.watch('prescriptionId') || ''}
              onValueChange={(val) => form.setValue('prescriptionId', val)}
            >
              <SelectTrigger className="dark:bg-slate-950/50 dark:border-white/10 bg-white border-sky-300">
                <SelectValue placeholder={t('optique.invoice.prescription_ph')} />
              </SelectTrigger>
              <SelectContent>
                {prescriptions.length === 0 && (
                  <SelectItem value="__none" disabled>
                    {watchClientId ? 'Aucune ordonnance active pour ce client' : t('optique.invoice.prescription_ph')}
                  </SelectItem>
                )}
                {prescriptions.map((p) => {
                  const odStr = `OD: ${fmtDiopter(p.od_sph_vl, '-')}${p.od_cyl_vl ? ` (${fmtDiopter(p.od_cyl_vl)})` : ''}`;
                  const ogStr = `OG: ${fmtDiopter(p.og_sph_vl, '-')}${p.og_cyl_vl ? ` (${fmtDiopter(p.og_cyl_vl)})` : ''}`;
                  return (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.date_ordonnance} — {odStr} / {ogStr}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedPrescription && (
              <div className="text-xs text-sky-600 dark:text-sky-400 mt-1 space-y-0.5">
                <span className="font-medium">Verre prescrit:</span> {selectedPrescription.verre_type || 'Non spécifié'}
                {selectedPrescription.verre_indice && <span> — Indice: {selectedPrescription.verre_indice}</span>}
                {selectedPrescription.verre_traitement && <span> — Traitement: {selectedPrescription.verre_traitement}</span>}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between border-b dark:border-white/10 pb-2">
          <h3 className="text-lg font-bold dark:text-card-foreground text-slate-800">{t('shared.form.lines_section')}</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="dark:border-white/10 dark:text-muted-foreground dark:hover:bg-white/5 border-purple-200 text-purple-700 hover:bg-purple-50"
            onClick={() =>
              append({ designation: '', quantite: 1, prixUnitaireHt: 0, tva: 20 })
            }
          >
            <Plus className="h-4 w-4 mr-2" />
            {isOptique ? t('shared.form.add_product') : t('shared.form.add_line')}
          </Button>
        </div>

        {/* Line items grid — wrapped in `overflow-x-auto` so the wide row
            of product/description/qty/price/vat/subtotal inputs scrolls
            horizontally on phones instead of overflowing the page. The
            `min-w-[720px]` keeps each cell readable while scrolling. */}
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

                const isOptiqueMode = isOptique;
                const isOptiqueMontureLine = isOptiqueMode && index === 0;
                const isOptiqueVerreLine = isOptiqueMode && index === 1;
                // Extra optique lines (index >= 2) behave like a normal product
                // line so the user can add a lentille / autre product.
                const isOptiqueExtraLine = isOptiqueMode && index >= 2;
                const isVerreProduct = (selectedProduct?.type_produit || selectedProduct?.typeProduit) === 'verre';
                // Unifocal ordonnance → the verre line shows a VL/VP split
                // (checkbox + price per side) instead of the OD/OG price pair.
                const showVlVpPrices = isOptiqueVerreLine && isUnifocal;
                const showOdOgPrices = !showVlVpPrices && (isOptiqueVerreLine || (isVerreProduct && !isOptiqueMode));

                // Filter products by type for optique mode
                let filteredProduits = produits;
                if (isOptiqueMontureLine) {
                  filteredProduits = produits.filter(p => (p.type_produit || p.typeProduit) === 'monture');
                } else if (isOptiqueVerreLine) {
                  filteredProduits = produits.filter(p => (p.type_produit || p.typeProduit) === 'verre');
                } else if (isOptiqueExtraLine) {
                  filteredProduits = produits.filter(p => {
                    const tp = p.type_produit || p.typeProduit;
                    return tp !== 'monture' && tp !== 'verre';
                  });
                }

                return (
                  <React.Fragment key={field.id}>
                    <tr className={isOptiqueMode ? (isOptiqueMontureLine ? 'dark:bg-amber-500/5 bg-amber-50/30' : 'dark:bg-sky-500/5 bg-sky-50/30') : ''}>
                      <td className="p-2">
                        <ProductCombobox
                          products={filteredProduits}
                          value={selectedProductId || ''}
                          onValueChange={(val) => handleProduitSelect(index, val)}
                          placeholder={isOptiqueMontureLine ? 'Choisir une monture...' : isOptiqueVerreLine ? 'Choisir un verre...' : t('shared.form.choose_product')}
                          emptyText="Aucun produit disponible"
                          renderLabel={(p) => p.nom || p.reference || '-'}
                        />
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
                        {showVlVpPrices ? (
                          <div className="space-y-1">
                            {/* Unifocal: VL / VP checkbox + price per side.
                                prixUnitaireHt is kept in sync with the ticked
                                side(s) so the totals stay correct. */}
                            {(() => {
                              const vlOn = !!form.watch(`lignes.${index}.vlSelected`);
                              const vpOn = !!form.watch(`lignes.${index}.vpSelected`);
                              const recompute = (nextVl: boolean, nextVp: boolean) => {
                                const vlP = parseFloat(String(form.watch(`lignes.${index}.prixVl`))) || 0;
                                const vpP = parseFloat(String(form.watch(`lignes.${index}.prixVp`))) || 0;
                                form.setValue(
                                  `lignes.${index}.prixUnitaireHt`,
                                  (nextVl ? vlP : 0) + (nextVp ? vpP : 0),
                                  { shouldValidate: true, shouldDirty: true }
                                );
                              };
                              return (
                                <>
                                  <div className="flex items-center gap-1">
                                    <Checkbox
                                      checked={vlOn}
                                      onCheckedChange={(v) => {
                                        form.setValue(`lignes.${index}.vlSelected`, !!v, { shouldDirty: true });
                                        recompute(!!v, vpOn);
                                      }}
                                    />
                                    <Input
                                      type="number"
                                      step="0.01"
                                      placeholder="Prix VL"
                                      disabled={!vlOn}
                                      className="h-9 text-right dark:bg-amber-500/5 dark:border-amber-500/30 bg-amber-50 border-amber-200 text-xs"
                                      {...form.register(`lignes.${index}.prixVl`, { valueAsNumber: true })}
                                      onChange={(e) => {
                                        const v = parseFloat(e.target.value) || 0;
                                        form.setValue(`lignes.${index}.prixVl`, v);
                                        const vpP = parseFloat(String(form.watch(`lignes.${index}.prixVp`))) || 0;
                                        form.setValue(`lignes.${index}.prixUnitaireHt`, (vlOn ? v : 0) + (vpOn ? vpP : 0));
                                      }}
                                    />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Checkbox
                                      checked={vpOn}
                                      onCheckedChange={(v) => {
                                        form.setValue(`lignes.${index}.vpSelected`, !!v, { shouldDirty: true });
                                        recompute(vlOn, !!v);
                                      }}
                                    />
                                    <Input
                                      type="number"
                                      step="0.01"
                                      placeholder="Prix VP"
                                      disabled={!vpOn}
                                      className="h-9 text-right dark:bg-sky-500/5 dark:border-sky-500/30 bg-sky-50 border-sky-200 text-xs"
                                      {...form.register(`lignes.${index}.prixVp`, { valueAsNumber: true })}
                                      onChange={(e) => {
                                        const v = parseFloat(e.target.value) || 0;
                                        form.setValue(`lignes.${index}.prixVp`, v);
                                        const vlP = parseFloat(String(form.watch(`lignes.${index}.prixVl`))) || 0;
                                        form.setValue(`lignes.${index}.prixUnitaireHt`, (vlOn ? vlP : 0) + (vpOn ? v : 0));
                                      }}
                                    />
                                  </div>
                                  <div className="text-[10px] text-slate-500 dark:text-slate-400 text-right">VL / VP (unifocal)</div>
                                </>
                              );
                            })()}
                          </div>
                        ) : showOdOgPrices ? (
                          <div className="space-y-1">
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Prix OD"
                              className="h-9 text-right dark:bg-amber-500/5 dark:border-amber-500/30 bg-amber-50 border-amber-200 text-xs"
                              {...form.register(`lignes.${index}.prixOdHt`, { valueAsNumber: true })}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value) || 0;
                                const og = parseFloat(String(form.watch(`lignes.${index}.prixOgHt`))) || 0;
                                form.setValue(`lignes.${index}.prixOdHt`, v);
                                form.setValue(`lignes.${index}.prixUnitaireHt`, v + og);
                              }}
                            />
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Prix OG"
                              className="h-9 text-right dark:bg-sky-500/5 dark:border-sky-500/30 bg-sky-50 border-sky-200 text-xs"
                              {...form.register(`lignes.${index}.prixOgHt`, { valueAsNumber: true })}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value) || 0;
                                const od = parseFloat(String(form.watch(`lignes.${index}.prixOdHt`))) || 0;
                                form.setValue(`lignes.${index}.prixOgHt`, v);
                                form.setValue(`lignes.${index}.prixUnitaireHt`, od + v);
                              }}
                            />
                            <div className="flex justify-end">
                              <HtCalculatorButton
                                defaultTva={Number(form.watch(`lignes.${index}.tva`)) || 20}
                                onResult={(ht) => {
                                  form.setValue(`lignes.${index}.prixOdHt`, ht, { shouldDirty: true });
                                  form.setValue(`lignes.${index}.prixOgHt`, 0, { shouldDirty: true });
                                  form.setValue(`lignes.${index}.prixUnitaireHt`, ht, { shouldValidate: true, shouldDirty: true });
                                }}
                              />
                            </div>
                          </div>
                        ) : (
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
                        )}
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
                        {(!isOptiqueMode || isOptiqueExtraLine) && (
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
                        )}
                      </td>
                    </tr>
                  </React.Fragment>
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

      <div className="flex flex-col md:flex-row gap-8">
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('shared.form.notes')}</Label>
            <Textarea 
              {...form.register('notes')} 
              placeholder={t('shared.form.notes_placeholder')} 
              className="min-h-[100px] dark:bg-slate-950/50 dark:border-white/10 dark:focus:border-[#267E54] bg-white border-slate-300"
            />
          </div>
          <div className="space-y-2">
            <Label className="dark:text-slate-400 text-slate-700 font-semibold">{t('shared.form.conditions')}</Label>
            <Textarea
              {...form.register('conditionsPaiement')}
              placeholder={t('shared.form.payment_terms_ph')}
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
              <span className="text-2xl font-black text-[#267E54]" dir="ltr">{formatCurrency(totals.ttc)}</span>
            </div>
            
            {watchStatut !== 'payée' && (
              <div className="pt-4 border-t dark:border-white/10 border-slate-200">
                <Label className="dark:text-slate-400 text-slate-700 font-semibold mb-2 block">{t('shared.form.balance_due')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="dark:bg-slate-950/50 dark:border-white/10 dark:focus:border-[#267E54] bg-white border-slate-300 font-bold text-red-600"
                  {...form.register('resteAPayer', { valueAsNumber: true })}
                />
                <p className="text-[10px] dark:text-muted-foreground text-slate-500 mt-1">
                  {t('shared.form.balance_note')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end items-center space-x-4 pt-6 border-t dark:border-white/10">
        <Button type="button" variant="ghost" onClick={() => onSuccess()} className="dark:text-muted-foreground dark:hover:text-card-foreground text-slate-500 hover:text-slate-700">
          {t('shared.actions.cancel')}
        </Button>
        <Button type="submit" disabled={isLoading} className="bg-rose-500 hover:bg-rose-600 text-white font-semibold px-6 h-10 rounded-sm shadow-none">
          {isLoading ? t('shared.actions.saving') : t('shared.actions.save')}
        </Button>
      </div>
    </form>
  );
}

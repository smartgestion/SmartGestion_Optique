import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { FlaskConical, User } from 'lucide-react'

interface OrdreTravailFormProps {
  initialData?: any;
  onSuccess?: () => void;
}

const STATUTS = ['brouillon', 'envoye_labo', 'recu_labo', 'montage', 'controle', 'termine', 'annule'] as const;

export function OrdreTravailForm({ initialData, onSuccess }: OrdreTravailFormProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [clients, setClients] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);

  const schema = z.object({
    clientId: z.string().min(1, t('shared.validation.client_required')),
    prescriptionId: z.string().optional(),
    numeroOrdre: z.string().min(1, t('ordres_travail.validation.numero_required')),
    dateCreation: z.string().optional(),
    dateSouhaitee: z.string().optional(),
    statut: z.string().optional(),
    montureReference: z.string().optional(),
    montureDesignation: z.string().optional(),
    verreType: z.string().optional(),
    verreIndice: z.coerce.number().optional(),
    verreTraitement: z.string().optional(),
    verreDesignation: z.string().optional(),
    instructionsLabo: z.string().optional(),
    laboNom: z.string().optional(),
    laboPrix: z.coerce.number().optional(),
    prixVenteHt: z.coerce.number().optional(),
    tauxTva: z.coerce.number().optional(),
  });

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      clientId: initialData?.client_id?.toString() || '',
      prescriptionId: initialData?.prescription_id?.toString() || '',
      numeroOrdre: initialData?.numero_ordre || `OT-${Date.now().toString().slice(-6)}`,
      dateCreation: initialData?.date_creation || new Date().toISOString().split('T')[0],
      dateSouhaitee: initialData?.date_souhaitee || '',
      statut: initialData?.statut || 'brouillon',
      montureReference: initialData?.monture_reference || '',
      montureDesignation: initialData?.monture_designation || '',
      verreType: initialData?.verre_type || '',
      verreIndice: initialData?.verre_indice ?? '',
      verreTraitement: initialData?.verre_traitement || '',
      verreDesignation: initialData?.verre_designation || '',
      instructionsLabo: initialData?.instructions_labo || '',
      laboNom: initialData?.labo_nom || '',
      laboPrix: initialData?.labo_prix ?? '',
      prixVenteHt: initialData?.prix_vente_ht ?? '',
      tauxTva: initialData?.taux_tva ?? 20,
    },
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.id) return;
      const { data: cli } = await supabase.from('clients').select('*').eq('user_id', user.id).order('nom');
      setClients(cli || []);
      const { data: pres } = await supabase.from('prescriptions').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      setPrescriptions(pres || []);
    };
    fetchData();
  }, [user?.id]);

  useEffect(() => {
    if (initialData?.id) {
      form.reset({
        clientId: initialData.client_id?.toString() || '',
        prescriptionId: initialData.prescription_id?.toString() || '',
        numeroOrdre: initialData.numero_ordre || '',
        dateCreation: initialData.date_creation || '',
        dateSouhaitee: initialData.date_souhaitee || '',
        statut: initialData.statut || 'brouillon',
        montureReference: initialData.monture_reference || '',
        montureDesignation: initialData.monture_designation || '',
        verreType: initialData.verre_type || '',
        verreIndice: initialData.verre_indice ?? '',
        verreTraitement: initialData.verre_traitement || '',
        verreDesignation: initialData.verre_designation || '',
        instructionsLabo: initialData.instructions_labo || '',
        laboNom: initialData.labo_nom || '',
        laboPrix: initialData.labo_prix ?? '',
        prixVenteHt: initialData.prix_vente_ht ?? '',
        tauxTva: initialData.taux_tva ?? 20,
      });
    }
  }, [initialData, form]);

  async function onSubmit(data: FormValues) {
    try {
      const payload: Record<string, any> = {
        client_id: parseInt(data.clientId),
        prescription_id: data.prescriptionId ? parseInt(data.prescriptionId) : null,
        numero_ordre: data.numeroOrdre,
        date_creation: data.dateCreation || null,
        date_souhaitee: data.dateSouhaitee || null,
        statut: data.statut || 'brouillon',
        monture_reference: data.montureReference || null,
        monture_designation: data.montureDesignation || null,
        verre_type: data.verreType || null,
        verre_indice: data.verreIndice || null,
        verre_traitement: data.verreTraitement || null,
        verre_designation: data.verreDesignation || null,
        instructions_labo: data.instructionsLabo || null,
        labo_nom: data.laboNom || null,
        labo_prix: data.laboPrix || 0,
        prix_vente_ht: data.prixVenteHt || 0,
        taux_tva: data.tauxTva ?? 20,
      };

      let result;
      if (initialData?.id) {
        result = await supabase.from('ordres_travail').update(payload).eq('id', initialData.id);
      } else {
        result = await supabase.from('ordres_travail').insert([{ ...payload, user_id: user?.id }]);
      }
      if (result.error) throw result.error;

      toast.success(t('ordres_travail.toast_saved'));
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast.error(err.message || t('shared.toast.save_error'));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* General */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <User className="h-4 w-4 text-primary" />
            {t('ordres_travail.section_general')}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormField control={form.control} name="clientId" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('ordres_travail.form.client')} *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10"><SelectValue placeholder={t('shared.form.select_client')} /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="prescriptionId" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('ordres_travail.form.prescription')}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10"><SelectValue placeholder={t('shared.form.select_placeholder')} /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {prescriptions.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>#{p.id} — {p.date_ordonnance}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="numeroOrdre" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('ordres_travail.form.numero')} *</FormLabel>
                <FormControl><Input className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="statut" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('ordres_travail.form.statut')}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10"><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {STATUTS.map((s) => (
                      <SelectItem key={s} value={s}>{t(`ordres_travail.statut_${s}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="dateCreation" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('ordres_travail.form.date_creation')}</FormLabel>
                <FormControl><Input type="date" className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="dateSouhaitee" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('ordres_travail.form.date_souhaitee')}</FormLabel>
                <FormControl><Input type="date" className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </div>

        {/* Monture & Verre */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border rounded-[6px] p-4 space-y-3 bg-sky-50/30 dark:bg-white/5">
            <h3 className="text-sm font-semibold text-sky-700 dark:text-sky-400">{t('ordres_travail.section_monture')}</h3>
            <FormField control={form.control} name="montureReference" render={({ field }) => (
              <FormItem><FormLabel className="text-xs">{t('ordres_travail.form.monture_reference')}</FormLabel>
                <FormControl><Input className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="montureDesignation" render={({ field }) => (
              <FormItem><FormLabel className="text-xs">{t('ordres_travail.form.monture_designation')}</FormLabel>
                <FormControl><Input className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
            )} />
          </div>
          <div className="border rounded-[6px] p-4 space-y-3 bg-emerald-50/30 dark:bg-white/5">
            <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{t('ordres_travail.section_verre')}</h3>
            <div className="grid grid-cols-2 gap-2">
              <FormField control={form.control} name="verreType" render={({ field }) => (
                <FormItem><FormLabel className="text-xs">{t('ordres_travail.form.verre_type')}</FormLabel>
                  <FormControl><Input className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="verreIndice" render={({ field }) => (
                <FormItem><FormLabel className="text-xs">{t('ordres_travail.form.verre_indice')}</FormLabel>
                  <FormControl><Input type="number" step="0.01" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="verreTraitement" render={({ field }) => (
              <FormItem><FormLabel className="text-xs">{t('ordres_travail.form.verre_traitement')}</FormLabel>
                <FormControl><Input className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
            )} />
          </div>
        </div>

        {/* Labo */}
        <div className="border rounded-[6px] p-4 space-y-3 bg-slate-50/30 dark:bg-white/5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-400">
            <FlaskConical className="h-4 w-4" /> {t('ordres_travail.section_labo')}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FormField control={form.control} name="laboNom" render={({ field }) => (
              <FormItem><FormLabel className="text-xs">{t('ordres_travail.form.labo_nom')}</FormLabel>
                <FormControl><Input className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="laboPrix" render={({ field }) => (
              <FormItem><FormLabel className="text-xs">{t('ordres_travail.form.labo_prix')}</FormLabel>
                <FormControl><Input type="number" step="0.01" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="prixVenteHt" render={({ field }) => (
              <FormItem><FormLabel className="text-xs">{t('ordres_travail.form.prix_vente_ht')}</FormLabel>
                <FormControl><Input type="number" step="0.01" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
            )} />
          </div>
          <FormField control={form.control} name="instructionsLabo" render={({ field }) => (
            <FormItem><FormLabel className="text-xs">{t('ordres_travail.form.instructions')}</FormLabel>
              <FormControl><Textarea rows={3} className="rounded-xl" {...field} /></FormControl></FormItem>
          )} />
        </div>

        <div className="flex justify-end pt-4 border-t dark:border-white/10">
          <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 h-12 rounded-[4px] shadow-none">
            {t('shared.actions.save')}
          </Button>
        </div>
      </form>
    </Form>
  );
}

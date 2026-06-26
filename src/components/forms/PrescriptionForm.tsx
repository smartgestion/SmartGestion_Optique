import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Stethoscope, User, Phone, Mail, MapPin } from 'lucide-react'

interface PrescriptionFormProps {
  initialData?: any;
  onSuccess?: () => void;
}

const BASES_PRISME = ['nasal', 'temporal', 'superieur', 'inferieur', 'nasal_superieur', 'nasal_inferieur', 'temporal_superieur', 'temporal_inferieur'] as const;

const INDICE_OPTIONS = ['1.49', '1.5', '1.56', '1.6', '1.67', '1.74', '1.7', '1.8', '1.9'] as const;

export function PrescriptionForm({ initialData, onSuccess }: PrescriptionFormProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [clients, setClients] = useState<any[]>([]);

  const prescriptionSchema = z.object({
    clientId: z.string().min(1, 'Le client est requis'),
    dateOrdonnance: z.string().min(1, 'La date est requise'),
    dateExpiration: z.string().optional(),
    typePrescription: z.string().optional(),
    visionType: z.string().optional(),
    progressifSource: z.string().optional(),
    notes: z.string().optional(),

    medecinTraitantNom: z.string().optional(),
    medecinTraitantSpecialite: z.string().optional(),
    medecinTraitantTelephone: z.string().optional(),
    medecinTraitantEmail: z.string().optional(),
    medecinTraitantAdresse: z.string().optional(),

    odSphVl: z.coerce.number().optional(),
    odCylVl: z.coerce.number().optional(),
    odAxeVl: z.coerce.number().int().optional(),
    odAddVl: z.coerce.number().optional(),
    ogSphVl: z.coerce.number().optional(),
    ogCylVl: z.coerce.number().optional(),
    ogAxeVl: z.coerce.number().int().optional(),
    ogAddVl: z.coerce.number().optional(),

    odSphVp: z.coerce.number().optional(),
    odCylVp: z.coerce.number().optional(),
    odAxeVp: z.coerce.number().int().optional(),
    odAddVp: z.coerce.number().optional(),
    ogSphVp: z.coerce.number().optional(),
    ogCylVp: z.coerce.number().optional(),
    ogAxeVp: z.coerce.number().int().optional(),
    ogAddVp: z.coerce.number().optional(),

    odAvVl: z.coerce.number().optional(),
    ogAvVl: z.coerce.number().optional(),
    odAvVp: z.coerce.number().optional(),
    ogAvVp: z.coerce.number().optional(),
    odAvNature: z.string().optional(),
    ogAvNature: z.string().optional(),
    odAvVpVl: z.coerce.number().optional(),
    ogAvVpVl: z.coerce.number().optional(),
    odAvVpNature: z.string().optional(),
    ogAvVpNature: z.string().optional(),

    odPrismeHorizontal: z.coerce.number().optional(),
    odPrismeVertical: z.coerce.number().optional(),
    odPrismeBase: z.string().optional(),
    ogPrismeHorizontal: z.coerce.number().optional(),
    ogPrismeVertical: z.coerce.number().optional(),
    ogPrismeBase: z.string().optional(),

    odPrismeVpHorizontal: z.coerce.number().optional(),
    odPrismeVpVertical: z.coerce.number().optional(),
    odPrismeVpBase: z.string().optional(),
    ogPrismeVpHorizontal: z.coerce.number().optional(),
    ogPrismeVpVertical: z.coerce.number().optional(),
    ogPrismeVpBase: z.string().optional(),

    dpBinoculaire: z.coerce.number().optional(),
    dpOd: z.coerce.number().optional(),
    dpOg: z.coerce.number().optional(),
    hauteurOd: z.coerce.number().optional(),
    hauteurOg: z.coerce.number().optional(),

    distanceVertex: z.coerce.number().optional(),
    inclinaisonPantoscopique: z.coerce.number().optional(),
    angleCourbeFaciale: z.coerce.number().optional(),

    verreType: z.string().optional(),
    verreIndice: z.coerce.number().optional(),
    verreTraitement: z.string().optional(),
    statut: z.string().optional(),
  });

  type PrescriptionFormValues = z.infer<typeof prescriptionSchema>;

  const form = useForm<PrescriptionFormValues>({
    resolver: zodResolver(prescriptionSchema),
    defaultValues: {
      clientId: initialData?.client_id?.toString() || '',
      dateOrdonnance: initialData?.date_ordonnance || new Date().toISOString().split('T')[0],
      dateExpiration: initialData?.date_expiration || '',
      typePrescription: initialData?.type_prescription || '',
      visionType: initialData?.type_vision || '',
      progressifSource: initialData?.progressif_source || 'vl',
      notes: initialData?.notes || '',

      medecinTraitantNom: initialData?.medecin_traitant_nom || '',
      medecinTraitantSpecialite: initialData?.medecin_traitant_specialite || '',
      medecinTraitantTelephone: initialData?.medecin_traitant_telephone || '',
      medecinTraitantEmail: initialData?.medecin_traitant_email || '',
      medecinTraitantAdresse: initialData?.medecin_traitant_adresse || '',

      odSphVl: initialData?.od_sph_vl ?? '',
      odCylVl: initialData?.od_cyl_vl ?? '',
      odAxeVl: initialData?.od_axe_vl ?? '',
      odAddVl: initialData?.od_add_vl ?? '',
      ogSphVl: initialData?.og_sph_vl ?? '',
      ogCylVl: initialData?.og_cyl_vl ?? '',
      ogAxeVl: initialData?.og_axe_vl ?? '',
      ogAddVl: initialData?.og_add_vl ?? '',
      odSphVp: initialData?.od_sph_vp ?? '',
      odCylVp: initialData?.od_cyl_vp ?? '',
      odAxeVp: initialData?.od_axe_vp ?? '',
      odAddVp: initialData?.od_add_vp ?? '',
      ogSphVp: initialData?.og_sph_vp ?? '',
      ogCylVp: initialData?.og_cyl_vp ?? '',
      ogAxeVp: initialData?.og_axe_vp ?? '',
      ogAddVp: initialData?.og_add_vp ?? '',
      odAvVl: initialData?.od_av_vl ?? '',
      ogAvVl: initialData?.og_av_vl ?? '',
      odAvVp: initialData?.od_av_vp ?? '',
      ogAvVp: initialData?.og_av_vp ?? '',
      odAvNature: initialData?.od_av_nature || '',
      ogAvNature: initialData?.og_av_nature || '',
      odAvVpVl: initialData?.od_av_vp_vl ?? '',
      ogAvVpVl: initialData?.og_av_vp_vl ?? '',
      odAvVpNature: initialData?.od_av_vp_nature || '',
      ogAvVpNature: initialData?.og_av_vp_nature || '',
      odPrismeHorizontal: initialData?.od_prisme_horizontal ?? '',
      odPrismeVertical: initialData?.od_prisme_vertical ?? '',
      odPrismeBase: initialData?.od_prisme_base || '',
      ogPrismeHorizontal: initialData?.og_prisme_horizontal ?? '',
      ogPrismeVertical: initialData?.og_prisme_vertical ?? '',
      ogPrismeBase: initialData?.og_prisme_base || '',
      odPrismeVpHorizontal: initialData?.od_prisme_vp_horizontal ?? '',
      odPrismeVpVertical: initialData?.od_prisme_vp_vertical ?? '',
      odPrismeVpBase: initialData?.od_prisme_vp_base || '',
      ogPrismeVpHorizontal: initialData?.og_prisme_vp_horizontal ?? '',
      ogPrismeVpVertical: initialData?.og_prisme_vp_vertical ?? '',
      ogPrismeVpBase: initialData?.og_prisme_vp_base || '',
      dpBinoculaire: initialData?.dp_binoculaire ?? '',
      dpOd: initialData?.dp_od ?? '',
      dpOg: initialData?.dp_og ?? '',
      hauteurOd: initialData?.hauteur_od ?? '',
      hauteurOg: initialData?.hauteur_og ?? '',
      distanceVertex: initialData?.distance_vertex ?? '',
      inclinaisonPantoscopique: initialData?.inclinaison_pantoscopique ?? '',
      angleCourbeFaciale: initialData?.angle_courbe_faciale ?? '',
      verreType: initialData?.verre_type || '',
      verreIndice: initialData?.verre_indice ?? '',
      verreTraitement: initialData?.verre_traitement || '',
      statut: initialData?.statut || 'active',
    },
  });

  const visionType = form.watch('visionType');

  // When "Vision de près" is selected the single OD/OG correction block must
  // edit the VP columns (odSphVp/ogSphVp…) instead of the VL ones, so the data
  // lands in the same fields the Bon de commande / Facture documents read for
  // près. For "Vision de loin" (and progressif's first block) we keep VL.
  const isVpOnly = visionType === 'vp';

  // --- Progressive prescription calculation -------------------------------
  // When Type de vision = "Progressif", the user picks a source vision
  // ("Vision de loin" or "Vision de près"). The source section is the editable
  // one and is always displayed first; the other section is auto-calculated
  // from it using the Addition (ADD):
  //   source VL → SPH_vp = SPH_vl + ADD ; CYL/AXE copied from VL
  //   source VP → SPH_vl = SPH_vp - ADD ; CYL/AXE copied from VP
  const isProgressif = visionType === 'progressif';
  const progressifSource = form.watch('progressifSource') || 'vl';
  const sourceIsVl = progressifSource === 'vl';

  // Recalculate the auto-generated section from the editable source section.
  const calculateProgressif = (src: string = progressifSource) => {
    const v = form.getValues();
    const num = (x: any): number | undefined => {
      if (x === '' || x === null || x === undefined) return undefined;
      const n = typeof x === 'number' ? x : parseFloat(x);
      return Number.isNaN(n) ? undefined : n;
    };
    // Keep decimal precision by rounding to 2 decimals (avoids 0.1+0.2 noise).
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const opts = { shouldDirty: true, shouldValidate: false } as const;

    (['od', 'og'] as const).forEach((eye) => {
      const sphVl = num(v[`${eye}SphVl` as keyof typeof v]);
      const cylVl = num(v[`${eye}CylVl` as keyof typeof v]);
      const axeVl = num(v[`${eye}AxeVl` as keyof typeof v]);
      const sphVp = num(v[`${eye}SphVp` as keyof typeof v]);
      const cylVp = num(v[`${eye}CylVp` as keyof typeof v]);
      const axeVp = num(v[`${eye}AxeVp` as keyof typeof v]);

      if (src === 'vl') {
        // Source = Vision de loin → compute Vision de près
        const add = num(v[`${eye}AddVl` as keyof typeof v]);
        form.setValue(`${eye}SphVp` as any, sphVl !== undefined && add !== undefined ? round2(sphVl + add) : sphVl ?? '', opts);
        form.setValue(`${eye}CylVp` as any, cylVl ?? '', opts);
        form.setValue(`${eye}AxeVp` as any, axeVl ?? '', opts);
        // ADD is entered once in the source section; mirror it for storage.
        form.setValue(`${eye}AddVp` as any, add ?? '', opts);
      } else {
        // Source = Vision de près → compute Vision de loin
        const add = num(v[`${eye}AddVp` as keyof typeof v]);
        form.setValue(`${eye}SphVl` as any, sphVp !== undefined && add !== undefined ? round2(sphVp - add) : sphVp ?? '', opts);
        form.setValue(`${eye}CylVl` as any, cylVp ?? '', opts);
        form.setValue(`${eye}AxeVl` as any, axeVp ?? '', opts);
        form.setValue(`${eye}AddVl` as any, add ?? '', opts);
      }
    });
  };

  // Auto-recalculate whenever the source values or the source selection change.
  useEffect(() => {
    if (!isProgressif) return;
    const sourceFields = sourceIsVl
      ? ['odSphVl', 'odCylVl', 'odAxeVl', 'odAddVl', 'ogSphVl', 'ogCylVl', 'ogAxeVl', 'ogAddVl']
      : ['odSphVp', 'odCylVp', 'odAxeVp', 'odAddVp', 'ogSphVp', 'ogCylVp', 'ogAxeVp', 'ogAddVp'];
    // Run once immediately so swapping the dropdown updates the other section.
    calculateProgressif(progressifSource);
    const sub = form.watch((_value, { name }) => {
      if (name && sourceFields.includes(name)) {
        calculateProgressif(progressifSource);
      }
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProgressif, progressifSource]);

  useEffect(() => {
    const fetchClients = async () => {
      if (!user?.id) return;
      const { data } = await supabase.from('clients').select('*').eq('user_id', user.id).order('nom');
      setClients(data || []);
    };
    fetchClients();
  }, [user?.id]);

  useEffect(() => {
    if (initialData?.id) {
      form.reset({
        clientId: initialData.client_id?.toString() || '',
        dateOrdonnance: initialData.date_ordonnance || '',
        dateExpiration: initialData.date_expiration || '',
        typePrescription: initialData.type_prescription || '',
        visionType: initialData.type_vision || '',
        progressifSource: initialData.progressif_source || 'vl',
        notes: initialData.notes || '',

        medecinTraitantNom: initialData.medecin_traitant_nom || '',
        medecinTraitantSpecialite: initialData.medecin_traitant_specialite || '',
        medecinTraitantTelephone: initialData.medecin_traitant_telephone || '',
        medecinTraitantEmail: initialData.medecin_traitant_email || '',
        medecinTraitantAdresse: initialData.medecin_traitant_adresse || '',

        odSphVl: initialData.od_sph_vl ?? '',
        odCylVl: initialData.od_cyl_vl ?? '',
        odAxeVl: initialData.od_axe_vl ?? '',
        odAddVl: initialData.od_add_vl ?? '',
        ogSphVl: initialData.og_sph_vl ?? '',
        ogCylVl: initialData.og_cyl_vl ?? '',
        ogAxeVl: initialData.og_axe_vl ?? '',
        ogAddVl: initialData.og_add_vl ?? '',
        odSphVp: initialData.od_sph_vp ?? '',
        odCylVp: initialData.od_cyl_vp ?? '',
        odAxeVp: initialData.od_axe_vp ?? '',
        odAddVp: initialData.od_add_vp ?? '',
        ogSphVp: initialData.og_sph_vp ?? '',
        ogCylVp: initialData.og_cyl_vp ?? '',
        ogAxeVp: initialData.og_axe_vp ?? '',
        ogAddVp: initialData.og_add_vp ?? '',
        odAvVl: initialData.od_av_vl ?? '',
        ogAvVl: initialData.og_av_vl ?? '',
        odAvVp: initialData.od_av_vp ?? '',
        ogAvVp: initialData.og_av_vp ?? '',
        odAvNature: initialData.od_av_nature || '',
        ogAvNature: initialData.og_av_nature || '',
        odAvVpVl: initialData.od_av_vp_vl ?? '',
        ogAvVpVl: initialData.og_av_vp_vl ?? '',
        odAvVpNature: initialData.od_av_vp_nature || '',
        ogAvVpNature: initialData.og_av_vp_nature || '',
        odPrismeHorizontal: initialData.od_prisme_horizontal ?? '',
        odPrismeVertical: initialData.od_prisme_vertical ?? '',
        odPrismeBase: initialData.od_prisme_base || '',
        ogPrismeHorizontal: initialData.og_prisme_horizontal ?? '',
        ogPrismeVertical: initialData.og_prisme_vertical ?? '',
        ogPrismeBase: initialData.og_prisme_base || '',
        odPrismeVpHorizontal: initialData.od_prisme_vp_horizontal ?? '',
        odPrismeVpVertical: initialData.od_prisme_vp_vertical ?? '',
        odPrismeVpBase: initialData.od_prisme_vp_base || '',
        ogPrismeVpHorizontal: initialData.og_prisme_vp_horizontal ?? '',
        ogPrismeVpVertical: initialData.og_prisme_vp_vertical ?? '',
        ogPrismeVpBase: initialData.og_prisme_vp_base || '',
        dpBinoculaire: initialData.dp_binoculaire ?? '',
        dpOd: initialData.dp_od ?? '',
        dpOg: initialData.dp_og ?? '',
        hauteurOd: initialData.hauteur_od ?? '',
        hauteurOg: initialData.hauteur_og ?? '',
        distanceVertex: initialData.distance_vertex ?? '',
        inclinaisonPantoscopique: initialData.inclinaison_pantoscopique ?? '',
        angleCourbeFaciale: initialData.angle_courbe_faciale ?? '',
        verreType: initialData.verre_type || '',
        verreIndice: initialData.verre_indice ?? '',
        verreTraitement: initialData.verre_traitement || '',
        statut: initialData.statut || 'active',
      });
    }
  }, [initialData, form]);

  async function onSubmit(data: PrescriptionFormValues) {
    try {
      const payload: Record<string, any> = {
        client_id: parseInt(data.clientId),
        date_ordonnance: data.dateOrdonnance,
        date_expiration: data.dateExpiration || null,
        type_prescription: data.typePrescription || null,
        type_vision: data.visionType || null,
        progressif_source: data.visionType === 'progressif' ? (data.progressifSource || 'vl') : null,
        notes: data.notes || null,

        medecin_traitant_nom: data.medecinTraitantNom || null,
        medecin_traitant_specialite: data.medecinTraitantSpecialite || null,
        medecin_traitant_telephone: data.medecinTraitantTelephone || null,
        medecin_traitant_email: data.medecinTraitantEmail || null,
        medecin_traitant_adresse: data.medecinTraitantAdresse || null,

        od_sph_vl: data.odSphVl || null,
        od_cyl_vl: data.odCylVl || null,
        od_axe_vl: data.odAxeVl || null,
        od_add_vl: data.odAddVl || null,
        og_sph_vl: data.ogSphVl || null,
        og_cyl_vl: data.ogCylVl || null,
        og_axe_vl: data.ogAxeVl || null,
        og_add_vl: data.ogAddVl || null,
        od_sph_vp: data.odSphVp || null,
        od_cyl_vp: data.odCylVp || null,
        od_axe_vp: data.odAxeVp || null,
        od_add_vp: data.odAddVp || null,
        og_sph_vp: data.ogSphVp || null,
        og_cyl_vp: data.ogCylVp || null,
        og_axe_vp: data.ogAxeVp || null,
        og_add_vp: data.ogAddVp || null,
        od_av_vl: data.odAvVl || null,
        og_av_vl: data.ogAvVl || null,
        od_av_vp: data.odAvVp || null,
        og_av_vp: data.ogAvVp || null,
        od_av_nature: data.odAvNature || null,
        og_av_nature: data.ogAvNature || null,
        od_av_vp_vl: data.odAvVpVl || null,
        og_av_vp_vl: data.ogAvVpVl || null,
        od_av_vp_nature: data.odAvVpNature || null,
        og_av_vp_nature: data.ogAvVpNature || null,
        od_prisme_horizontal: data.odPrismeHorizontal || null,
        od_prisme_vertical: data.odPrismeVertical || null,
        od_prisme_base: data.odPrismeBase || null,
        og_prisme_horizontal: data.ogPrismeHorizontal || null,
        og_prisme_vertical: data.ogPrismeVertical || null,
        og_prisme_base: data.ogPrismeBase || null,
        od_prisme_vp_horizontal: data.odPrismeVpHorizontal || null,
        od_prisme_vp_vertical: data.odPrismeVpVertical || null,
        od_prisme_vp_base: data.odPrismeVpBase || null,
        og_prisme_vp_horizontal: data.ogPrismeVpHorizontal || null,
        og_prisme_vp_vertical: data.ogPrismeVpVertical || null,
        og_prisme_vp_base: data.ogPrismeVpBase || null,
        dp_binoculaire: data.dpBinoculaire || null,
        dp_od: data.dpOd || null,
        dp_og: data.dpOg || null,
        hauteur_od: data.hauteurOd || null,
        hauteur_og: data.hauteurOg || null,
        distance_vertex: data.distanceVertex || null,
        inclinaison_pantoscopique: data.inclinaisonPantoscopique || null,
        angle_courbe_faciale: data.angleCourbeFaciale || null,
        verre_type: data.verreType || null,
        verre_indice: data.verreIndice || null,
        verre_traitement: data.verreTraitement || null,
        statut: data.statut || 'active',
      };

      let result;
      if (initialData?.id) {
        result = await supabase.from('prescriptions').update(payload).eq('id', initialData.id);
      } else {
        result = await supabase.from('prescriptions').insert([{ ...payload, user_id: user?.id }]);
      }

      if (result.error) throw result.error;

      toast.success('Ordonnance enregistrée avec succès');
      if (onSuccess) onSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de l\'enregistrement');
      console.error(error);
    }
  }

  // Reusable OD/OG correction grid for a given vision mode ('vl' | 'vp').
  // When `readOnly` is true the section is the auto-calculated one: its inputs
  // are disabled and it is visually marked as auto-generated.
  const renderCorrectionGrid = (mode: 'vl' | 'vp', readOnly: boolean) => {
    const suffix = mode === 'vl' ? 'Vl' : 'Vp';
    const sphLabel = mode === 'vl' ? 'Sphère VL' : 'Sphère VP';
    const ro = readOnly;
    // Distinct fields per mode for AV/Prisme:
    const avVlName = (mode === 'vl' ? 'odAvVl' : 'odAvVpVl');
    const avVpName = 'odAvVp';
    const avNatName = (mode === 'vl' ? 'odAvNature' : 'odAvVpNature');
    const ogAvVlName = (mode === 'vl' ? 'ogAvVl' : 'ogAvVpVl');
    const ogAvVpName = 'ogAvVp';
    const ogAvNatName = (mode === 'vl' ? 'ogAvNature' : 'ogAvVpNature');
    const prH = (mode === 'vl' ? 'odPrismeHorizontal' : 'odPrismeVpHorizontal');
    const prV = (mode === 'vl' ? 'odPrismeVertical' : 'odPrismeVpVertical');
    const prB = (mode === 'vl' ? 'odPrismeBase' : 'odPrismeVpBase');
    const ogPrH = (mode === 'vl' ? 'ogPrismeHorizontal' : 'ogPrismeVpHorizontal');
    const ogPrV = (mode === 'vl' ? 'ogPrismeVertical' : 'ogPrismeVpVertical');
    const ogPrB = (mode === 'vl' ? 'ogPrismeBase' : 'ogPrismeVpBase');
    const roInput = ro ? 'bg-muted/60 cursor-not-allowed text-muted-foreground' : '';

    return (
      <div className={'grid grid-cols-1 md:grid-cols-2 gap-6' + (ro ? ' opacity-90' : '')}>
        {/* OD */}
        <div className="border rounded-[6px] p-4 space-y-4 bg-sky-50/30 dark:bg-white/5">
          <h3 className="text-sm font-semibold text-sky-700 dark:text-sky-400">Œil Droit (OD)</h3>
          <div className="grid grid-cols-2 gap-2">
            <FormField control={form.control} name={`odSph${suffix}` as any} render={({ field }) => (
              <FormItem><FormLabel className="text-xs">{sphLabel}</FormLabel>
                <FormControl><Input type="number" step="0.25" placeholder="0.00" readOnly={ro} className={'h-10 rounded-xl ' + roInput} {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name={`odCyl${suffix}` as any} render={({ field }) => (
              <FormItem><FormLabel className="text-xs">Cylindre</FormLabel>
                <FormControl><Input type="number" step="0.25" placeholder="0.00" readOnly={ro} className={'h-10 rounded-xl ' + roInput} {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name={`odAxe${suffix}` as any} render={({ field }) => (
              <FormItem><FormLabel className="text-xs">Axe</FormLabel>
                <FormControl><Input type="number" placeholder="0" readOnly={ro} className={'h-10 rounded-xl ' + roInput} {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name={`odAdd${suffix}` as any} render={({ field }) => (
              <FormItem><FormLabel className="text-xs">Addition</FormLabel>
                <FormControl><Input type="number" step="0.25" placeholder="0.00" readOnly={ro} className={'h-10 rounded-xl ' + roInput} {...field} /></FormControl></FormItem>
            )} />
          </div>
          {/* AV */}
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase mb-2">Acuité Visuelle</p>
            <div className="grid grid-cols-2 gap-2">
              <FormField control={form.control} name={avVlName as any} render={({ field }) => (
                <FormItem><FormLabel className="text-xs">VL</FormLabel>
                  <FormControl><Input type="number" step="0.1" placeholder="10/10" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name={avVpName as any} render={({ field }) => (
                <FormItem><FormLabel className="text-xs">VP</FormLabel>
                  <FormControl><Input type="number" step="0.1" placeholder="10/10" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
            </div>
            <FormField control={form.control} name={avNatName as any} render={({ field }) => (
              <FormItem className="mt-2">
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Nature AV..." /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="cc">CC (corrigé)</SelectItem>
                    <SelectItem value="sc">SC (sans correction)</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
          </div>
          {/* Prisme */}
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase mb-2">Prisme</p>
            <div className="grid grid-cols-3 gap-2">
              <FormField control={form.control} name={prH as any} render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Horizontal Δ</FormLabel>
                  <FormControl><Input type="number" step="0.5" placeholder="0" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name={prV as any} render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Vertical Δ</FormLabel>
                  <FormControl><Input type="number" step="0.5" placeholder="0" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name={prB as any} render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Base</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl>
                      <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="..." /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {BASES_PRISME.map((b) => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>
          </div>
        </div>

        {/* OG */}
        <div className="border rounded-[6px] p-4 space-y-4 bg-emerald-50/30 dark:bg-white/5">
          <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Œil Gauche (OG)</h3>
          <div className="grid grid-cols-2 gap-2">
            <FormField control={form.control} name={`ogSph${suffix}` as any} render={({ field }) => (
              <FormItem><FormLabel className="text-xs">{sphLabel}</FormLabel>
                <FormControl><Input type="number" step="0.25" placeholder="0.00" readOnly={ro} className={'h-10 rounded-xl ' + roInput} {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name={`ogCyl${suffix}` as any} render={({ field }) => (
              <FormItem><FormLabel className="text-xs">Cylindre</FormLabel>
                <FormControl><Input type="number" step="0.25" placeholder="0.00" readOnly={ro} className={'h-10 rounded-xl ' + roInput} {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name={`ogAxe${suffix}` as any} render={({ field }) => (
              <FormItem><FormLabel className="text-xs">Axe</FormLabel>
                <FormControl><Input type="number" placeholder="0" readOnly={ro} className={'h-10 rounded-xl ' + roInput} {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name={`ogAdd${suffix}` as any} render={({ field }) => (
              <FormItem><FormLabel className="text-xs">Addition</FormLabel>
                <FormControl><Input type="number" step="0.25" placeholder="0.00" readOnly={ro} className={'h-10 rounded-xl ' + roInput} {...field} /></FormControl></FormItem>
            )} />
          </div>
          {/* AV */}
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase mb-2">Acuité Visuelle</p>
            <div className="grid grid-cols-2 gap-2">
              <FormField control={form.control} name={ogAvVlName as any} render={({ field }) => (
                <FormItem><FormLabel className="text-xs">VL</FormLabel>
                  <FormControl><Input type="number" step="0.1" placeholder="10/10" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name={ogAvVpName as any} render={({ field }) => (
                <FormItem><FormLabel className="text-xs">VP</FormLabel>
                  <FormControl><Input type="number" step="0.1" placeholder="10/10" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
            </div>
            <FormField control={form.control} name={ogAvNatName as any} render={({ field }) => (
              <FormItem className="mt-2">
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Nature AV..." /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="cc">CC (corrigé)</SelectItem>
                    <SelectItem value="sc">SC (sans correction)</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
          </div>
          {/* Prisme */}
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase mb-2">Prisme</p>
            <div className="grid grid-cols-3 gap-2">
              <FormField control={form.control} name={ogPrH as any} render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Horizontal Δ</FormLabel>
                  <FormControl><Input type="number" step="0.5" placeholder="0" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name={ogPrV as any} render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Vertical Δ</FormLabel>
                  <FormControl><Input type="number" step="0.5" placeholder="0" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name={ogPrB as any} render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Base</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl>
                      <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="..." /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {BASES_PRISME.map((b) => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>
          </div>
        </div>
      </div>
    );
  };

  // A labelled vision section (header + correction grid) used in progressif mode.
  const renderProgressifSection = (mode: 'vl' | 'vp', readOnly: boolean) => {
    const title = mode === 'vl' ? 'Vision de loin' : 'Vision de près';
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wide">{title} :</h2>
          {readOnly ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
              Calculé automatiquement (lecture seule)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
              Section source (modifiable)
            </span>
          )}
        </div>
        {renderCorrectionGrid(mode, readOnly)}
      </div>
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Patient Info */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <User className="h-4 w-4 text-primary" />
            Patient
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormField control={form.control} name="clientId" render={({ field }) => (
              <FormItem>
                <FormLabel>Client *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10"><SelectValue placeholder="Sélectionner un client" /></SelectTrigger>
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
            <FormField control={form.control} name="dateOrdonnance" render={({ field }) => (
              <FormItem>
                <FormLabel>Date d'ordonnance *</FormLabel>
                <FormControl><Input type="date" className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="dateExpiration" render={({ field }) => (
              <FormItem>
                <FormLabel>Date d'expiration</FormLabel>
                <FormControl><Input type="date" className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="typePrescription" render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10"><SelectValue placeholder="Type..." /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="premiere">Première</SelectItem>
                    <SelectItem value="renouvellement">Renouvellement</SelectItem>
                    <SelectItem value="remplacement">Remplacement</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </div>

        {/* Médecin Traitant */}
        <div className="space-y-4 p-4 rounded-[6px] border border-sky-200/50 bg-sky-50/30 dark:border-sky-500/20 dark:bg-sky-500/5">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground dark:text-white">
            <Stethoscope className="h-4 w-4 text-sky-500" />
            Médecin Traitant
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FormField control={form.control} name="medecinTraitantNom" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-muted-foreground">Nom du médecin</FormLabel>
                <FormControl>
                  <Input placeholder="Dr. ..." className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="medecinTraitantSpecialite" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-muted-foreground">Spécialité</FormLabel>
                <FormControl>
                  <Input placeholder="Ophtalmologue, optométriste..." className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="medecinTraitantTelephone" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-muted-foreground">Téléphone</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Phone className="absolute start-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="tel" dir="ltr" placeholder="+212 6..." className="h-12 ps-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10" {...field} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="medecinTraitantEmail" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-muted-foreground">Email</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail className="absolute start-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="email" placeholder="medecin@exemple.com" className="h-12 ps-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10" {...field} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="medecinTraitantAdresse" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-muted-foreground">Adresse</FormLabel>
                <FormControl>
                  <div className="relative">
                    <MapPin className="absolute start-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Adresse du cabinet" className="h-12 ps-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10" {...field} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </div>

        {/* Type de vision */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField control={form.control} name="visionType" render={({ field }) => (
            <FormItem>
              <FormLabel>Type de vision</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ''}>
                <FormControl>
                  <SelectTrigger className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10"><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="vl">Vision de loin</SelectItem>
                  <SelectItem value="vp">Vision de près</SelectItem>
                  <SelectItem value="progressif">Progressif</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          {/* Progressif: source vision selector + Calculer button */}
          {isProgressif && (
            <FormField control={form.control} name="progressifSource" render={({ field }) => (
              <FormItem>
                <FormLabel>Type de vision (source du calcul)</FormLabel>
                <div className="flex items-end gap-2">
                  <Select onValueChange={field.onChange} value={field.value || 'vl'}>
                    <FormControl>
                      <SelectTrigger className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10"><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="vl">Vision de loin</SelectItem>
                      <SelectItem value="vp">Vision de près</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    onClick={() => calculateProgressif(field.value || 'vl')}
                    className="h-12 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold px-5 shadow-none whitespace-nowrap"
                  >
                    Calculer
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )} />
          )}
        </div>

        {/* Progressif: dynamically ordered VL / VP sections.
            The source section (chosen above) is editable and shown first;
            the other section is auto-calculated and read-only. */}
        {isProgressif && (
          <div className="space-y-8">
            {sourceIsVl ? (
              <>
                {renderProgressifSection('vl', false)}
                {renderProgressifSection('vp', true)}
              </>
            ) : (
              <>
                {renderProgressifSection('vp', false)}
                {renderProgressifSection('vl', true)}
              </>
            )}
          </div>
        )}

        {/* OD / OG side-by-side (non-progressif only) */}
        {!isProgressif && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* OD */}
          <div className="border rounded-[6px] p-4 space-y-4 bg-sky-50/30 dark:bg-white/5">
            <h3 className="text-sm font-semibold text-sky-700 dark:text-sky-400">Œil Droit (OD)</h3>
            <div className="grid grid-cols-2 gap-2">
              {!isVpOnly ? (<>
              <FormField control={form.control} name="odSphVl" render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Sphère VL</FormLabel>
                  <FormControl><Input type="number" step="0.25" placeholder="0.00" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="odCylVl" render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Cylindre</FormLabel>
                  <FormControl><Input type="number" step="0.25" placeholder="0.00" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="odAxeVl" render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Axe</FormLabel>
                  <FormControl><Input type="number" placeholder="0" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="odAddVl" render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Addition</FormLabel>
                  <FormControl><Input type="number" step="0.25" placeholder="0.00" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              </>) : (<>
              <FormField control={form.control} name="odSphVp" render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Sphère VP</FormLabel>
                  <FormControl><Input type="number" step="0.25" placeholder="0.00" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="odCylVp" render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Cylindre</FormLabel>
                  <FormControl><Input type="number" step="0.25" placeholder="0.00" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="odAxeVp" render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Axe</FormLabel>
                  <FormControl><Input type="number" placeholder="0" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="odAddVp" render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Addition</FormLabel>
                  <FormControl><Input type="number" step="0.25" placeholder="0.00" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              </>)}
            </div>
            {/* AV */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase mb-2">Acuité Visuelle</p>
              <div className="grid grid-cols-2 gap-2">
                <FormField control={form.control} name="odAvVl" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">VL</FormLabel>
                    <FormControl><Input type="number" step="0.1" placeholder="10/10" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="odAvVp" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">VP</FormLabel>
                    <FormControl><Input type="number" step="0.1" placeholder="10/10" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="odAvNature" render={({ field }) => (
                <FormItem className="mt-2">
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl>
                      <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Nature AV..." /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="cc">CC (corrigé)</SelectItem>
                      <SelectItem value="sc">SC (sans correction)</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>
            {/* Prisme */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase mb-2">Prisme</p>
              <div className="grid grid-cols-3 gap-2">
                <FormField control={form.control} name="odPrismeHorizontal" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">Horizontal Δ</FormLabel>
                    <FormControl><Input type="number" step="0.5" placeholder="0" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="odPrismeVertical" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">Vertical Δ</FormLabel>
                    <FormControl><Input type="number" step="0.5" placeholder="0" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="odPrismeBase" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">Base</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="..." /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BASES_PRISME.map((b) => (
                          <SelectItem key={b} value={b}>{b}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
            </div>
          </div>

          {/* OG */}
          <div className="border rounded-[6px] p-4 space-y-4 bg-emerald-50/30 dark:bg-white/5">
            <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Œil Gauche (OG)</h3>
            <div className="grid grid-cols-2 gap-2">
              {!isVpOnly ? (<>
              <FormField control={form.control} name="ogSphVl" render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Sphère VL</FormLabel>
                  <FormControl><Input type="number" step="0.25" placeholder="0.00" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="ogCylVl" render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Cylindre</FormLabel>
                  <FormControl><Input type="number" step="0.25" placeholder="0.00" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="ogAxeVl" render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Axe</FormLabel>
                  <FormControl><Input type="number" placeholder="0" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="ogAddVl" render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Addition</FormLabel>
                  <FormControl><Input type="number" step="0.25" placeholder="0.00" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              </>) : (<>
              <FormField control={form.control} name="ogSphVp" render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Sphère VP</FormLabel>
                  <FormControl><Input type="number" step="0.25" placeholder="0.00" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="ogCylVp" render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Cylindre</FormLabel>
                  <FormControl><Input type="number" step="0.25" placeholder="0.00" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="ogAxeVp" render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Axe</FormLabel>
                  <FormControl><Input type="number" placeholder="0" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="ogAddVp" render={({ field }) => (
                <FormItem><FormLabel className="text-xs">Addition</FormLabel>
                  <FormControl><Input type="number" step="0.25" placeholder="0.00" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
              )} />
              </>)}
            </div>
            {/* AV */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase mb-2">Acuité Visuelle</p>
              <div className="grid grid-cols-2 gap-2">
                <FormField control={form.control} name="ogAvVl" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">VL</FormLabel>
                    <FormControl><Input type="number" step="0.1" placeholder="10/10" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="ogAvVp" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">VP</FormLabel>
                    <FormControl><Input type="number" step="0.1" placeholder="10/10" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="ogAvNature" render={({ field }) => (
                <FormItem className="mt-2">
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl>
                      <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Nature AV..." /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="cc">CC (corrigé)</SelectItem>
                      <SelectItem value="sc">SC (sans correction)</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>
            {/* Prisme */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase mb-2">Prisme</p>
              <div className="grid grid-cols-3 gap-2">
                <FormField control={form.control} name="ogPrismeHorizontal" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">Horizontal Δ</FormLabel>
                    <FormControl><Input type="number" step="0.5" placeholder="0" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="ogPrismeVertical" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">Vertical Δ</FormLabel>
                    <FormControl><Input type="number" step="0.5" placeholder="0" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="ogPrismeBase" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">Base</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="..." /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BASES_PRISME.map((b) => (
                          <SelectItem key={b} value={b}>{b}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
            </div>
          </div>
        </div>
        )}


        {/* DP & Hauteur & Fitting specs */}
        <div className="border rounded-[6px] p-4 space-y-3 bg-slate-50/30 dark:bg-white/5">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-400">Paramètres de Montage</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <FormField control={form.control} name="dpBinoculaire" render={({ field }) => (
              <FormItem><FormLabel className="text-xs">DP binoculaire</FormLabel>
                <FormControl><Input type="number" step="0.5" placeholder="mm" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="dpOd" render={({ field }) => (
              <FormItem><FormLabel className="text-xs">DP OD</FormLabel>
                <FormControl><Input type="number" step="0.5" placeholder="mm" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="dpOg" render={({ field }) => (
              <FormItem><FormLabel className="text-xs">DP OG</FormLabel>
                <FormControl><Input type="number" step="0.5" placeholder="mm" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="hauteurOd" render={({ field }) => (
              <FormItem><FormLabel className="text-xs">Hauteur OD</FormLabel>
                <FormControl><Input type="number" step="0.5" placeholder="mm" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
            )} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <FormField control={form.control} name="hauteurOg" render={({ field }) => (
              <FormItem><FormLabel className="text-xs">Hauteur OG</FormLabel>
                <FormControl><Input type="number" step="0.5" placeholder="mm" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="distanceVertex" render={({ field }) => (
              <FormItem><FormLabel className="text-xs">Distance vertex</FormLabel>
                <FormControl><Input type="number" step="0.5" placeholder="mm" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="inclinaisonPantoscopique" render={({ field }) => (
              <FormItem><FormLabel className="text-xs">Inclinaison panto.</FormLabel>
                <FormControl><Input type="number" step="1" placeholder="°" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="angleCourbeFaciale" render={({ field }) => (
              <FormItem><FormLabel className="text-xs">Angle courbe faciale</FormLabel>
                <FormControl><Input type="number" step="1" placeholder="°" className="h-10 rounded-xl" {...field} /></FormControl></FormItem>
            )} />
          </div>
        </div>

        {/* Verre prescrit */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField control={form.control} name="verreType" render={({ field }) => (
            <FormItem>
              <FormLabel>Type de verre prescrit</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ''}>
                <FormControl>
                  <SelectTrigger className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10"><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="unifocal">Unifocal</SelectItem>
                  <SelectItem value="progressif">Progressif</SelectItem>
                  <SelectItem value="bifocal">Bifocal</SelectItem>
                  <SelectItem value="travail">Travail</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="verreIndice" render={({ field }) => (
            <FormItem>
              <FormLabel>Indice</FormLabel>
              <Select onValueChange={(v) => field.onChange(v ? parseFloat(v) : '')} value={field.value?.toString() || ''}>
                <FormControl>
                  <SelectTrigger className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10"><SelectValue placeholder="Indice..." /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {INDICE_OPTIONS.map((ind) => (
                    <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="verreTraitement" render={({ field }) => (
            <FormItem>
              <FormLabel>Traitement</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ''}>
                <FormControl>
                  <SelectTrigger className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10"><SelectValue placeholder="Traitement..." /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="aucun">HC</SelectItem>
                  <SelectItem value="anti-reflet">Anti-reflet</SelectItem>
                  <SelectItem value="anti-lumiere-bleue">Anti-lumière bleue</SelectItem>
                  <SelectItem value="photochromique">Photochromique</SelectItem>
                  <SelectItem value="polarisant">Polarisant</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>Notes</FormLabel>
            <FormControl><Textarea placeholder="Notes complémentaires..." className="rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="flex justify-end pt-4 border-t dark:border-white/10">
          <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 h-12 rounded-[4px] shadow-none">
            {t('shared.actions.save')}
          </Button>
        </div>
      </form>
    </Form>
  );
}

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
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface RendezVousFormProps {
  initialData?: any;
  onSuccess?: () => void;
}

const TYPES_RDV = ['examen_vue', 'essayage', 'livraison', 'reparation', 'reglage', 'rappel_periodique', 'autre'] as const;
const STATUTS_RDV = ['planifie', 'confirme', 'effectue', 'annule', 'reporte'] as const;

export function RendezVousForm({ initialData, onSuccess }: RendezVousFormProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [clients, setClients] = useState<any[]>([]);

  const rdvSchema = z.object({
    clientId: z.string().min(1, t('shared.validation.client_required')),
    dateRdv: z.string().min(1, t('shared.validation.date_required')),
    heureRdv: z.string().min(1, 'L\'heure est requise'),
    duree: z.coerce.number().min(5).optional(),
    typeRdv: z.string().min(1, 'Le type est requis'),
    statut: z.string().optional(),
    notes: z.string().optional(),
    rappelSms: z.boolean().optional(),
    rappelEmail: z.boolean().optional(),
  });

  type FormValues = z.infer<typeof rdvSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(rdvSchema) as any,
    defaultValues: {
      clientId: initialData?.client_id?.toString() || '',
      dateRdv: initialData?.date_rdv || new Date().toISOString().split('T')[0],
      heureRdv: initialData?.heure_rdv || '',
      duree: initialData?.duree_minutes || 30,
      typeRdv: initialData?.type_rdv || '',
      statut: initialData?.statut || 'planifie',
      notes: initialData?.notes || '',
      rappelSms: initialData?.rappel_sms || false,
      rappelEmail: initialData?.rappel_email || false,
    },
  });

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
        dateRdv: initialData.date_rdv || '',
        heureRdv: initialData.heure_rdv || '',
        duree: initialData.duree_minutes || 30,
        typeRdv: initialData.type_rdv || '',
        statut: initialData.statut || 'planifie',
        notes: initialData.notes || '',
        rappelSms: initialData.rappel_sms || false,
        rappelEmail: initialData.rappel_email || false,
      });
    }
  }, [initialData, form]);

  async function onSubmit(data: FormValues) {
    try {
      const payload = {
        user_id: user?.id,
        client_id: parseInt(data.clientId),
        date_rdv: data.dateRdv,
        heure_rdv: data.heureRdv,
        duree_minutes: data.duree || 30,
        type_rdv: data.typeRdv,
        statut: data.statut || 'planifie',
        notes: data.notes || null,
        rappel_sms: data.rappelSms || false,
        rappel_email: data.rappelEmail || false,
      };

      if (initialData?.id) {
        const { error } = await supabase.from('rendez_vous').update(payload).eq('id', initialData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('rendez_vous').insert([payload]);
        if (error) throw error;
      }

      toast.success(t('rendez_vous.toast_saved'));
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast.error(err.message || t('shared.toast.save_error'));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField control={form.control} name="clientId" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('rendez_vous.form.client_label')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="h-12 rounded-xl dark:bg-slate-950/50 dark:border-white/10">
                    <SelectValue placeholder={t('shared.form.select_client')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="dark:bg-slate-900 dark:border-white/10">
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="typeRdv" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('rendez_vous.form.type_rdv')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="h-12 rounded-xl dark:bg-slate-950/50 dark:border-white/10">
                    <SelectValue placeholder={t('shared.form.select_placeholder')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="dark:bg-slate-900 dark:border-white/10">
                  {TYPES_RDV.map((type) => (
                    <SelectItem key={type} value={type}>{t(`rendez_vous.type_${type}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField control={form.control} name="dateRdv" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('rendez_vous.form.date_rdv')}</FormLabel>
              <FormControl><Input type="date" className="h-12 rounded-xl dark:bg-slate-950/50 dark:border-white/10" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="heureRdv" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('rendez_vous.form.heure_rdv')}</FormLabel>
              <FormControl><Input type="time" className="h-12 rounded-xl dark:bg-slate-950/50 dark:border-white/10" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="duree" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('rendez_vous.form.duree')}</FormLabel>
              <FormControl><Input type="number" min={5} step={5} className="h-12 rounded-xl dark:bg-slate-950/50 dark:border-white/10" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <div className="flex gap-6">
          <FormField control={form.control} name="rappelSms" render={({ field }) => (
            <FormItem className="flex items-center gap-2">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="text-sm cursor-pointer">{t('rendez_vous.form.rappel_sms')}</FormLabel>
            </FormItem>
          )} />
          <FormField control={form.control} name="rappelEmail" render={({ field }) => (
            <FormItem className="flex items-center gap-2">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="text-sm cursor-pointer">{t('rendez_vous.form.rappel_email')}</FormLabel>
            </FormItem>
          )} />
        </div>

        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>{t('rendez_vous.form.notes')}</FormLabel>
            <FormControl>
              <Textarea rows={3} className="rounded-xl dark:bg-slate-950/50 dark:border-white/10" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="flex justify-end pt-6 border-t border-border/50 dark:border-white/10">
          <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 h-10 rounded-[4px] shadow-none">
            {t('shared.actions.save')}
          </Button>
        </div>
      </form>
    </Form>
  );
}

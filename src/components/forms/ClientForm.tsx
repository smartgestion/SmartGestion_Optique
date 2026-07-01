import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner'
import { Mail, Phone, MapPin, Save, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface ClientFormProps {
  initialData?: any;
  /** Receives the created/updated client row (when available) so callers such
   *  as the Ordre de Travail hub can auto-select the freshly created client. */
  onSuccess?: (client?: any) => void;
}

const COUVERTURE_OPTIONS = ['cnss', 'cnops', 'far', 'assurance', 'autre'] as const;

export function ClientForm({ initialData, onSuccess }: ClientFormProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const clientSchema = z.object({
    civilite: z.string().optional(),
    nom: z.string().min(2, { message: t('shared.validation.name_min') }),
    telephone: z.string().optional().or(z.literal('')),
    email: z.string().optional().or(z.literal('')),
    adresse: z.string().optional().or(z.literal('')),
    dateNaissance: z.string().optional().or(z.literal('')),
    cine: z.string().optional().or(z.literal('')),
    couvertureSociale: z.string().optional().or(z.literal('')),
    lunetteExpirationDate: z.string().optional().or(z.literal('')),
  });

  type ClientFormValues = z.infer<typeof clientSchema>;
  
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      civilite: 'Mr',
      nom: '',
      telephone: '',
      email: '',
      adresse: '',
      dateNaissance: '',
      cine: '',
      couvertureSociale: '',
      lunetteExpirationDate: '',
    },
  });

  const formRef = useRef<HTMLFormElement>(null);
  const isInitialized = useRef(false);

  const resetForm = (data?: any) => ({
    civilite: data?.civilite || (data?.genre === 'femme' ? 'Mme' : data?.genre === 'enfant' ? 'Enf.' : 'Mr'),
    nom: data?.nom || '',
    telephone: data?.telephone || '',
    email: data?.email || '',
    adresse: data?.adresse || '',
    dateNaissance: data?.dateNaissance || data?.date_naissance || '',
    cine: data?.cine || data?.CINE || '',
    couvertureSociale: data?.couvertureSociale || data?.couverture_sociale || '',
    lunetteExpirationDate: data?.lunetteExpirationDate || data?.lunette_expiration_date || '',
  });

  useEffect(() => {
    if (initialData?.id && !isInitialized.current) {
      form.reset(resetForm(initialData));
      isInitialized.current = true;
    } else if (!initialData?.id && !isInitialized.current) {
      form.reset(resetForm(null));
      isInitialized.current = true;
    }
    
    return () => {
      isInitialized.current = false;
    };
  }, [initialData, form]);

  async function onSubmit(data: ClientFormValues) {
    try {
      const isEditing = initialData?.id;
      
      const payload = {
        nom: data.nom,
        genre: data.civilite === 'Mme' ? 'femme' : data.civilite === 'Enf.' ? 'enfant' : 'homme',
        telephone: data.telephone || null,
        email: data.email || null,
        adresse: data.adresse || null,
        date_naissance: data.dateNaissance || null,
        cine: data.cine || null,
        couverture_sociale: data.couvertureSociale || null,
        lunette_expiration_date: data.lunetteExpirationDate || null,
      };
      
      let savedClient: any = initialData?.id ? { ...initialData, ...payload } : null;
      if (isEditing) {
        const { data: updated, error } = await supabase.from('clients').update(payload).eq('id', initialData.id).select().single();
        if (error) throw error;
        if (updated) savedClient = updated;
      } else {
        const { data: inserted, error } = await supabase.from('clients').insert([{ ...payload, user_id: user?.id }]).select().single();
        if (error) throw error;
        savedClient = inserted;
      }

      toast.success(isEditing ? 'Client modifié avec succès' : 'Client créé avec succès');
      isInitialized.current = false;
      if (onSuccess) onSuccess(savedClient);
    } catch (error: any) {
      toast.error(error.message || t('shared.toast.save_error'));
      console.error(error);
    }
  }

  return (
    <Form {...form}>
      <form ref={formRef} onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Civilité + Nom complet */}
        <div className="flex gap-3 items-start">
          <div className="w-28 shrink-0">
            <FormField
              control={form.control}
              name="civilite"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold">Civilité</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || 'Mr'}>
                    <FormControl>
                      <SelectTrigger className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10 dark:text-white">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="dark:bg-slate-900 dark:border-white/10">
                      <SelectItem value="Mr">Mr</SelectItem>
                      <SelectItem value="Mme">Mme</SelectItem>
                      <SelectItem value="Enf.">Enf. (Enfant)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="flex-1">
            <FormField
              control={form.control}
              name="nom"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold">Nom complet *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ahmed Benali" className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10 dark:text-white" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Date de naissance */}
          <FormField
            control={form.control}
            name="dateNaissance"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-muted-foreground">Date de naissance</FormLabel>
                <FormControl>
                  <Input type="date" className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10 dark:text-white" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* CINE */}
          <FormField
            control={form.control}
            name="cine"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-muted-foreground">CINE</FormLabel>
                <FormControl>
                  <Input placeholder="Numéro CINE" className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10 dark:text-white" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Contact */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Mail className="h-4 w-4 text-primary" />
            Contact
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-muted-foreground">Email</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="absolute start-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input type="email" placeholder="email@exemple.com" className="h-12 ps-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10 dark:text-white" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="telephone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-muted-foreground">Numéro téléphone</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Phone className="absolute start-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input type="tel" dir="ltr" placeholder="+212 6 00 00 00 00" className="h-12 ps-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10 dark:text-white" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Adresse */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MapPin className="h-4 w-4 text-primary" />
            Adresse
          </div>
          <FormField
            control={form.control}
            name="adresse"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input placeholder="Adresse complète" className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10 dark:text-white" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Couverture Sociale */}
        <div className="space-y-4 p-4 rounded-[6px] border border-emerald-200/50 bg-emerald-50/30 dark:border-emerald-500/20 dark:bg-emerald-500/5">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground dark:text-white">
            <span className="h-4 w-4 text-emerald-500">◆</span>
            Couverture Sociale
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="couvertureSociale"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-muted-foreground">Type de couverture</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl>
                      <SelectTrigger className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10 dark:text-white">
                        <SelectValue placeholder="Sélectionner..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="dark:bg-slate-900 dark:border-white/10">
                      {COUVERTURE_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt.toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Expiration Lunette */}
        <div className="space-y-4 p-4 rounded-[6px] border border-amber-200/50 bg-amber-50/30 dark:border-amber-500/20 dark:bg-amber-500/5">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground dark:text-white">
            <span className="h-4 w-4 text-amber-500">◈</span>
            Expiration Lunette
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="lunetteExpirationDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-muted-foreground">Date d'expiration</FormLabel>
                  <FormControl>
                    <Input type="date" className="h-12 rounded-xl border-border/50 dark:bg-slate-950/50 dark:border-white/10 dark:text-white" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-6 border-t border-border/50 dark:border-white/10">
          <Button type="submit" disabled={form.formState.isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 h-10 rounded-[4px] shadow-none">
            {form.formState.isSubmitting ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" />{t('shared.actions.saving')}</>
            ) : (
              <><Save className="mr-2 h-5 w-5" />{initialData?.id ? 'Modifier' : 'Créer'}</>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}

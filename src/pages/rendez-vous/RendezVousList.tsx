import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus, Search, FileEdit, Trash2, ArrowLeft, ChevronLeft, ChevronRight,
  CalendarDays, Clock, Phone, Mail
} from 'lucide-react';
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { toast } from 'sonner'
import { RendezVousForm } from '@/components/forms/RendezVousForm'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface RendezVous {
  id: number;
  client_id: number;
  client_nom?: string;
  date_rdv: string;
  heure_rdv: string;
  duree_minutes: number;
  type_rdv: string;
  statut: string;
  notes: string;
  rappel_sms: boolean;
  rappel_email: boolean;
}

const TYPES_RDV = ['examen_vue', 'essayage', 'livraison', 'reparation', 'reglage', 'rappel_periodique', 'autre'] as const;
const STATUTS_RDV = ['planifie', 'confirme', 'effectue', 'annule', 'reporte'] as const;

const statutConfig: Record<string, { color: string; bg: string }> = {
  planifie: { color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200/50 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20' },
  confirme: { color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200/50 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20' },
  effectue: { color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200/50 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20' },
  annule:   { color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200/50 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20' },
  reporte:  { color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200/50 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20' },
};

const ITEMS_PER_PAGE = 10;

export function RendezVousList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [rdvs, setRdvs] = useState<RendezVous[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingRdv, setEditingRdv] = useState<RendezVous | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [rdvToDelete, setRdvToDelete] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchRdvs = async () => {
    if (!user?.id) { setRdvs([]); setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('rendez_vous')
        .select('*, clients(nom)')
        .eq('user_id', user.id)
        .order('date_rdv', { ascending: false });

      if (error) { toast.error(t('rendez_vous.toast_load_error')); setRdvs([]); setIsLoading(false); return; }

      const rows = data || [];

      // The embedded `clients(nom)` join is not always returned (e.g. the local
      // SQLite adapter), which would make the client column fall back to `#id`.
      // Look the names up explicitly so we always show the full client name.
      const clientNameById = new Map<number, string>();
      const missingIds = Array.from(
        new Set(
          rows
            .filter((r: any) => !r.clients?.nom && r.client_id != null)
            .map((r: any) => r.client_id)
        )
      );
      if (missingIds.length > 0) {
        const { data: clientsData } = await supabase
          .from('clients')
          .select('id, nom')
          .in('id', missingIds);
        (clientsData || []).forEach((c: any) => clientNameById.set(c.id, c.nom));
      }

      const mapped = rows.map((r: any) => ({
        ...r,
        client_nom:
          r.clients?.nom || clientNameById.get(r.client_id) || `#${r.client_id}`,
      }));
      setRdvs(mapped);
    } catch { setRdvs([]); } finally { setIsLoading(false); }
  };

  useEffect(() => { if (user?.id) fetchRdvs(); }, [user?.id]);

  const handleDelete = async () => {
    if (!rdvToDelete || !user?.id) return;
    try {
      const { error } = await supabase.from('rendez_vous').delete().eq('id', rdvToDelete);
      if (error) throw error;
      toast.success(t('rendez_vous.toast_deleted'));
      fetchRdvs();
    } catch (err: any) { toast.error(err.message || t('shared.toast.delete_error')); }
    finally { setDeleteConfirmOpen(false); setRdvToDelete(null); }
  };

  const filtered = useMemo(() => {
    let result = rdvs;
    if (statusFilter !== 'all') result = result.filter((r) => r.statut === statusFilter);
    if (typeFilter !== 'all') result = result.filter((r) => r.type_rdv === typeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => r.client_nom?.toLowerCase().includes(q));
    }
    return result;
  }, [rdvs, searchQuery, statusFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, statusFilter, typeFilter]);

  const closeForm = () => {
    setShowForm(false);
    setEditingRdv(null);
  };

  const StatutBadge = ({ statut }: { statut: string }) => {
    const cfg = statutConfig[statut] || statutConfig.planifie;
    return (
      <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border", cfg.bg, cfg.color)}>
        {t(`rendez_vous.statut_${statut}`)}
      </span>
    );
  };

  const TypeBadge = ({ type }: { type: string }) => (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
      <CalendarDays className="h-3 w-3" />
      {t(`rendez_vous.type_${type}`)}
    </span>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Supprimer le rendez-vous"
        description="Cette action est irréversible."
      />

      {showForm ? (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={closeForm}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                {editingRdv ? t('rendez_vous.dialog_edit') : t('rendez_vous.dialog_create')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {editingRdv ? t('rendez_vous.dialog_subtitle_edit') : t('rendez_vous.dialog_subtitle_create')}
              </p>
            </div>
          </div>
          <div className="rounded-[6px] border border-slate-200 bg-white p-8 dark:bg-[#0F172A] dark:border-white/10">
            <RendezVousForm
              initialData={editingRdv}
              onSuccess={() => { closeForm(); fetchRdvs(); }}
            />
          </div>
        </div>
      ) : (
        <>
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-[6px] bg-violet-50 border border-violet-200/50 dark:bg-violet-500/10 dark:border-violet-500/20">
            <CalendarDays className="h-5 w-5 text-violet-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">{t('rendez_vous.page_title')}</h2>
            <p className="text-sm text-muted-foreground">{t('rendez_vous.page_subtitle')}</p>
          </div>
        </div>

            <Button onClick={() => { setEditingRdv(null); setShowForm(true); }}
              className="bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-[4px] h-10 px-5 shadow-none">
              <Plus className="mr-2 h-4 w-4" />{t('rendez_vous.new_button')}
            </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input type="text" placeholder={t('rendez_vous.search_ph')}
            className="pl-9 h-10 bg-white border-slate-200 rounded-[4px] text-sm dark:bg-[#0F172A] dark:border-white/10 dark:text-white"
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-10 bg-white border-slate-200 rounded-[4px] dark:bg-[#0F172A] dark:border-white/10">
            <SelectValue placeholder={t('rendez_vous.filter_all_status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('rendez_vous.filter_all_status')}</SelectItem>
            {STATUTS_RDV.map((s) => (
              <SelectItem key={s} value={s}>{t(`rendez_vous.statut_${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40 h-10 bg-white border-slate-200 rounded-[4px] dark:bg-[#0F172A] dark:border-white/10">
            <SelectValue placeholder={t('rendez_vous.filter_all_types')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('rendez_vous.filter_all_types')}</SelectItem>
            {TYPES_RDV.map((type) => (
              <SelectItem key={type} value={type}>{t(`rendez_vous.type_${type}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="border border-slate-200 shadow-none rounded-[6px] overflow-hidden dark:bg-[#0F172A] dark:border-white/10">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-slate-100 dark:border-white/5">
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">{t('rendez_vous.col_client')}</TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">{t('rendez_vous.col_date')}</TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">{t('rendez_vous.col_heure')}</TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">{t('rendez_vous.col_type')}</TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">{t('rendez_vous.col_status')}</TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-right dark:text-slate-400">{t('rendez_vous.col_actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 border-4 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground font-medium">{t('shared.empty.loading')}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="bg-slate-50 rounded-[6px] p-4 border border-slate-100 dark:bg-[#0F172A]/40 dark:border-white/10">
                      <CalendarDays className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                    </div>
                    <p className="text-sm text-slate-500 font-medium">
                      {searchQuery || statusFilter !== 'all' || typeFilter !== 'all' ? t('rendez_vous.empty_filtered') : t('rendez_vous.empty_all')}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((r) => (
                <TableRow key={r.id} className="border-b border-slate-100 hover:bg-slate-50/50 dark:border-white/5 dark:hover:bg-white/[0.02]">
                  <TableCell className="px-4 py-4">
                    <span className="text-sm font-semibold text-slate-800 dark:text-white">{r.client_nom || '-'}</span>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <span className="text-sm text-slate-500 dark:text-slate-400">{r.date_rdv || '-'}</span>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-sm text-slate-500 dark:text-slate-400">{r.heure_rdv || '-'}</span>
                      {r.duree_minutes && (
                        <span className="text-[11px] text-slate-400">({r.duree_minutes}min)</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <TypeBadge type={r.type_rdv} />
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <StatutBadge statut={r.statut} />
                  </TableCell>
                  <TableCell className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-[4px]"
                        onClick={() => { setEditingRdv(r); setShowForm(true); }}>
                        <FileEdit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-[4px]"
                        onClick={() => { setRdvToDelete(r.id); setDeleteConfirmOpen(true); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {!isLoading && paginated.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-white/5">
            <p className="text-xs text-slate-400">{(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} sur {filtered.length}</p>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-[4px]" disabled={currentPage === 1}
                onClick={() => { if (currentPage > 1) setCurrentPage(currentPage - 1); }}>
                <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <Button key={page} variant="ghost" size="sm"
                  className={cn("h-8 min-w-[32px] rounded-[4px] text-sm font-medium",
                    page === currentPage ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-white" : "text-slate-400"
                  )}
                  onClick={() => setCurrentPage(page)}>{page}</Button>
              ))}
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-[4px]" disabled={currentPage === totalPages}
                onClick={() => { if (currentPage < totalPages) setCurrentPage(currentPage + 1); }}>
                <ChevronRight className="h-4 w-4 rtl:rotate-180" />
              </Button>
            </div>
          </div>
        )}
      </Card>
        </>
      )}
    </div>
  );
}

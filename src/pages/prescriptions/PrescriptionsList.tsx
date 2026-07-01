import React, { useEffect, useState, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useReactToPrint } from 'react-to-print'
import {
  Plus, Search, FileEdit, Trash2, Eye, ArrowLeft, ChevronLeft, ChevronRight, AlertCircle, Printer
} from 'lucide-react';
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { toast } from 'sonner'
import { PrescriptionForm } from '@/components/forms/PrescriptionForm'
import { PrescriptionDocument } from '@/components/documents/PrescriptionDocument'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface Prescription {
  id: number;
  client_id: number;
  client_nom?: string;
  date_ordonnance: string;
  date_expiration: string;
  statut: string;
  od_sph_vl: number;
  og_sph_vl: number;
  type_vision: string;
  verre_type: string;
  created_at: string;
}

const ITEMS_PER_PAGE = 10;

export function PrescriptionsList() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingPrescription, setEditingPrescription] = useState<Prescription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [prescriptionToDelete, setPrescriptionToDelete] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Printing / PDF of the ordonnance.
  const [printingPrescription, setPrintingPrescription] = useState<any>(null);
  const [entreprise, setEntreprise] = useState<any>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const wasFullscreenRef = useRef(false);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: printingPrescription ? `Ordonnance_${printingPrescription.id}` : 'Ordonnance',
    onBeforePrint: async () => { wasFullscreenRef.current = Boolean(document.fullscreenElement); },
    onAfterPrint: () => {
      setPrintingPrescription(null);
      if (wasFullscreenRef.current && !document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    },
  });

  useEffect(() => {
    if (printingPrescription && printRef.current) {
      handlePrint();
    }
  }, [printingPrescription, handlePrint]);

  const fetchEntreprise = async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase
        .from('parametres')
        .select('id,user_id,nom_societe,nom,adresse,ville,telephone,email,ice,if_number,patente,logo_url,couleur_principale,watermark_text,activer_filigrane')
        .eq('user_id', String(user.id))
        .maybeSingle();
      if (!data) { setEntreprise(null); return; }
      const cleanLogoUrl = !data.logo_url || data.logo_url === 'image.png' ? '' : data.logo_url;
      setEntreprise({
        nom: data.nom || data.nom_societe || '',
        nomEntreprise: data.nom_societe || data.nom || '',
        adresse: data.adresse || '',
        ville: data.ville || '',
        telephone: data.telephone || '',
        email: data.email || '',
        ice: data.ice || '',
        ifNumber: (data as any).if_number || '',
        patente: (data as any).patente || '',
        logoUrl: cleanLogoUrl,
        watermarkText: data.watermark_text || 'SmartGestion',
        activerFiligrane: data.activer_filigrane !== undefined ? data.activer_filigrane : true,
      });
    } catch (error) {
      console.warn('Failed to fetch entreprise:', error);
    }
  };

  const handlePrintPrescription = async (id: number) => {
    try {
      toast.info('Préparation de l\'ordonnance...');
      const { data, error } = await supabase
        .from('prescriptions')
        .select('*, client:clients(*)')
        .eq('id', id)
        .single();
      if (error) throw error;
      setPrintingPrescription(data);
    } catch (error: any) {
      toast.error(error.message || 'Erreur de chargement de l\'ordonnance');
    }
  };

  const fetchPrescriptions = async () => {
    if (!user?.id) {
      setPrescriptions([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('prescriptions')
        .select('*, clients(nom)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        toast.error('Erreur de chargement des ordonnances');
        setPrescriptions([]);
        setIsLoading(false);
        return;
      }

      const rows = data || [];

      // The embedded `clients(nom)` join is not always returned (e.g. the local
      // SQLite adapter), which would make the client column fall back to `#id`.
      // Look the names up explicitly so we always show the full client name.
      const clientNameById = new Map<number, string>();
      const missingIds = Array.from(
        new Set(
          rows
            .filter((p: any) => !p.clients?.nom && p.client_id != null)
            .map((p: any) => p.client_id)
        )
      );
      if (missingIds.length > 0) {
        const { data: clientsData } = await supabase
          .from('clients')
          .select('id, nom')
          .in('id', missingIds);
        (clientsData || []).forEach((c: any) => clientNameById.set(c.id, c.nom));
      }

      const mapped = rows.map((p: any) => ({
        ...p,
        client_nom:
          p.clients?.nom || clientNameById.get(p.client_id) || `#${p.client_id}`,
      }));
      setPrescriptions(mapped);
    } catch (error: any) {
      console.error('ERROR:', error);
      setPrescriptions([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) { fetchPrescriptions(); fetchEntreprise(); }
  }, [user?.id]);

  const handleDelete = async () => {
    if (!prescriptionToDelete || !user?.id) return;
    try {
      const { error } = await supabase.from('prescriptions').delete().eq('id', prescriptionToDelete);
      if (error) throw error;
      toast.success('Ordonnance supprimée');
      fetchPrescriptions();
    } catch (error: any) {
      toast.error(error.message || 'Erreur de suppression');
    } finally {
      setDeleteConfirmOpen(false);
      setPrescriptionToDelete(null);
    }
  };

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return prescriptions;
    const q = searchQuery.toLowerCase();
    return prescriptions.filter((p) =>
      p.client_nom?.toLowerCase().includes(q) ||
      p.verre_type?.toLowerCase().includes(q) ||
      p.statut?.toLowerCase().includes(q)
    );
  }, [prescriptions, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => { setCurrentPage(1); }, [searchQuery]);

  const closeForm = () => {
    setShowForm(false);
    setEditingPrescription(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Supprimer l'ordonnance"
        description="Êtes-vous sûr de vouloir supprimer cette ordonnance ? Cette action est irréversible."
      />

      {showForm ? (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={closeForm}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                {editingPrescription ? "Modifier l'ordonnance" : 'Nouvelle Ordonnance'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {editingPrescription ? "Modifier l'ordonnance existante" : 'Créez une nouvelle ordonnance pour un client'}
              </p>
            </div>
          </div>
          <div className="rounded-[6px] border border-slate-200 bg-white p-8 dark:bg-[#0F172A] dark:border-white/10">
            <PrescriptionForm
              initialData={editingPrescription}
              onSuccess={() => { closeForm(); fetchPrescriptions(); }}
            />
          </div>
        </div>
      ) : (
        <>
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-[6px] bg-sky-50 border border-sky-200/50 dark:bg-sky-500/10 dark:border-sky-500/20">
            <Eye className="h-5 w-5 text-sky-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Ordonnances</h2>
            <p className="text-sm text-muted-foreground">Gérez les prescriptions et ordonnances de vos clients</p>
          </div>
        </div>

            <Button onClick={() => { setEditingPrescription(null); setShowForm(true); }}
              className="bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-[4px] h-10 px-5 shadow-none">
              <Plus className="mr-2 h-4 w-4" />Nouvelle Ordonnance
            </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <Input type="text" placeholder="Rechercher par client, type de verre..." className="pl-9 h-10 bg-white border-slate-200 rounded-[4px] text-sm dark:bg-[#0F172A] dark:border-white/10 dark:text-white"
          value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      </div>

      <Card className="border border-slate-200 shadow-none rounded-[6px] overflow-hidden dark:bg-[#0F172A] dark:border-white/10">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-slate-100 dark:border-white/5">
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">Client</TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">Date</TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">Type</TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">Verre</TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">Statut</TableHead>
              <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-right dark:text-slate-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground font-medium">Chargement...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="bg-slate-50 rounded-[6px] p-4 border border-slate-100 dark:bg-[#0F172A]/40 dark:border-white/10">
                      <Eye className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                    </div>
                    <p className="text-sm text-slate-500 font-medium">
                      {searchQuery ? 'Aucune ordonnance trouvée' : 'Aucune ordonnance enregistrée'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((p) => (
                <TableRow key={p.id} className="border-b border-slate-100 hover:bg-slate-50/50 dark:border-white/5 dark:hover:bg-white/[0.02]">
                  <TableCell className="px-4 py-4">
                    <span className="text-sm font-semibold text-slate-800 dark:text-white">{p.client_nom || '-'}</span>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <span className="text-sm text-slate-500 dark:text-slate-400">{p.date_ordonnance || '-'}</span>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {p.type_vision === 'vl'
                        ? 'Vision de loin'
                        : p.type_vision === 'vp'
                        ? 'Vision de près'
                        : p.type_vision === 'progressif'
                        ? 'Progressif'
                        : '-'}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <span className="text-xs text-slate-500 dark:text-slate-400">{p.verre_type || '-'}</span>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <span className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium",
                      p.statut === 'active'
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200/50 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20"
                        : p.statut === 'expiree'
                        ? "bg-rose-50 text-rose-700 border border-rose-200/50 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20"
                        : "bg-slate-50 text-slate-600 border border-slate-200/50 dark:bg-slate-500/10 dark:text-slate-400"
                    )}>
                      {p.statut === 'active' ? 'Active' : p.statut === 'expiree' ? 'Expirée' : 'Remplacée'}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-[4px]"
                        title="Imprimer l'ordonnance"
                        onClick={() => handlePrintPrescription(p.id)}>
                        <Printer className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-[4px]"
                        onClick={() => { setEditingPrescription(p); setShowForm(true); }}>
                        <FileEdit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-[4px]"
                        onClick={() => { setPrescriptionToDelete(p.id); setDeleteConfirmOpen(true); }}>
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

      {/* Hidden printable ordonnance — rendered off-screen and sent to the
          native print dialog by react-to-print. */}
      <div style={{ position: 'fixed', left: '-10000px', top: 0 }} aria-hidden>
        {printingPrescription && (
          <PrescriptionDocument
            ref={printRef}
            prescription={printingPrescription}
            entreprise={entreprise}
            lang={i18n.language}
          />
        )}
      </div>
    </div>
  );
}

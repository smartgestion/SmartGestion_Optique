import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { useReactToPrint } from 'react-to-print'
import {
  User, Eye, ClipboardList, FileText, StickyNote, Plus, ArrowLeft, Check,
  Download, Trash2, Ticket, Link2, Save, FileEdit,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { fmtDiopter, fmtAxe, formatCurrency } from '@/lib/utils'
import { ClientForm } from '@/components/forms/ClientForm'
import { PrescriptionForm } from '@/components/forms/PrescriptionForm'
import { BonCommandeForm } from '@/components/forms/BonCommandeForm'
import { FactureForm } from '@/components/forms/FactureForm'
import { BonCommandeDocument } from '@/components/documents/BonCommandeDocument'
import { FactureDocument } from '@/components/documents/FactureDocument'
import { ProductSelector } from '@/components/ui/ProductSelector'
import { printVenteTicket } from '@/lib/venteTicket'
import { updateStockAndNotify, ensureLowStockNotifications } from '@/lib/notifications'
import { changeBonCommandeStatus } from '@/lib/bonCommandeStatus'
import { changeFactureStatus } from '@/lib/factureStatus'

interface OrdreTravailFormProps {
  initialData?: any;
  onSuccess?: () => void;
}

const STATUTS = ['brouillon', 'en_cours', 'termine', 'livre', 'annule'] as const;
const statutBadge: Record<string, string> = {
  brouillon: 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400',
  en_cours:  'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  termine:   'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  livre:     'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400',
  annule:    'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
};

// Status option sets for the linked documents (plain status update from the OT).
const BC_STATUSES = ['brouillon', 'en_attente', 'confirmé', 'livré', 'annulé', 'refusé'];
const FACTURE_STATUSES = ['brouillon', 'en_attente', 'payée', 'reste_a_payer', 'annulée'];

export function OrdreTravailForm({ initialData, onSuccess }: OrdreTravailFormProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  // ── Core OT state ──────────────────────────────────────────────────────
  const [otId, setOtId] = useState<number | null>(initialData?.id ?? null);
  const [numeroOrdre, setNumeroOrdre] = useState<string>(initialData?.numero_ordre || `OT-${Date.now().toString().slice(-6)}`);
  const [dateCreation, setDateCreation] = useState<string>(initialData?.date_creation || new Date().toISOString().split('T')[0]);
  const [dateSouhaitee, setDateSouhaitee] = useState<string>(initialData?.date_souhaitee || '');
  const [statut, setStatut] = useState<string>(initialData?.statut && STATUTS.includes(initialData.statut) ? initialData.statut : 'brouillon');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('client');

  // ── Client ─────────────────────────────────────────────────────────────
  const [clients, setClients] = useState<any[]>([]);
  const [clientId, setClientId] = useState<string>(initialData?.client_id?.toString() || '');
  const selectedClient = useMemo(() => clients.find((c) => c.id.toString() === clientId), [clients, clientId]);

  // ── Ordonnance ───────────────────────────────────────────────────────────
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [prescriptionId, setPrescriptionId] = useState<string>(initialData?.prescription_id?.toString() || '');
  const [selectedPrescription, setSelectedPrescription] = useState<any>(null);

  // ── Linked documents ─────────────────────────────────────────────────────
  const [linkedBCs, setLinkedBCs] = useState<any[]>([]);
  const [linkedFactures, setLinkedFactures] = useState<any[]>([]);
  const [venteId, setVenteId] = useState<number | null>(initialData?.vente_id ?? null);
  const [linkedVente, setLinkedVente] = useState<any>(null);
  const [ventesList, setVentesList] = useState<any[]>([]);
  // Create-vente flow (a real walk-in sale, saved into ventes_passagers).
  const [produits, setProduits] = useState<any[]>([]);
  const [venteCart, setVenteCart] = useState<any[]>([]);
  const [venteSaving, setVenteSaving] = useState(false);

  // ── Notes ────────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');

  // ── Inline sub-creators / editors ─────────────────────────────────────────
  const [sub, setSub] = useState<null | 'client' | 'prescription' | 'bc' | 'facture' | 'linkVente' | 'createVente' | 'editBc' | 'editFacture'>(null);
  const [editBcData, setEditBcData] = useState<any>(null);
  const [editBcReadOnly, setEditBcReadOnly] = useState(false);
  const [editFactureData, setEditFactureData] = useState<any>(null);

  // ── Printing linked documents ──────────────────────────────────────────────
  const [entreprise, setEntreprise] = useState<any>(null);
  const [printDoc, setPrintDoc] = useState<{ kind: 'bc' | 'facture'; data: any } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: printDoc ? `${printDoc.kind === 'bc' ? 'BC' : 'Facture'}_${printDoc.data?.numero || ''}` : 'Document',
    onAfterPrint: () => setPrintDoc(null),
  });
  useEffect(() => { if (printDoc && printRef.current) handlePrint(); }, [printDoc, handlePrint]);

  // ── Data loaders ───────────────────────────────────────────────────────────
  const loadClients = async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('clients').select('*').eq('user_id', user.id).order('nom');
    setClients(data || []);
  };

  const loadEntreprise = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('parametres')
      .select('nom_societe,nom,adresse,ville,telephone,email,ice,if_number,patente,logo_url,watermark_text,activer_filigrane')
      .eq('user_id', String(user.id)).maybeSingle();
    if (!data) return;
    const logo = !data.logo_url || data.logo_url === 'image.png' ? '' : data.logo_url;
    setEntreprise({
      nom: data.nom || data.nom_societe || '', nomEntreprise: data.nom_societe || data.nom || '',
      adresse: data.adresse || '', ville: data.ville || '', telephone: data.telephone || '',
      email: data.email || '', ice: data.ice || '', ifNumber: (data as any).if_number || '',
      patente: (data as any).patente || '', logoUrl: logo,
      watermarkText: data.watermark_text || 'SmartGestion',
      activerFiligrane: data.activer_filigrane !== undefined ? data.activer_filigrane : true,
    });
  };

  const loadPrescriptions = async (cid: string) => {
    if (!cid) { setPrescriptions([]); return; }
    const { data } = await supabase
      .from('prescriptions').select('*')
      .eq('client_id', parseInt(cid)).eq('statut', 'active')
      .order('date_ordonnance', { ascending: false });
    setPrescriptions(data || []);
  };

  const loadLinkedDocs = async (id: number) => {
    const [{ data: bcs }, { data: facs }] = await Promise.all([
      supabase.from('bons_commande').select('*, fournisseur:fournisseurs(*), client:clients(*)').eq('ordre_travail_id', id).order('created_at', { ascending: false }),
      supabase.from('factures').select('*, client:clients(*)').eq('ordre_travail_id', id).order('created_at', { ascending: false }),
    ]);
    setLinkedBCs(bcs || []);
    setLinkedFactures(facs || []);
  };

  const loadNotes = async (id: number) => {
    const { data } = await supabase.from('ordre_travail_notes').select('*').eq('ordre_travail_id', id).order('created_at', { ascending: false });
    setNotes(data || []);
  };

  const loadLinkedVente = async (vid: number) => {
    const { data: v } = await supabase.from('ventes_passagers').select('*').eq('id', vid).maybeSingle();
    if (!v) { setLinkedVente(null); return; }
    // Lignes are keyed by `vp_id` (see VentesPassagers save logic).
    const { data: lignes } = await supabase.from('ventes_passagers_lignes').select('*').eq('vp_id', vid).order('ordre');
    setLinkedVente({ ...v, lignes: lignes || [] });
  };

  const loadProduits = async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('produits').select('*').eq('user_id', user.id).order('designation');
    // Map to the shape ProductSelector expects (mirrors the Ventes page).
    setProduits((data || []).map((p: any) => ({
      ...p,
      id: p.id,
      reference: p.reference || '',
      designation: p.designation || p.nom || '',
      marque: p.marque || '',
      prixVenteHt: Number(p.prix_vente_ht || p.prixVenteHt || 0),
      prixVenteTtc: Number(p.prix_vente_ttc || 0),
      prixAchatHt: Number(p.prix_achat_ht || p.prixAchatHt || 0),
      tauxTva: p.taux_tva != null ? Number(p.taux_tva) : (p.tva != null ? Number(p.tva) : 20),
      stockActuel: Number(p.stock_actuel || p.stockActuel || 0),
      imageUrl: p.image_url || p.imageUrl || undefined,
    })));
  };

  const loadVentesList = async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('ventes_passagers').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
    setVentesList(data || []);
  };

  useEffect(() => { loadClients(); loadEntreprise(); }, [user?.id]);
  useEffect(() => { loadPrescriptions(clientId); }, [clientId]);
  useEffect(() => {
    if (otId) { loadLinkedDocs(otId); loadNotes(otId); }
  }, [otId]);
  useEffect(() => {
    if (prescriptionId && prescriptions.length) {
      setSelectedPrescription(prescriptions.find((p) => p.id.toString() === prescriptionId) || null);
    } else if (!prescriptionId) {
      setSelectedPrescription(null);
    }
  }, [prescriptionId, prescriptions]);
  useEffect(() => { if (venteId) loadLinkedVente(venteId); else setLinkedVente(null); }, [venteId]);

  // On edit, hydrate the selected prescription even before the list arrives.
  useEffect(() => {
    if (initialData?.prescription_id && !selectedPrescription) {
      supabase.from('prescriptions').select('*').eq('id', initialData.prescription_id).maybeSingle()
        .then(({ data }) => { if (data) setSelectedPrescription(data); });
    }
  }, [initialData?.prescription_id]);

  // ── Save the OT (create/update) — stays open, unlocks the other tabs ──────
  const saveOt = async (opts: { silent?: boolean } = {}): Promise<number | null> => {
    if (!clientId) { toast.error('Veuillez sélectionner un client'); setActiveTab('client'); return null; }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        client_id: parseInt(clientId),
        prescription_id: prescriptionId ? parseInt(prescriptionId) : null,
        numero_ordre: numeroOrdre,
        date_creation: dateCreation || null,
        date_souhaitee: dateSouhaitee || null,
        statut,
        vente_id: venteId,
      };
      let id = otId;
      if (id) {
        const { error } = await supabase.from('ordres_travail').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('ordres_travail').insert([{ ...payload, user_id: user?.id }]).select().single();
        if (error) throw error;
        id = data.id;
        setOtId(id);
      }
      if (!opts.silent) toast.success(t('ordres_travail.toast_saved'));
      return id;
    } catch (err: any) {
      toast.error(err.message || t('shared.toast.save_error'));
      return null;
    } finally {
      setSaving(false);
    }
  };

  // Persist just the OT status quickly from the header.
  const changeOtStatut = async (val: string) => {
    setStatut(val);
    if (otId) {
      await supabase.from('ordres_travail').update({ statut: val }).eq('id', otId);
    }
  };

  // ── Linked-document actions ────────────────────────────────────────────────
  const downloadBC = async (bcRow: any) => {
    try {
      const { data: lignes } = await supabase.from('bon_commande_lignes').select('*').eq('bon_commande_id', bcRow.id).order('ordre');
      let prescription: any = null;
      if (bcRow.type === 'verre') {
        const prescrId = (lignes || []).map((l: any) => l.prescription_id).find((x: any) => x != null);
        if (prescrId) {
          const { data } = await supabase.from('prescriptions').select('*').eq('id', prescrId).maybeSingle();
          prescription = data || null;
        }
      }
      setPrintDoc({ kind: 'bc', data: { ...bcRow, prescription, lignes: lignes || [] } });
    } catch (e: any) { toast.error(e.message || 'Erreur'); }
  };

  const downloadFacture = async (facRow: any) => {
    try {
      const { data: lignes } = await supabase.from('facture_lignes').select('*').eq('facture_id', facRow.id).order('ordre');
      let prescription: any = null;
      if (facRow.prescription_id) {
        const { data } = await supabase.from('prescriptions').select('*').eq('id', facRow.prescription_id).maybeSingle();
        prescription = data || null;
      }
      setPrintDoc({ kind: 'facture', data: { ...facRow, prescription, lignes: lignes || [] } });
    } catch (e: any) { toast.error(e.message || 'Erreur'); }
  };

  // Open the full BonCommandeForm to edit a linked BC (mapped like the list).
  const openEditBC = async (bcRow: any) => {
    try {
      const { data: bonData, error } = await supabase.from('bons_commande').select('*, fournisseur:fournisseurs(*)').eq('id', bcRow.id).single();
      if (error) throw error;
      const { data: lignes } = await supabase.from('bon_commande_lignes').select('*').eq('bon_commande_id', bcRow.id).order('ordre');
      const mapped = {
        ...bonData,
        type: bonData.type || 'simple',
        fournisseurId: bonData.fournisseur_id?.toString() || '',
        numeroFournisseur: bonData.numero_fournisseur || '',
        motifAnnulation: bonData.motif_annulation || '',
        clientId: bonData.client_id?.toString() || '',
        dateCommande: bonData.date_commande?.split('T')[0] || '',
        dateLivraisonPrevue: bonData.date_livraison_prevue?.split('T')[0] || '',
        lignes: (lignes || []).map((l: any) => ({
          produitId: l.produit_id?.toString() || '',
          prescriptionId: l.prescription_id?.toString() || '',
          designation: l.designation || '',
          quantite: Number(l.quantite || 1),
          prixUnitaireHt: Number(l.prix_unitaire_ht || 0),
          tva: Number(l.tva || 20),
          montantHt: Number(l.montant_ht || 0),
          montantTtc: Number(l.montant_ttc || 0),
          vlSelected: l.vl_selected ?? 0,
          vpSelected: l.vp_selected ?? 0,
          prixVl: l.prix_vl ?? 0,
          prixVp: l.prix_vp ?? 0,
        })),
      };
      setEditBcData(mapped);
      setEditBcReadOnly(bonData.statut !== 'brouillon'); // non-brouillon = view only
      setSub('editBc');
    } catch (e: any) { toast.error(e.message || 'Erreur'); }
  };

  // Open the full FactureForm to edit a linked facture (mapped like the list).
  const openEditFacture = async (facRow: any) => {
    try {
      const { data: factureData, error } = await supabase.from('factures').select('*, client:clients(*)').eq('id', facRow.id).single();
      if (error) throw error;
      const { data: lignes } = await supabase.from('facture_lignes').select('*').eq('facture_id', facRow.id).order('ordre');
      const mapped = {
        ...factureData,
        clientId: factureData.client_id?.toString() || '',
        type: factureData.type || 'simple',
        prescriptionId: (factureData.prescription_id)?.toString() || '',
        dateEmission: factureData.date_emission ? factureData.date_emission.split('T')[0] : new Date().toISOString().split('T')[0],
        dateEcheance: factureData.date_echeance ? factureData.date_echeance.split('T')[0] : '',
        montantHt: Number(factureData.montant_ht || 0),
        montantTva: Number(factureData.montant_tva || 0),
        montantTtc: Number(factureData.montant_ttc || 0),
        resteAPayer: Number(factureData.reste_a_payer || 0),
        modePaiement: factureData.mode_paiement || 'Virement',
        notes: factureData.notes || '',
        conditionsPaiement: factureData.conditions_paiement || '',
        lignes: (lignes || []).map((l: any) => ({
          produitId: String(l.produit_id || ''),
          reference: l.reference || '',
          designation: l.designation || '',
          quantite: l.quantite || 1,
          prixUnitaireHt: Number(l.prix_unitaire_ht || 0),
          tva: Number(l.tva || 20),
          montantHt: Number(l.montant_ht || 0),
          montantTtc: Number(l.montant_ttc || 0),
          prixOdHt: l.prix_od_ht ?? '',
          prixOgHt: l.prix_og_ht ?? '',
          vlSelected: !!Number(l.vl_selected ?? 0),
          vpSelected: !!Number(l.vp_selected ?? 0),
          prixVl: l.prix_vl ?? '',
          prixVp: l.prix_vp ?? '',
          prescriptionId: l.prescription_id ? String(l.prescription_id) : '',
        })),
      };
      setEditFactureData(mapped);
      setSub('editFacture');
    } catch (e: any) { toast.error(e.message || 'Erreur'); }
  };

  const updateBCStatus = async (id: number, newStatut: string) => {
    try {
      // Full side-effect logic (stock add/revert, auto-BL, avoir on cancel).
      await changeBonCommandeStatus(id, newStatut);
      toast.success(t('shared.toast.status_updated', 'Statut mis à jour'));
    } catch (e: any) {
      toast.error(e?.message || t('shared.toast.update_error', 'Erreur de mise à jour'));
    }
    if (otId) loadLinkedDocs(otId);
  };

  const updateFactureStatus = async (id: number, newStatut: string) => {
    try {
      // Full side-effect logic (stock deduct/restore, avoir on cancel).
      await changeFactureStatus(id, newStatut, user?.id);
      toast.success(t('shared.toast.status_updated', 'Statut mis à jour'));
    } catch (e: any) {
      toast.error(e?.message || t('shared.toast.update_error', 'Erreur de mise à jour'));
    }
    if (otId) loadLinkedDocs(otId);
  };

  const linkVente = async (v: any) => {
    setVenteId(v.id);
    if (otId) {
      await supabase.from('ordres_travail').update({ vente_id: v.id }).eq('id', otId);
      toast.success('Vente liée à l\'ordre de travail');
    }
    setSub(null);
  };
  const unlinkVente = async () => {
    setVenteId(null); setLinkedVente(null);
    if (otId) await supabase.from('ordres_travail').update({ vente_id: null }).eq('id', otId);
  };

  // ── Create a real walk-in sale from the OT, then link it ────────────────────
  // Add a product picked from the ProductSelector (which already blocks
  // out-of-stock and caps qty to the available stock). Merges with an existing
  // cart line, keeping the merged qty within the product's stock.
  const addProduitFromSelector = (produit: any, qte: number) => {
    const stock = Number(produit.stockActuel ?? 0);
    const pu = Number(produit.prixVenteHt ?? 0);
    const tva = Number(produit.tauxTva ?? 20);
    setVenteCart((c) => {
      const idx = c.findIndex((it) => Number(it.produitId) === Number(produit.id));
      if (idx >= 0) {
        const merged = Math.min(c[idx].quantite + qte, stock || c[idx].quantite + qte);
        return c.map((it, i) => i === idx ? recomputeCartLine(it, merged, it.prixUnitaireHt) : it);
      }
      const mht = pu * qte, mtva = mht * (tva / 100);
      return [...c, {
        produitId: produit.id,
        designation: produit.designation || produit.nom || produit.reference || 'Article',
        reference: produit.reference || '',
        quantite: qte,
        prixUnitaireHt: pu,
        tva,
        prixAchatHt: Number(produit.prixAchatHt ?? 0),
        stockActuel: stock,
        montantHt: mht,
        montantTva: mtva,
        montantTtc: mht + mtva,
      }];
    });
  };
  const recomputeCartLine = (item: any, qte: number, pu: number) => {
    // Clamp to the product's available stock (never allow overselling).
    const maxQ = Number(item.stockActuel ?? Infinity);
    const q = Math.max(1, Math.min(qte, maxQ || 1));
    const mht = pu * q;
    const mtva = mht * (Number(item.tva || 0) / 100);
    return { ...item, quantite: q, prixUnitaireHt: pu, montantHt: mht, montantTva: mtva, montantTtc: mht + mtva };
  };
  const cartTotals = venteCart.reduce((a, i) => ({ ht: a.ht + i.montantHt, tva: a.tva + i.montantTva, ttc: a.ttc + i.montantTtc }), { ht: 0, tva: 0, ttc: 0 });

  const createAndLinkVente = async () => {
    if (venteCart.length === 0) { toast.error('Ajoutez au moins un produit'); return; }
    // Stock guard — re-check live stock; block 0 / insufficient (no overselling).
    for (const item of venteCart) {
      if (!item.produitId) continue;
      const { data: prod } = await supabase.from('produits').select('stock_actuel, designation, nom').eq('id', item.produitId).maybeSingle();
      const stock = Number(prod?.stock_actuel ?? 0);
      const name = prod?.designation || prod?.nom || item.designation || 'Produit';
      if (stock <= 0) { toast.error(`Rupture de stock : ${name}`); return; }
      if (item.quantite > stock) { toast.error(`Stock insuffisant pour ${name} (dispo: ${stock})`); return; }
    }
    const oid = otId || (await saveOt({ silent: true }));
    if (!oid) return;
    setVenteSaving(true);
    try {
      const totalHt = venteCart.reduce((s, i) => s + i.montantHt, 0);
      const totalTva = venteCart.reduce((s, i) => s + i.montantTva, 0);
      const totalTtc = venteCart.reduce((s, i) => s + i.montantTtc, 0);
      const totalCogs = venteCart.reduce((s, i) => s + Number(i.prixAchatHt || 0) * i.quantite, 0);

      // Generate a VP-YYYY-NNNN number (same scheme as the Ventes page).
      const year = new Date().getFullYear();
      let numero: string | undefined;
      let attempts = 0;
      while (!numero && attempts < 10) {
        const { data: existing } = await supabase.from('ventes_passagers').select('numero').like('numero', `VP-${year}-%`).eq('user_id', user?.id);
        let maxNum = 0;
        for (const v of existing || []) {
          const m = v.numero?.match(new RegExp(`^VP-${year}-(\\d+)$`));
          if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
        }
        const candidate = `VP-${year}-${String(maxNum + 1).padStart(4, '0')}`;
        const { data: dup } = await supabase.from('ventes_passagers').select('id').eq('numero', candidate).eq('user_id', user?.id).maybeSingle();
        if (!dup) { numero = candidate; break; }
        attempts++;
      }

      const { data: venteData, error: venteError } = await supabase
        .from('ventes_passagers')
        .insert([{
          user_id: user?.id,
          numero,
          client_nom: clientLabel || null,
          montant_ht: totalHt,
          montant_tva: totalTva,
          montant_ttc: totalTtc,
          cogs: totalCogs,
          date: new Date().toISOString(),
        }])
        .select().single();
      if (venteError) throw venteError;

      const lignesPayload = venteCart.map((item, index) => ({
        vp_id: venteData.id,
        produit_id: item.produitId,
        designation: item.designation,
        quantite: item.quantite,
        prix_unitaire_ht: item.prixUnitaireHt,
        tva: item.tva,
        montant_ht: item.montantHt,
        montant_ttc: item.montantTtc,
        montant_tva: item.montantTva,
        ordre: index,
      }));
      const { error: lignesError } = await supabase.from('ventes_passagers_lignes').insert(lignesPayload);
      if (lignesError) throw lignesError;

      for (const item of venteCart) {
        if (item.produitId) await updateStockAndNotify(user?.id, item.produitId, -item.quantite);
      }
      await ensureLowStockNotifications(user?.id);

      // Link it to the OT.
      await supabase.from('ordres_travail').update({ vente_id: venteData.id }).eq('id', oid);
      setVenteId(venteData.id);
      setVenteCart([]);
      setSub(null);
      toast.success('Vente créée et liée à l\'ordre de travail');
    } catch (e: any) {
      toast.error(e.message || t('shared.toast.save_error'));
    } finally {
      setVenteSaving(false);
    }
  };
  const showVenteTicket = () => {
    if (linkedVente) printVenteTicket(
      { ...linkedVente, montantHt: Number(linkedVente.montant_ht || 0), montantTva: Number(linkedVente.montant_tva || 0), montantTtc: Number(linkedVente.montant_ttc || 0) },
      t as any, i18n.language,
    );
  };

  const addNote = async () => {
    if (!newNote.trim() || !otId) return;
    const { error } = await supabase.from('ordre_travail_notes').insert([{ ordre_travail_id: otId, user_id: user?.id, note: newNote.trim() }]);
    if (error) { toast.error(error.message); return; }
    setNewNote('');
    loadNotes(otId);
  };
  const deleteNote = async (id: number) => {
    await supabase.from('ordre_travail_notes').delete().eq('id', id);
    if (otId) loadNotes(otId);
  };

  // ── Progress ────────────────────────────────────────────────────────────────
  const steps = [
    !!clientId,
    !!prescriptionId,
    linkedBCs.length > 0,
    linkedFactures.length > 0 || !!venteId,
    notes.length > 0,
  ];
  const done = steps.filter(Boolean).length;
  const locked = !otId; // tabs 3-5 need a saved OT

  const clientLabel = selectedClient ? (selectedClient.nom || selectedClient.nomSociete || '-') : '';

  const prescriptionOption = (p: any) => {
    const od = `OD: ${fmtDiopter(p.od_sph_vl, '-')}${p.od_cyl_vl ? ` (${fmtDiopter(p.od_cyl_vl)})` : ''}`;
    const og = `OG: ${fmtDiopter(p.og_sph_vl, '-')}${p.og_cyl_vl ? ` (${fmtDiopter(p.og_cyl_vl)})` : ''}`;
    return `${p.date_ordonnance} — ${od} / ${og} — ${p.verre_type || '-'}`;
  };

  // ═══════════════════════════ Inline sub-creators ═══════════════════════════
  if (sub === 'client') {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSub(null)}><ArrowLeft className="h-4 w-4 mr-2" />Retour à l'ordre</Button>
        <h3 className="text-lg font-bold">Nouveau client</h3>
        <ClientForm onSuccess={(c) => {
          setSub(null);
          loadClients().then(() => { if (c?.id) setClientId(c.id.toString()); });
          if (c?.id) setClientId(c.id.toString());
        }} />
      </div>
    );
  }
  if (sub === 'prescription') {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSub(null)}><ArrowLeft className="h-4 w-4 mr-2" />Retour à l'ordre</Button>
        <h3 className="text-lg font-bold">Nouvelle ordonnance</h3>
        <PrescriptionForm
          initialData={clientId ? { client_id: parseInt(clientId) } : undefined}
          onSuccess={(p) => {
            setSub(null);
            if (clientId) loadPrescriptions(clientId).then(() => { if (p?.id) { setPrescriptionId(p.id.toString()); setSelectedPrescription(p); } });
            if (p?.id) { setPrescriptionId(p.id.toString()); setSelectedPrescription(p); }
          }}
        />
      </div>
    );
  }
  if (sub === 'bc') {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSub(null)}><ArrowLeft className="h-4 w-4 mr-2" />Retour à l'ordre</Button>
        <h3 className="text-lg font-bold">Nouvelle commande de verre</h3>
        <BonCommandeForm
          ordreTravailId={otId ?? undefined}
          prefill={{ clientId, prescription: selectedPrescription }}
          onSuccess={() => { setSub(null); if (otId) loadLinkedDocs(otId); }}
        />
      </div>
    );
  }
  if (sub === 'editBc') {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => { setSub(null); setEditBcData(null); }}><ArrowLeft className="h-4 w-4 mr-2" />Retour à l'ordre</Button>
        <h3 className="text-lg font-bold">{editBcReadOnly ? 'Consulter la commande' : 'Modifier la commande'}</h3>
        <BonCommandeForm
          initialData={editBcData}
          readOnly={editBcReadOnly}
          ordreTravailId={otId ?? undefined}
          onSuccess={() => { setSub(null); setEditBcData(null); if (otId) loadLinkedDocs(otId); }}
        />
      </div>
    );
  }
  if (sub === 'editFacture') {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => { setSub(null); setEditFactureData(null); }}><ArrowLeft className="h-4 w-4 mr-2" />Retour à l'ordre</Button>
        <h3 className="text-lg font-bold">Modifier la facture</h3>
        <FactureForm
          initialData={editFactureData}
          ordreTravailId={otId ?? undefined}
          onSuccess={() => { setSub(null); setEditFactureData(null); if (otId) loadLinkedDocs(otId); }}
        />
      </div>
    );
  }
  if (sub === 'facture') {
    const factureInitial: any = {
      type: 'optique',
      clientId,
      prescriptionId: prescriptionId || '',
      dateEmission: new Date().toISOString().split('T')[0],
      statut: 'brouillon',
      modePaiement: 'Virement',
      lignes: [
        { designation: '', quantite: 1, prixUnitaireHt: 0, tva: 20 },
        { designation: '', quantite: 1, prixUnitaireHt: 0, tva: 20 },
      ],
    };
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSub(null)}><ArrowLeft className="h-4 w-4 mr-2" />Retour à l'ordre</Button>
        <h3 className="text-lg font-bold">Nouvelle facture</h3>
        <FactureForm
          initialData={factureInitial}
          ordreTravailId={otId ?? undefined}
          onSuccess={() => { setSub(null); if (otId) loadLinkedDocs(otId); }}
        />
      </div>
    );
  }

  // ═════════════════════════════════ Hub ═════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-[8px] border border-slate-200 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-white/5 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">N° Ordre</Label>
            <Input value={numeroOrdre} onChange={(e) => setNumeroOrdre(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Date</Label>
            <Input type="date" value={dateCreation} onChange={(e) => setDateCreation(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Date souhaitée</Label>
            <Input type="date" value={dateSouhaitee} onChange={(e) => setDateSouhaitee(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Statut</Label>
            <Select value={statut} onValueChange={changeOtStatut}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUTS.map((s) => <SelectItem key={s} value={s}>{t(`ordres_travail.statut_${s}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium text-slate-500">Progression : <span className="text-slate-800 dark:text-white">{done}/5</span></div>
          <Button onClick={() => saveOt()} disabled={saving} className="h-10 rounded-[4px] bg-amber-500 hover:bg-amber-600 text-white font-semibold px-5 shadow-none">
            <Save className="h-4 w-4 mr-2" />{saving ? t('shared.actions.saving') : t('shared.actions.save')}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="line" className="flex-wrap">
          <TabsTrigger value="client"><User className="h-4 w-4" />{steps[0] && <Check className="h-3 w-3 text-emerald-500" />} Client</TabsTrigger>
          <TabsTrigger value="ordonnance"><Eye className="h-4 w-4" />{steps[1] && <Check className="h-3 w-3 text-emerald-500" />} Ordonnance</TabsTrigger>
          <TabsTrigger value="commande" disabled={locked}><ClipboardList className="h-4 w-4" />{steps[2] && <Check className="h-3 w-3 text-emerald-500" />} Commande</TabsTrigger>
          <TabsTrigger value="facture" disabled={locked}><FileText className="h-4 w-4" />{steps[3] && <Check className="h-3 w-3 text-emerald-500" />} Facture / Vente</TabsTrigger>
          <TabsTrigger value="notes" disabled={locked}><StickyNote className="h-4 w-4" />{steps[4] && <Check className="h-3 w-3 text-emerald-500" />} Notes</TabsTrigger>
        </TabsList>

        {locked && (
          <div className="mt-3 rounded-[6px] border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-950/20 dark:text-amber-300">
            Enregistrez l'ordre de travail (choisissez un client puis « Enregistrer ») pour créer des commandes, factures et notes.
          </div>
        )}

        {/* ───────── Tab 1 · Client ───────── */}
        <TabsContent value="client" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Sélectionner un client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id.toString()}>{c.nom || c.nomSociete || '-'}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => setSub('client')}>
                <Plus className="h-4 w-4 mr-2" />Nouveau client
              </Button>
            </div>
          </div>
          {selectedClient && (
            <div className="rounded-[6px] border border-emerald-200 bg-emerald-50/40 p-4 text-sm dark:border-emerald-500/20 dark:bg-emerald-950/10">
              <div className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300"><Check className="h-4 w-4" /> {clientLabel}</div>
              <div className="mt-1 text-slate-500 dark:text-slate-400">
                {selectedClient.telephone && <span className="mr-4">Tél : {selectedClient.telephone}</span>}
                {selectedClient.cine && <span className="mr-4">CINE : {selectedClient.cine}</span>}
                {selectedClient.couverture_sociale && <span>Couverture : {String(selectedClient.couverture_sociale).toUpperCase()}</span>}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ───────── Tab 2 · Ordonnance ───────── */}
        <TabsContent value="ordonnance" className="mt-4 space-y-4">
          {!clientId ? (
            <p className="text-sm text-slate-500">Sélectionnez d'abord un client.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Ordonnance</Label>
                  <Select value={prescriptionId} onValueChange={setPrescriptionId}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Sélectionner une ordonnance" /></SelectTrigger>
                    <SelectContent>
                      {prescriptions.length === 0 && <SelectItem value="__none" disabled>Aucune ordonnance active</SelectItem>}
                      {prescriptions.map((p) => <SelectItem key={p.id} value={p.id.toString()}>{prescriptionOption(p)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => setSub('prescription')}>
                    <Plus className="h-4 w-4 mr-2" />Créer une ordonnance
                  </Button>
                </div>
              </div>
              {selectedPrescription && (
                <div className="rounded-[6px] border border-sky-200 bg-sky-50/40 p-4 dark:border-sky-500/20 dark:bg-sky-950/10">
                  <p className="mb-2 font-semibold text-sky-800 dark:text-sky-300">Prescription — {selectedPrescription.date_ordonnance}</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
                    <div className="text-slate-500">OD Sph : <span className="font-mono font-semibold text-slate-800 dark:text-white">{fmtDiopter(selectedPrescription.od_sph_vl, '-')}</span></div>
                    <div className="text-slate-500">OD Cyl : <span className="font-mono font-semibold text-slate-800 dark:text-white">{fmtDiopter(selectedPrescription.od_cyl_vl, '-')}</span></div>
                    <div className="text-slate-500">OD Axe : <span className="font-mono font-semibold text-slate-800 dark:text-white">{fmtAxe(selectedPrescription.od_axe_vl, '-')}</span></div>
                    <div className="text-slate-500">Add : <span className="font-mono font-semibold text-slate-800 dark:text-white">{fmtDiopter(selectedPrescription.od_add_vl, '-')}</span></div>
                    <div className="text-slate-500">OG Sph : <span className="font-mono font-semibold text-slate-800 dark:text-white">{fmtDiopter(selectedPrescription.og_sph_vl, '-')}</span></div>
                    <div className="text-slate-500">OG Cyl : <span className="font-mono font-semibold text-slate-800 dark:text-white">{fmtDiopter(selectedPrescription.og_cyl_vl, '-')}</span></div>
                    <div className="text-slate-500">OG Axe : <span className="font-mono font-semibold text-slate-800 dark:text-white">{fmtAxe(selectedPrescription.og_axe_vl, '-')}</span></div>
                    <div className="text-slate-500">PD : <span className="font-mono font-semibold text-slate-800 dark:text-white">{selectedPrescription.dp_binoculaire ?? '-'}</span></div>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ───────── Tab 3 · Commande ───────── */}
        <TabsContent value="commande" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Bons de commande</h3>
            <Button type="button" className="h-9 rounded-[4px] bg-orange-500 hover:bg-orange-600 text-white" onClick={() => setSub('bc')}>
              <Plus className="h-4 w-4 mr-2" />Créer une commande
            </Button>
          </div>
          {linkedBCs.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune commande liée.</p>
          ) : (
            <div className="divide-y rounded-[6px] border dark:divide-white/10 dark:border-white/10">
              {linkedBCs.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <span className="font-mono text-sm font-semibold text-slate-800 dark:text-white">{b.numero}</span>
                    <span className="ml-3 text-sm text-slate-500">{formatCurrency(Number(b.montant_ttc || 0))}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={b.statut || 'brouillon'} onValueChange={(v) => updateBCStatus(b.id, v)}>
                      <SelectTrigger className="h-8 w-36 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{BC_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="Modifier / Consulter" onClick={() => openEditBC(b)}>
                      <FileEdit className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="Télécharger / Imprimer" onClick={() => downloadBC(b)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ───────── Tab 4 · Facture / Vente ───────── */}
        <TabsContent value="facture" className="mt-4 space-y-6">
          {/* Factures */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Factures</h3>
              <Button type="button" className="h-9 rounded-[4px] bg-rose-500 hover:bg-rose-600 text-white" onClick={() => setSub('facture')}>
                <Plus className="h-4 w-4 mr-2" />Créer une facture
              </Button>
            </div>
            {linkedFactures.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune facture liée.</p>
            ) : (
              <div className="divide-y rounded-[6px] border dark:divide-white/10 dark:border-white/10">
                {linkedFactures.map((f) => (
                  <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <span className="font-mono text-sm font-semibold text-slate-800 dark:text-white">{f.numero}</span>
                      <span className="ml-3 text-sm text-slate-500">{formatCurrency(Number(f.montant_ttc || 0))}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={f.statut || 'brouillon'} onValueChange={(v) => updateFactureStatus(f.id, v)}>
                        <SelectTrigger className="h-8 w-36 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{FACTURE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Modifier" onClick={() => openEditFacture(f)}>
                        <FileEdit className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Télécharger / Imprimer" onClick={() => downloadFacture(f)}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Vente passager */}
          <div className="space-y-3 border-t pt-5 dark:border-white/10">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Vente passager</h3>
              {!venteId && (
                <div className="flex gap-2">
                  <Button type="button" className="h-9 rounded-[4px] bg-teal-500 hover:bg-teal-600 text-white" onClick={() => { loadProduits(); setVenteCart([]); setSub('createVente'); }}>
                    <Plus className="h-4 w-4 mr-2" />Créer une vente
                  </Button>
                  <Button type="button" variant="outline" className="h-9 rounded-[4px]" onClick={() => { loadVentesList(); setSub('linkVente'); }}>
                    <Link2 className="h-4 w-4 mr-2" />Lier une vente existante
                  </Button>
                </div>
              )}
            </div>
            {linkedVente ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-500/20 dark:bg-emerald-950/10">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  <Check className="h-4 w-4" /> Lié à Vente {linkedVente.numero || `#${linkedVente.id}`} — {formatCurrency(Number(linkedVente.montant_ttc || 0))}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={showVenteTicket}><Ticket className="h-4 w-4 mr-1" />Voir le ticket</Button>
                  <Button size="sm" variant="ghost" className="h-8 rounded-lg text-red-500 hover:bg-red-50" onClick={unlinkVente}>Délier</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Aucune vente liée. Créez la vente dans « Ventes passagers », puis liez-la ici.</p>
            )}
          </div>
        </TabsContent>

        {/* ───────── Tab 5 · Notes ───────── */}
        <TabsContent value="notes" className="mt-4 space-y-4">
          <div className="flex items-start gap-2">
            <Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Ajouter une note (ex. Client appelé, verres reçus, en attente fournisseur...)" className="min-h-[70px] rounded-xl" />
            <Button type="button" className="h-11 rounded-[4px] bg-slate-700 hover:bg-slate-800 text-white" onClick={addNote} disabled={!newNote.trim()}>
              <Plus className="h-4 w-4 mr-1" />Ajouter
            </Button>
          </div>
          {notes.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune note.</p>
          ) : (
            <div className="space-y-2">
              {notes.map((n) => (
                <div key={n.id} className="flex items-start justify-between gap-3 rounded-[6px] border border-slate-200 bg-white p-3 text-sm dark:border-white/10 dark:bg-transparent">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">{n.created_at ? new Date(n.created_at).toLocaleString(i18n.language) : ''}</div>
                    <div className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{n.note}</div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-500" onClick={() => deleteNote(n.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create-vente flow */}
      {sub === 'createVente' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSub(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-[8px] bg-white p-5 shadow-xl dark:bg-[#0F172A]" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-lg font-bold text-slate-800 dark:text-white">Nouvelle vente passager</h3>
            <p className="mb-4 text-sm text-slate-500">{clientLabel ? `Client : ${clientLabel}` : 'Vente au comptoir'}</p>

            <div className="mb-4">
              <Label className="mb-1 block text-xs text-slate-500">Ajouter un produit</Label>
              {/* Same selector as the main Ventes page: shows stock, disables
                  out-of-stock products, and caps quantity to available stock. */}
              <ProductSelector
                produits={produits}
                onSelect={(produit, qte) => addProduitFromSelector(produit, qte)}
              />
            </div>

            {venteCart.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Aucun produit ajouté.</p>
            ) : (
              <div className="mb-4 divide-y rounded-[6px] border dark:divide-white/10 dark:border-white/10">
                {venteCart.map((item, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2 p-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{item.designation}</span>
                    <div className="flex items-center gap-1">
                      <Label className="text-[10px] text-slate-400">Qté</Label>
                      <Input type="number" min="1" step="1" max={item.stockActuel || undefined} value={item.quantite}
                        onChange={(e) => setVenteCart((c) => c.map((it, i) => i === idx ? recomputeCartLine(it, Number(e.target.value) || 1, it.prixUnitaireHt) : it))}
                        className="h-8 w-16 rounded-lg text-right" />
                    </div>
                    <div className="flex items-center gap-1">
                      <Label className="text-[10px] text-slate-400">PU HT</Label>
                      <Input type="number" step="0.01" value={item.prixUnitaireHt}
                        onChange={(e) => setVenteCart((c) => c.map((it, i) => i === idx ? recomputeCartLine(it, it.quantite, Number(e.target.value) || 0) : it))}
                        className="h-8 w-24 rounded-lg text-right" />
                    </div>
                    <span className="w-24 text-right text-sm font-semibold text-slate-800 dark:text-white">{formatCurrency(item.montantTtc)}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-500" onClick={() => setVenteCart((c) => c.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="mb-4 flex justify-end gap-6 text-sm">
              <span className="text-slate-500">Total HT : <span className="font-semibold text-slate-800 dark:text-white">{formatCurrency(cartTotals.ht)}</span></span>
              <span className="text-slate-500">TVA : <span className="font-semibold text-slate-800 dark:text-white">{formatCurrency(cartTotals.tva)}</span></span>
              <span className="text-slate-900 dark:text-white">TTC : <span className="text-lg font-black text-teal-600">{formatCurrency(cartTotals.ttc)}</span></span>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSub(null)}>Annuler</Button>
              <Button className="bg-teal-500 hover:bg-teal-600 text-white" disabled={venteSaving || venteCart.length === 0} onClick={createAndLinkVente}>
                {venteSaving ? t('shared.actions.saving') : 'Enregistrer & lier'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Link-vente picker */}
      {sub === 'linkVente' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSub(null)}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-[8px] bg-white p-4 shadow-xl dark:bg-[#0F172A]" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-bold text-slate-800 dark:text-white">Lier une vente passager</h3>
            {ventesList.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune vente disponible.</p>
            ) : (
              <div className="divide-y dark:divide-white/10">
                {ventesList.map((v) => (
                  <button key={v.id} type="button" className="flex w-full items-center justify-between gap-3 py-2.5 text-start hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => linkVente(v)}>
                    <span className="font-mono text-sm font-semibold text-slate-800 dark:text-white">{v.numero || `#${v.id}`}</span>
                    <span className="text-xs text-slate-500">{v.date} — {formatCurrency(Number(v.montant_ttc || 0))}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" onClick={() => setSub(null)}>Fermer</Button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden print surface for linked documents */}
      <div style={{ position: 'fixed', left: '-10000px', top: 0 }} aria-hidden>
        {printDoc?.kind === 'bc' && <BonCommandeDocument ref={printRef} bon={printDoc.data} entreprise={entreprise} lang={i18n.language} />}
        {printDoc?.kind === 'facture' && <FactureDocument ref={printRef} facture={printDoc.data} entreprise={entreprise} lang={i18n.language} />}
      </div>
    </div>
  );
}

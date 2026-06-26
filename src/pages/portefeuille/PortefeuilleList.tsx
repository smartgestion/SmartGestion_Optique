import type { ChangeEvent, DragEvent, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Folder, FolderPlus, Upload, FilePlus, Search, Wallet, ChevronRight,
  Star, MoreVertical, FileEdit, Trash2, FolderInput, Eye, Download,
  FileText, Image as ImageIcon, FileType, FileSpreadsheet, File as FileIcon,
  Clock, Home,
} from 'lucide-react';
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PaperEditor, type Paper } from './PaperEditor'
import { FilePreview, type PortefeuilleFile } from './FilePreview'

interface PFFolder {
  id: number;
  nom: string;
  parent_id: number | null;
  is_favorite?: number | boolean;
  created_at?: string;
}

const MAX_FILE_MB = 15;
const fav = (v: unknown) => v === 1 || v === true;

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fileIconFor(ext: string) {
  const e = ext.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(e)) return ImageIcon;
  if (e === 'pdf') return FileType;
  if (['xls', 'xlsx', 'csv'].includes(e)) return FileSpreadsheet;
  if (['doc', 'docx', 'txt', 'md', 'rtf'].includes(e)) return FileText;
  return FileIcon;
}

type ViewFilter = 'all' | 'favorites' | 'recent';
type MoveTarget = { kind: 'folder' | 'file' | 'paper'; id: number } | null;

export function PortefeuilleList() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [folders, setFolders] = useState<PFFolder[]>([]);
  const [files, setFiles] = useState<PortefeuilleFile[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ViewFilter>('all');

  const [editingPaper, setEditingPaper] = useState<Paper | null>(null);
  const [previewFile, setPreviewFile] = useState<PortefeuilleFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // dialogs
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ kind: 'folder' | 'file' | 'paper'; id: number } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<MoveTarget>(null);
  const [moveDest, setMoveDest] = useState<string>('root');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'folder' | 'file' | 'paper'; id: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------- fetch
  const fetchAll = useCallback(async () => {
    if (!user?.id) { setFolders([]); setFiles([]); setPapers([]); setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const [fRes, flRes, pRes] = await Promise.all([
        supabase.from('portefeuille_folders').select('*').eq('user_id', user.id).order('nom', { ascending: true }),
        supabase.from('portefeuille_files').select('id,nom,extension,type_mime,taille,folder_id,is_favorite,created_at,data_url').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('portefeuille_papers').select('id,titre,folder_id,is_favorite,created_at,updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }),
      ]);
      if (fRes.error || flRes.error || pRes.error) throw (fRes.error || flRes.error || pRes.error);
      setFolders(fRes.data || []);
      setFiles((flRes.data || []) as PortefeuilleFile[]);
      setPapers(((pRes.data || []) as any[]).map((p) => ({ ...p, contenu: '' })) as Paper[]);
    } catch (e) {
      console.error(e);
      toast.error(t('portefeuille.toast_load_error'));
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, t]);

  useEffect(() => { if (user?.id) void fetchAll(); }, [user?.id, fetchAll]);

  // ---------------------------------------------------------------- helpers
  const folderById = useMemo(() => {
    const m = new Map<number, PFFolder>();
    folders.forEach((f) => m.set(f.id, f));
    return m;
  }, [folders]);

  const breadcrumb = useMemo(() => {
    const chain: PFFolder[] = [];
    let id = currentFolderId;
    const guard = new Set<number>();
    while (id != null && folderById.has(id) && !guard.has(id)) {
      guard.add(id);
      const f = folderById.get(id)!;
      chain.unshift(f);
      id = f.parent_id;
    }
    return chain;
  }, [currentFolderId, folderById]);

  const searching = search.trim().length > 0;
  const q = search.trim().toLowerCase();

  const visibleFolders = useMemo(() => {
    let list = folders;
    if (filter === 'favorites') list = list.filter((f) => fav(f.is_favorite));
    else if (filter === 'recent') return [] as PFFolder[];
    if (searching) return list.filter((f) => f.nom.toLowerCase().includes(q));
    return list.filter((f) => f.parent_id === currentFolderId);
  }, [folders, filter, searching, q, currentFolderId]);

  const visibleFiles = useMemo(() => {
    let list = files;
    if (filter === 'favorites') list = list.filter((f) => fav(f.is_favorite));
    else if (filter === 'recent') list = [...list].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 12);
    if (searching) return list.filter((f) => f.nom.toLowerCase().includes(q));
    if (filter === 'recent') return list;
    return list.filter((f) => (f.folder_id ?? null) === currentFolderId);
  }, [files, filter, searching, q, currentFolderId]);

  const visiblePapers = useMemo(() => {
    let list = papers;
    if (filter === 'favorites') list = list.filter((p) => fav(p.is_favorite));
    else if (filter === 'recent') list = [...list].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 12);
    if (searching) return list.filter((p) => (p.titre || '').toLowerCase().includes(q));
    if (filter === 'recent') return list;
    return list.filter((p) => (p.folder_id ?? null) === currentFolderId);
  }, [papers, filter, searching, q, currentFolderId]);

  const isEmpty = !isLoading && visibleFolders.length === 0 && visibleFiles.length === 0 && visiblePapers.length === 0;

  // ---------------------------------------------------------------- folders
  const createFolder = async () => {
    const nom = folderName.trim();
    if (!nom || !user?.id) return;
    const { error } = await supabase.from('portefeuille_folders').insert([{ nom, parent_id: currentFolderId, user_id: user.id }]);
    if (error) { toast.error(t('portefeuille.toast_save_error')); return; }
    toast.success(t('portefeuille.toast_folder_created'));
    setFolderDialogOpen(false); setFolderName('');
    void fetchAll();
  };

  // ---------------------------------------------------------------- papers
  const createPaper = async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from('portefeuille_papers')
      .insert([{ titre: t('portefeuille.untitled'), contenu: '', folder_id: currentFolderId, user_id: user.id }])
      .select()
      .single();
    if (error || !data) { toast.error(t('portefeuille.toast_save_error')); return; }
    toast.success(t('portefeuille.toast_paper_created'));
    void fetchAll();
    setEditingPaper({ ...(data as any), contenu: (data as any).contenu || '' });
  };

  const openPaper = async (paper: Paper) => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from('portefeuille_papers').select('*').eq('id', paper.id).eq('user_id', user.id).single();
    if (error || !data) { toast.error(t('portefeuille.toast_load_error')); return; }
    setEditingPaper(data as any);
  };

  const downloadPaper = async (paper: Paper) => {
    if (!user?.id) return;
    let contenu = paper.contenu;
    let titre = paper.titre;
    // The list keeps papers without their (potentially large) body, so fetch it.
    if (!contenu) {
      const { data } = await supabase
        .from('portefeuille_papers').select('titre,contenu').eq('id', paper.id).eq('user_id', user.id).single();
      contenu = (data as any)?.contenu || '';
      titre = (data as any)?.titre || titre;
    }
    const safeTitle = (titre || t('portefeuille.untitled')).replace(/[<>]/g, '');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>
  body{font-family:'Inter',Arial,sans-serif;color:#0f172a;max-width:800px;margin:40px auto;padding:0 24px;line-height:1.6;}
  h1{font-size:28px;} h2{font-size:22px;} h3{font-size:18px;}
  .doc-title{font-size:30px;font-weight:700;border-bottom:2px solid #e2e8f0;padding-bottom:12px;margin-bottom:24px;}
  blockquote{border-left:4px solid #cbd5e1;margin:0;padding:4px 16px;color:#475569;font-style:italic;}
  ul,ol{padding-left:24px;} img{max-width:100%;} a{color:#2563eb;}
</style></head>
<body><div class="doc-title">${safeTitle}</div>${contenu || ''}</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileName = `${safeTitle || t('portefeuille.untitled')}.html`;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(t('portefeuille.toast_download_success'), {
      description: t('portefeuille.toast_download_success_desc', { name: fileName }),
    });
  };

  // ---------------------------------------------------------------- files
  const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const uploadFiles = async (list: FileList | File[]) => {
    if (!user?.id) return;
    const arr = Array.from(list);
    let ok = 0;
    for (const f of arr) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(t('portefeuille.toast_too_large', { size: MAX_FILE_MB }));
        continue;
      }
      try {
        const dataUrl = await readAsDataUrl(f);
        const ext = f.name.includes('.') ? f.name.split('.').pop()!.toLowerCase() : '';
        const { error } = await supabase.from('portefeuille_files').insert([{
          nom: f.name,
          extension: ext,
          type_mime: f.type || null,
          taille: f.size,
          data_url: dataUrl,
          folder_id: currentFolderId,
          user_id: user.id,
        }]);
        if (error) throw error;
        ok++;
      } catch (e) {
        console.error(e);
        toast.error(t('portefeuille.toast_save_error'));
      }
    }
    if (ok > 0) { toast.success(t('portefeuille.toast_file_uploaded')); void fetchAll(); }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) void uploadFiles(e.target.files);
    e.target.value = '';
  };

  const downloadFile = async (file: PortefeuilleFile) => {
    let dataUrl = file.data_url;
    if (!dataUrl && user?.id) {
      const { data } = await supabase.from('portefeuille_files').select('data_url').eq('id', file.id).eq('user_id', user.id).single();
      dataUrl = (data as any)?.data_url;
    }
    if (!dataUrl) { toast.error(t('portefeuille.toast_load_error')); return; }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = file.nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success(t('portefeuille.toast_download_success'), {
      description: t('portefeuille.toast_download_success_desc', { name: file.nom }),
    });
  };

  const openPreview = async (file: PortefeuilleFile) => {
    let full = file;
    if (!file.data_url && user?.id) {
      const { data } = await supabase.from('portefeuille_files').select('*').eq('id', file.id).eq('user_id', user.id).single();
      if (data) full = data as any;
    }
    setPreviewFile(full);
  };

  // ---------------------------------------------------------------- favorites
  const toggleFavorite = async (kind: 'folder' | 'file' | 'paper', id: number, current: boolean) => {
    const table = kind === 'folder' ? 'portefeuille_folders' : kind === 'file' ? 'portefeuille_files' : 'portefeuille_papers';
    const { error } = await supabase.from(table).update({ is_favorite: current ? 0 : 1 }).eq('id', id).eq('user_id', user!.id);
    if (error) { toast.error(t('portefeuille.toast_save_error')); return; }
    void fetchAll();
  };

  // ---------------------------------------------------------------- rename
  const openRename = (kind: 'folder' | 'file' | 'paper', id: number, current: string) => {
    setRenameTarget({ kind, id }); setRenameValue(current); setRenameOpen(true);
  };
  const doRename = async () => {
    if (!renameTarget || !user?.id) return;
    const val = renameValue.trim();
    if (!val) return;
    const { kind, id } = renameTarget;
    const table = kind === 'folder' ? 'portefeuille_folders' : kind === 'file' ? 'portefeuille_files' : 'portefeuille_papers';
    const field = kind === 'paper' ? 'titre' : 'nom';
    const { error } = await supabase.from(table).update({ [field]: val }).eq('id', id).eq('user_id', user.id);
    if (error) { toast.error(t('portefeuille.toast_save_error')); return; }
    toast.success(t(kind === 'folder' ? 'portefeuille.toast_folder_renamed' : kind === 'file' ? 'portefeuille.toast_file_renamed' : 'portefeuille.toast_paper_renamed'));
    setRenameOpen(false); setRenameTarget(null);
    void fetchAll();
  };

  // ---------------------------------------------------------------- move
  const descendantIds = useCallback((rootId: number): Set<number> => {
    const result = new Set<number>([rootId]);
    let added = true;
    while (added) {
      added = false;
      for (const f of folders) {
        if (f.parent_id != null && result.has(f.parent_id) && !result.has(f.id)) { result.add(f.id); added = true; }
      }
    }
    return result;
  }, [folders]);

  const moveDestinations = useMemo(() => {
    if (!moveTarget) return folders;
    if (moveTarget.kind === 'folder') {
      const blocked = descendantIds(moveTarget.id);
      return folders.filter((f) => !blocked.has(f.id));
    }
    return folders;
  }, [folders, moveTarget, descendantIds]);

  const openMove = (kind: 'folder' | 'file' | 'paper', id: number, currentParent: number | null) => {
    setMoveTarget({ kind, id });
    setMoveDest(currentParent != null ? String(currentParent) : 'root');
    setMoveOpen(true);
  };
  const doMove = async () => {
    if (!moveTarget || !user?.id) return;
    const dest = moveDest === 'root' ? null : Number(moveDest);
    if (moveTarget.kind === 'folder') {
      const { error } = await supabase.from('portefeuille_folders').update({ parent_id: dest }).eq('id', moveTarget.id).eq('user_id', user.id);
      if (error) { toast.error(t('portefeuille.toast_save_error')); return; }
      toast.success(t('portefeuille.toast_folder_moved'));
    } else if (moveTarget.kind === 'paper') {
      const { error } = await supabase.from('portefeuille_papers').update({ folder_id: dest }).eq('id', moveTarget.id).eq('user_id', user.id);
      if (error) { toast.error(t('portefeuille.toast_save_error')); return; }
      toast.success(t('portefeuille.toast_paper_moved'));
    } else {
      const { error } = await supabase.from('portefeuille_files').update({ folder_id: dest }).eq('id', moveTarget.id).eq('user_id', user.id);
      if (error) { toast.error(t('portefeuille.toast_save_error')); return; }
      toast.success(t('portefeuille.toast_file_moved'));
    }
    setMoveOpen(false); setMoveTarget(null);
    void fetchAll();
  };

  // ---------------------------------------------------------------- delete
  const openDelete = (kind: 'folder' | 'file' | 'paper', id: number) => { setDeleteTarget({ kind, id }); setDeleteOpen(true); };
  const doDelete = async () => {
    if (!deleteTarget || !user?.id) return;
    const { kind, id } = deleteTarget;
    try {
      if (kind === 'folder') {
        // cascade manually (web/Supabase has FK cascade, but SQLite adapter may not enforce it for nested)
        const blocked = descendantIds(id);
        const ids = Array.from(blocked);
        await supabase.from('portefeuille_files').delete().in('folder_id', ids).eq('user_id', user.id);
        await supabase.from('portefeuille_papers').delete().in('folder_id', ids).eq('user_id', user.id);
        await supabase.from('portefeuille_folders').delete().in('id', ids).eq('user_id', user.id);
        toast.success(t('portefeuille.toast_folder_deleted'));
      } else if (kind === 'file') {
        await supabase.from('portefeuille_files').delete().eq('id', id).eq('user_id', user.id);
        toast.success(t('portefeuille.toast_file_deleted'));
      } else {
        await supabase.from('portefeuille_papers').delete().eq('id', id).eq('user_id', user.id);
        toast.success(t('portefeuille.toast_paper_deleted'));
      }
      void fetchAll();
    } catch (e) {
      console.error(e);
      toast.error(t('portefeuille.toast_save_error'));
    } finally {
      setDeleteOpen(false); setDeleteTarget(null);
    }
  };

  // ---------------------------------------------------------------- drag&drop
  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
  };

  const deleteCopy = useMemo(() => {
    if (!deleteTarget) return { title: '', body: '' };
    if (deleteTarget.kind === 'folder') return { title: t('portefeuille.confirm_delete_folder_title'), body: t('portefeuille.confirm_delete_folder_body') };
    if (deleteTarget.kind === 'file') return { title: t('portefeuille.confirm_delete_file_title'), body: t('portefeuille.confirm_delete_file_body') };
    return { title: t('portefeuille.confirm_delete_paper_title'), body: t('portefeuille.confirm_delete_paper_body') };
  }, [deleteTarget, t]);

  // ---------------------------------------------------------------- editor view
  if (editingPaper) {
    return (
      <PaperEditor
        paper={editingPaper}
        onBack={() => { setEditingPaper(null); void fetchAll(); }}
        onSaved={(p) => setEditingPaper(p)}
      />
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileInput} />

      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-[6px] bg-blue-50 border border-blue-200/50 dark:bg-emerald-500/10 dark:border-emerald-500/20">
            <Wallet className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">{t('portefeuille.page_title')}</h2>
            <p className="text-sm text-muted-foreground">{t('portefeuille.page_subtitle')}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="rounded-[4px] h-10" onClick={() => { setFolderName(''); setFolderDialogOpen(true); }}>
            <FolderPlus className="h-4 w-4 me-2" />{t('portefeuille.new_folder')}
          </Button>
          <Button variant="outline" className="rounded-[4px] h-10" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 me-2" />{t('portefeuille.upload_file')}
          </Button>
          <Button className="rounded-[4px] h-10 bg-blue-600 hover:bg-blue-700 text-white font-semibold" onClick={createPaper}>
            <FilePlus className="h-4 w-4 me-2" />{t('portefeuille.new_paper')}
          </Button>
        </div>
      </div>

      {/* Toolbar: breadcrumb + filters + search */}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
        <div className="flex items-center gap-1 text-sm flex-wrap min-w-0">
          <button
            onClick={() => { setCurrentFolderId(null); setFilter('all'); setSearch(''); }}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[4px] text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5 font-medium"
          >
            <Home className="h-3.5 w-3.5" />{t('portefeuille.root')}
          </button>
          {!searching && filter === 'all' && breadcrumb.map((f) => (
            <span key={f.id} className="inline-flex items-center gap-1 min-w-0">
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 rtl:rotate-180 shrink-0" />
              <button
                onClick={() => setCurrentFolderId(f.id)}
                className="px-2 py-1 rounded-[4px] text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5 font-medium truncate max-w-[160px]"
              >
                {f.nom}
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex rounded-[6px] border border-slate-200 dark:border-white/10 overflow-hidden">
            {(['all', 'favorites', 'recent'] as ViewFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setSearch(''); }}
                className={cn(
                  'px-3 h-9 text-xs font-medium inline-flex items-center gap-1.5 transition-colors',
                  filter === f
                    ? 'bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-white'
                    : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'
                )}
              >
                {f === 'favorites' && <Star className="h-3.5 w-3.5" />}
                {f === 'recent' && <Clock className="h-3.5 w-3.5" />}
                {t(`portefeuille.${f}`)}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('portefeuille.search_ph')}
              className="ps-9 h-9 w-full sm:w-64 rounded-[4px] bg-white dark:bg-[#0F172A] dark:border-white/10"
            />
          </div>
        </div>
      </div>

      {/* Content area with drag & drop */}
      <div
        onDragOver={(e) => { e.preventDefault(); if (!isDragging) setIsDragging(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setIsDragging(false); }}
        onDrop={onDrop}
        className={cn(
          'relative rounded-[8px] border-2 border-dashed transition-colors min-h-[40vh] p-4',
          isDragging
            ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-500/5'
            : 'border-transparent'
        )}
      >
        {isDragging && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-blue-50/70 dark:bg-blue-500/10 rounded-[8px] pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-blue-600 dark:text-blue-400">
              <Upload className="h-8 w-8" />
              <p className="font-semibold">{t('portefeuille.drop_here')}</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 h-64">
            <div className="h-8 w-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">{t('portefeuille.loading')}</p>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-3 h-64 text-center">
            <div className="bg-slate-50 rounded-[6px] p-4 border border-slate-100 dark:bg-slate-900/40 dark:border-white/5">
              <Wallet className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
              {searching ? t('portefeuille.empty_folder') : currentFolderId == null && filter === 'all' ? t('portefeuille.empty_root') : t('portefeuille.empty_folder')}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Folders */}
            {visibleFolders.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('portefeuille.folders')}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                  {visibleFolders.map((folder) => (
                    <Card
                      key={folder.id}
                      onDoubleClick={() => { setCurrentFolderId(folder.id); setFilter('all'); setSearch(''); }}
                      className="group relative p-3 rounded-[8px] border border-slate-200 dark:border-white/10 hover:border-blue-300 dark:hover:border-blue-500/40 hover:shadow-sm transition-all cursor-pointer dark:bg-slate-900/40"
                    >
                      <div
                        className="flex items-center gap-3"
                        onClick={() => { setCurrentFolderId(folder.id); setFilter('all'); setSearch(''); }}
                      >
                        <div className="flex items-center justify-center h-10 w-10 rounded-[6px] bg-amber-50 text-amber-500 dark:bg-amber-500/10 dark:text-amber-400 shrink-0">
                          <Folder className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{folder.nom}</p>
                          <p className="text-[11px] text-slate-400">
                            {t('portefeuille.items_count', {
                              count: files.filter((f) => f.folder_id === folder.id).length + papers.filter((p) => p.folder_id === folder.id).length + folders.filter((sf) => sf.parent_id === folder.id).length,
                            })}
                          </p>
                        </div>
                      </div>
                      {fav(folder.is_favorite) && <Star className="absolute top-2 start-2 h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                      <ItemMenu
                        onRename={() => openRename('folder', folder.id, folder.nom)}
                        onMove={() => openMove('folder', folder.id, folder.parent_id)}
                        onDelete={() => openDelete('folder', folder.id)}
                        onFavorite={() => toggleFavorite('folder', folder.id, fav(folder.is_favorite))}
                        isFavorite={fav(folder.is_favorite)}
                        t={t}
                      />
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* Papers */}
            {visiblePapers.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('portefeuille.papers')}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                  {visiblePapers.map((paper) => (
                    <Card
                      key={paper.id}
                      onClick={() => void openPaper(paper)}
                      className="group relative p-3 rounded-[8px] border border-slate-200 dark:border-white/10 hover:border-blue-300 dark:hover:border-blue-500/40 hover:shadow-sm transition-all cursor-pointer dark:bg-slate-900/40"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center h-10 w-10 rounded-[6px] bg-sky-50 text-sky-500 dark:bg-sky-500/10 dark:text-sky-400 shrink-0">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{paper.titre || t('portefeuille.untitled')}</p>
                          <p className="text-[11px] text-slate-400">{t('portefeuille.new_paper')}</p>
                        </div>
                      </div>
                      {fav(paper.is_favorite) && <Star className="absolute top-2 start-2 h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                      <ItemMenu
                        onOpen={() => void openPaper(paper)}
                        onDownload={() => void downloadPaper(paper)}
                        onRename={() => openRename('paper', paper.id, paper.titre)}
                        onMove={() => openMove('paper', paper.id, paper.folder_id ?? null)}
                        onDelete={() => openDelete('paper', paper.id)}
                        onFavorite={() => toggleFavorite('paper', paper.id, fav(paper.is_favorite))}
                        isFavorite={fav(paper.is_favorite)}
                        t={t}
                      />
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* Files */}
            {visibleFiles.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('portefeuille.files')}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                  {visibleFiles.map((file) => {
                    const ext = (file.extension || file.nom.split('.').pop() || '').toLowerCase();
                    const Icon = fileIconFor(ext);
                    return (
                      <Card
                        key={file.id}
                        onDoubleClick={() => void openPreview(file)}
                        className="group relative p-3 rounded-[8px] border border-slate-200 dark:border-white/10 hover:border-blue-300 dark:hover:border-blue-500/40 hover:shadow-sm transition-all cursor-pointer dark:bg-slate-900/40"
                      >
                        <div className="flex items-center gap-3" onClick={() => void openPreview(file)}>
                          <div className="flex items-center justify-center h-10 w-10 rounded-[6px] bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-300 shrink-0">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 dark:text-white truncate" title={file.nom}>{file.nom}</p>
                            <p className="text-[11px] text-slate-400 uppercase">{ext || '—'} · {formatSize(file.taille)}</p>
                          </div>
                        </div>
                        {fav(file.is_favorite) && <Star className="absolute top-2 start-2 h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                        <ItemMenu
                          onPreview={() => void openPreview(file)}
                          onDownload={() => void downloadFile(file)}
                          onRename={() => openRename('file', file.id, file.nom)}
                          onMove={() => openMove('file', file.id, file.folder_id ?? null)}
                          onDelete={() => openDelete('file', file.id)}
                          onFavorite={() => toggleFavorite('file', file.id, fav(file.is_favorite))}
                          isFavorite={fav(file.is_favorite)}
                          t={t}
                        />
                      </Card>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* New Folder dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={(o) => { if (!o) setFolderDialogOpen(false); }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('portefeuille.new_folder')}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void createFolder(); }}
              placeholder={t('portefeuille.folder_name_ph')}
              className="h-11 rounded-[6px]"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setFolderDialogOpen(false)}>{t('portefeuille.cancel')}</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={createFolder} disabled={!folderName.trim()}>{t('portefeuille.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={(o) => { if (!o) setRenameOpen(false); }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {renameTarget?.kind === 'folder' ? t('portefeuille.rename_folder') : renameTarget?.kind === 'file' ? t('portefeuille.rename_file') : t('portefeuille.rename_paper')}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void doRename(); }}
              placeholder={t('portefeuille.new_name')}
              className="h-11 rounded-[6px]"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>{t('portefeuille.cancel')}</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={doRename} disabled={!renameValue.trim()}>{t('portefeuille.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move dialog */}
      <Dialog open={moveOpen} onOpenChange={(o) => { if (!o) setMoveOpen(false); }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('portefeuille.move_to')}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Select value={moveDest} onValueChange={setMoveDest}>
              <SelectTrigger className="h-11 rounded-[6px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="root">{t('portefeuille.move_to_root')}</SelectItem>
                {moveDestinations.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>{f.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setMoveOpen(false)}>{t('portefeuille.cancel')}</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={doMove}>{t('portefeuille.move')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={doDelete}
        title={deleteCopy.title}
        description={deleteCopy.body}
        confirmText={t('portefeuille.delete')}
        cancelText={t('portefeuille.cancel')}
      />

      {/* File preview */}
      <FilePreview
        file={previewFile}
        isOpen={!!previewFile}
        onClose={() => setPreviewFile(null)}
        onDownload={(f) => void downloadFile(f)}
      />
    </div>
  );
}

// --------------------------------------------------------------------- menu
interface ItemMenuProps {
  onOpen?: () => void;
  onPreview?: () => void;
  onDownload?: () => void;
  onRename?: () => void;
  onMove?: () => void;
  onDelete?: () => void;
  onFavorite?: () => void;
  isFavorite?: boolean;
  t: (k: string) => string;
}

function ItemMenu({ onOpen, onPreview, onDownload, onRename, onMove, onDelete, onFavorite, isFavorite, t }: ItemMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => e.stopPropagation()}
            className="absolute top-1.5 end-1.5 h-7 w-7 rounded-[4px] text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-100 dark:hover:bg-white/10 transition-opacity"
          />
        }
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
        {onOpen && <DropdownMenuItem onClick={onOpen}><FileEdit className="h-4 w-4 me-2" />{t('portefeuille.open')}</DropdownMenuItem>}
        {onPreview && <DropdownMenuItem onClick={onPreview}><Eye className="h-4 w-4 me-2" />{t('portefeuille.preview')}</DropdownMenuItem>}
        {onDownload && <DropdownMenuItem onClick={onDownload}><Download className="h-4 w-4 me-2" />{t('portefeuille.download')}</DropdownMenuItem>}
        {onFavorite && (
          <DropdownMenuItem onClick={onFavorite}>
            <Star className={cn('h-4 w-4 me-2', isFavorite && 'fill-amber-400 text-amber-400')} />
            {isFavorite ? t('portefeuille.remove_favorite') : t('portefeuille.add_favorite')}
          </DropdownMenuItem>
        )}
        {onRename && <DropdownMenuItem onClick={onRename}><FileEdit className="h-4 w-4 me-2" />{t('portefeuille.rename')}</DropdownMenuItem>}
        {onMove && <DropdownMenuItem onClick={onMove}><FolderInput className="h-4 w-4 me-2" />{t('portefeuille.move')}</DropdownMenuItem>}
        {onDelete && <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} className="text-red-500 focus:text-red-500"><Trash2 className="h-4 w-4 me-2" />{t('portefeuille.delete')}</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

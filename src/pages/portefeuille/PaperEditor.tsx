import type { ReactNode } from 'react'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, Bold, Italic, Underline, Strikethrough, List, ListOrdered,
  Quote, AlignLeft, AlignCenter, AlignRight, Heading1, Heading2, Heading3,
  Pilcrow, Link2, RemoveFormatting, Undo2, Redo2, Printer, FileDown,
  Save, Check, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export interface Paper {
  id: number;
  titre: string;
  contenu: string;
  folder_id: number | null;
  is_favorite?: number | boolean;
  created_at?: string;
  updated_at?: string;
}

interface PaperEditorProps {
  paper: Paper;
  onBack: () => void;
  onSaved?: (paper: Paper) => void;
}

type SaveState = 'idle' | 'saving' | 'saved';

const AUTOSAVE_DELAY = 1200;

export function PaperEditor({ paper, onBack, onSaved }: PaperEditorProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const editorRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(paper.titre || t('portefeuille.untitled'));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRtl = i18n.language?.startsWith('ar');

  // Initialise the editor body once (uncontrolled contentEditable).
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = paper.contenu || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper.id]);

  const save = useCallback(async () => {
    if (!user?.id) return;
    const contenu = editorRef.current?.innerHTML ?? '';
    const titre = title.trim() || t('portefeuille.untitled');
    setSaveState('saving');
    try {
      const { error } = await supabase
        .from('portefeuille_papers')
        .update({ titre, contenu, updated_at: new Date().toISOString() })
        .eq('id', paper.id)
        .eq('user_id', user.id);
      if (error) throw error;
      dirtyRef.current = false;
      setSaveState('saved');
      onSaved?.({ ...paper, titre, contenu });
      window.setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500);
    } catch (e) {
      console.error(e);
      setSaveState('idle');
      toast.error(t('portefeuille.toast_save_error'));
    }
  }, [user?.id, title, paper, onSaved, t]);

  const scheduleAutosave = useCallback(() => {
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void save();
    }, AUTOSAVE_DELAY);
  }, [save]);

  // Flush a pending save on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dirtyRef.current) void save();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl/Cmd+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (timerRef.current) clearTimeout(timerRef.current);
        void save();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [save]);

  const exec = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    scheduleAutosave();
  };

  const formatBlock = (tag: string) => exec('formatBlock', tag);

  const insertLink = () => {
    const url = window.prompt(t('portefeuille.editor.link') + ':', 'https://');
    if (url) exec('createLink', url);
  };

  const buildPrintHtml = () => {
    const body = editorRef.current?.innerHTML ?? '';
    const safeTitle = (title || t('portefeuille.untitled')).replace(/</g, '&lt;');
    return `<!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${safeTitle}</title>
      <style>
        body{font-family:'Inter',Arial,sans-serif;color:#0f172a;max-width:800px;margin:40px auto;padding:0 24px;line-height:1.6;}
        h1{font-size:28px;margin:0 0 4px;} h2{font-size:22px;} h3{font-size:18px;}
        .doc-title{font-size:30px;font-weight:700;border-bottom:2px solid #e2e8f0;padding-bottom:12px;margin-bottom:24px;}
        blockquote{border-${isRtl ? 'right' : 'left'}:4px solid #cbd5e1;margin:0;padding:4px 16px;color:#475569;font-style:italic;}
        ul,ol{padding-${isRtl ? 'right' : 'left'}:24px;} img{max-width:100%;} a{color:#2563eb;}
      </style></head>
      <body><div class="doc-title">${safeTitle}</div>${body}</body></html>`;
  };

  const handlePrint = () => {
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { toast.error(t('portefeuille.toast_save_error')); return; }
    w.document.write(buildPrintHtml());
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
  };

  const handleExportPdf = () => {
    // Uses the browser/OS "Save as PDF" target in the print dialog — works
    // offline in the Tauri webview as well as the web build.
    handlePrint();
    toast.message(t('portefeuille.export_pdf'), {
      description: i18n.language?.startsWith('fr')
        ? 'Choisissez « Enregistrer au format PDF » dans la boîte d\'impression.'
        : i18n.language?.startsWith('ar')
          ? 'اختر «حفظ بصيغة PDF» في نافذة الطباعة.'
          : 'Choose "Save as PDF" in the print dialog.',
    });
  };

  const ToolbarButton = ({
    onClick, title: tip, children, active,
  }: { onClick: () => void; title: string; children: ReactNode; active?: boolean }) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={tip}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'h-8 w-8 rounded-[4px] text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5',
        active && 'bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-white'
      )}
    >
      {children}
    </Button>
  );

  const Divider = () => <div className="w-px h-5 bg-slate-200 dark:bg-white/10 mx-1" />;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header bar */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} title={t('portefeuille.cancel')}>
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </Button>
        <Input
          value={title}
          onChange={(e) => { setTitle(e.target.value); scheduleAutosave(); }}
          placeholder={t('portefeuille.paper_title_ph')}
          className="flex-1 h-11 text-lg font-semibold border-transparent bg-transparent shadow-none focus-visible:border-slate-200 dark:focus-visible:border-white/10 px-2"
        />
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground min-w-[80px] text-end">
            {saveState === 'saving' && (
              <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />{t('portefeuille.saving')}</span>
            )}
            {saveState === 'saved' && (
              <span className="inline-flex items-center gap-1 text-emerald-500"><Check className="h-3 w-3" />{t('portefeuille.saved')}</span>
            )}
          </span>
          <Button variant="outline" size="sm" className="rounded-[4px]" onClick={handlePrint} title={t('portefeuille.print')}>
            <Printer className="h-4 w-4 sm:me-2" /><span className="hidden sm:inline">{t('portefeuille.print')}</span>
          </Button>
          <Button variant="outline" size="sm" className="rounded-[4px]" onClick={handleExportPdf} title={t('portefeuille.export_pdf')}>
            <FileDown className="h-4 w-4 sm:me-2" /><span className="hidden sm:inline">PDF</span>
          </Button>
          <Button size="sm" className="rounded-[4px] bg-blue-600 hover:bg-blue-700 text-white" onClick={() => { if (timerRef.current) clearTimeout(timerRef.current); void save(); }}>
            <Save className="h-4 w-4 sm:me-2" /><span className="hidden sm:inline">{t('portefeuille.save')}</span>
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-1.5 rounded-[6px] border border-slate-200 bg-slate-50/50 dark:bg-slate-900/60 dark:border-white/10 sticky top-0 z-10">
        <ToolbarButton onClick={() => exec('undo')} title={t('portefeuille.editor.undo')}><Undo2 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => exec('redo')} title={t('portefeuille.editor.redo')}><Redo2 className="h-4 w-4" /></ToolbarButton>
        <Divider />
        <ToolbarButton onClick={() => formatBlock('<p>')} title={t('portefeuille.editor.paragraph')}><Pilcrow className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => formatBlock('<h1>')} title={t('portefeuille.editor.h1')}><Heading1 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => formatBlock('<h2>')} title={t('portefeuille.editor.h2')}><Heading2 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => formatBlock('<h3>')} title={t('portefeuille.editor.h3')}><Heading3 className="h-4 w-4" /></ToolbarButton>
        <Divider />
        <ToolbarButton onClick={() => exec('bold')} title={t('portefeuille.editor.bold')}><Bold className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => exec('italic')} title={t('portefeuille.editor.italic')}><Italic className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => exec('underline')} title={t('portefeuille.editor.underline')}><Underline className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => exec('strikeThrough')} title={t('portefeuille.editor.strike')}><Strikethrough className="h-4 w-4" /></ToolbarButton>
        <Divider />
        <ToolbarButton onClick={() => exec('insertUnorderedList')} title={t('portefeuille.editor.bullet_list')}><List className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => exec('insertOrderedList')} title={t('portefeuille.editor.ordered_list')}><ListOrdered className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => formatBlock('<blockquote>')} title={t('portefeuille.editor.quote')}><Quote className="h-4 w-4" /></ToolbarButton>
        <Divider />
        <ToolbarButton onClick={() => exec('justifyLeft')} title={t('portefeuille.editor.align_left')}><AlignLeft className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => exec('justifyCenter')} title={t('portefeuille.editor.align_center')}><AlignCenter className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => exec('justifyRight')} title={t('portefeuille.editor.align_right')}><AlignRight className="h-4 w-4" /></ToolbarButton>
        <Divider />
        <ToolbarButton onClick={insertLink} title={t('portefeuille.editor.link')}><Link2 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton onClick={() => exec('removeFormat')} title={t('portefeuille.editor.clear')}><RemoveFormatting className="h-4 w-4" /></ToolbarButton>
      </div>

      {/* Editing surface */}
      <div className="rounded-[6px] border border-slate-200 bg-white dark:bg-slate-900/40 dark:border-white/10 shadow-none">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={scheduleAutosave}
          onBlur={() => { if (dirtyRef.current) void save(); }}
          data-placeholder={t('portefeuille.editor.placeholder')}
          className={cn(
            'pf-paper-editor min-h-[55vh] max-w-3xl mx-auto px-6 sm:px-10 py-10 outline-none text-slate-800 dark:text-slate-100 leading-relaxed',
            'prose-headings:font-bold'
          )}
        />
      </div>
    </div>
  );
}

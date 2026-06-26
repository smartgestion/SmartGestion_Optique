import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Download, FileQuestion, FileText, FileType, X,
  Image as ImageIcon, File as FileIcon,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button'

export interface PortefeuilleFile {
  id: number;
  nom: string;
  extension?: string | null;
  type_mime?: string | null;
  taille?: number;
  data_url?: string | null;
  folder_id?: number | null;
  is_favorite?: number | boolean;
  created_at?: string;
}

interface FilePreviewProps {
  file: PortefeuilleFile | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (file: PortefeuilleFile) => void;
}

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
const TEXT_EXT = ['txt', 'csv', 'md', 'json', 'log', 'xml'];

export function FilePreview({ file, isOpen, onClose, onDownload }: FilePreviewProps) {
  const { t } = useTranslation();
  const [textContent, setTextContent] = useState<string>('');

  const ext = (file?.extension || file?.nom?.split('.').pop() || '').toLowerCase();
  const mime = file?.type_mime || '';
  const isImage = IMAGE_EXT.includes(ext) || mime.startsWith('image/');
  const isPdf = ext === 'pdf' || mime === 'application/pdf';
  const isText = TEXT_EXT.includes(ext) || mime.startsWith('text/');

  useEffect(() => {
    if (isOpen && isText && file?.data_url) {
      try {
        const base64 = file.data_url.split(',')[1] || '';
        setTextContent(decodeURIComponent(escape(window.atob(base64))));
      } catch {
        try { setTextContent(window.atob(file.data_url.split(',')[1] || '')); }
        catch { setTextContent(''); }
      }
    } else {
      setTextContent('');
    }
  }, [isOpen, isText, file]);

  if (!file) return null;

  const Icon = isImage ? ImageIcon : isPdf ? FileType : isText ? FileText : FileIcon;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* Full-screen preview. We render our own close (X) inside the header
          so it never overlaps the download action, hence showCloseButton=false. */}
      <DialogContent fullScreen showCloseButton={false} className="bg-white dark:bg-[#0F172A] overflow-hidden">
        {/* Header — file identity on the start, actions (download + close) on
            the end with their own spacing. */}
        <DialogHeader className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 dark:border-white/10 flex-row items-center justify-between gap-3 sm:gap-4 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <span className="flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-[8px] bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300 shrink-0">
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-sm sm:text-base leading-tight break-all line-clamp-1 sm:line-clamp-2" title={file.nom}>
                {file.nom}
              </DialogTitle>
              <p className="text-[11px] sm:text-xs text-muted-foreground uppercase mt-0.5">
                {ext || '—'}{file.taille ? ` · ${formatSize(file.taille)}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              className="rounded-[8px] bg-blue-600 hover:bg-blue-700 text-white shadow-none h-9"
              onClick={() => onDownload(file)}
            >
              <Download className="h-4 w-4 sm:me-2" />
              <span className="hidden sm:inline">{t('portefeuille.download')}</span>
            </Button>
            <DialogClose
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('portefeuille.cancel')}
                  className="h-9 w-9 rounded-[8px] text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10"
                />
              }
            >
              <X className="h-5 w-5" />
            </DialogClose>
          </div>
        </DialogHeader>

        {/* Content — fills all remaining height, scrolls when needed. */}
        <div className="bg-slate-100 dark:bg-slate-950/60 flex-1 min-h-0 overflow-auto flex items-center justify-center p-3 sm:p-6">
          {!file.data_url ? (
            <EmptyPreview t={t} />
          ) : isImage ? (
            // eslint-disable-next-line jsx-a11y/img-redundant-alt
            <img
              src={file.data_url}
              alt={file.nom}
              className="max-w-full max-h-full object-contain rounded shadow-sm"
            />
          ) : isPdf ? (
            <iframe
              src={file.data_url}
              title={file.nom}
              className="w-full h-full max-w-5xl rounded border border-slate-200 dark:border-white/10 bg-white shadow-sm"
            />
          ) : isText ? (
            <pre className="w-full max-w-4xl h-full overflow-auto text-xs sm:text-sm whitespace-pre-wrap break-words font-mono text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 rounded-lg p-4 sm:p-6 border border-slate-200 dark:border-white/10 shadow-sm">
              {textContent}
            </pre>
          ) : (
            <EmptyPreview t={t} onDownload={() => onDownload(file)} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyPreview({ t, onDownload }: { t: (k: string) => string; onDownload?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
      <FileQuestion className="h-12 w-12" />
      <p className="text-sm text-center px-4 max-w-xs">{t('portefeuille.no_preview')}</p>
      {onDownload && (
        <Button variant="outline" size="sm" className="rounded-[6px]" onClick={onDownload}>
          <Download className="h-4 w-4 me-2" />
          {t('portefeuille.download')}
        </Button>
      )}
    </div>
  );
}

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

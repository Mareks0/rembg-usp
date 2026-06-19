import { Download, Trash2, X, RefreshCw } from 'lucide-react';

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  title: string;
  isProcessed?: boolean;
  onDelete?: () => void;
  onReplaceClick?: () => void;
  onDownload?: () => void;
}

export default function ImageModal({
  isOpen,
  onClose,
  imageUrl,
  title,
  isProcessed = false,
  onDelete,
  onReplaceClick,
  onDownload,
}: ImageModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl rounded-[28px] bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-3 pr-12">
          <h2 className="truncate text-sm font-bold text-slate-800">{title}</h2>

          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex max-h-[75vh] min-h-[320px] items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] bg-[size:12px_12px] p-3">
          <img src={imageUrl} alt={title} className="max-h-[72vh] w-full object-contain" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {isProcessed && onDownload && (
            <button
              type="button"
              onClick={onDownload}
              className="flex items-center gap-2 rounded-2xl bg-[#1E60F2] px-4 py-3 text-xs font-bold uppercase tracking-wide text-white shadow-sm hover:bg-blue-700"
            >
              <Download className="h-4 w-4" />
              Scarica
            </button>
          )}

          {!isProcessed && onReplaceClick && (
            <button
              type="button"
              onClick={onReplaceClick}
              className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Sostituisci
            </button>
          )}

          {!isProcessed && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-rose-700 hover:bg-rose-100"
            >
              <Trash2 className="h-4 w-4" />
              Elimina
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

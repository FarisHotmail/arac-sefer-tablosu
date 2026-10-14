import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { BoardColumn } from '../types';

interface DeleteColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  column: BoardColumn | null;
  onConfirm: (columnId: string) => void;
}

export const DeleteColumnModal: React.FC<DeleteColumnModalProps> = ({
  isOpen,
  onClose,
  column,
  onConfirm,
}) => {
  if (!isOpen || !column) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-sm bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-[4px] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-red-50/50 dark:bg-red-950/20">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="w-4 h-4" />
            <h3 className="font-semibold text-sm">Sütunu Kaldır</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-[2px]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-sm text-neutral-700 dark:text-neutral-300">
            <strong className="text-neutral-900 dark:text-white font-mono">{column.date}</strong> tarihine ait sütunu ve bu tarihteki tüm sefer kayıtlarını tablodan kaldırmak istediğinize emin misiniz?
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Bu işlem geri alınamaz ve Firebase veritabanı üzerinden güncellenir.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-[2px] transition-colors"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm(column.id);
              onClose();
            }}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-[2px] shadow-xs transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Sütunu Sil
          </button>
        </div>
      </div>
    </div>
  );
};

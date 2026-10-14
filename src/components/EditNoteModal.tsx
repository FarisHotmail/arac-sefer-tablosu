import React, { useState, useEffect } from 'react';
import { AlertCircle, Check, FileText, X } from 'lucide-react';
import { VehicleRow } from '../types';

interface EditNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  row: VehicleRow | null;
  onSave: (rowId: string, notes: string, isAlert: boolean) => void;
}

export const EditNoteModal: React.FC<EditNoteModalProps> = ({
  isOpen,
  onClose,
  row,
  onSave,
}) => {
  const [noteText, setNoteText] = useState('');
  const [isAlert, setIsAlert] = useState(false);

  useEffect(() => {
    if (isOpen && row) {
      setNoteText(row.notes || '');
      setIsAlert(!!row.notesAlert);
    }
  }, [isOpen, row]);

  if (!isOpen || !row) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(row.id, noteText.trim(), isAlert);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-[4px] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-[2px] border border-neutral-200 dark:border-neutral-700">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm font-mono">
                {row.plate} - Not Düzenle
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {row.driver || 'Sürücü belirtilmemiş'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-[2px]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
              Araç / Sürücü Notu
            </label>
            <textarea
              rows={3}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Örn: Yağ bakımı yapılacak, 16.10 muayene randevusu, izinli..."
              className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-[2px] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-blue-600 dark:focus:border-blue-400 transition-colors"
              autoFocus
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isAlert}
              onChange={(e) => setIsAlert(e.target.checked)}
              className="rounded-[2px] text-red-600 focus:ring-red-500"
            />
            <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-red-500" />
              Kırmızı Kritik Uyarı Olarak Vurgula (Bakım, Arıza vb.)
            </span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-[2px] transition-colors"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-[2px] shadow-xs transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Kaydet
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

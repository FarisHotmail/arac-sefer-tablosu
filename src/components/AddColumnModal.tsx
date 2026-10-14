import React, { useState } from 'react';
import { AlertTriangle, ArrowRight, Calendar, Plus, X } from 'lucide-react';
import { BoardColumn } from '../types';

interface AddColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (newColumn: BoardColumn, columnToRemove?: BoardColumn) => void;
  existingColumns: BoardColumn[];
}

export const AddColumnModal: React.FC<AddColumnModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  existingColumns,
}) => {
  // Suggest the day after the last existing column
  const getLastSuggestedDate = () => {
    if (existingColumns.length === 0) return '15.10.2026';
    const last = existingColumns[existingColumns.length - 1];
    const parts = last.date.split('.');
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      const nextDate = new Date(y, m - 1, d + 1);
      const dd = String(nextDate.getDate()).padStart(2, '0');
      const mm = String(nextDate.getMonth() + 1).padStart(2, '0');
      const yyyy = nextDate.getFullYear();
      return `${dd}.${mm}.${yyyy}`;
    }
    return '15.10.2026';
  };

  const [dateInput, setDateInput] = useState('');
  const [error, setError] = useState('');
  const [showConfirmReplace, setShowConfirmReplace] = useState(false);

  // The oldest column is the first in chronological order
  const oldestColumn = existingColumns.length > 0 ? existingColumns[0] : null;

  React.useEffect(() => {
    if (isOpen) {
      setDateInput(getLastSuggestedDate());
      setError('');
      setShowConfirmReplace(false);
    }
  }, [isOpen, existingColumns]);

  if (!isOpen) return null;

  const handleInitialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDate = dateInput.trim();
    if (!cleanDate) {
      setError('Lütfen bir tarih giriniz.');
      return;
    }

    // Check if column count is at limit (3)
    if (existingColumns.length >= 3 && oldestColumn) {
      setShowConfirmReplace(true);
      return;
    }

    // Otherwise add directly
    proceedToAdd();
  };

  const proceedToAdd = () => {
    const cleanDate = dateInput.trim();
    const colId = `col_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newCol: BoardColumn = {
      id: colId,
      date: cleanDate,
      order: existingColumns.length,
      isCustom: true,
    };

    if (existingColumns.length >= 3 && oldestColumn) {
      onAdd(newCol, oldestColumn);
    } else {
      onAdd(newCol);
    }

    onClose();
  };

  const handleCancel = () => {
    setShowConfirmReplace(false);
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-[4px] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* STEP 1: Date Input */}
        {!showConfirmReplace ? (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-[2px] border border-blue-200 dark:border-blue-800">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm tracking-tight">
                    Yeni Tarih Sütunu Ekle
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Tablo limiti: Maksimum 3 tarih sütunu ({existingColumns.length}/3)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-[2px] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleInitialSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Sefer Tarihi (GG.AA.YYYY)
                </label>
                <input
                  type="text"
                  value={dateInput}
                  onChange={(e) => {
                    setDateInput(e.target.value);
                    setError('');
                  }}
                  placeholder="Örn: 15.10.2026"
                  className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-[2px] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-blue-600 dark:focus:border-blue-400 transition-colors font-mono"
                  autoFocus
                />
                {error && (
                  <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
                )}
                {existingColumns.length >= 3 && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-2 border border-amber-200 dark:border-amber-800 rounded-[2px]">
                    Not: Tabloda 3 tarih dolu olduğu için ekleme yapıldığında en eski tarih ({oldestColumn?.date}) silinmek üzere onayınıza sunulacaktır.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-3.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-[2px] transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-[2px] shadow-xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Devam Et
                </button>
              </div>
            </form>
          </>
        ) : (
          /* STEP 2: En Eski Tarih Silinecek Bilgi & Onay Ekranı */
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded-[2px] border border-amber-300 dark:border-amber-700">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 dark:text-white text-sm">
                    Tarih Sütunu Limiti (En Fazla 3 Adet)
                  </h3>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400">
                    En eski tarih tablodan kaldırılacaktır
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-[2px]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-neutral-800 dark:text-neutral-200 leading-relaxed">
                Tabloda en fazla <strong>3 adet</strong> tarih sütunu bulunabilir. Yeni tarih eklendiğinde, tablonun en eski tarihi olan <span className="font-mono font-bold text-red-600 dark:text-red-400">{oldestColumn?.date}</span> sütunu ve bu tarihe ait tüm sefer kayıtları silinecektir.
              </p>

              {/* Visual Shift Preview */}
              <div className="bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 rounded-[2px] p-3 text-xs space-y-2">
                <div className="flex items-center justify-between text-neutral-500 font-medium">
                  <span>Gerçekleşecek İşlem:</span>
                </div>
                <div className="flex items-center justify-between gap-2 bg-white dark:bg-neutral-900 p-2.5 border border-neutral-200 dark:border-neutral-700 rounded-[2px]">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-red-600 dark:text-red-400">Silinecek (En Eski)</span>
                    <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100 line-through decoration-red-500">
                      {oldestColumn?.date}
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-neutral-400 shrink-0" />
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Eklenecek (Yeni)</span>
                    <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100">
                      {dateInput}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Bu işlemi onaylıyor musunuz? Onay vermezseniz yeni tarih eklenmeyecek ve mevcut tablo korunacaktır.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
              <button
                type="button"
                onClick={handleCancel}
                className="px-3.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-[2px] transition-colors"
              >
                Vazgeç / İptal
              </button>
              <button
                type="button"
                onClick={proceedToAdd}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-[2px] shadow-xs transition-colors"
              >
                Onayla ve Ekle
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
};

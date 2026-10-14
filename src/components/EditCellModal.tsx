import React, { useState, useEffect } from 'react';
import { X, Check, Trash2, MapPin } from 'lucide-react';
import { BoardColumn, TripCell, TripType, VehicleRow } from '../types';

interface EditCellModalProps {
  isOpen: boolean;
  onClose: () => void;
  row: VehicleRow | null;
  column: BoardColumn | null;
  currentTrip?: TripCell;
  onSave: (rowId: string, columnId: string, trip: TripCell) => void;
  onClear: (rowId: string, columnId: string) => void;
}

export const EditCellModal: React.FC<EditCellModalProps> = ({
  isOpen,
  onClose,
  row,
  column,
  currentTrip,
  onSave,
  onClear,
}) => {
  const [text, setText] = useState('');
  const [type, setType] = useState<TripType>('morning');

  useEffect(() => {
    if (isOpen && currentTrip) {
      setText(currentTrip.text || '');
      setType(currentTrip.type || inferType(currentTrip.text));
    } else {
      setText('');
      setType('morning');
    }
  }, [isOpen, currentTrip]);

  if (!isOpen || !row || !column) return null;

  function inferType(val: string): TripType {
    const lower = (val || '').toLowerCase();
    if (lower.includes('sabah')) return 'morning';
    if (lower.includes('akşam') || lower.includes('aksam')) return 'evening';
    if (lower.includes('gece') || lower.includes('havalimanı') || lower.includes('havalimani')) return 'night';
    if (lower.includes('rapor')) return 'leave';
    if (lower.includes('arız') || lower.includes('ariz')) return 'breakdown';
    return 'morning';
  }

  const handleTextChange = (val: string) => {
    setText(val);
    const inferred = inferType(val);
    if (inferred && type === 'morning') {
      setType(inferred);
    }
  };

  const handlePreset = (presetText: string, presetType: TripType) => {
    setText(presetText);
    setType(presetType);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (type === 'blocked') {
      onSave(row.id, column.id, {
        text: '',
        type: 'blocked',
      });
      onClose();
      return;
    }

    if (!text.trim()) {
      onClear(row.id, column.id);
      onClose();
      return;
    }

    onSave(row.id, column.id, {
      text: text.trim(),
      type,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-[4px] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-[2px] border border-blue-200 dark:border-blue-800">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-sm text-neutral-900 dark:text-white">
                  {row.plate}
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {row.driver || 'Sürücü Atanmamış'}
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Tarih: <strong className="text-neutral-700 dark:text-neutral-300">{column.date}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-[2px] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Sefer Güzergahı */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
              Sefer / Güzergah Bilgisi
            </label>
            <input
              type="text"
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder="Örn: ADANA AKŞAM, KAYSERİ SABAH, İSKENDERUN SABAH..."
              className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-[2px] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-blue-600 dark:focus:border-blue-400 transition-colors"
              autoFocus
            />
          </div>

          {/* Hızlı Şablonlar */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
              Hızlı Seçenekler / Renk Türü
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setType('morning')}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-[2px] border text-left flex items-center justify-between transition-all ${
                  type === 'morning'
                    ? 'bg-fuchsia-200 text-fuchsia-950 border-fuchsia-500 ring-1 ring-fuchsia-500'
                    : 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200 hover:bg-fuchsia-100'
                }`}
              >
                <span>Sabah Seferi</span>
                <span className="w-2.5 h-2.5 rounded-[2px] bg-fuchsia-400" />
              </button>

              <button
                type="button"
                onClick={() => setType('evening')}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-[2px] border text-left flex items-center justify-between transition-all ${
                  type === 'evening'
                    ? 'bg-yellow-200 text-yellow-950 border-yellow-500 ring-1 ring-yellow-500'
                    : 'bg-yellow-50 text-yellow-800 border-yellow-200 hover:bg-yellow-100'
                }`}
              >
                <span>Akşam Seferi</span>
                <span className="w-2.5 h-2.5 rounded-[2px] bg-yellow-400" />
              </button>

              <button
                type="button"
                onClick={() => setType('night')}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-[2px] border text-left flex items-center justify-between transition-all ${
                  type === 'night'
                    ? 'bg-sky-200 text-sky-950 border-sky-500 ring-1 ring-sky-500'
                    : 'bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100'
                }`}
              >
                <span>Gece Seferi</span>
                <span className="w-2.5 h-2.5 rounded-[2px] bg-sky-400" />
              </button>

              <button
                type="button"
                onClick={() => handlePreset('RAPORLU', 'leave')}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-[2px] border text-left flex items-center justify-between transition-all ${
                  type === 'leave'
                    ? 'bg-neutral-800 text-white border-neutral-900 ring-1 ring-neutral-400'
                    : 'bg-neutral-700 text-neutral-200 border-neutral-600 hover:bg-neutral-800 hover:text-white'
                }`}
              >
                <span>RAPORLU</span>
                <span className="w-2.5 h-2.5 rounded-[2px] bg-neutral-400" />
              </button>

              <button
                type="button"
                onClick={() => handlePreset('ARIZALI', 'breakdown')}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-[2px] border text-left flex items-center justify-between transition-all ${
                  type === 'breakdown'
                    ? 'bg-neutral-800 text-white border-neutral-900 ring-1 ring-neutral-400'
                    : 'bg-neutral-700 text-neutral-200 border-neutral-600 hover:bg-neutral-800 hover:text-white'
                }`}
              >
                <span>ARIZALI</span>
                <span className="w-2.5 h-2.5 rounded-[2px] bg-neutral-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setText('');
                  setType('blocked');
                }}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-[2px] border text-left flex items-center justify-between transition-all ${
                  type === 'blocked'
                    ? 'bg-black text-neutral-300 border-neutral-500 ring-1 ring-neutral-500'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-black'
                }`}
              >
                <span>Sefer Dışı (Bloke)</span>
                <span className="w-2.5 h-2.5 rounded-[2px] bg-neutral-900 border border-neutral-700" />
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-3 border-t border-neutral-100 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => {
                onClear(row.id, column.id);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-[2px] transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Seferi Temizle
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-[2px] transition-colors"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-[2px] shadow-xs transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                Kaydet
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

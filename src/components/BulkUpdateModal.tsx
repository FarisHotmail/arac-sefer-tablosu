import React, { useState, useMemo } from 'react';
import {
  ClipboardPaste,
  Copy,
  Check,
  X,
  AlertTriangle,
  FileSpreadsheet,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { BoardColumn, DispatchBoardData, TripCell, TripType, VehicleRow } from '../types';

interface BulkUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBoard: DispatchBoardData;
  onApplyBulkUpdate: (updatedBoard: DispatchBoardData) => Promise<void>;
}

function normalizePlate(val: string): string {
  return (val || '').replace(/\s+/g, '').toUpperCase().trim();
}

function inferTripType(val: string): TripType {
  const lower = (val || '').toLocaleLowerCase('tr-TR').trim();
  if (!lower) return 'morning';
  if (lower === 'bloke' || lower === 'sefer dışı' || lower === 'sefer disi' || lower === 'x' || lower === '█') {
    return 'blocked';
  }
  if (lower.includes('rapor')) return 'leave';
  if (lower.includes('arız') || lower.includes('ariz')) return 'breakdown';
  if (lower.includes('gece') || lower.includes('havalimanı') || lower.includes('havalimani')) return 'night';
  if (lower.includes('akşam') || lower.includes('aksam')) return 'evening';
  if (lower.includes('sabah')) return 'morning';
  return 'morning';
}

function inferNoteAlert(noteText: string): boolean {
  const lower = (noteText || '').toLocaleLowerCase('tr-TR');
  const keywords = [
    'bakım',
    'bakim',
    'usta',
    'lastik',
    'kırık',
    'kirik',
    'arız',
    'ariz',
    'yağ',
    'yag',
    'fren',
    'debriyaj',
    'kontrol',
    'acil',
    'raporlu',
    'değiş',
  ];
  return keywords.some((kw) => lower.includes(kw));
}

function parseTSV(raw: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const next = raw[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"' && currentCell === '') {
        inQuotes = true;
      } else if (ch === '\t') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (ch === '\r' && next === '\n') {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += ch;
      }
    }
  }

  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  return rows.filter((r) => r.some((c) => c !== ''));
}

function extractDateFromHeader(headerCell: string): string | null {
  const match = headerCell.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/);
  if (match) {
    return match[1].replace(/[/-]/g, '.');
  }
  return null;
}

export function exportBoardToTSV(board: DispatchBoardData): string {
  const headers = ['PLAKA', 'SÜRÜCÜ', ...board.columns.map((c) => c.date), 'NOT'];
  const lines = [headers.join('\t')];

  for (const row of board.rows) {
    const tripCols = board.columns.map((col) => {
      const trip = row.trips?.[col.id];
      if (!trip) return '';
      if (trip.type === 'blocked') return 'BLOKE';
      return (trip.text || '').replace(/[\t\r\n]+/g, ' ');
    });
    const noteClean = (row.notes || '').replace(/[\t\r\n]+/g, ' ');
    lines.push([row.plate, row.driver || '', ...tripCols, noteClean].join('\t'));
  }

  return lines.join('\n');
}

interface ParsedSummary {
  updatedBoard: DispatchBoardData;
  vehicleCount: number;
  tripCellCount: number;
  noteCount: number;
  detectedDates: string[];
  oldestDroppedDates: string[];
  isValid: boolean;
  errorMsg?: string;
}

export function parsePastedTableIntoBoard(
  rawText: string,
  currentBoard: DispatchBoardData
): ParsedSummary {
  if (!rawText.trim()) {
    return {
      updatedBoard: currentBoard,
      vehicleCount: 0,
      tripCellCount: 0,
      noteCount: 0,
      detectedDates: [],
      oldestDroppedDates: [],
      isValid: false,
    };
  }

  let grid = parseTSV(rawText);
  // Support semicolon-separated CSV if tabs aren't present
  if (grid.length > 0 && grid.every((r) => r.length === 1) && rawText.includes(';')) {
    grid = rawText
      .split(/\r?\n/)
      .map((line) => line.split(';').map((c) => c.trim()))
      .filter((r) => r.some((c) => c !== ''));
  }

  if (grid.length === 0) {
    return {
      updatedBoard: currentBoard,
      vehicleCount: 0,
      tripCellCount: 0,
      noteCount: 0,
      detectedDates: [],
      oldestDroppedDates: [],
      isValid: false,
      errorMsg: 'Yapıştırılan veride geçerli tablo satırı bulunamadı.',
    };
  }

  // Detect if first row is header
  const firstRowUpper = grid[0].map((c) => c.toLocaleUpperCase('tr-TR'));
  const hasExplicitHeader =
    firstRowUpper.some((c) => c.includes('PLAKA')) ||
    firstRowUpper.some((c) => c.includes('SÜRÜCÜ') || c.includes('SURUCU') || c.includes('ŞOFÖR')) ||
    grid[0].some((c) => extractDateFromHeader(c) !== null);

  let katColIdx = -1;
  let plateColIdx = -1;
  let driverColIdx = -1;
  let noteColIdx = -1;
  const dateColIndices: { colIdx: number; dateStr: string }[] = [];

  let dataStartRow = 0;

  if (hasExplicitHeader) {
    dataStartRow = 1;
    const headerRow = grid[0];
    headerRow.forEach((cell, idx) => {
      const upper = cell.toLocaleUpperCase('tr-TR').trim();
      const extractedDate = extractDateFromHeader(cell);
      if (upper === 'KAT' || upper === 'KATEGORİ') {
        katColIdx = idx;
      } else if (upper.includes('PLAKA')) {
        plateColIdx = idx;
      } else if (
        upper.includes('SÜRÜCÜ') ||
        upper.includes('SURUCU') ||
        upper.includes('ŞOFÖR') ||
        upper.includes('SOFOR')
      ) {
        driverColIdx = idx;
      } else if (upper === 'NOT' || upper === 'NOTLAR' || upper.includes('AÇIKLAMA')) {
        noteColIdx = idx;
      } else if (extractedDate) {
        dateColIndices.push({ colIdx: idx, dateStr: extractedDate });
      }
    });
  }

  // If no header or plateColIdx wasn't found in header, infer column positions from data rows
  if (plateColIdx === -1) {
    const sampleRow = grid[dataStartRow] || grid[0];
    if (!sampleRow || sampleRow.length < 2) {
      return {
        updatedBoard: currentBoard,
        vehicleCount: 0,
        tripCellCount: 0,
        noteCount: 0,
        detectedDates: [],
        oldestDroppedDates: [],
        isValid: false,
        errorMsg:
          'Lütfen Excel veya E-Tablolar üzerinden Plaka ve Sefer sütunlarını içeren tabloyu kopyalayıp yapıştırın.',
      };
    }

    const col0 = normalizePlate(sampleRow[0]);
    const col1 = normalizePlate(sampleRow[1] || '');
    const plateRegex = /^\d{2}[A-Z]{1,3}\d{2,5}$/;

    if ((col0.length <= 2 || col0 === 'K') && plateRegex.test(col1)) {
      katColIdx = 0;
      plateColIdx = 1;
      driverColIdx = sampleRow.length > 2 ? 2 : -1;
    } else {
      plateColIdx = 0;
      driverColIdx = sampleRow.length > 1 ? 1 : -1;
    }

    const startTripIdx = (driverColIdx !== -1 ? driverColIdx : plateColIdx) + 1;
    const maxColsInGrid = Math.max(...grid.slice(dataStartRow).map((r) => r.length), 0);
    const remainingCount = maxColsInGrid - startTripIdx;

    if (remainingCount > 0 && dateColIndices.length === 0) {
      // If user pasted without headers, map date columns using current board dates (or sequential labels) up to 7
      const boardColsCount = currentBoard.columns.length;
      if (boardColsCount > 0 && remainingCount > boardColsCount && remainingCount === boardColsCount + 1) {
        // Last column is likely NOT
        for (let i = 0; i < boardColsCount; i++) {
          dateColIndices.push({
            colIdx: startTripIdx + i,
            dateStr: currentBoard.columns[i].date,
          });
        }
        noteColIdx = startTripIdx + boardColsCount;
      } else {
        const tripColsToMap = Math.min(remainingCount, 7);
        for (let i = 0; i < tripColsToMap; i++) {
          const fallbackDate = currentBoard.columns[i]?.date || `Gün ${i + 1}`;
          dateColIndices.push({
            colIdx: startTripIdx + i,
            dateStr: fallbackDate,
          });
        }
        if (remainingCount > 7) {
          noteColIdx = startTripIdx + 7;
        }
      }
    }
  } else if (hasExplicitHeader && dateColIndices.length === 0) {
    // Explicit header existed (e.g. PLAKA | SÜRÜCÜ | PAZARTESİ) without DD.MM.YYYY
    const headerRow = grid[0];
    headerRow.forEach((cell, idx) => {
      if (
        idx !== katColIdx &&
        idx !== plateColIdx &&
        idx !== driverColIdx &&
        idx !== noteColIdx &&
        cell.trim() !== ''
      ) {
        dateColIndices.push({ colIdx: idx, dateStr: cell.trim() });
      }
    });
  }

  // Build completely fresh columns ONLY from the pasted data (max 7 days)
  const oldestDroppedDates: string[] = [];
  const uniqueDates: string[] = [];
  const seenDateSet = new Set<string>();

  for (const dInfo of dateColIndices) {
    if (!seenDateSet.has(dInfo.dateStr)) {
      seenDateSet.add(dInfo.dateStr);
      uniqueDates.push(dInfo.dateStr);
    }
  }

  while (uniqueDates.length > 7) {
    const dropped = uniqueDates.shift();
    if (dropped) {
      oldestDroppedDates.push(dropped);
    }
  }

  const freshColumns: BoardColumn[] = uniqueDates.map((dateStr, idx) => ({
    id: `col_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
    date: dateStr,
    order: idx,
    isCustom: true,
  }));

  const dateToColId = new Map<string, string>();
  freshColumns.forEach((c) => dateToColId.set(c.date, c.id));

  // Build completely fresh rows ONLY from the pasted data (old rows are completely deleted, duplicates merged by plate)
  const freshRows: VehicleRow[] = [];
  const plateToRowIdx = new Map<string, number>();

  let tripCellCount = 0;
  let noteCount = 0;

  for (let rIdx = dataStartRow; rIdx < grid.length; rIdx++) {
    const cells = grid[rIdx];
    const rawPlate = cells[plateColIdx] || '';
    const normPlate = normalizePlate(rawPlate);

    // Skip empty lines, repeated header lines, or summary lines
    if (
      !normPlate ||
      normPlate === 'PLAKA' ||
      normPlate.includes('TOPLAM') ||
      normPlate === '-'
    ) {
      continue;
    }

    const driverVal =
      driverColIdx !== -1 && cells[driverColIdx] !== undefined
        ? cells[driverColIdx].trim()
        : '';
    const rawNote =
      noteColIdx !== -1 && cells[noteColIdx] !== undefined
        ? cells[noteColIdx].trim()
        : '';
    const cleanNote = rawNote === '-' ? '' : rawNote;
    const categoryVal =
      katColIdx !== -1 && cells[katColIdx] !== undefined && cells[katColIdx].trim()
        ? cells[katColIdx].trim()
        : '18';

    let rowObj: VehicleRow;
    const existingIdx = plateToRowIdx.get(normPlate);

    if (existingIdx !== undefined) {
      // Prevent duplicate rows if the pasted Excel itself has the same plate twice
      rowObj = freshRows[existingIdx];
      if (driverVal) rowObj.driver = driverVal;
      if (cleanNote) {
        if (!rowObj.notes) noteCount++;
        rowObj.notes = cleanNote;
        rowObj.notesAlert = inferNoteAlert(cleanNote);
      }
    } else {
      rowObj = {
        id: `row_${normPlate}_${rIdx}`,
        category: categoryVal,
        plate: normPlate,
        driver: driverVal === '-' ? '' : driverVal,
        notes: cleanNote,
        notesAlert: cleanNote ? inferNoteAlert(cleanNote) : false,
        trips: {},
      };
      if (cleanNote) noteCount++;
      freshRows.push(rowObj);
      plateToRowIdx.set(normPlate, freshRows.length - 1);
    }

    for (const dInfo of dateColIndices) {
      const colId = dateToColId.get(dInfo.dateStr);
      if (!colId) continue;

      const rawCellVal = cells[dInfo.colIdx] !== undefined ? cells[dInfo.colIdx].trim() : '';
      if (!rawCellVal || rawCellVal === '-') continue;

      const inferredType = inferTripType(rawCellVal);
      const newTrip: TripCell =
        inferredType === 'blocked'
          ? { text: '', type: 'blocked' }
          : { text: rawCellVal, type: inferredType };

      if (!rowObj.trips[colId]) {
        tripCellCount++;
      }
      rowObj.trips[colId] = newTrip;
    }
  }

  if (freshRows.length === 0) {
    return {
      updatedBoard: currentBoard,
      vehicleCount: 0,
      tripCellCount: 0,
      noteCount: 0,
      detectedDates: uniqueDates,
      oldestDroppedDates,
      isValid: false,
      errorMsg: 'Geçerli hiçbir araç satırı tespit edilemedi. İlk sütunun PLAKA olduğundan emin olun.',
    };
  }

  return {
    updatedBoard: {
      ...currentBoard,
      columns: freshColumns,
      rows: freshRows,
      updatedAt: new Date().toISOString(),
    },
    vehicleCount: freshRows.length,
    tripCellCount,
    noteCount,
    detectedDates: uniqueDates,
    oldestDroppedDates,
    isValid: true,
  };
}

export const BulkUpdateModal: React.FC<BulkUpdateModalProps> = ({
  isOpen,
  onClose,
  currentBoard,
  onApplyBulkUpdate,
}) => {
  const [pasteText, setPasteText] = useState('');
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const preview = useMemo(
    () => parsePastedTableIntoBoard(pasteText, currentBoard),
    [pasteText, currentBoard]
  );

  if (!isOpen) return null;

  const handleCopyCurrentTable = async () => {
    const tsv = exportBoardToTSV(currentBoard);
    try {
      await navigator.clipboard.writeText(tsv);
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 2500);
    } catch {
      setPasteText(tsv);
    }
  };

  const handleLoadCurrentIntoEditor = () => {
    setPasteText(exportBoardToTSV(currentBoard));
  };

  const handleApply = async () => {
    if (!preview.isValid) return;
    setIsApplying(true);
    try {
      await onApplyBulkUpdate(preview.updatedBoard);
      setPasteText('');
      onClose();
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4">
      <div className="w-full max-w-3xl bg-white border border-neutral-300 rounded-[4px] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-200 bg-neutral-50">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-50 text-blue-700 rounded-[2px] border border-blue-200">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-neutral-900 text-sm tracking-tight">
                Toplu Tablo Yapıştır (Eski Verileri Sil & Yenisini Yaz)
              </h3>
              <p className="text-xs text-neutral-500">
                Uygulandığında tablodaki mevcut tüm eski veriler silinir ve yerine yalnızca yapıştırdığınız tablo yazılır
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-700 rounded-[2px] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Top Helper Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-neutral-50 border border-neutral-200 p-2.5 rounded-[2px]">
            <div className="text-xs text-neutral-600">
              <span className="font-semibold text-neutral-800">İpucu:</span> Mevcut tabloyu kopyalayıp Excel&apos;de düzenledikten sonra buraya yapıştırabilirsiniz.
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadCurrentIntoEditor}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-[2px] transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3 text-neutral-500" />
                Mevcut Tabloyu Alana Getir
              </button>
              <button
                type="button"
                onClick={handleCopyCurrentTable}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-[2px] transition-colors cursor-pointer"
              >
                {copiedSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Panoya Kopyalandı!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Mevcut Tabloyu Kopyala</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Paste Textarea */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
                <ClipboardPaste className="w-3.5 h-3.5 text-blue-600" />
                Yeni Tablo Verisini Buraya Yapıştırın (CTRL + V)
              </label>
              {pasteText && (
                <button
                  type="button"
                  onClick={() => setPasteText('')}
                  className="text-[11px] text-red-600 hover:underline font-medium"
                >
                  Alanı Temizle
                </button>
              )}
            </div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={9}
              placeholder={
                'PLAKA\tSÜRÜCÜ\t12.10.2026\t13.10.2026\t14.10.2026\tNOT\n01ASB081\tHASAN GÜNGÖR\t\tHAVALİMANI GECE + ADANA AKŞAM\t\t\n35CJH035\tHALİL OZAR\tADANA AKŞAM\tTARSUS-MEZİTLİ AKŞAM\t\t'
              }
              className="w-full p-3 text-xs font-mono bg-neutral-50 border border-neutral-300 rounded-[2px] text-neutral-900 focus:outline-none focus:border-blue-600 focus:bg-white transition-colors whitespace-pre overflow-x-auto"
              autoFocus
            />
          </div>

          {/* Info */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
            <span className="text-[11px] text-neutral-500 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              Sabah / Akşam / Gece / Raporlu / Arızalı renkleri metinden otomatik algılanır.
            </span>
            <span className="text-[11px] text-amber-700 font-medium">
              * Eski tablodaki tüm satır ve sütunlar silinip yerine bu veriler yazılır (mükerrer kayıt oluşmaz).
            </span>
          </div>

          {/* Live Validation & Preview Summary */}
          {pasteText.trim() !== '' && (
            <div
              className={`p-3 rounded-[2px] border text-xs ${
                preview.isValid
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              {!preview.isValid ? (
                <div className="flex items-center gap-2 font-medium text-red-700">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{preview.errorMsg || 'Tablo formatı çözümlenemedi.'}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-bold text-emerald-800">Yeni Tablo Önizlemesi:</span>
                    <span>
                      Toplam Araç Satırı: <strong>{preview.vehicleCount}</strong>
                    </span>
                    <span>
                      Dolu Sefer Hücresi: <strong>{preview.tripCellCount}</strong>
                    </span>
                    <span>
                      Not Sayısı: <strong>{preview.noteCount}</strong>
                    </span>
                    {preview.detectedDates.length > 0 && (
                      <span>
                        Tarih Sütunları:{' '}
                        <strong className="font-mono">{preview.detectedDates.join(', ')}</strong>
                      </span>
                    )}
                  </div>

                  {preview.oldestDroppedDates.length > 0 && (
                    <div className="flex items-center gap-1.5 text-amber-800 bg-amber-100/80 border border-amber-300 px-2.5 py-1.5 rounded-[2px]">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-700" />
                      <span>
                        Maksimum 7 tarih sütunu kuralı gereği en eski tarih olan{' '}
                        <strong className="font-mono">{preview.oldestDroppedDates.join(', ')}</strong> dahil edilmeyecektir.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-neutral-200 bg-neutral-50">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200/70 rounded-[2px] transition-colors"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={!preview.isValid || isApplying}
            onClick={handleApply}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-[2px] shadow-xs transition-colors cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isApplying ? 'Yazılıyor...' : 'Eskileri Sil ve Yeni Tabloyu Yaz'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

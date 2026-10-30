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

/**
 * Parses TSV copied from Excel / Google Sheets.
 * Supports multiline cells wrapped in quotes AND trailing empty tab columns.
 */
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
        currentRow.push(currentCell.replace(/\s+/g, ' ').trim());
        currentCell = '';
      } else if (ch === '\r' && next === '\n') {
        currentRow.push(currentCell.replace(/\s+/g, ' ').trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        currentRow.push(currentCell.replace(/\s+/g, ' ').trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += ch;
      }
    }
  }

  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.replace(/\s+/g, ' ').trim());
    rows.push(currentRow);
  }

  return rows.filter((r) => r.some((c) => c !== ''));
}

function extractDateFromHeader(headerCell: string): string | null {
  if (!headerCell) return null;
  // Match DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  const fullMatch = headerCell.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/);
  if (fullMatch) {
    return fullMatch[1].replace(/[/-]/g, '.');
  }
  // Match DD.MM (e.g. 15.10 or 15/10)
  const shortMatch = headerCell.match(/\b(\d{1,2}[./]\d{1,2})\b/);
  if (shortMatch) {
    const year = new Date().getFullYear();
    return `${shortMatch[1].replace('/', '.')}.${year}`;
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

/**
 * Completely replaces the entire table (columns + rows + notes) with ONLY what is in rawText.
 * Does NOT read or retain ANY rows or columns from currentBoard.
 */
export function parsePastedTableIntoBoard(
  rawText: string,
  boardTitle: string
): ParsedSummary {
  const emptyBoard: DispatchBoardData = {
    title: boardTitle,
    columns: [],
    rows: [],
  };

  if (!rawText.trim()) {
    return {
      updatedBoard: emptyBoard,
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
      updatedBoard: emptyBoard,
      vehicleCount: 0,
      tripCellCount: 0,
      noteCount: 0,
      detectedDates: [],
      oldestDroppedDates: [],
      isValid: false,
      errorMsg: 'Yapıştırılan veride geçerli tablo satırı bulunamadı.',
    };
  }

  // Find header row within the first 3 rows (in case Excel has a top title row or merged "(Toplam : X)" row above headers)
  let headerRowIdx = -1;
  const searchLimit = Math.min(grid.length, 4);
  for (let i = 0; i < searchLimit; i++) {
    const rowUpper = grid[i].map((c) => c.toLocaleUpperCase('tr-TR'));
    const hasHeaderKeyword =
      rowUpper.some((c) => c.includes('PLAKA')) ||
      rowUpper.some((c) => c.includes('SÜRÜCÜ') || c.includes('SURUCU') || c.includes('ŞOFÖR')) ||
      grid[i].some((c) => extractDateFromHeader(c) !== null);
    if (hasHeaderKeyword) {
      headerRowIdx = i;
      // Prefer the row that explicitly has PLAKA if there's a summary row above it
      if (rowUpper.some((c) => c.includes('PLAKA'))) {
        break;
      }
    }
  }

  let katColIdx = -1;
  let plateColIdx = -1;
  let driverColIdx = -1;
  let noteColIdx = -1;
  const dateColIndices: { colIdx: number; dateStr: string }[] = [];

  let dataStartRow = 0;
  const plateRegex = /^\d{2}[A-Z]{1,3}\d{2,5}$/;

  if (headerRowIdx !== -1) {
    dataStartRow = headerRowIdx + 1;
    const headerRow = grid[headerRowIdx];
    // Also check if the row immediately above headerRowIdx had dates (common in Excel 2-row headers)
    const aboveRow = headerRowIdx > 0 ? grid[headerRowIdx - 1] : null;

    headerRow.forEach((cell, idx) => {
      const upper = cell.toLocaleUpperCase('tr-TR').trim();
      const extractedDate =
        extractDateFromHeader(cell) || (aboveRow ? extractDateFromHeader(aboveRow[idx] || '') : null);

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

    // If header existed (e.g., PLAKA | SÜRÜCÜ | ... | NOT) and there are columns between SÜRÜCÜ and NOT (or after SÜRÜCÜ) whose headers weren't dates
    const maxCols = Math.max(...grid.map((r) => r.length), 0);
    if (dateColIndices.length === 0) {
      const afterDriver = (driverColIdx !== -1 ? driverColIdx : plateColIdx) + 1;
      const beforeNote = noteColIdx !== -1 ? noteColIdx : maxCols;
      for (let idx = afterDriver; idx < beforeNote; idx++) {
        if (idx === katColIdx || idx === plateColIdx || idx === driverColIdx || idx === noteColIdx) continue;
        const headerLabel = (headerRow[idx] || (aboveRow ? aboveRow[idx] : '') || '').trim();
        // Check if any data row actually has content in this column or if headerLabel is non-empty
        const hasAnyData = grid.slice(dataStartRow).some((r) => (r[idx] || '').trim() !== '');
        if (headerLabel || hasAnyData) {
          dateColIndices.push({
            colIdx: idx,
            dateStr: headerLabel || `Tarih ${dateColIndices.length + 1}`,
          });
        }
      }
    }
  } else {
    // No header row pasted at all (raw data rows pasted directly from Excel selection)
    const sampleRows = grid.slice(0, 6);
    const maxCols = Math.max(...grid.map((r) => r.length), 0);

    if (maxCols === 0) {
      return {
        updatedBoard: emptyBoard,
        vehicleCount: 0,
        tripCellCount: 0,
        noteCount: 0,
        detectedDates: [],
        oldestDroppedDates: [],
        isValid: false,
        errorMsg: 'Tablo sütunları algılanamadı.',
      };
    }

    // Detect whether col 0 is KAT and col 1 is PLAKA, or col 0 is PLAKA
    const col0IsPlate = sampleRows.some((r) => plateRegex.test(normalizePlate(r[0] || '')));
    const col1IsPlate = sampleRows.some((r) => plateRegex.test(normalizePlate(r[1] || '')));

    if (!col0IsPlate && col1IsPlate) {
      katColIdx = 0;
      plateColIdx = 1;
      driverColIdx = maxCols > 2 ? 2 : -1;
    } else {
      plateColIdx = 0;
      driverColIdx = maxCols > 1 ? 1 : -1;
    }

    const startTripIdx = (driverColIdx !== -1 ? driverColIdx : plateColIdx) + 1;
    const remainingCols = maxCols - startTripIdx;

    if (remainingCols > 0) {
      // Generate clean date labels starting from today if user didn't copy the header row
      const base = new Date();
      // If more than 1 remaining col, check if last column looks like long vehicle maintenance notes
      let tripColsCount = remainingCols;
      if (remainingCols >= 2) {
        const lastColIdx = maxCols - 1;
        const looksLikeNotes = grid.some((r) => {
          const val = (r[lastColIdx] || '').toLocaleLowerCase('tr-TR');
          return val.length > 32 || inferNoteAlert(val);
        });
        if (looksLikeNotes) {
          noteColIdx = lastColIdx;
          tripColsCount = remainingCols - 1;
        }
      }

      for (let i = 0; i < tripColsCount; i++) {
        const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        dateColIndices.push({
          colIdx: startTripIdx + i,
          dateStr: `${dd}.${mm}.${yyyy}`,
        });
      }
    }
  }

  if (plateColIdx === -1) {
    plateColIdx = 0;
  }

  // Enforce max 7 date columns
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
    id: `col_${idx}_${dateStr.replace(/[^a-zA-Z0-9]/g, '_')}`,
    date: dateStr,
    order: idx,
    isCustom: true,
  }));

  const dateToColId = new Map<string, string>();
  freshColumns.forEach((c) => dateToColId.set(c.date, c.id));

  // Build completely fresh rows ONLY from the pasted grid (ZERO retention of old rows)
  const freshRows: VehicleRow[] = [];
  const plateToRowIdx = new Map<string, number>();

  let tripCellCount = 0;
  let noteCount = 0;

  for (let rIdx = dataStartRow; rIdx < grid.length; rIdx++) {
    const cells = grid[rIdx];
    const rawPlate = cells[plateColIdx] || '';
    const normPlate = normalizePlate(rawPlate);

    if (
      !normPlate ||
      normPlate === 'PLAKA' ||
      normPlate === 'KAT' ||
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
      rowObj = freshRows[existingIdx];
      if (driverVal && driverVal !== '-') rowObj.driver = driverVal;
      if (cleanNote) {
        if (!rowObj.notes) noteCount++;
        rowObj.notes = cleanNote;
        rowObj.notesAlert = inferNoteAlert(cleanNote);
      }
    } else {
      rowObj = {
        id: `row_${normPlate}`,
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
      updatedBoard: emptyBoard,
      vehicleCount: 0,
      tripCellCount: 0,
      noteCount: 0,
      detectedDates: uniqueDates,
      oldestDroppedDates,
      isValid: false,
      errorMsg: 'Geçerli hiçbir araç satırı tespit edilemedi. Plaka sütununun dahil olduğundan emin olun.',
    };
  }

  return {
    updatedBoard: {
      title: boardTitle,
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
    () => parsePastedTableIntoBoard(pasteText, currentBoard.title),
    [pasteText, currentBoard.title]
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
                Tabloyu Baştan Sona Yenile (Kopyala & Yapıştır)
              </h3>
              <p className="text-xs text-neutral-500">
                Mevcut tablodaki tüm eski satır, plaka, sürücü, tarih ve notlar silinir; sadece yapıştırdığınız yeni tablo oluşturulur
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
              <span className="font-semibold text-neutral-800">İpucu:</span> Excel&apos;den başlık satırıyla birlikte (PLAKA, SÜRÜCÜ, Tarihler, NOT) seçip yapıştırın.
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
            <span className="text-[11px] text-red-700 font-semibold">
              Eski verilerin tamamı silinir, yalnızca yapıştırdığınız veriler kalır.
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
                    <span className="font-bold text-emerald-800">Oluşturulacak Yeni Tablo:</span>
                    <span>
                      Araç Sayısı: <strong>{preview.vehicleCount}</strong>
                    </span>
                    <span>
                      Tarih Sütunu: <strong>{preview.detectedDates.length}</strong>
                    </span>
                    <span>
                      Dolu Sefer Hücresi: <strong>{preview.tripCellCount}</strong>
                    </span>
                    <span>
                      Not Sayısı: <strong>{preview.noteCount}</strong>
                    </span>
                  </div>
                  {preview.detectedDates.length > 0 && (
                    <div className="text-[11px] text-emerald-900">
                      Tarihler: <strong className="font-mono">{preview.detectedDates.join(' | ')}</strong>
                    </div>
                  )}

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
            <span>{isApplying ? 'Uygulanıyor...' : 'Eskileri Sil ve Tabloyu Baştan Yaz'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

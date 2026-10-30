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
  Info,
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
  matchedVehiclesCount: number;
  skippedUnknownPlatesCount: number;
  insertedTripsCount: number;
  insertedNotesCount: number;
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
      matchedVehiclesCount: 0,
      skippedUnknownPlatesCount: 0,
      insertedTripsCount: 0,
      insertedNotesCount: 0,
      detectedDates: [],
      oldestDroppedDates: [],
      isValid: false,
    };
  }

  let grid = parseTSV(rawText);
  // If user pasted semicolon-separated CSV without tabs
  if (grid.length > 0 && grid.every((r) => r.length === 1) && rawText.includes(';')) {
    grid = rawText
      .split(/\r?\n/)
      .map((line) => line.split(';').map((c) => c.trim()))
      .filter((r) => r.some((c) => c !== ''));
  }

  if (grid.length === 0) {
    return {
      updatedBoard: currentBoard,
      matchedVehiclesCount: 0,
      skippedUnknownPlatesCount: 0,
      insertedTripsCount: 0,
      insertedNotesCount: 0,
      detectedDates: [],
      oldestDroppedDates: [],
      isValid: false,
      errorMsg: 'Yapıştırılan veride geçerli tablo satırı bulunamadı.',
    };
  }

  // Known plates in currentBoard to help detect whether paste includes PLAKA column or starts at trips
  const knownPlates = new Set(currentBoard.rows.map((r) => normalizePlate(r.plate)));

  // Detect if first row is header
  const firstRowUpper = grid[0].map((c) => c.toLocaleUpperCase('tr-TR'));
  const hasExplicitHeader =
    firstRowUpper.some((c) => c.includes('PLAKA')) ||
    firstRowUpper.some((c) => c.includes('SÜRÜCÜ') || c.includes('SURUCU')) ||
    grid[0].some((c) => extractDateFromHeader(c) !== null);

  let plateColIdx = -1;
  let driverColIdx = -1;
  let noteColIdx = -1;
  const dateColIndices: { colIdx: number; dateStr: string }[] = [];

  let dataStartRow = 0;

  if (hasExplicitHeader) {
    dataStartRow = 1;
    const headerRow = grid[0];
    headerRow.forEach((cell, idx) => {
      const upper = cell.toLocaleUpperCase('tr-TR');
      const extractedDate = extractDateFromHeader(cell);
      if (upper === 'KAT' || upper === 'KATEGORİ') {
        // skip KAT column
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

  const plateRegex = /^\d{2}[A-Z]{1,3}\d{2,5}$/;

  // If plate column was not explicitly labeled in header, try finding which column contains known plates
  if (plateColIdx === -1) {
    const sampleRows = grid.slice(dataStartRow, dataStartRow + 8);
    if (sampleRows.length > 0) {
      // Check col 0 and col 1 for plate matches
      const col0MatchesPlate = sampleRows.some((r) => {
        const p = normalizePlate(r[0] || '');
        return knownPlates.has(p) || plateRegex.test(p);
      });
      const col1MatchesPlate = sampleRows.some((r) => {
        const p = normalizePlate(r[1] || '');
        return knownPlates.has(p) || plateRegex.test(p);
      });

      if (col0MatchesPlate) {
        plateColIdx = 0;
        // Check if col 1 is driver (matches existing driver names or non-trip text when more columns exist)
        const existingDrivers = new Set(
          currentBoard.rows.map((r) => (r.driver || '').toLocaleUpperCase('tr-TR').trim()).filter(Boolean)
        );
        const col1MatchesDriver = sampleRows.some((r) =>
          existingDrivers.has((r[1] || '').toLocaleUpperCase('tr-TR').trim())
        );
        if (col1MatchesDriver) {
          driverColIdx = 1;
        }
      } else if (col1MatchesPlate) {
        plateColIdx = 1;
        const existingDrivers = new Set(
          currentBoard.rows.map((r) => (r.driver || '').toLocaleUpperCase('tr-TR').trim()).filter(Boolean)
        );
        const col2MatchesDriver = sampleRows.some((r) =>
          existingDrivers.has((r[2] || '').toLocaleUpperCase('tr-TR').trim())
        );
        if (col2MatchesDriver) {
          driverColIdx = 2;
        }
      }
    }
  }

  // Determine date columns if not already extracted from explicit date headers
  if (dateColIndices.length === 0) {
    if (hasExplicitHeader) {
      const headerRow = grid[0];
      headerRow.forEach((cell, idx) => {
        if (idx !== plateColIdx && idx !== driverColIdx && idx !== noteColIdx) {
          const upper = cell.toLocaleUpperCase('tr-TR');
          if (upper !== 'KAT' && upper !== 'KATEGORİ' && cell !== '') {
            const seqIdx = dateColIndices.length;
            const fallbackDate = currentBoard.columns[seqIdx]?.date || cell;
            dateColIndices.push({ colIdx: idx, dateStr: fallbackDate });
          }
        }
      });
    } else {
      // No header row at all: map columns after plate/driver (or from 0 if positional paste without plates)
      const startTripIdx =
        plateColIdx !== -1 ? Math.max(plateColIdx, driverColIdx) + 1 : 0;
      const maxColsInGrid = Math.max(...grid.slice(dataStartRow).map((r) => r.length), 0);
      const remainingCount = maxColsInGrid - startTripIdx;

      if (remainingCount > 0) {
        const boardColsCount = currentBoard.columns.length;
        const tripColsToMap = Math.min(remainingCount, Math.max(boardColsCount, 1));
        for (let i = 0; i < tripColsToMap; i++) {
          const fallbackDate =
            currentBoard.columns[i]?.date ||
            new Date().toLocaleDateString('tr-TR');
          dateColIndices.push({
            colIdx: startTripIdx + i,
            dateStr: fallbackDate,
          });
        }
        if (boardColsCount > 0 && remainingCount > boardColsCount && noteColIdx === -1) {
          noteColIdx = startTripIdx + boardColsCount;
        }
      }
    }
  }

  if (dateColIndices.length === 0 && noteColIdx === -1) {
    return {
      updatedBoard: currentBoard,
      matchedVehiclesCount: 0,
      skippedUnknownPlatesCount: 0,
      insertedTripsCount: 0,
      insertedNotesCount: 0,
      detectedDates: [],
      oldestDroppedDates: [],
      isValid: false,
      errorMsg: 'Yapıştırılan veride güncellenecek tarih/sefer veya not sütunu tespit edilemedi.',
    };
  }

  // Replace columns cleanly with the pasted date columns (up to max 7 days)
  const oldestDroppedDates: string[] = [];
  let nextColumns: BoardColumn[];

  if (dateColIndices.length > 0) {
    // Deduplicate date strings while preserving order
    const uniqueDateInfos: { dateStr: string }[] = [];
    const seenDates = new Set<string>();
    for (const d of dateColIndices) {
      if (!seenDates.has(d.dateStr)) {
        seenDates.add(d.dateStr);
        uniqueDateInfos.push({ dateStr: d.dateStr });
      }
    }

    while (uniqueDateInfos.length > 7) {
      const dropped = uniqueDateInfos.shift();
      if (dropped) oldestDroppedDates.push(dropped.dateStr);
    }

    nextColumns = uniqueDateInfos.map((d, idx) => {
      const existing = currentBoard.columns.find((c) => c.date === d.dateStr);
      return {
        id: existing ? existing.id : `col_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 5)}`,
        date: d.dateStr,
        order: idx,
        isCustom: existing ? existing.isCustom : true,
      };
    });
  } else {
    // Only Note column was pasted; keep existing date columns structure, but all trips will still be cleared
    nextColumns = currentBoard.columns.map((c, idx) => ({ ...c, order: idx }));
  }

  const dateToColId = new Map<string, string>();
  nextColumns.forEach((c) => dateToColId.set(c.date, c.id));

  // CRITICAL REQUIREMENT:
  // 1) Clear ALL existing trips and notes across the entire table first.
  // 2) Keep PLAKA and SÜRÜCÜ strictly untouched (preserve exact rows, order, plate, and driver).
  const nextRows: VehicleRow[] = currentBoard.rows.map((r) => ({
    ...r,
    plate: r.plate, // strictly untouched
    driver: r.driver, // strictly untouched
    notes: '', // cleared
    notesAlert: false, // cleared
    trips: {}, // all existing trip cells cleared
  }));

  const plateToIndex = new Map<string, number>();
  nextRows.forEach((r, idx) => {
    plateToIndex.set(normalizePlate(r.plate), idx);
  });

  let matchedVehiclesCount = 0;
  let skippedUnknownPlatesCount = 0;
  let insertedTripsCount = 0;
  let insertedNotesCount = 0;

  for (let rIdx = dataStartRow; rIdx < grid.length; rIdx++) {
    const cells = grid[rIdx];
    let targetRowIdx: number | undefined;

    if (plateColIdx !== -1) {
      const rawPlate = cells[plateColIdx] || '';
      const normPlate = normalizePlate(rawPlate);
      if (!normPlate || normPlate === 'PLAKA' || normPlate.includes('TOPLAM')) continue;

      targetRowIdx = plateToIndex.get(normPlate);
      if (targetRowIdx === undefined) {
        // Do NOT add or modify Plaka/Sürücü rows; ignore unknown plates
        skippedUnknownPlatesCount++;
        continue;
      }
    } else {
      // Positional row mapping when user pastes only Date/Trip columns without Plaka column
      const posIdx = rIdx - dataStartRow;
      if (posIdx >= nextRows.length) continue;
      targetRowIdx = posIdx;
    }

    matchedVehiclesCount++;
    const rowObj = nextRows[targetRowIdx];

    // Apply pasted Notes (if Note column exists in paste)
    if (noteColIdx !== -1 && cells[noteColIdx] !== undefined) {
      const incomingNote = cells[noteColIdx].trim();
      if (incomingNote && incomingNote !== '-') {
        rowObj.notes = incomingNote;
        rowObj.notesAlert = inferNoteAlert(incomingNote);
        insertedNotesCount++;
      }
    }

    // Apply pasted Trips
    for (const dInfo of dateColIndices) {
      const colId = dateToColId.get(dInfo.dateStr);
      if (!colId) continue;

      const rawCellVal = cells[dInfo.colIdx] !== undefined ? cells[dInfo.colIdx].trim() : '';
      if (!rawCellVal || rawCellVal === '-') {
        continue;
      }

      const inferredType = inferTripType(rawCellVal);
      const newTrip: TripCell =
        inferredType === 'blocked'
          ? { text: '', type: 'blocked' }
          : { text: rawCellVal, type: inferredType };

      rowObj.trips[colId] = newTrip;
      insertedTripsCount++;
    }
  }

  if (matchedVehiclesCount === 0) {
    return {
      updatedBoard: currentBoard,
      matchedVehiclesCount: 0,
      skippedUnknownPlatesCount,
      insertedTripsCount: 0,
      insertedNotesCount: 0,
      detectedDates: nextColumns.map((c) => c.date),
      oldestDroppedDates,
      isValid: false,
      errorMsg:
        'Yapıştırılan veride tablodaki plakalarla eşleşen hiçbir satır bulunamadı.',
    };
  }

  return {
    updatedBoard: {
      ...currentBoard,
      columns: nextColumns,
      rows: nextRows,
    },
    matchedVehiclesCount,
    skippedUnknownPlatesCount,
    insertedTripsCount,
    insertedNotesCount,
    detectedDates: nextColumns.map((c) => c.date),
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
                Toplu Tablo Güncelleme (Temizle & Yeniden Yaz)
              </h3>
              <p className="text-xs text-neutral-500">
                Mevcut sefer/not verileri tamamen temizlenir, Plaka ve Sürücü sütunlarına dokunulmadan yeni veriler eklenir
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
            <div className="flex items-center gap-1.5 text-xs text-neutral-700">
              <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>
                <strong>Plaka</strong> ve <strong>Sürücü</strong> sütunları sabit korunur; yalnızca tarih/sefer ve not verileri sıfırlanıp yenilenir.
              </span>
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
                Kopyalanan Tablo Verisini Buraya Yapıştırın (CTRL + V)
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

          {/* Info Note */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <span className="text-[11px] text-neutral-500 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              Sabah / Akşam / Gece / Raporlu / Arızalı renkleri metinden otomatik algılanır.
            </span>
            <span className="text-[11px] text-neutral-500">
              Maksimum 7 tarih sütunu desteklenir.
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
                    <span className="font-bold text-emerald-800">Önizleme Özeti:</span>
                    <span>
                      Eşleşen Araç: <strong>{preview.matchedVehiclesCount}</strong>
                    </span>
                    <span>
                      Yazılacak Sefer Hücresi: <strong>{preview.insertedTripsCount}</strong>
                    </span>
                    <span>
                      Yazılacak Not: <strong>{preview.insertedNotesCount}</strong>
                    </span>
                    {preview.detectedDates.length > 0 && (
                      <span>
                        Yeni Tarih Sütunları:{' '}
                        <strong className="font-mono">{preview.detectedDates.join(', ')}</strong>
                      </span>
                    )}
                  </div>

                  {preview.skippedUnknownPlatesCount > 0 && (
                    <div className="text-[11px] text-neutral-600">
                      * Tabloda kayıtlı olmayan <strong>{preview.skippedUnknownPlatesCount}</strong> yabancı plaka satırı (Plaka/Sürücü listesi korunduğu için) atlandı.
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
            <span>{isApplying ? 'Temizlenip Yazılıyor...' : 'Tabloyu Temizle ve Güncelle'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

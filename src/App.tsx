/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  CalendarPlus,
  Cloud,
  CloudOff,
  RefreshCw,
  Trash2,
  Truck,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import {
  saveBoardToFirestore,
  subscribeToBoard,
  getLocalBoard,
  testConnection,
} from './firebase';
import { BoardColumn, DispatchBoardData, TripCell, VehicleRow } from './types';
import { INITIAL_BOARD } from './initialData';
import { TripCellView } from './components/TripCellView';
import { AddColumnModal } from './components/AddColumnModal';
import { EditCellModal } from './components/EditCellModal';
import { DeleteColumnModal } from './components/DeleteColumnModal';
import { EditNoteModal } from './components/EditNoteModal';

export default function App() {
  const [board, setBoard] = useState<DispatchBoardData>(getLocalBoard() || INITIAL_BOARD);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Senkronize');

  // Modal states
  const [isAddColOpen, setIsAddColOpen] = useState(false);
  const [deleteColTarget, setDeleteColTarget] = useState<BoardColumn | null>(null);

  // Cell editor states
  const [editingCell, setEditingCell] = useState<{
    row: VehicleRow;
    col: BoardColumn;
  } | null>(null);

  // Note editor states
  const [editingNoteRow, setEditingNoteRow] = useState<VehicleRow | null>(null);

  // Active date focus for mobile screen navigation
  const [mobileActiveColId, setMobileActiveColId] = useState<string>('all');

  // Test connection & subscribe to real-time changes
  useEffect(() => {
    testConnection().then((connected) => {
      setIsOnline(connected);
    });

    const unsubBoard = subscribeToBoard(
      (updatedBoard) => {
        setBoard(updatedBoard);
        setIsOnline(true);
        setLastSyncTime(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
      },
      () => {
        // Fallback to local
        setIsOnline(false);
      }
    );

    return () => {
      unsubBoard();
    };
  }, []);

  // Compute dynamic trip count for a specific date column
  const getColumnTripCount = (colId: string): number => {
    return board.rows.reduce((count, row) => {
      const trip = row.trips?.[colId];
      if (trip && trip.text && trip.type !== 'leave' && trip.type !== 'breakdown' && trip.type !== 'blocked') {
        return count + 1;
      }
      return count;
    }, 0);
  };

  // Save changes to state & Firestore directly
  const persistChanges = async (newBoard: DispatchBoardData) => {
    setBoard(newBoard);
    setIsSyncing(true);
    try {
      await saveBoardToFirestore(newBoard);
      setLastSyncTime(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
    } catch {
      // Local storage handled inside saveBoardToFirestore
    } finally {
      setIsSyncing(false);
    }
  };

  // Add column (with optional removal of oldest column to maintain 3 max limit)
  const handleAddColumn = async (newCol: BoardColumn, columnToRemove?: BoardColumn) => {
    let updatedColumns = [...board.columns];
    let updatedRows = [...board.rows];

    if (columnToRemove) {
      updatedColumns = updatedColumns.filter((c) => c.id !== columnToRemove.id);
      updatedRows = updatedRows.map((row) => {
        const newTrips = { ...row.trips };
        delete newTrips[columnToRemove.id];
        return {
          ...row,
          trips: newTrips,
        };
      });
    }

    updatedColumns = [...updatedColumns, newCol];

    const updatedBoard: DispatchBoardData = {
      ...board,
      columns: updatedColumns,
      rows: updatedRows,
    };
    await persistChanges(updatedBoard);

    if (columnToRemove && mobileActiveColId === columnToRemove.id) {
      setMobileActiveColId(newCol.id);
    }
  };

  // Delete column
  const handleDeleteColumn = async (columnId: string) => {
    const updatedColumns = board.columns.filter((c) => c.id !== columnId);
    const updatedRows = board.rows.map((row) => {
      const newTrips = { ...row.trips };
      delete newTrips[columnId];
      return {
        ...row,
        trips: newTrips,
      };
    });

    const updatedBoard: DispatchBoardData = {
      ...board,
      columns: updatedColumns,
      rows: updatedRows,
    };
    await persistChanges(updatedBoard);
    if (mobileActiveColId === columnId) {
      setMobileActiveColId('all');
    }
  };

  // Save cell trip
  const handleSaveTrip = async (rowId: string, columnId: string, trip: TripCell) => {
    const updatedRows = board.rows.map((r) => {
      if (r.id === rowId) {
        return {
          ...r,
          trips: {
            ...r.trips,
            [columnId]: trip,
          },
        };
      }
      return r;
    });

    const updatedBoard: DispatchBoardData = {
      ...board,
      rows: updatedRows,
    };
    await persistChanges(updatedBoard);
  };

  // Clear cell trip
  const handleClearTrip = async (rowId: string, columnId: string) => {
    const updatedRows = board.rows.map((r) => {
      if (r.id === rowId) {
        const newTrips = { ...r.trips };
        delete newTrips[columnId];
        return {
          ...r,
          trips: newTrips,
        };
      }
      return r;
    });

    const updatedBoard: DispatchBoardData = {
      ...board,
      rows: updatedRows,
    };
    await persistChanges(updatedBoard);
  };

  // Save note
  const handleSaveNote = async (rowId: string, notes: string, isAlert: boolean) => {
    const updatedRows = board.rows.map((r) => {
      if (r.id === rowId) {
        return {
          ...r,
          notes,
          notesAlert: isAlert,
        };
      }
      return r;
    });

    const updatedBoard: DispatchBoardData = {
      ...board,
      rows: updatedRows,
    };
    await persistChanges(updatedBoard);
  };

  // Reset to initial spreadsheet template if needed
  const handleResetToDefault = async () => {
    if (window.confirm('Tabloyu orijinal şablon verilerine sıfırlamak istediğinize emin misiniz?')) {
      await persistChanges(INITIAL_BOARD);
    }
  };

  // Filter columns to display based on mobile picker
  const displayedColumns = useMemo(() => {
    if (mobileActiveColId === 'all') return board.columns;
    return board.columns.filter((c) => c.id === mobileActiveColId);
  }, [board.columns, mobileActiveColId]);

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 flex flex-col font-sans">
      {/* Top Application Bar */}
      <header className="bg-white border-b border-neutral-300 sticky top-0 z-40 shadow-xs">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Title */}
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-700 text-white rounded-[2px] shadow-xs">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-neutral-900 leading-tight">
                  Araç Sefer ve Dağıtım Tablosu
                </h1>
                <span className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold bg-neutral-200 text-neutral-700 rounded-[2px] uppercase tracking-wider">
                  {board.rows.length} Araç
                </span>
              </div>
              <p className="text-xs text-neutral-500 leading-none">
                Günlük güzergah ve lojistik araç takip paneli
              </p>
            </div>
          </div>

          {/* Center: Trip Color Legend */}
          <div className="hidden xl:flex items-center gap-2 text-xs bg-neutral-50 px-3 py-1.5 rounded-[2px] border border-neutral-200">
            <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mr-1">
              Sefer Türleri:
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-[#f48fb1] text-neutral-900 font-medium text-[11px] border border-pink-300">
              Sabah Seferi
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-[#fff176] text-neutral-900 font-medium text-[11px] border border-yellow-300">
              Akşam Seferi
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-[#29b6f6] text-neutral-900 font-medium text-[11px] border border-sky-300">
              Gece Seferi
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-[#424242] text-white font-medium text-[11px] border border-neutral-700">
              Raporlu / Arızalı
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-black text-white font-medium text-[11px] border border-neutral-800">
              Bloke
            </span>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {/* Sync Status Badge */}
            <div
              className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-[2px] border bg-neutral-50 text-neutral-600 border-neutral-200"
              title="Firebase Gerçek Zamanlı Veritabanı Durumu"
            >
              {isSyncing ? (
                <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
              ) : isOnline ? (
                <Cloud className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <CloudOff className="w-3.5 h-3.5 text-amber-600" />
              )}
              <span className="hidden sm:inline font-mono text-[11px]">
                {isSyncing ? 'Kaydediliyor...' : lastSyncTime}
              </span>
            </div>

            {/* ONLY ACTION ALLOWED TO EXTEND TABLE: Add Column */}
            <button
              type="button"
              onClick={() => setIsAddColOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-[2px] shadow-xs transition-colors cursor-pointer"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              <span>Yeni Tarih Sütunu Ekle</span>
              <span className="text-[10px] bg-blue-900/60 text-blue-100 px-1.5 py-0.2 rounded-[2px] font-mono">
                {board.columns.length}/3
              </span>
            </button>
          </div>
        </div>

        {/* Mobile Sub-Header / Column Selector */}
        <div className="sm:hidden px-4 py-2 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between gap-2 overflow-x-auto">
          <span className="text-[11px] font-semibold text-neutral-500 whitespace-nowrap">
            Tarih Gösterimi:
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMobileActiveColId('all')}
              className={`px-2 py-1 text-xs font-medium rounded-[2px] border ${
                mobileActiveColId === 'all'
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-white text-neutral-700 border-neutral-300'
              }`}
            >
              Tüm Tarihler
            </button>
            {board.columns.map((col) => (
              <button
                key={col.id}
                type="button"
                onClick={() => setMobileActiveColId(col.id)}
                className={`px-2 py-1 text-xs font-medium rounded-[2px] border whitespace-nowrap font-mono ${
                  mobileActiveColId === col.id
                    ? 'bg-blue-700 text-white border-blue-700'
                    : 'bg-white text-neutral-700 border-neutral-300'
                }`}
              >
                {col.date}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Table Container */}
      <main className="flex-1 p-2 sm:p-4 max-w-[1920px] w-full mx-auto overflow-hidden flex flex-col">
        {/* Table Board Card */}
        <div className="bg-white border border-neutral-300 rounded-[4px] shadow-sm flex-1 flex flex-col overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto flex-1 max-h-[calc(100vh-140px)]">
            <table className="w-full border-collapse text-left select-text">
              <thead>
                <tr className="bg-neutral-100 text-neutral-900 border-b border-neutral-300 text-xs uppercase font-bold sticky top-0 z-30 shadow-2xs">
                  {/* Category */}
                  <th className="py-2.5 px-2 text-center w-12 border-r border-neutral-300 bg-neutral-200 sticky left-0 z-30">
                    KAT
                  </th>

                  {/* Plaka */}
                  <th className="py-2.5 px-3 w-32 border-r border-neutral-300 bg-neutral-200 sticky left-12 z-30 tracking-wider">
                    PLAKA
                  </th>

                  {/* Sürücü */}
                  <th className="py-2.5 px-3 min-w-[180px] w-52 border-r border-neutral-300 bg-neutral-200 sticky left-44 z-30">
                    SÜRÜCÜ
                  </th>

                  {/* Dynamic Date Columns */}
                  {displayedColumns.map((col) => {
                    const count = getColumnTripCount(col.id);
                    return (
                      <th
                        key={col.id}
                        className="py-2.5 px-3 min-w-[210px] border-r border-neutral-300 bg-neutral-100 text-neutral-900 relative group"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                            <span className="font-mono font-bold text-xs">
                              {col.date}
                            </span>
                            <span className="ml-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded-[2px] border border-blue-200">
                              (Toplam : {count})
                            </span>
                          </div>

                          {/* Delete Column Button ("Tabloya ekleme ve çıkarma") */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteColTarget(col);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-red-600 hover:bg-neutral-200 rounded-[2px] transition-all"
                            title={`${col.date} tarihli sütunu kaldır`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </th>
                    );
                  })}

                  {/* Notlar */}
                  <th className="py-2.5 px-3 min-w-[280px] bg-neutral-100 text-neutral-900">
                    NOT
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-neutral-200 text-xs">
                {board.rows.map((row, index) => {
                  // Resolve plate background
                  let plateBgClass = 'bg-white text-neutral-950';
                  if (row.plateBg === 'green') {
                    plateBgClass = 'bg-[#a5d6a7] text-neutral-950 font-semibold';
                  } else if (row.plateBg === 'yellow') {
                    plateBgClass = 'bg-[#fff59d] text-neutral-950 font-semibold';
                  } else if (row.plateBg === 'orange') {
                    plateBgClass = 'bg-[#ffcc80] text-neutral-950 font-semibold';
                  }

                  // Resolve driver style
                  let driverStyleClass = 'text-neutral-900 font-medium';
                  let driverCellBg = 'bg-white';
                  if (row.driverStyle === 'red-italic') {
                    driverStyleClass = 'text-red-600 font-bold italic tracking-wide';
                  } else if (row.driverStyle === 'orange-bg') {
                    driverCellBg = 'bg-[#ffa726]';
                    driverStyleClass = 'text-neutral-950 font-bold';
                  }

                  // Category background
                  const categoryBgClass = row.categoryBg === 'green' ? 'bg-[#a5d6a7] font-bold' : 'bg-neutral-100 font-semibold text-neutral-700';

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-neutral-50/80 transition-colors ${
                        index % 2 === 1 ? 'bg-neutral-50/40' : 'bg-white'
                      }`}
                    >
                      {/* Category Column (Sticky left 0) */}
                      <td
                        className={`py-2 px-1 text-center font-mono text-xs border-r border-neutral-300 sticky left-0 z-20 ${categoryBgClass}`}
                      >
                        {row.category}
                      </td>

                      {/* Plaka Column (Sticky left 12) */}
                      <td
                        className={`py-2 px-2.5 font-mono font-bold tracking-tight border-r border-neutral-300 sticky left-12 z-20 ${plateBgClass}`}
                      >
                        {row.plate}
                      </td>

                      {/* Driver Column (Sticky left 44) */}
                      <td
                        className={`py-2 px-3 border-r border-neutral-300 sticky left-44 z-20 ${driverCellBg} ${driverStyleClass}`}
                      >
                        {row.driver || (
                          <span className="text-neutral-400 italic text-[11px]">-</span>
                        )}
                      </td>

                      {/* Date Trip Columns */}
                      {displayedColumns.map((col) => {
                        const trip = row.trips?.[col.id];
                        return (
                          <td
                            key={col.id}
                            className="p-1 border-r border-neutral-300 align-middle"
                          >
                            <TripCellView
                              trip={trip}
                              onClick={() => {
                                setEditingCell({
                                  row,
                                  col,
                                });
                              }}
                            />
                          </td>
                        );
                      })}

                      {/* Not Column */}
                      <td
                        onClick={() => setEditingNoteRow(row)}
                        className={`py-2 px-3 text-xs align-middle cursor-pointer hover:bg-neutral-100 transition-colors ${
                          row.notesAlert ? 'text-red-600 font-semibold' : 'text-neutral-700'
                        }`}
                        title="Notu düzenlemek için tıklayın"
                      >
                        {row.notes ? (
                          <div className="flex items-center gap-1.5">
                            {row.notesAlert && (
                              <span className="w-1.5 h-1.5 rounded-[2px] bg-red-600 shrink-0" />
                            )}
                            <span className="line-clamp-2">{row.notes}</span>
                          </div>
                        ) : (
                          <span className="text-neutral-300 select-none">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer Bar */}
          <div className="px-4 py-2.5 border-t border-neutral-200 bg-neutral-50 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Toplam {board.rows.length} Araç & {board.columns.length}/3 Tarih Sütunu (Maks. 3 Gün)
              </span>
              <span className="text-neutral-400">|</span>
              <span className="text-neutral-500">
                Sefer eklemek veya düzenlemek için tablodaki hücreye tıklayın.
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetToDefault}
                className="text-neutral-500 hover:text-neutral-800 underline text-[11px]"
              >
                Orijinal Şablona Dön
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      <AddColumnModal
        isOpen={isAddColOpen}
        onClose={() => setIsAddColOpen(false)}
        onAdd={handleAddColumn}
        existingColumns={board.columns}
      />

      <EditCellModal
        isOpen={!!editingCell}
        onClose={() => setEditingCell(null)}
        row={editingCell?.row || null}
        column={editingCell?.col || null}
        currentTrip={
          editingCell
            ? editingCell.row.trips?.[editingCell.col.id]
            : undefined
        }
        onSave={handleSaveTrip}
        onClear={handleClearTrip}
      />

      <DeleteColumnModal
        isOpen={!!deleteColTarget}
        onClose={() => setDeleteColTarget(null)}
        column={deleteColTarget}
        onConfirm={handleDeleteColumn}
      />

      <EditNoteModal
        isOpen={!!editingNoteRow}
        onClose={() => setEditingNoteRow(null)}
        row={editingNoteRow}
        onSave={handleSaveNote}
      />
    </div>
  );
}

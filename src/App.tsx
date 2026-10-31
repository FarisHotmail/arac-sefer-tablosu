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
  Calendar,
  Shrink,
  Expand,
  ClipboardPaste,
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
import { BulkUpdateModal } from './components/BulkUpdateModal';

export default function App() {
  const [board, setBoard] = useState<DispatchBoardData>(getLocalBoard() || INITIAL_BOARD);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Senkronize');
  const [isCompact, setIsCompact] = useState(true);

  // Modal states
  const [isAddColOpen, setIsAddColOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
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
    if (
      mobileActiveColId !== 'all' &&
      !newBoard.columns.some((c) => c.id === mobileActiveColId)
    ) {
      setMobileActiveColId('all');
    }
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

  // Add column (with optional removal of oldest column to maintain 7 max limit)
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

            {/* Density Toggle (Icon Only) */}
            <button
              type="button"
              onClick={() => setIsCompact(!isCompact)}
              className="inline-flex items-center justify-center p-2 text-neutral-700 bg-neutral-50 hover:bg-neutral-100 border border-neutral-300 rounded-[2px] transition-colors cursor-pointer"
              title={isCompact ? 'Standart görünüme geç' : 'Kompakt görünüme geç'}
              aria-label={isCompact ? 'Standart görünüme geç' : 'Kompakt görünüme geç'}
            >
              {isCompact ? <Expand className="w-4 h-4 text-neutral-600" /> : <Shrink className="w-4 h-4 text-blue-600" />}
            </button>

            {/* Bulk Table Update Button (Icon Only) */}
            <button
              type="button"
              onClick={() => setIsBulkOpen(true)}
              className="inline-flex items-center justify-center p-2 text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-[2px] shadow-2xs transition-colors cursor-pointer"
              title="Toplu Güncelle (Kopyala & Yapıştır)"
              aria-label="Toplu Güncelle"
            >
              <ClipboardPaste className="w-4 h-4 text-amber-800" />
            </button>

            {/* Add Date Column Button (Icon Only) */}
            <button
              type="button"
              onClick={() => setIsAddColOpen(true)}
              className="inline-flex items-center justify-center p-2 text-white bg-blue-700 hover:bg-blue-800 border border-blue-800 rounded-[2px] shadow-xs transition-colors cursor-pointer"
              title={`Yeni Tarih Sütunu Ekle (${board.columns.length}/7)`}
              aria-label="Yeni Tarih Sütunu Ekle"
            >
              <CalendarPlus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Sub-Header / Column Selector & Compact Toggle */}
        <div className="sm:hidden px-2.5 py-1.5 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between gap-1.5 overflow-x-auto">
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setMobileActiveColId('all')}
              className={`px-2 py-0.5 text-[11px] font-medium rounded-[2px] border ${
                mobileActiveColId === 'all'
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-white text-neutral-700 border-neutral-300'
              }`}
            >
              Tümü
            </button>
            {board.columns.map((col) => (
              <button
                key={col.id}
                type="button"
                onClick={() => setMobileActiveColId(col.id)}
                className={`px-1.5 py-0.5 text-[11px] font-medium rounded-[2px] border whitespace-nowrap font-mono ${
                  mobileActiveColId === col.id
                    ? 'bg-blue-700 text-white border-blue-700'
                    : 'bg-white text-neutral-700 border-neutral-300'
                }`}
              >
                {col.date}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsCompact(!isCompact)}
            className="p-1 text-neutral-700 bg-white border border-neutral-300 rounded-[2px] shrink-0 flex items-center justify-center"
            title={isCompact ? 'Standart görünüme geç' : 'Kompakt görünüme geç'}
            aria-label={isCompact ? 'Standart görünüme geç' : 'Kompakt görünüme geç'}
          >
            {isCompact ? <Expand className="w-3.5 h-3.5 text-neutral-600" /> : <Shrink className="w-3.5 h-3.5 text-blue-600" />}
          </button>
        </div>
      </header>

      {/* Main Table Container */}
      <main className="flex-1 p-1 max-w-[1920px] w-full mx-auto overflow-hidden flex flex-col">
        {/* Table Board Card */}
        <div className="bg-white border border-neutral-300 rounded-[4px] shadow-sm flex-1 flex flex-col overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto flex-1 max-h-[calc(100vh-88px)] sm:max-h-[calc(100vh-80px)]">
            <table className="w-full border-separate border-spacing-0 text-left select-text">
              <thead>
                <tr className="bg-neutral-100 text-neutral-900 text-xs uppercase font-bold sticky top-0 z-30 shadow-2xs">
                  {/* Sadece PLAKA sütunu sabitlenir */}
                  <th
                    className={`${isCompact ? 'py-1 px-1.5 sm:px-2' : 'py-2.5 px-3'} min-w-[85px] w-24 sm:w-28 sm:min-w-[100px] border-b border-r-2 border-neutral-300 bg-neutral-200 sticky left-0 z-40 tracking-wider box-border text-[10.5px] sm:text-xs shadow-[2px_0_4px_-1px_rgba(0,0,0,0.08)]`}
                  >
                    PLAKA
                  </th>

                  {/* SÜRÜCÜ sütunu sabit değildir */}
                  <th
                    className={`${isCompact ? 'py-1 px-1.5 sm:px-2' : 'py-2.5 px-3'} min-w-[110px] w-32 sm:min-w-[140px] sm:w-44 border-b border-r border-neutral-300 bg-neutral-100 text-neutral-900 box-border text-[10.5px] sm:text-xs z-20`}
                  >
                    SÜRÜCÜ
                  </th>

                  {/* Dynamic Date Columns */}
                  {displayedColumns.map((col) => {
                    const count = getColumnTripCount(col.id);
                    return (
                      <th
                        key={col.id}
                        className={`${isCompact ? 'py-1 px-1.5 sm:px-2' : 'py-2.5 px-3'} min-w-[140px] sm:min-w-[180px] border-b border-r border-neutral-300 bg-neutral-100 text-neutral-900 relative group box-border z-20`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-neutral-500" />
                            <span className="font-mono font-bold text-[10.5px] sm:text-xs">
                              {col.date}
                            </span>
                            <span className="ml-1 text-[9.5px] sm:text-[10.5px] font-semibold text-blue-700 bg-blue-50 px-1 py-0.2 rounded-[2px] border border-blue-200">
                              (Toplam : {count})
                            </span>
                          </div>

                          {/* Delete Column Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteColTarget(col);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-neutral-400 hover:text-red-600 hover:bg-neutral-200 rounded-[2px] transition-all"
                            title={`${col.date} tarihli sütunu kaldır`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </th>
                    );
                  })}

                  {/* Notlar */}
                  <th className={`${isCompact ? 'py-1 px-1.5 sm:px-2' : 'py-2.5 px-3'} min-w-[170px] sm:min-w-[240px] border-b border-neutral-300 bg-neutral-100 text-neutral-900 box-border text-[10.5px] sm:text-xs z-20`}>
                    NOT
                  </th>
                </tr>
              </thead>

              <tbody className="text-xs">
                {board.rows.map((row, index) => {
                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-neutral-50/80 transition-colors ${
                        index % 2 === 1 ? 'bg-neutral-50/40' : 'bg-white'
                      } ${isCompact ? 'h-[16px] sm:h-[18px]' : 'h-[32px]'}`}
                    >
                      {/* Sadece Plaka Sütunu Sabittir (Sticky left-0) - Arkaplan Beyaz */}
                      <td
                        className={`bg-white text-black font-mono font-bold tracking-tight border-b border-r-2 border-neutral-300 sticky left-0 z-20 box-border whitespace-nowrap shadow-[2px_0_4px_-1px_rgba(0,0,0,0.08)] ${
                          isCompact ? 'py-0 px-1.5 sm:px-2 text-[10px] sm:text-[10.5px] leading-none' : 'py-1.5 px-2.5 sm:px-3 text-xs leading-tight'
                        }`}
                      >
                        {row.plate}
                      </td>

                      {/* Sürücü Sütunu Sabit Değildir - Arkaplan Beyaz, Yazı Siyah ve Düz */}
                      <td
                        className={`bg-white text-black font-medium not-italic border-b border-r border-neutral-300 box-border whitespace-nowrap overflow-hidden text-ellipsis ${
                          isCompact ? 'py-0 px-1.5 sm:px-2 text-[10px] sm:text-[10.5px] leading-none' : 'py-1.5 px-3 text-xs leading-tight'
                        }`}
                        title={row.driver}
                      >
                        {row.driver || (
                          <span className="text-neutral-400 text-[10px] leading-none">-</span>
                        )}
                      </td>

                      {/* Date Trip Columns */}
                      {displayedColumns.map((col) => {
                        const trip = row.trips?.[col.id];
                        return (
                          <td
                            key={col.id}
                            className={`border-b border-r border-neutral-300 align-middle box-border ${isCompact ? 'p-0' : 'p-0.5'}`}
                          >
                            <TripCellView
                              trip={trip}
                              isCompact={isCompact}
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
                        className={`align-middle cursor-pointer hover:bg-neutral-100 transition-colors border-b border-neutral-300 box-border ${
                          isCompact ? 'py-0 px-1.5 sm:px-2 text-[10px] sm:text-[10.5px] leading-none' : 'py-1.5 px-3 text-xs leading-tight'
                        } ${row.notesAlert ? 'text-red-600 font-semibold' : 'text-neutral-700'}`}
                        title="Notu düzenlemek için tıklayın"
                      >
                        {row.notes ? (
                          <div className="flex items-center gap-1.5">
                            {row.notesAlert && (
                              <span className="w-1.5 h-1.5 rounded-[2px] bg-red-600 shrink-0" />
                            )}
                            <span className={isCompact ? 'truncate max-w-[220px] leading-none' : 'line-clamp-2'}>{row.notes}</span>
                          </div>
                        ) : (
                          <span className="text-neutral-300 select-none leading-none">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

      <BulkUpdateModal
        isOpen={isBulkOpen}
        onClose={() => setIsBulkOpen(false)}
        currentBoard={board}
        onApplyBulkUpdate={persistChanges}
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

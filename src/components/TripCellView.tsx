import React from 'react';
import { TripCell } from '../types';

interface TripCellViewProps {
  trip?: TripCell;
  onClick?: () => void;
  isEditable?: boolean;
}

export const TripCellView: React.FC<TripCellViewProps> = ({
  trip,
  onClick,
  isEditable = true,
}) => {
  if (!trip || (!trip.text && !trip.type)) {
    return (
      <div
        onClick={onClick}
        className={`w-full h-full min-h-[36px] flex items-center justify-center p-1.5 transition-colors group cursor-pointer ${
          isEditable ? 'hover:bg-neutral-100/70 dark:hover:bg-neutral-800/50' : ''
        }`}
        title={isEditable ? 'Sefer bilgisi eklemek için tıklayın' : undefined}
      >
        <span className="text-[11px] text-neutral-300 dark:text-neutral-700 select-none group-hover:text-neutral-400 dark:group-hover:text-neutral-500 font-mono">
          -
        </span>
      </div>
    );
  }

  // Type: blocked (black cell)
  if (trip.type === 'blocked') {
    return (
      <div
        onClick={onClick}
        className="w-full h-full min-h-[36px] bg-black text-transparent select-none cursor-pointer border border-neutral-900 transition-opacity hover:opacity-90"
        title="Sefer Dışı / Bloke (Değiştirmek için tıklayın)"
      >
        &nbsp;
      </div>
    );
  }

  // Type: leave (RAPORLU) or breakdown (ARIZALI)
  if (trip.type === 'leave' || trip.type === 'breakdown' || trip.text === 'RAPORLU' || trip.text === 'ARIZALI') {
    return (
      <div
        onClick={onClick}
        className="w-full h-full min-h-[36px] px-2 py-1.5 bg-[#424242] text-white flex items-center justify-center text-center font-bold text-xs tracking-wider cursor-pointer border border-[#303030] rounded-[2px] shadow-2xs hover:brightness-110 transition-all"
        title={`${trip.text} (Düzenlemek için tıklayın)`}
      >
        {trip.text || (trip.type === 'leave' ? 'RAPORLU' : 'ARIZALI')}
      </div>
    );
  }

  // Resolve styling based on type or inferred from text
  const textLower = (trip.text || '').toLowerCase();
  let bgClasses = 'bg-[#ff80ab] text-neutral-950'; // Default pink / morning

  if (trip.type === 'evening' || textLower.includes('akşam') || textLower.includes('aksam')) {
    bgClasses = 'bg-[#fff176] text-neutral-950 font-medium'; // Yellow
  } else if (trip.type === 'night' || textLower.includes('gece') || textLower.includes('havalimanı') || textLower.includes('havalimani')) {
    bgClasses = 'bg-[#29b6f6] text-neutral-950 font-semibold'; // Cyan / Blue
  } else if (trip.type === 'morning' || textLower.includes('sabah')) {
    bgClasses = 'bg-[#f48fb1] text-neutral-950 font-medium'; // Pink / Magenta
  }

  return (
    <div
      onClick={onClick}
      className={`w-full h-full min-h-[36px] px-2 py-1.5 flex items-center justify-center text-center text-xs leading-snug cursor-pointer border border-black/10 rounded-[2px] shadow-2xs hover:brightness-95 transition-all ${bgClasses}`}
      title={`${trip.text} (Düzenlemek için tıklayın)`}
    >
      <span className="font-semibold tracking-tight">{trip.text}</span>
    </div>
  );
};

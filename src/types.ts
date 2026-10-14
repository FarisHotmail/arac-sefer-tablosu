export type TripType = 'morning' | 'evening' | 'night' | 'leave' | 'breakdown' | 'blocked' | 'custom';

export interface TripCell {
  text: string;
  type?: TripType;
  customBg?: string; // hex or tailwind class
  customText?: string;
}

export interface BoardColumn {
  id: string; // e.g. 'col_2026_10_12'
  date: string; // e.g. '12.10.2026'
  label?: string; // optional extra label
  totalCount?: number;
  order: number;
  isCustom?: boolean; // added by user
}

export interface VehicleRow {
  id: string; // unique row id
  category: string; // '10', '14', '16', '18', 'K'
  categoryBg?: string;
  plate: string; // e.g. '01ASB081'
  plateBg?: string; // e.g. green, yellow, orange
  driver: string; // Driver name
  driverStyle?: 'normal' | 'red-italic' | 'orange-bg';
  notes: string;
  notesAlert?: boolean; // red highlight for maintenance notes
  trips: Record<string, TripCell>; // columnId -> trip info
}

export interface DispatchBoardData {
  title: string;
  columns: BoardColumn[];
  rows: VehicleRow[];
  updatedAt?: string;
  updatedBy?: string;
}

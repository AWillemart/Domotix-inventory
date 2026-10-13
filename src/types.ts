export interface Objet {
  id: string;
  contenant_id: string;
  nom: string;
  description: string;
  quantite: number;
  date_creation: string;
  date_modification: string;
}

export interface Contenant {
  id: string;
  emplacement_id: string;
  nom: string;
  date_creation: string;
  objets: Objet[];
}

export interface Emplacement {
  id: string;
  piece_id: string;
  nom: string;
  date_creation: string;
  contenants: Contenant[];
}

export interface Piece {
  id: string;
  nom: string;
  date_creation: string;
  emplacements: Emplacement[];
}

export type ThemeColor = 'emerald' | 'blue' | 'indigo' | 'violet' | 'amber' | 'rose' | 'cyan';
export type ColorMode = 'dark' | 'light';

export interface AppSettings {
  ollama_url: string;
  whisper_url: string;
  piper_url: string;
  ollama_model: string;
  require_validation: boolean;
  theme_color: ThemeColor;
  color_mode: ColorMode;
  domotix_port?: number;
}

export type ToastType = 'success' | 'error' | 'warning';

export interface ToastInfo {
  id: number;
  message: string;
  type: ToastType;
}

export interface ExtractionResult {
  action: 'add' | 'search';
  room?: string;
  location?: string;
  container?: string;
  items: string[];
  _source?: string;
}

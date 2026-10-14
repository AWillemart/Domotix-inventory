import { ThemeColor } from '../types';

export interface ThemeClasses {
  name: string;
  label: string;
  hex: string;
  primaryBg: string;
  primaryHover: string;
  primaryText: string;
  primaryBorder: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  ring: string;
  glow: string;
  accentCard: string;
  subtleBg: string;
  borderHover: string;
}

export interface ThemeMeta {
  name: ThemeColor;
  label: string;
  hex: string;
}

export const THEME_LIST: ThemeMeta[] = [
  { name: 'emerald', label: 'Émeraude Domotique', hex: '#10b981' },
  { name: 'blue', label: 'Bleu Océan', hex: '#3b82f6' },
  { name: 'indigo', label: 'Indigo Nuit', hex: '#6366f1' },
  { name: 'violet', label: 'Violet Cyber', hex: '#8b5cf6' },
  { name: 'amber', label: 'Ambre Atelier', hex: '#f59e0b' },
  { name: 'rose', label: 'Rose Rubis', hex: '#f43f5e' },
  { name: 'cyan', label: 'Cyan Futuriste', hex: '#06b6d4' },
];

export function getTheme(color: ThemeColor = 'emerald', isDark = true): ThemeClasses {
  switch (color) {
    case 'blue':
      return {
        name: 'blue',
        label: 'Bleu Océan',
        hex: '#3b82f6',
        primaryBg: 'bg-blue-600',
        primaryHover: 'hover:bg-blue-500',
        primaryText: isDark ? 'text-blue-400' : 'text-blue-600',
        primaryBorder: isDark ? 'border-blue-500/40' : 'border-blue-300',
        badgeBg: isDark ? 'bg-blue-950/80' : 'bg-blue-100',
        badgeText: isDark ? 'text-blue-400' : 'text-blue-700',
        badgeBorder: isDark ? 'border-blue-800/60' : 'border-blue-200',
        ring: 'focus:border-blue-500 focus:ring-blue-500',
        glow: isDark ? 'bg-blue-500/10' : 'bg-blue-500/15',
        accentCard: isDark ? 'bg-blue-950/30 border-blue-900/50' : 'bg-blue-50/80 border-blue-200',
        subtleBg: isDark ? 'bg-blue-900/30' : 'bg-blue-50',
        borderHover: 'hover:border-blue-500',
      };
    case 'indigo':
      return {
        name: 'indigo',
        label: 'Indigo Nuit',
        hex: '#6366f1',
        primaryBg: 'bg-indigo-600',
        primaryHover: 'hover:bg-indigo-500',
        primaryText: isDark ? 'text-indigo-400' : 'text-indigo-600',
        primaryBorder: isDark ? 'border-indigo-500/40' : 'border-indigo-300',
        badgeBg: isDark ? 'bg-indigo-950/80' : 'bg-indigo-100',
        badgeText: isDark ? 'text-indigo-400' : 'text-indigo-700',
        badgeBorder: isDark ? 'border-indigo-800/60' : 'border-indigo-200',
        ring: 'focus:border-indigo-500 focus:ring-indigo-500',
        glow: isDark ? 'bg-indigo-500/10' : 'bg-indigo-500/15',
        accentCard: isDark ? 'bg-indigo-950/30 border-indigo-900/50' : 'bg-indigo-50/80 border-indigo-200',
        subtleBg: isDark ? 'bg-indigo-900/30' : 'bg-indigo-50',
        borderHover: 'hover:border-indigo-500',
      };
    case 'violet':
      return {
        name: 'violet',
        label: 'Violet Cyber',
        hex: '#8b5cf6',
        primaryBg: 'bg-violet-600',
        primaryHover: 'hover:bg-violet-500',
        primaryText: isDark ? 'text-violet-400' : 'text-violet-600',
        primaryBorder: isDark ? 'border-violet-500/40' : 'border-violet-300',
        badgeBg: isDark ? 'bg-violet-950/80' : 'bg-violet-100',
        badgeText: isDark ? 'text-violet-400' : 'text-violet-700',
        badgeBorder: isDark ? 'border-violet-800/60' : 'border-violet-200',
        ring: 'focus:border-violet-500 focus:ring-violet-500',
        glow: isDark ? 'bg-violet-500/10' : 'bg-violet-500/15',
        accentCard: isDark ? 'bg-violet-950/30 border-violet-900/50' : 'bg-violet-50/80 border-violet-200',
        subtleBg: isDark ? 'bg-violet-900/30' : 'bg-violet-50',
        borderHover: 'hover:border-violet-500',
      };
    case 'amber':
      return {
        name: 'amber',
        label: 'Ambre Atelier',
        hex: '#f59e0b',
        primaryBg: 'bg-amber-600',
        primaryHover: 'hover:bg-amber-500',
        primaryText: isDark ? 'text-amber-400' : 'text-amber-600',
        primaryBorder: isDark ? 'border-amber-500/40' : 'border-amber-300',
        badgeBg: isDark ? 'bg-amber-950/80' : 'bg-amber-100',
        badgeText: isDark ? 'text-amber-400' : 'text-amber-800',
        badgeBorder: isDark ? 'border-amber-800/60' : 'border-amber-200',
        ring: 'focus:border-amber-500 focus:ring-amber-500',
        glow: isDark ? 'bg-amber-500/10' : 'bg-amber-500/15',
        accentCard: isDark ? 'bg-amber-950/30 border-amber-900/50' : 'bg-amber-50/80 border-amber-200',
        subtleBg: isDark ? 'bg-amber-900/30' : 'bg-amber-50',
        borderHover: 'hover:border-amber-500',
      };
    case 'rose':
      return {
        name: 'rose',
        label: 'Rose Rubis',
        hex: '#f43f5e',
        primaryBg: 'bg-rose-600',
        primaryHover: 'hover:bg-rose-500',
        primaryText: isDark ? 'text-rose-400' : 'text-rose-600',
        primaryBorder: isDark ? 'border-rose-500/40' : 'border-rose-300',
        badgeBg: isDark ? 'bg-rose-950/80' : 'bg-rose-100',
        badgeText: isDark ? 'text-rose-400' : 'text-rose-700',
        badgeBorder: isDark ? 'border-rose-800/60' : 'border-rose-200',
        ring: 'focus:border-rose-500 focus:ring-rose-500',
        glow: isDark ? 'bg-rose-500/10' : 'bg-rose-500/15',
        accentCard: isDark ? 'bg-rose-950/30 border-rose-900/50' : 'bg-rose-50/80 border-rose-200',
        subtleBg: isDark ? 'bg-rose-900/30' : 'bg-rose-50',
        borderHover: 'hover:border-rose-500',
      };
    case 'cyan':
      return {
        name: 'cyan',
        label: 'Cyan Futuriste',
        hex: '#06b6d4',
        primaryBg: 'bg-cyan-600',
        primaryHover: 'hover:bg-cyan-500',
        primaryText: isDark ? 'text-cyan-400' : 'text-cyan-600',
        primaryBorder: isDark ? 'border-cyan-500/40' : 'border-cyan-300',
        badgeBg: isDark ? 'bg-cyan-950/80' : 'bg-cyan-100',
        badgeText: isDark ? 'text-cyan-400' : 'text-cyan-800',
        badgeBorder: isDark ? 'border-cyan-800/60' : 'border-cyan-200',
        ring: 'focus:border-cyan-500 focus:ring-cyan-500',
        glow: isDark ? 'bg-cyan-500/10' : 'bg-cyan-500/15',
        accentCard: isDark ? 'bg-cyan-950/30 border-cyan-900/50' : 'bg-cyan-50/80 border-cyan-200',
        subtleBg: isDark ? 'bg-cyan-900/30' : 'bg-cyan-50',
        borderHover: 'hover:border-cyan-500',
      };
    case 'emerald':
    default:
      return {
        name: 'emerald',
        label: 'Émeraude Domotique',
        hex: '#10b981',
        primaryBg: 'bg-emerald-600',
        primaryHover: 'hover:bg-emerald-500',
        primaryText: isDark ? 'text-emerald-400' : 'text-emerald-600',
        primaryBorder: isDark ? 'border-emerald-500/40' : 'border-emerald-300',
        badgeBg: isDark ? 'bg-emerald-950/80' : 'bg-emerald-100',
        badgeText: isDark ? 'text-emerald-400' : 'text-emerald-800',
        badgeBorder: isDark ? 'border-emerald-800/60' : 'border-emerald-200',
        ring: 'focus:border-emerald-500 focus:ring-emerald-500',
        glow: isDark ? 'bg-emerald-500/10' : 'bg-emerald-500/15',
        accentCard: isDark ? 'bg-emerald-950/30 border-emerald-900/50' : 'bg-emerald-50/80 border-emerald-200',
        subtleBg: isDark ? 'bg-emerald-900/30' : 'bg-emerald-50',
        borderHover: 'hover:border-emerald-500',
      };
  }
}

// Compatibilité
export const THEMES: Record<ThemeColor, ThemeClasses> = {
  emerald: getTheme('emerald', true),
  blue: getTheme('blue', true),
  indigo: getTheme('indigo', true),
  violet: getTheme('violet', true),
  amber: getTheme('amber', true),
  rose: getTheme('rose', true),
  cyan: getTheme('cyan', true),
};

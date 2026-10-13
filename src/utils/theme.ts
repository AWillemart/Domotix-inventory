import { ThemeColor, ColorMode } from '../types';

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
}

export const THEMES: Record<ThemeColor, ThemeClasses> = {
  emerald: {
    name: 'emerald',
    label: 'Émeraude Domotique',
    hex: '#10b981',
    primaryBg: 'bg-emerald-600',
    primaryHover: 'hover:bg-emerald-500',
    primaryText: 'text-emerald-400',
    primaryBorder: 'border-emerald-500/40',
    badgeBg: 'bg-emerald-950/80',
    badgeText: 'text-emerald-400',
    badgeBorder: 'border-emerald-800/60',
    ring: 'focus:border-emerald-500 focus:ring-emerald-500',
    glow: 'bg-emerald-500/10',
  },
  blue: {
    name: 'blue',
    label: 'Bleu Océan',
    hex: '#3b82f6',
    primaryBg: 'bg-blue-600',
    primaryHover: 'hover:bg-blue-500',
    primaryText: 'text-blue-400',
    primaryBorder: 'border-blue-500/40',
    badgeBg: 'bg-blue-950/80',
    badgeText: 'text-blue-400',
    badgeBorder: 'border-blue-800/60',
    ring: 'focus:border-blue-500 focus:ring-blue-500',
    glow: 'bg-blue-500/10',
  },
  indigo: {
    name: 'indigo',
    label: 'Indigo Nuit',
    hex: '#6366f1',
    primaryBg: 'bg-indigo-600',
    primaryHover: 'hover:bg-indigo-500',
    primaryText: 'text-indigo-400',
    primaryBorder: 'border-indigo-500/40',
    badgeBg: 'bg-indigo-950/80',
    badgeText: 'text-indigo-400',
    badgeBorder: 'border-indigo-800/60',
    ring: 'focus:border-indigo-500 focus:ring-indigo-500',
    glow: 'bg-indigo-500/10',
  },
  violet: {
    name: 'violet',
    label: 'Violet Cyber',
    hex: '#8b5cf6',
    primaryBg: 'bg-violet-600',
    primaryHover: 'hover:bg-violet-500',
    primaryText: 'text-violet-400',
    primaryBorder: 'border-violet-500/40',
    badgeBg: 'bg-violet-950/80',
    badgeText: 'text-violet-400',
    badgeBorder: 'border-violet-800/60',
    ring: 'focus:border-violet-500 focus:ring-violet-500',
    glow: 'bg-violet-500/10',
  },
  amber: {
    name: 'amber',
    label: 'Ambre Atelier',
    hex: '#f59e0b',
    primaryBg: 'bg-amber-600',
    primaryHover: 'hover:bg-amber-500',
    primaryText: 'text-amber-400',
    primaryBorder: 'border-amber-500/40',
    badgeBg: 'bg-amber-950/80',
    badgeText: 'text-amber-400',
    badgeBorder: 'border-amber-800/60',
    ring: 'focus:border-amber-500 focus:ring-amber-500',
    glow: 'bg-amber-500/10',
  },
  rose: {
    name: 'rose',
    label: 'Rose Rubis',
    hex: '#f43f5e',
    primaryBg: 'bg-rose-600',
    primaryHover: 'hover:bg-rose-500',
    primaryText: 'text-rose-400',
    primaryBorder: 'border-rose-500/40',
    badgeBg: 'bg-rose-950/80',
    badgeText: 'text-rose-400',
    badgeBorder: 'border-rose-800/60',
    ring: 'focus:border-rose-500 focus:ring-rose-500',
    glow: 'bg-rose-500/10',
  },
  cyan: {
    name: 'cyan',
    label: 'Cyan Futuriste',
    hex: '#06b6d4',
    primaryBg: 'bg-cyan-600',
    primaryHover: 'hover:bg-cyan-500',
    primaryText: 'text-cyan-400',
    primaryBorder: 'border-cyan-500/40',
    badgeBg: 'bg-cyan-950/80',
    badgeText: 'text-cyan-400',
    badgeBorder: 'border-cyan-800/60',
    ring: 'focus:border-cyan-500 focus:ring-cyan-500',
    glow: 'bg-cyan-500/10',
  },
};

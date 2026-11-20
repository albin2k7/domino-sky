export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  badgeBg: string;
  badgeDot: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'night-ops',
    name: 'Night Ops',
    description: 'Deep navy & electric cyan ops console (Default)',
    badgeBg: 'bg-[#131C30]',
    badgeDot: 'bg-[#22D3EE]',
  },
  {
    id: 'radar-green',
    name: 'Radar Green',
    description: 'Phosphor green CRT air traffic control console',
    badgeBg: 'bg-[#0D291D]',
    badgeDot: 'bg-[#10B981]',
  },
  {
    id: 'solar-amber',
    name: 'Solar Amber',
    description: 'High-contrast tactical sunset emergency palette',
    badgeBg: 'bg-[#291E0E]',
    badgeDot: 'bg-[#F59E0B]',
  },
  {
    id: 'light-briefing',
    name: 'Light Briefing',
    description: 'Daylight briefing room executive document style',
    badgeBg: 'bg-[#EAEFF8]',
    badgeDot: 'bg-[#0284C7]',
  },
];

export function applyTheme(themeId: string): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', themeId);
    try {
      localStorage.setItem('domino-sky-theme', themeId);
    } catch {
      // LocalStorage might be disabled in private mode
    }
  }
}

export function getSavedTheme(): string {
  if (typeof document !== 'undefined') {
    try {
      return localStorage.getItem('domino-sky-theme') || 'night-ops';
    } catch {
      return 'night-ops';
    }
  }
  return 'night-ops';
}

import { useEffect, useState } from 'preact/hooks';
import { COMPETITIONS } from '../config/competitions';
import type { Competition } from '../types';

export type ThemeSetting = 'auto' | 'light' | 'dark';
export interface Settings {
  theme: ThemeSetting;
  /** Intervalle de rafraîchissement en direct, en secondes. */
  refreshSec: 5 | 10 | 30 | 60;
  /** Identifiants des compétitions masquées. */
  hiddenComps: string[];
}

const DEFAULTS: Settings = { theme: 'auto', refreshSec: 5, hiddenComps: [] };
const KEY = 'settings.v1';

const read = (): Settings => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
};

let state = read();
const subs = new Set<() => void>();

export const getSettings = () => state;

export function applyTheme(theme: ThemeSetting = state.theme) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function updateSettings(patch: Partial<Settings>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* stockage indisponible */
  }
  applyTheme();
  subs.forEach((f) => f());
}

export const resetSettings = () => updateSettings({ ...DEFAULTS });

export function useSettings() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return state;
}

/** Compétitions suivies (celles que l'utilisateur n'a pas masquées). */
export const enabledCompetitions = (): Competition[] => COMPETITIONS.filter((c) => !state.hiddenComps.includes(c.id));

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
  alerts: AlertSettings;
}

export interface AlertSettings {
  enabled: boolean;
  goals: boolean;
  kickoff: boolean;
  halftime: boolean;
  fulltime: boolean;
  red: boolean;
  lineups: boolean;
  /** App iPhone : Activité en direct sur l'écran verrouillé et la Dynamic Island */
  live: boolean;
}

const DEFAULTS: Settings = { theme: 'auto', refreshSec: 5, hiddenComps: [], alerts: { enabled: false, goals: true, kickoff: true, halftime: true, fulltime: true, red: false, lineups: true, live: true } };
const KEY = 'settings.v1';

const read = (): Settings => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const stored = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...stored, alerts: { ...DEFAULTS.alerts, ...(stored.alerts ?? {}) } };
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

// Réinitialiser ne coupe pas les alertes (l'abonnement vit aussi côté service).
export const resetSettings = () => updateSettings({ ...DEFAULTS, alerts: { ...DEFAULTS.alerts, enabled: state.alerts.enabled } });

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

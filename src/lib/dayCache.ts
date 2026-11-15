import type { Match } from '../types';

/**
 * Dernières données connues, gardées sur l'appareil : affichées instantanément à l'ouverture,
 * puis remplacées par les données fraîches dès qu'elles arrivent.
 */
const DAYS_KEY = 'matches-cache.v1';
const UPCOMING_KEY = 'upcoming-cache.v1';
const MAX_DAYS = 8;

type Entry = { at: number; matches: Match[] };

const load = <T,>(key: string, fallback: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback;
  } catch {
    return fallback;
  }
};
const store = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage plein ou indisponible : sans conséquence */
  }
};

export function cachedDay(day: string): Match[] | null {
  return load<Record<string, Entry>>(DAYS_KEY, {})[day]?.matches ?? null;
}

export function storeDay(day: string, matches: Match[]) {
  const all = load<Record<string, Entry>>(DAYS_KEY, {});
  all[day] = { at: Date.now(), matches };
  // On ne garde que les jours consultés le plus récemment.
  const kept = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_DAYS);
  store(DAYS_KEY, Object.fromEntries(kept));
}

/** Prochains matchs connus (moins de 12 h). */
export function cachedUpcoming(): Match[] | null {
  const e = load<Entry | null>(UPCOMING_KEY, null);
  return e && Date.now() - e.at < 12 * 3_600_000 ? e.matches.filter((m) => new Date(m.kickoff).getTime() > Date.now()) : null;
}

export const storeUpcoming = (matches: Match[]) => store(UPCOMING_KEY, { at: Date.now(), matches });

import { useEffect, useState } from 'preact/hooks';
import type { Match, SportId, Team } from '../types';
import { competitionById } from '../config/competitions';

/** Équipe favorite, stockée localement (jamais envoyée sur le réseau). */
export interface Fav {
  key: string; // « football:160 » : les identifiants ESPN ne sont uniques que par sport
  id: string;
  sport: SportId;
  name: string;
  logo?: string;
  color?: string;
}

const KEY = 'favorites.v1';
export const favKey = (sport: SportId, id: string) => `${sport}:${id}`;
export const toFav = (sport: SportId, t: Team): Fav => ({ key: favKey(sport, t.id), id: t.id, sport, name: t.name, logo: t.logo, color: t.color });

const read = (): Fav[] => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Fav[]) : [];
  } catch {
    return [];
  }
};

// Petit magasin partagé : l'écran Scores et l'écran Favoris restent synchronisés.
let state: Fav[] = read();
const subs = new Set<() => void>();
const write = (next: Fav[]) => {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* stockage indisponible : on garde l'état en mémoire */
  }
  subs.forEach((f) => f());
};

export function useFavorites() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return {
    favs: state,
    keys: new Set(state.map((f) => f.key)),
    toggle: (f: Fav) => write(state.some((x) => x.key === f.key) ? state.filter((x) => x.key !== f.key) : [...state, f]),
  };
}

export function isFavMatch(m: Match, keys: Set<string>): boolean {
  const c = competitionById(m.competitionId);
  return !!c && (keys.has(favKey(c.sport, m.home.id)) || keys.has(favKey(c.sport, m.away.id)));
}

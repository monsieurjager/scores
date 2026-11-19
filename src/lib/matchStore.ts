import { useEffect, useState } from 'preact/hooks';
import type { Match, SportId, Team } from '../types';

/**
 * Dernière version connue de chaque match, partagée entre les écrans.
 * Le détail d'un match se met ainsi à jour tout seul pendant le rafraîchissement en direct.
 */
const matches = new Map<string, Match>();
const subs = new Set<() => void>();

let lastUpdate = 0;
/** Heure de la dernière mise à jour reçue d'ESPN (ms). */
export const lastUpdateAt = () => lastUpdate;

export function publishMatches(list: Match[]) {
  lastUpdate = Date.now();
  for (const m of list) matches.set(m.id, m);
  subs.forEach((f) => f());
}

/** Matchs en cours d'une compétition (pour le classement en direct). */
export function useLiveMatches(compId?: string): Match[] {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return compId ? [...matches.values()].filter((m) => m.competitionId === compId && m.status === 'live') : [];
}

export function useMatch(id: string | null): Match | undefined {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return id ? matches.get(id) : undefined;
}

// Feuilles ouvertes, en pile : détail d'un match → page d'une équipe → retour au match, etc.
export type Sheet =
  | { type: 'match'; id: string }
  | { type: 'team'; sport: SportId; team: Team; national: boolean }
  | { type: 'comp'; id: string }
  | { type: 'search' };

let stack: Sheet[] = [];
const sheetSubs = new Set<() => void>();
const emit = () => sheetSubs.forEach((f) => f());

export const pushSheet = (s: Sheet) => {
  stack = [...stack, s];
  emit();
};
export const popSheet = () => {
  stack = stack.slice(0, -1);
  emit();
};
export const closeSheets = () => {
  stack = [];
  emit();
};
/** Compatibilité : ouvrir le détail d'un match. */
export const openMatch = (id: string | null) => (id ? pushSheet({ type: 'match', id }) : popSheet());

export function useSheets(): Sheet[] {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    sheetSubs.add(f);
    return () => {
      sheetSubs.delete(f);
    };
  }, []);
  return stack;
}

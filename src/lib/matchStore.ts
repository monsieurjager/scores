import { useEffect, useState } from 'preact/hooks';
import type { Match } from '../types';

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

// Match actuellement ouvert (feuille de détail)
let openId: string | null = null;
const openSubs = new Set<() => void>();
export const openMatch = (id: string | null) => {
  openId = id;
  openSubs.forEach((f) => f());
};
export function useOpenMatchId(): string | null {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    openSubs.add(f);
    return () => {
      openSubs.delete(f);
    };
  }, []);
  return openId;
}

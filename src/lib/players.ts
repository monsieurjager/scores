import { useEffect, useState } from 'preact/hooks';
import type { SportId, Team } from '../types';

/** Joueur suivi (stocké localement ; envoyé au service d'alertes seulement si les alertes sont activées). */
export interface FollowedPlayer {
  key: string; // « football:231388 »
  id: string;
  sport: SportId;
  name: string;
  team: Team;
}

const KEY = 'players.v1';
export const playerKey = (sport: SportId, id: string) => `${sport}:${id}`;

const read = (): FollowedPlayer[] => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FollowedPlayer[]) : [];
  } catch {
    return [];
  }
};

let state = read();
const subs = new Set<() => void>();
const write = (next: FollowedPlayer[]) => {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* stockage indisponible */
  }
  subs.forEach((f) => f());
  window.dispatchEvent(new Event('favorites-changed'));
};

export const getPlayers = () => state;
/** Équipes des joueurs suivis (« football:160 ») : leurs matchs remontent avec ceux des équipes favorites. */
export const playerTeamKeys = () => new Set(state.map((p) => `${p.sport}:${p.team.id}`));

export function usePlayers() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return {
    players: state,
    keys: new Set(state.map((p) => p.key)),
    toggle: (p: FollowedPlayer) => write(state.some((x) => x.key === p.key) ? state.filter((x) => x.key !== p.key) : [...state, p]),
  };
}

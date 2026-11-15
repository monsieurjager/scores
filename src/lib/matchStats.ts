import type { Competition, Match } from '../types';

const baseMinute = (clock: string) => Number(/^(\d+)/.exec(clock)?.[1] ?? 0);

/**
 * Score à la mi-temps, calculé à partir des buts / essais.
 * Renvoyé seulement s'il est cohérent avec le score actuel (ESPN omet parfois un essai de pénalité).
 */
export function halfTimeScore(m: Match, sport: Competition['sport']): { home: number; away: number } | null {
  const ev = (m.events ?? []).filter((e) => e.points > 0);
  if (ev.length === 0 || m.homeScore == null || m.awayScore == null) return null;
  const limit = sport === 'rugby' ? 40 : 45;
  const started2 = m.status === 'finished' || m.clock === 'MT' || (m.status === 'live' && baseMinute(m.clock ?? '') > limit);
  if (!started2) return null;
  const sum = (list: typeof ev, id: string) => list.filter((e) => e.teamId === id).reduce((n, e) => n + e.points, 0);
  if (sum(ev, m.home.id) !== m.homeScore || sum(ev, m.away.id) !== m.awayScore) return null;
  const first = ev.filter((e) => baseMinute(e.clock) <= limit);
  return { home: sum(first, m.home.id), away: sum(first, m.away.id) };
}

/** Match encore « à venir » plus de 4 h après son coup d'envoi : la source n'a pas transmis le résultat. */
export const isStale = (m: Match) => m.status === 'scheduled' && Date.now() - new Date(m.kickoff).getTime() > 4 * 3_600_000;

// Classement en direct : le classement officiel, complété par les scores des matchs en cours.
import type { Match, SportId, StandingRow, StandingsTable } from '../types';

const num = (d: string) => Number(String(d).replace('−', '-').replace('+', '')) || 0;
const sign = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Points d'un match, selon le sport (rugby : bonus défensif et offensif). */
export function matchPoints(sport: SportId, us: number, them: number, opts: { compId?: string; triesUs?: number; triesThem?: number } = {}): number {
  if (sport === 'football') return us > them ? 3 : us === them ? 1 : 0;
  const top14 = opts.compId === 'top14';
  let pts = us > them ? 4 : us === them ? 2 : 0;
  // Bonus défensif : défaite de 5 points ou moins (7 en tests internationaux)
  if (us < them && them - us <= (top14 ? 5 : 7)) pts += 1;
  // Bonus offensif : Top 14 = victoire avec 15 points d'écart ou plus ; ailleurs = 4 essais ou plus
  if (top14 ? us - them >= 15 : (opts.triesUs ?? 0) >= 4) pts += 1;
  return pts;
}

export function applyLive(table: StandingsTable, live: Match[], sport: SportId, compId?: string): StandingsTable {
  const ids = new Set(table.rows.map((r) => r.team.id));
  const games = live.filter((m) => m.status === 'live' && m.homeScore != null && m.awayScore != null && (ids.has(m.home.id) || ids.has(m.away.id)));
  if (games.length === 0) return table;
  const tries = (m: Match, teamId: string) => (m.events ?? []).filter((e) => e.teamId === teamId && (e.kind === 'try' || e.kind === 'penaltytry')).length;
  const rows = table.rows.map((r): StandingRow => {
    const m = games.find((g) => g.home.id === r.team.id || g.away.id === r.team.id);
    if (!m) return { ...r };
    const home = m.home.id === r.team.id;
    const us = (home ? m.homeScore : m.awayScore)!;
    const them = (home ? m.awayScore : m.homeScore)!;
    const add = matchPoints(sport, us, them, { compId, triesUs: tries(m, r.team.id), triesThem: tries(m, home ? m.away.id : m.home.id) });
    const inc = (n: number | null, by: number) => (n == null ? null : n + by);
    return {
      ...r,
      played: inc(r.played, 1),
      won: inc(r.won, us > them ? 1 : 0),
      drawn: inc(r.drawn, us === them ? 1 : 0),
      lost: inc(r.lost, us < them ? 1 : 0),
      points: inc(r.points, add),
      diff: r.diff === '' ? '' : sign(num(r.diff) + us - them),
      live: { score: `${us}–${them}`, delta: 0 },
    };
  });
  const sorted = [...rows].sort((a, b) => (b.points ?? 0) - (a.points ?? 0) || num(b.diff) - num(a.diff) || a.rank - b.rank);
  const out = sorted.map((r, i) => ({ ...r, rank: i + 1, live: r.live ? { ...r.live, delta: r.rank - (i + 1) } : r.rank !== i + 1 ? { score: '', delta: r.rank - (i + 1) } : undefined }));
  return { ...table, rows: out };
}

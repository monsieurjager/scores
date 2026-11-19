// Avant-match : série en cours, moyennes de buts, bilan des confrontations, bilan des points au rugby.
import type { FormResult, HeadToHead, Match, MatchEvent, SummaryStat } from '../types';

/** « 3 victoires de suite », « Invaincu depuis 5 matchs », « 2 défaites de suite »… (forme la plus récente d'abord). */
export function streak(form: FormResult[]): string | null {
  const f = [...form].sort((a, b) => b.date.localeCompare(a.date));
  if (f.length < 2) return null;
  const run = (pred: (r: FormResult) => boolean) => {
    let n = 0;
    while (n < f.length && pred(f[n])) n++;
    return n;
  };
  const w = run((r) => r.result === 'W');
  const l = run((r) => r.result === 'L');
  const unbeaten = run((r) => r.result !== 'L');
  const winless = run((r) => r.result !== 'W');
  if (w >= 2) return `${w} victoires de suite`;
  if (l >= 2) return `${l} défaites de suite`;
  if (unbeaten >= 3) return `Invaincu depuis ${unbeaten} matchs`;
  if (winless >= 3) return `Sans victoire depuis ${winless} matchs`;
  return null;
}

/** Moyennes de buts marqués / encaissés sur la forme récente. */
export function averages(form: FormResult[]): { gf: number; ga: number } | null {
  const f = form.filter((r) => r.gf != null && r.ga != null);
  if (f.length < 2) return null;
  const sum = (k: 'gf' | 'ga') => f.reduce((s, r) => s + (r[k] ?? 0), 0) / f.length;
  return { gf: Math.round(sum('gf') * 10) / 10, ga: Math.round(sum('ga') * 10) / 10 };
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Bilan des confrontations directes, du point de vue des deux équipes du match (null si les noms ne correspondent pas). */
export function h2hRecord(h2h: HeadToHead[], home: string, away: string): { home: number; draw: number; away: number } | null {
  const rec = { home: 0, draw: 0, away: 0 };
  let seen = 0;
  for (const g of h2h) {
    const hs = Number(g.homeScore);
    const as = Number(g.awayScore);
    if (!Number.isFinite(hs) || !Number.isFinite(as) || g.homeScore === '' || g.awayScore === '') continue;
    const gh = norm(g.home);
    const ga = norm(g.away);
    const isHome = (n: string) => n === norm(home);
    const isAway = (n: string) => n === norm(away);
    if (!((isHome(gh) && isAway(ga)) || (isAway(gh) && isHome(ga)))) continue;
    seen++;
    if (hs === as) rec.draw++;
    else if ((hs > as) === isHome(gh)) rec.home++;
    else rec.away++;
  }
  return seen ? rec : null;
}

/** Rugby (ESPN ne donne pas de statistiques) : bilan calculé à partir des faits de match. */
export function rugbyBreakdown(m: Match, events: MatchEvent[]): SummaryStat[] {
  const count = (teamId: string, kinds: string[]) => events.filter((e) => e.teamId === teamId && kinds.includes(e.kind)).length;
  const rows: [string, string, string[]][] = [
    ['tries', 'Essais', ['try', 'penaltytry']],
    ['conv', 'Transformations', ['conversion']],
    ['pen', 'Pénalités', ['penaltygoal']],
    ['drop', 'Drops', ['dropgoal']],
    ['yellow', 'Cartons jaunes', ['yellow']],
    ['red', 'Cartons rouges', ['red']],
  ];
  return rows
    .map(([key, label, kinds]) => ({ key, label, home: count(m.home.id, kinds), away: count(m.away.id, kinds) }))
    .filter((s) => s.home + s.away > 0 || s.key === 'tries');
}

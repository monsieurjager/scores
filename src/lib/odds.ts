// Paris « probables » : les lignes de cotes réellement proposées (résultat, handicap, total), rédigées en
// français, gardées si leur cote est comprise entre 1,30 et 2,00. Aucune cote inventée : seules les doubles
// chances sont calculées (à partir des cotes 1 N 2) et signalées comme telles.
import type { Odds, SportId } from '../types';

export interface Pick {
  text: string;
  odds: number;
  /** Cote calculée à partir d'autres cotes (double chance) */
  derived?: boolean;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function picks(o: Odds, home: string, away: string, sport: SportId, min = 1.3, max = 2): Pick[] {
  const unit = (n: number) => (sport === 'rugby' ? (n > 1 ? 'points' : 'point') : n > 1 ? 'buts' : 'but');
  const out: Pick[] = [];
  const add = (text: string, odds?: number, derived = false) => {
    if (odds && odds > 1) out.push({ text, odds: r2(odds), ...(derived ? { derived } : {}) });
  };

  add(`${home} gagne`, o.home);
  add(`${away} gagne`, o.away);
  add('Match nul', o.draw);
  if (o.draw && o.home && o.away) {
    add(`${home} ne perd pas`, 1 / (1 / o.home + 1 / o.draw), true);
    add(`${away} ne perd pas`, 1 / (1 / o.away + 1 / o.draw), true);
    add('Pas de match nul', 1 / (1 / o.home + 1 / o.away), true);
  }

  // Handicap : ligne en x,5 du point de vue de l'équipe (−2,5 : gagner par 3 d'écart ou plus)
  const handicap = (team: string, line: number, odds?: number) => {
    if (Math.abs(line % 1) !== 0.5) return;
    if (line < 0) {
      const n = Math.ceil(-line);
      add(n === 1 ? `${team} gagne` : `${team} gagne par ${n} ${unit(n)} d'écart ou plus`, odds);
    } else {
      const n = Math.floor(line);
      add(n === 0 ? `${team} ne perd pas` : `${team} ne perd pas par plus de ${n} ${unit(n)}`, odds);
    }
  };
  if (o.spread) {
    handicap(home, o.spread.line, o.spread.home);
    handicap(away, -o.spread.line, o.spread.away);
  }

  if (o.total && Math.abs(o.total.line % 1) === 0.5) {
    const up = Math.ceil(o.total.line);
    const down = Math.floor(o.total.line);
    add(`Au moins ${up} ${unit(up)} dans le match`, o.total.over);
    if (down > 0) add(`${down} ${unit(down)} ou moins dans le match`, o.total.under);
  }

  // Même pari proposé deux fois : on garde la vraie cote plutôt que la cote calculée
  const best = new Map<string, Pick>();
  for (const p of out) {
    const prev = best.get(p.text);
    if (!prev || (prev.derived && !p.derived)) best.set(p.text, p);
  }
  return [...best.values()].filter((p) => p.odds >= min && p.odds <= max).sort((a, b) => a.odds - b.odds);
}

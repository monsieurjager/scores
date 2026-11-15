import type { LineupPlayer } from '../types';

/** Position d'un joueur sur le terrain : x de 0 (gauche) à 1 (droite), ligne de 0 (gardien / arrière) vers l'avant. */
export interface Placed {
  player: LineupPlayer;
  x: number;
  line: number;
}

// Profondeur (du but vers l'attaque) selon le poste ESPN
function depth(pos = ''): number {
  const p = pos.toUpperCase();
  if (p === 'G' || p === 'GK') return 0;
  if (/^(CD|CB|SW|LB|RB)/.test(p)) return 1;
  if (/WB/.test(p)) return 1.5;
  if (/^DM/.test(p)) return 2;
  if (/^CM/.test(p)) return 2.5;
  if (/^(LM|RM)$/.test(p)) return 2.6;
  if (/^AM/.test(p)) return 3;
  if (/^(LW|RW)$/.test(p)) return 3.5;
  if (/^(F|CF|ST|SS|LF|RF)/.test(p)) return 4;
  return 2.5;
}

// Latéralité : de -2 (côté gauche) à +2 (côté droit)
function side(pos = ''): number {
  const p = pos.toUpperCase();
  if (/-L$/.test(p)) return -1;
  if (/-R$/.test(p)) return 1;
  if (/^L/.test(p)) return -2;
  if (/^R/.test(p)) return 2;
  return 0;
}

const spread = (n: number) => Array.from({ length: n }, (_, i) => (n === 1 ? 0.5 : 0.12 + (0.76 * i) / (n - 1)));

/**
 * Foot : place les 11 titulaires selon la formation (« 4-3-3 » → lignes de 4, 3, 3 derrière le gardien).
 * Les joueurs sont triés du but vers l'attaque d'après leur poste, puis répartis de gauche à droite.
 */
export function layoutFootball(starters: LineupPlayer[], formation?: string): Placed[] {
  if (starters.length === 0) return [];
  const sorted = [...starters].sort((a, b) => depth(a.position) - depth(b.position) || side(a.position) - side(b.position));
  const [keeper, ...field] = depth(sorted[0].position) === 0 ? sorted : [undefined, ...sorted];
  let lines = (formation ?? '').split('-').map(Number).filter((n) => n > 0);
  if (lines.reduce((s, n) => s + n, 0) !== field.length) {
    // Formation absente ou incohérente : on regroupe par profondeur de poste.
    const groups = new Map<number, number>();
    for (const p of field) groups.set(Math.round(depth(p!.position)), (groups.get(Math.round(depth(p!.position))) ?? 0) + 1);
    lines = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
  }
  const out: Placed[] = [];
  if (keeper) out.push({ player: keeper, x: 0.5, line: 0 });
  let i = 0;
  lines.forEach((n, li) => {
    const row = field.slice(i, i + n).sort((a, b) => side(a!.position) - side(b!.position));
    i += n;
    spread(row.length).forEach((x, k) => out.push({ player: row[k]!, x, line: li + 1 }));
  });
  return out;
}

/** Rugby : postes fixés par les numéros 1 à 15 (piliers et talonneur devant, arrière au fond). */
const RUGBY: Record<number, [number, number]> = {
  1: [0.3, 6], 2: [0.5, 6], 3: [0.7, 6],
  4: [0.4, 5], 5: [0.6, 5],
  6: [0.22, 4], 8: [0.5, 4], 7: [0.78, 4],
  9: [0.42, 3], 10: [0.3, 2.3],
  12: [0.5, 1.8], 13: [0.7, 1.45],
  11: [0.1, 1.05], 14: [0.9, 1.05],
  15: [0.5, 0.4],
};

export function layoutRugby(players: LineupPlayer[]): Placed[] {
  return players
    .map((p) => ({ p, n: Number(p.number) }))
    .filter(({ n }) => RUGBY[n])
    .map(({ p, n }) => ({ player: p, x: RUGBY[n][0], line: RUGBY[n][1] }));
}

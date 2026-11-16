// Note des joueurs (football), estimée à partir des statistiques individuelles fournies par ESPN.
// ESPN ne publie pas de note : celle-ci est un barème simple et transparent, sur la base de 6,3.

export interface PlayerStats {
  goals: number;
  assists: number;
  shotsOnTarget: number;
  saves: number;
  goalsConceded: number;
  foulsCommitted: number;
  foulsSuffered: number;
  yellow: number;
  red: number;
  ownGoals: number;
}

export type Role = 'gk' | 'def' | 'mid' | 'att';

/** Poste ESPN (« G », « CD-L », « RB », « CM », « F »…) → rôle. */
export function roleOf(pos?: string): Role {
  const p = (pos ?? '').toUpperCase();
  if (p === 'G' || p === 'GK') return 'gk';
  if (/^(D|CD|CB|LB|RB|LWB|RWB|SW)/.test(p)) return 'def';
  if (/^(F|ST|CF|LW|RW|S)/.test(p)) return 'att';
  return 'mid';
}

export function rate(s: PlayerStats, role: Role, result: 'W' | 'D' | 'L', starter: boolean): number {
  let r = 6.3;
  r += s.goals * (role === 'gk' || role === 'def' ? 1.2 : 1.0);
  r += s.assists * 0.7;
  r += Math.max(0, s.shotsOnTarget - s.goals) * 0.2;
  r += s.foulsSuffered * 0.05 - s.foulsCommitted * 0.05;
  r -= s.yellow * 0.3 + s.red * 1.5 + s.ownGoals * 0.6;
  if (role === 'gk') r += s.saves * 0.3 - s.goalsConceded * 0.35 + (starter && s.goalsConceded === 0 ? 0.5 : 0);
  if (role === 'def') r += -s.goalsConceded * 0.15 + (starter && s.goalsConceded === 0 ? 0.3 : 0);
  r += result === 'W' ? 0.3 : result === 'L' ? -0.3 : 0;
  return Math.round(Math.min(10, Math.max(3, r)) * 10) / 10;
}

/** Classe de couleur, comme les applis de scores : ≥ 8 excellent, ≥ 7 bon, ≥ 6 moyen, sinon faible. */
export const ratingTone = (r: number) => (r >= 8 ? 'top' : r >= 7 ? 'good' : r >= 6 ? 'avg' : 'low');


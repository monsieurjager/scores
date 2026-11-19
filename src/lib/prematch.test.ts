import { describe, expect, it } from 'vitest';
import { averages, h2hRecord, streak } from './prematch';

const F = (result: 'W' | 'D' | 'L', date: string, gf = 1, ga = 0) => ({ result, score: `${gf}-${ga}`, opponent: 'X', date, gf, ga });

describe('avant-match', () => {
  it('série en cours (le plus récent compte en premier)', () => {
    expect(streak([F('L', '2026-10-01'), F('W', '2026-10-08'), F('W', '2026-10-15'), F('W', '2026-10-22')])).toBe('3 victoires de suite');
    expect(streak([F('W', '2026-10-01'), F('D', '2026-10-08'), F('W', '2026-10-15'), F('D', '2026-10-22')])).toBe('Invaincu depuis 4 matchs');
    expect(streak([F('W', '2026-10-01'), F('L', '2026-10-08')])).toBe(null);
  });
  it('moyennes de buts', () => {
    expect(averages([F('W', 'a', 2, 1), F('L', 'b', 0, 2), F('D', 'c', 1, 1)])).toEqual({ gf: 1, ga: 1.3 });
  });
  it('bilan des confrontations', () => {
    const h = [
      { date: '', home: 'France', away: 'Belgique', homeScore: '2', awayScore: '1' },
      { date: '', home: 'Belgique', away: 'France', homeScore: '1', awayScore: '1' },
      { date: '', home: 'Belgique', away: 'France', homeScore: '3', awayScore: '0' },
    ];
    expect(h2hRecord(h, 'France', 'Belgique')).toEqual({ home: 1, draw: 1, away: 1 });
    expect(h2hRecord(h, 'Italie', 'Espagne')).toBe(null);
  });
});

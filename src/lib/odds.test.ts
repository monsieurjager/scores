import { describe, expect, it } from 'vitest';
import { picks } from './odds';

describe('paris probables (cotes entre 1,30 et 2,00)', () => {
  it('France–Turquie : handicap, total et doubles chances rédigés en français', () => {
    const p = picks({ home: 1.15, draw: 7.5, away: 12, spread: { line: -2.5, home: 2, away: 1.71 }, total: { line: 3.5, over: 1.65, under: 2.25 } }, 'France', 'Turquie', 'football');
    expect(p.map((x) => [x.text, x.odds])).toEqual([
      ['Au moins 4 buts dans le match', 1.65],
      ['Turquie ne perd pas par plus de 2 buts', 1.71],
      ['France gagne par 3 buts d\'écart ou plus', 2],
    ]);
  });
  it('match serré : doubles chances calculées et signalées', () => {
    const p = picks({ home: 2.4, draw: 3.2, away: 3 }, 'PSG', 'Marseille', 'football');
    const dc = p.find((x) => x.text === 'PSG ne perd pas');
    expect(dc?.odds).toBe(1.37);
    expect(dc?.derived).toBe(true);
  });
  it('rugby : écart en points', () => {
    const p = picks({ home: 1.5, away: 2.7, spread: { line: -6.5, home: 1.9, away: 1.9 } }, 'France', 'Irlande', 'rugby');
    expect(p.map((x) => x.text)).toContain("France gagne par 7 points d'écart ou plus");
    expect(p.map((x) => x.text)).toContain('France gagne');
  });
});

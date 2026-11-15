import { describe, expect, it } from 'vitest';
import { decimalOdds, rate, roleOf } from './ratings';

const zero = { goals: 0, assists: 0, shotsOnTarget: 0, saves: 0, goalsConceded: 0, foulsCommitted: 0, foulsSuffered: 0, yellow: 0, red: 0, ownGoals: 0 };

describe('notes des joueurs', () => {
  it('rôle selon le poste ESPN', () => {
    expect(roleOf('G')).toBe('gk');
    expect(roleOf('CD-L')).toBe('def');
    expect(roleOf('RB')).toBe('def');
    expect(roleOf('CM')).toBe('mid');
    expect(roleOf('F')).toBe('att');
  });
  it('base 6,3 ; un buteur dans une équipe qui gagne monte au-dessus de 7', () => {
    expect(rate(zero, 'mid', 'D', true)).toBe(6.3);
    expect(rate({ ...zero, goals: 1, shotsOnTarget: 1 }, 'att', 'W', false)).toBe(7.6);
  });
  it('carton rouge et défaite font chuter la note', () => {
    expect(rate({ ...zero, red: 1 }, 'def', 'L', true)).toBeLessThan(5);
  });
  it('gardien : arrêts et clean sheet', () => {
    expect(rate({ ...zero, saves: 4 }, 'gk', 'W', true)).toBe(8.3);
  });
});

describe('cotes', () => {
  it('cote américaine → décimale', () => {
    expect(decimalOdds(-650)).toBe(1.15);
    expect(decimalOdds(1100)).toBe(12);
    expect(decimalOdds(650)).toBe(7.5);
    expect(decimalOdds(-150)).toBe(1.67);
  });
});

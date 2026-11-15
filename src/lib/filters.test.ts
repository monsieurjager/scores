import { describe, expect, it } from 'vitest';
import type { Match } from '../types';
import { effectiveComp, isFranceMatch, isOtherNation, matchesFilter } from './filters';

const m = (competitionId: string, home: string, away: string): Match => ({ id: `${competitionId}-${home}-${away}`, competitionId, kickoff: '2026-11-15T19:45:00Z', status: 'scheduled', home: { id: home, name: home, short: home }, away: { id: away, name: away, short: away } });
const psgOm = m('l1', 'PSG', 'OM');
const turFra = m('ldn', 'TUR', 'FRA');
const espEng = m('ldn', 'ESP', 'ENG');
const fraArg = m('nations', 'FRA', 'ARG');
const top14 = m('top14', 'TOU', 'CLE');

describe('filtres de l\'écran Scores', () => {
  it('« Tout » affiche tout', () => {
    expect([psgOm, turFra, espEng, fraArg, top14].every((x) => matchesFilter(x, 'all', 'all'))).toBe(true);
  });
  it('par sport', () => {
    expect(matchesFilter(psgOm, 'rugby', 'all')).toBe(false);
    expect(matchesFilter(top14, 'rugby', 'all')).toBe(true);
  });
  it('« Les Bleus » : seulement les matchs de la France', () => {
    expect(matchesFilter(turFra, 'football', 'bleus')).toBe(true);
    expect(matchesFilter(espEng, 'football', 'bleus')).toBe(false);
    expect(matchesFilter(psgOm, 'football', 'bleus')).toBe(false);
    expect(matchesFilter(fraArg, 'rugby', 'bleus')).toBe(true);
  });
  it('« Sélections » : toutes les sélections, pas les clubs', () => {
    expect(matchesFilter(espEng, 'football', 'selections')).toBe(true);
    expect(matchesFilter(psgOm, 'football', 'selections')).toBe(false);
  });
  it('une compétition choisie ne reste pas active en revenant sur « Tout » (bug corrigé)', () => {
    expect(effectiveComp('all', 'l1', ['all', 'l1'])).toBe('all');
    expect(effectiveComp('football', 'l1', ['all', 'l1'])).toBe('l1');
    expect(effectiveComp('rugby', 'l1', ['all', 'top14'])).toBe('all');
  });
  it('distingue la France des autres sélections', () => {
    expect(isFranceMatch(turFra)).toBe(true);
    expect(isOtherNation(espEng)).toBe(true);
    expect(isFranceMatch(psgOm) || isOtherNation(psgOm)).toBe(false);
  });
});

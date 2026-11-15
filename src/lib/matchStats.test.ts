import { describe, expect, it } from 'vitest';
import type { Match, MatchEvent } from '../types';
import { halfTimeScore, isStale } from './matchStats';

const ev = (teamId: string, clock: string, points = 1, kind: MatchEvent['kind'] = 'goal'): MatchEvent => ({ id: clock + teamId, kind, clock, seconds: parseInt(clock) * 60, teamId, points });
const match = (o: Partial<Match>): Match => ({ id: 'x', competitionId: 'l1', kickoff: '2026-11-07T20:00:00Z', status: 'finished', home: { id: 'H', name: 'Domicile', short: 'DOM' }, away: { id: 'A', name: 'Extérieur', short: 'EXT' }, ...o });

describe('score à la mi-temps', () => {
  it('compte les buts de la première période, temps additionnel compris', () => {
    const m = match({ homeScore: 2, awayScore: 1, events: [ev('H', "23'"), ev('A', "45+2'"), ev('H', "79'")] });
    expect(halfTimeScore(m, 'football')).toEqual({ home: 1, away: 1 });
  });
  it('ignore les cartons', () => {
    const m = match({ homeScore: 1, awayScore: 0, events: [ev('A', "12'", 0, 'yellow'), ev('H', "60'")] });
    expect(halfTimeScore(m, 'football')).toEqual({ home: 0, away: 0 });
  });
  it('rugby : mi-temps à 40 minutes, points des essais et transformations', () => {
    const m = match({ homeScore: 21, awayScore: 19, events: [ev('H', "15'", 5, 'try'), ev('H', "16'", 2, 'conversion'), ev('A', "38'", 3, 'penaltygoal'), ev('H', "55'", 5, 'try'), ev('H', "56'", 2, 'conversion'), ev('A', "70'", 5, 'try'), ev('A', "71'", 2, 'conversion'), ev('A', "79'", 5, 'try'), ev('A', "80'", 2, 'conversion'), ev('A', "41'", 2, 'conversion'), ev('H', "65'", 5, 'try'), ev('H', "66'", 2, 'conversion')] });
    expect(halfTimeScore(m, 'rugby')).toEqual({ home: 7, away: 3 });
  });
  it('ne donne rien si les faits ne collent pas au score (essai de pénalité manquant chez la source)', () => {
    const m = match({ homeScore: 54, awayScore: 17, events: [ev('H', "10'", 5, 'try'), ev('A', "20'", 3, 'penaltygoal')] });
    expect(halfTimeScore(m, 'rugby')).toBeNull();
  });
  it('ne donne rien avant la pause', () => {
    const m = match({ status: 'live', clock: "30'", homeScore: 1, awayScore: 0, events: [ev('H', "12'")] });
    expect(halfTimeScore(m, 'football')).toBeNull();
  });
});

describe('match resté « à venir » chez la source', () => {
  it('est signalé 4 h après le coup d\'envoi seulement', () => {
    expect(isStale(match({ status: 'scheduled', kickoff: new Date(Date.now() - 5 * 3_600_000).toISOString() }))).toBe(true);
    expect(isStale(match({ status: 'scheduled', kickoff: new Date(Date.now() - 1 * 3_600_000).toISOString() }))).toBe(false);
    expect(isStale(match({ status: 'finished', kickoff: new Date(Date.now() - 9 * 3_600_000).toISOString() }))).toBe(false);
  });
});

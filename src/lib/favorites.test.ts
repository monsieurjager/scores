import { describe, expect, it } from 'vitest';
import type { Match } from '../types';
import { favKey, isFavMatch } from './favorites';

const m = (competitionId: string, home: string, away: string): Match => ({ id: 'x', competitionId, kickoff: '2026-11-15T19:45:00Z', status: 'scheduled', home: { id: home, name: home, short: home }, away: { id: away, name: away, short: away } });

describe('favoris', () => {
  it('reconnaît un match d\'une équipe favorite, à domicile comme à l\'extérieur', () => {
    const keys = new Set([favKey('football', '478')]);
    expect(isFavMatch(m('ldn', '465', '478'), keys)).toBe(true);
    expect(isFavMatch(m('ldn', '478', '465'), keys)).toBe(true);
  });
  it('ne confond pas le même identifiant dans un autre sport', () => {
    // « 9 » = France au rugby ; un club de foot pourrait avoir le même identifiant ESPN
    expect(isFavMatch(m('l1', '9', '160'), new Set([favKey('rugby', '9')]))).toBe(false);
    expect(isFavMatch(m('nations', '9', '5'), new Set([favKey('rugby', '9')]))).toBe(true);
  });
});

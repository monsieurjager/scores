import { describe, expect, it } from 'vitest';
import { competitionById } from '../config/competitions';
import { normalize, type EspnEvent } from './espn';

const event = (o: { state?: 'pre' | 'in' | 'post'; name?: string; clock?: string; home?: [string, string, string]; away?: [string, string, string]; hs?: string; as?: string; details?: unknown[] } = {}): EspnEvent => ({
  id: '42',
  date: '2026-11-15T19:45Z',
  status: { displayClock: o.clock ?? "67'", type: { name: o.name ?? 'STATUS_SECOND_HALF', state: o.state ?? 'in' } },
  competitions: [
    {
      competitors: [
        { homeAway: 'home', score: o.hs ?? '1', team: { id: o.home?.[0] ?? '160', displayName: o.home?.[1] ?? 'Paris Saint-Germain', abbreviation: o.home?.[2] ?? 'PSG' } },
        { homeAway: 'away', score: o.as ?? '0', team: { id: o.away?.[0] ?? '176', displayName: o.away?.[1] ?? 'Marseille', abbreviation: o.away?.[2] ?? 'MAR' } },
      ],
      details: o.details as never,
    },
  ],
});

describe('lecture des données ESPN', () => {
  const l1 = competitionById('l1')!;
  it('match en cours : statut, minute, score', () => {
    const m = normalize(event(), l1)!;
    expect(m).toMatchObject({ id: 'l1-42', status: 'live', clock: "67'", homeScore: 1, awayScore: 0 });
  });
  it('mi-temps affichée « MT », temps additionnel « 45+2\' »', () => {
    expect(normalize(event({ name: 'STATUS_HALFTIME' }), l1)!.clock).toBe('MT');
    expect(normalize(event({ clock: "45'+2'" }), l1)!.clock).toBe("45+2'");
  });
  it('match à venir : pas de score', () => {
    const m = normalize(event({ state: 'pre', name: 'STATUS_SCHEDULED' }), l1)!;
    expect(m.status).toBe('scheduled');
    expect(m.homeScore).toBeUndefined();
  });
  it('match reporté', () => {
    expect(normalize(event({ state: 'pre', name: 'STATUS_POSTPONED' }), l1)!.status).toBe('postponed');
  });
  it('buts et cartons dans l\'ordre, but contre son camp et penalty reconnus', () => {
    const m = normalize(event({ details: [
      { type: { text: 'Goal' }, clock: { value: 4800, displayValue: "80'" }, team: { id: '176' }, scoringPlay: true, ownGoal: true, athletesInvolved: [{ shortName: 'A. Joueur' }] },
      { type: { text: 'Yellow Card' }, clock: { value: 600, displayValue: "10'" }, team: { id: '160' }, yellowCard: true },
      { type: { text: 'Penalty - Scored' }, clock: { value: 1800, displayValue: "30'" }, team: { id: '160' }, scoringPlay: true, penaltyKick: true },
    ] }), l1)!;
    expect(m.events!.map((e) => `${e.clock} ${e.kind}`)).toEqual(["10' yellow", "30' penalty", "80' owngoal"]);
  });
  it('sélections : noms en français, et seules les nations suivies sont gardées', () => {
    const ldn = competitionById('ldn')!;
    const m = normalize(event({ home: ['465', 'Türkiye', 'TUR'], away: ['478', 'France', 'FRA'] }), ldn)!;
    expect([m.home.name, m.away.name]).toEqual(['Turquie', 'France']);
    expect(normalize(event({ home: ['1', 'Cyprus', 'CYP'], away: ['2', 'Montenegro', 'MNE'] }), ldn)).toBeNull();
  });
  it('coupes d\'Europe de rugby : seulement les matchs des clubs français', () => {
    const rcc = competitionById('rcc')!;
    const toulouseId = rcc.onlyTeamIds![0];
    expect(normalize(event({ home: ['999', 'Leinster', 'LEI'], away: ['998', 'Bulls', 'BUL'] }), rcc)).toBeNull();
    expect(normalize(event({ home: ['999', 'Leinster', 'LEI'], away: [toulouseId, 'Club FR', 'CFR'] }), rcc)).not.toBeNull();
  });
});

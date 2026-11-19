import { describe, expect, it } from 'vitest';
import type { Match, StandingsTable } from '../types';
import { applyLive, matchPoints } from './liveTable';

const T = (id: string) => ({ id, name: id, short: id });
const row = (rank: number, id: string, points: number, diff: string) => ({ rank, team: T(id), played: 10, won: 5, drawn: 2, lost: 3, diff, points });
const table: StandingsTable = { title: 'Ligue 1', rows: [row(1, 'A', 23, '+12'), row(2, 'B', 21, '+7'), row(3, 'C', 20, '+7'), row(4, 'D', 18, '+8')] };
const live = (home: string, away: string, hs: number, as: number): Match => ({ id: `${home}${away}`, competitionId: 'l1', kickoff: '2026-11-21T20:00:00Z', status: 'live', clock: "67'", home: T(home), away: T(away), homeScore: hs, awayScore: as });

describe('classement en direct', () => {
  it('ajoute le match en cours et reclasse, avec les places gagnées ou perdues', () => {
    const t = applyLive(table, [live('C', 'A', 2, 0)], 'football');
    expect(t.rows.map((r) => [r.team.id, r.rank, r.points, r.diff])).toEqual([
      ['A', 1, 23, '+10'],
      ['C', 2, 23, '+9'],
      ['B', 3, 21, '+7'],
      ['D', 4, 18, '+8'],
    ]);
    expect(t.rows.map((r) => [r.team.id, r.live?.score ?? '', r.live?.delta ?? 0])).toEqual([
      ['A', '0–2', 0],
      ['C', '2–0', 1],
      ['B', '', -1],
      ['D', '', 0],
    ]);
  });
  it('rugby : bonus défensif et offensif', () => {
    expect(matchPoints('rugby', 20, 24, { compId: 'top14' })).toBe(1);
    expect(matchPoints('rugby', 40, 20, { compId: 'top14' })).toBe(5);
    expect(matchPoints('rugby', 30, 10, { compId: 'six', triesUs: 4 })).toBe(5);
  });
  it('sans match en cours : classement inchangé', () => {
    expect(applyLive(table, [], 'football')).toBe(table);
  });
});

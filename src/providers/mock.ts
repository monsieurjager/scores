import type { Match, MatchProvider, MatchStatus, Team } from '../types';
import { dayKeyOf, todayKey } from '../lib/date';

/** Données de démonstration (étape 1). Remplacées par ESPN à l'étape 5. */
const t = (id: string, name: string, short: string): Team => ({ id, name, short });

const FIXTURES: [string, Team, Team][] = [
  ['l1', t('psg', 'Paris Saint-Germain', 'PSG'), t('om', 'Olympique de Marseille', 'OM')],
  ['l1', t('ol', 'Olympique Lyonnais', 'OL'), t('asm', 'AS Monaco', 'ASM')],
  ['l1', t('losc', 'LOSC Lille', 'LIL'), t('rcl', 'RC Lens', 'RCL')],
  ['pl', t('ars', 'Arsenal', 'ARS'), t('che', 'Chelsea', 'CHE')],
  ['pl', t('mci', 'Manchester City', 'MCI'), t('liv', 'Liverpool', 'LIV')],
  ['liga', t('rma', 'Real Madrid', 'RMA'), t('fcb', 'FC Barcelone', 'BAR')],
  ['sa', t('int', 'Inter', 'INT'), t('juv', 'Juventus', 'JUV')],
  ['bl', t('bay', 'Bayern Munich', 'BAY'), t('bvb', 'Borussia Dortmund', 'BVB')],
  ['c1', t('ben', 'Benfica', 'BEN'), t('ajx', 'Ajax', 'AJA')],
  ['c3', t('rom', 'AS Rome', 'ROM'), t('por', 'FC Porto', 'POR')],
  ['c4', t('fio', 'Fiorentina', 'FIO'), t('bet', 'Betis', 'BET')],
  ['tests', t('fra', 'France', 'FRA'), t('nzl', 'Nouvelle-Zélande', 'NZL')],
];

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const ms = (min: number) => min * 60_000;

function build(dayKey: string): Match[] {
  const today = todayKey();
  const now = Date.now();
  const base = new Date(`${dayKey}T12:00:00Z`).getTime();
  const slots = [13 * 60 + 0, 15 * 60 + 0, 17 * 60 + 15, 19 * 60 + 0, 21 * 60 + 0];
  const out: Match[] = [];

  FIXTURES.forEach(([competitionId, home, away], i) => {
    const h = hash(dayKey + home.id);
    if (h % 3 === 0 && dayKey !== today) return; // pas tous les jours
    const slot = slots[h % slots.length];
    // heure de Paris approx. (UTC+1) -> UTC
    const kickoffMs = new Date(`${dayKey}T00:00:00Z`).getTime() + ms(slot - 60);
    let status: MatchStatus = 'scheduled';
    let clock: string | undefined;
    let hs: number | undefined;
    let as: number | undefined;

    if (dayKey === today) {
      // on place quelques matchs en direct autour de « maintenant »
      const off = [-30, -70, -130, 20, 90, -200, 40, -55, 150, 10, 60, -10][i];
      const k = now + ms(off);
      const elapsed = Math.round((now - k) / 60000);
      out.push(mk(k, elapsed));
      return;
    }
    if (kickoffMs < now - ms(120)) status = 'finished';
    if (status === 'finished') {
      hs = h % 4;
      as = (h >>> 3) % 3;
    }
    out.push({ id: `${competitionId}-${dayKey}-${i}`, competitionId, kickoff: new Date(kickoffMs).toISOString(), status, clock, home, away, homeScore: hs, awayScore: as });

    function mk(k: number, elapsed: number): Match {
      const rugby = competitionId === 'tests';
      const length = rugby ? 80 : 90;
      let st: MatchStatus = 'scheduled';
      let c: string | undefined;
      let a: number | undefined;
      let b: number | undefined;
      if (elapsed >= length + 15) {
        st = 'finished';
      } else if (elapsed >= 0) {
        st = 'live';
        const half = length / 2;
        if (elapsed > half && elapsed < half + 15) c = 'MT';
        else if (elapsed >= half + 15) c = `${Math.min(elapsed - 15, length)}'`;
        else c = `${elapsed + 1}'`;
      }
      if (st !== 'scheduled') {
        const f = st === 'finished' ? 1 : Math.min(1, Math.max(0.2, elapsed / length));
        a = Math.round((rugby ? 24 : 2.4) * f * ((h % 5) / 3 + 0.4));
        b = Math.round((rugby ? 17 : 1.6) * f * (((h >>> 2) % 5) / 3 + 0.3));
      }
      return { id: `${competitionId}-${dayKey}-${i}`, competitionId, kickoff: new Date(k).toISOString(), status: st, clock: c, home, away, homeScore: a, awayScore: b };
    }
  });
  void base;
  return out.filter((m) => dayKeyOf(m.kickoff) === dayKey || dayKey === today).sort((x, y) => x.kickoff.localeCompare(y.kickoff));
}

export const mockProvider: MatchProvider = {
  async getMatches(dayKey, signal) {
    await new Promise((r) => setTimeout(r, 700));
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const q = new URLSearchParams(location.search);
    if (q.has('error')) throw new Error('Simulated failure');
    if (q.has('empty')) return [];
    return build(dayKey);
  },
};

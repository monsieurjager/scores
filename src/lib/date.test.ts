import { describe, expect, it } from 'vitest';
import { addDays, dayKeyOf, dayLabel, formatShortDate, formatTime, todayKey } from './date';

describe('dates (heure de Paris)', () => {
  it('rattache un match au bon jour à Paris, même tard le soir en heure universelle', () => {
    expect(dayKeyOf('2026-11-14T23:30:00Z')).toBe('2026-11-15'); // 00 h 30 à Paris (hiver, UTC+1)
    expect(dayKeyOf('2026-07-04T22:30:00Z')).toBe('2026-07-05'); // 00 h 30 à Paris (été, UTC+2)
    expect(dayKeyOf('2026-11-14T22:59:00Z')).toBe('2026-11-14');
  });
  it('ajoute des jours en changeant de mois et d\'année', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('formate les heures à la française', () => {
    expect(formatTime('2026-11-15T19:45:00Z')).toBe('20 h 45');
    expect(formatTime('2026-11-21T20:00:00Z')).toBe('21 h');
  });
  it('écrit « Hier », « Aujourd\'hui », « Demain », sinon la date avec majuscule', () => {
    const t = todayKey();
    expect(dayLabel(t)).toBe("Aujourd'hui");
    expect(dayLabel(addDays(t, -1))).toBe('Hier');
    expect(dayLabel(addDays(t, 1))).toBe('Demain');
    expect(dayLabel('2020-01-04')).toBe('Samedi 4 janvier');
  });
  it('ajoute l\'année aux dates d\'une autre année', () => {
    expect(formatShortDate('2030-10-02T07:45:00Z')).toMatch(/2030/);
  });
});

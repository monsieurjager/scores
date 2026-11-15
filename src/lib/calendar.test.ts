import { beforeEach, describe, expect, it } from 'vitest';
import { knownRestDay, rememberCalendar, resetCalendars } from './calendar';

const now = Date.parse('2026-11-15T10:00:00Z');
const espn = (days: string[], type = 'day') => ({ leagues: [{ calendarType: type, calendar: days.map((d) => `${d}T07:00Z`) }] });

describe('calendriers des compétitions', () => {
  beforeEach(() => resetCalendars());
  it('ignore un jour sans match dans la période couverte', () => {
    rememberCalendar('l1', espn(['2026-11-07', '2026-11-08', '2026-11-21', '2026-11-22']), now);
    expect(knownRestDay('l1', '2026-11-15', now)).toBe(true);
    expect(knownRestDay('l1', '2026-11-21', now)).toBe(false);
  });
  it('interroge toujours hors de la période connue (calendrier périmé, ex. saison précédente)', () => {
    rememberCalendar('top14', espn(['2025-09-06', '2026-06-27']), now);
    expect(knownRestDay('top14', '2026-11-07', now)).toBe(false);
  });
  it('interroge toujours si le calendrier date de plus de 24 h ou est inconnu', () => {
    rememberCalendar('l1', espn(['2026-11-07', '2026-11-21']), now - 25 * 3_600_000);
    expect(knownRestDay('l1', '2026-11-15', now)).toBe(false);
    expect(knownRestDay('c1', '2026-11-15', now)).toBe(false);
  });
  it('ne tient pas compte des calendriers de type « liste » (sans dates)', () => {
    rememberCalendar('c1', { leagues: [{ calendarType: 'list', calendar: [{ label: 'UEFA Champions League' }] }] }, now);
    expect(knownRestDay('c1', '2026-11-15', now)).toBe(false);
  });
});

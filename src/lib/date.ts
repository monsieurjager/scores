export const TZ = 'Europe/Paris';

const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

/** « 2026-11-14 » pour un instant donné, vu depuis Paris. */
export const dayKeyOf = (d: Date | string) => keyFmt.format(typeof d === 'string' ? new Date(d) : d);
export const todayKey = () => dayKeyOf(new Date());
export const formatTime = (iso: string) => timeFmt.format(new Date(iso)).replace(':', ' h ').replace(/ h 00$/, ' h');

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function dayLabel(key: string): string {
  const t = todayKey();
  if (key === t) return "Aujourd'hui";
  if (key === addDays(t, -1)) return 'Hier';
  if (key === addDays(t, 1)) return 'Demain';
  const [y, m, d] = key.split('-').map(Number);
  const s = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const isRelativeDay = (key: string) => key === todayKey() || key === addDays(todayKey(), -1) || key === addDays(todayKey(), 1);

export function dayLong(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const s = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const shortFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const shortYearFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
/** « sam. 21 nov. » — avec l'année si ce n'est pas l'année en cours. */
export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.getFullYear() === new Date().getFullYear() ? shortFmt.format(d) : shortYearFmt.format(d);
}

const shortTitleFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
/** Titre court d'un jour : « Aujourd'hui », « Hier », « Demain », sinon « Mer. 18 nov. ». */
export function dayTitle(key: string): string {
  if (isRelativeDay(key)) return dayLabel(key);
  const [y, m, d] = key.split('-').map(Number);
  const s = shortTitleFmt.format(new Date(Date.UTC(y, m - 1, d)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const weekdayFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short' });
/** « LUN », « MAR »… pour la bande des jours. */
export function weekdayShort(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return weekdayFmt.format(new Date(Date.UTC(y, m - 1, d))).replace('.', '').toUpperCase();
}

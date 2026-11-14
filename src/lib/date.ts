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
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function dayLong(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const s = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
  return s.charAt(0).toUpperCase() + s.slice(1);
}

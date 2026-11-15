/**
 * Calendriers des compétitions (jours de match), récupérés dans les réponses ESPN déjà téléchargées.
 * Sert à ne pas interroger une compétition qui ne joue pas ce jour-là.
 * Règle prudente : on n'ignore une compétition que si son calendrier est récent (< 24 h) ET couvre la date
 * demandée (entre son premier et son dernier jour connus). Un calendrier périmé (ex. saison précédente)
 * ne fait donc jamais disparaître de match : la compétition est simplement interrogée.
 */
const KEY = 'espn-calendars.v1';
const MAX_AGE = 24 * 3_600_000;

interface Cal {
  at: number;
  days: string[]; // AAAA-MM-JJ (jours ESPN), triés
}

let cals: Record<string, Cal> = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Cal>;
  } catch {
    return {};
  }
})();

let saveTimer: ReturnType<typeof setTimeout> | undefined;
const save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(cals));
    } catch {
      /* stockage indisponible */
    }
  }, 500);
};

/** Mémorise le calendrier présent dans une réponse ESPN (type « day » uniquement). */
export function rememberCalendar(compId: string, json: unknown, now = Date.now()) {
  const league = (json as { leagues?: { calendarType?: string; calendar?: unknown[] }[] })?.leagues?.[0];
  if (league?.calendarType !== 'day' || !Array.isArray(league.calendar) || league.calendar.length === 0) return;
  const days = league.calendar.filter((d): d is string => typeof d === 'string').map((d) => d.slice(0, 10)).sort();
  if (days.length === 0) return;
  cals = { ...cals, [compId]: { at: now, days } };
  save();
}

/** true si l'on sait avec certitude que la compétition ne joue pas ce jour ESPN. */
export function knownRestDay(compId: string, day: string, now = Date.now()): boolean {
  const c = cals[compId];
  if (!c || now - c.at > MAX_AGE) return false;
  if (day < c.days[0] || day > c.days[c.days.length - 1]) return false; // hors de la période connue
  return !c.days.includes(day);
}

/** Pour les tests. */
export const resetCalendars = () => {
  cals = {};
};

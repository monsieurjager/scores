import type { Competition, Match, MatchProvider, MatchStatus, Team, TeamEntry } from '../types';
import { COMPETITIONS } from '../config/competitions';
import { frenchName } from '../config/teamNames';
import { addDays, dayKeyOf } from '../lib/date';

/**
 * Adaptateur ESPN (API publique non officielle, sans clé).
 * Tout ce qui est propre au format ESPN reste dans ce fichier.
 */
const BASE = 'https://site.api.espn.com/apis/site/v2/sports';

interface EspnTeam {
  id: string;
  displayName: string;
  shortDisplayName?: string;
  abbreviation?: string;
  logo?: string;
  logos?: { href: string }[];
  color?: string;
  alternateColor?: string;
}
interface EspnCompetitor {
  homeAway: 'home' | 'away';
  score?: string;
  team: EspnTeam;
}
interface EspnEvent {
  id: string;
  date: string;
  status: { displayClock?: string; type: { name: string; state: 'pre' | 'in' | 'post' } };
  competitions: { competitors: EspnCompetitor[] }[];
}

const toTeam = (t: EspnTeam, national: boolean): Team => {
  const base = t.displayName.length > 20 && t.shortDisplayName ? t.shortDisplayName : t.displayName;
  const long = national ? frenchName(base) : base;
  // Un écusson noir disparaît sur le verre sombre : on préfère la couleur alternative.
  const dark = (hex?: string) => !hex || parseInt(hex, 16) < 0x202020;
  const color = dark(t.color) ? (dark(t.alternateColor) ? undefined : t.alternateColor) : t.color;
  return { id: t.id, name: long, short: t.abbreviation ?? long.slice(0, 3).toUpperCase(), logo: (t.logo ?? t.logos?.[0]?.href)?.replace(/^http:/, 'https:'), color };
};

function toStatus(e: EspnEvent): MatchStatus {
  const n = e.status.type.name;
  if (/POSTPONED|CANCEL|ABANDON|SUSPEND|DELAYED/.test(n)) return e.status.type.state === 'in' ? 'live' : 'postponed';
  return e.status.type.state === 'in' ? 'live' : e.status.type.state === 'post' ? 'finished' : 'scheduled';
}

function toClock(e: EspnEvent): string | undefined {
  const n = e.status.type.name;
  if (n === 'STATUS_HALFTIME') return 'MT';
  if (n === 'STATUS_END_PERIOD' || n === 'STATUS_END_OF_REGULATION') return 'Pause';
  const c = e.status.displayClock?.replace("'+", '+');
  return c && c !== "0'" ? c : 'En cours';
}

function normalize(e: EspnEvent, comp: Competition): Match | null {
  const c = e.competitions?.[0];
  const home = c?.competitors.find((x) => x.homeAway === 'home');
  const away = c?.competitors.find((x) => x.homeAway === 'away');
  if (!home || !away) return null;
  if (comp.onlyTeams && !comp.onlyTeams.some((t) => t === home.team.abbreviation || t === away.team.abbreviation)) return null;
  const status = toStatus(e);
  const hasScore = status === 'live' || status === 'finished';
  const num = (s?: string) => (hasScore && s != null && s !== '' ? Number(s) : undefined);
  return {
    id: `${comp.id}-${e.id}`,
    competitionId: comp.id,
    kickoff: new Date(e.date).toISOString(),
    status,
    clock: status === 'live' ? toClock(e) : undefined,
    home: toTeam(home.team, !!comp.onlyTeams),
    away: toTeam(away.team, !!comp.onlyTeams),
    homeScore: num(home.score),
    awayScore: num(away.score),
  };
}

async function fetchScoreboard(comp: Competition, query: string, signal?: AbortSignal): Promise<Match[]> {
  const url = `${BASE}/${comp.espn.sport}/${comp.espn.league}/scoreboard${query}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`ESPN ${comp.id}: HTTP ${res.status}`);
  const json = (await res.json()) as { events?: EspnEvent[] };
  return (json.events ?? []).map((e) => normalize(e, comp)).filter((m): m is Match => m !== null);
}

const byDay = (comp: Competition, dayKey: string, signal?: AbortSignal) => fetchScoreboard(comp, `?dates=${dayKey.replace(/-/g, '')}`, signal);

export const espnProvider: MatchProvider = {
  async getMatches(dayKey, signal, only) {
    const comps = COMPETITIONS.filter((c) => !only || only.includes(c.id));
    // ESPN découpe les jours à l'heure de la côte est des États-Unis : pour le rugby
    // (matchs tôt le matin à Paris, dans l'hémisphère sud) on lit aussi la veille.
    const jobs = comps.flatMap((c) => (c.sport === 'rugby' ? [addDays(dayKey, -1), dayKey] : [dayKey]).map((d) => byDay(c, d, signal)));
    const results = await Promise.allSettled(jobs);
    const ok = results.filter((r): r is PromiseFulfilledResult<Match[]> => r.status === 'fulfilled');
    if (ok.length === 0 && results.length > 0) throw (results[0] as PromiseRejectedResult).reason;
    const byId = new Map<string, Match>();
    for (const r of ok) for (const m of r.value) if (dayKeyOf(m.kickoff) === dayKey) byId.set(m.id, m);
    return [...byId.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  },

  async getUpcoming(signal) {
    // ESPN accepte `dates=AAAA` (année entière) ou `dates=AAAAMMJJ`, mais pas de plage de dates.
    const year = new Date().getFullYear();
    // Équipes nationales (France) : on lit l'année entière. Clubs : la journée en cours / la prochaine.
    const jobs = COMPETITIONS.flatMap((c) => (c.onlyTeams ? [year, year + 1].map((y) => fetchScoreboard(c, `?dates=${y}&limit=800`, signal)) : [fetchScoreboard(c, '', signal)]));
    const results = await Promise.allSettled(jobs);
    const ok = results.filter((r): r is PromiseFulfilledResult<Match[]> => r.status === 'fulfilled');
    if (ok.length === 0 && results.length > 0) throw (results[0] as PromiseRejectedResult).reason;
    const now = Date.now();
    const byId = new Map<string, Match>();
    for (const r of ok) for (const m of r.value) if (m.status === 'scheduled' && new Date(m.kickoff).getTime() > now) byId.set(m.id, m);
    return [...byId.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  },

  async getTeams(signal) {
    // Championnats de clubs + équipes nationales (Ligue des nations pour le foot, Championnat des Nations pour le rugby).
    const sources = COMPETITIONS.filter((c) => !c.onlyTeams || c.id === 'ldn' || c.id === 'nations');
    const results = await Promise.allSettled(
      sources.map(async (c) => {
        const res = await fetch(`${BASE}/${c.espn.sport}/${c.espn.league}/teams`, { signal });
        if (!res.ok) throw new Error(`ESPN teams ${c.id}: HTTP ${res.status}`);
        const json = (await res.json()) as { sports?: { leagues?: { teams?: { team: EspnTeam }[] }[] }[] };
        return (json.sports?.[0]?.leagues?.[0]?.teams ?? []).map((t): TeamEntry => ({ sport: c.sport, team: toTeam(t.team, !!c.onlyTeams) }));
      }),
    );
    const ok = results.filter((r): r is PromiseFulfilledResult<TeamEntry[]> => r.status === 'fulfilled');
    if (ok.length === 0) throw (results[0] as PromiseRejectedResult).reason;
    const byKey = new Map<string, TeamEntry>();
    for (const r of ok) for (const e of r.value) byKey.set(`${e.sport}:${e.team.id}`, e);
    return [...byKey.values()].sort((a, b) => a.team.name.localeCompare(b.team.name, 'fr'));
  },
};

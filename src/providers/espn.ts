import type { Competition, Match, MatchProvider, MatchStatus, Team } from '../types';
import { COMPETITIONS } from '../config/competitions';
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

const toTeam = (t: EspnTeam): Team => {
  const long = t.displayName.length > 20 && t.shortDisplayName ? t.shortDisplayName : t.displayName;
  // Un écusson noir disparaît sur le verre sombre : on préfère la couleur alternative.
  const dark = (hex?: string) => !hex || parseInt(hex, 16) < 0x202020;
  const color = dark(t.color) ? (dark(t.alternateColor) ? undefined : t.alternateColor) : t.color;
  return { id: t.id, name: long, short: t.abbreviation ?? long.slice(0, 3).toUpperCase(), logo: t.logo?.replace(/^http:/, 'https:'), color };
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
    home: toTeam(home.team),
    away: toTeam(away.team),
    homeScore: num(home.score),
    awayScore: num(away.score),
  };
}

async function fetchScoreboard(comp: Competition, dayKey: string, signal?: AbortSignal): Promise<Match[]> {
  const url = `${BASE}/${comp.espn.sport}/${comp.espn.league}/scoreboard?dates=${dayKey.replace(/-/g, '')}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`ESPN ${comp.id}: HTTP ${res.status}`);
  const json = (await res.json()) as { events?: EspnEvent[] };
  return (json.events ?? []).map((e) => normalize(e, comp)).filter((m): m is Match => m !== null);
}

export const espnProvider: MatchProvider = {
  async getMatches(dayKey, signal, only) {
    const comps = COMPETITIONS.filter((c) => !only || only.includes(c.id));
    // ESPN découpe les jours à l'heure de la côte est des États-Unis : pour le rugby
    // (matchs tôt le matin à Paris, dans l'hémisphère sud) on lit aussi la veille.
    const jobs = comps.flatMap((c) => (c.sport === 'rugby' ? [addDays(dayKey, -1), dayKey] : [dayKey]).map((d) => fetchScoreboard(c, d, signal)));
    const results = await Promise.allSettled(jobs);
    const ok = results.filter((r): r is PromiseFulfilledResult<Match[]> => r.status === 'fulfilled');
    if (ok.length === 0 && results.length > 0) throw (results[0] as PromiseRejectedResult).reason;
    const byId = new Map<string, Match>();
    for (const r of ok) for (const m of r.value) if (dayKeyOf(m.kickoff) === dayKey) byId.set(m.id, m);
    return [...byId.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  },
};

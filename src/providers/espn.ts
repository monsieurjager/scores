import type { Competition, EventKind, Match, MatchEvent, MatchProvider, MatchStatus, StandingRow, StandingsTable, Team, TeamEntry } from '../types';
import teamsData from '../data/teams.json';
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
interface EspnDetail {
  type: { id?: string; text: string };
  clock?: { value?: number; displayValue?: string };
  team?: { id: string };
  scoringPlay?: boolean;
  yellowCard?: boolean;
  redCard?: boolean;
  penaltyKick?: boolean;
  ownGoal?: boolean;
  athletesInvolved?: { displayName?: string; shortName?: string; fullName?: string }[];
}
interface EspnEvent {
  id: string;
  date: string;
  status: { displayClock?: string; type: { name: string; state: 'pre' | 'in' | 'post' } };
  competitions: { competitors: EspnCompetitor[]; details?: EspnDetail[] }[];
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

const RUGBY_KINDS: Record<string, [EventKind, number]> = {
  try: ['try', 5],
  conversion: ['conversion', 2],
  'penalty goal': ['penaltygoal', 3],
  'drop goal': ['dropgoal', 3],
  'penalty try': ['penaltytry', 7],
  'yellow card': ['yellow', 0],
  'red card': ['red', 0],
};

/** Buts / essais et cartons, dans l'ordre du match. ESPN crédite déjà l'équipe bénéficiaire (même pour un but contre son camp). */
function toEvents(details: EspnDetail[] | undefined, sport: Competition['sport']): MatchEvent[] {
  const out: MatchEvent[] = [];
  (details ?? []).forEach((d, i) => {
    let kind: EventKind | null = null;
    let points = 0;
    if (sport === 'rugby') {
      const k = RUGBY_KINDS[d.type.text.toLowerCase()];
      if (k) [kind, points] = k;
    } else if (d.scoringPlay) {
      kind = d.ownGoal ? 'owngoal' : d.penaltyKick ? 'penalty' : 'goal';
      points = 1;
    } else if (d.yellowCard) kind = 'yellow';
    else if (d.redCard) kind = 'red';
    if (!kind || !d.team) return;
    const a = d.athletesInvolved?.[0];
    out.push({ id: `${i}`, kind, clock: d.clock?.displayValue?.replace("'+", '+') ?? '', seconds: d.clock?.value ?? 0, teamId: d.team.id, player: a?.shortName ?? a?.displayName ?? a?.fullName, points });
  });
  return out.sort((x, y) => x.seconds - y.seconds);
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
    events: toEvents(c.details, comp.sport),
  };
}

async function fetchScoreboard(comp: Competition, query: string, signal?: AbortSignal, fresh = false): Promise<Match[]> {
  const url = `${BASE}/${comp.espn.sport}/${comp.espn.league}/scoreboard${query}`;
  // fresh : rafraîchissement en direct, on évite le cache HTTP du navigateur (ESPN garde ses réponses ~1 à 9 s)
  const res = await fetch(url, { signal, cache: fresh ? 'no-store' : 'default' });
  if (!res.ok) throw new Error(`ESPN ${comp.id}: HTTP ${res.status}`);
  const json = (await res.json()) as { events?: EspnEvent[] };
  return (json.events ?? []).map((e) => normalize(e, comp)).filter((m): m is Match => m !== null);
}

const byDay = (comp: Competition, dayKey: string, signal?: AbortSignal, fresh = false) => fetchScoreboard(comp, `?dates=${dayKey.replace(/-/g, '')}`, signal, fresh);

export const espnProvider: MatchProvider = {
  async getMatches(dayKey, signal, only) {
    const comps = COMPETITIONS.filter((c) => !only || only.includes(c.id));
    // ESPN découpe les jours à l'heure de la côte est des États-Unis : pour le rugby
    // (matchs tôt le matin à Paris, dans l'hémisphère sud) on lit aussi la veille.
    const jobs = comps.flatMap((c) => (c.sport === 'rugby' ? [addDays(dayKey, -1), dayKey] : [dayKey]).map((d) => byDay(c, d, signal, !!only)));
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

  async getTeams() {
    // Liste embarquée (scripts/fetch-teams.mjs) : les adresses /teams d'ESPN n'autorisent pas les navigateurs.
    return (teamsData as { sport: 'football' | 'rugby'; id: string; name: string; logo?: string; color?: string; national: boolean }[]).map(
      (t): TeamEntry => ({ sport: t.sport, team: { id: t.id, name: t.national ? frenchName(t.name) : t.name, short: t.name.slice(0, 3).toUpperCase(), logo: t.logo, color: t.color } }),
    );
  },

  async getStandings(comp, teamIds, signal) {
    const key = `${comp.id}:${teamIds.join(',')}`;
    const hit = standingsCache.get(key);
    if (hit && Date.now() - hit.at < 120_000) return hit.table;
    const res = await fetch(`https://site.api.espn.com/apis/v2/sports/${comp.espn.sport}/${comp.espn.league}/standings`, { signal });
    if (!res.ok) return null;
    type Entry = { team: EspnTeam; stats?: { name: string; value?: number | string; displayValue?: string }[] };
    const json = (await res.json()) as { children?: { name?: string; standings?: { entries?: Entry[] } }[] };
    const groups = (json.children ?? []).filter((g) => g.standings?.entries?.length);
    if (groups.length === 0) return null;
    const g = groups.find((x) => x.standings!.entries!.some((e) => teamIds.includes(String(e.team.id)))) ?? groups[0];
    const num = (e: Entry, ...names: string[]): number | null => {
      for (const n of names) {
        const st = e.stats?.find((x) => x.name === n);
        if (st) {
          const v = Number(st.value ?? st.displayValue);
          if (!Number.isNaN(v)) return v;
        }
      }
      return null;
    };
    const txt = (e: Entry, ...names: string[]) => names.map((n) => e.stats?.find((x) => x.name === n)?.displayValue).find((v) => v != null && v !== '') ?? '';
    const rows: StandingRow[] = g.standings!.entries!
      .map((e, i): StandingRow => ({
        rank: num(e, 'rank', 'playoffSeed') ?? i + 1,
        team: toTeam(e.team, !!comp.onlyTeams),
        played: num(e, 'gamesPlayed'),
        won: num(e, 'wins'),
        drawn: num(e, 'ties', 'draws'),
        lost: num(e, 'losses', 'gamesLost'),
        diff: txt(e, 'pointDifferential', 'pointsDifference', 'differential'),
        points: num(e, 'points'),
      }))
      .sort((a, b) => a.rank - b.rank);
    // Un seul groupe : le nom de la compétition. Plusieurs groupes : leur nom, traduit.
    const groupName = (g.name ?? '').replace(/^\d{4}-\d{2,4}\s+/, '').replace('Northern Hemisphere', 'Hémisphère nord').replace('Southern Hemisphere', 'Hémisphère sud').replace(/League ([A-D])/, 'Ligue $1').replace('Group', 'Groupe');
    const table: StandingsTable = { title: groups.length > 1 && groupName ? groupName : comp.name, rows };
    standingsCache.set(key, { at: Date.now(), table });
    return table;
  },
};

const standingsCache = new Map<string, { at: number; table: StandingsTable }>();

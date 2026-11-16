import type { Competition, CompetitionView, EventKind, FormResult, HeadToHead, Lineup, LineupPlayer, Match, MatchEvent, MatchProvider, MatchSummary, SummaryStat, MatchStatus, StandingRow, StandingsTable, Team, TeamEntry } from '../types';
import teamsData from '../data/teams.json';
import { COMPETITIONS } from '../config/competitions';
import { rate, roleOf, type PlayerStats } from '../lib/ratings';
import { frenchName } from '../config/teamNames';
import { enabledCompetitions } from '../lib/settings';
import { knownRestDay, rememberCalendar } from '../lib/calendar';
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
export interface EspnEvent {
  id: string;
  date: string;
  status: { displayClock?: string; type: { name: string; state: 'pre' | 'in' | 'post' } };
  competitions: { competitors: EspnCompetitor[]; details?: EspnDetail[] }[];
}

const toTeam = (t: EspnTeam, national: boolean): Team => {
  const base = t.displayName.length > 20 && t.shortDisplayName ? t.shortDisplayName : t.displayName;
  const long = national ? frenchName(base) : base;
  // Un écusson noir disparaît sur le verre sombre : on préfère la couleur alternative.
  // Quasi-noir (aucune composante vive) : invisible sur fond sombre. #0000CC (bleu France) est gardé.
  const dark = (hex?: string) => {
    if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return true;
    return Math.max(...[0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))) < 48;
  };
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
export function toEvents(details: EspnDetail[] | undefined, sport: Competition['sport']): MatchEvent[] {
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

export function normalize(e: EspnEvent, comp: Competition): Match | null {
  const c = e.competitions?.[0];
  const home = c?.competitors.find((x) => x.homeAway === 'home');
  const away = c?.competitors.find((x) => x.homeAway === 'away');
  if (!home || !away) return null;
  if (comp.onlyTeams && !comp.onlyTeams.some((t) => t === home.team.abbreviation || t === away.team.abbreviation)) return null;
  if (comp.onlyTeamIds && !comp.onlyTeamIds.includes(String(home.team.id)) && !comp.onlyTeamIds.includes(String(away.team.id))) return null;
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
  rememberCalendar(comp.id, json);
  return (json.events ?? []).map((e) => normalize(e, comp)).filter((m): m is Match => m !== null);
}

/** Compétitions ignorées lors du dernier chargement d'un jour (calendrier connu) : pour le suivi. */
export const requestStats = { lastDay: { requested: 0, skipped: 0 } };

const byDay = (comp: Competition, dayKey: string, signal?: AbortSignal, fresh = false): Promise<Match[]> => {
  // Jour de repos connu d'après le calendrier : pas de requête.
  if (knownRestDay(comp.id, dayKey)) {
    requestStats.lastDay.skipped++;
    return Promise.resolve([]);
  }
  requestStats.lastDay.requested++;
  return fetchScoreboard(comp, `?dates=${dayKey.replace(/-/g, '')}`, signal, fresh);
};

export const espnProvider: MatchProvider = {
  async getMatches(dayKey, signal, only) {
    const comps = enabledCompetitions().filter((c) => !only || only.includes(c.id));
    if (!only) requestStats.lastDay = { requested: 0, skipped: 0 };
    // ESPN découpe les jours à l'heure de la côte est des États-Unis : pour les tests de rugby
    // (matchs tôt le matin à Paris, dans l'hémisphère sud) on lit aussi la veille.
    const jobs = comps.flatMap((c) => (c.sport === 'rugby' && c.onlyTeams ? [addDays(dayKey, -1), dayKey] : [dayKey]).map((d) => byDay(c, d, signal, !!only)));
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
    const jobs = enabledCompetitions().flatMap((c) => (c.onlyTeams ? [year, year + 1].map((y) => fetchScoreboard(c, `?dates=${y}&limit=800`, signal)) : [fetchScoreboard(c, '', signal)]));
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

  async getSummary(comp, matchId, signal) {
    const eid = matchId.slice(comp.id.length + 1);
    const res = await fetch(`${BASE}/${comp.espn.sport}/${comp.espn.league}/summary?event=${eid}`, { signal, cache: 'no-store' });
    if (!res.ok) return null;
    type Ath = { id: string; displayName?: string; shortName?: string };
    const j = (await res.json()) as {
      gameInfo?: { venue?: { fullName?: string; address?: { city?: string } }; attendance?: number };
      boxscore?: { teams?: { homeAway: 'home' | 'away'; statistics?: { name: string; displayValue: string }[] }[] };
      rosters?: { homeAway: 'home' | 'away'; team?: { id?: string }; formation?: string; roster?: { starter?: boolean; jersey?: string; subbedIn?: boolean; subbedOut?: boolean; position?: { abbreviation?: string }; athlete: Ath; stats?: { name: string; value?: number }[] }[] }[];
      header?: { competitions?: { status?: { type?: { state?: string } }; competitors?: { homeAway: 'home' | 'away'; score?: string }[] }[] };
      keyEvents?: { id: string; type: { text: string }; scoringPlay?: boolean; clock?: { value?: number; displayValue?: string }; team?: { id: string }; participants?: { athlete: Ath }[] }[];
      lastFiveGames?: { team: { id: string }; events?: { gameResult?: string; score?: string; gameDate?: string; opponent?: { displayName?: string } }[] }[];
      seasonseries?: { events?: { date?: string; competitors?: { homeAway: string; score?: string | { displayValue?: string }; team: { displayName?: string } }[] }[] }[];
      headToHeadGames?: { team: { displayName?: string }; events?: { gameDate?: string; score?: string; atVs?: string; opponent?: { displayName?: string } }[] }[];
    };

    // Statistiques (football : possession, tirs, etc.)
    const val = (side: 'home' | 'away', name: string) => {
      const t = j.boxscore?.teams?.find((x) => x.homeAway === side);
      const v = t?.statistics?.find((x) => x.name === name)?.displayValue;
      return v == null || v === '' ? null : Number(v);
    };
    const DEFS: [string, string, '%'?][] = [['possessionPct', 'Possession', '%'], ['totalShots', 'Tirs'], ['shotsOnTarget', 'Tirs cadrés'], ['wonCorners', 'Corners'], ['foulsCommitted', 'Fautes'], ['offsides', 'Hors-jeu'], ['saves', 'Arrêts']];
    const stats: SummaryStat[] = [];
    for (const [key, label, unit] of DEFS) {
      const h = val('home', key);
      const a = val('away', key);
      if (h != null && a != null && Number.isFinite(h) && Number.isFinite(a)) stats.push({ key, label, home: Math.round(h), away: Math.round(a), unit });
    }
    const pct = (side: 'home' | 'away') => {
      const ok = val(side, 'accuratePasses');
      const all = val(side, 'totalPasses');
      return ok != null && all ? Math.round((ok / all) * 100) : null;
    };
    const ph = pct('home');
    const pa = pct('away');
    if (ph != null && pa != null) stats.splice(3, 0, { key: 'passes', label: 'Passes réussies', home: ph, away: pa, unit: '%' });

    // Compositions
    const nameOf = (a: Ath) => a.shortName ?? a.displayName ?? '—';
    const hc = j.header?.competitions?.[0];
    const started = !!hc?.status?.type?.state && hc.status.type.state !== 'pre';
    const pts = (side: 'home' | 'away') => Number(hc?.competitors?.find((c) => c.homeAway === side)?.score ?? NaN);
    const lineup = (side: 'home' | 'away'): Lineup | null => {
      const r = j.rosters?.find((x) => x.homeAway === side);
      if (!r?.roster?.length) return null;
      const [us, them] = side === 'home' ? [pts('home'), pts('away')] : [pts('away'), pts('home')];
      const result = us > them ? 'W' : us < them ? 'L' : 'D';
      const players = r.roster.map((p): LineupPlayer & { starter: boolean } => {
        const pl: LineupPlayer & { starter: boolean } = { id: p.athlete.id, name: nameOf(p.athlete), number: p.jersey ?? '', position: p.position?.abbreviation, subbedIn: !!p.subbedIn, subbedOut: !!p.subbedOut, starter: !!p.starter };
        if (comp.sport === 'football' && p.stats?.length) {
          const st = (n: string) => p.stats!.find((x) => x.name === n)?.value ?? 0;
          const ps: PlayerStats = { goals: st('totalGoals'), assists: st('goalAssists'), shotsOnTarget: st('shotsOnTarget'), saves: st('saves'), goalsConceded: st('goalsConceded'), foulsCommitted: st('foulsCommitted'), foulsSuffered: st('foulsSuffered'), yellow: st('yellowCards'), red: st('redCards'), ownGoals: st('ownGoals') };
          if (ps.goals) pl.goals = ps.goals;
          if (ps.assists) pl.assists = ps.assists;
          if (ps.ownGoals) pl.ownGoals = ps.ownGoals;
          if (ps.yellow) pl.yellow = true;
          if (ps.red) pl.red = true;
          if (started && (p.starter || p.subbedIn)) pl.rating = rate(ps, roleOf(p.position?.abbreviation), result, !!p.starter);
        }
        return pl;
      });
      return { formation: r.formation, starters: players.filter((p) => p.starter), bench: players.filter((p) => !p.starter) };
    };
    const home = lineup('home');
    const away = lineup('away');

    // Remplacements (football) pour la chronologie
    const subs: MatchEvent[] = (j.keyEvents ?? [])
      .filter((k) => k.type.text === 'Substitution' && k.team)
      .map((k) => ({ id: `sub-${k.id}`, kind: 'sub' as const, clock: k.clock?.displayValue?.replace("'+", '+') ?? '', seconds: k.clock?.value ?? 0, teamId: k.team!.id, player: k.participants?.[0] ? nameOf(k.participants[0].athlete) : undefined, out: k.participants?.[1] ? nameOf(k.participants[1].athlete) : undefined, points: 0 }));

    // Passeurs décisifs (football) : 2e participant d'une action de but
    const assists: Record<string, string> = {};
    for (const k of j.keyEvents ?? []) {
      const helper = k.participants?.[1]?.athlete;
      if (k.scoringPlay && k.team && helper) assists[`${k.team.id}|${k.clock?.displayValue?.replace("'+", '+') ?? ''}`] = nameOf(helper);
    }

    // Forme récente : identifiants des équipes du match pour savoir qui est à domicile
    const nat = !!comp.onlyTeams;
    const nm = (n?: string) => (n ? (nat ? frenchName(n) : n) : '—');
    const [homeId, awayId] = (() => {
      const r = j.rosters ?? [];
      const h = r.find((x) => x.homeAway === 'home')?.team?.id;
      const a = r.find((x) => x.homeAway === 'away')?.team?.id;
      return [h, a];
    })();
    const formOf = (id?: string): FormResult[] =>
      (j.lastFiveGames?.find((x) => String(x.team.id) === String(id))?.events ?? [])
        .filter((e) => e.gameResult === 'W' || e.gameResult === 'D' || e.gameResult === 'L')
        .map((e) => ({ result: e.gameResult as FormResult['result'], score: e.score ?? '', opponent: nm(e.opponent?.displayName), date: e.gameDate ?? '' }));
    const fh = formOf(homeId);
    const fa = formOf(awayId);
    const scoreTxt = (x?: string | { displayValue?: string }) => (typeof x === 'object' ? x?.displayValue : x) ?? '';
    const h2h: HeadToHead[] = [];
    for (const e of j.seasonseries?.[0]?.events ?? []) {
      const h = e.competitors?.find((x) => x.homeAway === 'home');
      const a = e.competitors?.find((x) => x.homeAway === 'away');
      if (h && a) h2h.push({ date: e.date ?? '', home: nm(h.team.displayName), away: nm(a.team.displayName), homeScore: scoreTxt(h.score), awayScore: scoreTxt(a.score) });
    }
    const hh = j.headToHeadGames?.[0];
    for (const e of hh?.events ?? []) {
      // rugby : score donné du point de vue de l'équipe de référence (« 21-19 »)
      const [us, them] = (e.score ?? '').split('-');
      const home = e.atVs !== '@';
      const team = nm(hh!.team.displayName);
      const opp = nm(e.opponent?.displayName);
      h2h.push(home ? { date: e.gameDate ?? '', home: team, away: opp, homeScore: us ?? '', awayScore: them ?? '' } : { date: e.gameDate ?? '', home: opp, away: team, homeScore: them ?? '', awayScore: us ?? '' });
    }
    h2h.sort((x, y) => y.date.localeCompare(x.date));

    const v = j.gameInfo?.venue;
    const summary: MatchSummary = {
      venue: v?.fullName ? [v.fullName, v.address?.city].filter(Boolean).join(', ') : undefined,
      attendance: j.gameInfo?.attendance && j.gameInfo.attendance > 0 ? j.gameInfo.attendance : undefined,
      stats,
      lineups: home && away ? { home, away } : undefined,
      subs,
      form: fh.length || fa.length ? { home: fh, away: fa } : undefined,
      h2h: h2h.slice(0, 5),
      assists,
    };
    return summary;
  },

  async getStandings(comp, teamIds, signal) {
    const key = `${comp.id}:${teamIds.join(',')}`;
    const hit = standingsCache.get(key);
    if (hit && Date.now() - hit.at < 120_000) return hit.table;
    const groups = await fetchStandingGroups(comp, signal);
    if (!groups) return null;
    const g = groups.find((x) => x.rows.some((r) => teamIds.includes(r.team.id))) ?? groups[0];
    standingsCache.set(key, { at: Date.now(), table: g });
    return g;
  },

  async getTeamMatches(sport, teamId, national, signal) {
    const comps = enabledCompetitions().filter((c) => c.sport === sport && !!c.onlyTeams === national);
    let jobs: Promise<Match[]>[];
    if (sport === 'football') {
      // ESPN : calendrier par équipe et par compétition (résultats, puis matchs à venir avec fixture=true)
      jobs = comps.flatMap((c) => ['', '?fixture=true'].map((q) => fetchTeamSchedule(c, teamId, q, signal)));
    } else {
      // Rugby : pas de calendrier par équipe chez ESPN → saisons entières des compétitions, filtrées sur l'équipe
      const y = new Date().getFullYear();
      const years = new Date().getMonth() >= 6 ? [y, y + 1] : [y - 1, y];
      jobs = comps.flatMap((c) => years.map((yy) => fetchScoreboard(c, `?dates=${yy}&limit=500`, signal)));
    }
    const res = await Promise.allSettled(jobs);
    const ok = res.filter((r): r is PromiseFulfilledResult<Match[]> => r.status === 'fulfilled');
    if (ok.length === 0 && res.length > 0) throw (res[0] as PromiseRejectedResult).reason;
    const byId = new Map<string, Match>();
    for (const r of ok) for (const m of r.value) if (m.home.id === teamId || m.away.id === teamId) byId.set(m.id, m);
    return [...byId.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  },

  async getCompetition(comp, signal) {
    const [groups, matchday] = await Promise.all([fetchStandingGroups(comp, signal).catch(() => null), fetchScoreboard(comp, '', signal).catch(() => [])]);
    // Groupes utiles : ceux où figure une équipe suivie (sélection ou club français), sinon tous.
    const followed = (t: { id: string; short: string }) => (comp.onlyTeams ? comp.onlyTeams.includes(t.short) : comp.onlyTeamIds ? comp.onlyTeamIds.includes(t.id) : true);
    const tables = (groups ?? []).filter((g) => !(comp.onlyTeams || comp.onlyTeamIds) || g.rows.some((r) => followed(r.team)));
    return { tables, matchday };
  },
};

const standingsCache = new Map<string, { at: number; table: StandingsTable }>();

/** Tous les groupes du classement d'une compétition (null : pas de classement). */
async function fetchStandingGroups(comp: Competition, signal?: AbortSignal): Promise<StandingsTable[] | null> {
  const res = await fetch(`https://site.api.espn.com/apis/v2/sports/${comp.espn.sport}/${comp.espn.league}/standings`, { signal });
  if (!res.ok) return null;
  type Entry = { team: EspnTeam; stats?: { name: string; value?: number | string; displayValue?: string }[] };
  const json = (await res.json()) as { children?: { name?: string; standings?: { entries?: Entry[] } }[] };
  const groups = (json.children ?? []).filter((g) => g.standings?.entries?.length);
  if (groups.length === 0) return null;
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
  return groups.map((g) => {
    const groupName = (g.name ?? '').replace(/^\d{4}-\d{2,4}\s+/, '').replace('Northern Hemisphere', 'Hémisphère nord').replace('Southern Hemisphere', 'Hémisphère sud').replace(/League ([A-D])/, 'Ligue $1').replace('Group', 'Groupe').replace('Pool', 'Poule');
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
    return { title: groups.length > 1 && groupName ? groupName : comp.name, rows };
  });
}

/** Calendrier d'une équipe (format « schedule » d'ESPN, ramené au format des tableaux de scores). */
async function fetchTeamSchedule(comp: Competition, teamId: string, query: string, signal?: AbortSignal): Promise<Match[]> {
  const res = await fetch(`${BASE}/${comp.espn.sport}/${comp.espn.league}/teams/${teamId}/schedule${query}`, { signal });
  if (!res.ok) return [];
  type SchedEvent = { id: string; date: string; competitions?: { status: EspnEvent['status']; competitors: (Omit<EspnCompetitor, 'score'> & { score?: string | { displayValue?: string } })[]; details?: EspnDetail[] }[] };
  const json = (await res.json()) as { events?: SchedEvent[] };
  return (json.events ?? [])
    .map((e): Match | null => {
      const c = e.competitions?.[0];
      if (!c) return null;
      const ev: EspnEvent = {
        id: e.id,
        date: e.date,
        status: c.status,
        competitions: [{ competitors: c.competitors.map((x) => ({ ...x, score: typeof x.score === 'object' ? x.score?.displayValue : x.score })), details: c.details }],
      };
      return normalize(ev, comp);
    })
    .filter((m): m is Match => m !== null);
}


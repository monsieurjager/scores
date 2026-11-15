// Lecture des tableaux de scores ESPN, côté service d'alertes (même source et mêmes filtres que l'app).
import type { Competition } from '../../src/types';
import { frenchName } from '../../src/config/teamNames.ts';
import type { MatchSnap, ScoringEvent } from './detect.ts';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';

interface EspnTeam { id: string; displayName: string; shortDisplayName?: string; abbreviation?: string }
interface EspnEvent {
  id: string;
  date: string;
  status: { displayClock?: string; type: { name: string; state: 'pre' | 'in' | 'post' } };
  competitions: { competitors: { homeAway: 'home' | 'away'; score?: string; team: EspnTeam }[]; details?: { type: { text: string }; clock?: { displayValue?: string }; team?: { id: string }; scoringPlay?: boolean; redCard?: boolean; penaltyKick?: boolean; ownGoal?: boolean; athletesInvolved?: { shortName?: string; displayName?: string }[] }[] }[];
}

const RUGBY: Record<string, ScoringEvent['kind'] | 'red'> = { try: 'try', conversion: 'conversion', 'penalty goal': 'penaltygoal', 'drop goal': 'dropgoal', 'penalty try': 'penaltytry', 'red card': 'red' };

export interface Parsed { snap: MatchSnap; kickoff: number }

function parse(e: EspnEvent, comp: Competition): Parsed | null {
  const c = e.competitions?.[0];
  const h = c?.competitors.find((x) => x.homeAway === 'home');
  const a = c?.competitors.find((x) => x.homeAway === 'away');
  if (!h || !a) return null;
  if (comp.onlyTeams && !comp.onlyTeams.some((t) => t === h.team.abbreviation || t === a.team.abbreviation)) return null;
  if (comp.onlyTeamIds && !comp.onlyTeamIds.includes(String(h.team.id)) && !comp.onlyTeamIds.includes(String(a.team.id))) return null;
  const nm = (t: EspnTeam) => {
    const base = t.displayName.length > 20 && t.shortDisplayName ? t.shortDisplayName : t.displayName;
    return comp.onlyTeams ? frenchName(base) : base;
  };
  const scoring: ScoringEvent[] = [];
  const reds: MatchSnap['reds'] = [];
  for (const d of c!.details ?? []) {
    if (!d.team) continue;
    const player = d.athletesInvolved?.[0]?.shortName ?? d.athletesInvolved?.[0]?.displayName;
    const clock = d.clock?.displayValue?.replace("'+", '+') ?? '';
    if (comp.sport === 'rugby') {
      const k = RUGBY[d.type.text.toLowerCase()];
      if (k === 'red') reds.push({ teamId: d.team.id, player, clock });
      else if (k) scoring.push({ teamId: d.team.id, kind: k, player, clock });
    } else if (d.scoringPlay) scoring.push({ teamId: d.team.id, kind: d.ownGoal ? 'owngoal' : d.penaltyKick ? 'penalty' : 'goal', player, clock });
    else if (d.redCard) reds.push({ teamId: d.team.id, player, clock });
  }
  const state = e.status.type.state;
  return {
    kickoff: new Date(e.date).getTime(),
    snap: {
      id: `${comp.id}-${e.id}`,
      sport: comp.sport,
      compName: comp.name,
      state,
      statusName: e.status.type.name,
      clock: e.status.displayClock?.replace("'+", '+') ?? '',
      home: { id: String(h.team.id), name: nm(h.team) },
      away: { id: String(a.team.id), name: nm(a.team) },
      hs: state === 'pre' ? 0 : Number(h.score ?? 0),
      as: state === 'pre' ? 0 : Number(a.score ?? 0),
      scoring,
      reds,
    },
  };
}

/** Matchs d'une compétition pour les jours ESPN donnés (AAAA-MM-JJ). */
export async function fetchDays(comp: Competition, days: string[]): Promise<Parsed[]> {
  const out: Parsed[] = [];
  for (const d of days) {
    const res = await fetch(`${BASE}/${comp.espn.sport}/${comp.espn.league}/scoreboard?dates=${d.replace(/-/g, '')}`, { cf: { cacheTtl: 0 } } as RequestInit);
    if (!res.ok) continue;
    const json = (await res.json()) as { events?: EspnEvent[] };
    for (const e of json.events ?? []) {
      const p = parse(e, comp);
      if (p) out.push(p);
    }
  }
  return out;
}

// Activités en direct (écran verrouillé, Dynamic Island) : contenu affiché, à partir d'un relevé de match.
// Les noms des champs correspondent exactement à MatchAttributes (app iPhone).
import type { MatchSnap } from './detect.ts';

export interface LiveTeam { id: string; name: string; short: string; color: string }
export interface LiveContent { status: 'pre' | 'in' | 'post'; homeScore: number; awayScore: number; clock: string; lastEvent?: string }

const LABEL: Record<string, string> = { goal: 'But', penalty: 'Penalty', owngoal: 'CSC', try: 'Essai', conversion: 'Transformation', penaltygoal: 'Pénalité', dropgoal: 'Drop', penaltytry: 'Essai de pénalité' };

/** Dernier fait marquant : « But · K. Mbappé 67' ». */
export function lastEvent(m: MatchSnap): string | undefined {
  const e = m.scoring[m.scoring.length - 1];
  if (!e) return undefined;
  const team = e.teamId === m.home.id ? m.home.name : m.away.name;
  return [LABEL[e.kind] ?? 'Points', e.player ?? team, e.clock].filter(Boolean).join(' · ').replace(/ · (\d+'?[+\d']*)$/, ' $1');
}

export function liveContent(m: MatchSnap): LiveContent {
  const clock = m.state === 'post' ? 'Terminé' : m.statusName === 'STATUS_HALFTIME' ? 'MT' : m.state === 'in' ? m.clock : '';
  const c: LiveContent = { status: m.state, homeScore: m.hs, awayScore: m.as, clock };
  const ev = lastEvent(m);
  if (ev) c.lastEvent = ev;
  return c;
}

/** Données fixes de l'Activité (au démarrage). */
export function liveAttributes(matchId: string, competition: string, kickoff: number, home: LiveTeam, away: LiveTeam) {
  return {
    matchId,
    competition,
    kickoff: Math.floor(kickoff / 1000),
    homeName: home.name,
    homeShort: home.short,
    homeColor: home.color,
    awayName: away.name,
    awayShort: away.short,
    awayColor: away.color,
  };
}

/** Une mise à jour ne vaut la priorité haute (limitée par Apple) que si le score ou l'état change. */
export const important = (a: LiveContent | undefined, b: LiveContent) => !a || a.status !== b.status || a.homeScore !== b.homeScore || a.awayScore !== b.awayScore || (a.clock === 'MT') !== (b.clock === 'MT');

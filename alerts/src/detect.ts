// Détection des faits de match entre deux relevés, et rédaction des notifications (en français).

export type AlertKind = 'kickoff' | 'score' | 'halftime' | 'fulltime' | 'red' | 'lineups';

export interface ScoringEvent {
  teamId: string;
  kind: 'goal' | 'penalty' | 'owngoal' | 'try' | 'conversion' | 'penaltygoal' | 'dropgoal' | 'penaltytry';
  player?: string;
  clock: string;
}

/** Relevé d'un match tel que lu chez ESPN. */
export interface MatchSnap {
  id: string;
  sport: 'football' | 'rugby';
  compName: string;
  state: 'pre' | 'in' | 'post';
  statusName: string;
  clock: string;
  home: { id: string; name: string; short?: string; color?: string };
  away: { id: string; name: string; short?: string; color?: string };
  hs: number;
  as: number;
  scoring: ScoringEvent[];
  reds: { teamId: string; player?: string; clock: string }[];
}

/** Ce qu'on mémorise d'un match (base D1) : uniquement ce qui sert à détecter un changement. */
export interface Stored {
  s: 'pre' | 'in' | 'post';
  h: number;
  a: number;
  ht: boolean;
  red: number;
  ev: number;
}

export interface Alert {
  kind: AlertKind;
  title: string;
  body: string;
  tag: string;
  matchId: string;
  teamKeys: string[];
  /** Texte propre à une équipe (clé « sport:id ») : l'abonné reçoit celui de son équipe favorite. */
  bodyByTeam?: Record<string, string>;
}

const LABEL: Record<ScoringEvent['kind'], string> = {
  goal: 'But',
  penalty: 'But sur penalty',
  owngoal: 'But contre son camp',
  try: 'Essai',
  conversion: 'Transformation',
  penaltygoal: 'Pénalité',
  dropgoal: 'Drop',
  penaltytry: 'Essai de pénalité',
};

export const snapToStored = (m: MatchSnap): Stored => ({ s: m.state, h: m.hs, a: m.as, ht: m.statusName === 'STATUS_HALFTIME', red: m.reds.length, ev: m.scoring.length });

export function detect(prev: Stored | undefined, m: MatchSnap): { alerts: Alert[]; next: Stored } {
  const next = snapToStored(m);
  // Premier relevé d'un match (service démarré en cours de match, nouveau favori…) : on mémorise sans notifier.
  if (!prev) return { alerts: [], next };
  if (prev.ht && m.statusName !== 'STATUS_HALFTIME') next.ht = true; // la mi-temps n'est annoncée qu'une fois
  const score = `${m.home.name} ${m.hs}–${m.as} ${m.away.name}`;
  const teamKeys = [`${m.sport}:${m.home.id}`, `${m.sport}:${m.away.id}`];
  const teamName = (id: string) => (id === m.home.id ? m.home.name : id === m.away.id ? m.away.name : '');
  const alerts: Alert[] = [];
  const push = (kind: AlertKind, title: string, body: string) => alerts.push({ kind, title, body, tag: `${m.id}-${kind}-${m.hs}-${m.as}-${m.reds.length}`, matchId: m.id, teamKeys });

  if (prev.s === 'pre' && m.state === 'in') push('kickoff', `Coup d'envoi · ${m.home.name} – ${m.away.name}`, m.compName);

  if (m.hs > prev.h || m.as > prev.a) {
    const fresh = m.scoring.slice(prev.ev);
    const last = fresh[fresh.length - 1];
    if (m.sport === 'football') {
      const who = last ? `${last.player ?? teamName(last.teamId)}${last.player ? ` (${teamName(last.teamId)})` : ''}` : '';
      const how = last && last.kind !== 'goal' ? ` · ${LABEL[last.kind].replace('But ', '')}` : '';
      push('score', `But ! ${score}`, [who, last?.clock].filter(Boolean).join(' · ') + how || m.compName);
    } else {
      // Rugby : essai + transformation relevés ensemble → une seule notification
      const kinds = [...new Set(fresh.map((e) => LABEL[e.kind]))].join(' + ');
      const scorer = last?.player ? `${last.player} (${teamName(last.teamId)})` : last ? teamName(last.teamId) : '';
      push('score', `${kinds || 'Points'} · ${score}`, [scorer, last?.clock].filter(Boolean).join(' · ') || m.compName);
    }
  }

  for (const r of m.reds.slice(prev.red)) push('red', `Carton rouge · ${teamName(r.teamId)}`, [r.player, r.clock, score].filter(Boolean).join(' · '));

  if (m.statusName === 'STATUS_HALFTIME' && !prev.ht) push('halftime', `Mi-temps · ${score}`, m.compName);
  if (prev.s !== 'post' && m.state === 'post') push('fulltime', `Fin du match · ${score}`, m.compName);

  return { alerts, next };
}

export interface TeamSheet {
  teamId: string;
  name: string;
  formation?: string;
  starters: string[]; // noms, dans l'ordre fourni (gardien d'abord en foot, numéros 1 à 15 en rugby)
}

/** Notification « Compositions officielles » : chaque abonné reçoit le onze (ou le XV) de son équipe. */
export function lineupsAlert(m: Pick<MatchSnap, 'id' | 'sport' | 'home' | 'away'>, sheets: TeamSheet[]): Alert | null {
  if (sheets.length === 0 || sheets.some((t) => t.starters.length < (m.sport === 'rugby' ? 15 : 11))) return null;
  const line = (t: TeamSheet) => `${t.name}${t.formation ? ` (${t.formation})` : ''} : ${t.starters.join(', ')}`;
  const bodyByTeam: Record<string, string> = {};
  for (const t of sheets) bodyByTeam[`${m.sport}:${t.teamId}`] = line(t);
  return {
    kind: 'lineups',
    title: `Compositions · ${m.home.name} – ${m.away.name}`,
    body: sheets.map(line).join('\n'),
    tag: `${m.id}-lineups`,
    matchId: m.id,
    teamKeys: [`${m.sport}:${m.home.id}`, `${m.sport}:${m.away.id}`],
    bodyByTeam,
  };
}

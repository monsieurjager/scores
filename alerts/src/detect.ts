// Détection des faits de match entre deux relevés, et rédaction des notifications (en français).

export type AlertKind = 'kickoff' | 'score' | 'halftime' | 'fulltime' | 'red' | 'lineups';

export interface ScoringEvent {
  teamId: string;
  kind: 'goal' | 'penalty' | 'owngoal' | 'try' | 'conversion' | 'penaltygoal' | 'dropgoal' | 'penaltytry';
  player?: string;
  /** Identifiant ESPN du joueur (alertes des joueurs suivis) */
  playerId?: string;
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
  /** But notifié avant qu'ESPN ne donne le buteur : la notification sera complétée dès qu'il arrive. */
  ns?: boolean;
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
  /** Mise à jour d'une notification déjà affichée (buteur arrivé après coup) : remplace sans sonner. */
  silent?: boolean;
  /** Auteur du but / de l'essai : abonnés qui suivent ce joueur (« football:231388 ») et titre qui le met en avant */
  scorer?: { key: string; title: string };
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

// Style des notifications : un titre court qui dit l'essentiel, puis « minute + joueur » et le score.
//   ⚽️ France marque !          🏉 Essai transformé · France     🟥 Carton rouge · Turquie
//   80' Junior Kroupi           15' A. Grandidier-Nkanang         62' E. Topçu
//   France 2 – 0 Turquie        France 7 – 0 Afrique du Sud       France 1 – 0 Turquie
const line = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ');

export function detect(prev: Stored | undefined, m: MatchSnap): { alerts: Alert[]; next: Stored } {
  const next = snapToStored(m);
  // Premier relevé d'un match (service démarré en cours de match, nouveau favori…) : on mémorise sans notifier.
  if (!prev) return { alerts: [], next };
  if (prev.ht && m.statusName !== 'STATUS_HALFTIME') next.ht = true; // la mi-temps n'est annoncée qu'une fois
  const score = `${m.home.name} ${m.hs} – ${m.as} ${m.away.name}`;
  const teamKeys = [`${m.sport}:${m.home.id}`, `${m.sport}:${m.away.id}`];
  const teamName = (id: string) => (id === m.home.id ? m.home.name : id === m.away.id ? m.away.name : '');
  const alerts: Alert[] = [];
  const tagOf = (kind: AlertKind) => `${m.id}-${kind}-${m.hs}-${m.as}-${m.reds.length}`;
  const push = (kind: AlertKind, title: string, body: string, silent = false) => alerts.push({ kind, title, body, tag: tagOf(kind), matchId: m.id, teamKeys, ...(silent ? { silent } : {}) });

  if (prev.s === 'pre' && m.state === 'in') push('kickoff', "🟢 Coup d'envoi", `${m.home.name} – ${m.away.name}\n${m.compName}`);

  /** Notification de points : titre selon l'équipe qui marque, corps « minute joueur » + score. */
  const scoreAlert = (fresh: ScoringEvent[], scorerTeam: string | undefined, silent: boolean) => {
    if (m.sport === 'football') {
      const last = fresh[fresh.length - 1];
      const team = scorerTeam ?? (last ? teamName(last.teamId) : '');
      const title = last?.kind === 'penalty' ? `⚽️ ${team} marque sur penalty !` : team ? `⚽️ ${team} marque !` : '⚽️ But !';
      const who = last?.player ? line(last.clock, last.player, last.kind === 'owngoal' ? '(c.s.c.)' : undefined) : '';
      push('score', title, [who, score].filter(Boolean).join('\n'), silent);
      if (last?.playerId && last.player && last.kind !== 'owngoal') alerts[alerts.length - 1].scorer = { key: `${m.sport}:${last.playerId}`, title: `⚽️ ${last.player} marque !` };
    } else {
      // Rugby : essai + transformation relevés ensemble → une seule notification, qui met en avant l'auteur de l'essai
      const kinds = new Set(fresh.map((e) => e.kind));
      const main = fresh.find((e) => e.kind === 'try' || e.kind === 'penaltytry') ?? fresh[fresh.length - 1];
      const what = kinds.has('try') ? (kinds.has('conversion') ? 'Essai transformé' : 'Essai') : main ? LABEL[main.kind] : 'Points';
      const team = scorerTeam ?? (main ? teamName(main.teamId) : '');
      push('score', line('🏉', what, team && `· ${team}`), [main?.player ? line(main.clock, main.player) : '', score].filter(Boolean).join('\n'), silent);
      if (main?.playerId && main.player && main.kind === 'try') alerts[alerts.length - 1].scorer = { key: `${m.sport}:${main.playerId}`, title: `🏉 Essai de ${main.player} !` };
    }
  };

  if (m.hs > prev.h || m.as > prev.a) {
    const fresh = m.scoring.slice(prev.ev);
    // Équipe qui marque d'après le score (ESPN donne parfois le score avant le détail de l'action)
    const byScore = m.hs > prev.h && m.as <= prev.a ? m.home.name : m.as > prev.a && m.hs <= prev.h ? m.away.name : undefined;
    scoreAlert(fresh, byScore, false);
    if (!fresh.some((e) => e.player)) {
      next.ns = true; // on garde ces actions à relire : le buteur arrivera au prochain relevé
      next.ev = prev.ev;
    }
  } else if (prev.ns && m.scoring.length > prev.ev && m.scoring.slice(prev.ev).some((e) => e.player)) {
    // Le buteur vient d'arriver : la notification du but est complétée (même étiquette, sans nouveau son)
    scoreAlert(m.scoring.slice(prev.ev), undefined, true);
  } else if (prev.ns) {
    next.ns = true; // toujours en attente du buteur
    next.ev = prev.ev;
  }

  for (const r of m.reds.slice(prev.red)) push('red', `🟥 Carton rouge · ${teamName(r.teamId)}`, [line(r.clock, r.player), score].filter(Boolean).join('\n'));

  if (m.statusName === 'STATUS_HALFTIME' && !prev.ht) push('halftime', '⏸️ Mi-temps', `${score}\n${m.compName}`);
  if (prev.s !== 'post' && m.state === 'post') push('fulltime', '🏁 Fin du match', `${score}\n${m.compName}`);

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
    title: `📋 Compositions · ${m.home.name} – ${m.away.name}`,
    body: sheets.map(line).join('\n'),
    tag: `${m.id}-lineups`,
    matchId: m.id,
    teamKeys: [`${m.sport}:${m.home.id}`, `${m.sport}:${m.away.id}`],
    bodyByTeam,
  };
}

export type SportId = 'football' | 'rugby';
export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed';

export interface Team {
  id: string;
  name: string;
  short: string;
  logo?: string;
  /** Couleur principale (hex sans #), utilisée pour la lueur des cartes. */
  color?: string;
}

export type EventKind = 'sub' | 'goal' | 'penalty' | 'owngoal' | 'yellow' | 'red' | 'try' | 'conversion' | 'penaltygoal' | 'dropgoal' | 'penaltytry';

/** Fait de match : but, carton, essai… */
export interface MatchEvent {
  id: string;
  kind: EventKind;
  clock: string; // « 45'+2' »
  seconds: number;
  teamId: string; // équipe créditée
  player?: string;
  points: number; // 0 pour un carton
  /** Remplacement : joueur sorti (`player` est le joueur entrant). */
  out?: string;
}

export interface SummaryStat {
  key: string;
  label: string;
  home: number;
  away: number;
  unit?: '%';
}

export interface LineupPlayer {
  id: string;
  name: string;
  number: string;
  position?: string;
  subbedIn: boolean;
  subbedOut: boolean;
}

export interface Lineup {
  formation?: string;
  starters: LineupPlayer[];
  bench: LineupPlayer[];
}

/** Compléments du détail : statistiques, compositions, remplacements, stade. */
export interface MatchSummary {
  venue?: string;
  attendance?: number;
  stats: SummaryStat[];
  lineups?: { home: Lineup; away: Lineup };
  subs: MatchEvent[];
}

export interface StandingRow {
  rank: number;
  team: Team;
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  diff: string;
  points: number | null;
}

export interface StandingsTable {
  title: string;
  rows: StandingRow[];
}

/** Modèle commun : l'UI ne connaît que ça, jamais le format d'une API. */
export interface Match {
  id: string;
  competitionId: string;
  kickoff: string; // ISO UTC
  status: MatchStatus;
  /** Minute affichée en direct : « 67' », « MT », « 2e MT »… */
  clock?: string;
  home: Team;
  away: Team;
  homeScore?: number;
  awayScore?: number;
  events?: MatchEvent[];
}

export interface Competition {
  id: string;
  sport: SportId;
  name: string;
  short: string;
  /** Chemin ESPN : /sports/{espn.sport}/{espn.league}/scoreboard */
  espn: { sport: 'soccer' | 'rugby'; league: string };
  /** Rugby : ne garder que les matchs impliquant ces équipes. */
  onlyTeams?: string[];
}

export interface TeamEntry {
  sport: SportId;
  team: Team;
}

export interface MatchProvider {
  /** `only` : ne recharger que ces compétitions (rafraîchissement live). */
  getMatches(dayKey: string, signal?: AbortSignal, only?: string[]): Promise<Match[]>;
  /** Prochains matchs à venir (toutes compétitions suivies), triés par date. */
  getUpcoming(signal?: AbortSignal): Promise<Match[]>;
  /** Statistiques, compositions et remplacements d'un match (1 appel). */
  getSummary(comp: Competition, matchId: string, signal?: AbortSignal): Promise<MatchSummary | null>;
  /** Classement de la compétition (le groupe qui contient ces équipes), ou null s'il n'existe pas. */
  getStandings(comp: Competition, teamIds: string[], signal?: AbortSignal): Promise<StandingsTable | null>;
  /** Équipes proposées dans le sélecteur de favoris. */
  getTeams(signal?: AbortSignal): Promise<TeamEntry[]>;
}

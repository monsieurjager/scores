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
  /** Équipes proposées dans le sélecteur de favoris. */
  getTeams(signal?: AbortSignal): Promise<TeamEntry[]>;
}

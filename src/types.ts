export type SportId = 'football' | 'rugby';
export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed';

export interface Team {
  id: string;
  name: string;
  short: string;
  logo?: string;
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

export interface MatchProvider {
  getMatches(dayKey: string, signal?: AbortSignal): Promise<Match[]>;
}

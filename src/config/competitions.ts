import type { Competition } from '../types';

/**
 * Registre des compétitions suivies.
 * Pour en ajouter une : ajouter une entrée ici, rien d'autre.
 */
export const COMPETITIONS: Competition[] = [
  { id: 'l1', sport: 'football', name: 'Ligue 1', short: 'L1', espn: { sport: 'soccer', league: 'fra.1' } },
  { id: 'pl', sport: 'football', name: 'Premier League', short: 'PL', espn: { sport: 'soccer', league: 'eng.1' } },
  { id: 'liga', sport: 'football', name: 'Liga', short: 'Liga', espn: { sport: 'soccer', league: 'esp.1' } },
  { id: 'sa', sport: 'football', name: 'Serie A', short: 'Serie A', espn: { sport: 'soccer', league: 'ita.1' } },
  { id: 'bl', sport: 'football', name: 'Bundesliga', short: 'Bundesliga', espn: { sport: 'soccer', league: 'ger.1' } },
  { id: 'c1', sport: 'football', name: 'Ligue des champions', short: 'C1', espn: { sport: 'soccer', league: 'uefa.champions' } },
  { id: 'c3', sport: 'football', name: 'Ligue Europa', short: 'C3', espn: { sport: 'soccer', league: 'uefa.europa' } },
  { id: 'c4', sport: 'football', name: 'Ligue Conférence', short: 'C4', espn: { sport: 'soccer', league: 'uefa.europa.conf' } },
  // Équipe de France de football (matchs internationaux)
  { id: 'ldn', sport: 'football', name: 'Ligue des nations', short: 'LdN', espn: { sport: 'soccer', league: 'uefa.nations' }, onlyTeams: ['FRA'] },
  { id: 'amical', sport: 'football', name: 'Match amical', short: 'Amical', espn: { sport: 'soccer', league: 'fifa.friendly' }, onlyTeams: ['FRA'] },
  { id: 'cdm', sport: 'football', name: 'Coupe du monde', short: 'CdM', espn: { sport: 'soccer', league: 'fifa.world' }, onlyTeams: ['FRA'] },
  { id: 'q-cdm', sport: 'football', name: 'Qualifications Coupe du monde', short: 'Qualifs CdM', espn: { sport: 'soccer', league: 'fifa.worldq.uefa' }, onlyTeams: ['FRA'] },
  { id: 'euro', sport: 'football', name: 'Euro', short: 'Euro', espn: { sport: 'soccer', league: 'uefa.euro' }, onlyTeams: ['FRA'] },
  { id: 'q-euro', sport: 'football', name: 'Qualifications Euro', short: 'Qualifs Euro', espn: { sport: 'soccer', league: 'uefa.euroq' }, onlyTeams: ['FRA'] },
  // Rugby : XV de France
  { id: 'nations', sport: 'rugby', name: 'Championnat des Nations', short: 'Nations', espn: { sport: 'rugby', league: '17567' }, onlyTeams: ['FRA'] },
  { id: 'six', sport: 'rugby', name: 'Six Nations', short: 'Six Nations', espn: { sport: 'rugby', league: '180659' }, onlyTeams: ['FRA'] },
  { id: 'tests', sport: 'rugby', name: 'Tests internationaux', short: 'Tests', espn: { sport: 'rugby', league: '289234' }, onlyTeams: ['FRA'] },
  { id: 'rwc', sport: 'rugby', name: 'Coupe du monde de rugby', short: 'Mondial', espn: { sport: 'rugby', league: '164205' }, onlyTeams: ['FRA'] },
];

export const SPORTS = [
  { id: 'football', label: 'Foot' },
  { id: 'rugby', label: 'Rugby' },
] as const;

export const competitionById = (id: string) => COMPETITIONS.find((c) => c.id === id);

/** Compétition « équipe nationale » : on ne garde que les matchs de la France. */
export const isNational = (c: Competition) => !!c.onlyTeams;

import type { Competition } from '../types';

/** Sélections nationales de foot suivies (abréviations ESPN). La France est traitée à part (« Les Bleus »). */
export const BIG_NATIONS = ['FRA', 'ESP', 'ENG', 'GER', 'ITA', 'POR', 'NED', 'BEL', 'CRO', 'BRA', 'ARG', 'URU'];
export const FRANCE = 'FRA';

/**
 * Registre des compétitions suivies.
 * Pour en ajouter une : ajouter une entrée ici, rien d'autre.
 */
export const COMPETITIONS: Competition[] = [
  { id: 'l1', sport: 'football', name: 'Ligue 1', espn: { sport: 'soccer', league: 'fra.1' } },
  { id: 'pl', sport: 'football', name: 'Premier League', espn: { sport: 'soccer', league: 'eng.1' } },
  { id: 'liga', sport: 'football', name: 'Liga', espn: { sport: 'soccer', league: 'esp.1' } },
  { id: 'sa', sport: 'football', name: 'Serie A', espn: { sport: 'soccer', league: 'ita.1' } },
  { id: 'bl', sport: 'football', name: 'Bundesliga', espn: { sport: 'soccer', league: 'ger.1' } },
  { id: 'c1', sport: 'football', name: 'Ligue des champions', espn: { sport: 'soccer', league: 'uefa.champions' } },
  { id: 'c3', sport: 'football', name: 'Ligue Europa', espn: { sport: 'soccer', league: 'uefa.europa' } },
  { id: 'c4', sport: 'football', name: 'Ligue Conférence', espn: { sport: 'soccer', league: 'uefa.europa.conf' } },
  // Équipe de France de football (matchs internationaux)
  { id: 'ldn', sport: 'football', name: 'Ligue des nations', espn: { sport: 'soccer', league: 'uefa.nations' }, onlyTeams: BIG_NATIONS },
  { id: 'amical', sport: 'football', name: 'Match amical', espn: { sport: 'soccer', league: 'fifa.friendly' }, onlyTeams: BIG_NATIONS },
  { id: 'cdm', sport: 'football', name: 'Coupe du monde', espn: { sport: 'soccer', league: 'fifa.world' }, onlyTeams: BIG_NATIONS },
  { id: 'q-cdm', sport: 'football', name: 'Qualifications Coupe du monde', espn: { sport: 'soccer', league: 'fifa.worldq.uefa' }, onlyTeams: BIG_NATIONS },
  { id: 'euro', sport: 'football', name: 'Euro', espn: { sport: 'soccer', league: 'uefa.euro' }, onlyTeams: BIG_NATIONS },
  { id: 'q-euro', sport: 'football', name: 'Qualifications Euro', espn: { sport: 'soccer', league: 'uefa.euroq' }, onlyTeams: BIG_NATIONS },
  // Rugby : XV de France
  { id: 'nations', sport: 'rugby', name: 'Championnat des Nations', espn: { sport: 'rugby', league: '17567' }, onlyTeams: ['FRA'] },
  { id: 'six', sport: 'rugby', name: 'Six Nations', espn: { sport: 'rugby', league: '180659' }, onlyTeams: ['FRA'] },
  { id: 'tests', sport: 'rugby', name: 'Tests internationaux', espn: { sport: 'rugby', league: '289234' }, onlyTeams: ['FRA'] },
  { id: 'rwc', sport: 'rugby', name: 'Coupe du monde de rugby', espn: { sport: 'rugby', league: '164205' }, onlyTeams: ['FRA'] },
  // Rugby : clubs
  { id: 'top14', sport: 'rugby', name: 'Top 14', espn: { sport: 'rugby', league: '270559' } },
  { id: 'rcc', sport: 'rugby', name: 'Champions Cup', espn: { sport: 'rugby', league: '271937' } },
  { id: 'rchc', sport: 'rugby', name: 'Challenge Cup', espn: { sport: 'rugby', league: '272073' } },
];

export const SPORTS = [
  { id: 'football', label: 'Foot' },
  { id: 'rugby', label: 'Rugby' },
] as const;

export const competitionById = (id: string) => COMPETITIONS.find((c) => c.id === id);

/** Compétition « équipes nationales » : on ne garde que les matchs des sélections listées (onlyTeams). */
export const isNational = (c: Competition) => !!c.onlyTeams;

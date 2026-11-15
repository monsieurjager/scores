import teamsData from '../data/teams.json';
import type { SportId } from '../types';

const national = new Set((teamsData as { sport: string; id: string; national: boolean }[]).filter((t) => t.national).map((t) => `${t.sport}:${t.id}`));

/** Équipe nationale (sélection) ou club ? D'après la liste embarquée. */
export const isNationalTeam = (sport: SportId, id: string) => national.has(`${sport}:${id}`);

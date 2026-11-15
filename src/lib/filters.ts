import type { Match, SportId } from '../types';
import { COMPETITIONS, FRANCE, isNational } from '../config/competitions';

export type SportFilter = 'all' | SportId;

const compOf = (m: Match) => COMPETITIONS.find((c) => c.id === m.competitionId);
export const involvesFrance = (m: Match) => m.home.short === FRANCE || m.away.short === FRANCE;

/** Match de la France (sélection, foot ou rugby). */
export function isFranceMatch(m: Match): boolean {
  const c = compOf(m);
  return !!c && isNational(c) && involvesFrance(m);
}

/** Match d'une autre sélection suivie. */
export function isOtherNation(m: Match): boolean {
  const c = compOf(m);
  return !!c && isNational(c) && !involvesFrance(m);
}

/**
 * Compétition réellement appliquée : seulement quand les pastilles sont visibles (un sport choisi)
 * et que l'option existe. Sinon « all » (corrige le filtre qui restait actif en revenant sur « Tout »).
 */
export function effectiveComp(sport: SportFilter, comp: string, optionIds: string[]): string {
  return sport !== 'all' && optionIds.includes(comp) ? comp : 'all';
}

/** Filtre sport + compétition (« bleus » : la France seule ; « selections » : toutes les sélections). */
export function matchesFilter(m: Match, sport: SportFilter, comp: string): boolean {
  const c = compOf(m);
  if (!c) return false;
  if (sport !== 'all' && c.sport !== sport) return false;
  if (comp === 'bleus') return isNational(c) && involvesFrance(m);
  if (comp === 'selections') return isNational(c);
  return comp === 'all' || c.id === comp;
}

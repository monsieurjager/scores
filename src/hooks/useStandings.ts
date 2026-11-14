import { useEffect, useState } from 'preact/hooks';
import type { Competition, StandingsTable } from '../types';
import { provider } from '../providers';

/** undefined : chargement · null : pas de classement pour cette compétition ou échec. */
export function useStandings(comp: Competition | undefined, teamIds: string[]) {
  const [table, setTable] = useState<StandingsTable | null | undefined>(undefined);
  const ids = teamIds.join(',');
  useEffect(() => {
    if (!comp) return setTable(null);
    const ctl = new AbortController();
    setTable(undefined);
    provider.getStandings(comp, ids.split(','), ctl.signal).then(
      (t) => !ctl.signal.aborted && setTable(t),
      () => !ctl.signal.aborted && setTable(null),
    );
    return () => ctl.abort();
  }, [comp?.id, ids]);
  return table;
}

import { useEffect, useState } from 'preact/hooks';
import type { Match } from '../types';
import { provider } from '../providers';
import { publishMatches } from '../lib/matchStore';
import { cachedUpcoming, storeUpcoming } from '../lib/dayCache';

/**
 * Prochains matchs : les derniers connus s'affichent tout de suite, puis une seule mise à jour (pas de rafraîchissement).
 * null : en chargement. En cas d'échec sans données connues : liste vide (les sections sont masquées).
 */
export function useUpcoming(enabled: boolean) {
  const [matches, setMatches] = useState<Match[] | null>(() => {
    const c = cachedUpcoming();
    if (c) publishMatches(c);
    return c;
  });
  useEffect(() => {
    if (!enabled) return;
    const ctl = new AbortController();
    provider.getUpcoming(ctl.signal).then(
      (m) => {
        publishMatches(m);
        storeUpcoming(m);
        setMatches(m);
      },
      () => !ctl.signal.aborted && setMatches((prev) => prev ?? []),
    );
    return () => ctl.abort();
  }, [enabled]);
  return matches;
}

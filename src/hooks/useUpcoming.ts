import { useEffect, useState } from 'preact/hooks';
import type { Match } from '../types';
import { provider } from '../providers';
import { publishMatches } from '../lib/matchStore';

/** Prochains matchs : chargés une seule fois, sans rafraîchissement. null : en chargement. En cas d'échec : liste vide (les sections sont masquées). */
export function useUpcoming(enabled: boolean) {
  const [matches, setMatches] = useState<Match[] | null>(null);
  useEffect(() => {
    if (!enabled || matches) return;
    const ctl = new AbortController();
    provider.getUpcoming(ctl.signal).then((m) => {
      publishMatches(m);
      setMatches(m);
    }, () => !ctl.signal.aborted && setMatches([]));
    return () => ctl.abort();
  }, [enabled]);
  return matches;
}

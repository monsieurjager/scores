import { useEffect, useState } from 'preact/hooks';
import type { Match } from '../types';
import { provider } from '../providers';

/** Prochains matchs : chargés une seule fois, sans rafraîchissement. En cas d'échec, la section est simplement masquée. */
export function useUpcoming(enabled: boolean) {
  const [matches, setMatches] = useState<Match[] | null>(null);
  useEffect(() => {
    if (!enabled || matches) return;
    const ctl = new AbortController();
    provider.getUpcoming(ctl.signal).then(setMatches, () => {});
    return () => ctl.abort();
  }, [enabled]);
  return matches;
}

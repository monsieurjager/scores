import { useEffect, useState } from 'preact/hooks';
import type { Match } from '../types';
import { provider } from '../providers';
import { publishMatches } from '../lib/matchStore';

/** Prochains matchs : chargés une seule fois, sans rafraîchissement. En cas d'échec, la section est simplement masquée. */
export function useUpcoming(enabled: boolean) {
  const [matches, setMatches] = useState<Match[] | null>(null);
  useEffect(() => {
    if (!enabled || matches) return;
    const ctl = new AbortController();
    provider.getUpcoming(ctl.signal).then((m) => {
      publishMatches(m);
      setMatches(m);
    }, () => {});
    return () => ctl.abort();
  }, [enabled]);
  return matches;
}

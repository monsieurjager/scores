import { useEffect, useState } from 'preact/hooks';
import type { Competition, MatchSummary } from '../types';
import { provider } from '../providers';

/** Compléments du détail. Rafraîchis toutes les 20 s tant que le match est en cours. undefined : chargement · null : indisponible. */
export function useSummary(comp: Competition | undefined, matchId: string, live: boolean) {
  const [summary, setSummary] = useState<MatchSummary | null | undefined>(undefined);
  useEffect(() => {
    if (!comp) return setSummary(null);
    let stopped = false;
    const ctl = new AbortController();
    const load = () =>
      provider.getSummary(comp, matchId, ctl.signal).then(
        (s) => !stopped && setSummary(s),
        () => !stopped && setSummary((prev) => (prev === undefined ? null : prev)),
      );
    load();
    const id = live ? setInterval(() => document.visibilityState === 'visible' && load(), 20_000) : undefined;
    return () => {
      stopped = true;
      ctl.abort();
      if (id) clearInterval(id);
    };
  }, [comp?.id, matchId, live]);
  return summary;
}

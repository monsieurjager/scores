import { useCallback, useEffect, useState } from 'preact/hooks';
import type { TeamEntry } from '../types';
import { provider } from '../providers';

let cache: TeamEntry[] | null = null;

/** Liste des équipes pour le sélecteur : chargée à l'ouverture, puis gardée en mémoire. */
export function useTeams(enabled: boolean) {
  const [teams, setTeams] = useState<TeamEntry[] | null>(cache);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || cache) return;
    const ctl = new AbortController();
    setError(false);
    provider.getTeams(ctl.signal).then(
      (t) => {
        cache = t;
        setTeams(t);
      },
      () => !ctl.signal.aborted && setError(true),
    );
    return () => ctl.abort();
  }, [enabled, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { teams, error, retry };
}

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Match } from '../types';
import { provider } from '../providers';
import { todayKey } from '../lib/date';

export type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; matches: Match[] };

const REFRESH_MS = 30_000;

/**
 * Charge les matchs d'un jour. Rafraîchit toutes les 30 s UNIQUEMENT si un match
 * est en cours ; sinon, un seul minuteur se déclenche au prochain coup d'envoi.
 */
export function useMatches(dayKey: string) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const abort = useRef<AbortController | undefined>(undefined);

  const load = useCallback(
    async (silent: boolean) => {
      abort.current?.abort();
      const ctl = (abort.current = new AbortController());
      if (!silent) setState({ status: 'loading' });
      try {
        const matches = await provider.getMatches(dayKey, ctl.signal);
        if (!ctl.signal.aborted) setState({ status: 'ready', matches });
      } catch (e) {
        if (ctl.signal.aborted) return;
        // un échec de rafraîchissement silencieux garde les données affichées
        setState((s) => (silent && s.status === 'ready' ? s : { status: 'error' }));
      }
    },
    [dayKey],
  );

  useEffect(() => {
    load(false);
    return () => abort.current?.abort();
  }, [load]);

  // Rafraîchissement conditionnel
  useEffect(() => {
    if (state.status !== 'ready' || dayKey !== todayKey()) return;
    const live = state.matches.some((m) => m.status === 'live');
    if (live) {
      const id = setInterval(() => document.visibilityState === 'visible' && load(true), REFRESH_MS);
      return () => clearInterval(id);
    }
    const next = state.matches
      .filter((m) => m.status === 'scheduled')
      .map((m) => new Date(m.kickoff).getTime())
      .filter((k) => k > Date.now())
      .sort((a, b) => a - b)[0];
    if (!next) return;
    const id = setTimeout(() => load(true), Math.min(next - Date.now() + 1000, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [state, dayKey, load]);

  // Au retour au premier plan, on remet à jour si un match est en cours
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && state.status === 'ready' && state.matches.some((m) => m.status === 'live')) load(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [state, load]);

  return { state, retry: () => load(false) };
}

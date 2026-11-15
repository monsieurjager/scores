import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Match } from '../types';
import { provider } from '../providers';
import { todayKey } from '../lib/date';
import { publishMatches } from '../lib/matchStore';
import { useSettings } from '../lib/settings';

export type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; matches: Match[] };

// Intervalle choisi dans les réglages (5 s par défaut : ESPN garde ses réponses 1 à 9 s, descendre plus bas ne servirait à rien).

/** Compétitions qui ont besoin d'être rafraîchies : match en cours, ou coup d'envoi dépassé. */
function activeCompetitions(matches: Match[]): string[] {
  const now = Date.now();
  const ids = new Set<string>();
  for (const m of matches) {
    if (m.status === 'live' || (m.status === 'scheduled' && new Date(m.kickoff).getTime() <= now + 60_000)) ids.add(m.competitionId);
  }
  return [...ids];
}

/**
 * Charge les matchs d'un jour. Tant qu'un match est en cours, rafraîchit toutes les 5 s
 * uniquement les compétitions concernées. Sinon : aucun appel, sauf un minuteur au prochain coup d'envoi.
 */
export function useMatches(dayKey: string) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const { refreshSec } = useSettings();
  const abort = useRef<AbortController | undefined>(undefined);

  const load = useCallback(
    async (silent: boolean, only?: string[]) => {
      abort.current?.abort();
      const ctl = (abort.current = new AbortController());
      if (!silent) setState({ status: 'loading' });
      try {
        const fresh = await provider.getMatches(dayKey, ctl.signal, only);
        if (ctl.signal.aborted) return;
        publishMatches(fresh);
        setState((prev) => {
          if (!only || prev.status !== 'ready') return { status: 'ready', matches: fresh };
          const kept = prev.matches.filter((m) => !only.includes(m.competitionId));
          return { status: 'ready', matches: [...kept, ...fresh].sort((a, b) => a.kickoff.localeCompare(b.kickoff)) };
        });
      } catch {
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

  useEffect(() => {
    if (state.status !== 'ready' || dayKey !== todayKey()) return;
    const active = activeCompetitions(state.matches);
    if (active.length > 0) {
      const id = setInterval(() => document.visibilityState === 'visible' && load(true, active), refreshSec * 1000);
      return () => clearInterval(id);
    }
    const next = state.matches
      .filter((m) => m.status === 'scheduled')
      .map((m) => new Date(m.kickoff).getTime())
      .filter((k) => k > Date.now())
      .sort((a, b) => a - b)[0];
    if (!next) return;
    const id = setTimeout(() => load(true), Math.min(next - Date.now() - 60_000, 2 ** 31 - 1) + 1000);
    return () => clearTimeout(id);
  }, [state, dayKey, load, refreshSec]);

  // Retour au premier plan : mise à jour immédiate si un match est en cours
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible' || state.status !== 'ready' || dayKey !== todayKey()) return;
      const active = activeCompetitions(state.matches);
      if (active.length > 0) load(true, active);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [state, dayKey, load]);

  return { state, retry: () => load(false), refresh: () => load(true) };
}

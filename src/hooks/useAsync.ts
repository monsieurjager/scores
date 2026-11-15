import { useEffect, useState } from 'preact/hooks';

/** Petit chargeur générique : undefined (chargement) · null (échec) · valeur. */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[]): T | null | undefined {
  const [value, setValue] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    const ctl = new AbortController();
    setValue(undefined);
    fn(ctl.signal).then(
      (v) => !ctl.signal.aborted && setValue(v),
      () => !ctl.signal.aborted && setValue(null),
    );
    return () => ctl.abort();
  }, deps);
  return value;
}

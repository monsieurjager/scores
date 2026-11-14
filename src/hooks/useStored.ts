import { useState } from 'preact/hooks';

/** État persistant en localStorage (favoris, réglages) — jamais d'envoi réseau. */
export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* stockage indisponible : on garde l'état en mémoire */
    }
  };
  return [value, set] as const;
}

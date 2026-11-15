import { useRef, useState } from 'preact/hooks';

/**
 * Gestes tactiles de l'écran Scores :
 * - balayage horizontal net (> 70 px, plus horizontal que vertical, < 600 ms) → onSwipe ;
 * - en haut de page, tirer vers le bas (> 64 px) puis relâcher → onRefresh.
 * Les pastilles (défilement horizontal) et les feuilles ouvertes sont ignorées.
 */
export function useGestures({ onSwipe, onRefresh }: { onSwipe: (dir: 'left' | 'right') => void; onRefresh: () => Promise<unknown> }) {
  const start = useRef<{ x: number; y: number; t: number; ignore: boolean } | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handlers = {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      const target = e.target as HTMLElement;
      start.current = { x: t.clientX, y: t.clientY, t: Date.now(), ignore: !!target.closest('.chips, .daystrip, .sheet, input, .segmented') };
    },
    onTouchMove: (e: TouchEvent) => {
      const s = start.current;
      if (!s || s.ignore || refreshing) return;
      const t = e.touches[0];
      const dy = t.clientY - s.y;
      const dx = t.clientX - s.x;
      if (window.scrollY <= 0 && dy > 0 && dy > Math.abs(dx)) setPull(Math.min(dy * 0.5, 90));
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s || s.ignore) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (pull > 64 && !refreshing) {
        setRefreshing(true);
        const minDelay = new Promise((r) => setTimeout(r, 600));
        Promise.allSettled([onRefresh(), minDelay]).then(() => setRefreshing(false));
      } else if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy) && Date.now() - s.t < 600) {
        onSwipe(dx < 0 ? 'left' : 'right');
      }
      setPull(0);
    },
  };
  return { pull, refreshing, handlers };
}

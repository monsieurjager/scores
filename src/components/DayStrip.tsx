import { useEffect, useRef } from 'preact/hooks';
import { addDays, dayLong, todayKey, weekdayShort } from '../lib/date';

/** Bande de jours défilante (façon Apple Sports) : 2 semaines avant, 4 semaines après aujourd'hui. */
export function DayStrip({ value, onChange, stuck }: { value: string; onChange: (day: string) => void; stuck: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const today = todayKey();
  // Plage stable (ne bouge pas à chaque tap), élargie si une date lointaine est choisie au calendrier.
  const start = value < addDays(today, -14) ? addDays(value, -3) : addDays(today, -14);
  const end = value > addDays(today, 28) ? addDays(value, 3) : addDays(today, 28);
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  // Garde le jour choisi centré
  useEffect(() => {
    const box = ref.current;
    const el = box?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!box || !el) return;
    box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: first.current ? 'auto' : 'smooth' });
    first.current = false;
  }, [value]);

  return (
    <div class={`daystrip-bar${stuck ? ' stuck' : ''}`}>
      <div class="daystrip" ref={ref} role="toolbar" aria-label="Choisir un jour">
        {days.map((d) => (
          <button key={d} class={`day${d === today ? ' today' : ''}`} aria-pressed={d === value} aria-label={dayLong(d)} onClick={() => onChange(d)}>
            <small>{d === today ? 'AUJ' : weekdayShort(d)}</small>
            <b class="tnum">{Number(d.slice(8))}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Match } from '../types';
import { COMPETITIONS, SPORTS } from '../config/competitions';
import { addDays, dayKeyOf, dayLabel, dayLong, todayKey } from '../lib/date';
import { useMatches } from '../hooks/useMatches';
import { useStored } from '../hooks/useStored';
import { Chips, Empty, MatchRow, Section, Segmented, Skeletons } from '../components/ui';
import { IconCalendar, IconChevron } from '../components/icons';

type SportFilter = 'all' | 'football' | 'rugby';

export function Today() {
  const [dayKey, setDayKey] = useState(todayKey());
  const [sport, setSport] = useStored<SportFilter>('filter.sport', 'all');
  const [comp, setComp] = useStored<string>('filter.comp', 'all');
  const [scrolled, setScrolled] = useState(false);
  const { state, retry } = useMatches(dayKey);
  const dateInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Si le jour courant change (minuit passé), on ne force rien : l'utilisateur navigue.
  const comps = useMemo(() => COMPETITIONS.filter((c) => sport === 'all' || c.sport === sport), [sport]);
  const compOptions = [{ id: 'all', label: 'Toutes' }, ...comps.map((c) => ({ id: c.id, label: c.short }))];
  const activeComp = comps.some((c) => c.id === comp) ? comp : 'all';

  const visible: Match[] = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.matches.filter((m) => {
      const c = COMPETITIONS.find((x) => x.id === m.competitionId);
      if (!c) return false;
      if (sport !== 'all' && c.sport !== sport) return false;
      if (activeComp !== 'all' && c.id !== activeComp) return false;
      return true;
    });
  }, [state, sport, activeComp]);

  const live = visible.filter((m) => m.status === 'live');
  const upcoming = visible.filter((m) => m.status === 'scheduled' || m.status === 'postponed');
  const finished = visible.filter((m) => m.status === 'finished');
  const isToday = dayKey === todayKey();
  const go = (n: number) => setDayKey(addDays(dayKey, n));

  return (
    <>
      <header class="navbar glass">
        <div class="navbar-inner">
          <div class="nav-actions">
            <button class="icon-btn" aria-label="Jour précédent" onClick={() => go(-1)}>
              <IconChevron dir="left" />
            </button>
            <button class="icon-btn" aria-label="Jour suivant" onClick={() => go(1)}>
              <IconChevron dir="right" />
            </button>
          </div>
          <div class={`nav-title${scrolled ? ' visible' : ''}`}>{dayLabel(dayKey)}</div>
          <div class="nav-actions">
            {!isToday && (
              <button class="text-btn" onClick={() => setDayKey(todayKey())}>
                Aujourd'hui
              </button>
            )}
            <label class="icon-btn" aria-label="Choisir une date">
              <IconCalendar />
              <input
                ref={dateInput}
                type="date"
                value={dayKey}
                onChange={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  if (v) setDayKey(dayKeyOf(`${v}T12:00:00Z`));
                }}
              />
            </label>
          </div>
        </div>
      </header>

      <main class="screen">
        <div class="large-title">
          <h1>{dayLabel(dayKey)}</h1>
          <p>{dayLong(dayKey)}</p>
        </div>

        <div class="filters">
          <Segmented<SportFilter> label="Sport" value={sport} onChange={setSport} options={[{ id: 'all', label: 'Tout' }, ...SPORTS.map((s) => ({ id: s.id as SportFilter, label: s.label }))]} />
          {sport !== 'all' && <Chips value={activeComp} options={compOptions} onChange={setComp} />}
        </div>

        <div key={dayKey + sport + activeComp + state.status} class="fade-in">
          {state.status === 'loading' && <Skeletons />}
          {state.status === 'error' && <Empty error title="Impossible de charger les scores" text="Vérifie ta connexion, puis réessaie." action="Réessayer" onAction={retry} />}
          {state.status === 'ready' && visible.length === 0 && (
            <Empty
              title="Aucun match"
              text={sport === 'all' && activeComp === 'all' ? 'Rien au programme de tes compétitions ce jour-là.' : 'Aucun match pour ce filtre ce jour-là.'}
              action={isToday ? undefined : "Revenir à aujourd'hui"}
              onAction={() => setDayKey(todayKey())}
            />
          )}
          {live.length > 0 && (
            <Section title="En direct" live>
              {live.map((m) => <MatchRow key={m.id} m={m} />)}
            </Section>
          )}
          {upcoming.length > 0 && (
            <Section title="À venir">
              {upcoming.map((m) => <MatchRow key={m.id} m={m} />)}
            </Section>
          )}
          {finished.length > 0 && (
            <Section title="Terminés">
              {finished.map((m) => <MatchRow key={m.id} m={m} />)}
            </Section>
          )}
        </div>
      </main>
    </>
  );
}

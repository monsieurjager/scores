import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Match } from '../types';
import { COMPETITIONS, SPORTS, isNational } from '../config/competitions';
import { addDays, dayKeyOf, dayLabel, dayLong, isRelativeDay, todayKey } from '../lib/date';
import { useMatches } from '../hooks/useMatches';
import { useUpcoming } from '../hooks/useUpcoming';
import { useStored } from '../hooks/useStored';
import { isFavMatch, useFavorites } from '../lib/favorites';
import { enabledCompetitions, useSettings } from '../lib/settings';
import { useOnline } from '../hooks/useOnline';
import { Chips, CompactCard, Empty, LiveCard, Section, Segmented, Skeletons } from '../components/ui';
import { IconCalendar, IconChevron } from '../components/icons';

type SportFilter = 'all' | 'football' | 'rugby';

/** `?day=2026-11-07` ouvre directement ce jour (pratique pour tester). */
const initialDay = () => {
  const d = new URLSearchParams(location.search).get('day');
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayKey();
};

export function Today() {
  const [dayKey, setDayKey] = useState(initialDay);
  const [sport, setSport] = useStored<SportFilter>('filter.sport', 'all');
  const [comp, setComp] = useStored<string>('filter.comp', 'all');
  const [scrolled, setScrolled] = useState(false);
  const { state, retry } = useMatches(dayKey);
  const upcomingAll = useUpcoming(dayKey === todayKey());
  const { keys: favKeys } = useFavorites();
  useSettings();
  const online = useOnline();
  const dateInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Pastilles : championnats de clubs + « Les Bleus » (toutes les compétitions de l'équipe de France du sport choisi)
  const enabled = enabledCompetitions();
  const clubComps = enabled.filter((c) => (sport === 'all' || c.sport === sport) && !isNational(c));
  const hasBleus = sport === 'football' && enabled.some((c) => c.sport === 'football' && isNational(c));
  const compOptions = [{ id: 'all', label: 'Toutes' }, ...clubComps.map((c) => ({ id: c.id, label: c.short })), ...(hasBleus ? [{ id: 'bleus', label: 'Les Bleus' }] : [])];
  const activeComp = compOptions.some((o) => o.id === comp) ? comp : 'all';
  const showChips = sport === 'football';

  const matchesFilter = (m: Match) => {
    const c = COMPETITIONS.find((x) => x.id === m.competitionId);
    if (!c) return false;
    if (sport !== 'all' && c.sport !== sport) return false;
    if (activeComp === 'bleus') return isNational(c);
    return activeComp === 'all' || c.id === activeComp;
  };
  const visible: Match[] = useMemo(() => (state.status === 'ready' ? state.matches.filter(matchesFilter) : []), [state, sport, activeComp]);
  const upcomingNext = (upcomingAll ?? []).filter(matchesFilter);
  const isFrance = (m: Match) => {
    const c = COMPETITIONS.find((x) => x.id === m.competitionId);
    return !!c && isNational(c);
  };
  const franceNext = upcomingNext.filter(isFrance).slice(0, 4);
  const nextClubs = upcomingNext.filter((m) => !isFrance(m)).slice(0, 8);
  // Les matchs de mes équipes passent en premier, dans une section à part.
  const favMatches = visible.filter((m) => isFavMatch(m, favKeys)).sort((a, b) => Number(b.status === 'live') - Number(a.status === 'live') || a.kickoff.localeCompare(b.kickoff));
  const others = visible.filter((m) => !isFavMatch(m, favKeys));
  const live = others.filter((m) => m.status === 'live');
  const upcoming = others.filter((m) => m.status === 'scheduled' || m.status === 'postponed');
  const finished = others.filter((m) => m.status === 'finished');
  const isToday = dayKey === todayKey();
  const go = (n: number) => setDayKey(addDays(dayKey, n));

  return (
    <>
      <header class={`navbar${scrolled ? ' scrolled' : ''}`}>
        <div class="navbar-inner">
          <div class={`nav-title${scrolled ? ' visible' : ''}`}>{dayLabel(dayKey)}</div>
          <div class="nav-actions">
            {!isToday && (
              <button class="glass pill-btn" onClick={() => setDayKey(todayKey())}>
                Aujourd'hui
              </button>
            )}
            <div class="glass group">
              <button class="icon-btn" aria-label="Jour précédent" onClick={() => go(-1)}>
                <IconChevron dir="left" />
              </button>
              <button class="icon-btn" aria-label="Jour suivant" onClick={() => go(1)}>
                <IconChevron dir="right" />
              </button>
            </div>
            <label class="glass icon-btn round" aria-label="Choisir une date">
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
          {isRelativeDay(dayKey) && <p>{dayLong(dayKey).toUpperCase()}</p>}
          <h1>{dayLabel(dayKey)}</h1>
          {!online && <span class="offline-pill">Hors ligne · dernières données enregistrées</span>}
        </div>

        <div class="filters">
          <Segmented<SportFilter> label="Sport" value={sport} onChange={setSport} options={[{ id: 'all', label: 'Tout' }, ...SPORTS.map((s) => ({ id: s.id as SportFilter, label: s.label }))]} />
          {showChips && <Chips value={activeComp} options={compOptions} onChange={setComp} />}
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
          {favMatches.length > 0 && (
            <Section title="Mes équipes">
              {favMatches.map((m) => (m.status === 'live' ? <LiveCard key={m.id} m={m} /> : <CompactCard key={m.id} m={m} />))}
            </Section>
          )}
          {live.length > 0 && (
            <Section title="En direct" live>
              {live.map((m) => <LiveCard key={m.id} m={m} />)}
            </Section>
          )}
          {upcoming.length > 0 && (
            <Section title="À venir">
              {upcoming.map((m) => <CompactCard key={m.id} m={m} />)}
            </Section>
          )}
          {finished.length > 0 && (
            <Section title="Terminés">
              {finished.map((m) => <CompactCard key={m.id} m={m} />)}
            </Section>
          )}
          {state.status === 'ready' && franceNext.length > 0 && (
            <Section title="Équipe de France · à venir">
              {franceNext.map((m) => <CompactCard key={m.id} m={m} withDate />)}
            </Section>
          )}
          {state.status === 'ready' && nextClubs.length > 0 && (
            <Section title="Prochains matchs">
              {nextClubs.map((m) => <CompactCard key={m.id} m={m} withDate />)}
            </Section>
          )}
        </div>
      </main>
    </>
  );
}

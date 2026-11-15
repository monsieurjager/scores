import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Match } from '../types';
import { COMPETITIONS, FRANCE, SPORTS, isNational } from '../config/competitions';
import { addDays, dayKeyOf, dayLabel, dayLong, isRelativeDay, todayKey } from '../lib/date';
import { useMatches } from '../hooks/useMatches';
import { useUpcoming } from '../hooks/useUpcoming';
import { useStored } from '../hooks/useStored';
import { isFavMatch, useFavorites } from '../lib/favorites';
import { enabledCompetitions, useSettings } from '../lib/settings';
import { useOnline } from '../hooks/useOnline';
import { Chips, CompactCard, Empty, LiveCard, Section, Segmented, Skeletons } from '../components/ui';
import { pushSheet } from '../lib/matchStore';
import { useGestures } from '../hooks/useGestures';
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
  const { state, retry, refresh } = useMatches(dayKey);
  const upcomingAll = useUpcoming(true);
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

  // Pastilles : championnats de clubs, puis « Les Bleus » / « XV de France » (la France seule) et « Sélections » (foot : toutes les nations suivies)
  const enabled = enabledCompetitions();
  const sportComps = enabled.filter((c) => sport === 'all' || c.sport === sport);
  const clubComps = sportComps.filter((c) => !isNational(c));
  const hasNational = sportComps.some(isNational);
  const compOptions = [
    { id: 'all', label: 'Toutes' },
    ...clubComps.map((c) => ({ id: c.id, label: c.name })),
    ...(hasNational ? [{ id: 'bleus', label: sport === 'rugby' ? 'XV de France' : 'Les Bleus' }] : []),
    ...(hasNational && sport === 'football' ? [{ id: 'selections', label: 'Sélections' }] : []),
  ];
  const isToday = dayKey === todayKey();
  const showChips = sport !== 'all';
  // La compétition choisie ne s'applique que si les pastilles sont visibles (filtre Foot ou Rugby).
  const activeComp = showChips && compOptions.some((o) => o.id === comp) ? comp : 'all';

  const involvesFrance = (m: Match) => m.home.short === FRANCE || m.away.short === FRANCE;
  const compOf = (m: Match) => COMPETITIONS.find((x) => x.id === m.competitionId);
  const matchesFilter = (m: Match) => {
    const c = compOf(m);
    if (!c) return false;
    if (sport !== 'all' && c.sport !== sport) return false;
    if (activeComp === 'bleus') return isNational(c) && involvesFrance(m);
    if (activeComp === 'selections') return isNational(c);
    return activeComp === 'all' || c.id === activeComp;
  };
  const visible: Match[] = useMemo(() => (state.status === 'ready' ? state.matches.filter(matchesFilter) : []), [state, sport, activeComp]);
  const upcomingNext = (upcomingAll ?? []).filter(matchesFilter);
  const isFrance = (m: Match) => {
    const c = compOf(m);
    return !!c && isNational(c) && involvesFrance(m);
  };
  const isOtherNation = (m: Match) => {
    const c = compOf(m);
    return !!c && isNational(c) && !involvesFrance(m);
  };
  // Jour sans match : on montre le prochain match (après le jour affiché), plutôt qu'un écran vide.
  const emptyDay = state.status === 'ready' && visible.length === 0;
  const nextMatch = emptyDay ? upcomingNext.find((m) => dayKeyOf(m.kickoff) > dayKey) : undefined;
  // Pas de doublon : on exclut ce qui est déjà affiché plus haut (liste du jour, prochain match).
  // Ces sections n'ont de sens qu'aujourd'hui ou sur un jour vide.
  const alreadyShown = new Set([...visible.map((m) => m.id), ...(nextMatch ? [nextMatch.id] : [])]);
  const showUpcoming = isToday || emptyDay;
  const franceNext = showUpcoming ? upcomingNext.filter((m) => isFrance(m) && !alreadyShown.has(m.id)).slice(0, 4) : [];
  const nextNations = showUpcoming ? upcomingNext.filter((m) => isOtherNation(m) && !alreadyShown.has(m.id)).slice(0, 4) : [];
  const nextClubs = showUpcoming ? upcomingNext.filter((m) => !isFrance(m) && !isOtherNation(m) && !alreadyShown.has(m.id)).slice(0, 8) : [];
  // Les matchs de mes équipes passent en premier, dans une section à part.
  const favMatches = visible.filter((m) => isFavMatch(m, favKeys)).sort((a, b) => Number(b.status === 'live') - Number(a.status === 'live') || a.kickoff.localeCompare(b.kickoff));
  const others = visible.filter((m) => !isFavMatch(m, favKeys));
  const live = others.filter((m) => m.status === 'live');
  const upcoming = others.filter((m) => m.status === 'scheduled' || m.status === 'postponed');
  const finished = others.filter((m) => m.status === 'finished');
  const [slide, setSlide] = useState<'' | 'next' | 'prev'>('');
  const go = (n: number) => {
    setSlide(n > 0 ? 'next' : 'prev');
    setDayKey(addDays(dayKey, n));
  };
  // Balayer à gauche / à droite : jour suivant / précédent. Tirer vers le bas en haut de page : rafraîchir.
  const { pull, refreshing, handlers } = useGestures({ onSwipe: (dir) => go(dir === 'left' ? 1 : -1), onRefresh: refresh });

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

      <main class="screen" {...handlers}>
        <div class={`ptr${refreshing ? ' busy' : ''}`} style={{ height: `${refreshing ? 48 : pull}px`, opacity: refreshing ? 1 : Math.min(pull / 60, 1) }} aria-hidden={!refreshing}>
          <span class="ptr-spin" style={{ transform: `rotate(${pull * 4}deg)` }} />
        </div>
        <div class="large-title">
          {isRelativeDay(dayKey) && <p>{dayLong(dayKey).toUpperCase()}</p>}
          <h1>{dayLabel(dayKey)}</h1>
          {!online && <span class="offline-pill">Hors ligne · dernières données enregistrées</span>}
        </div>

        <div class="filters">
          <Segmented<SportFilter> label="Sport" value={sport} onChange={(v) => { setSport(v); setComp('all'); }} options={[{ id: 'all', label: 'Tout' }, ...SPORTS.map((s) => ({ id: s.id as SportFilter, label: s.label }))]} />
          {showChips && <Chips value={activeComp} options={compOptions} onChange={setComp} />}
          {showChips && COMPETITIONS.some((c) => c.id === activeComp) && (
            <button class="comp-link" onClick={() => pushSheet({ type: 'comp', id: activeComp })}>
              Classement et journée · {COMPETITIONS.find((c) => c.id === activeComp)!.name} ›
            </button>
          )}
        </div>

        <div key={dayKey + sport + activeComp + state.status} class={`fade-in${slide ? ` slide-${slide}` : ''}`}>
          {state.status === 'loading' && <Skeletons />}
          {state.status === 'error' && <Empty error title="Impossible de charger les scores" text="Vérifie ta connexion, puis réessaie." action="Réessayer" onAction={retry} />}
          {emptyDay && nextMatch && (
            <Section title="Prochain match">
              <CompactCard m={nextMatch} withDate />
              <li style={{ listStyle: 'none' }}>
                <button class="link-btn" onClick={() => setDayKey(dayKeyOf(nextMatch.kickoff))}>
                  Aller à ce jour
                </button>
              </li>
            </Section>
          )}
          {emptyDay && !nextMatch && upcomingAll !== null && (
            <Empty
              title="Aucun match"
              text={sport === 'all' && activeComp === 'all' ? 'Rien au programme de tes compétitions pour le moment.' : 'Aucun match à venir pour ce filtre.'}
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
          {state.status === 'ready' && nextNations.length > 0 && (
            <Section title="Sélections · à venir">
              {nextNations.map((m) => <CompactCard key={m.id} m={m} withDate />)}
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

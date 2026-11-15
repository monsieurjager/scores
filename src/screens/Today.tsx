import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Match } from '../types';
import { COMPETITIONS, SPORTS, isNational } from '../config/competitions';
import { addDays, dayKeyOf, todayKey } from '../lib/date';
import { DayStrip } from '../components/DayStrip';
import { isStale } from '../lib/matchStats';
import { useMatches } from '../hooks/useMatches';
import { useStored } from '../hooks/useStored';
import { isFavMatch, useFavorites } from '../lib/favorites';
import { effectiveComp, matchesFilter, type SportFilter } from '../lib/filters';
import { enabledCompetitions, useSettings } from '../lib/settings';
import { useOnline } from '../hooks/useOnline';
import { Chips, CompactCard, Empty, LiveCard, Section, Segmented, Skeletons } from '../components/ui';
import { pushSheet } from '../lib/matchStore';
import { useGestures } from '../hooks/useGestures';
import { IconCalendar } from '../components/icons';


/** `?day=2026-11-07` ouvre directement ce jour (pratique pour tester). */
let dayParamUsed = false;
const initialDay = () => {
  const d = new URLSearchParams(location.search).get('day');
  if (dayParamUsed || !d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return todayKey();
  dayParamUsed = true;
  return d;
};

export function Today({ onUpcoming }: { onUpcoming: () => void }) {
  const [dayKey, setDayKey] = useState(initialDay);
  const [sport, setSport] = useStored<SportFilter>('filter.sport', 'all');
  const [comp, setComp] = useStored<string>('filter.comp', 'all');
  const [scrolled, setScrolled] = useState(false);
  const { state, retry, refresh } = useMatches(dayKey);
  const { keys: favKeys } = useFavorites();
  useSettings();
  const online = useOnline();
  const dateInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 110);
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
  const activeComp = effectiveComp(sport, comp, compOptions.map((o) => o.id));
  const filter = (m: Match) => matchesFilter(m, sport, activeComp);
  const visible: Match[] = useMemo(() => (state.status === 'ready' ? state.matches.filter(filter) : []), [state, sport, activeComp]);
  // Jour sans match : renvoi vers l'onglet « À venir » (les matchs des autres jours n'ont rien à faire ici).
  const emptyDay = state.status === 'ready' && visible.length === 0;
  // Les matchs de mes équipes passent en premier, dans une section à part.
  const favMatches = visible.filter((m) => isFavMatch(m, favKeys)).sort((a, b) => Number(b.status === 'live') - Number(a.status === 'live') || a.kickoff.localeCompare(b.kickoff));
  const others = visible.filter((m) => !isFavMatch(m, favKeys));
  const live = others.filter((m) => m.status === 'live');
  // Match passé resté « à venir » chez la source (« Score n.c. ») : rangé avec les terminés.
  const upcoming = others.filter((m) => (m.status === 'scheduled' && !isStale(m)) || m.status === 'postponed');
  const finished = others.filter((m) => m.status === 'finished' || isStale(m));
  const [slide, setSlide] = useState<'' | 'next' | 'prev'>('');
  const go = (n: number) => {
    setSlide(n > 0 ? 'next' : 'prev');
    setDayKey(addDays(dayKey, n));
  };
  const pick = (d: string) => {
    if (d === dayKey) return;
    setSlide(d > dayKey ? 'next' : 'prev');
    setDayKey(d);
  };
  // Balayer à gauche / à droite : jour suivant / précédent. Tirer vers le bas en haut de page : rafraîchir.
  const { pull, refreshing, handlers } = useGestures({ onSwipe: (dir) => go(dir === 'left' ? 1 : -1), onRefresh: refresh });

  return (
    <>
      <div class={`status-shade${scrolled ? ' visible' : ''}`} aria-hidden="true" />
      <main class="screen screen-top" {...handlers}>
        <div class={`ptr${refreshing ? ' busy' : ''}`} style={{ height: `${refreshing ? 48 : pull}px`, opacity: refreshing ? 1 : Math.min(pull / 60, 1) }} aria-hidden={!refreshing}>
          <span class="ptr-spin" style={{ transform: `rotate(${pull * 4}deg)` }} />
        </div>
        <div class="title-row">
          <div class="large-title">
            <h1>Scores</h1>
          </div>
          <label class="glass icon-btn round" aria-label="Choisir une date">
            <IconCalendar />
            <input
              ref={dateInput}
              type="date"
              value={dayKey}
              onChange={(e) => {
                const v = (e.target as HTMLInputElement).value;
                if (v) pick(dayKeyOf(`${v}T12:00:00Z`));
              }}
            />
          </label>
        </div>
        {!online && <span class="offline-pill">Hors ligne · dernières données enregistrées</span>}
        <DayStrip value={dayKey} onChange={pick} stuck={scrolled} />

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
          {emptyDay && (
            <Empty
              title="Aucun match ce jour"
              text={sport === 'all' && activeComp === 'all' ? 'Rien au programme de tes compétitions.' : 'Rien au programme pour ce filtre.'}
              action="Voir les matchs à venir"
              onAction={onUpcoming}
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
        </div>
      </main>
    </>
  );
}

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
import { Chips, CompactCard, CompGroup, Empty, HeroLive, Section, Segmented, Skeletons } from '../components/ui';
import { pushSheet } from '../lib/matchStore';
import { useGestures } from '../hooks/useGestures';
import { IconCalendar, IconSearch } from '../components/icons';


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
  // En direct : carrousel (mes équipes d'abord). Puis mes équipes, puis un bloc par compétition.
  const isLive = (m: Match) => m.status === 'live';
  const liveAll = visible.filter(isLive).sort((a, b) => Number(isFavMatch(b, favKeys)) - Number(isFavMatch(a, favKeys)));
  const favMatches = visible.filter((m) => !isLive(m) && isFavMatch(m, favKeys)).sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const groups = COMPETITIONS.map((c) => ({ id: c.id, matches: visible.filter((m) => !isLive(m) && !isFavMatch(m, favKeys) && m.competitionId === c.id).sort((a, b) => a.kickoff.localeCompare(b.kickoff)) })).filter((g) => g.matches.length > 0);
  const [heroIndex, setHeroIndex] = useState(0);
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
          <button class="glass icon-btn round" aria-label="Rechercher une équipe ou une compétition" onClick={() => pushSheet({ type: 'search' })}>
            <IconSearch />
          </button>
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
          <div class="filters-row">
          <Segmented<SportFilter> label="Sport" value={sport} onChange={(v) => { setSport(v); setComp('all'); }} options={[{ id: 'all', label: 'Tout' }, ...SPORTS.map((s) => ({ id: s.id as SportFilter, label: s.label }))]} />
            {liveAll.length > 0 && (
              <span class="live-count">
                <span class="live-dot" />
                {liveAll.length} en direct
              </span>
            )}
          </div>
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
          {liveAll.length > 0 && (
            <section class="section">
              <h2 class="section-title is-live">
                <span class="live-dot" />
                En direct
              </h2>
              <ul
                class="hero-rail"
                onScroll={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  const first = el.firstElementChild as HTMLElement | null;
                  if (first) setHeroIndex(Math.round(el.scrollLeft / (first.offsetWidth + 10)));
                }}
              >
                {liveAll.map((m) => (
                  <HeroLive key={m.id} m={m} />
                ))}
              </ul>
              {liveAll.length > 1 && (
                <div class="rail-dots" aria-hidden="true">
                  {liveAll.map((m, i) => (
                    <span key={m.id} class={i === Math.min(heroIndex, liveAll.length - 1) ? 'on' : ''} />
                  ))}
                </div>
              )}
            </section>
          )}
          {favMatches.length > 0 && (
            <Section title="Mes équipes">
              {favMatches.map((m) => (
                <CompactCard key={m.id} m={m} />
              ))}
            </Section>
          )}
          {groups.map((g) => (
            <CompGroup key={g.id} id={g.id} matches={g.matches} onOpen={() => pushSheet({ type: 'comp', id: g.id })} />
          ))}
        </div>
      </main>
    </>
  );
}

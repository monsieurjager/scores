import { useEffect, useState } from 'preact/hooks';
import type { Match } from '../types';
import { SPORTS } from '../config/competitions';
import { dayKeyOf, dayLong, todayKey } from '../lib/date';
import { useUpcoming } from '../hooks/useUpcoming';
import { useStored } from '../hooks/useStored';
import { isFavMatch, useFavorites } from '../lib/favorites';
import { isFranceMatch, isOtherNation, matchesFilter, type SportFilter } from '../lib/filters';
import { useSettings } from '../lib/settings';
import { Chips, CompactCard, Empty, Section, Segmented, Skeletons } from '../components/ui';

type Kind = 'all' | 'mine' | 'france' | 'nations';

/** Onglet « À venir » : les prochains matchs, jour par jour (rien de tout ça sur l'écran du jour). */
export function Upcoming() {
  const all = useUpcoming(true);
  const [sport, setSport] = useStored<SportFilter>('upcoming.sport', 'all');
  const [kind, setKind] = useState<Kind>('all');
  const { keys: favKeys } = useFavorites();
  useSettings();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const today = todayKey();
  const keep = (m: Match) =>
    matchesFilter(m, sport, 'all') &&
    dayKeyOf(m.kickoff) > today && // les matchs du jour sont sur l'écran Scores
    (kind === 'all' || (kind === 'mine' ? isFavMatch(m, favKeys) : kind === 'france' ? isFranceMatch(m) : isOtherNation(m) || isFranceMatch(m)));
  const list = (all ?? []).filter(keep).sort((a, b) => a.kickoff.localeCompare(b.kickoff)).slice(0, 60);
  const days = new Map<string, Match[]>();
  for (const m of list) {
    const k = dayKeyOf(m.kickoff);
    days.set(k, [...(days.get(k) ?? []), m]);
  }
  const kinds: { id: Kind; label: string }[] = [
    { id: 'all', label: 'Tous' },
    ...(favKeys.size ? [{ id: 'mine' as Kind, label: 'Mes équipes' }] : []),
    { id: 'france', label: sport === 'rugby' ? 'XV de France' : sport === 'football' ? 'Les Bleus' : 'France' },
    ...(sport !== 'rugby' ? [{ id: 'nations' as Kind, label: 'Sélections' }] : []),
  ];

  return (
    <>
      <div class={`status-shade${scrolled ? ' visible' : ''}`} aria-hidden="true" />
      <main class="screen screen-top">
        <div class="title-row">
          <div class="large-title">
            <h1>À venir</h1>
          </div>
        </div>
        <div class="filters">
          <Segmented<SportFilter> label="Sport" value={sport} onChange={setSport} options={[{ id: 'all', label: 'Tout' }, ...SPORTS.map((s) => ({ id: s.id as SportFilter, label: s.label }))]} />
          <Chips value={kind} options={kinds} onChange={(v) => setKind(v as Kind)} />
        </div>
        {all === null && <Skeletons />}
        {all !== null && list.length === 0 && <Empty title="Aucun match à venir" text={kind === 'mine' ? 'Aucun match programmé pour tes équipes favorites.' : 'Rien au programme pour ce filtre.'} />}
        {[...days].map(([k, ms]) => (
          <Section key={k} title={dayLong(k)}>
            {ms.map((m) => (
              <CompactCard key={m.id} m={m} />
            ))}
          </Section>
        ))}
      </main>
    </>
  );
}

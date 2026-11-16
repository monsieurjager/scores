import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useTeams } from '../hooks/useTeams';
import { isNationalTeam } from '../lib/teams';
import { pushSheet } from '../lib/matchStore';
import { COMPETITIONS } from '../config/competitions';
import { Crest, CompLogo, Empty } from './ui';
import { IconSearch } from './icons';
import { Sheet } from './Sheet';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Recherche : équipes et compétitions suivies. */
export function SearchSheet({ onBack, canGoBack }: { onBack: () => void; canGoBack: boolean }) {
  const { teams, error, retry } = useTeams(true);
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const n = norm(q.trim());
  const comps = useMemo(() => (n ? COMPETITIONS.filter((c) => norm(c.name).includes(n)) : []), [n]);
  const list = useMemo(() => (n ? (teams ?? []).filter((e) => norm(e.team.name).includes(n)).slice(0, 40) : []), [teams, n]);
  return (
    <Sheet title="Rechercher" label="Rechercher une équipe ou une compétition" canGoBack={canGoBack} onBack={onBack}>
      <label class="search glass">
        <IconSearch />
        <input ref={input} type="search" placeholder="Équipe ou compétition" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} autocapitalize="off" autocomplete="off" autocorrect="off" enterkeyhint="search" />
      </label>
      {error && <Empty error title="Impossible de charger les équipes" text="Vérifie ta connexion, puis réessaie." action="Réessayer" onAction={retry} />}
      {!n && <p class="note">Tape le nom d'un club, d'une sélection ou d'une compétition.</p>}
      {n && comps.length === 0 && list.length === 0 && teams && <Empty title="Aucun résultat" text="Essaie un autre nom." />}
      <ul class="cards" style={{ marginTop: 12 }}>
        {comps.map((c) => (
          <li key={c.id} class="card team-row" role="button" tabIndex={0} onClick={() => pushSheet({ type: 'comp', id: c.id })}>
            <CompLogo id={c.id} size={28} />
            <div class="team-row-text">
              <span class="team-name">{c.name}</span>
              <span class="muted small">Compétition · {c.sport === 'rugby' ? 'Rugby' : 'Foot'}</span>
            </div>
          </li>
        ))}
        {list.map((e) => (
          <li key={`${e.sport}:${e.team.id}`} class="card team-row" role="button" tabIndex={0} onClick={() => pushSheet({ type: 'team', sport: e.sport, team: e.team, national: isNationalTeam(e.sport, e.team.id) })}>
            <Crest team={e.team} size={28} />
            <div class="team-row-text">
              <span class="team-name">{e.team.name}</span>
              <span class="muted small">{e.sport === 'rugby' ? 'Rugby' : 'Foot'}</span>
            </div>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

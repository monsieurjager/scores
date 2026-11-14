import { useMemo, useState } from 'preact/hooks';
import { COMPETITIONS } from '../config/competitions';
import { useFavorites, isFavMatch, toFav, type Fav } from '../lib/favorites';
import { useTeams } from '../hooks/useTeams';
import { useUpcoming } from '../hooks/useUpcoming';
import { CompactCard, Empty, Section } from '../components/ui';
import { IconPlus, IconSearch, IconStar } from '../components/icons';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const sportLabel = (f: { sport: string }) => (f.sport === 'rugby' ? 'Rugby' : 'Foot');

function TeamLogo({ logo, name }: { logo?: string; name: string }) {
  return logo ? <img class="crest" style={{ '--s': '34px' }} src={logo} width={34} height={34} alt="" loading="lazy" decoding="async" /> : <span class="crest crest-fallback" style={{ '--s': '34px' }}>{name.slice(0, 3).toUpperCase()}</span>;
}

function StarButton({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button class={`star-btn${on ? ' on' : ''}`} aria-pressed={on} aria-label={label} onClick={onClick}>
      <IconStar filled={on} />
    </button>
  );
}

/** Feuille plein écran : recherche et choix des équipes favorites. */
function TeamPicker({ onClose }: { onClose: () => void }) {
  const { teams, error, retry } = useTeams(true);
  const { keys, toggle } = useFavorites();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const n = norm(q.trim());
    return (teams ?? []).filter((e) => !n || norm(e.team.name).includes(n));
  }, [teams, q]);

  return (
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Ajouter une équipe">
      <div class="sheet-head">
        <h2>Ajouter une équipe</h2>
        <button class="pill-btn glass" onClick={onClose}>
          Terminé
        </button>
      </div>
      <label class="search glass">
        <IconSearch />
        <input type="search" placeholder="Rechercher une équipe" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} autocapitalize="off" autocomplete="off" autocorrect="off" enterkeyhint="search" />
      </label>
      <div class="sheet-body">
        {error && <Empty error title="Impossible de charger les équipes" text="Vérifie ta connexion, puis réessaie." action="Réessayer" onAction={retry} />}
        {!error && !teams && (
          <ul class="cards" aria-busy="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <li class="card team-row" key={i}>
                <div class="skeleton skeleton-line" style={{ margin: 0 }} />
              </li>
            ))}
          </ul>
        )}
        {teams && list.length === 0 && <Empty title="Aucune équipe" text="Essaie un autre nom." />}
        {teams && list.length > 0 && (
          <ul class="cards">
            {list.map((e) => {
              const f = toFav(e.sport, e.team);
              const on = keys.has(f.key);
              return (
                <li class="card team-row" key={f.key}>
                  <TeamLogo logo={f.logo} name={f.name} />
                  <div class="team-row-text">
                    <span class="team-name">{f.name}</span>
                    <span class="muted small">{sportLabel(f)}</span>
                  </div>
                  <StarButton on={on} label={on ? `Retirer ${f.name} des favoris` : `Ajouter ${f.name} aux favoris`} onClick={() => toggle(f)} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function Favorites() {
  const { favs, keys, toggle } = useFavorites();
  const [picking, setPicking] = useState(false);
  const upcoming = useUpcoming(favs.length > 0);
  const nextFav = (upcoming ?? []).filter((m) => isFavMatch(m, keys)).slice(0, 8);

  return (
    <main class="screen screen-plain">
      <div class="large-title">
        <h1>Favoris</h1>
        <p>{favs.length > 0 ? `${favs.length} équipe${favs.length > 1 ? 's' : ''}` : 'LEURS MATCHS REMONTENT EN PREMIER'}</p>
      </div>

      {favs.length === 0 ? (
        <Empty title="Aucune équipe favorite" text="Choisis tes équipes : leurs matchs apparaîtront en premier sur l'écran Scores." action="Ajouter une équipe" onAction={() => setPicking(true)} />
      ) : (
        <>
          <Section title="Mes équipes">
            {favs.map((f: Fav) => (
              <li class="card team-row" key={f.key}>
                <TeamLogo logo={f.logo} name={f.name} />
                <div class="team-row-text">
                  <span class="team-name">{f.name}</span>
                  <span class="muted small">{sportLabel(f)}</span>
                </div>
                <StarButton on label={`Retirer ${f.name} des favoris`} onClick={() => toggle(f)} />
              </li>
            ))}
          </Section>
          <button class="btn add-btn" onClick={() => setPicking(true)}>
            <IconPlus /> Ajouter une équipe
          </button>
          {nextFav.length > 0 && (
            <Section title="Prochains matchs">
              {nextFav.map((m) => (
                <CompactCard key={m.id} m={m} withDate />
              ))}
            </Section>
          )}
        </>
      )}

      {picking && <TeamPicker onClose={() => setPicking(false)} />}
    </main>
  );
}

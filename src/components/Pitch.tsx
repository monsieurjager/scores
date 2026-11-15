import type { Lineup, LineupPlayer, Match, SportId, Team } from '../types';
import { layoutFootball, layoutRugby, type Placed } from '../lib/pitch';
import { ratingTone } from '../lib/ratings';

/** Couleur d'équipe lisible + couleur du texte (noir ou blanc selon la luminosité). */
function colors(team: Team, fallback: string): { bg: string; fg: string } {
  const hex = team.color && /^[0-9a-f]{6}$/i.test(team.color) ? team.color : fallback;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return { bg: `#${hex}`, fg: lum > 0.6 ? '#111' : '#fff' };
}
const similar = (a: string, b: string) => {
  const d = [0, 2, 4].reduce((s, i) => s + Math.abs(parseInt(a.slice(i + 1, i + 3), 16) - parseInt(b.slice(i + 1, i + 3), 16)), 0);
  return d < 120;
};
const lastName = (n: string) => n.replace(/^[A-ZÀ-Ý]\.\s*/, '');

const Ball = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="#fff" stroke="#111" stroke-width="1.6" />
    <path d="M12 7.6l3.4 2.5-1.3 4H9.9l-1.3-4z" fill="#111" />
  </svg>
);
const Boot = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 16V8.6C3 7.7 3.7 7 4.6 7H9l1.3 3.4c.3.8 1.1 1.4 2 1.5l5.3.6c1.5.2 2.6 1.4 2.6 2.9V16z" fill="currentColor" />
    <path d="M5 18.5h2M10.5 18.5h2M16 18.5h2" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>
);

export function RatingPill({ r, best }: { r: number; best?: boolean }) {
  return (
    <span class={`rate ${ratingTone(r)}`} aria-label={`Note ${r.toLocaleString('fr-FR')}${best ? ', meilleur joueur' : ''}`}>
      {best && '★ '}
      {r.toLocaleString('fr-FR', { minimumFractionDigits: 1 })}
    </span>
  );
}

/** Petites icônes à côté du joueur : buts, essais, passes décisives, cartons, sortie. */
export function PlayerFacts({ p }: { p: LineupPlayer }) {
  const n = (p.goals ?? 0) + (p.tries ?? 0);
  if (!n && !p.assists && !p.ownGoals && !p.yellow && !p.red && !p.subbedOut) return null;
  return (
    <span class="facts">
      {n > 0 && (
        <span class="fact" title={p.tries ? `${p.tries} essai(s)` : `${n} but(s)`}>
          <Ball />
          {n > 1 && <b>{n}</b>}
        </span>
      )}
      {(p.ownGoals ?? 0) > 0 && (
        <span class="fact og" title="But contre son camp">
          <Ball />
        </span>
      )}
      {(p.assists ?? 0) > 0 && (
        <span class="fact boot" title={`${p.assists} passe(s) décisive(s)`}>
          <Boot />
          {p.assists! > 1 && <b>{p.assists}</b>}
        </span>
      )}
      {(p.yellow || p.red) && <span class={`fact card ${p.red ? 'red' : 'yellow'}`} title={p.red ? 'Carton rouge' : 'Carton jaune'} />}
      {p.subbedOut && (
        <span class="fact outarrow" title="Remplacé">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v13M6.5 12.5L12 18l5.5-5.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      )}
    </span>
  );
}

function Player({ p, x, y, c, best }: { p: LineupPlayer; x: number; y: number; c: { bg: string; fg: string }; best?: boolean }) {
  return (
    <span class="pl" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} title={`${p.number} ${p.name}`}>
      <span class={`pl-dot${p.subbedOut ? ' out' : ''}`} style={{ background: c.bg, color: c.fg }}>
        {p.number}
        {p.rating != null && <RatingPill r={p.rating} best={best} />}
      </span>
      <PlayerFacts p={p} />
      <span class="pl-name">{lastName(p.name)}</span>
    </span>
  );
}

/** Compositions dessinées sur le terrain. Foot : les deux équipes face à face. Rugby : l'équipe choisie. */
export function Pitch({ m, sport, lineups, side, best }: { m: Match; sport: SportId; lineups: { home: Lineup; away: Lineup }; side: 'home' | 'away'; best?: string }) {
  const home = colors(m.home, 'f5f5f7');
  let away = colors(m.away, '2c2c2e');
  if (similar(home.bg, away.bg)) away = home.fg === '#fff' ? { bg: '#f5f5f7', fg: '#111' } : { bg: '#2c2c2e', fg: '#fff' };

  if (sport === 'rugby') {
    const placed = layoutRugby([...lineups[side].starters, ...lineups[side].bench]);
    const c = side === 'home' ? home : away;
    return (
      <div class="pitch rugby" role="img" aria-label={`Composition de ${m[side].name}`}>
        <svg viewBox="0 0 70 112" preserveAspectRatio="none" aria-hidden="true">
          <rect x="1" y="1" width="68" height="110" rx="2" />
          <path d="M1 11H69M1 101H69M1 56H69M1 33H69M1 79H69" />
        </svg>
        {placed.map((p) => (
          <Player key={p.player.id} p={p.player} x={p.x} y={0.9 - (p.line / 6) * 0.8} c={c} best={p.player.id === best} />
        ))}
      </div>
    );
  }

  const half = (placed: Placed[], top: boolean, c: { bg: string; fg: string }) => {
    const maxLine = Math.max(1, ...placed.map((p) => p.line));
    return placed.map((p) => {
      const y = 0.94 - (p.line / maxLine) * 0.36; // du but (bas) vers le rond central
      return <Player key={p.player.id} p={p.player} x={top ? 1 - p.x : p.x} y={top ? 1 - y : y} c={c} best={p.player.id === best} />;
    });
  };
  return (
    <div class="pitch" role="img" aria-label={`Compositions : ${m.home.name} en bas, ${m.away.name} en haut`}>
      <svg viewBox="0 0 68 105" preserveAspectRatio="none" aria-hidden="true">
        <rect x="1" y="1" width="66" height="103" rx="1.5" />
        <path d="M1 52.5H67M14 1V17H54V1M24 1V6H44V1M14 104V88H54V104M24 104V99H44V104" />
        <circle cx="34" cy="52.5" r="9" />
      </svg>
      {half(layoutFootball(lineups.home.starters, lineups.home.formation), false, home)}
      {half(layoutFootball(lineups.away.starters, lineups.away.formation), true, away)}
      <span class="pitch-tag top">
        {m.away.name}
        {lineups.away.formation ? ` · ${lineups.away.formation}` : ''}
      </span>
      <span class="pitch-tag bottom">
        {m.home.name}
        {lineups.home.formation ? ` · ${lineups.home.formation}` : ''}
      </span>
    </div>
  );
}

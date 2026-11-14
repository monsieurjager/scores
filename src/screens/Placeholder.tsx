import { IconStar, IconGear } from '../components/icons';

export function Placeholder({ kind }: { kind: 'favoris' | 'reglages' }) {
  const fav = kind === 'favoris';
  return (
    <main class="screen">
      <div class="large-title">
        <h1>{fav ? 'Favoris' : 'Réglages'}</h1>
      </div>
      <div class="empty">
        <div class="empty-icon">{fav ? <IconStar /> : <IconGear />}</div>
        <h2>Bientôt disponible</h2>
        <p>{fav ? 'Choisis tes équipes : leurs matchs remonteront en premier.' : 'Les réglages arrivent dans une prochaine étape.'}</p>
      </div>
    </main>
  );
}

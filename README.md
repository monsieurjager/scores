# Scores

Résultats sportifs en direct (foot, XV de France), en PWA installable sur iPhone.

- Données : API publique ESPN, appelée directement depuis le navigateur (aucune clé).
- Stack : Vite + Preact + TypeScript, site statique déployé via GitHub Pages.
- Ajouter une compétition : une entrée dans `src/config/competitions.ts`.
- Développement : `npm install && npm run dev` ; `?mock` pour des données de démonstration, `?day=AAAA-MM-JJ` pour ouvrir un jour précis.
- Liste des équipes (favoris) : `src/data/teams.json`, régénérée par `node scripts/fetch-teams.mjs` (à relancer à chaque début de saison). Les adresses `/teams` d'ESPN n'autorisent pas les navigateurs (pas de CORS), d'où cette liste embarquée.

# Scores

Résultats sportifs en direct (foot, XV de France), en PWA installable sur iPhone.

- Données : API publique ESPN, appelée directement depuis le navigateur (aucune clé).
- Stack : Vite + Preact + TypeScript, site statique déployé via GitHub Pages.
- Ajouter une compétition : une entrée dans `src/config/competitions.ts`.
- Développement : `npm install && npm run dev` ; `?mock` pour des données de démonstration, `?day=AAAA-MM-JJ` pour ouvrir un jour précis.

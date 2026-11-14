import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Identifiant de version : change à chaque build. Il est aussi publié dans version.json,
// ce que l'app compare pour se mettre à jour toute seule.
const BUILD_ID = Date.now().toString(36);

// base relatif : fonctionne sur GitHub Pages (/scores/) comme en local.
export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    preact(),
    {
      name: 'emit-version',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID }) });
      },
    },
  ],
});

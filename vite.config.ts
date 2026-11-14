import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// base relatif : fonctionne sur GitHub Pages (/scores/) comme en local.
export default defineConfig({ base: './', plugins: [preact()] });

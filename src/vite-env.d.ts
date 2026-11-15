/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Adresse du service d'alertes (injectée au build par GitHub Actions si Cloudflare est configuré). */
  readonly VITE_ALERTS_URL?: string;
}

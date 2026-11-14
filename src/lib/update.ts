declare const __BUILD_ID__: string;

/** Identifiant de la version en cours d'exécution (injecté au build). */
export const BUILD_ID = typeof __BUILD_ID__ === 'undefined' ? 'dev' : __BUILD_ID__;
export const BUILD_DATE = BUILD_ID === 'dev' ? null : new Date(parseInt(BUILD_ID, 36));

let lastCheck = 0;

/** Compare la version en ligne à celle qui tourne ; si elle a changé, recharge l'app. */
export async function checkForUpdate(force = false): Promise<'updated' | 'current' | 'error'> {
  if (BUILD_ID === 'dev') return 'current';
  if (!force && Date.now() - lastCheck < 60_000) return 'current';
  lastCheck = Date.now();
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return 'error';
    const { id } = (await res.json()) as { id: string };
    if (id === BUILD_ID) return 'current';
    // Garde-fou : une seule tentative de rechargement par version annoncée (évite toute boucle).
    const flag = `reload-for-${id}`;
    if (!force && sessionStorage.getItem(flag)) return 'current';
    sessionStorage.setItem(flag, '1');
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    location.reload();
    return 'updated';
  } catch {
    return 'error';
  }
}

export function startUpdateChecks() {
  setTimeout(() => checkForUpdate(), 4_000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkForUpdate());
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

export async function clearOfflineCache() {
  for (const k of await caches.keys()) await caches.delete(k);
}

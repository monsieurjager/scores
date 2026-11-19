import { useState } from 'preact/hooks';
import { COMPETITIONS, isNational } from '../config/competitions';
import { resetSettings, updateSettings, useSettings, type Settings as S, type ThemeSetting } from '../lib/settings';
import { BUILD_DATE, checkForUpdate, clearOfflineCache } from '../lib/update';
import { useOnline } from '../hooks/useOnline';
import { useFavorites } from '../lib/favorites';
import { Section, Segmented } from '../components/ui';
import { alertsAvailable, disableAlerts, enableAlerts, isNative, isStandalone, pushSupported, sendTestAlert, syncAlerts } from '../lib/alerts';
import type { AlertSettings } from '../lib/settings';

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button class={`switch${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

const GROUPS: { title: string; match: (c: (typeof COMPETITIONS)[number]) => boolean }[] = [
  { title: 'Foot · clubs', match: (c) => c.sport === 'football' && !isNational(c) },
  { title: 'Foot · sélections nationales', match: (c) => c.sport === 'football' && isNational(c) },
  { title: 'Rugby · clubs', match: (c) => c.sport === 'rugby' && !isNational(c) },
  { title: 'Rugby · XV de France', match: (c) => c.sport === 'rugby' && isNational(c) },
];

const ALERT_PREFS: { key: Exclude<keyof AlertSettings, 'enabled'>; label: string }[] = [
  { key: 'recap', label: 'Récap du matin (9 h)' },
  { key: 'lineups', label: 'Compositions officielles' },
  { key: 'goals', label: 'Buts et essais' },
  { key: 'kickoff', label: "Coup d'envoi" },
  { key: 'halftime', label: 'Mi-temps' },
  { key: 'fulltime', label: 'Fin de match' },
  { key: 'red', label: 'Cartons rouges' },
];

function Alerts() {
  const st = useSettings();
  const { favs } = useFavorites();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const a = st.alerts;
  const native = isNative();
  const canPush = native || (pushSupported() && isStandalone());
  const denied = !native && typeof Notification !== 'undefined' && Notification.permission === 'denied';

  const toggle = async (on: boolean) => {
    setBusy(true);
    setMsg('');
    if (on) {
      const r = await enableAlerts();
      setMsg(r === 'ok' ? 'Alertes activées.' : r === 'denied' ? 'Notifications refusées : autorise-les dans Réglages iPhone → Notifications → Scores.' : r === 'unsupported' ? 'Ton appareil ne permet pas les alertes web.' : 'Activation impossible pour le moment. Réessaie plus tard.');
    } else {
      await disableAlerts();
      setMsg('Alertes désactivées.');
    }
    setBusy(false);
  };
  const setPref = (key: Exclude<keyof AlertSettings, 'enabled'>, on: boolean) => {
    updateSettings({ alerts: { ...a, [key]: on } });
    syncAlerts();
  };

  return (
    <Section title="Alertes">
      {!canPush ? (
        <li class="card setting-note">
          Pour recevoir des alertes, installe l'app sur l'écran d'accueil (dans Safari : Partager → Sur l'écran d'accueil), puis ouvre-la depuis son icône et reviens ici. iOS 16.4 ou plus récent.
        </li>
      ) : (
        <>
          <li class="card setting-row">
            <span>Alertes de mes équipes favorites</span>
            <Switch on={a.enabled} label="Alertes" onChange={(on) => !busy && toggle(on)} />
          </li>
          {a.enabled && native && (
            <li class="card setting-row sub">
              <span>Activité en direct (écran verrouillé)</span>
              <Switch on={a.live} label="Activité en direct" onChange={(on) => setPref('live', on)} />
            </li>
          )}
          {a.enabled &&
            ALERT_PREFS.map((p) => (
              <li class="card setting-row sub" key={p.key}>
                <span>{p.label}</span>
                <Switch on={a[p.key]} label={p.label} onChange={(on) => setPref(p.key, on)} />
              </li>
            ))}
          {a.enabled && (
            <li class="card setting-actions">
              <button
                class="link-btn"
                onClick={async () => {
                  setMsg('Envoi…');
                  setMsg((await sendTestAlert()) ? 'Notification de test envoyée.' : "Échec de l'envoi : désactive puis réactive les alertes.");
                }}
              >
                Envoyer une notification de test
              </button>
            </li>
          )}
        </>
      )}
      {(msg || (a.enabled && favs.length === 0) || denied) && (
        <p class="hint" role="status">
          {msg || (denied ? 'Notifications bloquées : Réglages iPhone → Notifications → Scores.' : 'Ajoute des équipes favorites : les alertes ne concernent que leurs matchs.')}
        </p>
      )}
    </Section>
  );
}

export function Settings() {
  const st = useSettings();
  const online = useOnline();
  const { favs } = useFavorites();
  const [msg, setMsg] = useState('');
  const toggleComp = (id: string, on: boolean) => updateSettings({ hiddenComps: on ? st.hiddenComps.filter((x) => x !== id) : [...st.hiddenComps, id] });

  return (
    <main class="screen screen-plain">
      <div class="large-title">
        <h1>Réglages</h1>
      </div>

      {alertsAvailable() && <Alerts />}

      <Section title="Apparence">
        <li style={{ listStyle: 'none' }}>
          <Segmented<ThemeSetting> label="Thème" value={st.theme} onChange={(theme) => updateSettings({ theme })} options={[{ id: 'auto', label: 'Auto' }, { id: 'light', label: 'Clair' }, { id: 'dark', label: 'Sombre' }]} />
        </li>
      </Section>

      <Section title="Rafraîchissement en direct">
        <li style={{ listStyle: 'none' }}>
          <Segmented<string> label="Intervalle" value={String(st.refreshSec)} onChange={(v) => updateSettings({ refreshSec: Number(v) as S['refreshSec'] })} options={[{ id: '5', label: '5 s' }, { id: '10', label: '10 s' }, { id: '30', label: '30 s' }, { id: '60', label: '1 min' }]} />
          <p class="hint">Seulement quand un match est en cours. ESPN garde ses réponses quelques secondes : descendre sous 5 s n'apporte rien.</p>
        </li>
      </Section>

      {GROUPS.map((g) => (
        <Section key={g.title} title={g.title}>
          {COMPETITIONS.filter(g.match).map((c) => (
            <li class="card setting-row" key={c.id}>
              <span>{c.name}</span>
              <Switch on={!st.hiddenComps.includes(c.id)} label={`Suivre ${c.name}`} onChange={(on) => toggleComp(c.id, on)} />
            </li>
          ))}
        </Section>
      ))}

      <Section title="Application">
        <li class="card setting-row">
          <span>Favoris</span>
          <span class="muted">{favs.length} équipe{favs.length > 1 ? 's' : ''}</span>
        </li>
        <li class="card setting-row">
          <span>Connexion</span>
          <span class="muted">{online ? 'En ligne' : 'Hors ligne'}</span>
        </li>
        <li class="card setting-row">
          <span>Version</span>
          <span class="muted">{BUILD_DATE ? BUILD_DATE.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'développement'}</span>
        </li>
        <li class="card setting-actions">
          <button
            class="link-btn"
            onClick={async () => {
              setMsg('Recherche…');
              const r = await checkForUpdate(true);
              setMsg(r === 'current' ? 'Vous avez la dernière version.' : r === 'error' ? 'Impossible de vérifier (hors ligne ?).' : 'Mise à jour en cours…');
            }}
          >
            Rechercher une mise à jour
          </button>
          <button class="link-btn" onClick={async () => { await clearOfflineCache(); setMsg('Cache hors ligne vidé.'); }}>
            Vider le cache hors ligne
          </button>
          <button class="link-btn" onClick={() => { resetSettings(); setMsg('Réglages réinitialisés.'); }}>
            Réinitialiser les réglages
          </button>
          {msg && <p class="hint" role="status">{msg}</p>}
        </li>
      </Section>

      <p class="hint footer-note">Données : ESPN (API publique non officielle). Aucune donnée personnelle n'est envoyée : favoris et réglages restent sur cet appareil.</p>
    </main>
  );
}

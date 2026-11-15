import assert from 'node:assert/strict';
import { detect, lineupsAlert, snapToStored } from '../src/detect.ts';

const base = (o = {}) => ({
  id: 'l1-1', sport: 'football', compName: 'Ligue 1', state: 'pre', statusName: 'STATUS_SCHEDULED', clock: "0'",
  home: { id: '160', name: 'Paris Saint-Germain' }, away: { id: '176', name: 'Marseille' }, hs: 0, as: 0, scoring: [], reds: [], ...o,
});

export default async function (test) {
  let failed = 0;
  const t = async (n, f) => {
    const before = process.exitCode;
    try { await f(); console.log('✓', n); } catch (e) { failed++; console.log('✗', n, '\n ', e.message); }
    process.exitCode = before;
  };

  await t('premier relevé : aucune notification (pas de rafale au démarrage)', () => {
    const { alerts } = detect(undefined, base({ state: 'in', hs: 2, as: 1 }));
    assert.equal(alerts.length, 0);
  });

  await t('match de foot complet : coup d\'envoi, but, mi-temps, carton rouge, fin', () => {
    let st = snapToStored(base());
    const step = (snap) => { const r = detect(st, snap); st = r.next; return r.alerts; };
    let a = step(base({ state: 'in', statusName: 'STATUS_FIRST_HALF', clock: "1'" }));
    assert.deepEqual(a.map((x) => x.kind), ['kickoff']);
    assert.equal(a[0].title, "🟢 Coup d'envoi");
    assert.equal(a[0].body, 'Paris Saint-Germain – Marseille\nLigue 1');
    a = step(base({ state: 'in', clock: "23'", hs: 1, scoring: [{ teamId: '160', kind: 'goal', player: 'O. Dembélé', clock: "23'" }] }));
    assert.deepEqual(a.map((x) => x.kind), ['score']);
    assert.equal(a[0].title, '⚽️ Paris Saint-Germain marque !');
    assert.equal(a[0].body, "23' O. Dembélé\nParis Saint-Germain 1 – 0 Marseille");
    assert.deepEqual(a[0].teamKeys, ['football:160', 'football:176']);
    a = step(base({ state: 'in', statusName: 'STATUS_HALFTIME', hs: 1, scoring: [{ teamId: '160', kind: 'goal', clock: "23'" }] }));
    assert.deepEqual(a.map((x) => x.kind), ['halftime']);
    a = step(base({ state: 'in', statusName: 'STATUS_SECOND_HALF', hs: 1, scoring: [{ teamId: '160', kind: 'goal', clock: "23'" }] }));
    assert.equal(a.length, 0, 'reprise : pas de nouvelle mi-temps');
    a = step(base({ state: 'in', hs: 1, scoring: [{ teamId: '160', kind: 'goal', clock: "23'" }], reds: [{ teamId: '176', player: 'L. Balerdi', clock: "61'" }] }));
    assert.deepEqual(a.map((x) => x.kind), ['red']);
    assert.equal(a[0].title, '🟥 Carton rouge · Marseille');
    assert.equal(a[0].body, "61' L. Balerdi\nParis Saint-Germain 1 – 0 Marseille");
    a = step(base({ state: 'in', hs: 1, as: 1, scoring: [{ teamId: '160', kind: 'goal', clock: "23'" }, { teamId: '176', kind: 'penalty', player: 'M. Greenwood', clock: "75'" }], reds: [{ teamId: '176', clock: "61'" }] }));
    assert.equal(a[0].title, '⚽️ Marseille marque sur penalty !');
    assert.equal(a[0].body, "75' M. Greenwood\nParis Saint-Germain 1 – 1 Marseille");
    a = step(base({ state: 'post', statusName: 'STATUS_FULL_TIME', hs: 1, as: 1, scoring: [{}, {}], reds: [{}] }));
    assert.deepEqual(a.map((x) => x.kind), ['fulltime']);
    assert.equal(a[0].title, '🏁 Fin du match');
    assert.equal(a[0].body, 'Paris Saint-Germain 1 – 1 Marseille\nLigue 1');
  });

  await t('but annulé (VAR, score qui baisse) : aucune notification', () => {
    const { alerts } = detect({ s: 'in', h: 1, a: 0, ht: false, red: 0, ev: 1 }, base({ state: 'in', hs: 0 }));
    assert.equal(alerts.length, 0);
  });

  await t('rugby : essai + transformation relevés ensemble → une seule notification', () => {
    const r = base({ id: 'nations-9', sport: 'rugby', compName: 'Championnat des Nations', home: { id: '9', name: 'France' }, away: { id: '5', name: 'Afrique du Sud' } });
    const { alerts } = detect({ s: 'in', h: 0, a: 0, ht: false, red: 0, ev: 0 }, { ...r, state: 'in', hs: 7, scoring: [{ teamId: '9', kind: 'try', player: 'A. Grandidier-Nkanang', clock: "15'" }, { teamId: '9', kind: 'conversion', player: 'M. Lucu', clock: "16'" }] });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].title, '🏉 Essai transformé · France');
    assert.equal(alerts[0].body, "15' A. Grandidier-Nkanang\nFrance 7 – 0 Afrique du Sud");
    assert.deepEqual(alerts[0].teamKeys, ['rugby:9', 'rugby:5']);
  });

  await t('but dont le buteur n\'est pas encore connu : notification quand même', () => {
    const { alerts } = detect({ s: 'in', h: 0, a: 0, ht: false, red: 0, ev: 0 }, base({ state: 'in', hs: 1 }));
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].title, '⚽️ Paris Saint-Germain marque !');
    assert.equal(alerts[0].body, 'Paris Saint-Germain 1 – 0 Marseille');
  });

  await t('buteur connu après coup : la notification est complétée sans nouveau son', () => {
    let st = { s: 'in', h: 0, a: 0, ht: false, red: 0, ev: 0 };
    let r = detect(st, base({ state: 'in', hs: 1 }));
    assert.equal(r.alerts[0].body, 'Paris Saint-Germain 1 – 0 Marseille');
    const tag = r.alerts[0].tag;
    st = r.next;
    r = detect(st, base({ state: 'in', hs: 1, scoring: [{ teamId: '160', kind: 'goal', clock: "80'" }] }));
    assert.equal(r.alerts.length, 0, 'action sans joueur : on attend encore');
    st = r.next;
    r = detect(st, base({ state: 'in', hs: 1, scoring: [{ teamId: '160', kind: 'goal', player: 'Junior Kroupi', clock: "80'" }] }));
    assert.equal(r.alerts.length, 1);
    assert.equal(r.alerts[0].silent, true);
    assert.equal(r.alerts[0].tag, tag);
    assert.equal(r.alerts[0].body, "80' Junior Kroupi\nParis Saint-Germain 1 – 0 Marseille");
    r = detect(r.next, base({ state: 'in', hs: 1, scoring: [{ teamId: '160', kind: 'goal', player: 'Junior Kroupi', clock: "80'" }] }));
    assert.equal(r.alerts.length, 0, 'une seule mise à jour');
  });

  await t('but contre son camp : équipe qui en profite + mention c.s.c.', () => {
    const { alerts } = detect({ s: 'in', h: 0, a: 0, ht: false, red: 0, ev: 0 }, base({ state: 'in', hs: 1, scoring: [{ teamId: '160', kind: 'owngoal', player: 'E. Topçu', clock: "49'" }] }));
    assert.equal(alerts[0].title, '⚽️ Paris Saint-Germain marque !');
    assert.equal(alerts[0].body, "49' E. Topçu (c.s.c.)\nParis Saint-Germain 1 – 0 Marseille");
  });
  await t('compositions officielles : chaque abonné reçoit le onze de son équipe', () => {
    const m = { id: 'ldn-1', sport: 'football', home: { id: '465', name: 'Turquie' }, away: { id: '478', name: 'France' } };
    const xi = (n) => Array.from({ length: 11 }, (_, i) => `${n}${i + 1}`);
    const a = lineupsAlert(m, [{ teamId: '465', name: 'Turquie', formation: '5-3-2', starters: xi('T') }, { teamId: '478', name: 'France', formation: '4-3-3', starters: xi('F') }]);
    assert.equal(a.title, '📋 Compositions · Turquie – France');
    assert.match(a.bodyByTeam['football:478'], /^France \(4-3-3\) : F1, F2/);
    assert.deepEqual(a.teamKeys, ['football:465', 'football:478']);
  });

  await t('compositions incomplètes : pas de notification', () => {
    const m = { id: 'x', sport: 'rugby', home: { id: '9', name: 'France' }, away: { id: '5', name: 'Afrique du Sud' } };
    assert.equal(lineupsAlert(m, [{ teamId: '9', name: 'France', starters: ['A', 'B'] }]), null);
  });
  return failed;
}

// Tests du service d'alertes (Node 22, WebCrypto). Lancement : npm test
import assert from 'node:assert/strict';
import { b64u, encryptPayload, generateVapid, vapidAuthorization } from '../src/webpush.ts';

let failed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    console.log('✓', name);
  } catch (e) {
    failed++;
    console.log('✗', name, '\n ', e.message);
  }
};

await test('chiffrement Web Push : vecteur de test officiel (RFC 8291, annexe A)', async () => {
  const asPublic = b64u.dec('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
  const asPrivateJwk = { kty: 'EC', crv: 'P-256', d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', x: b64u.enc(asPublic.slice(1, 33)), y: b64u.enc(asPublic.slice(33, 65)) };
  const out = await encryptPayload(new TextEncoder().encode('When I grow up, I want to be a watermelon'), 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg', {
    asPrivateJwk,
    asPublic,
    salt: b64u.dec('DGv6ra1nlYgDCS1FRnbzlw'),
  });
  assert.equal(
    b64u.enc(out),
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
  );
});

await test('VAPID : jeton ES256 vérifiable avec la clé publique', async () => {
  const v = await generateVapid();
  const header = await vapidAuthorization('https://web.push.apple.com/abc', v, 'https://example.github.io/scores/');
  const [, t, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header);
  assert.equal(k, v.publicKey);
  const [h, c, s] = t.split('.');
  const claims = JSON.parse(new TextDecoder().decode(b64u.dec(c)));
  assert.equal(claims.aud, 'https://web.push.apple.com');
  const pub = await crypto.subtle.importKey('raw', b64u.dec(v.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64u.dec(s), new TextEncoder().encode(`${h}.${c}`)));
});

await test('APNs : jeton ES256 signé avec une clé .p8, vérifiable', async () => {
  const { providerToken } = await import('../src/apns.ts');
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  const jwt = await providerToken({ key: pem, keyId: 'ABC123DEFG', teamId: 'TEAM123456', bundleId: 'x' }, 1700000000);
  const [h, c, sig] = jwt.split('.');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64u.dec(h))), { alg: 'ES256', kid: 'ABC123DEFG' });
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64u.dec(c))), { iss: 'TEAM123456', iat: 1700000000 });
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, b64u.dec(sig), new TextEncoder().encode(`${h}.${c}`)));
});

await test('Activité en direct : contenu affiché (minute, mi-temps, fin, dernier but)', async () => {
  const { liveContent, important } = await import('../src/live.ts');
  const base = { id: 'fra.1-1', sport: 'football', compName: 'Ligue 1', state: 'in', statusName: 'STATUS_IN_PROGRESS', clock: "67'", home: { id: '1', name: 'PSG' }, away: { id: '2', name: 'Marseille' }, hs: 1, as: 0, scoring: [{ teamId: '1', kind: 'goal', player: 'O. Dembélé', clock: "66'" }], reds: [] };
  assert.deepEqual(liveContent(base), { status: 'in', homeScore: 1, awayScore: 0, clock: "67'", lastEvent: "But · O. Dembélé 66'" });
  assert.equal(liveContent({ ...base, statusName: 'STATUS_HALFTIME' }).clock, 'MT');
  assert.equal(liveContent({ ...base, state: 'post' }).clock, 'Terminé');
  assert.equal(liveContent({ ...base, state: 'pre', hs: 0, scoring: [] }).lastEvent, undefined);
  const a = liveContent(base);
  assert.equal(important(a, { ...a, clock: "68'" }), false);
  assert.equal(important(a, { ...a, homeScore: 2 }), true);
});

// Tests de la détection des faits de match (ajoutés plus bas)
const extra = await import('./detect.test.mjs').catch((e) => (e.code === 'ERR_MODULE_NOT_FOUND' ? null : Promise.reject(e)));
if (extra) failed += await extra.default(test);

if (failed) {
  console.log(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests passent.');

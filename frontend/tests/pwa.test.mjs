import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('public/sw.js', root), 'utf8');

function worker(fetch) {
  const events = new Map();
  const stored = [];
  const offline = new Response('<h1>Nu există conexiune</h1>', { headers: { 'Content-Type': 'text/html' } });
  vm.runInNewContext(source, {
    URL, Response, fetch,
    self: { location: { origin: 'https://telemedconsult.test' }, addEventListener: (name, handler) => events.set(name, handler), clients: { claim: async () => {} } },
    caches: { open: async () => ({ addAll: async (urls) => stored.push(...urls) }), match: async (url) => url === '/offline.html' ? offline.clone() : undefined },
  });
  return { events, stored };
}

test('online navigation uses the network and caches no patient page', async () => {
  const { events, stored } = worker(async () => new Response('Rețea'));
  let result;
  events.get('fetch')({ request: { url: 'https://telemedconsult.test/patient/profile', method: 'GET', mode: 'navigate' }, respondWith: (promise) => { result = promise; } });
  assert.equal(await (await result).text(), 'Rețea');
  assert.equal(stored.length, 0);
});

test('offline navigation returns the neutral reconnection page', async () => {
  const { events } = worker(async () => { throw new TypeError('Offline'); });
  let result;
  events.get('fetch')({ request: { url: 'https://telemedconsult.test/doctor', method: 'GET', mode: 'navigate' }, respondWith: (promise) => { result = promise; } });
  assert.match(await (await result).text(), /Nu există conexiune/);
});

test('API, medical files, authentication and mutations are not intercepted', () => {
  const { events } = worker(() => { throw new Error('Unexpected fetch'); });
  for (const [path, method, mode] of [['/api/v1/patient/profile', 'GET', 'cors'], ['/api/v1/medical-documents/1/file', 'GET', 'navigate'], ['/sanctum/csrf-cookie', 'GET', 'navigate'], ['/patient/profile', 'POST', 'navigate']]) {
    events.get('fetch')({ request: { url: `https://telemedconsult.test${path}`, method, mode }, respondWith: () => assert.fail(`Intercepted ${path}`) });
  }
});

test('installation caches only static resources and manifest icons have the declared dimensions', async () => {
  const { events, stored } = worker(async () => new Response(''));
  let installation;
  events.get('install')({ waitUntil: (promise) => { installation = promise; } });
  await installation;
  assert.deepEqual(stored.sort(), ['/icons/app-192.png', '/icons/app-512.png', '/offline.html']);
  const manifest = JSON.parse(await readFile(new URL('public/manifest.webmanifest', root), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  for (const icon of manifest.icons) {
    const png = await readFile(new URL(`public${icon.src}`, root));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});

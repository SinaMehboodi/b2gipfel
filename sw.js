// Network-first: with internet you always get the newest version (updates arrive on the next open);
// without internet (or if the network takes longer than 4 s) the saved copy is used.
const CACHE = 'karteikasten-v42';
const CORE = ['./', 'index.html', 'parser.js', 'data/words.json', 'data/verbs.json', 'data/schreiben.json', 'data/grammatik.json', 'data/kurzvortrag.json', 'data/buch.json', 'data/allgemein.html', 'data/modelltests.json', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, {cache: 'reload'})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const own = url.origin === self.location.origin;
  e.respondWith(caches.open(CACHE).then(async c => {
    const cached = () => c.match(e.request, {ignoreSearch: true});
    if (!own){ // fonts etc.: cache-first
      const hit = await cached();
      return hit || fetch(e.request).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(e.request, r.clone()); return r; });
    }
    const net = fetch(e.request, {cache: 'no-cache'}).then(r => { if (r && r.ok) c.put(e.request, r.clone()); return r; });
    const timeout = new Promise(res => setTimeout(res, 4000));
    try {
      const r = await Promise.race([net, timeout]);
      if (r) return r;
      return (await cached()) || net;
    } catch (err) {
      return (await cached()) || Response.error();
    }
  }));
});

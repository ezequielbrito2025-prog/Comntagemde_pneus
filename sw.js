/* Service worker — deixa o app abrir mesmo sem internet.
   Ao publicar uma versão nova, troque o número do CACHE. */
var CACHE = "pneus-v1";
var ARQUIVOS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icone-192.png",
  "./icone-512.png",
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
];

self.addEventListener("install", function (ev) {
  ev.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(
        ARQUIVOS.map(function (u) {
          return c.add(u).catch(function () {});
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (ev) {
  ev.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(
        nomes.map(function (n) {
          if (n !== CACHE) return caches.delete(n);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (ev) {
  var req = ev.request;

  // Chamadas ao Apps Script nunca vêm do cache.
  if (req.method !== "GET" || req.url.indexOf("script.google.com") > -1) return;

  ev.respondWith(
    fetch(req)
      .then(function (resp) {
        var copia = resp.clone();
        caches.open(CACHE).then(function (c) {
          c.put(req, copia).catch(function () {});
        });
        return resp;
      })
      .catch(function () {
        return caches.match(req).then(function (r) {
          return r || caches.match("./index.html");
        });
      })
  );
});

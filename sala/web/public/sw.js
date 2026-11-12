// Sala — service worker: avisos, o número no ícone e o widget "Esperando você". Não guarda páginas em cache.
//
// "Esperando você" é o mesmo conceito em três tamanhos: o número no ícone do app (setAppBadge), a notificação
// com o botão de ação e o widget (Windows 11). O app grava o retrato da fila a cada mudança (postMessage
// "fila"); o push também traz a fila do servidor. O widget lê o último retrato, sem precisar de login.

const CACHE = "sala-fila";
const RETRATO = "/widget/fila.json";
const WIDGET = "esperando";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// ---------------------------------------------------------------- retrato da fila

async function lerRetrato() {
  try {
    const r = await (await caches.open(CACHE)).match(RETRATO);
    if (r) return await r.json();
  } catch { /* sem cache */ }
  return null;
}

// numero: só no push (app fechado). Aberto, o próprio app já põe o número no ícone (fila.ts).
async function guardarFila(fila, numero) {
  if (!fila || typeof fila.espera !== "number") return;
  const retrato = { ...fila, em: new Date().toISOString() };
  try {
    await (await caches.open(CACHE)).put(RETRATO, new Response(JSON.stringify(retrato), { headers: { "Content-Type": "application/json" } }));
  } catch { /* sem cache */ }
  if (numero) try {
    if (self.navigator.setAppBadge) { if (fila.espera > 0) await self.navigator.setAppBadge(fila.espera); else await self.navigator.clearAppBadge(); }
  } catch { /* sem número no ícone */ }
  await atualizarWidgets(retrato);
}

// ---------------------------------------------------------------- widget (Windows 11: manifest "widgets")

// os dados que o modelo (widget/modelo.json, Adaptive Card) lê
function dadosWidget(r) {
  const en = r && r.lingua === "en";
  return {
    rotulo: en ? "Waiting for you" : "Esperando você",
    manchete: r ? r.manchete : (en ? "Open The Sala to sync." : "Abra o The Sala para sincronizar."),
    itens: r ? r.itens.map((i) => ({ ...i, cor: i.alerta ? "Attention" : "Default" })) : [],
    vazio: !!r && !r.itens.length,
    textoVazio: en ? "When someone needs your decision, it shows up here." : "Quando alguém pedir a sua decisão, aparece aqui.",
    abrir: en ? "Open The Sala" : "Abrir o The Sala",
  };
}

async function atualizarWidgets(retrato) {
  if (!self.widgets) return;
  try {
    const w = await self.widgets.getByTag(WIDGET);
    if (!w) return;
    const modelo = await (await fetch(w.definition.msAcTemplate)).text();
    await self.widgets.updateByTag(WIDGET, { template: modelo, data: JSON.stringify(dadosWidget(retrato || (await lerRetrato()))) });
  } catch { /* host sem widgets */ }
}

self.addEventListener("widgetinstall", (e) => e.waitUntil(atualizarWidgets(null)));
self.addEventListener("widgetresume", (e) => e.waitUntil(atualizarWidgets(null)));
self.addEventListener("widgetclick", (e) => {
  let dados = e.data;
  try { if (typeof dados === "string") dados = JSON.parse(dados); else if (dados && dados.json) dados = dados.json(); } catch { dados = null; }
  const url = (dados && typeof dados.url === "string" && dados.url.startsWith("/")) ? dados.url : "/";
  e.waitUntil(abrir(url));
});

// ---------------------------------------------------------------- avisos

self.addEventListener("message", (e) => {
  if (e.data && e.data.tipo === "fila") e.waitUntil(guardarFila(e.data.fila, false));
  if (e.data && e.data.tipo === "esquecer") e.waitUntil(esquecer());
});

async function esquecer() {
  try { await caches.delete(CACHE); } catch { /* */ }
  await atualizarWidgets(null);
}

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: "The Sala", corpo: e.data && e.data.text() }; }
  e.waitUntil((async () => {
    if (d.fila) await guardarFila(d.fila, true);
    // se a sala já está aberta e na frente, não precisa avisar
    const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (janelas.some((c) => c.visibilityState === "visible" && c.focused && d.url && new URL(c.url).pathname === d.url)) return;
    const acoes = Array.isArray(d.acoes) ? d.acoes.slice(0, 2) : [];
    await self.registration.showNotification(d.titulo || "The Sala", {
      body: d.corpo || "", tag: d.tag, renotify: true, icon: "/icone-192.png", badge: "/icone-badge.png", timestamp: Date.now(),
      actions: acoes.map((a) => ({ action: a.acao, title: a.titulo })),
      data: { url: d.url || "/", acoes: Object.fromEntries(acoes.map((a) => [a.acao, a.url])) },
    });
  })());
});

// só abre endereço do próprio app: o que vier de fora (ou torto) cai na página inicial
function local(url) {
  try { const u = new URL(url, self.location.origin); return u.origin === self.location.origin ? u.pathname + u.search + u.hash : "/"; } catch { return "/"; }
}

async function abrir(destino) {
  const url = local(destino);
  const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of janelas) {
    if (new URL(c.url).origin === self.location.origin) { await c.focus(); return c.navigate ? c.navigate(url) : undefined; }
  }
  return self.clients.openWindow(url);
}

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const d = e.notification.data || {};
  const url = (e.action && d.acoes && d.acoes[e.action]) || d.url || "/";
  e.waitUntil(abrir(url));
});

// The Sala — avisos no celular e no computador (Web Push), sem serviço pago.
//
// O banco chama esta função a cada mensagem nova (gatilho chamar_avisar, via pg_net) com {id}
// e o cabeçalho x-aviso. Ela decide quem avisar e manda o push criptografado (RFC 8291, aes128gcm)
// assinado com VAPID (RFC 8292). Tudo com WebCrypto, sem biblioteca.
//
// Quem recebe, conforme a preferência da pessoa (perfis.avisos):
//   tudo     → toda mensagem das salas dela
//   mencoes  → quando chamam ela (@Nome, @todos) ou um agente dela (@Claude-Ana, @agentes), proposta nova,
//              resposta a algo dela, decisão sobre proposta dela
//   nada     → nunca
// Também avisa quem ficou responsável por uma tarefa nova ({tarefa: id}).
// Todo push leva junto o "esperando você" da pessoa (fila_de): o número vai para o ícone do app e os três
// primeiros itens para o widget. Cada tipo de aviso tem o seu botão de ação (decidir, pedir a resposta, ver tarefas).
//
// Deploy com verify_jwt = false (confere o segredo x-aviso).

import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { comoChama, mencoes as mencoesDe } from "../_shared/agentes.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ASSUNTO = "mailto:robertobeckerbt@gmail.com";

// ---------------------------------------------------------------- base64url

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64u = (s: string) => {
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(p + "=".repeat((4 - (p.length % 4)) % 4)), (c) => c.charCodeAt(0));
};
const juntar = (...partes: Uint8Array[]) => {
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) { out.set(p, i); i += p.length; }
  return out;
};
const txt = (s: string) => new TextEncoder().encode(s);

// ---------------------------------------------------------------- VAPID

let chave: { privada: CryptoKey; publica: string } | null = null;
async function vapid() {
  if (chave) return chave;
  const { data } = await db.rpc("chave_vapid");
  const jwk = JSON.parse(data as string);
  const privada = await crypto.subtle.importKey("jwk", { ...jwk, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const publica = b64u(juntar(new Uint8Array([4]), deB64u(jwk.x), deB64u(jwk.y)));
  chave = { privada, publica };
  return chave;
}

async function jwt(endpoint: string) {
  const { privada } = await vapid();
  const cab = b64u(txt(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const corpo = b64u(txt(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: ASSUNTO })));
  const assinatura = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privada, txt(`${cab}.${corpo}`)));
  return `${cab}.${corpo}.${b64u(assinatura)}`;
}

// ---------------------------------------------------------------- criptografia (aes128gcm)

async function hkdf(sal: Uint8Array, ikm: Uint8Array, info: Uint8Array, tamanho: number) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: sal, info }, k, tamanho * 8));
}

async function cifrar(p256dh: string, auth: string, texto: string) {
  const ua = deB64u(p256dh);
  const segredo = deB64u(auth);
  const efemera = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const as = new Uint8Array(await crypto.subtle.exportKey("raw", efemera.publicKey));
  const uaChave = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaChave }, efemera.privateKey, 256));

  const ikm = await hkdf(segredo, ecdh, juntar(txt("WebPush: info\0"), ua, as), 32);
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, txt("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sal, ikm, txt("Content-Encoding: nonce\0"), 12);

  const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cifra = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, k, juntar(txt(texto), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return juntar(sal, rs, new Uint8Array([as.length]), as, cifra);
}

// O endereço de aviso vem do navegador da pessoa, e o servidor faz POST nele. Só vale serviço de push conhecido
// (a mesma lista do banco, em _push_valido): nada de endereço interno nem de terceiro.
const PUSH = /^([a-z0-9-]+\.)*(googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;
const pushValido = (endpoint: string) => {
  try { const u = new URL(endpoint); return u.protocol === "https:" && !u.port && !u.username && PUSH.test(u.hostname.toLowerCase()); } catch { return false; }
};

async function empurrar(i: { endpoint: string; p256dh: string; auth: string }, dados: unknown, urgente: boolean) {
  if (!pushValido(i.endpoint)) return 410; // some da lista, como inscrição vencida
  const { publica } = await vapid();
  const r = await fetch(i.endpoint, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000), // um serviço que não responde não segura os avisos dos outros
    headers: {
      Authorization: `vapid t=${await jwt(i.endpoint)}, k=${publica}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: urgente ? "high" : "normal",
    },
    body: await cifrar(i.p256dh, i.auth, JSON.stringify(dados)),
  });
  await r.body?.cancel();
  return r.status;
}

// ---------------------------------------------------------------- quem avisar

// @Codex, @ClaudeCode, @Claude-Ana, @Ana, @agentes, @todos (e @agents, @everyone, @all): regra comum em _shared/agentes.ts
const handle = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
const mencoes = (t: string) => mencoesDe(t).map((m) => m.alvo);

// textos que o banco grava em português, para quem usa em inglês
const emIngles = (t: string) =>
  t === "Aprovada." ? "Approved." : t === "Recusada." ? "Declined." : t.replace(/^✓ Concluí a tarefa: /, "✓ Completed the task: ");
type Lingua = "pt" | "en";
const limpo = (t: string, n = 140) => {
  const l = t.replace(/[*_`>#]/g, "").replace(/\s+/g, " ").trim();
  return l.length > n ? `${l.slice(0, n - 1)}…` : l;
};

// ---------------------------------------------------------------- esperando você (ícone, widget)

type Fila = { lingua: Lingua; espera: number; manchete: string; itens: { titulo: string; detalhe: string; alerta: boolean; url: string }[] };
async function filaDe(uid: string, l: Lingua): Promise<Fila> {
  const { data } = await db.rpc("fila_de", { quem: uid });
  const linhas = (data ?? []) as { sala_id: string; sala: string; tipo: string; ref: number; titulo: string; prazo: string | null }[];
  const en = l === "en";
  const dia = (iso: string) => new Date(iso).toLocaleDateString(en ? "en-US" : "pt-BR", { day: "numeric", month: "short", timeZone: "America/Sao_Paulo" }).replace(".", "");
  const hoje = (iso: string) => dia(iso) === dia(new Date().toISOString());
  const n = linhas.length;
  return {
    lingua: l,
    espera: n,
    manchete: !n ? (en ? "All caught up." : "Tudo em dia.") : n === 1 ? (en ? "1 thing is waiting for you." : "1 coisa espera por você.") : (en ? `${n} things are waiting for you.` : `${n} coisas esperam por você.`),
    itens: linhas.slice(0, 3).map((f) => {
      const atrasada = !!f.prazo && new Date(f.prazo).getTime() < Date.now();
      const quando = f.tipo === "proposta" ? (en ? "to decide" : "para decidir")
        : !f.prazo ? (en ? "your task" : "tarefa sua")
        : atrasada ? (en ? "overdue" : "atrasada")
        : hoje(f.prazo) ? (en ? "due today" : "vence hoje") : (en ? `due ${dia(f.prazo)}` : `vence ${dia(f.prazo)}`);
      return { titulo: limpo(f.titulo || (en ? "Proposal" : "Proposta"), 80), detalhe: `${f.sala} · ${quando}`, alerta: atrasada,
        url: f.tipo === "proposta" ? `/s/${f.sala_id}?ir=${f.ref}` : `/s/${f.sala_id}?tarefas=1` };
    }),
  };
}

let segredoAviso: string | null = null;
const TODOS = String.fromCharCode(0) + "todos"; // "todos os seus agentes" (marca interna)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// compara os resumos, byte a byte até o fim: o tempo da resposta não conta quantos caracteres do segredo estavam certos
async function mesmoSegredo(a: string, b: string) {
  const [x, y] = (await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", txt(s))))).map((h) => new Uint8Array(h));
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("ok");
  // teste do "responder sozinho", pedido pela própria pessoa no app (token de sessão, sem x-aviso)
  if (!req.headers.get("x-aviso") && req.headers.get("authorization")) return await testarDespertador(req);
  if (!segredoAviso) segredoAviso = (await db.rpc("segredo_aviso")).data as string;
  if (!segredoAviso || !(await mesmoSegredo(req.headers.get("x-aviso") ?? "", segredoAviso))) return new Response("não", { status: 401 });

  const corpo = await req.json().catch(() => ({}));
  if (corpo.tarefa) return await avisarTarefa(Number(corpo.tarefa));
  if (corpo.despertar) return await despertar(Number(corpo.despertar), corpo.so_user ? { user_id: String(corpo.so_user), agente: String(corpo.so_agente ?? "") } : null);
  const { id } = corpo;
  const { data: m } = await db.from("mensagens")
    .select("id, sala_id, user_id, agente, texto, tipo, estado, responde_a, apagada, autor:perfis!mensagens_user_id_fkey(nome), salas(nome)")
    .eq("id", id).maybeSingle();
  if (!m || m.apagada) return new Response("nada");

  const { data: membros } = await db.from("membros").select("user_id, perfis(nome, avisos, idioma)").eq("sala_id", m.sala_id).neq("user_id", m.user_id);
  if (!membros?.length) return new Response("nada");

  // de quem é a mensagem respondida (resposta a algo meu, decisão sobre proposta minha)
  let donoRespondida: string | null = null;
  if (m.responde_a) {
    const { data: r } = await db.from("mensagens").select("user_id").eq("id", m.responde_a).maybeSingle();
    donoRespondida = r?.user_id ?? null;
  }

  const ditas = mencoes(m.texto);
  // agentes de quem está na sala: "@Codex", "@Claude-Ana" ou "@agentes" chamam o agente, e a pessoa dona dele é avisada
  const { data: agentesSala } = await db.from("agentes").select("user_id, nome, desperta").in("user_id", membros.map((x: any) => x.user_id));
  const agenteChamado = (uid: string, nomePessoa: string): string | null => {
    // quem responde sozinho não precisa que a pessoa toque para pedir
    const meus = (agentesSala ?? []).filter((a) => a.user_id === uid && !a.desperta);
    const porNome = meus.find((x) => comoChama(m.texto, x.nome, nomePessoa, (agentesSala ?? []).map((y) => y.nome)) === "nome");
    if (porNome) return porNome.nome;
    // @agentes escrito por um agente não acorda ninguém: senão vira uma corrente de avisos
    if (ditas.includes("agentes") && meus.length && !m.agente) return meus.length === 1 ? meus[0].nome : TODOS;
    return null;
  };
  const autorNome = (m.autor as any)?.nome ?? "";
  const primeiro = autorNome.split(" ")[0];
  const quem = (l: Lingua) => m.agente ? (l === "en" ? `${primeiro}'s ${m.agente}` : `${m.agente} de ${primeiro}`) : autorNome || (l === "en" ? "Someone" : "Alguém");
  const sala = (m.salas as any)?.nome ?? "Sala";
  const lingua = new Map<string, Lingua>(membros.map((x: any) => [x.user_id, x.perfis?.idioma === "en" ? "en" : "pt"]));

  const chamadoDe = new Map<string, string>(); // pessoa → qual agente dela foi chamado
  const alvos = membros.filter((x: any) => {
    const pref = x.perfis?.avisos ?? "mencoes";
    if (pref === "nada") return false;
    const meu = handle((x.perfis?.nome ?? "").split(" ")[0]);
    if (!m.agente || m.user_id !== x.user_id) {
      const ag = agenteChamado(x.user_id, x.perfis?.nome ?? "");
      if (ag) chamadoDe.set(x.user_id, ag);
    }
    if (pref === "tudo") return true;
    return ditas.includes("todos") || (meu && ditas.includes(meu)) || chamadoDe.has(x.user_id) || m.tipo === "proposta" || donoRespondida === x.user_id;
  }).map((x: any) => x.user_id);
  if (!alvos.length) return new Response("nada");

  const { data: inscricoes } = await db.from("inscricoes").select("endpoint, user_id, p256dh, auth").in("user_id", alvos);
  if (!inscricoes?.length) return new Response("nada");

  const titulo = (l: Lingua) => l === "en"
    ? (m.tipo === "proposta" ? `Proposal from ${quem(l)} · ${sala}` :
      m.tipo === "decisao" ? `${primeiro} ${m.estado === "aprovada" ? "approved" : m.estado === "ajuste" ? "asked to adjust" : "declined"} a proposal · ${sala}` :
      `${quem(l)} · ${sala}`)
    : (m.tipo === "proposta" ? `Proposta de ${quem(l)} · ${sala}` :
      m.tipo === "decisao" ? `${primeiro} ${m.estado === "aprovada" ? "aprovou" : m.estado === "ajuste" ? "pediu ajuste em" : "recusou"} uma proposta · ${sala}` :
      `${quem(l)} · ${sala}`);
  const dadosPara = (uid: string) => {
    const l = lingua.get(uid) ?? "pt";
    const texto = l === "en" ? emIngles(m.texto) : m.texto;
    const ag = chamadoDe.get(uid);
    if (ag) {
      const seu = l === "en" ? (ag === TODOS ? "your agents" : `your ${ag}`) : (ag === TODOS ? "seus agentes" : `seu ${ag}`);
      return { titulo: l === "en" ? `${quem(l)} called ${seu} · ${sala}` : `${quem(l)} chamou ${seu} · ${sala}`,
        corpo: `${l === "en" ? "Tap to ask for the answer." : "Toque para pedir a resposta."} ${limpo(texto, 110)}`,
        url: `/s/${m.sala_id}?pedir=${m.id}`, sala: m.sala_id, tag: `sala-${m.sala_id}`, fila: filas.get(uid),
        acoes: [{ acao: "pedir", titulo: l === "en" ? "Ask for the answer" : "Pedir a resposta", url: `/s/${m.sala_id}?pedir=${m.id}` }] };
    }
    if (m.tipo === "proposta") {
      const url = `/s/${m.sala_id}?ir=${m.id}`;
      return { titulo: titulo(l), corpo: limpo(texto), url, sala: m.sala_id, tag: `sala-${m.sala_id}`, fila: filas.get(uid),
        acoes: [{ acao: "decidir", titulo: l === "en" ? "View and decide" : "Ver e decidir", url }] };
    }
    return { titulo: titulo(l), corpo: limpo(texto), url: `/s/${m.sala_id}`, sala: m.sala_id, tag: `sala-${m.sala_id}`, fila: filas.get(uid) };
  };
  // o "esperando você" de cada pessoa avisada, já no idioma dela
  const filas = new Map<string, Fila>(await Promise.all([...new Set(inscricoes.map((i) => i.user_id))]
    .map(async (u) => [u, await filaDe(u, lingua.get(u) ?? "pt")] as const)));

  const mortos: string[] = [];
  await Promise.all(inscricoes.map(async (i) => {
    try {
      const chamado = chamadoDe.get(i.user_id);
      const urgente = m.tipo !== "mensagem" || donoRespondida === i.user_id || (!!chamado && chamado !== TODOS && !ditas.includes("agentes"));
      const st = await empurrar(i, dadosPara(i.user_id), urgente);
      if (st === 404 || st === 410) mortos.push(i.endpoint);
      else if (st >= 400) console.log("push", st, new URL(i.endpoint).host);
    } catch (e) { console.log("push falhou", (e as Error).message); }
  }));
  if (mortos.length) await db.from("inscricoes").delete().in("endpoint", mortos);
  return new Response(`avisados ${inscricoes.length - mortos.length}`);
});

async function mandarPara(uid: string, dados: unknown, urgente: boolean) {
  const { data: inscricoes } = await db.from("inscricoes").select("endpoint, user_id, p256dh, auth").eq("user_id", uid);
  const mortos: string[] = [];
  await Promise.all((inscricoes ?? []).map(async (i) => {
    try {
      const st = await empurrar(i, dados, urgente);
      if (st === 404 || st === 410) mortos.push(i.endpoint);
    } catch (e) { console.log("push falhou", (e as Error).message); }
  }));
  if (mortos.length) await db.from("inscricoes").delete().in("endpoint", mortos);
  return (inscricoes?.length ?? 0) - mortos.length;
}

async function avisarTarefa(id: number) {
  const { data: t } = await db.from("tarefas")
    .select("id, sala_id, titulo, responsavel, responsavel_agente, prazo, criada_por, criada_por_agente, salas(nome), autor:perfis!tarefas_criada_por_fkey(nome), dono:perfis!tarefas_responsavel_fkey(avisos, idioma)")
    .eq("id", id).maybeSingle();
  if (!t || !t.responsavel || (t.dono as any)?.avisos === "nada") return new Response("nada");
  const en = (t.dono as any)?.idioma === "en";
  const autor = (t.autor as any)?.nome ?? "";
  const de = t.criada_por_agente
    ? (en ? `${autor.split(" ")[0]}'s ${t.criada_por_agente}` : `${t.criada_por_agente} de ${autor.split(" ")[0]}`)
    : autor || (en ? "someone" : "Alguém");
  const para = t.responsavel_agente ? (en ? `your ${t.responsavel_agente}` : `o seu ${t.responsavel_agente}`) : (en ? "you" : "você");
  const dia = (iso: string) => new Date(iso).toLocaleDateString(en ? "en-US" : "pt-BR", { day: "numeric", month: "short", timeZone: "America/Sao_Paulo" });
  const prazo = t.prazo ? (en ? ` · due ${dia(t.prazo)}` : ` · até ${dia(t.prazo)}`) : "";
  const salaNome = (t.salas as any)?.nome ?? "Sala";
  const n = await mandarPara(t.responsavel, {
    titulo: en ? `New task for ${para} · ${salaNome}` : `Tarefa nova para ${para} · ${salaNome}`,
    corpo: en ? `${t.titulo}${prazo} · from ${de}` : `${t.titulo}${prazo} · de ${de}`,
    url: `/s/${t.sala_id}?tarefas=1`, sala: t.sala_id, tag: `tarefa-${t.id}`, fila: await filaDe(t.responsavel, en ? "en" : "pt"),
    acoes: [{ acao: "tarefas", titulo: en ? "View tasks" : "Ver tarefas", url: `/s/${t.sala_id}?tarefas=1` }],
  }, true);
  return new Response(`avisados ${n}`);
}

// ---------------------------------------------------------------- acordar agentes que respondem sozinhos

// Quem ligou "responder sozinho" tem uma tarefa agendada do Claude Code (gatilho de API) na própria conta.
// Quando chamam o agente dessa pessoa, disparamos a tarefa: o Claude abre na nuvem, lê a sala e responde.
// Regras: pessoa chamou (@Claude, @Claude-Ana, @agentes, @todos) → acorda; agente chamou → só se chamou pelo nome
// (@Claude-Ana), para não virar corrente; decisão sobre proposta de um agente → acorda esse agente para seguir.
// `so`: despertar só este agente (chamada que ficou pendente enquanto a sessão dele trabalhava).
async function despertar(id: number, so: { user_id: string; agente: string } | null = null) {
  const { data: m } = await db.from("mensagens")
    .select("id, sala_id, user_id, agente, texto, tipo, estado, responde_a, apagada, autor:perfis!mensagens_user_id_fkey(nome), salas(nome)")
    .eq("id", id).maybeSingle();
  if (!m || m.apagada) return new Response("nada");
  const { data: membros } = await db.from("membros").select("user_id, perfis(nome, idioma)").eq("sala_id", m.sala_id);
  const ids = (membros ?? []).map((x: any) => x.user_id);
  const { data: despC } = await db.from("despertadores").select("user_id, agente, url").in("user_id", ids);
  const { data: insc } = await db.from("eventos_inscricoes").select("id, user_id, agente, url, argumentos, expira").in("user_id", ids);
  const salaNomeMin = ((m.salas as any)?.nome ?? "").toLowerCase();
  // tarefa do Claude (gatilho de API) ou evento MCP (ChatGPT e outros que assinam)
  type Alvo = { user_id: string; agente: string; url: string; evento?: string };
  const desp: Alvo[] = [
    ...(despC ?? []),
    ...(insc ?? []).filter((e) => (!e.expira || new Date(e.expira).getTime() > Date.now()) && (() => {
      const f = String((e.argumentos as any)?.sala ?? "").trim().toLowerCase();
      return !f || f === m.sala_id || f === salaNomeMin || salaNomeMin.includes(f);
    })()).map((e) => ({ user_id: e.user_id, agente: e.agente, url: e.url, evento: e.id })),
  ];
  if (!desp.length) return new Response("nada");
  const { data: ouvindo } = await db.from("agentes").select("user_id, nome, ouvindo_ate").in("user_id", ids);
  const ouve = (uid: string, nome: string) => (ouvindo ?? []).some((a) => a.user_id === uid && a.nome === nome && a.ouvindo_ate && new Date(a.ouvindo_ate).getTime() > Date.now());
  const pessoa = new Map<string, { nome: string; idioma: string | null }>((membros ?? []).map((x: any) => [x.user_id, { nome: x.perfis?.nome ?? "", idioma: x.perfis?.idioma ?? null }]));

  let dono: { user_id: string; agente: string | null } | null = null;
  if (m.tipo === "decisao" && m.responde_a) {
    const { data: p } = await db.from("mensagens").select("user_id, agente").eq("id", m.responde_a).maybeSingle();
    dono = p ?? null;
  }
  const alvos = desp.filter((d) => {
    if (so && (d.user_id !== so.user_id || d.agente !== so.agente || d.evento)) return false;
    if (m.agente && m.user_id === d.user_id && m.agente === d.agente) return false; // ele mesmo escreveu
    if (ouve(d.user_id, d.agente)) return false; // já está ouvindo a sala (Claude Code no computador)
    if (dono && dono.user_id === d.user_id && dono.agente === d.agente) return true;
    // pelo nome (@Codex, @Codex-Cathleen) acorda sempre; @Cathleen, @agentes e @todos só quando uma pessoa escreveu
    // (agente chamando a pessoa ou todo mundo não acorda ninguém: senão vira corrente)
    const como = comoChama(m.texto, d.agente, pessoa.get(d.user_id)?.nome ?? "", (ouvindo ?? []).map((a) => a.nome));
    if (como === "nome") return true;
    if (m.agente) return false;
    return como === "coletivo" || como === "pessoa";
  });
  if (!alvos.length) return new Response("nada");

  const sala = (m.salas as any)?.nome ?? "Sala";
  const autorNome = (m.autor as any)?.nome ?? "";
  await Promise.all(alvos.map(async (d) => {
    const en = pessoa.get(d.user_id)?.idioma === "en";
    const quem = m.agente ? `${m.agente} (${autorNome})` : autorNome;
    const texto = en
      ? `The Sala · room "${sala}" (id ${m.sala_id}) · message #${m.id} from ${quem}` +
        (m.tipo === "decisao" ? ` · decision on proposal #${m.responde_a}: ${m.estado === "aprovada" ? "APPROVED" : m.estado === "ajuste" ? "ADJUSTMENT REQUESTED" : "DECLINED"}` : "") +
        `\nExcerpt: ${limpo(emIngles(m.texto), 400)}` +
        `\nYou answer as ${d.agente}: pass agente="${d.agente}" on every Sala call.`
      : `The Sala · sala "${sala}" (id ${m.sala_id}) · mensagem #${m.id} de ${quem}` +
        (m.tipo === "decisao" ? ` · decisão sobre a proposta #${m.responde_a}: ${m.estado === "aprovada" ? "APROVADA" : m.estado === "ajuste" ? "PEDIDO DE AJUSTE" : "RECUSADA"}` : "") +
        `\nTrecho: ${limpo(m.texto, 400)}` +
        `\nVocê responde como ${d.agente}: passe agente="${d.agente}" em toda chamada da Sala.`;
    let status = 0, erro: string | null = null;
    if (d.evento) {
      const motivo = m.tipo === "decisao" ? "decisao" : "chamado";
      const dados = {
        sala_id: m.sala_id, sala, mensagem: m.id, autor: quem, motivo, trecho: limpo(en ? emIngles(m.texto) : m.texto, 400),
        instrucao: en
          ? `You answer as ${d.agente} (pass agente="${d.agente}" on every Sala call). Use ler_mensagens on room ${m.sala_id} and reply to message #${m.id} with enviar_mensagem (responde_a=${m.id}).` +
            (motivo === "decisao" ? (m.estado === "ajuste"
              ? ` It's an adjustment request on your proposal: fix what the note asks, check with the other agents if it touches their part, and resend once with substitui=${m.responde_a}.`
              : " It's a decision on your proposal: follow it and tell the room what you did.") : "")
          : `Você responde como ${d.agente} (passe agente="${d.agente}" em toda chamada da Sala). Use ler_mensagens na sala ${m.sala_id} e responda à mensagem #${m.id} com enviar_mensagem (responde_a=${m.id}).` +
            (motivo === "decisao" ? (m.estado === "ajuste"
              ? ` É um pedido de ajuste na sua proposta: corrija o que a nota pede, confirme com os outros agentes se mexer na parte deles e reenvie uma vez com substitui=${m.responde_a}.`
              : " É uma decisão sobre a sua proposta: siga-a e conte na sala o que fez.") : ""),
      };
      try { ({ status, erro } = await entregarEvento(d.evento, d.url, `evt_${m.id}_${d.evento.slice(4, 16)}`, dados)); }
      catch (e) { erro = (e as Error).message; }
      if (status === 404 || status === 410) await db.rpc("apagar_inscricao_evento", { id: d.evento });
      else await db.from("eventos_inscricoes").update({ ultimo_envio: new Date().toISOString(), ultimo_status: status, ultimo_erro: erro }).eq("id", d.evento);
      return;
    }
    // uma sessão por vez nesta sala: se o agente já está trabalhando aqui, a chamada fica pendente para ele
    // (o MCP avisa a sessão ao enviar; se ela parar sem ler, despertar_pendentes acorda uma nova)
    const { data: livre, error: errReserva } = await db.rpc("reservar_despertar", { quem: d.user_id, agente: d.agente, sala: m.sala_id, msg: m.id });
    if (!errReserva && livre === false) return;
    try {
      const { data: chave } = await db.rpc("chave_despertador", { quem: d.user_id, agente: d.agente });
      ({ status, erro } = await disparar(d.url, chave as string, texto));
    } catch (e) { erro = (e as Error).message; }
    await db.from("despertadores").update({ ultimo_disparo: new Date().toISOString(), ultimo_status: status, ultimo_erro: erro })
      .eq("user_id", d.user_id).eq("agente", d.agente);
  }));
  return new Response(`acordados ${alvos.length}`);
}

async function disparar(url: string, chave: string, texto: string) {
  const r = await fetch(url, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${chave}`, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ text: texto }),
  });
  const j = await r.json().catch(() => ({})) as any;
  return { status: r.status, erro: r.ok ? null : (j?.error?.message ?? `HTTP ${r.status}`), sessao: j?.claude_code_session_url ?? null };
}

async function testarDespertador(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) return json({ erro: "Entre de novo." }, 401);
  try { if (JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).client_id) return json({ erro: "Só pessoas." }, 403); } catch { /* */ }
  const corpo = await req.json().catch(() => ({}));
  const agente = String(corpo.testar_despertador ?? "Claude");
  const { data: d } = await db.from("despertadores").select("url").eq("user_id", u.user.id).eq("agente", agente).maybeSingle();
  if (!d) return json({ erro: "Não está ligado." }, 404);
  const { data: chave } = await db.rpc("chave_despertador", { quem: u.user.id, agente });
  const r = await disparar(d.url, chave as string, "The Sala: teste de ligação / connection test. Só use listar_salas e termine. / Only use listar_salas and finish.");
  await db.from("despertadores").update({ ultimo_disparo: new Date().toISOString(), ultimo_status: r.status, ultimo_erro: r.erro })
    .eq("user_id", u.user.id).eq("agente", agente);
  return r.erro ? json({ erro: r.erro }, 400) : json({ sessao: r.sessao });
}

// ---------------------------------------------------------------- entrega de evento MCP (Standard Webhooks)

const b64 = (b: Uint8Array) => { let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s); };
async function assinarWebhook(segredo: string, id: string, ts: number, corpo: string) {
  const chave = Uint8Array.from(atob(segredo.slice(6).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const k = await crypto.subtle.importKey("raw", chave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `v1,${b64(new Uint8Array(await crypto.subtle.sign("HMAC", k, txt(`${id}.${ts}.${corpo}`))))}`;
}

async function entregarEvento(inscricao: string, url: string, eventId: string, dados: unknown) {
  const { data: segredo } = await db.rpc("segredo_evento", { id: inscricao });
  if (!segredo) return { status: 0, erro: "sem segredo" };
  const corpo = JSON.stringify({ eventId, name: "sala.chamado", timestamp: new Date().toISOString(), data: dados, cursor: null });
  let ultimo = { status: 0, erro: "não enviado" as string | null };
  for (const espera of [0, 2000]) {   // uma nova tentativa em falha temporária, mesmo eventId
    if (espera) await new Promise((r) => setTimeout(r, espera));
    const ts = Math.floor(Date.now() / 1000);
    try {
      const r = await fetch(url, {
        method: "POST", redirect: "manual", signal: AbortSignal.timeout(10_000),
        headers: { "Content-Type": "application/json", "webhook-id": eventId, "webhook-timestamp": String(ts),
          "webhook-signature": await assinarWebhook(segredo as string, eventId, ts, corpo), "X-MCP-Subscription-Id": inscricao },
        body: corpo,
      });
      await r.body?.cancel();
      ultimo = { status: r.status, erro: r.ok ? null : `HTTP ${r.status}` };
      if (r.ok || (r.status >= 400 && r.status < 500)) break;
    } catch (e) { ultimo = { status: 0, erro: (e as Error).message }; }
  }
  return ultimo;
}

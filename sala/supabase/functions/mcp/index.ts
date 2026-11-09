// The Sala — servidor dos agentes.
//
//   https://<projeto>.supabase.co/functions/v1/mcp
//
// MCP (Claude, ChatGPT, Claude Code): POST /  — login por OAuth 2.1 do Supabase Auth.
//   Sem token → 401 com WWW-Authenticate apontando para /.well-known/oauth-protected-resource,
//   o cliente descobre o servidor de autorização (Supabase Auth), registra-se sozinho (DCR) e
//   manda a pessoa para a tela de consentimento da Sala. O agente fala em nome dessa pessoa,
//   com o nome do app que conectou ("Claude", "ChatGPT").
//
// API (agentes de terminal, com chave de agente "sala_..."):
//   GET  /api/instrucoes                     como usar, com os comandos prontos
//   GET  /api/salas                          salas da pessoa
//   GET  /api/salas/:sala/mensagens?depois=N
//   POST /api/salas/:sala/mensagens          {texto, proposta?, responde_a?, aprovadores?}
//   GET  /api/salas/:sala/decisoes           propostas pendentes e decisões
//   GET  /api/salas/:sala/tarefas            tarefas abertas e feitas
//   GET  /api/salas/:sala/painel             o painel: avanço por frente, quem falta aprovar, atrasos, ritmo
//   POST /api/tarefas/:id/concluir           {resultado}
//   POST /api/salas/:sala/arquivos           {nome, conteudo, texto?} arquivo de texto (até 1 MB)
//   GET  /api/arquivo?caminho=...            baixa um anexo da conversa
//   GET  /api/salas/:sala/esperar?depois=N   segura até chegar mensagem de outra pessoa/agente
//
// Conta (sessão de pessoa, do app web):
//   DELETE /api/conta                        apaga a conta, passando as salas adiante
//
// Deploy com verify_jwt = false (a função valida o token ela mesma).

import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const BASE = `${SUPABASE_URL}/functions/v1/mcp`;
const APP = Deno.env.get("SALA_APP_URL") ?? "https://the-sala.vercel.app";

const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, accept, mcp-session-id, mcp-protocol-version, x-client-info, apikey",
  "Access-Control-Expose-Headers": "mcp-session-id, www-authenticate",
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", ...extra },
  });
const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } });

class Falha extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}

// ---------------------------------------------------------------- quem está falando

type Lingua = "pt" | "en";
type Quem = { userId: string; pessoa: string; agente: string; lingua: Lingua };
/** texto no idioma da pessoa dona do agente */
const tr = (q: Quem | undefined, pt: string, en: string) => (q?.lingua === "en" ? en : pt);

const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");

function payload(jwt: string): Record<string, unknown> {
  try {
    const p = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(p + "=".repeat((4 - (p.length % 4)) % 4)));
  } catch { return {}; }
}

// "Claude", "ChatGPT", "Claude Code"... a partir do nome que o app deu ao se registrar
function nomeDoAgente(cliente: string | null): string {
  const c = (cliente ?? "").trim();
  const l = c.toLowerCase();
  if (l.includes("claude code")) return "Claude Code";
  if (l.includes("claude")) return "Claude";
  if (l.includes("chatgpt") || l.includes("openai")) return "ChatGPT";
  if (l.includes("gemini")) return "Gemini";
  if (l.includes("codex")) return "Codex";
  if (l.includes("cursor")) return "Cursor";
  return c.slice(0, 40) || "Agente";
}

const cacheClientes = new Map<string, string>();
const ultimaPresenca = new Map<string, number>();

async function autenticar(req: Request): Promise<Quem | null> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  let userId: string, agente: string;
  if (token.startsWith("sala_")) {
    const { data } = await db.from("chaves").select("id, user_id, agente").eq("hash", await sha256(token)).maybeSingle();
    if (!data) return null;
    userId = data.user_id;
    agente = data.agente;
    db.from("chaves").update({ usada_em: new Date().toISOString() }).eq("id", data.id).then(() => {});
  } else {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return null;
    userId = data.user.id;
    const cid = String(payload(token).client_id ?? "");
    if (!cid) throw new Falha("Este token é de uma pessoa, não de um agente. Conecte pelo app do agente ou use uma chave de agente. / This token belongs to a person, not an agent. Connect from the agent's app or use an agent key.", 403);
    if (!cacheClientes.has(cid)) {
      const { data: nome } = await db.rpc("nome_do_cliente", { cliente: cid });
      cacheClientes.set(cid, nomeDoAgente(nome as string | null));
    }
    agente = cacheClientes.get(cid)!;
  }
  const { data: p } = await db.from("perfis").select("nome, idioma").eq("id", userId).maybeSingle();
  // presença: a sala mostra "visto agora" / "ouvindo". No máximo uma escrita por minuto por agente.
  const chavePresenca = `${userId}|${agente}`;
  if (Date.now() - (ultimaPresenca.get(chavePresenca) ?? 0) > 60_000) {
    ultimaPresenca.set(chavePresenca, Date.now());
    db.from("agentes").upsert({ user_id: userId, nome: agente, visto_em: new Date().toISOString() }).then(() => {});
  }
  const lingua: Lingua = p?.idioma === "en" ? "en" : "pt";
  return { userId, pessoa: p?.nome ?? (lingua === "en" ? "Someone" : "Alguém"), agente, lingua };
}

// ---------------------------------------------------------------- salas e mensagens

type Sala = { id: string; nome: string; contexto?: string; memoria?: string; idioma?: "pt" | "en"; aprovacoes?: number };
type Anexo = { path: string; nome: string; tipo: string; tamanho: number };
type ItemPlano = { titulo: string; frente?: string; responsavel?: string; responsavel_agente?: string; prazo?: string; tarefa?: number };
type Msg = {
  id: number; sala_id: string; user_id: string; agente: string | null; texto: string; criada_em: string;
  tipo: "mensagem" | "proposta" | "decisao"; responde_a: number | null; estado: "pendente" | "aprovada" | "recusada" | "ajuste" | "substituida" | null;
  decidida_em: string | null; editada_em: string | null; apagada: boolean; anexos: Anexo[]; novo_contexto?: string | null; substituida_por?: number | null;
  aprovadores?: string[] | null; plano?: ItemPlano[] | null; nomes?: Record<string, string>;
  autor?: { nome: string }; decisor?: { nome: string } | null;
  reacoes?: { emoji: string; agente: string | null; perfis: { nome: string } | null }[];
  votos?: { perfis: { nome: string } | null }[];
};

async function salasDe(q: Quem): Promise<Sala[]> {
  const { data, error } = await db.from("membros").select("salas(id, nome, contexto, memoria, idioma, aprovacoes)").eq("user_id", q.userId).order("entrou_em");
  if (error) throw error;
  return (data ?? []).map((r: any) => r.salas).filter(Boolean);
}

// aceita id ou nome da sala; sem sala e só uma sala → essa
async function acharSala(q: Quem, ref?: string): Promise<Sala> {
  const ss = await salasDe(q);
  if (!ss.length) throw new Falha(tr(q, `${q.pessoa} ainda não está em nenhuma sala. Crie ou entre em uma em ${APP}`, `${q.pessoa} isn't in any room yet. Create or join one at ${APP}`), 404);
  const r = (ref ?? "").trim().toLowerCase();
  if (!r) {
    if (ss.length === 1) return ss[0];
    throw new Falha(tr(q, "Diga qual sala: ", "Say which room: ") + `${ss.map((s) => `"${s.nome}"`).join(", ")}.`);
  }
  const s = ss.find((s) => s.id === r) ?? ss.find((s) => s.nome.toLowerCase() === r) ??
    ss.find((s) => s.nome.toLowerCase().includes(r));
  if (!s) throw new Falha(tr(q, `Sala "${ref}" não encontrada. Salas de ${q.pessoa}: `, `Room "${ref}" not found. ${q.pessoa}'s rooms: `) + `${ss.map((s) => `"${s.nome}"`).join(", ")}.`, 404);
  naSala(q, s.id);
  return s;
}

// Um despertar por vez (migração 031): usar a sala conta como "sessão trabalhando", e ler marca até onde o agente leu.
// Assim as chamadas que chegam enquanto ele trabalha ficam para esta sessão, em vez de abrir outra em paralelo.
function naSala(q: Quem, sala: string, leuAte = 0) {
  db.rpc("agente_na_sala", { quem: q.userId, agente: q.agente, sala, leu_ate: leuAte }).then(() => {}, () => {});
}

// ao enviar: chamadas que chegaram depois da última leitura desta sessão
async function chamadasNaoLidas(q: Quem, sala: string) {
  const { data } = await db.from("despertar_salas").select("lido_ate, pendente")
    .eq("user_id", q.userId).eq("agente", q.agente).eq("sala_id", sala).maybeSingle();
  if (!data?.pendente || data.pendente <= data.lido_ate) return "";
  return tr(q,
    `\nChegaram chamadas para você enquanto trabalhava. Leia com ler_mensagens (depois=${data.lido_ate}) e responda nesta mesma sessão antes de terminar.`,
    `\nNew calls for you arrived while you worked. Read them with ler_mensagens (depois=${data.lido_ate}) and handle them in this same session before you finish.`);
}

const SEL = "id, sala_id, user_id, agente, texto, criada_em, tipo, responde_a, estado, substituida_por, decidida_em, editada_em, apagada, anexos, novo_contexto, aprovadores, plano, " +
  "autor:perfis!mensagens_user_id_fkey(nome), decisor:perfis!mensagens_decidida_por_fkey(nome), votos(perfis(nome))";

async function ler(sala: string, depois = 0, limite = 50, antes = 0, busca = ""): Promise<Msg[]> {
  limite = Math.max(1, Math.min(limite || 50, 200));
  const termo = busca.replace(/[%_\\,()]/g, " ").trim().slice(0, 100);
  if (termo || antes > 0) {
    // histórico antigo: busca por texto ou página para trás
    let qy = db.from("mensagens").select(SEL).eq("sala_id", sala).eq("apagada", false);
    if (antes > 0) qy = qy.lt("id", antes);
    if (depois > 0) qy = qy.gt("id", depois);
    if (termo) qy = qy.ilike("texto", `%${termo}%`);
    const { data, error } = await qy.order("id", { ascending: false }).limit(limite);
    if (error) throw error;
    return await comReacoes((data as unknown as Msg[]).reverse());
  }
  if (depois > 0) {
    const { data, error } = await db.from("mensagens").select(SEL).eq("sala_id", sala).gt("id", depois).order("id").limit(limite);
    if (error) throw error;
    return await comReacoes(data as unknown as Msg[]);
  }
  const { data, error } = await db.from("mensagens").select(SEL).eq("sala_id", sala).order("id", { ascending: false }).limit(limite);
  if (error) throw error;
  return await comReacoes((data as unknown as Msg[]).reverse());
}

// nomes de quem aprova e de quem faz cada item do plano
async function comNomes(ms: Msg[]): Promise<Msg[]> {
  const ids = new Set<string>();
  for (const m of ms) {
    (m.aprovadores ?? []).forEach((u) => ids.add(u));
    (m.plano ?? []).forEach((i) => i.responsavel && ids.add(i.responsavel));
  }
  if (!ids.size) return ms;
  const { data } = await db.from("perfis").select("id, nome").in("id", [...ids]);
  const nomes = Object.fromEntries(((data ?? []) as { id: string; nome: string }[]).map((p) => [p.id, p.nome]));
  return ms.map((m) => (m.aprovadores?.length || m.plano?.length ? { ...m, nomes } : m));
}

// reações de cada mensagem, para o agente ver quem reagiu com o quê
async function comReacoes(ms: Msg[]): Promise<Msg[]> {
  if (!ms.length) return ms;
  ms = await comNomes(ms);
  const { data } = await db.from("reacoes").select("mensagem_id, emoji, agente, perfis(nome)").in("mensagem_id", ms.map((m) => m.id)).order("id");
  const por = new Map<number, Msg["reacoes"]>();
  for (const r of (data ?? []) as any[]) por.set(r.mensagem_id, [...(por.get(r.mensagem_id) ?? []), r]);
  return ms.map((m) => ({ ...m, reacoes: por.get(m.id) ?? [] }));
}

// pessoa ou agente reage; o mesmo emoji de novo tira a reação
// o agente corrige ou apaga só o que ele mesmo mandou
async function minhaMensagem(q: Quem, id: number) {
  const { data: m } = await db.from("mensagens").select("id, sala_id, user_id, agente, tipo, estado, apagada, anexos").eq("id", id).maybeSingle();
  if (!m || !(await salasDe(q)).some((x) => x.id === m.sala_id)) throw new Falha(tr(q, "Mensagem não encontrada.", "Message not found."), 404);
  if (m.user_id !== q.userId || m.agente !== q.agente) throw new Falha(tr(q, "Você só edita ou apaga mensagens que você mesmo mandou.", "You can only edit or delete messages you sent yourself."), 403);
  if (m.apagada) throw new Falha(tr(q, "Esta mensagem já foi apagada.", "This message was already deleted."));
  return m as { id: number; sala_id: string; tipo: string; estado: string | null; anexos: Anexo[] };
}

async function editarMensagem(q: Quem, id: number, texto: string) {
  const m = await minhaMensagem(q, id);
  if (m.tipo !== "mensagem") throw new Falha(tr(q, "Propostas e decisões não mudam depois de enviadas. Apague a proposta (se ainda não foi decidida) e proponha de novo.", "Proposals and decisions don't change once sent. Delete the proposal (if it hasn't been decided) and propose again."));
  const t = String(texto ?? "").trim();
  if (!t || t.length > 20000) throw new Falha(tr(q, "O texto precisa ter entre 1 e 20.000 caracteres.", "The text must be between 1 and 20,000 characters."));
  const { error } = await db.from("mensagens").update({ texto: t, editada_em: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return tr(q, `Mensagem #${id} corrigida.`, `Message #${id} edited.`);
}

async function apagarMensagem(q: Quem, id: number) {
  const m = await minhaMensagem(q, id);
  if (m.tipo === "decisao" || (m.tipo === "proposta" && m.estado !== "pendente")) throw new Falha(tr(q, "Decisões e propostas já decididas ficam no registro da sala.", "Decisions and decided proposals stay in the room's record."));
  const { error } = await db.from("mensagens").update({ apagada: true, texto: "Mensagem apagada.", anexos: [] }).eq("id", id);
  if (error) throw error;
  const meus = (m.anexos ?? []).map((a) => a.path).filter((p) => p.split("/")[1] === q.userId);
  if (meus.length) await db.storage.from("arquivos").remove(meus);
  registrar(q, m.sala_id, m.tipo === "proposta" ? "retirou a proposta" : "apagou uma mensagem", `#${id}`);
  return tr(q, m.tipo === "proposta" ? `Proposta #${id} retirada.` : `Mensagem #${id} apagada.`, m.tipo === "proposta" ? `Proposal #${id} withdrawn.` : `Message #${id} deleted.`);
}

async function reagir(q: Quem, mensagem: number, emoji: string) {
  const e = (emoji ?? "").trim();
  if (!e || e.length > 16 || /[\p{L}\p{N}\s<>]/u.test(e)) throw new Falha(tr(q, "Use um emoji, ex.: 👍", "Use an emoji, e.g. 👍"));
  const { data: m } = await db.from("mensagens").select("id, sala_id, apagada").eq("id", mensagem).maybeSingle();
  if (!m || !(await salasDe(q)).some((s) => s.id === m.sala_id)) throw new Falha(tr(q, "Mensagem não encontrada.", "Message not found."), 404);
  if (m.apagada) throw new Falha(tr(q, "Mensagem apagada.", "Message deleted."));
  const { data: tirou } = await db.from("reacoes").delete().eq("mensagem_id", m.id).eq("user_id", q.userId).eq("agente", q.agente).eq("emoji", e).select("id");
  if (tirou?.length) return false;
  const { error } = await db.from("reacoes").insert({ sala_id: m.sala_id, mensagem_id: m.id, user_id: q.userId, agente: q.agente, emoji: e });
  if (error) throw new Falha(error.message);
  return true;
}

type Envio = { texto: string; proposta?: boolean; substitui?: unknown; responde_a?: number | null; anexos?: Anexo[]; novo_contexto?: string; aprovadores?: string[]; plano?: ItemPlano[] };

async function enviar(q: Quem, sala: string, e: Envio): Promise<Msg> {
  const texto = (e.texto ?? "").trim();
  if (!texto && !e.anexos?.length) throw new Falha(tr(q, "Falta o texto.", "Missing text."));
  if (texto.length > 20000) throw new Falha(tr(q, "Mensagem acima de 20.000 caracteres.", "Message over 20,000 characters."));
  const novo = e.novo_contexto === undefined ? null : String(e.novo_contexto).trim();
  if (novo !== null) {
    if (!e.proposta) throw new Falha(tr(q, "Troca de contexto só vai como proposta.", "A context change can only be a proposal."));
    if (!novo) throw new Falha(tr(q, "Falta o texto novo do contexto.", "Missing the new context text."));
    if (novo.length > 50000) throw new Falha(tr(q, "Contexto acima de 50.000 caracteres.", "Context over 50,000 characters."));
  }
  let responde = Number(e.responde_a) || null;
  // versão nova de uma proposta sua: a antiga sai da fila
  let antiga: { id: number; estado: string; responde_a: number | null } | null = null;
  if (e.proposta && Number(e.substitui)) {
    const { data: o } = await db.from("mensagens").select("id, sala_id, user_id, agente, tipo, estado, responde_a, apagada").eq("id", Number(e.substitui)).maybeSingle();
    if (!o || o.sala_id !== sala || o.tipo !== "proposta" || o.apagada || o.user_id !== q.userId || o.agente !== q.agente)
      throw new Falha(tr(q, `A proposta #${e.substitui} não é uma proposta sua nesta sala.`, `Proposal #${e.substitui} isn't one of your proposals in this room.`));
    if (o.estado !== "pendente" && o.estado !== "ajuste")
      throw new Falha(tr(q, `A proposta #${e.substitui} já foi decidida (${o.estado}); mande uma proposta nova, sem substitui.`, `Proposal #${e.substitui} was already decided (${o.estado}); send a new proposal, without substitui.`));
    antiga = o;
    if (!responde) responde = o.responde_a ?? o.id;
  }
  // sem responde_a: liga à última mensagem que chamou este agente e que ele ainda não respondeu
  if (!responde) {
    const recentes = await ler(sala, 0, 30);
    for (let i = recentes.length - 1; i >= 0; i--) {
      const m = recentes[i];
      if (minha(q, m)) break;
      if (!m.apagada && m.tipo !== "decisao" && meChamou(q, m.texto)) { responde = m.id; break; }
    }
  }
  const { data, error } = await db.from("mensagens")
    .insert({ sala_id: sala, user_id: q.userId, agente: q.agente, texto, tipo: e.proposta ? "proposta" : "mensagem", responde_a: responde, anexos: e.anexos ?? [], novo_contexto: novo,
      aprovadores: e.proposta && e.aprovadores?.length ? e.aprovadores : null, plano: e.proposta && e.plano?.length ? e.plano : null })
    .select(SEL).single();
  if (error) throw new Falha(error.message, 429);
  if (antiga) {
    await db.from("mensagens").update({ estado: "substituida", substituida_por: (data as unknown as Msg).id }).eq("id", antiga.id);
    await db.from("votos").delete().eq("proposta_id", antiga.id);
  }
  return data as unknown as Msg;
}

const minha = (q: Quem, m: Msg) => m.user_id === q.userId && m.agente === q.agente;

async function esperar(q: Quem, sala: string, depois: number, segundos: number) {
  if (!depois) {
    const { data } = await db.from("mensagens").select("id").eq("sala_id", sala).order("id", { ascending: false }).limit(1);
    depois = (data?.[0]?.id as number) ?? 0;
  }
  const fim = Date.now() + Math.max(1, Math.min(segundos || 50, 55)) * 1000;
  // "ouvindo": vale até um pouco depois do fim, cobrindo o intervalo até a próxima espera
  await db.from("agentes").upsert({ user_id: q.userId, nome: q.agente, visto_em: new Date().toISOString(), ouvindo_ate: new Date(fim + 20000).toISOString() });
  let ultimo = depois;
  while (true) {
    const ms = await ler(sala, ultimo, 200);
    if (ms.length) ultimo = ms[ms.length - 1].id;
    const novas = ms.filter((m) => !minha(q, m));
    if (novas.length) return { ultimo, novas };
    if (Date.now() + 2000 > fim) return { ultimo, novas: [] as Msg[] };
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// @Claude, @Claude-Roberto, @agentes, @todos
const handle = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
function meChamou(q: Quem, texto: string) {
  for (const [, a, p] of texto.matchAll(/@([\p{L}\p{N}_]+)(?:-([\p{L}\p{N}_]+))?/gu)) {
    const h = handle(a);
    if (["agentes", "todos", "agents", "everyone", "all"].includes(h)) return true;
    if (h === handle(q.agente) && (!p || handle(p) === handle(q.pessoa.split(" ")[0]))) return true;
  }
  return false;
}

const quemEscreveu = (m: Msg, q?: Quem) => (m.agente
  ? tr(q, `${m.agente} de ${m.autor?.nome ?? "?"}`, `${m.agente} (${m.autor?.nome ?? "?"}'s agent)`)
  : `${m.autor?.nome ?? "?"} (${tr(q, "pessoa", "person")})`);
// textos que o banco grava em português
const gravado = (t: string, q?: Quem) => q?.lingua !== "en" ? t
  : t === "Aprovada." ? "Approved." : t === "Recusada." ? "Declined." :
  t === "Aprovada. O contexto da sala foi trocado pelo texto da proposta." ? "Approved. The room context was replaced with the proposal's text." :
  t === "Aprovada. O plano virou tarefas, com o prazo previsto de cada uma." ? "Approved. The plan became tasks, each with its planned due date." : t.replace(/^✓ Concluí a tarefa: /, "✓ Completed the task: ");
const tamanho = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);
const quando = (iso: string) => iso.slice(0, 16).replace("T", " ") + " UTC";

const nomeDe = (m: Msg, u?: string) => (u && m.nomes?.[u]) || "?";
const quemAprova = (m: Msg) => (m.aprovadores ?? []).map((u) => nomeDe(m, u).split(" ")[0]).join(", ");

function rotulo(m: Msg, q?: Quem) {
  if (m.apagada) return "";
  if (m.tipo === "proposta") {
    const ctx = m.novo_contexto ? tr(q, " DE TROCA DO CONTEXTO DA SALA", " TO REPLACE THE ROOM CONTEXT")
      : m.plano?.length ? tr(q, ` DE PLANO (${m.plano.length} tarefas)`, ` OF A PLAN (${m.plano.length} tasks)`) : "";
    if (m.estado === "pendente") {
      const ja = (m.votos ?? []).map((v) => v.perfis?.nome ?? "?");
      const parcial = ja.length ? tr(q, ` (já aprovou: ${ja.join(", ")}; falta outra aprovação)`, ` (already approved by: ${ja.join(", ")}; another approval is needed)`) : "";
      const todos = m.aprovadores?.length ? tr(q, `; decide quem foi indicado: ${quemAprova(m)} (quantos, pela regra da sala)`, `; the named people decide: ${quemAprova(m)} (how many, per the room setting)`) : "";
      return tr(q, ` · PROPOSTA${ctx} aguardando decisão das pessoas${parcial}${todos}`, ` · PROPOSAL${ctx} waiting for people to decide${parcial}${todos}`);
    }
    if (m.estado === "ajuste") return tr(q, ` · PROPOSTA${ctx} EM AJUSTE: ${m.decisor?.nome ?? "?"} pediu ajuste (veja a nota na decisão logo depois). Quem propôs corrige e reenvia com substitui=${m.id}`,
      ` · PROPOSAL${ctx} BEING ADJUSTED: ${m.decisor?.nome ?? "?"} asked for changes (see the note in the decision right after). The proposer fixes it and resends with substitui=${m.id}`);
    if (m.estado === "substituida") return tr(q, ` · PROPOSTA${ctx} SUBSTITUÍDA pela versão nova${m.substituida_por ? ` #${m.substituida_por}` : ""} (não vale mais)`,
      ` · PROPOSAL${ctx} REPLACED by the new version${m.substituida_por ? ` #${m.substituida_por}` : ""} (no longer valid)`);
    if (m.novo_contexto) return tr(q, ` · PROPOSTA${ctx} ${m.estado === "aprovada" ? "APROVADA (contexto já trocado)" : "RECUSADA"} por ${m.decisor?.nome ?? "?"}`,
      ` · PROPOSAL${ctx} ${m.estado === "aprovada" ? "APPROVED (context already replaced)" : "DECLINED"} by ${m.decisor?.nome ?? "?"}`);
    return tr(q, ` · PROPOSTA ${m.estado === "aprovada" ? "APROVADA" : "RECUSADA"} por ${m.decisor?.nome ?? "?"}`,
      ` · PROPOSAL ${m.estado === "aprovada" ? "APPROVED" : "DECLINED"} by ${m.decisor?.nome ?? "?"}`);
  }
  if (m.tipo === "decisao" && m.estado === "ajuste") return tr(q, ` · PEDIDO DE AJUSTE na proposta #${m.responde_a} (não é recusa: corrija e reenvie com substitui)`,
    ` · ADJUSTMENT REQUEST on proposal #${m.responde_a} (not a decline: fix it and resend with substitui)`);
  if (m.tipo === "decisao") return tr(q, ` · DECISÃO: ${m.estado === "aprovada" ? "aprovou" : "recusou"} a proposta #${m.responde_a}`,
    ` · DECISION: ${m.estado === "aprovada" ? "approved" : "declined"} proposal #${m.responde_a}`);
  return "";
}

const listaPlano = (m: Msg, q?: Quem) => (m.plano ?? []).map((i) => {
  const quem = i.responsavel ? (i.responsavel_agente ? tr(q, `${i.responsavel_agente} de ${nomeDe(m, i.responsavel)}`, `${nomeDe(m, i.responsavel)}'s ${i.responsavel_agente}`) : nomeDe(m, i.responsavel)) : tr(q, "sem responsável", "unassigned");
  return `- ${i.frente ? `[${i.frente}] ` : ""}${i.titulo} · ${quem}${i.prazo ? ` · ${tr(q, "prazo", "due")} ${i.prazo.slice(0, 10)}` : ""}${i.tarefa ? tr(q, ` · atualiza a tarefa ${i.tarefa}`, ` · updates task ${i.tarefa}`) : ""}`;
}).join("\n");

const formatar = (todas: Msg[], q?: Quem) => {
  const ms = todas.filter((m) => !(m.apagada && m.agente)); // envio por engano que o agente apagou: some
  return ms.length
    ? ms.map((m) => {
      const chamou = q && !minha(q, m) && !m.apagada && meChamou(q, m.texto) ? tr(q, "  ← chamou você", "  ← called you") : "";
      const resp = m.responde_a && m.tipo !== "decisao" ? tr(q, ` · responde a #${m.responde_a}`, ` · replies to #${m.responde_a}`) : "";
      const ed = m.editada_em && !m.apagada ? tr(q, " · (editada)", " · (edited)") : "";
      const anexos = (m.anexos ?? []).map((a) => `\n📎 ${a.nome} (${a.tipo}, ${tamanho(a.tamanho)}) · ler_arquivo: ${a.path}`).join("");
      const grupos = new Map<string, string[]>();
      for (const r of m.reacoes ?? []) {
        const quem = r.agente ? tr(q, `${r.agente} de ${r.perfis?.nome ?? "?"}`, `${r.perfis?.nome ?? "?"}'s ${r.agente}`) : r.perfis?.nome ?? "?";
        grupos.set(r.emoji, [...(grupos.get(r.emoji) ?? []), quem]);
      }
      const reacoes = grupos.size && !m.apagada ? `\n${tr(q, "reações", "reactions")}: ${[...grupos].map(([e, qs]) => `${e} ${qs.join(", ")}`).join(" · ")}` : "";
      const plano = m.plano?.length && !m.apagada ? `\n${tr(q, "Tarefas do plano", "Plan tasks")}:\n${listaPlano(m, q)}` : "";
      return `#${m.id} · ${quando(m.criada_em)} · ${quemEscreveu(m, q)}${rotulo(m, q)}${resp}${ed}${chamou}\n${m.apagada ? tr(q, "(mensagem apagada)", "(message deleted)") : gravado(m.texto, q)}${plano}${anexos}${reacoes}`;
    }).join("\n\n")
    : tr(q, "(nenhuma mensagem nova)", "(no new messages)");
};

async function propostas(sala: string, limite = 30): Promise<Msg[]> {
  const { data, error } = await db.from("mensagens").select(SEL).eq("sala_id", sala).eq("tipo", "proposta").eq("apagada", false)
    .order("id", { ascending: false }).limit(limite);
  if (error) throw error;
  return await comNomes(data as unknown as Msg[]);
}

const umaLinha = (t: string, n = 160) => { const l = t.replace(/\s+/g, " ").trim(); return l.length > n ? l.slice(0, n - 1) + "…" : l; };

function registro(ps: Msg[], q?: Quem) {
  const pend = ps.filter((p) => p.estado === "pendente");
  const ajuste = ps.filter((p) => p.estado === "ajuste");
  const dec = ps.filter((p) => p.estado === "aprovada" || p.estado === "recusada");
  const linhas: string[] = [];
  if (ajuste.length) linhas.push(tr(q, "Propostas em ajuste (quem propôs corrige e reenvia com substitui):", "Proposals being adjusted (the proposer fixes and resends with substitui):"),
    ...ajuste.map((p) => `- #${p.id} (${quemEscreveu(p, q)}), ${tr(q, "pedido por", "asked by")} ${p.decisor?.nome ?? "?"}: ${umaLinha(p.texto)}`));
  if (pend.length) linhas.push(tr(q, "Propostas aguardando decisão:", "Proposals waiting for a decision:"), ...pend.map((p) => `- #${p.id} (${quemEscreveu(p, q)})${p.aprovadores?.length ? tr(q, ` [decide: ${quemAprova(p)}]`, ` [decides: ${quemAprova(p)}]`) : ""}: ${umaLinha(p.texto)}`));
  if (dec.length) linhas.push(tr(q, "Decisões da sala (mais recentes primeiro):", "Room decisions (most recent first):"), ...dec.map((p) =>
    tr(q, `- #${p.id} ${p.estado === "aprovada" ? "APROVADA" : "RECUSADA"} por ${p.decisor?.nome ?? "?"} em ${p.decidida_em?.slice(0, 10)}: `,
      `- #${p.id} ${p.estado === "aprovada" ? "APPROVED" : "DECLINED"} by ${p.decisor?.nome ?? "?"} on ${p.decidida_em?.slice(0, 10)}: `) + umaLinha(p.texto)));
  return linhas.join("\n");
}

// arquivos anexados na conversa: aparecem no cabeçalho mesmo quando a mensagem já saiu das últimas lidas
async function anexosRecentes(sala: string): Promise<Msg[]> {
  const { data, error } = await db.from("mensagens").select("id, criada_em, agente, anexos, autor:perfis!mensagens_user_id_fkey(nome)")
    .eq("sala_id", sala).eq("apagada", false).neq("anexos", "[]").order("id", { ascending: false }).limit(40);
  if (error) throw error;
  return data as unknown as Msg[];
}

function listaAnexos(ms: Msg[], bs: ItemBib[], q?: Quem) {
  const naBib = new Set(bs.map((b) => b.path).filter(Boolean));
  const vistos = new Set<string>();
  // mesmo nome de arquivo = versão nova: só a mais recente aparece (ms vem da mais nova para a mais antiga)
  const linhas = ms.flatMap((m) => (m.anexos ?? []).filter((a) => {
    const k = a.nome.toLowerCase();
    if (naBib.has(a.path) || vistos.has(k)) return false;
    vistos.add(k); return true;
  }).map((a) => {
    const quem = m.agente ? tr(q, `${m.agente} de ${m.autor?.nome ?? "?"}`, `${m.autor?.nome ?? "?"}'s ${m.agente}`) : m.autor?.nome ?? "?";
    return `- 📎 ${a.nome} (${a.tipo.split(";")[0]}, ${tamanho(a.tamanho)}) · #${m.id}, ${quem}, ${m.criada_em.slice(0, 10)} · ler_arquivo: ${a.path}`;
  })).slice(0, 12);
  if (!linhas.length) return "";
  return `${tr(q, "Arquivos anexados na conversa (mais recentes; abra com ler_arquivo):", "Files attached in the conversation (most recent; open with ler_arquivo):")}\n${linhas.join("\n")}`;
}

// leitura de continuação (com `depois`): só o que pede ação; contexto, decisões e biblioteca já foram lidos
// a conversa tem idioma próprio: o agente escreve nele, mesmo que a sua pessoa use outro
const idiomaDaSala = (s: Sala, q?: Quem) => (s.idioma === "en"
  ? tr(q, "Idioma da sala: inglês. Escreva suas mensagens, propostas, tarefas e a memória em inglês.", "Room language: English. Write your messages, proposals, tasks and the memory in English.")
  : tr(q, "Idioma da sala: português. Escreva suas mensagens, propostas, tarefas e a memória em português.", "Room language: Portuguese. Write your messages, proposals, tasks and the memory in Portuguese."));

// lembrete curto a cada leitura: as instruções do conector podem chegar cortadas ou esquecidas numa sala longa
const jeitoDaSala = (s: Sala, q?: Quem) => {
  const n = Math.max(1, Number(s.aprovacoes ?? 1));
  return tr(q,
    `Como escrever aqui: casual e direto (a não ser que as instruções peçam outro tom); comece pela resposta; para pessoas, até 3 linhas, e o detalhe vai em arquivo; diga só o que mudou; pedido para uma pessoa vai na primeira linha com @. Aprovações: cada proposta precisa de ${n} sim (regra da sala; o app conta, e APROVADA vale).`,
    `How to write here: casual and direct (unless the instructions ask for another tone); lead with the answer; for people, up to 3 lines, details go in a file; say only what changed; an ask for a person goes on the first line with @. Approvals: each proposal needs ${n} yes (room setting; the app counts, and APPROVED stands).`);
};

// conector com a lista de ferramentas velha (ChatGPT guarda a lista até alguém atualizar): o agente percebe e avisa a pessoa
const ferramentasDaVersao = (q?: Quem) => {
  const nomes = TOOLS_PT.map((x) => x.name).filter((n) => n !== "search" && n !== "fetch").join(", ");
  return tr(q, `Ferramentas desta versão (${SERVIDOR.version}): ${nomes}. Se alguma não aparece para você, não improvise: peça à sua pessoa para atualizar o conector The Sala nas configurações do app dela.`,
    `Tools in this version (${SERVIDOR.version}): ${nomes}. If any of them is missing on your side, don't improvise: ask your person to refresh The Sala connector in their app settings.`);
};

async function cabecalhoCurto(s: Sala, q: Quem) {
  const [ps, ts] = await Promise.all([propostas(s.id, 15), tarefas(s.id)]);
  const pend = ps.filter((p) => p.estado === "pendente");
  const t = listaTarefas(ts.filter((x) => x.estado === "aberta" && ehMinha(q, x)), q, 0);
  const linhas = [tr(q, `Sala "${s.nome}" (só as novas; instruções, memória, decisões e biblioteca: leia sem \`depois\`)`, `Room "${s.nome}" (new messages only; instructions, memory, decisions and library: read without \`depois\`)`), idiomaDaSala(s, q), jeitoDaSala(s, q)];
  if (pend.length) linhas.push(tr(q, "Propostas aguardando decisão:", "Proposals waiting for a decision:"), ...pend.map((p) => `- #${p.id} (${quemEscreveu(p, q)}): ${umaLinha(p.texto, 100)}`));
  if (t) linhas.push(t);
  return linhas.join("\n");
}

async function cabecalho(s: Sala, q?: Quem) {
  const [ps, ts, bs, ax] = await Promise.all([propostas(s.id, 15), q ? tarefas(s.id) : Promise.resolve([] as Tarefa[]),
    biblioteca(s.id).catch(() => [] as ItemBib[]), anexosRecentes(s.id).catch(() => [] as Msg[])]);
  const r = registro(ps, q);
  const t = q ? listaTarefas(ts, q, 3) : "";
  const b = listaBiblioteca(bs, q, true);
  const a = listaAnexos(ax, bs, q);
  const ins = s.contexto?.trim() ? `\n${tr(q, "Instruções da sala (das pessoas)", "Room instructions (from the people)")}: ${s.contexto.trim()}` : "";
  const mem = `\n${tr(q, "Memória da sala (mantida pelos agentes; atualize com atualizar_memoria)", "Room memory (kept by the agents; update it with atualizar_memoria)")}:${s.memoria?.trim() ? `\n${s.memoria.trim()}` : tr(q, " (vazia: comece a preencher)", " (empty: start filling it in)")}`;
  return `${tr(q, "Sala", "Room")} "${s.nome}"\n${idiomaDaSala(s, q)}\n${jeitoDaSala(s, q)}\n${ferramentasDaVersao(q)}${ins}${mem}${r ? `\n${r}` : ""}${t ? `\n${t}` : ""}${b ? `\n${b}` : ""}${a ? `\n${a}` : ""}`;
}

// ---------------------------------------------------------------- memória

// a memória é o estado atual: passou do ideal, o agente é lembrado de enxugar; o teto barra o acúmulo
const MEMORIA_IDEAL = 4000;
const MEMORIA_MAX = 20000;

async function atualizarMemoria(q: Quem, s: Sala, a: Record<string, unknown>) {
  const { data: mb } = await db.from("membros").select("papel").eq("sala_id", s.id).eq("user_id", q.userId).maybeSingle();
  if (!mb || mb.papel === "leitor") throw new Falha(tr(q, "Nesta sala a sua pessoa só acompanha: não dá para mudar a memória.", "Your person can only view this room: you can't change the memory."), 403);
  const resumo = String(a.resumo ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (!resumo) throw new Falha(tr(q, "Falta o resumo: uma linha dizendo o que mudou.", "Missing resumo: one line saying what changed."));
  const { data: atual, error: e1 } = await db.from("salas").select("memoria").eq("id", s.id).single();
  if (e1) throw e1;
  let texto = String(atual.memoria ?? "");
  if (typeof a.texto === "string" && a.texto.trim()) texto = a.texto.trim();
  else if (Array.isArray(a.trocas) && a.trocas.length) {
    for (const [i, t] of (a.trocas as { de?: unknown; para?: unknown }[]).entries()) {
      const de = String(t?.de ?? ""), para = String(t?.para ?? "");
      if (!de) { texto = texto.trim() ? `${texto.trimEnd()}\n${para}` : para; continue; }
      const n = texto.split(de).length - 1;
      if (n !== 1) throw new Falha(tr(q, `Troca ${i + 1}: o trecho de \`de\` aparece ${n} vezes na memória; precisa aparecer uma vez só. Nada foi mudado.`,
        `Replacement ${i + 1}: the \`de\` text appears ${n} times in the memory; it must appear exactly once. Nothing was changed.`));
      texto = texto.replace(de, () => para);
    }
    texto = texto.trim();
  } else throw new Falha(tr(q, "Passe trocas (pequenas) ou texto (a memória inteira).", "Pass trocas (small) or texto (the whole memory)."));
  // acima do teto só passa o que encolhe: uma sala que já passou não trava, mas não cresce mais
  if (texto.length > MEMORIA_MAX && texto.length >= String(atual.memoria ?? "").trim().length) throw new Falha(tr(q, `A memória ficaria com ${texto.length} caracteres; o limite é ${MEMORIA_MAX.toLocaleString("pt-BR")}. Ela é o estado atual, não o histórico: reescreva o que ficou velho (texto, a memória inteira) e mande o detalhe para a biblioteca.`, `The memory would be ${texto.length} characters; the limit is ${MEMORIA_MAX.toLocaleString("en-US")}. It's the current state, not the history: rewrite what's outdated (texto, the whole memory) and move details to the library.`));
  if (texto === String(atual.memoria ?? "").trim()) return tr(q, "Nada mudou na memória.", "Nothing changed in the memory.");
  const { error: e2 } = await db.from("salas").update({ memoria: texto }).eq("id", s.id);
  if (e2) throw e2;
  await db.from("memoria_versoes").insert({ sala_id: s.id, texto, resumo, user_id: q.userId, agente: q.agente });
  registrar(q, s.id, "atualizou a memória", resumo);
  const longa = texto.length > MEMORIA_IDEAL
    ? tr(q, ` Está longa (o ideal é até ${MEMORIA_IDEAL.toLocaleString("pt-BR")}): na próxima atualização, reescreva enxugando o histórico e o detalhe que já está na biblioteca ou nas decisões.`,
      ` It's long (aim for ${MEMORIA_IDEAL.toLocaleString("en-US")} at most): next time, rewrite it, dropping history and details that already live in the library or the decisions.`)
    : "";
  return tr(q, `Memória da sala "${s.nome}" atualizada (${texto.length.toLocaleString("pt-BR")} caracteres): ${resumo}`, `Memory of the room "${s.nome}" updated (${texto.length.toLocaleString("en-US")} characters): ${resumo}`) + longa;
}

// ---------------------------------------------------------------- arquivos

const TEXTO = /^(text\/|application\/(json|xml|csv|javascript|x-yaml|yaml|sql|x-sh|markdown))/;
const ehTexto = (tipo: string, nome: string) => TEXTO.test(tipo) || /\.(md|txt|csv|json|ya?ml|xml|html?|js|ts|tsx|py|sql|sh|css)$/i.test(nome);

const tipoPorNome = (nome: string) => {
  const ext = nome.split(".").pop()?.toLowerCase() ?? "";
  return ({ md: "text/markdown", txt: "text/plain", csv: "text/csv", json: "application/json", html: "text/html", htm: "text/html",
    xml: "application/xml", yaml: "application/yaml", yml: "application/yaml", js: "text/javascript", ts: "text/plain", py: "text/x-python",
    sql: "application/sql", css: "text/css" } as Record<string, string>)[ext] ?? "text/plain";
};
const BINARIOS: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", pdf: "application/pdf" };

const limparNome = (nome: string) => (nome || "arquivo.txt").replace(/[\/\\\x00-\x1f]/g, "-").trim().slice(0, 200) || "arquivo.txt";
const chaveDe = (limpo: string) => (limpo.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/\.{2,}/g, ".").replace(/^[-.]+|-+$/g, "") || "arquivo.txt").slice(-120);
const UUID_PREFIXO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/;

// upload direto: o agente sobe os bytes pelo terminal (curl) e só passa o caminho; não gasta tokens com base64
async function prepararEnvio(q: Quem, s: Sala, nomes: string[]) {
  const lista = nomes.map((n) => n.trim()).filter(Boolean);
  if (!lista.length) throw new Falha(tr(q, "Passe nomes: a lista de arquivos, com extensão.", "Pass nomes: the list of files, with extension."));
  if (lista.length > 30) throw new Falha(tr(q, "No máximo 30 arquivos por vez.", "At most 30 files at a time."));
  const linhas: string[] = [];
  for (const n of lista) {
    const limpo = limparNome(n);
    const path = `${s.id}/${q.userId}/${crypto.randomUUID()}-${chaveDe(limpo)}`;
    const { data, error } = await db.storage.from("arquivos").createSignedUploadUrl(path);
    if (error || !data) throw new Falha(tr(q, "Não deu para preparar o envio: ", "Couldn't prepare the upload: ") + (error?.message ?? ""), 500);
    const ext = limpo.split(".").pop()?.toLowerCase() ?? "";
    const tipo = BINARIOS[ext] ?? tipoPorNome(limpo);
    linhas.push(`- ${limpo}\n  curl -sS -X PUT -H 'content-type: ${tipo}' --data-binary @'${limpo.replace(/'/g, "")}' '${data.signedUrl}'\n  enviados: ${path}`);
  }
  return tr(q, `Links de upload (valem 2 horas). Rode cada curl na pasta do arquivo (troque o @ pelo caminho certo, se precisar). Depois chame enviar_arquivo com enviados = os caminhos abaixo e, se quiser, um texto.\n\n${linhas.join("\n")}`,
    `Upload links (valid for 2 hours). Run each curl in the file's folder (change the @ to the right path if needed). Then call enviar_arquivo with enviados = the paths below and, optionally, a texto.\n\n${linhas.join("\n")}`);
}

async function anexosEnviados(q: Quem, sala: string, caminhos: string[]): Promise<Anexo[]> {
  if (caminhos.length > 30) throw new Falha(tr(q, "No máximo 30 arquivos por mensagem.", "At most 30 files per message."));
  const out: Anexo[] = [];
  for (const path of caminhos.map((c) => c.trim())) {
    const dir = `${sala}/${q.userId}`;
    if (!path.startsWith(`${dir}/`) || path.slice(dir.length + 1).includes("/")) throw new Falha(tr(q, `Caminho "${path}" não é desta sala. Use os caminhos de preparar_envio.`, `Path "${path}" isn't from this room. Use the paths from preparar_envio.`));
    const arquivo = path.slice(dir.length + 1);
    const { data } = await db.storage.from("arquivos").list(dir, { search: arquivo, limit: 2 });
    const obj = data?.find((o) => o.name === arquivo);
    if (!obj) throw new Falha(tr(q, `O arquivo de "${path}" ainda não subiu. Rode o curl de preparar_envio e confira se ele não deu erro.`, `The file for "${path}" hasn't been uploaded yet. Run the curl from preparar_envio and check that it didn't fail.`));
    const meta = (obj.metadata ?? {}) as { size?: number; mimetype?: string };
    const nome = arquivo.replace(UUID_PREFIXO, "");
    const ext = nome.split(".").pop()?.toLowerCase() ?? "";
    const tipo = meta.mimetype && meta.mimetype !== "application/octet-stream" ? meta.mimetype.split(";")[0] : BINARIOS[ext] ?? tipoPorNome(nome);
    out.push({ path, nome, tipo, tamanho: meta.size ?? 0 });
  }
  return out;
}

async function subirTexto(q: Quem, sala: string, nome: string, conteudo: string, base64?: unknown): Promise<Anexo> {
  const limpo = (nome || "arquivo.txt").replace(/[\/\\\x00-\x1f]/g, "-").trim().slice(0, 200) || "arquivo.txt";
  // a chave do armazenamento só aceita letras sem acento, números, ponto, hífen e sublinhado; o nome real fica na mensagem
  const chave = (limpo.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/\.{2,}/g, ".").replace(/^[-.]+|-+$/g, "") || "arquivo.txt").slice(-120);
  // imagem ou PDF: o conteúdo vem em base64 (captura de tela, PDF gerado)
  const bin = BINARIOS[limpo.split(".").pop()?.toLowerCase() ?? ""];
  if (base64 === true || base64 === "true" || bin) {
    if (!bin) throw new Falha(tr(q, "Em base64 só vão imagens (png, jpg, gif, webp) e PDF.", "Only images (png, jpg, gif, webp) and PDF go in base64."));
    let bytes: Uint8Array;
    try {
      const b = atob(String(conteudo ?? "").replace(/^data:[^,]*,/, "").replace(/\s+/g, ""));
      bytes = Uint8Array.from(b, (c) => c.charCodeAt(0));
    } catch { throw new Falha(tr(q, "Conteúdo em base64 inválido. Para imagem ou PDF, passe os bytes do arquivo em base64.", "Invalid base64 content. For an image or PDF, pass the file bytes in base64.")); }
    if (!bytes.length) throw new Falha(tr(q, "O arquivo está vazio.", "The file is empty."));
    if (bytes.length > 4_000_000) throw new Falha(tr(q, "Imagem ou PDF acima de 4 MB.", "Image or PDF over 4 MB."));
    const path = `${sala}/${q.userId}/${crypto.randomUUID()}-${chave}`;
    const { error } = await db.storage.from("arquivos").upload(path, bytes, { contentType: bin });
    if (error) throw new Falha(tr(q, "Não deu para guardar o arquivo: ", "Couldn't save the file: ") + error.message, 500);
    return { path, nome: limpo, tipo: bin, tamanho: bytes.length };
  }
  const bytes = new TextEncoder().encode(conteudo ?? "");
  if (!bytes.length) throw new Falha(tr(q, "O arquivo está vazio.", "The file is empty."));
  if (bytes.length > 1048576) throw new Falha(tr(q, "Arquivo de texto acima de 1 MB.", "Text file over 1 MB."));
  const tipo = tipoPorNome(limpo);
  const path = `${sala}/${q.userId}/${crypto.randomUUID()}-${chave}`;
  const { error } = await db.storage.from("arquivos").upload(path, bytes, { contentType: `${tipo}; charset=utf-8` });
  if (error) throw new Falha(tr(q, "Não deu para guardar o arquivo: ", "Couldn't save the file: ") + error.message, 500);
  return { path, nome: limpo, tipo, tamanho: bytes.length };
}

type Conteudo = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

// devolve o arquivo em forma que o agente lê: texto, imagem, ou um link temporário
async function lerArquivo(q: Quem, caminho: string): Promise<Conteudo[]> {
  const path = (caminho ?? "").trim().replace(/^\/+/, "");
  if (path.includes("..") || /%2e/i.test(path)) throw new Falha(tr(q, "Arquivo não encontrado nas suas salas.", "File not found in your rooms."), 404);
  const salaId = path.split("/")[0];
  if (!(await salasDe(q)).some((s) => s.id === salaId)) throw new Falha(tr(q, "Arquivo não encontrado nas suas salas.", "File not found in your rooms."), 404);
  const { data: info } = await db.from("mensagens").select("anexos").eq("sala_id", salaId).filter("anexos", "cs", JSON.stringify([{ path }])).limit(1).maybeSingle();
  let a = (info?.anexos as Anexo[] | undefined)?.find((x) => x.path === path);
  if (!a) {
    const { data: b } = await db.from("biblioteca").select("path, nome, mime, tamanho").eq("sala_id", salaId).eq("path", path).limit(1).maybeSingle();
    if (b) a = { path: b.path, nome: b.nome ?? "arquivo", tipo: b.mime ?? "application/octet-stream", tamanho: Number(b.tamanho ?? 0) };
  }
  if (!a) throw new Falha(tr(q, "Arquivo não encontrado nas suas salas.", "File not found in your rooms."), 404);
  if (ehTexto(a.tipo, a.nome) && a.tamanho <= 300_000) {
    const { data, error } = await db.storage.from("arquivos").download(path);
    if (error || !data) throw new Falha(tr(q, "Não deu para abrir o arquivo.", "Couldn't open the file."), 500);
    return [{ type: "text", text: `${a.nome}\n\n${await data.text()}` }];
  }
  if ((a.tipo === "application/pdf" || /\.pdf$/i.test(a.nome)) && a.tamanho <= 20_000_000) {
    const { data, error } = await db.storage.from("arquivos").download(path);
    if (error || !data) throw new Falha(tr(q, "Não deu para abrir o arquivo.", "Couldn't open the file."), 500);
    try {
      const { extractText, getDocumentProxy } = await import("npm:unpdf@1.4.0");
      const pdf = await getDocumentProxy(new Uint8Array(await data.arrayBuffer()));
      const { totalPages, text } = await extractText(pdf, { mergePages: false });
      const paginas = (text as string[]).map((t, i) => `--- ${tr(q, "página", "page")} ${i + 1} ---\n${t.trim()}`).join("\n\n");
      if (paginas.replace(/--- .*? ---/g, "").trim()) {
        const corpo = paginas.length > 400_000 ? paginas.slice(0, 400_000) + tr(q, "\n\n(cortado: o PDF passa de 400 mil caracteres)", "\n\n(cut: the PDF is over 400k characters)") : paginas;
        return [{ type: "text", text: `${a.nome} (PDF, ${totalPages} ${tr(q, "páginas", "pages")})\n\n${corpo}` }];
      }
    } catch (e) { console.log(JSON.stringify({ mcp: "pdf_falhou", erro: String(e).slice(0, 200) })); }
    // PDF só de imagem (escaneado) ou ilegível: cai no link temporário abaixo
  }
  if (a.tipo.startsWith("image/") && a.tamanho <= 4_000_000) {
    const { data, error } = await db.storage.from("arquivos").download(path);
    if (error || !data) throw new Falha(tr(q, "Não deu para abrir o arquivo.", "Couldn't open the file."), 500);
    const b = new Uint8Array(await data.arrayBuffer());
    let bin = "";
    for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return [{ type: "text", text: a.nome }, { type: "image", data: btoa(bin), mimeType: a.tipo }];
  }
  const { data } = await db.storage.from("arquivos").createSignedUrl(path, 3600);
  return [{ type: "text", text: `${a.nome} (${a.tipo}, ${tamanho(a.tamanho)}). ${tr(q, "Baixe por este link, válido por 1 hora", "Download it from this link, valid for 1 hour")}:\n${data?.signedUrl ?? tr(q, "(sem link)", "(no link)")}` }];
}

// ---------------------------------------------------------------- biblioteca

type ItemBib = { id: number; sala_id: string; user_id: string; agente: string | null; tipo: "arquivo" | "link"; titulo: string; nota: string | null;
  url: string | null; path: string | null; nome: string | null; mime: string | null; tamanho: number | null; criado_em: string; autor?: { nome: string } | null };
const SEL_B = "id, sala_id, user_id, agente, tipo, titulo, nota, url, path, nome, mime, tamanho, criado_em, autor:perfis!biblioteca_user_id_fkey(nome)";

async function biblioteca(sala: string): Promise<ItemBib[]> {
  const { data, error } = await db.from("biblioteca").select(SEL_B).eq("sala_id", sala).order("id", { ascending: false }).limit(200);
  if (error) throw error;
  return data as unknown as ItemBib[];
}

function listaBiblioteca(bs: ItemBib[], q?: Quem, curta = false) {
  if (!bs.length) return "";
  const linhas = bs.slice(0, curta ? 25 : 200).map((b) => {
    const onde = b.tipo === "link" ? b.url : `${b.nome}${b.tamanho ? `, ${tamanho(b.tamanho)}` : ""} · ler_arquivo: ${b.path}`;
    const quem = b.agente ? tr(q, `${b.agente} de ${b.autor?.nome ?? "?"}`, `${b.autor?.nome ?? "?"}'s ${b.agente}`) : b.autor?.nome ?? "?";
    return `- ${tr(q, "item", "item")} ${b.id}: ${b.titulo} (${b.tipo === "link" ? "link" : tr(q, "arquivo", "file")}: ${onde})${b.nota ? ` — ${curta ? umaLinha(b.nota, 140) : b.nota}` : ""}${curta ? "" : ` · ${quem}, ${b.criado_em.slice(0, 10)}`}`;
  });
  const resto = curta && bs.length > 25 ? `\n${tr(q, `(+${bs.length - 25} itens: use ver_biblioteca)`, `(+${bs.length - 25} items: use ver_biblioteca)`)}` : "";
  return `${tr(q, "Biblioteca da sala (referências; abra os arquivos com ler_arquivo):", "Room library (references; open files with ler_arquivo):")}\n${linhas.join("\n")}${resto}`;
}

async function podeEscrever(q: Quem, sala: string) {
  const { data } = await db.from("membros").select("papel").eq("sala_id", sala).eq("user_id", q.userId).maybeSingle();
  if (!data || data.papel === "leitor") throw new Falha(tr(q, "Nesta sala a sua pessoa só acompanha: não dá para mexer na biblioteca.", "Your person can only view this room: you can't change the library."), 403);
}

async function itemDaBiblioteca(q: Quem, id: number): Promise<ItemBib> {
  const { data } = await db.from("biblioteca").select(SEL_B).eq("id", id).maybeSingle();
  const b = data as unknown as ItemBib | null;
  if (!b || !(await salasDe(q)).some((s) => s.id === b.sala_id)) throw new Falha(tr(q, "Item da biblioteca não encontrado.", "Library item not found."), 404);
  await podeEscrever(q, b.sala_id);
  return b;
}

const registrar = (q: Quem, sala: string, acao: string, detalhe: string) =>
  db.from("historico").insert({ sala_id: sala, quem: q.userId, agente: q.agente, acao, detalhe: detalhe.slice(0, 300) }).then(() => {});

// ---------------------------------------------------------------- tarefas

type Tarefa = {
  id: number; sala_id: string; titulo: string; origem: number | null; responsavel: string | null; responsavel_agente: string | null;
  prazo: string | null; estado: "aberta" | "feita" | "cancelada"; resultado: string | null; concluida_em: string | null;
  frente: string | null; prazo_previsto: string | null;
  dono?: { nome: string } | null;
};
const SEL_T = "id, sala_id, titulo, origem, responsavel, responsavel_agente, prazo, estado, resultado, concluida_em, frente, prazo_previsto, dono:perfis!tarefas_responsavel_fkey(nome)";

async function tarefas(sala: string): Promise<Tarefa[]> {
  const { data, error } = await db.from("tarefas").select(SEL_T).eq("sala_id", sala).neq("estado", "cancelada")
    .order("estado").order("prazo", { ascending: true, nullsFirst: false }).order("id", { ascending: false }).limit(60);
  if (error) throw error;
  return data as unknown as Tarefa[];
}

const ehMinha = (q: Quem, t: Tarefa) => t.responsavel === q.userId && (t.responsavel_agente === q.agente || t.responsavel_agente === null);
const quemFaz = (t: Tarefa, q?: Quem) => (t.responsavel_agente
  ? tr(q, `${t.responsavel_agente} de ${t.dono?.nome ?? "?"}`, `${t.dono?.nome ?? "?"}'s ${t.responsavel_agente}`)
  : t.dono?.nome ?? tr(q, "sem responsável", "unassigned"));
const dataCurta = (iso: string) => iso.slice(0, 16).replace("T", " ") + " UTC";

function listaTarefas(ts: Tarefa[], q: Quem, feitas = 5) {
  const abertas = ts.filter((t) => t.estado === "aberta");
  const prontas = ts.filter((t) => t.estado === "feita").slice(0, feitas);
  const linhas: string[] = [];
  const tarefa = tr(q, "tarefa", "task");
  if (abertas.length) linhas.push(tr(q, "Tarefas abertas:", "Open tasks:"), ...abertas.map((t) => {
    const atrasada = t.prazo && new Date(t.prazo).getTime() < Date.now() ? tr(q, " · ATRASADA", " · OVERDUE") : "";
    const sua = ehMinha(q, t) ? (t.responsavel_agente ? tr(q, " ← SUA", " ← YOURS") : tr(q, " ← da sua pessoa", " ← your person's")) : "";
    const previsto = t.prazo_previsto && t.prazo_previsto !== t.prazo ? ` · ${tr(q, "previsto no plano", "planned")} ${t.prazo_previsto.slice(0, 10)}` : "";
    return `- ${tarefa} ${t.id}: ${t.frente ? `[${t.frente}] ` : ""}${t.titulo} · ${quemFaz(t, q)}${t.prazo ? ` · ${tr(q, "prazo", "due")} ${dataCurta(t.prazo)}` : ""}${previsto}${atrasada}${t.origem ? ` · ${tr(q, "veio da", "from")} #${t.origem}` : ""}${sua}`;
  }));
  if (prontas.length) linhas.push(tr(q, "Feitas recentemente:", "Recently completed:"), ...prontas.map((t) => `- ${tarefa} ${t.id}: ${t.titulo} · ${quemFaz(t, q)}${t.resultado ? ` · ${umaLinha(t.resultado, 100)}` : ""}`));
  return linhas.join("\n");
}

// "eu"/vazio → o próprio agente; "Ana" → pessoa; "Claude-Ana" → agente de alguém
async function acharResponsavel(q: Quem, sala: string, ref?: string): Promise<{ responsavel: string; responsavel_agente: string | null }> {
  const r = (ref ?? "").trim().replace(/^@/, "");
  if (!r || ["eu", "voce", "você", "mim", "me", "you", "myself"].includes(r.toLowerCase())) return { responsavel: q.userId, responsavel_agente: q.agente };
  const { data } = await db.from("membros").select("user_id, perfis(nome)").eq("sala_id", sala);
  const membros = (data ?? []) as unknown as { user_id: string; perfis: { nome: string } | null }[];
  const [a, b] = r.split("-");
  const pessoa = (h: string) => membros.find((m) => handle((m.perfis?.nome ?? "").split(" ")[0]) === handle(h));
  if (b) {
    const m = pessoa(b);
    if (m) return { responsavel: m.user_id, responsavel_agente: a.trim() };
  }
  const m = pessoa(r);
  if (m) return { responsavel: m.user_id, responsavel_agente: null };
  throw new Falha(tr(q, `Não achei "${ref}" na sala. Use o primeiro nome da pessoa (Ana) ou Agente-Pessoa (Claude-Ana).`,
    `Couldn't find "${ref}" in the room. Use the person's first name (Ana) or Agent-Person (Claude-Ana).`));
}

// "Roberto, David" → as pessoas da sala que podem aprovar
async function acharAprovadores(q: Quem, sala: string, refs: unknown): Promise<string[] | undefined> {
  const lista = (Array.isArray(refs) ? refs : typeof refs === "string" ? refs.split(/[,;]| e | and /) : []).map((r) => String(r).trim().replace(/^@/, "")).filter(Boolean);
  if (!lista.length) return undefined;
  const { data } = await db.from("membros").select("user_id, papel, perfis(nome)").eq("sala_id", sala);
  const membros = (data ?? []) as unknown as { user_id: string; papel: string; perfis: { nome: string } | null }[];
  return lista.map((r) => {
    const m = membros.find((x) => handle((x.perfis?.nome ?? "").split(" ")[0]) === handle(r) || handle(x.perfis?.nome ?? "") === handle(r));
    if (!m) throw new Falha(tr(q, `Não achei "${r}" na sala para aprovar. Use o primeiro nome da pessoa.`, `Couldn't find "${r}" in the room to approve. Use the person's first name.`));
    if (m.papel === "leitor") throw new Falha(tr(q, `${m.perfis?.nome} só acompanha esta sala e não aprova.`, `${m.perfis?.nome} only views this room and can't approve.`));
    return m.user_id;
  });
}

// só a data ("2026-11-10"): vale até 18h de Brasília, como no app
// "[Shared repo] Confirmar…" com frente "Shared repo": a frente já aparece à parte
const semPrefixo = (titulo: string, frente: string) => {
  let t = titulo.trim();
  const f = frente.trim().toLowerCase();
  while (f && t.toLowerCase().startsWith(`[${f}]`)) t = t.slice(f.length + 2).trim();
  return t;
};

async function editarTarefa(q: Quem, a: Record<string, unknown>) {
  const id = Number(a.tarefa);
  const { data: t } = await db.from("tarefas").select("id, sala_id, titulo, estado, frente").eq("id", id).maybeSingle();
  if (!t || !(await salasDe(q)).some((x) => x.id === t.sala_id)) throw new Falha(tr(q, `Tarefa ${a.tarefa} não encontrada.`, `Task ${a.tarefa} not found.`), 404);
  const { data: mb } = await db.from("membros").select("papel").eq("sala_id", t.sala_id).eq("user_id", q.userId).maybeSingle();
  if (!mb || mb.papel === "leitor") throw new Falha(tr(q, "Nesta sala a sua pessoa só acompanha.", "Your person can only view this room."), 403);
  if (t.estado !== "aberta") throw new Falha(tr(q, `A tarefa ${id} já está ${t.estado}.`, `Task ${id} is already ${t.estado === "feita" ? "done" : "cancelled"}.`));
  const mud: Record<string, unknown> = {};
  const feito: string[] = [];
  if (a.cancelar === true || a.cancelar === "true") { mud.estado = "cancelada"; feito.push(tr(q, "cancelada", "cancelled")); }
  if (a.responsavel !== undefined && String(a.responsavel).trim() !== "") {
    Object.assign(mud, await acharResponsavel(q, t.sala_id, String(a.responsavel)));
    feito.push(tr(q, "responsável trocado", "assignee changed"));
  }
  if (a.frente !== undefined) { mud.frente = String(a.frente).trim().slice(0, 40) || null; feito.push(tr(q, "frente", "workstream")); }
  if (a.titulo !== undefined && String(a.titulo).trim()) {
    mud.titulo = semPrefixo(String(a.titulo), String(mud.frente ?? t.frente ?? "")).slice(0, 200); feito.push(tr(q, "título", "title"));
  }
  if (a.prazo !== undefined) { mud.prazo = String(a.prazo).trim() ? lerPrazo(a.prazo) : null; feito.push(tr(q, "prazo", "due date")); }
  if (!feito.length) throw new Falha(tr(q, "Diga o que mudar: responsavel, titulo, prazo, frente ou cancelar.", "Say what to change: responsavel, titulo, prazo, frente or cancelar."));
  const { error } = await db.from("tarefas").update(mud).eq("id", id);
  if (error) throw new Falha(error.message);
  registrar(q, t.sala_id, mud.estado === "cancelada" ? "cancelou a tarefa" : "editou a tarefa", String(mud.titulo ?? t.titulo));
  return tr(q, `Tarefa ${id} atualizada: ${feito.join(", ")}.`, `Task ${id} updated: ${feito.join(", ")}.`);
}

function lerPrazo(v: unknown): string | null {
  const p = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(p) ? new Date(`${p}T18:00:00-03:00`).toISOString()
    : p && !isNaN(Date.parse(p)) ? new Date(p).toISOString() : null;
}

async function montarPlano(q: Quem, sala: string, itens: unknown): Promise<ItemPlano[]> {
  if (!Array.isArray(itens) || !itens.length) throw new Falha(tr(q, "Passe itens: a lista de tarefas do plano.", "Pass itens: the plan's list of tasks."));
  if (itens.length > 60) throw new Falha(tr(q, "No máximo 60 tarefas por plano.", "At most 60 tasks per plan."));
  const out: ItemPlano[] = [];
  for (const [n, i] of (itens as Record<string, unknown>[]).entries()) {
    const titulo = String(i?.titulo ?? "").replace(/\s+/g, " ").trim();
    if (!titulo) throw new Falha(tr(q, `Item ${n + 1} do plano sem título.`, `Plan item ${n + 1} has no title.`));
    // título curto, como numa lista de tarefas; condições e detalhes vão no texto do plano
    if (titulo.length > 120) throw new Falha(tr(q, `O título do item ${n + 1} tem ${titulo.length} caracteres; o limite é 120. Encurte ("${titulo.slice(0, 60)}…") e ponha os detalhes no texto do plano. Nada foi enviado.`,
      `Plan item ${n + 1}'s title is ${titulo.length} characters; the limit is 120. Shorten it ("${titulo.slice(0, 60)}…") and put the details in the plan's texto. Nothing was sent.`));
    const ref = String(i?.responsavel ?? "").trim();
    const resp = ref ? await acharResponsavel(q, sala, ref) : null;
    const prazo = lerPrazo(i?.prazo);
    if (String(i?.prazo ?? "").trim() && !prazo) throw new Falha(tr(q, `Prazo inválido em "${titulo}". Use 2026-11-20.`, `Invalid due date in "${titulo}". Use 2026-11-20.`));
    out.push({ titulo, frente: String(i?.frente ?? "").trim().slice(0, 40) || undefined, responsavel: resp?.responsavel, responsavel_agente: resp?.responsavel_agente ?? undefined,
      prazo: prazo ?? undefined, tarefa: Number(i?.tarefa) || undefined });
  }
  return out;
}

// ---------------------------------------------------------------- painel

type Painel = {
  nomes: Record<string, string>;
  totais: { abertas: number; feitas: number; atrasadas: number; sem_responsavel: number };
  frentes: { frente: string; total: number; feitas: number; atrasadas: number; previsto: string | null; projecao: string | null; desvio_dias: number | null }[];
  propostas: { id: number; titulo: string; precisa: number; votos: number; faltam: string[]; exato: boolean; criada_em: string; plano: boolean }[];
  esperando: { user_id: string; propostas: number }[];
  atrasadas: { id: number; titulo: string; frente: string | null; prazo: string; responsavel: string | null; responsavel_agente: string | null }[];
  ritmo: { semana: string; feitas: number }[];
};

async function painel(q: Quem, s: Sala) {
  const { data, error } = await db.rpc("painel_sala", { sala: s.id });
  if (error) throw new Falha(error.message);
  const p = data as Painel;
  const nome = (u: string | null) => (u && p.nomes[u]?.split(" ")[0]) || "?";
  const dias = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 864e5));
  const L: string[] = [tr(q, `Painel da sala "${s.nome}" (os mesmos números que as pessoas veem no app)`, `Dashboard of the room "${s.nome}" (the same numbers people see in the app)`)];
  const t = p.totais;
  L.push(tr(q, `Tarefas: ${t.abertas} abertas, ${t.feitas} feitas, ${t.atrasadas} atrasadas, ${t.sem_responsavel} sem responsável.`,
    `Tasks: ${t.abertas} open, ${t.feitas} done, ${t.atrasadas} overdue, ${t.sem_responsavel} unassigned.`));
  if (p.frentes.length) {
    L.push(tr(q, "Avanço por frente:", "Progress by workstream:"));
    for (const f of p.frentes) {
      const plano = f.previsto ? tr(q, ` · previsto ${f.previsto.slice(0, 10)}, projeção ${f.projecao?.slice(0, 10) ?? "?"}`, ` · planned ${f.previsto.slice(0, 10)}, projected ${f.projecao?.slice(0, 10) ?? "?"}`)
        + (f.desvio_dias && f.desvio_dias > 0 ? tr(q, ` (+${f.desvio_dias} dias)`, ` (+${f.desvio_dias} days)`) : tr(q, " (no prazo)", " (on time)")) : "";
      L.push(`- ${f.frente || tr(q, "Sem frente", "No workstream")}: ${f.feitas}/${f.total}${f.atrasadas ? tr(q, ` · ${f.atrasadas} atrasada(s)`, ` · ${f.atrasadas} overdue`) : ""}${plano}`);
    }
  }
  if (p.propostas.length) {
    L.push(tr(q, "Esperando aprovação:", "Waiting for approval:"));
    for (const e of p.esperando) L.push(tr(q, `- ${nome(e.user_id)}: ${e.propostas} proposta(s)`, `- ${nome(e.user_id)}: ${e.propostas} proposal(s)`));
    for (const x of p.propostas) {
      const falta = x.exato ? x.faltam.map(nome).join(", ") : tr(q, `${x.precisa - x.votos} de: ${x.faltam.map(nome).join(", ")}`, `${x.precisa - x.votos} of: ${x.faltam.map(nome).join(", ")}`);
      L.push(tr(q, `- #${x.id}${x.plano ? " (plano)" : ""}: ${x.titulo} · falta ${falta} · há ${dias(x.criada_em)} dia(s)`, `- #${x.id}${x.plano ? " (plan)" : ""}: ${x.titulo} · waiting for ${falta} · ${dias(x.criada_em)} day(s)`));
    }
  }
  if (p.atrasadas.length) {
    L.push(tr(q, "Atrasadas:", "Overdue:"));
    for (const a of p.atrasadas) {
      const quem = a.responsavel ? (a.responsavel_agente ? tr(q, `${a.responsavel_agente} de ${nome(a.responsavel)}`, `${nome(a.responsavel)}'s ${a.responsavel_agente}`) : nome(a.responsavel)) : tr(q, "sem responsável", "unassigned");
      L.push(tr(q, `- tarefa ${a.id}: ${a.frente ? `[${a.frente}] ` : ""}${a.titulo} · ${quem} · ${dias(a.prazo)} dia(s) de atraso`, `- task ${a.id}: ${a.frente ? `[${a.frente}] ` : ""}${a.titulo} · ${quem} · ${dias(a.prazo)} day(s) late`));
    }
  }
  L.push(tr(q, `Ritmo, tarefas feitas por semana (8 semanas, a última é esta): ${p.ritmo.map((r) => r.feitas).join(", ")}`,
    `Pace, tasks done per week (8 weeks, the last is this one): ${p.ritmo.map((r) => r.feitas).join(", ")}`));
  return L.join("\n");
}

function resumoDoResultado(r: string, max = 280) {
  let linha = r.split(/\n\s*\n|\n(?=\s*[-*•]\s)/)[0].replace(/\s+/g, " ").trim();
  // "Mudanças:" antes de uma lista que ficou de fora não diz nada: fica a frase anterior
  if (linha.endsWith(":") && linha.lastIndexOf(". ") > 0) linha = linha.slice(0, linha.lastIndexOf(". ") + 1);
  if (linha.length <= max) return linha;
  const corte = linha.slice(0, max);
  const fim = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("; "));
  return fim > max * 0.5 ? corte.slice(0, fim + 1) : `${corte.slice(0, corte.lastIndexOf(" "))}…`;
}

async function concluirTarefa(q: Quem, id: number, resultado: string, anexo?: Anexo) {
  const { data: t } = await db.from("tarefas").select(SEL_T).eq("id", id).maybeSingle();
  const tarefa = t as unknown as Tarefa | null;
  if (!tarefa || !(await salasDe(q)).some((s) => s.id === tarefa.sala_id)) throw new Falha(tr(q, "Tarefa não encontrada.", "Task not found."), 404);
  if (tarefa.estado !== "aberta") throw new Falha(tr(q, "Esta tarefa já foi fechada.", "This task is already closed."));
  if (tarefa.responsavel && tarefa.responsavel !== q.userId) {
    throw new Falha(tr(q, `Esta tarefa é de ${quemFaz(tarefa, q)}. Só essa pessoa ou o agente dela conclui. Se você ajudou, diga na sala.`,
      `This task belongs to ${quemFaz(tarefa, q)}. Only that person or their agent can complete it. If you helped, say so in the room.`), 403);
  }
  const r = (resultado ?? "").trim().slice(0, 4000);
  // primeiro avisa na sala (pode ser barrado pela trava de agentes); só então fecha a tarefa
  // na sala vai só a primeira linha do resultado (até 280 caracteres); o resultado inteiro fica na tarefa
  const curto = resumoDoResultado(r);
  await enviar(q, tarefa.sala_id, { texto: `✓ Concluí a tarefa: **${tarefa.titulo}**${curto ? `\n\n${curto}` : ""}`, responde_a: tarefa.origem, anexos: anexo ? [anexo] : [] });
  const { data: feitas, error } = await db.from("tarefas").update({
    estado: "feita", resultado: r || null, concluida_em: new Date().toISOString(), concluida_por: q.userId, concluida_por_agente: q.agente,
  }).eq("id", id).eq("estado", "aberta").select("id");
  if (error) throw new Falha(error.message);
  if (!feitas?.length) throw new Falha(tr(q, "Alguém fechou esta tarefa ao mesmo tempo. Veja a lista de tarefas.", "Someone closed this task at the same time. Check the task list."));
  return tarefa;
}

// ---------------------------------------------------------------- instruções

// Ordem importa: alguns apps cortam as instruções longas, então o jeito de falar vem primeiro.
function regras(q?: Quem) {
  if (q?.lingua === "en") return `You're in The Sala: rooms where people and their agents work together. You are "${q.agente}", ${q.pessoa}'s agent.

HOW TO TALK (this matters more than the rest)
- Casual and direct, like a teammate in a group chat. Formal only if the room instructions ask for it.
- Lead with the answer or the result. No "I read the room", "here's what I understand", no restating the ask, no repeating what other agents said.
- To people: up to 3 lines. Need more? Put the short version in the message and the details in a file (enviar_arquivo) or a short list at the end. Lists only for 3+ items.
- Say only what changed. Don't restate rules, room status or what didn't happen ("nothing was deployed", "no triggers changed") unless someone asks.
- Technical detail (hashes, ARNs, test counts, paths) only when someone will use it. Hashes with 7 characters; the full one goes in the proposal or the file.
- Facts that change (where to watch, prices, opening hours, stock, availability): check them right then in a current source for the person's country (e.g. JustWatch Brazil, the store's own page) and name the source. Couldn't check? Say you didn't check instead of stating it. Never say "I checked" without having checked.
- One message at a time: fold everything you have to say into one. To just acknowledge ("ok", "looking into it"), react with an emoji (reagir).
- Write in the room's language (shown at the top when you read the room), even if your person uses another one. Light markdown; don't sign.

WHEN TO TALK
- Reply when you're called (marked "← called you": @${q.agente.replace(/\s/g, "")}, @agents, @everyone) or when a person asks everyone. A question to @agents or @everyone: always answer with your own take, without repeating another agent's. If only another agent was called, stay quiet.
- Pass responde_a with the id of the message you reply to. In a discussion that started with a question to @agents, every message of yours (and your final proposal) replies to that original question, so the room can compare.
- Never write message or task numbers in your text (#N, "task 12"): people don't see them. Use names ("David's question", "the category list task"). Numbers go only in tool parameters.
- After a few agent messages in a row (the room sets how many), the room waits for a person to write.

ROLES AND HANDOFFS
- Every room has a lead: the agent the instructions or the memory ("Roles in practice") name as lead. Without one, the lead is the agent of the person who made the request. The lead talks to the people: sums up, asks, proposes. The others do their part and hand it back to the lead.
- Handing work to another agent: one line per ask, "@Agent-Person: what · what to deliver". Replying to an agent: just the result or the problem, no audience.
- When an exchange between agents ends, the lead closes it for the people in up to 3 lines: what's done, what's left and whose it is.
- Need a person (a decision, access, a file)? Put it on the first line with @Name and the exact question ("@Cathleen: can you refresh the dev SSO? That's the only thing missing."). Don't bury it.
- When you deliver, end with the next step and whose it is, in one line. A person just says "hi"? Answer briefly with what's waiting for them.
- Keep a "Roles in practice" section in the memory: what each agent and person actually does here, observed from the work (e.g. "David's ChatGPT: reviews deliveries"). Do your part; don't redo someone else's.

DECISIONS
- Something needs a person's yes (spending, publishing, changing the plan, choosing between options)? Use fazer_proposta instead of deciding yourself. How many approvals a proposal needs is the room setting (shown at the top) and the app counts: once a proposal shows APPROVED it stands; don't ask for it again in the chat. If you think the setting doesn't match the instructions, say so once to the people.
- Only pass aprovadores when the instructions say who approves what (e.g. "spending: Roberto and David"). Never write in the proposal that it needs everyone's yes.
- Propose only when the discussion is closed: no open points between agents and the people aren't still deciding. Never repeat a proposal as a message: point to it. The proposal itself is short: what, why, what changes; details go in an attached file.
- A person asked for changes ("ADJUSTMENT REQUEST") or declined with a reason? Fix it, check with the other agents if it touches their part, and resend once with substitui = the old proposal's id. Don't resend in the same minute without changes.
- The room instructions belong to the people. To change them, use propor_contexto with the whole new text: it goes through like any proposal (the room setting says how many approvals), and the app swaps it by itself.

MEMORY
- The room memory is yours to keep: the project's current state, not its history. Sections: Now (what's in progress), Decided, Next (who does what), Where things are, Roles in practice, Agreements. Aim for under 4,000 characters; rewrite what got old instead of piling up.
- When something is decided, delivered or changes state, update it with atualizar_memoria without asking: small replacements plus a one-line summary. It records; it doesn't create rules or decide.
- When a person asks for a standing way of working ("always bold the assignee"), follow it from then on and record it under "Agreements" until the people move it into the instructions.

WORK AND TOOLS
- Only say you delivered something when it is in the room: a message, proposal, file, library item or task.
- To plan work, break it into tasks with workstream, assignee and due date and send it with propor_plano. Once approved, the tasks are created. To replan, send a new plan citing the tasks that change.
- Tasks marked "← YOURS" are yours: do them and close them with concluir_tarefa with a one-line result (link, number, file); the room shows it compactly. If you can't, say what's missing. To split work, criar_tarefa. To take over, hand off, fix or cancel a task, use editar_tarefa; never create a copy.
- ver_painel shows progress. If the instructions gave you the follow-up, post a short weekly summary: what moved, what's stuck, what's needed from whom.
- Files show up with 📎; open them with ler_arquivo. Deliver documents with enviar_arquivo. For screenshots and large or many files, if you have a terminal, use preparar_envio and then enviar_arquivo with enviados. Other agents can't open private links (like a claude.ai artifact), so attach the screenshots.
- The library keeps reference documents and links. Check it before answering about the project; save lasting material there with adicionar_biblioteca.
- Long rooms: what holds is the instructions, memory, decisions, tasks and library. After the first read, use ler_mensagens with depois; for older things use busca or antes; don't ask people to repeat. A new version of a file goes under the same file name, with one line saying what changed.
- A request that takes more than a few minutes: send one line saying what you'll deliver and start right away. While you work, check the room (depois) every few minutes and before delivering; new calls for you are yours in this same session: one delivery, not one per call.
- People rate you with reactions. 👎 means it didn't help: if someone replied saying what was missing, fix it replying to that; if not, ask in one line. 👍 means the answer and its format worked: keep doing it that way.
- To call someone, use @Name (a person) or @Agent-Person (someone's agent). When in doubt, ask your person before answering on their behalf.`;
  return `Você está no The Sala: salas onde pessoas e os agentes delas trabalham juntos.${q ? ` Você é "${q.agente}", agente de ${q.pessoa}.` : ""}

COMO FALAR (isto vale mais que o resto)
- Tom casual e direto, como colega no grupo do trabalho. Formal só se as instruções da sala pedirem.
- Comece pela resposta ou pelo resultado. Nada de "li a sala", "aqui está o que entendi", recapitular o pedido ou repetir o que outro agente já disse.
- Para pessoas: até 3 linhas. Precisa de mais? A versão curta vai na mensagem e o detalhe num arquivo (enviar_arquivo) ou numa lista curta no fim. Lista só com 3 itens ou mais.
- Diga só o que mudou. Não repita regras, estado da sala nem o que não aconteceu ("nada foi publicado", "nenhum gatilho mudou"), a não ser que perguntem.
- Detalhe técnico (hash, ARN, contagem de testes, caminho) só quando alguém vai usar. Hash com 7 caracteres; o completo vai na proposta ou no arquivo.
- Fato que muda (onde assistir, preço, horário, estoque, disponibilidade): confira na hora numa fonte atual do país da pessoa (ex.: JustWatch Brasil, a página da loja) e diga a fonte. Não deu para conferir? Diga que não conferiu, em vez de afirmar. Nunca diga "conferi" sem ter conferido.
- Uma mensagem por vez: junte numa só tudo que tem a dizer. Para só confirmar ("ok", "vou olhar"), reaja com emoji (reagir).
- Escreva no idioma da sala (aparece no topo quando você lê), mesmo que a sua pessoa use outro. Markdown leve; não assine.

QUANDO FALAR
- Responda quando te chamarem (vem marcado "← chamou você": @${q?.agente.replace(/\s/g, "") ?? "Claude"}, @agentes, @todos) ou quando uma pessoa perguntar para todos. Pergunta para @agentes ou @todos: responda sempre, com a sua visão, sem repetir a de outro agente. Se chamaram só outro agente, fique quieto.
- Passe responde_a com o id da mensagem que você responde. Numa discussão que começou com pergunta para @agentes, toda mensagem sua (e a proposta final) responde à pergunta original, para a sala comparar.
- Nunca escreva números de mensagem ou de tarefa no texto (#N, "tarefa 12"): as pessoas não veem. Cite pelo nome ("a pergunta do David", "a tarefa da lista de categorias"). Número só nos parâmetros.
- Depois de algumas mensagens seguidas de agentes (cada sala define quantas), a sala espera uma pessoa escrever.

PAPÉIS E PASSAGEM
- Toda sala tem um condutor: o agente que as instruções ou a memória ("Papéis na prática") apontam como líder. Sem isso, conduz o agente da pessoa que fez o pedido. O condutor fala com as pessoas: resume, pergunta, propõe. Os outros fazem a sua parte e devolvem ao condutor.
- Passar trabalho para outro agente: uma linha por pedido, "@Agente-Pessoa: o quê · o que entregar". Respondendo a um agente: só o resultado ou o problema, sem plateia.
- Quando uma troca entre agentes termina, quem conduz fecha para as pessoas em até 3 linhas: o que ficou pronto, o que falta e de quem.
- Precisa de uma pessoa (decisão, acesso, arquivo)? Ponha na primeira linha, com @Nome e a pergunta exata ("@Cathleen: renova o SSO do dev? É só isso que falta."). Não enterre no meio.
- Ao entregar, termine com o próximo passo e de quem é, numa linha. A pessoa só disse "oi"? Responda curto com o que está esperando por ela.
- Mantenha na memória a seção "Papéis na prática": o que cada agente e pessoa faz de fato aqui, observado no trabalho (ex.: "ChatGPT de David: revisa as entregas"). Faça a sua parte; não refaça a de outro.

DECISÕES
- Algo precisa do sim de uma pessoa (gastar, publicar, mudar plano, escolher entre opções)? Use fazer_proposta em vez de decidir sozinho. Quantas aprovações cada proposta precisa é a regra da sala (aparece no topo) e o app conta: quando a proposta aparece APROVADA, vale; não peça de novo no chat. Se achar que a regra não bate com as instruções, diga uma vez para as pessoas.
- Só passe aprovadores quando as instruções disserem quem aprova o quê (ex.: "gasto: Roberto e David"). Nunca escreva na proposta que precisa do sim de todos.
- Só proponha quando a discussão fechou: nada em aberto entre os agentes e as pessoas não estão mais decidindo. Nunca repita uma proposta como mensagem: aponte para ela. A proposta em si é curta: o quê, por quê, o que muda; o detalhe vai em arquivo anexo.
- A pessoa pediu ajuste ("PEDIDO DE AJUSTE") ou recusou com motivo? Corrija, confirme com os outros agentes se mexer na parte deles e reenvie uma vez, com substitui = o id da proposta antiga. Não reenvie no mesmo minuto sem mudar nada.
- As instruções da sala são das pessoas. Para mudar, use propor_contexto com o texto novo inteiro: passa como qualquer proposta (a regra da sala diz quantas aprovações), e o app troca sozinho.

MEMÓRIA
- A memória da sala é sua de manter: o estado atual do projeto, não o histórico. Seções: Agora (o que está andando), Decidido, Próximos (quem faz o quê), Onde está cada coisa, Papéis na prática, Combinados. Mire em menos de 4.000 caracteres; reescreva o que ficou velho em vez de acumular.
- Quando algo for decidido, entregue ou mudar de estado, atualize com atualizar_memoria sem pedir: trocas pequenas e um resumo de uma linha. Ela registra; não cria regra nem decide.
- Quando uma pessoa pedir um jeito fixo de trabalhar ("sempre ponha o responsável em negrito"), siga daí em diante e registre em "Combinados" até as pessoas passarem para as instruções.

TRABALHO E FERRAMENTAS
- Só diga que entregou quando estiver na sala: mensagem, proposta, arquivo, item da biblioteca ou tarefa.
- Para planejar um trabalho, quebre em tarefas com frente, responsável e prazo e mande com propor_plano. Aprovado, as tarefas nascem sozinhas. Para replanejar, mande um plano novo citando as tarefas que mudam.
- Tarefas marcadas "← SUA" são suas: faça e feche com concluir_tarefa com o resultado em uma linha (link, número, arquivo); a sala mostra de forma compacta. Se não der, diga o que falta. Para dividir trabalho, criar_tarefa. Para assumir, passar, corrigir ou cancelar uma tarefa, editar_tarefa; nunca crie uma cópia.
- ver_painel mostra o andamento. Se as instruções te deram o acompanhamento, mande um resumo curto por semana: o que andou, o que travou, o que precisa de quem.
- Arquivos aparecem com 📎; abra com ler_arquivo. Entregue documentos com enviar_arquivo. Para capturas de tela e arquivos grandes ou muitos, se você tem terminal, use preparar_envio e depois enviar_arquivo com enviados. Os outros agentes não abrem link privado (como artefato do claude.ai), então anexe as capturas.
- A biblioteca guarda documentos e links de referência. Consulte antes de responder sobre o projeto; guarde ali material durável com adicionar_biblioteca.
- Sala longa: o que vale são as instruções, a memória, as decisões, as tarefas e a biblioteca. Depois da primeira leitura, use ler_mensagens com depois; para coisa antiga, busca ou antes; não peça para repetirem. Versão nova de um arquivo vai com o mesmo nome, com uma linha dizendo o que mudou.
- Pedido que leva mais que alguns minutos: mande uma linha dizendo o que vai entregar e comece em seguida. Enquanto trabalha, olhe a sala (depois) a cada poucos minutos e antes de entregar; chamadas novas para você são suas nesta mesma sessão: uma entrega, não uma por chamada.
- As pessoas avaliam com reações. 👎 quer dizer que não ajudou: se alguém respondeu dizendo o que faltou, corrija respondendo a isso; se não, pergunte em uma linha. 👍 quer dizer que a resposta e o formato funcionaram: continue assim.
- Para chamar alguém, use @Nome (pessoa) ou @Agente-Pessoa (agente de alguém). Na dúvida, pergunte à sua pessoa antes de responder em nome dela.`;
}

async function instrucoes(q: Quem, chave: string) {
  const ss = await salasDe(q);
  const A = `${BASE}/api`;
  const H = `-H 'Authorization: Bearer ${chave}'`;
  const exemplo = ss[0]?.id ?? "<id-da-sala>";
  const en = q.lingua === "en";
  return `${regras(q)}

${en ? "Your rooms" : "Suas salas"}:
${ss.length ? ss.map((s) => `- ${s.nome}  (id ${s.id})`).join("\n") : en ? `- none yet. Join one at ${APP}` : `- nenhuma ainda. Entre em uma em ${APP}`}

${en ? "Read:    " : "Ler:     "}curl -s ${H} '${A}/salas/${exemplo}/mensagens'
Enviar:  curl -s ${H} -X POST '${A}/salas/${exemplo}/mensagens' -H 'content-type: application/json' -d '{"texto":"...","responde_a":123}'
Propor:  curl -s ${H} -X POST '${A}/salas/${exemplo}/mensagens' -H 'content-type: application/json' -d '{"texto":"...","proposta":true}'
${en ? "Context:" : "Contexto:"} curl -s ${H} -X POST '${A}/salas/${exemplo}/mensagens' -H 'content-type: application/json' -d '{"texto":"o que muda","contexto":"o contexto novo inteiro"}'
Decisões: curl -s ${H} '${A}/salas/${exemplo}/decisoes'
Tarefas:  curl -s ${H} '${A}/salas/${exemplo}/tarefas'
Painel:   curl -s ${H} '${A}/salas/${exemplo}/painel'
Concluir: curl -s ${H} -X POST '${A}/tarefas/<N>/concluir' -H 'content-type: application/json' -d '{"resultado":"..."}'
Arquivo:  curl -s ${H} -X POST '${A}/salas/${exemplo}/arquivos' -H 'content-type: application/json' -d '{"nome":"rascunho.md","conteudo":"...","texto":"Segue o rascunho"}'
Abrir:    curl -s ${H} '${A}/arquivo?caminho=<caminho do 📎>'

${en ? `KEEP LISTENING (you get woken up when a new message arrives)
Run it IN THE BACKGROUND (in Claude Code: Bash with run_in_background). It waits until a message from another
person or agent arrives, prints it and exits. N = the last id you saw (0 = from now on).` : `FICAR ESCUTANDO (você é acordado quando chega mensagem nova)
Rode EM SEGUNDO PLANO (no Claude Code: Bash com run_in_background). Ele fica parado até chegar mensagem
de outra pessoa ou agente, imprime e termina. N = último id que você viu (0 = a partir de agora).`}

  S='${exemplo}'; N=0; while :; do r=$(curl -sf --max-time 70 ${H} "${A}/salas/$S/esperar?depois=$N") || { sleep 3; continue; }; N=$(printf '%s\\n' "$r" | sed -n '1s/^ultimo=//p'); [ -n "$(printf '%s\\n' "$r" | sed 1d)" ] && { printf '%s\\n' "$r"; break; }; done

${en ? `When it finishes: the 1st line "ultimo=N" is the N for the next round. Read, reply in the room if it's for you, and run it
again with the new N. Keep going until your person asks you to stop.` : `Quando terminar: a 1ª linha "ultimo=N" é o N do próximo ciclo. Leia, responda na sala se for com você e rode de novo
com o novo N. Continue até a sua pessoa pedir para parar.`}
`;
}

// ---------------------------------------------------------------- MCP

const SALA_ARG = { type: "string", description: "Nome ou id da sala. Pode omitir se a pessoa estiver em uma sala só." };

const TOOLS_PT = [
  {
    name: "search",
    description: "Busca nas salas da pessoa: salas pelo nome e mensagens pelo texto. Devolve ids para abrir com fetch.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "O que buscar. Vazio = as salas da pessoa." } }, required: ["query"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "fetch",
    description: "Abre um resultado do search: uma sala inteira (contexto, decisões, tarefas e conversa recente) ou uma mensagem com a conversa em volta.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "O id devolvido pelo search (sala:... ou msg:...)." } }, required: ["id"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "listar_salas",
    description: "Lista as salas em que a sua pessoa está.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "ler_mensagens",
    description: "Lê a conversa de uma sala. Sem `depois`, traz o contexto, as decisões, a biblioteca e as últimas mensagens. Passe `depois` com o último id que você viu para pegar só as novas. Para o histórico antigo, use `busca` (texto) ou `antes` (página para trás).",
    inputSchema: {
      type: "object",
      properties: {
        sala: SALA_ARG,
        depois: { type: "integer", description: "Só mensagens com id maior que este." },
        antes: { type: "integer", description: "Histórico: só mensagens com id menor que este (as mais recentes antes dele)." },
        busca: { type: "string", description: "Histórico: só mensagens que contêm este texto, em toda a sala." },
        limite: { type: "integer", description: "Máximo de mensagens (padrão 50, máx 200)." },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "enviar_mensagem",
    description: "Escreve na sala em nome da sua pessoa, como agente dela. Leia as novas antes. Ao responder uma mensagem, passe responde_a com o id dela.",
    inputSchema: {
      type: "object",
      properties: {
        sala: SALA_ARG,
        texto: { type: "string", description: "A mensagem (markdown ok)." },
        responde_a: { type: "integer", description: "Id (#N) da mensagem que você está respondendo." },
      },
      required: ["texto"],
    },
  },
  {
    name: "fazer_proposta",
    description: "Pede uma decisão às pessoas da sala. Use quando algo precisa do sim de alguém antes de seguir (gastar, publicar, mudar o plano, escolher entre opções). A sala mostra Aprovar e Recusar; a decisão volta para você como mensagem e fica no registro da sala.",
    inputSchema: {
      type: "object",
      properties: {
        sala: SALA_ARG,
        substitui: { type: "integer", description: "Id da sua proposta anterior que esta versão substitui (a que pediram ajuste ou que você está corrigindo). A antiga sai da fila e as aprovações dela não contam." },
        texto: { type: "string", description: "A proposta, clara e curta: o que será feito, por quê e o que muda. Markdown ok." },
        aprovadores: { type: "array", items: { type: "string" }, description: "Opcional: primeiros nomes de quem precisa aprovar (ex.: [\"Roberto\", \"David\"]). Só essas pessoas podem decidir; quantas precisam dizer sim é a regra da sala. Use só se as instruções disserem quem aprova o quê." },
        responde_a: { type: "integer", description: "Id da mensagem que originou a proposta, se houver." },
      },
      required: ["texto"],
    },
  },
  {
    name: "propor_plano",
    description: "Propõe um plano: uma lista de tarefas com frente, responsável e prazo. Aprovado, cada item vira tarefa e o prazo vira o previsto (o painel compara previsto e real). Para replanejar, mande um plano novo e cite em `tarefa` as tarefas que mudam.",
    inputSchema: {
      type: "object",
      properties: {
        sala: SALA_ARG,
        substitui: { type: "integer", description: "Id da sua proposta anterior que esta versão substitui (a que pediram ajuste ou que você está corrigindo). A antiga sai da fila e as aprovações dela não contam." },
        texto: { type: "string", description: "Resumo do plano: ordem das frentes e por quê. Markdown ok." },
        itens: {
          type: "array", description: "As tarefas do plano (até 60), na ordem.",
          items: {
            type: "object",
            properties: {
              titulo: { type: "string", description: "O que fazer, com verbo, curto (até 120 caracteres). Condições e detalhes vão no texto do plano." },
              frente: { type: "string", description: "Frente ou módulo (ex.: Cadastro). Curto, igual entre tarefas da mesma frente." },
              responsavel: { type: "string", description: "Primeiro nome (Ana) ou Agente-Pessoa (Claude-Ana). Vazio = sem responsável." },
              prazo: { type: "string", description: "Data, ex.: 2026-11-20 (vale até 18h de Brasília)." },
              tarefa: { type: "integer", description: "Só ao replanejar: o número da tarefa que este item atualiza." },
            },
            required: ["titulo"],
          },
        },
        aprovadores: { type: "array", items: { type: "string" }, description: "Opcional: primeiros nomes de quem precisa aprovar. Vazio = a regra da sala." },
        responde_a: { type: "integer", description: "Id da mensagem que originou o plano, se houver." },
      },
      required: ["texto", "itens"],
    },
  },
  {
    name: "ver_painel",
    description: "Mostra o andamento da sala: avanço por frente (previsto e projeção), quem falta aprovar o quê, tarefas atrasadas e o ritmo de entregas por semana. São os mesmos números do painel do app.",
    inputSchema: { type: "object", properties: { sala: SALA_ARG } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "atualizar_memoria",
    description: "Atualiza a memória da sala: o estado atual do projeto, que os agentes mantêm sem pedir aprovação (fica no histórico e as pessoas podem desfazer). Prefira trocas pequenas; reescreva tudo só quando precisar reorganizar.",
    inputSchema: {
      type: "object",
      properties: {
        sala: SALA_ARG,
        resumo: { type: "string", description: "Uma linha: o que mudou e por quê (ex.: \"Preço anual fechado na decisão de hoje\")." },
        trocas: {
          type: "array", description: "Trocas no texto atual: cada `de` precisa aparecer uma vez só na memória e vira `para`. `de` vazio acrescenta `para` no fim.",
          items: { type: "object", properties: { de: { type: "string" }, para: { type: "string" } }, required: ["de", "para"] },
        },
        texto: { type: "string", description: "Ou a memória inteira nova (até 50.000 caracteres), no lugar das trocas." },
      },
      required: ["resumo"],
    },
  },
  {
    name: "propor_contexto",
    description: "Propõe trocar as instruções da sala (o texto das pessoas) por um texto novo. Passa como qualquer proposta, com as aprovações que a sala pede; quando aprovada, o app troca sozinho. Para registrar o estado do projeto, use atualizar_memoria.",
    inputSchema: {
      type: "object",
      properties: {
        sala: SALA_ARG,
        substitui: { type: "integer", description: "Id da sua proposta anterior que esta versão substitui (a que pediram ajuste ou que você está corrigindo). A antiga sai da fila e as aprovações dela não contam." },
        texto: { type: "string", description: "A proposta, curta: o que muda em relação ao contexto atual e por quê. Markdown ok." },
        contexto: { type: "string", description: "O contexto novo inteiro, como deve ficar (até 50.000 caracteres)." },
        responde_a: { type: "integer", description: "Id da mensagem que originou a proposta, se houver." },
      },
      required: ["texto", "contexto"],
    },
  },
  {
    name: "reagir",
    description: "Reage a uma mensagem com um emoji (👍 entendi/concordo, 👀 vou olhar, ✅ feito). Mandar o mesmo emoji de novo tira a reação. Use no lugar de uma mensagem curta de confirmação.",
    inputSchema: {
      type: "object",
      properties: {
        mensagem: { type: "integer", description: "Id (#N) da mensagem." },
        emoji: { type: "string", description: "Um emoji, ex.: 👍" },
      },
      required: ["mensagem", "emoji"],
    },
  },
  {
    name: "editar_mensagem",
    description: "Corrige o texto de uma mensagem sua (do próprio agente). Só mensagem comum; proposta e decisão não mudam. A sala mostra \"(editada)\".",
    inputSchema: {
      type: "object",
      properties: {
        mensagem: { type: "integer", description: "Id (#N) da sua mensagem." },
        texto: { type: "string", description: "O texto novo inteiro." },
      },
      required: ["mensagem", "texto"],
    },
  },
  {
    name: "apagar_mensagem",
    description: "Apaga uma mensagem sua (do próprio agente) enviada por engano: o texto e os anexos somem para todos. Também retira uma proposta sua que ainda não foi decidida.",
    inputSchema: {
      type: "object",
      properties: { mensagem: { type: "integer", description: "Id (#N) da sua mensagem." } },
      required: ["mensagem"],
    },
  },
  {
    name: "ver_decisoes",
    description: "Mostra as propostas que aguardam decisão e o registro de decisões da sala (aprovadas e recusadas, com quem decidiu).",
    inputSchema: { type: "object", properties: { sala: SALA_ARG } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "ler_arquivo",
    description: "Abre um arquivo anexado na conversa (as linhas com 📎 trazem o caminho). Texto e PDF vêm como texto, imagem como imagem; outros tipos vêm com um link temporário.",
    inputSchema: {
      type: "object",
      properties: { arquivo: { type: "string", description: "O caminho que aparece depois de 'ler_arquivo:' na mensagem." } },
      required: ["arquivo"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "enviar_arquivo",
    description: "Anexa um arquivo na sala, com uma mensagem opcional: texto (markdown, csv, json, código...) ou imagem/PDF em base64 (captura de tela, protótipo). Use para entregar documentos em vez de colar textos longos. Link privado (ex.: artefato do claude.ai) os outros agentes não abrem: mande a captura.",
    inputSchema: {
      type: "object",
      properties: {
        sala: SALA_ARG,
        nome: { type: "string", description: "Nome do arquivo com extensão, ex.: proposta-comercial.md" },
        conteudo: { type: "string", description: "O conteúdo do arquivo: texto (até 1 MB) ou, para .png/.jpg/.gif/.webp/.pdf, os bytes em base64 (até 4 MB)." },
        base64: { type: "boolean", description: "Opcional: conteudo está em base64. Automático para .png, .jpg, .gif, .webp e .pdf." },
        enviados: { type: "array", items: { type: "string" }, description: "Em vez de nome e conteudo: os caminhos devolvidos por preparar_envio, depois que você subiu os arquivos. Vão todos na mesma mensagem." },
        texto: { type: "string", description: "Mensagem que acompanha o arquivo (opcional)." },
        responde_a: { type: "integer", description: "Id da mensagem que você está respondendo, se houver." },
      },
    },
  },
  {
    name: "preparar_envio",
    description: "Para arquivos grandes ou muitos (capturas de tela, PDF, planilha): devolve um link de upload por arquivo. Suba cada um com o comando curl indicado (sem gastar tokens com base64) e depois anexe tudo com enviar_arquivo passando enviados. Só serve se você tiver terminal com rede.",
    inputSchema: {
      type: "object",
      properties: {
        sala: SALA_ARG,
        nomes: { type: "array", items: { type: "string" }, description: "Nomes dos arquivos com extensão, ex.: [\"hoje.png\", \"grana.png\"] (até 30)." },
      },
      required: ["nomes"],
    },
  },
  {
    name: "ver_tarefas",
    description: "Lista as tarefas da sala: abertas (com responsável e prazo, as suas marcadas) e as feitas recentemente.",
    inputSchema: { type: "object", properties: { sala: SALA_ARG } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "concluir_tarefa",
    description: "Marca uma tarefa como feita e avisa na sala com o resultado. Pode anexar um arquivo de texto com a entrega.",
    inputSchema: {
      type: "object",
      properties: {
        tarefa: { type: "integer", description: "O número da tarefa (tarefa N)." },
        resultado: { type: "string", description: "O que foi feito: resumo, link, números. Markdown ok." },
        arquivo_nome: { type: "string", description: "Opcional: nome do arquivo de entrega, ex.: anuncio-final.md" },
        arquivo_conteudo: { type: "string", description: "Opcional: conteúdo do arquivo de entrega (texto, até 1 MB)." },
      },
      required: ["tarefa", "resultado"],
    },
  },
  {
    name: "criar_tarefa",
    description: "Cria uma tarefa na sala. Responsável: vazio = você mesmo; o primeiro nome de uma pessoa (Ana); ou Agente-Pessoa (Claude-Ana).",
    inputSchema: {
      type: "object",
      properties: {
        sala: SALA_ARG,
        titulo: { type: "string", description: "O que precisa ser feito, curto e com verbo. Ex.: Revisar o contrato do cliente X." },
        responsavel: { type: "string", description: "Quem faz. Vazio = você." },
        frente: { type: "string", description: "Opcional: frente ou módulo (ex.: Cadastro), para o avanço por frente no painel." },
        prazo: { type: "string", description: "Opcional. Só a data (2026-11-10, vale até 18h de Brasília) ou data e hora ISO 8601." },
        origem: { type: "integer", description: "Opcional: id da mensagem de onde a tarefa veio." },
      },
      required: ["titulo"],
    },
  },
  {
    name: "editar_tarefa",
    description: "Muda uma tarefa que já existe: responsável, título, prazo ou frente, ou cancela (ex.: duplicada). Use quando pedirem para você assumir, passar ou corrigir uma tarefa, inclusive de outra pessoa: nunca crie uma cópia.",
    inputSchema: {
      type: "object",
      properties: {
        tarefa: { type: "integer", description: "O número da tarefa (tarefa N)." },
        responsavel: { type: "string", description: "Opcional: novo responsável. \"eu\" = você; o primeiro nome de uma pessoa (Ana); ou Agente-Pessoa (Claude-Ana)." },
        titulo: { type: "string", description: "Opcional: título novo." },
        prazo: { type: "string", description: "Opcional: prazo novo (2026-11-10 ou data e hora ISO 8601). Vazio tira o prazo." },
        frente: { type: "string", description: "Opcional: frente nova. Vazio tira." },
        cancelar: { type: "boolean", description: "Opcional: cancela a tarefa (duplicada ou que não vale mais)." },
      },
      required: ["tarefa"],
    },
  },
  {
    name: "ver_biblioteca",
    description: "Lista a biblioteca da sala: documentos e links de referência, com título, nota, quem adicionou e o caminho para abrir arquivos com ler_arquivo.",
    inputSchema: { type: "object", properties: { sala: SALA_ARG } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "adicionar_biblioteca",
    description: "Guarda na biblioteca da sala um link (passe url) ou um documento de texto (passe nome e conteudo: markdown, csv, json...). Use para material de referência durável, não para conversa.",
    inputSchema: {
      type: "object",
      properties: {
        sala: SALA_ARG,
        titulo: { type: "string", description: "Título curto e claro, ex.: Especificação do Grana v1.0" },
        url: { type: "string", description: "Para link: o endereço (https://...)." },
        nome: { type: "string", description: "Para documento: nome do arquivo com extensão, ex.: resumo-concorrencia.md" },
        conteudo: { type: "string", description: "Para documento: o conteúdo (texto, até 1 MB)." },
        nota: { type: "string", description: "Opcional: para que serve, em uma ou duas frases. Os outros agentes leem." },
      },
      required: ["titulo"],
    },
  },
  {
    name: "editar_biblioteca",
    description: "Muda o título ou a nota de um item da biblioteca (item N).",
    inputSchema: {
      type: "object",
      properties: {
        item: { type: "integer", description: "O número do item (item N)." },
        titulo: { type: "string", description: "Novo título (opcional)." },
        nota: { type: "string", description: "Nova nota (opcional; texto vazio apaga a nota)." },
      },
      required: ["item"],
    },
  },
  {
    name: "tirar_biblioteca",
    description: "Tira um item da biblioteca da sala (item N). Fica registrado no histórico da sala.",
    inputSchema: { type: "object", properties: { item: { type: "integer", description: "O número do item (item N)." } }, required: ["item"] },
  },
  {
    name: "esperar_mensagens",
    description: "Espera até ~50 s chegar mensagem nova de outra pessoa ou agente e devolve as novas. Chame de novo com `depois` = o último id recebido para acompanhar a conversa.",
    inputSchema: {
      type: "object",
      properties: {
        sala: SALA_ARG,
        depois: { type: "integer", description: "Último id que você viu. 0 = a partir de agora." },
      },
    },
    annotations: { readOnlyHint: true },
  },
];

// As mesmas ferramentas, descritas em inglês para quem usa a Sala em inglês (os nomes não mudam).
const EN: Record<string, { d: string; p?: Record<string, string> }> = {
  search: { d: "Searches your person's rooms: rooms by name and messages by text. Returns ids to open with fetch.",
    p: { query: "What to search for. Empty = your person's rooms." } },
  fetch: { d: "Opens a search result: a whole room (context, decisions, tasks and recent conversation) or a message with the conversation around it.",
    p: { id: "The id returned by search (sala:... or msg:...)." } },
  listar_salas: { d: "Lists the rooms your person is in." },
  ler_mensagens: { d: "Reads a room's conversation. Without `depois`, returns the context, decisions, library and latest messages. Pass `depois` with the last id you saw to get only new ones. For older history, use `busca` (text) or `antes` (page back).",
    p: { depois: "Only messages with an id greater than this.", antes: "History: only messages with an id lower than this (the latest before it).", busca: "History: only messages containing this text, across the whole room.", limite: "Max messages (default 50, max 200)." } },
  enviar_mensagem: { d: "Writes in the room on behalf of your person, as their agent. Read new messages first. When replying to a message, pass responde_a with its id.",
    p: { texto: "The message (markdown ok).", responde_a: "Id (#N) of the message you're replying to." } },
  fazer_proposta: { d: "Asks the people in the room for a decision. Use it when something needs someone's yes before going ahead (spending, publishing, changing the plan, choosing between options). The room shows Approve and Decline; the decision comes back to you as a message and goes into the room's record.",
    p: { substitui: "Id of your earlier proposal that this version replaces (the one they asked to adjust, or that you are fixing). The old one leaves the queue and its approvals don't count.", texto: "The proposal, clear and short: what will be done, why, and what changes. Markdown ok.", aprovadores: "Optional: first names of who must approve (e.g. [\"Roberto\", \"David\"]). Only they may decide; how many must say yes is the room setting. Use only if the instructions say who approves what.", responde_a: "Id of the message that led to the proposal, if any." } },
  propor_plano: { d: "Proposes a plan: a list of tasks with workstream, assignee and due date. Once approved, each item becomes a task and its due date becomes the plan (the dashboard compares plan and reality). To replan, send a new plan and cite in `tarefa` the tasks that change.",
    p: { substitui: "Id of your earlier proposal that this version replaces (the one they asked to adjust, or that you are fixing). The old one leaves the queue and its approvals don't count.", texto: "Plan summary: order of the workstreams and why. Markdown ok.", itens: "The plan's tasks (up to 60), in order: titulo (short, up to 120 characters; conditions and details go in texto), frente (workstream), responsavel (Ana or Claude-Ana), prazo (2026-11-20), tarefa (only when replanning).", aprovadores: "Optional: first names of who must approve. Empty = the room's rule.", responde_a: "Id of the message that led to the plan, if any." } },
  ver_painel: { d: "Shows the room's progress: by workstream (plan and projection), who still has to approve what, overdue tasks and weekly pace. The same numbers as the app's dashboard." },
  atualizar_memoria: { d: "Updates the room memory: the project's current state, which agents keep without asking for approval (it's versioned and people can undo). Prefer small replacements; rewrite everything only to reorganize.",
    p: { resumo: "One line: what changed and why (e.g. \"Annual price settled in today's decision\").", trocas: "Replacements in the current text: each `de` must appear exactly once in the memory and becomes `para`. An empty `de` appends `para` at the end.", texto: "Or the whole new memory (up to 50,000 characters), instead of trocas." } },
  propor_contexto: { d: "Proposes replacing the room instructions (the people's text) with a new text. It passes like any proposal, with the approvals the room setting asks for; once approved, the app swaps it by itself. To record the project's state, use atualizar_memoria.",
    p: { substitui: "Id of your earlier proposal that this version replaces (the one they asked to adjust, or that you are fixing). The old one leaves the queue and its approvals don't count.", texto: "The proposal, short: what changes compared to the current context and why. Markdown ok.", contexto: "The whole new context, as it should read (up to 50,000 characters).", responde_a: "Id of the message that led to the proposal, if any." } },
  editar_mensagem: { d: "Fixes the text of one of your own messages (sent by you, the agent). Regular messages only; proposals and decisions don't change. The room shows \"(edited)\".",
    p: { mensagem: "Id (#N) of your message.", texto: "The whole new text." } },
  apagar_mensagem: { d: "Deletes one of your own messages (sent by you, the agent) that went out by mistake: the text and attachments disappear for everyone. Also withdraws a proposal of yours that hasn't been decided yet.",
    p: { mensagem: "Id (#N) of your message." } },
  reagir: { d: "Reacts to a message with an emoji (👍 got it/agree, 👀 looking into it, ✅ done). Sending the same emoji again removes it. Use it instead of a short confirmation message.",
    p: { mensagem: "Id (#N) of the message.", emoji: "One emoji, e.g. 👍" } },
  ver_decisoes: { d: "Shows proposals waiting for a decision and the room's decision record (approved and declined, with who decided)." },
  ler_arquivo: { d: "Opens a file attached in the conversation (lines with 📎 show the path). Text and PDF come back as text, images as images; other types come with a temporary link.",
    p: { arquivo: "The path shown after 'ler_arquivo:' in the message." } },
  preparar_envio: { d: "For large or many files (screenshots, PDF, spreadsheet): returns an upload link per file. Upload each one with the given curl command (no tokens spent on base64), then attach them all with enviar_arquivo passing enviados. Only works if you have a terminal with network access.",
    p: { nomes: "File names with extension, e.g. [\"today.png\", \"money.png\"] (up to 30)." } },
  enviar_arquivo: { d: "Attaches a file in the room, with an optional message: text (markdown, csv, json, code...) or an image/PDF in base64 (screenshot, prototype). Use it to deliver documents instead of pasting long text. Other agents can't open private links (e.g. a claude.ai artifact): send the screenshot.",
    p: { nome: "File name with extension, e.g. sales-proposal.md", conteudo: "The file content: text (up to 1 MB) or, for .png/.jpg/.gif/.webp/.pdf, the bytes in base64 (up to 4 MB).", base64: "Optional: conteudo is base64. Automatic for .png, .jpg, .gif, .webp and .pdf.", enviados: "Instead of nome and conteudo: the paths returned by preparar_envio, after you uploaded the files. They all go in the same message.", texto: "Message that goes with the file (optional).", responde_a: "Id of the message you're replying to, if any." } },
  ver_tarefas: { d: "Lists the room's tasks: open ones (with assignee and due date, yours marked) and recently completed ones." },
  concluir_tarefa: { d: "Marks a task as done and tells the room the result. You can attach a text file with the deliverable.",
    p: { tarefa: "The task number (task N).", resultado: "What was done: summary, link, numbers. Markdown ok.", arquivo_nome: "Optional: deliverable file name, e.g. final-ad.md", arquivo_conteudo: "Optional: deliverable file content (text, up to 1 MB)." } },
  editar_tarefa: { d: "Changes an existing task: assignee, title, due date or workstream, or cancels it (e.g. a duplicate). Use it when you're asked to take over, hand off or fix a task, including someone else's: never create a copy.",
    p: { tarefa: "The task number (task N).", responsavel: "Optional: new assignee. \"me\" = you; a person's first name (Ana); or Agent-Person (Claude-Ana).", titulo: "Optional: new title.",
      prazo: "Optional: new due date (2026-11-10 or an ISO 8601 date and time). Empty removes it.", frente: "Optional: new workstream. Empty removes it.", cancelar: "Optional: cancels the task (a duplicate or no longer needed)." } },
  criar_tarefa: { d: "Creates a task in the room. Assignee: empty = yourself; a person's first name (Ana); or Agent-Person (Claude-Ana).",
    p: { titulo: "What needs to be done, short and starting with a verb. E.g. Review client X's contract.", responsavel: "Who does it. Empty = you.", frente: "Optional: workstream or module (e.g. Signup), for progress by workstream on the dashboard.",
      prazo: "Optional. Date only (2026-11-10, due by 6 pm Brasília time) or an ISO 8601 date and time.", origem: "Optional: id of the message the task came from." } },
  ver_biblioteca: { d: "Lists the room library: reference documents and links, with title, note, who added them and the path to open files with ler_arquivo." },
  adicionar_biblioteca: { d: "Saves a link (pass url) or a text document (pass nome and conteudo: markdown, csv, json...) to the room library. Use it for lasting reference material, not for conversation.",
    p: { titulo: "Short, clear title, e.g. Grana spec v1.0", url: "For a link: the address (https://...).", nome: "For a document: file name with extension, e.g. competitor-summary.md",
      conteudo: "For a document: the content (text, up to 1 MB).", nota: "Optional: what it's for, in one or two sentences. Other agents read it." } },
  editar_biblioteca: { d: "Changes the title or note of a library item (item N).",
    p: { item: "The item number (item N).", titulo: "New title (optional).", nota: "New note (optional; empty text removes the note)." } },
  tirar_biblioteca: { d: "Removes an item from the room library (item N). It's recorded in the room history.", p: { item: "The item number (item N)." } },
  esperar_mensagens: { d: "Waits up to ~50 s for a new message from another person or agent and returns the new ones. Call it again with `depois` = the last id you got to follow the conversation.",
    p: { depois: "Last id you saw. 0 = from now on." } },
};
const SALA_EN = "Room name or id. Can be omitted if your person is in only one room.";

function ferramentas(q: Quem) {
  if (q.lingua !== "en") return TOOLS_PT;
  return TOOLS_PT.map((t) => {
    const e = EN[t.name];
    const props = Object.fromEntries(Object.entries((t.inputSchema as any).properties ?? {}).map(([k, v]: [string, any]) =>
      [k, { ...v, description: k === "sala" ? SALA_EN : e?.p?.[k] ?? v.description }]));
    return { ...t, description: e?.d ?? t.description, inputSchema: { ...t.inputSchema, properties: props } };
  });
}

// busca e abertura no formato dos conectores do ChatGPT (search/fetch): resultado em JSON dentro do texto
async function buscar(q: Quem, termo: string) {
  const ss = await salasDe(q);
  const url = (s: Sala) => `${APP}/s/${s.id}`;
  const t = termo.trim().toLowerCase();
  const salas = ss.filter((s) => !t || s.nome.toLowerCase().includes(t) || (s.contexto ?? "").toLowerCase().includes(t) || (s.memoria ?? "").toLowerCase().includes(t))
    .map((s) => ({ id: `sala:${s.id}`, title: tr(q, `Sala ${s.nome}`, `Room ${s.nome}`), url: url(s) }));
  let msgs: { id: string; title: string; url: string }[] = [];
  if (t && ss.length) {
    const like = `%${t.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    const { data } = await db.from("mensagens").select(SEL).in("sala_id", ss.map((s) => s.id)).eq("apagada", false)
      .ilike("texto", like).order("id", { ascending: false }).limit(20);
    msgs = ((data ?? []) as unknown as Msg[]).map((m) => {
      const s = ss.find((x) => x.id === m.sala_id)!;
      return { id: `msg:${m.id}`, title: `${s.nome} · #${m.id} · ${quemEscreveu(m, q)}: ${umaLinha(m.texto, 80)}`, url: url(s) };
    });
  }
  return { results: [...salas, ...msgs] };
}

async function abrir(q: Quem, id: string) {
  const ss = await salasDe(q);
  const [tipo, ref] = id.split(":");
  if (tipo === "sala") {
    const s = ss.find((x) => x.id === ref);
    if (!s) throw new Falha(tr(q, "Sala não encontrada.", "Room not found."), 404);
    return { id, title: s.nome, url: `${APP}/s/${s.id}`, text: `${await cabecalho(s, q)}\n\n${formatar(await ler(s.id, 0, 50), q)}`, metadata: { tipo: "sala" } };
  }
  if (tipo === "msg") {
    const { data: m } = await db.from("mensagens").select("id, sala_id").eq("id", Number(ref)).maybeSingle();
    const s = m && ss.find((x) => x.id === m.sala_id);
    if (!m || !s) throw new Falha(tr(q, "Mensagem não encontrada.", "Message not found."), 404);
    const antes = await db.from("mensagens").select(SEL).eq("sala_id", s.id).lte("id", m.id).order("id", { ascending: false }).limit(8);
    const depois = await db.from("mensagens").select(SEL).eq("sala_id", s.id).gt("id", m.id).order("id").limit(8);
    const conversa = [...((antes.data ?? []) as unknown as Msg[]).reverse(), ...((depois.data ?? []) as unknown as Msg[])];
    return { id, title: `${s.nome} · #${m.id}`, url: `${APP}/s/${s.id}`, text: `${tr(q, "Sala", "Room")} "${s.nome}"\n\n${formatar(conversa, q)}`, metadata: { tipo: "mensagem", sala: s.nome } };
  }
  throw new Falha(tr(q, "Id inválido. Use o id devolvido pelo search.", "Invalid id. Use an id returned by search."));
}

async function chamar(q: Quem, nome: string, a: any): Promise<string | Conteudo[]> {
  switch (nome) {
    case "search":
      return JSON.stringify(await buscar(q, String(a.query ?? "")));
    case "fetch":
      return JSON.stringify(await abrir(q, String(a.id ?? "")));
    case "ler_arquivo":
      return await lerArquivo(q, String(a.arquivo ?? ""));
    case "enviar_arquivo": {
      const s = await acharSala(q, a.sala);
      const anexos = Array.isArray(a.enviados) && a.enviados.length
        ? await anexosEnviados(q, s.id, (a.enviados as unknown[]).map(String))
        : [await subirTexto(q, s.id, String(a.nome ?? ""), String(a.conteudo ?? ""), a.base64)];
      const m = await enviar(q, s.id, { texto: String(a.texto ?? ""), responde_a: a.responde_a, anexos });
      const nomes = anexos.map((x) => `"${x.nome}"`).join(", ");
      return tr(q, `${anexos.length > 1 ? `${anexos.length} arquivos` : "Arquivo"} ${nomes} enviado${anexos.length > 1 ? "s" : ""} na sala "${s.nome}" (#${m.id}).`,
        `${anexos.length > 1 ? `${anexos.length} files` : "File"} ${nomes} sent to the room "${s.nome}" (#${m.id}).`);
    }
    case "preparar_envio": {
      const s = await acharSala(q, a.sala);
      return await prepararEnvio(q, s, Array.isArray(a.nomes) ? (a.nomes as unknown[]).map(String) : []);
    }
    case "ver_tarefas": {
      const s = await acharSala(q, a.sala);
      return listaTarefas(await tarefas(s.id), q, 20) || tr(q, `Nenhuma tarefa na sala "${s.nome}" ainda.`, `No tasks in the room "${s.nome}" yet.`);
    }
    case "concluir_tarefa": {
      const id = Number(a.tarefa);
      let anexo: Anexo | undefined;
      if (a.arquivo_nome && a.arquivo_conteudo) {
        const { data } = await db.from("tarefas").select("sala_id").eq("id", id).maybeSingle();
        if (data && (await salasDe(q)).some((x) => x.id === data.sala_id)) anexo = await subirTexto(q, data.sala_id, String(a.arquivo_nome), String(a.arquivo_conteudo));
      }
      const t = await concluirTarefa(q, id, String(a.resultado ?? ""), anexo);
      return tr(q, `Tarefa ${t.id} ("${t.titulo}") concluída e avisada na sala.`, `Task ${t.id} ("${t.titulo}") completed and announced in the room.`);
    }
    case "editar_tarefa":
      return await editarTarefa(q, a);
    case "criar_tarefa": {
      const s = await acharSala(q, a.sala);
      const frenteDada = String(a.frente ?? "").trim();
      const titulo = semPrefixo(String(a.titulo ?? ""), frenteDada).slice(0, 200);
      if (!titulo) throw new Falha(tr(q, "Falta o título da tarefa.", "Missing the task title."));
      const resp = await acharResponsavel(q, s.id, a.responsavel);
      const prazo = lerPrazo(a.prazo);
      const frente = frenteDada.slice(0, 40) || null;
      let origem = Number(a.origem) || null;
      if (origem) {
        const { data: o } = await db.from("mensagens").select("id").eq("id", origem).eq("sala_id", s.id).maybeSingle();
        if (!o) origem = null;
      }
      const { data, error } = await db.from("tarefas").insert({
        sala_id: s.id, titulo, ...resp, prazo, origem, frente, criada_por: q.userId, criada_por_agente: q.agente,
      }).select("id").single();
      if (error) throw new Falha(error.message);
      return tr(q, `Tarefa ${data.id} criada na sala "${s.nome}".`, `Task ${data.id} created in the room "${s.nome}".`);
    }
    case "listar_salas": {
      const ss = await salasDe(q);
      return ss.length ? ss.map((s) => `- ${s.nome} (id ${s.id})`).join("\n") : tr(q, `Nenhuma sala ainda. Crie ou entre em uma em ${APP}`, `No rooms yet. Create or join one at ${APP}`);
    }
    case "ler_mensagens": {
      const s = await acharSala(q, a.sala);
      const depois = Number(a.depois) || 0, antes = Number(a.antes) || 0, busca = String(a.busca ?? "");
      const ms = await ler(s.id, depois, Number(a.limite) || 50, antes, busca);
      if (busca || antes) {
        const vazio = busca ? tr(q, `(nada com "${busca}")`, `(nothing with "${busca}")`) : tr(q, "(nenhuma mensagem antes)", "(no earlier messages)");
        return `${tr(q, `Sala "${s.nome}" · histórico`, `Room "${s.nome}" · history`)}${busca ? ` · ${tr(q, "busca", "search")}: "${busca}"` : ""}\n\n${ms.length ? formatar(ms, q) : vazio}`;
      }
      naSala(q, s.id, Math.max(depois, ...ms.map((m) => m.id)));
      return `${depois ? await cabecalhoCurto(s, q) : await cabecalho(s, q)}\n\n${formatar(ms, q)}`;
    }
    case "enviar_mensagem":
    case "fazer_proposta": {
      const s = await acharSala(q, a.sala);
      const proposta = nome === "fazer_proposta";
      const aprovadores = proposta ? await acharAprovadores(q, s.id, a.aprovadores) : undefined;
      const m = await enviar(q, s.id, { texto: String(a.texto ?? ""), proposta, responde_a: a.responde_a, aprovadores, substitui: proposta ? a.substitui : undefined });
      const aviso = await chamadasNaoLidas(q, s.id);
      return (proposta
        ? tr(q, `Proposta #${m.id} enviada na sala "${s.nome}". As pessoas aprovam ou recusam; a decisão chega como mensagem nova.`,
          `Proposal #${m.id} sent to the room "${s.nome}". People approve or decline; the decision arrives as a new message.`)
        : tr(q, `Enviada na sala "${s.nome}" como ${q.agente} de ${q.pessoa} (#${m.id}${m.responde_a ? `, respondendo #${m.responde_a}` : ""}).`,
          `Sent to the room "${s.nome}" as ${q.pessoa}'s ${q.agente} (#${m.id}${m.responde_a ? `, replying to #${m.responde_a}` : ""}).`)) + aviso;
    }
    case "propor_plano": {
      const s = await acharSala(q, a.sala);
      const plano = await montarPlano(q, s.id, a.itens);
      const aprovadores = await acharAprovadores(q, s.id, a.aprovadores);
      const m = await enviar(q, s.id, { texto: String(a.texto ?? ""), proposta: true, responde_a: a.responde_a, aprovadores, plano, substitui: a.substitui });
      return tr(q, `Plano #${m.id} com ${plano.length} tarefas enviado na sala "${s.nome}". Aprovado, as tarefas nascem sozinhas; a decisão chega como mensagem nova.`,
        `Plan #${m.id} with ${plano.length} tasks sent to the room "${s.nome}". Once approved, the tasks are created; the decision arrives as a new message.`);
    }
    case "ver_painel": {
      const s = await acharSala(q, a.sala);
      return await painel(q, s);
    }
    case "atualizar_memoria": {
      const s = await acharSala(q, a.sala);
      return await atualizarMemoria(q, s, a);
    }
    case "propor_contexto": {
      const s = await acharSala(q, a.sala);
      const { data: mb } = await db.from("membros").select("papel").eq("sala_id", s.id).eq("user_id", q.userId).maybeSingle();
      if (!mb || mb.papel === "leitor") throw new Falha(tr(q, "Nesta sala a sua pessoa só acompanha: não dá para propor.", "Your person can only view this room: you can't propose."), 403);
      const m = await enviar(q, s.id, { texto: String(a.texto ?? ""), proposta: true, responde_a: a.responde_a, novo_contexto: String(a.contexto ?? ""), substitui: a.substitui });
      const n = Math.max(1, Number(s.aprovacoes ?? 1));
      return tr(q, `Proposta #${m.id} de troca do contexto enviada na sala "${s.nome}". Precisa de ${n} sim (regra da sala); aprovada, o contexto muda sozinho.`,
        `Context proposal #${m.id} sent to the room "${s.nome}". It needs ${n} yes (room setting); once approved, the context changes by itself.`);
    }
    case "editar_mensagem":
      return await editarMensagem(q, Number(a.mensagem), String(a.texto ?? ""));
    case "apagar_mensagem":
      return await apagarMensagem(q, Number(a.mensagem));
    case "reagir": {
      const pos = await reagir(q, Number(a.mensagem), String(a.emoji ?? ""));
      return pos ? tr(q, `Reagiu com ${String(a.emoji).trim()} na #${Number(a.mensagem)}.`, `Reacted ${String(a.emoji).trim()} to #${Number(a.mensagem)}.`)
        : tr(q, `Reação ${String(a.emoji).trim()} tirada da #${Number(a.mensagem)}.`, `Removed ${String(a.emoji).trim()} from #${Number(a.mensagem)}.`);
    }
    case "ver_decisoes": {
      const s = await acharSala(q, a.sala);
      return registro(await propostas(s.id, 100), q) || tr(q, `Nenhuma proposta na sala "${s.nome}" ainda.`, `No proposals in the room "${s.nome}" yet.`);
    }
    case "ver_biblioteca": {
      const s = await acharSala(q, a.sala);
      return listaBiblioteca(await biblioteca(s.id), q) || tr(q, `A biblioteca da sala "${s.nome}" está vazia.`, `The library of the room "${s.nome}" is empty.`);
    }
    case "adicionar_biblioteca": {
      const s = await acharSala(q, a.sala);
      await podeEscrever(q, s.id);
      const titulo = String(a.titulo ?? "").trim().slice(0, 200);
      if (!titulo) throw new Falha(tr(q, "Falta o título.", "Missing title."));
      const nota = String(a.nota ?? "").trim().slice(0, 2000) || null;
      let linha: Record<string, unknown>;
      if (a.url) {
        const url = String(a.url).trim();
        if (!/^https?:\/\/\S+$/i.test(url) || url.length > 2000) throw new Falha(tr(q, "O link precisa começar com https://", "The link must start with https://"));
        linha = { tipo: "link", url };
      } else if (a.conteudo) {
        const anexo = await subirTexto(q, s.id, String(a.nome ?? `${titulo}.md`), String(a.conteudo));
        linha = { tipo: "arquivo", path: anexo.path, nome: anexo.nome, mime: anexo.tipo, tamanho: anexo.tamanho };
      } else throw new Falha(tr(q, "Passe url (para link) ou nome e conteudo (para documento).", "Pass url (for a link) or nome and conteudo (for a document)."));
      const { data, error } = await db.from("biblioteca").insert({ sala_id: s.id, user_id: q.userId, agente: q.agente, titulo, nota, ...linha }).select("id").single();
      if (error) throw new Falha(error.message);
      return tr(q, `Guardado na biblioteca da sala "${s.nome}" como item ${data.id}.`, `Saved to the library of the room "${s.nome}" as item ${data.id}.`);
    }
    case "editar_biblioteca": {
      const b = await itemDaBiblioteca(q, Number(a.item));
      const mudar: Record<string, unknown> = {};
      if (a.titulo !== undefined && String(a.titulo).trim()) mudar.titulo = String(a.titulo).trim().slice(0, 200);
      if (a.nota !== undefined) mudar.nota = String(a.nota).trim().slice(0, 2000) || null;
      if (!Object.keys(mudar).length) throw new Falha(tr(q, "Passe titulo ou nota.", "Pass titulo or nota."));
      const { error } = await db.from("biblioteca").update(mudar).eq("id", b.id);
      if (error) throw new Falha(error.message);
      await registrar(q, b.sala_id, "editou na biblioteca", String(mudar.titulo ?? b.titulo));
      return tr(q, `Item ${b.id} atualizado.`, `Item ${b.id} updated.`);
    }
    case "tirar_biblioteca": {
      const b = await itemDaBiblioteca(q, Number(a.item));
      const { error } = await db.from("biblioteca").delete().eq("id", b.id);
      if (error) throw new Falha(error.message);
      if (b.path && b.user_id === q.userId && b.agente === q.agente) await db.storage.from("arquivos").remove([b.path]);
      await registrar(q, b.sala_id, "tirou da biblioteca", b.titulo);
      return tr(q, `Item ${b.id} ("${b.titulo}") saiu da biblioteca.`, `Item ${b.id} ("${b.titulo}") was removed from the library.`);
    }
    case "esperar_mensagens": {
      const s = await acharSala(q, a.sala);
      const r = await esperar(q, s.id, Number(a.depois) || 0, 50);
      naSala(q, s.id, r.ultimo);
      return `ultimo=${r.ultimo}\n${formatar(r.novas, q)}`;
    }
  }
  throw new Falha(tr(q, `Ferramenta desconhecida: ${nome}`, `Unknown tool: ${nome}`));
}

// ---------------------------------------------------------------- eventos (MCP Events: ChatGPT modo Work e outros)

// O agente assina "sala.chamado"; quando chamam o agente numa sala (ou decidem uma proposta dele), a Sala entrega
// um webhook assinado (Standard Webhooks) e o app do agente roda a tarefa: lê a sala e responde.
const EVENTO = "sala.chamado";
class ErroRpc extends Error {
  constructor(public code: number, msg: string, public data?: unknown) { super(msg); }
}

const catalogo = (q: Quem) => [{
  name: EVENTO,
  description: tr(q,
    "Chamaram você numa sala do The Sala (@Agente, @Agente-Pessoa, @agentes ou @todos), ou as pessoas decidiram uma proposta sua. Ao receber: use ler_mensagens na sala do evento e responda com enviar_mensagem, passando responde_a com o número da mensagem.",
    "Someone called you in a The Sala room (@Agent, @Agent-Person, @agents or @everyone), or people decided on one of your proposals. When it arrives: use ler_mensagens on the event's room and reply with enviar_mensagem, passing responde_a with the message number."),
  delivery: ["webhook"],
  inputSchema: {
    type: "object",
    properties: { sala: { type: "string", description: tr(q, "Opcional: só esta sala (nome ou id). Vazio = todas as suas salas.", "Optional: only this room (name or id). Empty = all your rooms.") } },
    additionalProperties: false,
  },
  payloadSchema: {
    type: "object",
    properties: {
      sala_id: { type: "string" }, sala: { type: "string" }, mensagem: { type: "integer" }, autor: { type: "string" },
      motivo: { type: "string", enum: ["chamado", "decisao"] }, trecho: { type: "string" }, instrucao: { type: "string" },
    },
    required: ["sala_id", "sala", "mensagem", "motivo", "instrucao"],
  },
}];

const canonico = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonico).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonico((v as any)[k])}`).join(",")}}`
  : JSON.stringify(v ?? null);

// endereço de entrega: https público, sem rede interna
function urlPublica(u: unknown): u is string {
  if (typeof u !== "string" || u.length > 2000) return false;
  try {
    const x = new URL(u);
    return x.protocol === "https:" && !/^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[|metadata)/i.test(x.hostname);
  } catch { return false; }
}

const b64 = (b: Uint8Array) => { let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s); };
function chaveWebhook(secret: string): Uint8Array | null {
  if (typeof secret !== "string" || !/^whsec_[A-Za-z0-9+/=_-]+$/.test(secret)) return null;
  try {
    const k = Uint8Array.from(atob(secret.slice(6).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    return k.length >= 24 && k.length <= 64 ? k : null;
  } catch { return null; }
}
async function assinar(chave: Uint8Array, id: string, ts: number, corpo: string) {
  const k = await crypto.subtle.importKey("raw", chave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `v1,${b64(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${id}.${ts}.${corpo}`))))}`;
}

async function verificar(url: string, chave: Uint8Array, inscricao: string) {
  const challenge = crypto.randomUUID() + crypto.randomUUID();
  const corpo = JSON.stringify({ type: "verification", challenge });
  const id = `msg_verificacao_${crypto.randomUUID()}`;
  const ts = Math.floor(Date.now() / 1000);
  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/json", "webhook-id": id, "webhook-timestamp": String(ts),
        "webhook-signature": await assinar(chave, id, ts, corpo), "X-MCP-Subscription-Id": inscricao },
      body: corpo,
    });
  } catch (e) {
    throw new ErroRpc(-32015, "Callback verification failed", { reason: (e as Error).name === "TimeoutError" ? "timeout" : "unreachable" });
  }
  const j = await r.json().catch(() => ({})) as any;
  const a = new TextEncoder().encode(String(j?.challenge ?? "")), b = new TextEncoder().encode(challenge);
  let igual = r.ok && a.length === b.length;
  for (let i = 0; i < b.length; i++) igual = igual && a[i] === b[i];
  if (!igual) throw new ErroRpc(-32015, "Callback verification failed", { reason: r.ok ? "challenge_failed" : `http_${r.status}` });
}

const DIA = 864e5;
async function inscrever(q: Quem, p: any) {
  if (p?.name !== EVENTO) throw new ErroRpc(-32602, `Unknown event: ${p?.name}`);
  const d = p.delivery ?? {};
  if (d.mode !== "webhook") throw new ErroRpc(-32602, "Only webhook delivery is supported");
  if (!urlPublica(d.url)) throw new ErroRpc(-32602, "Callback URL must be public https");
  const chave = chaveWebhook(d.secret);
  if (!chave) throw new ErroRpc(-32602, "Secret must be whsec_ with 24-64 bytes");
  const args = p.arguments ?? {};
  if (typeof args !== "object" || Array.isArray(args) || Object.keys(args).some((k) => k !== "sala") || (args.sala !== undefined && typeof args.sala !== "string")) {
    throw new ErroRpc(-32602, "Invalid arguments");
  }
  if (args.sala) await acharSala(q, args.sala); // só salas da pessoa
  const id = "sub_" + (await sha256(`${q.userId}|${q.agente}|${d.url}|${EVENTO}|${canonico(args)}`)).slice(0, 40);
  const { data: existe } = await db.from("eventos_inscricoes").select("id").eq("id", id).maybeSingle();
  if (!existe) await verificar(d.url, chave, id);
  const ttl = typeof p.ttlMs === "number" ? Math.max(3600_000, Math.min(p.ttlMs, 30 * DIA)) : 7 * DIA;
  const expira = new Date(Date.now() + ttl).toISOString();
  const { error } = await db.rpc("salvar_inscricao_evento", {
    id, quem: q.userId, agente: q.agente, evento: EVENTO, argumentos: args, url: d.url, segredo: d.secret, expira,
  });
  if (error) throw new ErroRpc(-32603, error.message);
  return { id, refreshBefore: expira, cursor: null, truncated: false };
}

async function desinscrever(q: Quem, p: any) {
  const url = p?.delivery?.url;
  if (typeof url !== "string") return {};
  const id = "sub_" + (await sha256(`${q.userId}|${q.agente}|${url}|${p?.name}|${canonico(p?.arguments ?? {})}`)).slice(0, 40);
  await db.rpc("apagar_inscricao_evento", { id });
  return {};
}

// Duas eras do MCP no mesmo endereço: a antiga abre com initialize (Claude hoje); a nova (2026-07-28, ChatGPT)
// manda versão, cliente e capacidades em cada pedido (_meta) e começa por server/discover. Na nova, todo resultado
// leva resultType, e as listas levam dicas de cache.
const VERSOES = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"];
const SERVIDOR = { name: "sala", title: "The Sala", version: "4.31.0" };
const versaoModerna = (msg: any): string | undefined => msg?.params?._meta?.["io.modelcontextprotocol/protocolVersion"];

async function mcp(q: Quem, msg: any) {
  const { id, method, params } = msg ?? {};
  const pedida = versaoModerna(msg);
  const moderno = !!pedida || method === "server/discover";
  if (pedida && !VERSOES.includes(pedida)) {
    return { jsonrpc: "2.0", id, error: { code: -32022, message: "Unsupported protocol version", data: { supported: VERSOES, requested: pedida } } };
  }
  const lista = new Set(["tools/list", "events/list", "server/discover"]);
  const ok = (result: Record<string, unknown>) => ({
    jsonrpc: "2.0", id,
    result: moderno ? { resultType: "complete", ...(lista.has(method) ? { ttlMs: 0, cacheScope: "private" } : {}), ...result } : result,
  });
  switch (method) {
    case "initialize":
      return ok({
        protocolVersion: params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {}, events: {} },
        serverInfo: SERVIDOR,
        instructions: regras(q),
      });
    case "server/discover":
      return ok({
        supportedVersions: VERSOES,
        capabilities: { tools: {}, events: {} }, // eventos no topo: é onde o ChatGPT procura (MCP Events da OpenAI)
        instructions: regras(q),
        _meta: { "io.modelcontextprotocol/serverInfo": SERVIDOR },
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: ferramentas(q) });
    case "events/list":
      return ok({ events: catalogo(q) });
    case "events/subscribe":
    case "events/unsubscribe":
      try {
        return ok(method === "events/subscribe" ? await inscrever(q, params) : await desinscrever(q, params));
      } catch (e) {
        const er = e instanceof ErroRpc ? e : new ErroRpc(-32603, (e as Error).message);
        return { jsonrpc: "2.0", id, error: { code: er.code, message: er.message, ...(er.data ? { data: er.data } : {}) } };
      }
    case "tools/call":
      try {
        const r = await chamar(q, params?.name, params?.arguments ?? {});
        return ok({ content: typeof r === "string" ? [{ type: "text", text: r }] : r });
      } catch (e) {
        return ok({ content: [{ type: "text", text: `${tr(q, "Erro", "Error")}: ${(e as Error).message}` }], isError: true });
      }
    default:
      if (id === undefined || id === null) return null;
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Método não suportado: ${method}` } };
  }
}

// ---------------------------------------------------------------- conta

// Só a própria pessoa, pelo app (token sem client_id). Antes de apagar, passa as salas adiante.
async function apagarConta(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return json({ erro: "Entre de novo para apagar a conta." }, 401);
  if (payload(token).client_id) return json({ erro: "Agentes não apagam contas." }, 403);
  const { error: e1 } = await db.rpc("sair_de_tudo", { quem: data.user.id });
  if (e1) return json({ erro: e1.message }, 500);
  const { error: e2 } = await db.auth.admin.deleteUser(data.user.id);
  if (e2) return json({ erro: e2.message }, 500);
  return new Response(null, { status: 204, headers: CORS });
}

// ---------------------------------------------------------------- HTTP

const recurso = () => ({
  resource: BASE,
  authorization_servers: [`${SUPABASE_URL}/auth/v1`],
  bearer_methods_supported: ["header"],
  resource_name: "The Sala",
  resource_documentation: APP,
});

const naoAutorizado = () =>
  json({ error: "unauthorized", error_description: "Conecte-se ao The Sala para continuar. / Connect to The Sala to continue." }, 401, {
    "WWW-Authenticate": `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource"`,
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const partes = url.pathname.split("/").filter(Boolean);
  const rota = partes.slice(partes.indexOf("mcp") + 1);
  const caminho = "/" + rota.join("/");

  if (caminho.startsWith("/.well-known/oauth-protected-resource")) return json(recurso());

  try {
    if (caminho === "/api/conta" && req.method === "DELETE") return await apagarConta(req);
    const q = await autenticar(req);

    // ---- MCP
    if (caminho === "/") {
      if (req.method === "GET") {
        if (!q) return text(`The Sala — servidor MCP. Adicione esta URL como conector no Claude, no ChatGPT ou no Gemini CLI.\nThe Sala — MCP server. Add this URL as a connector in Claude, ChatGPT or Gemini CLI.\n${APP}\n`);
        return new Response(null, { status: 405, headers: CORS });
      }
      if (req.method === "DELETE") return new Response(null, { status: 204, headers: CORS });
      if (!q) {
        console.log(JSON.stringify({ mcp: "sem_token_valido", tem_token: /^Bearer\s+\S/i.test(req.headers.get("authorization") ?? "") }));
        return naoAutorizado();
      }
      const body = await req.json().catch(() => null);
      for (const m of Array.isArray(body) ? body : [body]) {
        console.log(JSON.stringify({ mcp: m?.method, agente: q.agente, versao: m?.params?.protocolVersion ?? req.headers.get("mcp-protocol-version"),
          cliente: m?.params?.clientInfo, capacidades: m?.params?.capabilities ? Object.keys(m.params.capabilities) : undefined,
          ferramenta: m?.params?.name, accept: req.headers.get("accept") }));
      }
      if (body === null) return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } }, 400);
      if (Array.isArray(body)) {
        const out = (await Promise.all(body.map((m) => mcp(q, m)))).filter(Boolean);
        return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
      }
      const out = await mcp(q, body) as any;
      if (!out) return new Response(null, { status: 202, headers: CORS });
      const codigo = out.error?.code;
      const status = codigo === -32022 ? 400 : codigo === -32601 && versaoModerna(body) ? 404 : 200;
      return json(out, status);
    }

    // ---- API
    if (rota[0] !== "api") return text("Rota não encontrada. / Not found.", 404);
    if (!q) return naoAutorizado();
    const [, rec, salaRef, acao] = rota;

    if (rec === "instrucoes") {
      const chave = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      return text(await instrucoes(q, chave));
    }
    if (rec === "eu") return json({ pessoa: q.pessoa, agente: q.agente });
    if (rec === "arquivo") {
      const r = await lerArquivo(q, url.searchParams.get("caminho") ?? "");
      const img = r.find((c) => c.type === "image") as { data: string; mimeType: string } | undefined;
      if (img) return new Response(Uint8Array.from(atob(img.data), (c) => c.charCodeAt(0)), { headers: { ...CORS, "Content-Type": img.mimeType } });
      return text(r.map((c) => (c.type === "text" ? c.text : "")).join("\n"));
    }
    if (rec === "salas" && !salaRef) return json(await salasDe(q));
    if (rec === "tarefas" && salaRef && acao === "concluir" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      const t = await concluirTarefa(q, Number(salaRef), String(b.resultado ?? ""));
      return json({ id: t.id, estado: "feita" });
    }
    if (rec === "salas" && salaRef) {
      const s = await acharSala(q, decodeURIComponent(salaRef));
      if (acao === "memoria" && req.method === "POST") {
        const b = await req.json().catch(() => ({}));
        return text(await atualizarMemoria(q, s, b));
      }
      if (acao === "mensagens" && req.method === "GET") {
        const ms = await ler(s.id, Number(url.searchParams.get("depois")) || 0, Number(url.searchParams.get("limite")) || 50);
        return url.searchParams.get("formato") === "json" ? json(ms) : text(`${await cabecalho(s, q)}\n\n${formatar(ms, q)}`);
      }
      if (acao === "mensagens" && req.method === "POST") {
        const b = await req.json().catch(() => ({}));
        const proposta = !!b.proposta || b.contexto !== undefined;
        const m = await enviar(q, s.id, { texto: b.texto, proposta, responde_a: b.responde_a,
          novo_contexto: b.contexto === undefined ? undefined : String(b.contexto),
          aprovadores: proposta && b.contexto === undefined ? await acharAprovadores(q, s.id, b.aprovadores) : undefined });
        return json({ id: m.id, responde_a: m.responde_a }, 201);
      }
      if (acao === "arquivos" && req.method === "POST") {
        const b = await req.json().catch(() => ({}));
        const anexo = await subirTexto(q, s.id, String(b.nome ?? ""), String(b.conteudo ?? ""), b.base64);
        const m = await enviar(q, s.id, { texto: String(b.texto ?? ""), responde_a: b.responde_a, anexos: [anexo] });
        return json({ id: m.id, arquivo: anexo.path }, 201);
      }
      if (acao === "painel") return text(await painel(q, s));
      if (acao === "tarefas") return text(listaTarefas(await tarefas(s.id), q, 20) || tr(q, "Nenhuma tarefa ainda.", "No tasks yet."));
      if (acao === "decisoes") return text(registro(await propostas(s.id, 100), q) || tr(q, "Nenhuma proposta ainda.", "No proposals yet."));
      if (acao === "esperar") {
        const r = await esperar(q, s.id, Number(url.searchParams.get("depois")) || 0, Number(url.searchParams.get("segundos")) || 50);
        return text(`ultimo=${r.ultimo}\n${r.novas.length ? formatar(r.novas, q) : ""}`);
      }
    }
    return text(tr(q ?? undefined, "Rota não encontrada.", "Not found."), 404);
  } catch (e) {
    const st = e instanceof Falha ? e.status : 400;
    return json({ erro: (e as Error).message }, st);
  }
});

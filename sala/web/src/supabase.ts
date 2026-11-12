import { createClient } from "@supabase/supabase-js";
import { definirIdioma, t, type Idioma } from "./i18n";

// Chave publicável: pode ficar no código. Quem protege os dados são as regras (RLS) do banco.
export const SUPABASE_URL = "https://cokzyrdmtnbsnnboxggp.supabase.co";
const SUPABASE_KEY = "sb_publishable_sh1kE5Waqn8IhwcOpy64Ew_553Fafdm";

export const MCP_URL = `${SUPABASE_URL}/functions/v1/mcp`;

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export type Perfil = { id: string; nome: string; avatar: string | null; avisos?: "tudo" | "mencoes" | "nada"; idioma?: Idioma | null; guia_visto?: string | null; guia_sala_visto?: string | null };
export type Sala = {
  id: string; nome: string; convite: string | null; convite_leitura: string | null; contexto: string; papel: "dono" | "membro" | "leitor";
  nao_lidas: number; pendentes: number; lido_ate: number; minhas_tarefas: number; ultima_id: number | null; ultima_texto: string | null;
  ultima_agente: string | null; ultima_nome: string | null; ultima_em: string | null; ultima_tipo: Mensagem["tipo"] | null;
  idioma?: "pt" | "en"; // idioma da conversa (a interface segue a pessoa)
};
export type Anexo = { path: string; nome: string; tipo: string; tamanho: number };
export type ItemPlano = { titulo: string; frente?: string; responsavel?: string; responsavel_agente?: string; prazo?: string; tarefa?: number };
// papel e declarado: o agente disse o próprio nome (e o que faz); sem isso, o nome é o do app ("sem nome próprio")
export type Agente = { user_id: string; nome: string; visto_em: string; ouvindo_ate: string | null; desperta?: boolean; papel?: string | null; declarado?: boolean };
export type Membro = { user_id: string; papel: "dono" | "membro" | "leitor"; perfis: Perfil | null };

/** Foto de perfil: só a que veio do login com Google. Outro endereço serviria de pixel de rastreio para a sala inteira. */
export const fotoSegura = (url: string | null | undefined) => {
  try { const u = new URL(url ?? ""); return u.protocol === "https:" && u.hostname.endsWith(".googleusercontent.com") ? u.href : null; } catch { return null; }
};

export const abrirConectar = () => window.dispatchEvent(new Event("sala:conectar"));

/** Tom fixo do agente (1 a 6), tirado do nome: o mesmo agente tem sempre a mesma cor, em qualquer sala. */
export const tomDoAgente = (nome: string) => {
  let h = 5381; // djb2: separa bem os nomes comuns (Claude, Claude Code, ChatGPT, Codex caem em tons diferentes)
  for (const c of nome.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "")) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return `tom-${(h % 6) + 1}`;
};
export type Mensagem = {
  id: number;
  sala_id: string;
  user_id: string;
  agente: string | null;
  texto: string;
  criada_em: string;
  tipo: "mensagem" | "proposta" | "decisao";
  responde_a: number | null;
  estado: "pendente" | "aprovada" | "recusada" | "ajuste" | "substituida" | null;
  substituida_por?: number | null;
  decidida_por: string | null;
  decidida_em: string | null;
  editada_em: string | null;
  apagada: boolean;
  anexos: Anexo[];
  novo_contexto?: string | null; // proposta que troca o contexto da sala
  aprovadores?: string[] | null; // só estas pessoas decidem (todas precisam aprovar)
  plano?: ItemPlano[] | null; // proposta de plano: cada item vira tarefa quando aprovada
  pendente?: boolean; // enviando
  fila?: boolean; // esperando um agente terminar de ler a sala para sair
  falhou?: boolean;
  motivo?: string; // por que não enviou (quando o banco disse)
};

// Presença do agente, em texto (nunca só cor): "ouvindo agora", "visto há 3 h"
export function presenca(a: Agente): { ativo: boolean; texto: string } {
  const agora = Date.now();
  if (a.ouvindo_ate && new Date(a.ouvindo_ate).getTime() > agora) return { ativo: true, texto: t("ouvindo agora", "listening now") };
  if (a.desperta) return { ativo: true, texto: t("responde sozinho", "auto-reply on") };
  const min = Math.round((agora - new Date(a.visto_em).getTime()) / 60000);
  if (min < 5) return { ativo: true, texto: t("ativo agora", "active now") };
  if (min < 60) return { ativo: false, texto: t(`visto há ${min} min`, `seen ${min} min ago`) };
  const h = Math.round(min / 60);
  if (h < 24) return { ativo: false, texto: t(`visto há ${h} h`, `seen ${h} h ago`) };
  const d = Math.round(h / 24);
  return { ativo: false, texto: d === 1 ? t("visto ontem", "seen yesterday") : t(`visto há ${d} dias`, `seen ${d} days ago`) };
}

export async function apagarConta() {
  const { data } = await sb.auth.getSession();
  const r = await fetch(`${MCP_URL}/api/conta`, { method: "DELETE", headers: { Authorization: `Bearer ${data.session?.access_token}` } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro ?? t("Não deu para apagar a conta agora.", "Couldn't delete your account right now."));
  await sb.auth.signOut();
}

export const copiarTexto = async (t: string) => {
  try { await navigator.clipboard.writeText(t); return true; } catch { return false; }
};

export async function entrarComGoogle(volta: string) {
  await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: volta } });
}

export async function entrarComEmail(email: string, volta: string) {
  return sb.auth.signInWithOtp({ email, options: { emailRedirectTo: volta } });
}

/** Troca o idioma neste aparelho e no perfil (avisos, agentes e integrações seguem). */
export async function trocarIdioma(i: Idioma) {
  definirIdioma(i);
  const { data } = await sb.auth.getSession();
  if (data.session) await sb.from("perfis").update({ idioma: i }).eq("id", data.session.user.id);
}

export const ultimaSala = {
  get: () => { try { return localStorage.getItem("sala.ultima"); } catch { return null; } },
  set: (id: string) => { try { localStorage.setItem("sala.ultima", id); } catch { /* sem storage */ } },
};

// ---------------------------------------------------------------- arquivos

export const LIMITE_ARQUIVO = 10 * 1024 * 1024;

// o armazenamento só aceita letras sem acento, números, ponto, hífen e sublinhado na chave; o nome real fica na mensagem
export const chaveDoNome = (nome: string) => {
  const limpo = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/\.{2,}/g, ".").replace(/^[-.]+|-+$/g, "");
  return (limpo || "arquivo").slice(-120);
};

export async function subirArquivo(sala: string, eu: string, f: File): Promise<Anexo> {
  if (f.size > LIMITE_ARQUIVO) throw new Error(t(`${f.name} passa de 10 MB.`, `${f.name} is over 10 MB.`));
  const nome = (f.name || "arquivo").replace(/[\/\\\x00-\x1f]/g, "-").trim().slice(0, 200) || "arquivo";
  const path = `${sala}/${eu}/${crypto.randomUUID()}-${chaveDoNome(nome)}`;
  const { error } = await sb.storage.from("arquivos").upload(path, f, { contentType: f.type || "application/octet-stream" });
  if (error) throw new Error(t(`Não deu para enviar ${nome}: ${error.message}`, `Couldn't upload ${nome}: ${error.message}`));
  return { path, nome, tipo: f.type || "application/octet-stream", tamanho: f.size };
}

// links temporários (valem 1 h), guardados por 45 min para não pedir de novo a cada tela; quem mostra renova antes de vencer
const links = new Map<string, { url: string; ate: number }>();
export async function linksDe(paths: string[], baixar = false): Promise<Record<string, string>> {
  const agora = Date.now();
  const chave = (p: string) => (baixar ? `b:${p}` : p);
  const faltam = paths.filter((p) => !((links.get(chave(p))?.ate ?? 0) > agora));
  if (faltam.length) {
    const { data } = await sb.storage.from("arquivos").createSignedUrls(faltam, 3600, baixar ? { download: true } : undefined);
    data?.forEach((d) => d.path && d.signedUrl && links.set(chave(d.path), { url: d.signedUrl, ate: agora + 45 * 60_000 }));
  }
  return Object.fromEntries(paths.map((p) => [p, links.get(chave(p))?.url ?? ""]));
}

export const tamanhoLegivel = (b: number) =>
  b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${t((b / 1048576).toFixed(1).replace(".", ","), (b / 1048576).toFixed(1))} MB`;

// ---------------------------------------------------------------- tarefas

export type Reacao = { id: number; mensagem_id: number; user_id: string; agente: string | null; emoji: string };
export type Tarefa = {
  id: number; sala_id: string; titulo: string; origem: number | null;
  responsavel: string | null; responsavel_agente: string | null; prazo: string | null;
  estado: "aberta" | "feita" | "cancelada"; resultado: string | null;
  criada_por: string | null; criada_por_agente: string | null; criada_em: string;
  concluida_em: string | null; concluida_por: string | null; concluida_por_agente: string | null;
  frente?: string | null; prazo_previsto?: string | null; plano?: number | null;
};

// Painel da sala: o que o banco calcula (painel_sala), os mesmos números que os agentes leem em ver_painel
export type DadosPainel = {
  agora: string;
  nomes: Record<string, string>;
  totais: { abertas: number; feitas: number; atrasadas: number; sem_responsavel: number };
  frentes: { frente: string; total: number; feitas: number; atrasadas: number; previsto: string | null; projecao: string | null; desvio_dias: number | null }[];
  propostas: { id: number; titulo: string; user_id: string; agente: string | null; criada_em: string; plano: boolean; precisa: number; votos: number; faltam: string[]; exato: boolean }[];
  esperando: { user_id: string; propostas: number }[];
  atrasadas: { id: number; titulo: string; frente: string | null; prazo: string; responsavel: string | null; responsavel_agente: string | null }[];
  ritmo: { semana: string; feitas: number }[];
  tarefas: { id: number; titulo: string; frente: string | null; estado: Tarefa["estado"]; criada_em: string; prazo: string | null; prazo_previsto: string | null; concluida_em: string | null }[];
};
export type ItemFila = { sala_id: string; sala: string; tipo: "proposta" | "tarefa"; ref: number; titulo: string; desde: string; prazo: string | null };

export const atrasada = (t: Tarefa) => t.estado === "aberta" && !!t.prazo && new Date(t.prazo).getTime() < Date.now();

// ---------------------------------------------------------------- pedir ao meu agente

/** Abre o Claude ou o ChatGPT com o pedido escrito; nos outros, o texto vai para a área de transferência. */
const abrirCom = (agente: string, texto: string) => {
  const a = agente.toLowerCase();
  return a === "claude" ? `https://claude.ai/new?q=${encodeURIComponent(texto)}`
    : a === "chatgpt" ? `https://chatgpt.com/?q=${encodeURIComponent(texto)}`
    : null;
};

// Nome de sala, título de tarefa e nome de autor são escritos por outras pessoas e agentes. No pedido eles entram
// como rótulo curto, numa linha, sem aspas: não dá para fechar a citação e emendar uma instrução no prompt da pessoa.
const rotulo = (s: string, n = 80) => s.replace(/[\u0000-\u001f\u007f"“”«»`]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

/** "Pedir ao meu agente" a partir de uma tarefa: ele lê a sala, faz e conclui com o resultado. */
export function pedidoTarefa(agente: string, salaNome: string, tarefaDada: { id: number; titulo: string }) {
  const sala = rotulo(salaNome), tarefa = { id: tarefaDada.id, titulo: rotulo(tarefaDada.titulo, 120) };
  const texto = t(
    `Leia a sala "${sala}" no The Sala e faça a tarefa "${tarefa.titulo}" (tarefa ${tarefa.id}). ` +
    `Use ler_mensagens e ver_tarefas para entender o contexto. Quando terminar, use concluir_tarefa com o resultado (e o arquivo, se houver). Se precisar de uma decisão, use fazer_proposta.`,
    `Read the room "${sala}" on The Sala and do the task "${tarefa.titulo}" (task ${tarefa.id}). ` +
    `Use ler_mensagens and ver_tarefas to get the context. When you're done, use concluir_tarefa with the result (and the file, if any). If you need a decision, use fazer_proposta.`);
  return { texto, url: abrirCom(agente, texto) };
}

// Claude e ChatGPT abrem com o pedido já escrito; nos outros, o pedido vai para a área de transferência.
export function pedidoPara(agente: string, salaNome: string, m: { id: number }, autorNome: string) {
  const sala = rotulo(salaNome), autor = rotulo(autorNome, 60);
  const texto = t(
    `Leia a sala "${sala}" no The Sala e responda à mensagem #${m.id} de ${autor}. ` +
    `Use ler_mensagens para ver a conversa e enviar_mensagem com responde_a=${m.id} para responder. Se precisar de uma decisão, use fazer_proposta.`,
    `Read the room "${sala}" on The Sala and reply to message #${m.id} from ${autor}. ` +
    `Use ler_mensagens to see the conversation and enviar_mensagem with responde_a=${m.id} to reply. If you need a decision, use fazer_proposta.`);
  return { texto, url: abrirCom(agente, texto) };
}

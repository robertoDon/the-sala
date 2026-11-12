import { useSyncExternalStore } from "react";

// Idioma: português para quem usa o navegador em português, inglês para o resto.
// A pessoa troca quando quiser (fica no aparelho e no perfil, para avisos e agentes seguirem).
export type Idioma = "pt" | "en";

const CHAVE = "sala.idioma";
const ouvintes = new Set<() => void>();

function guardado(): Idioma | null {
  try {
    const v = localStorage.getItem(CHAVE);
    return v === "pt" || v === "en" ? v : null;
  } catch { return null; }
}

export function doNavegador(): Idioma {
  const ls = typeof navigator === "undefined" ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language]);
  return ls.some((l) => /^pt\b/i.test(l ?? "")) ? "pt" : "en";
}

let atual: Idioma = guardado() ?? doNavegador();
if (typeof document !== "undefined") document.documentElement.lang = atual === "en" ? "en" : "pt-BR";

export const idioma = () => atual;
export const escolhido = () => guardado() !== null;

/** t("Entrar", "Sign in"): o texto em português e em inglês, lado a lado no código. */
export const t = (pt: string, en: string) => (atual === "en" ? en : pt);

/** Locale para datas e números. */
export const locale = () => (atual === "en" ? "en-US" : "pt-BR");

export function definirIdioma(i: Idioma, lembrar = true) {
  if (lembrar) { try { localStorage.setItem(CHAVE, i); } catch { /* sem storage */ } }
  if (i === atual) return;
  atual = i;
  if (typeof document !== "undefined") document.documentElement.lang = i === "en" ? "en" : "pt-BR";
  ouvintes.forEach((f) => f());
}

export function useIdioma(): Idioma {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => atual, () => atual);
}

// ---------------------------------------------------------------- mensagens do servidor

// O banco responde em português; para quem usa em inglês, traduzimos as mensagens conhecidas.
const ERROS: [RegExp, string][] = [
  [/^Arquivo de outra sala ou de outra pessoa\./, "That file belongs to another room or person."],
  [/^Arquivo inválido\./, "Invalid file."],
  [/^Arquivo não encontrado\. Envie de novo\./, "File not found. Upload it again."],
  [/^Convite inválido ou trocado\./, "This invite is invalid or was replaced."],
  [/^Entre para aceitar o convite\./, "Sign in to accept the invite."],
  [/^Entre para criar uma chave\./, "Sign in to create a key."],
  [/^Entre para criar uma sala\./, "Sign in to create a room."],
  [/^Entre para receber avisos\./, "Sign in to get notifications."],
  [/^Esta mensagem não pode mais ser editada\./, "This message can no longer be edited."],
  [/^Esta proposta foi apagada\./, "This proposal was deleted."],
  [/^Esta proposta já foi decidida\./, "This proposal has already been decided."],
  [/^Esta tarefa acabou de ser concluída\./, "This task was just completed. Check the updated list."],
  [/^Esta tarefa acabou de ser cancelada\./, "This task was just canceled. Check the updated list."],
  [/^Esta tarefa já foi fechada\./, "This task is already closed."],
  [/^Integração não encontrada\./, "Integration not found."],
  [/^Já são \d+ mensagens seguidas de agentes/, "Agents have sent several messages in a row in this room. Wait for a person to write before continuing."],
  [/^Mensagem não encontrada\./, "Message not found."],
  [/^Nesta sala você está como convidado para acompanhar\. Peça a quem cuida da sala para poder escrever\./, "You're a viewer in this room. Ask the room owner to let you write."],
  [/^Nesta sala você está como convidado para acompanhar\. Peça a quem cuida da sala para poder mexer nas tarefas\./, "You're a viewer in this room. Ask the room owner to let you change tasks."],
  [/^No máximo 10 arquivos por mensagem\./, "You can attach up to 10 files per message."],
  [/^No máximo 5 integrações por sala\./, "A room can have up to 5 integrations."],
  [/^O responsável precisa estar na sala\./, "The task owner must be in the room."],
  [/^O texto precisa ter entre 1 e 20\.000 caracteres\./, "Text must be between 1 and 20,000 characters."],
  [/^Papel inválido\./, "Invalid role."],
  [/^Para concluir, use Concluir\./, "To complete it, use Complete."],
  [/^Proposta não encontrada\./, "Proposal not found."],
  [/^Propostas e decisões não mudam depois de enviadas/, "Proposals and decisions can't be edited once sent. Delete it and make a new proposal."],
  [/^Só pessoas apagam mensagens\./, "Only people can delete messages."],
  [/^Só pessoas decidem propostas\./, "Only people can decide on proposals."],
  [/^Só pessoas editam mensagens\./, "Only people can edit messages."],
  [/^Só quem (criou|cuida d)a sala troca o convite\./, "Only the room owner can replace the invite."],
  [/^Só quem cuida da sala faz isso\./, "Only the room owner can do that."],
  [/^Só quem cuida da sala liga integrações\./, "Only the room owner can add integrations."],
  [/^Só quem é dono da sala faz isso\./, "Only the room owner can do that."],
  [/^Tarefa não encontrada\./, "Task not found."],
  [/^Use um endereço https público/, "Use a public https address (Slack, Teams, Discord, Google Chat or your own system)."],
  [/^Você apaga as suas mensagens e as dos seus agentes\./, "You can only delete your own messages and your agents' messages."],
  [/^Você não está nesta sala\./, "You're not in this room."],
  [/^Você só edita as suas mensagens\./, "You can only edit your own messages."],
  [/^Entre de novo para apagar a conta\./, "Sign in again to delete your account."],
  [/^Agentes não apagam contas\./, "Agents can't delete accounts."],
  [/^Nesta sala você só acompanha\. Peça a quem cuida da sala para poder escrever\./, "You're a viewer in this room. Ask the room owner to let you write."],
  [/^Nesta sala você só acompanha\. Peça a quem cuida da sala para poder mexer nas tarefas\./, "You're a viewer in this room. Ask the room owner to let you change tasks."],
  [/^Nesta sala você só acompanha\./, "You're a viewer in this room."],
  [/^Esta sala pede (\d+) aprovações/, "This room needs more approvals than the people you picked. Pick at least that many people to decide, or none."],
  [/^Só quem decide esta proposta pede ajuste\./, "Only the people deciding this proposal can ask for changes."],
  [/^Decisões e propostas já decididas ficam no registro da sala\./, "Decisions and decided proposals stay in the room's record."],
  [/^Esta proposta precisa do sim de /, "This proposal needs approval from the people it names."],
  [/^Você já aprovou esta proposta\./, "You've already approved this proposal. It still needs someone else's approval."],
  [/^Quem aprova precisa ser uma pessoa da sala/, "Approvers must be people in the room who can write."],
  [/^Quem aprova e o plano não mudam/, "Approvers and the plan can't change after proposing. Make a new proposal."],
  [/^Só pessoas pedem ajuste\./, "Only people can ask for changes."],
  [/^Diga o que precisa mudar/, "Say what needs to change: the proposer will read it."],
  [/^Reaja com um emoji\./, "React with an emoji."],
  [/^São muitas reações na mesma mensagem\./, "That's too many reactions on one message."],
  [/^Entre para (reagir|desligar|ligar|editar|tirar itens)\./, "Sign in to do that."],
  [/^Este navegador não entrega avisos do The Sala\./, "This browser can't deliver The Sala notifications."],
  [/^Muitos aparelhos com aviso ligado\./, "Too many devices with notifications on. Turn them off on one first."],
  [/^Escolha outro nome para o agente\./, "Pick another name for the agent."],
  [/^Muitas chaves\./, "Too many keys. Delete the ones you no longer use."],
  [/^Muitas mensagens em pouco tempo\./, "Too many messages in a short time. Wait a minute."],
  [/^Endereço inválido\. Copie a URL do gatilho/, "Invalid address. Copy the API trigger URL (it ends in /fire)."],
  [/^Chave inválida\. Copie o token/, "Invalid key. Copy the API trigger token (it starts with sk-ant-oat01-)."],
  [/^A memória passa de /, "The memory is too long."],
  [/^Só pessoas editam a memória por aqui\./, "Only people can edit the memory here."],
  [/^Dê um título\./, "Add a title."],
  [/^Item não encontrado\./, "Item not found."],
  [/^Sala não encontrada\./, "Room not found."],
  [/^Toda tarefa do plano precisa de título\./, "Every task in the plan needs a title."],
  [/^O plano precisa ser uma lista de tarefas\./, "The plan must be a list of tasks."],
  [/^O responsável de /, "A task owner in the plan must be in the room."],
  [/^Prazo inválido no plano/, "The plan has an invalid due date."],
  [/^A tarefa \d+ não está nesta sala\./, "A task in the plan isn't in this room."],
  [/check constraint/i, "Check the address: it must start with https://"],
  [/Failed to fetch|NetworkError|Load failed/i, "No connection. Check your internet and try again."],
];

// Em português: o que vem em inglês do login e do armazenamento, e frases antigas do banco que falavam com gênero.
const ERROS_PT: [RegExp, string][] = [
  [/Failed to fetch|NetworkError|Load failed/i, "Sem conexão. Confira a internet e tente de novo."],
  [/^Nesta sala você está como convidado para acompanhar\. Peça a quem cuida da sala para poder mexer nas tarefas\./, "Nesta sala você só acompanha. Peça a quem cuida da sala para poder mexer nas tarefas."],
  [/^Nesta sala você está como convidado para acompanhar\./, "Nesta sala você só acompanha. Peça a quem cuida da sala para poder escrever."],
  [/^Só quem é dono da sala faz isso\./, "Só quem cuida da sala faz isso."],
  [/rate limit|security purposes|too many requests/i, "Muitas tentativas agora. Espere um pouco e tente de novo."],
  [/invalid.*email|email.*invalid|unable to validate email/i, "Confira o email: não parece um endereço válido."],
  [/signups? not allowed|signup is disabled/i, "Não dá para criar conta por este caminho. Entre com o Google."],
  [/jwt expired|session.*(expired|not found)|refresh token/i, "A sua sessão venceu. Entre de novo."],
  [/authorization.*(not found|expired)|invalid authorization/i, "Pedido de conexão inválido ou expirado."],
  [/exceeded the maximum allowed size|payload too large/i, "O arquivo passa do tamanho permitido (10 MB)."],
  [/row-level security|not authorized|permission denied/i, "Você não tem permissão para fazer isso nesta sala."],
  [/duplicate|already exists/i, "Isso já existe."],
];

/** Mensagem de erro do servidor no idioma da pessoa. */
export function erro(e: unknown): string {
  const msg = typeof e === "string" ? e : (e as { message?: string } | null)?.message ?? String(e);
  if (atual !== "en") {
    for (const [re, pt] of ERROS_PT) if (re.test(msg)) return pt;
    return msg;
  }
  for (const [re, en] of ERROS) if (re.test(msg)) return en;
  return msg;
}

// Textos que o sistema grava na conversa e no histórico (ficam em português no banco).
const GRAVADOS: Record<string, string> = {
  "adicionou à biblioteca": "added to the library:",
  "editou na biblioteca": "edited in the library:",
  "tirou da biblioteca": "removed from the library:",
  "atualizou a memória": "updated the room memory:",
  "editou a memória": "edited the room memory:",
  "Aprovada.": "Approved.",
  "Aprovada. O contexto da sala foi trocado pelo texto da proposta.": "Approved. The room instructions were replaced with the proposal's text.",
  "Aprovada. O plano virou tarefas, com o prazo previsto de cada uma.": "Approved. The plan became tasks, each with its planned due date.",
  "Recusada.": "Declined.",
  "Mensagem apagada.": "Message deleted.",
  "entrou": "joined",
  "entrou como convidado (só lê)": "joined as a viewer",
  "passou a sala para": "made room owner:",
  "deixou só lendo": "made viewer:",
  "liberou para escrever": "allowed to write:",
  "saiu": "left",
  "tirou da sala": "removed from the room",
  "apagou uma mensagem": "deleted a message",
  "retirou a proposta": "withdrew the proposal",
  "aprovou a proposta": "approved the proposal",
  "recusou a proposta": "declined the proposal",
  "fez uma proposta": "made a proposal",
  "criou a tarefa": "created the task",
  "concluiu a tarefa": "completed the task",
  "cancelou a tarefa": "canceled the task",
  "editou a tarefa": "edited the task",
  "reabriu a tarefa": "reopened the task",
  "renomeou a sala": "renamed the room",
  "mudou o contexto para os agentes": "changed the room instructions",
  "trocou os links de convite": "replaced the invite links",
  "ligou uma integração": "added an integration",
  "desligou uma integração": "removed an integration",
  "criou a sala": "created the room",
};

// o que o banco gravou com gênero aparece sem ele
const NEUTRO: Record<string, string> = { "entrou como convidado (só lê)": "entrou só para acompanhar" };
const DE_VOLTA: Record<string, string> = Object.fromEntries(Object.entries(GRAVADOS).map(([pt, en]) => [en, pt]));

/** Texto fixo gravado pelo sistema (decisão sem comentário, ação do histórico), no idioma pedido (por padrão, o da pessoa). */
export function gravado(texto: string, lingua: Idioma = atual): string {
  if (lingua === "en") {
    if (GRAVADOS[texto]) return GRAVADOS[texto];
    const m = texto.match(/^✓ Concluí a tarefa: (.*)$/s);
    return m ? `✓ Completed the task: ${m[1]}` : texto;
  }
  if (DE_VOLTA[texto]) return NEUTRO[DE_VOLTA[texto]] ?? DE_VOLTA[texto];
  if (NEUTRO[texto]) return NEUTRO[texto];
  const m = texto.match(/^✓ Completed the task: (.*)$/s);
  return m ? `✓ Concluí a tarefa: ${m[1]}` : texto;
}

// Idioma da conversa aberta: o que está gravado nela aparece no idioma da sala, para todo mundo.
let conversa: Idioma | null = null;
export const definirIdiomaConversa = (i: Idioma | null) => { conversa = i; };
export const idiomaConversa = (): Idioma => conversa ?? atual;
/** Texto gravado na conversa, no idioma da sala. */
export const naConversa = (texto: string) => gravado(texto, idiomaConversa());
/** Texto que vai para dentro da conversa (ex.: @agentes/@agents), no idioma da sala. */
export const tc = (pt: string, en: string) => (idiomaConversa() === "en" ? en : pt);

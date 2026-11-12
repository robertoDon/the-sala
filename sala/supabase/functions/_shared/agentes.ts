// Quem é cada agente, quem uma mensagem chama e o "Quem é quem" da sala.
// Código puro (sem Deno, sem banco): usado pelo servidor dos agentes (mcp), pelos avisos (avisar) e pelo app web,
// para que os três entendam um @ do mesmo jeito. Os testes ficam em web/src/testes.

/** "José Código" → "josecodigo": compara nomes sem acento, espaço nem símbolo ("Claude Code" = "ClaudeCode"). */
export const handle = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();

// @agents/@everyone/@all (inglês) valem o mesmo que @agentes/@todos
const ALIAS: Record<string, string> = { agents: "agentes", everyone: "todos", all: "todos" };
export const apelido = (h: string) => ALIAS[h] ?? h;
const COLETIVAS = new Set(["agentes", "todos"]);
const RESERVADOS = new Set(["agentes", "agents", "todos", "everyone", "all", "eu", "me", "voce", "you", "pessoa", "person"]);

/** "@Codex", "@ClaudeCode", "@Claude-Roberto" (agente-pessoa), "@agentes". O nome pode ter "·" ou "." no meio. */
export const MENCAO = /@([\p{L}\p{N}_]+(?:[·.][\p{L}\p{N}_]+)*)(?:-([\p{L}\p{N}_]+))?/gu;

// handles; pessoa = "" quando não veio "-Pessoa"; seguinte = a palavra logo depois ("@Claude Code" → "code"),
// para reconhecer nome de agente com espaço escrito à mão
export type Mencao = { alvo: string; pessoa: string; seguinte: string };
export const mencoes = (texto: string): Mencao[] =>
  [...texto.matchAll(MENCAO)].map((m) => {
    const depois = m[2] ? null : texto.slice((m.index ?? 0) + m[0].length).match(/^ ([\p{L}\p{N}_]+)/u);
    return { alvo: apelido(handle(m[1])), pessoa: m[2] ? handle(m[2]) : "", seguinte: depois ? handle(depois[1]) : "" };
  });

export const primeiroNome = (nome: string) => (nome ?? "").trim().split(/\s+/)[0] ?? "";

/**
 * Como a mensagem chama este agente (de `dono`):
 * - "nome": pelo nome dele (@Codex, @Codex-Cathleen);
 * - "pessoa": pela pessoa dona (@Cathleen chama a pessoa e todos os agentes dela);
 * - "coletivo": @agentes ou @todos;
 * - null: não chama.
 * Quem chama decide o que cada forma vale (agente escrevendo @agentes não acorda ninguém, por exemplo).
 * `outros`: nomes dos agentes da sala. Com eles, "@Claude Code" (com espaço) chama o Claude Code e não o Claude.
 */
export function comoChama(texto: string, agente: string, dono: string, outros: string[] = []): "nome" | "pessoa" | "coletivo" | null {
  const a = handle(agente), p = handle(primeiroNome(dono));
  let melhor: "nome" | "pessoa" | "coletivo" | null = null;
  for (const m of mencoes(texto)) {
    const longo = m.seguinte ? m.alvo + m.seguinte : "";
    if (longo && longo === a) return "nome"; // "@Claude Code" para o agente "Claude Code"
    if (m.alvo === a && (!m.pessoa || m.pessoa === p)) {
      if (longo && outros.some((o) => handle(o) === longo)) continue; // era o "Claude Code", não o "Claude"
      return "nome";
    }
    if (p && m.alvo === p && !m.pessoa) melhor = "pessoa";
    else if (COLETIVAS.has(m.alvo) && !melhor) melhor = "coletivo";
  }
  return melhor;
}

/** A mensagem chama este agente? Pessoa chamando: nome, pessoa ou coletivo. Agente chamando: o nome, ou @agentes/@todos
 * (ele lê, mas o despertar decide à parte), nunca só por citar a pessoa dona (pergunta para a pessoa não é para o agente). */
export function chama(texto: string, agente: string, dono: string, autorEhAgente: boolean, outros: string[] = []) {
  const c = comoChama(texto, agente, dono, outros);
  return c === "nome" || c === "coletivo" || (c === "pessoa" && !autorEhAgente);
}

// ---------------------------------------------------------------- nome do agente

export const NOME_MAX = 24;
export const PAPEL_MAX = 120;

/** Nome curto que a conexão declara ("Codex", "Claude Code"). Devolve o nome limpo ou um erro em pt/en. */
export function nomeDeAgente(v: unknown): { nome: string } | { erro: [string, string] } {
  const nome = String(v ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!nome) return { erro: ["Falta o nome do agente.", "Missing the agent name."] };
  if (nome.length > NOME_MAX) return { erro: [`Nome do agente com até ${NOME_MAX} caracteres.`, `Agent name up to ${NOME_MAX} characters.`] };
  if (!/^\p{L}[\p{L}\p{N} _·.]*$/u.test(nome))
    return { erro: [`"${nome}": use letras, números, espaço, "·" ou "." (começando por letra; sem "-", que separa agente e pessoa no @).`,
      `"${nome}": use letters, digits, spaces, "·" or "." (starting with a letter; no "-", which separates agent and person in an @).`] };
  if (RESERVADOS.has(handle(nome))) return { erro: [`"${nome}" é reservado na Sala.`, `"${nome}" is reserved in the Sala.`] };
  return { nome };
}

export const papelDeAgente = (v: unknown) => {
  const p = String(v ?? "").replace(/\s+/g, " ").trim();
  return p ? p.slice(0, PAPEL_MAX) : null;
};

/** "Claude", "ChatGPT", "Claude Code"... a partir do nome que o app deu ao se registrar (OAuth). */
export function nomeDoApp(cliente: string | null): string {
  const c = (cliente ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim(); // o app escolhe o próprio nome: uma linha só
  const l = c.toLowerCase();
  if (l.includes("claude code")) return "Claude Code";
  if (l.includes("claude")) return "Claude";
  if (l.includes("codex")) return "Codex"; // antes de "openai": o Codex se registra como "OpenAI Codex"
  if (l.includes("chatgpt") || l.includes("openai")) return "ChatGPT";
  if (l.includes("gemini")) return "Gemini";
  if (l.includes("cursor")) return "Cursor";
  return c.slice(0, 40) || "Agente";
}

export type Identidade = { agente: string; papel: string | null; declarado: boolean; origem: "app" | "conexao" | "chamada" };

/**
 * Quem está falando, nesta ordem:
 * 1. o que a conexão declarou (parâmetro ?agente= no endereço, cabeçalho X-Sala-Agente, nome da chave, ou registrar_agente nesta sessão);
 * 2. o `agente` passado na própria chamada, quando a conexão não declarou nenhum;
 * 3. o nome do app (como sempre foi): funciona, mas aparece como "sem nome próprio" no Quem é quem.
 * Conexão declarada e chamada com outro nome: erro (duas identidades na mesma conexão confundem a sala).
 */
export function resolverAgente(app: string, conexao: { agente?: string | null; papel?: string | null } | null, porChamada?: unknown):
  Identidade | { erro: [string, string] } {
  if (conexao?.agente) {
    if (porChamada !== undefined && porChamada !== null && String(porChamada).trim() && handle(String(porChamada)) !== handle(conexao.agente))
      return { erro: [`Esta conexão já é "${conexao.agente}". Tire o agente da chamada ou use outra conexão.`, `This connection is already "${conexao.agente}". Drop the agent from the call or use another connection.`] };
    return { agente: conexao.agente, papel: conexao.papel ?? null, declarado: true, origem: "conexao" };
  }
  if (porChamada !== undefined && porChamada !== null && String(porChamada).trim()) {
    const n = nomeDeAgente(porChamada);
    if ("erro" in n) return n;
    return { agente: n.nome, papel: null, declarado: true, origem: "chamada" };
  }
  return { agente: app, papel: null, declarado: false, origem: "app" };
}

// ---------------------------------------------------------------- Quem é quem

export type PessoaRoster = { user_id: string; nome: string; papel_sala?: "dono" | "membro" | "leitor" };
export type AgenteRoster = { user_id: string; nome: string; papel?: string | null; declarado?: boolean; ultima?: string | null };
export type GrupoRoster = { pessoa: PessoaRoster; ultima: string | null; agentes: (AgenteRoster & { chamar: string })[] };

/**
 * Agrupa por pessoa, com o @ certo de cada agente: "@Codex" quando o nome é único na sala, "@Codex-Cathleen" quando
 * duas pessoas têm agentes com o mesmo nome. Só nomes, papéis e horários: nada de email, chave ou id de conexão.
 */
export function montarRoster(pessoas: PessoaRoster[], agentes: AgenteRoster[], ultimaPessoa: Record<string, string | null> = {}): GrupoRoster[] {
  const donos = new Set(pessoas.map((p) => p.user_id));
  const visto = new Set<string>();
  const ags = agentes.filter((a) => donos.has(a.user_id) && !visto.has(`${a.user_id}|${a.nome}`) && visto.add(`${a.user_id}|${a.nome}`));
  const repetidos = new Set<string>();
  const vistosH = new Map<string, string>();
  for (const a of ags) {
    const h = handle(a.nome);
    if (vistosH.has(h) && vistosH.get(h) !== a.user_id) repetidos.add(h);
    vistosH.set(h, a.user_id);
  }
  const arroba = (a: AgenteRoster, dono: string) =>
    `@${a.nome.replace(/\s/g, "")}${repetidos.has(handle(a.nome)) ? `-${primeiroNome(dono)}` : ""}`;
  const recente = (x?: string | null, y?: string | null) => ((x ?? "") > (y ?? "") ? x ?? null : y ?? null);
  return pessoas.map((p) => ({
    pessoa: p,
    ultima: ultimaPessoa[p.user_id] ?? null,
    agentes: ags.filter((a) => a.user_id === p.user_id)
      .sort((a, b) => (recente(b.ultima, null) ?? "").localeCompare(recente(a.ultima, null) ?? "") || a.nome.localeCompare(b.nome))
      .map((a) => ({ ...a, chamar: arroba(a, p.nome) })),
  }));
}

const quando = (iso?: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") + " UTC" : "");

/** O Quem é quem em texto, para o começo do ler_mensagens. */
export function rosterTexto(grupos: GrupoRoster[], lingua: "pt" | "en" = "pt") {
  const en = lingua === "en";
  if (!grupos.length) return "";
  const linhas = [en ? "Who's who (generated by the room; call with the @ shown):" : "Quem é quem (gerado pela sala; chame pelo @ indicado):"];
  for (const g of grupos) {
    const leitor = g.pessoa.papel_sala === "leitor" ? (en ? ", view only" : ", só lê") : "";
    const ult = g.ultima ? ` · ${en ? "last active" : "última atividade"} ${quando(g.ultima)}` : "";
    linhas.push(`- ${g.pessoa.nome} (${en ? "person" : "pessoa"}${leitor}, @${primeiroNome(g.pessoa.nome)}${en ? " also calls their agents" : " chama também os agentes"})${ult}`);
    for (const a of g.agentes) {
      const papel = a.papel ? ` · ${a.papel}` : "";
      const sem = a.declarado ? "" : en ? " · no name of its own (app name)" : " · sem nome próprio (nome do app)";
      const au = a.ultima ? ` · ${en ? "last active here" : "última atividade aqui"} ${quando(a.ultima)}` : en ? " · not active here yet" : " · ainda sem atividade aqui";
      linhas.push(`  - ${en ? "agent" : "agente"} ${a.nome} (${a.chamar})${papel}${sem}${au}`);
    }
  }
  return linhas.join("\n");
}
